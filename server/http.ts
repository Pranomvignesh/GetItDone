/** Largest request body the API accepts (a few thousand items at most). */
export const MAX_BODY_BYTES = 1_000_000

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })
}

export async function readText(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large')
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large')
  return text
}

export async function readJson<T>(request: Request): Promise<T> {
  const text = await readText(request)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

/** Wraps a handler so thrown HttpErrors become JSON responses and other errors a logged 500. */
export function handle(fn: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await fn(request)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      console.error('API error', e)
      return json({ error: 'Internal error' }, 500)
    }
  }
}

/** The caller's IP as Vercel reports it, for rate limiting. */
export function clientId(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Origins allowed to call the API from another site: only the Übersicht Mac
 * widget (FR8) by default. Requests still need the vault token.
 */
function allowedOrigins(): string[] {
  return (process.env.WIDGET_ORIGINS ?? 'http://127.0.0.1:41416').split(',').map((s) => s.trim())
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!origin || !allowedOrigins().includes(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

/** Adds CORS headers for allowed origins to a handler's responses. */
export function withCors(fn: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const res = await fn(request)
    for (const [k, v] of Object.entries(corsHeaders(request))) res.headers.set(k, v)
    return res
  }
}

/** Answers a CORS preflight. */
export async function preflight(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

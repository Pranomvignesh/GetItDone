import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'

/**
 * Serves the Vercel functions in /api from the Vite dev server, so the full
 * app (sync, push, reminders) runs locally with `npm run dev`. Each file
 * exports Web-standard handlers named after HTTP methods, exactly as on Vercel.
 */
export function devApi(): Plugin {
  return {
    name: 'get-it-done-dev-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        route(server, req, res).catch((e) => {
          console.error('Dev API error', e)
          if (!res.headersSent) res.statusCode = 500
          res.end()
        })
      })
    },
  }
}

async function route(server: ViteDevServer, req: IncomingMessage, res: ServerResponse) {
  // Connect strips the /api mount prefix from req.url; originalUrl keeps it.
  const original = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/'
  const url = new URL(original, `http://${req.headers.host ?? 'localhost'}`)
  const file = path.join(server.config.root, `${url.pathname}.ts`)
  if (!url.pathname.startsWith('/api/') || !existsSync(file)) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  const mod = (await server.ssrLoadModule(file)) as Record<string, ((r: Request) => Promise<Response>) | undefined>
  const handler = mod[req.method ?? 'GET']
  if (!handler) {
    res.statusCode = 405
    res.end('Method not allowed')
    return
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  headers.set('x-forwarded-for', req.socket.remoteAddress ?? 'local')

  const response = await handler(
    new Request(url, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    }),
  )
  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  const body = Buffer.from(await response.arrayBuffer())
  // Scheduled jobs run in the background; log them so they're visible while developing.
  if (url.pathname.startsWith('/api/jobs/') || url.pathname.startsWith('/api/cron/')) {
    console.info(`[api] ${req.method} ${url.pathname} → ${response.status} ${body.toString().slice(0, 120)}`)
  }
  res.end(body)
}

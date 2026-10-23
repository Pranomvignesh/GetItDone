import { KeyRound, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { VaultStatus } from '../sync/protocol'
import { deriveKeys, generateVaultKey, pairingLink, parsePairing, tokenHash } from '../sync/vault'
import { NO_AUTOFILL } from '../noAutofill'
import { AppName } from './AppName'
import { CopyButton } from './CopyButton'

interface Props {
  onUnlock: (vaultKey: string, options?: { newVault?: boolean }) => void
}

type Step = { kind: 'choose' } | { kind: 'paste' } | { kind: 'created'; vaultKey: string; hash: string }

/** FR6: shown when this device has no vault key. No accounts, no passwords. */
export function LockScreen({ onUnlock }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [serverHasVault, setServerHasVault] = useState<boolean | null>(null)
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/vault/status')
      .then((r) => (r.ok ? (r.json() as Promise<VaultStatus>) : null))
      .then((s) => setServerHasVault(s?.configured ?? null))
      .catch(() => setServerHasVault(null))
  }, [])

  async function create() {
    const vaultKey = generateVaultKey()
    setStep({ kind: 'created', vaultKey, hash: await tokenHash((await deriveKeys(vaultKey)).token) })
  }

  function pair() {
    const key = parsePairing(pasted)
    if (!key) return setError('That isn’t a pairing link or vault key. Copy it again from a paired device’s settings.')
    onUnlock(key)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-safe py-10 pt-safe">
      <AppName className="text-3xl" />

      {step.kind === 'choose' && (
        <>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Set up this device</h2>
            <p className="text-muted-foreground">
              Your list is private: only devices with your vault key can read it. Pair with a device you’ve already set up, or create a
              new vault if this is your first one.
            </p>
          </div>
          <div className="grid gap-3">
            <Button className="h-12 justify-start gap-3 text-base" onClick={() => setStep({ kind: 'paste' })} variant={serverHasVault === false ? 'outline' : 'default'}>
              <Link2 className="size-5" /> Pair with a link
            </Button>
            <Button className="h-12 justify-start gap-3 text-base" onClick={create} variant={serverHasVault === false ? 'default' : 'outline'}>
              <KeyRound className="size-5" /> Create a new vault
            </Button>
          </div>
          {serverHasVault && (
            <p className="text-sm text-muted-foreground">
              This server already has a vault. Pair with a link from a device that has it; a new vault won’t be able to sync.
            </p>
          )}
        </>
      )}

      {step.kind === 'paste' && (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            pair()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="pairing">Pairing link or vault key</Label>
            <Input
              id="pairing"
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value)
                setError('')
              }}
              placeholder="https://…/#pair=…"
              className="h-11 bg-card text-base shadow-none"
              {...NO_AUTOFILL}
              autoFocus
            />
            <p className="text-sm text-muted-foreground">On a paired device, open Settings → Pair a device → Copy link. Or scan its QR code with this phone’s camera.</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep({ kind: 'choose' })}>
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={!pasted.trim()}>
              Pair this device
            </Button>
          </div>
        </form>
      )}

      {step.kind === 'created' && (
        <div className="grid grid-cols-1 gap-6">
          <section className="grid grid-cols-1 gap-2">
            <h2 className="font-semibold">1. Save your pairing link</h2>
            <p className="text-sm text-muted-foreground">
              Keep it in your password manager. It’s how you add devices, and the only way to recover your list if you lose them all.
            </p>
            <div className="flex items-center gap-2 rounded-lg border bg-card p-2 pl-3">
              <code className="min-w-0 flex-1 truncate text-xs">{pairingLink(location.origin, step.vaultKey)}</code>
              <CopyButton text={pairingLink(location.origin, step.vaultKey)} />
            </div>
          </section>
          <section className="grid grid-cols-1 gap-2">
            <h2 className="font-semibold">2. Connect the server</h2>
            <p className="text-sm text-muted-foreground">
              Set <code className="text-foreground">VAULT_TOKEN_HASH</code> to this value in Vercel (Settings → Environment Variables), then
              redeploy. For local development, put it in <code className="text-foreground">.env.local</code> and restart the dev server.
            </p>
            <div className="flex items-center gap-2 rounded-lg border bg-card p-2 pl-3">
              <code className="min-w-0 flex-1 truncate text-xs">{step.hash}</code>
              <CopyButton text={step.hash} />
            </div>
          </section>
          <Button className="h-11" onClick={() => onUnlock(step.vaultKey, { newVault: true })}>
            Done, open my list
          </Button>
        </div>
      )}
    </main>
  )
}

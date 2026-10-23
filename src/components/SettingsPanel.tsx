import { Bell, Download, LogOut, QrCode, RefreshCw, Server } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { getLocal } from '../db'
import { exportJson } from '../exportData'
import { disablePush, enablePush, getPushState, type PushState } from '../push/client'
import { clearVaultKey, getVaultKey, syncNow, vaultKeys } from '../sync/engine'
import { useSyncStatus } from '../sync/hooks'
import { DEFAULT_TTL_DAYS } from '../sync/protocol'
import { pairingLink, tokenHash } from '../sync/vault'
import { CopyButton } from './CopyButton'
import { Panel } from './Panel'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  desktop: boolean
  onLocked: () => void
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-2 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

const STATUS_TEXT = {
  synced: 'Up to date.',
  syncing: 'Syncing…',
  offline: 'Offline. Changes are saved on this device and sync when you’re back online.',
  locked: 'This device isn’t paired.',
  unauthorized: 'The server rejected this device’s key. Check VAULT_TOKEN_HASH on the server (see Server setup below).',
  error: 'Sync failed. It will retry automatically.',
}

const PUSH_TEXT: Record<PushState, string> = {
  on: 'On. You’ll get reminders and a note when the list changes on another device.',
  off: 'Off.',
  denied: 'Blocked in this browser’s settings. Allow notifications for this site to turn them on.',
  'needs-install': 'On iPhone, add Get It Done to your Home Screen (Share → Add to Home Screen), then turn them on from there.',
  unsupported: 'This browser doesn’t support web notifications.',
  'server-not-configured': 'The server has no push keys yet (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).',
}

export function SettingsPanel({ open, onOpenChange, desktop, onLocked }: Props) {
  const { status, lastSyncedAt } = useSyncStatus()
  const [link, setLink] = useState('')
  const [qr, setQr] = useState('')
  const [hash, setHash] = useState('')
  const [ttl, setTtl] = useState(DEFAULT_TTL_DAYS)
  const [push, setPush] = useState<PushState | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const key = await getVaultKey()
      const keys = await vaultKeys()
      if (key && keys) {
        const l = pairingLink(location.origin, key)
        setLink(l)
        setQr(await QRCode.toDataURL(l, { margin: 1, width: 480, errorCorrectionLevel: 'M' }))
        setHash(await tokenHash(keys.token))
      }
      setTtl((await getLocal<number>('ttlDays')) ?? DEFAULT_TTL_DAYS)
      setPush(await getPushState().catch(() => 'unsupported' as const))
    })()
  }, [open])

  return (
    <Panel open={open} onOpenChange={onOpenChange} title="Settings" description="Sync, pairing, notifications and data." desktop={desktop}>
      <div className="grid grid-cols-1 gap-5">
        <Section icon={<RefreshCw className="size-4" />} title="Sync">
          <p className="text-sm text-muted-foreground">
            {STATUS_TEXT[status]}
            {status === 'synced' && lastSyncedAt && ` Last synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`}
          </p>
          <Button variant="outline" size="sm" className="w-fit shadow-none" onClick={() => void syncNow()} disabled={status === 'syncing'}>
            Sync now
          </Button>
        </Section>

        <Section icon={<QrCode className="size-4" />} title="Pair a device">
          <p className="text-sm text-muted-foreground">
            Open this link on your other device, or scan the code with its camera. Anyone with it can read and change your list, so share it only
            with your own devices.
          </p>
          <div className="flex flex-wrap gap-2">
            {link && <CopyButton text={link} label="Copy link" />}
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setShowQr((v) => !v)} disabled={!qr}>
              {showQr ? 'Hide QR code' : 'Show QR code'}
            </Button>
          </div>
          {showQr && qr && <img src={qr} alt="QR code with this vault’s pairing link" className="size-48 rounded-md border bg-white p-1" />}
        </Section>

        <Section icon={<Bell className="size-4" />} title="Notifications">
          <p className="text-sm text-muted-foreground">{push ? PUSH_TEXT[push] : 'Checking…'}</p>
          {(push === 'off' || push === 'on') && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit shadow-none"
              disabled={pushBusy}
              onClick={async () => {
                setPushBusy(true)
                try {
                  setPush(push === 'on' ? await disablePush() : await enablePush())
                } catch (e) {
                  console.error(e)
                  setPush('off')
                } finally {
                  setPushBusy(false)
                }
              }}
            >
              {push === 'on' ? 'Turn off notifications' : 'Enable notifications'}
            </Button>
          )}
        </Section>

        <Section icon={<Download className="size-4" />} title="Your data">
          <p className="text-sm text-muted-foreground">
            Checked items are deleted after {ttl} {ttl === 1 ? 'day' : 'days'}. Export keeps a readable copy of everything on this device.
          </p>
          <Button variant="outline" size="sm" className="w-fit gap-1.5 shadow-none" onClick={() => void exportJson()}>
            <Download className="size-4" /> Export JSON
          </Button>
        </Section>

        <Section icon={<Server className="size-4" />} title="Server setup">
          <p className="text-sm text-muted-foreground">
            The server’s <code className="text-foreground">VAULT_TOKEN_HASH</code> must be this value. To revoke every device, create a new vault and
            replace it.
          </p>
          {hash && (
            <div className="flex items-center gap-2 rounded-lg border bg-card p-2 pl-3">
              <code className="min-w-0 flex-1 truncate text-xs">{hash}</code>
              <CopyButton text={hash} />
            </div>
          )}
        </Section>

        <Section icon={<LogOut className="size-4" />} title="This device">
          <p className="text-sm text-muted-foreground">Forgetting the vault stops syncing here. The list stays on this device until you pair again.</p>
          <Button
            variant="outline"
            size="sm"
            className="w-fit text-destructive shadow-none hover:text-destructive"
            onClick={async () => {
              if (!confirm('Forget the vault on this device? You’ll need your pairing link to sync again.')) return
              await clearVaultKey()
              onOpenChange(false)
              onLocked()
            }}
          >
            Forget vault on this device
          </Button>
        </Section>
      </div>
    </Panel>
  )
}

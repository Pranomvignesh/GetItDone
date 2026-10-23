import { cn } from '@/lib/utils'
import type { SyncStatus } from '../sync/engine'
import { useSyncStatus } from '../sync/hooks'

const LABEL: Record<SyncStatus, string> = {
  synced: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  locked: 'Not paired',
  unauthorized: 'Server rejected this device',
  error: 'Sync error',
}

const DOT: Record<SyncStatus, string> = {
  synced: 'bg-brand',
  syncing: 'bg-muted-foreground animate-pulse',
  offline: 'border-[1.5px] border-muted-foreground bg-transparent',
  locked: 'border-[1.5px] border-muted-foreground bg-transparent',
  unauthorized: 'bg-destructive',
  error: 'bg-destructive',
}

/** FR4 status: a small dot, never a blocking spinner. Opens settings on tap. */
export function SyncDot({ onClick }: { onClick: () => void }) {
  const { status, lastSyncedAt } = useSyncStatus()
  const detail = status === 'synced' && lastSyncedAt ? ` at ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''
  return (
    <button
      onClick={onClick}
      className="grid size-10 place-items-center rounded-md hover:bg-accent"
      aria-label={`${LABEL[status]}${detail}. Open settings`}
      title={`${LABEL[status]}${detail}`}
    >
      <span className={cn('block size-2.5 rounded-full', DOT[status])} />
    </button>
  )
}

import { Flag, Pause, Repeat, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { shortLabel } from '../dates'
import type { Routine } from '../db'
import { describeSchedule } from '../routine'

interface Props {
  routines: Routine[]
  onOpen: (routine: Routine) => void
  onDelete: (routine: Routine) => void
  /** Desktop rows are denser. */
  dense?: boolean
}

/** Active routines first, soonest next occurrence first; paused ones last. */
export function sortRoutines(routines: Routine[]): Routine[] {
  return [...routines].sort((a, b) => {
    if (a.paused !== b.paused) return a.paused ? 1 : -1
    return (a.nextAt ?? Infinity) - (b.nextAt ?? Infinity) || a.name.localeCompare(b.name)
  })
}

export function RoutineList({ routines, onOpen, onDelete, dense = false }: Props) {
  if (routines.length === 0) {
    return (
      <p className="py-10 text-center text-muted-foreground">
        <strong className="block font-semibold text-foreground/80">No routines yet</strong>
        Add one like “water plants every day 8am”.
      </p>
    )
  }
  const now = Date.now()
  return (
    <ul>
      {sortRoutines(routines).map((r) => (
        <li key={r.id} className="group/row flex items-center gap-3 border-b last:border-b-0">
          <span aria-hidden className={cn('grid size-[22px] shrink-0 place-items-center text-muted-foreground', r.paused && 'opacity-50')}>
            {r.paused ? <Pause className="size-4" /> : <Repeat className="size-4" />}
          </span>
          <button
            className={cn('min-h-11 min-w-0 flex-1 py-2.5 text-left leading-snug', r.paused && 'text-muted-foreground')}
            onClick={() => onOpen(r)}
          >
            <span className={cn('block wrap-anywhere', dense ? 'text-[15px]' : 'text-[17px]')}>
              {r.priority === 'high' && <Flag className="mr-1.5 inline size-3.5 -translate-y-px fill-destructive text-destructive" aria-label="High priority" />}
              {r.name}
            </span>
            <span className="block text-xs text-muted-foreground">
              {describeSchedule(r.schedule)}
              {' · '}
              {r.paused ? 'Paused' : r.nextAt ? `next ${shortLabel(r.nextAt, now)}` : 'ended'}
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            title="Delete"
            className="hidden size-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:inline-flex"
            onClick={() => onDelete(r)}
            aria-label={`Delete routine ${r.name}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  )
}

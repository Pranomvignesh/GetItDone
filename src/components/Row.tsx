import { Bell, PencilLine, Trash2 } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { isOverdue, shortLabel } from '../dates'
import type { Item } from '../db'
import { toggleDone } from '../store'

/** How far a row must be dragged before letting go triggers the action. */
const SWIPE_THRESHOLD = 80

interface Props {
  item: Item
  onOpen: (item: Item) => void
  onDelete: (item: Item) => void
  /** Desktop rows are denser and show hover actions instead of swipes. */
  dense?: boolean
}

export function Row({ item, onOpen, onDelete, dense = false }: Props) {
  const done = item.doneAt !== null
  const [dx, setDx] = useState(0)
  const drag = useRef<{ x: number; y: number; swiping: boolean } | null>(null)
  // Set when a swipe ends so the click that follows pointerup is ignored.
  const suppressClick = useRef(false)

  function onPointerDown(e: PointerEvent) {
    // Swipes are a touch gesture; with a mouse the hover buttons do the same jobs.
    if (e.pointerType === 'mouse') return
    drag.current = { x: e.clientX, y: e.clientY, swiping: false }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    const moveX = e.clientX - d.x
    const moveY = e.clientY - d.y
    if (!d.swiping) {
      // Vertical movement wins: let the page scroll.
      if (Math.abs(moveY) > 10 && Math.abs(moveY) > Math.abs(moveX)) {
        drag.current = null
        return
      }
      if (Math.abs(moveX) < 10) return
      d.swiping = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setDx(moveX)
  }

  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (!d?.swiping) return
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 0)
    if (dx <= -SWIPE_THRESHOLD) onDelete(item)
    else if (dx >= SWIPE_THRESHOLD) onOpen(item)
    setDx(0)
  }

  const armed = Math.abs(dx) >= SWIPE_THRESHOLD
  const now = Date.now()
  const overdue = isOverdue(item.deadlineAt, item.doneAt, now)
  const opening = dx > 0

  return (
    <li className="group/row relative overflow-hidden border-b last:border-b-0">
      {/* Revealed behind the row while swiping. */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 flex items-center gap-1.5 px-4 text-sm font-semibold transition-colors',
          opening ? 'justify-start' : 'justify-end',
          !armed && 'bg-muted text-muted-foreground',
          armed && opening && 'bg-primary text-primary-foreground',
          armed && !opening && 'bg-destructive text-destructive-foreground',
        )}
      >
        {opening ? (
          <>
            <PencilLine className="size-4" /> Edit
          </>
        ) : (
          <>
            Delete <Trash2 className="size-4" />
          </>
        )}
      </div>

      <div
        className={cn(
          'relative flex touch-pan-y select-none items-center gap-3 bg-background',
          dense ? 'min-h-11' : 'min-h-[52px]',
          !dx && 'transition-transform duration-200 ease-out',
        )}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null
          setDx(0)
        }}
      >
        <Checkbox
          checked={done}
          onCheckedChange={() => !suppressClick.current && toggleDone(item)}
          aria-label={done ? `Uncheck ${item.name}` : `Check ${item.name}`}
          className={cn(
            // 22px box with a 44px invisible hit area around it.
            'relative size-[22px] rounded-[5px] border-[1.5px] border-muted-foreground/70 shadow-none',
            'after:absolute after:inset-[-11px] after:content-[""]',
            'hover:border-foreground',
            'data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-brand-foreground',
          )}
        />
        <button
          className={cn(
            'min-h-11 min-w-0 flex-1 py-2.5 text-left leading-snug wrap-anywhere',
            dense ? 'text-[15px]' : 'text-[17px]',
            done && 'text-muted-foreground line-through decoration-1',
          )}
          onClick={() => !suppressClick.current && onOpen(item)}
        >
          {item.name}
        </button>

        {(item.deadlineAt !== null || item.remindAt !== null) && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
            {item.remindAt !== null && !done && <Bell className="size-3.5" aria-label={`Reminder ${shortLabel(item.remindAt, now)}`} />}
            {item.deadlineAt !== null && (
              <span className={cn('rounded px-1.5 py-0.5', overdue ? 'bg-destructive/10 font-semibold text-destructive' : 'bg-muted')}>
                {overdue && <span className="sr-only">Overdue: </span>}
                {shortLabel(item.deadlineAt, now)}
              </span>
            )}
          </span>
        )}

        {/* Hover actions: only on devices with a real pointer (touch uses swipes). */}
        <div className="hidden gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:flex">
          <Button title="Edit" variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => onOpen(item)} aria-label={`Edit ${item.name}`}>
                <PencilLine className="size-4" />
              </Button>
          <Button title="Delete"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(item)}
                aria-label={`Delete ${item.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
        </div>
      </div>
    </li>
  )
}

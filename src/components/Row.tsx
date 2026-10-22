import { useRef, useState, type PointerEvent } from 'react'
import { categoryKey } from '../categories'
import type { Item } from '../db'
import { toggleDone } from '../store'

/** How far a row must be dragged before letting go triggers the action. */
const SWIPE_THRESHOLD = 80

interface Props {
  item: Item
  onPickCategory: (item: Item) => void
  onOpen: (item: Item) => void
  onDelete: (item: Item) => void
}

export function Row({ item, onPickCategory, onOpen, onDelete }: Props) {
  const done = item.doneAt !== null
  const [dx, setDx] = useState(0)
  const drag = useRef<{ x: number; y: number; swiping: boolean } | null>(null)
  // Set when a swipe ends so the click that follows pointerup is ignored.
  const suppressClick = useRef(false)

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
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

  function guard(action: () => void) {
    return () => {
      if (!suppressClick.current) action()
    }
  }

  const armed = Math.abs(dx) >= SWIPE_THRESHOLD
  return (
    <li className={done ? 'row row-done' : 'row'}>
      <div className={`swipe-bg ${dx > 0 ? 'swipe-bg-open' : 'swipe-bg-delete'} ${armed ? 'swipe-armed' : ''}`} aria-hidden>
        <span>{dx > 0 ? 'Details' : 'Delete'}</span>
      </div>
      <div
        className={dx ? 'row-content row-dragging' : 'row-content'}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null
          setDx(0)
        }}
      >
        <button
          className="check"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Uncheck ${item.name}` : `Check ${item.name}`}
          onClick={guard(() => toggleDone(item))}
        >
          <span className="check-box" />
        </button>
        <button className="row-name" onClick={guard(() => onOpen(item))}>
          {item.name}
        </button>
        <button className="tag" onClick={guard(() => onPickCategory(item))} aria-label={`Change category of ${item.name}`}>
          {categoryKey(item)}
        </button>
      </div>
    </li>
  )
}

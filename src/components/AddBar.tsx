import { Bell, CalendarClock, Flag, Plus } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Item } from '../db'
import { parseInput } from '../categorize'
import { shortLabel } from '../dates'
import { addFromInput } from '../store'
import { NO_AUTOFILL } from '../noAutofill'

interface Props {
  placeholder: string
  onAdded?: (items: Item[]) => void
  className?: string
  /** Where the "understood as" preview appears: above the field (phone bottom bar) or below (desktop top bar). */
  previewPlacement?: 'above' | 'below'
}

/** Shows what the parser understood (deadline, reminder, priority) before the items are added. */
function ParsePreview({ text, placement }: { text: string; placement: 'above' | 'below' }) {
  // Re-parsed as the text changes.
  const { entries, now } = useMemo(() => {
    const now = Date.now()
    return { now, entries: parseInput(text, {}, now).filter((e) => e.deadlineAt !== null || e.remindAt !== null || e.priority) }
  }, [text])
  if (entries.length === 0) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'absolute inset-x-0 z-10 grid gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md',
        placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
      )}
    >
      {entries.slice(0, 4).map((e, i) => (
        <div key={i} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span className="font-medium text-foreground">{e.name}</span>
          {e.deadlineAt !== null && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden /> Due {shortLabel(e.deadlineAt, now)}
            </span>
          )}
          {e.remindAt !== null && (
            <span className="inline-flex items-center gap-1">
              <Bell className="size-3.5" aria-hidden /> Remind {shortLabel(e.remindAt, now)}
            </span>
          )}
          {e.priority === 'high' && (
            <span className="inline-flex items-center gap-1 font-medium text-destructive">
              <Flag className="size-3.5 fill-destructive" aria-hidden /> High
            </span>
          )}
          {e.priority === 'low' && <span>Low priority</span>}
        </div>
      ))}
    </div>
  )
}

export function AddBar({ placeholder, onAdded, className, previewPlacement = 'above' }: Props) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim()) return
    setText('')
    const added = await addFromInput(text)
    onAdded?.(added)
    ref.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter adds; Shift+Enter starts a new line for adding several items at once.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form className={cn('relative flex items-end gap-2', className)} onSubmit={submit} autoComplete="off">
      <ParsePreview text={text} placement={previewPlacement} />
      <Textarea
        ref={ref}
        id="add-input"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Add items"
        enterKeyHint="done"
        {...NO_AUTOFILL}
        // 16px stops iOS Safari from zooming into the field.
        className="max-h-32 min-h-11 flex-1 resize-none bg-card py-[11px] text-base leading-5 shadow-none field-sizing-content md:text-[15px]"
      />
      <Button
        type="submit"
        disabled={!text.trim()}
        className="h-11 gap-1.5 bg-brand px-4 text-brand-foreground hover:bg-brand/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
      >
        <Plus className="size-[18px]" />
        Add
      </Button>
    </form>
  )
}

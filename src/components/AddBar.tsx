import { Bell, CalendarClock, Flag, PencilLine, Plus, Repeat, Save, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { categoryKey } from '../categories'
import { parseInput, parseOne, type ParsedEntry } from '../categorize'
import { isOverdue, shortLabel } from '../dates'
import { db, type Item } from '../db'
import { formatItem } from '../formatItem'
import { NO_AUTOFILL } from '../noAutofill'
import { describeSchedule, nextOccurrence } from '../routine'
import { searchByName } from '../search'
import { addFromInput, getOverrides, updateFromText, type Added } from '../store'
import { useLive } from '../useLive'

interface Props {
  placeholder: string
  onAdded?: (added: Added) => void
  className?: string
  /** Where the preview and picker appear: above the field (phone bottom bar) or below (desktop top bar). */
  previewPlacement?: 'above' | 'below'
}

/** Typing this switches the add bar to picking an item to edit. */
const EDIT_COMMAND = /^\s*\/edit\b\s*/i

type Mode = { kind: 'add' } | { kind: 'edit'; item: Item }

function Popover({ placement, children, className }: { placement: 'above' | 'below'; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'absolute inset-x-0 z-10 rounded-lg border bg-popover text-xs text-muted-foreground shadow-md',
        placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** One parsed entry's details: routine schedule, deadline, reminder, priority. */
function EntryDetails({ e, now }: { e: ParsedEntry; now: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
      <span className="font-medium text-foreground">{e.name}</span>
      {e.routine && (
        <span className="inline-flex items-center gap-1">
          <Repeat className="size-3.5" aria-hidden /> Routine: {describeSchedule(e.routine.schedule)}
          {(() => {
            const next = nextOccurrence(e.routine.schedule, now)
            return next ? ` · next ${shortLabel(next, now)}` : ''
          })()}
        </span>
      )}
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
  )
}

/** Shows what the parser understood (routine, deadline, reminder, priority) before adding or saving. */
function ParsePreview({ text, placement, editing }: { text: string; placement: 'above' | 'below'; editing?: Item }) {
  const { entries, now } = useMemo(() => {
    const now = Date.now()
    // Editing reads the text as one item, so a name with a comma isn't split in two.
    const all = editing ? [parseOne(text, {}, now)] : parseInput(text, {}, now)
    return { now, entries: editing ? all : all.filter((e) => e.routine || e.deadlineAt !== null || e.remindAt !== null || e.priority) }
  }, [text, editing])
  if (!editing && entries.length === 0) return null
  return (
    <Popover placement={placement} className="grid gap-1 px-3 py-2">
      <div role="status" aria-live="polite" className="grid gap-1">
        {editing && (
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <PencilLine className="size-3.5" aria-hidden /> Editing “{editing.name}”: Enter saves, Esc cancels
          </p>
        )}
        {entries.slice(0, 4).map((e, i) => (
          <EntryDetails key={i} e={e} now={now} />
        ))}
      </div>
    </Popover>
  )
}

export function AddBar({ placeholder, onAdded, className, previewPlacement = 'above' }: Props) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>({ kind: 'add' })
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)

  // "/edit …" picks an existing item; the rest of the text filters by name.
  const picking = mode.kind === 'add' && EDIT_COMMAND.test(text)
  const query = picking ? text.replace(EDIT_COMMAND, '') : ''
  const openItems = useLive(
    () =>
      db.items
        .filter((i) => !i.deletedAt && !i.doneAt)
        .toArray()
        .then((all) => all.sort((a, b) => b.updatedAt - a.updatedAt)),
    [],
  )
  const matches = useMemo(() => (picking ? searchByName(openItems ?? [], query) : []), [picking, openItems, query])

  useEffect(() => setActive(0), [query])

  // ⌘E / Ctrl+E starts editing from anywhere.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'e' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      e.preventDefault()
      setMode({ kind: 'add' })
      setText('/edit ')
      ref.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function reset() {
    setMode({ kind: 'add' })
    setText('')
  }

  function choose(item: Item) {
    const formatted = formatItem(item, Date.now())
    setMode({ kind: 'edit', item })
    setText(formatted)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(formatted.length, formatted.length)
    })
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (picking) {
      if (matches[active]) choose(matches[active])
      return
    }
    if (!text.trim()) return
    if (mode.kind === 'edit') {
      const parsed = parseOne(text, await getOverrides(), Date.now())
      if (parsed.routine) {
        toast('To make this a routine, add it as a new item instead.')
        return
      }
      await updateFromText(mode.item, parsed)
      toast(`Updated “${parsed.name}”`)
      reset()
      ref.current?.focus()
      return
    }
    const value = text
    setText('')
    const added = await addFromInput(value)
    onAdded?.(added)
    ref.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (picking && matches.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
      return
    }
    if (e.key === 'Escape' && (picking || mode.kind === 'edit')) {
      e.preventDefault()
      reset()
      return
    }
    // Enter adds (or picks, or saves); Shift+Enter starts a new line for adding several items at once.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const now = Date.now()
  const listId = 'edit-picker'

  return (
    <form className={cn('relative flex items-end gap-2', className)} onSubmit={submit} autoComplete="off">
      {picking ? (
        <Popover placement={previewPlacement} className="overflow-hidden">
          <p className="border-b px-3 py-1.5 font-semibold text-foreground">
            {matches.length ? 'Pick an item to edit (↑ ↓ and Enter)' : query ? `No open items match “${query.trim()}”` : 'No open items to edit'}
          </p>
          {matches.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Items to edit" className="max-h-72 overflow-y-auto py-1">
              {matches.map((item, i) => (
                <li
                  key={item.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={cn('flex cursor-pointer items-center gap-2 px-3 py-2 text-sm', i === active && 'bg-accent text-accent-foreground')}
                  onMouseEnter={() => setActive(i)}
                  // Keep focus in the field; choose on mouse/touch down.
                  onPointerDown={(e) => {
                    e.preventDefault()
                    choose(item)
                  }}
                >
                  {item.priority === 'high' && <Flag className="size-3.5 shrink-0 fill-destructive text-destructive" aria-label="High priority" />}
                  <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.deadlineAt !== null && (
                      <span className={cn('mr-2', isOverdue(item.deadlineAt, item.doneAt, now) && 'text-destructive')}>{shortLabel(item.deadlineAt, now)}</span>
                    )}
                    {categoryKey(item)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      ) : (
        <ParsePreview text={text} placement={previewPlacement} editing={mode.kind === 'edit' ? mode.item : undefined} />
      )}
      <Textarea
        ref={ref}
        id="add-input"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={mode.kind === 'edit' ? 'Edit the item…' : placeholder}
        aria-label={mode.kind === 'edit' ? `Edit ${mode.item.name}` : 'Add items'}
        enterKeyHint="done"
        {...NO_AUTOFILL}
        // A combobox for the /edit picker (after the no-autofill props, so "list" wins).
        role="combobox"
        aria-expanded={picking && matches.length > 0}
        aria-controls={picking && matches.length > 0 ? listId : undefined}
        aria-activedescendant={picking && matches[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        // 16px stops iOS Safari from zooming into the field.
        className="max-h-32 min-h-11 flex-1 resize-none bg-card py-[11px] text-base leading-5 shadow-none field-sizing-content md:text-[15px]"
      />
      {mode.kind === 'edit' && (
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" onClick={reset} aria-label="Cancel editing" title="Cancel">
          <X className="size-5" />
        </Button>
      )}
      <Button
        type="submit"
        disabled={!text.trim() || (picking && matches.length === 0)}
        className="h-11 gap-1.5 bg-brand px-4 text-brand-foreground hover:bg-brand/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
      >
        {mode.kind === 'edit' ? <Save className="size-[18px]" /> : picking ? <PencilLine className="size-[18px]" /> : <Plus className="size-[18px]" />}
        {mode.kind === 'edit' ? 'Save' : picking ? 'Edit' : 'Add'}
      </Button>
    </form>
  )
}

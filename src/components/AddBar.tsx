import { Plus } from 'lucide-react'
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Item } from '../db'
import { addFromInput } from '../store'

interface Props {
  placeholder: string
  onAdded?: (items: Item[]) => void
  className?: string
}

export function AddBar({ placeholder, onAdded, className }: Props) {
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
    <form className={cn('flex items-end gap-2', className)} onSubmit={submit}>
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
        autoComplete="off"
        // 16px stops iOS Safari from zooming into the field.
        className="max-h-32 min-h-11 flex-1 resize-none bg-card py-[11px] text-base leading-5 shadow-none [field-sizing:content] md:text-[15px]"
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

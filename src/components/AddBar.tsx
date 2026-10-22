import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { addFromInput } from '../store'

export function AddBar() {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim()) return
    setText('')
    await addFromInput(text)
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
    <form className="add-bar" onSubmit={submit}>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Add milk, eggs, call plumber…"
        aria-label="Add items"
        enterKeyHint="done"
        autoComplete="off"
      />
      <button type="submit" className="add-button" disabled={!text.trim()}>
        Add
      </button>
    </form>
  )
}

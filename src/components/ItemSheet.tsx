import { useState } from 'react'
import { db, type Item } from '../db'
import { setCategory, updateItem } from '../store'
import { useLive } from '../useLive'
import { CategoryPicker } from './CategoryPicker'
import { Sheet } from './Sheet'

interface Props {
  id: string
  onClose: () => void
  onDelete: (item: Item) => void
}

export function ItemSheet({ id, onClose, onDelete }: Props) {
  // Read live so the category chips reflect a change straight away.
  const item = useLive(() => db.items.get(id), [id])
  const [name, setName] = useState<string | null>(null)

  if (!item) return null
  const draft = name ?? item.name

  async function saveName() {
    const trimmed = draft.trim()
    if (item && trimmed && trimmed !== item.name) await updateItem(item.id, { name: trimmed })
    setName(null)
  }

  async function close() {
    await saveName()
    onClose()
  }

  return (
    <Sheet title="Item" onClose={close}>
      <label className="field">
        <span className="field-label">Name</span>
        <input
          value={draft}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          enterKeyHint="done"
        />
      </label>

      <div className="field">
        <span className="field-label">Category</span>
        <CategoryPicker value={item} onChange={(c) => setCategory({ ...item, name: draft.trim() || item.name }, c)} />
      </div>

      <button
        className="danger-button"
        onClick={() => {
          onDelete(item)
          onClose()
        }}
      >
        Delete item
      </button>
    </Sheet>
  )
}

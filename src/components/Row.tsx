import { categoryKey } from '../categories'
import type { Item } from '../db'
import { toggleDone } from '../store'

interface Props {
  item: Item
  onPickCategory: (item: Item) => void
}

export function Row({ item, onPickCategory }: Props) {
  const done = item.doneAt !== null
  return (
    <li className={done ? 'row row-done' : 'row'}>
      <button
        className="check"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Uncheck ${item.name}` : `Check ${item.name}`}
        onClick={() => toggleDone(item)}
      >
        <span className="check-box" />
      </button>
      <span className="row-name">{item.name}</span>
      <button className="tag" onClick={() => onPickCategory(item)} aria-label={`Change category of ${item.name}`}>
        {categoryKey(item)}
      </button>
    </li>
  )
}

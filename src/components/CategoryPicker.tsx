import { CATEGORY_CHOICES, categoryKey, type Category } from '../categories'

interface Props {
  value: Category
  onChange: (category: Category) => void
}

export function CategoryPicker({ value, onChange }: Props) {
  const current = categoryKey(value)
  return (
    <div className="chips" role="radiogroup" aria-label="Category">
      {CATEGORY_CHOICES.map((c) => {
        const key = categoryKey(c)
        return (
          <button
            key={key}
            role="radio"
            aria-checked={key === current}
            className={key === current ? 'chip chip-selected' : 'chip'}
            onClick={() => onChange(c)}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}

import { useCallback, useState } from 'react'
import { AddBar } from './components/AddBar'
import { CategoryPicker } from './components/CategoryPicker'
import { Group } from './components/Group'
import { Row } from './components/Row'
import { Sheet } from './components/Sheet'
import { db, type Item } from './db'
import { groupItems } from './grouping'
import { setCategory } from './store'
import { useLive } from './useLive'

export default function App() {
  const items = useLive(() => db.items.toArray())
  const [picking, setPicking] = useState<Item | null>(null)
  const closePicker = useCallback(() => setPicking(null), [])

  // First render before IndexedDB answers: keep the shell, no spinner.
  const g = groupItems(items ?? [])
  const openGroceries = g.groceries.reduce((n, s) => n + s.items.length, 0)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Get It Done</h1>
      </header>

      <main className="lists">
        <Group id="groceries" title="Groceries" openCount={openGroceries} done={g.groceriesDone} onPickCategory={setPicking}>
          {g.groceries.map(({ section, items }) => (
            <div key={section} className="section">
              <h3 className="section-title">{section}</h3>
              <ul className="rows">
                {items.map((item) => (
                  <Row key={item.id} item={item} onPickCategory={setPicking} />
                ))}
              </ul>
            </div>
          ))}
        </Group>

        <Group id="todos" title="To-dos" openCount={g.todos.length} done={g.todosDone} onPickCategory={setPicking}>
          <ul className="rows">
            {g.todos.map((item) => (
              <Row key={item.id} item={item} onPickCategory={setPicking} />
            ))}
          </ul>
        </Group>
      </main>

      <AddBar />

      {picking && (
        <Sheet title={picking.name} onClose={closePicker}>
          <p className="sheet-hint">Pick a category. Get It Done will remember it for “{picking.name}”.</p>
          <CategoryPicker
            value={picking}
            onChange={async (c) => {
              await setCategory(picking, c)
              closePicker()
            }}
          />
        </Sheet>
      )}
    </div>
  )
}

import { useCallback, useState } from 'react'
import { AddBar } from './components/AddBar'
import { CategoryPicker } from './components/CategoryPicker'
import { Group } from './components/Group'
import { ItemSheet } from './components/ItemSheet'
import { Row } from './components/Row'
import { Sheet } from './components/Sheet'
import { UndoToast } from './components/UndoToast'
import { db, type Item } from './db'
import { groupItems } from './grouping'
import { deleteItem, restoreItem, setCategory } from './store'
import { useLive } from './useLive'

export default function App() {
  const items = useLive(() => db.items.toArray())
  const [picking, setPicking] = useState<Item | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<Item | null>(null)
  const closePicker = useCallback(() => setPicking(null), [])
  const closeItem = useCallback(() => setOpenId(null), [])
  const dismissToast = useCallback(() => setDeleted(null), [])

  const remove = useCallback((item: Item) => {
    deleteItem(item.id)
    setDeleted(item)
  }, [])

  const renderRow = (item: Item) => (
    <Row key={item.id} item={item} onPickCategory={setPicking} onOpen={(i) => setOpenId(i.id)} onDelete={remove} />
  )

  // First render before IndexedDB answers: keep the shell, no spinner.
  const g = groupItems(items ?? [])
  const openGroceries = g.groceries.reduce((n, s) => n + s.items.length, 0)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Get It Done</h1>
      </header>

      <main className="lists">
        <Group id="groceries" title="Groceries" openCount={openGroceries} done={g.groceriesDone} renderRow={renderRow}>
          {g.groceries.map(({ section, items }) => (
            <div key={section} className="section">
              <h3 className="section-title">{section}</h3>
              <ul className="rows">{items.map(renderRow)}</ul>
            </div>
          ))}
        </Group>

        <Group id="todos" title="To-dos" openCount={g.todos.length} done={g.todosDone} renderRow={renderRow}>
          <ul className="rows">{g.todos.map(renderRow)}</ul>
        </Group>
      </main>

      {deleted && (
        <UndoToast
          message={`Deleted “${deleted.name}”`}
          onUndo={() => {
            restoreItem(deleted.id)
            setDeleted(null)
          }}
          onDismiss={dismissToast}
        />
      )}

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

      {openId && <ItemSheet id={openId} onClose={closeItem} onDelete={remove} />}
    </div>
  )
}

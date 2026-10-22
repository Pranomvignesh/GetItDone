import { useState, type ReactNode } from 'react'
import type { Item } from '../db'

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Storage unavailable (private mode): the toggle still works for this visit.
  }
}

function usePersistentToggle(key: string, initial: boolean) {
  const [value, setValue] = useState(() => readFlag(key, initial))
  const toggle = () =>
    setValue((v) => {
      writeFlag(key, !v)
      return !v
    })
  return [value, toggle] as const
}

interface Props {
  id: string
  title: string
  openCount: number
  done: Item[]
  renderRow: (item: Item) => ReactNode
  children: ReactNode
}

export function Group({ id, title, openCount, done, renderRow, children }: Props) {
  const [collapsed, toggleCollapsed] = usePersistentToggle(`collapsed:${id}`, false)
  const [showDone, toggleDone] = usePersistentToggle(`showDone:${id}`, false)

  return (
    <section className="group">
      <button className="group-header" onClick={toggleCollapsed} aria-expanded={!collapsed}>
        <span className="group-title">{title}</span>
        <span className="group-count">{openCount}</span>
        <span className={collapsed ? 'chevron chevron-closed' : 'chevron'} aria-hidden>
          ▾
        </span>
      </button>
      {!collapsed && (
        <>
          {openCount === 0 && <p className="empty">Nothing here.</p>}
          {children}
          {done.length > 0 && (
            <div className="done-area">
              <button className="done-toggle" onClick={toggleDone} aria-expanded={showDone}>
                Done · {done.length}
              </button>
              {showDone && (
                <ul className="rows">
                  {done.map(renderRow)}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

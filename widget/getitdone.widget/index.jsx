// Get It Done – Mac desktop widget for Übersicht (FR8).
// Shows open items grouped like the app; click a box to mark it done.
// Setup: copy config.example.json to config.json and fill it in (see README).
import { css, run } from 'uebersicht'
import { loadList, markDone } from './lib.js'

// Refresh every 60 seconds (and whenever Übersicht wakes the widget).
export const refreshFrequency = 60_000

export const initialState = { status: 'loading', groceries: [], todos: [], error: null, serverOffset: 0 }

async function readConfig() {
  const text = await run('cat getitdone.widget/config.json')
  return JSON.parse(text)
}

export const command = async (dispatch) => {
  try {
    const config = await readConfig()
    const list = await loadList(config)
    dispatch({ type: 'LOADED', list, config })
  } catch (error) {
    dispatch({ type: 'FAILED', error: String(error.message || error) })
  }
}

export const updateState = (event, state) => {
  switch (event.type) {
    case 'LOADED':
      return { status: 'ready', ...event.list, config: event.config, error: null }
    case 'FAILED':
      return { ...state, status: 'error', error: event.error }
    case 'CHECKED':
      return {
        ...state,
        groceries: state.groceries.map((s) => ({ ...s, items: s.items.filter((i) => i.id !== event.id) })).filter((s) => s.items.length),
        todos: state.todos.filter((i) => i.id !== event.id),
      }
    default:
      return state
  }
}

// Anchored top-right of the desktop; adjust top/right to move it.
export const className = css`
  top: 40px;
  right: 24px;
  width: 280px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 14px 16px 12px;
  border-radius: 12px;
  background: rgba(15, 20, 19, 0.62);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  color: #eef3f0;
  font: 13px/1.35 -apple-system, BlinkMacSystemFont, 'Google Sans', sans-serif;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
`

const title = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
`
const mark = css`
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: #218355;
  font-size: 12px;
`
const group = css`
  margin: 10px 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(238, 243, 240, 0.6);
`
const row = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
`
const box = css`
  flex: none;
  width: 14px;
  height: 14px;
  border: 1.5px solid rgba(238, 243, 240, 0.65);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  &:hover {
    border-color: #6fd49a;
    background: rgba(111, 212, 154, 0.25);
  }
`
const due = css`
  margin-left: auto;
  font-size: 11px;
  color: rgba(238, 243, 240, 0.6);
`
const muted = css`
  color: rgba(238, 243, 240, 0.6);
`

function Row({ item, state, dispatch }) {
  const check = async () => {
    dispatch({ type: 'CHECKED', id: item.id })
    try {
      await markDone(state.config, item, state.serverOffset)
    } catch (error) {
      dispatch({ type: 'FAILED', error: String(error.message || error) })
    }
  }
  return (
    <div className={row}>
      <button className={box} onClick={check} title="Mark done" aria-label={`Mark ${item.name} done`} />
      <span>{item.name}</span>
      {item.deadlineAt && <span className={due}>{new Date(item.deadlineAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>}
    </div>
  )
}

export const render = (state, dispatch) => {
  if (state.status === 'loading') return <div className={muted}>Loading…</div>
  if (state.status === 'error' && !state.groceries.length && !state.todos.length) {
    return (
      <div>
        <p className={title}>Get It Done</p>
        <div className={muted}>{state.error}</div>
      </div>
    )
  }
  return (
    <div>
      <p className={title}>
        <span className={mark}>✓</span> Get It Done
      </p>
      {state.groceries.length > 0 && <div className={group}>Groceries</div>}
      {state.groceries.map((s) => (
        <div key={s.section}>
          <div className={muted} style={{ fontSize: 11, marginTop: 4 }}>
            {s.section}
          </div>
          {s.items.map((item) => (
            <Row key={item.id} item={item} state={state} dispatch={dispatch} />
          ))}
        </div>
      ))}
      {state.todos.length > 0 && <div className={group}>To-dos</div>}
      {state.todos.map((item) => (
        <Row key={item.id} item={item} state={state} dispatch={dispatch} />
      ))}
      {!state.groceries.length && !state.todos.length && <div className={muted}>All clear.</div>}
      {state.error && <div className={muted}>{state.error}</div>}
    </div>
  )
}

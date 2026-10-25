import { Settings } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AddBar } from './components/AddBar'
import { AppName } from './components/AppName'
import { ListBody } from './components/ListBody'
import { LockScreen } from './components/LockScreen'
import { Row } from './components/Row'
import { RoutineList } from './components/RoutineList'
import { SyncDot } from './components/SyncDot'
import { ThemeToggle } from './components/ThemeToggle'
import { UpdatePrompt } from './components/UpdatePrompt'
import { db, type Item, type Routine } from './db'
import { groupItems, type Grouped } from './grouping'
import { deleteItem, deleteRoutine, restoreItem, restoreRoutine, type Added } from './store'
import { useLive } from './useLive'
import { useTheme, type Theme } from './theme'
import { useMediaQuery } from './useMediaQuery'
import { usePersistentState } from './usePersistentState'
import { useVault } from './sync/hooks'

// Loaded on first use, keeping them out of the initial download.
const ItemEditor = lazy(() => import('./components/ItemEditor').then((m) => ({ default: m.ItemEditor })))
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel })))
const RoutineEditor = lazy(() => import('./components/RoutineEditor').then((m) => ({ default: m.RoutineEditor })))

type ListId = 'groceries' | 'todos' | 'routines'
const LIST_IDS: readonly ListId[] = ['groceries', 'todos', 'routines']
const TITLES: Record<ListId, string> = { groceries: 'Groceries', todos: 'To-dos', routines: 'Routines' }
const COUNT_LABEL: Record<ListId, string> = { groceries: 'to buy', todos: 'to do', routines: 'active' }
const PLACEHOLDER: Record<ListId, string> = {
  groceries: 'Add milk, eggs, bread…',
  todos: 'Add call plumber tomorrow 6pm…',
  routines: 'Add water plants every day 8am…',
}

/** Which lists an add landed in, for flashing tabs the items went to. */
function addedTo(added: Added): ListId[] {
  const lists = new Set<ListId>(added.items.map((i) => (i.type === 'grocery' ? 'groceries' : 'todos')))
  if (added.routines.length) lists.add('routines')
  return [...lists]
}

/** Desktop layout from Tailwind's `lg` breakpoint up. */
const DESKTOP_QUERY = '(min-width: 1024px)'

interface LayoutProps {
  grouped: Grouped
  counts: Record<ListId, number>
  renderRow: (item: Item) => ReactNode
  /** The Routines list (its own rows, not items). */
  routines: ReactNode
  /** Sync dot, theme toggle and settings, shown in the app bar. */
  actions: ReactNode
}

function listContent(id: ListId, props: LayoutProps, columns = false) {
  if (id === 'routines') return props.routines
  return <ListBody kind={id} grouped={props.grouped} renderRow={props.renderRow} columns={columns} />
}

function HeaderActions({ theme, onToggleTheme, onOpenSettings }: { theme: Theme; onToggleTheme: () => void; onOpenSettings: () => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <SyncDot onClick={onOpenSettings} />
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      <Button variant="ghost" size="icon" className="size-10 text-muted-foreground hover:text-foreground" onClick={onOpenSettings} aria-label="Settings">
        <Settings className="size-5" />
      </Button>
    </div>
  )
}

function MobileLayout(props: LayoutProps) {
  const { counts, actions } = props
  const [list, setList] = usePersistentState<ListId>('tab', 'groceries', LIST_IDS)
  const [pulse, setPulse] = useState<ListId | null>(null)

  useEffect(() => {
    if (!pulse) return
    const t = setTimeout(() => setPulse(null), 1200)
    return () => clearTimeout(t)
  }, [pulse])

  // Items can land in another list; flash its count so they don't seem to vanish.
  const onAdded = (added: Added) => {
    const elsewhere = addedTo(added).find((l) => l !== list)
    if (elsewhere) setPulse(elsewhere)
  }

  return (
    <Tabs value={list} onValueChange={(v) => setList(v as ListId)} className="min-h-dvh">
      {/* App bar: always visible, clears the notch / status bar. */}
      <header className="sticky top-0 z-40 border-b bg-background/90 pt-safe backdrop-blur-lg backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-xl items-center justify-between px-safe">
          <AppName />
          {actions}
        </div>
      </header>

      <div className="mx-auto max-w-xl px-safe">
        {/* List heading; sits under the app name and scrolls with the list. */}
        <div className="flex items-baseline justify-between gap-3 pb-2 pt-5">
          <h2 className="text-xl font-semibold tracking-tight">{TITLES[list]}</h2>
          {counts[list] > 0 && (
            <span className="text-[15px] tabular-nums text-muted-foreground">
              {counts[list]} {COUNT_LABEL[list]}
            </span>
          )}
        </div>

        {LIST_IDS.map((id) => (
          <TabsContent key={id} value={id} className="mt-0 pb-[calc(8.5rem+env(safe-area-inset-bottom))]">
            {listContent(id, props)}
          </TabsContent>
        ))}
      </div>

      {/* Bottom bar in thumb reach: list switch above the add field. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-lg backdrop-saturate-150">
        <div className="mx-auto max-w-xl space-y-2 px-safe pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5">
          <TabsList className="grid h-11 w-full grid-cols-3 p-0.5">
            {LIST_IDS.map((id) => (
              <TabsTrigger key={id} value={id} className="h-10 gap-1.5 px-1 text-[15px] data-[state=active]:font-semibold data-[state=active]:shadow-xs dark:data-[state=active]:bg-accent">
                {TITLES[id]}
                <span
                  className={cn(
                    'inline-block tabular-nums text-muted-foreground',
                    pulse === id && 'animate-count-bump font-bold text-brand',
                  )}
                >
                  {counts[id]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <AddBar placeholder={PLACEHOLDER[list]} onAdded={onAdded} />
        </div>
      </div>
    </Tabs>
  )
}

function DesktopLayout(props: LayoutProps) {
  const { counts, actions } = props
  // "/" jumps to the add field from anywhere, like search in many desktop apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key !== '/' || e.metaKey || e.ctrlKey || target.closest('input, textarea, [contenteditable]')) return
      e.preventDefault()
      document.getElementById('add-input')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-lg backdrop-saturate-150">
        <div className="mx-auto grid max-w-[1320px] grid-cols-[240px_minmax(0,1fr)_240px] items-center gap-6 px-10 py-4">
          <AppName />
          <AddBar
            placeholder="Add — milk, call bank tomorrow 6pm urgent, water plants every day 8am…"
            className="w-full max-w-2xl justify-self-center"
            previewPlacement="below"
          />
          <div className="flex items-center gap-3 justify-self-end">
            <span className="text-xs text-muted-foreground">
              Press <kbd className="rounded border border-input px-1.5 py-px font-sans">/</kbd> to add
            </span>
            {actions}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-10 px-10 pb-20 pt-8 xl:gap-14">
        {LIST_IDS.map((id) => (
          <section key={id} aria-labelledby={`col-${id}`}>
            <div className="mb-4 flex items-baseline justify-between gap-3 border-b-2 border-foreground pb-3">
              <h2 id={`col-${id}`} className="text-2xl font-semibold tracking-tight">
                {TITLES[id]}
              </h2>
              <span className="text-sm tabular-nums text-muted-foreground">
                {counts[id]} {id === 'routines' ? 'active' : 'open'}
              </span>
            </div>
            {listContent(id, props, id === 'groceries')}
          </section>
        ))}
      </main>
    </div>
  )
}

export default function App() {
  const vault = useVault()
  const items = useLive(() => db.items.toArray())
  const routines = useLive(() => db.routines.filter((r) => !r.deletedAt).toArray())
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const theme = useTheme()
  const [openId, setOpenId] = useState<string | null>(null)
  const [openRoutineId, setOpenRoutineId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const closeItem = useCallback(() => setOpenId(null), [])

  const remove = useCallback((item: Item) => {
    deleteItem(item.id)
    toast(`Deleted “${item.name}”`, {
      id: `deleted-${item.id}`,
      action: { label: 'Undo', onClick: () => restoreItem(item.id) },
    })
  }, [])

  const removeRoutine = useCallback((r: Routine) => {
    deleteRoutine(r.id)
    toast(`Deleted routine “${r.name}”`, {
      id: `deleted-routine-${r.id}`,
      action: { label: 'Undo', onClick: () => restoreRoutine(r.id) },
    })
  }, [])

  const renderRow = (item: Item) => (
    <Row key={item.id} item={item} dense={isDesktop} onOpen={(i) => setOpenId(i.id)} onDelete={remove} />
  )

  // First render before IndexedDB answers: keep the shell, no spinner.
  const grouped = groupItems(items ?? [])
  const counts: Record<ListId, number> = {
    groceries: grouped.groceries.reduce((n, s) => n + s.items.length, 0),
    todos: grouped.todos.length,
    routines: (routines ?? []).filter((r) => !r.paused).length,
  }
  const routineList = <RoutineList routines={routines ?? []} dense={isDesktop} onOpen={(r) => setOpenRoutineId(r.id)} onDelete={removeRoutine} />

  const Layout = isDesktop ? DesktopLayout : MobileLayout
  // On phones the toast sits just above the bottom bar.
  const toastOffset = isDesktop ? 24 : { bottom: 'calc(8.25rem + env(safe-area-inset-bottom))' }

  const toaster = <Toaster theme={theme.theme} position="bottom-center" duration={5000} offset={toastOffset} mobileOffset={toastOffset} />

  // The service worker and update prompt run on every screen, including the lock screen.
  if (vault.state !== 'unlocked') {
    return (
      <>
        {vault.state === 'locked' && <LockScreen onUnlock={vault.unlock} />}
        <UpdatePrompt />
        {toaster}
      </>
    )
  }

  const actions = <HeaderActions theme={theme.theme} onToggleTheme={theme.toggle} onOpenSettings={() => setSettingsOpen(true)} />

  return (
    <>
      <Layout grouped={grouped} counts={counts} renderRow={renderRow} routines={routineList} actions={actions} />
      <Suspense>
        {openId && <ItemEditor id={openId} desktop={isDesktop} onClose={closeItem} onDelete={remove} />}
        {openRoutineId && (
          <RoutineEditor id={openRoutineId} desktop={isDesktop} onClose={() => setOpenRoutineId(null)} onDelete={removeRoutine} />
        )}
        {settingsOpen && <SettingsPanel open desktop={isDesktop} onOpenChange={setSettingsOpen} onLocked={vault.lock} />}
      </Suspense>
      <UpdatePrompt />
      {toaster}
    </>
  )
}

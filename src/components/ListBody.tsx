import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { Item } from '../db'
import type { Grouped } from '../grouping'
import { usePersistentState } from '../usePersistentState'

interface Props {
  kind: 'groceries' | 'todos'
  grouped: Grouped
  renderRow: (item: Item) => ReactNode
  /** Desktop: let grocery sections flow into two columns on wide screens. */
  columns?: boolean
}

const EMPTY = {
  groceries: { title: 'Nothing to buy', hint: 'Add milk, eggs, bread…' },
  todos: { title: 'All clear', hint: 'Add a task like “call plumber”.' },
}

/** The items of one list: grocery sections or to-dos, then the collapsed Done area. */
export function ListBody({ kind, grouped, renderRow, columns = false }: Props) {
  const [showDone, setShowDone] = usePersistentState<'0' | '1'>(`showDone:${kind}`, '0')
  const done = kind === 'groceries' ? grouped.groceriesDone : grouped.todosDone
  const isEmpty = kind === 'groceries' ? grouped.groceries.length === 0 : grouped.todos.length === 0

  return (
    <>
      {isEmpty ? (
        <p className="py-10 text-center text-muted-foreground">
          <strong className="block font-semibold text-foreground/80">{EMPTY[kind].title}</strong>
          {EMPTY[kind].hint}
        </p>
      ) : kind === 'groceries' ? (
        <div className={cn(columns && 'min-[1200px]:columns-2 min-[1200px]:gap-10')}>
          {grouped.groceries.map(({ section, items }) => (
            <section key={section} aria-label={section} className="mt-5 break-inside-avoid first:mt-1">
              <h3 className="flex items-baseline justify-between border-b border-input pb-1.5 text-[13px] font-semibold text-muted-foreground">
                {section}
                <span className="font-medium tabular-nums">{items.length}</span>
              </h3>
              <ul>{items.map(renderRow)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul>{grouped.todos.map(renderRow)}</ul>
      )}

      {done.length > 0 && (
        <Collapsible open={showDone === '1'} onOpenChange={(open) => setShowDone(open ? '1' : '0')} className="mt-5">
          <CollapsibleTrigger className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className={cn('size-4 transition-transform', showDone === '1' && 'rotate-90')} />
            Done <span className="tabular-nums">{done.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul>{done.map(renderRow)}</ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  )
}

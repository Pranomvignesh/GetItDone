import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CATEGORY_CHOICES, categoryFromKey, categoryKey } from '../categories'
import { db, getLocal, type Item } from '../db'
import { NO_AUTOFILL } from '../noAutofill'
import { setCategory, updateItem } from '../store'
import { useLive } from '../useLive'
import { DateField } from './DateField'
import { Panel } from './Panel'

interface Props {
  id: string
  /** Bottom drawer on phones, centred dialog on desktop. */
  desktop: boolean
  onClose: () => void
  onDelete: (item: Item) => void
}

export function ItemEditor({ id, desktop, onClose, onDelete }: Props) {
  // Read live so changes (here or synced from another device) show straight away.
  const item = useLive(() => db.items.get(id), [id])
  const pushOn = useLive(() => getLocal<boolean>('pushEnabled'), [])
  const [name, setName] = useState<string | null>(null)

  const draft = name ?? item?.name ?? ''

  async function saveName() {
    const trimmed = draft.trim()
    if (item && trimmed && trimmed !== item.name) await updateItem(item.id, { name: trimmed })
    setName(null)
  }

  async function onOpenChange(open: boolean) {
    if (open) return
    await saveName()
    onClose()
  }

  return (
    <Panel open onOpenChange={onOpenChange} title="Edit item" description="Rename, recategorize, set a deadline or reminder, or delete this item." desktop={desktop}>
      {item && (
        <div className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              value={draft}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              enterKeyHint="done"
              {...NO_AUTOFILL}
              className="h-11 bg-card text-base shadow-none md:text-sm"
            />
          </div>

          <div className="grid gap-2">
            <Label id="item-category">Category</Label>
            <ToggleGroup
              type="single"
              aria-labelledby="item-category"
              value={categoryKey(item)}
              // Ignore deselect (empty value): an item always has a category.
              onValueChange={(key) => key && setCategory({ ...item, name: draft.trim() || item.name }, categoryFromKey(key))}
              className="flex-wrap justify-start gap-1.5"
            >
              {CATEGORY_CHOICES.map((c) => {
                const key = categoryKey(c)
                return (
                  <ToggleGroupItem
                    key={key}
                    value={key}
                    className="h-9 rounded-md border border-input bg-card px-3 font-normal data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground"
                  >
                    {key}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
          </div>

          <DateField id="item-deadline" label="Deadline" value={item.deadlineAt} onChange={(deadlineAt) => updateItem(item.id, { deadlineAt })} />
          <DateField
            id="item-reminder"
            label="Reminder"
            value={item.remindAt}
            onChange={(remindAt) => updateItem(item.id, { remindAt })}
            hint={item.remindAt && !pushOn ? 'Turn on notifications in Settings to get this reminder.' : undefined}
          />

          <Button
            variant="outline"
            className="h-11 gap-2 bg-transparent font-semibold text-destructive shadow-none hover:border-destructive hover:bg-transparent hover:text-destructive"
            onClick={() => {
              onDelete(item)
              onClose()
            }}
          >
            <Trash2 className="size-4" />
            Delete item
          </Button>
        </div>
      )}
    </Panel>
  )
}

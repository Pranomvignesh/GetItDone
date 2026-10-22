import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CATEGORY_CHOICES, categoryFromKey, categoryKey } from '../categories'
import { db, type Item } from '../db'
import { setCategory, updateItem } from '../store'
import { NO_AUTOFILL } from '../noAutofill'
import { useLive } from '../useLive'

interface Props {
  id: string | null
  /** Bottom drawer on phones, centred dialog on desktop. */
  desktop: boolean
  onClose: () => void
  onDelete: (item: Item) => void
}

export function ItemEditor({ id, desktop, onClose, onDelete }: Props) {
  // Read live so the selected category reflects a change straight away.
  const item = useLive(() => (id ? db.items.get(id) : Promise.resolve(undefined)), [id])
  const [name, setName] = useState<string | null>(null)
  const open = id !== null

  const draft = name ?? item?.name ?? ''

  async function saveName() {
    const trimmed = draft.trim()
    if (item && trimmed && trimmed !== item.name) await updateItem(item.id, { name: trimmed })
    setName(null)
  }

  async function onOpenChange(next: boolean) {
    if (next) return
    await saveName()
    onClose()
  }

  const body = item && (
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
  )

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md gap-5 rounded-xl">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
            <DialogDescription className="sr-only">Rename, recategorize or delete this item.</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-xl px-safe pb-safe">
          <DrawerHeader className="px-0 pb-5 pt-3 text-left">
            <DrawerTitle>Edit item</DrawerTitle>
            <DrawerDescription className="sr-only">Rename, recategorize or delete this item.</DrawerDescription>
          </DrawerHeader>
          <div className="pb-6">{body}</div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

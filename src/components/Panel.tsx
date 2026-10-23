import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Read by screen readers only. */
  description: string
  /** Bottom drawer on phones, centred dialog on desktop. */
  desktop: boolean
  children: ReactNode
}

export function Panel({ open, onOpenChange, title, description, desktop, children }: Props) {
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85dvh] max-w-md gap-5 overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{description}</DialogDescription>
          </DialogHeader>
          {/* min-w-0 lets long values (links, hashes) truncate instead of widening the dialog. */}
          <div className="min-w-0">{children}</div>
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-xl overflow-y-auto px-safe pb-safe">
          <DrawerHeader className="px-0 pb-5 pt-3 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="sr-only">{description}</DrawerDescription>
          </DrawerHeader>
          <div className="min-w-0 pb-6">{children}</div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

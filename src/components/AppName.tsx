import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** App name with a small version of the app icon (green square, white tick). */
export function AppName({ className, as: Tag = 'h1' }: { className?: string; as?: 'h1' | 'p' }) {
  return (
    <Tag className={cn('flex items-center gap-2.5 text-2xl font-bold tracking-tight', className)}>
      <span aria-hidden className="grid size-[34px] place-items-center rounded-lg bg-brand text-brand-foreground shadow-xs">
        <Check className="size-[22px]" strokeWidth={3} />
      </span>
      Get It Done
    </Tag>
  )
}

import { X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { fromInputValue, presets, shortLabel, toInputValue } from '../dates'

interface Props {
  id: string
  label: string
  value: number | null
  onChange: (value: number | null) => void
  hint?: string
}

/** Optional date and time with quick presets (FR3): Today 6pm, Tomorrow 9am, This weekend, Pick date. */
export function DateField({ id, label, value, onChange, hint }: Props) {
  const [picking, setPicking] = useState(false)
  const now = Date.now()

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={picking ? id : undefined}>{label}</Label>
        {value !== null && (
          <span className="flex items-center gap-1 text-sm">
            <span className={cn(value < now && 'text-destructive')}>{shortLabel(value, now)}</span>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => onChange(null)} aria-label={`Clear ${label.toLowerCase()}`}>
              <X className="size-4" />
            </Button>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets(now).map((p) => (
          <Button
            key={p.label}
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-9 bg-card font-normal shadow-none', value === p.value && 'border-primary bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground')}
            onClick={() => {
              setPicking(false)
              onChange(p.value)
            }}
          >
            {p.label}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" className="h-9 bg-card font-normal shadow-none" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
          Pick date
        </Button>
      </div>
      {picking && (
        <Input
          id={id}
          type="datetime-local"
          className="h-11 bg-card text-base shadow-none md:text-sm"
          value={value ? toInputValue(value) : ''}
          onChange={(e) => onChange(fromInputValue(e.target.value))}
        />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

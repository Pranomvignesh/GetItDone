import { Flag, Pause, Play, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CATEGORY_CHOICES, categoryFromKey, categoryKey } from '../categories'
import { db, type Routine } from '../db'
import { NO_AUTOFILL } from '../noAutofill'
import { describeSchedule, parseRoutine, scheduleText } from '../routine'
import { updateRoutine } from '../store'
import { useLive } from '../useLive'
import type { Priority } from '../when'
import { Panel } from './Panel'

interface Props {
  id: string
  desktop: boolean
  onClose: () => void
  onDelete: (routine: Routine) => void
}

const TOGGLE_ITEM =
  'h-9 rounded-md border border-input bg-card px-3 font-normal data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground'

export function RoutineEditor({ id, desktop, onClose, onDelete }: Props) {
  const routine = useLive(() => db.routines.get(id), [id])
  const [name, setName] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<string | null>(null)

  const nameDraft = name ?? routine?.name ?? ''
  const scheduleDraft = schedule ?? (routine ? scheduleText(routine.schedule) : '')
  // The schedule is edited as text and read with the same rules as the add bar.
  const parsed = useMemo(() => (schedule === null ? null : parseRoutine(`x ${schedule}`, Date.now())), [schedule])

  async function save() {
    if (!routine) return
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== routine.name) await updateRoutine(routine.id, { name: trimmed })
    if (parsed && scheduleText(parsed.schedule) !== scheduleText(routine.schedule)) await updateRoutine(routine.id, { schedule: parsed.schedule })
    setName(null)
    setSchedule(null)
  }

  async function onOpenChange(open: boolean) {
    if (open) return
    await save()
    onClose()
  }

  return (
    <Panel open onOpenChange={onOpenChange} title="Edit routine" description="Rename, reschedule, pause or delete this routine." desktop={desktop}>
      {routine && (
        <div className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="routine-name">Name</Label>
            <Input
              id="routine-name"
              value={nameDraft}
              onChange={(e) => setName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              enterKeyHint="done"
              {...NO_AUTOFILL}
              className="h-11 bg-card text-base shadow-none md:text-sm"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="routine-schedule">Schedule</Label>
            <Input
              id="routine-schedule"
              value={scheduleDraft}
              onChange={(e) => setSchedule(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              enterKeyHint="done"
              {...NO_AUTOFILL}
              aria-describedby="routine-schedule-help"
              aria-invalid={schedule !== null && !parsed}
              className="h-11 bg-card text-base shadow-none md:text-sm"
            />
            <p id="routine-schedule-help" className={schedule !== null && !parsed ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
              {schedule !== null && !parsed
                ? 'Not understood yet. Try “every monday at 7am” or “every month on the 1st sunday at 10am”.'
                : describeSchedule(parsed?.schedule ?? routine.schedule)}
            </p>
          </div>

          <div className="grid gap-2">
            <Label id="routine-category">Category</Label>
            <ToggleGroup
              type="single"
              aria-labelledby="routine-category"
              value={categoryKey(routine)}
              onValueChange={(key) => {
                if (!key) return
                const c = categoryFromKey(key)
                void updateRoutine(routine.id, { type: c.type, section: c.section })
              }}
              className="flex-wrap justify-start gap-1.5"
            >
              {CATEGORY_CHOICES.map((c) => (
                <ToggleGroupItem key={categoryKey(c)} value={categoryKey(c)} className={TOGGLE_ITEM}>
                  {categoryKey(c)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="grid gap-2">
            <Label id="routine-priority">Priority</Label>
            <ToggleGroup
              type="single"
              aria-labelledby="routine-priority"
              value={routine.priority ?? 'normal'}
              onValueChange={(v) => v && updateRoutine(routine.id, { priority: v === 'normal' ? undefined : (v as Priority) })}
              className="justify-start gap-1.5"
            >
              {(['low', 'normal', 'high'] as const).map((p) => (
                <ToggleGroupItem key={p} value={p} className={`${TOGGLE_ITEM} capitalize`}>
                  {p === 'high' && <Flag className="size-3.5" />}
                  {p}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-11 gap-2 bg-transparent font-semibold shadow-none"
              onClick={() => updateRoutine(routine.id, { paused: !routine.paused })}
            >
              {routine.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {routine.paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="outline"
              className="h-11 gap-2 bg-transparent font-semibold text-destructive shadow-none hover:border-destructive hover:bg-transparent hover:text-destructive"
              onClick={() => {
                onDelete(routine)
                onClose()
              }}
            >
              <Trash2 className="size-4" />
              Delete routine
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">To-dos it already created stay on your list.</p>
        </div>
      )}
    </Panel>
  )
}

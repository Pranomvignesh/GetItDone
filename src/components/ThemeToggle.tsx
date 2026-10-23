import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Theme } from '../theme'

interface Props {
  theme: Theme
  onToggle: () => void
}

/** Switches between light and dark; the icon shows what a tap will do. */
export function ThemeToggle({ theme, onToggle }: Props) {
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  const Icon = theme === 'dark' ? Sun : Moon
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-10 text-muted-foreground hover:text-foreground"
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      <Icon className="size-5" />
    </Button>
  )
}

import { useEffect } from 'react'
import { usePersistentState } from './usePersistentState'

export type Theme = 'light' | 'dark'
const THEMES: readonly Theme[] = ['light', 'dark']

/** Browser/status-bar colour for each theme; keep in sync with --background in styles.css. */
const THEME_COLOR: Record<Theme, string> = { light: '#f7faf8', dark: '#0f1413' }

/**
 * Light or dark, saved per device once the user toggles it. Until then it starts
 * from the device setting. index.html applies the same rule before first paint.
 */
export function useTheme() {
  const deviceTheme: Theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  const [theme, setTheme] = usePersistentState<Theme>('theme', deviceTheme, THEMES)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = THEME_COLOR[theme]
    }
  }, [theme])

  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}

'use client'

import { useSyncExternalStore, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * useIsMounted
 *
 * Client-only flag via useSyncExternalStore — returns `false` on the server
 * and during hydration, `true` afterwards. This avoids the React 19
 * "set-state-in-effect" warning that the classic `useEffect + setMounted`
 * pattern triggers, and lets us render a stable placeholder icon until the
 * client has resolved the active theme (preventing hydration mismatches).
 */
function useIsMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,  // client snapshot
    () => false, // server snapshot
  )
}

/**
 * ThemeToggle
 *
 * Toggles the global color theme between light and dark. Uses `next-themes`
 * with `attribute="class"` so Tailwind's `dark:` variant applies the `.dark`
 * palette defined in globals.css.
 *
 * Renders a stable placeholder (Moon) icon until mounted to avoid hydration
 * mismatches — next-themes only resolves the persisted theme on the client.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useIsMounted()
  // Local click state lets the icon flip immediately on click even before
  // next-themes has re-rendered (perceived performance).
  const [forced, setForced] = useState<'light' | 'dark' | null>(null)

  const effective = forced ?? theme
  const isDark = effective === 'dark'

  const handleToggle = () => {
    const next = isDark ? 'light' : 'dark'
    setForced(next)
    setTheme(next)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      aria-label={isDark ? 'تبديل إلى الوضع الفاتح' : 'تبديل إلى الوضع الداكن'}
      title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
      className="text-muted-foreground hover:text-foreground"
    >
      {mounted && isDark ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  )
}

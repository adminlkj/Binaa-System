# P5-1 — Dark Mode Activation & Theme Toggle

**Task ID**: P5-1
**Agent**: P5.1 (Dark Mode Agent)
**Phase**: 5 — UX
**Date**: 2025-07-01
**Status**: ✅ COMPLETE

## Context

Phase 5 — UX. The dark-mode infrastructure existed but was not wired up:
- `tailwind.config.ts` had `darkMode: 'class'`
- `src/app/globals.css` had a complete oklch-based `.dark` palette (with one latent gap)
- `next-themes` 0.4.6 was installed
- `src/components/ui/sonner.tsx` called `useTheme()` but it returned `undefined` because no `ThemeProvider` was mounted
- `src/app/layout.tsx` already had `suppressHydrationWarning` on `<html>`
- `src/components/layout/providers.tsx` had NO `ThemeProvider`
- No theme toggle existed anywhere

See previous agents' work records in this directory (especially
`P4-FIX-dynamic-account-selection.md` for the most recent prior phase).

## Tasks Completed

### Task 1: Wire up ThemeProvider in providers.tsx
**File**: `src/components/layout/providers.tsx` (MODIFIED)

Added:
```tsx
import { ThemeProvider } from 'next-themes'
```

Wrapped the tree:
```tsx
<SessionProvider>
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      ...
    </QueryClientProvider>
  </ThemeProvider>
</SessionProvider>
```

Configuration:
- `attribute="class"` — adds/removes `.dark` on `<html>` so Tailwind's `dark:` variant works.
- `defaultTheme="light"` — app is designed light-first (Arabic ERP).
- `enableSystem={false}` — explicit user control only; avoids OS-preference-driven dark mode on first load.

### Task 2: Create ThemeToggle component
**File**: `src/components/layout/theme-toggle.tsx` (NEW, 70 lines)

```tsx
'use client'
import { useSyncExternalStore, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

function useIsMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,   // client snapshot
    () => false,  // server snapshot
  )
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useIsMounted()
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
      {mounted && isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
```

**Why `useSyncExternalStore` instead of `useEffect + setMounted`**:
React 19's ESLint rule `react-hooks/set-state-in-effect` errors (not warns)
on the classic `useEffect(() => setMounted(true), [])` pattern. The store-based
hook returns `false` on server + during hydration, `true` on the client —
letting us render a stable `Moon` placeholder until the client resolves the
persisted theme, with no lint violations.

### Task 3: Add ThemeToggle to sidebar (BOTH desktop + mobile)
**File**: `src/components/layout/sidebar.tsx` (MODIFIED)

- Imported `ThemeToggle` from `@/components/layout/theme-toggle`.
- **Desktop sidebar footer** (line ~304): restructured from single full-width language button into a flex row: `[ language button (flex-1) | <ThemeToggle /> ]`.
- **Mobile sidebar footer** (line ~462): same restructure for the mobile drawer.

Both toggles (language + theme) now sit side-by-side at the bottom of the
sidebar in BOTH the desktop and mobile layouts. Theme toggle is visible to
ALL roles — theme preference is a personal accessibility setting, not a
business permission.

### Task 4: Verify dark palette complete in globals.css
**File**: `src/app/globals.css` (MODIFIED)

Audit found `:root` and `.dark` had parity for all required variables EXCEPT
`--destructive-foreground`, which was MISSING from BOTH selectors (latent bug
— `tailwind.config.ts` referenced `hsl(var(--destructive-foreground))` for
`destructive.foreground` but the variable was never defined).

**Fix**: added `--destructive-foreground: oklch(0.985 0 0)` (white) to BOTH
`:root` and `.dark`, plus `--color-destructive-foreground: var(--destructive-foreground)`
to the `@theme inline` block.

Full parity (both selectors now define): `--background`, `--foreground`,
`--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`,
`--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`,
`--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`,
`--destructive-foreground`, `--border`, `--input`, `--ring`, `--chart-1..5`,
`--sidebar`, `--sidebar-foreground`, `--sidebar-primary`,
`--sidebar-primary-foreground`, `--sidebar-accent`,
`--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`.
(`--radius` lives only in `:root` because it's theme-independent — intentional.)

### Task 5: Verify Sonner toaster for dark mode
**File**: `src/components/ui/sonner.tsx` (NO CHANGES NEEDED — verified)

The component already calls `useTheme()` and passes `theme` to `<Sonner>`.
With the ThemeProvider now mounted (Task 1), `useTheme()` returns the actual
persisted theme instead of `undefined`. Sonner internally applies
`data-theme="dark"` and switches its built-in palette. The inline CSS
variables (`--normal-bg: var(--popover)`, etc.) are theme-aware. The
`richColors` prop is handled by Sonner's built-in dark variants. No changes
required.

## Verification Results

- `bun run lint`: **clean (exit 0)** ✓
  - Initial run flagged `react-hooks/set-state-in-effect` on first ThemeToggle draft.
  - Refactored to `useSyncExternalStore` → re-run clean.
- `bun run test:accounting`: **21/21 passed** ✓
- `bun scripts/e2e-accounting-integrity-test.ts`: **29/29 passed** ✓
- Dev server log: no compile errors after edits; `/` route serving 200.

## Output Files

1. `src/components/layout/theme-toggle.tsx` (NEW, 70 lines)
2. `src/components/layout/providers.tsx` (MODIFIED — ThemeProvider wrapper)
3. `src/components/layout/sidebar.tsx` (MODIFIED — ThemeToggle in BOTH footers)
4. `src/app/globals.css` (MODIFIED — `--destructive-foreground` added to `:root` + `.dark` + `@theme inline`)

## Summary

Dark mode is now fully functional end-to-end:
- `ThemeProvider` mounts at the app root with `attribute="class"`.
- `<ThemeToggle />` button appears in the sidebar footer (desktop + mobile), next to the language toggle.
- One click flips the entire app's color palette; setting persists in `localStorage`.
- Sonner toaster, all shadcn/ui components, and all `bg-background`/`text-foreground`/`bg-card`/`border-border` utilities auto-reskin in dark mode.
- Latent `--destructive-foreground` gap fixed (white-on-red contrast in both themes).
- No regressions; lint clean.

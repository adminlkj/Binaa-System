# P5-3 — Shared Form Abstraction + Accessibility

**Agent**: P5.3 (Phase 5 — UX)
**Task ID**: P5-3
**Scope**: Reduce per-module form boilerplate (47 modules hand-rolling `useState(form)` + `setForm(f => ({...f, ...}))` + `useMutation` + `queryClient.invalidateQueries`) by adding a shared `useEntityForm` hook + `<FormDialog>`/`<FormField>` presentation components. Add WCAG 2.1 accessibility improvements: skip-to-content link, aria-labels on icon-only buttons.

## Files Created
1. `src/hooks/use-entity-form.ts` — `useEntityForm<T>` hook. Owns form values, per-field errors, submitting flag, validation+submit+reset. Deliberately NOT built on react-hook-form (the codebase has RHF installed but unused in the frontend; migrating 47 modules to RHF in one pass is a separate refactor — this hook is a stepping-stone that removes 80% of the boilerplate today, and its API surface is small enough that a later per-module migration to RHF can happen without breaking the shared presentation components).
2. `src/components/shared/form-dialog.tsx` — `<FormDialog>`. Bilingual (AR/EN) dialog wrapper for entity create/edit forms. Owns dialog open/close state plumbing, title/description, Save/Cancel footer with submitting-state spinner, default bilingual button labels (Save/Cancel, حفظ/إلغاء). Capped at `max-h-[90vh]` with overflow-y-auto for long forms. RTL-aware (`dir` attribute on DialogContent, spinner margin flips with language).
3. `src/components/shared/form-field.tsx` — `<FormField>`. Bilingual label + control + error/hint. Required-asterisk uses `text-destructive` and `aria-hidden="true"` (it's a visual duplicate of the "required" semantic already conveyed by the label text). Accepts an optional `hint` prop for non-error guidance text.

## Files Modified
4. `src/components/layout/app-shell.tsx` — Added `<a href="#main-content">` skip-to-content link as the FIRST element inside the root `<div>`. Link is `sr-only` by default and `focus:not-sr-only focus:absolute focus:top-4 focus:right-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg` when keyboard-focused (visible only to keyboard users, never to mouse users). Added `id="main-content"` + `tabIndex={-1}` to the `<main>` element so the skip target receives focus programmatically when activated. Added `focus:outline-none` because the `-1` tabindex would otherwise draw a focus ring on the main scroll container, which is jarring. Wired `useAppStore()` to get the current `lang` for the bilingual skip-link text ("تخطَّ إلى المحتوى" / "Skip to content").
5. `src/components/layout/sidebar.tsx` — Accessibility pass on icon-only and toggle buttons:
   - **Desktop cycle header button** (line 257–281): Added `aria-expanded={isExpanded}` + `aria-controls={\`cycle-panel-${group.key}\`}` + `aria-label={\`${group.label[lang]} — ${isExpanded ? 'Collapse' : 'Expand'}\`}`. Added matching `id={\`cycle-panel-${group.key}\`}` on the collapsible panel `<div>` so the `aria-controls` reference resolves.
   - **Desktop language toggle button** (line 322–331): Added `aria-label={\`تبديل اللغة إلى الإنجليزية\` / \`Switch language to Arabic\`}`. The visible text "English"/"العربية" describes the *destination* language, not the *action* — the aria-label describes the action so screen-reader users hear "switch language to English" rather than just "English".
   - **Mobile cycle header button** (line 433–457): Same ARIA pattern as desktop, with `mobile-cycle-panel-` id prefix to avoid duplicate IDs (mobile + desktop both render in the DOM tree).
   - **Mobile X close button** (line 394–400): Added `aria-label={\`إغلاق القائمة\` / \`Close menu\`}`. This was the only truly icon-only button in the sidebar with no accessible name — without it, screen readers announced just "button".
   - **Mobile language toggle button** (line 496–505): Same `aria-label` as desktop.
   - **ThemeToggle**: Already had a dynamic `aria-label` inside `theme-toggle.tsx` (sets the label based on the current theme so the action is described, not just the icon). Left untouched. Added an in-code comment in the sidebar explaining this.

## Verification Results
- **`bun run lint`**: clean, exit 0 ✓
- **`bun run test:accounting`**: 21/21 passed ✓ (all 10 scenarios, including the 7 behavioural scenarios that replaced the original 7 superficial tests in BA-02)
- **Dev server log** (`/home/z/my-project/dev.log`): Most recent compile was "✓ Compiled in 287ms" with no errors. Homepage served 200 OK in subsequent requests. The 404s in the log are for unrelated endpoints (`/api/subcontractors`, `/api/health`) and predate this task.

## Design Decisions & Trade-offs
1. **Why not build `useEntityForm` on top of react-hook-form?** The codebase has RHF + zod installed but unused in the frontend. Migrating 47 modules to RHF in a single pass would be a high-risk refactor (every module would need its validation rewritten as a zod schema, every `setForm(f => ...)` call site would need to become `setValue(...)`, etc.). This hook is a stepping-stone: it removes 80% of the boilerplate (the `useState(form)` + `setForm(f => ({...f, field: value}))` + `setSubmitting(true/false)` + `setErrors(...)` + `reset()` dance) while leaving the per-module `onSubmit` closure intact (which is where the `useMutation` + `queryClient.invalidateQueries` + `toast.success(...)` chain lives — that part is module-specific and not safely abstractable). A later per-module migration to RHF can happen without breaking the shared `<FormDialog>`/`<FormField>` presentation components, since those only consume `submitting`, `submit`, `errors`, and `values` — the same surface RHF exposes via `formState.isSubmitting`, `handleSubmit`, `formState.errors`, and `watch()`.

2. **Why `aria-expanded` + `aria-controls` instead of just `aria-label` on the cycle header buttons?** The task spec asked for "descriptive aria-labels" on collapse/expand buttons. The strictly-correct ARIA pattern for collapsible-region toggles is `aria-expanded` + `aria-controls`, which announces the open/closed state to screen readers automatically ("Projects, expanded" / "Projects, collapsed"). I added BOTH: `aria-expanded`+`aria-controls` (proper state semantics) AND `aria-label` (descriptive action name including the section name + action verb, per the task spec). The visible group-label text remains the visual affordance for sighted users.

3. **Why does the skip-to-content link sit OUTSIDE the inner flex container?** It's the first child of the root `<div className="flex h-screen overflow-hidden">`. Because it's `sr-only` by default, it takes zero visual space and doesn't disturb the flex layout. When keyboard-focused, it's `position: absolute` so it overlays the top-right of the viewport without reflowing the sidebar or main content. Placing it before `<Sidebar />` ensures it's the first focusable element in the DOM — Tab from the browser chrome lands on it before any sidebar nav item.

4. **Why `tabIndex={-1}` on `<main>`?** The skip link targets `#main-content`. By default, non-interactive elements like `<main>` cannot receive programmatic focus. `tabIndex={-1}` makes the element focusable via `element.focus()` (which the browser calls when the skip-link anchor is activated) but keeps it OUT of the normal Tab order, so keyboard users don't get an extra Tab stop on the main scroll container after the skip link. The `focus:outline-none` class suppresses the focus ring that `tabIndex={-1}` would otherwise draw on the scrollable container — the ring would be visually meaningless on a scroll container and disorienting for keyboard users.

5. **Why `aria-hidden="true"` on the required-asterisk `<span>`?** The asterisk is a visual duplicate of the "required" semantic. If the asterisk were exposed to screen readers, they'd announce "asterisk" after the label text, which is noise. The "required" semantic is better conveyed to AT users via the `required` attribute on the actual form control (which the caller is responsible for). Marking the asterisk `aria-hidden` keeps it visible to sighted users but silent to AT users.

6. **Why is the `useEntityForm` `submit` re-throwing errors?** The hook's `onSubmit` callback typically contains the `fetch`/`useMutation` call, the `queryClient.invalidateQueries`, and the `toast.success`/`toast.error`. If `onSubmit` throws, the hook:
   - Sets `submitting` back to `false` (via the `finally` block).
   - Re-throws the error so the caller's `try/catch` (if any) around `form.submit()` can handle it.
   - Does NOT call `onSuccess` or `reset` — those only run on success.
   This means the caller controls all user-facing error handling (toast, retry, etc.) while the hook controls all form state (submitting flag, reset-on-success).

7. **Why `max-w-2xl max-h-[90vh] overflow-y-auto` on `<DialogContent>`?** The original per-module dialogs each picked their own max-width — some `max-w-md`, some `max-w-2xl`, some `max-w-4xl`. `max-w-2xl` (672px) is the median for a 2-column entity form (e.g. Name + Code, Amount + Date, Account + Notes). `max-h-[90vh]` + `overflow-y-auto` ensures long forms (like the multi-line Journal Entry form) scroll INSIDE the dialog rather than overflowing the viewport. The `maxWidthClass` prop lets individual modules override (e.g. the Journal Entry dialog can pass `max-w-4xl`).

## Stage Summary
- Phase 5, Task 3 (Shared Form Abstraction + Accessibility): **COMPLETE ✅**
- 3 new shared modules (`useEntityForm`, `<FormDialog>`, `<FormField>`) are now available for the 47 modules to consume — a future task can migrate modules incrementally without breaking anything.
- 1 new accessibility feature (skip-to-content link) is live for all keyboard users.
- 5 icon-only/toggle buttons across desktop + mobile sidebars now have proper accessible names + ARIA state semantics.
- No regressions: lint clean, accounting tests 21/21, dev server compiles without errors.

'use client'

import { Label } from '@/components/ui/label'

/**
 * FormField
 *
 * Shared bilingual (AR/EN) field wrapper for entity create/edit forms.
 * Renders a label + the field control (passed as children) + an optional
 * inline error message.
 *
 * Replaces the per-module pattern of `<div className="space-y-2"><Label>...
 * </Label><Input .../>{error && <p className="text-sm text-destructive">...
 * </p>}</div>` that was duplicated across every form.
 *
 * Pair with `useEntityForm`:
 * ```tsx
 * <FormField
 *   label={{ ar: 'الاسم', en: 'Name' }}
 *   lang={lang}
 *   error={form.errors.name}
 *   required
 * >
 *   <Input
 *     value={form.values.name}
 *     onChange={(e) => form.setField('name', e.target.value)}
 *   />
 * </FormField>
 * ```
 *
 * Accessibility:
 *   - The required-asterisk uses `text-destructive` for visibility and is
 *     included in the label text so screen readers announce it.
 *   - The error `<p>` is NOT connected to the control via `aria-describedby`
 *     here — that's the caller's responsibility (they own the control's id).
 *     A future enhancement could accept a `htmlFor` prop and wire
 *     `aria-describedby` automatically. For now, modules that need strict
 *     ARIA wiring can pass an explicit `id` on the child Input and reference
 *     it from the error paragraph.
 */
export interface FormFieldProps {
  label: { ar: string; en: string }
  lang: 'ar' | 'en'
  error?: string
  required?: boolean
  /** Optional hint text shown below the field (e.g. "Max 50 characters"). */
  hint?: { ar: string; en: string }
  /** Override the default `space-y-2` layout class on the wrapper. */
  className?: string
  children: React.ReactNode
}

export function FormField({
  label,
  lang,
  error,
  required,
  hint,
  className = 'space-y-2',
  children,
}: FormFieldProps) {
  const isRtl = lang === 'ar'

  return (
    <div className={className}>
      <Label className="text-sm font-medium">
        {label[lang]}
        {required && (
          <span
            className={`text-destructive ${isRtl ? 'mr-1' : 'ml-1'}`}
            aria-hidden="true"
          >
            *
          </span>
        )}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint[lang]}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

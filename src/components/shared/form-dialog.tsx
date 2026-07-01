'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

/**
 * FormDialog
 *
 * Shared bilingual (AR/EN) dialog wrapper for entity create/edit forms.
 * Replaces the per-module `<Dialog><DialogContent>...boilerplate...</DialogContent></Dialog>`
 * pattern that was duplicated 47 times.
 *
 * Owns:
 *   - Dialog open/close state plumbing (`open` / `onOpenChange`).
 *   - Title + optional description (bilingual `{ar, en}`).
 *   - Submit/Cancel footer with submitting-state spinner.
 *   - Default bilingual button labels (Save/Cancel, حفظ/إلغاء) — overridable.
 *
 * Does NOT own:
 *   - Form state — pass `submitting` from `useEntityForm().submitting` and
 *     `onSubmit={form.submit}`.
 *   - Field rendering — children are rendered inside a `space-y-4 py-4`
 *     container; pair each field with `<FormField>`.
 *
 * Accessibility:
 *   - `Dialog` from Radix handles focus trap, ESC-to-close, and ARIA roles.
 *   - The Save button shows a `Loader2` spinner + stays disabled while
 *     `submitting` is true (prevents double-submit).
 *   - The dialog content is capped at `max-h-[90vh]` with overflow-y-auto so
 *     long forms stay scrollable inside the dialog (not the page).
 */
export interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: { ar: string; en: string }
  description?: { ar: string; en: string }
  lang: 'ar' | 'en'
  submitting?: boolean
  onSubmit: () => void
  submitLabel?: { ar: string; en: string }
  cancelLabel?: { ar: string; en: string }
  /** Max width class for the dialog content. Defaults to `max-w-2xl`. */
  maxWidthClass?: string
  children: React.ReactNode
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  lang,
  submitting,
  onSubmit,
  submitLabel,
  cancelLabel,
  maxWidthClass = 'max-w-2xl',
  children,
}: FormDialogProps) {
  const isRtl = lang === 'ar'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${maxWidthClass} max-h-[90vh] overflow-y-auto`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <DialogHeader>
          <DialogTitle>{title[lang]}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description[lang]}</p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4">{children}</div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {cancelLabel?.[lang] || (lang === 'ar' ? 'إلغاء' : 'Cancel')}
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting && (
              <Loader2
                className={`size-4 animate-spin ${isRtl ? 'mr-2' : 'ml-2'}`}
              />
            )}
            {submitLabel?.[lang] || (lang === 'ar' ? 'حفظ' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

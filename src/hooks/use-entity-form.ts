'use client'

import { useState, useCallback } from 'react'

/**
 * useEntityForm
 *
 * Shared form-state abstraction for the 47 ERP modules. Replaces the
 * hand-rolled `useState(form)` + `setForm(f => ({...f, field: value}))` +
 * `useMutation` + `queryClient.invalidateQueries` boilerplate that was
 * copy-pasted across every module.
 *
 * The hook owns four concerns that every module was duplicating:
 *   1. Form values state (single source of truth).
 *   2. Per-field error state (cleared automatically when the field is edited).
 *   3. Submitting flag (drives the `<FormDialog>` Save button spinner).
 *   4. Synchronous validation + async submission + reset-on-success.
 *
 * The hook does NOT own:
 *   - Toast notifications — the caller's `onSubmit` is responsible for
 *     showing success/error toasts (it has access to the queryClient and
 *     sonner already).
 *   - Cache invalidation — same reason. The caller's `onSuccess` callback
 *     (passed to `onSubmit`'s closure) typically does
 *     `queryClient.invalidateQueries({ queryKey: [...] })`.
 *
 * Usage:
 * ```tsx
 * const form = useEntityForm({
 *   defaultValues: { name: '', code: '' },
 *   validate: (v) => !v.name ? { name: 'Name is required' } : null,
 *   onSubmit: async (v) => {
 *     await fetch('/api/clients', { method: 'POST', body: JSON.stringify(v) })
 *     queryClient.invalidateQueries({ queryKey: ['clients'] })
 *     toast.success('Created')
 *   },
 * })
 *
 * <FormDialog open={open} onOpenChange={setOpen} submitting={form.submitting}
 *   onSubmit={form.submit} ...>
 *   <FormField label={{ar:'الاسم', en:'Name'}} lang={lang} error={form.errors.name} required>
 *     <Input value={form.values.name} onChange={e => form.setField('name', e.target.value)} />
 *   </FormField>
 * </FormDialog>
 * ```
 *
 * NOTE: This hook deliberately does NOT use react-hook-form. The codebase has
 * RHF installed but unused in the frontend; introducing it across 47 modules
 * in one pass is a separate refactor. This hook is a stepping-stone that
 * removes 80% of the boilerplate today, and its API surface is small enough
 * that a later migration to RHF can be done per-module without breaking the
 * shared `<FormDialog>`/`<FormField>` presentation components.
 */
export interface UseEntityFormOptions<T> {
  defaultValues: T
  onSubmit: (values: T) => Promise<void>
  onSuccess?: () => void
  validate?: (values: T) => Partial<Record<keyof T, string>> | null
}

export function useEntityForm<T extends Record<string, any>>({
  defaultValues,
  onSubmit,
  onSuccess,
  validate,
}: UseEntityFormOptions<T>) {
  const [values, setValues] = useState<T>(defaultValues)
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({})
  const [submitting, setSubmitting] = useState(false)

  const setField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues(prev => ({ ...prev, [field]: value }))
    // Clear error for this field — any edit invalidates the previous error.
    setErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }, [])

  const reset = useCallback(() => {
    setValues(defaultValues)
    setErrors({})
  }, [defaultValues])

  const submit = useCallback(async () => {
    if (validate) {
      const validationErrors = validate(values)
      if (validationErrors && Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors)
        return
      }
    }
    setSubmitting(true)
    try {
      await onSubmit(values)
      onSuccess?.()
      reset()
    } catch (e) {
      // Error handling is done by the caller (toast etc.)
      throw e
    } finally {
      setSubmitting(false)
    }
  }, [values, validate, onSubmit, onSuccess, reset])

  return { values, setField, errors, submitting, submit, reset, setValues }
}

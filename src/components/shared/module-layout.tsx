'use client'

import React from 'react'
import { useAppStore, type Lang } from '@/stores/app-store'

/**
 * ModuleLayout - Shared layout wrapper for all modules
 * Provides consistent header, title, and action bar
 */
export function ModuleLayout({
  title,
  subtitle,
  actions,
  children,
}: {
  title: { ar: string; en: string }
  subtitle?: { ar: string; en: string }
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const { lang } = useAppStore()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title[lang]}</h1>
          {subtitle && (
            <p className="text-muted-foreground text-sm mt-1">{subtitle[lang]}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>

      {/* Content */}
      {children}
    </div>
  )
}

/**
 * EmptyState - Placeholder for modules under development
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  lang,
  action,
}: {
  icon: React.ElementType
  title: { ar: string; en: string }
  description: { ar: string; en: string }
  lang: Lang
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted mb-4">
        <Icon className="size-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title[lang]}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4">{description[lang]}</p>
      {action}
    </div>
  )
}

/**
 * StatusBadge - Renders a colored badge based on status
 */
export function StatusBadge({ status, lang }: { status: string; lang: Lang }) {
  const statusConfig: Record<string, { label: { ar: string; en: string }; cls: string }> = {
    DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, cls: 'bg-yellow-100 text-yellow-800' },
    ACTIVE: { label: { ar: 'نشط', en: 'Active' }, cls: 'bg-emerald-100 text-emerald-800' },
    APPROVED: { label: { ar: 'معتمد', en: 'Approved' }, cls: 'bg-emerald-100 text-emerald-800' },
    SUBMITTED: { label: { ar: 'مُرسل', en: 'Submitted' }, cls: 'bg-blue-100 text-blue-800' },
    INVOICED: { label: { ar: 'مفوتر', en: 'Invoiced' }, cls: 'bg-emerald-100 text-emerald-800' },
    PAID: { label: { ar: 'مدفوع', en: 'Paid' }, cls: 'bg-emerald-100 text-emerald-800' },
    PARTIALLY_PAID: { label: { ar: 'مدفوع جزئياً', en: 'Partially Paid' }, cls: 'bg-yellow-100 text-yellow-800' },
    CANCELLED: { label: { ar: 'ملغي', en: 'Cancelled' }, cls: 'bg-red-100 text-red-800' },
    OVERDUE: { label: { ar: 'متأخر', en: 'Overdue' }, cls: 'bg-red-100 text-red-800' },
    SENT: { label: { ar: 'مُرسل', en: 'Sent' }, cls: 'bg-blue-100 text-blue-800' },
    PENDING: { label: { ar: 'معلق', en: 'Pending' }, cls: 'bg-yellow-100 text-yellow-800' },
    RETURNED: { label: { ar: 'مرتجع', en: 'Returned' }, cls: 'bg-gray-100 text-gray-800' },
    DELIVERED: { label: { ar: 'تم التوصيل', en: 'Delivered' }, cls: 'bg-emerald-100 text-emerald-800' },
    COMPLETED: { label: { ar: 'مكتمل', en: 'Completed' }, cls: 'bg-emerald-100 text-emerald-800' },
    PLANNING: { label: { ar: 'تخطيط', en: 'Planning' }, cls: 'bg-yellow-100 text-yellow-800' },
    ON_HOLD: { label: { ar: 'معلق', en: 'On Hold' }, cls: 'bg-yellow-100 text-yellow-800' },
    FILED: { label: { ar: 'مُقر', en: 'Filed' }, cls: 'bg-emerald-100 text-emerald-800' },
    SETTLED: { label: { ar: 'مُسوى', en: 'Settled' }, cls: 'bg-emerald-100 text-emerald-800' },
    POSTED: { label: { ar: 'مرحّل', en: 'Posted' }, cls: 'bg-emerald-100 text-emerald-800' },
  }

  const config = statusConfig[status] || { label: { ar: status, en: status }, cls: 'bg-gray-100 text-gray-800' }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.cls}`}>
      {config.label[lang]}
    </span>
  )
}

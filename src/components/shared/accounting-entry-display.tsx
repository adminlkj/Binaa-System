'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, ChevronDown, ChevronUp, CircleDot, FileText,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { MoneyDisplay } from '@/components/ui/money-display'

// ============ Types ============
interface JournalEntryLine {
  id: string
  accountCode?: string
  accountId: string
  account: {
    id: string
    code: string
    name: string
    nameAr: string | null
    type: string
  }
  debit: number
  credit: number
  description: string | null
  costCenter: { id: string; code: string; name: string } | null
}

interface JournalEntry {
  id: string
  entryNo: string
  date: string
  description: string | null
  descriptionAr: string | null
  sourceType: string | null
  sourceId: string | null
  status: string
  lines: JournalEntryLine[]
  totalDebit: number
  totalCredit: number
}

// ============ Status Badge ============
const jeStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  POSTED: { label: { ar: 'مرحّل', en: 'Posted' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-yellow-700', bg: 'bg-yellow-100' },
  CANCELLED: { label: { ar: 'ملغى', en: 'Cancelled' }, color: 'text-red-700', bg: 'bg-red-100' },
}

// ============ Source Type Labels ============
const sourceTypeLabels: Record<string, { ar: string; en: string }> = {
  SALES_INVOICE: { ar: 'فاتورة مبيعات', en: 'Sales Invoice' },
  RENTAL_INVOICE: { ar: 'فاتورة تأجير', en: 'Rental Invoice' },
  PURCHASE_INVOICE: { ar: 'فاتورة مشتريات', en: 'Purchase Invoice' },
  SUPPLIER_INVOICE: { ar: 'فاتورة مورد', en: 'Supplier Invoice' },
  EXPENSE: { ar: 'مصروف', en: 'Expense' },
  PETTY_CASH: { ar: 'صندوق نقدی', en: 'Petty Cash' },
  EMPLOYEE_ADVANCE: { ar: 'سلفة موظف', en: 'Employee Advance' },
  SALARY: { ar: 'راتب', en: 'Salary' },
  GOSI: { ar: 'تأمينات اجتماعية', en: 'GOSI' },
  DEPRECIATION: { ar: 'إهلاك', en: 'Depreciation' },
  RENTAL_DEPRECIATION: { ar: 'إهلاك تأجير', en: 'Rental Depreciation' },
  DELIVERY_FEES: { ar: 'رسوم نقل', en: 'Delivery Fees' },
  CONTRACT_ADVANCE: { ar: 'دفعة مقدمة', en: 'Contract Advance' },
  RETENTION: { ar: 'مستقطع', en: 'Retention' },
  ZAKAT: { ar: 'زكاة', en: 'Zakat' },
  END_OF_SERVICE: { ar: 'مكافأة نهاية خدمة', en: 'End of Service' },
  ASSET_DISPOSAL: { ar: 'تصرف في أصل', en: 'Asset Disposal' },
  CLIENT_PAYMENT: { ar: 'تحصيل عميل', en: 'Client Payment' },
  SUPPLIER_PAYMENT: { ar: 'سداد مورد', en: 'Supplier Payment' },
  SUBCONTRACTOR_INVOICE: { ar: 'فاتورة مقاول الباطن', en: 'Subcontractor Invoice' },
  EQUIPMENT_OPERATION: { ar: 'تشغيل معدة', en: 'Equipment Operation' },
  EQUIPMENT_MAINTENANCE: { ar: 'صيانة معدة', en: 'Equipment Maintenance' },
  EQUIPMENT_FUEL: { ar: 'وقود معدة', en: 'Equipment Fuel' },
  PROGRESS_CLAIM: { ar: 'مستخلص', en: 'Progress Claim' },
}

// ============ Component Props ============
export interface AccountingEntryDisplayProps {
  journalEntryId: string | null | undefined
  lang: 'ar' | 'en'
}

// ============ Component ============
export function AccountingEntryDisplay({ journalEntryId, lang }: AccountingEntryDisplayProps) {
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  const [isOpen, setIsOpen] = useState(false)

  const { data: entry, isLoading, isError } = useQuery<JournalEntry>({
    queryKey: ['journal-entry', journalEntryId],
    queryFn: async () => {
      if (!journalEntryId) return null as unknown as JournalEntry
      const res = await fetch(`/api/journal-entries/${journalEntryId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!journalEntryId && isOpen,
  })

  if (!journalEntryId) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CircleDot className="size-3" />
        <span>{t('لا يوجد قيد محاسبي', 'No accounting entry')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-xs h-7 px-2 text-teal-700 hover:text-teal-900 hover:bg-teal-50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <BookOpen className="size-3.5" />
        {t('قيد محاسبي', 'Accounting Entry')}
        {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </Button>

      {isOpen && (
        <Card className="border-teal-200 bg-teal-50/30">
          {isLoading ? (
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="size-4 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
                <span className="text-sm text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</span>
              </div>
            </CardContent>
          ) : isError || !entry ? (
            <CardContent className="p-4">
              <p className="text-sm text-rose-600">{t('خطأ في تحميل القيد', 'Error loading entry')}</p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-teal-600" />
                    <CardTitle className="text-sm font-semibold text-teal-800">
                      {entry.entryNo}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.sourceType && (
                      <Badge variant="outline" className="text-xs border-teal-300 text-teal-700 bg-white">
                        {sourceTypeLabels[entry.sourceType]?.[lang] || entry.sourceType}
                      </Badge>
                    )}
                    {jeStatusConfig[entry.status] && (
                      <Badge className={`${jeStatusConfig[entry.status].bg} ${jeStatusConfig[entry.status].color} border-0 text-xs`}>
                        {jeStatusConfig[entry.status].label[lang]}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-3">
                {/* Entry info */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">{t('التاريخ', 'Date')}:</span>
                    <p className="font-medium">
                      {new Date(entry.date).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                    </p>
                  </div>
                  {(entry.description || entry.descriptionAr) && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">{t('الوصف', 'Description')}:</span>
                      <p className="font-medium">
                        {lang === 'ar' ? (entry.descriptionAr || entry.description) : entry.description}
                      </p>
                    </div>
                  )}
                </div>

                <Separator className="bg-teal-200" />

                {/* Lines table */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right h-8 text-xs">{t('رمز الحساب', 'Code')}</TableHead>
                        <TableHead className="text-right h-8 text-xs">{t('اسم الحساب', 'Account')}</TableHead>
                        <TableHead className="text-right h-8 text-xs">{t('مدين', 'Debit')}</TableHead>
                        <TableHead className="text-right h-8 text-xs">{t('دائن', 'Credit')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entry.lines.map(line => (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono text-xs py-1.5">
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                              {line.account.code}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs py-1.5">
                            {lang === 'ar' ? (line.account.nameAr || line.account.name) : line.account.name}
                          </TableCell>
                          <TableCell className="py-1.5">
                            {line.debit > 0 ? (
                              <span className="text-emerald-700 font-medium">
                                <MoneyDisplay value={line.debit} lang={lang} size="xs" inline showSymbol={false} />
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5">
                            {line.credit > 0 ? (
                              <span className="text-rose-700 font-medium">
                                <MoneyDisplay value={line.credit} lang={lang} size="xs" inline showSymbol={false} />
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals */}
                <div className="flex justify-between items-center bg-white/70 rounded-md px-3 py-2 border border-teal-200">
                  <div className="flex items-center gap-4 text-xs">
                    <span>
                      {t('إجمالي مدين', 'Total Debit')}:{' '}
                      <strong className="text-emerald-700">
                        <MoneyDisplay value={entry.totalDebit} lang={lang} size="xs" inline />
                      </strong>
                    </span>
                    <span>
                      {t('إجمالي دائن', 'Total Credit')}:{' '}
                      <strong className="text-rose-700">
                        <MoneyDisplay value={entry.totalCredit} lang={lang} size="xs" inline />
                      </strong>
                    </span>
                  </div>
                  {Math.abs(entry.totalDebit - entry.totalCredit) < 0.01 ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs gap-1">
                      <CircleDot className="size-2.5" />
                      {t('متوازن', 'Balanced')}
                    </Badge>
                  ) : (
                    <Badge className="bg-rose-100 text-rose-700 border-0 text-xs gap-1">
                      <CircleDot className="size-2.5" />
                      {t('غير متوازن', 'Unbalanced')}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

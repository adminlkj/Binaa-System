'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarRange, Plus, RefreshCw, Lock, Eye, Trash2, Pencil,
  CheckCircle2, AlertCircle, Wallet, TrendingUp,
  Calendar, FileText, Unlock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { ModuleLayout } from '@/components/shared/module-layout'
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatDate } from '@/stores/app-store'
import { toast } from 'sonner'

// ============ Types ============
interface FiscalPeriod {
  id: string
  fiscalYearId: string
  periodNo: number
  startDate: string
  endDate: string
  status: string
}

interface FiscalYear {
  id: string
  name: string
  startDate: string
  endDate: string
  status: string
  closingJournalEntryId: string | null
  openingJournalEntryId: string | null
  retainedEarningsAccountCode: string | null
  closedBy: string | null
  closedAt: string | null
  closingNotes: string | null
  totalRevenue: number
  totalExpenses: number
  netProfit: number
  createdAt: string
  updatedAt: string
  periods?: FiscalPeriod[]
  periodsCount?: number
  closedPeriods?: number
}

interface FiscalYearsResponse {
  years: FiscalYear[]
  current: FiscalYear | null
  lastClosed: FiscalYear | null
  total: number
}

interface ClosingPreviewLine {
  accountCode: string
  accountName: string
  debit: number
  credit: number
  type: 'revenue' | 'expense' | 'retained_earnings'
  role: string
}

interface ClosingPreviewResponse {
  fiscalYear: { id: string; name: string; startDate: string; endDate: string; status: string }
  revenueAccounts: { id: string; code: string; name: string; nameAr: string | null; role: string; balance: number }[]
  expenseAccounts: { id: string; code: string; name: string; nameAr: string | null; role: string; balance: number }[]
  retainedEarningsAccount: { code: string; name: string; nameAr: string | null } | null
  totals: {
    totalRevenue: number
    totalExpenses: number
    netProfit: number
    totalDebit: number
    totalCredit: number
    isBalanced: boolean
  }
  journalEntry: {
    lines: ClosingPreviewLine[]
    description: string
    descriptionAr: string
  }
}

// ============ Bilingual Helpers ============
const t = (lang: 'ar' | 'en', ar: string, en: string) => lang === 'ar' ? ar : en

const statusConfig: Record<string, { ar: string; en: string; cls: string; icon: React.ElementType }> = {
  OPEN: { ar: 'مفتوحة', en: 'Open', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  CLOSING: { ar: 'قيد الإقفال', en: 'Closing', cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertCircle },
  CLOSED: { ar: 'مغلقة', en: 'Closed', cls: 'bg-gray-100 text-gray-700 border-gray-200', icon: Lock },
}

// ============ Summary Card ============
function SummaryCard({ icon: Icon, label, value, sub, color, lang }: {
  icon: React.ElementType
  label: { ar: string; en: string }
  value: string | number
  sub?: { ar: string; en: string }
  color: string
  lang: 'ar' | 'en'
}) {
  return (
    <Card className="overflow-hidden border-none shadow-sm">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`rounded-lg p-2.5 ${color}`}>
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label[lang]}</p>
          <p className="text-xl font-bold mt-0.5 truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub[lang]}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

// ============ Create Fiscal Year Dialog ============
function CreateFiscalYearDialog({
  open, onOpenChange, lang,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  lang: 'ar' | 'en'
}) {
  const queryClient = useQueryClient()
  const today = new Date()
  const defaultStart = `${today.getFullYear()}-01-01`
  const defaultEnd = `${today.getFullYear()}-12-31`

  const [name, setName] = useState(String(today.getFullYear()))
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)

  // Auto-adjust end date when start date changes (12-month fiscal year by default)
  const handleStartChange = (v: string) => {
    setStartDate(v)
    const d = new Date(v)
    if (!isNaN(d.getTime())) {
      const end = new Date(d.getFullYear(), d.getMonth() + 12, 0) // last day of 12th month
      setEndDate(end.toISOString().slice(0, 10))
      if (!name || /^\d{4}$/.test(name)) {
        setName(String(d.getFullYear()))
      }
    }
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/fiscal-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, startDate, endDate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل')
      return data
    },
    onSuccess: () => {
      toast.success(lang === 'ar' ? 'تم إنشاء السنة المالية بنجاح' : 'Fiscal year created successfully')
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="size-5 text-teal-600" />
            {t(lang, 'إنشاء سنة مالية جديدة', 'Create New Fiscal Year')}
          </DialogTitle>
          <DialogDescription>
            {t(lang, 'سيتم إنشاء 12 فترة شهرية تلقائياً ضمن هذه السنة.', '12 monthly periods will be created automatically.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t(lang, 'اسم السنة المالية', 'Fiscal Year Name')}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="2026" />
            <p className="text-xs text-muted-foreground">
              {t(lang, 'مثال: 2026 أو السنة المالية 2026', 'e.g. 2026 or FY2026')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t(lang, 'تاريخ البداية', 'Start Date')}</Label>
              <Input type="date" value={startDate} onChange={e => handleStartChange(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t(lang, 'تاريخ النهاية', 'End Date')}</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 text-xs text-teal-800">
            {t(lang,
              'ملاحظة: لا يمكن إنشاء سنة مالية تتداخل مع سنة موجودة. سيتم إنشاء السنة بحالة "مفتوحة".',
              'Note: Overlapping fiscal years are not allowed. The new year will be created with status "Open".'
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t(lang, 'إلغاء', 'Cancel')}
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name || !startDate || !endDate}
            className="gap-1"
          >
            {createMutation.isPending ? t(lang, 'جاري الإنشاء...', 'Creating...') : t(lang, 'إنشاء', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ Edit Fiscal Year Dialog ============
function EditFiscalYearDialog({
  year, open, onOpenChange, lang,
}: {
  year: FiscalYear | null
  open: boolean
  onOpenChange: (v: boolean) => void
  lang: 'ar' | 'en'
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  React.useEffect(() => {
    if (year) {
      setName(year.name)
      setStartDate(year.startDate.slice(0, 10))
      setEndDate(year.endDate.slice(0, 10))
    }
  }, [year])

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/fiscal-years/${year!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, startDate, endDate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل')
      return data
    },
    onSuccess: () => {
      toast.success(lang === 'ar' ? 'تم تحديث السنة المالية' : 'Fiscal year updated')
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (!year) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5 text-teal-600" />
            {t(lang, 'تعديل السنة المالية', 'Edit Fiscal Year')}
          </DialogTitle>
          <DialogDescription>
            {t(lang,
              'يمكن لمدير النظام تعديل بيانات السنة المالية في أي حالة.',
              'The system manager can edit fiscal year data in any status.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t(lang, 'اسم السنة المالية', 'Fiscal Year Name')}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t(lang, 'تاريخ البداية', 'Start Date')}</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t(lang, 'تاريخ النهاية', 'End Date')}</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t(lang, 'إلغاء', 'Cancel')}
          </Button>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="gap-1">
            {updateMutation.isPending ? t(lang, 'جاري الحفظ...', 'Saving...') : t(lang, 'حفظ', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ Closing Preview Dialog ============
function ClosingPreviewDialog({
  year, open, onOpenChange, lang,
}: {
  year: FiscalYear | null
  open: boolean
  onOpenChange: (v: boolean) => void
  lang: 'ar' | 'en'
}) {
  const queryClient = useQueryClient()
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [approved, setApproved] = useState(false)
  const [notes, setNotes] = useState('')

  // Fetch preview when dialog opens
  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['closing-preview', year?.id],
    queryFn: async () => {
      const res = await fetch(`/api/fiscal-years/${year!.id}/closing-preview`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل')
      return data as ClosingPreviewResponse
    },
    enabled: !!year && open,
  })

  React.useEffect(() => {
    if (open) {
      setApproved(false)
      setNotes('')
      setCloseDialogOpen(false)
    }
  }, [open, year?.id])

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/fiscal-years/${year!.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true, notes, closedBy: 'admin' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل')
      return data
    },
    onSuccess: (data) => {
      toast.success(data.message || (lang === 'ar' ? 'تم إقفال السنة المالية بنجاح' : 'Fiscal year closed successfully'))
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] })
      queryClient.invalidateQueries({ queryKey: ['closing-preview'] })
      onOpenChange(false)
      setCloseDialogOpen(false)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setCloseDialogOpen(false)
    },
  })

  if (!year) return null

  const isProfit = (preview?.totals.netProfit ?? 0) >= 0
  const lines = preview?.journalEntry.lines ?? []

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="size-5 text-teal-600" />
              {t(lang, 'معاينة إقفال السنة المالية', 'Fiscal Year Closing Preview')}
              <Badge variant="outline" className="font-mono">{year.name}</Badge>
            </DialogTitle>
            <DialogDescription>
              {t(lang,
                'تعرض هذه المعاينة حسابات الإيرادات والمصروفات التي سيتم تصفيرها، وصافي الربح/الخسارة الذي سيُرحّل إلى حساب الأرباح المرحلة.',
                'This preview shows revenue and expense accounts that will be zeroed out, and the net profit/loss to be transferred to retained earnings.'
              )}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t(lang, 'جاري حساب الأرصدة...', 'Calculating balances...')}
              </span>
            </div>
          ) : error ? (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
              <AlertCircle className="size-4 inline ml-2" />
              {(error as Error).message}
            </div>
          ) : preview ? (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-emerald-200 bg-emerald-50">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{t(lang, 'إجمالي الإيرادات', 'Total Revenue')}</p>
                    <MoneyDisplay value={preview.totals.totalRevenue} lang={lang} bold className="text-emerald-700 text-lg" />
                  </CardContent>
                </Card>
                <Card className="border-rose-200 bg-rose-50">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{t(lang, 'إجمالي المصروفات', 'Total Expenses')}</p>
                    <MoneyDisplay value={preview.totals.totalExpenses} lang={lang} bold className="text-rose-700 text-lg" />
                  </CardContent>
                </Card>
                <Card className={`border-2 ${isProfit ? 'border-teal-300 bg-teal-50' : 'border-amber-300 bg-amber-50'}`}>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{t(lang, 'صافي الربح / الخسارة', 'Net Profit / Loss')}</p>
                    <MoneyDisplay value={Math.abs(preview.totals.netProfit)} lang={lang} bold className={`${isProfit ? 'text-teal-700' : 'text-amber-700'} text-lg`} />
                    <span className={`text-xs ${isProfit ? 'text-teal-600' : 'text-amber-600'}`}>
                      {isProfit ? t(lang, 'ربح', 'Profit') : t(lang, 'خسارة', 'Loss')}
                    </span>
                  </CardContent>
                </Card>
                <Card className="border-sky-200 bg-sky-50">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{t(lang, 'حساب الأرباح المرحلة', 'Retained Earnings')}</p>
                    <p className="text-sm font-mono font-bold mt-1">
                      {preview.retainedEarningsAccount?.code || '—'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {preview.retainedEarningsAccount?.nameAr || preview.retainedEarningsAccount?.name || '—'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* JE Lines Table */}
              <div className="rounded-lg border">
                <div className="bg-muted/50 px-3 py-2 border-b">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="size-4 text-teal-600" />
                    {t(lang, 'قيد الإقفال المتوقع', 'Expected Closing Journal Entry')}
                  </h4>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-20">{t(lang, 'الكود', 'Code')}</TableHead>
                        <TableHead>{t(lang, 'اسم الحساب', 'Account Name')}</TableHead>
                        <TableHead className="w-24">{t(lang, 'النوع', 'Type')}</TableHead>
                        <TableHead className="text-left w-32">{t(lang, 'مدين', 'Debit')}</TableHead>
                        <TableHead className="text-left w-32">{t(lang, 'دائن', 'Credit')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                            {t(lang, 'لا توجد أرصدة لإقفالها', 'No balances to close')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        lines.map((line, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{line.accountCode}</TableCell>
                            <TableCell className="text-sm">{line.accountName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                line.type === 'revenue' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                line.type === 'expense' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                'bg-sky-50 text-sky-700 border-sky-200'
                              }>
                                {line.type === 'revenue' ? t(lang, 'إيراد', 'Revenue') :
                                 line.type === 'expense' ? t(lang, 'مصروف', 'Expense') :
                                 t(lang, 'أرباح مرحلة', 'Retained')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-left font-mono text-sm">
                              {line.debit > 0 ? line.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </TableCell>
                            <TableCell className="text-left font-mono text-sm">
                              {line.credit > 0 ? line.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t bg-muted/30 px-3 py-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t(lang, 'إجمالي مدين:', 'Total Debit:')}</span>{' '}
                    <span className="font-mono font-bold">
                      {preview.totals.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t(lang, 'إجمالي دائن:', 'Total Credit:')}</span>{' '}
                    <span className="font-mono font-bold">
                      {preview.totals.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {preview.totals.isBalanced ? (
                      <>
                        <CheckCircle2 className="size-4 text-emerald-600" />
                        <span className="text-emerald-700 font-medium text-xs">
                          {t(lang, 'متوازن', 'Balanced')}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="size-4 text-rose-600" />
                        <span className="text-rose-700 font-medium text-xs">
                          {t(lang, 'غير متوازن', 'Unbalanced')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">{t(lang, 'تحذير: عملية لا يمكن التراجع عنها', 'Warning: Irreversible Operation')}</p>
                  <p>
                    {t(lang,
                      'بعد الإقفال، سيتم تصفير جميع حسابات الإيرادات والمصروفات وتحويل الصافي إلى الأرباح المرحلة. كما سيتم إغلاق جميع الفترات الشهرية الـ12. لا يمكن التراجع عن هذا الإجراء.',
                      'After closing, all revenue and expense accounts will be zeroed out and the net balance transferred to retained earnings. All 12 monthly periods will be closed. This action cannot be undone.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t(lang, 'إغلاق', 'Close')}
            </Button>
            <Button
              onClick={() => setCloseDialogOpen(true)}
              disabled={!preview || isLoading}
              className="gap-1 bg-rose-600 hover:bg-rose-700 text-white"
            >
              <Lock className="size-4" />
              {t(lang, 'تنفيذ الإقفال', 'Execute Closing')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Final Confirmation Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="size-5" />
              {t(lang, 'تأكيد نهائي للإقفال', 'Final Confirmation')}
            </DialogTitle>
            <DialogDescription>
              {t(lang,
                `سيتم إقفال السنة المالية "${year?.name}" نهائياً. هذه العملية لا يمكن التراجع عنها.`,
                `Fiscal year "${year?.name}" will be closed permanently. This cannot be undone.`
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <Switch checked={approved} onCheckedChange={setApproved} />
              <span className="text-sm">
                {t(lang,
                  'أؤكد فهمي لتبعات الإقفال وأوافق على تنفيذه. سيتم تصفير حسابات الإيرادات والمصروفات وترحيل الصافي إلى الأرباح المرحلة.',
                  'I understand the implications of closing and approve it. Revenue and expense accounts will be zeroed and the net balance transferred to retained earnings.'
                )}
              </span>
            </label>
            <div className="space-y-1.5">
              <Label>{t(lang, 'ملاحظات الإقفال (اختياري)', 'Closing Notes (optional)')}</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t(lang, 'أضف ملاحظات حول سبب الإقفال أو مراجعته...', 'Add notes about closing reason or review...')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              {t(lang, 'إلغاء', 'Cancel')}
            </Button>
            <Button
              onClick={() => closeMutation.mutate()}
              disabled={!approved || closeMutation.isPending}
              className="gap-1 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {closeMutation.isPending ? t(lang, 'جاري الإقفال...', 'Closing...') : t(lang, 'تأكيد الإقفال النهائي', 'Confirm Final Closing')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============ Periods View Dialog ============
function PeriodsViewDialog({
  year, open, onOpenChange, lang, onPeriodsChanged,
}: {
  year: FiscalYear | null
  open: boolean
  onOpenChange: (v: boolean) => void
  lang: 'ar' | 'en'
  onPeriodsChanged?: () => void
}) {
  const queryClient = useQueryClient()
  const [localPeriods, setLocalPeriods] = useState<FiscalPeriod[]>([])

  React.useEffect(() => {
    if (year?.periods) setLocalPeriods(year.periods)
  }, [year?.periods])

  const togglePeriodMutation = useMutation({
    mutationFn: async ({ periodId, newStatus }: { periodId: string; newStatus: string }) => {
      const res = await fetch(`/api/fiscal-years/${year!.id}/periods/${periodId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل')
      return data
    },
    onSuccess: (data, variables) => {
      // Update local state immediately for snappy UI
      setLocalPeriods(prev => prev.map(p =>
        p.id === variables.periodId ? { ...p, status: variables.newStatus } : p
      ))
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] })
      onPeriodsChanged?.()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleAll = (newStatus: string) => {
    localPeriods.forEach(p => {
      if (p.status !== newStatus) {
        togglePeriodMutation.mutate({ periodId: p.id, newStatus })
      }
    })
  }

  if (!year) return null
  const periods = localPeriods.length > 0 ? localPeriods : (year.periods ?? [])
  const openCount = periods.filter(p => p.status === 'OPEN').length
  const closedCount = periods.filter(p => p.status === 'CLOSED').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Calendar className="size-5 text-teal-600" />
            {t(lang, 'فترات السنة المالية', 'Fiscal Year Periods')}
            <Badge variant="outline" className="font-mono">{year.name}</Badge>
            <Badge variant="outline" className={statusConfig[year.status]?.cls || ''}>
              {statusConfig[year.status]?.[lang] || year.status}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {t(lang,
              '12 فترة شهرية تُنشأ تلقائياً مع كل سنة مالية. يمكن لمدير النظام فتح/إغلاق أي فترة.',
              '12 monthly periods are created automatically. The system manager can open/close any period.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Summary + bulk actions */}
        <div className="flex items-center justify-between gap-2 flex-wrap rounded-lg bg-muted/40 p-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span className="font-semibold">{openCount}</span>
              <span className="text-muted-foreground">{t(lang, 'مفتوحة', 'open')}</span>
            </span>
            <span className="flex items-center gap-1">
              <Lock className="size-4 text-gray-600" />
              <span className="font-semibold">{closedCount}</span>
              <span className="text-muted-foreground">{t(lang, 'مغلقة', 'closed')}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              onClick={() => toggleAll('OPEN')}
              disabled={togglePeriodMutation.isPending || openCount === periods.length}
              className="gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            >
              <Unlock className="size-3.5" />
              {t(lang, 'فتح الكل', 'Open All')}
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => toggleAll('CLOSED')}
              disabled={togglePeriodMutation.isPending || closedCount === periods.length}
              className="gap-1 text-gray-700 border-gray-300 hover:bg-gray-50"
            >
              <Lock className="size-3.5" />
              {t(lang, 'إغلاق الكل', 'Close All')}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {periods.length === 0 ? (
            <div className="col-span-full text-center text-muted-foreground py-8 text-sm">
              {t(lang, 'لا توجد فترات.', 'No periods found.')}
            </div>
          ) : (
            periods.map(p => {
              const cfg = statusConfig[p.status] || statusConfig.OPEN
              const Icon = cfg.icon
              const isClosed = p.status === 'CLOSED'
              return (
                <Card key={p.id} className={`border shadow-none ${isClosed ? 'bg-gray-50/50' : ''}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold">
                        {t(lang, 'الفترة', 'Period')} {p.periodNo}
                      </span>
                      <Badge variant="outline" className={`text-xs ${cfg.cls}`}>
                        <Icon className="size-3 ml-1" />
                        {cfg[lang]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {formatDate(p.startDate, lang)} — {formatDate(p.endDate, lang)}
                    </p>
                    <Button
                      size="sm"
                      variant={isClosed ? 'outline' : 'default'}
                      onClick={() => togglePeriodMutation.mutate({
                        periodId: p.id,
                        newStatus: isClosed ? 'OPEN' : 'CLOSED',
                      })}
                      disabled={togglePeriodMutation.isPending}
                      className={`w-full gap-1 h-7 text-xs ${
                        isClosed
                          ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                          : 'bg-gray-600 hover:bg-gray-700 text-white'
                      }`}
                    >
                      {isClosed ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                      {isClosed ? t(lang, 'إعادة الفتح', 'Reopen') : t(lang, 'إغلاق', 'Close')}
                    </Button>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t(lang, 'إغلاق', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Module ============
export function FinancialYearsModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FiscalYear | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<FiscalYear | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [periodsTarget, setPeriodsTarget] = useState<FiscalYear | null>(null)
  const [periodsOpen, setPeriodsOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FiscalYear | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reopenTarget, setReopenTarget] = useState<FiscalYear | null>(null)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenNotes, setReopenNotes] = useState('')
  const [reopenReverseJE, setReopenReverseJE] = useState(true)

  const { data, isLoading, refetch } = useQuery<FiscalYearsResponse>({
    queryKey: ['fiscal-years'],
    queryFn: async () => {
      const res = await fetch('/api/fiscal-years')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'فشل')
      return json
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/fiscal-years/${deleteTarget!.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل')
      return data
    },
    onSuccess: () => {
      toast.success(lang === 'ar' ? 'تم حذف السنة المالية' : 'Fiscal year deleted')
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] })
      setDeleteOpen(false)
      setDeleteTarget(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const reopenMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/fiscal-years/${reopenTarget!.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: reopenNotes || 'أُعيد فتح السنة بواسطة مدير النظام',
          reverseClosingJE: reopenReverseJE,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل')
      return data
    },
    onSuccess: (data) => {
      toast.success(data.message || (lang === 'ar' ? 'تمت إعادة فتح السنة المالية' : 'Fiscal year reopened'))
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] })
      queryClient.invalidateQueries({ queryKey: ['closing-preview'] })
      setReopenOpen(false)
      setReopenTarget(null)
      setReopenNotes('')
      setReopenReverseJE(true)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const years = data?.years ?? []
  const current = data?.current ?? null
  const lastClosed = data?.lastClosed ?? null

  const handleEdit = (y: FiscalYear) => {
    setEditTarget(y)
    setEditOpen(true)
  }
  const handlePreview = (y: FiscalYear) => {
    setPreviewTarget(y)
    setPreviewOpen(true)
  }
  const handlePeriods = (y: FiscalYear) => {
    setPeriodsTarget(y)
    setPeriodsOpen(true)
  }
  const handleDelete = (y: FiscalYear) => {
    setDeleteTarget(y)
    setDeleteOpen(true)
  }
  const handleReopen = (y: FiscalYear) => {
    setReopenTarget(y)
    setReopenNotes('')
    setReopenReverseJE(true)
    setReopenOpen(true)
  }

  return (
    <ModuleLayout
      title={{ ar: 'السنوات المالية', en: 'Financial Years' }}
      subtitle={{
        ar: 'إدارة السنوات المالية والفترات الشهرية وإقفال السنة مع التسويات والترحيلات التلقائية',
        en: 'Manage fiscal years, monthly periods, and year-end closing with automatic adjustments and carry-forwards',
      }}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="size-4" />
            {t(lang, 'تحديث', 'Refresh')}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1 bg-teal-600 hover:bg-teal-700">
            <Plus className="size-4" />
            {t(lang, 'سنة مالية جديدة', 'New Fiscal Year')}
          </Button>
        </>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={CalendarRange}
          label={{ ar: 'السنة الحالية', en: 'Current Year' }}
          value={current?.name || t(lang, '— لا توجد —', '— None —')}
          sub={current ? {
            ar: `${formatDate(current.startDate, lang)} → ${formatDate(current.endDate, lang)}`,
            en: `${formatDate(current.startDate, lang)} → ${formatDate(current.endDate, lang)}`,
          } : undefined}
          color="bg-emerald-100 text-emerald-700"
          lang={lang}
        />
        <SummaryCard
          icon={Calendar}
          label={{ ar: 'إجمالي السنوات', en: 'Total Years' }}
          value={data?.total ?? 0}
          sub={{
            ar: `${years.filter(y => y.status === 'OPEN').length} مفتوحة، ${years.filter(y => y.status === 'CLOSED').length} مغلقة`,
            en: `${years.filter(y => y.status === 'OPEN').length} open, ${years.filter(y => y.status === 'CLOSED').length} closed`,
          }}
          color="bg-sky-100 text-sky-700"
          lang={lang}
        />
        <SummaryCard
          icon={TrendingUp}
          label={{ ar: 'آخر سنة مغلقة', en: 'Last Closed Year' }}
          value={lastClosed?.name || t(lang, '— لا توجد —', '— None —')}
          sub={lastClosed ? {
            ar: `صافي الربح: ${lastClosed.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            en: `Net Profit: ${lastClosed.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          } : undefined}
          color="bg-gray-100 text-gray-700"
          lang={lang}
        />
        <SummaryCard
          icon={Wallet}
          label={{ ar: 'صافي ربح السنة الحالية', en: 'Current Year Net Profit' }}
          value={current ? current.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
          sub={current ? {
            ar: `إيرادات: ${current.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })} / مصروفات: ${current.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            en: `Rev: ${current.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })} / Exp: ${current.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          } : undefined}
          color={current && current.netProfit >= 0 ? 'bg-teal-100 text-teal-700' : 'bg-rose-100 text-rose-700'}
          lang={lang}
        />
      </div>

      {/* Years List */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CalendarRange className="size-4 text-teal-600" />
              {t(lang, 'قائمة السنوات المالية', 'Fiscal Years List')}
            </h3>
            <span className="text-xs text-muted-foreground">
              {years.length} {t(lang, 'سنة', 'years')}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t(lang, 'جاري التحميل...', 'Loading...')}
              </span>
            </div>
          ) : years.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-muted mb-4">
                <CalendarRange className="size-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {t(lang, 'لا توجد سنوات مالية بعد', 'No fiscal years yet')}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                {t(lang,
                  'ابدأ بإنشاء سنة مالية جديدة. سيتم توليد 12 فترة شهرية تلقائياً.',
                  'Start by creating a new fiscal year. 12 monthly periods will be generated automatically.'
                )}
              </p>
              <Button onClick={() => setCreateOpen(true)} className="gap-1 bg-teal-600 hover:bg-teal-700">
                <Plus className="size-4" />
                {t(lang, 'إنشاء السنة الأولى', 'Create First Year')}
              </Button>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-24">{t(lang, 'الاسم', 'Name')}</TableHead>
                    <TableHead className="w-44">{t(lang, 'الفترة', 'Period')}</TableHead>
                    <TableHead className="w-24">{t(lang, 'الحالة', 'Status')}</TableHead>
                    <TableHead className="text-center w-20">{t(lang, 'الفترات', 'Periods')}</TableHead>
                    <TableHead className="text-left w-32">{t(lang, 'الإيرادات', 'Revenue')}</TableHead>
                    <TableHead className="text-left w-32">{t(lang, 'المصروفات', 'Expenses')}</TableHead>
                    <TableHead className="text-left w-32">{t(lang, 'صافي الربح', 'Net Profit')}</TableHead>
                    <TableHead className="w-44 text-center">{t(lang, 'إجراءات', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {years.map(y => {
                    const cfg = statusConfig[y.status] || statusConfig.OPEN
                    const Icon = cfg.icon
                    const isClosed = y.status === 'CLOSED'
                    return (
                      <TableRow key={y.id} className={y.status === 'OPEN' ? 'bg-emerald-50/30' : isClosed ? 'bg-gray-50/40' : ''}>
                        <TableCell className="font-mono font-semibold">{y.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(y.startDate, lang)}<br />
                          <span className="opacity-60">→ {formatDate(y.endDate, lang)}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cfg.cls}>
                            <Icon className="size-3 ml-1" />
                            {cfg[lang]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          <button
                            onClick={() => handlePeriods(y)}
                            className="text-teal-700 hover:underline font-medium"
                            title={t(lang, 'عرض الفترات', 'View periods')}
                          >
                            {y.closedPeriods ?? 0}/{y.periodsCount ?? (y.periods?.length ?? 0)}
                          </button>
                        </TableCell>
                        <TableCell className="text-left font-mono text-xs text-emerald-700">
                          {y.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-left font-mono text-xs text-rose-700">
                          {y.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={`text-left font-mono text-xs font-bold ${y.netProfit >= 0 ? 'text-teal-700' : 'text-amber-700'}`}>
                          {y.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {/* View Periods — always available */}
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => handlePeriods(y)}
                              title={t(lang, 'عرض / إدارة الفترات', 'View / Manage Periods')}
                              className="size-8 p-0"
                            >
                              <Calendar className="size-4" />
                            </Button>
                            {/* Edit — admin: always (even closed) */}
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => handleEdit(y)}
                              title={t(lang, 'تعديل', 'Edit')}
                              className="size-8 p-0"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            {/* Closing preview — only for OPEN (can be closed) */}
                            {!isClosed && (
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => handlePreview(y)}
                                title={t(lang, 'معاينة الإقفال', 'Closing Preview')}
                                className="size-8 p-0 text-rose-600 hover:text-rose-700"
                              >
                                <Lock className="size-4" />
                              </Button>
                            )}
                            {/* Reopen — only for CLOSED */}
                            {isClosed && (
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => handleReopen(y)}
                                title={t(lang, 'إعادة فتح السنة', 'Reopen Year')}
                                className="size-8 p-0 text-emerald-600 hover:text-emerald-700"
                              >
                                <Unlock className="size-4" />
                              </Button>
                            )}
                            {/* Delete — admin: always */}
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => handleDelete(y)}
                              title={t(lang, 'حذف', 'Delete')}
                              className="size-8 p-0 text-rose-600 hover:text-rose-700"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                            {isClosed && y.closingJournalEntryId && (
                              <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200 ml-1">
                                <FileText className="size-3 ml-1" />
                                {t(lang, 'مُقفلة', 'Closed')}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Educational Info Card */}
      <Card className="bg-teal-50 border-teal-200 shadow-none">
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-teal-800 flex items-center gap-2 mb-2">
            <AlertCircle className="size-4" />
            {t(lang, 'كيف يعمل نظام السنوات المالية؟', 'How does the fiscal year system work?')}
          </h4>
          <ul className="text-xs text-teal-700 space-y-1 list-disc list-inside">
            <li>
              {t(lang,
                'كل سنة مالية تُنشأ مع 12 فترة شهرية تلقائياً (يمكن تتبع حالة كل فترة).',
                'Each fiscal year is created with 12 monthly periods automatically (each period status is tracked).'
              )}
            </li>
            <li>
              {t(lang,
                'حارس إقفال الفترات يمنع ترحيل أي قيود إلى سنة مغلقة — يلتزم بمعايير IFRS / GAAP.',
                'The period closing guard prevents posting any entries to a closed year — complies with IFRS / GAAP.'
              )}
            </li>
            <li>
              {t(lang,
                'عند الإقفال: تُصفَّر جميع حسابات الإيرادات والمصروفات (مدين/دائن) ويُرحَّل الصافي إلى حساب "الأرباح المرحلة".',
                'On closing: all revenue/expense accounts are zeroed (debit/credit) and the net balance transfers to "Retained Earnings".'
              )}
            </li>
            <li>
              {t(lang,
                'يتم توليد قيد إقفال واحد متوازن تلقائياً يشمل جميع الحسابات ذات الأرصدة + بند الأرباح المرحلة.',
                'A single balanced closing journal entry is generated automatically covering all accounts with balances + the retained earnings line.'
              )}
            </li>
            <li>
              {t(lang,
                'يمكن لمدير النظام تعديل وحذف وإعادة فتح السنوات في أي حالة (مفتوحة/مغلقة) بدون قيود.',
                'The system manager can edit, delete, and reopen years in any status (open/closed) without restrictions.'
              )}
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateFiscalYearDialog open={createOpen} onOpenChange={setCreateOpen} lang={lang} />
      <EditFiscalYearDialog year={editTarget} open={editOpen} onOpenChange={setEditOpen} lang={lang} />
      <ClosingPreviewDialog year={previewTarget} open={previewOpen} onOpenChange={setPreviewOpen} lang={lang} />
      <PeriodsViewDialog
        year={periodsTarget}
        open={periodsOpen}
        onOpenChange={setPeriodsOpen}
        lang={lang}
        onPeriodsChanged={() => refetch()}
      />

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <Trash2 className="size-5" />
              {t(lang, 'تأكيد الحذف', 'Confirm Delete')}
            </DialogTitle>
            <DialogDescription>
              {t(lang,
                `سيتم حذف السنة المالية "${deleteTarget?.name}" وجميع فتراتها الـ12. لا يمكن التراجع عن هذا الإجراء.`,
                `Fiscal year "${deleteTarget?.name}" and all its 12 periods will be deleted. This cannot be undone.`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t(lang, 'إلغاء', 'Cancel')}
            </Button>
            <Button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="gap-1 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleteMutation.isPending ? t(lang, 'جاري الحذف...', 'Deleting...') : t(lang, 'حذف نهائي', 'Delete Permanently')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Confirmation */}
      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <Unlock className="size-5" />
              {t(lang, 'إعادة فتح السنة المالية', 'Reopen Fiscal Year')}
            </DialogTitle>
            <DialogDescription>
              {t(lang,
                `سيتم إعادة فتح السنة المالية "${reopenTarget?.name}" وجميع فتراتها الـ12. يمكن بعدها تعديل وترحيل قيود جديدة.`,
                `Fiscal year "${reopenTarget?.name}" and all its 12 periods will be reopened. New entries can then be posted.`
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">
                  {t(lang, 'إجراء مدير النظام', 'Administrator Action')}
                </p>
                <p>
                  {t(lang,
                    'إعادة فتح سنة مغلقة يسمح بتعديل القيود في فترة مغلقة. استخدم هذا بحذر بعد مراجعة المراجع.',
                    'Reopening a closed year allows editing entries in a closed period. Use with caution after auditor review.'
                  )}
                </p>
              </div>
            </div>

            {reopenTarget?.closingJournalEntryId && (
              <label className="flex items-start gap-3 cursor-pointer rounded-lg bg-sky-50 border border-sky-200 p-3">
                <Switch checked={reopenReverseJE} onCheckedChange={setReopenReverseJE} />
                <span className="text-sm">
                  <span className="font-semibold">
                    {t(lang, 'عكس قيد الإقفال تلقائياً', 'Auto-reverse closing JE')}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {t(lang,
                      'يُنشئ قيداً عكسياً يلغي تأثير قيد الإقفال الأصلي (يستعيد أرصدة الإيرادات والمصروفات).',
                      'Creates a reversal entry that cancels the original closing JE (restores revenue/expense balances).'
                    )}
                  </span>
                </span>
              </label>
            )}

            <div className="space-y-1.5">
              <Label>{t(lang, 'ملاحظات إعادة الفتح', 'Reopen Notes')}</Label>
              <Textarea
                value={reopenNotes}
                onChange={e => setReopenNotes(e.target.value)}
                placeholder={t(lang, 'سبب إعادة الفتح أو المراجع...', 'Reason for reopening or reference...')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>
              {t(lang, 'إلغاء', 'Cancel')}
            </Button>
            <Button
              onClick={() => reopenMutation.mutate()}
              disabled={reopenMutation.isPending}
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {reopenMutation.isPending
                ? t(lang, 'جاري إعادة الفتح...', 'Reopening...')
                : t(lang, 'تأكيد إعادة الفتح', 'Confirm Reopen')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleLayout>
  )
}

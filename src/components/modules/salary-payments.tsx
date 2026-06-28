'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Banknote, Plus, Search, Trash2, RefreshCw, Download,
  Landmark, Wallet, BookOpen, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { useAppStore, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
type PaymentMethod = 'BANK' | 'CASH'
type PayrollRunStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID'

interface PayrollRunSummary {
  id: string
  code: string
  month: number
  year: number
  status: PayrollRunStatus
  totalNet: number
}

interface SalaryPayment {
  id: string
  payrollRunId: string
  paymentMethod: PaymentMethod
  amount: number
  referenceNumber: string | null
  paymentDate: string
  notes: string | null
  journalEntryId: string | null
  createdAt: string
  updatedAt: string
  payrollRun: PayrollRunSummary
}

interface PayrollRunOption {
  id: string
  code: string
  month: number
  year: number
  status: PayrollRunStatus
  totalNet: number
  salaryPayments: Array<{ id: string; amount: number }>
}

interface PaymentFormData {
  payrollRunId: string
  paymentMethod: PaymentMethod
  amount: string
  referenceNumber: string
  paymentDate: string
  notes: string
}

const defaultForm: PaymentFormData = {
  payrollRunId: '',
  paymentMethod: 'BANK',
  amount: '',
  referenceNumber: '',
  paymentDate: new Date().toISOString().split('T')[0],
  notes: '',
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const paymentMethodConfig: Record<PaymentMethod, { label: { ar: string; en: string }; color: string; bg: string; icon: React.ElementType }> = {
  BANK: { label: { ar: 'بنكي', en: 'Bank' }, color: 'text-blue-700', bg: 'bg-blue-100', icon: Landmark },
  CASH: { label: { ar: 'نقدي', en: 'Cash' }, color: 'text-emerald-700', bg: 'bg-emerald-100', icon: Wallet },
}

const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]
const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatMonth(month: number, year: number, lang: 'ar' | 'en') {
  const months = lang === 'ar' ? arabicMonths : englishMonths
  return `${months[month - 1]} ${year}`
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Create Payment Dialog ============
function CreatePaymentDialog({ open, onOpenChange, payrollRuns }: {
  open: boolean; onOpenChange: (open: boolean) => void; payrollRuns: PayrollRunOption[]
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [form, setForm] = useState<PaymentFormData>(defaultForm)
  const [error, setError] = useState('')

  React.useEffect(() => {
    if (open) {
      setForm(defaultForm)
      setError('')
    }
  }, [open])

  const selectedRun = form.payrollRunId
    ? payrollRuns.find(r => r.id === form.payrollRunId)
    : null

  const totalPaidSoFar = selectedRun
    ? selectedRun.salaryPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    : 0
  const remaining = selectedRun ? selectedRun.totalNet - totalPaidSoFar : 0

  // Auto-fill amount with remaining when payroll run changes
  React.useEffect(() => {
    if (selectedRun && remaining > 0) {
      setForm(f => ({ ...f, amount: remaining.toFixed(2) }))
    }
  }, [form.payrollRunId, selectedRun, remaining])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/salary-payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }).then(r => {
      if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Error') })
      return r.json()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-payments'] })
      queryClient.invalidateQueries({ queryKey: ['payroll-runs-for-payment'] })
      toast.success(t('تم تسجيل السداد بنجاح', 'Payment recorded successfully', lang))
      onOpenChange(false)
    },
    onError: (err: Error) => {
      setError(err.message)
      toast.error(t('فشل في تسجيل السداد', 'Failed to record payment', lang))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    createMutation.mutate({
      payrollRunId: form.payrollRunId,
      paymentMethod: form.paymentMethod,
      amount: parseFloat(form.amount) || 0,
      referenceNumber: form.referenceNumber || null,
      paymentDate: form.paymentDate,
      notes: form.notes || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('سداد رواتب', 'Salary Payment', lang)}</DialogTitle>
          <DialogDescription>{t('تسجيل سداد رواتب مسير معتمد', 'Record payment for an approved payroll run', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Payroll Run Selection */}
          <div className="space-y-2">
            <Label>{t('مسير الرواتب *', 'Payroll Run *', lang)}</Label>
            <Select value={form.payrollRunId} onValueChange={v => setForm(f => ({ ...f, payrollRunId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder={t('اختر مسير رواتب معتمد', 'Select an approved payroll run', lang)} />
              </SelectTrigger>
              <SelectContent>
                {payrollRuns.map(run => (
                  <SelectItem key={run.id} value={run.id}>
                    {run.code} - {formatMonth(run.month, run.year, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Payroll Run Info */}
          {selectedRun && (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('كود المسير', 'Run Code', lang)}</span>
                  <span className="font-mono font-medium">{selectedRun.code}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('الشهر/السنة', 'Month/Year', lang)}</span>
                  <span>{formatMonth(selectedRun.month, selectedRun.year, lang)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('صافي الرواتب', 'Net Salaries', lang)}</span>
                  <MoneyDisplay value={selectedRun.totalNet} mode="system" lang={lang} size="sm" bold />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('المدفوع سابقاً', 'Previously Paid', lang)}</span>
                  <span className="text-teal-700">
                    <MoneyDisplay value={totalPaidSoFar} mode="system" lang={lang} size="sm" bold className="text-teal-700" />
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm font-bold">
                  <span>{t('المتبقي', 'Remaining', lang)}</span>
                  <span className="text-amber-700">
                    <MoneyDisplay value={remaining} mode="system" lang={lang} size="md" bold className="text-amber-700" />
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>{t('طريقة السداد *', 'Payment Method *', lang)}</Label>
            <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v as PaymentMethod }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(paymentMethodConfig).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <cfg.icon className="size-4" />
                      {cfg.label[lang]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('المبلغ *', 'Amount *', lang)}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                max={remaining || undefined}
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                dir="ltr"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('تاريخ السداد *', 'Payment Date *', lang)}</Label>
              <Input
                type="date"
                value={form.paymentDate}
                onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label>{t('رقم المرجع', 'Reference Number', lang)}</Label>
            <Input
              value={form.referenceNumber}
              onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
              placeholder={t('رقم التحويل أو الشيك', 'Transfer or check number', lang)}
              dir="ltr"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('ملاحظات', 'Notes', lang)}</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder={t('ملاحظات إضافية', 'Additional notes', lang)}
              rows={2}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !form.payrollRunId || !form.amount || !form.paymentDate}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              {createMutation.isPending
                ? t('جاري السداد...', 'Processing...', lang)
                : (<><Banknote className="size-4" />{t('سداد', 'Pay', lang)}</>)
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Salary Payments Module ============
export function SalaryPaymentsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)

  // Fetch salary payments
  const { data: payments = [], isLoading, isError, refetch } = useQuery<SalaryPayment[]>({
    queryKey: ['salary-payments'],
    queryFn: async () => {
      const res = await fetch('/api/salary-payments')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Fetch eligible payroll runs for the create dialog
  const { data: allPayrollRuns = [] } = useQuery<PayrollRunOption[]>({
    queryKey: ['payroll-runs-for-payment'],
    queryFn: async () => {
      const res = await fetch('/api/payroll-runs')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Only APPROVED or PARTIALLY_PAID runs are eligible for payment
  const eligiblePayrollRuns = useMemo(() => {
    return allPayrollRuns.filter(
      (run): run is PayrollRunOption =>
        run.status === 'APPROVED' || run.status === 'PARTIALLY_PAID'
    )
  }, [allPayrollRuns])

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/salary-payments/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok) throw new Error()
      return r.json()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-payments'] })
      queryClient.invalidateQueries({ queryKey: ['payroll-runs-for-payment'] })
      toast.success(t('تم حذف السداد', 'Payment deleted', lang))
    },
    onError: () => toast.error(t('فشل في حذف السداد', 'Failed to delete payment', lang)),
  })

  // Filter payments
  const filtered = useMemo(() => {
    return payments.filter(p => {
      if (paymentMethodFilter !== 'ALL' && p.paymentMethod !== paymentMethodFilter) return false
      if (!search) return true
      const s = search.toLowerCase()
      return (
        (p.payrollRun?.code?.toLowerCase().includes(s)) ||
        (p.referenceNumber?.toLowerCase().includes(s)) ||
        (p.notes?.toLowerCase().includes(s))
      )
    })
  }, [payments, search, paymentMethodFilter])

  // Summary calculations
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const approvedRunsCount = allPayrollRuns.filter(
    r => r.status === 'APPROVED' || r.status === 'PARTIALLY_PAID'
  ).length
  // Calculate total remaining across all approved/partially paid runs
  const totalRemaining = eligiblePayrollRuns.reduce((sum, run) => {
    const paidForRun = (run as PayrollRunOption).salaryPayments?.reduce((s, p) => s + Number(p.amount || 0), 0) || 0
    return sum + (run.totalNet - paidForRun)
  }, 0)

  // Export handler
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'code', label: t('كود المسير', 'Run Code', lang) },
      { key: 'monthYear', label: t('الشهر/السنة', 'Month/Year', lang) },
      { key: 'paymentMethod', label: t('طريقة السداد', 'Payment Method', lang) },
      { key: 'amount', label: t('المبلغ', 'Amount', lang), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'referenceNumber', label: t('رقم المرجع', 'Reference', lang) },
      { key: 'paymentDate', label: t('تاريخ السداد', 'Payment Date', lang) },
      { key: 'notes', label: t('ملاحظات', 'Notes', lang) },
    ]
    exportToCSV(
      filtered.map(p => ({
        code: p.payrollRun?.code || '—',
        monthYear: p.payrollRun ? formatMonth(p.payrollRun.month, p.payrollRun.year, lang) : '—',
        paymentMethod: paymentMethodConfig[p.paymentMethod]?.label[lang] || p.paymentMethod,
        amount: p.amount,
        referenceNumber: p.referenceNumber || '',
        paymentDate: formatDate(p.paymentDate, lang),
        notes: p.notes || '',
      })),
      `salary-payments-${new Date().toISOString().slice(0, 10)}`,
      columns,
    )
  }

  // Print data
  const printData = useMemo(() => ({
    columns: [
      { key: 'code', label: lang === 'ar' ? 'كود المسير' : 'Run Code' },
      { key: 'monthYear', label: lang === 'ar' ? 'الشهر/السنة' : 'Month/Year' },
      { key: 'paymentMethod', label: lang === 'ar' ? 'طريقة السداد' : 'Method' },
      { key: 'amount', label: lang === 'ar' ? 'المبلغ' : 'Amount' },
      { key: 'referenceNumber', label: lang === 'ar' ? 'رقم المرجع' : 'Reference' },
      { key: 'paymentDate', label: lang === 'ar' ? 'تاريخ السداد' : 'Date' },
    ],
    rows: filtered.map(p => ({
      code: p.payrollRun?.code || '—',
      monthYear: p.payrollRun ? formatMonth(p.payrollRun?.month, p.payrollRun?.year, lang) : '—',
      paymentMethod: paymentMethodConfig[p.paymentMethod]?.label[lang] || p.paymentMethod,
      amount: p.amount,
      referenceNumber: p.referenceNumber || '—',
      paymentDate: formatDate(p.paymentDate, lang),
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
      { label: lang === 'ar' ? 'إجمالي المدفوع' : 'Total Paid', value: String(totalPaid) },
    ],
  }), [filtered, lang, totalPaid])

  return (
    <ModuleLayout
      title={{ ar: 'سداد الرواتب', en: 'Salary Payments' }}
      subtitle={{ ar: 'تسجيل ومتابعة صرف رواتب الموظفين', en: 'Record and track employee salary payments' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="salary-payment" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />{t('سداد جديد', 'New Payment', lang)}
          </Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Banknote className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{t('إجمالي المدفوع', 'Total Paid', lang)}</p>
              <MoneyDisplay value={totalPaid} mode="system" lang={lang} bold size="lg" className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertCircle className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600">{t('المتبقي', 'Remaining', lang)}</p>
              <MoneyDisplay value={totalRemaining} mode="system" lang={lang} bold size="lg" className="text-amber-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-violet-50 border-violet-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-violet-100 flex items-center justify-center">
              <BookOpen className="size-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm text-violet-600">{t('مسيرات معتمدة', 'Approved Runs', lang)}</p>
              <p className="text-lg font-bold text-violet-700">{approvedRunsCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t('بحث بكود المسير أو المرجع...', 'Search by run code or reference...', lang)}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={t('طريقة السداد', 'Payment Method', lang)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('الكل', 'All', lang)}</SelectItem>
                <SelectItem value="BANK">{t('بنكي', 'Bank', lang)}</SelectItem>
                <SelectItem value="CASH">{t('نقدي', 'Cash', lang)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p>
              <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Banknote className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t('لا توجد سداد رواتب', 'No salary payments', lang)}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" />{t('سداد جديد', 'New Payment', lang)}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('المسير', 'Payroll Run', lang)}</TableHead>
                    <TableHead className="text-right">{t('طريقة السداد', 'Method', lang)}</TableHead>
                    <TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead>
                    <TableHead className="text-right">{t('رقم المرجع', 'Reference', lang)}</TableHead>
                    <TableHead className="text-right">{t('تاريخ السداد', 'Payment Date', lang)}</TableHead>
                    <TableHead className="text-right">{t('ملاحظات', 'Notes', lang)}</TableHead>
                    <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => {
                    const pmCfg = paymentMethodConfig[p.paymentMethod]
                    const PmIcon = pmCfg.icon
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-mono font-medium">{p.payrollRun?.code || '—'}</span>
                            <span className="text-xs text-muted-foreground">
                              {p.payrollRun ? formatMonth(p.payrollRun.month, p.payrollRun.year, lang) : '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${pmCfg.bg} ${pmCfg.color} border-0 gap-1`}>
                            <PmIcon className="size-3" />
                            {pmCfg.label[lang]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <MoneyDisplay value={p.amount} mode="system" lang={lang} size="sm" bold />
                        </TableCell>
                        <TableCell dir="ltr" className="text-right">
                          {p.referenceNumber || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>{formatDate(p.paymentDate, lang)}</TableCell>
                        <TableCell className="max-w-32 truncate">
                          {p.notes || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {p.journalEntryId && (
                              <Badge className="bg-purple-100 text-purple-700 border-0 gap-1 text-xs">
                                <BookOpen className="size-3" />{t('قيد', 'Entry', lang)}
                              </Badge>
                            )}
                            {!p.journalEntryId && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-rose-600 hover:text-rose-700"
                                onClick={() => {
                                  if (confirm(t('هل أنت متأكد من حذف هذا السداد؟', 'Are you sure you want to delete this payment?', lang))) {
                                    deleteMutation.mutate(p.id)
                                  }
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
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

      {/* Create Payment Dialog */}
      <CreatePaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        payrollRuns={eligiblePayrollRuns}
      />
    </ModuleLayout>
  )
}

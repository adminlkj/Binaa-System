'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, Trash2, RefreshCw, Download,
  Eye, ArrowRight, Wallet, Clock, Shield, Users,
  ChevronRight, ChevronLeft, Send, CheckCircle2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { JePreview, JePreviewLine } from '@/components/shared/je-preview'
import { AccountSelector } from '@/components/shared/account-selector'
import { useAppStore, formatSAR, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
type PayrollRunStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID'
type SalaryType = 'MONTHLY' | 'HOURLY'

interface PayrollRunLine {
  id: string
  employeeId: string
  salaryType: SalaryType
  basicSalary: number
  housingAllowance: number
  transportAllowance: number
  otherAllowances: number
  workHours: number
  hourlyRate: number
  hourlySalary: number
  overtimeAmount: number
  deductions: number
  gosiDeduction: number
  totalEntitlement: number
  netSalary: number
  projectId: string | null
  employee: { id: string; code: string; name: string; nameAr: string | null; salaryType: SalaryType }
  project: { id: string; code: string; name: string; nameAr: string | null } | null
}

interface PayrollRun {
  id: string
  code: string
  month: number
  year: number
  status: PayrollRunStatus
  totalAmount: number
  totalDeductions: number
  totalNet: number
  notes: string | null
  journalEntryId: string | null
  createdAt: string
  updatedAt: string
  _count?: { lines: number }
  lines?: PayrollRunLine[]
  salaryPayments?: Array<{ id: string }>
}

interface WorkTeam {
  id: string; code: string; name: string; nameAr: string | null; projectId: string | null
  project: { id: string; code: string; name: string } | null
}

interface Project {
  id: string; code: string; name: string
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const statusConfig: Record<PayrollRunStatus, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-gray-700', bg: 'bg-gray-100' },
  REVIEW: { label: { ar: 'قيد المراجعة', en: 'Under Review' }, color: 'text-yellow-700', bg: 'bg-yellow-100' },
  APPROVED: { label: { ar: 'معتمد', en: 'Approved' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  PARTIALLY_PAID: { label: { ar: 'مدفوع جزئياً', en: 'Partially Paid' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  PAID: { label: { ar: 'مدفوع', en: 'Paid' }, color: 'text-green-700', bg: 'bg-green-100' },
}

function StatusBadge({ status, lang }: { status: PayrollRunStatus; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status]
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
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
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-24 animate-pulse rounded bg-gray-200" /><div className="h-5 w-32 animate-pulse rounded bg-gray-200" /><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Create Payroll Run Dialog ============
function CreatePayrollRunDialog({ open, onOpenChange }: {
  open: boolean; onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [form, setForm] = useState({
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
    selectionType: 'ALL' as 'ALL' | 'TEAM' | 'PROJECT',
    selectionIds: [] as string[],
    notes: '',
  })

  const { data: teams = [] } = useQuery<WorkTeam[]>({
    queryKey: ['work-teams'],
    queryFn: async () => { const res = await fetch('/api/work-teams'); if (!res.ok) return []; return res.json() },
    enabled: open,
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-list'],
    queryFn: async () => { const res = await fetch('/api/projects/list'); if (!res.ok) return []; return res.json() },
    enabled: open,
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/payroll-runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }).then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Error') }); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payroll-runs'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      month: parseInt(form.month),
      year: parseInt(form.year),
      selectionType: form.selectionType,
      selectionIds: form.selectionIds,
      notes: form.notes || null,
    })
  }

  const toggleSelection = (id: string) => {
    setForm(f => ({
      ...f,
      selectionIds: f.selectionIds.includes(id)
        ? f.selectionIds.filter(x => x !== id)
        : [...f.selectionIds, id],
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('إنشاء مسير رواتب', 'Create Payroll Run', lang)}</DialogTitle>
          <DialogDescription>{t('إنشاء مسير رواتب جديد للموظفين', 'Create a new payroll run for employees', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Month & Year */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-emerald-700 border-b border-emerald-200 pb-1">
              {t('الفترة', 'Period', lang)}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('الشهر *', 'Month *', lang)}</Label>
                <Select value={form.month} onValueChange={v => setForm(f => ({ ...f, month: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(lang === 'ar' ? arabicMonths : englishMonths).map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('السنة *', 'Year *', lang)}</Label>
                <Input type="number" min="2020" max="2099" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} dir="ltr" />
              </div>
            </div>
          </div>

          {/* Selection Type */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-violet-700 border-b border-violet-200 pb-1 flex items-center gap-2">
              <Users className="size-4" />
              {t('اختيار الموظفين', 'Employee Selection', lang)}
            </h4>
            <div className="space-y-2">
              <Label>{t('نوع الاختيار *', 'Selection Type *', lang)}</Label>
              <Select value={form.selectionType} onValueChange={(v: 'ALL' | 'TEAM' | 'PROJECT') => setForm(f => ({ ...f, selectionType: v, selectionIds: [] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('جميع الموظفين', 'All Employees', lang)}</SelectItem>
                  <SelectItem value="TEAM">{t('حسب فريق العمل', 'By Work Team', lang)}</SelectItem>
                  <SelectItem value="PROJECT">{t('حسب المشروع', 'By Project', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Team Selection */}
            {form.selectionType === 'TEAM' && (
              <div className="space-y-2">
                <Label>{t('اختر فرق العمل', 'Select Work Teams', lang)}</Label>
                <div className="border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                  {teams.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('لا توجد فرق عمل', 'No work teams found', lang)}</p>
                  ) : teams.map(team => (
                    <label key={team.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.selectionIds.includes(team.id)}
                        onChange={() => toggleSelection(team.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{team.code} - {team.name}{team.project ? ` (${team.project.name})` : ''}</span>
                    </label>
                  ))}
                </div>
                {form.selectionIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">{t(`${form.selectionIds.length} فرق محددة`, `${form.selectionIds.length} teams selected`, lang)}</p>
                )}
              </div>
            )}

            {/* Project Selection */}
            {form.selectionType === 'PROJECT' && (
              <div className="space-y-2">
                <Label>{t('اختر المشاريع', 'Select Projects', lang)}</Label>
                <div className="border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                  {projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('لا توجد مشاريع', 'No projects found', lang)}</p>
                  ) : projects.map(project => (
                    <label key={project.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.selectionIds.includes(project.id)}
                        onChange={() => toggleSelection(project.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{project.code} - {project.name}</span>
                    </label>
                  ))}
                </div>
                {form.selectionIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">{t(`${form.selectionIds.length} مشاريع محددة`, `${form.selectionIds.length} projects selected`, lang)}</p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('ملاحظات', 'Notes', lang)}</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>

          {createMutation.isError && (
            <p className="text-sm text-rose-600">{(createMutation.error as Error)?.message || t('حدث خطأ', 'An error occurred', lang)}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...', lang) : t('إنشاء المسير', 'Create Run', lang)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Payroll Run Detail View ============
function PayrollRunDetail({ payrollRun, onBack }: {
  payrollRun: PayrollRun; onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const lines = payrollRun.lines || []
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [bankAccountCode, setBankAccountCode] = useState('1120')
  const [bankAccountNameAr, setBankAccountNameAr] = useState('البنك')

  // Calculate totals from lines
  const totalGosi = lines.reduce((sum, l) => sum + (l.gosiDeduction || 0), 0)
  const totalOvertime = lines.reduce((sum, l) => sum + (l.overtimeAmount || 0), 0)

  // Compute JE preview lines for payroll payment
  const jeLines = useMemo<JePreviewLine[]>(() => {
    const totalAmount = payrollRun.totalAmount
    const totalNet = payrollRun.totalNet
    if (totalAmount <= 0 || !['APPROVED', 'PARTIALLY_PAID'].includes(payrollRun.status)) return []
    const lines: JePreviewLine[] = []
    // Debit: Salaries & Wages
    lines.push({ accountCode: '8110', accountNameAr: 'رواتب وأجور', debit: totalAmount, credit: 0 })
    // Debit: GOSI Expense if GOSI > 0
    if (totalGosi > 0) {
      lines.push({ accountCode: '8210', accountNameAr: 'تأمينات اجتماعية', debit: totalGosi, credit: 0 })
    }
    // Credit: Salaries Payable
    lines.push({ accountCode: '3310', accountNameAr: 'رواتب مستحقة', debit: 0, credit: totalAmount })
    // Credit: GOSI Payable if GOSI > 0
    if (totalGosi > 0) {
      lines.push({ accountCode: '3830', accountNameAr: 'تأمينات اجتماعية مستحقة', debit: 0, credit: totalGosi })
    }
    // Credit: Selected bank account
    lines.push({ accountCode: bankAccountCode, accountNameAr: bankAccountNameAr, debit: 0, credit: totalNet })
    return lines
  }, [payrollRun.totalAmount, payrollRun.totalNet, payrollRun.status, totalGosi, bankAccountCode, bankAccountNameAr])

  const statusMutation = useMutation({
    mutationFn: (status: PayrollRunStatus) => fetch(`/api/payroll-runs/${payrollRun.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll-runs'] }),
  })

  const printData = useMemo(() => ({
    columns: [
      { key: 'code', label: lang === 'ar' ? 'كود الموظف' : 'Emp. Code' },
      { key: 'name', label: lang === 'ar' ? 'الموظف' : 'Employee' },
      { key: 'salaryType', label: lang === 'ar' ? 'النوع' : 'Type' },
      { key: 'hours', label: lang === 'ar' ? 'الساعات' : 'Hours' },
      { key: 'totalEntitlement', label: lang === 'ar' ? 'الاستحقاق' : 'Entitlement' },
      { key: 'deductions', label: lang === 'ar' ? 'الخصومات' : 'Deductions' },
      { key: 'gosi', label: lang === 'ar' ? 'التأمينات' : 'GOSI' },
      { key: 'netSalary', label: lang === 'ar' ? 'الصافي' : 'Net' },
      { key: 'project', label: lang === 'ar' ? 'المشروع' : 'Project' },
    ],
    rows: lines.map(l => ({
      code: l.employee.code,
      name: l.employee.name,
      salaryType: l.salaryType === 'MONTHLY' ? (lang === 'ar' ? 'شهري' : 'Monthly') : (lang === 'ar' ? 'بالساعة' : 'Hourly'),
      hours: l.salaryType === 'HOURLY' ? l.workHours.toFixed(1) : '—',
      totalEntitlement: l.totalEntitlement.toFixed(2),
      deductions: l.deductions.toFixed(2),
      gosi: l.gosiDeduction.toFixed(2),
      netSalary: l.netSalary.toFixed(2),
      project: l.project?.name || '—',
    })),
    infoItems: [
      { label: lang === 'ar' ? 'كود المسير' : 'Run Code', value: payrollRun.code },
      { label: lang === 'ar' ? 'الفترة' : 'Period', value: formatMonth(payrollRun.month, payrollRun.year, lang) },
      { label: lang === 'ar' ? 'الحالة' : 'Status', value: statusConfig[payrollRun.status].label[lang] },
      { label: lang === 'ar' ? 'عدد الموظفين' : 'Employees', value: String(lines.length) },
    ],
  }), [lines, payrollRun, lang])

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'code', label: t('كود الموظف', 'Emp. Code', lang) },
      { key: 'name', label: t('الموظف', 'Employee', lang) },
      { key: 'salaryType', label: t('النوع', 'Type', lang) },
      { key: 'hours', label: t('الساعات', 'Hours', lang) },
      { key: 'totalEntitlement', label: t('الاستحقاق', 'Entitlement', lang) },
      { key: 'deductions', label: t('الخصومات', 'Deductions', lang) },
      { key: 'gosi', label: t('التأمينات', 'GOSI', lang) },
      { key: 'netSalary', label: t('الصافي', 'Net', lang) },
      { key: 'project', label: t('المشروع', 'Project', lang) },
    ]
    exportToCSV(lines.map(l => ({
      code: l.employee.code,
      name: l.employee.name,
      salaryType: l.salaryType === 'MONTHLY' ? 'Monthly' : 'Hourly',
      hours: l.salaryType === 'HOURLY' ? l.workHours.toFixed(1) : '—',
      totalEntitlement: l.totalEntitlement.toFixed(2),
      deductions: l.deductions.toFixed(2),
      gosi: l.gosiDeduction.toFixed(2),
      netSalary: l.netSalary.toFixed(2),
      project: l.project?.name || '—',
    })), `payroll-run-${payrollRun.code}`, columns)
  }

  const getNextStatus = (): PayrollRunStatus | null => {
    switch (payrollRun.status) {
      case 'DRAFT': return 'REVIEW'
      case 'REVIEW': return 'APPROVED'
      default: return null
    }
  }

  const getNextStatusLabel = () => {
    switch (payrollRun.status) {
      case 'DRAFT': return t('إرسال للمراجعة', 'Send for Review', lang)
      case 'REVIEW': return t('اعتماد', 'Approve', lang)
      default: return null
    }
  }

  const getNextStatusIcon = () => {
    switch (payrollRun.status) {
      case 'DRAFT': return <Send className="size-4" />
      case 'REVIEW': return <CheckCircle2 className="size-4" />
      default: return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Back button + Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack}>
            {lang === 'ar' ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
          <div>
            <h2 className="text-xl font-bold">{payrollRun.code}</h2>
            <p className="text-sm text-muted-foreground">
              {formatMonth(payrollRun.month, payrollRun.year, lang)}
            </p>
          </div>
          <StatusBadge status={payrollRun.status} lang={lang} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PrintButton type="generic-table" data={printData} size="sm" />
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1"><Download className="size-4" />{t('تصدير', 'Export', lang)}</Button>
          {getNextStatus() && (
            <Button
              className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                const next = getNextStatus()
                if (next && confirm(t(
                  payrollRun.status === 'DRAFT' ? 'هل تريد إرسال المسير للمراجعة؟' : 'هل تريد اعتماد المسير؟ سيتم إنشاء قيود محاسبية.',
                  payrollRun.status === 'DRAFT' ? 'Send this payroll run for review?' : 'Approve this payroll run? Journal entries will be created.',
                  lang
                ))) {
                  statusMutation.mutate(next)
                }
              }}
              disabled={statusMutation.isPending}
            >
              {getNextStatusIcon()}
              {getNextStatusLabel()}
            </Button>
          )}
        </div>
      </div>

      {/* Notes */}
      {payrollRun.notes && (
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{payrollRun.notes}</p>
        </CardContent></Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">{t('عدد الموظفين', 'Employees', lang)}</p>
          <p className="text-2xl font-bold">{lines.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">{t('إجمالي الاستحقاق', 'Total Entitlement', lang)}</p>
          <MoneyDisplay value={payrollRun.totalAmount} lang={lang} size="lg" bold />
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">{t('الخصومات', 'Deductions', lang)}</p>
          <MoneyDisplay value={payrollRun.totalDeductions} lang={lang} size="lg" bold />
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">{t('التأمينات', 'GOSI', lang)}</p>
          <MoneyDisplay value={totalGosi} lang={lang} size="lg" bold />
        </CardContent></Card>
        <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-4 text-center">
          <p className="text-xs text-emerald-600 mb-1">{t('صافي الرواتب', 'Net Salaries', lang)}</p>
          <MoneyDisplay value={payrollRun.totalNet} lang={lang} size="lg" bold />
        </CardContent></Card>
      </div>

      {/* Bank Account Selection & JE Preview - only for APPROVED or PARTIALLY_PAID */}
      {['APPROVED', 'PARTIALLY_PAID'].includes(payrollRun.status) && payrollRun.totalAmount > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('حساب الدفع والقيد المحاسبي', 'Payment Account & Journal Entry', lang)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AccountSelector
              roles={['BANK']}
              value={bankAccountId}
              onValueChange={(id, account) => {
                setBankAccountId(id)
                setBankAccountCode(account.code)
                setBankAccountNameAr(account.nameAr || account.name)
              }}
              label={t('حساب البنك للدفع', 'Bank Account for Payment', lang)}
              placeholder={t('اختر حساب البنك...', 'Select bank account...', lang)}
            />
            <JePreview lines={jeLines} title={t('القيد المحاسبي المتوقع', 'Expected Journal Entry', lang)} />
          </CardContent>
        </Card>
      )}

      {/* Lines Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('تفاصيل المسير', 'Run Details', lang)}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الموظف', 'Employee', lang)}</TableHead>
                <TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead>
                <TableHead className="text-right">{t('الساعات', 'Hours', lang)}</TableHead>
                <TableHead className="text-right">{t('الاستحقاق', 'Entitlement', lang)}</TableHead>
                <TableHead className="text-right">{t('الخصومات', 'Deductions', lang)}</TableHead>
                <TableHead className="text-right">{t('التأمينات', 'GOSI', lang)}</TableHead>
                <TableHead className="text-right">{t('الصافي', 'Net', lang)}</TableHead>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lines.map(line => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{line.employee.name}</span>
                        <span className="text-xs text-muted-foreground mr-1">{line.employee.code}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {line.salaryType === 'MONTHLY'
                          ? <><Wallet className="size-3" />{t('شهري', 'Monthly', lang)}</>
                          : <><Clock className="size-3" />{t('بالساعة', 'Hourly', lang)}</>
                        }
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {line.salaryType === 'HOURLY' ? line.workHours.toFixed(1) : '—'}
                    </TableCell>
                    <TableCell><MoneyDisplay value={line.totalEntitlement} lang={lang} size="sm" /></TableCell>
                    <TableCell>
                      {line.deductions > 0
                        ? <MoneyDisplay value={line.deductions} lang={lang} size="sm" />
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell>
                      {line.gosiDeduction > 0
                        ? <MoneyDisplay value={line.gosiDeduction} lang={lang} size="sm" />
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell><MoneyDisplay value={line.netSalary} lang={lang} size="sm" bold /></TableCell>
                    <TableCell className="text-sm">{line.project?.name || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Main Payroll Runs Module ============
export function PayrollRunsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const { data: payrollRuns = [], isLoading, isError, refetch } = useQuery<PayrollRun[]>({
    queryKey: ['payroll-runs'],
    queryFn: async () => { const res = await fetch('/api/payroll-runs'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: selectedRun, isLoading: isLoadingDetail } = useQuery<PayrollRun>({
    queryKey: ['payroll-runs', selectedRunId],
    queryFn: async () => { const res = await fetch(`/api/payroll-runs/${selectedRunId}`); if (!res.ok) throw new Error(); return res.json() },
    enabled: !!selectedRunId,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/payroll-runs/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.error) }); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll-runs'] }),
  })

  const filtered = payrollRuns.filter(run => {
    if (search && !run.code.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== 'all' && run.status !== statusFilter) return false
    return true
  })

  const printData = useMemo(() => ({
    columns: [
      { key: 'code', label: lang === 'ar' ? 'كود المسير' : 'Run Code' },
      { key: 'period', label: lang === 'ar' ? 'الفترة' : 'Period' },
      { key: 'employees', label: lang === 'ar' ? 'عدد الموظفين' : 'Employees' },
      { key: 'totalAmount', label: lang === 'ar' ? 'الإجمالي' : 'Total' },
      { key: 'totalNet', label: lang === 'ar' ? 'الصافي' : 'Net' },
      { key: 'status', label: lang === 'ar' ? 'الحالة' : 'Status' },
    ],
    rows: filtered.map(run => ({
      code: run.code,
      period: formatMonth(run.month, run.year, lang),
      employees: String(run._count?.lines || 0),
      totalAmount: run.totalAmount.toFixed(2),
      totalNet: run.totalNet.toFixed(2),
      status: statusConfig[run.status].label[lang],
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
    ],
  }), [filtered, lang])

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'code', label: t('كود المسير', 'Run Code', lang) },
      { key: 'period', label: t('الفترة', 'Period', lang) },
      { key: 'employees', label: t('عدد الموظفين', 'Employees', lang) },
      { key: 'totalAmount', label: t('الإجمالي', 'Total', lang) },
      { key: 'totalNet', label: t('الصافي', 'Net', lang) },
      { key: 'status', label: t('الحالة', 'Status', lang) },
    ]
    exportToCSV(filtered.map(run => ({
      code: run.code,
      period: formatMonth(run.month, run.year, 'en'),
      employees: String(run._count?.lines || 0),
      totalAmount: run.totalAmount.toFixed(2),
      totalNet: run.totalNet.toFixed(2),
      status: run.status,
    })), `payroll-runs-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  // Detail view (conditional returns after all hooks)
  if (selectedRunId && selectedRun) {
    return (
      <ModuleLayout
        title={{ ar: 'مسيرات الرواتب', en: 'Payroll Runs' }}
        subtitle={{ ar: 'إدارة مسيرات رواتب الموظفين', en: 'Manage employee payroll runs' }}
      >
        <PayrollRunDetail payrollRun={selectedRun} onBack={() => setSelectedRunId(null)} />
      </ModuleLayout>
    )
  }

  if (selectedRunId && isLoadingDetail) {
    return (
      <ModuleLayout
        title={{ ar: 'مسيرات الرواتب', en: 'Payroll Runs' }}
        subtitle={{ ar: 'إدارة مسيرات رواتب الموظفين', en: 'Manage employee payroll runs' }}
      >
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="size-8 animate-spin text-muted-foreground" />
        </div>
      </ModuleLayout>
    )
  }

  return (
    <ModuleLayout
      title={{ ar: 'مسيرات الرواتب', en: 'Payroll Runs' }}
      subtitle={{ ar: 'إدارة مسيرات رواتب الموظفين', en: 'Manage employee payroll runs' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="size-4" />{t('مسير جديد', 'New Run', lang)}
          </Button>
        </div>
      }
    >
      {/* Search & Filter */}
      <Card><CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t('بحث بكود المسير...', 'Search by run code...', lang)}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t('الحالة', 'Status', lang)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('جميع الحالات', 'All Statuses', lang)}</SelectItem>
              <SelectItem value="DRAFT">{t('مسودة', 'Draft', lang)}</SelectItem>
              <SelectItem value="REVIEW">{t('قيد المراجعة', 'Under Review', lang)}</SelectItem>
              <SelectItem value="APPROVED">{t('معتمد', 'Approved', lang)}</SelectItem>
              <SelectItem value="PARTIALLY_PAID">{t('مدفوع جزئياً', 'Partially Paid', lang)}</SelectItem>
              <SelectItem value="PAID">{t('مدفوع', 'Paid', lang)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p>
            <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <FileText className="size-12 text-gray-300" />
            <p className="text-muted-foreground">{t('لا توجد مسيرات رواتب', 'No payroll runs', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="size-4 mr-1" />{t('إنشاء مسير', 'Create Run', lang)}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('كود المسير', 'Run Code', lang)}</TableHead>
                <TableHead className="text-right">{t('الشهر', 'Month', lang)}</TableHead>
                <TableHead className="text-right">{t('السنة', 'Year', lang)}</TableHead>
                <TableHead className="text-right">{t('عدد الموظفين', 'Employees', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead className="text-right">{t('الصافي', 'Net', lang)}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(run => (
                  <TableRow key={run.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedRunId(run.id)}>
                    <TableCell className="font-medium font-mono">{run.code}</TableCell>
                    <TableCell>{formatMonth(run.month, run.year, lang)}</TableCell>
                    <TableCell className="font-mono">{run.year}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="gap-1">
                        <Users className="size-3" />
                        {run._count?.lines || 0}
                      </Badge>
                    </TableCell>
                    <TableCell><MoneyDisplay value={run.totalAmount} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={run.totalNet} lang={lang} size="sm" bold /></TableCell>
                    <TableCell><StatusBadge status={run.status} lang={lang} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => setSelectedRunId(run.id)}>
                          <Eye className="size-4" />
                        </Button>
                        {run.status === 'DRAFT' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-rose-600 hover:text-rose-700"
                            onClick={() => {
                              if (confirm(t('هل أنت متأكد من حذف المسير؟', 'Are you sure you want to delete this run?', lang))) {
                                deleteMutation.mutate(run.id)
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <CreatePayrollRunDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </ModuleLayout>
  )
}

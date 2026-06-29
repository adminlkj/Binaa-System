'use client'

// ============================================================================
// كشوف الرواتب - Professional Payroll Statements
// ============================================================================
// Features:
//   - Professional filters (project / work team / salary type / specific employees)
//   - Full salary detail per employee (15 columns)
//   - Aggregate totals via TableFooter
//   - Print + CSV export with totals section
//   - APPROVED creates accrual journal entry; PAID creates separate payment entry
// ============================================================================

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, Trash2, RefreshCw, Download,
  Eye, ArrowRight, Wallet, Clock, Shield, Users,
  ChevronRight, ChevronLeft, Send, CheckCircle2, Filter, X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
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
  workTeamId: string | null
  employee: { id: string; code: string; name: string; nameAr: string | null; salaryType: SalaryType }
  project: { id: string; code: string; name: string; nameAr: string | null } | null
  workTeam: { id: string; code: string; name: string; nameAr: string | null } | null
}

interface PayrollRun {
  id: string
  code: string
  month: number
  year: number
  status: PayrollRunStatus
  totalAmount: number
  totalDeductions: number
  totalGosi: number
  totalNet: number
  notes: string | null
  journalEntryId: string | null
  paymentJournalEntryId: string | null
  paymentAccountCode: string | null
  paymentAccountNameAr: string | null
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

interface EmployeeOption {
  id: string; code: string; name: string; nameAr: string | null; salaryType: SalaryType
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
  const cfg = statusConfig[status] || { label: { ar: status, en: status }, color: 'text-gray-700', bg: 'bg-gray-100' }
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
    selectionType: 'ALL' as 'ALL' | 'TEAM' | 'PROJECT' | 'EMPLOYEE',
    selectionIds: [] as string[],
    salaryTypeFilter: '' as '' | 'MONTHLY' | 'HOURLY',
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

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['employees-list-active'],
    queryFn: async () => { const res = await fetch('/api/employees'); if (!res.ok) return []; return res.json() },
    enabled: open && form.selectionType === 'EMPLOYEE',
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
      salaryTypeFilter: form.salaryTypeFilter || null,
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
          <DialogTitle>{t('إنشاء كشف رواتب', 'Create Payroll Statement', lang)}</DialogTitle>
          <DialogDescription>{t('إنشاء كشف رواتب جديد للموظفين بفلاتر احترافية', 'Create a new payroll statement with professional filters', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Period */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-emerald-700 border-b border-emerald-200 pb-1">
              {t('الفترة', 'Period', lang)}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* Salary Type Filter */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-amber-700 border-b border-amber-200 pb-1 flex items-center gap-2">
              <Wallet className="size-4" />
              {t('فلترة نوع الراتب', 'Salary Type Filter', lang)}
            </h4>
            <Select
              value={form.salaryTypeFilter || 'ALL'}
              onValueChange={(v: string) => setForm(f => ({ ...f, salaryTypeFilter: v === 'ALL' ? '' : v as 'MONTHLY' | 'HOURLY' }))}
            >
              <SelectTrigger><SelectValue placeholder={t('جميع الأنواع', 'All Types', lang)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('جميع الأنواع', 'All Types', lang)}</SelectItem>
                <SelectItem value="MONTHLY">{t('شهري', 'Monthly', lang)}</SelectItem>
                <SelectItem value="HOURLY">{t('بالساعة', 'Hourly', lang)}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selection */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-violet-700 border-b border-violet-200 pb-1 flex items-center gap-2">
              <Users className="size-4" />
              {t('اختيار الموظفين', 'Employee Selection', lang)}
            </h4>
            <div className="space-y-2">
              <Label>{t('نوع الاختيار *', 'Selection Type *', lang)}</Label>
              <Select
                value={form.selectionType}
                onValueChange={(v: 'ALL' | 'TEAM' | 'PROJECT' | 'EMPLOYEE') =>
                  setForm(f => ({ ...f, selectionType: v, selectionIds: [] }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('جميع الموظفين', 'All Employees', lang)}</SelectItem>
                  <SelectItem value="TEAM">{t('حسب فريق العمل', 'By Work Team', lang)}</SelectItem>
                  <SelectItem value="PROJECT">{t('حسب المشروع', 'By Project', lang)}</SelectItem>
                  <SelectItem value="EMPLOYEE">{t('موظفون محددون', 'Specific Employees', lang)}</SelectItem>
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
                      <input type="checkbox" checked={form.selectionIds.includes(team.id)} onChange={() => toggleSelection(team.id)} className="rounded border-gray-300" />
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
                      <input type="checkbox" checked={form.selectionIds.includes(project.id)} onChange={() => toggleSelection(project.id)} className="rounded border-gray-300" />
                      <span className="text-sm">{project.code} - {project.name}</span>
                    </label>
                  ))}
                </div>
                {form.selectionIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">{t(`${form.selectionIds.length} مشاريع محددة`, `${form.selectionIds.length} projects selected`, lang)}</p>
                )}
              </div>
            )}

            {/* Specific Employees */}
            {form.selectionType === 'EMPLOYEE' && (
              <div className="space-y-2">
                <Label>{t('اختر الموظفين', 'Select Employees', lang)}</Label>
                <div className="border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                  {employees.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('لا يوجد موظفون', 'No employees found', lang)}</p>
                  ) : employees.map(emp => (
                    <label key={emp.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={form.selectionIds.includes(emp.id)} onChange={() => toggleSelection(emp.id)} className="rounded border-gray-300" />
                      <span className="text-sm">{emp.code} - {emp.nameAr || emp.name}</span>
                      <Badge variant="outline" className="text-xs mr-auto">
                        {emp.salaryType === 'MONTHLY' ? t('شهري', 'Monthly', lang) : t('بالساعة', 'Hourly', lang)}
                      </Badge>
                    </label>
                  ))}
                </div>
                {form.selectionIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">{t(`${form.selectionIds.length} موظف محدد`, `${form.selectionIds.length} employees selected`, lang)}</p>
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
              {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...', lang) : t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Payroll Run Detail View (15-column full breakdown) ============
function PayrollRunDetail({ payrollRun, onBack }: {
  payrollRun: PayrollRun; onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const lines: PayrollRunLine[] = payrollRun.lines ?? []

  // Bank account selection for payment (APPROVED -> PAID)
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [bankAccountCode, setBankAccountCode] = useState('1120')
  const [bankAccountNameAr, setBankAccountNameAr] = useState('البنك')

  // ============ Column totals (15-column full breakdown) ============
  // الحقول تأتي من Prisma Decimal كنصوص — حوّلها لرقم دائماً
  const totalBasic = lines.reduce((sum, l) => sum + Number(l.salaryType === 'MONTHLY' ? (l.basicSalary || 0) : (l.hourlySalary || 0)), 0)
  const totalHousing = lines.reduce((sum, l) => sum + Number(l.housingAllowance || 0), 0)
  const totalTransport = lines.reduce((sum, l) => sum + Number(l.transportAllowance || 0), 0)
  const totalOther = lines.reduce((sum, l) => sum + Number(l.otherAllowances || 0), 0)
  const totalOvertime = lines.reduce((sum, l) => sum + Number(l.overtimeAmount || 0), 0)
  const totalGosi = lines.reduce((sum, l) => sum + Number(l.gosiDeduction || 0), 0)
  const totalDeductions = lines.reduce((sum, l) => sum + Number(l.deductions || 0), 0)
  const totalHours = lines.reduce((sum, l) => sum + Number(l.workHours || 0), 0)

  // JE preview lines for payroll payment (separate from accrual)
  const jeLines = useMemo<JePreviewLine[]>(() => {
    const totalNet = Number(payrollRun.totalNet)
    if (totalNet <= 0 || payrollRun.status !== 'APPROVED') return []
    return [
      { accountCode: '3310', accountNameAr: 'رواتب مستحقة', debit: totalNet, credit: 0 },
      { accountCode: bankAccountCode, accountNameAr: bankAccountNameAr, debit: 0, credit: totalNet },
    ]
  }, [payrollRun.totalNet, payrollRun.status, bankAccountCode, bankAccountNameAr])

  const statusMutation = useMutation({
    mutationFn: (payload: { status: PayrollRunStatus; bankAccountCode?: string; bankAccountNameAr?: string }) =>
      fetch(`/api/payroll-runs/${payrollRun.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => {
        if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Error') })
        return r.json()
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll-runs'] }),
  })

  // ============ Print data: 15 columns + showCurrency + 9 totals ============
  const printData = {
    showCurrency: true,
    columns: [
      { key: 'code', label: lang === 'ar' ? 'كود الموظف' : 'Emp. Code' },
      { key: 'name', label: lang === 'ar' ? 'الموظف' : 'Employee' },
      { key: 'salaryType', label: lang === 'ar' ? 'النوع' : 'Type' },
      { key: 'basic', label: lang === 'ar' ? 'الراتب الأساسي' : 'Basic Salary', type: 'amount' as const },
      { key: 'hours', label: lang === 'ar' ? 'الساعات' : 'Hours' },
      { key: 'hourlyRate', label: lang === 'ar' ? 'معدل الساعة' : 'Hourly Rate', type: 'amount' as const },
      { key: 'housing', label: lang === 'ar' ? 'بدل السكن' : 'Housing', type: 'amount' as const },
      { key: 'transport', label: lang === 'ar' ? 'بدل النقل' : 'Transport', type: 'amount' as const },
      { key: 'other', label: lang === 'ar' ? 'بدلات أخرى' : 'Other Allow.', type: 'amount' as const },
      { key: 'overtime', label: lang === 'ar' ? 'حوافز/عمل إضافي' : 'Overtime', type: 'amount' as const },
      { key: 'totalEntitlement', label: lang === 'ar' ? 'إجمالي الاستحقاق' : 'Total Entitlement', type: 'amount' as const },
      { key: 'deductions', label: lang === 'ar' ? 'الخصومات' : 'Deductions', type: 'amount' as const },
      { key: 'gosi', label: lang === 'ar' ? 'التأمينات' : 'GOSI', type: 'amount' as const },
      { key: 'netSalary', label: lang === 'ar' ? 'الصافي' : 'Net', type: 'amount' as const },
      { key: 'project', label: lang === 'ar' ? 'المشروع' : 'Project' },
    ],
    rows: lines.map(l => ({
      code: l.employee.code,
      name: l.employee.nameAr || l.employee.name,
      salaryType: l.salaryType === 'MONTHLY' ? (lang === 'ar' ? 'شهري' : 'Monthly') : (lang === 'ar' ? 'بالساعة' : 'Hourly'),
      basic: Number(l.salaryType === 'MONTHLY' ? l.basicSalary : l.hourlySalary).toFixed(2),
      hours: l.salaryType === 'HOURLY' ? Number(l.workHours).toFixed(1) : '—',
      hourlyRate: l.salaryType === 'HOURLY' ? Number(l.hourlyRate).toFixed(2) : '—',
      housing: Number(l.housingAllowance).toFixed(2),
      transport: Number(l.transportAllowance).toFixed(2),
      other: Number(l.otherAllowances).toFixed(2),
      overtime: Number(l.overtimeAmount).toFixed(2),
      totalEntitlement: Number(l.totalEntitlement).toFixed(2),
      deductions: Number(l.deductions).toFixed(2),
      gosi: Number(l.gosiDeduction).toFixed(2),
      netSalary: Number(l.netSalary).toFixed(2),
      project: l.project?.nameAr || l.project?.name || '—',
    })),
    totals: [
      { label: lang === 'ar' ? 'إجمالي الراتب الأساسي' : 'Total Basic Salary', value: totalBasic },
      { label: lang === 'ar' ? 'إجمالي بدل السكن' : 'Total Housing', value: totalHousing },
      { label: lang === 'ar' ? 'إجمالي بدل النقل' : 'Total Transport', value: totalTransport },
      { label: lang === 'ar' ? 'إجمالي البدلات الأخرى' : 'Total Other Allowances', value: totalOther },
      { label: lang === 'ar' ? 'إجمالي الحوافز/العمل الإضافي' : 'Total Overtime', value: totalOvertime },
      { label: lang === 'ar' ? 'إجمالي الاستحقاق' : 'Total Entitlement', value: Number(payrollRun.totalAmount) },
      { label: lang === 'ar' ? 'إجمالي الخصومات' : 'Total Deductions', value: totalDeductions },
      { label: lang === 'ar' ? 'إجمالي التأمينات' : 'Total GOSI', value: totalGosi },
      { label: lang === 'ar' ? 'إجمالي الصافي' : 'Total Net', value: Number(payrollRun.totalNet), isGrand: true },
    ],
    infoItems: [
      { label: lang === 'ar' ? 'كود الكشف' : 'Statement Code', value: payrollRun.code },
      { label: lang === 'ar' ? 'الفترة' : 'Period', value: formatMonth(payrollRun.month, payrollRun.year, lang) },
      { label: lang === 'ar' ? 'الحالة' : 'Status', value: (statusConfig[payrollRun.status as PayrollRunStatus] || { label: { ar: payrollRun.status, en: payrollRun.status } }).label[lang] },
      { label: lang === 'ar' ? 'عدد الموظفين' : 'Employees', value: String(lines.length) },
    ],
  }

  // ============ CSV export: same 15 columns ============
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'code', label: t('كود الموظف', 'Emp. Code', lang) },
      { key: 'name', label: t('الموظف', 'Employee', lang) },
      { key: 'salaryType', label: t('النوع', 'Type', lang) },
      { key: 'basic', label: t('الراتب الأساسي', 'Basic Salary', lang) },
      { key: 'hours', label: t('الساعات', 'Hours', lang) },
      { key: 'hourlyRate', label: t('معدل الساعة', 'Hourly Rate', lang) },
      { key: 'housing', label: t('بدل السكن', 'Housing', lang) },
      { key: 'transport', label: t('بدل النقل', 'Transport', lang) },
      { key: 'other', label: t('بدلات أخرى', 'Other Allow.', lang) },
      { key: 'overtime', label: t('حوافز/عمل إضافي', 'Overtime', lang) },
      { key: 'totalEntitlement', label: t('إجمالي الاستحقاق', 'Total Entitlement', lang) },
      { key: 'deductions', label: t('الخصومات', 'Deductions', lang) },
      { key: 'gosi', label: t('التأمينات', 'GOSI', lang) },
      { key: 'netSalary', label: t('الصافي', 'Net', lang) },
      { key: 'project', label: t('المشروع', 'Project', lang) },
    ]
    exportToCSV(lines.map(l => ({
      code: l.employee.code,
      name: l.employee.nameAr || l.employee.name,
      salaryType: l.salaryType === 'MONTHLY' ? 'Monthly' : 'Hourly',
      basic: Number(l.salaryType === 'MONTHLY' ? l.basicSalary : l.hourlySalary).toFixed(2),
      hours: l.salaryType === 'HOURLY' ? Number(l.workHours).toFixed(1) : '—',
      hourlyRate: l.salaryType === 'HOURLY' ? Number(l.hourlyRate).toFixed(2) : '—',
      housing: Number(l.housingAllowance).toFixed(2),
      transport: Number(l.transportAllowance).toFixed(2),
      other: Number(l.otherAllowances).toFixed(2),
      overtime: Number(l.overtimeAmount).toFixed(2),
      totalEntitlement: Number(l.totalEntitlement).toFixed(2),
      deductions: Number(l.deductions).toFixed(2),
      gosi: Number(l.gosiDeduction).toFixed(2),
      netSalary: Number(l.netSalary).toFixed(2),
      project: l.project?.nameAr || l.project?.name || '—',
    })), `payroll-statement-${payrollRun.code}`, columns)
  }

  const handleApprove = () => {
    if (confirm(t(
      'هل تريد اعتماد كشف الرواتب؟ سيتم إنشاء قيد محاسبي للاستحقاق (مدين رواتب / دائن رواتب مستحقة).',
      'Approve this payroll statement? An accrual journal entry will be created (Dr Salaries / Cr Salaries Payable).',
      lang,
    ))) {
      statusMutation.mutate({ status: 'APPROVED' })
    }
  }

  const handlePay = () => {
    if (!bankAccountId) {
      toast.error(t('يرجى اختيار حساب البنك للدفع أولاً', 'Please select a bank account for payment first', lang))
      return
    }
    if (confirm(t(
      'هل تريد صرف الرواتب؟ سيتم إنشاء قيد دفع مستقل (مدين رواتب مستحقة / دائن البنك).',
      'Pay these salaries? A separate payment journal entry will be created (Dr Salaries Payable / Cr Bank).',
      lang,
    ))) {
      statusMutation.mutate({
        status: 'PAID',
        bankAccountCode,
        bankAccountNameAr,
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
            <Download className="size-4" />{t('تصدير', 'Export', lang)}
          </Button>
          {payrollRun.status === 'DRAFT' && (
            <Button
              className="gap-1 bg-amber-600 hover:bg-amber-700"
              onClick={() => statusMutation.mutate({ status: 'REVIEW' })}
              disabled={statusMutation.isPending}
            >
              <Send className="size-4" />{t('إرسال للمراجعة', 'Send for Review', lang)}
            </Button>
          )}
          {payrollRun.status === 'REVIEW' && (
            <Button
              className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleApprove}
              disabled={statusMutation.isPending}
            >
              <CheckCircle2 className="size-4" />{t('اعتماد وترحيل', 'Approve & Post', lang)}
            </Button>
          )}
          {payrollRun.status === 'APPROVED' && (
            <Button
              className="gap-1 bg-green-600 hover:bg-green-700"
              onClick={handlePay}
              disabled={statusMutation.isPending}
            >
              <Wallet className="size-4" />{t('صرف الرواتب', 'Pay Salaries', lang)}
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

      {/* Bank Account Selection & Payment JE Preview - only for APPROVED */}
      {payrollRun.status === 'APPROVED' && Number(payrollRun.totalNet) > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="size-5 text-emerald-600" />
              {t('حساب الدفع والقيد المحاسبي', 'Payment Account & Journal Entry', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ─── Payment Account selector ──────────────────────────── */}
            {/* Single dropdown shows BOTH cash and bank accounts so the user
                can pick any payment method in one place.
                We keep `roles` mode here because:
                  - filterByProperty uses AND (not OR), so
                    { showInCash: true, showInBank: true } would return only
                    accounts flagged for BOTH — wrong.
                  - The role-based query (?role=BANK,CASH) returns the union.
                The accountant can still control which accounts appear by
                setting showInCash / showInBank properties, but the default
                query here uses roles to get the union reliably. */}
            <AccountSelector
              roles={['BANK', 'CASH']}
              value={bankAccountId}
              onValueChange={(id, account) => {
                setBankAccountId(id)
                setBankAccountCode(account.code)
                setBankAccountNameAr(account.nameAr || account.name)
              }}
              label={t('حساب الدفع (بنك/صندوق)', 'Payment Account (Bank/Cash)', lang)}
              placeholder={t('اختر حساب الدفع...', 'Select payment account...', lang)}
            />
            <JePreview lines={jeLines} title={t('قيد الدفع المتوقع', 'Expected Payment Journal Entry', lang)} />
            {statusMutation.isError && (
              <p className="text-sm text-rose-600">{(statusMutation.error as Error)?.message}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Journal Entry References */}
      {(payrollRun.journalEntryId || payrollRun.paymentJournalEntryId) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="size-4 text-teal-600" />
              {t('القيود المحاسبية المرتبطة', 'Linked Journal Entries', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {payrollRun.journalEntryId && (
              <div className="flex items-center justify-between p-2 bg-emerald-50 rounded">
                <span className="text-emerald-700">{t('قيد الاستحقاق', 'Accrual Entry', lang)}</span>
                <Badge variant="outline" className="font-mono">{payrollRun.journalEntryId.slice(-8)}</Badge>
              </div>
            )}
            {payrollRun.paymentJournalEntryId && (
              <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                <span className="text-green-700">
                  {t('قيد الدفع', 'Payment Entry', lang)}
                  {payrollRun.paymentAccountNameAr && ` (${payrollRun.paymentAccountNameAr})`}
                </span>
                <Badge variant="outline" className="font-mono">{payrollRun.paymentJournalEntryId.slice(-8)}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lines Table - 15-column full breakdown with TableFooter totals */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="size-4 text-violet-600" />
            {t('تفاصيل كشف الرواتب', 'Payroll Statement Details', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1500px]">
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-right whitespace-nowrap">{t('كود', 'Code', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('الموظف', 'Employee', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('النوع', 'Type', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('أساسي/أجر', 'Basic/Wage', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('الساعات', 'Hours', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('معدل الساعة', 'Hourly Rate', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('بدل سكن', 'Housing', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('بدل نقل', 'Transport', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('بدلات أخرى', 'Other', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('حوافز', 'Overtime', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap font-semibold">{t('الاستحقاق', 'Entitlement', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('الخصومات', 'Deductions', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('التأمينات', 'GOSI', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap font-semibold">{t('الصافي', 'Net', lang)}</TableHead>
                  <TableHead className="text-right whitespace-nowrap">{t('المشروع/الفريق', 'Project/Team', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map(line => (
                  <TableRow key={line.id} className="hover:bg-gray-50">
                    <TableCell className="font-mono text-xs">{line.employee.code}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{line.employee.nameAr || line.employee.name}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 text-xs">
                        {line.salaryType === 'MONTHLY'
                          ? <><Wallet className="size-3" />{t('شهري', 'Monthly', lang)}</>
                          : <><Clock className="size-3" />{t('بالساعة', 'Hourly', lang)}</>
                        }
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {line.salaryType === 'MONTHLY'
                        ? formatSAR(line.basicSalary)
                        : formatSAR(line.hourlySalary)
                      }
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {line.salaryType === 'HOURLY' ? line.workHours.toFixed(1) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {line.salaryType === 'HOURLY' ? formatSAR(line.hourlyRate) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {line.housingAllowance > 0 ? formatSAR(line.housingAllowance) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {line.transportAllowance > 0 ? formatSAR(line.transportAllowance) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {line.otherAllowances > 0 ? formatSAR(line.otherAllowances) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {line.overtimeAmount > 0 ? formatSAR(line.overtimeAmount) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold">
                      {formatSAR(line.totalEntitlement)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-rose-600">
                      {line.deductions > 0 ? formatSAR(line.deductions) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-orange-600">
                      {line.gosiDeduction > 0 ? formatSAR(line.gosiDeduction) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-emerald-700">
                      {formatSAR(line.netSalary)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{line.project?.nameAr || line.project?.name || <span className="text-muted-foreground">—</span>}</div>
                      {line.workTeam && (
                        <div className="text-[10px] text-muted-foreground">{line.workTeam.nameAr || line.workTeam.name}</div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-gray-100 font-bold">
                  <TableCell colSpan={3} className="text-right">
                    {t('الإجماليات', 'Totals', lang)} ({lines.length} {t('موظف', 'employees', lang)})
                  </TableCell>
                  <TableCell className="font-mono text-xs">{formatSAR(totalBasic)}</TableCell>
                  <TableCell className="font-mono text-xs">{totalHours.toFixed(1)}</TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell className="font-mono text-xs">{formatSAR(totalHousing)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatSAR(totalTransport)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatSAR(totalOther)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatSAR(totalOvertime)}</TableCell>
                  <TableCell className="font-mono text-xs font-bold">{formatSAR(payrollRun.totalAmount)}</TableCell>
                  <TableCell className="font-mono text-xs text-rose-600">{formatSAR(totalDeductions)}</TableCell>
                  <TableCell className="font-mono text-xs text-orange-600">{formatSAR(totalGosi)}</TableCell>
                  <TableCell className="font-mono text-xs font-bold text-emerald-700">{formatSAR(payrollRun.totalNet)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Main Payroll Runs Module (كشوف الرواتب) ============
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
      { key: 'code', label: lang === 'ar' ? 'كود الكشف' : 'Statement Code' },
      { key: 'period', label: lang === 'ar' ? 'الفترة' : 'Period' },
      { key: 'employees', label: lang === 'ar' ? 'عدد الموظفين' : 'Employees' },
      { key: 'totalAmount', label: lang === 'ar' ? 'الإجمالي' : 'Total', type: 'amount' as const },
      { key: 'totalNet', label: lang === 'ar' ? 'الصافي' : 'Net', type: 'amount' as const },
      { key: 'status', label: lang === 'ar' ? 'الحالة' : 'Status' },
    ],
    rows: filtered.map(run => ({
      code: run.code,
      period: formatMonth(run.month, run.year, lang),
      employees: String(run._count?.lines || 0),
      // الحقول تأتي من Prisma Decimal كنصوص — حوّلها لرقم أولاً
      totalAmount: Number(run.totalAmount || 0).toFixed(2),
      totalNet: Number(run.totalNet || 0).toFixed(2),
      status: statusConfig[run.status as PayrollRunStatus]?.label?.[lang] || run.status,
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
    ],
  }), [filtered, lang])

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'code', label: t('كود الكشف', 'Statement Code', lang) },
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
      totalAmount: Number(run.totalAmount || 0).toFixed(2),
      totalNet: Number(run.totalNet || 0).toFixed(2),
      status: run.status,
    })), `payroll-statements-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  // Detail view
  if (selectedRunId && selectedRun) {
    return (
      <ModuleLayout
        title={{ ar: 'مسيرات الرواتب', en: 'Payroll Runs' }}
        subtitle={{ ar: 'كشف تفصيلي برواتب الموظفين مع القيود المحاسبية', en: 'Detailed payroll runs with journal entries' }}
      >
        <PayrollRunDetail payrollRun={selectedRun} onBack={() => setSelectedRunId(null)} />
      </ModuleLayout>
    )
  }

  if (selectedRunId && isLoadingDetail) {
    return (
      <ModuleLayout
        title={{ ar: 'مسيرات الرواتب', en: 'Payroll Runs' }}
        subtitle={{ ar: 'كشف تفصيلي برواتب الموظفين', en: 'Detailed payroll runs' }}
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
      subtitle={{ ar: 'إدارة مسيرات رواتب الموظفين بفلاتر احترافية وتفاصيل كاملة', en: 'Manage payroll runs with professional filters and full details' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="size-4" />{t('كشف جديد', 'New Statement', lang)}
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
              placeholder={t('بحث بكود الكشف...', 'Search by statement code...', lang)}
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
            <p className="text-muted-foreground">{t('لا توجد كشوف رواتب', 'No payroll statements', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="size-4 mr-1" />{t('إنشاء كشف', 'Create Statement', lang)}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('كود الكشف', 'Code', lang)}</TableHead>
                <TableHead className="text-right">{t('الفترة', 'Period', lang)}</TableHead>
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
                              if (confirm(t('هل أنت متأكد من حذف الكشف؟', 'Are you sure you want to delete this statement?', lang))) {
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

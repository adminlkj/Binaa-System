'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Banknote, Plus, Search, Trash2, RefreshCw, CheckCircle,
  Printer, Download, BookOpen,
} from 'lucide-react'
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
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { useAppStore } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
interface Employee { id: string; code: string; name: string; nameAr: string | null; basicSalary: number }

interface EmployeeContract {
  id: string; basicSalary: number; housingAllowance: number
  transportAllowance: number; otherAllowances: number
}

interface SalaryRecord {
  id: string; employeeId: string; month: number; year: number
  basicSalary: number; totalAllowances: number; overtimeAmount: number
  deductions: number; netSalary: number; status: string
  journalEntryId: string | null
  employee: Employee
}

interface SalaryFormData {
  employeeId: string; month: string; year: string
  basicSalary: string; totalAllowances: string; overtimeAmount: string; deductions: string
}

const defaultForm: SalaryFormData = {
  employeeId: '', month: '', year: '',
  basicSalary: '0', totalAllowances: '0', overtimeAmount: '0', deductions: '0',
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-yellow-700', bg: 'bg-yellow-100' },
  APPROVED: { label: { ar: 'معتمد', en: 'Approved' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  PAID: { label: { ar: 'مدفوع', en: 'Paid' }, color: 'text-blue-700', bg: 'bg-blue-100' },
}

function SalaryStatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

const monthNames = [
  { ar: 'يناير', en: 'January' }, { ar: 'فبراير', en: 'February' }, { ar: 'مارس', en: 'March' },
  { ar: 'أبريل', en: 'April' }, { ar: 'مايو', en: 'May' }, { ar: 'يونيو', en: 'June' },
  { ar: 'يوليو', en: 'July' }, { ar: 'أغسطس', en: 'August' }, { ar: 'سبتمبر', en: 'September' },
  { ar: 'أكتوبر', en: 'October' }, { ar: 'نوفمبر', en: 'November' }, { ar: 'ديسمبر', en: 'December' },
]

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Salary Form Dialog ============
function SalaryFormDialog({ open, onOpenChange, employees }: {
  open: boolean; onOpenChange: (open: boolean) => void; employees: Employee[]
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<SalaryFormData>(defaultForm)
  const { lang } = useAppStore()

  // Auto-load contract data when employee selected
  const { data: contracts = [] } = useQuery<EmployeeContract[]>({
    queryKey: ['employee-contracts', form.employeeId],
    queryFn: async () => {
      if (!form.employeeId) return []
      const res = await fetch(`/api/employee-contracts?employeeId=${form.employeeId}`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!form.employeeId,
  })

  React.useEffect(() => {
    if (open) {
      setForm(defaultForm)
    }
  }, [open])

  React.useEffect(() => {
    // Auto-fill from latest contract
    if (contracts.length > 0) {
      const latest = contracts[contracts.length - 1]
      setForm(f => ({
        ...f,
        basicSalary: String(latest.basicSalary),
        totalAllowances: String(latest.housingAllowance + latest.transportAllowance + latest.otherAllowances),
      }))
    }
  }, [contracts])

  const netSalary = (parseFloat(form.basicSalary) || 0) + (parseFloat(form.totalAllowances) || 0) + (parseFloat(form.overtimeAmount) || 0) - (parseFloat(form.deductions) || 0)

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/salaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['salaries'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      employeeId: form.employeeId,
      month: parseInt(form.month),
      year: parseInt(form.year),
      basicSalary: parseFloat(form.basicSalary) || 0,
      totalAllowances: parseFloat(form.totalAllowances) || 0,
      overtimeAmount: parseFloat(form.overtimeAmount) || 0,
      deductions: parseFloat(form.deductions) || 0,
      status: 'DRAFT',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('إعداد راتب', 'Prepare Salary', lang)}</DialogTitle>
          <DialogDescription>{t('إعداد كشف راتب للموظف', 'Prepare salary statement for employee', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2 sm:col-span-3">
              <Label>{t('الموظف *', 'Employee *', lang)}</Label>
              <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر الموظف', 'Select employee', lang)} /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('الشهر *', 'Month *', lang)}</Label>
              <Select value={form.month} onValueChange={v => setForm(f => ({ ...f, month: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر الشهر', 'Select month', lang)} /></SelectTrigger>
                <SelectContent>
                  {monthNames.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m[lang]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('السنة *', 'Year *', lang)}</Label>
              <Input type="number" min="2020" max="2050" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} dir="ltr" required placeholder="2025" />
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-emerald-700 border-b border-emerald-200 pb-1">
              {t('تفاصيل الراتب', 'Salary Details', lang)}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('الراتب الأساسي', 'Basic Salary', lang)}</Label><Input type="number" min="0" step="0.01" value={form.basicSalary} onChange={e => setForm(f => ({ ...f, basicSalary: e.target.value }))} dir="ltr" /></div>
              <div className="space-y-2"><Label>{t('إجمالي البدلات', 'Total Allowances', lang)}</Label><Input type="number" min="0" step="0.01" value={form.totalAllowances} onChange={e => setForm(f => ({ ...f, totalAllowances: e.target.value }))} dir="ltr" /></div>
              <div className="space-y-2"><Label>{t('مبلغ الوقت الإضافي', 'Overtime Amount', lang)}</Label><Input type="number" min="0" step="0.01" value={form.overtimeAmount} onChange={e => setForm(f => ({ ...f, overtimeAmount: e.target.value }))} dir="ltr" /></div>
              <div className="space-y-2"><Label>{t('الخصومات', 'Deductions', lang)}</Label><Input type="number" min="0" step="0.01" value={form.deductions} onChange={e => setForm(f => ({ ...f, deductions: e.target.value }))} dir="ltr" /></div>
            </div>
          </div>

          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-3">
              <p className="text-sm text-emerald-600">{t('صافي الراتب', 'Net Salary', lang)}: <span className="font-bold text-emerald-700"><MoneyDisplay value={netSalary} lang={lang} size="md" inline bold /></span></p>
              <p className="text-xs text-emerald-500 mt-1">{t('الأساسي + البدلات + الإضافي - الخصومات', 'Basic + Allowances + Overtime - Deductions', lang)}</p>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending || !form.employeeId || !form.month || !form.year} className="bg-emerald-600 hover:bg-emerald-700">{createMutation.isPending ? t('جاري الحفظ...', 'Saving...', lang) : t('إنشاء كشف راتب', 'Create Salary', lang)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Salaries Module ============
export function SalariesModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: salaries = [], isLoading, isError, refetch } = useQuery<SalaryRecord[]>({
    queryKey: ['salaries'],
    queryFn: async () => { const res = await fetch('/api/salaries'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-list'],
    queryFn: async () => { const res = await fetch('/api/employees?activeOnly=true'); if (!res.ok) return []; return res.json() },
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => fetch(`/api/salaries/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salaries'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/salaries/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salaries'] }),
  })

  const filtered = salaries.filter(s => {
    if (!search) return true
    const sl = search.toLowerCase()
    return s.employee.name.toLowerCase().includes(sl) || s.employee.code.toLowerCase().includes(sl)
  })

  // Summary
  const totalNetSalary = filtered.reduce((sum, s) => sum + s.netSalary, 0)
  const totalOvertime = filtered.reduce((sum, s) => sum + s.overtimeAmount, 0)
  const totalDeductions = filtered.reduce((sum, s) => sum + s.deductions, 0)

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'employeeName', label: t('الموظف', 'Employee', lang) },
      { key: 'monthYear', label: t('الشهر/السنة', 'Month/Year', lang) },
      { key: 'basicSalary', label: t('الراتب الأساسي', 'Basic', lang) },
      { key: 'totalAllowances', label: t('البدلات', 'Allowances', lang) },
      { key: 'overtimeAmount', label: t('الإضافي', 'Overtime', lang) },
      { key: 'deductions', label: t('الخصومات', 'Deductions', lang) },
      { key: 'netSalary', label: t('صافي الراتب', 'Net Salary', lang) },
      { key: 'status', label: t('الحالة', 'Status', lang) },
    ]
    exportToCSV(filtered.map(s => ({
      employeeName: s.employee.name,
      monthYear: `${monthNames[s.month - 1]?.[lang] || s.month}/${s.year}`,
      basicSalary: s.basicSalary, totalAllowances: s.totalAllowances,
      overtimeAmount: s.overtimeAmount, deductions: s.deductions,
      netSalary: s.netSalary, status: s.status,
    })), `salaries-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={{ ar: 'الرواتب', en: 'Salaries' }}
      subtitle={{ ar: 'إدارة الرواتب والمستحقات', en: 'Manage salaries and compensation' }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => window.print()}><Printer className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4" />{t('إعداد راتب', 'Prepare Salary', lang)}</Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-600">{t('إجمالي الرواتب الصافية', 'Total Net Salaries', lang)}</p>
            <MoneyDisplay value={totalNetSalary} lang={lang} size="lg" bold />
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-amber-600">{t('إجمالي الإضافي', 'Total Overtime', lang)}</p>
            <MoneyDisplay value={totalOvertime} lang={lang} size="lg" bold />
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-rose-600">{t('إجمالي الخصومات', 'Total Deductions', lang)}</p>
            <MoneyDisplay value={totalDeductions} lang={lang} size="lg" bold />
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card><CardContent className="p-4">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث باسم الموظف...', 'Search by employee name...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><Banknote className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد كشوف رواتب', 'No salary records', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4 mr-1" />{t('إعداد راتب', 'Prepare Salary', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الموظف', 'Employee', lang)}</TableHead>
                <TableHead className="text-right">{t('الشهر/السنة', 'Month/Year', lang)}</TableHead>
                <TableHead className="text-right">{t('الراتب الأساسي', 'Basic', lang)}</TableHead>
                <TableHead className="text-right">{t('البدلات', 'Allowances', lang)}</TableHead>
                <TableHead className="text-right">{t('الإضافي', 'Overtime', lang)}</TableHead>
                <TableHead className="text-right">{t('الخصومات', 'Deductions', lang)}</TableHead>
                <TableHead className="text-right">{t('صافي الراتب', 'Net Salary', lang)}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.employee.name}</TableCell>
                    <TableCell>{monthNames[s.month - 1]?.[lang] || s.month} / {s.year}</TableCell>
                    <TableCell><MoneyDisplay value={s.basicSalary} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={s.totalAllowances} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={s.overtimeAmount} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={s.deductions} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={s.netSalary} lang={lang} size="sm" bold /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <SalaryStatusBadge status={s.status} lang={lang} />
                        {s.journalEntryId && <BookOpen className="size-3 text-emerald-600" title={t('قييد محاسبي', 'Accounting Entry', lang)} />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {s.status === 'DRAFT' && (
                          <Button variant="ghost" size="icon" className="size-8 text-emerald-600 hover:text-emerald-700" onClick={() => { if (confirm(t('هل تريد اعتماد كشف الراتب؟ سيتم إنشاء قيد محاسبي.', 'Approve this salary? An accounting entry will be created.', lang))) approveMutation.mutate({ id: s.id, status: 'APPROVED' }) }} title={t('اعتماد', 'Approve', lang)}><CheckCircle className="size-4" /></Button>
                        )}
                        {s.status === 'APPROVED' && (
                          <Button variant="ghost" size="icon" className="size-8 text-blue-600 hover:text-blue-700" onClick={() => approveMutation.mutate({ id: s.id, status: 'PAID' })} title={t('تسجيل الدفع', 'Mark as Paid', lang)}><Banknote className="size-4" /></Button>
                        )}
                        {s.status === 'DRAFT' && (
                          <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang))) deleteMutation.mutate(s.id) }}><Trash2 className="size-4" /></Button>
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

      <SalaryFormDialog open={dialogOpen} onOpenChange={setDialogOpen} employees={employees} />
    </ModuleLayout>
  )
}

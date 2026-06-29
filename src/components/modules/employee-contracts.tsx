'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, Pencil, Trash2, RefreshCw,
  Download, Calculator, CheckCircle, Clock,
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
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { useAppStore, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
interface Employee { id: string; code: string; name: string; nameAr: string | null }

interface EmployeeContract {
  id: string; employeeId: string; startDate: string; endDate: string | null
  basicSalary: number; housingAllowance: number; transportAllowance: number
  otherAllowances: number; totalCompensation: number
  employee: Employee
}

interface ContractFormData {
  employeeId: string; startDate: string; endDate: string
  basicSalary: string; housingAllowance: string; transportAllowance: string
  otherAllowances: string
}

const defaultForm: ContractFormData = {
  employeeId: '', startDate: '', endDate: '',
  basicSalary: '', housingAllowance: '0', transportAllowance: '0', otherAllowances: '0',
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

function getContractStatus(startDate: string, endDate: string | null): { label: { ar: string; en: string }; color: string; bg: string } {
  const now = new Date()
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null

  if (end && end < now) {
    return { label: { ar: 'منتهي', en: 'Expired' }, color: 'text-gray-700', bg: 'bg-gray-100' }
  }
  if (start > now) {
    return { label: { ar: 'قادم', en: 'Upcoming' }, color: 'text-blue-700', bg: 'bg-blue-100' }
  }
  return { label: { ar: 'نشط', en: 'Active' }, color: 'text-emerald-700', bg: 'bg-emerald-100' }
}

function ContractStatusBadge({ startDate, endDate, lang }: { startDate: string; endDate: string | null; lang: 'ar' | 'en' }) {
  const status = getContractStatus(startDate, endDate)
  return <Badge className={`${status.bg} ${status.color} border-0`}>{status.label[lang]}</Badge>
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Contract Form Dialog ============
function ContractFormDialog({ open, onOpenChange, editingContract, employees }: {
  open: boolean; onOpenChange: (open: boolean) => void; editingContract: EmployeeContract | null; employees: Employee[]
}) {
  const queryClient = useQueryClient()
  const isEdit = !!editingContract
  const [form, setForm] = useState<ContractFormData>(defaultForm)
  const { lang } = useAppStore()

  const totalCompensation = (parseFloat(form.basicSalary) || 0) + (parseFloat(form.housingAllowance) || 0) + (parseFloat(form.transportAllowance) || 0) + (parseFloat(form.otherAllowances) || 0)

  React.useEffect(() => {
    if (open) {
      if (editingContract) {
        setForm({
          employeeId: editingContract.employeeId,
          startDate: editingContract.startDate ? editingContract.startDate.split('T')[0] : '',
          endDate: editingContract.endDate ? editingContract.endDate.split('T')[0] : '',
          basicSalary: String(editingContract.basicSalary),
          housingAllowance: String(editingContract.housingAllowance),
          transportAllowance: String(editingContract.transportAllowance),
          otherAllowances: String(editingContract.otherAllowances),
        })
      } else { setForm(defaultForm) }
    }
  }, [open, editingContract])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/employee-contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-contracts'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onOpenChange(false)
      toast.success(t('تم حفظ العقد', 'Contract saved', lang))
    },
    onError: () => {
      toast.error(t('فشل في حفظ العقد', 'Failed to save contract', lang))
    },
  })

  // L3B-CRIT-002 FIX: added updateMutation that calls PUT /api/employee-contracts/[id].
  // Previously the Edit dialog always called createMutation (POST), creating duplicates.
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch(`/api/employee-contracts/${editingContract?.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-contracts'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onOpenChange(false)
      toast.success(t('تم تحديث العقد', 'Contract updated', lang))
    },
    onError: () => {
      toast.error(t('فشل في تحديث العقد', 'Failed to update contract', lang))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      basicSalary: parseFloat(form.basicSalary) || 0,
      housingAllowance: parseFloat(form.housingAllowance) || 0,
      transportAllowance: parseFloat(form.transportAllowance) || 0,
      otherAllowances: parseFloat(form.otherAllowances) || 0,
      endDate: form.endDate || null,
    }
    if (isEdit && editingContract) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('تعديل العقد', 'Edit Contract', lang) : t('عقد جديد', 'New Contract', lang)}</DialogTitle>
          <DialogDescription>{isEdit ? t('تعديل بيانات العقد', 'Edit contract data', lang) : t('إضافة عقد جديد للموظف', 'Add new employee contract', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('الموظف *', 'Employee *', lang)}</Label>
              <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))} disabled={isEdit}>
                <SelectTrigger><SelectValue placeholder={t('اختر الموظف', 'Select employee', lang)} /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t('تاريخ البداية *', 'Start Date *', lang)}</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>{t('تاريخ النهاية', 'End Date', lang)}</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-emerald-700 border-b border-emerald-200 pb-1">
              {t('الراتب والبدلات', 'Salary & Allowances', lang)}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('الراتب الأساسي *', 'Basic Salary *', lang)}</Label><Input type="number" min="0" step="0.01" value={form.basicSalary} onChange={e => setForm(f => ({ ...f, basicSalary: e.target.value }))} dir="ltr" required /></div>
              <div className="space-y-2"><Label>{t('بدل السكن', 'Housing Allowance', lang)}</Label><Input type="number" min="0" step="0.01" value={form.housingAllowance} onChange={e => setForm(f => ({ ...f, housingAllowance: e.target.value }))} dir="ltr" /></div>
              <div className="space-y-2"><Label>{t('بدل النقل', 'Transport Allowance', lang)}</Label><Input type="number" min="0" step="0.01" value={form.transportAllowance} onChange={e => setForm(f => ({ ...f, transportAllowance: e.target.value }))} dir="ltr" /></div>
              <div className="space-y-2"><Label>{t('بدلات أخرى', 'Other Allowances', lang)}</Label><Input type="number" min="0" step="0.01" value={form.otherAllowances} onChange={e => setForm(f => ({ ...f, otherAllowances: e.target.value }))} dir="ltr" /></div>
            </div>
          </div>

          {totalCompensation > 0 && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-emerald-600">{t('إجمالي التعويضات', 'Total Compensation', lang)}: <span className="font-bold text-emerald-700"><MoneyDisplay value={totalCompensation} lang={lang} size="sm" inline /></span></p>
                  <p className="text-xs text-emerald-500">{t('شهرياً', 'Monthly', lang)}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !form.employeeId || !form.startDate} className="bg-emerald-600 hover:bg-emerald-700">{(createMutation.isPending || updateMutation.isPending) ? t('جاري الحفظ...', 'Saving...', lang) : isEdit ? t('تحديث', 'Update', lang) : t('إنشاء', 'Create', lang)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Employee Contracts Module ============
export function EmployeeContractsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<EmployeeContract | null>(null)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [showExpired, setShowExpired] = useState(true)

  const { data: contracts = [], isLoading, isError, refetch } = useQuery<EmployeeContract[]>({
    queryKey: ['employee-contracts', filterEmployee],
    queryFn: async () => {
      const url = filterEmployee ? `/api/employee-contracts?employeeId=${filterEmployee}` : '/api/employee-contracts'
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-list'],
    queryFn: async () => { const res = await fetch('/api/employees?activeOnly=true'); if (!res.ok) return []; return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/employee-contracts/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-contracts'] })
      toast.success(t('تم حذف العقد', 'Contract deleted', lang))
    },
  })

  const filtered = contracts.filter(c => {
    if (!showExpired && c.endDate && new Date(c.endDate) < new Date()) return false
    if (!search) return true
    const s = search.toLowerCase()
    return c.employee.name.toLowerCase().includes(s) || c.employee.code.toLowerCase().includes(s)
  })

  // Summary
  const activeCount = contracts.filter(c => getContractStatus(c.startDate, c.endDate).label.en === 'Active').length
  const expiredCount = contracts.filter(c => getContractStatus(c.startDate, c.endDate).label.en === 'Expired').length
  const totalCompAll = contracts.reduce((sum, c) => sum + c.totalCompensation, 0)

  const printData = useMemo(() => ({
    columns: [
      { key: 'employeeName', label: lang === 'ar' ? 'الموظف' : 'Employee' },
      { key: 'startDate', label: lang === 'ar' ? 'تاريخ البداية' : 'Start Date' },
      { key: 'endDate', label: lang === 'ar' ? 'تاريخ النهاية' : 'End Date' },
      { key: 'basicSalary', label: lang === 'ar' ? 'الراتب الأساسي' : 'Basic Salary' },
      { key: 'totalCompensation', label: lang === 'ar' ? 'الإجمالي' : 'Total' },
      { key: 'status', label: lang === 'ar' ? 'الحالة' : 'Status' },
    ],
    rows: filtered.map(c => ({
      employeeName: c.employee.name,
      startDate: c.startDate,
      endDate: c.endDate || '—',
      basicSalary: c.basicSalary,
      totalCompensation: c.totalCompensation,
      status: getContractStatus(c.startDate, c.endDate).label[lang],
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
      { label: lang === 'ar' ? 'عقود نشطة' : 'Active Contracts', value: String(activeCount) },
    ],
  }), [filtered, lang, activeCount])

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'employeeName', label: t('الموظف', 'Employee', lang) },
      { key: 'startDate', label: t('تاريخ البداية', 'Start Date', lang) },
      { key: 'endDate', label: t('تاريخ النهاية', 'End Date', lang) },
      { key: 'basicSalary', label: t('الراتب', 'Basic Salary', lang) },
      { key: 'housingAllowance', label: t('بدل السكن', 'Housing', lang) },
      { key: 'transportAllowance', label: t('بدل النقل', 'Transport', lang) },
      { key: 'otherAllowances', label: t('بدلات أخرى', 'Other', lang) },
      { key: 'totalCompensation', label: t('الإجمالي', 'Total', lang) },
      { key: 'status', label: t('الحالة', 'Status', lang) },
    ]
    exportToCSV(filtered.map(c => ({
      employeeName: c.employee.name, startDate: c.startDate, endDate: c.endDate || '',
      basicSalary: c.basicSalary, housingAllowance: c.housingAllowance,
      transportAllowance: c.transportAllowance, otherAllowances: c.otherAllowances,
      totalCompensation: c.totalCompensation,
      status: getContractStatus(c.startDate, c.endDate).label.en,
    })), `employee-contracts-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={{ ar: 'عقود الموظفين', en: 'Employee Contracts' }}
      subtitle={{ ar: 'إدارة عقود الموظفين والبدلات', en: 'Manage employee contracts and allowances' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingContract(null); setDialogOpen(true) }}><Plus className="size-4" />{t('عقد جديد', 'New Contract', lang)}</Button>
        </div>
      }
    >
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100"><CheckCircle className="size-5 text-emerald-700" /></div>
            <div>
              <p className="text-xs text-emerald-600">{t('عقود نشطة', 'Active Contracts', lang)}</p>
              <p className="text-xl font-bold text-emerald-700">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-gray-100"><Clock className="size-5 text-gray-700" /></div>
            <div>
              <p className="text-xs text-gray-600">{t('عقود منتهية', 'Expired Contracts', lang)}</p>
              <p className="text-xl font-bold text-gray-700">{expiredCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-teal-600">{t('إجمالي التعويضات الشهرية', 'Total Monthly Compensation', lang)}</p>
            <MoneyDisplay value={totalCompAll} lang={lang} size="lg" bold />
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card><CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث باسم الموظف...', 'Search by employee name...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
          <Select value={filterEmployee || 'ALL'} onValueChange={v => setFilterEmployee(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder={t('كل الموظفين', 'All Employees', lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('كل الموظفين', 'All Employees', lang)}</SelectItem>
              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={showExpired ? 'outline' : 'default'}
            size="sm"
            onClick={() => setShowExpired(!showExpired)}
            className={showExpired ? '' : 'bg-emerald-600 hover:bg-emerald-700'}
          >
            {showExpired ? t('إخفاء المنتهية', 'Hide Expired', lang) : t('إظهار الكل', 'Show All', lang)}
          </Button>
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><FileText className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد عقود', 'No contracts', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingContract(null); setDialogOpen(true) }}><Plus className="size-4 mr-1" />{t('إضافة عقد', 'Add Contract', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الموظف', 'Employee', lang)}</TableHead>
                <TableHead className="text-right">{t('تاريخ البداية', 'Start Date', lang)}</TableHead>
                <TableHead className="text-right">{t('تاريخ النهاية', 'End Date', lang)}</TableHead>
                <TableHead className="text-right">{t('الراتب الأساسي', 'Basic Salary', lang)}</TableHead>
                <TableHead className="text-right">{t('بدل السكن', 'Housing', lang)}</TableHead>
                <TableHead className="text-right">{t('بدل النقل', 'Transport', lang)}</TableHead>
                <TableHead className="text-right">{t('بدلات أخرى', 'Other', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id} className={getContractStatus(c.startDate, c.endDate).label.en === 'Expired' ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{c.employee.name}</TableCell>
                    <TableCell>{formatDate(c.startDate, lang)}</TableCell>
                    <TableCell>{c.endDate ? formatDate(c.endDate, lang) : '—'}</TableCell>
                    <TableCell><MoneyDisplay value={c.basicSalary} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={c.housingAllowance} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={c.transportAllowance} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={c.otherAllowances} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={c.totalCompensation} lang={lang} size="sm" bold /></TableCell>
                    <TableCell><ContractStatusBadge startDate={c.startDate} endDate={c.endDate} lang={lang} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditingContract(c); setDialogOpen(true) }}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من حذف العقد؟', 'Are you sure you want to delete this contract?', lang))) deleteMutation.mutate(c.id) }}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <ContractFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editingContract={editingContract} employees={employees} />
    </ModuleLayout>
  )
}

'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Search, Pencil, Trash2, RefreshCw,
  Download,
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
import { AccountSelector } from '@/components/shared/account-selector'
import { useAppStore, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
interface Branch { id: string; name: string; nameAr: string | null }

interface ExpenseAccount {
  id: string; code: string; name: string; nameAr: string | null; accountRole: string | null
}

interface Employee {
  id: string; code: string; name: string; nameAr: string | null
  nationality: string | null; profession: string | null
  residenceNumber: string | null; residenceExpiry: string | null
  hireDate: string | null; basicSalary: number; status: string
  branchId: string | null; phone: string | null; email: string | null
  expenseAccountId: string | null
  branch: Branch | null
  expenseAccount: ExpenseAccount | null
}

interface EmployeeFormData {
  name: string; nameAr: string; nationality: string; profession: string
  residenceNumber: string; residenceExpiry: string; hireDate: string
  basicSalary: string; branchId: string; phone: string; email: string
  expenseAccountId: string | null
}

const defaultForm: EmployeeFormData = {
  name: '', nameAr: '', nationality: '', profession: '',
  residenceNumber: '', residenceExpiry: '', hireDate: '',
  basicSalary: '', branchId: '', phone: '', email: '',
  expenseAccountId: null,
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  ACTIVE: { label: { ar: 'نشط', en: 'Active' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  ON_LEAVE: { label: { ar: 'إجازة', en: 'On Leave' }, color: 'text-yellow-700', bg: 'bg-yellow-100' },
  TERMINATED: { label: { ar: 'مفصول', en: 'Terminated' }, color: 'text-red-700', bg: 'bg-red-100' },
  RESIGNED: { label: { ar: 'مستقيل', en: 'Resigned' }, color: 'text-gray-700', bg: 'bg-gray-100' },
}

function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.ACTIVE
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Employee Form Dialog ============
function EmployeeFormDialog({ open, onOpenChange, editingEmployee, branches }: {
  open: boolean; onOpenChange: (open: boolean) => void; editingEmployee: Employee | null; branches: Branch[]
}) {
  const queryClient = useQueryClient()
  const isEdit = !!editingEmployee
  const [form, setForm] = useState<EmployeeFormData>(defaultForm)
  const { lang } = useAppStore()

  // Active properties of the currently-selected salary expense account.
  // Captured from AccountSelector's onValueChange(account) so the form can
  // surface the account's behavior (requiresEmployee, allowsProject, ...)
  // as badges — the property-driven design made visible at the point of
  // selection, even though the roles-based filter is kept (see comment
  // next to the AccountSelector below for the OR-logic rationale).
  const [expenseAccountProps, setExpenseAccountProps] = useState<{
    code: string
    nameAr: string
    requiresEmployee?: boolean
    requiresProject?: boolean
    requiresEquipment?: boolean
    allowsEmployee?: boolean
    allowsProject?: boolean
    allowsCostCenter?: boolean
    allowsVat?: boolean
  } | null>(null)

  React.useEffect(() => {
    if (open) {
      if (editingEmployee) {
        setForm({
          name: editingEmployee.name, nameAr: editingEmployee.nameAr || '',
          nationality: editingEmployee.nationality || '', profession: editingEmployee.profession || '',
          residenceNumber: editingEmployee.residenceNumber || '',
          residenceExpiry: editingEmployee.residenceExpiry ? editingEmployee.residenceExpiry.split('T')[0] : '',
          hireDate: editingEmployee.hireDate ? editingEmployee.hireDate.split('T')[0] : '',
          basicSalary: String(editingEmployee.basicSalary),
          branchId: editingEmployee.branchId || '',
          phone: editingEmployee.phone || '', email: editingEmployee.email || '',
          expenseAccountId: editingEmployee.expenseAccountId || null,
        })
        // Editing existing employee: we don't have the account's properties in
        // the employee record, so clear badges until the user re-selects.
        setExpenseAccountProps(null)
      } else {
        setForm(defaultForm)
        setExpenseAccountProps(null)
      }
    }
  }, [open, editingEmployee])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['employees'] }); onOpenChange(false) },
  })
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch(`/api/employees/${editingEmployee?.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['employees'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      basicSalary: parseFloat(form.basicSalary) || 0,
      branchId: form.branchId || null,
      residenceExpiry: form.residenceExpiry || null,
      hireDate: form.hireDate || null,
      expenseAccountId: form.expenseAccountId || null,
    }
    if (isEdit) updateMutation.mutate(payload); else createMutation.mutate(payload)
  }
  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('تعديل الموظف', 'Edit Employee', lang) : t('موظف جديد', 'New Employee', lang)}</DialogTitle>
          <DialogDescription>{isEdit ? t('تعديل بيانات الموظف', 'Edit employee data', lang) : t('إضافة موظف جديد', 'Add new employee', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Info */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-emerald-700 border-b border-emerald-200 pb-1">
              {t('المعلومات الأساسية', 'Basic Information', lang)}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('الاسم *', 'Name *', lang)}</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div className="space-y-2"><Label>{t('الاسم بالعربي', 'Arabic Name', lang)}</Label><Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} /></div>
              <div className="space-y-2"><Label>{t('الجنسية', 'Nationality', lang)}</Label><Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} /></div>
              <div className="space-y-2"><Label>{t('المهنة', 'Profession', lang)}</Label><Input value={form.profession} onChange={e => setForm(f => ({ ...f, profession: e.target.value }))} /></div>
            </div>
          </div>

          {/* Residence Info */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-teal-700 border-b border-teal-200 pb-1">
              {t('معلومات الإقامة', 'Residence Information', lang)}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('رقم الإقامة', 'Residence No.', lang)}</Label><Input value={form.residenceNumber} onChange={e => setForm(f => ({ ...f, residenceNumber: e.target.value }))} dir="ltr" /></div>
              <div className="space-y-2"><Label>{t('انتهاء الإقامة', 'Residence Expiry', lang)}</Label><Input type="date" value={form.residenceExpiry} onChange={e => setForm(f => ({ ...f, residenceExpiry: e.target.value }))} /></div>
            </div>
          </div>

          {/* Work Info */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-purple-700 border-b border-purple-200 pb-1">
              {t('معلومات العمل', 'Work Information', lang)}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('تاريخ التعيين', 'Hire Date', lang)}</Label><Input type="date" value={form.hireDate} onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))} /></div>
              <div className="space-y-2"><Label>{t('الراتب الأساسي *', 'Basic Salary *', lang)}</Label><Input type="number" min="0" step="0.01" value={form.basicSalary} onChange={e => setForm(f => ({ ...f, basicSalary: e.target.value }))} dir="ltr" required /></div>
              <div className="space-y-2"><Label>{t('الفرع', 'Branch', lang)}</Label>
                <Select value={form.branchId} onValueChange={v => setForm(f => ({ ...f, branchId: v }))}>
                  <SelectTrigger><SelectValue placeholder={t('اختر الفرع', 'Select branch', lang)} /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-orange-700 border-b border-orange-200 pb-1">
              {t('معلومات الاتصال', 'Contact Information', lang)}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('الهاتف', 'Phone', lang)}</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" /></div>
              <div className="space-y-2"><Label>{t('البريد الإلكتروني', 'Email', lang)}</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} dir="ltr" /></div>
            </div>
          </div>

          {/* Salary Expense Account */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-cyan-700 border-b border-cyan-200 pb-1">
              {t('حساب مصروف الراتب', 'Salary Expense Account', lang)}
            </h4>
            {/*
             * PROPERTY-SYSTEM DECISION (SC-3):
             * KEEP roles (OR-logic across 4 expense types). The employee salary
             * account can belong to ANY of these role categories — each maps to
             * a different posting destination:
             *   - PAYROLL_EXPENSE → usableInPayroll: true   (office/admin staff)
             *   - PROJECT_COST    → usableInProjects: true  (project labor)
             *   - DRIVER_EXPENSE  → usableInPayroll:true AND usableInProjects:true
             *   - ADMIN_EXPENSE   → usableInExpenses: true  (admin/management)
             * `filterByProperty` only supports AND-conjunction, so no single
             * property can reproduce this 4-way OR. Restricting to one property
             * would prevent assigning a project-cost account to a project worker,
             * a driver account to a driver, etc. Therefore `roles` is the
             * accurate filter here. We STILL capture the full account object on
             * selection and surface its key properties as badges below, so the
             * property-driven design is visible and usable downstream (the
             * salaries/payroll screen reads `requiresEmployee` etc.).
             */}
            <AccountSelector
              roles={['PAYROLL_EXPENSE', 'PROJECT_COST', 'DRIVER_EXPENSE', 'ADMIN_EXPENSE']}
              value={form.expenseAccountId}
              onValueChange={(id, account) => {
                setForm(prev => ({ ...prev, expenseAccountId: id }))
                setExpenseAccountProps({
                  code: account.code,
                  nameAr: account.nameAr || account.name,
                  requiresEmployee: account.requiresEmployee,
                  requiresProject: account.requiresProject,
                  requiresEquipment: account.requiresEquipment,
                  allowsEmployee: account.allowsEmployee,
                  allowsProject: account.allowsProject,
                  allowsCostCenter: account.allowsCostCenter,
                  allowsVat: account.allowsVat,
                })
              }}
              label={t('حساب مصروف الراتب', 'Salary Expense Account', lang)}
              placeholder={t('اختر حساب المصروف...', 'Select expense account...', lang)}
            />
            <p className="text-xs text-muted-foreground">{t('اختر حساب المصروف الذي ستُقيد فيه رواتب هذا الموظف', "Select the expense account where this employee's salary will be posted", lang)}</p>
            {/* Active-property badges — make the account's behavior visible */}
            {form.expenseAccountId && expenseAccountProps && (
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-cyan-50 border border-cyan-200 px-3 py-2">
                <span className="font-mono text-xs bg-white text-gray-700 px-1.5 py-0.5 rounded border">{expenseAccountProps.code}</span>
                <span className="text-sm text-cyan-700">{expenseAccountProps.nameAr}</span>
                <div className="flex flex-wrap gap-1 ml-auto">
                  {expenseAccountProps.requiresEmployee && (
                    <Badge variant="outline" className="text-[9px] text-rose-700 border-rose-200 bg-rose-50">{t('يتطلب موظف', 'requires employee', lang)}</Badge>
                  )}
                  {expenseAccountProps.requiresProject && (
                    <Badge variant="outline" className="text-[9px] text-rose-700 border-rose-200 bg-rose-50">{t('يتطلب مشروع', 'requires project', lang)}</Badge>
                  )}
                  {expenseAccountProps.allowsProject && !expenseAccountProps.requiresProject && (
                    <Badge variant="outline" className="text-[9px] text-sky-700 border-sky-200 bg-sky-50">{t('يسمح بمشروع', 'allows project', lang)}</Badge>
                  )}
                  {expenseAccountProps.allowsCostCenter && (
                    <Badge variant="outline" className="text-[9px] text-sky-700 border-sky-200 bg-sky-50">{t('يسمح بمركز تكلفة', 'allows cost center', lang)}</Badge>
                  )}
                  {expenseAccountProps.allowsEmployee && !expenseAccountProps.requiresEmployee && (
                    <Badge variant="outline" className="text-[9px] text-sky-700 border-sky-200 bg-sky-50">{t('يسمح بموظف', 'allows employee', lang)}</Badge>
                  )}
                  {expenseAccountProps.allowsVat === false && (
                    <Badge variant="outline" className="text-[9px] text-amber-700 border-amber-200 bg-amber-50">{t('بدون ضريبة', 'no VAT', lang)}</Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700">{isLoading ? t('جاري الحفظ...', 'Saving...', lang) : isEdit ? t('تحديث', 'Update', lang) : t('إنشاء', 'Create', lang)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Employees Module ============
export function EmployeesModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)

  const { data: employees = [], isLoading, isError, refetch } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => { const res = await fetch('/api/employees'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => { const res = await fetch('/api/branches'); if (!res.ok) return []; return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/employees/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })

  const filtered = employees.filter(e => {
    if (!search) return true
    const s = search.toLowerCase()
    return e.name.toLowerCase().includes(s) || e.code.toLowerCase().includes(s) || (e.nameAr?.toLowerCase().includes(s)) || (e.phone?.includes(s)) || (e.profession?.toLowerCase().includes(s))
  })

  const printData = useMemo(() => ({
    columns: [
      { key: 'code', label: lang === 'ar' ? 'الكود' : 'Code' },
      { key: 'name', label: lang === 'ar' ? 'الاسم' : 'Name' },
      { key: 'nationality', label: lang === 'ar' ? 'الجنسية' : 'Nationality' },
      { key: 'profession', label: lang === 'ar' ? 'المهنة' : 'Profession' },
      { key: 'basicSalary', label: lang === 'ar' ? 'الراتب' : 'Salary' },
      { key: 'status', label: lang === 'ar' ? 'الحالة' : 'Status' },
    ],
    rows: filtered.map(e => ({
      code: e.code,
      name: e.name,
      nationality: e.nationality || '',
      profession: e.profession || '',
      basicSalary: e.basicSalary,
      status: statusConfig[e.status]?.label[lang] || e.status,
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
    ],
  }), [filtered, lang])

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('الاسم', 'Name', lang) },
      { key: 'nationality', label: t('الجنسية', 'Nationality', lang) },
      { key: 'profession', label: t('المهنة', 'Profession', lang) },
      { key: 'basicSalary', label: t('الراتب', 'Salary', lang) },
      { key: 'status', label: t('الحالة', 'Status', lang) },
    ]
    exportToCSV(filtered.map(e => ({ code: e.code, name: e.name, nationality: e.nationality || '', profession: e.profession || '', basicSalary: e.basicSalary, status: e.status })), `employees-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={{ ar: 'الموظفون', en: 'Employees' }}
      subtitle={{ ar: 'إدارة بيانات الموظفين والموارد البشرية', en: 'Manage employee data and human resources' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingEmployee(null); setDialogOpen(true) }}><Plus className="size-4" />{t('موظف جديد', 'New Employee', lang)}</Button>
        </div>
      }
    >
      {/* Search */}
      <Card><CardContent className="p-4">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث بالاسم أو الكود أو المهنة...', 'Search by name, code or profession...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><Users className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا يوجد موظفون', 'No employees', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingEmployee(null); setDialogOpen(true) }}><Plus className="size-4 mr-1" />{t('إضافة موظف', 'Add Employee', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                <TableHead className="text-right">{t('الاسم', 'Name', lang)}</TableHead>
                <TableHead className="text-right">{t('الجنسية', 'Nationality', lang)}</TableHead>
                <TableHead className="text-right">{t('المهنة', 'Profession', lang)}</TableHead>
                <TableHead className="text-right">{t('انتهاء الإقامة', 'Res. Expiry', lang)}</TableHead>
                <TableHead className="text-right">{t('تاريخ التعيين', 'Hire Date', lang)}</TableHead>
                <TableHead className="text-right">{t('الراتب', 'Salary', lang)}</TableHead>
                <TableHead className="text-right">{t('حساب المصروف', 'Expense Acct', lang)}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium font-mono">{e.code}</TableCell>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>{e.nationality || '—'}</TableCell>
                    <TableCell>{e.profession || '—'}</TableCell>
                    <TableCell>{e.residenceExpiry ? formatDate(e.residenceExpiry, lang) : '—'}</TableCell>
                    <TableCell>{e.hireDate ? formatDate(e.hireDate, lang) : '—'}</TableCell>
                    <TableCell><MoneyDisplay value={e.basicSalary} lang={lang} size="sm" /></TableCell>
                    <TableCell>{e.expenseAccount ? <span className="text-xs"><span className="font-mono text-cyan-600">{e.expenseAccount.code}</span> - {e.expenseAccount.nameAr || e.expenseAccount.name}</span> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell><StatusBadge status={e.status} lang={lang} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditingEmployee(e); setDialogOpen(true) }}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من حذف الموظف؟', 'Are you sure you want to delete this employee?', lang))) deleteMutation.mutate(e.id) }}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <EmployeeFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editingEmployee={editingEmployee} branches={branches} />
    </ModuleLayout>
  )
}

'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, Plus, Search, Trash2, RefreshCw,
  Download, Users, CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { useAppStore, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
interface Employee { id: string; code: string; name: string; nameAr: string | null }

interface AttendanceRecord {
  id: string; employeeId: string; date: string
  checkIn: string | null; checkOut: string | null
  workHours: number; overtimeHours: number
  employee: Employee
}

interface AttendanceFormData {
  employeeId: string; date: string; checkIn: string; checkOut: string; overtimeHours: string
}

const defaultForm: AttendanceFormData = {
  employeeId: '', date: '', checkIn: '', checkOut: '', overtimeHours: '0',
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Attendance Form Dialog ============
function AttendanceFormDialog({ open, onOpenChange, employees }: {
  open: boolean; onOpenChange: (open: boolean) => void; employees: Employee[]
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AttendanceFormData>(defaultForm)
  const { lang } = useAppStore()

  // Calculate work hours and auto-overtime from checkIn/checkOut
  const calculatedWorkHours = React.useMemo(() => {
    if (!form.checkIn || !form.checkOut) return null
    const [inH, inM] = form.checkIn.split(':').map(Number)
    const [outH, outM] = form.checkOut.split(':').map(Number)
    if (isNaN(inH) || isNaN(outH)) return null
    const inMin = inH * 60 + (inM || 0)
    const outMin = outH * 60 + (outM || 0)
    const diff = outMin - inMin
    if (diff <= 0) return null
    return Math.round((diff / 60) * 100) / 100
  }, [form.checkIn, form.checkOut])

  // Auto-calculate overtime (hours beyond 8)
  const autoOvertime = React.useMemo(() => {
    if (calculatedWorkHours === null) return 0
    return Math.max(0, Math.round((calculatedWorkHours - 8) * 100) / 100)
  }, [calculatedWorkHours])

  React.useEffect(() => {
    if (open) setForm(defaultForm)
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      onOpenChange(false)
      toast.success(t('تم تسجيل الحضور', 'Attendance recorded', lang))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      ...form,
      overtimeHours: form.overtimeHours ? parseFloat(form.overtimeHours) : autoOvertime,
      checkIn: form.checkIn || null,
      checkOut: form.checkOut || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('تسجيل حضور', 'Record Attendance', lang)}</DialogTitle>
          <DialogDescription>{t('تسجيل حضور وانصراف موظف', 'Record employee attendance', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('الموظف *', 'Employee *', lang)}</Label>
              <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر الموظف', 'Select employee', lang)} /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t('التاريخ *', 'Date *', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>{t('وقت الحضور', 'Check In', lang)}</Label><Input type="time" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} /></div>
            <div className="space-y-2"><Label>{t('وقت الانصراف', 'Check Out', lang)}</Label><Input type="time" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>{t('ساعات إضافية', 'Overtime Hours', lang)}</Label>
              <Input
                type="number" min="0" step="0.5"
                value={form.overtimeHours || (autoOvertime > 0 ? String(autoOvertime) : '0')}
                onChange={e => setForm(f => ({ ...f, overtimeHours: e.target.value }))}
                dir="ltr"
              />
              {autoOvertime > 0 && <p className="text-xs text-amber-600">{t('محسوب تلقائياً', 'Auto-calculated', lang)}: {autoOvertime} {t('ساعة', 'hrs', lang)}</p>}
            </div>
          </div>

          {calculatedWorkHours !== null && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-3">
                <div className="flex justify-between text-sm">
                  <p className="text-emerald-600">{t('ساعات العمل المحسوبة', 'Calculated Work Hours', lang)}: <span className="font-bold text-emerald-700">{calculatedWorkHours} {t('ساعة', 'hrs', lang)}</span></p>
                  {autoOvertime > 0 && (
                    <p className="text-amber-600">{t('إضافي', 'Overtime', lang)}: <span className="font-bold text-amber-700">{autoOvertime} {t('ساعة', 'hrs', lang)}</span></p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending || !form.employeeId || !form.date} className="bg-emerald-600 hover:bg-emerald-700">{createMutation.isPending ? t('جاري الحفظ...', 'Saving...', lang) : t('تسجيل', 'Record', lang)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Bulk Attendance Dialog ============
function BulkAttendanceDialog({ open, onOpenChange, employees }: {
  open: boolean; onOpenChange: (open: boolean) => void; employees: Employee[]
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [date, setDate] = useState('')
  const [checkIn, setCheckIn] = useState('08:00')
  const [checkOut, setCheckOut] = useState('17:00')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  React.useEffect(() => {
    if (open) {
      setDate('')
      setCheckIn('08:00')
      setCheckOut('17:00')
      setSelectedIds([])
    }
  }, [open])

  const toggleEmployee = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const selectAll = () => {
    setSelectedIds(employees.map(e => e.id))
  }

  const selectNone = () => {
    setSelectedIds([])
  }

  // Calculate work hours from check-in/check-out
  const calculatedHours = React.useMemo(() => {
    if (!checkIn || !checkOut) return 0
    const [inH, inM] = checkIn.split(':').map(Number)
    const [outH, outM] = checkOut.split(':').map(Number)
    if (isNaN(inH) || isNaN(outH)) return 0
    const diff = (outH * 60 + (outM || 0)) - (inH * 60 + (inM || 0))
    return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0
  }, [checkIn, checkOut])

  const autoOvertime = Math.max(0, calculatedHours - 8)

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        selectedIds.map(employeeId =>
          fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId,
              date,
              checkIn,
              checkOut,
              overtimeHours: autoOvertime,
            }),
          }).then(r => { if (!r.ok) throw new Error(); return r.json() })
        )
      )
      return results
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      onOpenChange(false)
      toast.success(t('تم تسجيل الحضور الجماعي', 'Bulk attendance recorded', lang))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!date || selectedIds.length === 0) return
    bulkMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('تسجيل حضور جماعي', 'Bulk Attendance', lang)}</DialogTitle>
          <DialogDescription>{t('تسجيل حضور لعدة موظفين في نفس اليوم', 'Record attendance for multiple employees on the same day', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2"><Label>{t('التاريخ *', 'Date *', lang)}</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="space-y-2"><Label>{t('وقت الحضور', 'Check In', lang)}</Label><Input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('وقت الانصراف', 'Check Out', lang)}</Label><Input type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)} /></div>
          </div>

          {calculatedHours > 0 && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-3 flex justify-between text-sm">
                <p className="text-emerald-600">{t('ساعات العمل', 'Work Hours', lang)}: <span className="font-bold">{calculatedHours}</span></p>
                {autoOvertime > 0 && <p className="text-amber-600">{t('إضافي', 'Overtime', lang)}: <span className="font-bold">{autoOvertime}</span></p>}
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm text-emerald-700">
                {t('اختر الموظفين', 'Select Employees', lang)} ({selectedIds.length}/{employees.length})
              </h4>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={selectAll}>{t('تحديد الكل', 'Select All', lang)}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={selectNone}>{t('إلغاء التحديد', 'Deselect All', lang)}</Button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
              {employees.map(emp => (
                <label key={emp.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                  <Checkbox
                    checked={selectedIds.includes(emp.id)}
                    onCheckedChange={() => toggleEmployee(emp.id)}
                  />
                  <span className="text-sm">{emp.name} <span className="text-muted-foreground">({emp.code})</span></span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={bulkMutation.isPending || !date || selectedIds.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {bulkMutation.isPending ? t('جاري التسجيل...', 'Recording...', lang) : t('تسجيل حضور', 'Record Attendance', lang)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Attendance Module ============
export function AttendanceModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState('')

  const monthNames = [
    { ar: 'يناير', en: 'January' }, { ar: 'فبراير', en: 'February' }, { ar: 'مارس', en: 'March' },
    { ar: 'أبريل', en: 'April' }, { ar: 'مايو', en: 'May' }, { ar: 'يونيو', en: 'June' },
    { ar: 'يوليو', en: 'July' }, { ar: 'أغسطس', en: 'August' }, { ar: 'سبتمبر', en: 'September' },
    { ar: 'أكتوبر', en: 'October' }, { ar: 'نوفمبر', en: 'November' }, { ar: 'ديسمبر', en: 'December' },
  ]

  const queryParams = new URLSearchParams()
  if (filterMonth && filterYear) {
    const m = parseInt(filterMonth)
    const y = parseInt(filterYear)
    queryParams.set('dateFrom', `${y}-${String(m).padStart(2, '0')}-01`)
    const nextMonth = m === 12 ? 1 : m + 1
    const nextYear = m === 12 ? y + 1 : y
    queryParams.set('dateTo', `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
  }

  const { data: records = [], isLoading, isError, refetch } = useQuery<AttendanceRecord[]>({
    queryKey: ['attendance', filterMonth, filterYear],
    queryFn: async () => {
      const qs = queryParams.toString()
      const res = await fetch(`/api/attendance${qs ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-list'],
    queryFn: async () => { const res = await fetch('/api/employees?activeOnly=true'); if (!res.ok) return []; return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/attendance/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance'] }),
  })

  const filtered = records.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return r.employee.name.toLowerCase().includes(s) || r.employee.code.toLowerCase().includes(s)
  })

  // Monthly summary by employee
  const employeeSummary = React.useMemo(() => {
    const summary: Record<string, { employee: Employee; totalWorkHours: number; totalOvertime: number; days: number }> = {}
    filtered.forEach(r => {
      if (!summary[r.employeeId]) {
        summary[r.employeeId] = { employee: r.employee, totalWorkHours: 0, totalOvertime: 0, days: 0 }
      }
      summary[r.employeeId].totalWorkHours += r.workHours
      summary[r.employeeId].totalOvertime += r.overtimeHours
      summary[r.employeeId].days += 1
    })
    return Object.values(summary)
  }, [filtered])

  const printData = useMemo(() => ({
    columns: [
      { key: 'employeeName', label: lang === 'ar' ? 'الموظف' : 'Employee' },
      { key: 'date', label: lang === 'ar' ? 'التاريخ' : 'Date' },
      { key: 'checkIn', label: lang === 'ar' ? 'الحضور' : 'Check In' },
      { key: 'checkOut', label: lang === 'ar' ? 'الانصراف' : 'Check Out' },
      { key: 'workHours', label: lang === 'ar' ? 'ساعات العمل' : 'Work Hours' },
      { key: 'overtimeHours', label: lang === 'ar' ? 'ساعات إضافية' : 'Overtime' },
    ],
    rows: filtered.map(r => ({
      employeeName: r.employee.name,
      date: r.date,
      checkIn: r.checkIn || '—',
      checkOut: r.checkOut || '—',
      workHours: r.workHours,
      overtimeHours: r.overtimeHours,
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
      { label: lang === 'ar' ? 'عدد السجلات' : 'Records', value: String(filtered.length) },
    ],
  }), [filtered, lang])

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'employeeName', label: t('الموظف', 'Employee', lang) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
      { key: 'checkIn', label: t('الحضور', 'Check In', lang) },
      { key: 'checkOut', label: t('الانصراف', 'Check Out', lang) },
      { key: 'workHours', label: t('ساعات العمل', 'Work Hours', lang) },
      { key: 'overtimeHours', label: t('ساعات إضافية', 'Overtime', lang) },
    ]
    exportToCSV(filtered.map(r => ({
      employeeName: r.employee.name, date: r.date,
      checkIn: r.checkIn || '', checkOut: r.checkOut || '',
      workHours: r.workHours, overtimeHours: r.overtimeHours,
    })), `attendance-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={{ ar: 'الحضور والانصراف', en: 'Attendance' }}
      subtitle={{ ar: 'تسجيل ومتابعة حضور الموظفين', en: 'Record and track employee attendance' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="attendance-report" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button variant="outline" className="gap-2" onClick={() => setBulkDialogOpen(true)}>
            <Users className="size-4" />{t('تسجيل جماعي', 'Bulk Entry', lang)}
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4" />{t('تسجيل حضور', 'Record Attendance', lang)}</Button>
        </div>
      }
    >
      {/* Monthly Summary by Employee */}
      {employeeSummary.length > 0 && (
        <Card>
          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-emerald-700 mb-3 flex items-center gap-2">
                  <CalendarDays className="size-4" />
                  {t('ملخص الشهر حسب الموظف', 'Monthly Summary by Employee', lang)}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">{t('الموظف', 'Employee', lang)}</TableHead>
                    <TableHead className="text-right">{t('أيام الحضور', 'Days', lang)}</TableHead>
                    <TableHead className="text-right">{t('ساعات العمل', 'Work Hours', lang)}</TableHead>
                    <TableHead className="text-right">{t('ساعات إضافية', 'Overtime', lang)}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {employeeSummary.map(s => (
                      <TableRow key={s.employee.id}>
                        <TableCell className="font-medium">{s.employee.name}</TableCell>
                        <TableCell><Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">{s.days}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{(s.totalWorkHours ?? 0).toFixed(1)} {t('ساعة', 'hrs', lang)}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className={(s.totalOvertime ?? 0) > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50'}>{(s.totalOvertime ?? 0) > 0 ? `${(s.totalOvertime ?? 0).toFixed(1)} ${t('ساعة', 'hrs', lang)}` : '—'}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </Card>
      )}

      {/* Search & Filter */}
      <Card><CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث باسم الموظف...', 'Search by employee name...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
          <Select value={filterMonth || 'ALL'} onValueChange={v => setFilterMonth(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder={t('كل الأشهر', 'All Months', lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('كل الأشهر', 'All Months', lang)}</SelectItem>
              {monthNames.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m[lang]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterYear || 'ALL'} onValueChange={v => setFilterYear(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder={t('السنة', 'Year', lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('كل السنوات', 'All Years', lang)}</SelectItem>
              {[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><Clock className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد سجلات حضور', 'No attendance records', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4 mr-1" />{t('تسجيل حضور', 'Record Attendance', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الموظف', 'Employee', lang)}</TableHead>
                <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-right">{t('الحضور', 'Check In', lang)}</TableHead>
                <TableHead className="text-right">{t('الانصراف', 'Check Out', lang)}</TableHead>
                <TableHead className="text-right">{t('ساعات العمل', 'Work Hours', lang)}</TableHead>
                <TableHead className="text-right">{t('ساعات إضافية', 'Overtime', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.employee.name}</TableCell>
                    <TableCell>{formatDate(r.date, lang)}</TableCell>
                    <TableCell dir="ltr" className="text-right">{r.checkIn || '—'}</TableCell>
                    <TableCell dir="ltr" className="text-right">{r.checkOut || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.workHours > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50'}>
                        {r.workHours > 0 ? `${r.workHours} ${t('ساعة', 'hrs', lang)}` : '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.overtimeHours > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50'}>
                        {r.overtimeHours > 0 ? `${r.overtimeHours} ${t('ساعة', 'hrs', lang)}` : '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من حذف السجل؟', 'Are you sure you want to delete this record?', lang))) deleteMutation.mutate(r.id) }}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <AttendanceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} employees={employees} />
      <BulkAttendanceDialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen} employees={employees} />
    </ModuleLayout>
  )
}

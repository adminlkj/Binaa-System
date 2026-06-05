'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, Plus, Search, Pencil, Trash2, RefreshCw,
  Printer, Download,
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
import { ModuleLayout } from '@/components/shared/module-layout'
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

  // Calculate work hours from checkIn/checkOut
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

  React.useEffect(() => {
    if (open) setForm(defaultForm)
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['attendance'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      ...form,
      overtimeHours: parseFloat(form.overtimeHours) || 0,
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
            <div className="space-y-2"><Label>{t('ساعات إضافية', 'Overtime Hours', lang)}</Label><Input type="number" min="0" step="0.5" value={form.overtimeHours} onChange={e => setForm(f => ({ ...f, overtimeHours: e.target.value }))} dir="ltr" /></div>
          </div>

          {calculatedWorkHours !== null && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-3">
                <p className="text-sm text-emerald-600">{t('ساعات العمل المحسوبة', 'Calculated Work Hours', lang)}: <span className="font-bold text-emerald-700">{calculatedWorkHours} {t('ساعة', 'hrs', lang)}</span></p>
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

// ============ Main Attendance Module ============
export function AttendanceModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: records = [], isLoading, isError, refetch } = useQuery<AttendanceRecord[]>({
    queryKey: ['attendance'],
    queryFn: async () => { const res = await fetch('/api/attendance'); if (!res.ok) throw new Error(); return res.json() },
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
          <Button variant="outline" size="icon" onClick={() => window.print()}><Printer className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4" />{t('تسجيل حضور', 'Record Attendance', lang)}</Button>
        </div>
      }
    >
      {/* Search */}
      <Card><CardContent className="p-4">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث باسم الموظف...', 'Search by employee name...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
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
    </ModuleLayout>
  )
}

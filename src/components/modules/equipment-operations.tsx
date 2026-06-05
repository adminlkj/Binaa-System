'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Plus, Search, Trash2, RefreshCw,
  Printer, Download,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useAppStore, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
interface Employee { id: string; code: string; name: string }
interface Equipment { id: string; code: string; name: string; nameAr: string | null }
interface Project { id: string; code: string; name: string }

interface EquipmentOperation {
  id: string; equipmentId: string; operatorId: string; projectId: string
  date: string; hours: number; notes: string | null
  equipment: Equipment; operator: Employee; project: Project
}

interface OperationFormData {
  equipmentId: string; operatorId: string; projectId: string
  date: string; hours: string; notes: string
}

const defaultForm: OperationFormData = {
  equipmentId: '', operatorId: '', projectId: '',
  date: '', hours: '', notes: '',
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Operation Form Dialog ============
function OperationFormDialog({ open, onOpenChange, equipment, employees, projects }: {
  open: boolean; onOpenChange: (open: boolean) => void; equipment: Equipment[]; employees: Employee[]; projects: Project[]
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<OperationFormData>(defaultForm)
  const { lang } = useAppStore()

  React.useEffect(() => {
    if (open) setForm(defaultForm)
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/equipment/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-operations'] }); queryClient.invalidateQueries({ queryKey: ['equipment'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      ...form,
      hours: parseFloat(form.hours) || 0,
      notes: form.notes || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('تسجيل تشغيل', 'Record Operation', lang)}</DialogTitle>
          <DialogDescription>{t('تسجيل عملية تشغيل معدة', 'Record equipment operation', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('المعدة *', 'Equipment *', lang)}</Label>
            <Select value={form.equipmentId} onValueChange={v => setForm(f => ({ ...f, equipmentId: v }))}>
              <SelectTrigger><SelectValue placeholder={t('اختر المعدة', 'Select equipment', lang)} /></SelectTrigger>
              <SelectContent>
                {equipment.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('المشغل *', 'Operator *', lang)}</Label>
            <Select value={form.operatorId} onValueChange={v => setForm(f => ({ ...f, operatorId: v }))}>
              <SelectTrigger><SelectValue placeholder={t('اختر الموظف', 'Select employee', lang)} /></SelectTrigger>
              <SelectContent>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('المشروع *', 'Project *', lang)}</Label>
            <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
              <SelectTrigger><SelectValue placeholder={t('اختر المشروع', 'Select project', lang)} /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('التاريخ *', 'Date *', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>{t('الساعات *', 'Hours *', lang)}</Label><Input type="number" min="0" step="0.5" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} dir="ltr" required /></div>
          </div>
          <div className="space-y-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending || !form.equipmentId || !form.operatorId || !form.projectId || !form.date || !form.hours} className="bg-emerald-600 hover:bg-emerald-700">{createMutation.isPending ? t('جاري الحفظ...', 'Saving...', lang) : t('تسجيل', 'Record', lang)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Equipment Operations Module ============
export function EquipmentOperationsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: operations = [], isLoading, isError, refetch } = useQuery<EquipmentOperation[]>({
    queryKey: ['equipment-operations'],
    queryFn: async () => { const res = await fetch('/api/equipment/operations'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: equipment = [] } = useQuery<Equipment[]>({
    queryKey: ['equipment-list'],
    queryFn: async () => { const res = await fetch('/api/equipment'); if (!res.ok) return []; return res.json() },
  })

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-list'],
    queryFn: async () => { const res = await fetch('/api/employees?activeOnly=true'); if (!res.ok) return []; return res.json() },
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-list'],
    queryFn: async () => { const res = await fetch('/api/projects/list'); if (!res.ok) return []; return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/equipment/operations/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment-operations'] }),
  })

  const filtered = operations.filter(op => {
    if (!search) return true
    const s = search.toLowerCase()
    return op.equipment.name.toLowerCase().includes(s) || op.operator.name.toLowerCase().includes(s) || op.project.name.toLowerCase().includes(s)
  })

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'equipmentName', label: t('المعدة', 'Equipment', lang) },
      { key: 'operatorName', label: t('المشغل', 'Operator', lang) },
      { key: 'projectName', label: t('المشروع', 'Project', lang) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
      { key: 'hours', label: t('الساعات', 'Hours', lang) },
      { key: 'notes', label: t('ملاحظات', 'Notes', lang) },
    ]
    exportToCSV(filtered.map(op => ({
      equipmentName: op.equipment.name, operatorName: op.operator.name,
      projectName: op.project.name, date: op.date, hours: op.hours, notes: op.notes || '',
    })), `equipment-operations-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={{ ar: 'تشغيل المعدات', en: 'Equipment Operations' }}
      subtitle={{ ar: 'متابعة عمليات تشغيل المعدات', en: 'Track equipment operations' }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => window.print()}><Printer className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4" />{t('تسجيل تشغيل', 'Record Operation', lang)}</Button>
        </div>
      }
    >
      {/* Search */}
      <Card><CardContent className="p-4">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث بالمعدة أو المشغل أو المشروع...', 'Search by equipment, operator or project...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><Settings className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد سجلات تشغيل', 'No operation records', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4 mr-1" />{t('تسجيل تشغيل', 'Record Operation', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('المعدة', 'Equipment', lang)}</TableHead>
                <TableHead className="text-right">{t('المشغل', 'Operator', lang)}</TableHead>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-right">{t('الساعات', 'Hours', lang)}</TableHead>
                <TableHead className="text-right">{t('ملاحظات', 'Notes', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(op => (
                  <TableRow key={op.id}>
                    <TableCell className="font-medium">{op.equipment.name}</TableCell>
                    <TableCell>{op.operator.name}</TableCell>
                    <TableCell>{op.project.name}</TableCell>
                    <TableCell>{formatDate(op.date, lang)}</TableCell>
                    <TableCell>{op.hours} {t('ساعة', 'hrs', lang)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{op.notes || '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من حذف السجل؟', 'Are you sure you want to delete this record?', lang))) deleteMutation.mutate(op.id) }}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <OperationFormDialog open={dialogOpen} onOpenChange={setDialogOpen} equipment={equipment} employees={employees} projects={projects} />
    </ModuleLayout>
  )
}

'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Fuel as FuelIcon, Plus, Search, Trash2, RefreshCw,
  Download, BookOpen, MapPin,
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
import { useAppStore, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
interface Equipment { id: string; code: string; name: string; nameAr: string | null }
interface Project { id: string; code: string; name: string }

interface FuelLog {
  id: string; equipmentId: string; projectId: string | null
  date: string; liters: number; costPerLiter: number; totalCost: number
  journalEntryId: string | null
  equipment: Equipment; project: Project | null
}

interface FuelFormData {
  equipmentId: string; projectId: string; date: string
  liters: string; costPerLiter: string
}

const defaultForm: FuelFormData = {
  equipmentId: '', projectId: '', date: '',
  liters: '', costPerLiter: '',
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Fuel Form Dialog ============
function FuelFormDialog({ open, onOpenChange, equipment, projects }: {
  open: boolean; onOpenChange: (open: boolean) => void; equipment: Equipment[]; projects: Project[]
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FuelFormData>(defaultForm)
  const { lang } = useAppStore()

  const totalCost = (parseFloat(form.liters) || 0) * (parseFloat(form.costPerLiter) || 0)

  React.useEffect(() => {
    if (open) setForm(defaultForm)
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/equipment/fuel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-fuel'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      ...form,
      liters: parseFloat(form.liters) || 0,
      costPerLiter: parseFloat(form.costPerLiter) || 0,
      projectId: form.projectId || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('سجل وقود', 'Fuel Log', lang)}</DialogTitle>
          <DialogDescription>{t('إضافة سجل وقود جديد', 'Add new fuel log entry', lang)}</DialogDescription>
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
            <Label>{t('المشروع', 'Project', lang)}</Label>
            <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
              <SelectTrigger><SelectValue placeholder={t('اختر المشروع (اختياري)', 'Select project (optional)', lang)} /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('التاريخ *', 'Date *', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>{t('اللترات *', 'Liters *', lang)}</Label><Input type="number" min="0" step="0.1" value={form.liters} onChange={e => setForm(f => ({ ...f, liters: e.target.value }))} dir="ltr" required /></div>
          </div>
          <div className="space-y-2"><Label>{t('سعر اللتر *', 'Cost/Liter *', lang)}</Label><Input type="number" min="0" step="0.01" value={form.costPerLiter} onChange={e => setForm(f => ({ ...f, costPerLiter: e.target.value }))} dir="ltr" required /></div>

          {totalCost > 0 && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-3">
                <p className="text-sm text-emerald-600">{t('الإجمالي', 'Total', lang)}: <span className="font-bold text-emerald-700"><MoneyDisplay value={totalCost} lang={lang} size="md" inline bold /></span></p>
                <p className="text-xs text-emerald-500 mt-1">{form.liters} {t('لتر ×', 'L ×', lang)} {form.costPerLiter} {t('ر.س/لتر', 'SAR/L', lang)}</p>
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending || !form.equipmentId || !form.date || !form.liters || !form.costPerLiter} className="bg-emerald-600 hover:bg-emerald-700">{createMutation.isPending ? t('جاري الحفظ...', 'Saving...', lang) : t('تسجيل', 'Record', lang)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Fuel Module ============
export function FuelModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [filterProject, setFilterProject] = useState('')

  const { data: fuelLogs = [], isLoading, isError, refetch } = useQuery<FuelLog[]>({
    queryKey: ['equipment-fuel', filterProject],
    queryFn: async () => {
      const url = filterProject ? `/api/equipment/fuel?projectId=${filterProject}` : '/api/equipment/fuel'
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: equipment = [] } = useQuery<Equipment[]>({
    queryKey: ['equipment-list'],
    queryFn: async () => { const res = await fetch('/api/equipment'); if (!res.ok) return []; return res.json() },
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-list'],
    queryFn: async () => { const res = await fetch('/api/projects/list'); if (!res.ok) return []; return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/equipment/fuel/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment-fuel'] }),
  })

  const filtered = fuelLogs.filter(f => {
    if (!search) return true
    const s = search.toLowerCase()
    return f.equipment.name.toLowerCase().includes(s) || (f.project?.name.toLowerCase().includes(s))
  })

  const totalLiters = filtered.reduce((sum, f) => sum + (f.liters ?? 0), 0)
  const totalCost = filtered.reduce((sum, f) => sum + (Number(f.totalCost || 0)), 0)

  const printData = useMemo(() => ({
    columns: [
      { key: 'equipment', label: lang === 'ar' ? 'المعدة' : 'Equipment' },
      { key: 'project', label: lang === 'ar' ? 'المشروع' : 'Project' },
      { key: 'date', label: lang === 'ar' ? 'التاريخ' : 'Date' },
      { key: 'liters', label: lang === 'ar' ? 'اللترات' : 'Liters' },
      { key: 'costPerLiter', label: lang === 'ar' ? 'سعر اللتر' : 'Cost/L' },
      { key: 'totalCost', label: lang === 'ar' ? 'الإجمالي' : 'Total' },
    ],
    rows: filtered.map(f => ({
      equipment: f.equipment.name,
      project: f.project?.name || '',
      date: f.date,
      liters: f.liters,
      costPerLiter: f.costPerLiter,
      totalCost: f.totalCost,
    })),
    infoItems: [
      { label: lang === 'ar' ? 'إجمالي اللترات' : 'Total Liters', value: String(totalLiters) },
      { label: lang === 'ar' ? 'إجمالي التكلفة' : 'Total Cost', value: String(totalCost) },
      { label: lang === 'ar' ? 'عدد السجلات' : 'Records', value: String(filtered.length) },
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
    ],
  }), [filtered, lang, totalLiters, totalCost])

  // Fuel cost per project
  const projectFuelCosts = (() => {
    const map: Record<string, { name: string; liters: number; cost: number }> = {}
    filtered.forEach(f => {
      const key = f.projectId || 'unassigned'
      const name = f.project?.name || t('غير مخصص', 'Unassigned', lang)
      if (!map[key]) map[key] = { name, liters: 0, cost: 0 }
      map[key].liters += f.liters
      map[key].cost += f.totalCost
    })
    return Object.values(map)
  })()

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'equipmentName', label: t('المعدة', 'Equipment', lang) },
      { key: 'projectName', label: t('المشروع', 'Project', lang) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
      { key: 'liters', label: t('اللترات', 'Liters', lang) },
      { key: 'costPerLiter', label: t('سعر اللتر', 'Cost/L', lang) },
      { key: 'totalCost', label: t('الإجمالي', 'Total Cost', lang) },
      { key: 'accountingEntry', label: t('قيد محاسبي', 'Accounting', lang) },
    ]
    exportToCSV(filtered.map(f => ({
      equipmentName: f.equipment.name, projectName: f.project?.name || '',
      date: f.date, liters: f.liters, costPerLiter: f.costPerLiter, totalCost: f.totalCost,
      accountingEntry: f.journalEntryId ? t('نعم', 'Yes', lang) : t('لا', 'No', lang),
    })), `fuel-logs-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={{ ar: 'الوقود', en: 'Fuel' }}
      subtitle={{ ar: 'تتبع استهلاك الوقود للمعدات', en: 'Track equipment fuel consumption' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="fuel-report" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4" />{t('سجل وقود', 'Add Fuel Log', lang)}</Button>
        </div>
      }
    >
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-amber-600">{t('إجمالي اللترات', 'Total Liters', lang)}</p>
            <p className="text-lg font-bold text-amber-700">{(totalLiters ?? 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} {t('لتر', 'L', lang)}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-600">{t('إجمالي التكلفة', 'Total Cost', lang)}</p>
            <MoneyDisplay value={totalCost} lang={lang} size="lg" bold />
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-teal-600">{t('عدد السجلات', 'Records', lang)}</p>
            <p className="text-lg font-bold text-teal-700">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Fuel Cost by Project */}
      {projectFuelCosts.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="p-4"><h3 className="text-sm font-semibold text-emerald-700">{t('تكاليف الوقود حسب المشروع', 'Fuel Cost by Project', lang)}</h3></div>
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                <TableHead className="text-right">{t('اللترات', 'Liters', lang)}</TableHead>
                <TableHead className="text-right">{t('التكلفة', 'Cost', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {projectFuelCosts.map(p => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{(p.liters ?? 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} {t('لتر', 'L', lang)}</TableCell>
                    <TableCell><MoneyDisplay value={p.cost} lang={lang} size="sm" bold /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Search & Filter */}
      <Card><CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث بالمعدة أو المشروع...', 'Search by equipment or project...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
          <Select value={filterProject || 'ALL'} onValueChange={v => setFilterProject(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder={t('كل المشاريع', 'All Projects', lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('كل المشاريع', 'All Projects', lang)}</SelectItem>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><FuelIcon className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد سجلات وقود', 'No fuel logs', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4 mr-1" />{t('إضافة سجل وقود', 'Add Fuel Log', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('المعدة', 'Equipment', lang)}</TableHead>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-right">{t('اللترات', 'Liters', lang)}</TableHead>
                <TableHead className="text-right">{t('سعر اللتر', 'Cost/L', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead className="text-right">{t('قيد محاسبي', 'Accounting', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.equipment.name}</TableCell>
                    <TableCell>
                      {f.project ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                          <MapPin className="size-3" />{f.project.name}
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>{formatDate(f.date, lang)}</TableCell>
                    <TableCell dir="ltr" className="text-right">{(f.liters ?? 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}</TableCell>
                    <TableCell><MoneyDisplay value={f.costPerLiter} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={f.totalCost} lang={lang} size="sm" bold /></TableCell>
                    <TableCell>
                      {f.journalEntryId ? (
                        <Badge className="bg-purple-100 text-purple-700 border-0 gap-1"><BookOpen className="size-3" />{t('مسجل', 'Posted', lang)}</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500">—</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من حذف السجل؟', 'Are you sure you want to delete this record?', lang))) deleteMutation.mutate(f.id) }}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <FuelFormDialog open={dialogOpen} onOpenChange={setDialogOpen} equipment={equipment} projects={projects} />
    </ModuleLayout>
  )
}

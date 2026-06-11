'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wrench, Plus, Search, Pencil, Trash2, RefreshCw,
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
interface Supplier { id: string; code: string; name: string; nameAr: string | null }
interface Project { id: string; code: string; name: string }

interface EquipmentMaintenance {
  id: string; equipmentId: string; date: string; description: string
  cost: number; supplierId: string | null; nextDate: string | null
  journalEntryId: string | null
  equipment: Equipment; supplier: Supplier | null
}

interface MaintenanceFormData {
  equipmentId: string; date: string; description: string
  cost: string; supplierId: string; nextDate: string
}

const defaultForm: MaintenanceFormData = {
  equipmentId: '', date: '', description: '',
  cost: '0', supplierId: '', nextDate: '',
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Maintenance Form Dialog ============
function MaintenanceFormDialog({ open, onOpenChange, editingRecord, equipment, suppliers }: {
  open: boolean; onOpenChange: (open: boolean) => void; editingRecord: EquipmentMaintenance | null; equipment: Equipment[]; suppliers: Supplier[]
}) {
  const queryClient = useQueryClient()
  const isEdit = !!editingRecord
  const [form, setForm] = useState<MaintenanceFormData>(defaultForm)
  const { lang } = useAppStore()

  React.useEffect(() => {
    if (open) {
      if (editingRecord) {
        setForm({
          equipmentId: editingRecord.equipmentId,
          date: editingRecord.date ? editingRecord.date.split('T')[0] : '',
          description: editingRecord.description,
          cost: String(editingRecord.cost),
          supplierId: editingRecord.supplierId || '',
          nextDate: editingRecord.nextDate ? editingRecord.nextDate.split('T')[0] : '',
        })
      } else { setForm(defaultForm) }
    }
  }, [open, editingRecord])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/equipment/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-maintenance'] }); queryClient.invalidateQueries({ queryKey: ['equipment'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      ...form,
      cost: parseFloat(form.cost) || 0,
      supplierId: form.supplierId || null,
      nextDate: form.nextDate || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('تعديل سجل صيانة', 'Edit Maintenance', lang) : t('سجل صيانة جديد', 'New Maintenance Record', lang)}</DialogTitle>
          <DialogDescription>{isEdit ? t('تعديل بيانات الصيانة', 'Edit maintenance data', lang) : t('إضافة سجل صيانة جديد', 'Add new maintenance record', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('المعدة *', 'Equipment *', lang)}</Label>
            <Select value={form.equipmentId} onValueChange={v => setForm(f => ({ ...f, equipmentId: v }))} disabled={isEdit}>
              <SelectTrigger><SelectValue placeholder={t('اختر المعدة', 'Select equipment', lang)} /></SelectTrigger>
              <SelectContent>
                {equipment.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('التاريخ *', 'Date *', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>{t('التكلفة *', 'Cost *', lang)}</Label><Input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} dir="ltr" required /></div>
          </div>
          <div className="space-y-2"><Label>{t('الوصف *', 'Description *', lang)}</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required /></div>
          <div className="space-y-2">
            <Label>{t('المورد', 'Supplier', lang)}</Label>
            <Select value={form.supplierId} onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
              <SelectTrigger><SelectValue placeholder={t('اختر المورد (اختياري)', 'Select supplier (optional)', lang)} /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>{t('تاريخ الصيانة القادمة', 'Next Maintenance Date', lang)}</Label><Input type="date" value={form.nextDate} onChange={e => setForm(f => ({ ...f, nextDate: e.target.value }))} /></div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending || !form.equipmentId || !form.date || !form.description} className="bg-emerald-600 hover:bg-emerald-700">{createMutation.isPending ? t('جاري الحفظ...', 'Saving...', lang) : isEdit ? t('تحديث', 'Update', lang) : t('إنشاء', 'Create', lang)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Equipment Maintenance Module ============
export function EquipmentMaintenanceModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<EquipmentMaintenance | null>(null)

  const { data: records = [], isLoading, isError, refetch } = useQuery<EquipmentMaintenance[]>({
    queryKey: ['equipment-maintenance'],
    queryFn: async () => { const res = await fetch('/api/equipment/maintenance'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: equipment = [] } = useQuery<Equipment[]>({
    queryKey: ['equipment-list'],
    queryFn: async () => { const res = await fetch('/api/equipment'); if (!res.ok) return []; return res.json() },
  })

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers-list'],
    queryFn: async () => { const res = await fetch('/api/suppliers'); if (!res.ok) return []; return res.json() },
  })

  // Fetch resource allocations for equipment to show project assignment
  const { data: allocations = [] } = useQuery<{ resourceId: string; resourceType: string; projectId: string; project: Project }[]>({
    queryKey: ['resource-distribution'],
    queryFn: async () => { const res = await fetch('/api/resource-distribution'); if (!res.ok) return []; return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/equipment/maintenance/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment-maintenance'] }),
  })

  const filtered = records.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return r.equipment.name.toLowerCase().includes(s) || r.description.toLowerCase().includes(s) || (r.supplier?.name.toLowerCase().includes(s))
  })

  const totalCost = filtered.reduce((sum, r) => sum + (r.cost ?? 0), 0)

  const printData = useMemo(() => ({
    columns: [
      { key: 'equipment', label: lang === 'ar' ? 'المعدة' : 'Equipment' },
      { key: 'date', label: lang === 'ar' ? 'التاريخ' : 'Date' },
      { key: 'description', label: lang === 'ar' ? 'الوصف' : 'Description' },
      { key: 'cost', label: lang === 'ar' ? 'التكلفة' : 'Cost' },
      { key: 'supplier', label: lang === 'ar' ? 'المورد' : 'Supplier' },
      { key: 'nextDate', label: lang === 'ar' ? 'الصيانة القادمة' : 'Next Date' },
    ],
    rows: filtered.map(r => ({
      equipment: r.equipment.name,
      date: r.date,
      description: r.description,
      cost: r.cost,
      supplier: r.supplier?.name || '',
      nextDate: r.nextDate || '',
    })),
    infoItems: [
      { label: lang === 'ar' ? 'إجمالي تكاليف الصيانة' : 'Total Maintenance Cost', value: String(totalCost) },
      { label: lang === 'ar' ? 'عدد السجلات' : 'Records', value: String(filtered.length) },
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
    ],
  }), [filtered, lang, totalCost])

  // Get project assignment for an equipment
  const getProjectForEquipment = (equipmentId: string): Project | null => {
    const alloc = allocations.find(a => a.resourceId === equipmentId && a.resourceType === 'EQUIPMENT')
    return alloc?.project || null
  }

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'equipmentName', label: t('المعدة', 'Equipment', lang) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
      { key: 'description', label: t('الوصف', 'Description', lang) },
      { key: 'cost', label: t('التكلفة', 'Cost', lang) },
      { key: 'supplierName', label: t('المورد', 'Supplier', lang) },
      { key: 'nextDate', label: t('الصيانة القادمة', 'Next Date', lang) },
      { key: 'projectName', label: t('المشروع', 'Project', lang) },
      { key: 'accountingEntry', label: t('قيد محاسبي', 'Accounting Entry', lang) },
    ]
    exportToCSV(filtered.map(r => ({
      equipmentName: r.equipment.name, date: r.date, description: r.description,
      cost: r.cost, supplierName: r.supplier?.name || '', nextDate: r.nextDate || '',
      projectName: getProjectForEquipment(r.equipmentId)?.name || '',
      accountingEntry: r.journalEntryId ? t('نعم', 'Yes', lang) : t('لا', 'No', lang),
    })), `equipment-maintenance-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={{ ar: 'صيانة المعدات', en: 'Equipment Maintenance' }}
      subtitle={{ ar: 'جدولة ومتابعة صيانة المعدات', en: 'Schedule and track equipment maintenance' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="maintenance-report" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingRecord(null); setDialogOpen(true) }}><Plus className="size-4" />{t('سجل صيانة', 'Add Maintenance', lang)}</Button>
        </div>
      }
    >
      {/* Summary */}
      {filtered.length > 0 && (
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3">
            <p className="text-sm text-teal-600">{t('إجمالي تكاليف الصيانة', 'Total Maintenance Cost', lang)}: <span className="font-bold text-teal-700"><MoneyDisplay value={totalCost} lang={lang} size="md" inline bold /></span></p>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card><CardContent className="p-4">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث بالمعدة أو الوصف أو المورد...', 'Search by equipment, description or supplier...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><Wrench className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد سجلات صيانة', 'No maintenance records', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingRecord(null); setDialogOpen(true) }}><Plus className="size-4 mr-1" />{t('إضافة صيانة', 'Add Maintenance', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('المعدة', 'Equipment', lang)}</TableHead>
                <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead className="text-right">{t('التكلفة', 'Cost', lang)}</TableHead>
                <TableHead className="text-right">{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                <TableHead className="text-right">{t('قيد محاسبي', 'Accounting', lang)}</TableHead>
                <TableHead className="text-right">{t('الصيانة القادمة', 'Next Date', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const project = getProjectForEquipment(r.equipmentId)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.equipment.name}</TableCell>
                      <TableCell>{formatDate(r.date, lang)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
                      <TableCell><MoneyDisplay value={r.cost} lang={lang} size="sm" /></TableCell>
                      <TableCell>{r.supplier?.name || '—'}</TableCell>
                      <TableCell>
                        {project ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                            <MapPin className="size-3" />{project.name}
                          </Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {r.journalEntryId ? (
                          <Badge className="bg-purple-100 text-purple-700 border-0 gap-1"><BookOpen className="size-3" />{t('مسجل', 'Posted', lang)}</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-500">—</Badge>
                        )}
                      </TableCell>
                      <TableCell>{r.nextDate ? formatDate(r.nextDate, lang) : '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditingRecord(r); setDialogOpen(true) }}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من حذف السجل؟', 'Are you sure you want to delete this record?', lang))) deleteMutation.mutate(r.id) }}><Trash2 className="size-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <MaintenanceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editingRecord={editingRecord} equipment={equipment} suppliers={suppliers} />
    </ModuleLayout>
  )
}

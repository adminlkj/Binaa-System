'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  HardHat, Plus, Search, RefreshCw, Users, Calculator, Trash2, Pencil, Download,
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ModuleLayout } from '@/components/shared/module-layout'
import { MoneyDisplay } from '@/components/ui/money-display'
import { PrintButton } from '@/components/shared/print-button'
import { useAppStore, formatDate, formatNumber, commonText, type Lang } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { toast } from 'sonner'

// ============ Types ============
interface ProjectOption { id: string; code: string; name: string }

interface LaborCost {
  id: string; projectId: string; description: string; workers: number
  days: number; dailyRate: number; totalAmount: number; date: string
  project: { id: string; code: string; name: string }
}

// ============ Bilingual Helpers ============
const t = (lang: Lang, ar: string, en: string) => lang === 'ar' ? ar : en

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Labor Cost Form Dialog (Create + Edit) ============
function LaborCostFormDialog({
  open, onOpenChange, projects, editItem,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  projects: ProjectOption[]; editItem?: LaborCost | null
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const isEdit = !!editItem

  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [workers, setWorkers] = useState('')
  const [days, setDays] = useState('')
  const [dailyRate, setDailyRate] = useState('')
  const [date, setDate] = useState('')

  React.useEffect(() => {
    if (open) {
      if (editItem) {
        setProjectId(editItem.projectId || editItem.project?.id || '')
        setDescription(editItem.description)
        setWorkers(String(editItem.workers))
        setDays(String(editItem.days))
        setDailyRate(String(editItem.dailyRate))
        setDate(editItem.date ? new Date(editItem.date).toISOString().split('T')[0] : '')
      } else {
        setProjectId(''); setDescription(''); setWorkers('')
        setDays(''); setDailyRate(''); setDate('')
      }
    }
  }, [open, editItem])

  const totalAmount = useMemo(() => {
    const w = parseFloat(workers) || 0
    const d = parseFloat(days) || 0
    const r = parseFloat(dailyRate) || 0
    return w * d * r
  }, [workers, days, dailyRate])

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown> & { id?: string }) => {
      const payload = { projectId, description, workers, days, dailyRate, date }
      if (data.id) {
        return fetch(`/api/labor-costs/${data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => { if (!r.ok) throw new Error(); return r.json() })
      }
      return fetch('/api/labor-costs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => { if (!r.ok) throw new Error(); return r.json() })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labor-costs'] })
      toast(t(lang, isEdit ? 'تم تحديث تكلفة العمالة بنجاح' : 'تم إضافة تكلفة العمالة بنجاح', isEdit ? 'Labor cost updated successfully' : 'Labor cost added successfully'))
      onOpenChange(false)
    },
    onError: () => {
      toast.error(t(lang, 'فشل في حفظ تكلفة العمالة', 'Failed to save labor cost'))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate({ projectId, description, workers, days, dailyRate, date, id: editItem?.id })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(lang, isEdit ? 'تعديل تكلفة العمالة' : 'تكلفة عمالة جديدة', isEdit ? 'Edit Labor Cost' : 'New Labor Cost')}</DialogTitle>
          <DialogDescription>{t(lang, isEdit ? 'تعديل بيانات تكلفة العمالة' : 'إضافة تكلفة عمالة للمشروع', isEdit ? 'Edit labor cost details' : 'Add labor cost for project')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'المشروع *', 'Project *')}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر المشروع', 'Select project')} /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'الوصف *', 'Description *')}</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t(lang, 'وصف العمل', 'Work description')} required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'عدد العمال *', 'Workers *')}</Label>
              <Input type="number" min="1" value={workers} onChange={e => setWorkers(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'عدد الأيام *', 'Days *')}</Label>
              <Input type="number" min="0.5" step="0.5" value={days} onChange={e => setDays(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'الأجر اليومي *', 'Daily Rate *')}</Label>
              <Input type="number" min="0" step="0.01" value={dailyRate} onChange={e => setDailyRate(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'التاريخ *', 'Date *')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
          </div>

          {/* Auto-calc Preview */}
          {totalAmount > 0 && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Calculator className="size-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">{t(lang, 'حساب تلقائي', 'Auto Calculation')}</span>
                </div>
                <p className="text-xs text-emerald-600">
                  {t(lang, 'العدد × الأيام × الأجر اليومي = الإجمالي', 'Workers × Days × Daily Rate = Total')}
                </p>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-emerald-600">
                    {formatNumber(parseFloat(workers) || 0)} × {formatNumber(parseFloat(days) || 0)} × <MoneyDisplay value={parseFloat(dailyRate) || 0} lang={lang} size="xs" inline />
                  </span>
                  <MoneyDisplay value={totalAmount} lang={lang} bold size="lg" className="text-emerald-700" />
                </div>
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{commonText.cancel[lang]}</Button>
            <Button type="submit" disabled={saveMutation.isPending || !projectId || !description || !workers || !days || !dailyRate || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {saveMutation.isPending ? t(lang, 'جاري الحفظ...', 'Saving...') : isEdit ? t(lang, 'حفظ التعديلات', 'Save Changes') : t(lang, 'إضافة تكلفة العمالة', 'Add Labor Cost')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Labor Costs Module ============
export function LaborModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<LaborCost | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: laborCosts = [], isLoading, isError, refetch } = useQuery<LaborCost[]>({
    queryKey: ['labor-costs'],
    queryFn: async () => {
      const res = await fetch('/api/labor-costs')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['projects-list'],
    queryFn: async () => {
      const res = await fetch('/api/projects/list')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/labor-costs/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labor-costs'] })
      toast(t(lang, 'تم حذف تكلفة العمالة بنجاح', 'Labor cost deleted successfully'))
      setDeleteId(null)
    },
    onError: () => {
      toast.error(t(lang, 'فشل في حذف تكلفة العمالة', 'Failed to delete labor cost'))
    },
  })

  const filtered = laborCosts.filter(lc => {
    const matchProject = projectFilter === 'all' || lc.projectId === projectFilter
    const matchSearch = !search ||
      lc.description.toLowerCase().includes(search.toLowerCase()) ||
      lc.project.name.toLowerCase().includes(search.toLowerCase())
    return matchProject && matchSearch
  })

  // Summary
  const totalLabor = laborCosts.reduce((s, l) => s + Number(l.totalAmount || 0), 0)
  const totalWorkers = laborCosts.reduce((s, l) => s + (l.workers ?? 0), 0)
  const avgDailyRate = laborCosts.length > 0 ? laborCosts.reduce((s, l) => s + Number(l.dailyRate || 0), 0) / laborCosts.length : 0

  // CSV export
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'projectName', label: t(lang, 'المشروع', 'Project') },
      { key: 'description', label: t(lang, 'الوصف', 'Description') },
      { key: 'workers', label: t(lang, 'عدد العمال', 'Workers') },
      { key: 'days', label: t(lang, 'الأيام', 'Days'), format: (v) => (Number(v) || 0).toFixed(1) },
      { key: 'dailyRate', label: t(lang, 'الأجر اليومي', 'Daily Rate'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'totalAmount', label: t(lang, 'الإجمالي', 'Total'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'date', label: t(lang, 'التاريخ', 'Date') },
    ]
    const rows = filtered.map(lc => ({
      projectName: lc.project.name,
      description: lc.description,
      workers: lc.workers,
      days: lc.days,
      dailyRate: Number(lc.dailyRate),
      totalAmount: Number(lc.totalAmount),
      date: formatDate(lc.date, lang),
    }))
    exportToCSV(rows, `labor-costs-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  // Print data
  const printData = {
    columns: [
      { key: 'projectName', label: lang === 'ar' ? 'المشروع' : 'Project' },
      { key: 'description', label: lang === 'ar' ? 'الوصف' : 'Description' },
      { key: 'workers', label: lang === 'ar' ? 'العمال' : 'Workers' },
      { key: 'days', label: lang === 'ar' ? 'الأيام' : 'Days' },
      { key: 'totalAmount', label: lang === 'ar' ? 'الإجمالي' : 'Total' },
      { key: 'date', label: lang === 'ar' ? 'التاريخ' : 'Date' },
    ],
    rows: filtered.map(lc => ({
      projectName: lc.project.name,
      description: lc.description,
      workers: lc.workers,
      days: lc.days,
      totalAmount: Number(lc.totalAmount),
      date: formatDate(lc.date, lang),
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
      { label: lang === 'ar' ? 'إجمالي العمالة' : 'Total Labor', value: String(totalLabor) },
    ],
  }

  // Open edit dialog
  const handleEdit = (item: LaborCost) => {
    setEditItem(item)
    setDialogOpen(true)
  }

  // Open create dialog
  const handleCreate = () => {
    setEditItem(null)
    setDialogOpen(true)
  }

  // Close dialog
  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) setEditItem(null)
  }

  return (
    <ModuleLayout
      title={{ ar: 'تكاليف العمالة', en: 'Labor Costs' }}
      subtitle={{ ar: 'إدارة تكاليف العمالة للمشاريع', en: 'Manage project labor costs' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="labor-report" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport} title={t(lang, 'تصدير CSV', 'Export CSV')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t(lang, 'تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate}>
            <Plus className="size-4" /> {t(lang, 'تكلفة عمالة جديدة', 'New Labor Cost')}
          </Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <HardHat className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{t(lang, 'إجمالي تكاليف العمالة', 'Total Labor Costs')}</p>
              <MoneyDisplay value={totalLabor} lang={lang} bold size="lg" className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-teal-100 flex items-center justify-center">
              <Users className="size-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-teal-600">{t(lang, 'عدد العمال', 'Total Workers')}</p>
              <p className="text-xl font-bold text-teal-700">{formatNumber(totalWorkers)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Calculator className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600">{t(lang, 'متوسط الأجر اليومي', 'Avg Daily Rate')}</p>
              <MoneyDisplay value={avgDailyRate} lang={lang} bold size="lg" className="text-amber-700" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t(lang, 'بحث بالوصف أو المشروع...', 'Search by description or project...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t(lang, 'كل المشاريع', 'All Projects')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(lang, 'كل المشاريع', 'All Projects')}</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{t(lang, 'حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
              <Button variant="outline" onClick={() => refetch()}>{t(lang, 'إعادة المحاولة', 'Retry')}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <HardHat className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t(lang, 'لا توجد تكاليف عمالة', 'No labor costs found')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate}>
                <Plus className="size-4 mr-1" /> {t(lang, 'إضافة تكلفة عمالة', 'Add Labor Cost')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(lang, 'المشروع', 'Project')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الوصف', 'Description')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'عدد العمال', 'Workers')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الأيام', 'Days')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الأجر اليومي', 'Daily Rate')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الإجمالي', 'Total')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'التاريخ', 'Date')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الإجراءات', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(lc => (
                    <TableRow key={lc.id}>
                      <TableCell className="font-medium">{lc.project.name}</TableCell>
                      <TableCell>{lc.description}</TableCell>
                      <TableCell>{formatNumber(lc.workers)}</TableCell>
                      <TableCell>{formatNumber(lc.days)}</TableCell>
                      <TableCell><MoneyDisplay value={lc.dailyRate} lang={lang} size="sm" /></TableCell>
                      <TableCell className="font-semibold">
                        <MoneyDisplay value={lc.totalAmount} lang={lang} bold size="sm" className="text-emerald-700" />
                      </TableCell>
                      <TableCell>{formatDate(lc.date, lang)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => handleEdit(lc)} title={t(lang, 'تعديل', 'Edit')}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-500" onClick={() => setDeleteId(lc.id)} title={t(lang, 'حذف', 'Delete')}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <LaborCostFormDialog open={dialogOpen} onOpenChange={handleDialogClose} projects={projects} editItem={editItem} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(lang, 'حذف تكلفة العمالة', 'Delete Labor Cost')}</AlertDialogTitle>
            <AlertDialogDescription>{t(lang, 'هل أنت متأكد من حذف تكلفة العمالة هذه؟', 'Are you sure you want to delete this labor cost?')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{commonText.cancel[lang]}</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {commonText.delete[lang]}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModuleLayout>
  )
}

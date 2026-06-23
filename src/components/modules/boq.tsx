'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Plus, Search, RefreshCw, Trash2, Pencil, Download,
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatNumber, formatDate, commonText, type Lang } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { useToast } from '@/hooks/use-toast'

// ============ Types ============
interface ProjectSummary { id: string; name: string; code: string }

interface BOQItemData {
  id: string; code: string; description: string; unit: string
  quantity: number; unitPrice: number; totalPrice: number; category: string | null
  project: ProjectSummary
}

// ============ Bilingual Helpers ============
const t = (lang: Lang, ar: string, en: string) => lang === 'ar' ? ar : en

// ============ Skeleton ============
function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ BOQ Form Dialog (Create + Edit) ============
interface BOQFormData {
  projectId: string; code: string; description: string; unit: string
  quantity: string; unitPrice: string; category: string
}

function BOQFormDialog({
  open, onOpenChange, projects, preselectedProjectId, editItem,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  projects: ProjectSummary[]; preselectedProjectId?: string
  editItem?: BOQItemData | null
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const isEdit = !!editItem

  const [form, setForm] = useState<BOQFormData>({
    projectId: '', code: '', description: '', unit: '',
    quantity: '', unitPrice: '', category: '',
  })

  React.useEffect(() => {
    if (open) {
      if (editItem) {
        setForm({
          projectId: editItem.projectId || editItem.project?.id || '',
          code: editItem.code,
          description: editItem.description,
          unit: editItem.unit,
          quantity: String(editItem.quantity),
          unitPrice: String(editItem.unitPrice),
          category: editItem.category || '',
        })
      } else {
        setForm({
          projectId: preselectedProjectId || '',
          code: '', description: '', unit: '',
          quantity: '', unitPrice: '', category: '',
        })
      }
    }
  }, [open, preselectedProjectId, editItem])

  const saveMutation = useMutation({
    mutationFn: (data: BOQFormData & { id?: string }) => {
      const payload = {
        projectId: data.projectId,
        code: data.code,
        description: data.description,
        unit: data.unit,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        category: data.category || null,
      }
      if (data.id) {
        return fetch(`/api/boq/${data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => { if (!r.ok) throw new Error(); return r.json() })
      }
      return fetch('/api/boq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => { if (!r.ok) throw new Error(); return r.json() })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boq'] })
      toast({
        title: t(lang, isEdit ? 'تم التحديث' : 'تم الإنشاء', isEdit ? 'Updated' : 'Created'),
        description: t(lang, isEdit ? 'تم تحديث البند بنجاح' : 'تم إنشاء البند بنجاح', isEdit ? 'Item updated successfully' : 'Item created successfully'),
      })
      onOpenChange(false)
    },
    onError: () => {
      toast({ title: t(lang, 'خطأ', 'Error'), description: t(lang, 'فشل في حفظ البند', 'Failed to save item'), variant: 'destructive' })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate({ ...form, id: editItem?.id })
  }

  // Auto-calculate total price
  const qty = parseFloat(form.quantity) || 0
  const price = parseFloat(form.unitPrice) || 0
  const total = qty * price

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(lang, isEdit ? 'تعديل بند جدول الكميات' : 'بند جديد في جدول الكميات', isEdit ? 'Edit BOQ Item' : 'New BOQ Item')}</DialogTitle>
          <DialogDescription>{t(lang, isEdit ? 'تعديل بيانات البند' : 'إضافة بند جديد لجدول الكميات', isEdit ? 'Edit item details' : 'Add a new item to bill of quantities')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t(lang, 'المشروع *', 'Project *')}</Label>
              <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر المشروع', 'Select project')} /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'كود البند *', 'Code *')}</Label>
              <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="BOQ-001" required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'وصف البند *', 'Description *')}</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t(lang, 'وصف البند', 'Item description')} required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'التصنيف', 'Category')}</Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder={t(lang, 'أعمال خرسانية', 'Concrete works')} />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'الوحدة *', 'Unit *')}</Label>
              <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder={t(lang, 'م² / م³ / طن', 'm² / m³ / ton')} required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'الكمية *', 'Quantity *')}</Label>
              <Input type="number" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'سعر الوحدة *', 'Unit Price *')}</Label>
              <Input type="number" step="0.01" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} placeholder="0.00" dir="ltr" required />
            </div>
          </div>

          {/* Total Preview */}
          {total > 0 && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-600">
                    {formatNumber(qty)} × <MoneyDisplay value={price} lang={lang} size="xs" inline /> = {t(lang, 'الإجمالي', 'Total')}
                  </span>
                  <MoneyDisplay value={total} lang={lang} bold size="lg" className="text-emerald-700" />
                </div>
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{commonText.cancel[lang]}</Button>
            <Button type="submit" disabled={saveMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {saveMutation.isPending ? t(lang, 'جاري الحفظ...', 'Saving...') : isEdit ? t(lang, 'حفظ التعديلات', 'Save Changes') : t(lang, 'إنشاء', 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main BOQ Module ============
export function BOQModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<BOQItemData | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Fetch BOQ items
  const { data: items = [], isLoading, isError, refetch } = useQuery<BOQItemData[]>({
    queryKey: ['boq', selectedProjectId],
    queryFn: async () => {
      const url = selectedProjectId === 'all' ? '/api/boq' : `/api/boq?projectId=${selectedProjectId}`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Fetch projects for filter
  const { data: projects = [] } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-for-boq'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) return []
      const data = await res.json()
      return data.map((p: { id: string; name: string; code: string }) => ({ id: p.id, name: p.name, code: p.code }))
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/boq/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boq'] })
      toast({ title: t(lang, 'تم الحذف', 'Deleted'), description: t(lang, 'تم حذف البند بنجاح', 'Item deleted successfully') })
      setDeleteId(null)
    },
    onError: () => {
      toast({ title: t(lang, 'خطأ', 'Error'), description: t(lang, 'فشل في حذف البند', 'Failed to delete item'), variant: 'destructive' })
    },
  })

  // Filter by search
  const filtered = items.filter(item => {
    if (!search) return true
    return item.code.includes(search) || item.description.includes(search) || (item.category || '').includes(search)
  })

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, BOQItemData[]> = {}
    filtered.forEach(item => {
      const cat = item.category || t(lang, 'غير مصنف', 'Uncategorized')
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    })
    return groups
  }, [filtered, lang])

  const grandTotal = filtered.reduce((s, i) => s + Number(i.totalPrice || 0), 0)

  // CSV Export
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'code', label: t(lang, 'الكود', 'Code') },
      { key: 'description', label: t(lang, 'الوصف', 'Description') },
      { key: 'category', label: t(lang, 'التصنيف', 'Category') },
      { key: 'unit', label: t(lang, 'الوحدة', 'Unit') },
      { key: 'quantity', label: t(lang, 'الكمية', 'Quantity'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'unitPrice', label: t(lang, 'سعر الوحدة', 'Unit Price'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'totalPrice', label: t(lang, 'الإجمالي', 'Total'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'project', label: t(lang, 'المشروع', 'Project') },
    ]
    const rows = filtered.map(item => ({
      code: item.code,
      description: item.description,
      category: item.category || '',
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      project: item.project.name,
    }))
    exportToCSV(rows, `boq-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  // Open edit dialog
  const handleEdit = (item: BOQItemData) => {
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
      title={{ ar: 'جدول الكميات', en: 'Bill of Quantities' }}
      subtitle={{ ar: 'BOQ - بنود الأعمال والكميات', en: 'BOQ - Work items and quantities' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport} title={t(lang, 'تصدير CSV', 'Export CSV')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t(lang, 'تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate}>
            <Plus className="size-4" /> {t(lang, 'بند جديد', 'New Item')}
          </Button>
        </div>
      }
    >
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder={t(lang, 'كل المشاريع', 'All Projects')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(lang, 'كل المشاريع', 'All Projects')}</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t(lang, 'بحث بالكود أو الوصف أو التصنيف...', 'Search by code, description, or category...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t(lang, 'إجمالي البنود', 'Total Items')}</p>
            <p className="text-lg font-bold text-emerald-700">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t(lang, 'عدد التصنيفات', 'Categories')}</p>
            <p className="text-lg font-bold text-teal-700">{Object.keys(grouped).length}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t(lang, 'إجمالي القيمة', 'Total Value')}</p>
            <MoneyDisplay value={grandTotal} lang={lang} bold size="lg" className="text-amber-700" />
          </CardContent>
        </Card>
      </div>

      {/* BOQ Table - Grouped by Category */}
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
              <ClipboardList className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t(lang, 'لا توجد بنود في جدول الكميات', 'No BOQ items found')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate}>
                <Plus className="size-4 mr-1" /> {t(lang, 'إضافة بند', 'Add Item')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(lang, 'الكود', 'Code')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الوصف', 'Description')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الوحدة', 'Unit')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الكمية', 'Quantity')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'سعر الوحدة', 'Unit Price')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الإجمالي', 'Total')}</TableHead>
                    {selectedProjectId === 'all' && <TableHead className="text-right">{t(lang, 'المشروع', 'Project')}</TableHead>}
                    <TableHead className="text-right">{t(lang, 'الإجراءات', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(grouped).map(([category, categoryItems]) => {
                    const categoryTotal = categoryItems.reduce((s, i) => s + Number(i.totalPrice || 0), 0)
                    return (
                      <React.Fragment key={category}>
                        <TableRow className="bg-emerald-50 hover:bg-emerald-50">
                          <TableCell colSpan={selectedProjectId === 'all' ? 8 : 7} className="font-bold text-emerald-700">
                            <div className="flex items-center justify-between">
                              <span>{category}</span>
                              <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                                <MoneyDisplay value={categoryTotal} lang={lang} size="xs" inline />
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                        {categoryItems.map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.code}</TableCell>
                            <TableCell>{item.description}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell>{formatNumber(item.quantity)}</TableCell>
                            <TableCell><MoneyDisplay value={item.unitPrice} lang={lang} size="sm" /></TableCell>
                            <TableCell className="font-semibold">
                              <MoneyDisplay value={item.totalPrice} lang={lang} bold size="sm" />
                            </TableCell>
                            {selectedProjectId === 'all' && (
                              <TableCell className="text-sm text-muted-foreground">{item.project.name}</TableCell>
                            )}
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="size-8" onClick={() => handleEdit(item)} title={t(lang, 'تعديل', 'Edit')}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="size-8 text-rose-500" onClick={() => setDeleteId(item.id)} title={t(lang, 'حذف', 'Delete')}>
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    )
                  })}
                  {/* Grand Total */}
                  <TableRow className="bg-gray-100 font-bold">
                    <TableCell colSpan={selectedProjectId === 'all' ? 5 : 4} className="text-left">
                      {t(lang, 'الإجمالي العام', 'Grand Total')}
                    </TableCell>
                    <TableCell><MoneyDisplay value={grandTotal} lang={lang} bold size="sm" /></TableCell>
                    {selectedProjectId === 'all' && <TableCell />}
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <BOQFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        projects={projects}
        preselectedProjectId={selectedProjectId !== 'all' ? selectedProjectId : undefined}
        editItem={editItem}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(lang, 'حذف بند', 'Delete Item')}</AlertDialogTitle>
            <AlertDialogDescription>{t(lang, 'هل أنت متأكد من حذف هذا البند من جدول الكميات؟', 'Are you sure you want to delete this BOQ item?')}</AlertDialogDescription>
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

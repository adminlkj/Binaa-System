'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Plus, Search, RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { PrintButton } from '@/components/shared/print-button'
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatNumber } from '@/stores/app-store'

// ============ Types ============
interface ProjectSummary { id: string; name: string; code: string }

interface BOQItemData {
  id: string; code: string; description: string; unit: string
  quantity: number; unitPrice: number; totalPrice: number; category: string | null
  project: ProjectSummary
}

// ============ Bilingual Helpers ============
const t = (lang: 'ar' | 'en', ar: string, en: string) => lang === 'ar' ? ar : en

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

// ============ BOQ Form Dialog ============
interface BOQFormData {
  projectId: string; code: string; description: string; unit: string
  quantity: string; unitPrice: string; category: string
}

function BOQFormDialog({
  open, onOpenChange, projects, preselectedProjectId,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  projects: ProjectSummary[]; preselectedProjectId?: string
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<BOQFormData>({
    projectId: '', code: '', description: '', unit: '',
    quantity: '', unitPrice: '', category: '',
  })

  React.useEffect(() => {
    if (open) {
      setForm({
        projectId: preselectedProjectId || '',
        code: '', description: '', unit: '',
        quantity: '', unitPrice: '', category: '',
      })
    }
  }, [open, preselectedProjectId])

  const createMutation = useMutation({
    mutationFn: (data: BOQFormData) =>
      fetch('/api/boq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['boq'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  // Auto-calculate total price
  const qty = parseFloat(form.quantity) || 0
  const price = parseFloat(form.unitPrice) || 0
  const total = qty * price

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(lang, 'بند جديد في جدول الكميات', 'New BOQ Item')}</DialogTitle>
          <DialogDescription>{t(lang, 'إضافة بند جديد لجدول الكميات', 'Add a new item to bill of quantities')}</DialogDescription>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t(lang, 'إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t(lang, 'جاري الحفظ...', 'Saving...') : t(lang, 'إنشاء', 'Create')}
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
  const [search, setSearch] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)

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

  const grandTotal = filtered.reduce((s, i) => s + i.totalPrice, 0)

  return (
    <ModuleLayout
      title={{ ar: 'جدول الكميات', en: 'Bill of Quantities' }}
      subtitle={{ ar: 'BOQ - بنود الأعمال والكميات', en: 'BOQ - Work items and quantities' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" size="icon" />
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t(lang, 'تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
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
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(grouped).map(([category, categoryItems]) => {
                    const categoryTotal = categoryItems.reduce((s, i) => s + i.totalPrice, 0)
                    return (
                      <React.Fragment key={category}>
                        <TableRow className="bg-emerald-50 hover:bg-emerald-50">
                          <TableCell colSpan={selectedProjectId === 'all' ? 7 : 6} className="font-bold text-emerald-700">
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
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <BOQFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projects={projects}
        preselectedProjectId={selectedProjectId !== 'all' ? selectedProjectId : undefined}
      />
    </ModuleLayout>
  )
}

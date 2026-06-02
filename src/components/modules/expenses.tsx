'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Receipt, Plus, Search, RefreshCw, TrendingUp, Tag,
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
import { useAppStore, formatSAR as storeFormatSAR, formatDate as storeFormatDate, formatNumber, commonText } from '@/stores/app-store'

// ============ Types ============
interface ProjectOption { id: string; code: string; name: string }

interface Expense {
  id: string; projectId: string; category: string; description: string
  amount: number; vatAmount: number | null; date: string; reference: string | null
  project: { id: string; code: string; name: string }
}

// formatSAR and formatDate imported from store

function formatSAR(value: number, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatSAR(value, lang)
}

function formatDate(dateStr: string, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatDate(dateStr, lang)
}

const categoryLabels: Record<string, string> = {
  'إيجارات': 'إيجارات', 'صيانة': 'صيانة', 'نقل': 'نقل',
  'مواد استهلاكية': 'مواد استهلاكية', 'خدمات': 'خدمات', 'أخرى': 'أخرى',
}

const categoryOptions = ['إيجارات', 'صيانة', 'نقل', 'مواد استهلاكية', 'خدمات', 'أخرى']

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
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

// ============ Expense Form Dialog ============
function ExpenseFormDialog({
  open, onOpenChange, projects,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  projects: ProjectOption[]
}) {
  const queryClient = useQueryClient()

  const [projectId, setProjectId] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [vatAmount, setVatAmount] = useState('')
  const [date, setDate] = useState('')
  const [reference, setReference] = useState('')

  React.useEffect(() => {
    if (open) {
      setProjectId(''); setCategory(''); setDescription('')
      setAmount(''); setVatAmount(''); setDate(''); setReference('')
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      projectId, category, description, amount,
      vatAmount: vatAmount || null, date, reference: reference || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>مصروف جديد</DialogTitle>
          <DialogDescription>إضافة مصروف جديد للمشروع</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>المشروع *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الفئة *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="exp-desc">الوصف *</Label>
              <Input id="exp-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف المصروف" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-amount">المبلغ *</Label>
              <Input id="exp-amount" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-vat">ضريبة القيمة المضافة</Label>
              <Input id="exp-vat" type="number" min="0" step="0.01" value={vatAmount} onChange={e => setVatAmount(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-date">التاريخ *</Label>
              <Input id="exp-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-ref">المرجع</Label>
              <Input id="exp-ref" value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم المرجع" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={createMutation.isPending || !projectId || !category || !description || !amount || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? 'جاري الإنشاء...' : 'إضافة المصروف'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Expenses Module ============
export function ExpensesModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: expenses = [], isLoading, isError, refetch } = useQuery<Expense[]>({
    queryKey: ['expenses'],
    queryFn: async () => {
      const res = await fetch('/api/expenses')
      if (!res.ok) throw new Error('Failed to fetch')
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

  const filtered = expenses.filter(exp => {
    const matchProject = projectFilter === 'all' || exp.projectId === projectFilter
    const matchSearch = !search ||
      exp.description.toLowerCase().includes(search.toLowerCase()) ||
      exp.project.name.toLowerCase().includes(search.toLowerCase()) ||
      exp.category.toLowerCase().includes(search.toLowerCase())
    return matchProject && matchSearch
  })

  // Summary
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const now = new Date()
  const thisMonth = expenses.filter(e => {
    const d = new Date(e.date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const thisMonthTotal = thisMonth.reduce((s, e) => s + e.amount, 0)

  const categoryTotals: Record<string, number> = {}
  expenses.forEach(e => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount })
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'المصروفات' : 'Expenses'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة مصروفات المشاريع' : 'Manage project expenses'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث">
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> مصروف جديد
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Receipt className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">إجمالي المصروفات</p>
              <p className="text-xl font-bold text-emerald-700">{formatSAR(totalExpenses, lang)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-teal-100 flex items-center justify-center">
              <TrendingUp className="size-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-teal-600">هذا الشهر</p>
              <p className="text-xl font-bold text-teal-700">{formatSAR(thisMonthTotal, lang)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Tag className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600">أعلى فئة</p>
              <p className="text-xl font-bold text-amber-700">{topCategory ? topCategory[0] : '—'}</p>
              {topCategory && <p className="text-xs text-amber-500">{formatSAR(topCategory[1], lang)}</p>}
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
              <Input placeholder="بحث بالوصف أو المشروع أو الفئة..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="كل المشاريع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المشاريع</SelectItem>
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
            <div className="p-6"><TableSkeleton /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">حدث خطأ أثناء تحميل البيانات</p>
              <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Receipt className="size-12 text-gray-300" />
              <p className="text-muted-foreground">لا توجد مصروفات</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> إضافة مصروف
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">المشروع</TableHead>
                    <TableHead className="text-right">الفئة</TableHead>
                    <TableHead className="text-right">الوصف</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">ضريبة</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">المرجع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell className="font-medium">{exp.project.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-gray-50">{categoryLabels[exp.category] || exp.category}</Badge>
                      </TableCell>
                      <TableCell>{exp.description}</TableCell>
                      <TableCell className="font-semibold text-emerald-700">{formatSAR(exp.amount, lang)}</TableCell>
                      <TableCell>{exp.vatAmount ? formatSAR(exp.vatAmount, lang) : '—'}</TableCell>
                      <TableCell>{formatDate(exp.date, lang)}</TableCell>
                      <TableCell className="text-muted-foreground">{exp.reference || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <ExpenseFormDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} />
    </div>
  )
}

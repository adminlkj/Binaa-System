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
import { useAppStore, formatSAR, formatDate, formatNumber, commonText } from '@/stores/app-store'

// ============ Types ============
interface ProjectOption { id: string; code: string; name: string }

interface Expense {
  id: string; projectId: string | null; category: string; description: string
  amount: number; vatAmount: number | null; date: string; reference: string | null
  project: { id: string; code: string; name: string } | null
}

// Expense category labels with bilingual support
const expenseCategoryLabels: Record<string, { ar: string; en: string }> = {
  RENT: { ar: 'إيجارات', en: 'Rent' },
  MAINTENANCE: { ar: 'صيانة', en: 'Maintenance' },
  TRANSPORT: { ar: 'نقل', en: 'Transport' },
  DELIVERY: { ar: 'توصيل', en: 'Delivery' },
  CONSUMABLES: { ar: 'مواد استهلاكية', en: 'Consumables' },
  SERVICES: { ar: 'خدمات', en: 'Services' },
  INSURANCE: { ar: 'تأمين', en: 'Insurance' },
  FUEL: { ar: 'وقود', en: 'Fuel' },
  PERMITS: { ar: 'تصاريح', en: 'Permits' },
  OFFICE: { ar: 'قرطاسية', en: 'Office' },
  HOSPITALITY: { ar: 'ضيافة', en: 'Hospitality' },
  OTHER: { ar: 'أخرى', en: 'Other' },
}

const expenseCategoryOptions = Object.entries(expenseCategoryLabels).map(([key, val]) => ({
  value: key, ...val,
}))

// Category badge colors
const categoryColors: Record<string, string> = {
  RENT: 'bg-blue-100 text-blue-700',
  MAINTENANCE: 'bg-orange-100 text-orange-700',
  TRANSPORT: 'bg-teal-100 text-teal-700',
  DELIVERY: 'bg-cyan-100 text-cyan-700',
  CONSUMABLES: 'bg-amber-100 text-amber-700',
  SERVICES: 'bg-purple-100 text-purple-700',
  INSURANCE: 'bg-green-100 text-green-700',
  FUEL: 'bg-rose-100 text-rose-700',
  PERMITS: 'bg-indigo-100 text-indigo-700',
  OFFICE: 'bg-gray-100 text-gray-700',
  HOSPITALITY: 'bg-pink-100 text-pink-700',
  OTHER: 'bg-gray-100 text-gray-600',
}

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
  const { lang } = useAppStore()
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
      fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      projectId: projectId || null, category, description, amount,
      vatAmount: vatAmount || null, date, reference: reference || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'مصروف جديد' : 'New Expense'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة مصروف جديد' : 'Add a new expense'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'المشروع' : 'Project'}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={lang === 'ar' ? 'اختر المشروع (اختياري)' : 'Select project (optional)'} /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الفئة *' : 'Category *'}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full"><SelectValue placeholder={lang === 'ar' ? 'اختر الفئة' : 'Select category'} /></SelectTrigger>
                <SelectContent>
                  {expenseCategoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c[lang]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{lang === 'ar' ? 'الوصف *' : 'Description *'}</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={lang === 'ar' ? 'وصف المصروف' : 'Expense description'} required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'المبلغ *' : 'Amount *'}</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'ضريبة القيمة المضافة' : 'VAT Amount'}</Label>
              <Input type="number" min="0" step="0.01" value={vatAmount} onChange={e => setVatAmount(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'التاريخ *' : 'Date *'}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'المرجع' : 'Reference'}</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder={lang === 'ar' ? 'رقم المرجع' : 'Reference number'} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !category || !description || !amount || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة المصروف' : 'Add Expense')}
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
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
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
    const matchCategory = categoryFilter === 'all' || exp.category === categoryFilter
    const matchSearch = !search ||
      exp.description.toLowerCase().includes(search.toLowerCase()) ||
      (exp.project?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (expenseCategoryLabels[exp.category]?.[lang] || '').toLowerCase().includes(search.toLowerCase())
    return matchProject && matchCategory && matchSearch
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

  const generalExpenses = expenses.filter(e => !e.projectId).reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'المصروفات' : 'Expenses'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة المصروفات العامة والمشاريع' : 'Manage general and project expenses'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title={lang === 'ar' ? 'تحديث' : 'Refresh'}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {lang === 'ar' ? 'مصروف جديد' : 'New Expense'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Receipt className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}</p>
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
              <p className="text-sm text-teal-600">{lang === 'ar' ? 'هذا الشهر' : 'This Month'}</p>
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
              <p className="text-sm text-amber-600">{lang === 'ar' ? 'أعلى فئة' : 'Top Category'}</p>
              <p className="text-xl font-bold text-amber-700">{topCategory ? expenseCategoryLabels[topCategory[0]]?.[lang] || topCategory[0] : '—'}</p>
              {topCategory && <p className="text-xs text-amber-500">{formatSAR(topCategory[1], lang)}</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Receipt className="size-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">{lang === 'ar' ? 'مصروفات عامة' : 'General Expenses'}</p>
              <p className="text-xl font-bold text-gray-700">{formatSAR(generalExpenses, lang)}</p>
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
              <Input placeholder={lang === 'ar' ? 'بحث بالوصف أو المشروع أو الفئة...' : 'Search by description, project, or category...'} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={lang === 'ar' ? 'كل الفئات' : 'All Categories'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === 'ar' ? 'كل الفئات' : 'All Categories'}</SelectItem>
                {expenseCategoryOptions.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c[lang]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={lang === 'ar' ? 'كل المشاريع' : 'All Projects'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === 'ar' ? 'كل المشاريع' : 'All Projects'}</SelectItem>
                <SelectItem value="general">{lang === 'ar' ? 'عام (بدون مشروع)' : 'General (No Project)'}</SelectItem>
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
              <p className="text-rose-600">{lang === 'ar' ? 'حدث خطأ أثناء تحميل البيانات' : 'Error loading data'}</p>
              <Button variant="outline" onClick={() => refetch()}>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Receipt className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{lang === 'ar' ? 'لا توجد مصروفات' : 'No expenses found'}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> {lang === 'ar' ? 'إضافة مصروف' : 'Add Expense'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'المشروع' : 'Project'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الفئة' : 'Category'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المبلغ' : 'Amount'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'ضريبة' : 'VAT'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المرجع' : 'Reference'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell className="font-medium">
                        {exp.project ? exp.project.name : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-600">{lang === 'ar' ? 'عام' : 'General'}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${categoryColors[exp.category] || 'bg-gray-100 text-gray-700'} border-0`}>
                          {expenseCategoryLabels[exp.category]?.[lang] || exp.category}
                        </Badge>
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

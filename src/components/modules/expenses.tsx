'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Receipt, Plus, Search, RefreshCw, TrendingUp, Tag,
  Building2, Briefcase, Printer, Download,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore, formatDate, formatSAR } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
interface ProjectOption { id: string; code: string; name: string }

interface Expense {
  id: string; projectId: string | null; category: string; description: string
  amount: number; vatAmount: number | null; date: string; reference: string | null
  project: { id: string; code: string; name: string } | null
}

// Expense category labels with bilingual support
// Project expenses - linked to projects
const projectExpenseCategoryLabels: Record<string, { ar: string; en: string }> = {
  RENT: { ar: 'إيجارات', en: 'Rent' },
  MAINTENANCE: { ar: 'صيانة', en: 'Maintenance' },
  TRANSPORT: { ar: 'نقل', en: 'Transport' },
  DELIVERY: { ar: 'توصيل', en: 'Delivery' },
  CONSUMABLES: { ar: 'مواد استهلاكية', en: 'Consumables' },
  SERVICES: { ar: 'خدمات', en: 'Services' },
  INSURANCE: { ar: 'تأمين', en: 'Insurance' },
  FUEL: { ar: 'وقود', en: 'Fuel' },
  PERMITS: { ar: 'تصاريح', en: 'Permits' },
  OTHER: { ar: 'أخرى', en: 'Other' },
}

// Administrative expenses - NOT linked to projects
const adminExpenseCategoryLabels: Record<string, { ar: string; en: string }> = {
  SALARIES: { ar: 'رواتب', en: 'Salaries' },
  INTERNET: { ar: 'إنترنت', en: 'Internet' },
  ELECTRICITY: { ar: 'كهرباء', en: 'Electricity' },
  WATER: { ar: 'مياه', en: 'Water' },
  MANAGEMENT_CARS: { ar: 'سيارات الإدارة', en: 'Management Cars' },
  RENT: { ar: 'إيجارات', en: 'Rent' },
  OFFICE: { ar: 'قرطاسية', en: 'Office' },
  HOSPITALITY: { ar: 'ضيافة', en: 'Hospitality' },
  OTHER: { ar: 'أخرى', en: 'Other' },
}

// All categories combined (for backward compat)
const expenseCategoryLabels: Record<string, { ar: string; en: string }> = {
  ...projectExpenseCategoryLabels,
  ...adminExpenseCategoryLabels,
}

const projectCategoryOptions = Object.entries(projectExpenseCategoryLabels).map(([key, val]) => ({
  value: key, ...val,
}))

const adminCategoryOptions = Object.entries(adminExpenseCategoryLabels).map(([key, val]) => ({
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
  PERMITS: 'bg-emerald-100 text-emerald-700',
  OFFICE: 'bg-gray-100 text-gray-700',
  HOSPITALITY: 'bg-pink-100 text-pink-700',
  OTHER: 'bg-gray-100 text-gray-600',
  SALARIES: 'bg-emerald-100 text-emerald-700',
  INTERNET: 'bg-sky-100 text-sky-700',
  ELECTRICITY: 'bg-yellow-100 text-yellow-700',
  WATER: 'bg-blue-100 text-blue-700',
  MANAGEMENT_CARS: 'bg-violet-100 text-violet-700',
}

// Admin category keys for filtering
const adminCategoryKeys = new Set(Object.keys(adminExpenseCategoryLabels))

function isProjectCategory(category: string): boolean {
  return !adminCategoryKeys.has(category) || category === 'RENT' || category === 'OTHER'
}

function isAdminCategory(category: string): boolean {
  return adminCategoryKeys.has(category)
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
interface ExpenseFormDialog {
  open: boolean; onOpenChange: (open: boolean) => void
  projects: ProjectOption[]; activeTab: 'project' | 'admin'
}

function ExpenseFormDialog({
  open, onOpenChange, projects, activeTab: initialTab,
}: ExpenseFormDialog) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [tab, setTab] = useState<'project' | 'admin'>(initialTab)
  const [projectId, setProjectId] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [vatAmount, setVatAmount] = useState('')
  const [date, setDate] = useState('')
  const [reference, setReference] = useState('')

  React.useEffect(() => {
    if (open) {
      setTab(initialTab)
      setProjectId(initialTab === 'admin' ? '' : '')
      setCategory(''); setDescription('')
      setAmount(''); setVatAmount(''); setDate(''); setReference('')
    }
  }, [open, initialTab])

  const categoryOptions = tab === 'project' ? projectCategoryOptions : adminCategoryOptions

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      projectId: tab === 'project' ? (projectId || null) : null,
      category, description, amount,
      vatAmount: vatAmount || null, date, reference: reference || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('مصروف جديد', 'New Expense')}</DialogTitle>
          <DialogDescription>{t('إضافة مصروف جديد', 'Add a new expense')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tab selector within dialog */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => { setTab('project'); setCategory(''); setProjectId('') }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'project' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Building2 className="size-4" />
              {t('مصروفات المشاريع', 'Project Expenses')}
            </button>
            <button
              type="button"
              onClick={() => { setTab('admin'); setCategory(''); setProjectId('') }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'admin' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Briefcase className="size-4" />
              {t('مصروفات إدارية', 'Admin Expenses')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Project selector - only for project tab */}
            {tab === 'project' && (
              <div className="space-y-2">
                <Label>{t('المشروع', 'Project')}</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر المشروع (اختياري)', 'Select project (optional)')} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Admin tab info */}
            {tab === 'admin' && (
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <Briefcase className="size-4 text-amber-600 shrink-0" />
                  <span className="text-sm text-amber-700">
                    {t('المصروفات الإدارية لا ترتبط بمشروع معين', 'Administrative expenses are not linked to a specific project')}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('الفئة *', 'Category *')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر الفئة', 'Select category')} /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c[lang]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('الوصف *', 'Description *')}</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('وصف المصروف', 'Expense description')} required />
            </div>
            <div className="space-y-2">
              <Label>{t('المبلغ *', 'Amount *')}</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{t('ضريبة القيمة المضافة', 'VAT Amount')}</Label>
              <Input type="number" min="0" step="0.01" value={vatAmount} onChange={e => setVatAmount(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>{t('التاريخ *', 'Date *')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{t('المرجع', 'Reference')}</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder={t('رقم المرجع', 'Reference number')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || !category || !description || !amount || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (t('جاري الإنشاء...', 'Creating...')) : (t('إضافة المصروف', 'Add Expense'))}
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
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [activeTab, setActiveTab] = useState<'project' | 'admin'>('project')
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

  // Split expenses by type
  const projectExpenses = useMemo(() => expenses.filter(e => e.projectId !== null), [expenses])
  const adminExpenses = useMemo(() => expenses.filter(e => e.projectId === null && isAdminCategory(e.category)), [expenses])

  // Filter based on active tab
  const tabExpenses = activeTab === 'project' ? projectExpenses : adminExpenses

  const filtered = tabExpenses.filter(exp => {
    const matchProject = projectFilter === 'all' || exp.projectId === projectFilter
    const matchCategory = categoryFilter === 'all' || exp.category === categoryFilter
    const matchSearch = !search ||
      exp.description.toLowerCase().includes(search.toLowerCase()) ||
      (exp.project?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (expenseCategoryLabels[exp.category]?.[lang] || '').toLowerCase().includes(search.toLowerCase())
    return matchProject && matchCategory && matchSearch
  })

  // Summary for current tab
  const totalProjectExpenses = projectExpenses.reduce((s, e) => s + e.amount, 0)
  const totalAdminExpenses = adminExpenses.reduce((s, e) => s + e.amount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)

  const now = new Date()
  const thisMonthProject = projectExpenses.filter(e => {
    const d = new Date(e.date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const thisMonthAdmin = adminExpenses.filter(e => {
    const d = new Date(e.date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })

  const currentCategoryOptions = activeTab === 'project' ? projectCategoryOptions : adminCategoryOptions

  // Export handler
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'projectName', label: t('المشروع', 'Project') },
      { key: 'category', label: t('الفئة', 'Category'), format: (v) => expenseCategoryLabels[v as string]?.[lang] || String(v) },
      { key: 'description', label: t('الوصف', 'Description') },
      { key: 'amount', label: t('المبلغ', 'Amount'), format: (v) => Number(v).toFixed(2) },
      { key: 'vatAmount', label: t('الضريبة', 'VAT'), format: (v) => v ? Number(v).toFixed(2) : '' },
      { key: 'date', label: t('التاريخ', 'Date') },
      { key: 'reference', label: t('المرجع', 'Reference') },
    ]
    const rows = filtered.map(exp => ({
      projectName: exp.project?.name || (activeTab === 'admin' ? '' : t('عام', 'General')),
      category: exp.category,
      description: exp.description,
      amount: exp.amount,
      vatAmount: exp.vatAmount,
      date: formatDate(exp.date, lang),
      reference: exp.reference || '',
    }))
    const filename = activeTab === 'project'
      ? `project-expenses-${new Date().toISOString().slice(0, 10)}`
      : `admin-expenses-${new Date().toISOString().slice(0, 10)}`
    exportToCSV(rows, filename, columns)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('المصروفات', 'Expenses')}</h1>
          <p className="text-sm text-muted-foreground">{t('إدارة المصروفات العامة والمشاريع', 'Manage general and project expenses')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => window.print()} title={t('طباعة', 'Print')}>
            <Printer className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleExport} title={t('تصدير CSV', 'Export CSV')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {t('مصروف جديد', 'New Expense')}
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
              <p className="text-sm text-emerald-600">{t('إجمالي المصروفات', 'Total Expenses')}</p>
              <span className="text-xl font-bold text-emerald-700">
                <MoneyDisplay value={totalExpenses} mode="system" lang={lang} bold size="lg" />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-teal-100 flex items-center justify-center">
              <Building2 className="size-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-teal-600">{t('مصروفات المشاريع', 'Project Expenses')}</p>
              <span className="text-xl font-bold text-teal-700">
                <MoneyDisplay value={totalProjectExpenses} mode="system" lang={lang} bold size="lg" />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Briefcase className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600">{t('مصروفات إدارية', 'Admin Expenses')}</p>
              <span className="text-xl font-bold text-amber-700">
                <MoneyDisplay value={totalAdminExpenses} mode="system" lang={lang} bold size="lg" />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-gray-100 flex items-center justify-center">
              <TrendingUp className="size-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">{t('هذا الشهر', 'This Month')}</p>
              <span className="text-xl font-bold text-gray-700">
                <MoneyDisplay value={thisMonthProject.reduce((s, e) => s + e.amount, 0) + thisMonthAdmin.reduce((s, e) => s + e.amount, 0)} mode="system" lang={lang} bold size="lg" />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Project vs Admin Expenses */}
      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v as 'project' | 'admin'); setCategoryFilter('all'); setProjectFilter('all') }}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="project" className="gap-2 flex-1 sm:flex-none">
            <Building2 className="size-4" />
            {t('مصروفات المشاريع', 'Project Expenses')}
          </TabsTrigger>
          <TabsTrigger value="admin" className="gap-2 flex-1 sm:flex-none">
            <Briefcase className="size-4" />
            {t('مصروفات إدارية', 'Admin Expenses')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="project">
          {/* Filters */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input placeholder={t('بحث بالوصف أو المشروع أو الفئة...', 'Search by description, project, or category...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={t('كل الفئات', 'All Categories')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('كل الفئات', 'All Categories')}</SelectItem>
                    {projectCategoryOptions.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('كل المشاريع', 'All Projects')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('كل المشاريع', 'All Projects')}</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="mt-4">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6"><TableSkeleton /></div>
              ) : isError ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
                  <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Building2 className="size-12 text-gray-300" />
                  <p className="text-muted-foreground">{t('لا توجد مصروفات مشاريع', 'No project expenses found')}</p>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                    <Plus className="size-4 mr-1" /> {t('إضافة مصروف', 'Add Expense')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t('المشروع', 'Project')}</TableHead>
                        <TableHead className="text-right">{t('الفئة', 'Category')}</TableHead>
                        <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                        <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
                        <TableHead className="text-right">{t('ضريبة', 'VAT')}</TableHead>
                        <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                        <TableHead className="text-right">{t('المرجع', 'Reference')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(exp => (
                        <TableRow key={exp.id}>
                          <TableCell className="font-medium">
                            {exp.project ? exp.project.name : (
                              <Badge variant="outline" className="bg-gray-50 text-gray-600">{t('عام', 'General')}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${categoryColors[exp.category] || 'bg-gray-100 text-gray-700'} border-0`}>
                              {expenseCategoryLabels[exp.category]?.[lang] || exp.category}
                            </Badge>
                          </TableCell>
                          <TableCell>{exp.description}</TableCell>
                          <TableCell className="font-semibold">
                            <span className="text-emerald-700">
                              <MoneyDisplay value={exp.amount} mode="system" lang={lang} bold size="sm" />
                            </span>
                          </TableCell>
                          <TableCell>
                            {exp.vatAmount ? (
                              <span className="text-gray-600">
                                <MoneyDisplay value={exp.vatAmount} mode="system" lang={lang} size="sm" />
                              </span>
                            ) : '—'}
                          </TableCell>
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
        </TabsContent>

        <TabsContent value="admin">
          {/* Filters */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input placeholder={t('بحث بالوصف أو الفئة...', 'Search by description or category...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={t('كل الفئات', 'All Categories')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('كل الفئات', 'All Categories')}</SelectItem>
                    {adminCategoryOptions.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Admin info banner */}
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <Briefcase className="size-5 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-700">
              {t('المصروفات الإدارية هي المصروفات التشغيلية غير المرتبطة بمشروع معين مثل الرواتب والإنترنت والكهرباء', 'Administrative expenses are operational expenses not linked to a specific project, such as salaries, internet, and electricity')}
            </span>
          </div>

          {/* Table */}
          <Card className="mt-4">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6"><TableSkeleton /></div>
              ) : isError ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
                  <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Briefcase className="size-12 text-gray-300" />
                  <p className="text-muted-foreground">{t('لا توجد مصروفات إدارية', 'No admin expenses found')}</p>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                    <Plus className="size-4 mr-1" /> {t('إضافة مصروف', 'Add Expense')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t('الفئة', 'Category')}</TableHead>
                        <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                        <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
                        <TableHead className="text-right">{t('ضريبة', 'VAT')}</TableHead>
                        <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                        <TableHead className="text-right">{t('المرجع', 'Reference')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(exp => (
                        <TableRow key={exp.id}>
                          <TableCell>
                            <Badge className={`${categoryColors[exp.category] || 'bg-gray-100 text-gray-700'} border-0`}>
                              {expenseCategoryLabels[exp.category]?.[lang] || exp.category}
                            </Badge>
                          </TableCell>
                          <TableCell>{exp.description}</TableCell>
                          <TableCell className="font-semibold">
                            <span className="text-emerald-700">
                              <MoneyDisplay value={exp.amount} mode="system" lang={lang} bold size="sm" />
                            </span>
                          </TableCell>
                          <TableCell>
                            {exp.vatAmount ? (
                              <span className="text-gray-600">
                                <MoneyDisplay value={exp.vatAmount} mode="system" lang={lang} size="sm" />
                              </span>
                            ) : '—'}
                          </TableCell>
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
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <ExpenseFormDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} activeTab={activeTab} />
    </div>
  )
}

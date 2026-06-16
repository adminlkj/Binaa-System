'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Receipt, Plus, Search, RefreshCw, TrendingUp,
  Building2, Briefcase, Download, Landmark, Wallet, Banknote,
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
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { StatusBadge } from '@/components/shared/module-layout'
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatDate, formatSAR } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { ProjectTypeBadge } from '@/components/shared/project-type-badge'
import { AccountingEntryDisplay } from '@/components/shared/accounting-entry-display'
import { AccountSelector } from '@/components/shared/account-selector'
import { JePreview, type JePreviewLine } from '@/components/shared/je-preview'

// ============ Types ============
interface ProjectOption { id: string; code: string; name: string }

interface Expense {
  id: string; projectId: string | null; expenseType: string; category: string; description: string
  amount: number; vatRate: number; vatAmount: number | null; totalAmount: number; date: string
  reference: string | null; payFrom: string; attachmentPath: string | null; journalEntryId: string | null
  project: { id: string; code: string; name: string; projectType?: string } | null
}

// ============ Bilingual Helpers ============
const t = (lang: 'ar' | 'en', ar: string, en: string) => lang === 'ar' ? ar : en

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

// Administrative expenses
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

const allCategoryLabels: Record<string, { ar: string; en: string }> = {
  ...projectExpenseCategoryLabels,
  ...adminExpenseCategoryLabels,
}

const projectCategoryOptions = Object.entries(projectExpenseCategoryLabels).map(([key, val]) => ({
  value: key, ...val,
}))

const adminCategoryOptions = Object.entries(adminExpenseCategoryLabels).map(([key, val]) => ({
  value: key, ...val,
}))

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

const payFromLabels: Record<string, { ar: string; en: string; icon: React.ElementType }> = {
  TREASURY: { ar: 'الخزينة', en: 'Treasury', icon: Landmark },
  BANK: { ar: 'البنك', en: 'Bank', icon: Banknote },
  PETTY_CASH: { ar: 'الصندوق النقدي', en: 'Petty Cash', icon: Wallet },
}

const payFromOptions = Object.entries(payFromLabels).map(([key, val]) => ({
  value: key, labelAr: val.ar, labelEn: val.en,
}))

const adminCategoryKeys = new Set(Object.keys(adminExpenseCategoryLabels))

function isProjectExpense(expense: Expense): boolean {
  return expense.projectId !== null
}

function isAdminExpense(expense: Expense): boolean {
  return expense.projectId === null && adminCategoryKeys.has(expense.category)
}

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

// ============ Expense Form Dialog ============
interface ExpenseFormDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void
  projects: ProjectOption[]; activeTab: 'project' | 'admin'
}

function ExpenseFormDialog({
  open, onOpenChange, projects, activeTab: initialTab,
}: ExpenseFormDialogProps) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<'project' | 'admin'>(initialTab)
  const [projectId, setProjectId] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [vatAmount, setVatAmount] = useState('')
  const [date, setDate] = useState('')
  const [reference, setReference] = useState('')
  const [payFrom, setPayFrom] = useState('TREASURY')
  const [attachmentPath, setAttachmentPath] = useState('')
  const [vatRate, setVatRate] = useState('0.15')

  // Account-based fields (replacing hardcoded payFrom & category)
  const [payingAccountId, setPayingAccountId] = useState<string | null>(null)
  const [payingAccountCode, setPayingAccountCode] = useState('')
  const [payingAccountName, setPayingAccountName] = useState('')
  const [expenseAccountId, setExpenseAccountId] = useState<string | null>(null)
  const [expenseAccountCode, setExpenseAccountCode] = useState('')
  const [expenseAccountNameAr, setExpenseAccountNameAr] = useState('')
  const [activityType, setActivityType] = useState<'CONTRACT' | 'EQUIPMENT' | 'ADMIN' | 'HR'>('CONTRACT')

  React.useEffect(() => {
    if (open) {
      setTab(initialTab)
      setProjectId('')
      setCategory(''); setDescription('')
      setAmount(''); setVatAmount(''); setDate('')
      setReference(''); setPayFrom('TREASURY')
      setAttachmentPath(''); setVatRate('0.15')
      setPayingAccountId(null); setPayingAccountCode(''); setPayingAccountName('')
      setExpenseAccountId(null); setExpenseAccountCode(''); setExpenseAccountNameAr('')
      setActivityType(initialTab === 'project' ? 'CONTRACT' : 'ADMIN')
    }
  }, [open, initialTab])

  const categoryOptions = tab === 'project' ? projectCategoryOptions : adminCategoryOptions

  // Auto-calc VAT if applicable
  const parsedAmount = parseFloat(amount) || 0
  const parsedVatRate = parseFloat(vatRate) || 0.15
  const autoVat = useMemo(() => {
    const manualVat = parseFloat(vatAmount)
    if (!isNaN(manualVat)) return manualVat
    return parsedAmount * parsedVatRate
  }, [amount, vatAmount, parsedAmount, parsedVatRate])

  const totalAmount = parsedAmount + autoVat

  // Determine parentCode for the expense account selector based on expenseType + activityType
  const expenseParentCode = useMemo(() => {
    if (tab === 'project') {
      return activityType === 'EQUIPMENT' ? '7200' : '7100'
    }
    return activityType === 'HR' ? '8200' : '8100'
  }, [tab, activityType])

  // Compute JE preview lines
  const jeLines = useMemo<JePreviewLine[]>(() => {
    if (parsedAmount <= 0 || !expenseAccountId || !payingAccountId) return []
    const lines: JePreviewLine[] = []
    // Debit: Expense account
    lines.push({
      accountCode: expenseAccountCode,
      accountNameAr: expenseAccountNameAr,
      debit: parsedAmount,
      credit: 0,
    })
    // Debit: VAT Input (1410) if VAT > 0
    if (autoVat > 0) {
      lines.push({
        accountCode: '1410',
        accountNameAr: 'ضريبة مدخلات',
        debit: autoVat,
        credit: 0,
      })
    }
    // Credit: Paying account
    lines.push({
      accountCode: payingAccountCode,
      accountNameAr: payingAccountName,
      debit: 0,
      credit: totalAmount,
    })
    return lines
  }, [parsedAmount, autoVat, totalAmount, expenseAccountId, expenseAccountCode, expenseAccountNameAr, payingAccountId, payingAccountCode, payingAccountName])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const isProjectTab = tab === 'project'
    createMutation.mutate({
      projectId: isProjectTab ? projectId : null,
      expenseType: isProjectTab ? 'PROJECT' : 'INTERNAL',
      category, description, amount,
      vatRate: parsedVatRate,
      vatAmount: autoVat || null,
      totalAmount,
      date, reference: reference || null,
      payFrom,
      attachmentPath: attachmentPath || null,
      // New account-based fields
      accountId: expenseAccountId,
      payingAccountId,
      payingAccountCode,
      payingAccountName,
      expenseAccountCode,
      expenseAccountNameAr,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(lang, 'مصروف جديد', 'New Expense')}</DialogTitle>
          <DialogDescription>{t(lang, 'إضافة مصروف جديد', 'Add a new expense')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => { setTab('project'); setCategory(''); setProjectId(''); setActivityType('CONTRACT'); setExpenseAccountId(null); setExpenseAccountCode(''); setExpenseAccountNameAr('') }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'project' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Building2 className="size-4" />
              {t(lang, 'مصروف مشروع', 'Project Expense')}
            </button>
            <button
              type="button"
              onClick={() => { setTab('admin'); setCategory(''); setProjectId(''); setActivityType('ADMIN'); setExpenseAccountId(null); setExpenseAccountCode(''); setExpenseAccountNameAr('') }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'admin' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Briefcase className="size-4" />
              {t(lang, 'مصروف إداري', 'Admin Expense')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Project selector - only for project tab */}
            {tab === 'project' && (
              <div className="space-y-2">
                <Label>{t(lang, 'المشروع *', 'Project *')}</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر المشروع', 'Select project')} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Admin info */}
            {tab === 'admin' && (
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <Briefcase className="size-4 text-amber-600 shrink-0" />
                  <span className="text-sm text-amber-700">
                    {t(lang, 'المصروفات الإدارية لا ترتبط بمشروع معين', 'Administrative expenses are not linked to a specific project')}
                  </span>
                </div>
              </div>
            )}

            {/* Activity Type selector */}
            <div className="space-y-2">
              <Label>{t(lang, 'نوع النشاط *', 'Activity Type *')}</Label>
              <Select value={activityType} onValueChange={(v) => {
                setActivityType(v as 'CONTRACT' | 'EQUIPMENT' | 'ADMIN' | 'HR')
                setExpenseAccountId(null); setExpenseAccountCode(''); setExpenseAccountNameAr('')
              }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tab === 'project' ? (
                    <>
                      <SelectItem value="CONTRACT">{t(lang, 'تكاليف عقود (7100)', 'Cost of Contracts (7100)')}</SelectItem>
                      <SelectItem value="EQUIPMENT">{t(lang, 'تكاليف معدات (7200)', 'Equipment Costs (7200)')}</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="ADMIN">{t(lang, 'إدارية (8100)', 'Administrative (8100)')}</SelectItem>
                      <SelectItem value="HR">{t(lang, 'موارد بشرية (8200)', 'HR (8200)')}</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Expense Account selector (replaces hardcoded category) */}
            <AccountSelector
              roles={[]}
              parentCode={expenseParentCode}
              value={expenseAccountId}
              onValueChange={(id, account) => {
                setExpenseAccountId(id)
                setExpenseAccountCode(account.code)
                setExpenseAccountNameAr(account.nameAr || account.name)
                setCategory(account.code) // Keep category in sync for backward compatibility
              }}
              label={t(lang, 'حساب المصروف *', 'Expense Account *')}
              placeholder={t(lang, 'اختر حساب المصروف...', 'Select expense account...')}
            />
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'الوصف *', 'Description *')}</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t(lang, 'وصف المصروف', 'Expense description')} required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'المبلغ *', 'Amount *')}</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'ضريبة القيمة المضافة (15%)', 'VAT Amount (15%)')}</Label>
              <Input type="number" min="0" step="0.01" value={vatAmount} onChange={e => setVatAmount(e.target.value)} dir="ltr" placeholder={t(lang, 'تلقائي', 'Auto')} />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'التاريخ *', 'Date *')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            {/* Paying Account selector (replaces hardcoded payFrom) */}
            <AccountSelector
              roles={['CASH', 'BANK']}
              value={payingAccountId}
              onValueChange={(id, account) => {
                setPayingAccountId(id)
                setPayingAccountCode(account.code)
                setPayingAccountName(account.nameAr || account.name)
                // Map account role back to payFrom for backward compatibility
                if (account.accountRole === 'BANK') setPayFrom('BANK')
                else if (account.accountRole === 'CASH') setPayFrom('PETTY_CASH')
                else setPayFrom('TREASURY')
              }}
              label={t(lang, 'السداد من *', 'Pay From *')}
              placeholder={t(lang, 'اختر حساب السداد...', 'Select paying account...')}
            />
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'المرجع', 'Reference')}</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder={t(lang, 'رقم المرجع', 'Reference number')} />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'نسبة الضريبة', 'VAT Rate')}</Label>
              <Input type="number" min="0" max="1" step="0.01" value={vatRate} onChange={e => setVatRate(e.target.value)} dir="ltr" placeholder="0.15" />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'مسار المرفق', 'Attachment Path')}</Label>
              <Input value={attachmentPath} onChange={e => setAttachmentPath(e.target.value)} placeholder={t(lang, 'مسار الملف', 'File path')} />
            </div>
          </div>

          {/* JE Preview */}
          <JePreview lines={jeLines} />

          {/* Total Preview */}
          {parsedAmount > 0 && (
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t(lang, 'المبلغ', 'Amount')}</span>
                  <span className="font-medium"><MoneyDisplay value={parsedAmount} lang={lang} size="sm" /></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t(lang, `الضريبة (${((parsedVatRate ?? 0) * 100).toFixed(0)}%)`, `VAT (${((parsedVatRate ?? 0) * 100).toFixed(0)}%)`)}</span>
                  <span className="font-medium"><MoneyDisplay value={autoVat} lang={lang} size="sm" /></span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>{t(lang, 'الإجمالي', 'Total')}</span>
                  <span className="text-emerald-700"><MoneyDisplay value={totalAmount} lang={lang} bold size="md" /></span>
                </div>
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t(lang, 'إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || !expenseAccountId || !payingAccountId || !description || !amount || !date || (tab === 'project' && !projectId)} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t(lang, 'جاري الإنشاء...', 'Creating...') : t(lang, 'إضافة المصروف', 'Add Expense')}
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
  const projectExpenses = useMemo(() => expenses.filter(isProjectExpense), [expenses])
  const adminExpenses = useMemo(() => expenses.filter(isAdminExpense), [expenses])

  // Filter based on active tab
  const tabExpenses = activeTab === 'project' ? projectExpenses : adminExpenses

  const filtered = tabExpenses.filter(exp => {
    const matchProject = projectFilter === 'all' || exp.projectId === projectFilter
    const matchCategory = categoryFilter === 'all' || exp.category === categoryFilter
    const matchSearch = !search ||
      exp.description.toLowerCase().includes(search.toLowerCase()) ||
      (exp.project?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (allCategoryLabels[exp.category]?.[lang] || '').toLowerCase().includes(search.toLowerCase())
    return matchProject && matchCategory && matchSearch
  })

  // Summary
  const totalProjectExpenses = projectExpenses.reduce((s, e) => s + e.amount, 0)
  const totalAdminExpenses = adminExpenses.reduce((s, e) => s + e.amount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.totalAmount, 0)

  const now = new Date()
  const thisMonthTotal = expenses.filter(e => {
    const d = new Date(e.date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((s, e) => s + e.totalAmount, 0)

  const currentCategoryOptions = activeTab === 'project' ? projectCategoryOptions : adminCategoryOptions

  // Export handler
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'projectName', label: t(lang, 'المشروع', 'Project') },
      { key: 'category', label: t(lang, 'الفئة', 'Category'), format: (v) => allCategoryLabels[v as string]?.[lang] || String(v) },
      { key: 'description', label: t(lang, 'الوصف', 'Description') },
      { key: 'amount', label: t(lang, 'المبلغ', 'Amount'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'vatAmount', label: t(lang, 'الضريبة', 'VAT'), format: (v) => v ? (Number(v) || 0).toFixed(2) : '' },
      { key: 'totalAmount', label: t(lang, 'الإجمالي', 'Total'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'payFrom', label: t(lang, 'السداد من', 'Pay From'), format: (v) => payFromLabels[v as string]?.[lang] || String(v) },
      { key: 'date', label: t(lang, 'التاريخ', 'Date') },
      { key: 'reference', label: t(lang, 'المرجع', 'Reference') },
    ]
    const rows = filtered.map(exp => ({
      projectName: exp.project?.name || '',
      category: exp.category,
      description: exp.description,
      amount: exp.amount,
      vatAmount: exp.vatAmount,
      totalAmount: exp.totalAmount,
      payFrom: exp.payFrom,
      date: formatDate(exp.date, lang),
      reference: exp.reference || '',
    }))
    exportToCSV(rows, `expenses-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  const printData = useMemo(() => ({
    columns: [
      { key: 'projectName', label: lang === 'ar' ? 'المشروع' : 'Project' },
      { key: 'category', label: lang === 'ar' ? 'الفئة' : 'Category' },
      { key: 'description', label: lang === 'ar' ? 'الوصف' : 'Description' },
      { key: 'amount', label: lang === 'ar' ? 'المبلغ' : 'Amount' },
      { key: 'totalAmount', label: lang === 'ar' ? 'الإجمالي' : 'Total' },
      { key: 'date', label: lang === 'ar' ? 'التاريخ' : 'Date' },
    ],
    rows: filtered.map(exp => ({
      projectName: exp.project?.name || (lang === 'ar' ? 'عام' : 'General'),
      category: allCategoryLabels[exp.category]?.[lang] || exp.category,
      description: exp.description,
      amount: exp.amount,
      totalAmount: exp.totalAmount,
      date: formatDate(exp.date, lang),
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
      { label: lang === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses', value: String(totalExpenses) },
    ],
  }), [filtered, lang, totalExpenses])

  const PayFromBadge = ({ value }: { value: string }) => {
    const config = payFromLabels[value]
    if (!config) return <span>{value}</span>
    const Icon = config.icon
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Icon className="size-3" />
        {config[lang]}
      </Badge>
    )
  }

  return (
    <ModuleLayout
      title={{ ar: 'المصروفات', en: 'Expenses' }}
      subtitle={{ ar: 'إدارة المصروفات العامة ومشاريع', en: 'Manage general and project expenses' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="expense-report" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport} title={t(lang, 'تصدير CSV', 'Export CSV')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t(lang, 'تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {t(lang, 'مصروف جديد', 'New Expense')}
          </Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Receipt className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{t(lang, 'إجمالي المصروفات', 'Total Expenses')}</p>
              <MoneyDisplay value={totalExpenses} lang={lang} bold size="lg" className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-teal-100 flex items-center justify-center">
              <Building2 className="size-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-teal-600">{t(lang, 'مصروفات المشاريع', 'Project Expenses')}</p>
              <MoneyDisplay value={totalProjectExpenses} lang={lang} bold size="lg" className="text-teal-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Briefcase className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600">{t(lang, 'مصروفات إدارية', 'Admin Expenses')}</p>
              <MoneyDisplay value={totalAdminExpenses} lang={lang} bold size="lg" className="text-amber-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-gray-100 flex items-center justify-center">
              <TrendingUp className="size-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">{t(lang, 'هذا الشهر', 'This Month')}</p>
              <MoneyDisplay value={thisMonthTotal} lang={lang} bold size="lg" className="text-gray-700" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Project vs Admin */}
      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v as 'project' | 'admin'); setCategoryFilter('all'); setProjectFilter('all') }}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="project" className="gap-2 flex-1 sm:flex-none">
            <Building2 className="size-4" />
            {t(lang, 'مصروفات المشاريع', 'Project Expenses')}
          </TabsTrigger>
          <TabsTrigger value="admin" className="gap-2 flex-1 sm:flex-none">
            <Briefcase className="size-4" />
            {t(lang, 'مصروفات إدارية', 'Admin Expenses')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="project">
          {/* Filters */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input placeholder={t(lang, 'بحث بالوصف أو المشروع أو الفئة...', 'Search by description, project, or category...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={t(lang, 'كل الفئات', 'All Categories')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t(lang, 'كل الفئات', 'All Categories')}</SelectItem>
                    {projectCategoryOptions.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          <Card className="mt-4">
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
                  <Building2 className="size-12 text-gray-300" />
                  <p className="text-muted-foreground">{t(lang, 'لا توجد مصروفات مشاريع', 'No project expenses found')}</p>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                    <Plus className="size-4 mr-1" /> {t(lang, 'إضافة مصروف', 'Add Expense')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t(lang, 'المشروع', 'Project')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الفئة', 'Category')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الوصف', 'Description')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المبلغ', 'Amount')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'ضريبة', 'VAT')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الإجمالي', 'Total')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'السداد من', 'Pay From')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'التاريخ', 'Date')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المرجع', 'Reference')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'القيد المحاسبي', 'Accounting')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(exp => (
                        <TableRow key={exp.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1">
                              {exp.project ? exp.project.name : (
                                <Badge variant="outline" className="bg-gray-50 text-gray-600">{t(lang, 'عام', 'General')}</Badge>
                              )}
                              {exp.project?.projectType && <ProjectTypeBadge projectType={exp.project.projectType} lang={lang} />}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${categoryColors[exp.category] || 'bg-gray-100 text-gray-700'} border-0`}>
                              {allCategoryLabels[exp.category]?.[lang] || exp.category}
                            </Badge>
                          </TableCell>
                          <TableCell>{exp.description}</TableCell>
                          <TableCell>
                            <MoneyDisplay value={exp.amount} lang={lang} size="sm" />
                          </TableCell>
                          <TableCell>
                            {exp.vatAmount ? (
                              <span className="text-gray-600"><MoneyDisplay value={exp.vatAmount} lang={lang} size="sm" /></span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="font-semibold">
                            <span className="text-emerald-700"><MoneyDisplay value={exp.totalAmount} lang={lang} bold size="sm" /></span>
                          </TableCell>
                          <TableCell><PayFromBadge value={exp.payFrom} /></TableCell>
                          <TableCell>{formatDate(exp.date, lang)}</TableCell>
                          <TableCell className="text-muted-foreground">{exp.reference || '—'}</TableCell>
                          <TableCell>
                            <AccountingEntryDisplay journalEntryId={exp.journalEntryId} lang={lang} />
                          </TableCell>
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
                  <Input placeholder={t(lang, 'بحث بالوصف أو الفئة...', 'Search by description or category...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={t(lang, 'كل الفئات', 'All Categories')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t(lang, 'كل الفئات', 'All Categories')}</SelectItem>
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
              {t(lang, 'المصروفات الإدارية هي المصروفات التشغيلية غير المرتبطة بمشروع معين مثل الرواتب والإنترنت والكهرباء', 'Administrative expenses are operational expenses not linked to a specific project, such as salaries, internet, and electricity')}
            </span>
          </div>

          {/* Table */}
          <Card className="mt-4">
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
                  <Briefcase className="size-12 text-gray-300" />
                  <p className="text-muted-foreground">{t(lang, 'لا توجد مصروفات إدارية', 'No admin expenses found')}</p>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                    <Plus className="size-4 mr-1" /> {t(lang, 'إضافة مصروف', 'Add Expense')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t(lang, 'الفئة', 'Category')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الوصف', 'Description')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المبلغ', 'Amount')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'ضريبة', 'VAT')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الإجمالي', 'Total')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'السداد من', 'Pay From')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'التاريخ', 'Date')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المرجع', 'Reference')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'القيد المحاسبي', 'Accounting')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(exp => (
                        <TableRow key={exp.id}>
                          <TableCell>
                            <Badge className={`${categoryColors[exp.category] || 'bg-gray-100 text-gray-700'} border-0`}>
                              {allCategoryLabels[exp.category]?.[lang] || exp.category}
                            </Badge>
                          </TableCell>
                          <TableCell>{exp.description}</TableCell>
                          <TableCell>
                            <MoneyDisplay value={exp.amount} lang={lang} size="sm" />
                          </TableCell>
                          <TableCell>
                            {exp.vatAmount ? (
                              <span className="text-gray-600"><MoneyDisplay value={exp.vatAmount} lang={lang} size="sm" /></span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="font-semibold">
                            <span className="text-emerald-700"><MoneyDisplay value={exp.totalAmount} lang={lang} bold size="sm" /></span>
                          </TableCell>
                          <TableCell><PayFromBadge value={exp.payFrom} /></TableCell>
                          <TableCell>{formatDate(exp.date, lang)}</TableCell>
                          <TableCell className="text-muted-foreground">{exp.reference || '—'}</TableCell>
                          <TableCell>
                            <AccountingEntryDisplay journalEntryId={exp.journalEntryId} lang={lang} />
                          </TableCell>
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
    </ModuleLayout>
  )
}

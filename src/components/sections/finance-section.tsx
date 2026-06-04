'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Landmark, Building, CreditCard,
  BookOpen, List, BookCopy,
  ArrowDownToLine, ArrowUpFromLine,
  Building2, TrendingDown,
  Percent, PieChart, Banknote,
  RefreshCw, ChevronDown,
  PlusCircle, TreePine, Calculator,
  ArrowUpDown, Wallet, ArrowDown, ArrowUp,
  FileText, AlertCircle, CheckCircle2,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
  formatSAR,
  formatAmount,
  formatNumber,
  formatDate,
  commonText,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import { VATModule } from '@/components/modules/vat'
import { MoneyDisplay } from '@/components/ui/money-display'

// ============ Bilingual Helper ============
function t(ar: string, en: string, lang: Lang) {
  return lang === 'ar' ? ar : en
}

// ============ Tab Definitions ============

const financeTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'treasury', icon: Landmark },
  { key: 'banks', icon: Building },
  { key: 'checks', icon: CreditCard },
  { key: 'journal-entries', icon: BookOpen },
  { key: 'chart-of-accounts', icon: List },
  { key: 'general-ledger', icon: BookCopy },
  { key: 'receivables', icon: ArrowDownToLine },
  { key: 'payables', icon: ArrowUpFromLine },
  { key: 'fixed-assets', icon: Building2 },
  { key: 'depreciation', icon: TrendingDown },
  { key: 'vat', icon: Percent },
  { key: 'budgets', icon: PieChart },
  { key: 'cash-flow', icon: Banknote },
]

// ============ Types ============

interface FinancialSummary {
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  totalRevenue: number
  totalExpenses: number
  netIncome: number
  arBalance: number
  apBalance: number
  cashBalance: number
  cashBreakdown: { treasury: number; bank: number; pettyCash: number }
  vatReceivable: number
  vatPayable: number
  vatNet: number
  ratios: { currentRatio: number; profitMargin: number; returnOnAssets: number }
  accountingEquation: { assets: number; liabilitiesAndEquity: number; isBalanced: boolean }
  breakdown: Record<string, { code: string; name: string; nameAr: string | null; balance: number }[]>
}

interface Account {
  id: string
  code: string
  name: string
  nameAr: string | null
  type: string
  parentId: string | null
  isActive: boolean
  balance: number
  normalBalance: string
  parent: { id: string; code: string; name: string; nameAr: string | null } | null
  children: (Account & { childBalanceTotal?: number; totalBalance?: number })[]
  _count: { journalLines: number }
  childBalanceTotal?: number
  totalBalance?: number
}

interface JournalLine {
  id: string
  accountId: string
  debit: number
  credit: number
  description: string | null
  account: { id: string; code: string; name: string; nameAr: string | null }
}

interface JournalEntry {
  id: string
  entryNo: string
  date: string
  description: string | null
  status: string
  createdAt: string
  lines: JournalLine[]
  totalDebit: number
  totalCredit: number
}

interface LedgerEntry {
  id: string
  entryNo: string
  date: string
  description: string | null
  lineDescription: string | null
  debit: number
  credit: number
  balance: number
  status: string
}

// ============ Status & Type Configs ============

const typeConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string; border: string }> = {
  ASSET: { label: { ar: 'أصول', en: 'Asset' }, color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200' },
  LIABILITY: { label: { ar: 'التزامات', en: 'Liability' }, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' },
  EQUITY: { label: { ar: 'حقوق ملكية', en: 'Equity' }, color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  REVENUE: { label: { ar: 'إيرادات', en: 'Revenue' }, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  EXPENSE: { label: { ar: 'مصروفات', en: 'Expense' }, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
}

function TypeBadge({ type, lang }: { type: string; lang: Lang }) {
  const cfg = typeConfig[type] || typeConfig.ASSET
  return <Badge className={`${cfg.bg} ${cfg.color} border-0 text-xs`}>{cfg.label[lang]}</Badge>
}

const jeStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-amber-700', bg: 'bg-amber-100' },
  POSTED: { label: { ar: 'مرحّل', en: 'Posted' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  CANCELLED: { label: { ar: 'ملغي', en: 'Cancelled' }, color: 'text-rose-700', bg: 'bg-rose-100' },
}

function JEStatusBadge({ status, lang }: { status: string; lang: Lang }) {
  const cfg = jeStatusConfig[status] || jeStatusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0 text-xs`}>{cfg.label[lang]}</Badge>
}

// ============ Shared Skeletons ============

function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  )
}

// ============ Placeholder Component ============

function TabPlaceholder({
  icon: Icon,
  title,
  description,
  lang,
}: {
  icon: React.ElementType
  title: { ar: string; en: string }
  description: { ar: string; en: string }
  lang: Lang
}) {
  return (
    <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50">
      <CardContent className="flex flex-col items-center gap-4 py-16">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-gray-100">
          <Icon className="size-8 text-gray-400" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-gray-700">{title[lang]}</h3>
          <p className="text-sm text-muted-foreground max-w-md">{description[lang]}</p>
        </div>
        <Badge variant="outline" className="text-gray-500 border-gray-300">
          {lang === 'ar' ? 'قريباً' : 'Coming Soon'}
        </Badge>
      </CardContent>
    </Card>
  )
}

const placeholderData: Record<string, {
  title: { ar: string; en: string }
  description: { ar: string; en: string }
}> = {
  'banks': {
    title: { ar: 'البنوك', en: 'Banks' },
    description: {
      ar: 'إدارة الحسابات البنكية، كشوف الحسابات، والتحويلات البنكية',
      en: 'Manage bank accounts, bank statements, and bank transfers',
    },
  },
  'checks': {
    title: { ar: 'الشيكات', en: 'Checks' },
    description: {
      ar: 'إدارة الشيكات الواردة والصادرة، تتبع حالات الصرف والتحصيل',
      en: 'Manage incoming and outgoing checks, track payment and collection statuses',
    },
  },
  'fixed-assets': {
    title: { ar: 'الأصول الثابتة', en: 'Fixed Assets' },
    description: {
      ar: 'تسجيل ومتابعة الأصول الثابتة، مواقعها، حالتها، وتاريخ الاقتناء',
      en: 'Record and track fixed assets, their locations, conditions, and acquisition history',
    },
  },
  'depreciation': {
    title: { ar: 'الإهلاك', en: 'Depreciation' },
    description: {
      ar: 'حساب وتسجيل الإهلاك الدوري للأصول الثابتة بطرق الإهلاك المختلفة',
      en: 'Calculate and record periodic depreciation of fixed assets using various methods',
    },
  },
  'budgets': {
    title: { ar: 'الموازنات', en: 'Budgets' },
    description: {
      ar: 'إعداد ومتابعة الموازنات التقديرية، مقارنة الفعلي بالمخطط، وتحليل الانحرافات',
      en: 'Prepare and track budgets, compare actual vs planned, and analyze variances',
    },
  },
  'cash-flow': {
    title: { ar: 'التدفق النقدي', en: 'Cash Flow' },
    description: {
      ar: 'تحليل ومتابعة التدفقات النقدية الداخلة والخارجة، وتوقعات السيولة',
      en: 'Analyze and track cash inflows and outflows, and liquidity forecasts',
    },
  },
}


// ============================================================================
// 1. TREASURY MODULE (الخزينة)
// ============================================================================

function TreasuryModule() {
  const { lang } = useAppStore()

  const { data: summary, isLoading, isError, refetch } = useQuery<FinancialSummary>({
    queryKey: ['financial-summary'],
    queryFn: async () => {
      const res = await fetch('/api/financial-summary')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: recentEntries } = useQuery<{ entries: JournalEntry[] }>({
    queryKey: ['journal-entries-recent'],
    queryFn: async () => {
      const res = await fetch('/api/journal-entries?pageSize=10')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  if (isLoading) return <CardSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <AlertCircle className="size-12 text-rose-300" />
        <p className="text-rose-600">{t('حدث خطأ في تحميل البيانات', 'Error loading data', lang)}</p>
        <Button variant="outline" onClick={() => refetch()}>{commonText.retry[lang]}</Button>
      </div>
    )
  }

  const cash = summary?.cashBreakdown || { treasury: 0, bank: 0, pettyCash: 0 }
  const totalCash = summary?.cashBalance || 0

  return (
    <div className="space-y-6">
      {/* Cash Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Wallet className="size-5 text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-emerald-700">
                {t('إجمالي النقدية', 'Total Cash', lang)}
              </p>
            </div>
            <MoneyDisplay value={totalCash} lang={lang} size="xl" bold className="text-emerald-800" />
          </CardContent>
        </Card>

        <Card className="border-sky-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-sky-100 flex items-center justify-center">
                <Landmark className="size-5 text-sky-600" />
              </div>
              <p className="text-sm font-medium text-sky-700">
                {t('الخزينة', 'Treasury', lang)}
              </p>
            </div>
            <MoneyDisplay value={cash.treasury} lang={lang} size="lg" bold className="text-sky-800" />
            <p className="text-xs text-muted-foreground mt-1">1110</p>
          </CardContent>
        </Card>

        <Card className="border-violet-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-violet-100 flex items-center justify-center">
                <Building className="size-5 text-violet-600" />
              </div>
              <p className="text-sm font-medium text-violet-700">
                {t('البنوك', 'Banks', lang)}
              </p>
            </div>
            <MoneyDisplay value={cash.bank} lang={lang} size="lg" bold className="text-violet-800" />
            <p className="text-xs text-muted-foreground mt-1">1120</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Banknote className="size-5 text-amber-600" />
              </div>
              <p className="text-sm font-medium text-amber-700">
                {t('الصندوق النثري', 'Petty Cash', lang)}
              </p>
            </div>
            <MoneyDisplay value={cash.pettyCash} lang={lang} size="lg" bold className="text-amber-800" />
            <p className="text-xs text-muted-foreground mt-1">1130</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Financial Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-emerald-50/50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowDown className="size-5 text-emerald-600" />
            <div>
              <p className="text-xs text-emerald-600">{t('الذمم المدينة', 'Receivables', lang)}</p>
              <MoneyDisplay value={summary?.arBalance || 0} lang={lang} size="lg" bold className="text-emerald-800" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-rose-50/50 border-rose-200">
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowUp className="size-5 text-rose-600" />
            <div>
              <p className="text-xs text-rose-600">{t('الذمم الدائنة', 'Payables', lang)}</p>
              <MoneyDisplay value={summary?.apBalance || 0} lang={lang} size="lg" bold className="text-rose-800" />
            </div>
          </CardContent>
        </Card>
        <Card className={`${(summary?.vatNet || 0) >= 0 ? 'bg-amber-50/50 border-amber-200' : 'bg-teal-50/50 border-teal-200'}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <Percent className={`size-5 ${(summary?.vatNet || 0) >= 0 ? 'text-amber-600' : 'text-teal-600'}`} />
            <div>
              <p className={`text-xs ${(summary?.vatNet || 0) >= 0 ? 'text-amber-600' : 'text-teal-600'}`}>
                {t('صافي الضريبة', 'Net VAT', lang)}
              </p>
              <MoneyDisplay
                value={summary?.vatNet || 0}
                lang={lang}
                size="lg"
                bold
                className={(summary?.vatNet || 0) >= 0 ? 'text-amber-800' : 'text-teal-800'}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4 text-emerald-600" />
              {t('أحدث القيود المحاسبية', 'Recent Journal Entries', lang)}
            </CardTitle>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => refetch()}>
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentEntries?.entries?.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <FileText className="size-10 text-gray-300" />
              <p className="text-sm text-muted-foreground">{t('لا توجد قيود', 'No entries', lang)}</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right text-xs">{t('رقم القيد', 'Entry No.', lang)}</TableHead>
                    <TableHead className="text-right text-xs">{t('التاريخ', 'Date', lang)}</TableHead>
                    <TableHead className="text-right text-xs">{t('الوصف', 'Description', lang)}</TableHead>
                    <TableHead className="text-right text-xs">{t('الحالة', 'Status', lang)}</TableHead>
                    <TableHead className="text-right text-xs">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right text-xs">{t('دائن', 'Credit', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentEntries?.entries?.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">{e.entryNo}</TableCell>
                      <TableCell className="text-xs">{formatDate(e.date, lang)}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{e.description || '—'}</TableCell>
                      <TableCell><JEStatusBadge status={e.status} lang={lang} /></TableCell>
                      <TableCell>
                        <MoneyDisplay value={e.totalDebit} lang={lang} size="xs" className="text-emerald-700" />
                      </TableCell>
                      <TableCell>
                        <MoneyDisplay value={e.totalCredit} lang={lang} size="xs" className="text-rose-700" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Financial Ratios */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="size-4 text-emerald-600" />
            {t('المؤشرات المالية', 'Financial Ratios', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-gray-50">
              <p className="text-xs text-muted-foreground mb-1">{t('نسبة التداول', 'Current Ratio', lang)}</p>
              <p className="text-2xl font-bold text-gray-900">{(summary?.ratios?.currentRatio || 0).toFixed(2)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-gray-50">
              <p className="text-xs text-muted-foreground mb-1">{t('هامش الربح', 'Profit Margin', lang)}</p>
              <p className={`text-2xl font-bold ${(summary?.ratios?.profitMargin || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {(summary?.ratios?.profitMargin || 0).toFixed(1)}%
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-gray-50">
              <p className="text-xs text-muted-foreground mb-1">{t('العائد على الأصول', 'Return on Assets', lang)}</p>
              <p className={`text-2xl font-bold ${(summary?.ratios?.returnOnAssets || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {(summary?.ratios?.returnOnAssets || 0).toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


// ============================================================================
// 2. JOURNAL ENTRIES MODULE (القيود)
// ============================================================================

function JournalEntriesModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)
  const pageSize = 20

  // Build query params
  const queryParams = new URLSearchParams()
  queryParams.set('page', String(page))
  queryParams.set('pageSize', String(pageSize))
  if (statusFilter !== 'all') queryParams.set('status', statusFilter)
  if (dateFrom) queryParams.set('startDate', dateFrom)
  if (dateTo) queryParams.set('endDate', dateTo)

  const { data, isLoading, isError, refetch } = useQuery<{
    entries: JournalEntry[]
    pagination: { page: number; pageSize: number; total: number; totalPages: number }
  }>({
    queryKey: ['journal-entries', statusFilter, dateFrom, dateTo, page],
    queryFn: async () => {
      const res = await fetch(`/api/journal-entries?${queryParams.toString()}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const entries = data?.entries || []
  const pagination = data?.pagination

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs">{t('الحالة', 'Status', lang)}</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('الكل', 'All', lang)}</SelectItem>
                  <SelectItem value="DRAFT">{t('مسودة', 'Draft', lang)}</SelectItem>
                  <SelectItem value="POSTED">{t('مرحّل', 'Posted', lang)}</SelectItem>
                  <SelectItem value="CANCELLED">{t('ملغي', 'Cancelled', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label>
              <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} className="h-9" />
            </div>
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label>
              <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} className="h-9" />
            </div>
            {(statusFilter !== 'all' || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600"
                onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo(''); setPage(1) }}
              >
                {t('مسح الفلاتر', 'Clear Filters', lang)}
              </Button>
            )}
            <Button variant="outline" size="icon" className="size-9" onClick={() => refetch()}>
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notice */}
      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
        <Calculator className="size-4 shrink-0" />
        <span>
          {lang === 'ar'
            ? 'القيود المحاسبية تنشأ تلقائياً من العمليات (فواتير، مستخلصات، مشتريات، مصروفات، سداد ضريبة، قبض، دفع)'
            : 'Journal entries are automatically generated from operations (invoices, claims, purchases, expenses, tax, receipts, payments)'}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <AlertCircle className="size-12 text-rose-300" />
          <p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p>
          <Button variant="outline" onClick={() => refetch()}>{commonText.retry[lang]}</Button>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <FileText className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('لا توجد قيود', 'No entries found', lang)}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-8"></TableHead>
                    <TableHead className="text-right">{t('رقم القيد', 'Entry No.', lang)}</TableHead>
                    <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                    <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                    <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map(e => (
                    <React.Fragment key={e.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-emerald-50/50"
                        onClick={() => setExpandedEntry(expandedEntry === e.id ? null : e.id)}
                      >
                        <TableCell>
                          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${expandedEntry === e.id ? 'rotate-180' : ''}`} />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{e.entryNo}</TableCell>
                        <TableCell className="text-sm">{formatDate(e.date, lang)}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{e.description || '—'}</TableCell>
                        <TableCell><JEStatusBadge status={e.status} lang={lang} /></TableCell>
                        <TableCell>
                          <MoneyDisplay value={e.totalDebit} lang={lang} size="sm" className="text-emerald-700" />
                        </TableCell>
                        <TableCell>
                          <MoneyDisplay value={e.totalCredit} lang={lang} size="sm" className="text-rose-700" />
                        </TableCell>
                      </TableRow>
                      {/* Expanded Lines */}
                      {expandedEntry === e.id && (
                        <TableRow className="bg-gray-50/50">
                          <TableCell colSpan={7} className="p-0">
                            <div className="p-4 border-t border-b border-gray-200">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-right text-xs">{t('الحساب', 'Account', lang)}</TableHead>
                                    <TableHead className="text-right text-xs">{t('مدين', 'Debit', lang)}</TableHead>
                                    <TableHead className="text-right text-xs">{t('دائن', 'Credit', lang)}</TableHead>
                                    <TableHead className="text-right text-xs">{t('الوصف', 'Description', lang)}</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {e.lines.map(line => (
                                    <TableRow key={line.id}>
                                      <TableCell className="text-xs font-medium">
                                        {line.account.code} - {lang === 'ar' && line.account.nameAr ? line.account.nameAr : line.account.name}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {line.debit > 0 ? <MoneyDisplay value={line.debit} lang={lang} size="xs" className="text-emerald-700" /> : '—'}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {line.credit > 0 ? <MoneyDisplay value={line.credit} lang={lang} size="xs" className="text-rose-700" /> : '—'}
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground">{line.description || '—'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t('عرض', 'Showing', lang)} {((pagination.page - 1) * pagination.pageSize) + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.total)} {t('من', 'of', lang)} {pagination.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              {t('السابق', 'Previous', lang)}
            </Button>
            <span className="flex items-center px-2">
              {pagination.page} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              {t('التالي', 'Next', lang)}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}


// ============================================================================
// 3. CHART OF ACCOUNTS MODULE (دليل الحسابات)
// ============================================================================

function ChartOfAccountsModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // New account form state
  const [newAccount, setNewAccount] = useState({
    code: '',
    name: '',
    nameAr: '',
    type: 'ASSET',
    parentId: '',
  })

  const { data, isLoading, isError, refetch } = useQuery<{
    accounts: Account[]
    tree: Account[]
    total: number
  }>({
    queryKey: ['accounts-tree'],
    queryFn: async () => {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const initializeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/accounts/initialize', { method: 'POST' })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts-tree'] })
    },
  })

  const createAccountMutation = useMutation({
    mutationFn: async (data: typeof newAccount) => {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          parentId: data.parentId || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts-tree'] })
      setAddDialogOpen(false)
      setNewAccount({ code: '', name: '', nameAr: '', type: 'ASSET', parentId: '' })
    },
  })

  const accounts = data?.accounts || []
  const tree = data?.tree || []

  // Type summary
  const typeSummary = useMemo(() => {
    const summary: Record<string, number> = {}
    accounts.forEach(a => {
      summary[a.type] = (summary[a.type] || 0) + 1
    })
    return summary
  }, [accounts])

  // Flatten tree for rendering
  const flattenTree = (nodes: Account[], depth: number): (Account & { _depth: number })[] => {
    const result: (Account & { _depth: number })[] = []
    for (const node of nodes) {
      result.push({ ...node, _depth: depth })
      if (node.children && node.children.length > 0) {
        result.push(...flattenTree(
          node.children.sort((a, b) => a.code.localeCompare(b.code)),
          depth + 1
        ))
      }
    }
    return result
  }

  const flatAccounts = flattenTree(tree.sort((a, b) => a.code.localeCompare(b.code)), 0)

  // Render account row recursively
  const renderAccountNode = (account: Account & { _depth: number }) => {
    const cfg = typeConfig[account.type] || typeConfig.ASSET
    const isParent = account.children && account.children.length > 0
    const indent = account._depth * 24

    return (
      <div key={account.id}>
        <div
          className={`flex items-center gap-3 py-2.5 px-4 hover:bg-gray-50/80 border-b border-gray-100 transition-colors ${account._depth === 0 ? 'bg-gray-50/50 font-semibold' : ''}`}
          style={{ paddingRight: lang === 'ar' ? `${indent + 16}px` : undefined, paddingLeft: lang === 'ar' ? undefined : `${indent + 16}px` }}
        >
          {isParent && (
            <span className="text-gray-300 text-xs">└</span>
          )}
          <span className="font-mono text-sm text-gray-600 min-w-[48px]">{account.code}</span>
          <span className="flex-1 text-sm">
            {lang === 'ar' && account.nameAr ? account.nameAr : account.name}
            {lang === 'ar' && account.nameAr && (
              <span className="text-muted-foreground text-xs mr-1">({account.name})</span>
            )}
          </span>
          <TypeBadge type={account.type} lang={lang} />
          <span className="text-xs text-muted-foreground min-w-[40px] text-center">
            {formatNumber(account._count?.journalLines || 0)}
          </span>
          <span className={`text-sm font-medium min-w-[120px] text-left ${account.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`} dir="ltr">
            {formatAmount(account.balance)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {/* Type Summary */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(typeSummary).map(([type, count]) => {
            const cfg = typeConfig[type]
            if (!cfg) return null
            return (
              <Badge key={type} className={`${cfg.bg} ${cfg.color} border ${cfg.border} gap-1`}>
                {cfg.label[lang]}: {count}
              </Badge>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => initializeMutation.mutate()}
            disabled={initializeMutation.isPending}
          >
            {initializeMutation.isPending ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <TreePine className="size-4" />
            )}
            {t('تهيئة دليل الحسابات', 'Initialize Chart', lang)}
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                <PlusCircle className="size-4" />
                {t('إضافة حساب', 'Add Account', lang)}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('إضافة حساب جديد', 'Add New Account', lang)}</DialogTitle>
                <DialogDescription>
                  {t('أدخل بيانات الحساب الجديد', 'Enter the new account details', lang)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('الكود', 'Code', lang)}</Label>
                    <Input
                      value={newAccount.code}
                      onChange={e => setNewAccount(p => ({ ...p, code: e.target.value }))}
                      placeholder={t('تلقائي', 'Auto', lang)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('النوع', 'Type', lang)}</Label>
                    <Select value={newAccount.type} onValueChange={v => setNewAccount(p => ({ ...p, type: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ASSET">{t('أصول', 'Asset', lang)}</SelectItem>
                        <SelectItem value="LIABILITY">{t('التزامات', 'Liability', lang)}</SelectItem>
                        <SelectItem value="EQUITY">{t('حقوق ملكية', 'Equity', lang)}</SelectItem>
                        <SelectItem value="REVENUE">{t('إيرادات', 'Revenue', lang)}</SelectItem>
                        <SelectItem value="EXPENSE">{t('مصروفات', 'Expense', lang)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('اسم الحساب (إنجليزي)', 'Account Name (English)', lang)}</Label>
                  <Input
                    value={newAccount.name}
                    onChange={e => setNewAccount(p => ({ ...p, name: e.target.value }))}
                    placeholder="Account Name"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('اسم الحساب (عربي)', 'Account Name (Arabic)', lang)}</Label>
                  <Input
                    value={newAccount.nameAr}
                    onChange={e => setNewAccount(p => ({ ...p, nameAr: e.target.value }))}
                    placeholder="اسم الحساب"
                    className="h-9"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('الحساب الأب', 'Parent Account', lang)}</Label>
                  <Select value={newAccount.parentId} onValueChange={v => setNewAccount(p => ({ ...p, parentId: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t('بدون (حساب رئيسي)', 'None (Root)', lang)} />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.filter(a => !a.parentId).sort((a, b) => a.code.localeCompare(b.code)).map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} - {lang === 'ar' && a.nameAr ? a.nameAr : a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {createAccountMutation.isError && (
                  <p className="text-sm text-rose-600">{t('فشل في إنشاء الحساب', 'Failed to create account', lang)}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  {commonText.cancel[lang]}
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => createAccountMutation.mutate(newAccount)}
                  disabled={!newAccount.name || createAccountMutation.isPending}
                >
                  {createAccountMutation.isPending ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : null}
                  {commonText.save[lang]}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Account Tree Table */}
      {isLoading ? (
        <TableSkeleton rows={10} />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <AlertCircle className="size-12 text-rose-300" />
          <p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p>
          <Button variant="outline" onClick={() => refetch()}>{commonText.retry[lang]}</Button>
        </div>
      ) : flatAccounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <TreePine className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('لا توجد حسابات - اضغط تهيئة', 'No accounts - Click Initialize', lang)}</p>
          <Button onClick={() => initializeMutation.mutate()} disabled={initializeMutation.isPending}>
            <TreePine className="size-4 mr-2" />
            {t('تهيئة دليل الحسابات', 'Initialize Chart of Accounts', lang)}
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Table Header */}
            <div className="flex items-center gap-3 py-2.5 px-4 bg-gray-100/80 border-b border-gray-200 text-xs font-medium text-muted-foreground">
              <span className="min-w-[48px]">{t('الكود', 'Code', lang)}</span>
              <span className="flex-1">{t('اسم الحساب', 'Account Name', lang)}</span>
              <span className="min-w-[60px]">{t('النوع', 'Type', lang)}</span>
              <span className="min-w-[40px] text-center">{t('قيود', 'Entries', lang)}</span>
              <span className="min-w-[120px] text-left" dir="ltr">{t('الرصيد', 'Balance', lang)}</span>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {flatAccounts.map(account => renderAccountNode(account))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


// ============================================================================
// 4. GENERAL LEDGER MODULE (اليومية العامة)
// ============================================================================

function GeneralLedgerModule() {
  const { lang } = useAppStore()

  // Fetch accounts for dropdown
  const { data: accountsData } = useQuery<{
    accounts: Account[]
  }>({
    queryKey: ['accounts-list'],
    queryFn: async () => {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const accounts = accountsData?.accounts || []
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Fetch ledger entries
  const { data: ledgerData, isLoading: loadingLedger, isError: ledgerError, refetch } = useQuery<{
    account: { id: string; code: string; name: string; nameAr: string | null; type: string }
    entries: LedgerEntry[]
    currentBalance: number
  }>({
    queryKey: ['general-ledger', selectedCode, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('accountCode', selectedCode)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/general-ledger?${params.toString()}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedCode,
  })

  const selectedAccount = accounts.find(a => a.code === selectedCode)
  const isDebitNormal = selectedAccount?.type === 'ASSET' || selectedAccount?.type === 'EXPENSE'

  return (
    <div className="space-y-4">
      {/* Account Selection & Filters */}
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">{t('الحساب', 'Account', lang)}</Label>
              <Select value={selectedCode} onValueChange={setSelectedCode}>
                <SelectTrigger>
                  <SelectValue placeholder={t('اختر حساب', 'Select account', lang)} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.sort((a, b) => a.code.localeCompare(b.code)).map(a => (
                    <SelectItem key={a.id} value={a.code}>
                      {a.code} - {lang === 'ar' && a.nameAr ? a.nameAr : a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" />
            </div>
            {selectedCode && (
              <Button variant="outline" size="icon" className="size-9" onClick={() => refetch()}>
                <RefreshCw className="size-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      {selectedCode && ledgerData && (
        <Card className="border-emerald-200">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <h3 className="text-lg font-bold">
                  {ledgerData.account.code} - {lang === 'ar' && ledgerData.account.nameAr ? ledgerData.account.nameAr : ledgerData.account.name}
                </h3>
                <TypeBadge type={ledgerData.account.type} lang={lang} />
              </div>
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-xs text-emerald-600">{t('إجمالي مدين', 'Total Debit', lang)}</p>
                  <MoneyDisplay value={ledgerData.entries.reduce((s, e) => s + e.debit, 0)} lang={lang} bold className="text-emerald-700" />
                </div>
                <div className="text-center">
                  <p className="text-xs text-rose-600">{t('إجمالي دائن', 'Total Credit', lang)}</p>
                  <MoneyDisplay value={ledgerData.entries.reduce((s, e) => s + e.credit, 0)} lang={lang} bold className="text-rose-700" />
                </div>
                <Separator orientation="vertical" className="h-12" />
                <div className="text-center">
                  <p className={`text-xs ${isDebitNormal ? 'text-amber-600' : 'text-teal-600'}`}>
                    {t('الرصيد الحالي', 'Current Balance', lang)}
                  </p>
                  <MoneyDisplay
                    value={ledgerData.currentBalance}
                    lang={lang}
                    bold
                    className={ledgerData.currentBalance >= 0 ? 'text-amber-700' : 'text-teal-700'}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ledger Table */}
      {selectedCode && loadingLedger && <TableSkeleton rows={8} />}
      {selectedCode && ledgerError && (
        <div className="flex flex-col items-center gap-3 py-10">
          <AlertCircle className="size-12 text-rose-300" />
          <p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p>
          <Button variant="outline" onClick={() => refetch()}>{commonText.retry[lang]}</Button>
        </div>
      )}
      {selectedCode && ledgerData && ledgerData.entries.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10">
          <BookCopy className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('لا توجد حركات على هذا الحساب', 'No transactions for this account', lang)}</p>
        </div>
      )}
      {selectedCode && ledgerData && ledgerData.entries.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                    <TableHead className="text-right">{t('رقم القيد', 'Entry No.', lang)}</TableHead>
                    <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                    <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                    <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerData.entries.map((entry, idx) => (
                    <TableRow key={entry.id} className={idx % 2 === 0 ? '' : 'bg-gray-50/30'}>
                      <TableCell className="text-sm">{formatDate(entry.date, lang)}</TableCell>
                      <TableCell className="font-mono text-sm">{entry.entryNo}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {entry.lineDescription || entry.description || '—'}
                      </TableCell>
                      <TableCell>
                        {entry.debit > 0 ? <MoneyDisplay value={entry.debit} lang={lang} size="sm" className="text-emerald-700" /> : '—'}
                      </TableCell>
                      <TableCell>
                        {entry.credit > 0 ? <MoneyDisplay value={entry.credit} lang={lang} size="sm" className="text-rose-700" /> : '—'}
                      </TableCell>
                      <TableCell>
                        <MoneyDisplay
                          value={entry.balance}
                          lang={lang}
                          size="sm"
                          bold
                          className={entry.balance >= 0 ? 'text-amber-700' : 'text-teal-700'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!selectedCode && (
        <div className="flex flex-col items-center gap-3 py-10">
          <ArrowUpDown className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('اختر حساباً لعرض دفتر الأستاذ', 'Select an account to view the general ledger', lang)}</p>
        </div>
      )}
    </div>
  )
}


// ============================================================================
// 5. RECEIVABLES MODULE (الذمم المدينة)
// ============================================================================

function ReceivablesModule() {
  const { lang } = useAppStore()

  const { data: summary, isLoading } = useQuery<FinancialSummary>({
    queryKey: ['financial-summary'],
    queryFn: async () => {
      const res = await fetch('/api/financial-summary')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: clientsData } = useQuery<{ clients: { id: string; name: string; nameAr: string | null; balance: number }[] }>({
    queryKey: ['clients-ar'],
    queryFn: async () => {
      const res = await fetch('/api/clients')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  if (isLoading) return <CardSkeleton />

  const arBalance = summary?.arBalance || 0
  const assetAccounts = summary?.breakdown?.ASSET || []
  const receivableAccounts = assetAccounts.filter(a =>
    a.code.startsWith('12') || a.code.startsWith('14')
  )

  return (
    <div className="space-y-6">
      {/* AR Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <ArrowDownToLine className="size-5 text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-emerald-700">
                {t('إجمالي الذمم المدينة', 'Total Receivables', lang)}
              </p>
            </div>
            <MoneyDisplay value={arBalance} lang={lang} size="xl" bold className="text-emerald-800" />
          </CardContent>
        </Card>

        <Card className="border-sky-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-sky-100 flex items-center justify-center">
                <CheckCircle2 className="size-5 text-sky-600" />
              </div>
              <p className="text-sm font-medium text-sky-700">
                {t('الإيرادات', 'Revenue', lang)}
              </p>
            </div>
            <MoneyDisplay value={summary?.totalRevenue || 0} lang={lang} size="lg" bold className="text-sky-800" />
          </CardContent>
        </Card>

        <Card className="border-amber-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Calculator className="size-5 text-amber-600" />
              </div>
              <p className="text-sm font-medium text-amber-700">
                {t('صافي الدخل', 'Net Income', lang)}
              </p>
            </div>
            <MoneyDisplay
              value={summary?.netIncome || 0}
              lang={lang}
              size="lg"
              bold
              className={(summary?.netIncome || 0) >= 0 ? 'text-emerald-800' : 'text-rose-800'}
            />
          </CardContent>
        </Card>
      </div>

      {/* Receivable Accounts Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="size-4 text-emerald-600" />
            {t('حسابات الذمم المدينة', 'Receivable Accounts', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {receivableAccounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('لا توجد حسابات دائنة', 'No receivable accounts found', lang)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead>
                    <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivableAccounts.map(a => (
                    <TableRow key={a.code}>
                      <TableCell className="font-mono text-sm">{a.code}</TableCell>
                      <TableCell className="text-sm">{lang === 'ar' && a.nameAr ? a.nameAr : a.name}</TableCell>
                      <TableCell>
                        <MoneyDisplay value={a.balance} lang={lang} size="sm" bold className={a.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aging Report Placeholder */}
      <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-10 rounded-full bg-gray-100 flex items-center justify-center">
              <FileText className="size-5 text-gray-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-700">{t('تقرير التقادم', 'Aging Report', lang)}</h3>
              <p className="text-xs text-muted-foreground">{t('تحليل الذمم المدينة حسب الفترة', 'Receivables aging analysis', lang)}</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: { ar: 'حتى 30 يوم', en: 'Up to 30 days' }, value: 0, color: 'text-emerald-700 bg-emerald-50' },
              { label: { ar: '31-60 يوم', en: '31-60 days' }, value: 0, color: 'text-amber-700 bg-amber-50' },
              { label: { ar: '61-90 يوم', en: '61-90 days' }, value: 0, color: 'text-orange-700 bg-orange-50' },
              { label: { ar: 'أكثر من 90 يوم', en: 'Over 90 days' }, value: 0, color: 'text-rose-700 bg-rose-50' },
            ].map((bucket) => (
              <div key={bucket.label.en} className={`rounded-lg p-3 text-center ${bucket.color}`}>
                <p className="text-xs mb-1">{bucket.label[lang]}</p>
                <MoneyDisplay value={bucket.value} lang={lang} size="sm" bold />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


// ============================================================================
// 6. PAYABLES MODULE (الذمم الدائنة)
// ============================================================================

function PayablesModule() {
  const { lang } = useAppStore()

  const { data: summary, isLoading } = useQuery<FinancialSummary>({
    queryKey: ['financial-summary'],
    queryFn: async () => {
      const res = await fetch('/api/financial-summary')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: suppliersData } = useQuery<{ suppliers: { id: string; name: string; nameAr: string | null; balance: number }[] }>({
    queryKey: ['suppliers-ap'],
    queryFn: async () => {
      const res = await fetch('/api/suppliers')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  if (isLoading) return <CardSkeleton />

  const apBalance = summary?.apBalance || 0
  const liabilityAccounts = summary?.breakdown?.LIABILITY || []
  const payableAccounts = liabilityAccounts.filter(a =>
    a.code.startsWith('31') || a.code.startsWith('32')
  )

  return (
    <div className="space-y-6">
      {/* AP Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-rose-50 to-white border-rose-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-rose-100 flex items-center justify-center">
                <ArrowUpFromLine className="size-5 text-rose-600" />
              </div>
              <p className="text-sm font-medium text-rose-700">
                {t('إجمالي الذمم الدائنة', 'Total Payables', lang)}
              </p>
            </div>
            <MoneyDisplay value={apBalance} lang={lang} size="xl" bold className="text-rose-800" />
          </CardContent>
        </Card>

        <Card className="border-violet-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-violet-100 flex items-center justify-center">
                <Building className="size-5 text-violet-600" />
              </div>
              <p className="text-sm font-medium text-violet-700">
                {t('إجمالي الالتزامات', 'Total Liabilities', lang)}
              </p>
            </div>
            <MoneyDisplay value={summary?.totalLiabilities || 0} lang={lang} size="lg" bold className="text-violet-800" />
          </CardContent>
        </Card>

        <Card className="border-amber-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Percent className="size-5 text-amber-600" />
              </div>
              <p className="text-sm font-medium text-amber-700">
                {t('ضريبة مستحقة', 'VAT Payable', lang)}
              </p>
            </div>
            <MoneyDisplay value={summary?.vatPayable || 0} lang={lang} size="lg" bold className="text-amber-800" />
          </CardContent>
        </Card>
      </div>

      {/* Payable Accounts Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="size-4 text-rose-600" />
            {t('حسابات الذمم الدائنة', 'Payable Accounts', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payableAccounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('لا توجد حسابات دائنة', 'No payable accounts found', lang)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead>
                    <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payableAccounts.map(a => (
                    <TableRow key={a.code}>
                      <TableCell className="font-mono text-sm">{a.code}</TableCell>
                      <TableCell className="text-sm">{lang === 'ar' && a.nameAr ? a.nameAr : a.name}</TableCell>
                      <TableCell>
                        <MoneyDisplay value={a.balance} lang={lang} size="sm" bold className={a.balance >= 0 ? 'text-rose-700' : 'text-emerald-700'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suppliers List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="size-4 text-rose-600" />
            {t('الموردون', 'Suppliers', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {suppliersData?.suppliers && suppliersData.suppliers.length > 0 ? (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('اسم المورد', 'Supplier Name', lang)}</TableHead>
                    <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliersData.suppliers.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm font-medium">
                        {lang === 'ar' && s.nameAr ? s.nameAr : s.name}
                      </TableCell>
                      <TableCell>
                        <MoneyDisplay value={s.balance || 0} lang={lang} size="sm" className="text-rose-700" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('لا يوجد موردون مسجلون', 'No suppliers registered', lang)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


// ============================================================================
// MAIN FINANCE SECTION
// ============================================================================

export function FinanceSection() {
  const { activeSubModule, lang } = useAppStore()

  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'treasury':
        return <TreasuryModule />
      case 'journal-entries':
        return <JournalEntriesModule />
      case 'chart-of-accounts':
        return <ChartOfAccountsModule />
      case 'general-ledger':
        return <GeneralLedgerModule />
      case 'receivables':
        return <ReceivablesModule />
      case 'payables':
        return <PayablesModule />
      case 'vat':
        return <VATModule />
      case 'banks':
        return (
          <TabPlaceholder
            icon={Building}
            title={placeholderData['banks'].title}
            description={placeholderData['banks'].description}
            lang={lang}
          />
        )
      case 'checks':
        return (
          <TabPlaceholder
            icon={CreditCard}
            title={placeholderData['checks'].title}
            description={placeholderData['checks'].description}
            lang={lang}
          />
        )
      case 'fixed-assets':
        return (
          <TabPlaceholder
            icon={Building2}
            title={placeholderData['fixed-assets'].title}
            description={placeholderData['fixed-assets'].description}
            lang={lang}
          />
        )
      case 'depreciation':
        return (
          <TabPlaceholder
            icon={TrendingDown}
            title={placeholderData['depreciation'].title}
            description={placeholderData['depreciation'].description}
            lang={lang}
          />
        )
      case 'budgets':
        return (
          <TabPlaceholder
            icon={PieChart}
            title={placeholderData['budgets'].title}
            description={placeholderData['budgets'].description}
            lang={lang}
          />
        )
      case 'cash-flow':
        return (
          <TabPlaceholder
            icon={Banknote}
            title={placeholderData['cash-flow'].title}
            description={placeholderData['cash-flow'].description}
            lang={lang}
          />
        )
      default:
        return <TreasuryModule />
    }
  }

  return (
    <SectionLayout
      title={{ ar: 'المالية', en: 'Finance' }}
      subtitle={{
        ar: 'إدارة الحسابات المالية والمحاسبة والضرائب',
        en: 'Manage financial accounts, accounting, and taxes',
      }}
      tabs={financeTabs}
      showPrintExport={false}
    >
      {renderTabContent()}
    </SectionLayout>
  )
}

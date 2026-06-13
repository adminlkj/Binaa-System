'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, RefreshCw, FileText, ChevronLeft, Eye, TreePine,
  ArrowUpDown, Calculator, Scale, Database, PlusCircle,
  Lock, Shield, ChevronDown, ChevronRight, X, Info,
  TrendingUp, BarChart3, PieChart, Building2, Truck,
  CreditCard, Users, Package, Clock, AlertTriangle,
  Wallet, Landmark, FileSpreadsheet, CircleDollarSign,
  CalendarCheck, Wrench, Banknote, FolderClosed, CheckCircle2,
  Printer, Download, Search,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useAppStore, formatDate, formatNumber } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
interface Account {
  id: string; code: string; name: string; nameAr: string | null
  type: string; parentId: string | null; isActive: boolean
  activityType: string | null; isSystem: boolean; allowPosting: boolean
  level: number; description: string | null; descriptionAr: string | null
  parent: { id: string; code: string; name: string; nameAr: string | null } | null
  children: { id: string; code: string; name: string; nameAr: string | null }[]
  _count: { journalLines: number }
  balance: number
  normalBalance: string
}

interface JournalLine {
  id: string; accountId: string; debit: number; credit: number
  description: string | null; costCenterId: string | null
  account: { id: string; code: string; name: string; nameAr: string | null }
  costCenter: { id: string; code: string; name: string } | null
}

interface JournalEntry {
  id: string; entryNo: string; date: string; description: string | null
  status: string; sourceType: string | null; sourceId: string | null
  createdAt: string
  lines: JournalLine[]
  totalDebit: number; totalCredit: number
}

interface StatementLine {
  id: string; entryNo: string; date: string; description: string | null
  lineDescription: string | null; debit: number; credit: number; balance: number; status: string
}

interface TrialBalanceItem {
  account: { id: string; code: string; name: string; nameAr: string | null; type: string }
  totalDebit: number; totalCredit: number; netDebit: number; netCredit: number
}

// ============ Helpers ============
function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

// ============ Type Config ============
const typeConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  ASSET: { label: { ar: 'أصول', en: 'Asset' }, color: 'text-sky-700', bg: 'bg-sky-100' },
  LIABILITY: { label: { ar: 'التزامات', en: 'Liability' }, color: 'text-orange-700', bg: 'bg-orange-100' },
  EQUITY: { label: { ar: 'حقوق ملكية', en: 'Equity' }, color: 'text-purple-700', bg: 'bg-purple-100' },
  REVENUE: { label: { ar: 'إيرادات', en: 'Revenue' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  EXPENSE: { label: { ar: 'مصروفات', en: 'Expense' }, color: 'text-rose-700', bg: 'bg-rose-100' },
}

function TypeBadge({ type, lang }: { type: string; lang: 'ar' | 'en' }) {
  const cfg = typeConfig[type] || typeConfig.ASSET
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

const activityConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string; dot: string }> = {
  CONSTRUCTION: { label: { ar: 'مشاريع', en: 'Construction' }, color: 'text-blue-700', bg: 'bg-blue-100', dot: 'bg-blue-500' },
  EQUIPMENT_RENTAL: { label: { ar: 'تأجير', en: 'Rental' }, color: 'text-orange-700', bg: 'bg-orange-100', dot: 'bg-orange-500' },
  BOTH: { label: { ar: 'مشترك', en: 'Both' }, color: 'text-gray-700', bg: 'bg-gray-100', dot: 'bg-gray-500' },
}

function ActivityBadge({ activityType, lang }: { activityType: string | null; lang: 'ar' | 'en' }) {
  const at = activityType || 'BOTH'
  const cfg = activityConfig[at]
  if (!cfg) return null
  return (
    <Badge className={`${cfg.bg} ${cfg.color} border-0 text-xs gap-1`}>
      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label[lang]}
    </Badge>
  )
}

const jeStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-amber-700', bg: 'bg-amber-100' },
  POSTED: { label: { ar: 'مرحّل', en: 'Posted' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  CANCELLED: { label: { ar: 'ملغي', en: 'Cancelled' }, color: 'text-rose-700', bg: 'bg-rose-100' },
}

function JEStatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = jeStatusConfig[status] || jeStatusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

const sourceTypeLabels: Record<string, { ar: string; en: string }> = {
  SALES_INVOICE: { ar: 'فاتورة مبيعات', en: 'Sales Invoice' },
  PURCHASE_INVOICE: { ar: 'فاتورة مشتريات', en: 'Purchase Invoice' },
  PROGRESS_CLAIM: { ar: 'مستخلص', en: 'Progress Claim' },
  EXPENSE: { ar: 'مصروف', en: 'Expense' },
  CLIENT_PAYMENT: { ar: 'تحصيل عميل', en: 'Client Payment' },
  SUPPLIER_PAYMENT: { ar: 'دفع مورد', en: 'Supplier Payment' },
  EMPLOYEE_ADVANCE: { ar: 'سلفة موظف', en: 'Employee Advance' },
  RENTAL_INVOICE: { ar: 'فاتورة تأجير', en: 'Rental Invoice' },
  SALARY: { ar: 'رواتب', en: 'Salary' },
  GOSI: { ar: 'تأمينات اجتماعية', en: 'GOSI' },
  DEPRECIATION: { ar: 'إهلاك', en: 'Depreciation' },
  PERIOD_CLOSING: { ar: 'إقفال فترة', en: 'Period Closing' },
  ASSET_ACQUISITION: { ar: 'اقتناء أصل', en: 'Asset Acquisition' },
  PROVISION: { ar: 'مخصص', en: 'Provision' },
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, lang }: { icon: React.ElementType; title: { ar: string; en: string }; lang: 'ar' | 'en' }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-5 text-emerald-600" />
      <h3 className="text-lg font-bold">{title[lang]}</h3>
    </div>
  )
}

function SummaryCard({ title, value, icon: Icon, color = 'emerald', lang, isMoney = true }: {
  title: string; value: number; icon: React.ElementType; color?: string; lang: 'ar' | 'en'; isMoney?: boolean
}) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
    sky: 'bg-sky-50 border-sky-200 text-sky-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    teal: 'bg-teal-50 border-teal-200 text-teal-700',
  }
  return (
    <Card className={`${colors[color] || colors.emerald} border`}>
      <CardContent className="p-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Icon className="size-4" />
          <p className="text-xs font-medium">{title}</p>
        </div>
        {isMoney ? (
          <MoneyDisplay value={value} lang={lang} bold className="text-lg" />
        ) : (
          <p className="text-lg font-bold">{formatNumber(value)}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ============ Account Detail Dialog ============
function AccountDetailDialog({ account, open, onClose }: {
  account: Account | null; open: boolean; onClose: () => void
}) {
  const { lang } = useAppStore()
  if (!account) return null
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{account.code}</span>
            <span>-</span>
            <span>{lang === 'ar' && account.nameAr ? account.nameAr : account.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-muted-foreground">{t('الاسم بالإنجليزي', 'English Name', lang)}</p><p className="font-medium">{account.name}</p></div>
            <div><p className="text-xs text-muted-foreground">{t('الاسم بالعربي', 'Arabic Name', lang)}</p><p className="font-medium">{account.nameAr || '—'}</p></div>
          </div>
          <Separator />
          <div className="flex flex-wrap gap-2">
            <TypeBadge type={account.type} lang={lang} />
            <ActivityBadge activityType={account.activityType} lang={lang} />
            {account.isSystem && <Badge className="bg-amber-100 text-amber-700 border-0 gap-1"><Shield className="size-3" />{t('حساب نظامي', 'System', lang)}</Badge>}
            {!account.allowPosting && <Badge className="bg-red-100 text-red-700 border-0 gap-1"><Lock className="size-3" />{t('رأسي', 'Header', lang)}</Badge>}
            {account.allowPosting && <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1">{t('تفصيلي', 'Posting', lang)}</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-gray-50"><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('الرصيد الحالي', 'Current Balance', lang)}</p><MoneyDisplay value={account.balance} lang={lang} bold className={account.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></CardContent></Card>
            <Card className="bg-gray-50"><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('عدد القيود', 'Journal Lines', lang)}</p><p className="text-lg font-bold">{formatNumber(account._count.journalLines)}</p></CardContent></Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============ Journal Entry Detail ============
function JournalEntryDetail({ entry, onBack }: { entry: JournalEntry; onBack: () => void }) {
  const { lang } = useAppStore()
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ChevronLeft className="size-4" /></Button>
        <div>
          <h2 className="text-xl font-bold">{entry.entryNo}</h2>
          <p className="text-sm text-muted-foreground">{entry.description || ''}</p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          <JEStatusBadge status={entry.status} lang={lang} />
          {entry.sourceType && <Badge variant="outline" className="bg-gray-50">{sourceTypeLabels[entry.sourceType]?.[lang] || entry.sourceType}</Badge>}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-gray-50"><CardContent className="p-3 text-center"><p className="text-xs text-gray-600">{t('التاريخ', 'Date', lang)}</p><p className="font-semibold">{formatDate(entry.date, lang)}</p></CardContent></Card>
        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('مدين', 'Debit', lang)}</p><MoneyDisplay value={entry.totalDebit} lang={lang} bold className="text-emerald-700" /></CardContent></Card>
        <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('دائن', 'Credit', lang)}</p><MoneyDisplay value={entry.totalCredit} lang={lang} bold className="text-rose-700" /></CardContent></Card>
        <Card className="bg-gray-50"><CardContent className="p-3 text-center"><p className="text-xs text-gray-600">{t('عدد البنود', 'Lines', lang)}</p><p className="font-semibold">{formatNumber(entry.lines.length)}</p></CardContent></Card>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead>
                  <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                  <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                  <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.lines.map(line => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{line.account.code} - {lang === 'ar' && line.account.nameAr ? line.account.nameAr : line.account.name}</TableCell>
                    <TableCell>{line.debit > 0 ? <MoneyDisplay value={line.debit} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                    <TableCell>{line.credit > 0 ? <MoneyDisplay value={line.credit} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                    <TableCell className="text-muted-foreground">{line.description || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Tab 1: Chart of Accounts ============
function ChartOfAccountsTab({ accounts, isLoading, onInitialize, onReInitialize, isInitializing }: {
  accounts: Account[]; isLoading: boolean; onInitialize: () => void; onReInitialize: () => void; isInitializing: boolean
}) {
  const { lang } = useAppStore()
  const [activityFilter, setActivityFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    accounts.forEach(a => { if (!a.parentId || a.level === 0) initial.add(a.id) })
    return initial
  })
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const allParentIds = useMemo(() => {
    const ids = new Set<string>()
    accounts.forEach(a => { if (a.children && a.children.length > 0) ids.add(a.id) })
    return ids
  }, [accounts])

  const rootAccounts = useMemo(() => {
    return accounts.filter(a => !a.parentId).sort((a, b) => a.code.localeCompare(b.code))
  }, [accounts])

  const childMap = useMemo(() => {
    const map = new Map<string, Account[]>()
    accounts.forEach(a => { if (a.parentId) { const siblings = map.get(a.parentId) || []; siblings.push(a); map.set(a.parentId, siblings) } })
    map.forEach((children) => children.sort((a, b) => a.code.localeCompare(b.code)))
    return map
  }, [accounts])

  const filteredAccounts = useMemo(() => {
    let filtered = accounts
    if (activityFilter !== 'all') {
      if (activityFilter === 'BOTH') filtered = filtered.filter(a => a.activityType === 'BOTH' || !a.activityType)
      else filtered = filtered.filter(a => a.activityType === activityFilter)
    }
    if (typeFilter !== 'all') filtered = filtered.filter(a => a.type === typeFilter)
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(a => a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term) || (a.nameAr && a.nameAr.toLowerCase().includes(term)))
    }
    return filtered
  }, [accounts, activityFilter, typeFilter, searchTerm])

  const flatAccounts = useMemo(() => {
    function flatten(roots: Account[], level: number): (Account & { displayLevel: number })[] {
      const result: (Account & { displayLevel: number })[] = []
      for (const root of roots) {
        if (!filteredAccounts.find(a => a.id === root.id)) continue
        result.push({ ...root, displayLevel: level })
        const children = childMap.get(root.id) || []
        if (children.length > 0 && expandedIds.has(root.id)) result.push(...flatten(children, level + 1))
      }
      return result
    }
    return flatten(rootAccounts, 0)
  }, [rootAccounts, filteredAccounts, childMap, expandedIds])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }, [])

  const typeSummary = useMemo(() => { const s: Record<string, number> = {}; accounts.forEach(a => { s[a.type] = (s[a.type] || 0) + 1 }); return s }, [accounts])

  if (isLoading) return <TableSkeleton />
  if (accounts.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
          <Database className="size-12 text-emerald-500" />
          <div>
            <h3 className="text-lg font-semibold text-emerald-800">{t('لا توجد حسابات', 'No Accounts Found', lang)}</h3>
            <p className="text-sm text-emerald-600 mt-1">{t('قم بتهيئة دليل الحسابات الافتراضي', 'Initialize the default chart of accounts', lang)}</p>
          </div>
          <Button onClick={onInitialize} disabled={isInitializing} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {isInitializing ? <RefreshCw className="size-4 animate-spin" /> : <PlusCircle className="size-4" />}
            {isInitializing ? t('جاري التهيئة...', 'Initializing...', lang) : t('تهيئة دليل الحسابات', 'Initialize Chart of Accounts', lang)}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {Object.entries(typeSummary).map(([type, count]) => {
          const cfg = typeConfig[type]
          if (!cfg) return null
          return <Card key={type} className={`${cfg.bg} border-0`}><CardContent className="p-3 text-center"><p className={`text-xs ${cfg.color}`}>{cfg.label[lang]}</p><p className={`text-lg font-bold ${cfg.color}`}>{count}</p></CardContent></Card>
        })}
      </div>

      {/* Filters */}
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[120px]">
              <Label className="text-xs">{t('النشاط', 'Activity', lang)}</Label>
              <Select value={activityFilter} onValueChange={setActivityFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('الكل', 'All', lang)}</SelectItem>
                  <SelectItem value="CONSTRUCTION">{t('مشاريع', 'Construction', lang)}</SelectItem>
                  <SelectItem value="EQUIPMENT_RENTAL">{t('تأجير', 'Rental', lang)}</SelectItem>
                  <SelectItem value="BOTH">{t('مشترك', 'Both', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[120px]">
              <Label className="text-xs">{t('النوع', 'Type', lang)}</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('الكل', 'All', lang)}</SelectItem>
                  <SelectItem value="ASSET">{t('أصول', 'Asset', lang)}</SelectItem>
                  <SelectItem value="LIABILITY">{t('التزامات', 'Liability', lang)}</SelectItem>
                  <SelectItem value="EQUITY">{t('حقوق ملكية', 'Equity', lang)}</SelectItem>
                  <SelectItem value="REVENUE">{t('إيرادات', 'Revenue', lang)}</SelectItem>
                  <SelectItem value="EXPENSE">{t('مصروفات', 'Expense', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs">{t('بحث', 'Search', lang)}</Label>
              <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={t('بحث بالكود أو الاسم...', 'Search by code or name...', lang)} className="h-9" />
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setExpandedIds(new Set(allParentIds))} className="text-xs gap-1 h-9"><ChevronDown className="size-3" />{t('توسيع', 'Expand', lang)}</Button>
              <Button variant="outline" size="sm" onClick={() => setExpandedIds(new Set())} className="text-xs gap-1 h-9"><ChevronRight className="size-3" />{t('تقليص', 'Collapse', lang)}</Button>
            </div>
            <Button variant="outline" size="sm" onClick={onReInitialize} disabled={isInitializing} className="gap-2 text-xs h-9">
              {isInitializing ? <RefreshCw className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {t('تحديث', 'Re-initialize', lang)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right min-w-[120px]">{t('الكود', 'Code', lang)}</TableHead>
                  <TableHead className="text-right min-w-[200px]">{t('اسم الحساب', 'Account Name', lang)}</TableHead>
                  <TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead>
                  <TableHead className="text-right">{t('النشاط', 'Activity', lang)}</TableHead>
                  <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                  <TableHead className="text-right">{t('القيود', 'Entries', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatAccounts.map(a => {
                  const hasChildren = childMap.has(a.id) && (childMap.get(a.id)?.length || 0) > 0
                  const isExpanded = expandedIds.has(a.id)
                  return (
                    <TableRow key={a.id} className={`cursor-pointer hover:bg-emerald-50/30 ${a.displayLevel === 0 ? 'bg-gray-50/50 font-semibold' : ''} ${a.isSystem ? 'bg-amber-50/30' : ''}`}
                      onClick={() => { setSelectedAccount(a); setDetailOpen(true) }}>
                      <TableCell>
                        <div className="flex items-center" style={{ paddingLeft: `${a.displayLevel * 24}px` }}>
                          {hasChildren && <button onClick={(e) => { e.stopPropagation(); toggleExpand(a.id) }} className="mr-1 p-0.5 hover:bg-gray-200 rounded">{isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</button>}
                          {!hasChildren && a.displayLevel > 0 && <span className="text-gray-300 mr-1 ml-1 text-xs">└</span>}
                          <span className="font-mono text-sm">{a.code}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={a.displayLevel === 0 ? 'font-bold' : ''}>
                          {lang === 'ar' && a.nameAr ? a.nameAr : a.name}
                        </span>
                      </TableCell>
                      <TableCell><TypeBadge type={a.type} lang={lang} /></TableCell>
                      <TableCell><ActivityBadge activityType={a.activityType} lang={lang} /></TableCell>
                      <TableCell><MoneyDisplay value={a.balance} lang={lang} size="sm" bold className={a.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></TableCell>
                      <TableCell className="text-center">{formatNumber(a._count.journalLines)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AccountDetailDialog account={selectedAccount} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  )
}

// ============ Tab 2: Journal Entries ============
function JournalEntriesTab({ entries, isLoading, isError, refetch }: {
  entries: JournalEntry[]; isLoading: boolean; isError: boolean; refetch: () => void
}) {
  const { lang } = useAppStore()
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = useMemo(() => {
    let f = entries
    if (statusFilter !== 'all') f = f.filter(e => e.status === statusFilter)
    if (sourceFilter !== 'all') f = f.filter(e => e.sourceType === sourceFilter)
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      f = f.filter(e => e.entryNo.toLowerCase().includes(term) || (e.description || '').toLowerCase().includes(term))
    }
    return f
  }, [entries, statusFilter, sourceFilter, searchTerm])

  if (selectedEntry) return <JournalEntryDetail entry={selectedEntry} onBack={() => setSelectedEntry(null)} />
  if (isLoading) return <TableSkeleton />
  if (isError) return <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[120px]">
              <Label className="text-xs">{t('الحالة', 'Status', lang)}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('الكل', 'All', lang)}</SelectItem>
                  <SelectItem value="POSTED">{t('مرحّل', 'Posted', lang)}</SelectItem>
                  <SelectItem value="DRAFT">{t('مسودة', 'Draft', lang)}</SelectItem>
                  <SelectItem value="CANCELLED">{t('ملغي', 'Cancelled', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[150px]">
              <Label className="text-xs">{t('المصدر', 'Source', lang)}</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('الكل', 'All', lang)}</SelectItem>
                  {Object.entries(sourceTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label[lang]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs">{t('بحث', 'Search', lang)}</Label>
              <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={t('بحث برقم القيد أو الوصف...', 'Search by entry no or description...', lang)} className="h-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10"><FileText className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد قيود', 'No journal entries found', lang)}</p></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('رقم القيد', 'Entry No', lang)}</TableHead>
                    <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                    <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                    <TableHead className="text-right">{t('المصدر', 'Source', lang)}</TableHead>
                    <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(entry => (
                    <TableRow key={entry.id} className="cursor-pointer hover:bg-emerald-50/30" onClick={() => setSelectedEntry(entry)}>
                      <TableCell className="font-mono font-medium">{entry.entryNo}</TableCell>
                      <TableCell>{formatDate(entry.date, lang)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{entry.description || '—'}</TableCell>
                      <TableCell>{entry.sourceType ? <Badge variant="outline" className="text-xs">{sourceTypeLabels[entry.sourceType]?.[lang] || entry.sourceType}</Badge> : '—'}</TableCell>
                      <TableCell><MoneyDisplay value={entry.totalDebit} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                      <TableCell><MoneyDisplay value={entry.totalCredit} lang={lang} size="sm" className="text-rose-700" /></TableCell>
                      <TableCell><JEStatusBadge status={entry.status} lang={lang} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Tab 3: General Ledger ============
function GeneralLedgerTab({ accounts }: { accounts: Account[] }) {
  const { lang } = useAppStore()
  const postingAccounts = useMemo(() => accounts.filter(a => a.allowPosting).sort((a, b) => a.code.localeCompare(b.code)), [accounts])
  const [selectedCode, setSelectedCode] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: ledgerData, isLoading, isError, refetch } = useQuery<{
    account: { id: string; code: string; name: string; nameAr: string | null; type: string }
    lines: StatementLine[]
    totalDebit: number; totalCredit: number; closingBalance: number
  } | null>({
    queryKey: ['general-ledger', selectedCode, dateFrom, dateTo],
    queryFn: async () => {
      if (!selectedCode) return null
      const params = new URLSearchParams({ accountCode: selectedCode })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/general-ledger?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedCode,
  })

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">{t('الحساب', 'Account', lang)}</Label>
              <Select value={selectedCode} onValueChange={setSelectedCode}>
                <SelectTrigger className="h-9"><SelectValue placeholder={t('اختر الحساب...', 'Select account...', lang)} /></SelectTrigger>
                <SelectContent>
                  {postingAccounts.map(a => (
                    <SelectItem key={a.id} value={a.code}>{a.code} - {lang === 'ar' && a.nameAr ? a.nameAr : a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
            {selectedCode && <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1"><RefreshCw className="size-3.5" />{t('تحديث', 'Refresh', lang)}</Button>}
          </div>
        </CardContent>
      </Card>

      {!selectedCode ? (
        <div className="flex flex-col items-center gap-3 py-10"><BookOpen className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('اختر حساباً لعرض حركته', 'Select an account to view its ledger', lang)}</p></div>
      ) : isLoading ? <TableSkeleton /> : isError ? (
        <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
      ) : ledgerData ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-sky-50 border-sky-200"><CardContent className="p-3 text-center"><p className="text-xs text-sky-600">{t('الحساب', 'Account', lang)}</p><p className="font-bold font-mono">{ledgerData.account.code}</p></CardContent></Card>
            <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('مدين', 'Debit', lang)}</p><MoneyDisplay value={ledgerData.totalDebit} lang={lang} bold className="text-emerald-700" /></CardContent></Card>
            <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('دائن', 'Credit', lang)}</p><MoneyDisplay value={ledgerData.totalCredit} lang={lang} bold className="text-rose-700" /></CardContent></Card>
            <Card className="bg-purple-50 border-purple-200"><CardContent className="p-3 text-center"><p className="text-xs text-purple-600">{t('الرصيد الختامي', 'Closing Balance', lang)}</p><MoneyDisplay value={ledgerData.closingBalance} lang={lang} bold className="text-purple-700" /></CardContent></Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('رقم القيد', 'Entry No', lang)}</TableHead>
                      <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                      <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                      <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                      <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerData.lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{formatDate(line.date, lang)}</TableCell>
                        <TableCell className="font-mono">{line.entryNo}</TableCell>
                        <TableCell>{line.description || line.lineDescription || '—'}</TableCell>
                        <TableCell>{line.debit > 0 ? <MoneyDisplay value={line.debit} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                        <TableCell>{line.credit > 0 ? <MoneyDisplay value={line.credit} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                        <TableCell className="font-semibold"><MoneyDisplay value={line.balance} lang={lang} size="sm" className={line.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'} bold /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

// ============ Tab 4: Trial Balance ============
function TrialBalanceTab() {
  const { lang } = useAppStore()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: trialData, isLoading, isError, refetch } = useQuery<TrialBalanceItem[]>({
    queryKey: ['trial-balance', dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/trial-balance?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      return Array.isArray(data) ? data : (data.items || [])
    },
  })

  const safeData = trialData || []
  const totals = useMemo(() => ({
    netDebit: safeData.reduce((s, i) => s + i.netDebit, 0),
    netCredit: safeData.reduce((s, i) => s + i.netCredit, 0),
  }), [safeData])

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1"><Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1"><RefreshCw className="size-3.5" />{t('تحديث', 'Refresh', lang)}</Button>
            <div className="mr-auto">
              <Badge className={Math.abs(totals.netDebit - totals.netCredit) < 0.01 ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-rose-100 text-rose-700 border-0'}>
                {Math.abs(totals.netDebit - totals.netCredit) < 0.01 ? t('✓ متوازن', '✓ Balanced', lang) : t('✗ غير متوازن', '✗ Unbalanced', lang)}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <TableSkeleton /> : isError ? (
        <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p></div>
      ) : safeData.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10"><Scale className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد أرصدة', 'No balances found', lang)}</p></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead>
                    <TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead>
                    <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {safeData.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{item.account.code}</TableCell>
                      <TableCell className="font-medium">{lang === 'ar' && item.account.nameAr ? item.account.nameAr : item.account.name}</TableCell>
                      <TableCell><TypeBadge type={item.account.type} lang={lang} /></TableCell>
                      <TableCell>{item.netDebit > 0 ? <MoneyDisplay value={item.netDebit} lang={lang} size="sm" className="text-emerald-700" bold /> : '—'}</TableCell>
                      <TableCell>{item.netCredit > 0 ? <MoneyDisplay value={item.netCredit} lang={lang} size="sm" className="text-rose-700" bold /> : '—'}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-100 font-bold border-t-2 border-gray-300">
                    <TableCell colSpan={3} className="text-lg">{t('الإجمالي', 'Total', lang)}</TableCell>
                    <TableCell><MoneyDisplay value={totals.netDebit} lang={lang} size="sm" bold className="text-emerald-800" /></TableCell>
                    <TableCell><MoneyDisplay value={totals.netCredit} lang={lang} size="sm" bold className="text-rose-800" /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Tab 5: Income Statement ============
function IncomeStatementTab() {
  const { lang } = useAppStore()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['financial-reports', 'income-statement', dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'income-statement' })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/financial-reports?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const report = data as Record<string, unknown> | undefined
  const revenues = (report?.revenues as Record<string, number>) || {}
  const projectCosts = (report?.projectCosts as Record<string, number>) || {}
  const rentalCosts = (report?.rentalCosts as Record<string, number>) || {}
  const operatingExpenses = (report?.operatingExpenses as Record<string, number>) || {}
  const grossProfit = (report?.grossProfit as number) || 0
  const netProfit = (report?.netProfit as number) || 0
  const totalRevenue = (report?.totalRevenue as number) || 0
  const totalProjectCosts = (report?.totalProjectCosts as number) || 0
  const totalRentalCosts = (report?.totalRentalCosts as number) || 0
  const totalOperatingExpenses = (report?.totalOperatingExpenses as number) || 0

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1"><Label className="text-xs">{t('من تاريخ', 'From', lang)}</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">{t('إلى تاريخ', 'To', lang)}</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1"><RefreshCw className="size-3.5" />{t('عرض التقرير', 'Generate', lang)}</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <TableSkeleton /> : isError ? (
        <div className="text-center py-10 text-rose-600">{t('حدث خطأ', 'Error', lang)}</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard title={t('إجمالي الإيرادات', 'Total Revenue', lang)} value={totalRevenue} icon={TrendingUp} color="emerald" lang={lang} />
            <SummaryCard title={t('تكاليف المشاريع', 'Project Costs', lang)} value={totalProjectCosts + totalRentalCosts} icon={Building2} color="rose" lang={lang} />
            <SummaryCard title={t('مجمل الربح', 'Gross Profit', lang)} value={grossProfit} icon={BarChart3} color={grossProfit >= 0 ? 'emerald' : 'rose'} lang={lang} />
            <SummaryCard title={t('صافي الربح', 'Net Profit', lang)} value={netProfit} icon={CircleDollarSign} color={netProfit >= 0 ? 'emerald' : 'rose'} lang={lang} />
          </div>

          {/* Revenue Section */}
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={TrendingUp} title={{ ar: 'الإيرادات', en: 'Revenue' }} lang={lang} />
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">{t('البند', 'Item', lang)}</TableHead><TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {Object.entries(revenues).map(([key, val]) => (
                    <TableRow key={key}><TableCell>{key}</TableCell><TableCell><MoneyDisplay value={val as number} lang={lang} size="sm" className="text-emerald-700" /></TableCell></TableRow>
                  ))}
                  <TableRow className="font-bold bg-emerald-50"><TableCell>{t('إجمالي الإيرادات', 'Total Revenue', lang)}</TableCell><TableCell><MoneyDisplay value={totalRevenue} lang={lang} bold className="text-emerald-700" /></TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Costs Section */}
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={Building2} title={{ ar: 'تكاليف المشاريع والتأجير', en: 'Project & Rental Costs' }} lang={lang} />
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">{t('البند', 'Item', lang)}</TableHead><TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {Object.entries(projectCosts).map(([key, val]) => (
                    <TableRow key={key}><TableCell>{key}</TableCell><TableCell><MoneyDisplay value={val as number} lang={lang} size="sm" className="text-rose-700" /></TableCell></TableRow>
                  ))}
                  {Object.entries(rentalCosts).map(([key, val]) => (
                    <TableRow key={key}><TableCell>{key}</TableCell><TableCell><MoneyDisplay value={val as number} lang={lang} size="sm" className="text-rose-700" /></TableCell></TableRow>
                  ))}
                  <TableRow className="font-bold bg-rose-50"><TableCell>{t('إجمالي التكاليف', 'Total Costs', lang)}</TableCell><TableCell><MoneyDisplay value={totalProjectCosts + totalRentalCosts} lang={lang} bold className="text-rose-700" /></TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Operating Expenses */}
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={Calculator} title={{ ar: 'المصاريف الإدارية والتشغيلية', en: 'Operating Expenses' }} lang={lang} />
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">{t('البند', 'Item', lang)}</TableHead><TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {Object.entries(operatingExpenses).map(([key, val]) => (
                    <TableRow key={key}><TableCell>{key}</TableCell><TableCell><MoneyDisplay value={val as number} lang={lang} size="sm" className="text-orange-700" /></TableCell></TableRow>
                  ))}
                  <TableRow className="font-bold bg-orange-50"><TableCell>{t('إجمالي المصاريف', 'Total Operating', lang)}</TableCell><TableCell><MoneyDisplay value={totalOperatingExpenses} lang={lang} bold className="text-orange-700" /></TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Net Profit */}
          <Card className={`border-2 ${netProfit >= 0 ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
            <CardContent className="p-6 text-center">
              <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                {t('صافي الربح', 'Net Profit', lang)}: <MoneyDisplay value={netProfit} lang={lang} bold className="text-3xl" />
              </p>
              {totalRevenue > 0 && (
                <p className={`text-sm mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {t('هامش الربح', 'Profit Margin', lang)}: {((netProfit / totalRevenue) * 100).toFixed(1)}%
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10"><BarChart3 className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('حدد الفترة ثم اضغط عرض التقرير', 'Select period and click Generate', lang)}</p></div>
      )}
    </div>
  )
}

// ============ Tab 6: Balance Sheet ============
function BalanceSheetTab() {
  const { lang } = useAppStore()
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['financial-reports', 'balance-sheet', dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'balance-sheet' })
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/financial-reports?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const report = data as Record<string, unknown> | undefined
  const currentAssets = (report?.currentAssets as Record<string, number>) || {}
  const nonCurrentAssets = (report?.nonCurrentAssets as Record<string, number>) || {}
  const currentLiabilities = (report?.currentLiabilities as Record<string, number>) || {}
  const nonCurrentLiabilities = (report?.nonCurrentLiabilities as Record<string, number>) || {}
  const equity = (report?.equity as Record<string, number>) || {}
  const totalAssets = (report?.totalAssets as number) || 0
  const totalLiabilities = (report?.totalLiabilities as number) || 0
  const totalEquity = (report?.totalEquity as number) || 0
  const isBalanced = (report?.isBalanced as boolean) || false

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1"><Label className="text-xs">{t('حتى تاريخ', 'As of Date', lang)}</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1"><RefreshCw className="size-3.5" />{t('عرض', 'Generate', lang)}</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <TableSkeleton /> : data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard title={t('إجمالي الأصول', 'Total Assets', lang)} value={totalAssets} icon={Wallet} color="sky" lang={lang} />
            <SummaryCard title={t('إجمالي الخصوم', 'Total Liabilities', lang)} value={totalLiabilities} icon={CreditCard} color="orange" lang={lang} />
            <SummaryCard title={t('حقوق الملكية', 'Equity', lang)} value={totalEquity} icon={Banknote} color="purple" lang={lang} />
            <Card className={`${isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'} border`}>
              <CardContent className="p-4 text-center">
                <p className="text-xs font-medium">{t('التحقق', 'Verification', lang)}</p>
                <p className={`text-lg font-bold ${isBalanced ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isBalanced ? t('✓ متوازنة', '✓ Balanced', lang) : t('✗ غير متوازنة', '✗ Unbalanced', lang)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Assets Column */}
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <SectionTitle icon={Wallet} title={{ ar: 'الأصول المتداولة', en: 'Current Assets' }} lang={lang} />
                  <Table>
                    <TableBody>
                      {Object.entries(currentAssets).map(([key, val]) => (
                        <TableRow key={key}><TableCell>{key}</TableCell><TableCell className="text-left"><MoneyDisplay value={val as number} lang={lang} size="sm" className="text-sky-700" /></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <SectionTitle icon={Wallet} title={{ ar: 'الأصول غير المتداولة', en: 'Non-Current Assets' }} lang={lang} />
                  <Table>
                    <TableBody>
                      {Object.entries(nonCurrentAssets).map(([key, val]) => (
                        <TableRow key={key}><TableCell>{key}</TableCell><TableCell className="text-left"><MoneyDisplay value={val as number} lang={lang} size="sm" className="text-sky-700" /></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card className="bg-sky-50 border-sky-200"><CardContent className="p-4 text-center"><p className="text-lg font-bold text-sky-800">{t('إجمالي الأصول', 'Total Assets', lang)}: <MoneyDisplay value={totalAssets} lang={lang} bold /></p></CardContent></Card>
            </div>

            {/* Liabilities & Equity Column */}
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <SectionTitle icon={CreditCard} title={{ ar: 'الخصوم المتداولة', en: 'Current Liabilities' }} lang={lang} />
                  <Table>
                    <TableBody>
                      {Object.entries(currentLiabilities).map(([key, val]) => (
                        <TableRow key={key}><TableCell>{key}</TableCell><TableCell className="text-left"><MoneyDisplay value={val as number} lang={lang} size="sm" className="text-orange-700" /></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <SectionTitle icon={Banknote} title={{ ar: 'حقوق الملكية', en: 'Equity' }} lang={lang} />
                  <Table>
                    <TableBody>
                      {Object.entries(equity).map(([key, val]) => (
                        <TableRow key={key}><TableCell>{key}</TableCell><TableCell className="text-left"><MoneyDisplay value={val as number} lang={lang} size="sm" className="text-purple-700" /></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 border-purple-200"><CardContent className="p-4 text-center"><p className="text-lg font-bold text-purple-800">{t('إجمالي الخصوم + حقوق الملكية', 'Total Liabilities + Equity', lang)}: <MoneyDisplay value={totalLiabilities + totalEquity} lang={lang} bold /></p></CardContent></Card>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10"><Scale className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('حدد التاريخ ثم اضغط عرض', 'Select date and click Generate', lang)}</p></div>
      )}
    </div>
  )
}

// ============ Tab 7: Cash Flow ============
function CashFlowTab() {
  const { lang } = useAppStore()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['financial-reports', 'cash-flow', dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'cash-flow' })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/financial-reports?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const report = data as Record<string, unknown> | undefined
  const operatingCF = (report?.operatingCashFlow as number) || 0
  const investingCF = (report?.investingCashFlow as number) || 0
  const financingCF = (report?.financingCashFlow as number) || 0
  const netChange = (report?.netChangeInCash as number) || 0
  const openingCash = (report?.openingCashBalance as number) || 0
  const closingCash = (report?.closingCashBalance as number) || 0

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1"><Label className="text-xs">{t('من تاريخ', 'From', lang)}</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">{t('إلى تاريخ', 'To', lang)}</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1"><RefreshCw className="size-3.5" />{t('عرض', 'Generate', lang)}</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <TableSkeleton /> : data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard title={t('تدفقات التشغيل', 'Operating CF', lang)} value={operatingCF} icon={Cog} color={operatingCF >= 0 ? 'emerald' : 'rose'} lang={lang} />
            <SummaryCard title={t('تدفقات الاستثمار', 'Investing CF', lang)} value={investingCF} icon={Building2} color={investingCF >= 0 ? 'emerald' : 'rose'} lang={lang} />
            <SummaryCard title={t('تدفقات التمويل', 'Financing CF', lang)} value={financingCF} icon={Banknote} color={financingCF >= 0 ? 'emerald' : 'rose'} lang={lang} />
          </div>

          <Card>
            <CardContent className="p-4">
              <Table>
                <TableBody>
                  <TableRow><TableCell className="font-semibold">{t('صافي الربح', 'Net Profit', lang)}</TableCell><TableCell className="text-left"><MoneyDisplay value={(report?.netProfit as number) || 0} lang={lang} size="sm" /></TableCell></TableRow>
                  <TableRow><TableCell>{t('+ تعديلات غير نقدية', '+ Non-cash adjustments', lang)}</TableCell><TableCell className="text-left"><MoneyDisplay value={(report?.nonCashAdjustments as number) || 0} lang={lang} size="sm" /></TableCell></TableRow>
                  <TableRow><TableCell>{t('+ تغيرات رأس المال العامل', '+ Working capital changes', lang)}</TableCell><TableCell className="text-left"><MoneyDisplay value={(report?.workingCapitalChanges as number) || 0} lang={lang} size="sm" /></TableCell></TableRow>
                  <TableRow className="bg-emerald-50 font-bold"><TableCell>{t('= تدفقات التشغيل', '= Operating Cash Flow', lang)}</TableCell><TableCell className="text-left"><MoneyDisplay value={operatingCF} lang={lang} bold className={operatingCF >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></TableCell></TableRow>
                  <TableRow><TableCell>{t('تدفقات الاستثمار', 'Investing Activities', lang)}</TableCell><TableCell className="text-left"><MoneyDisplay value={investingCF} lang={lang} size="sm" /></TableCell></TableRow>
                  <TableRow><TableCell>{t('تدفقات التمويل', 'Financing Activities', lang)}</TableCell><TableCell className="text-left"><MoneyDisplay value={financingCF} lang={lang} size="sm" /></TableCell></TableRow>
                  <TableRow className="bg-sky-50 font-bold"><TableCell>{t('صافي التغير في النقد', 'Net Change in Cash', lang)}</TableCell><TableCell className="text-left"><MoneyDisplay value={netChange} lang={lang} bold className="text-sky-700" /></TableCell></TableRow>
                  <TableRow><TableCell>{t('رصيد النقد أول الفترة', 'Opening Cash', lang)}</TableCell><TableCell className="text-left"><MoneyDisplay value={openingCash} lang={lang} size="sm" /></TableCell></TableRow>
                  <TableRow className="bg-purple-50 font-bold border-t-2"><TableCell>{t('رصيد النقد آخر الفترة', 'Closing Cash', lang)}</TableCell><TableCell className="text-left"><MoneyDisplay value={closingCash} lang={lang} bold className="text-purple-700" /></TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10"><Landmark className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('حدد الفترة ثم اضغط عرض', 'Select period and click Generate', lang)}</p></div>
      )}
    </div>
  )
}

// ============ Tab 8: Cost Centers ============
function CostCentersTab() {
  const { lang } = useAppStore()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => { const res = await fetch('/api/cost-centers'); if (!res.ok) throw new Error(); return res.json() },
  })

  const costCenters = (Array.isArray(data) ? data : (data?.costCenters || [])) as Record<string, unknown>[]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard title={t('عدد المراكز', 'Total Centers', lang)} value={costCenters.length} icon={FolderClosed} color="teal" lang={lang} isMoney={false} />
      </div>

      {isLoading ? <TableSkeleton /> : costCenters.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10"><FolderClosed className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد مراكز تكلفة', 'No cost centers found', lang)}</p></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('الاسم', 'Name', lang)}</TableHead>
                    <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costCenters.map((cc, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono">{String(cc.code || '')}</TableCell>
                      <TableCell className="font-medium">{String(cc.name || '')}</TableCell>
                      <TableCell>{cc.project ? String((cc.project as Record<string, unknown>).name || '') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Tab 9: Customer Statement ============
function CustomerStatementTab() {
  const { lang } = useAppStore()
  const [selectedClient, setSelectedClient] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: clients } = useQuery({
    queryKey: ['clients-simple'],
    queryFn: async () => { const res = await fetch('/api/clients?simple=true&active=true'); if (!res.ok) throw new Error(); return res.json() },
  })

  const clientList = (Array.isArray(clients) ? clients : []) as { id: string; name: string; code: string }[]

  const { data: statementData, isLoading, refetch } = useQuery({
    queryKey: ['account-statement', 'customer', selectedClient, dateFrom, dateTo],
    queryFn: async () => {
      if (!selectedClient) return null
      const params = new URLSearchParams({ entityType: 'customer', entityId: selectedClient })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/account-statement?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedClient,
  })

  const statement = statementData as Record<string, unknown> | null

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">{t('العميل', 'Client', lang)}</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="h-9"><SelectValue placeholder={t('اختر العميل...', 'Select client...', lang)} /></SelectTrigger>
                <SelectContent>
                  {clientList.map(c => <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">{t('من', 'From', lang)}</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">{t('إلى', 'To', lang)}</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
            {selectedClient && <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1"><RefreshCw className="size-3.5" />{t('عرض', 'View', lang)}</Button>}
          </div>
        </CardContent>
      </Card>

      {!selectedClient ? (
        <div className="flex flex-col items-center gap-3 py-10"><Users className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('اختر عميلاً لعرض كشف حسابه', 'Select a client to view statement', lang)}</p></div>
      ) : isLoading ? <TableSkeleton /> : statement ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard title={t('الرصيد الافتتاحي', 'Opening Balance', lang)} value={(statement.openingBalance as number) || 0} icon={Wallet} color="sky" lang={lang} />
            <SummaryCard title={t('الرصيد الختامي', 'Closing Balance', lang)} value={(statement.closingBalance as number) || 0} icon={CircleDollarSign} color={((statement.closingBalance as number) || 0) >= 0 ? 'emerald' : 'rose'} lang={lang} />
            <SummaryCard title={t('إجمالي الفواتير', 'Total Invoices', lang)} value={((statement.summary as Record<string, number>)?.totalRevenues) || 0} icon={FileText} color="emerald" lang={lang} />
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                      <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                      <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                      <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((statement.lines as Record<string, unknown>[]) || []).map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{formatDate(String(line.date || ''), lang)}</TableCell>
                        <TableCell>{String(line.description || '')}</TableCell>
                        <TableCell>{(line.debit as number) > 0 ? <MoneyDisplay value={line.debit as number} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                        <TableCell>{(line.credit as number) > 0 ? <MoneyDisplay value={line.credit as number} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                        <TableCell className="font-semibold"><MoneyDisplay value={line.balance as number} lang={lang} size="sm" bold /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

// ============ Tab 10: Vendor Statement ============
function VendorStatementTab() {
  const { lang } = useAppStore()
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-simple'],
    queryFn: async () => { const res = await fetch('/api/suppliers'); if (!res.ok) throw new Error(); return res.json() },
  })

  const supplierList = (Array.isArray(suppliers) ? suppliers : (suppliers?.suppliers || [])) as { id: string; name: string; code: string }[]

  const { data: statementData, isLoading, refetch } = useQuery({
    queryKey: ['account-statement', 'vendor', selectedSupplier, dateFrom, dateTo],
    queryFn: async () => {
      if (!selectedSupplier) return null
      const params = new URLSearchParams({ entityType: 'vendor', entityId: selectedSupplier })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/account-statement?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedSupplier,
  })

  const statement = statementData as Record<string, unknown> | null

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">{t('المورد', 'Supplier', lang)}</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="h-9"><SelectValue placeholder={t('اختر المورد...', 'Select supplier...', lang)} /></SelectTrigger>
                <SelectContent>
                  {supplierList.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">{t('من', 'From', lang)}</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">{t('إلى', 'To', lang)}</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
            {selectedSupplier && <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1"><RefreshCw className="size-3.5" />{t('عرض', 'View', lang)}</Button>}
          </div>
        </CardContent>
      </Card>

      {!selectedSupplier ? (
        <div className="flex flex-col items-center gap-3 py-10"><Package className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('اختر مورداً لعرض كشف حسابه', 'Select a supplier to view statement', lang)}</p></div>
      ) : isLoading ? <TableSkeleton /> : statement ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard title={t('الرصيد الافتتاحي', 'Opening Balance', lang)} value={(statement.openingBalance as number) || 0} icon={Wallet} color="sky" lang={lang} />
            <SummaryCard title={t('الرصيد الختامي', 'Closing Balance', lang)} value={(statement.closingBalance as number) || 0} icon={CircleDollarSign} color={((statement.closingBalance as number) || 0) >= 0 ? 'emerald' : 'rose'} lang={lang} />
            <SummaryCard title={t('إجمالي الفواتير', 'Total Invoices', lang)} value={((statement.summary as Record<string, number>)?.totalRevenues) || 0} icon={FileText} color="rose" lang={lang} />
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                      <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                      <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                      <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((statement.lines as Record<string, unknown>[]) || []).map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{formatDate(String(line.date || ''), lang)}</TableCell>
                        <TableCell>{String(line.description || '')}</TableCell>
                        <TableCell>{(line.debit as number) > 0 ? <MoneyDisplay value={line.debit as number} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                        <TableCell>{(line.credit as number) > 0 ? <MoneyDisplay value={line.credit as number} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                        <TableCell className="font-semibold"><MoneyDisplay value={line.balance as number} lang={lang} size="sm" bold /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

// ============ Tab 11: Project Profitability ============
function ProjectProfitabilityTab() {
  const { lang } = useAppStore()
  const [selectedProject, setSelectedProject] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: projects } = useQuery({
    queryKey: ['projects-list'],
    queryFn: async () => { const res = await fetch('/api/projects/list'); if (!res.ok) throw new Error(); return res.json() },
  })

  const projectList = (Array.isArray(projects) ? projects : []) as { id: string; name: string; code: string }[]

  const { data: statementData, isLoading, refetch } = useQuery({
    queryKey: ['account-statement', 'project', selectedProject, dateFrom, dateTo],
    queryFn: async () => {
      if (!selectedProject) return null
      const params = new URLSearchParams({ entityType: 'project', entityId: selectedProject })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/account-statement?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedProject,
  })

  const statement = statementData as Record<string, unknown> | null
  const summary = (statement?.summary as Record<string, number>) || {}

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">{t('المشروع', 'Project', lang)}</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="h-9"><SelectValue placeholder={t('اختر المشروع...', 'Select project...', lang)} /></SelectTrigger>
                <SelectContent>
                  {projectList.map(p => <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">{t('من', 'From', lang)}</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">{t('إلى', 'To', lang)}</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
            {selectedProject && <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1"><RefreshCw className="size-3.5" />{t('عرض', 'View', lang)}</Button>}
          </div>
        </CardContent>
      </Card>

      {!selectedProject ? (
        <div className="flex flex-col items-center gap-3 py-10"><Building2 className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('اختر مشروعاً لعرض ربحيته', 'Select a project to view profitability', lang)}</p></div>
      ) : isLoading ? <TableSkeleton /> : statement ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard title={t('الإيرادات', 'Revenue', lang)} value={summary.totalRevenues || 0} icon={TrendingUp} color="emerald" lang={lang} />
            <SummaryCard title={t('التكاليف', 'Costs', lang)} value={summary.totalCosts || 0} icon={Building2} color="rose" lang={lang} />
            <SummaryCard title={t('الربح', 'Profit', lang)} value={summary.profit || 0} icon={CircleDollarSign} color={(summary.profit || 0) >= 0 ? 'emerald' : 'rose'} lang={lang} />
            <Card className="bg-teal-50 border-teal-200 border">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1"><BarChart3 className="size-4 text-teal-600" /><p className="text-xs font-medium text-teal-600">{t('هامش الربح', 'Profit Margin', lang)}</p></div>
                <p className="text-lg font-bold text-teal-700">{(summary.profitMargin || 0).toFixed(1)}%</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                      <TableHead className="text-right">{t('الفئة', 'Category', lang)}</TableHead>
                      <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                      <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((statement.lines as Record<string, unknown>[]) || []).map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{formatDate(String(line.date || ''), lang)}</TableCell>
                        <TableCell>{String(line.description || '')}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{String(line.category || '')}</Badge></TableCell>
                        <TableCell>{(line.debit as number) > 0 ? <MoneyDisplay value={line.debit as number} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                        <TableCell>{(line.credit as number) > 0 ? <MoneyDisplay value={line.credit as number} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

// ============ Tab 12: Equipment Profitability ============
function EquipmentProfitabilityTab() {
  const { lang } = useAppStore()
  const [selectedEquipment, setSelectedEquipment] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: equipmentList } = useQuery({
    queryKey: ['equipment-list'],
    queryFn: async () => { const res = await fetch('/api/equipment'); if (!res.ok) throw new Error(); return res.json() },
  })

  const equipList = (Array.isArray(equipmentList) ? equipmentList : (equipmentList?.equipment || [])) as { id: string; name: string; code: string }[]

  const { data: statementData, isLoading, refetch } = useQuery({
    queryKey: ['account-statement', 'equipment', selectedEquipment, dateFrom, dateTo],
    queryFn: async () => {
      if (!selectedEquipment) return null
      const params = new URLSearchParams({ entityType: 'equipment', entityId: selectedEquipment })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/account-statement?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedEquipment,
  })

  const statement = statementData as Record<string, unknown> | null
  const summary = (statement?.summary as Record<string, number>) || {}

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">{t('المعدة', 'Equipment', lang)}</Label>
              <Select value={selectedEquipment} onValueChange={setSelectedEquipment}>
                <SelectTrigger className="h-9"><SelectValue placeholder={t('اختر المعدة...', 'Select equipment...', lang)} /></SelectTrigger>
                <SelectContent>
                  {equipList.map(e => <SelectItem key={e.id} value={e.id}>{e.code} - {e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">{t('من', 'From', lang)}</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">{t('إلى', 'To', lang)}</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
            {selectedEquipment && <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1"><RefreshCw className="size-3.5" />{t('عرض', 'View', lang)}</Button>}
          </div>
        </CardContent>
      </Card>

      {!selectedEquipment ? (
        <div className="flex flex-col items-center gap-3 py-10"><Truck className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('اختر معدة لعرض ربحيتها', 'Select equipment to view profitability', lang)}</p></div>
      ) : isLoading ? <TableSkeleton /> : statement ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard title={t('إيرادات التأجير', 'Rental Revenue', lang)} value={summary.totalRevenues || 0} icon={TrendingUp} color="emerald" lang={lang} />
            <SummaryCard title={t('تكاليف التشغيل', 'Operating Costs', lang)} value={summary.totalCosts || 0} icon={Wrench} color="rose" lang={lang} />
            <SummaryCard title={t('صافي الربح', 'Net Profit', lang)} value={summary.profit || 0} icon={CircleDollarSign} color={(summary.profit || 0) >= 0 ? 'emerald' : 'rose'} lang={lang} />
            <Card className="bg-cyan-50 border-cyan-200 border">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1"><BarChart3 className="size-4 text-cyan-600" /><p className="text-xs font-medium text-cyan-600">{t('هامش الربح', 'Profit Margin', lang)}</p></div>
                <p className="text-lg font-bold text-cyan-700">{(summary.profitMargin || 0).toFixed(1)}%</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                      <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                      <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((statement.lines as Record<string, unknown>[]) || []).map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{formatDate(String(line.date || ''), lang)}</TableCell>
                        <TableCell>{String(line.description || '')}</TableCell>
                        <TableCell>{(line.debit as number) > 0 ? <MoneyDisplay value={line.debit as number} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                        <TableCell>{(line.credit as number) > 0 ? <MoneyDisplay value={line.credit as number} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

// ============ Tab 13: Period Closing ============
function PeriodClosingTab() {
  const { lang } = useAppStore()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['period-closing'],
    queryFn: async () => { const res = await fetch('/api/period-closing'); if (!res.ok) throw new Error(); return res.json() },
  })
  const queryClient = useQueryClient()

  const closePeriod = useMutation({
    mutationFn: async (params: { year: number; month: number; type: string }) => {
      const res = await fetch('/api/period-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', ...params }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['period-closing'] }),
  })

  const report = data as Record<string, unknown> | undefined
  const closings = (report?.closings as Record<string, unknown>[]) || []
  const year = new Date().getFullYear()

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const monthNames = lang === 'ar'
    ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div className="space-y-4">
      <SectionTitle icon={CalendarCheck} title={{ ar: `إقفال الفترات المالية - ${year}`, en: `Period Closing - ${year}` }} lang={lang} />

      {isLoading ? <TableSkeleton /> : (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {months.map(month => {
                const closing = closings.find(c => (c.year === year || c.year === String(year)) && (c.month === month || c.month === String(month)))
                const isClosed = closing?.status === 'CLOSED'
                return (
                  <Card key={month} className={`${isClosed ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'} border cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => {
                      if (!isClosed && confirm(t(`هل تريد إقفال شهر ${monthNames[month - 1]}؟`, `Close ${monthNames[month - 1]}?`, lang))) {
                        closePeriod.mutate({ year, month, type: 'MONTHLY' })
                      }
                    }}>
                    <CardContent className="p-3 text-center">
                      <p className="text-xs font-medium">{monthNames[month - 1]}</p>
                      <p className={`text-sm font-bold ${isClosed ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {isClosed ? t('مقفل', 'Closed', lang) : t('مفتوح', 'Open', lang)}
                      </p>
                      {isClosed && <Lock className="size-3 text-rose-400 mx-auto mt-1" />}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {closings.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold mb-2">{t('سجل الإقفالات', 'Closing History', lang)}</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('السنة', 'Year', lang)}</TableHead>
                  <TableHead className="text-right">{t('الشهر', 'Month', lang)}</TableHead>
                  <TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead>
                  <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                  <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closings.map((c, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{String(c.year)}</TableCell>
                    <TableCell>{c.month ? monthNames[(Number(c.month) - 1)] : t('سنوي', 'Yearly', lang)}</TableCell>
                    <TableCell>{String(c.type)}</TableCell>
                    <TableCell><Badge className={c.status === 'CLOSED' ? 'bg-rose-100 text-rose-700 border-0' : 'bg-emerald-100 text-emerald-700 border-0'}>{String(c.status)}</Badge></TableCell>
                    <TableCell>{c.closedAt ? formatDate(String(c.closedAt), lang) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Tab 14: Fixed Assets ============
function FixedAssetsTab() {
  const { lang } = useAppStore()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['fixed-assets'],
    queryFn: async () => { const res = await fetch('/api/fixed-assets'); if (!res.ok) throw new Error(); return res.json() },
  })

  const assets = (Array.isArray(data) ? data : (data?.assets || [])) as Record<string, unknown>[]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard title={t('عدد الأصول', 'Total Assets', lang)} value={assets.length} icon={Wrench} color="teal" lang={lang} isMoney={false} />
        <SummaryCard title={t('إجمالي التكلفة', 'Total Cost', lang)} value={assets.reduce((s, a) => s + ((a.acquisitionCost as number) || 0), 0)} icon={Wallet} color="sky" lang={lang} />
        <SummaryCard title={t('إجمالي الإهلاك', 'Total Depreciation', lang)} value={assets.reduce((s, a) => s + ((a.accumulatedDepreciation as number) || 0), 0)} icon={ArrowUpDown} color="orange" lang={lang} />
        <SummaryCard title={t('صافي القيمة الدفترية', 'Net Book Value', lang)} value={assets.reduce((s, a) => s + ((a.netBookValue as number) || 0), 0)} icon={CircleDollarSign} color="emerald" lang={lang} />
      </div>

      {isLoading ? <TableSkeleton /> : assets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10"><Wrench className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد أصول ثابتة', 'No fixed assets found', lang)}</p></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('الاسم', 'Name', lang)}</TableHead>
                    <TableHead className="text-right">{t('الفئة', 'Category', lang)}</TableHead>
                    <TableHead className="text-right">{t('تكلفة الاقتناء', 'Acquisition Cost', lang)}</TableHead>
                    <TableHead className="text-right">{t('مجمع الإهلاك', 'Accum. Dep.', lang)}</TableHead>
                    <TableHead className="text-right">{t('صافي القيمة', 'Net Value', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono">{String(asset.assetCode || '')}</TableCell>
                      <TableCell className="font-medium">{String(asset.nameAr || asset.name || '')}</TableCell>
                      <TableCell>{String(asset.category || '')}</TableCell>
                      <TableCell><MoneyDisplay value={(asset.acquisitionCost as number) || 0} lang={lang} size="sm" /></TableCell>
                      <TableCell><MoneyDisplay value={(asset.accumulatedDepreciation as number) || 0} lang={lang} size="sm" className="text-orange-700" /></TableCell>
                      <TableCell><MoneyDisplay value={(asset.netBookValue as number) || 0} lang={lang} size="sm" className="text-emerald-700" bold /></TableCell>
                      <TableCell><Badge className={asset.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-700 border-0'}>{String(asset.status)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Tab 15: Provisions ============
function ProvisionsTab() {
  const { lang } = useAppStore()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['provisions'],
    queryFn: async () => { const res = await fetch('/api/provisions'); if (!res.ok) throw new Error(); return res.json() },
  })

  const provisions = (Array.isArray(data) ? data : (data?.provisions || [])) as Record<string, unknown>[]

  const provisionTypeLabels: Record<string, { ar: string; en: string }> = {
    END_OF_SERVICE: { ar: 'نهاية خدمة', en: 'End of Service' },
    WARRANTY: { ar: 'ضمان', en: 'Warranty' },
    MAINTENANCE: { ar: 'صيانة', en: 'Maintenance' },
    LEGAL: { ar: 'قانوني', en: 'Legal' },
    OTHER: { ar: 'أخرى', en: 'Other' },
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard title={t('عدد المخصصات', 'Total Provisions', lang)} value={provisions.length} icon={Shield} color="purple" lang={lang} isMoney={false} />
        <SummaryCard title={t('إجمالي المخصصات', 'Total Amount', lang)} value={provisions.reduce((s, p) => s + ((p.totalAmount as number) || 0), 0)} icon={Wallet} color="sky" lang={lang} />
        <SummaryCard title={t('المتبقي', 'Remaining', lang)} value={provisions.reduce((s, p) => s + ((p.remainingAmount as number) || 0), 0)} icon={CircleDollarSign} color="emerald" lang={lang} />
      </div>

      {isLoading ? <TableSkeleton /> : provisions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10"><Shield className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد مخصصات', 'No provisions found', lang)}</p></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('الاسم', 'Name', lang)}</TableHead>
                    <TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                    <TableHead className="text-right">{t('المستخدم', 'Used', lang)}</TableHead>
                    <TableHead className="text-right">{t('المتبقي', 'Remaining', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {provisions.map((prov, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono">{String(prov.code || '')}</TableCell>
                      <TableCell className="font-medium">{String(prov.nameAr || prov.name || '')}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{provisionTypeLabels[String(prov.type || '')]?.[lang] || String(prov.type || '')}</Badge></TableCell>
                      <TableCell><MoneyDisplay value={(prov.totalAmount as number) || 0} lang={lang} size="sm" /></TableCell>
                      <TableCell><MoneyDisplay value={(prov.usedAmount as number) || 0} lang={lang} size="sm" className="text-orange-700" /></TableCell>
                      <TableCell><MoneyDisplay value={(prov.remainingAmount as number) || 0} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                      <TableCell><Badge className={prov.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-700 border-0'}>{String(prov.status)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Tab 16: Bank Reconciliation ============
function BankReconciliationTab() {
  const { lang } = useAppStore()
  const { data: banksData, isLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => { const res = await fetch('/api/bank-accounts'); if (!res.ok) throw new Error(); return res.json() },
  })

  const banks = (Array.isArray(banksData) ? banksData : (banksData?.bankAccounts || [])) as Record<string, unknown>[]

  return (
    <div className="space-y-4">
      <SectionTitle icon={Landmark} title={{ ar: 'التسويات البنكية', en: 'Bank Reconciliation' }} lang={lang} />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard title={t('عدد الحسابات البنكية', 'Bank Accounts', lang)} value={banks.length} icon={Landmark} color="teal" lang={lang} isMoney={false} />
        <SummaryCard title={t('إجمالي الأرصدة', 'Total Balance', lang)} value={banks.reduce((s, b) => s + ((b.balance as number) || 0), 0)} icon={Wallet} color="emerald" lang={lang} />
      </div>

      {isLoading ? <TableSkeleton /> : banks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10"><Landmark className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد حسابات بنكية', 'No bank accounts found', lang)}</p></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('البنك', 'Bank', lang)}</TableHead>
                    <TableHead className="text-right">{t('اسم الحساب', 'Account Name', lang)}</TableHead>
                    <TableHead className="text-right">{t('رقم الحساب', 'Account No.', lang)}</TableHead>
                    <TableHead className="text-right">{t('العملة', 'Currency', lang)}</TableHead>
                    <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banks.map((bank, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{String(bank.bankName || '')}</TableCell>
                      <TableCell>{String(bank.accountName || '')}</TableCell>
                      <TableCell className="font-mono">{String(bank.accountNumber || '')}</TableCell>
                      <TableCell>{String(bank.currency || 'SAR')}</TableCell>
                      <TableCell><MoneyDisplay value={(bank.balance as number) || 0} lang={lang} size="sm" className="text-emerald-700" bold /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Main Accounting Module ============
export function AccountingModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('chart-of-accounts')

  const { data: accountsData, isLoading: loadingAccounts, refetch: refetchAccounts } = useQuery<{
    accounts: Account[]; tree: unknown[]; total: number
  }>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const accounts = accountsData?.accounts || []

  const { data: entries = [], isLoading: loadingEntries, isError: entriesError, refetch: refetchEntries } = useQuery<JournalEntry[]>({
    queryKey: ['journal-entries'],
    queryFn: async () => {
      const res = await fetch('/api/journal-entries')
      if (!res.ok) throw new Error()
      const data = await res.json()
      return Array.isArray(data) ? data : (data.entries || [])
    },
  })

  const initMutation = useMutation({
    mutationFn: () => fetch('/api/accounts/initialize', { method: 'POST' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }) },
  })

  const reInitMutation = useMutation({
    mutationFn: () => fetch('/api/accounts/initialize', { method: 'POST' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }) },
  })

  const isInitializing = initMutation.isPending || reInitMutation.isPending

  const tabConfig = [
    { value: 'chart-of-accounts', label: { ar: 'دليل الحسابات', en: 'Chart of Accounts' }, icon: TreePine, group: 'basic' },
    { value: 'journal-entries', label: { ar: 'القيود اليومية', en: 'Journal Entries' }, icon: FileText, group: 'basic' },
    { value: 'general-ledger', label: { ar: 'الأستاذ العام', en: 'General Ledger' }, icon: BookOpen, group: 'basic' },
    { value: 'trial-balance', label: { ar: 'ميزان المراجعة', en: 'Trial Balance' }, icon: Scale, group: 'basic' },
    { value: 'income-statement', label: { ar: 'قائمة الدخل', en: 'Income Statement' }, icon: TrendingUp, group: 'reports' },
    { value: 'balance-sheet', label: { ar: 'الميزانية العمومية', en: 'Balance Sheet' }, icon: Scale, group: 'reports' },
    { value: 'cash-flow', label: { ar: 'التدفقات النقدية', en: 'Cash Flow' }, icon: Landmark, group: 'reports' },
    { value: 'cost-centers', label: { ar: 'مراكز التكلفة', en: 'Cost Centers' }, icon: FolderClosed, group: 'analysis' },
    { value: 'customer-statement', label: { ar: 'كشف العملاء', en: 'Customer Statement' }, icon: Users, group: 'analysis' },
    { value: 'vendor-statement', label: { ar: 'كشف الموردين', en: 'Vendor Statement' }, icon: Package, group: 'analysis' },
    { value: 'project-profitability', label: { ar: 'ربحية المشاريع', en: 'Project P&L' }, icon: Building2, group: 'profitability' },
    { value: 'equipment-profitability', label: { ar: 'ربحية المعدات', en: 'Equipment P&L' }, icon: Truck, group: 'profitability' },
    { value: 'period-closing', label: { ar: 'إقفال الفترات', en: 'Period Closing' }, icon: CalendarCheck, group: 'management' },
    { value: 'fixed-assets', label: { ar: 'الأصول الثابتة', en: 'Fixed Assets' }, icon: Wrench, group: 'management' },
    { value: 'provisions', label: { ar: 'المخصصات', en: 'Provisions' }, icon: Shield, group: 'management' },
    { value: 'bank-reconciliation', label: { ar: 'التسويات البنكية', en: 'Bank Reconciliation' }, icon: Landmark, group: 'management' },
  ]

  return (
    <ModuleLayout
      title={{ ar: 'المحاسبة', en: 'Accounting' }}
      subtitle={{ ar: 'المحرك المحاسبي المتكامل — القيود والتقارير المالية والتحليل', en: 'Complete Accounting Engine — Entries, Financial Reports & Analysis' }}
      actions={
        <div className="flex gap-2">
          <PrintButton title={t('المحاسبة', 'Accounting', lang)} />
          <Button variant="outline" size="icon" onClick={() => { refetchAccounts(); refetchEntries() }}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
          <TabsList className="flex w-max min-w-full">
            {tabConfig.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1 text-xs whitespace-nowrap px-3">
                <tab.icon className="size-3.5" />
                {tab.label[lang]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="chart-of-accounts">
          <ChartOfAccountsTab accounts={accounts} isLoading={loadingAccounts} onInitialize={() => initMutation.mutate()} onReInitialize={() => reInitMutation.mutate()} isInitializing={isInitializing} />
        </TabsContent>

        <TabsContent value="journal-entries">
          <JournalEntriesTab entries={entries} isLoading={loadingEntries} isError={entriesError} refetch={refetchEntries} />
        </TabsContent>

        <TabsContent value="general-ledger">
          <GeneralLedgerTab accounts={accounts} />
        </TabsContent>

        <TabsContent value="trial-balance">
          <TrialBalanceTab />
        </TabsContent>

        <TabsContent value="income-statement">
          <IncomeStatementTab />
        </TabsContent>

        <TabsContent value="balance-sheet">
          <BalanceSheetTab />
        </TabsContent>

        <TabsContent value="cash-flow">
          <CashFlowTab />
        </TabsContent>

        <TabsContent value="cost-centers">
          <CostCentersTab />
        </TabsContent>

        <TabsContent value="customer-statement">
          <CustomerStatementTab />
        </TabsContent>

        <TabsContent value="vendor-statement">
          <VendorStatementTab />
        </TabsContent>

        <TabsContent value="project-profitability">
          <ProjectProfitabilityTab />
        </TabsContent>

        <TabsContent value="equipment-profitability">
          <EquipmentProfitabilityTab />
        </TabsContent>

        <TabsContent value="period-closing">
          <PeriodClosingTab />
        </TabsContent>

        <TabsContent value="fixed-assets">
          <FixedAssetsTab />
        </TabsContent>

        <TabsContent value="provisions">
          <ProvisionsTab />
        </TabsContent>

        <TabsContent value="bank-reconciliation">
          <BankReconciliationTab />
        </TabsContent>
      </Tabs>
    </ModuleLayout>
  )
}

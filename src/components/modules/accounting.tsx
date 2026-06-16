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
  Printer, Download, Search, Link2, Pencil, FileSearch, ArrowRightLeft,
  Settings, List, Heart, Activity, Zap, ChevronUp, Trash2,
  XCircle, AlertCircle, InfoIcon, ShieldCheck, Stethoscope,
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
  DialogDescription, DialogFooter,
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
  entryCount: number
  lastTransactionDate: string | null
  childrenCount: number
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

interface RoleMappingItem {
  role: string
  labelAr: string
  labelEn: string
  description: string
  defaultCodes: string[]
  accounts: { id: string; code: string; name: string; nameAr: string | null }[]
  primaryAccount: { id: string; code: string; name: string; nameAr: string | null } | null
}

interface AccountStatementData {
  account: { id: string; code: string; name: string; nameAr: string | null; type: string; accountRole: string | null; roleLabel: string | null }
  dateFrom: string | null
  dateTo: string | null
  openingBalance: number
  lines: { date: string; entryNo: string; description: string; debit: number; credit: number; balance: number }[]
  totalDebit: number
  totalCredit: number
  closingBalance: number
}

// New types for financial mapping engine
interface FinancialMappingItem {
  id: string
  operationType: string
  labelAr: string
  labelEn: string
  description: string
  debitRoles: string[]
  creditRoles: string[]
}

interface RoleOverviewItem {
  role: string
  labelAr: string
  labelEn: string
  description: string
  defaultCodes: string[]
  isMapped: boolean
  totalAccounts: number
  activeAccounts: number
  postingAccounts: number
  childAccounts: number
  accounts: { id: string; code: string; nameAr: string | null; name: string; isActive: boolean; allowPosting: boolean; parentCode: string | null }[]
  childAccountList: { id: string; code: string; nameAr: string | null; name: string; parentCode: string | null }[]
  operations: { operationType: string; labelAr: string; labelEn: string; side: 'debit' | 'credit' | 'both' }[]
}

interface AccountImpactSummaryItem {
  id: string
  code: string
  name: string
  type: string
  accountRole: string | null
  roleLabel: string | null
  parentCode: string | null
  allowPosting: boolean
  level: number
  childCount: number
  journalLineCount: number
  hasUsage: boolean
}

interface AccountImpactDetail {
  account: {
    id: string; code: string; name: string; nameAr: string | null
    type: string; accountRole: string | null; parentCode: string | null
    isActive: boolean; allowPosting: boolean; level: number
  }
  parentAccount: { id: string; code: string; name: string; nameAr: string | null } | null
  childAccounts: { id: string; code: string; name: string; nameAr: string | null; isActive: boolean }[]
  role: { role: string; labelAr: string; labelEn: string } | null
  operations: { operationType: string; labelAr: string; labelEn: string; side: 'debit' | 'credit' | 'both' }[]
  usageStats: {
    journalLineCount: number
    totalDebit: number
    totalCredit: number
    netBalance: number
    lastUsedDate: string | null
  }
  documentReferences: { type: string; labelAr: string; count: number }[]
  canDeactivate: boolean
  deactivationBlockers: string[]
}

interface HealthCheckResult {
  checkId: string
  checkNameAr: string
  checkNameEn: string
  severity: 'error' | 'warning' | 'info'
  passed: boolean
  messageAr: string
  messageEn: string
  details?: unknown
}

interface HealthCheckReport {
  overallScore: number
  totalChecks: number
  passedChecks: number
  warnings: number
  errors: number
  checks: HealthCheckResult[]
  checkedAt: string
}

interface HealthSummary {
  score: number
  status: 'healthy' | 'warning' | 'critical'
  errors: number
  warnings: number
  lastChecked: string
}

interface HealthHistoryItem {
  id: string
  checkDate: string
  overallScore: number
  totalChecks: number
  passedChecks: number
  warnings: number
  errors: number
}

// ============ Helpers ============
function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

// ============ Type Config ============
const typeConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  ASSET: { label: { ar: 'أصول', en: 'Asset' }, color: 'text-blue-600', bg: 'bg-blue-50' },
  LIABILITY: { label: { ar: 'التزامات', en: 'Liability' }, color: 'text-amber-600', bg: 'bg-amber-50' },
  EQUITY: { label: { ar: 'حقوق ملكية', en: 'Equity' }, color: 'text-purple-600', bg: 'bg-purple-50' },
  REVENUE: { label: { ar: 'إيرادات', en: 'Revenue' }, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  EXPENSE: { label: { ar: 'مصروفات', en: 'Expense' }, color: 'text-red-600', bg: 'bg-red-50' },
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

// ============ Account Statement Dialog ============
function AccountStatementDialog({ account, open, onClose }: {
  account: Account | null; open: boolean; onClose: () => void
}) {
  const { lang } = useAppStore()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: statementData, isLoading, isError, refetch } = useQuery<AccountStatementData | null>({
    queryKey: ['account-statement-detail', account?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!account) return null
      const params = new URLSearchParams({ accountId: account.id })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/accounts/statement?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!account && open,
  })

  React.useEffect(() => {
    if (account) { setDateFrom(''); setDateTo('') }
  }, [account?.id])

  if (!account) return null
  const statement = statementData as AccountStatementData | null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="size-5 text-emerald-600" />
            <span>{t('كشف حساب', 'Account Statement', lang)}</span>
            <span className="font-mono">{account.code}</span>
            <span>-</span>
            <span>{lang === 'ar' && account.nameAr ? account.nameAr : account.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 flex-1 overflow-hidden">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1">
              <RefreshCw className="size-3.5" />{t('تحديث', 'Refresh', lang)}
            </Button>
          </div>
          {isLoading ? <TableSkeleton /> : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p>
              <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
            </div>
          ) : statement ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-sky-50 border-sky-200"><CardContent className="p-3 text-center"><p className="text-xs text-sky-600">{t('الرصيد الافتتاحي', 'Opening Balance', lang)}</p><MoneyDisplay value={statement.openingBalance} lang={lang} bold className={statement.openingBalance >= 0 ? 'text-sky-700' : 'text-rose-700'} /></CardContent></Card>
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('إجمالي مدين', 'Total Debit', lang)}</p><MoneyDisplay value={statement.totalDebit} lang={lang} bold className="text-emerald-700" /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('إجمالي دائن', 'Total Credit', lang)}</p><MoneyDisplay value={statement.totalCredit} lang={lang} bold className="text-rose-700" /></CardContent></Card>
                <Card className="bg-purple-50 border-purple-200"><CardContent className="p-3 text-center"><p className="text-xs text-purple-600">{t('الرصيد الختامي', 'Closing Balance', lang)}</p><MoneyDisplay value={statement.closingBalance} lang={lang} bold className={statement.closingBalance >= 0 ? 'text-purple-700' : 'text-rose-700'} /></CardContent></Card>
              </div>
              <Card className="flex-1 overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                          <TableHead className="text-right">{t('رقم القيد', 'Entry No', lang)}</TableHead>
                          <TableHead className="text-right">{t('البيان', 'Description', lang)}</TableHead>
                          <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                          <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                          <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {statement.lines.length === 0 ? (
                          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t('لا توجد حركات', 'No transactions found', lang)}</TableCell></TableRow>
                        ) : statement.lines.map((line, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{formatDate(line.date, lang)}</TableCell>
                            <TableCell className="font-mono">{line.entryNo}</TableCell>
                            <TableCell>{line.description || '—'}</TableCell>
                            <TableCell>{line.debit > 0 ? <MoneyDisplay value={line.debit} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                            <TableCell>{line.credit > 0 ? <MoneyDisplay value={line.credit} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                            <TableCell className="font-semibold"><MoneyDisplay value={line.balance} lang={lang} size="sm" bold className={line.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></TableCell>
                          </TableRow>
                        ))}
                        {statement.lines.length > 0 && (
                          <TableRow className="bg-gray-100 font-bold border-t-2 border-gray-300">
                            <TableCell colSpan={3}>{t('الإجمالي', 'Total', lang)}</TableCell>
                            <TableCell><MoneyDisplay value={statement.totalDebit} lang={lang} size="sm" bold className="text-emerald-800" /></TableCell>
                            <TableCell><MoneyDisplay value={statement.totalCredit} lang={lang} size="sm" bold className="text-rose-800" /></TableCell>
                            <TableCell><MoneyDisplay value={statement.closingBalance} lang={lang} size="sm" bold className={statement.closingBalance >= 0 ? 'text-emerald-800' : 'text-rose-800'} /></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============ Account Transactions Dialog ============
interface AccountTransactionEntry {
  id: string; entryNo: string; date: string; description: string | null
  status: string; sourceType: string | null; debit: number; credit: number
}

function AccountTransactionsDialog({ account, open, onClose }: {
  account: Account | null; open: boolean; onClose: () => void
}) {
  const { lang } = useAppStore()

  const { data, isLoading, isError, refetch } = useQuery<{
    account: { id: string; code: string; name: string; nameAr: string | null; type: string }
    entries: AccountTransactionEntry[]
    totalLines: number
  } | null>({
    queryKey: ['account-transactions', account?.id],
    queryFn: async () => {
      if (!account) return null
      const res = await fetch(`/api/journal-entries/by-account?accountId=${account.id}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!account && open,
  })

  if (!account) return null
  const entries = data?.entries || []
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <List className="size-5 text-emerald-600" />
            <span>{t('حركات الحساب', 'Account Transactions', lang)}</span>
            <span className="font-mono">{account.code}</span>
            <span>-</span>
            <span>{lang === 'ar' && account.nameAr ? account.nameAr : account.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 flex-1 overflow-hidden">
          {isLoading ? <TableSkeleton /> : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p>
              <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('إجمالي مدين', 'Total Debit', lang)}</p><MoneyDisplay value={totalDebit} lang={lang} bold className="text-emerald-700" /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('إجمالي دائن', 'Total Credit', lang)}</p><MoneyDisplay value={totalCredit} lang={lang} bold className="text-rose-700" /></CardContent></Card>
                <Card className="bg-sky-50 border-sky-200"><CardContent className="p-3 text-center"><p className="text-xs text-sky-600">{t('عدد القيود', 'Entry Count', lang)}</p><p className="text-lg font-bold text-sky-700">{formatNumber(entries.length)}</p></CardContent></Card>
                <Card className="bg-purple-50 border-purple-200"><CardContent className="p-3 text-center"><p className="text-xs text-purple-600">{t('عدد البنود', 'Line Count', lang)}</p><p className="text-lg font-bold text-purple-700">{formatNumber(data?.totalLines || 0)}</p></CardContent></Card>
              </div>
              <Card className="flex-1 overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">{t('رقم القيد', 'Entry No', lang)}</TableHead>
                          <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                          <TableHead className="text-right">{t('البيان', 'Description', lang)}</TableHead>
                          <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                          <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                          <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.length === 0 ? (
                          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t('لا توجد حركات', 'No transactions found', lang)}</TableCell></TableRow>
                        ) : entries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-mono">{entry.entryNo}</TableCell>
                            <TableCell>{formatDate(entry.date, lang)}</TableCell>
                            <TableCell>{entry.description || '—'}</TableCell>
                            <TableCell>{entry.debit > 0 ? <MoneyDisplay value={entry.debit} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                            <TableCell>{entry.credit > 0 ? <MoneyDisplay value={entry.credit} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                            <TableCell><JEStatusBadge status={entry.status} lang={lang} /></TableCell>
                          </TableRow>
                        ))}
                        {entries.length > 0 && (
                          <TableRow className="bg-gray-100 font-bold border-t-2 border-gray-300">
                            <TableCell colSpan={3}>{t('الإجمالي', 'Total', lang)}</TableCell>
                            <TableCell><MoneyDisplay value={totalDebit} lang={lang} size="sm" bold className="text-emerald-800" /></TableCell>
                            <TableCell><MoneyDisplay value={totalCredit} lang={lang} size="sm" bold className="text-rose-800" /></TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============ Journal Entry Detail ============
function JournalEntryDetail({ entry, onBack, accounts }: { entry: JournalEntry; onBack: () => void; accounts: Account[] }) {
  const { lang } = useAppStore()
  const [detailTab, setDetailTab] = useState('lines')

  const accountImpactData = useMemo(() => {
    const uniqueAccounts = new Map<string, { code: string; name: string; nameAr: string | null; totalDebit: number; totalCredit: number }>()
    for (const line of entry.lines) {
      const existing = uniqueAccounts.get(line.accountId)
      if (existing) { existing.totalDebit += line.debit; existing.totalCredit += line.credit }
      else { uniqueAccounts.set(line.accountId, { code: line.account.code, name: line.account.name, nameAr: line.account.nameAr, totalDebit: line.debit, totalCredit: line.credit }) }
    }

    const impactItems: { accountId: string; code: string; name: string; nameAr: string | null; totalDebit: number; totalCredit: number; beforeBalance: number; afterBalance: number }[] = []
    for (const [accountId, info] of uniqueAccounts) {
      const acct = accounts.find(a => a.id === accountId)
      const currentBalance = acct?.balance || 0
      const beforeBalance = currentBalance - (info.totalDebit - info.totalCredit)
      impactItems.push({ accountId, ...info, beforeBalance, afterBalance: currentBalance })
    }
    return impactItems
  }, [entry, accounts])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1">
          <ChevronLeft className="size-4" />{t('رجوع', 'Back', lang)}
        </Button>
        <div className="flex-1">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            <span className="font-mono">{entry.entryNo}</span>
            <span>-</span>
            <span>{entry.description || t('قيد يومية', 'Journal Entry', lang)}</span>
          </h3>
        </div>
        <JEStatusBadge status={entry.status} lang={lang} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-sky-50 border-sky-200"><CardContent className="p-3 text-center"><p className="text-xs text-sky-600">{t('التاريخ', 'Date', lang)}</p><p className="text-sm font-bold text-sky-700">{formatDate(entry.date, lang)}</p></CardContent></Card>
        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('مدين', 'Debit', lang)}</p><MoneyDisplay value={entry.totalDebit} lang={lang} bold className="text-emerald-700" /></CardContent></Card>
        <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('دائن', 'Credit', lang)}</p><MoneyDisplay value={entry.totalCredit} lang={lang} bold className="text-rose-700" /></CardContent></Card>
        <Card className="bg-purple-50 border-purple-200"><CardContent className="p-3 text-center"><p className="text-xs text-purple-600">{t('المصدر', 'Source', lang)}</p><p className="text-sm font-bold text-purple-700">{entry.sourceType ? (sourceTypeLabels[entry.sourceType]?.[lang] || entry.sourceType) : t('يدوي', 'Manual', lang)}</p></CardContent></Card>
      </div>

      <Tabs value={detailTab} onValueChange={setDetailTab}>
        <TabsList>
          <TabsTrigger value="lines" className="gap-1"><BookOpen className="size-3.5" />{t('البنود', 'Lines', lang)}</TabsTrigger>
          <TabsTrigger value="impact" className="gap-1"><ArrowRightLeft className="size-3.5" />{t('أثر الحسابات', 'Account Impact', lang)}</TabsTrigger>
        </TabsList>
        <TabsContent value="lines">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('كود الحساب', 'Account Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('اسم الحساب', 'Account Name', lang)}</TableHead>
                    <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                    <TableHead className="text-right">{t('البيان', 'Description', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entry.lines.map(line => (
                    <TableRow key={line.id}>
                      <TableCell className="font-mono">{line.account.code}</TableCell>
                      <TableCell>{lang === 'ar' && line.account.nameAr ? line.account.nameAr : line.account.name}</TableCell>
                      <TableCell>{line.debit > 0 ? <MoneyDisplay value={line.debit} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                      <TableCell>{line.credit > 0 ? <MoneyDisplay value={line.credit} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                      <TableCell>{line.description || '—'}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-100 font-bold border-t-2 border-gray-300">
                    <TableCell colSpan={2}>{t('الإجمالي', 'Total', lang)}</TableCell>
                    <TableCell><MoneyDisplay value={entry.totalDebit} lang={lang} size="sm" bold className="text-emerald-800" /></TableCell>
                    <TableCell><MoneyDisplay value={entry.totalCredit} lang={lang} size="sm" bold className="text-rose-800" /></TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="impact">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('كود الحساب', 'Account Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('اسم الحساب', 'Account Name', lang)}</TableHead>
                    <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                    <TableHead className="text-right">{t('الرصيد قبل', 'Before', lang)}</TableHead>
                    <TableHead className="text-right">{t('الرصيد بعد', 'After', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountImpactData.map(item => (
                    <TableRow key={item.accountId}>
                      <TableCell className="font-mono">{item.code}</TableCell>
                      <TableCell>{lang === 'ar' && item.nameAr ? item.nameAr : item.name}</TableCell>
                      <TableCell>{item.totalDebit > 0 ? <MoneyDisplay value={item.totalDebit} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                      <TableCell>{item.totalCredit > 0 ? <MoneyDisplay value={item.totalCredit} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                      <TableCell><MoneyDisplay value={item.beforeBalance} lang={lang} size="sm" className={item.beforeBalance >= 0 ? 'text-gray-700' : 'text-rose-700'} /></TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={item.afterBalance} lang={lang} size="sm" bold className={item.afterBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============ Tab 1: Chart of Accounts ============
function ChartOfAccountsTab({ accounts, isLoading, onInitialize, onReInitialize, isInitializing, onViewLedger }: {
  accounts: Account[]; isLoading: boolean; onInitialize: () => void; onReInitialize: () => void; isInitializing: boolean
  onViewLedger: (accountCode: string) => void
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
  const [statementAccount, setStatementAccount] = useState<Account | null>(null)
  const [statementOpen, setStatementOpen] = useState(false)
  const [transactionsAccount, setTransactionsAccount] = useState<Account | null>(null)
  const [transactionsOpen, setTransactionsOpen] = useState(false)

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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {Object.entries(typeSummary).map(([type, count]) => {
          const cfg = typeConfig[type]
          if (!cfg) return null
          return <Card key={type} className={`${cfg.bg} border-0`}><CardContent className="p-3 text-center"><p className={`text-xs ${cfg.color}`}>{cfg.label[lang]}</p><p className={`text-lg font-bold ${cfg.color}`}>{count}</p></CardContent></Card>
        })}
      </div>

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
                  <TableHead className="text-right min-w-[200px]">{t('الإجراءات', 'Actions', lang)}</TableHead>
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
                      <TableCell className="text-center">{formatNumber(a.entryCount)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); setStatementAccount(a); setStatementOpen(true) }}>
                            <FileSearch className="size-3.5" />{t('كشف', 'Stmt', lang)}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-sky-700 hover:text-sky-800 hover:bg-sky-50" onClick={(e) => { e.stopPropagation(); onViewLedger(a.code) }}>
                            <BookOpen className="size-3.5" />{t('أستاذ', 'Ledger', lang)}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-purple-700 hover:text-purple-800 hover:bg-purple-50" onClick={(e) => { e.stopPropagation(); setTransactionsAccount(a); setTransactionsOpen(true) }}>
                            <List className="size-3.5" />{t('حركات', 'Txns', lang)}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AccountDetailDialog account={selectedAccount} open={detailOpen} onClose={() => setDetailOpen(false)} />
      <AccountStatementDialog account={statementAccount} open={statementOpen} onClose={() => setStatementOpen(false)} />
      <AccountTransactionsDialog account={transactionsAccount} open={transactionsOpen} onClose={() => setTransactionsOpen(false)} />
    </div>
  )
}

// ============ Tab 2: Role Mapping (ربط الحسابات بالنظام) ============
const roleCategories = [
  { key: 'current-assets', labelAr: 'أصول متداولة', labelEn: 'Current Assets', roles: ['CASH', 'BANK', 'CUSTOMER_AR', 'RETENTION_RECEIVABLE', 'EMPLOYEE_ADVANCE'] },
  { key: 'fixed-assets', labelAr: 'أصول ثابتة', labelEn: 'Fixed Assets', roles: ['FIXED_ASSET', 'ACCUM_DEPRECIATION'] },
  { key: 'vat', labelAr: 'ضرائب', labelEn: 'VAT/Tax', roles: ['VAT_INPUT', 'VAT_OUTPUT', 'VAT_DUE'] },
  { key: 'liabilities', labelAr: 'خصوم', labelEn: 'Liabilities', roles: ['SUPPLIER_AP', 'SUBCONTRACTOR_AP', 'SALARIES_PAYABLE', 'GOSI_PAYABLE', 'ZAKAT_PAYABLE', 'CUSTOMER_ADVANCE', 'EOS_PROVISION'] },
  { key: 'revenue', labelAr: 'إيرادات', labelEn: 'Revenue', roles: ['RENTAL_REVENUE', 'PROJECT_REVENUE', 'SERVICE_REVENUE'] },
  { key: 'direct-costs', labelAr: 'تكاليف مباشرة', labelEn: 'Direct Costs', roles: ['PROJECT_COST', 'SUBCONTRACTOR_COST', 'FUEL_EXPENSE', 'MAINTENANCE_EXPENSE', 'DRIVER_EXPENSE', 'TRANSPORT_EXPENSE', 'RENTAL_DEPRECIATION'] },
  { key: 'admin-expenses', labelAr: 'مصروفات إدارية', labelEn: 'Admin Expenses', roles: ['PAYROLL_EXPENSE', 'GOSI_EXPENSE', 'ADMIN_EXPENSE', 'DEPRECIATION_EXPENSE', 'ZAKAT_EXPENSE'] },
]

function RoleMappingTab({ accounts }: { accounts: Account[] }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [editRole, setEditRole] = useState<string | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState('')

  const { data: overviewData, isLoading, isError, refetch } = useQuery<{ overview: RoleOverviewItem[] }>({
    queryKey: ['financial-mapping-overview'],
    queryFn: async () => {
      const res = await fetch('/api/financial-mapping?action=overview')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const overview = overviewData?.overview || []

  const postingAccounts = useMemo(
    () => accounts.filter(a => a.allowPosting && a.isActive).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  )

  const updateMutation = useMutation({
    mutationFn: async ({ accountId, accountRole }: { accountId: string; accountRole: string }) => {
      const res = await fetch('/api/accounts/role-mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, accountRole }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-mapping-overview'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setEditDialogOpen(false)
      setEditRole(null)
    },
  })

  const handleEdit = (role: string) => {
    setEditRole(role)
    const currentMapping = overview.find(m => m.role === role)
    const primaryAccount = currentMapping?.accounts.find(a => a.isActive && a.allowPosting)
    setSelectedAccountId(primaryAccount?.id || '')
    setEditDialogOpen(true)
  }

  const handleSave = () => {
    if (!selectedAccountId || !editRole) return
    updateMutation.mutate({ accountId: selectedAccountId, accountRole: editRole })
  }

  const currentEditMapping = overview.find(m => m.role === editRole)

  const groupedMappings = useMemo(() => {
    const mappedRoles = new Set(overview.map(m => m.role))
    const groups = roleCategories.map(cat => ({
      ...cat,
      items: cat.roles
        .filter(role => mappedRoles.has(role))
        .map(role => overview.find(m => m.role === role)!)
        .filter(Boolean),
    })).filter(g => g.items.length > 0)

    const categorizedRoles = new Set(roleCategories.flatMap(c => c.roles))
    const uncategorized = overview.filter(m => !categorizedRoles.has(m.role))
    if (uncategorized.length > 0) {
      groups.push({
        key: 'other', labelAr: 'أخرى', labelEn: 'Other',
        roles: uncategorized.map(m => m.role), items: uncategorized,
      })
    }
    return groups
  }, [overview])

  const mappedCount = overview.filter(m => m.isMapped).length
  const unmappedCount = overview.filter(m => !m.isMapped).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard title={t('إجمالي الأدوار', 'Total Roles', lang)} value={overview.length} icon={Link2} color="teal" lang={lang} isMoney={false} />
        <SummaryCard title={t('مرتبط', 'Mapped', lang)} value={mappedCount} icon={CheckCircle2} color="emerald" lang={lang} isMoney={false} />
        <SummaryCard title={t('غير مربوط', 'Unmapped', lang)} value={unmappedCount} icon={AlertTriangle} color="rose" lang={lang} isMoney={false} />
        <SummaryCard title={t('حسابات فرعية', 'Child Accounts', lang)} value={overview.reduce((s, m) => s + m.childAccounts, 0)} icon={TreePine} color="purple" lang={lang} isMoney={false} />
      </div>

      {isLoading ? <TableSkeleton /> : isError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p>
          <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
        </div>
      ) : groupedMappings.map(group => (
        <Card key={group.key}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="size-4 text-teal-600" />
              <h4 className="font-bold text-sm">{lang === 'ar' ? group.labelAr : group.labelEn}</h4>
              <Badge variant="outline" className="text-xs">{group.items.length}</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الدور', 'Role', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحساب الأب', 'Parent Account', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحسابات الفرعية', 'Child Accounts', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                    <TableHead className="text-right">{t('العمليات المستخدمة', 'Operations', lang)}</TableHead>
                    <TableHead className="text-right">{t('إجراء', 'Action', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map(mapping => (
                    <TableRow key={mapping.role}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{lang === 'ar' ? mapping.labelAr : mapping.labelEn}</p>
                          <p className="text-xs text-muted-foreground">{mapping.role}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {mapping.accounts.length > 0 ? (
                          <div className="space-y-0.5">
                            {mapping.accounts.filter(a => !a.allowPosting).map(a => (
                              <div key={a.id} className="flex items-center gap-1">
                                <span className="font-mono text-sm">{a.code}</span>
                                <span>-</span>
                                <span className="text-sm">{lang === 'ar' && a.nameAr ? a.nameAr : a.name}</span>
                              </div>
                            ))}
                            {mapping.accounts.filter(a => !a.allowPosting).length === 0 && mapping.accounts.length > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-sm">{mapping.accounts[0].code}</span>
                                <span>-</span>
                                <span className="text-sm">{lang === 'ar' && mapping.accounts[0].nameAr ? mapping.accounts[0].nameAr : mapping.accounts[0].name}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 border-0 gap-1">
                            <AlertTriangle className="size-3" />{t('غير مربوط', 'Unmapped', lang)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {mapping.childAccountList.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {mapping.childAccountList.slice(0, 4).map(child => (
                              <Badge key={child.id} variant="outline" className="text-xs font-mono">
                                {child.code} {lang === 'ar' && child.nameAr ? child.nameAr : child.name}
                              </Badge>
                            ))}
                            {mapping.childAccountList.length > 4 && (
                              <Badge variant="outline" className="text-xs">+{mapping.childAccountList.length - 4}</Badge>
                            )}
                          </div>
                        ) : mapping.postingAccounts > 0 ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-0 text-xs">{t('حساب تفصيلي', 'Posting Account', lang)}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {mapping.isMapped ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1"><CheckCircle2 className="size-3" />{t('مربوط', 'Mapped', lang)}</Badge>
                        ) : (
                          <Badge className="bg-rose-100 text-rose-700 border-0 gap-1"><XCircle className="size-3" />{t('غير مربوط', 'Unmapped', lang)}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {mapping.operations.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {mapping.operations.map(op => (
                              <Badge key={op.operationType} variant="outline" className="text-xs gap-1">
                                <span className={op.side === 'debit' ? 'text-red-600' : op.side === 'credit' ? 'text-emerald-600' : 'text-blue-600'}>
                                  {op.side === 'debit' ? '↑' : op.side === 'credit' ? '↓' : '↔'}
                                </span>
                                {lang === 'ar' ? op.labelAr : op.labelEn}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleEdit(mapping.role)}>
                          <Pencil className="size-3" />{t('تعديل', 'Edit', lang)}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5 text-teal-600" />
              {t('ربط الحساب بالدور', 'Link Account to Role', lang)}
            </DialogTitle>
          </DialogHeader>
          {currentEditMapping && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">{t('الدور', 'Role', lang)}</p>
                <p className="text-lg font-bold">{lang === 'ar' ? currentEditMapping.labelAr : currentEditMapping.labelEn}</p>
                <p className="text-xs text-muted-foreground">{currentEditMapping.description}</p>
              </div>
              <Separator />
              <div className="space-y-1">
                <Label className="text-xs">{t('الحساب', 'Account', lang)}</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={t('اختر الحساب...', 'Select account...', lang)} /></SelectTrigger>
                  <SelectContent>
                    {postingAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} - {lang === 'ar' && a.nameAr ? a.nameAr : a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditRole(null) }}>{t('إلغاء', 'Cancel', lang)}</Button>
                <Button onClick={handleSave} disabled={!selectedAccountId || updateMutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  {updateMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {t('حفظ', 'Save', lang)}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ Tab 3: Financial Mapping Engine (محرك الربط المحاسبي) ============
function FinancialMappingEngineTab() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [editMapping, setEditMapping] = useState<FinancialMappingItem | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editDebitRoles, setEditDebitRoles] = useState<string[]>([])
  const [editCreditRoles, setEditCreditRoles] = useState<string[]>([])

  const { data: mappingsData, isLoading, isError, refetch } = useQuery<{ mappings: FinancialMappingItem[] }>({
    queryKey: ['financial-mappings'],
    queryFn: async () => {
      const res = await fetch('/api/financial-mapping?action=list')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: overviewData } = useQuery<{ overview: RoleOverviewItem[] }>({
    queryKey: ['financial-mapping-overview'],
    queryFn: async () => {
      const res = await fetch('/api/financial-mapping?action=overview')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const roleMap = useMemo(() => {
    const map = new Map<string, RoleOverviewItem>()
    for (const item of overviewData?.overview || []) {
      map.set(item.role, item)
    }
    return map
  }, [overviewData])

  const mappings = mappingsData?.mappings || []

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/financial-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed' }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['financial-mappings'] }),
  })

  const updateMappingMutation = useMutation({
    mutationFn: async ({ operationType, debitRoles, creditRoles }: { operationType: string; debitRoles: string[]; creditRoles: string[] }) => {
      const res = await fetch('/api/financial-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', operationType, debitRoles, creditRoles }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-mappings'] })
      setEditDialogOpen(false)
      setEditMapping(null)
    },
  })

  const handleEdit = (mapping: FinancialMappingItem) => {
    setEditMapping(mapping)
    setEditDebitRoles([...mapping.debitRoles])
    setEditCreditRoles([...mapping.creditRoles])
    setEditDialogOpen(true)
  }

  const handleSaveMapping = () => {
    if (!editMapping) return
    updateMappingMutation.mutate({
      operationType: editMapping.operationType,
      debitRoles: editDebitRoles,
      creditRoles: editCreditRoles,
    })
  }

  const allRoles = useMemo(() => {
    return Array.from(roleMap.values()).map(r => ({ value: r.role, labelAr: r.labelAr, labelEn: r.labelEn }))
  }, [roleMap])

  const operationCategories = [
    { key: 'sales', labelAr: 'المبيعات والإيرادات', labelEn: 'Sales & Revenue', types: ['RENTAL_INVOICE', 'PROJECT_INVOICE', 'SERVICE_INVOICE'] },
    { key: 'payments', labelAr: 'التحصيلات والمدفوعات', labelEn: 'Payments', types: ['CLIENT_PAYMENT', 'SUPPLIER_PAYMENT', 'SUBCONTRACTOR_PAYMENT'] },
    { key: 'purchases', labelAr: 'المشتريات', labelEn: 'Purchases', types: ['PURCHASE_INVOICE', 'GOODS_RECEIPT'] },
    { key: 'hr', labelAr: 'الموارد البشرية', labelEn: 'HR & Payroll', types: ['PAYROLL', 'EMPLOYEE_ADVANCE', 'ADVANCE_SETTLEMENT'] },
    { key: 'expenses', labelAr: 'المصروفات', labelEn: 'Expenses', types: ['FUEL_EXPENSE', 'MAINTENANCE_EXPENSE', 'GENERAL_EXPENSE', 'PROJECT_EXPENSE'] },
    { key: 'assets', labelAr: 'الأصول', labelEn: 'Assets', types: ['ASSET_ACQUISITION', 'ASSET_DEPRECIATION'] },
    { key: 'tax', labelAr: 'الضرائب', labelEn: 'Tax', types: ['VAT_PAYMENT', 'VAT_RETURN'] },
    { key: 'other', labelAr: 'أخرى', labelEn: 'Other', types: ['MANUAL_JOURNAL', 'PETTY_CASH', 'BANK_RECONCILIATION', 'PROVISION', 'ZAKAT'] },
  ]

  const getRoleLabel = (roleKey: string) => {
    const item = roleMap.get(roleKey)
    if (item) return lang === 'ar' ? item.labelAr : item.labelEn
    return roleKey
  }

  const getRoleAccountName = (roleKey: string) => {
    const item = roleMap.get(roleKey)
    if (!item || item.accounts.length === 0) return null
    const postingAccount = item.accounts.find(a => a.isActive && a.allowPosting) || item.accounts[0]
    return `${postingAccount.code} - ${lang === 'ar' && postingAccount.nameAr ? postingAccount.nameAr : postingAccount.name}`
  }

  const isRoleMapped = (roleKey: string) => {
    const item = roleMap.get(roleKey)
    return item?.isMapped || false
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle icon={Zap} title={{ ar: 'محرك الربط المحاسبي', en: 'Financial Mapping Engine' }} lang={lang} />
        <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="gap-1">
          {seedMutation.isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
          {t('تهيئة الربط', 'Seed Mappings', lang)}
        </Button>
      </div>

      {isLoading ? <TableSkeleton /> : isError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p>
          <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
        </div>
      ) : (
        operationCategories.map(cat => {
          const catMappings = mappings.filter(m => cat.types.includes(m.operationType))
          if (catMappings.length === 0) return null
          return (
            <Card key={cat.key}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="size-4 text-amber-600" />
                  <h4 className="font-bold text-sm">{lang === 'ar' ? cat.labelAr : cat.labelEn}</h4>
                  <Badge variant="outline" className="text-xs">{catMappings.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {catMappings.map(mapping => {
                    const allMapped = [...mapping.debitRoles, ...mapping.creditRoles].every(r => isRoleMapped(r))
                    const missingRoles = [...mapping.debitRoles, ...mapping.creditRoles].filter(r => !isRoleMapped(r))
                    return (
                      <Card key={mapping.operationType} className={`border ${allMapped ? 'border-emerald-200' : 'border-amber-200'} bg-white`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="font-bold text-sm">{lang === 'ar' ? mapping.labelAr : mapping.labelEn}</p>
                              <p className="text-xs text-muted-foreground font-mono">{mapping.operationType}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {allMapped ? (
                                <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1"><CheckCircle2 className="size-3" />{t('مكتمل', 'Complete', lang)}</Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-700 border-0 gap-1"><AlertTriangle className="size-3" />{t('ناقص', 'Incomplete', lang)} ({missingRoles.length})</Badge>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleEdit(mapping)}>
                                <Pencil className="size-3" />{t('تعديل', 'Edit', lang)}
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            {/* Debit Side */}
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
                                <ArrowUpDown className="size-3" />{t('مدين (Debit)', 'Debit', lang)}
                              </p>
                              {mapping.debitRoles.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">{t('يحدد المحاسب', 'Accountant decides', lang)}</p>
                              ) : mapping.debitRoles.map(role => (
                                <div key={role} className="flex items-center gap-1.5">
                                  <span className={`size-2 rounded-full ${isRoleMapped(role) ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                  <span className="text-xs font-medium">{getRoleLabel(role)}</span>
                                </div>
                              ))}
                            </div>
                            {/* Credit Side */}
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                                <ArrowUpDown className="size-3" />{t('دائن (Credit)', 'Credit', lang)}
                              </p>
                              {mapping.creditRoles.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">{t('يحدد المحاسب', 'Accountant decides', lang)}</p>
                              ) : mapping.creditRoles.map(role => (
                                <div key={role} className="flex items-center gap-1.5">
                                  <span className={`size-2 rounded-full ${isRoleMapped(role) ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                  <span className="text-xs font-medium">{getRoleLabel(role)}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {mapping.description && (
                            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">{mapping.description}</p>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}

      {/* Edit Mapping Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5 text-amber-600" />
              {t('تعديل الربط المحاسبي', 'Edit Financial Mapping', lang)}
            </DialogTitle>
          </DialogHeader>
          {editMapping && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">{t('العملية', 'Operation', lang)}</p>
                <p className="text-lg font-bold">{lang === 'ar' ? editMapping.labelAr : editMapping.labelEn}</p>
                <p className="text-xs text-muted-foreground">{editMapping.description}</p>
              </div>
              <Separator />
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-red-600 font-semibold">{t('أدوار الجانب المدين', 'Debit Roles', lang)}</Label>
                  <div className="mt-1 space-y-1">
                    {allRoles.map(role => (
                      <label key={role.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editDebitRoles.includes(role.value)}
                          onChange={(e) => {
                            if (e.target.checked) setEditDebitRoles([...editDebitRoles, role.value])
                            else setEditDebitRoles(editDebitRoles.filter(r => r !== role.value))
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className={isRoleMapped(role.value) ? '' : 'text-amber-600'}>
                          {lang === 'ar' ? role.labelAr : role.labelEn}
                        </span>
                        {!isRoleMapped(role.value) && <AlertTriangle className="size-3 text-amber-500" />}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-emerald-600 font-semibold">{t('أدوار الجانب الدائن', 'Credit Roles', lang)}</Label>
                  <div className="mt-1 space-y-1">
                    {allRoles.map(role => (
                      <label key={role.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editCreditRoles.includes(role.value)}
                          onChange={(e) => {
                            if (e.target.checked) setEditCreditRoles([...editCreditRoles, role.value])
                            else setEditCreditRoles(editCreditRoles.filter(r => r !== role.value))
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className={isRoleMapped(role.value) ? '' : 'text-amber-600'}>
                          {lang === 'ar' ? role.labelAr : role.labelEn}
                        </span>
                        {!isRoleMapped(role.value) && <AlertTriangle className="size-3 text-amber-500" />}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditMapping(null) }}>{t('إلغاء', 'Cancel', lang)}</Button>
                <Button onClick={handleSaveMapping} disabled={updateMappingMutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  {updateMappingMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {t('حفظ', 'Save', lang)}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ Tab 4: Account Impact (أثر الحسابات) ============
function AccountImpactTab() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const { data: summaryData, isLoading: summaryLoading, isError: summaryError, refetch: refetchSummary } = useQuery<{ summary: AccountImpactSummaryItem[] }>({
    queryKey: ['account-impact-summary'],
    queryFn: async () => {
      const res = await fetch('/api/account-impact?action=summary')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: detailData, isLoading: detailLoading } = useQuery<{ impact: AccountImpactDetail }>({
    queryKey: ['account-impact-detail', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return { impact: null as unknown as AccountImpactDetail }
      const res = await fetch(`/api/account-impact?action=detail&accountId=${selectedAccountId}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedAccountId,
  })

  const summary = summaryData?.summary || []
  const impact = detailData?.impact || null

  const deactivateMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch('/api/account-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate', accountId }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-impact-summary'] })
      queryClient.invalidateQueries({ queryKey: ['account-impact-detail', selectedAccountId] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setDeactivateDialogOpen(false)
      setDeactivateTarget(null)
      setSelectedAccountId(null)
    },
  })

  const filteredSummary = useMemo(() => {
    let filtered = summary
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(a => a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term))
    }
    if (typeFilter !== 'all') filtered = filtered.filter(a => a.type === typeFilter)
    return filtered
  }, [summary, searchTerm, typeFilter])

  const accountsWithUsage = summary.filter(a => a.hasUsage).length
  const accountsWithRole = summary.filter(a => a.accountRole).length

  return (
    <div className="space-y-4">
      <SectionTitle icon={Activity} title={{ ar: 'أثر الحسابات على النظام', en: 'Account Impact Analysis' }} lang={lang} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard title={t('إجمالي الحسابات', 'Total Accounts', lang)} value={summary.length} icon={Database} color="teal" lang={lang} isMoney={false} />
        <SummaryCard title={t('حسابات مستخدمة', 'Used Accounts', lang)} value={accountsWithUsage} icon={Activity} color="emerald" lang={lang} isMoney={false} />
        <SummaryCard title={t('حسابات بأدوار', 'With Roles', lang)} value={accountsWithRole} icon={Link2} color="purple" lang={lang} isMoney={false} />
        <SummaryCard title={t('حسابات نشطة', 'Active', lang)} value={summary.filter(a => a.allowPosting).length} icon={CheckCircle2} color="sky" lang={lang} isMoney={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Account List */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Search className="size-4 text-gray-500" />
              <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={t('بحث بالكود أو الاسم...', 'Search by code or name...', lang)} className="h-8" />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
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
            <div className="max-h-[500px] overflow-y-auto space-y-1">
              {summaryLoading ? <TableSkeleton /> : summaryError ? (
                <div className="text-center py-6"><p className="text-rose-600 text-sm">{t('حدث خطأ', 'Error', lang)}</p></div>
              ) : filteredSummary.length === 0 ? (
                <div className="text-center py-6"><p className="text-muted-foreground text-sm">{t('لا توجد نتائج', 'No results', lang)}</p></div>
              ) : filteredSummary.map(account => (
                <div
                  key={account.id}
                  className={`p-2.5 rounded-lg cursor-pointer transition-colors border ${selectedAccountId === account.id ? 'bg-emerald-50 border-emerald-300' : 'hover:bg-gray-50 border-transparent'}`}
                  onClick={() => setSelectedAccountId(account.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{account.code}</span>
                      <span className="text-sm">{account.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {account.roleLabel && <Badge className="bg-purple-50 text-purple-700 border-0 text-[10px]">{account.roleLabel}</Badge>}
                      {account.journalLineCount > 0 && <Badge className="bg-sky-50 text-sky-700 border-0 text-[10px]">{account.journalLineCount} {t('قيد', 'JE', lang)}</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Account Impact Detail */}
        <Card>
          <CardContent className="p-4">
            {detailLoading ? (
              <div className="flex items-center justify-center py-12"><RefreshCw className="size-6 animate-spin text-gray-400" /></div>
            ) : !impact ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <Activity className="size-12 text-gray-300" />
                <p className="text-muted-foreground text-sm">{t('اختر حساباً لعرض أثره', 'Select an account to view its impact', lang)}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Account Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold">{impact.account.code}</span>
                      <span className="font-bold">{lang === 'ar' && impact.account.nameAr ? impact.account.nameAr : impact.account.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <TypeBadge type={impact.account.type} lang={lang} />
                      {impact.role && <Badge className="bg-purple-50 text-purple-700 border-0 gap-1"><Link2 className="size-3" />{lang === 'ar' ? impact.role.labelAr : impact.role.labelEn}</Badge>}
                      {impact.account.allowPosting ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-0">{t('تفصيلي', 'Posting', lang)}</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-700 border-0">{t('رأسي', 'Header', lang)}</Badge>
                      )}
                    </div>
                  </div>
                  {!impact.account.allowPosting && impact.canDeactivate && (
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => { setDeactivateTarget(impact.account.id); setDeactivateDialogOpen(true) }}>
                      <Trash2 className="size-3" />{t('تعطيل', 'Deactivate', lang)}
                    </Button>
                  )}
                </div>

                <Separator />

                {/* Parent/Children */}
                <div className="grid grid-cols-2 gap-3">
                  {impact.parentAccount && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t('الحساب الأب', 'Parent Account', lang)}</p>
                      <p className="text-sm font-medium font-mono">{impact.parentAccount.code} - {lang === 'ar' && impact.parentAccount.nameAr ? impact.parentAccount.nameAr : impact.parentAccount.name}</p>
                    </div>
                  )}
                  {impact.childAccounts.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t('الحسابات الفرعية', 'Child Accounts', lang)} ({impact.childAccounts.length})</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {impact.childAccounts.map(child => (
                          <Badge key={child.id} variant="outline" className="text-xs font-mono">
                            {child.code} - {lang === 'ar' && child.nameAr ? child.nameAr : child.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Operations Using This Account */}
                {impact.operations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1.5">{t('العمليات المستخدمة', 'Operations Using This Account', lang)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {impact.operations.map(op => (
                        <Badge key={op.operationType} variant="outline" className="text-xs gap-1">
                          <span className={op.side === 'debit' ? 'text-red-600' : op.side === 'credit' ? 'text-emerald-600' : 'text-blue-600'}>
                            {op.side === 'debit' ? t('مدين', 'Dr', lang) : op.side === 'credit' ? t('دائن', 'Cr', lang) : t('كلاهما', 'Both', lang)}
                          </span>
                          {lang === 'ar' ? op.labelAr : op.labelEn}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Usage Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Card className="bg-sky-50 border-sky-200"><CardContent className="p-2 text-center"><p className="text-[10px] text-sky-600">{t('بنود القيود', 'Journal Lines', lang)}</p><p className="text-sm font-bold text-sky-700">{formatNumber(impact.usageStats.journalLineCount)}</p></CardContent></Card>
                  <Card className="bg-red-50 border-red-200"><CardContent className="p-2 text-center"><p className="text-[10px] text-red-600">{t('إجمالي مدين', 'Total Debit', lang)}</p><MoneyDisplay value={impact.usageStats.totalDebit} lang={lang} bold className="text-sm text-red-700" /></CardContent></Card>
                  <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-2 text-center"><p className="text-[10px] text-emerald-600">{t('إجمالي دائن', 'Total Credit', lang)}</p><MoneyDisplay value={impact.usageStats.totalCredit} lang={lang} bold className="text-sm text-emerald-700" /></CardContent></Card>
                  <Card className="bg-purple-50 border-purple-200"><CardContent className="p-2 text-center"><p className="text-[10px] text-purple-600">{t('آخر استخدام', 'Last Used', lang)}</p><p className="text-xs font-bold text-purple-700">{impact.usageStats.lastUsedDate ? formatDate(impact.usageStats.lastUsedDate, lang) : '—'}</p></CardContent></Card>
                </div>

                {/* Document References */}
                {impact.documentReferences.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1.5">{t('مراجع المستندات', 'Document References', lang)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {impact.documentReferences.map(ref => (
                        <Badge key={ref.type} variant="outline" className="text-xs gap-1">
                          <FileText className="size-3" />{ref.labelAr} ({ref.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Deactivation Blockers */}
                {!impact.canDeactivate && (
                  <Card className="bg-rose-50 border-rose-200">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="size-4 text-rose-600" />
                        <p className="text-xs font-semibold text-rose-700">{t('لا يمكن تعطيل هذا الحساب', 'Cannot Deactivate This Account', lang)}</p>
                      </div>
                      <ul className="space-y-0.5">
                        {impact.deactivationBlockers.map((blocker, idx) => (
                          <li key={idx} className="text-xs text-rose-600 flex items-center gap-1">
                            <XCircle className="size-3 shrink-0" />{blocker}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deactivation Confirmation Dialog */}
      <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="size-5" />
              {t('تأكيد التعطيل', 'Confirm Deactivation', lang)}
            </DialogTitle>
            <DialogDescription>
              {t('هل أنت متأكد من تعطيل هذا الحساب؟ يمكن التراجع عن التعطيل لاحقاً.', 'Are you sure you want to deactivate this account? This can be reversed later.', lang)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeactivateDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={() => deactivateTarget && deactivateMutation.mutate(deactivateTarget)} disabled={deactivateMutation.isPending} className="gap-2 bg-rose-600 hover:bg-rose-700">
              {deactivateMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {t('تعطيل', 'Deactivate', lang)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ Tab 5: Health Check (فحص السلامة) ============
function HealthCheckTab() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const { data: summaryData, isLoading: summaryLoading } = useQuery<{ summary: HealthSummary }>({
    queryKey: ['accounting-health-summary'],
    queryFn: async () => {
      const res = await fetch('/api/accounting-health?action=summary')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: reportData, isLoading: reportLoading, refetch: refetchReport } = useQuery<{ report: HealthCheckReport | null }>({
    queryKey: ['accounting-health-latest'],
    queryFn: async () => {
      const res = await fetch('/api/accounting-health?action=latest')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: historyData } = useQuery<{ history: HealthHistoryItem[] }>({
    queryKey: ['accounting-health-history'],
    queryFn: async () => {
      const res = await fetch('/api/accounting-health?action=history&limit=10')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const runCheckMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/accounting-health', { method: 'POST' })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-health-summary'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-health-latest'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-health-history'] })
    },
  })

  const summary = summaryData?.summary
  const report = reportData?.report
  const history = historyData?.history || []

  const scoreColor = (score: number) => {
    if (score >= 90) return { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-500', emoji: '🟢' }
    if (score >= 70) return { text: 'text-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-500', emoji: '🟡' }
    return { text: 'text-red-600', bg: 'bg-red-50', ring: 'ring-red-500', emoji: '🔴' }
  }

  const severityConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string; icon: React.ElementType }> = {
    error: { label: { ar: 'خطأ', en: 'Error' }, color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
    warning: { label: { ar: 'تحذير', en: 'Warning' }, color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertTriangle },
    info: { label: { ar: 'معلومات', en: 'Info' }, color: 'text-sky-600', bg: 'bg-sky-50', icon: InfoIcon },
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle icon={Stethoscope} title={{ ar: 'فحص السلامة المحاسبي', en: 'Accounting Health Check' }} lang={lang} />
        <Button onClick={() => runCheckMutation.mutate()} disabled={runCheckMutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          {runCheckMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : <Stethoscope className="size-4" />}
          {t('فحص الآن', 'Run Check', lang)}
        </Button>
      </div>

      {/* Health Score */}
      {summaryLoading ? <TableSkeleton /> : summary && (
        <Card className={`${scoreColor(summary.score).bg} border-2`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`size-20 rounded-full flex items-center justify-center ring-4 ${scoreColor(summary.score).ring} bg-white`}>
                  <div className="text-center">
                    <p className={`text-2xl font-black ${scoreColor(summary.score).text}`}>{summary.score}%</p>
                  </div>
                </div>
                <div>
                  <p className={`text-xl font-bold ${scoreColor(summary.score).text}`}>
                    {scoreColor(summary.score).emoji} {summary.score >= 90 ? t('سليم', 'Healthy', lang) : summary.score >= 70 ? t('يحتاج انتباه', 'Needs Attention', lang) : t('خطر', 'Critical', lang)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('آخر فحص', 'Last checked', lang)}: {summary.lastChecked ? formatDate(summary.lastChecked, lang) : '—'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-white"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('فحوصات ناجحة', 'Passed', lang)}</p><p className="text-xl font-bold text-emerald-700">{report?.passedChecks ?? '—'}</p></CardContent></Card>
                <Card className="bg-white"><CardContent className="p-3 text-center"><p className="text-xs text-amber-600">{t('تحذيرات', 'Warnings', lang)}</p><p className="text-xl font-bold text-amber-700">{summary.warnings}</p></CardContent></Card>
                <Card className="bg-white"><CardContent className="p-3 text-center"><p className="text-xs text-red-600">{t('أخطاء', 'Errors', lang)}</p><p className="text-xl font-bold text-red-700">{summary.errors}</p></CardContent></Card>
                <Card className="bg-white"><CardContent className="p-3 text-center"><p className="text-xs text-sky-600">{t('إجمالي الفحوصات', 'Total Checks', lang)}</p><p className="text-xl font-bold text-sky-700">{report?.totalChecks ?? '—'}</p></CardContent></Card>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Check Results */}
      {reportLoading ? <TableSkeleton /> : report && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-bold mb-3 flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-600" />
              {t('نتائج الفحوصات', 'Check Results', lang)}
            </h4>
            <div className="space-y-2">
              {report.checks.map(check => {
                const sev = severityConfig[check.severity] || severityConfig.info
                const SevIcon = sev.icon
                return (
                  <div key={check.checkId} className={`p-3 rounded-lg border ${sev.bg} flex items-start gap-3`}>
                    <div className="mt-0.5">
                      {check.passed ? (
                        <CheckCircle2 className="size-5 text-emerald-600" />
                      ) : (
                        <SevIcon className={`size-5 ${sev.color}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{lang === 'ar' ? check.checkNameAr : check.checkNameEn}</p>
                        <Badge className={`${check.passed ? 'bg-emerald-100 text-emerald-700' : `${sev.bg} ${sev.color}`} border-0 text-[10px]`}>
                          {check.passed ? t('ناجح', 'Passed', lang) : (lang === 'ar' ? sev.label.ar : sev.label.en)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{lang === 'ar' ? check.messageAr : check.messageEn}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History Trend */}
      {history.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-bold mb-3 flex items-center gap-2">
              <TrendingUp className="size-4 text-sky-600" />
              {t('سجل الفحوصات', 'Check History', lang)}
            </h4>
            <div className="flex items-end gap-2 h-24">
              {history.slice(0, 10).reverse().map((item, idx) => {
                const sc = scoreColor(item.overallScore)
                const height = Math.max(item.overallScore, 10)
                return (
                  <div key={item.id} className="flex-1 flex flex-col items-center gap-1">
                    <span className={`text-[10px] font-bold ${sc.text}`}>{item.overallScore}%</span>
                    <div className={`w-full rounded-t ${sc.bg} border ${sc.ring} border-opacity-30`} style={{ height: `${height}%` }} />
                    <span className="text-[9px] text-muted-foreground">{formatDate(item.checkDate, lang).slice(0, 6)}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Tab 6: Journal Entries ============
function JournalEntriesTab({ entries, isLoading, isError, refetch, accounts }: {
  entries: JournalEntry[]; isLoading: boolean; isError: boolean; refetch: () => void; accounts: Account[]
}) {
  const { lang } = useAppStore()
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)

  const filtered = useMemo(() => {
    let list = entries
    if (statusFilter !== 'all') list = list.filter(e => e.status === statusFilter)
    if (sourceFilter !== 'all') list = list.filter(e => e.sourceType === sourceFilter)
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      list = list.filter(e => e.entryNo.toLowerCase().includes(term) || (e.description && e.description.toLowerCase().includes(term)))
    }
    return list
  }, [entries, statusFilter, sourceFilter, searchTerm])

  if (selectedEntry) return <JournalEntryDetail entry={selectedEntry} onBack={() => setSelectedEntry(null)} accounts={accounts} />

  return (
    <div className="space-y-4">
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

      {isLoading ? <TableSkeleton /> : isError ? (
        <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
      ) : filtered.length === 0 ? (
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
                      <TableCell>{entry.description || '—'}</TableCell>
                      <TableCell>{entry.sourceType ? (sourceTypeLabels[entry.sourceType]?.[lang] || entry.sourceType) : '—'}</TableCell>
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

// ============ Tab 7: General Ledger ============
function GeneralLedgerTab({ accounts, preselectedCode }: { accounts: Account[]; preselectedCode?: string }) {
  const { lang } = useAppStore()
  const [selectedAccount, setSelectedAccount] = useState(preselectedCode || '')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  React.useEffect(() => {
    if (preselectedCode) setSelectedAccount(preselectedCode)
  }, [preselectedCode])

  const postingAccounts = useMemo(
    () => accounts.filter(a => a.allowPosting && a.isActive).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  )

  const { data, isLoading, isError, refetch } = useQuery<AccountStatementData | null>({
    queryKey: ['general-ledger', selectedAccount, dateFrom, dateTo],
    queryFn: async () => {
      if (!selectedAccount) return null
      const account = accounts.find(a => a.code === selectedAccount)
      if (!account) return null
      const params = new URLSearchParams({ accountId: account.id })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/accounts/statement?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedAccount,
  })

  const statement = data as AccountStatementData | null

  return (
    <div className="space-y-4">
      <SectionTitle icon={BookOpen} title={{ ar: 'دفتر الأستاذ العام', en: 'General Ledger' }} lang={lang} />

      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">{t('الحساب', 'Account', lang)}</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="h-9"><SelectValue placeholder={t('اختر الحساب...', 'Select account...', lang)} /></SelectTrigger>
                <SelectContent>
                  {postingAccounts.map(a => (
                    <SelectItem key={a.id} value={a.code}>
                      {a.code} - {lang === 'ar' && a.nameAr ? a.nameAr : a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1">
              <RefreshCw className="size-3.5" />{t('عرض', 'Show', lang)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!selectedAccount ? (
        <div className="flex flex-col items-center gap-3 py-10"><BookOpen className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('اختر حساباً', 'Select an account', lang)}</p></div>
      ) : isLoading ? <TableSkeleton /> : isError ? (
        <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
      ) : statement ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-sky-50 border-sky-200"><CardContent className="p-3 text-center"><p className="text-xs text-sky-600">{t('الرصيد الافتتاحي', 'Opening Balance', lang)}</p><MoneyDisplay value={statement.openingBalance} lang={lang} bold className={statement.openingBalance >= 0 ? 'text-sky-700' : 'text-rose-700'} /></CardContent></Card>
            <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('إجمالي مدين', 'Total Debit', lang)}</p><MoneyDisplay value={statement.totalDebit} lang={lang} bold className="text-emerald-700" /></CardContent></Card>
            <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('إجمالي دائن', 'Total Credit', lang)}</p><MoneyDisplay value={statement.totalCredit} lang={lang} bold className="text-rose-700" /></CardContent></Card>
            <Card className="bg-purple-50 border-purple-200"><CardContent className="p-3 text-center"><p className="text-xs text-purple-600">{t('الرصيد الختامي', 'Closing Balance', lang)}</p><MoneyDisplay value={statement.closingBalance} lang={lang} bold className={statement.closingBalance >= 0 ? 'text-purple-700' : 'text-rose-700'} /></CardContent></Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('رقم القيد', 'Entry No', lang)}</TableHead>
                      <TableHead className="text-right">{t('البيان', 'Description', lang)}</TableHead>
                      <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                      <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                      <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.lines.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t('لا توجد حركات', 'No transactions found', lang)}</TableCell></TableRow>
                    ) : statement.lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{formatDate(line.date, lang)}</TableCell>
                        <TableCell className="font-mono">{line.entryNo}</TableCell>
                        <TableCell>{line.description || '—'}</TableCell>
                        <TableCell>{line.debit > 0 ? <MoneyDisplay value={line.debit} lang={lang} size="sm" className="text-emerald-700" /> : ''}</TableCell>
                        <TableCell>{line.credit > 0 ? <MoneyDisplay value={line.credit} lang={lang} size="sm" className="text-rose-700" /> : ''}</TableCell>
                        <TableCell className="font-semibold"><MoneyDisplay value={line.balance} lang={lang} size="sm" bold className={line.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></TableCell>
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

// ============ Tab 8: Trial Balance ============
function TrialBalanceTab() {
  const { lang } = useAppStore()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [generated, setGenerated] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['trial-balance', dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/trial-balance?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: generated,
  })

  const items = (data?.items || data || []) as TrialBalanceItem[]
  const totalDebit = items.reduce((s, i) => s + i.totalDebit, 0)
  const totalCredit = items.reduce((s, i) => s + i.totalCredit, 0)
  const totalNetDebit = items.reduce((s, i) => s + i.netDebit, 0)
  const totalNetCredit = items.reduce((s, i) => s + i.netCredit, 0)

  const totalAssets = items.filter(i => i.account.type === 'ASSET').reduce((s, i) => s + i.netDebit - i.netCredit, 0)
  const totalLiabilities = items.filter(i => i.account.type === 'LIABILITY').reduce((s, i) => s + i.netCredit - i.netDebit, 0)
  const totalEquity = items.filter(i => i.account.type === 'EQUITY').reduce((s, i) => s + i.netCredit - i.netDebit, 0)
  const totalRevenue = items.filter(i => i.account.type === 'REVENUE').reduce((s, i) => s + i.netCredit - i.netDebit, 0)
  const totalExpenses = items.filter(i => i.account.type === 'EXPENSE').reduce((s, i) => s + i.netDebit - i.netCredit, 0)

  const handleGenerate = () => { setGenerated(true); refetch() }

  return (
    <div className="space-y-4">
      <SectionTitle icon={Scale} title={{ ar: 'ميزان المراجعة', en: 'Trial Balance' }} lang={lang} />

      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" />
            </div>
            <Button onClick={handleGenerate} className="gap-2 bg-emerald-600 hover:bg-emerald-700 h-9">
              <Calculator className="size-4" />{t('عرض', 'Generate', lang)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {generated && isLoading ? <TableSkeleton /> : generated && isError ? (
        <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
      ) : generated && items.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Card className="bg-blue-50 border-blue-200"><CardContent className="p-3 text-center"><p className="text-xs text-blue-600">{t('الأصول', 'Assets', lang)}</p><MoneyDisplay value={totalAssets} lang={lang} bold className="text-blue-700" /></CardContent></Card>
            <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3 text-center"><p className="text-xs text-amber-600">{t('الخصوم', 'Liabilities', lang)}</p><MoneyDisplay value={totalLiabilities} lang={lang} bold className="text-amber-700" /></CardContent></Card>
            <Card className="bg-purple-50 border-purple-200"><CardContent className="p-3 text-center"><p className="text-xs text-purple-600">{t('حقوق الملكية', 'Equity', lang)}</p><MoneyDisplay value={totalEquity} lang={lang} bold className="text-purple-700" /></CardContent></Card>
            <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('الإيرادات', 'Revenue', lang)}</p><MoneyDisplay value={totalRevenue} lang={lang} bold className="text-emerald-700" /></CardContent></Card>
            <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('المصروفات', 'Expenses', lang)}</p><MoneyDisplay value={totalExpenses} lang={lang} bold className="text-rose-700" /></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t('كود الحساب', 'Account Code', lang)}</TableHead>
                      <TableHead className="text-right">{t('اسم الحساب', 'Account Name', lang)}</TableHead>
                      <TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead>
                      <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                      <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                      <TableHead className="text-right">{t('صافي مدين', 'Net Debit', lang)}</TableHead>
                      <TableHead className="text-right">{t('صافي دائن', 'Net Credit', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono">{item.account.code}</TableCell>
                        <TableCell>{lang === 'ar' && item.account.nameAr ? item.account.nameAr : item.account.name}</TableCell>
                        <TableCell><TypeBadge type={item.account.type} lang={lang} /></TableCell>
                        <TableCell><MoneyDisplay value={item.totalDebit} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                        <TableCell><MoneyDisplay value={item.totalCredit} lang={lang} size="sm" className="text-rose-700" /></TableCell>
                        <TableCell>{item.netDebit > 0 ? <MoneyDisplay value={item.netDebit} lang={lang} size="sm" className="text-emerald-700" bold /> : ''}</TableCell>
                        <TableCell>{item.netCredit > 0 ? <MoneyDisplay value={item.netCredit} lang={lang} size="sm" className="text-rose-700" bold /> : ''}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-gray-100 font-bold border-t-2 border-gray-300">
                      <TableCell colSpan={3}>{t('الإجمالي', 'Total', lang)}</TableCell>
                      <TableCell><MoneyDisplay value={totalDebit} lang={lang} size="sm" bold className="text-emerald-800" /></TableCell>
                      <TableCell><MoneyDisplay value={totalCredit} lang={lang} size="sm" bold className="text-rose-800" /></TableCell>
                      <TableCell><MoneyDisplay value={totalNetDebit} lang={lang} size="sm" bold className="text-emerald-800" /></TableCell>
                      <TableCell><MoneyDisplay value={totalNetCredit} lang={lang} size="sm" bold className="text-rose-800" /></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-4 text-center"><p className="text-lg font-bold text-emerald-800">{t('إجمالي الأصول', 'Total Assets', lang)}: <MoneyDisplay value={totalAssets} lang={lang} bold /></p></CardContent></Card>
            <Card className="bg-purple-50 border-purple-200"><CardContent className="p-4 text-center"><p className="text-lg font-bold text-purple-800">{t('إجمالي الخصوم + حقوق الملكية', 'Total Liabilities + Equity', lang)}: <MoneyDisplay value={totalLiabilities + totalEquity} lang={lang} bold /></p></CardContent></Card>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10"><Scale className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('حدد التاريخ ثم اضغط عرض', 'Select date and click Generate', lang)}</p></div>
      )}
    </div>
  )
}

// ============ Main Accounting Module ============
export function AccountingModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('chart-of-accounts')
  const [glPreselectedCode, setGlPreselectedCode] = useState('')

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
    { value: 'chart-of-accounts', label: { ar: 'شجرة الحسابات', en: 'Chart of Accounts' }, icon: TreePine, group: 'core' },
    { value: 'role-mapping', label: { ar: 'ربط الحسابات بالنظام', en: 'Role Mapping' }, icon: Link2, group: 'core' },
    { value: 'financial-mapping', label: { ar: 'محرك الربط المحاسبي', en: 'Mapping Engine' }, icon: Zap, group: 'core' },
    { value: 'account-impact', label: { ar: 'أثر الحسابات', en: 'Account Impact' }, icon: Activity, group: 'core' },
    { value: 'health-check', label: { ar: 'فحص السلامة', en: 'Health Check' }, icon: Stethoscope, group: 'core' },
    { value: 'journal-entries', label: { ar: 'قيود اليومية', en: 'Journal Entries' }, icon: FileText, group: 'transactions' },
    { value: 'general-ledger', label: { ar: 'دفتر الأستاذ', en: 'General Ledger' }, icon: BookOpen, group: 'transactions' },
    { value: 'trial-balance', label: { ar: 'ميزان المراجعة', en: 'Trial Balance' }, icon: Scale, group: 'transactions' },
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
          <ChartOfAccountsTab accounts={accounts} isLoading={loadingAccounts} onInitialize={() => initMutation.mutate()} onReInitialize={() => reInitMutation.mutate()} isInitializing={isInitializing} onViewLedger={(accountCode) => { setGlPreselectedCode(accountCode); setActiveTab('general-ledger') }} />
        </TabsContent>

        <TabsContent value="role-mapping">
          <RoleMappingTab accounts={accounts} />
        </TabsContent>

        <TabsContent value="financial-mapping">
          <FinancialMappingEngineTab />
        </TabsContent>

        <TabsContent value="account-impact">
          <AccountImpactTab />
        </TabsContent>

        <TabsContent value="health-check">
          <HealthCheckTab />
        </TabsContent>

        <TabsContent value="journal-entries">
          <JournalEntriesTab entries={entries} isLoading={loadingEntries} isError={entriesError} refetch={refetchEntries} accounts={accounts} />
        </TabsContent>

        <TabsContent value="general-ledger">
          <GeneralLedgerTab accounts={accounts} preselectedCode={glPreselectedCode} />
        </TabsContent>

        <TabsContent value="trial-balance">
          <TrialBalanceTab />
        </TabsContent>
      </Tabs>
    </ModuleLayout>
  )
}

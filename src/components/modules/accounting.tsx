'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, RefreshCw, FileText, ChevronLeft, Eye, TreePine,
  ArrowUpDown, Calculator, Scale, Database, PlusCircle,
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
import { useAppStore, formatDate, formatNumber } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'

// ============ Types ============
interface Account {
  id: string; code: string; name: string; nameAr: string | null
  type: string; parentId: string | null; isActive: boolean
  parent: { id: string; code: string; name: string } | null
  children: { id: string; code: string; name: string }[]
  _count: { journalLines: number }
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

interface AccountStatement {
  account: { id: string; code: string; name: string; nameAr: string | null; type: string }
  lines: StatementLine[]
  totalDebit: number; totalCredit: number; closingBalance: number
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

const jeStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-amber-700', bg: 'bg-amber-100' },
  POSTED: { label: { ar: 'مرحّل', en: 'Posted' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  CANCELLED: { label: { ar: 'ملغي', en: 'Cancelled' }, color: 'text-rose-700', bg: 'bg-rose-100' },
}

function JEStatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = jeStatusConfig[status] || jeStatusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

// Source type labels
const sourceTypeLabels: Record<string, { ar: string; en: string }> = {
  SALES_INVOICE: { ar: 'فاتورة مبيعات', en: 'Sales Invoice' },
  PURCHASE_INVOICE: { ar: 'فاتورة مشتريات', en: 'Purchase Invoice' },
  PROGRESS_CLAIM: { ar: 'مستخلص', en: 'Progress Claim' },
  EXPENSE: { ar: 'مصروف', en: 'Expense' },
  CLIENT_PAYMENT: { ar: 'تحصيل عميل', en: 'Client Payment' },
  SUPPLIER_PAYMENT: { ar: 'دفع مورد', en: 'Supplier Payment' },
  EMPLOYEE_ADVANCE: { ar: 'سلفة موظف', en: 'Employee Advance' },
  ADVANCE_SETTLEMENT: { ar: 'تسوية سلفة', en: 'Advance Settlement' },
  SUBCONTRACTOR_INVOICE: { ar: 'فاتورة مقاول باطن', en: 'Subcontractor Invoice' },
  EQUIPMENT_COST: { ar: 'تكلفة معدات', en: 'Equipment Cost' },
  RENTAL_INVOICE: { ar: 'فاتورة تأجير', en: 'Rental Invoice' },
  PETTY_CASH: { ar: 'صندوق نقدي', en: 'Petty Cash' },
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

// ============ Journal Entry Detail ============
function JournalEntryDetail({ entry, onBack }: { entry: JournalEntry; onBack: () => void }) {
  const { lang } = useAppStore()
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ChevronLeft className="size-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">{entry.entryNo}</h2>
          <p className="text-sm text-muted-foreground">{entry.description || ''}</p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          <JEStatusBadge status={entry.status} lang={lang} />
          {entry.sourceType && (
            <Badge variant="outline" className="bg-gray-50">
              {sourceTypeLabels[entry.sourceType]?.[lang] || entry.sourceType}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-gray-50"><CardContent className="p-3 text-center">
          <p className="text-xs text-gray-600">{t('التاريخ', 'Date', lang)}</p>
          <p className="font-semibold">{formatDate(entry.date, lang)}</p>
        </CardContent></Card>
        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center">
          <p className="text-xs text-emerald-600">{t('مدين', 'Debit', lang)}</p>
          <MoneyDisplay value={entry.totalDebit} lang={lang} bold className="text-emerald-700" />
        </CardContent></Card>
        <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center">
          <p className="text-xs text-rose-600">{t('دائن', 'Credit', lang)}</p>
          <MoneyDisplay value={entry.totalCredit} lang={lang} bold className="text-rose-700" />
        </CardContent></Card>
        <Card className="bg-gray-50"><CardContent className="p-3 text-center">
          <p className="text-xs text-gray-600">{t('عدد البنود', 'Lines', lang)}</p>
          <p className="font-semibold">{formatNumber(entry.lines.length)}</p>
        </CardContent></Card>
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
                    <TableCell className="font-medium">
                      {line.account.code} - {lang === 'ar' && line.account.nameAr ? line.account.nameAr : line.account.name}
                    </TableCell>
                    <TableCell>
                      {line.debit > 0 ? <MoneyDisplay value={line.debit} lang={lang} size="sm" className="text-emerald-700" /> : ''}
                    </TableCell>
                    <TableCell>
                      {line.credit > 0 ? <MoneyDisplay value={line.credit} lang={lang} size="sm" className="text-rose-700" /> : ''}
                    </TableCell>
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
function ChartOfAccountsTab({ accounts, isLoading, onInitialize, isInitializing }: {
  accounts: Account[]; isLoading: boolean; onInitialize: () => void; isInitializing: boolean
}) {
  const { lang } = useAppStore()

  // Build tree structure
  const rootAccounts = accounts.filter(a => !a.parentId)
  const childMap = new Map<string, Account[]>()
  accounts.forEach(a => {
    if (a.parentId) {
      const siblings = childMap.get(a.parentId) || []
      siblings.push(a)
      childMap.set(a.parentId, siblings)
    }
  })

  const flattenTree = (roots: Account[], depth: number): (Account & { depth: number })[] => {
    const result: (Account & { depth: number })[] = []
    for (const root of roots) {
      result.push({ ...root, depth })
      const children = childMap.get(root.id) || []
      if (children.length > 0) {
        result.push(...flattenTree(children.sort((a, b) => a.code.localeCompare(b.code)), depth + 1))
      }
    }
    return result
  }

  const flatAccounts = flattenTree(rootAccounts.sort((a, b) => a.code.localeCompare(b.code)), 0)

  const typeSummary = useMemo(() => {
    const summary: Record<string, number> = {}
    accounts.forEach(a => { summary[a.type] = (summary[a.type] || 0) + 1 })
    return summary
  }, [accounts])

  return (
    <div className="space-y-4">
      {/* Type Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {Object.entries(typeSummary).map(([type, count]) => {
          const cfg = typeConfig[type]
          if (!cfg) return null
          return (
            <Card key={type} className={`${cfg.bg} border-0`}>
              <CardContent className="p-3 text-center">
                <p className={`text-xs ${cfg.color}`}>{cfg.label[lang]}</p>
                <p className={`text-lg font-bold ${cfg.color}`}>{count}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Initialize button if no accounts */}
      {accounts.length === 0 && !isLoading && (
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
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : accounts.length === 0 ? null : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('اسم الحساب', 'Account Name', lang)}</TableHead>
                    <TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead>
                    <TableHead className="text-right">{t('عدد القيود', 'Entries', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flatAccounts.map(a => (
                    <TableRow key={a.id} className={a.depth === 0 ? 'bg-gray-50/50 font-semibold' : ''}>
                      <TableCell>
                        <span style={{ display: 'inline-block', width: `${a.depth * 20}px` }} />
                        {a.depth > 0 && <span className="text-gray-300 ml-1 mr-1">└</span>}
                        <span className="font-mono text-sm">{a.code}</span>
                      </TableCell>
                      <TableCell>
                        {lang === 'ar' && a.nameAr ? a.nameAr : a.name}
                        {lang === 'ar' && a.nameAr && (
                          <span className="text-muted-foreground text-xs mr-1">({a.name})</span>
                        )}
                      </TableCell>
                      <TableCell><TypeBadge type={a.type} lang={lang} /></TableCell>
                      <TableCell>{formatNumber(a._count.journalLines)}</TableCell>
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

// ============ Tab 2: Journal Entries ============
function JournalEntriesTab({ entries, isLoading, isError, refetch }: {
  entries: JournalEntry[]; isLoading: boolean; isError: boolean; refetch: () => void
}) {
  const { lang } = useAppStore()
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filteredEntries = useMemo(() => {
    let filtered = entries
    if (statusFilter !== 'all') filtered = filtered.filter(e => e.status === statusFilter)
    if (sourceFilter !== 'all') filtered = filtered.filter(e => e.sourceType === sourceFilter)
    if (dateFrom) filtered = filtered.filter(e => new Date(e.date) >= new Date(dateFrom))
    if (dateTo) filtered = filtered.filter(e => new Date(e.date) <= new Date(dateTo + 'T23:59:59'))
    return filtered
  }, [entries, statusFilter, sourceFilter, dateFrom, dateTo])

  // Extract unique source types
  const sourceTypes = useMemo(() => {
    const types = new Set<string>()
    entries.forEach(e => { if (e.sourceType) types.add(e.sourceType) })
    return Array.from(types).sort()
  }, [entries])

  if (selectedEntry) {
    return <JournalEntryDetail entry={selectedEntry} onBack={() => setSelectedEntry(null)} />
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[130px]">
              <Label className="text-xs">{t('الحالة', 'Status', lang)}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('الكل', 'All', lang)}</SelectItem>
                  <SelectItem value="DRAFT">{t('مسودة', 'Draft', lang)}</SelectItem>
                  <SelectItem value="POSTED">{t('مرحّل', 'Posted', lang)}</SelectItem>
                  <SelectItem value="CANCELLED">{t('ملغي', 'Cancelled', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[150px]">
              <Label className="text-xs">{t('نوع المصدر', 'Source Type', lang)}</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('الكل', 'All', lang)}</SelectItem>
                  {sourceTypes.map(st => (
                    <SelectItem key={st} value={st}>{sourceTypeLabels[st]?.[lang] || st}</SelectItem>
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
            {(statusFilter !== 'all' || sourceFilter !== 'all' || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="text-rose-600"
                onClick={() => { setStatusFilter('all'); setSourceFilter('all'); setDateFrom(''); setDateTo('') }}>
                {t('مسح الفلاتر', 'Clear Filters', lang)}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Read-only Notice */}
      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
        <Calculator className="size-4 shrink-0" />
        <span>{t(
          'القيود المحاسبية تنشأ تلقائياً من العمليات (فواتير، مستخلصات، مشتريات، مصروفات، تحصيلات، مدفوعات)',
          'Journal entries are automatically generated from operations (invoices, progress claims, purchases, expenses, receipts, payments)'
        , lang)}</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p>
          <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <FileText className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('لا توجد قيود', 'No entries found', lang)}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('رقم القيد', 'Entry No.', lang)}</TableHead>
                    <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                    <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                    <TableHead className="text-right">{t('المصدر', 'Source', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                    <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                    <TableHead className="text-right">{t('عرض', 'View', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map(e => (
                    <TableRow key={e.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setSelectedEntry(e)}>
                      <TableCell className="font-mono text-sm">{e.entryNo}</TableCell>
                      <TableCell className="text-sm">{formatDate(e.date, lang)}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{e.description || '—'}</TableCell>
                      <TableCell>
                        {e.sourceType ? (
                          <Badge variant="outline" className="text-xs">
                            {sourceTypeLabels[e.sourceType]?.[lang] || e.sourceType}
                          </Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell><JEStatusBadge status={e.status} lang={lang} /></TableCell>
                      <TableCell><MoneyDisplay value={e.totalDebit} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                      <TableCell><MoneyDisplay value={e.totalCredit} lang={lang} size="sm" className="text-rose-700" /></TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="text-emerald-600" onClick={(ev) => { ev.stopPropagation(); setSelectedEntry(e) }}>
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
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
  const [selectedAccountCode, setSelectedAccountCode] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: ledgerData, isLoading: loadingLedger, isError: ledgerError, refetch } = useQuery({
    queryKey: ['general-ledger', selectedAccountCode, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedAccountCode) params.set('accountCode', selectedAccountCode)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/general-ledger?${params.toString()}`)
      if (!res.ok) throw new Error()
      return res.json() as Promise<{ date: string; entryNo: string; description: string; debit: number; credit: number; balance: number }[]>
    },
    enabled: !!selectedAccountCode,
  })

  const selectedAccount = accounts.find(a => a.code === selectedAccountCode)

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">{t('الحساب', 'Account', lang)}</Label>
              <Select value={selectedAccountCode} onValueChange={setSelectedAccountCode}>
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
            {selectedAccountCode && (
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="size-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedAccount && ledgerData && (
        <Card className="border-emerald-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <h3 className="text-lg font-bold">
                  {selectedAccount.code} - {lang === 'ar' && selectedAccount.nameAr ? selectedAccount.nameAr : selectedAccount.name}
                </h3>
                <TypeBadge type={selectedAccount.type} lang={lang} />
              </div>
              {ledgerData.length > 0 && (
                <div className="text-center">
                  <p className="text-xs text-amber-600">{t('الرصيد الحالي', 'Current Balance', lang)}</p>
                  <MoneyDisplay
                    value={ledgerData[ledgerData.length - 1].balance}
                    lang={lang} bold size="lg"
                    className={ledgerData[ledgerData.length - 1].balance >= 0 ? 'text-amber-700' : 'text-teal-700'}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {loadingLedger ? (
        <TableSkeleton />
      ) : ledgerError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p>
          <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
        </div>
      ) : ledgerData && ledgerData.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <BookOpen className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('لا توجد حركات على هذا الحساب', 'No transactions for this account', lang)}</p>
        </div>
      ) : ledgerData ? (
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
                  {ledgerData.map((line, idx) => (
                    <TableRow key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50/30'}>
                      <TableCell className="text-sm">{formatDate(line.date, lang)}</TableCell>
                      <TableCell className="font-mono text-sm">{line.entryNo}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{line.description || '—'}</TableCell>
                      <TableCell>{line.debit > 0 ? <MoneyDisplay value={line.debit} lang={lang} size="sm" className="text-emerald-700" /> : '—'}</TableCell>
                      <TableCell>{line.credit > 0 ? <MoneyDisplay value={line.credit} lang={lang} size="sm" className="text-rose-700" /> : '—'}</TableCell>
                      <TableCell>
                        <MoneyDisplay
                          value={line.balance} lang={lang} size="sm" bold
                          className={line.balance >= 0 ? 'text-amber-700' : 'text-teal-700'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : !selectedAccountCode ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <ArrowUpDown className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('اختر حساباً لعرض حركاته', 'Select an account to view transactions', lang)}</p>
        </div>
      ) : null}
    </div>
  )
}

// ============ Tab 4: Trial Balance ============
function TrialBalanceTab() {
  const { lang } = useAppStore()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: trialBalance = [], isLoading, isError, refetch } = useQuery<TrialBalanceItem[]>({
    queryKey: ['trial-balance', dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/trial-balance?${params.toString()}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const totals = useMemo(() => ({
    netDebit: trialBalance.reduce((s, i) => s + i.netDebit, 0),
    netCredit: trialBalance.reduce((s, i) => s + i.netCredit, 0),
    totalDebit: trialBalance.reduce((s, i) => s + i.totalDebit, 0),
    totalCredit: trialBalance.reduce((s, i) => s + i.totalCredit, 0),
  }), [trialBalance])

  const isBalanced = Math.abs(totals.netDebit - totals.netCredit) < 0.01

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Balance Status */}
      {trialBalance.length > 0 && (
        <Card className={isBalanced ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}>
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className={`size-5 ${isBalanced ? 'text-emerald-600' : 'text-rose-600'}`} />
              <span className={`font-medium ${isBalanced ? 'text-emerald-800' : 'text-rose-800'}`}>
                {isBalanced ? t('الميزان متوازن ✓', 'Trial Balance is Balanced ✓', lang) : t('الميزان غير متوازن ✗', 'Trial Balance is NOT Balanced ✗', lang)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className={isBalanced ? 'text-emerald-700' : 'text-rose-700'}>
                {t('إجمالي المدين', 'Total Debit', lang)}: <MoneyDisplay value={totals.netDebit} lang={lang} size="sm" bold inline />
              </span>
              <span className={isBalanced ? 'text-emerald-700' : 'text-rose-700'}>
                {t('إجمالي الدائن', 'Total Credit', lang)}: <MoneyDisplay value={totals.netCredit} lang={lang} size="sm" bold inline />
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p>
          <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
        </div>
      ) : trialBalance.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Scale className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('لا توجد أرصدة', 'No balances found', lang)}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('كود الحساب', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('اسم الحساب', 'Account Name', lang)}</TableHead>
                    <TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead>
                    <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trialBalance.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{item.account.code}</TableCell>
                      <TableCell className="font-medium">
                        {lang === 'ar' && item.account.nameAr ? item.account.nameAr : item.account.name}
                      </TableCell>
                      <TableCell><TypeBadge type={item.account.type} lang={lang} /></TableCell>
                      <TableCell>
                        {item.netDebit > 0 ? <MoneyDisplay value={item.netDebit} lang={lang} size="sm" className="text-emerald-700" bold /> : '—'}
                      </TableCell>
                      <TableCell>
                        {item.netCredit > 0 ? <MoneyDisplay value={item.netCredit} lang={lang} size="sm" className="text-rose-700" bold /> : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total Row */}
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

// ============ Main Accounting Module ============
export function AccountingModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('chart-of-accounts')

  const { data: accounts = [], isLoading: loadingAccounts, refetch: refetchAccounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: entries = [], isLoading: loadingEntries, isError: entriesError, refetch: refetchEntries } = useQuery<JournalEntry[]>({
    queryKey: ['journal-entries'],
    queryFn: async () => {
      const res = await fetch('/api/journal-entries')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Initialize chart of accounts
  const initMutation = useMutation({
    mutationFn: () => fetch('/api/accounts/initialize', { method: 'POST' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }) },
  })

  return (
    <ModuleLayout
      title={{ ar: 'المحاسبة', en: 'Accounting' }}
      subtitle={{ ar: 'دليل الحسابات والقيود اليومية والميزان', en: 'Chart of Accounts, Journal Entries & Trial Balance' }}
      actions={
        <Button variant="outline" size="icon" onClick={() => { refetchAccounts(); refetchEntries() }}>
          <RefreshCw className="size-4" />
        </Button>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="chart-of-accounts" className="gap-1 text-xs sm:text-sm">
            <TreePine className="size-3.5" />
            {t('دليل الحسابات', 'Chart of Accounts', lang)}
          </TabsTrigger>
          <TabsTrigger value="journal-entries" className="gap-1 text-xs sm:text-sm">
            <FileText className="size-3.5" />
            {t('القيود اليومية', 'Journal Entries', lang)}
          </TabsTrigger>
          <TabsTrigger value="general-ledger" className="gap-1 text-xs sm:text-sm">
            <BookOpen className="size-3.5" />
            {t('اليومية العامة', 'General Ledger', lang)}
          </TabsTrigger>
          <TabsTrigger value="trial-balance" className="gap-1 text-xs sm:text-sm">
            <Scale className="size-3.5" />
            {t('ميزان المراجعة', 'Trial Balance', lang)}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chart-of-accounts">
          <ChartOfAccountsTab
            accounts={accounts}
            isLoading={loadingAccounts}
            onInitialize={() => initMutation.mutate()}
            isInitializing={initMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="journal-entries">
          <JournalEntriesTab
            entries={entries}
            isLoading={loadingEntries}
            isError={entriesError}
            refetch={refetchEntries}
          />
        </TabsContent>

        <TabsContent value="general-ledger">
          <GeneralLedgerTab accounts={accounts} />
        </TabsContent>

        <TabsContent value="trial-balance">
          <TrialBalanceTab />
        </TabsContent>
      </Tabs>
    </ModuleLayout>
  )
}

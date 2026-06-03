'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, RefreshCw, FileText, ChevronLeft, Eye, TreePine,
  ArrowUpDown, Calculator,
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
  status: string; createdAt: string
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

// ============ Source Type Labels ============
const sourceTypeLabels: Record<string, { ar: string; en: string }> = {
  'فواتير': { ar: 'فواتير', en: 'Invoices' },
  'مستخلصات': { ar: 'مستخلصات', en: 'Progress Claims' },
  'مشتريات': { ar: 'مشتريات', en: 'Purchases' },
  'مصروفات': { ar: 'مصروفات', en: 'Expenses' },
  'سداد ضريبة': { ar: 'سداد ضريبة', en: 'Tax Payments' },
  'قبض': { ar: 'قبض', en: 'Receipts' },
  'دفع': { ar: 'دفع', en: 'Payments' },
  'Invoices': { ar: 'فواتير', en: 'Invoices' },
  'Progress Claims': { ar: 'مستخلصات', en: 'Progress Claims' },
  'Purchases': { ar: 'مشتريات', en: 'Purchases' },
  'Expenses': { ar: 'مصروفات', en: 'Expenses' },
  'Tax Payments': { ar: 'سداد ضريبة', en: 'Tax Payments' },
  'Receipts': { ar: 'قبض', en: 'Receipts' },
  'Payments': { ar: 'دفع', en: 'Payments' },
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
        <div className="mr-auto"><JEStatusBadge status={entry.status} lang={lang} /></div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-gray-50"><CardContent className="p-3 text-center">
          <p className="text-xs text-gray-600">{lang === 'ar' ? 'التاريخ' : 'Date'}</p>
          <p className="font-semibold">{formatDate(entry.date, lang)}</p>
        </CardContent></Card>
        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center">
          <p className="text-xs text-emerald-600">{lang === 'ar' ? 'مدين' : 'Debit'}</p>
          <MoneyDisplay value={entry.totalDebit} lang={lang} bold className="text-emerald-700" />
        </CardContent></Card>
        <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center">
          <p className="text-xs text-rose-600">{lang === 'ar' ? 'دائن' : 'Credit'}</p>
          <MoneyDisplay value={entry.totalCredit} lang={lang} bold className="text-rose-700" />
        </CardContent></Card>
        <Card className="bg-gray-50"><CardContent className="p-3 text-center">
          <p className="text-xs text-gray-600">{lang === 'ar' ? 'عدد البنود' : 'Lines'}</p>
          <p className="font-semibold">{formatNumber(entry.lines.length)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{lang === 'ar' ? 'الحساب' : 'Account'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'مدين' : 'Debit'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'دائن' : 'Credit'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
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

// ============ Chart of Accounts Tree Node ============
function AccountTreeNode({ account, depth, lang }: { account: Account; depth: number; lang: 'ar' | 'en' }) {
  const cfg = typeConfig[account.type] || typeConfig.ASSET

  return (
    <>
      <TableRow className={`hover:bg-gray-50 ${depth > 0 ? '' : 'bg-gray-50/50'}`}>
        <TableCell>
          <span style={{ display: 'inline-block', width: `${depth * 20}px` }} />
          {depth > 0 && <span className="text-gray-300 ml-1 mr-1">└</span>}
          <span className="font-mono text-sm font-medium">{account.code}</span>
        </TableCell>
        <TableCell className="font-medium">
          {lang === 'ar' && account.nameAr ? account.nameAr : account.name}
          {lang === 'ar' && account.nameAr && (
            <span className="text-muted-foreground text-xs mr-1">({account.name})</span>
          )}
        </TableCell>
        <TableCell><TypeBadge type={account.type} lang={lang} /></TableCell>
        <TableCell>{formatNumber(account._count.journalLines)}</TableCell>
      </TableRow>
    </>
  )
}

// ============ Tab 1: Automatic Entries ============
function AutomaticEntriesTab({ entries, isLoading, isError, refetch }: {
  entries: JournalEntry[]; isLoading: boolean; isError: boolean; refetch: () => void
}) {
  const { lang } = useAppStore()
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Filter entries
  const filteredEntries = useMemo(() => {
    let filtered = entries
    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.status === statusFilter)
    }
    if (dateFrom) {
      filtered = filtered.filter(e => new Date(e.date) >= new Date(dateFrom))
    }
    if (dateTo) {
      filtered = filtered.filter(e => new Date(e.date) <= new Date(dateTo + 'T23:59:59'))
    }
    return filtered
  }, [entries, statusFilter, dateFrom, dateTo])

  if (selectedEntry) {
    return <JournalEntryDetail entry={selectedEntry} onBack={() => setSelectedEntry(null)} />
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs">{lang === 'ar' ? 'الحالة' : 'Status'}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{lang === 'ar' ? 'الكل' : 'All'}</SelectItem>
                  <SelectItem value="DRAFT">{lang === 'ar' ? 'مسودة' : 'Draft'}</SelectItem>
                  <SelectItem value="POSTED">{lang === 'ar' ? 'مرحّل' : 'Posted'}</SelectItem>
                  <SelectItem value="CANCELLED">{lang === 'ar' ? 'ملغي' : 'Cancelled'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs">{lang === 'ar' ? 'من تاريخ' : 'From Date'}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs">{lang === 'ar' ? 'إلى تاريخ' : 'To Date'}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" />
            </div>
            {(statusFilter !== 'all' || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600"
                onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo('') }}
              >
                {lang === 'ar' ? 'مسح الفلاتر' : 'Clear Filters'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Read-only Notice */}
      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
        <Calculator className="size-4 shrink-0" />
        <span>
          {lang === 'ar'
            ? 'القيود المحاسبية تنشأ تلقائياً من العمليات (فواتير، مستخلصات، مشتريات، مصروفات، سداد ضريبة، قبض، دفع)'
            : 'Journal entries are automatically generated from operations (invoices, progress claims, purchases, expenses, tax payments, receipts, payments)'}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}</p>
          <Button variant="outline" onClick={() => refetch()}>
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </Button>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <FileText className="size-12 text-gray-300" />
          <p className="text-muted-foreground">
            {lang === 'ar' ? 'لا توجد قيود' : 'No entries found'}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'رقم القيد' : 'Entry No.'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'مدين' : 'Debit'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'دائن' : 'Credit'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'عرض' : 'View'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map(e => (
                    <TableRow key={e.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setSelectedEntry(e)}>
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

// ============ Tab 2: Chart of Accounts ============
function ChartOfAccountsTab({ accounts, isLoading }: { accounts: Account[]; isLoading: boolean }) {
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

  // Flatten tree for rendering
  const flattenTree = (roots: Account[], depth: number): Account[] => {
    const result: Account[] = []
    for (const root of roots) {
      result.push({ ...root, depth } as Account & { depth: number })
      const children = childMap.get(root.id) || []
      if (children.length > 0) {
        result.push(...flattenTree(children.sort((a, b) => a.code.localeCompare(b.code)), depth + 1))
      }
    }
    return result
  }

  const flatAccounts = flattenTree(rootAccounts.sort((a, b) => a.code.localeCompare(b.code)), 0)

  // Group by type for summary
  const typeSummary = useMemo(() => {
    const summary: Record<string, number> = {}
    accounts.forEach(a => {
      summary[a.type] = (summary[a.type] || 0) + 1
    })
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

      {isLoading ? (
        <TableSkeleton />
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <TreePine className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{lang === 'ar' ? 'لا توجد حسابات' : 'No accounts found'}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'اسم الحساب' : 'Account Name'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'النوع' : 'Type'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'عدد القيود' : 'Entries'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flatAccounts.map(a => {
                    const depth = (a as Account & { depth: number }).depth || 0
                    return (
                      <AccountTreeNode
                        key={a.id}
                        account={a}
                        depth={depth}
                        lang={lang}
                      />
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Tab 3: Account Statement ============
function AccountStatementTab({ accounts }: { accounts: Account[] }) {
  const { lang } = useAppStore()
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: statement, isLoading: loadingStatement, isError: statementError, refetch } = useQuery<AccountStatement>({
    queryKey: ['account-statement', selectedAccountId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (dateFrom) params.set('startDate', dateFrom)
      if (dateTo) params.set('endDate', dateTo)
      const qs = params.toString()
      const url = `/api/accounts/${selectedAccountId}${qs ? `?${qs}` : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedAccountId,
  })

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)
  const isDebitNormal = selectedAccount?.type === 'ASSET' || selectedAccount?.type === 'EXPENSE'

  return (
    <div className="space-y-4">
      {/* Account Selection & Filters */}
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">{lang === 'ar' ? 'الحساب' : 'Account'}</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={lang === 'ar' ? 'اختر حساب' : 'Select account'} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.sort((a, b) => a.code.localeCompare(b.code)).map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {lang === 'ar' && a.nameAr ? a.nameAr : a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs">{lang === 'ar' ? 'من تاريخ' : 'From Date'}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs">{lang === 'ar' ? 'إلى تاريخ' : 'To Date'}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" />
            </div>
            {selectedAccountId && (
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="size-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      {selectedAccount && statement && (
        <>
          <Card className="border-emerald-200">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <h3 className="text-lg font-bold">
                    {selectedAccount.code} - {lang === 'ar' && selectedAccount.nameAr ? selectedAccount.nameAr : selectedAccount.name}
                  </h3>
                  <TypeBadge type={selectedAccount.type} lang={lang} />
                </div>
                <div className="flex gap-3">
                  <div className="text-center">
                    <p className="text-xs text-emerald-600">{lang === 'ar' ? 'إجمالي مدين' : 'Total Debit'}</p>
                    <MoneyDisplay value={statement.totalDebit} lang={lang} bold className="text-emerald-700" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-rose-600">{lang === 'ar' ? 'إجمالي دائن' : 'Total Credit'}</p>
                    <MoneyDisplay value={statement.totalCredit} lang={lang} bold className="text-rose-700" />
                  </div>
                  <Separator orientation="vertical" className="h-12" />
                  <div className="text-center">
                    <p className={`text-xs ${isDebitNormal ? 'text-amber-600' : 'text-teal-600'}`}>
                      {lang === 'ar' ? 'الرصيد الختامي' : 'Closing Balance'}
                    </p>
                    <MoneyDisplay
                      value={statement.closingBalance}
                      lang={lang}
                      bold
                      className={statement.closingBalance >= 0 ? 'text-amber-700' : 'text-teal-700'}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Statement Lines */}
          {loadingStatement ? (
            <TableSkeleton />
          ) : statementError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}</p>
              <Button variant="outline" onClick={() => refetch()}>
                {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
              </Button>
            </div>
          ) : statement.lines.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <BookOpen className="size-12 text-gray-300" />
              <p className="text-muted-foreground">
                {lang === 'ar' ? 'لا توجد حركات على هذا الحساب' : 'No transactions for this account'}
              </p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'رقم القيد' : 'Entry No.'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'مدين' : 'Debit'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'دائن' : 'Credit'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الرصيد' : 'Balance'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement.lines.map((line, idx) => (
                        <TableRow key={line.id} className={idx % 2 === 0 ? '' : 'bg-gray-50/30'}>
                          <TableCell className="font-mono text-sm">{line.entryNo}</TableCell>
                          <TableCell className="text-sm">{formatDate(line.date, lang)}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">
                            {line.lineDescription || line.description || '—'}
                          </TableCell>
                          <TableCell>
                            {line.debit > 0 ? <MoneyDisplay value={line.debit} lang={lang} size="sm" className="text-emerald-700" /> : '—'}
                          </TableCell>
                          <TableCell>
                            {line.credit > 0 ? <MoneyDisplay value={line.credit} lang={lang} size="sm" className="text-rose-700" /> : '—'}
                          </TableCell>
                          <TableCell>
                            <MoneyDisplay
                              value={line.balance}
                              lang={lang}
                              size="sm"
                              bold
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
          )}
        </>
      )}

      {/* Empty State */}
      {!selectedAccountId && (
        <div className="flex flex-col items-center gap-3 py-10">
          <ArrowUpDown className="size-12 text-gray-300" />
          <p className="text-muted-foreground">
            {lang === 'ar' ? 'اختر حساباً لعرض كشف الحساب' : 'Select an account to view its statement'}
          </p>
        </div>
      )}
    </div>
  )
}

// ============ Main Accounting Module ============
export function AccountingModule() {
  const { lang } = useAppStore()
  const [activeTab, setActiveTab] = useState('automatic-entries')

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'ar' ? 'المحاسبة' : 'Accounting'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === 'ar' ? 'القيود التلقائية وشجرة الحسابات' : 'Automatic Entries & Chart of Accounts'}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => { refetchAccounts(); refetchEntries() }}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="automatic-entries" className="gap-1 text-xs sm:text-sm">
            <FileText className="size-3.5" />
            {lang === 'ar' ? 'القيود التلقائية' : 'Auto Entries'}
          </TabsTrigger>
          <TabsTrigger value="chart-of-accounts" className="gap-1 text-xs sm:text-sm">
            <BookOpen className="size-3.5" />
            {lang === 'ar' ? 'شجرة الحسابات' : 'Chart of Accounts'}
          </TabsTrigger>
          <TabsTrigger value="account-statement" className="gap-1 text-xs sm:text-sm">
            <ArrowUpDown className="size-3.5" />
            {lang === 'ar' ? 'كشف حساب' : 'Statement'}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Automatic Entries */}
        <TabsContent value="automatic-entries">
          <AutomaticEntriesTab
            entries={entries}
            isLoading={loadingEntries}
            isError={entriesError}
            refetch={refetchEntries}
          />
        </TabsContent>

        {/* Tab 2: Chart of Accounts */}
        <TabsContent value="chart-of-accounts">
          <ChartOfAccountsTab accounts={accounts} isLoading={loadingAccounts} />
        </TabsContent>

        {/* Tab 3: Account Statement */}
        <TabsContent value="account-statement">
          <AccountStatementTab accounts={accounts} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

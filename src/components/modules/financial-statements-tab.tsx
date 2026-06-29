'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, FileText, Wallet, TrendingUp, TrendingDown, Scale,
  Building2, Layers, Percent, RefreshCw, Download, Banknote,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore, formatNumber, formatDate } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { PrintButton } from '@/components/shared/print-button'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { toast } from 'sonner'

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

// ============ Types ============
interface AccountBalance {
  accountId: string; code: string; name: string; nameAr: string | null
  type: string; accountRole: string | null; activityType: string | null
  totalDebit: number; totalCredit: number; balance: number
}
interface IncomeStatementData {
  revenue: { accounts: AccountBalance[]; total: number }
  expenses: { accounts: AccountBalance[]; total: number }
  grossProfit: number; netIncome: number; netProfitMargin: number
}
interface BalanceSheetData {
  assets: { accounts: AccountBalance[]; total: number }
  liabilities: { accounts: AccountBalance[]; total: number }
  equity: { accounts: AccountBalance[]; total: number }
  totalLiabilitiesAndEquity: number; isBalanced: boolean
}
interface TrialBalanceRow {
  accountId: string; code: string; name: string; nameAr: string | null
  type: string; totalDebit: number; totalCredit: number; balance: number
  netDebit: number; netCredit: number
}
interface CashFlowData {
  inflows: number; outflows: number; netCashFlow: number
  openingBalance: number; closingBalance: number
  byAccount: { code: string; name: string; nameAr: string | null; inflows: number; outflows: number; net: number }[]
  monthly: { month: string; inflows: number; outflows: number; net: number }[]
}
interface GeneralLedgerLine {
  date: string; entryNo: string; description: string | null; lineDescription: string | null
  debit: number; credit: number; balance: number; sourceType: string | null; costCenterCode: string | null
}
interface GeneralLedgerData {
  account: { id: string; code: string; name: string; nameAr: string | null; type: string }
  openingBalance: number; lines: GeneralLedgerLine[]
  totalDebit: number; totalCredit: number; closingBalance: number
  accounts?: { id: string; code: string; name: string; nameAr: string | null; type: string }[]
}
interface CostCenterData {
  costCenters: { costCenterId: string; code: string; name: string; revenue: number; costs: number; net: number }[]
  totals: { totalRevenue: number; totalCosts: number; totalNet: number }
}
interface VatReconData {
  outputVat: number; inputVat: number; netVatDue: number; vatSettlement: number
  outputAccounts: AccountBalance[]; inputAccounts: AccountBalance[]
}
interface ProjectWipRow {
  projectId: string; code: string; name: string; nameAr: string | null; client: string
  status: string; contractValue: number; estimatedTotalCost: number
  incurredCosts: number; recognizedRevenue: number; wipBalance: number
  contractAssetBalance: number; contractLiabilityBalance: number
  netWip: number; profitToDate: number; completionPercent: number
}

// ============ Shared bits ============
function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return <Card className="border-dashed"><CardContent className="flex flex-col items-center gap-3 py-12"><Icon className="size-12 text-gray-300" /><p className="text-muted-foreground text-sm">{message}</p></CardContent></Card>
}
function LoadingSkeleton({ count = 5 }: { count?: number }) {
  return <div className="space-y-2">{Array.from({ length: count }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />)}</div>
}
function SourceBadge({ lang }: { lang: 'ar' | 'en' }) {
  return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] gap-1"><span className="size-1.5 rounded-full bg-emerald-500" />{t('من القيود المرحّلة', 'From Posted JEs', lang)}</Badge>
}
function DateRangeFilter({ dateFrom, setDateFrom, dateTo, setDateTo, lang, onRefresh }: {
  dateFrom: string; setDateFrom: (v: string) => void; dateTo: string; setDateTo: (v: string) => void; lang: 'ar' | 'en'; onRefresh?: () => void
}) {
  return <Card className="bg-gray-50/50"><CardContent className="p-3 flex flex-wrap items-center gap-3">
    <Label className="text-sm">{t('من', 'From', lang)}</Label>
    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 h-8 text-sm" />
    <Label className="text-sm">{t('إلى', 'To', lang)}</Label>
    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 h-8 text-sm" />
    {onRefresh && <Button variant="outline" size="icon" className="size-8" onClick={onRefresh}><RefreshCw className="size-3.5" /></Button>}
  </CardContent></Card>
}
function acctName(a: { name: string; nameAr: string | null }, lang: 'ar' | 'en') { return lang === 'ar' ? (a.nameAr || a.name) : a.name }

// ========================================================
// MAIN: Financial Statements Tab
// ========================================================
export function FinancialStatementsTab({ lang }: { lang: 'ar' | 'en' }) {
  const [subTab, setSubTab] = useState('income-statement')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [accountId, setAccountId] = useState('')
  const [glAccountId, setGlAccountId] = useState('')

  const range = { from: dateFrom || undefined, to: dateTo || undefined }
  const qs = `dateFrom=${dateFrom}&dateTo=${dateTo}`

  // === Income Statement ===
  const { data: isData, isLoading: isLoading, refetch: refetchIS } = useQuery<IncomeStatementData>({
    queryKey: ['report-income-statement', dateFrom, dateTo],
    queryFn: async () => { const res = await fetch(`/api/reports/income-statement?${qs}`); if (!res.ok) throw new Error(); return res.json() },
  })

  // === Balance Sheet ===
  const { data: bsData, isLoading: bsLoading, refetch: refetchBS } = useQuery<BalanceSheetData>({
    queryKey: ['report-balance-sheet', dateTo],
    queryFn: async () => { const res = await fetch(`/api/reports/balance-sheet?asOf=${dateTo}`); if (!res.ok) throw new Error(); return res.json() },
  })

  // === Trial Balance ===
  const { data: tbData, isLoading: tbLoading, refetch: refetchTB } = useQuery<{ rows: TrialBalanceRow[]; totals: { totalDebit: number; totalCredit: number; totalNetDebit: number; totalNetCredit: number; isBalanced: boolean } }>({
    queryKey: ['report-trial-balance', dateFrom, dateTo],
    queryFn: async () => { const res = await fetch(`/api/reports/trial-balance?${qs}`); if (!res.ok) throw new Error(); return res.json() },
  })

  // === Cash Flow Statement ===
  const { data: cfData, isLoading: cfLoading, refetch: refetchCF } = useQuery<CashFlowData>({
    queryKey: ['report-cash-flow-statement', dateFrom, dateTo],
    queryFn: async () => { const res = await fetch(`/api/reports/cash-flow-statement?${qs}`); if (!res.ok) throw new Error(); return res.json() },
  })

  // === General Ledger (needs account list + selected account) ===
  const { data: glData, isLoading: glLoading, refetch: refetchGL } = useQuery<GeneralLedgerData>({
    queryKey: ['report-general-ledger', glAccountId, dateFrom, dateTo],
    queryFn: async () => { const res = await fetch(`/api/reports/general-ledger?accountId=${glAccountId}&${qs}`); if (!res.ok) throw new Error(); return res.json() },
    enabled: !!glAccountId,
  })

  // === Account Statement (uses same endpoint as GL, different label) ===
  const { data: asData, isLoading: asLoading, refetch: refetchAS } = useQuery<GeneralLedgerData>({
    queryKey: ['report-account-statement', accountId, dateFrom, dateTo],
    queryFn: async () => { const res = await fetch(`/api/reports/account-statement?accountId=${accountId}&${qs}`); if (!res.ok) throw new Error(); return res.json() },
    enabled: !!accountId,
  })

  // === Chart of Accounts for dropdowns (GL + Account Statement) ===
  // تم إصلاح خطأ اختفاء دليل الحسابات من القوائم المنسدلة:
  // كان الكود السابق يعتمد على glData?.accounts / asData?.accounts التي لا تُرجع
  // إلا بعد اختيار حساب (chicken-and-egg). الآن نجلب الدليل بشكل مستقل.
  const { data: chartOfAccounts = [] } = useQuery<Array<{ id: string; code: string; name: string; nameAr: string | null; type: string }>>({
    queryKey: ['chart-of-accounts-posting'],
    queryFn: async () => {
      const res = await fetch('/api/accounts/by-role?role=__ALL_POSTING__')
      if (!res.ok) throw new Error()
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // cache 5 minutes
  })

  // === Cost Center Report ===
  const { data: ccData, isLoading: ccLoading, refetch: refetchCC } = useQuery<CostCenterData>({
    queryKey: ['report-cost-center', dateFrom, dateTo],
    queryFn: async () => { const res = await fetch(`/api/reports/cost-center-report?${qs}`); if (!res.ok) throw new Error(); return res.json() },
  })

  // === Project WIP ===
  const { data: wipData, isLoading: wipLoading, refetch: refetchWIP } = useQuery<{ rows: ProjectWipRow[]; totals: { contractValue: number; incurredCosts: number; recognizedRevenue: number; netWip: number; profitToDate: number } }>({
    queryKey: ['report-project-wip', dateFrom, dateTo],
    queryFn: async () => { const res = await fetch(`/api/reports/project-wip?${qs}`); if (!res.ok) throw new Error(); return res.json() },
  })

  // === VAT Reconciliation ===
  const { data: vatData, isLoading: vatLoading, refetch: refetchVAT } = useQuery<VatReconData>({
    queryKey: ['report-vat-recon', dateFrom, dateTo],
    queryFn: async () => { const res = await fetch(`/api/reports/vat-reconciliation?${qs}`); if (!res.ok) throw new Error(); return res.json() },
  })

  // === Export handlers ===
  const exportIS = useCallback(() => {
    if (!isData) return
    const rows = [...isData.revenue.accounts, ...isData.expenses.accounts]
    const cols: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('الحساب', 'Account', lang) },
      { key: 'type', label: t('النوع', 'Type', lang) },
      { key: 'balance', label: t('الرصيد', 'Balance', lang), format: v => (Number(v) || 0).toFixed(2) },
    ]
    exportToCSV(rows as unknown as Record<string, unknown>[], 'income-statement', cols)
    toast.success(t('تم التصدير', 'Exported', lang))
  }, [isData, lang])

  const exportBS = useCallback(() => {
    if (!bsData) return
    const rows = [...bsData.assets.accounts, ...bsData.liabilities.accounts, ...bsData.equity.accounts]
    const cols: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('الحساب', 'Account', lang) },
      { key: 'type', label: t('النوع', 'Type', lang) },
      { key: 'balance', label: t('الرصيد', 'Balance', lang), format: v => (Number(v) || 0).toFixed(2) },
    ]
    exportToCSV(rows as unknown as Record<string, unknown>[], 'balance-sheet', cols)
    toast.success(t('تم التصدير', 'Exported', lang))
  }, [bsData, lang])

  const exportTB = useCallback(() => {
    if (!tbData?.rows) return
    const cols: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('الحساب', 'Account', lang) },
      { key: 'netDebit', label: t('مدين', 'Debit', lang), format: v => (Number(v) || 0).toFixed(2) },
      { key: 'netCredit', label: t('دائن', 'Credit', lang), format: v => (Number(v) || 0).toFixed(2) },
    ]
    exportToCSV(tbData.rows as unknown as Record<string, unknown>[], 'trial-balance', cols)
  }, [tbData, lang])

  const exportCC = useCallback(() => {
    if (!ccData?.costCenters) return
    const cols: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('مركز التكلفة', 'Cost Center', lang) },
      { key: 'revenue', label: t('الإيراد', 'Revenue', lang), format: v => (Number(v) || 0).toFixed(2) },
      { key: 'costs', label: t('التكاليف', 'Costs', lang), format: v => (Number(v) || 0).toFixed(2) },
      { key: 'net', label: t('الصافي', 'Net', lang), format: v => (Number(v) || 0).toFixed(2) },
    ]
    exportToCSV(ccData.costCenters as Record<string, unknown>[], 'cost-center-report', cols)
  }, [ccData, lang])

  const exportWIP = useCallback(() => {
    if (!wipData?.rows) return
    const cols: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('المشروع', 'Project', lang) },
      { key: 'contractValue', label: t('قيمة العقد', 'Contract', lang), format: v => (Number(v) || 0).toFixed(2) },
      { key: 'incurredCosts', label: t('التكاليف', 'Costs', lang), format: v => (Number(v) || 0).toFixed(2) },
      { key: 'recognizedRevenue', label: t('الإيراد', 'Revenue', lang), format: v => (Number(v) || 0).toFixed(2) },
      { key: 'netWip', label: t('صافي WIP', 'Net WIP', lang), format: v => (Number(v) || 0).toFixed(2) },
      { key: 'completionPercent', label: t('نسبة الإنجاز %', 'Completion %', lang), format: v => (Number(v) || 0).toFixed(1) },
    ]
    exportToCSV(wipData.rows as unknown as Record<string, unknown>[], 'project-wip', cols)
  }, [wipData, lang])

  const exportVAT = useCallback(() => {
    if (!vatData) return
    const rows = [
      { type: t('ضريبة المخرجات', 'Output VAT', lang), amount: vatData.outputVat },
      { type: t('ضريبة المدخلات', 'Input VAT', lang), amount: vatData.inputVat },
      { type: t('صافي الضريبة المستحقة', 'Net VAT Due', lang), amount: vatData.netVatDue },
    ]
    const cols: CSVColumn[] = [
      { key: 'type', label: t('البند', 'Item', lang) },
      { key: 'amount', label: t('المبلغ', 'Amount', lang), format: v => (Number(v) || 0).toFixed(2) },
    ]
    exportToCSV(rows as Record<string, unknown>[], 'vat-reconciliation', cols)
  }, [vatData, lang])

  return (
    <div className="space-y-4">
      {/* Global source banner */}
      <Card className="bg-emerald-50/50 border-emerald-200">
        <CardContent className="p-3 flex items-center gap-2 text-sm">
          <BookOpen className="size-4 text-emerald-600" />
          <span className="text-emerald-800 font-medium">{t('جميع التقارير المالية مصدرها قيود اليومية المرحّلة فقط', 'All financial reports are sourced exclusively from posted journal entries', lang)}</span>
        </CardContent>
      </Card>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid grid-cols-3 lg:grid-cols-9 w-full h-auto">
          <TabsTrigger value="income-statement" className="text-xs">{t('قائمة الدخل', 'Income', lang)}</TabsTrigger>
          <TabsTrigger value="balance-sheet" className="text-xs">{t('الميزانية', 'Balance', lang)}</TabsTrigger>
          <TabsTrigger value="trial-balance" className="text-xs">{t('ميزان المراجعة', 'Trial Bal.', lang)}</TabsTrigger>
          <TabsTrigger value="cash-flow" className="text-xs">{t('التدفق النقدي', 'Cash Flow', lang)}</TabsTrigger>
          <TabsTrigger value="general-ledger" className="text-xs">{t('الأستاذ العام', 'Gen. Ledger', lang)}</TabsTrigger>
          <TabsTrigger value="account-statement" className="text-xs">{t('كشف حساب', 'Acct. Stmt', lang)}</TabsTrigger>
          <TabsTrigger value="cost-center" className="text-xs">{t('مراكز التكلفة', 'Cost Centers', lang)}</TabsTrigger>
          <TabsTrigger value="project-wip" className="text-xs">{t('الأعمال تحت التنفيذ', 'WIP', lang)}</TabsTrigger>
          <TabsTrigger value="vat-recon" className="text-xs">{t('مطابقة الضريبة', 'VAT Recon', lang)}</TabsTrigger>
        </TabsList>

        {/* ===== Income Statement ===== */}
        <TabsContent value="income-statement" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2"><TrendingUp className="size-5 text-emerald-600" /><h3 className="font-semibold text-base">{t('قائمة الدخل', 'Income Statement', lang)}</h3><SourceBadge lang={lang} /></div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon" className="size-8" onClick={() => refetchIS()}><RefreshCw className="size-3.5" /></Button>
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={exportIS}><Download className="size-3.5" />{t('تصدير', 'Export', lang)}</Button>
              {isData && <PrintButton type="generic-table" size="sm" className="gap-1 h-8 text-xs" data={{
                columns: [{ key: 'code', label: t('الكود', 'Code', lang) }, { key: 'name', label: t('الحساب', 'Account', lang) }, { key: 'balance', label: t('الرصيد', 'Balance', lang), align: 'amount' }],
                rows: [...isData.revenue.accounts, ...isData.expenses.accounts],
                totals: [
                  { label: t('إجمالي الإيرادات', 'Total Revenue', lang), value: isData.revenue.total },
                  { label: t('إجمالي المصروفات', 'Total Expenses', lang), value: isData.expenses.total },
                  { label: t('صافي الدخل', 'Net Income', lang), value: isData.netIncome, isGrand: true },
                ],
                title: t('قائمة الدخل', 'Income Statement', lang),
              } as Record<string, unknown>} />}
            </div>
          </div>
          <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} lang={lang} />
          {isLoading ? <LoadingSkeleton /> : isData ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('الإيرادات', 'Revenue', lang)}</p><MoneyDisplay value={isData.revenue.total} lang={lang} size="md" bold className="text-emerald-700" /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('المصروفات', 'Expenses', lang)}</p><MoneyDisplay value={isData.expenses.total} lang={lang} size="md" bold className="text-rose-700" /></CardContent></Card>
                <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('مجمل الربح', 'Gross Profit', lang)}</p><MoneyDisplay value={isData.grossProfit} lang={lang} size="md" bold className="text-cyan-700" /></CardContent></Card>
                <Card className={`${isData.netIncome >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('صافي الدخل', 'Net Income', lang)}</p><MoneyDisplay value={isData.netIncome} lang={lang} size="md" bold className={isData.netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'} /><p className="text-xs text-muted-foreground mt-1">{formatNumber(Math.round(isData.netProfitMargin))}%</p></CardContent></Card>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card><CardHeader className="pb-3"><CardTitle className="text-base text-emerald-800">{t('الإيرادات', 'Revenue', lang)}</CardTitle></CardHeader>
                  <CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead><TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead></TableRow></TableHeader>
                    <TableBody>{isData.revenue.accounts.filter(a => Math.abs(a.balance) > 0.01).map(a => (
                      <TableRow key={a.accountId}><TableCell className="font-mono text-xs">{a.code}</TableCell><TableCell className="text-sm">{acctName(a, lang)}</TableCell><TableCell><MoneyDisplay value={a.balance} lang={lang} size="xs" bold inline showSymbol={false} className="text-emerald-700" /></TableCell></TableRow>
                    ))}{isData.revenue.accounts.filter(a => Math.abs(a.balance) > 0.01).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-6">{t('لا توجد إيرادات', 'No revenue', lang)}</TableCell></TableRow>}</TableBody>
                  </Table></div></CardContent></Card>
                <Card><CardHeader className="pb-3"><CardTitle className="text-base text-rose-800">{t('المصروفات', 'Expenses', lang)}</CardTitle></CardHeader>
                  <CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead><TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead></TableRow></TableHeader>
                    <TableBody>{isData.expenses.accounts.filter(a => Math.abs(a.balance) > 0.01).map(a => (
                      <TableRow key={a.accountId}><TableCell className="font-mono text-xs">{a.code}</TableCell><TableCell className="text-sm">{acctName(a, lang)}</TableCell><TableCell><MoneyDisplay value={a.balance} lang={lang} size="xs" bold inline showSymbol={false} className="text-rose-700" /></TableCell></TableRow>
                    ))}{isData.expenses.accounts.filter(a => Math.abs(a.balance) > 0.01).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-6">{t('لا توجد مصروفات', 'No expenses', lang)}</TableCell></TableRow>}</TableBody>
                  </Table></div></CardContent></Card>
              </div>
            </>
          ) : <EmptyState icon={TrendingUp} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>

        {/* ===== Balance Sheet ===== */}
        <TabsContent value="balance-sheet" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2"><Scale className="size-5 text-emerald-600" /><h3 className="font-semibold text-base">{t('الميزانية العمومية', 'Balance Sheet', lang)}</h3><SourceBadge lang={lang} /></div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon" className="size-8" onClick={() => refetchBS()}><RefreshCw className="size-3.5" /></Button>
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={exportBS}><Download className="size-3.5" />{t('تصدير', 'Export', lang)}</Button>
            </div>
          </div>
          <Card className="bg-gray-50/50"><CardContent className="p-3 flex flex-wrap items-center gap-3">
            <Label className="text-sm">{t('كما في تاريخ', 'As of', lang)}</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 h-8 text-sm" />
          </CardContent></Card>
          {bsLoading ? <LoadingSkeleton /> : bsData ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('الأصول', 'Assets', lang)}</p><MoneyDisplay value={bsData.assets.total} lang={lang} size="md" bold className="text-emerald-700" /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('الخصوم', 'Liabilities', lang)}</p><MoneyDisplay value={bsData.liabilities.total} lang={lang} size="md" bold className="text-rose-700" /></CardContent></Card>
                <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('حقوق الملكية', 'Equity', lang)}</p><MoneyDisplay value={bsData.equity.total} lang={lang} size="md" bold className="text-cyan-700" /></CardContent></Card>
                <Card className={`${bsData.isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('المعادلة', 'Equation', lang)}</p><Badge className={`${bsData.isBalanced ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} border-0 mt-1`}>{bsData.isBalanced ? t('✓ متوازنة', '✓ Balanced', lang) : t('⚠ غير متوازنة', '⚠ Unbalanced', lang)}</Badge></CardContent></Card>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {([['assets', t('الأصول', 'Assets', lang), 'emerald'], ['liabilities', t('الخصوم', 'Liabilities', lang), 'rose'], ['equity', t('حقوق الملكية', 'Equity', lang), 'cyan']] as const).map(([key, title, color]) => {
                  const section = bsData[key]
                  return <Card key={key}><CardHeader className="pb-3"><CardTitle className={`text-base text-${color}-800`}>{title}</CardTitle></CardHeader>
                    <CardContent className="p-0"><div className="overflow-x-auto max-h-80 overflow-y-auto"><Table>
                      <TableHeader><TableRow><TableHead className="text-right text-xs">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right text-xs">{t('الحساب', 'Account', lang)}</TableHead><TableHead className="text-right text-xs">{t('الرصيد', 'Balance', lang)}</TableHead></TableRow></TableHeader>
                      <TableBody>{section.accounts.filter(a => Math.abs(a.balance) > 0.01).map(a => (
                        <TableRow key={a.accountId}><TableCell className="font-mono text-xs">{a.code}</TableCell><TableCell className="text-sm">{acctName(a, lang)}</TableCell><TableCell><MoneyDisplay value={a.balance} lang={lang} size="xs" bold inline showSymbol={false} className={`text-${color}-700`} /></TableCell></TableRow>
                      ))}{section.accounts.filter(a => Math.abs(a.balance) > 0.01).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-6">{t('لا توجد أرصدة', 'No balances', lang)}</TableCell></TableRow>}</TableBody>
                    </Table></div>
                    <div className={`p-3 bg-${color}-50 flex justify-between font-semibold`}><span>{t('الإجمالي', 'Total', lang)}</span><MoneyDisplay value={section.total} lang={lang} size="sm" bold className={`text-${color}-700`} /></div>
                    </CardContent></Card>
                })}
              </div>
            </>
          ) : <EmptyState icon={Scale} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>

        {/* ===== Trial Balance ===== */}
        <TabsContent value="trial-balance" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2"><BookOpen className="size-5 text-emerald-600" /><h3 className="font-semibold text-base">{t('ميزان المراجعة', 'Trial Balance', lang)}</h3><SourceBadge lang={lang} /></div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon" className="size-8" onClick={() => refetchTB()}><RefreshCw className="size-3.5" /></Button>
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={exportTB}><Download className="size-3.5" />{t('تصدير', 'Export', lang)}</Button>
            </div>
          </div>
          <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} lang={lang} />
          {tbLoading ? <LoadingSkeleton /> : tbData?.rows && tbData.rows.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('إجمالي مدين', 'Total Debit', lang)}</p><MoneyDisplay value={tbData.totals.totalNetDebit} lang={lang} size="md" bold /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('إجمالي دائن', 'Total Credit', lang)}</p><MoneyDisplay value={tbData.totals.totalNetCredit} lang={lang} size="md" bold /></CardContent></Card>
                <Card className={`${tbData.totals.isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('الحالة', 'Status', lang)}</p><Badge className={`${tbData.totals.isBalanced ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} border-0 mt-1`}>{tbData.totals.isBalanced ? t('✓ متوازن', '✓ Balanced', lang) : t('⚠ غير متوازن', '⚠ Unbalanced', lang)}</Badge></CardContent></Card>
              </div>
              <Card><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
                <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead><TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead><TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead></TableRow></TableHeader>
                <TableBody>{tbData.rows.map(r => (
                  <TableRow key={r.accountId}><TableCell className="font-mono text-xs">{r.code}</TableCell><TableCell className="text-sm">{acctName(r, lang)}</TableCell>
                    <TableCell>{r.netDebit > 0 ? <MoneyDisplay value={r.netDebit} lang={lang} size="xs" bold inline showSymbol={false} /> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                    <TableCell>{r.netCredit > 0 ? <MoneyDisplay value={r.netCredit} lang={lang} size="xs" bold inline showSymbol={false} /> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></div></CardContent></Card>
            </>
          ) : <EmptyState icon={BookOpen} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>

        {/* ===== Cash Flow Statement ===== */}
        <TabsContent value="cash-flow" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2"><Banknote className="size-5 text-emerald-600" /><h3 className="font-semibold text-base">{t('قائمة التدفقات النقدية', 'Cash Flow Statement', lang)}</h3><SourceBadge lang={lang} /></div>
            <Button variant="outline" size="icon" className="size-8" onClick={() => refetchCF()}><RefreshCw className="size-3.5" /></Button>
          </div>
          <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} lang={lang} />
          {cfLoading ? <LoadingSkeleton /> : cfData ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('التدقات الداخلة', 'Inflows', lang)}</p><MoneyDisplay value={cfData.inflows} lang={lang} size="md" bold className="text-emerald-700" /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('التدفقات الخارجة', 'Outflows', lang)}</p><MoneyDisplay value={cfData.outflows} lang={lang} size="md" bold className="text-rose-700" /></CardContent></Card>
                <Card className={`${cfData.netCashFlow >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('صافي التدفق', 'Net Flow', lang)}</p><MoneyDisplay value={cfData.netCashFlow} lang={lang} size="md" bold className={cfData.netCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></CardContent></Card>
                <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('الرصيد الختامي', 'Closing', lang)}</p><MoneyDisplay value={cfData.closingBalance} lang={lang} size="md" bold className="text-cyan-700" /></CardContent></Card>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">{t('حسب الحساب', 'By Account', lang)}</CardTitle></CardHeader>
                  <CardContent className="p-0"><div className="overflow-x-auto max-h-80 overflow-y-auto"><Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead><TableHead className="text-right">{t('داخل', 'In', lang)}</TableHead><TableHead className="text-right">{t('خارج', 'Out', lang)}</TableHead></TableRow></TableHeader>
                    <TableBody>{cfData.byAccount.map(a => (
                      <TableRow key={a.code}><TableCell className="font-mono text-xs">{a.code}</TableCell><TableCell className="text-sm">{acctName(a, lang)}</TableCell><TableCell><MoneyDisplay value={a.inflows} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell><TableCell><MoneyDisplay value={a.outflows} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell></TableRow>
                    ))}</TableBody>
                  </Table></div></CardContent></Card>
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">{t('شهري', 'Monthly', lang)}</CardTitle></CardHeader>
                  <CardContent className="p-0"><div className="overflow-x-auto max-h-80 overflow-y-auto"><Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('الشهر', 'Month', lang)}</TableHead><TableHead className="text-right">{t('داخل', 'In', lang)}</TableHead><TableHead className="text-right">{t('خارج', 'Out', lang)}</TableHead><TableHead className="text-right">{t('صافي', 'Net', lang)}</TableHead></TableRow></TableHeader>
                    <TableBody>{cfData.monthly.map(m => (
                      <TableRow key={m.month}><TableCell className="font-mono text-sm">{m.month}</TableCell><TableCell><MoneyDisplay value={m.inflows} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell><TableCell><MoneyDisplay value={m.outflows} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell><TableCell><MoneyDisplay value={m.net} lang={lang} size="xs" bold inline showSymbol={false} className={m.net >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></TableCell></TableRow>
                    ))}{cfData.monthly.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-6">{t('لا توجد بيانات', 'No data', lang)}</TableCell></TableRow>}</TableBody>
                  </Table></div></CardContent></Card>
              </div>
            </>
          ) : <EmptyState icon={Banknote} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>

        {/* ===== General Ledger ===== */}
        <TabsContent value="general-ledger" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2"><BookOpen className="size-5 text-emerald-600" /><h3 className="font-semibold text-base">{t('دفتر الأستاذ العام', 'General Ledger', lang)}</h3><SourceBadge lang={lang} /></div>
            <Button variant="outline" size="icon" className="size-8" onClick={() => refetchGL()}><RefreshCw className="size-3.5" /></Button>
          </div>
          <Card className="bg-gray-50/50"><CardContent className="p-3 flex flex-wrap items-center gap-3">
            <Label className="text-sm">{t('الحساب', 'Account', lang)}</Label>
            <Select value={glAccountId} onValueChange={setGlAccountId}>
              <SelectTrigger className="w-72"><SelectValue placeholder={t('اختر حساباً...', 'Select account...', lang)} /></SelectTrigger>
              <SelectContent>
                {chartOfAccounts.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">{t('جاري تحميل الحسابات...', 'Loading accounts...', lang)}</div>
                ) : (
                  chartOfAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {acctName(a, lang)}</SelectItem>)
                )}
              </SelectContent>
            </Select>
          </CardContent></Card>
          {!glAccountId ? <EmptyState icon={BookOpen} message={t('اختر حساباً لعرض دفتر الأستاذ', 'Select an account to view the ledger', lang)} />
            : glLoading ? <LoadingSkeleton />
            : glData ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3 text-center"><p className="text-xs text-amber-600">{t('رصيد افتتاحي', 'Opening', lang)}</p><MoneyDisplay value={glData.openingBalance} lang={lang} size="md" bold /></CardContent></Card>
                  <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('إجمالي حركة', 'Movement', lang)}</p><MoneyDisplay value={glData.totalDebit - glData.totalCredit} lang={lang} size="md" bold /></CardContent></Card>
                  <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('رصيد ختامي', 'Closing', lang)}</p><MoneyDisplay value={glData.closingBalance} lang={lang} size="md" bold className="text-emerald-700" /></CardContent></Card>
                </div>
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">{glData.account.code} - {acctName(glData.account, lang)}</CardTitle></CardHeader>
                  <CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead><TableHead className="text-right">{t('رقم القيد', 'Entry No', lang)}</TableHead><TableHead className="text-right">{t('البيان', 'Description', lang)}</TableHead><TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead><TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead><TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      <TableRow className="bg-gray-50"><TableCell colSpan={5} className="font-semibold text-sm">{t('رصيد افتتاحي', 'Opening Balance', lang)}</TableCell><TableCell><MoneyDisplay value={glData.openingBalance} lang={lang} size="xs" bold inline showSymbol={false} /></TableCell></TableRow>
                      {glData.lines.map((l, i) => (
                        <TableRow key={i}><TableCell className="text-xs">{formatDate(l.date, lang)}</TableCell><TableCell className="font-mono text-xs">{l.entryNo}</TableCell><TableCell className="text-sm">{l.lineDescription || l.description || '-'}</TableCell><TableCell><MoneyDisplay value={l.debit} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell><TableCell><MoneyDisplay value={l.credit} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell><TableCell><MoneyDisplay value={l.balance} lang={lang} size="xs" bold inline showSymbol={false} /></TableCell></TableRow>
                      ))}{glData.lines.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-6">{t('لا توجد حركات', 'No movements', lang)}</TableCell></TableRow>}
                    </TableBody>
                  </Table></div></CardContent></Card>
              </>
            ) : null}
        </TabsContent>

        {/* ===== Account Statement ===== */}
        <TabsContent value="account-statement" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2"><FileText className="size-5 text-emerald-600" /><h3 className="font-semibold text-base">{t('كشف حساب', 'Account Statement', lang)}</h3><SourceBadge lang={lang} /></div>
            <Button variant="outline" size="icon" className="size-8" onClick={() => refetchAS()}><RefreshCw className="size-3.5" /></Button>
          </div>
          <Card className="bg-gray-50/50"><CardContent className="p-3 flex flex-wrap items-center gap-3">
            <Label className="text-sm">{t('الحساب', 'Account', lang)}</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-72"><SelectValue placeholder={t('اختر حساباً...', 'Select account...', lang)} /></SelectTrigger>
              <SelectContent>
                {chartOfAccounts.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">{t('جاري تحميل الحسابات...', 'Loading accounts...', lang)}</div>
                ) : (
                  chartOfAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} - {acctName(a, lang)}</SelectItem>)
                )}
              </SelectContent>
            </Select>
          </CardContent></Card>
          {!accountId ? <EmptyState icon={FileText} message={t('اختر حساباً لعرض كشف الحساب', 'Select an account to view its statement', lang)} />
            : asLoading ? <LoadingSkeleton />
            : asData ? (
              <Card><CardHeader className="pb-3"><CardTitle className="text-base">{asData.account.code} - {acctName(asData.account, lang)}</CardTitle></CardHeader>
                <CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
                  <TableHeader><TableRow><TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead><TableHead className="text-right">{t('رقم القيد', 'Entry No', lang)}</TableHead><TableHead className="text-right">{t('البيان', 'Description', lang)}</TableHead><TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead><TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead><TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow className="bg-gray-50"><TableCell colSpan={5} className="font-semibold text-sm">{t('رصيد افتتاحي', 'Opening Balance', lang)}</TableCell><TableCell><MoneyDisplay value={asData.openingBalance} lang={lang} size="xs" bold inline showSymbol={false} /></TableCell></TableRow>
                    {asData.lines.map((l, i) => (
                      <TableRow key={i}><TableCell className="text-xs">{formatDate(l.date, lang)}</TableCell><TableCell className="font-mono text-xs">{l.entryNo}</TableCell><TableCell className="text-sm">{l.lineDescription || l.description || '-'}</TableCell><TableCell><MoneyDisplay value={l.debit} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell><TableCell><MoneyDisplay value={l.credit} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell><TableCell><MoneyDisplay value={l.balance} lang={lang} size="xs" bold inline showSymbol={false} /></TableCell></TableRow>
                    ))}{asData.lines.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-6">{t('لا توجد حركات', 'No movements', lang)}</TableCell></TableRow>}
                    <TableRow className="bg-emerald-50 font-semibold"><TableCell colSpan={3}>{t('الإجمالي', 'Total', lang)}</TableCell><TableCell><MoneyDisplay value={asData.totalDebit} lang={lang} size="xs" bold inline showSymbol={false} className="text-emerald-700" /></TableCell><TableCell><MoneyDisplay value={asData.totalCredit} lang={lang} size="xs" bold inline showSymbol={false} className="text-rose-700" /></TableCell><TableCell><MoneyDisplay value={asData.closingBalance} lang={lang} size="xs" bold inline showSymbol={false} className="text-emerald-700" /></TableCell></TableRow>
                  </TableBody>
                </Table></div></CardContent></Card>
            ) : null}
        </TabsContent>

        {/* ===== Cost Center Report ===== */}
        <TabsContent value="cost-center" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2"><Layers className="size-5 text-emerald-600" /><h3 className="font-semibold text-base">{t('تقرير مراكز التكلفة', 'Cost Center Report', lang)}</h3><SourceBadge lang={lang} /></div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon" className="size-8" onClick={() => refetchCC()}><RefreshCw className="size-3.5" /></Button>
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={exportCC}><Download className="size-3.5" />{t('تصدير', 'Export', lang)}</Button>
            </div>
          </div>
          <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} lang={lang} />
          {ccLoading ? <LoadingSkeleton /> : ccData?.costCenters && ccData.costCenters.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('إجمالي الإيرادات', 'Total Revenue', lang)}</p><MoneyDisplay value={ccData.totals.totalRevenue} lang={lang} size="md" bold className="text-emerald-700" /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('إجمالي التكاليف', 'Total Costs', lang)}</p><MoneyDisplay value={ccData.totals.totalCosts} lang={lang} size="md" bold className="text-rose-700" /></CardContent></Card>
                <Card className={`${ccData.totals.totalNet >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('صافي الربح/الخسارة', 'Net P/L', lang)}</p><MoneyDisplay value={ccData.totals.totalNet} lang={lang} size="md" bold className={ccData.totals.totalNet >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></CardContent></Card>
              </div>
              <Card><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
                <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('مركز التكلفة', 'Cost Center', lang)}</TableHead><TableHead className="text-right">{t('الإيراد', 'Revenue', lang)}</TableHead><TableHead className="text-right">{t('التكاليف', 'Costs', lang)}</TableHead><TableHead className="text-right">{t('الصافي', 'Net', lang)}</TableHead></TableRow></TableHeader>
                <TableBody>{ccData.costCenters.map(c => (
                  <TableRow key={c.costCenterId}><TableCell className="font-mono text-xs">{c.code}</TableCell><TableCell className="text-sm">{c.name}</TableCell><TableCell><MoneyDisplay value={c.revenue} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell><TableCell><MoneyDisplay value={c.costs} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell><TableCell><MoneyDisplay value={c.net} lang={lang} size="xs" bold inline showSymbol={false} className={c.net >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></TableCell></TableRow>
                ))}</TableBody>
              </Table></div></CardContent></Card>
            </>
          ) : <EmptyState icon={Layers} message={t('لا توجد مراكز تكلفة', 'No cost centers', lang)} />}
        </TabsContent>

        {/* ===== Project WIP ===== */}
        <TabsContent value="project-wip" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2"><Building2 className="size-5 text-emerald-600" /><h3 className="font-semibold text-base">{t('تقرير الأعمال تحت التنفيذ', 'Work in Progress Report', lang)}</h3><SourceBadge lang={lang} /></div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon" className="size-8" onClick={() => refetchWIP()}><RefreshCw className="size-3.5" /></Button>
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={exportWIP}><Download className="size-3.5" />{t('تصدير', 'Export', lang)}</Button>
            </div>
          </div>
          <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} lang={lang} />
          {wipLoading ? <LoadingSkeleton /> : wipData?.rows && wipData.rows.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('قيمة العقود', 'Contracts', lang)}</p><MoneyDisplay value={wipData.totals.contractValue} lang={lang} size="md" bold /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('التكاليف المتراكمة', 'Incurred Costs', lang)}</p><MoneyDisplay value={wipData.totals.incurredCosts} lang={lang} size="md" bold className="text-rose-700" /></CardContent></Card>
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('الإيراد المعترف', 'Recognized Rev.', lang)}</p><MoneyDisplay value={wipData.totals.recognizedRevenue} lang={lang} size="md" bold className="text-emerald-700" /></CardContent></Card>
                <Card className={`${wipData.totals.profitToDate >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('الربح حتى التاريخ', 'Profit to Date', lang)}</p><MoneyDisplay value={wipData.totals.profitToDate} lang={lang} size="md" bold className={wipData.totals.profitToDate >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></CardContent></Card>
              </div>
              <Card><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
                <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead><TableHead className="text-right">{t('قيمة العقد', 'Contract', lang)}</TableHead><TableHead className="text-right">{t('التكاليف', 'Costs', lang)}</TableHead><TableHead className="text-right">{t('الإيراد', 'Revenue', lang)}</TableHead><TableHead className="text-right">{t('صافي WIP', 'Net WIP', lang)}</TableHead><TableHead className="text-right">{t('الربح', 'Profit', lang)}</TableHead><TableHead className="text-right">{t('الإنجاز %', 'Compl. %', lang)}</TableHead></TableRow></TableHeader>
                <TableBody>{wipData.rows.map(r => (
                  <TableRow key={r.projectId}><TableCell className="font-mono text-xs">{r.code}</TableCell><TableCell className="text-sm">{r.nameAr || r.name}</TableCell><TableCell><MoneyDisplay value={r.contractValue} lang={lang} size="xs" inline showSymbol={false} /></TableCell><TableCell><MoneyDisplay value={r.incurredCosts} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell><TableCell><MoneyDisplay value={r.recognizedRevenue} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell><TableCell><MoneyDisplay value={r.netWip} lang={lang} size="xs" bold inline showSymbol={false} className={r.netWip >= 0 ? 'text-amber-700' : 'text-cyan-700'} /></TableCell><TableCell><MoneyDisplay value={r.profitToDate} lang={lang} size="xs" bold inline showSymbol={false} className={r.profitToDate >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></TableCell><TableCell className="text-xs">{formatNumber(Math.round(r.completionPercent))}%</TableCell></TableRow>
                ))}</TableBody>
              </Table></div></CardContent></Card>
            </>
          ) : <EmptyState icon={Building2} message={t('لا توجد مشاريع', 'No projects', lang)} />}
        </TabsContent>

        {/* ===== VAT Reconciliation ===== */}
        <TabsContent value="vat-recon" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2"><Percent className="size-5 text-emerald-600" /><h3 className="font-semibold text-base">{t('مطابقة ضريبة القيمة المضافة', 'VAT Reconciliation', lang)}</h3><SourceBadge lang={lang} /></div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon" className="size-8" onClick={() => refetchVAT()}><RefreshCw className="size-3.5" /></Button>
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={exportVAT}><Download className="size-3.5" />{t('تصدير', 'Export', lang)}</Button>
            </div>
          </div>
          <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} lang={lang} />
          {vatLoading ? <LoadingSkeleton /> : vatData ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('ضريبة المخرجات', 'Output VAT', lang)}</p><MoneyDisplay value={vatData.outputVat} lang={lang} size="md" bold className="text-emerald-700" /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('ضريبة المدخلات', 'Input VAT', lang)}</p><MoneyDisplay value={vatData.inputVat} lang={lang} size="md" bold className="text-rose-700" /></CardContent></Card>
                <Card className={`${vatData.netVatDue >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'}`}><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{vatData.netVatDue >= 0 ? t('مستحقة للهيئة', 'Payable', lang) : t('مستردة', 'Refundable', lang)}</p><MoneyDisplay value={Math.abs(vatData.netVatDue)} lang={lang} size="md" bold className={vatData.netVatDue >= 0 ? 'text-amber-700' : 'text-teal-700'} /></CardContent></Card>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card><CardHeader className="pb-3"><CardTitle className="text-base text-emerald-800">{t('ضريبة المخرجات', 'Output VAT', lang)}</CardTitle></CardHeader>
                  <CardContent className="p-0"><div className="overflow-x-auto max-h-80 overflow-y-auto"><Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead><TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead></TableRow></TableHeader>
                    <TableBody>{vatData.outputAccounts.filter(a => Math.abs(a.balance) > 0.01).map(a => (
                      <TableRow key={a.accountId}><TableCell className="font-mono text-xs">{a.code}</TableCell><TableCell className="text-sm">{acctName(a, lang)}</TableCell><TableCell><MoneyDisplay value={a.balance} lang={lang} size="xs" bold inline showSymbol={false} className="text-emerald-700" /></TableCell></TableRow>
                    ))}{vatData.outputAccounts.filter(a => Math.abs(a.balance) > 0.01).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-6">{t('لا توجد أرصدة', 'No balances', lang)}</TableCell></TableRow>}</TableBody>
                  </Table></div></CardContent></Card>
                <Card><CardHeader className="pb-3"><CardTitle className="text-base text-rose-800">{t('ضريبة المدخلات', 'Input VAT', lang)}</CardTitle></CardHeader>
                  <CardContent className="p-0"><div className="overflow-x-auto max-h-80 overflow-y-auto"><Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead><TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead></TableRow></TableHeader>
                    <TableBody>{vatData.inputAccounts.filter(a => Math.abs(a.balance) > 0.01).map(a => (
                      <TableRow key={a.accountId}><TableCell className="font-mono text-xs">{a.code}</TableCell><TableCell className="text-sm">{acctName(a, lang)}</TableCell><TableCell><MoneyDisplay value={a.balance} lang={lang} size="xs" bold inline showSymbol={false} className="text-rose-700" /></TableCell></TableRow>
                    ))}{vatData.inputAccounts.filter(a => Math.abs(a.balance) > 0.01).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-6">{t('لا توجد أرصدة', 'No balances', lang)}</TableCell></TableRow>}</TableBody>
                  </Table></div></CardContent></Card>
              </div>
            </>
          ) : <EmptyState icon={Percent} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

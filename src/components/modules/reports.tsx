'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3, FileText, Receipt, TrendingUp, ShoppingCart,
  Package, Scale, PieChart, Eye, ArrowRight, Truck,
  Printer, Download, CreditCard, Users, Percent,
  RefreshCw, Building2, ArrowLeft, CheckCircle2,
  Clock, Send, AlertTriangle, Wallet, BookOpen,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAppStore, formatNumber, formatDate } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { toast } from 'sonner'

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

// ============ Types ============
interface ProjectCostData {
  project: { id: string; code: string; name: string; nameAr: string | null; status: string; clientName: string; contractValue: number }
  costs: {
    materials: number; equipmentOperations: number; equipmentMaintenance: number; equipmentFuel: number
    subcontractors: number; labor: number; salaries: number; projectExpenses: number; equipmentCosts: number; equipmentUsages: number
  }
  totalCost: number; contractValue: number; grossProfit: number; profitMargin: number; inputVat: number
}

interface SupplierBalanceData {
  suppliers: { id: string; code: string; name: string; nameAr: string | null; nameEn: string | null; totalPurchased: number; totalPaid: number; balanceOwed: number; overdue: number; aging: { '0to30': number; '31to60': number; '61to90': number; '90plus': number }; invoiceCount: number }[]
  totals: { totalPurchased: number; totalPaid: number; totalBalance: number; totalOverdue: number; totalAging0to30: number; totalAging31to60: number; totalAging61to90: number; totalAging90plus: number }
}

interface ClientBalanceData {
  clients: { id: string; code: string; name: string; nameAr: string | null; nameEn: string | null; totalInvoiced: number; totalPaid: number; balanceReceivable: number; overdue: number; aging: { '0to30': number; '31to60': number; '61to90': number; '90plus': number }; invoiceCount: number }[]
  totals: { totalInvoiced: number; totalPaid: number; totalBalance: number; totalOverdue: number; totalAging0to30: number; totalAging31to60: number; totalAging61to90: number; totalAging90plus: number }
}

interface VATBreakdown {
  salesInvoices: { id: string; invoiceNo: string; date: string; totalAmount: number; vatAmount: number; status: string }[]
  progressClaims: { id: string; claimNo: string; date: string; totalAmount: number; vatAmount: number; status: string }[]
  purchaseInvoices: { id: string; invoiceNo: string; date: string; totalAmount: number; vatAmount: number; status: string }[]
  subcontractorInvoices: { id: string; invoiceNo: string; date: string; totalAmount: number; vatAmount: number; status: string }[]
  expenses: { id: string; description: string; date: string; amount: number; vatAmount: number | null; category: string }[]
}

interface VATDeclaration {
  id: string; period: string; year: number; quarter: number
  totalSales: number; outputVat: number; totalPurchases: number; inputVat: number; netVat: number
  status: string; filedDate: string | null; paymentDate: string | null; paymentReference: string | null
}

// ============ Cost Row Component ============
function CostRow({ label, value, lang, color }: { label: string; value: number; lang: 'ar' | 'en'; color?: string }) {
  const pctOfTotal = value
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
      <span className="text-sm text-gray-700">{label}</span>
      <MoneyDisplay value={value} lang={lang} size="sm" bold inline showSymbol={false} className={color || ''} />
    </div>
  )
}

// ============ 1. Project Cost Sheet Tab ============
function ProjectCostSheetTab({ lang }: { lang: 'ar' | 'en' }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const { data: projectsList } = useQuery({
    queryKey: ['projects-list-for-report'],
    queryFn: async () => {
      const res = await fetch('/api/projects/list')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: costData, isLoading, refetch } = useQuery<ProjectCostData>({
    queryKey: ['project-costs', selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return null
      const res = await fetch(`/api/reports/project-costs?projectId=${selectedProjectId}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedProjectId,
  })

  const handleExport = useCallback(() => {
    if (!costData) return
    const rows = [
      { field: t('قيمة العقد', 'Contract Value', lang), value: costData.contractValue },
      { field: t('المواد', 'Materials', lang), value: costData.costs.materials },
      { field: t('تشغيل المعدات', 'Equipment Operations', lang), value: costData.costs.equipmentOperations },
      { field: t('صيانة المعدات', 'Equipment Maintenance', lang), value: costData.costs.equipmentMaintenance },
      { field: t('وقود المعدات', 'Equipment Fuel', lang), value: costData.costs.equipmentFuel },
      { field: t('مقاولو الباطن', 'Subcontractors', lang), value: costData.costs.subcontractors },
      { field: t('تكاليف العمالة', 'Labor', lang), value: costData.costs.labor },
      { field: t('الرواتب', 'Salaries', lang), value: costData.costs.salaries },
      { field: t('مصروفات المشروع', 'Project Expenses', lang), value: costData.costs.projectExpenses },
      { field: t('إجمالي التكلفة', 'Total Cost', lang), value: costData.totalCost },
      { field: t('الربح الإجمالي', 'Gross Profit', lang), value: costData.grossProfit },
      { field: t('هامش الربح', 'Profit Margin', lang), value: costData.profitMargin },
    ]
    const columns: CSVColumn[] = [{ key: 'field', label: t('الحقل', 'Field', lang) }, { key: 'value', label: t('القيمة', 'Value', lang) }]
    exportToCSV(rows as Record<string, unknown>[], `project-costs-${selectedProjectId}`, columns)
  }, [costData, selectedProjectId, lang])

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-sm font-medium">{t('اختر المشروع', 'Select Project', lang)}</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-64"><SelectValue placeholder={t('اختر مشروع...', 'Select project...', lang)} /></SelectTrigger>
              <SelectContent>
                {projectsList?.map((p: { id: string; code: string; name: string }) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProjectId && (
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}><Download className="size-4" />{t('تصدير', 'Export', lang)}</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedProjectId ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Building2 className="size-12 text-gray-300" />
            <p className="text-muted-foreground">{t('اختر مشروعاً لعرض تقرير التكاليف', 'Select a project to view cost report', lang)}</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
      ) : costData ? (
        <div className="space-y-4">
          {/* Project Header */}
          <Card className={`border-2 ${costData.grossProfit >= 0 ? 'border-emerald-300 bg-emerald-50/30' : 'border-rose-300 bg-rose-50/30'}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">{costData.project.name}</h3>
                  <p className="text-sm text-muted-foreground">{costData.project.code} • {costData.project.clientName}</p>
                </div>
                <Badge className={`${costData.grossProfit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} border-0 text-sm`}>
                  {costData.grossProfit >= 0 ? t('رابح', 'Profitable', lang) : t('خاسر', 'Losing', lang)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg p-3 text-center border">
                  <p className="text-xs text-gray-500">{t('قيمة العقد', 'Contract Value', lang)}</p>
                  <MoneyDisplay value={costData.contractValue} lang={lang} size="md" bold />
                </div>
                <div className="bg-white rounded-lg p-3 text-center border">
                  <p className="text-xs text-gray-500">{t('إجمالي التكلفة', 'Total Cost', lang)}</p>
                  <MoneyDisplay value={costData.totalCost} lang={lang} size="md" bold className="text-rose-600" />
                </div>
                <div className={`rounded-lg p-3 text-center border ${costData.grossProfit >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                  <p className={`text-xs ${costData.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t('الربح الإجمالي', 'Gross Profit', lang)}</p>
                  <MoneyDisplay value={costData.grossProfit} lang={lang} size="md" bold className={costData.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
                </div>
                <div className={`rounded-lg p-3 text-center border ${costData.grossProfit >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                  <p className={`text-xs ${costData.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t('هامش الربح', 'Profit Margin', lang)}</p>
                  <p className={`text-xl font-bold ${costData.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatNumber(Math.round(costData.profitMargin))}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cost Breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="size-5 text-amber-600" />
                {t('تفصيل التكاليف', 'Cost Breakdown', lang)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <CostRow label={t('المواد', 'Materials', lang)} value={costData.costs.materials} lang={lang} />
              <CostRow label={t('تشغيل المعدات', 'Equipment Operations', lang)} value={costData.costs.equipmentOperations} lang={lang} />
              <CostRow label={t('صيانة المعدات', 'Equipment Maintenance', lang)} value={costData.costs.equipmentMaintenance} lang={lang} />
              <CostRow label={t('وقود المعدات', 'Equipment Fuel', lang)} value={costData.costs.equipmentFuel} lang={lang} />
              <CostRow label={t('مقاولو الباطن', 'Subcontractors', lang)} value={costData.costs.subcontractors} lang={lang} />
              <CostRow label={t('تكاليف العمالة', 'Labor Costs', lang)} value={costData.costs.labor} lang={lang} />
              <CostRow label={t('الرواتب', 'Salaries', lang)} value={costData.costs.salaries} lang={lang} />
              <CostRow label={t('مصروفات المشروع', 'Project Expenses', lang)} value={costData.costs.projectExpenses} lang={lang} />
              <CostRow label={t('تكاليف معدات أخرى', 'Other Equipment Costs', lang)} value={costData.costs.equipmentCosts + costData.costs.equipmentUsages} lang={lang} />
              <Separator className="my-2" />
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-rose-50">
                <span className="font-semibold text-rose-800">{t('إجمالي التكلفة', 'Total Cost', lang)}</span>
                <MoneyDisplay value={costData.totalCost} lang={lang} size="md" bold className="text-rose-700" />
              </div>
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-purple-50">
                <span className="font-semibold text-purple-800">{t('ضريبة المدخلات', 'Input VAT', lang)}</span>
                <MoneyDisplay value={costData.inputVat} lang={lang} size="sm" bold className="text-purple-700" />
              </div>
            </CardContent>
          </Card>

          {/* Cost Distribution Bar */}
          {costData.totalCost > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('توزيع التكاليف', 'Cost Distribution', lang)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { label: t('المواد', 'Materials', lang), value: costData.costs.materials, color: 'bg-emerald-500' },
                    { label: t('تشغيل المعدات', 'Equip. Ops', lang), value: costData.costs.equipmentOperations, color: 'bg-amber-500' },
                    { label: t('مقاولو الباطن', 'Subcontractors', lang), value: costData.costs.subcontractors, color: 'bg-purple-500' },
                    { label: t('العمالة', 'Labor', lang), value: costData.costs.labor, color: 'bg-cyan-500' },
                    { label: t('الرواتب', 'Salaries', lang), value: costData.costs.salaries, color: 'bg-teal-500' },
                    { label: t('المصروفات', 'Expenses', lang), value: costData.costs.projectExpenses, color: 'bg-rose-400' },
                  ].map(item => {
                    const pct = costData.totalCost > 0 ? (item.value / costData.totalCost) * 100 : 0
                    return (
                      <div key={item.label} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className={`size-3 rounded-full ${item.color}`} />
                            <span>{item.label}</span>
                          </div>
                          <span className="text-muted-foreground">{formatNumber(Math.round(pct))}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100">
                          <div className={`h-2 rounded-full ${item.color} transition-all`} style={{ width: `${Math.max(pct, 0)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ============ 2. Supplier Balances Tab ============
function SupplierBalancesTab({ lang }: { lang: 'ar' | 'en' }) {
  const { data, isLoading, refetch } = useQuery<SupplierBalanceData>({
    queryKey: ['supplier-balances'],
    queryFn: async () => {
      const res = await fetch('/api/reports/supplier-balances')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const handleExport = useCallback(() => {
    if (!data) return
    const columns: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('الاسم', 'Name', lang) },
      { key: 'totalPurchased', label: t('إجمالي المشتريات', 'Total Purchased', lang), format: (v) => Number(v).toFixed(2) },
      { key: 'totalPaid', label: t('المدفوع', 'Paid', lang), format: (v) => Number(v).toFixed(2) },
      { key: 'balanceOwed', label: t('الرصيد', 'Balance', lang), format: (v) => Number(v).toFixed(2) },
      { key: 'overdue', label: t('المتأخر', 'Overdue', lang), format: (v) => Number(v).toFixed(2) },
    ]
    exportToCSV(data.suppliers as Record<string, unknown>[], 'supplier-balances', columns)
  }, [data, lang])

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {data?.totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3 text-center"><p className="text-xs text-amber-600">{t('إجمالي المشتريات', 'Total Purchased', lang)}</p><MoneyDisplay value={data.totals.totalPurchased} lang={lang} size="sm" bold /></CardContent></Card>
          <Card className="bg-teal-50 border-teal-200"><CardContent className="p-3 text-center"><p className="text-xs text-teal-600">{t('المدفوع', 'Paid', lang)}</p><MoneyDisplay value={data.totals.totalPaid} lang={lang} size="sm" bold /></CardContent></Card>
          <Card className="bg-orange-50 border-orange-200"><CardContent className="p-3 text-center"><p className="text-xs text-orange-600">{t('الرصيد المستحق', 'Balance Owed', lang)}</p><MoneyDisplay value={data.totals.totalBalance} lang={lang} size="sm" bold /></CardContent></Card>
          <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('المتأخر', 'Overdue', lang)}</p><MoneyDisplay value={data.totals.totalOverdue} lang={lang} size="sm" bold /></CardContent></Card>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}><Download className="size-4" />{t('تصدير', 'Export', lang)}</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />)}</div>
      ) : data?.suppliers && data.suppliers.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
              <TableHead className="text-right">{t('المورد', 'Supplier', lang)}</TableHead>
              <TableHead className="text-right">{t('إجمالي المشتريات', 'Purchased', lang)}</TableHead>
              <TableHead className="text-right">{t('المدفوع', 'Paid', lang)}</TableHead>
              <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
              <TableHead className="text-right">{t('المتأخر', 'Overdue', lang)}</TableHead>
              <TableHead className="text-right">{t('0-30 يوم', '0-30d', lang)}</TableHead>
              <TableHead className="text-right">{t('31-60 يوم', '31-60d', lang)}</TableHead>
              <TableHead className="text-right">{t('61-90 يوم', '61-90d', lang)}</TableHead>
              <TableHead className="text-right">{t('+90 يوم', '90+d', lang)}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.suppliers.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.code}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><MoneyDisplay value={s.totalPurchased} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                  <TableCell><MoneyDisplay value={s.totalPaid} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                  <TableCell><MoneyDisplay value={s.balanceOwed} lang={lang} size="xs" bold inline showSymbol={false} className={s.balanceOwed > 0 ? 'text-orange-600' : ''} /></TableCell>
                  <TableCell><MoneyDisplay value={s.overdue} lang={lang} size="xs" inline showSymbol={false} className={s.overdue > 0 ? 'text-rose-600' : ''} /></TableCell>
                  <TableCell className="text-xs">{s.aging['0to30'] > 0 ? <MoneyDisplay value={s.aging['0to30']} lang={lang} size="xs" inline showSymbol={false} /> : '-'}</TableCell>
                  <TableCell className="text-xs">{s.aging['31to60'] > 0 ? <MoneyDisplay value={s.aging['31to60']} lang={lang} size="xs" inline showSymbol={false} /> : '-'}</TableCell>
                  <TableCell className="text-xs">{s.aging['61to90'] > 0 ? <MoneyDisplay value={s.aging['61to90']} lang={lang} size="xs" inline showSymbol={false} /> : '-'}</TableCell>
                  <TableCell className="text-xs">{s.aging['90plus'] > 0 ? <MoneyDisplay value={s.aging['90plus']} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /> : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">{t('لا توجد بيانات موردين', 'No supplier data', lang)}</CardContent></Card>
      )}
    </div>
  )
}

// ============ 3. Client Balances Tab ============
function ClientBalancesTab({ lang }: { lang: 'ar' | 'en' }) {
  const { data, isLoading, refetch } = useQuery<ClientBalanceData>({
    queryKey: ['client-balances'],
    queryFn: async () => {
      const res = await fetch('/api/reports/client-balances')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const handleExport = useCallback(() => {
    if (!data) return
    const columns: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('الاسم', 'Name', lang) },
      { key: 'totalInvoiced', label: t('إجمالي الفواتير', 'Total Invoiced', lang), format: (v) => Number(v).toFixed(2) },
      { key: 'totalPaid', label: t('المدفوع', 'Paid', lang), format: (v) => Number(v).toFixed(2) },
      { key: 'balanceReceivable', label: t('المستحق', 'Receivable', lang), format: (v) => Number(v).toFixed(2) },
      { key: 'overdue', label: t('المتأخر', 'Overdue', lang), format: (v) => Number(v).toFixed(2) },
    ]
    exportToCSV(data.clients as Record<string, unknown>[], 'client-balances', columns)
  }, [data, lang])

  return (
    <div className="space-y-4">
      {data?.totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('إجمالي الفواتير', 'Total Invoiced', lang)}</p><MoneyDisplay value={data.totals.totalInvoiced} lang={lang} size="sm" bold /></CardContent></Card>
          <Card className="bg-teal-50 border-teal-200"><CardContent className="p-3 text-center"><p className="text-xs text-teal-600">{t('المحصل', 'Collected', lang)}</p><MoneyDisplay value={data.totals.totalPaid} lang={lang} size="sm" bold /></CardContent></Card>
          <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('المستحق', 'Receivable', lang)}</p><MoneyDisplay value={data.totals.totalBalance} lang={lang} size="sm" bold /></CardContent></Card>
          <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('المتأخر', 'Overdue', lang)}</p><MoneyDisplay value={data.totals.totalOverdue} lang={lang} size="sm" bold /></CardContent></Card>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}><Download className="size-4" />{t('تصدير', 'Export', lang)}</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />)}</div>
      ) : data?.clients && data.clients.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
              <TableHead className="text-right">{t('العميل', 'Client', lang)}</TableHead>
              <TableHead className="text-right">{t('إجمالي الفواتير', 'Invoiced', lang)}</TableHead>
              <TableHead className="text-right">{t('المدفوع', 'Paid', lang)}</TableHead>
              <TableHead className="text-right">{t('المستحق', 'Receivable', lang)}</TableHead>
              <TableHead className="text-right">{t('المتأخر', 'Overdue', lang)}</TableHead>
              <TableHead className="text-right">{t('0-30 يوم', '0-30d', lang)}</TableHead>
              <TableHead className="text-right">{t('31-60 يوم', '31-60d', lang)}</TableHead>
              <TableHead className="text-right">{t('61-90 يوم', '61-90d', lang)}</TableHead>
              <TableHead className="text-right">{t('+90 يوم', '90+d', lang)}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.clients.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><MoneyDisplay value={c.totalInvoiced} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                  <TableCell><MoneyDisplay value={c.totalPaid} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                  <TableCell><MoneyDisplay value={c.balanceReceivable} lang={lang} size="xs" bold inline showSymbol={false} className={c.balanceReceivable > 0 ? 'text-cyan-600' : ''} /></TableCell>
                  <TableCell><MoneyDisplay value={c.overdue} lang={lang} size="xs" inline showSymbol={false} className={c.overdue > 0 ? 'text-rose-600' : ''} /></TableCell>
                  <TableCell className="text-xs">{c.aging['0to30'] > 0 ? <MoneyDisplay value={c.aging['0to30']} lang={lang} size="xs" inline showSymbol={false} /> : '-'}</TableCell>
                  <TableCell className="text-xs">{c.aging['31to60'] > 0 ? <MoneyDisplay value={c.aging['31to60']} lang={lang} size="xs" inline showSymbol={false} /> : '-'}</TableCell>
                  <TableCell className="text-xs">{c.aging['61to90'] > 0 ? <MoneyDisplay value={c.aging['61to90']} lang={lang} size="xs" inline showSymbol={false} /> : '-'}</TableCell>
                  <TableCell className="text-xs">{c.aging['90plus'] > 0 ? <MoneyDisplay value={c.aging['90plus']} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /> : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">{t('لا توجد بيانات عملاء', 'No client data', lang)}</CardContent></Card>
      )}
    </div>
  )
}

// ============ 4. VAT Return Tab (in Reports) ============
function VATReturnReportTab({ lang }: { lang: 'ar' | 'en' }) {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [selectedQuarter, setSelectedQuarter] = useState<number>(0)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payReference, setPayReference] = useState('')
  const [payingId, setPayingId] = useState<string>('')
  const queryClient = useQueryClient()

  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]
  const quarterConfig: Record<number, { ar: string; en: string; monthsAr: string; monthsEn: string }> = {
    1: { ar: 'الربع الأول', en: 'Q1', monthsAr: 'يناير - مارس', monthsEn: 'January - March' },
    2: { ar: 'الربع الثاني', en: 'Q2', monthsAr: 'أبريل - يونيو', monthsEn: 'April - June' },
    3: { ar: 'الربع الثالث', en: 'Q3', monthsAr: 'يوليو - سبتمبر', monthsEn: 'July - September' },
    4: { ar: 'الربع الرابع', en: 'Q4', monthsAr: 'أكتوبر - ديسمبر', monthsEn: 'October - December' },
  }

  // Auto-calc data from invoices
  const { data: vatCalcData, isLoading: calcLoading } = useQuery<{
    declaration: VATDeclaration | null
    autoCalc: { outputVat: number; inputVat: number; netVat: number; totalSales: number; totalPurchases: number }
    breakdown: VATBreakdown
  }>({
    queryKey: ['vat-report-calc', selectedYear, selectedQuarter],
    queryFn: async () => {
      if (!selectedQuarter) return { declaration: null, autoCalc: { outputVat: 0, inputVat: 0, netVat: 0, totalSales: 0, totalPurchases: 0 }, breakdown: { salesInvoices: [], progressClaims: [], purchaseInvoices: [], subcontractorInvoices: [], expenses: [] } }
      const res = await fetch(`/api/vat?year=${selectedYear}&quarter=${selectedQuarter}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!selectedQuarter,
  })

  // Filed returns
  const { data: filedReturns = [] } = useQuery<VATDeclaration[]>({
    queryKey: ['vat-returns-filed', selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/vat?year=${selectedYear}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: { year: number; quarter: number }) =>
      fetch('/api/vat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-report-calc', selectedYear, selectedQuarter] })
      queryClient.invalidateQueries({ queryKey: ['vat-returns-filed', selectedYear] })
      toast.success(t('تم إنشاء الإقرار الضريبي', 'VAT return created', lang))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const fileMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/vat', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'FILE' }) })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-report-calc', selectedYear, selectedQuarter] })
      queryClient.invalidateQueries({ queryKey: ['vat-returns-filed', selectedYear] })
      toast.success(t('تم تقديم الإقرار', 'VAT return filed', lang))
    },
  })

  const payMutation = useMutation({
    mutationFn: (data: { id: string; paymentReference: string }) =>
      fetch('/api/vat', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, action: 'PAY', paymentReference: data.paymentReference }) })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-report-calc', selectedYear, selectedQuarter] })
      queryClient.invalidateQueries({ queryKey: ['vat-returns-filed', selectedYear] })
      setPayDialogOpen(false)
      setPayReference('')
      toast.success(t('تم تسجيل الدفع', 'Payment recorded', lang))
    },
  })

  const declaration = vatCalcData?.declaration
  const autoCalc = vatCalcData?.autoCalc
  const breakdown = vatCalcData?.breakdown

  return (
    <div className="space-y-4">
      {/* Year + Quarter Selector */}
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-sm font-medium">{t('السنة', 'Year', lang)}</Label>
            <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Label className="text-sm font-medium">{t('الربع', 'Quarter', lang)}</Label>
            <Select value={String(selectedQuarter)} onValueChange={v => setSelectedQuarter(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue placeholder={t('اختر الربع', 'Select quarter', lang)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('اختر الربع', 'Select quarter', lang)}</SelectItem>
                {[1, 2, 3, 4].map(q => <SelectItem key={q} value={String(q)}>{lang === 'ar' ? quarterConfig[q].ar : quarterConfig[q].en} ({lang === 'ar' ? quarterConfig[q].monthsAr : quarterConfig[q].monthsEn})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!selectedQuarter ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Percent className="size-12 text-gray-300" />
            <p className="text-muted-foreground">{t('اختر السنة والربع لحساب الضريبة تلقائياً', 'Select year and quarter to auto-calculate VAT', lang)}</p>
          </CardContent>
        </Card>
      ) : calcLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />)}</div>
      ) : (
        <div className="space-y-4">
          {/* Auto-calculated VAT Summary */}
          {autoCalc && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
                <CardContent className="p-5">
                  <p className="text-sm font-medium text-emerald-700 mb-1">{t('ضريبة المخرجات', 'Output VAT', lang)}</p>
                  <p className="text-xs text-muted-foreground mb-2">{t('فواتير المبيعات + المستخلصات', 'Sales invoices + Claims', lang)}</p>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{t('إجمالي المبيعات', 'Total Sales', lang)}</span>
                    <MoneyDisplay value={autoCalc.totalSales} lang={lang} size="xs" bold className="text-emerald-700" />
                  </div>
                  <Separator className="my-2" />
                  <MoneyDisplay value={autoCalc.outputVat} lang={lang} size="lg" bold className="text-emerald-700" />
                </CardContent>
              </Card>
              <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-white">
                <CardContent className="p-5">
                  <p className="text-sm font-medium text-rose-700 mb-1">{t('ضريبة المدخلات', 'Input VAT', lang)}</p>
                  <p className="text-xs text-muted-foreground mb-2">{t('المشتريات + المصروفات', 'Purchases + Expenses', lang)}</p>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{t('إجمالي المشتريات', 'Total Purchases', lang)}</span>
                    <MoneyDisplay value={autoCalc.totalPurchases} lang={lang} size="xs" bold className="text-rose-700" />
                  </div>
                  <Separator className="my-2" />
                  <MoneyDisplay value={autoCalc.inputVat} lang={lang} size="lg" bold className="text-rose-700" />
                </CardContent>
              </Card>
              <Card className={`border-2 ${autoCalc.netVat >= 0 ? 'border-amber-300' : 'border-teal-300'}`}>
                <CardContent className="p-5">
                  <p className={`text-sm font-medium ${autoCalc.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'} mb-1`}>{t('صافي الضريبة', 'Net VAT', lang)}</p>
                  <p className="text-xs text-muted-foreground mb-2">{autoCalc.netVat >= 0 ? t('مستحق للدفع', 'Payable', lang) : t('مسترد', 'Refundable', lang)}</p>
                  <MoneyDisplay value={autoCalc.netVat} lang={lang} size="xl" bold className={autoCalc.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'} />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Declaration Status & Actions */}
          {declaration && (
            <Card className={`${declaration.status === 'PAID' ? 'border-emerald-300 bg-emerald-50/30' : declaration.status === 'FILED' ? 'border-teal-300 bg-teal-50/30' : 'border-amber-300 bg-amber-50/30'}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    {declaration.status === 'DRAFT' && <Clock className="size-5 text-amber-600" />}
                    {declaration.status === 'FILED' && <Send className="size-5 text-teal-600" />}
                    {declaration.status === 'PAID' && <CheckCircle2 className="size-5 text-emerald-600" />}
                    <span className="font-medium">
                      {declaration.status === 'DRAFT' && t('إقرار في حالة مسودة', 'Declaration in Draft', lang)}
                      {declaration.status === 'FILED' && t('تم تقديم الإقرار', 'Declaration Filed', lang)}
                      {declaration.status === 'PAID' && t('تم الدفع', 'Payment Complete', lang)}
                    </span>
                    {declaration.filedDate && <span className="text-sm text-muted-foreground">({formatDate(declaration.filedDate, lang)})</span>}
                  </div>
                  <div className="flex gap-2">
                    {declaration.status === 'DRAFT' && (
                      <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" size="sm" onClick={() => fileMutation.mutate(declaration.id)} disabled={fileMutation.isPending}>
                        {fileMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
                        {t('تقديم الإقرار', 'File Return', lang)}
                      </Button>
                    )}
                    {declaration.status === 'FILED' && (
                      <Button className="bg-teal-600 hover:bg-teal-700 gap-1.5" size="sm" onClick={() => { setPayingId(declaration.id); setPayDialogOpen(true) }}>
                        <Wallet className="size-4" />{t('تسجيل الدفع', 'Record Payment', lang)}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!declaration && autoCalc && (
            <div className="flex justify-center">
              <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" size="sm" onClick={() => createMutation.mutate({ year: selectedYear, quarter: selectedQuarter })} disabled={createMutation.isPending}>
                {createMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : <PlusCircle className="size-4" />}
                {t('إنشاء إقرار ضريبي', 'Create VAT Return', lang)}
              </Button>
            </div>
          )}

          {/* Breakdown Tables */}
          {breakdown && (
            <div className="space-y-4">
              {breakdown.salesInvoices.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <h4 className="font-semibold text-emerald-800 flex items-center gap-2"><Receipt className="size-4" />{t('فواتير المبيعات', 'Sales Invoices', lang)}<Badge className="bg-emerald-100 text-emerald-700 border-0">{breakdown.salesInvoices.length}</Badge></h4>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <Table><TableHeader><TableRow><TableHead className="text-right">{t('الرقم', 'No.', lang)}</TableHead><TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead><TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead><TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead></TableRow></TableHeader>
                        <TableBody>{breakdown.salesInvoices.map(inv => (<TableRow key={inv.id}><TableCell className="font-mono text-xs">{inv.invoiceNo}</TableCell><TableCell className="text-xs">{formatDate(inv.date, lang)}</TableCell><TableCell><MoneyDisplay value={inv.totalAmount} lang={lang} size="xs" inline showSymbol={false} /></TableCell><TableCell><MoneyDisplay value={inv.vatAmount} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell></TableRow>))}</TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
              {breakdown.progressClaims.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <h4 className="font-semibold text-emerald-800 flex items-center gap-2"><FileText className="size-4" />{t('المستخلصات', 'Progress Claims', lang)}<Badge className="bg-emerald-100 text-emerald-700 border-0">{breakdown.progressClaims.length}</Badge></h4>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <Table><TableHeader><TableRow><TableHead className="text-right">{t('الرقم', 'No.', lang)}</TableHead><TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead><TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead><TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead></TableRow></TableHeader>
                        <TableBody>{breakdown.progressClaims.map(c => (<TableRow key={c.id}><TableCell className="font-mono text-xs">{c.claimNo}</TableCell><TableCell className="text-xs">{formatDate(c.date, lang)}</TableCell><TableCell><MoneyDisplay value={c.totalAmount} lang={lang} size="xs" inline showSymbol={false} /></TableCell><TableCell><MoneyDisplay value={c.vatAmount} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell></TableRow>))}</TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
              {breakdown.purchaseInvoices.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <h4 className="font-semibold text-rose-800 flex items-center gap-2"><ShoppingCart className="size-4" />{t('فواتير المشتريات', 'Purchase Invoices', lang)}<Badge className="bg-rose-100 text-rose-700 border-0">{breakdown.purchaseInvoices.length}</Badge></h4>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <Table><TableHeader><TableRow><TableHead className="text-right">{t('الرقم', 'No.', lang)}</TableHead><TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead><TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead><TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead></TableRow></TableHeader>
                        <TableBody>{breakdown.purchaseInvoices.map(inv => (<TableRow key={inv.id}><TableCell className="font-mono text-xs">{inv.invoiceNo}</TableCell><TableCell className="text-xs">{formatDate(inv.date, lang)}</TableCell><TableCell><MoneyDisplay value={inv.totalAmount} lang={lang} size="xs" inline showSymbol={false} /></TableCell><TableCell><MoneyDisplay value={inv.vatAmount} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell></TableRow>))}</TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
              {breakdown.expenses.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <h4 className="font-semibold text-purple-800 flex items-center gap-2"><Receipt className="size-4" />{t('المصروفات الخاضعة للضريبة', 'Taxed Expenses', lang)}<Badge className="bg-purple-100 text-purple-700 border-0">{breakdown.expenses.length}</Badge></h4>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <Table><TableHeader><TableRow><TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead><TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead><TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead><TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead></TableRow></TableHeader>
                        <TableBody>{breakdown.expenses.map(exp => (<TableRow key={exp.id}><TableCell className="text-sm">{exp.description}</TableCell><TableCell className="text-xs">{formatDate(exp.date, lang)}</TableCell><TableCell><MoneyDisplay value={exp.amount} lang={lang} size="xs" inline showSymbol={false} /></TableCell><TableCell><MoneyDisplay value={exp.vatAmount || 0} lang={lang} size="xs" inline showSymbol={false} className="text-purple-600" /></TableCell></TableRow>))}</TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Filed Returns History */}
          {filedReturns.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><BookOpen className="size-5 text-emerald-600" />{t('الإقرارات المقدمة', 'Filed Returns', lang)}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-right">{t('الفترة', 'Period', lang)}</TableHead>
                      <TableHead className="text-right">{t('ضريبة مخرجات', 'Output VAT', lang)}</TableHead>
                      <TableHead className="text-right">{t('ضريبة مدخلات', 'Input VAT', lang)}</TableHead>
                      <TableHead className="text-right">{t('صافي الضريبة', 'Net VAT', lang)}</TableHead>
                      <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {filedReturns.map(vr => (
                        <TableRow key={vr.id}>
                          <TableCell className="font-mono text-sm">{vr.period}</TableCell>
                          <TableCell><MoneyDisplay value={vr.outputVat} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell>
                          <TableCell><MoneyDisplay value={vr.inputVat} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell>
                          <TableCell><MoneyDisplay value={vr.netVat} lang={lang} size="xs" bold inline showSymbol={false} className={vr.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'} /></TableCell>
                          <TableCell>
                            <Badge className={`${vr.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : vr.status === 'FILED' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'} border-0`}>
                              {vr.status === 'DRAFT' ? t('مسودة', 'Draft', lang) : vr.status === 'FILED' ? t('مقدم', 'Filed', lang) : t('مدفوع', 'Paid', lang)}
                            </Badge>
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
      )}

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('تسجيل دفع الضريبة', 'Record VAT Payment', lang)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('رقم مرجع الدفع', 'Payment Reference', lang)}</Label>
              <Input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder={t('أدخل رقم المرجع', 'Enter reference number', lang)} dir="ltr" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => payMutation.mutate({ id: payingId, paymentReference: payReference })} disabled={!payReference || payMutation.isPending}>
              {payMutation.isPending ? <RefreshCw className="size-4 animate-spin mr-2" /> : null}
              {t('تأكيد الدفع', 'Confirm Payment', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ 5. Cash Flow Tab ============
function CashFlowTab({ lang }: { lang: 'ar' | 'en' }) {
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => { const res = await fetch('/api/dashboard'); if (!res.ok) throw new Error(); return res.json() },
    staleTime: 30000,
  })

  const monthlyData = dashboard?.monthlyData || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-5 text-emerald-600" />
            {t('التدفق النقدي', 'Cash Flow', lang)}
            <span className="text-xs text-muted-foreground font-normal">({t('آخر 6 أشهر', 'Last 6 months', lang)})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData.length > 0 ? (
            <div className="space-y-4">
              {monthlyData.map(m => {
                const netFlow = m.revenue - m.expenses
                return (
                  <Card key={m.month} className="border-l-4" style={{ borderLeftColor: netFlow >= 0 ? '#059669' : '#dc2626' }}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">{lang === 'ar' ? m.labelAr : m.labelEn}</span>
                        <Badge className={`${netFlow >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} border-0`}>
                          {netFlow >= 0 ? t('فائض', 'Surplus', lang) : t('عجز', 'Deficit', lang)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('الإيرادات', 'Revenue', lang)}</p>
                          <MoneyDisplay value={m.revenue} lang={lang} size="sm" bold className="text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('المصروفات', 'Expenses', lang)}</p>
                          <MoneyDisplay value={m.expenses} lang={lang} size="sm" bold className="text-rose-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('صافي التدفق', 'Net Flow', lang)}</p>
                          <MoneyDisplay value={netFlow} lang={lang} size="sm" bold className={netFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">{t('لا توجد بيانات', 'No data', lang)}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Main Reports Module ============
export function ReportsModule() {
  const { lang } = useAppStore()
  const [activeTab, setActiveTab] = useState('project-costs')

  return (
    <ModuleLayout
      title={{ ar: 'التقارير', en: 'Reports' }}
      subtitle={{ ar: 'تقارير شاملة لإدارة المشاريع والمالية', en: 'Comprehensive project and financial reports' }}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full gap-1">
          <TabsTrigger value="project-costs" className="text-xs">{t('تكاليف المشاريع', 'Project Costs', lang)}</TabsTrigger>
          <TabsTrigger value="supplier-balances" className="text-xs">{t('أرصدة الموردين', 'Supplier Bal.', lang)}</TabsTrigger>
          <TabsTrigger value="client-balances" className="text-xs">{t('أرصدة العملاء', 'Client Bal.', lang)}</TabsTrigger>
          <TabsTrigger value="vat-return" className="text-xs">{t('إقرار الضريبة', 'VAT Return', lang)}</TabsTrigger>
          <TabsTrigger value="trial-balance" className="text-xs">{t('ميزان المراجعة', 'Trial Balance', lang)}</TabsTrigger>
          <TabsTrigger value="cash-flow" className="text-xs">{t('التدفق النقدي', 'Cash Flow', lang)}</TabsTrigger>
        </TabsList>

        <TabsContent value="project-costs">
          <ProjectCostSheetTab lang={lang} />
        </TabsContent>
        <TabsContent value="supplier-balances">
          <SupplierBalancesTab lang={lang} />
        </TabsContent>
        <TabsContent value="client-balances">
          <ClientBalancesTab lang={lang} />
        </TabsContent>
        <TabsContent value="vat-return">
          <VATReturnReportTab lang={lang} />
        </TabsContent>
        <TabsContent value="trial-balance">
          <TrialBalanceTab lang={lang} />
        </TabsContent>
        <TabsContent value="cash-flow">
          <CashFlowTab lang={lang} />
        </TabsContent>
      </Tabs>
    </ModuleLayout>
  )
}

// ============ Trial Balance Tab (wrapper) ============
function TrialBalanceTab({ lang }: { lang: 'ar' | 'en' }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trial-balance-report'],
    queryFn: async () => {
      const res = await fetch('/api/trial-balance')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const handleExport = useCallback(() => {
    if (!data) return
    const columns: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('الحساب', 'Account', lang) },
      { key: 'totalDebit', label: t('مدين', 'Debit', lang), format: (v) => Number(v).toFixed(2) },
      { key: 'totalCredit', label: t('دائن', 'Credit', lang), format: (v) => Number(v).toFixed(2) },
      { key: 'netDebit', label: t('رصيد مدين', 'Net Debit', lang), format: (v) => Number(v).toFixed(2) },
      { key: 'netCredit', label: t('رصيد دائن', 'Net Credit', lang), format: (v) => Number(v).toFixed(2) },
    ]
    exportToCSV(data as Record<string, unknown>[], 'trial-balance', columns)
  }, [data, lang])

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}><Download className="size-4" />{t('تصدير', 'Export', lang)}</Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />)}</div>
      ) : data && Array.isArray(data) ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                  <TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead>
                  <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                  <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                  <TableHead className="text-right">{t('رصيد مدين', 'Net Debit', lang)}</TableHead>
                  <TableHead className="text-right">{t('رصيد دائن', 'Net Credit', lang)}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(data as { account: { code: string; name: string }; totalDebit: number; totalCredit: number; netDebit: number; netCredit: number }[]).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{row.account.code}</TableCell>
                      <TableCell>{row.account.name}</TableCell>
                      <TableCell><MoneyDisplay value={row.totalDebit} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                      <TableCell><MoneyDisplay value={row.totalCredit} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                      <TableCell>{row.netDebit > 0 ? <MoneyDisplay value={row.netDebit} lang={lang} size="xs" bold inline showSymbol={false} /> : '-'}</TableCell>
                      <TableCell>{row.netCredit > 0 ? <MoneyDisplay value={row.netCredit} lang={lang} size="xs" bold inline showSymbol={false} /> : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">{t('لا توجد بيانات', 'No data', lang)}</CardContent></Card>
      )}
    </div>
  )
}

// PlusCircle import for VAT tab
function PlusCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" />
    </svg>
  )
}

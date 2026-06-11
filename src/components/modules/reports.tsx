'use client'

import React, { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3, FileText, Receipt, TrendingUp, ShoppingCart,
  PieChart, Truck, Download, CreditCard, Users, Percent,
  RefreshCw, Building2, ArrowLeft, CheckCircle2,
  Clock, Send, Wallet, BookOpen, Activity, Wrench,
  DollarSign, Fuel, Settings2, CalendarDays,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
import { PrintButton } from '@/components/shared/print-button'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { toast } from 'sonner'

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

// ============ Shared Types ============
interface ProjectProfitability {
  projects: {
    id: string; code: string; name: string; nameAr: string | null; status: string; projectType: string | null
    client: string; contractValue: number; invoiced: number; collected: number
    materialCosts: number; subcontractorCosts: number; laborCosts: number; equipmentCosts: number; projectExpenses: number
    totalCosts: number; grossProfit: number; profitMargin: number
  }[]
  totals: { contractValue: number; invoiced: number; collected: number; totalCosts: number; grossProfit: number; profitMargin: number }
}

interface EquipmentUtilization {
  equipment: {
    id: string; code: string; name: string; nameAr: string | null; status: string; type: string | null
    totalHoursRented: number; revenueGenerated: number; maintenanceCosts: number; fuelCosts: number; operationCosts: number; totalCosts: number; netProfit: number
  }[]
  totals: { totalHoursRented: number; revenueGenerated: number; maintenanceCosts: number; fuelCosts: number; totalCosts: number; netProfit: number }
}

interface RentalRevenueByClient {
  clients: { id: string; code: string; name: string; nameAr: string | null; revenue: number; invoiceCount: number }[]
  totalRevenue: number
}

interface EquipmentStatusReport {
  byStatus: Record<string, number>
  byCategory: Record<string, { count: number; byStatus: Record<string, number> }> // mapped from type field
  total: number
}

interface PurchaseSummary {
  bySupplier: { id: string; code: string; name: string; total: number; invoiceCount: number }[]
  byProject: { id: string; code: string; name: string; projectType: string; total: number; invoiceCount: number }[]
  totalPurchases: number; invoiceCount: number
}

interface RevenueSummary {
  totalConstructionRevenue: number; totalRentalRevenue: number; totalRevenue: number
  monthly: { month: string; construction: number; rental: number }[]
}

interface ExpenseSummary {
  totalDirect: number; totalIndirect: number; totalExpenses: number
  directByCategory: Record<string, number>; indirectByCategory: Record<string, number>
}

interface CashFlowSummary {
  totalInflows: number; totalOutflows: number; netCashFlow: number
  clientPaymentsTotal: number; supplierPaymentsTotal: number; salaryPaymentsTotal: number
  monthly: { month: string; inflows: number; outflows: number }[]
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

interface ProjectCostData {
  project: { id: string; code: string; name: string; nameAr: string | null; status: string; clientName: string; contractValue: number }
  costs: {
    materials: number; equipmentOperations: number; equipmentMaintenance: number; equipmentFuel: number
    subcontractors: number; labor: number; salaries: number; projectExpenses: number; equipmentCosts: number; equipmentUsages: number
  }
  totalCost: number; contractValue: number; grossProfit: number; profitMargin: number; inputVat: number
}

// ============ Shared Components ============
function ReportHeader({ title, icon: Icon, lang, onRefresh, onExport, printType, printData }: {
  title: string; icon: React.ElementType; lang: 'ar' | 'en'
  onRefresh?: () => void; onExport?: () => void; printType?: string; printData?: Record<string, unknown>
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-emerald-600" />
        <h3 className="font-semibold text-base">{title}</h3>
      </div>
      <div className="flex gap-1.5">
        {onRefresh && <Button variant="outline" size="icon" className="size-8" onClick={onRefresh}><RefreshCw className="size-3.5" /></Button>}
        {onExport && <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={onExport}><Download className="size-3.5" />{t('تصدير', 'Export', lang)}</Button>}
        {printType && <PrintButton type={printType as 'generic-table'} data={printData} size="sm" className="gap-1 h-8 text-xs" />}
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12">
        <Icon className="size-12 text-gray-300" />
        <p className="text-muted-foreground text-sm">{message}</p>
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton({ count = 5 }: { count?: number }) {
  return <div className="space-y-2">{Array.from({ length: count }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />)}</div>
}

function ProjectTypeBadge({ projectType, lang }: { projectType: string | null; lang: 'ar' | 'en' }) {
  if (!projectType) return null
  const isConstruction = projectType === 'CONSTRUCTION'
  return (
    <Badge className={`${isConstruction ? 'bg-emerald-100 text-emerald-700' : 'bg-cyan-100 text-cyan-700'} border-0 text-xs`}>
      {isConstruction ? t('تنفيذي', 'Const.', lang) : t('تأجير', 'Rental', lang)}
    </Badge>
  )
}

const statusLabels: Record<string, { ar: string; en: string; color: string }> = {
  AVAILABLE: { ar: 'متاح', en: 'Available', color: 'bg-emerald-100 text-emerald-700' },
  IN_USE: { ar: 'قيد الاستخدام', en: 'In Use', color: 'bg-amber-100 text-amber-700' },
  MAINTENANCE: { ar: 'صيانة', en: 'Maintenance', color: 'bg-rose-100 text-rose-700' },
  RENTED: { ar: 'مؤجر', en: 'Rented', color: 'bg-cyan-100 text-cyan-700' },
}

// ========================================================
// TAB 1: PROJECT REPORTS
// ========================================================
function ProjectReportsTab({ lang }: { lang: 'ar' | 'en' }) {
  const [subTab, setSubTab] = useState('profitability')
  const [selectedProjectId, setSelectedProjectId] = useState('')

  // Project Profitability
  const { data: profitData, isLoading: profitLoading, refetch: refetchProfit } = useQuery<ProjectProfitability>({
    queryKey: ['report-project-profitability'],
    queryFn: async () => { const res = await fetch('/api/reports?type=project-profitability'); if (!res.ok) throw new Error(); return res.json() },
  })

  // Project list for cost breakdown
  const { data: projectsList } = useQuery({
    queryKey: ['projects-list-for-report'],
    queryFn: async () => { const res = await fetch('/api/projects/list'); if (!res.ok) throw new Error(); return res.json() },
  })

  // Project cost detail
  const { data: costData, isLoading: costLoading, refetch: refetchCost } = useQuery<ProjectCostData>({
    queryKey: ['project-costs', selectedProjectId],
    queryFn: async () => { if (!selectedProjectId) return null; const res = await fetch(`/api/reports/project-costs?projectId=${selectedProjectId}`); if (!res.ok) throw new Error(); return res.json() },
    enabled: !!selectedProjectId,
  })

  // Project status summary from profitability data

  const handleExportProfit = useCallback(() => {
    if (!profitData) return
    const columns: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('المشروع', 'Project', lang) },
      { key: 'client', label: t('العميل', 'Client', lang) },
      { key: 'contractValue', label: t('قيمة العقد', 'Contract', lang), format: v => Number(v).toFixed(2) },
      { key: 'invoiced', label: t('المفوتر', 'Invoiced', lang), format: v => Number(v).toFixed(2) },
      { key: 'collected', label: t('المحصل', 'Collected', lang), format: v => Number(v).toFixed(2) },
      { key: 'totalCosts', label: t('التكاليف', 'Costs', lang), format: v => Number(v).toFixed(2) },
      { key: 'grossProfit', label: t('الربح', 'Profit', lang), format: v => Number(v).toFixed(2) },
      { key: 'profitMargin', label: t('الهامش %', 'Margin %', lang), format: v => Number(v).toFixed(1) },
    ]
    exportToCSV(profitData.projects as Record<string, unknown>[], 'project-profitability', columns)
  }, [profitData, lang])

  const statusSummary = React.useMemo(() => {
    if (!profitData?.projects) return { byStatus: {} as Record<string, number>, totalContractValue: 0, count: 0 }
    const byStatus: Record<string, number> = {}
    let totalCV = 0
    for (const p of profitData.projects) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1
      totalCV += p.contractValue
    }
    return { byStatus, totalContractValue: totalCV, count: profitData.projects.length }
  }, [profitData])

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="profitability" className="text-xs">{t('ربحية المشاريع', 'Profitability', lang)}</TabsTrigger>
          <TabsTrigger value="cost-breakdown" className="text-xs">{t('تفصيل التكاليف', 'Cost Breakdown', lang)}</TabsTrigger>
          <TabsTrigger value="status-summary" className="text-xs">{t('ملخص الحالات', 'Status Summary', lang)}</TabsTrigger>
        </TabsList>

        {/* Profitability Tab */}
        <TabsContent value="profitability" className="space-y-4">
          <ReportHeader title={t('تقرير ربحية المشاريع', 'Project Profitability Report', lang)} icon={TrendingUp} lang={lang}
            onRefresh={() => refetchProfit()} onExport={handleExportProfit} printType="generic-table" printData={profitData ? { columns: [{ key: 'code', label: t('الكود', 'Code', lang) }, { key: 'name', label: t('المشروع', 'Project', lang) }, { key: 'client', label: t('العميل', 'Client', lang) }, { key: 'contractValue', label: t('قيمة العقد', 'Contract', lang), align: 'amount' }, { key: 'invoiced', label: t('المفوتر', 'Invoiced', lang), align: 'amount' }, { key: 'totalCosts', label: t('التكاليف', 'Costs', lang), align: 'amount' }, { key: 'grossProfit', label: t('الربح', 'Profit', lang), align: 'amount' }, { key: 'profitMargin', label: t('الهامش %', 'Margin %', lang) }], rows: profitData.projects, totals: [{ label: t('إجمالي العقود', 'Total Contracts', lang), value: profitData.totals.contractValue }, { label: t('إجمالي التكاليف', 'Total Costs', lang), value: profitData.totals.totalCosts }, { label: t('إجمالي الربح', 'Total Profit', lang), value: profitData.totals.grossProfit, isGrand: true }] } as Record<string, unknown> : undefined} />

          {profitLoading ? <LoadingSkeleton /> : profitData?.projects && profitData.projects.length > 0 ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('قيمة العقود', 'Contracts', lang)}</p><MoneyDisplay value={profitData.totals.contractValue} lang={lang} size="sm" bold /></CardContent></Card>
                <Card className="bg-teal-50 border-teal-200"><CardContent className="p-3 text-center"><p className="text-xs text-teal-600">{t('المفوتر', 'Invoiced', lang)}</p><MoneyDisplay value={profitData.totals.invoiced} lang={lang} size="sm" bold /></CardContent></Card>
                <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('المحصل', 'Collected', lang)}</p><MoneyDisplay value={profitData.totals.collected} lang={lang} size="sm" bold /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('التكاليف', 'Costs', lang)}</p><MoneyDisplay value={profitData.totals.totalCosts} lang={lang} size="sm" bold /></CardContent></Card>
                <Card className={`${profitData.totals.grossProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('الربح', 'Profit', lang)}</p><MoneyDisplay value={profitData.totals.grossProfit} lang={lang} size="sm" bold className={profitData.totals.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></CardContent></Card>
              </div>
              {/* Table */}
              <Card><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                    <TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead>
                    <TableHead className="text-right">{t('قيمة العقد', 'Contract', lang)}</TableHead>
                    <TableHead className="text-right">{t('المفوتر', 'Invoiced', lang)}</TableHead>
                    <TableHead className="text-right">{t('المحصل', 'Collected', lang)}</TableHead>
                    <TableHead className="text-right">{t('التكاليف', 'Costs', lang)}</TableHead>
                    <TableHead className="text-right">{t('الربح', 'Profit', lang)}</TableHead>
                    <TableHead className="text-right">{t('الهامش %', 'Margin %', lang)}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {profitData.projects.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.code}</TableCell>
                        <TableCell><div className="flex items-center gap-1.5"><span className="font-medium text-sm">{p.name}</span><ProjectTypeBadge projectType={p.projectType} lang={lang} /></div></TableCell>
                        <TableCell><ProjectTypeBadge projectType={p.projectType} lang={lang} /></TableCell>
                        <TableCell><MoneyDisplay value={p.contractValue} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                        <TableCell><MoneyDisplay value={p.invoiced} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                        <TableCell><MoneyDisplay value={p.collected} lang={lang} size="xs" inline showSymbol={false} className="text-teal-600" /></TableCell>
                        <TableCell><MoneyDisplay value={p.totalCosts} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell>
                        <TableCell><MoneyDisplay value={p.grossProfit} lang={lang} size="xs" bold inline showSymbol={false} className={p.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'} /></TableCell>
                        <TableCell className={`font-bold text-xs ${p.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatNumber(Math.round(p.profitMargin))}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div></CardContent></Card>
            </>
          ) : <EmptyState icon={Building2} message={t('لا توجد مشاريع', 'No projects found', lang)} />}
        </TabsContent>

        {/* Cost Breakdown Tab */}
        <TabsContent value="cost-breakdown" className="space-y-4">
          <Card className="bg-gray-50/50"><CardContent className="p-4">
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
              {selectedProjectId && <Button variant="outline" size="icon" className="size-8" onClick={() => refetchCost()}><RefreshCw className="size-3.5" /></Button>}
            </div>
          </CardContent></Card>

          {!selectedProjectId ? <EmptyState icon={Building2} message={t('اختر مشروعاً لعرض تفصيل التكاليف', 'Select a project to view cost breakdown', lang)} />
            : costLoading ? <LoadingSkeleton />
            : costData ? (
              <>
                <Card className={`border-2 ${costData.grossProfit >= 0 ? 'border-emerald-300 bg-emerald-50/30' : 'border-rose-300 bg-rose-50/30'}`}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div><h3 className="text-lg font-bold">{costData.project.name}</h3><p className="text-sm text-muted-foreground">{costData.project.code} • {costData.project.clientName}</p></div>
                      <Badge className={`${costData.grossProfit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} border-0`}>
                        {costData.grossProfit >= 0 ? t('رابح', 'Profitable', lang) : t('خاسر', 'Losing', lang)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white rounded-lg p-3 text-center border"><p className="text-xs text-gray-500">{t('قيمة العقد', 'Contract Value', lang)}</p><MoneyDisplay value={costData.contractValue} lang={lang} size="md" bold /></div>
                      <div className="bg-white rounded-lg p-3 text-center border"><p className="text-xs text-gray-500">{t('إجمالي التكلفة', 'Total Cost', lang)}</p><MoneyDisplay value={costData.totalCost} lang={lang} size="md" bold className="text-rose-600" /></div>
                      <div className={`rounded-lg p-3 text-center border ${costData.grossProfit >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}><p className="text-xs">{t('الربح الإجمالي', 'Gross Profit', lang)}</p><MoneyDisplay value={costData.grossProfit} lang={lang} size="md" bold className={costData.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'} /></div>
                      <div className={`rounded-lg p-3 text-center border ${costData.grossProfit >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}><p className="text-xs">{t('هامش الربح', 'Profit Margin', lang)}</p><p className={`text-xl font-bold ${costData.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatNumber(Math.round(costData.profitMargin))}%</p></div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Receipt className="size-5 text-amber-600" />{t('تفصيل التكاليف', 'Cost Breakdown', lang)}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-right">{t('البند', 'Item', lang)}</TableHead><TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead><TableHead className="text-right">{t('النسبة', '%', lang)}</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {[
                          { label: t('المواد', 'Materials', lang), value: costData.costs.materials },
                          { label: t('تشغيل المعدات', 'Equip. Operations', lang), value: costData.costs.equipmentOperations },
                          { label: t('صيانة المعدات', 'Equip. Maintenance', lang), value: costData.costs.equipmentMaintenance },
                          { label: t('وقود المعدات', 'Equip. Fuel', lang), value: costData.costs.equipmentFuel },
                          { label: t('مقاولو الباطن', 'Subcontractors', lang), value: costData.costs.subcontractors },
                          { label: t('العمالة', 'Labor', lang), value: costData.costs.labor },
                          { label: t('الرواتب', 'Salaries', lang), value: costData.costs.salaries },
                          { label: t('مصروفات المشروع', 'Project Expenses', lang), value: costData.costs.projectExpenses },
                        ].map(item => (
                          <TableRow key={item.label}>
                            <TableCell className="text-sm">{item.label}</TableCell>
                            <TableCell><MoneyDisplay value={item.value} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{costData.totalCost > 0 ? formatNumber(Math.round((item.value / costData.totalCost) * 100)) + '%' : '0%'}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-rose-50 font-semibold">
                          <TableCell>{t('إجمالي التكلفة', 'Total Cost', lang)}</TableCell>
                          <TableCell><MoneyDisplay value={costData.totalCost} lang={lang} size="sm" bold inline showSymbol={false} className="text-rose-700" /></TableCell>
                          <TableCell className="text-xs">100%</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table></div>
                  </CardContent>
                </Card>
              </>
            ) : null}
        </TabsContent>

        {/* Status Summary Tab */}
        <TabsContent value="status-summary" className="space-y-4">
          <ReportHeader title={t('ملخص حالات المشاريع', 'Project Status Summary', lang)} icon={PieChart} lang={lang} printType="generic-table" printData={statusSummary ? { columns: [{ key: 'status', label: t('الحالة', 'Status', lang) }, { key: 'count', label: t('العدد', 'Count', lang) }], rows: Object.entries(statusSummary.byStatus).map(([status, count]) => ({ status, count })) } as Record<string, unknown> : undefined} />
          {profitData?.projects ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-4 text-center"><p className="text-xs text-emerald-600">{t('إجمالي المشاريع', 'Total Projects', lang)}</p><p className="text-2xl font-bold text-emerald-800">{statusSummary.count}</p></CardContent></Card>
                <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-4 text-center"><p className="text-xs text-cyan-600">{t('إجمالي العقود', 'Total Contracts', lang)}</p><MoneyDisplay value={statusSummary.totalContractValue} lang={lang} size="md" bold /></CardContent></Card>
              </div>
              <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead><TableHead className="text-right">{t('العدد', 'Count', lang)}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {Object.entries(statusSummary.byStatus).map(([status, count]) => (
                    <TableRow key={status}><TableCell className="font-medium">{status}</TableCell><TableCell className="font-bold">{count}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table></div></CardContent></Card>
            </>
          ) : <EmptyState icon={PieChart} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ========================================================
// TAB 2: RENTAL REPORTS
// ========================================================
function RentalReportsTab({ lang }: { lang: 'ar' | 'en' }) {
  const [subTab, setSubTab] = useState('utilization')

  const { data: utilData, isLoading: utilLoading, refetch: refetchUtil } = useQuery<EquipmentUtilization>({
    queryKey: ['report-equipment-utilization'],
    queryFn: async () => { const res = await fetch('/api/reports?type=equipment-utilization'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: revByClient, isLoading: revLoading, refetch: refetchRev } = useQuery<RentalRevenueByClient>({
    queryKey: ['report-rental-revenue-by-client'],
    queryFn: async () => { const res = await fetch('/api/reports?type=rental-revenue-by-client'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: eqStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<EquipmentStatusReport>({
    queryKey: ['report-equipment-status'],
    queryFn: async () => { const res = await fetch('/api/reports?type=equipment-status'); if (!res.ok) throw new Error(); return res.json() },
  })

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="utilization" className="text-xs">{t('استخدام المعدات', 'Equipment Utilization', lang)}</TabsTrigger>
          <TabsTrigger value="revenue-by-client" className="text-xs">{t('إيرادات حسب العميل', 'Revenue by Client', lang)}</TabsTrigger>
          <TabsTrigger value="equipment-status" className="text-xs">{t('حالة المعدات', 'Equipment Status', lang)}</TabsTrigger>
        </TabsList>

        <TabsContent value="utilization" className="space-y-4">
          <ReportHeader title={t('تقرير استخدام المعدات', 'Equipment Utilization Report', lang)} icon={Truck} lang={lang}
            onRefresh={() => refetchUtil()} printType="generic-table" printData={utilData ? { columns: [{ key: 'code', label: t('الكود', 'Code', lang) }, { key: 'name', label: t('المعدة', 'Equipment', lang) }, { key: 'totalHoursRented', label: t('الساعات', 'Hours', lang) }, { key: 'revenueGenerated', label: t('الإيرادات', 'Revenue', lang), align: 'amount' }, { key: 'totalCosts', label: t('التكاليف', 'Costs', lang), align: 'amount' }, { key: 'netProfit', label: t('صافي الربح', 'Net Profit', lang), align: 'amount' }], rows: utilData.equipment, totals: [{ label: t('إجمالي الإيرادات', 'Total Revenue', lang), value: utilData.totals.revenueGenerated }, { label: t('إجمالي التكاليف', 'Total Costs', lang), value: utilData.totals.totalCosts }, { label: t('صافي الربح', 'Net Profit', lang), value: utilData.totals.netProfit, isGrand: true }] } as Record<string, unknown> : undefined} />
          {utilLoading ? <LoadingSkeleton /> : utilData?.equipment && utilData.equipment.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('إجمالي الساعات', 'Total Hours', lang)}</p><p className="text-xl font-bold text-cyan-800">{formatNumber(Math.round(utilData.totals.totalHoursRented))}</p></CardContent></Card>
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('الإيرادات', 'Revenue', lang)}</p><MoneyDisplay value={utilData.totals.revenueGenerated} lang={lang} size="sm" bold /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('التكاليف', 'Costs', lang)}</p><MoneyDisplay value={utilData.totals.totalCosts} lang={lang} size="sm" bold /></CardContent></Card>
                <Card className={`${utilData.totals.netProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('صافي الربح', 'Net Profit', lang)}</p><MoneyDisplay value={utilData.totals.netProfit} lang={lang} size="sm" bold className={utilData.totals.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></CardContent></Card>
              </div>
              <Card><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('المعدة', 'Equipment', lang)}</TableHead>
                    <TableHead className="text-right">{t('الساعات', 'Hours', lang)}</TableHead>
                    <TableHead className="text-right">{t('الإيرادات', 'Revenue', lang)}</TableHead>
                    <TableHead className="text-right">{t('الصيانة', 'Maint.', lang)}</TableHead>
                    <TableHead className="text-right">{t('الوقود', 'Fuel', lang)}</TableHead>
                    <TableHead className="text-right">{t('التكاليف', 'Costs', lang)}</TableHead>
                    <TableHead className="text-right">{t('صافي الربح', 'Net Profit', lang)}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {utilData.equipment.map(eq => (
                      <TableRow key={eq.id}>
                        <TableCell className="font-mono text-xs">{eq.code}</TableCell>
                        <TableCell className="font-medium text-sm">{eq.name}</TableCell>
                        <TableCell className="text-sm">{formatNumber(Math.round(eq.totalHoursRented))}</TableCell>
                        <TableCell><MoneyDisplay value={eq.revenueGenerated} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell>
                        <TableCell><MoneyDisplay value={eq.maintenanceCosts} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                        <TableCell><MoneyDisplay value={eq.fuelCosts} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                        <TableCell><MoneyDisplay value={eq.totalCosts} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell>
                        <TableCell><MoneyDisplay value={eq.netProfit} lang={lang} size="xs" bold inline showSymbol={false} className={eq.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div></CardContent></Card>
            </>
          ) : <EmptyState icon={Truck} message={t('لا توجد معدات', 'No equipment found', lang)} />}
        </TabsContent>

        <TabsContent value="revenue-by-client" className="space-y-4">
          <ReportHeader title={t('إيرادات التأجير حسب العميل', 'Rental Revenue by Client', lang)} icon={CreditCard} lang={lang}
            onRefresh={() => refetchRev()} printType="generic-table" printData={revByClient ? { columns: [{ key: 'code', label: t('الكود', 'Code', lang) }, { key: 'name', label: t('العميل', 'Client', lang) }, { key: 'invoiceCount', label: t('عدد الفواتير', 'Invoices', lang) }, { key: 'revenue', label: t('الإيرادات', 'Revenue', lang), align: 'amount' }], rows: revByClient.clients, totals: [{ label: t('إجمالي الإيرادات', 'Total Revenue', lang), value: revByClient.totalRevenue, isGrand: true }] } as Record<string, unknown> : undefined} />
          {revLoading ? <LoadingSkeleton /> : revByClient?.clients && revByClient.clients.length > 0 ? (
            <>
              <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-4 text-center"><p className="text-xs text-cyan-600">{t('إجمالي إيرادات التأجير', 'Total Rental Revenue', lang)}</p><MoneyDisplay value={revByClient.totalRevenue} lang={lang} size="lg" bold /></CardContent></Card>
              <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table>
                <TableHeader><TableRow>
                  <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                  <TableHead className="text-right">{t('العميل', 'Client', lang)}</TableHead>
                  <TableHead className="text-right">{t('عدد الفواتير', 'Invoices', lang)}</TableHead>
                  <TableHead className="text-right">{t('الإيرادات', 'Revenue', lang)}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {revByClient.clients.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.code}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm">{c.invoiceCount}</TableCell>
                      <TableCell><MoneyDisplay value={c.revenue} lang={lang} size="xs" bold inline showSymbol={false} className="text-cyan-600" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div></CardContent></Card>
            </>
          ) : <EmptyState icon={CreditCard} message={t('لا توجد إيرادات تأجير', 'No rental revenue', lang)} />}
        </TabsContent>

        <TabsContent value="equipment-status" className="space-y-4">
          <ReportHeader title={t('تقرير حالة المعدات', 'Equipment Status Report', lang)} icon={Wrench} lang={lang}
            onRefresh={() => refetchStatus()} printType="generic-table" printData={eqStatus ? { columns: [{ key: 'status', label: t('الحالة', 'Status', lang) }, { key: 'count', label: t('العدد', 'Count', lang) }], rows: Object.entries(eqStatus.byStatus).map(([status, count]) => ({ status, count })), infoItems: [{ label: t('إجمالي المعدات', 'Total Equipment', lang), value: String(eqStatus.total) }] } as Record<string, unknown> : undefined} />
          {statusLoading ? <LoadingSkeleton /> : eqStatus ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('إجمالي المعدات', 'Total', lang)}</p><p className="text-xl font-bold">{eqStatus.total}</p></CardContent></Card>
                {Object.entries(eqStatus.byStatus).map(([status, count]) => {
                  const sl = statusLabels[status]
                  return <Card key={status} className={`${sl?.color || 'bg-gray-50 border-gray-200'} border`}><CardContent className="p-3 text-center"><p className="text-xs">{sl ? t(sl.ar, sl.en, lang) : status}</p><p className="text-xl font-bold">{count}</p></CardContent></Card>
                })}
              </div>
              {Object.keys(eqStatus.byCategory).length > 0 && (
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">{t('حسب الفئة', 'By Category', lang)}</CardTitle></CardHeader>
                  <CardContent className="p-0"><div className="overflow-x-auto"><Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('الفئة', 'Category', lang)}</TableHead><TableHead className="text-right">{t('العدد', 'Count', lang)}</TableHead>
                      {Object.keys(eqStatus.byStatus).map(s => <TableHead key={s} className="text-right">{statusLabels[s] ? t(statusLabels[s].ar, statusLabels[s].en, lang) : s}</TableHead>)}
                    </TableRow></TableHeader>
                    <TableBody>
                      {Object.entries(eqStatus.byCategory).map(([cat, data]) => (
                        <TableRow key={cat}><TableCell className="font-medium">{cat}</TableCell><TableCell>{data.count}</TableCell>
                          {Object.keys(eqStatus.byStatus).map(s => <TableCell key={s} className="text-sm">{data.byStatus[s] || 0}</TableCell>)}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div></CardContent>
                </Card>
              )}
            </>
          ) : <EmptyState icon={Wrench} message={t('لا توجد معدات', 'No equipment', lang)} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ========================================================
// TAB 3: FINANCIAL REPORTS
// ========================================================
function FinancialReportsTab({ lang }: { lang: 'ar' | 'en' }) {
  const [subTab, setSubTab] = useState('trial-balance')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Trial Balance
  const { data: tbData, isLoading: tbLoading, refetch: refetchTb } = useQuery({
    queryKey: ['trial-balance-report', dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/trial-balance?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Revenue Summary
  const { data: revData, isLoading: revLoading, refetch: refetchRev } = useQuery<RevenueSummary>({
    queryKey: ['report-revenue-summary'],
    queryFn: async () => { const res = await fetch('/api/reports?type=revenue-summary'); if (!res.ok) throw new Error(); return res.json() },
  })

  // Expense Summary
  const { data: expData, isLoading: expLoading, refetch: refetchExp } = useQuery<ExpenseSummary>({
    queryKey: ['report-expense-summary'],
    queryFn: async () => { const res = await fetch('/api/reports?type=expense-summary'); if (!res.ok) throw new Error(); return res.json() },
  })

  // Cash Flow Summary
  const { data: cfData, isLoading: cfLoading, refetch: refetchCf } = useQuery<CashFlowSummary>({
    queryKey: ['report-cash-flow-summary'],
    queryFn: async () => { const res = await fetch('/api/reports?type=cash-flow-summary'); if (!res.ok) throw new Error(); return res.json() },
  })

  const handleExportTb = useCallback(() => {
    if (!tbData?.data) return
    const columns: CSVColumn[] = [
      { key: 'account.code', label: t('الكود', 'Code', lang) },
      { key: 'account.name', label: t('الحساب', 'Account', lang) },
      { key: 'netDebit', label: t('مدين', 'Debit', lang), format: v => Number(v).toFixed(2) },
      { key: 'netCredit', label: t('دائن', 'Credit', lang), format: v => Number(v).toFixed(2) },
    ]
    exportToCSV(tbData.data as Record<string, unknown>[], 'trial-balance', columns)
  }, [tbData, lang])

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="trial-balance" className="text-xs">{t('ميزان المراجعة', 'Trial Balance', lang)}</TabsTrigger>
          <TabsTrigger value="revenue-summary" className="text-xs">{t('ملخص الإيرادات', 'Revenue', lang)}</TabsTrigger>
          <TabsTrigger value="expense-summary" className="text-xs">{t('ملخص المصروفات', 'Expenses', lang)}</TabsTrigger>
          <TabsTrigger value="cash-flow" className="text-xs">{t('التدفق النقدي', 'Cash Flow', lang)}</TabsTrigger>
        </TabsList>

        {/* Trial Balance */}
        <TabsContent value="trial-balance" className="space-y-4">
          <ReportHeader title={t('ميزان المراجعة', 'Trial Balance', lang)} icon={BookOpen} lang={lang}
            onRefresh={() => refetchTb()} onExport={handleExportTb} printType="generic-table" printData={tbData?.data ? { columns: [{ key: 'account.code', label: t('الكود', 'Code', lang) }, { key: 'account.name', label: t('الحساب', 'Account', lang) }, { key: 'netDebit', label: t('مدين', 'Debit', lang), align: 'amount' }, { key: 'netCredit', label: t('دائن', 'Credit', lang), align: 'amount' }], rows: tbData.data, totals: tbData.totals ? [{ label: t('إجمالي مدين', 'Total Debit', lang), value: tbData.totals.totalDebit }, { label: t('إجمالي دائن', 'Total Credit', lang), value: tbData.totals.totalCredit, isGrand: true }] : undefined } as Record<string, unknown> : undefined} />
          <Card className="bg-gray-50/50"><CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-sm">{t('من', 'From', lang)}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 h-8 text-sm" />
              <Label className="text-sm">{t('إلى', 'To', lang)}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 h-8 text-sm" />
            </div>
          </CardContent></Card>
          {tbLoading ? <LoadingSkeleton /> : tbData?.data && Array.isArray(tbData.data) && tbData.data.length > 0 ? (
            <>
              {tbData.totals && (
                <div className="grid grid-cols-2 gap-3">
                  <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('إجمالي مدين', 'Total Debit', lang)}</p><MoneyDisplay value={tbData.totals.totalDebit} lang={lang} size="md" bold /></CardContent></Card>
                  <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('إجمالي دائن', 'Total Credit', lang)}</p><MoneyDisplay value={tbData.totals.totalCredit} lang={lang} size="md" bold /></CardContent></Card>
                </div>
              )}
              <Card><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
                <TableHeader><TableRow>
                  <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                  <TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead>
                  <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                  <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(tbData.data as { account: { code: string; name: string }; totalDebit: number; totalCredit: number; netDebit: number; netCredit: number }[]).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{row.account.code}</TableCell>
                      <TableCell className="text-sm">{row.account.name}</TableCell>
                      <TableCell>{row.netDebit > 0 ? <MoneyDisplay value={row.netDebit} lang={lang} size="xs" bold inline showSymbol={false} /> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                      <TableCell>{row.netCredit > 0 ? <MoneyDisplay value={row.netCredit} lang={lang} size="xs" bold inline showSymbol={false} /> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div></CardContent></Card>
              {tbData.totals && (
                <Badge className={`${tbData.totals.isBalanced ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} border-0`}>
                  {tbData.totals.isBalanced ? t('✓ الميزان متوازن', '✓ Balance is balanced', lang) : t('✗ الميزان غير متوازن', '✗ Balance is not balanced', lang)}
                </Badge>
              )}
            </>
          ) : <EmptyState icon={BookOpen} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>

        {/* Revenue Summary */}
        <TabsContent value="revenue-summary" className="space-y-4">
          <ReportHeader title={t('ملخص الإيرادات', 'Revenue Summary', lang)} icon={TrendingUp} lang={lang}
            onRefresh={() => refetchRev()} printType="generic-table" printData={revData ? { columns: [{ key: 'month', label: t('الشهر', 'Month', lang) }, { key: 'construction', label: t('التنفيذية', 'Construction', lang), align: 'amount' }, { key: 'rental', label: t('التأجير', 'Rental', lang), align: 'amount' }], rows: revData.monthly.map((m: { month: string; construction: number; rental: number }) => ({ ...m, total: m.construction + m.rental })), totals: [{ label: t('إجمالي الإيرادات', 'Total Revenue', lang), value: revData.totalRevenue, isGrand: true }] } as Record<string, unknown> : undefined} />
          {revLoading ? <LoadingSkeleton /> : revData ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card className="border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white"><CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2"><Building2 className="size-5 text-emerald-600" /><span className="text-xs text-emerald-600">{t('التنفيذية', 'Construction', lang)}</span></div>
                  <MoneyDisplay value={revData.totalConstructionRevenue} lang={lang} size="lg" bold className="text-emerald-700" />
                </CardContent></Card>
                <Card className="border-2 border-cyan-300 bg-gradient-to-br from-cyan-50 to-white"><CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2"><Truck className="size-5 text-cyan-600" /><span className="text-xs text-cyan-600">{t('التأجير', 'Rental', lang)}</span></div>
                  <MoneyDisplay value={revData.totalRentalRevenue} lang={lang} size="lg" bold className="text-cyan-700" />
                </CardContent></Card>
                <Card className="bg-gray-50"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">{t('الإجمالي', 'Total', lang)}</p><MoneyDisplay value={revData.totalRevenue} lang={lang} size="lg" bold /></CardContent></Card>
              </div>
              {revData.monthly.length > 0 && (
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">{t('الإيرادات الشهرية', 'Monthly Revenue', lang)}</CardTitle></CardHeader>
                <CardContent className="p-0"><div className="overflow-x-auto"><Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">{t('الشهر', 'Month', lang)}</TableHead>
                    <TableHead className="text-right"><span className="text-emerald-600">{t('التنفيذية', 'Construction', lang)}</span></TableHead>
                    <TableHead className="text-right"><span className="text-cyan-600">{t('التأجير', 'Rental', lang)}</span></TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {revData.monthly.map(m => (
                      <TableRow key={m.month}>
                        <TableCell className="font-mono text-sm">{m.month}</TableCell>
                        <TableCell><MoneyDisplay value={m.construction} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell>
                        <TableCell><MoneyDisplay value={m.rental} lang={lang} size="xs" inline showSymbol={false} className="text-cyan-600" /></TableCell>
                        <TableCell><MoneyDisplay value={m.construction + m.rental} lang={lang} size="xs" bold inline showSymbol={false} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div></CardContent></Card>
              )}
            </>
          ) : <EmptyState icon={TrendingUp} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>

        {/* Expense Summary */}
        <TabsContent value="expense-summary" className="space-y-4">
          <ReportHeader title={t('ملخص المصروفات', 'Expense Summary', lang)} icon={Receipt} lang={lang}
            onRefresh={() => refetchExp()} printType="generic-table" printData={expData ? { columns: [{ key: 'category', label: t('الفئة', 'Category', lang) }, { key: 'amount', label: t('المبلغ', 'Amount', lang), align: 'amount' }], rows: [...Object.entries(expData.directByCategory).map(([category, amount]) => ({ category, amount, type: t('مباشر', 'Direct', lang) })), ...Object.entries(expData.indirectByCategory).map(([category, amount]) => ({ category, amount, type: t('غير مباشر', 'Indirect', lang) }))], totals: [{ label: t('مباشر', 'Direct', lang), value: expData.totalDirect }, { label: t('غير مباشر', 'Indirect', lang), value: expData.totalIndirect }, { label: t('الإجمالي', 'Total', lang), value: expData.totalExpenses, isGrand: true }] } as Record<string, unknown> : undefined} />
          {expLoading ? <LoadingSkeleton /> : expData ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3 text-center"><p className="text-xs text-amber-600">{t('تكاليف مباشرة', 'Direct Costs', lang)}</p><MoneyDisplay value={expData.totalDirect} lang={lang} size="md" bold className="text-amber-700" /></CardContent></Card>
                <Card className="bg-purple-50 border-purple-200"><CardContent className="p-3 text-center"><p className="text-xs text-purple-600">{t('تكاليف غير مباشرة', 'Indirect Costs', lang)}</p><MoneyDisplay value={expData.totalIndirect} lang={lang} size="md" bold className="text-purple-700" /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('الإجمالي', 'Total', lang)}</p><MoneyDisplay value={expData.totalExpenses} lang={lang} size="md" bold className="text-rose-700" /></CardContent></Card>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card><CardHeader className="pb-3"><CardTitle className="text-base text-amber-800">{t('التكاليف المباشرة حسب الفئة', 'Direct Costs by Category', lang)}</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {Object.entries(expData.directByCategory).map(([cat, val]) => (
                      <div key={cat} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-gray-50">
                        <span className="text-sm">{cat}</span><MoneyDisplay value={val} lang={lang} size="xs" bold inline showSymbol={false} className="text-amber-700" />
                      </div>
                    ))}
                    {Object.keys(expData.directByCategory).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t('لا توجد بيانات', 'No data', lang)}</p>}
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-amber-50 font-semibold">
                      <span className="text-amber-800">{t('الإجمالي', 'Total', lang)}</span>
                      <MoneyDisplay value={expData.totalDirect} lang={lang} size="sm" bold className="text-amber-700" />
                    </div>
                  </CardContent>
                </Card>
                <Card><CardHeader className="pb-3"><CardTitle className="text-base text-purple-800">{t('التكاليف غير المباشرة حسب الفئة', 'Indirect Costs by Category', lang)}</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {Object.entries(expData.indirectByCategory).map(([cat, val]) => (
                      <div key={cat} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-gray-50">
                        <span className="text-sm">{cat}</span><MoneyDisplay value={val} lang={lang} size="xs" bold inline showSymbol={false} className="text-purple-700" />
                      </div>
                    ))}
                    {Object.keys(expData.indirectByCategory).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t('لا توجد بيانات', 'No data', lang)}</p>}
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-purple-50 font-semibold">
                      <span className="text-purple-800">{t('الإجمالي', 'Total', lang)}</span>
                      <MoneyDisplay value={expData.totalIndirect} lang={lang} size="sm" bold className="text-purple-700" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : <EmptyState icon={Receipt} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>

        {/* Cash Flow */}
        <TabsContent value="cash-flow" className="space-y-4">
          <ReportHeader title={t('ملخص التدفق النقدي', 'Cash Flow Summary', lang)} icon={Wallet} lang={lang}
            onRefresh={() => refetchCf()} printType="generic-table" printData={cfData ? { columns: [{ key: 'month', label: t('الشهر', 'Month', lang) }, { key: 'inflows', label: t('الداخلة', 'Inflows', lang), align: 'amount' }, { key: 'outflows', label: t('الخارجة', 'Outflows', lang), align: 'amount' }, { key: 'net', label: t('صافي التدفق', 'Net Flow', lang), align: 'amount' }], rows: cfData.monthly.map((m: { month: string; inflows: number; outflows: number }) => ({ ...m, net: m.inflows - m.outflows })), totals: [{ label: t('التدفقات الداخلة', 'Total Inflows', lang), value: cfData.totalInflows }, { label: t('التدفقات الخارجة', 'Total Outflows', lang), value: cfData.totalOutflows }, { label: t('صافي التدفق', 'Net Cash Flow', lang), value: cfData.netCashFlow, isGrand: true }] } as Record<string, unknown> : undefined} />
          {cfLoading ? <LoadingSkeleton /> : cfData ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('التدفقات الداخلة', 'Inflows', lang)}</p><MoneyDisplay value={cfData.totalInflows} lang={lang} size="md" bold className="text-emerald-700" /></CardContent></Card>
                <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('التدفقات الخارجة', 'Outflows', lang)}</p><MoneyDisplay value={cfData.totalOutflows} lang={lang} size="md" bold className="text-rose-700" /></CardContent></Card>
                <Card className={`${cfData.netCashFlow >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('صافي التدفق', 'Net Flow', lang)}</p><MoneyDisplay value={cfData.netCashFlow} lang={lang} size="md" bold className={cfData.netCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></CardContent></Card>
                <Card className="bg-gray-50 border-gray-200"><CardContent className="p-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">{t('تحصيلات عملاء', 'Client Payments', lang)}</span><span className="font-medium"><MoneyDisplay value={cfData.clientPaymentsTotal} lang={lang} size="xs" inline showSymbol={false} /></span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{t('سداد موردين', 'Supplier Payments', lang)}</span><span className="font-medium"><MoneyDisplay value={cfData.supplierPaymentsTotal} lang={lang} size="xs" inline showSymbol={false} /></span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{t('رواتب', 'Salaries', lang)}</span><span className="font-medium"><MoneyDisplay value={cfData.salaryPaymentsTotal} lang={lang} size="xs" inline showSymbol={false} /></span></div>
                  </div>
                </CardContent></Card>
              </div>
              {cfData.monthly.length > 0 && (
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">{t('التدفق النقدي الشهري', 'Monthly Cash Flow', lang)}</CardTitle></CardHeader>
                <CardContent className="p-0"><div className="overflow-x-auto"><Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">{t('الشهر', 'Month', lang)}</TableHead>
                    <TableHead className="text-right"><span className="text-emerald-600">{t('الداخلة', 'Inflows', lang)}</span></TableHead>
                    <TableHead className="text-right"><span className="text-rose-600">{t('الخارجة', 'Outflows', lang)}</span></TableHead>
                    <TableHead className="text-right">{t('صافي التدفق', 'Net Flow', lang)}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {cfData.monthly.map(m => {
                      const net = m.inflows - m.outflows
                      return (
                        <TableRow key={m.month}>
                          <TableCell className="font-mono text-sm">{m.month}</TableCell>
                          <TableCell><MoneyDisplay value={m.inflows} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell>
                          <TableCell><MoneyDisplay value={m.outflows} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell>
                          <TableCell><MoneyDisplay value={net} lang={lang} size="xs" bold inline showSymbol={false} className={net >= 0 ? 'text-emerald-600' : 'text-rose-600'} /></TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table></div></CardContent></Card>
              )}
            </>
          ) : <EmptyState icon={Wallet} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ========================================================
// TAB 4: PURCHASE REPORTS
// ========================================================
function PurchaseReportsTab({ lang }: { lang: 'ar' | 'en' }) {
  const [subTab, setSubTab] = useState('summary')

  const { data: purchaseSummary, isLoading: purchaseLoading, refetch: refetchPurchase } = useQuery<PurchaseSummary>({
    queryKey: ['report-purchase-summary'],
    queryFn: async () => { const res = await fetch('/api/reports?type=purchase-summary'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: supplierData, isLoading: supplierLoading, refetch: refetchSupplier } = useQuery<SupplierBalanceData>({
    queryKey: ['supplier-balances-report'],
    queryFn: async () => { const res = await fetch('/api/reports/supplier-balances'); if (!res.ok) throw new Error(); return res.json() },
  })

  const handleExportSupplier = useCallback(() => {
    if (!supplierData) return
    const columns: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('الاسم', 'Name', lang) },
      { key: 'totalPurchased', label: t('المشتريات', 'Purchased', lang), format: v => Number(v).toFixed(2) },
      { key: 'totalPaid', label: t('المدفوع', 'Paid', lang), format: v => Number(v).toFixed(2) },
      { key: 'balanceOwed', label: t('الرصيد', 'Balance', lang), format: v => Number(v).toFixed(2) },
    ]
    exportToCSV(supplierData.suppliers as Record<string, unknown>[], 'supplier-balances', columns)
  }, [supplierData, lang])

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="summary" className="text-xs">{t('ملخص المشتريات', 'Purchase Summary', lang)}</TabsTrigger>
          <TabsTrigger value="supplier-balances" className="text-xs">{t('أرصدة الموردين', 'Supplier Balances', lang)}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          <ReportHeader title={t('ملخص المشتريات', 'Purchase Summary', lang)} icon={ShoppingCart} lang={lang}
            onRefresh={() => refetchPurchase()} printType="generic-table" printData={purchaseSummary ? { columns: [{ key: 'name', label: t('المورد', 'Supplier', lang) }, { key: 'invoiceCount', label: t('الفواتير', 'Inv.', lang) }, { key: 'total', label: t('الإجمالي', 'Total', lang), align: 'amount' }], rows: purchaseSummary.bySupplier, totals: [{ label: t('إجمالي المشتريات', 'Total Purchases', lang), value: purchaseSummary.totalPurchases, isGrand: true }] } as Record<string, unknown> : undefined} />
          {purchaseLoading ? <LoadingSkeleton /> : purchaseSummary ? (
            <>
              <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4 text-center"><p className="text-xs text-amber-600">{t('إجمالي المشتريات', 'Total Purchases', lang)}</p><MoneyDisplay value={purchaseSummary.totalPurchases} lang={lang} size="lg" bold className="text-amber-700" /><p className="text-xs text-muted-foreground mt-1">{purchaseSummary.invoiceCount} {t('فاتورة', 'invoices', lang)}</p></CardContent></Card>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">{t('حسب المورد', 'By Supplier', lang)}</CardTitle></CardHeader>
                  <CardContent className="p-0"><div className="overflow-x-auto max-h-64 overflow-y-auto"><Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('المورد', 'Supplier', lang)}</TableHead><TableHead className="text-right">{t('الفواتير', 'Inv.', lang)}</TableHead><TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {purchaseSummary.bySupplier.map(s => (
                        <TableRow key={s.id}><TableCell className="text-sm">{s.name}</TableCell><TableCell className="text-xs">{s.invoiceCount}</TableCell><TableCell><MoneyDisplay value={s.total} lang={lang} size="xs" inline showSymbol={false} /></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table></div></CardContent>
                </Card>
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">{t('حسب المشروع', 'By Project', lang)}</CardTitle></CardHeader>
                  <CardContent className="p-0"><div className="overflow-x-auto max-h-64 overflow-y-auto"><Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead><TableHead className="text-right">{t('الفواتير', 'Inv.', lang)}</TableHead><TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {purchaseSummary.byProject.map(p => (
                        <TableRow key={p.id}>
                          <TableCell><div className="flex items-center gap-1"><span className="text-sm">{p.name}</span><ProjectTypeBadge projectType={p.projectType} lang={lang} /></div></TableCell>
                          <TableCell className="text-xs">{p.invoiceCount}</TableCell><TableCell><MoneyDisplay value={p.total} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div></CardContent>
                </Card>
              </div>
            </>
          ) : <EmptyState icon={ShoppingCart} message={t('لا توجد بيانات', 'No data', lang)} />}
        </TabsContent>

        <TabsContent value="supplier-balances" className="space-y-4">
          <ReportHeader title={t('أرصدة الموردين', 'Supplier Balances', lang)} icon={Users} lang={lang}
            onRefresh={() => refetchSupplier()} onExport={handleExportSupplier} printType="generic-table" printData={supplierData ? { columns: [{ key: 'code', label: t('الكود', 'Code', lang) }, { key: 'name', label: t('المورد', 'Supplier', lang) }, { key: 'totalPurchased', label: t('المشتريات', 'Purchased', lang), align: 'amount' }, { key: 'totalPaid', label: t('المدفوع', 'Paid', lang), align: 'amount' }, { key: 'balanceOwed', label: t('الرصيد', 'Balance', lang), align: 'amount' }, { key: 'overdue', label: t('المتأخر', 'Overdue', lang), align: 'amount' }], rows: supplierData.suppliers, totals: [{ label: t('إجمالي المشتريات', 'Total Purchased', lang), value: supplierData.totals.totalPurchased }, { label: t('إجمالي المدفوع', 'Total Paid', lang), value: supplierData.totals.totalPaid }, { label: t('الرصيد المستحق', 'Balance Owed', lang), value: supplierData.totals.totalBalance, isGrand: true }] } as Record<string, unknown> : undefined} />
          {supplierData?.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3 text-center"><p className="text-xs text-amber-600">{t('إجمالي المشتريات', 'Purchased', lang)}</p><MoneyDisplay value={supplierData.totals.totalPurchased} lang={lang} size="sm" bold /></CardContent></Card>
              <Card className="bg-teal-50 border-teal-200"><CardContent className="p-3 text-center"><p className="text-xs text-teal-600">{t('المدفوع', 'Paid', lang)}</p><MoneyDisplay value={supplierData.totals.totalPaid} lang={lang} size="sm" bold /></CardContent></Card>
              <Card className="bg-orange-50 border-orange-200"><CardContent className="p-3 text-center"><p className="text-xs text-orange-600">{t('الرصيد المستحق', 'Balance Owed', lang)}</p><MoneyDisplay value={supplierData.totals.totalBalance} lang={lang} size="sm" bold /></CardContent></Card>
              <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('المتأخر', 'Overdue', lang)}</p><MoneyDisplay value={supplierData.totals.totalOverdue} lang={lang} size="sm" bold /></CardContent></Card>
            </div>
          )}
          {supplierLoading ? <LoadingSkeleton /> : supplierData?.suppliers && supplierData.suppliers.length > 0 ? (
            <Card><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                <TableHead className="text-right">{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead className="text-right">{t('المشتريات', 'Purchased', lang)}</TableHead>
                <TableHead className="text-right">{t('المدفوع', 'Paid', lang)}</TableHead>
                <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                <TableHead className="text-right">{t('المتأخر', 'Overdue', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {supplierData.suppliers.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><MoneyDisplay value={s.totalPurchased} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                    <TableCell><MoneyDisplay value={s.totalPaid} lang={lang} size="xs" inline showSymbol={false} className="text-teal-600" /></TableCell>
                    <TableCell><MoneyDisplay value={s.balanceOwed} lang={lang} size="xs" bold inline showSymbol={false} className={s.balanceOwed > 0 ? 'text-orange-600' : ''} /></TableCell>
                    <TableCell><MoneyDisplay value={s.overdue} lang={lang} size="xs" inline showSymbol={false} className={s.overdue > 0 ? 'text-rose-600' : ''} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div></CardContent></Card>
          ) : <EmptyState icon={Users} message={t('لا توجد بيانات موردين', 'No supplier data', lang)} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ========================================================
// TAB 5: CLIENT REPORTS
// ========================================================
function ClientReportsTab({ lang }: { lang: 'ar' | 'en' }) {
  const [subTab, setSubTab] = useState('balances')

  const { data: clientData, isLoading: clientLoading, refetch: refetchClient } = useQuery<ClientBalanceData>({
    queryKey: ['client-balances-report'],
    queryFn: async () => { const res = await fetch('/api/reports/client-balances'); if (!res.ok) throw new Error(); return res.json() },
  })

  const handleExport = useCallback(() => {
    if (!clientData) return
    const columns: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('الاسم', 'Name', lang) },
      { key: 'totalInvoiced', label: t('الفواتير', 'Invoiced', lang), format: v => Number(v).toFixed(2) },
      { key: 'totalPaid', label: t('المدفوع', 'Paid', lang), format: v => Number(v).toFixed(2) },
      { key: 'balanceReceivable', label: t('المستحق', 'Receivable', lang), format: v => Number(v).toFixed(2) },
      { key: 'overdue', label: t('المتأخر', 'Overdue', lang), format: v => Number(v).toFixed(2) },
    ]
    exportToCSV(clientData.clients as Record<string, unknown>[], 'client-balances', columns)
  }, [clientData, lang])

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="balances" className="text-xs">{t('أرصدة العملاء', 'Client Balances', lang)}</TabsTrigger>
          <TabsTrigger value="aging" className="text-xs">{t('تقرير التقادم', 'Aging Report', lang)}</TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="space-y-4">
          <ReportHeader title={t('أرصدة العملاء', 'Client Balances', lang)} icon={Users} lang={lang}
            onRefresh={() => refetchClient()} onExport={handleExport} printType="generic-table" printData={clientData ? { columns: [{ key: 'code', label: t('الكود', 'Code', lang) }, { key: 'name', label: t('العميل', 'Client', lang) }, { key: 'totalInvoiced', label: t('الفواتير', 'Invoiced', lang), align: 'amount' }, { key: 'totalPaid', label: t('المدفوع', 'Paid', lang), align: 'amount' }, { key: 'balanceReceivable', label: t('المستحق', 'Receivable', lang), align: 'amount' }, { key: 'overdue', label: t('المتأخر', 'Overdue', lang), align: 'amount' }], rows: clientData.clients, totals: [{ label: t('إجمالي الفواتير', 'Total Invoiced', lang), value: clientData.totals.totalInvoiced }, { label: t('إجمالي المحصل', 'Total Collected', lang), value: clientData.totals.totalPaid }, { label: t('الرصيد المستحق', 'Total Receivable', lang), value: clientData.totals.totalBalance, isGrand: true }] } as Record<string, unknown> : undefined} />
          {clientData?.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('إجمالي الفواتير', 'Invoiced', lang)}</p><MoneyDisplay value={clientData.totals.totalInvoiced} lang={lang} size="sm" bold /></CardContent></Card>
              <Card className="bg-teal-50 border-teal-200"><CardContent className="p-3 text-center"><p className="text-xs text-teal-600">{t('المحصل', 'Collected', lang)}</p><MoneyDisplay value={clientData.totals.totalPaid} lang={lang} size="sm" bold /></CardContent></Card>
              <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('المستحق', 'Receivable', lang)}</p><MoneyDisplay value={clientData.totals.totalBalance} lang={lang} size="sm" bold /></CardContent></Card>
              <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('المتأخر', 'Overdue', lang)}</p><MoneyDisplay value={clientData.totals.totalOverdue} lang={lang} size="sm" bold /></CardContent></Card>
            </div>
          )}
          {clientLoading ? <LoadingSkeleton /> : clientData?.clients && clientData.clients.length > 0 ? (
            <Card><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                <TableHead className="text-right">{t('العميل', 'Client', lang)}</TableHead>
                <TableHead className="text-right">{t('الفواتير', 'Invoiced', lang)}</TableHead>
                <TableHead className="text-right">{t('المدفوع', 'Paid', lang)}</TableHead>
                <TableHead className="text-right">{t('المستحق', 'Receivable', lang)}</TableHead>
                <TableHead className="text-right">{t('المتأخر', 'Overdue', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {clientData.clients.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><MoneyDisplay value={c.totalInvoiced} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                    <TableCell><MoneyDisplay value={c.totalPaid} lang={lang} size="xs" inline showSymbol={false} className="text-teal-600" /></TableCell>
                    <TableCell><MoneyDisplay value={c.balanceReceivable} lang={lang} size="xs" bold inline showSymbol={false} className={c.balanceReceivable > 0 ? 'text-cyan-600' : ''} /></TableCell>
                    <TableCell><MoneyDisplay value={c.overdue} lang={lang} size="xs" inline showSymbol={false} className={c.overdue > 0 ? 'text-rose-600' : ''} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div></CardContent></Card>
          ) : <EmptyState icon={Users} message={t('لا توجد بيانات عملاء', 'No client data', lang)} />}
        </TabsContent>

        <TabsContent value="aging" className="space-y-4">
          <ReportHeader title={t('تقرير تقادم المقبوضات', 'Receivables Aging Report', lang)} icon={Clock} lang={lang}
            onRefresh={() => refetchClient()} onExport={handleExport} printType="generic-table" printData={clientData ? { columns: [{ key: 'name', label: t('العميل', 'Client', lang) }, { key: 'balanceReceivable', label: t('الرصيد', 'Balance', lang), align: 'amount' }, { key: 'aging0to30', label: t('0-30 يوم', '0-30d', lang), align: 'amount' }, { key: 'aging31to60', label: t('31-60 يوم', '31-60d', lang), align: 'amount' }, { key: 'aging61to90', label: t('61-90 يوم', '61-90d', lang), align: 'amount' }, { key: 'aging90plus', label: t('+90 يوم', '90+d', lang), align: 'amount' }], rows: clientData.clients.filter((c: { balanceReceivable: number }) => c.balanceReceivable > 0).map((c: { name: string; balanceReceivable: number; aging: { '0to30': number; '31to60': number; '61to90': number; '90plus': number } }) => ({ name: c.name, balanceReceivable: c.balanceReceivable, aging0to30: c.aging['0to30'], aging31to60: c.aging['31to60'], aging61to90: c.aging['61to90'], aging90plus: c.aging['90plus'] })) } as Record<string, unknown> : undefined} />
          {clientData?.totals && (
            <div className="grid grid-cols-4 gap-3">
              <Card className="bg-teal-50 border-teal-200"><CardContent className="p-3 text-center"><p className="text-xs text-teal-600">{t('حالي (0-30)', 'Current (0-30)', lang)}</p><MoneyDisplay value={clientData.totals.totalAging0to30} lang={lang} size="sm" bold /></CardContent></Card>
              <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3 text-center"><p className="text-xs text-amber-600">{t('31-60 يوم', '31-60 Days', lang)}</p><MoneyDisplay value={clientData.totals.totalAging31to60} lang={lang} size="sm" bold /></CardContent></Card>
              <Card className="bg-orange-50 border-orange-200"><CardContent className="p-3 text-center"><p className="text-xs text-orange-600">{t('61-90 يوم', '61-90 Days', lang)}</p><MoneyDisplay value={clientData.totals.totalAging61to90} lang={lang} size="sm" bold /></CardContent></Card>
              <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('+90 يوم', '90+ Days', lang)}</p><MoneyDisplay value={clientData.totals.totalAging90plus} lang={lang} size="sm" bold /></CardContent></Card>
            </div>
          )}
          {clientLoading ? <LoadingSkeleton /> : clientData?.clients && clientData.clients.length > 0 ? (
            <Card><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('العميل', 'Client', lang)}</TableHead>
                <TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead>
                <TableHead className="text-right">{t('0-30 يوم', '0-30d', lang)}</TableHead>
                <TableHead className="text-right">{t('31-60 يوم', '31-60d', lang)}</TableHead>
                <TableHead className="text-right">{t('61-90 يوم', '61-90d', lang)}</TableHead>
                <TableHead className="text-right">{t('+90 يوم', '90+d', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {clientData.clients.filter(c => c.balanceReceivable > 0).map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><MoneyDisplay value={c.balanceReceivable} lang={lang} size="xs" bold inline showSymbol={false} /></TableCell>
                    <TableCell>{c.aging['0to30'] > 0 ? <MoneyDisplay value={c.aging['0to30']} lang={lang} size="xs" inline showSymbol={false} className="text-teal-600" /> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                    <TableCell>{c.aging['31to60'] > 0 ? <MoneyDisplay value={c.aging['31to60']} lang={lang} size="xs" inline showSymbol={false} className="text-amber-600" /> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                    <TableCell>{c.aging['61to90'] > 0 ? <MoneyDisplay value={c.aging['61to90']} lang={lang} size="xs" inline showSymbol={false} className="text-orange-600" /> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                    <TableCell>{c.aging['90plus'] > 0 ? <MoneyDisplay value={c.aging['90plus']} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div></CardContent></Card>
          ) : <EmptyState icon={Clock} message={t('لا توجد أرصدة متأخرة', 'No outstanding balances', lang)} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ========================================================
// TAB 6: TAX REPORTS
// ========================================================
function TaxReportsTab({ lang }: { lang: 'ar' | 'en' }) {
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

  const { data: filedReturns = [] } = useQuery<VATDeclaration[]>({
    queryKey: ['vat-returns-filed', selectedYear],
    queryFn: async () => { const res = await fetch(`/api/vat?year=${selectedYear}`); if (!res.ok) throw new Error(); return res.json() },
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
      setPayDialogOpen(false); setPayReference('')
      toast.success(t('تم تسجيل الدفع', 'Payment recorded', lang))
    },
  })

  const declaration = vatCalcData?.declaration
  const autoCalc = vatCalcData?.autoCalc
  const breakdown = vatCalcData?.breakdown

  return (
    <div className="space-y-4">
      {/* Year + Quarter Selector */}
      <Card className="bg-gray-50/50"><CardContent className="p-4">
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
          <PrintButton type="generic-table" data={vatCalcData?.autoCalc ? { infoItems: [{ label: t('الفترة', 'Period', lang), value: `${selectedYear} - ${selectedQuarter ? (lang === 'ar' ? quarterConfig[selectedQuarter].ar : quarterConfig[selectedQuarter].en) : ''}` }, { label: t('ضريبة المخرجات', 'Output VAT', lang), value: String(vatCalcData.autoCalc.outputVat.toFixed(2)) }, { label: t('ضريبة المدخلات', 'Input VAT', lang), value: String(vatCalcData.autoCalc.inputVat.toFixed(2)) }, { label: t('صافي الضريبة', 'Net VAT', lang), value: String(vatCalcData.autoCalc.netVat.toFixed(2)) }] } as Record<string, unknown> : undefined} size="sm" className="gap-1.5 h-8" />
        </div>
      </CardContent></Card>

      {!selectedQuarter ? (
        <EmptyState icon={Percent} message={t('اختر السنة والربع لحساب الضريبة تلقائياً', 'Select year and quarter to auto-calculate VAT', lang)} />
      ) : calcLoading ? <LoadingSkeleton count={4} /> : (
        <div className="space-y-4">
          {/* VAT Summary Cards */}
          {autoCalc && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"><CardContent className="p-5">
                <p className="text-sm font-medium text-emerald-700 mb-1">{t('ضريبة المخرجات', 'Output VAT', lang)}</p>
                <p className="text-xs text-muted-foreground mb-2">{t('فواتير المبيعات + المستخلصات', 'Sales + Claims', lang)}</p>
                <div className="flex items-center justify-between text-sm mb-1"><span className="text-muted-foreground">{t('إجمالي المبيعات', 'Total Sales', lang)}</span><MoneyDisplay value={autoCalc.totalSales} lang={lang} size="xs" bold className="text-emerald-700" /></div>
                <Separator className="my-2" /><MoneyDisplay value={autoCalc.outputVat} lang={lang} size="lg" bold className="text-emerald-700" />
              </CardContent></Card>
              <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-white"><CardContent className="p-5">
                <p className="text-sm font-medium text-rose-700 mb-1">{t('ضريبة المدخلات', 'Input VAT', lang)}</p>
                <p className="text-xs text-muted-foreground mb-2">{t('المشتريات + المصروفات', 'Purchases + Expenses', lang)}</p>
                <div className="flex items-center justify-between text-sm mb-1"><span className="text-muted-foreground">{t('إجمالي المشتريات', 'Total Purchases', lang)}</span><MoneyDisplay value={autoCalc.totalPurchases} lang={lang} size="xs" bold className="text-rose-700" /></div>
                <Separator className="my-2" /><MoneyDisplay value={autoCalc.inputVat} lang={lang} size="lg" bold className="text-rose-700" />
              </CardContent></Card>
              <Card className={`border-2 ${autoCalc.netVat >= 0 ? 'border-amber-300' : 'border-teal-300'}`}><CardContent className="p-5">
                <p className={`text-sm font-medium ${autoCalc.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'} mb-1`}>{t('صافي الضريبة', 'Net VAT', lang)}</p>
                <p className="text-xs text-muted-foreground mb-2">{autoCalc.netVat >= 0 ? t('مستحق للدفع', 'Payable', lang) : t('مسترد', 'Refundable', lang)}</p>
                <MoneyDisplay value={autoCalc.netVat} lang={lang} size="xl" bold className={autoCalc.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'} />
              </CardContent></Card>
            </div>
          )}

          {/* Declaration Status & Actions */}
          {declaration && (
            <Card className={`${declaration.status === 'PAID' ? 'border-emerald-300 bg-emerald-50/30' : declaration.status === 'FILED' ? 'border-teal-300 bg-teal-50/30' : 'border-amber-300 bg-amber-50/30'}`}>
              <CardContent className="p-4"><div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  {declaration.status === 'DRAFT' && <Clock className="size-5 text-amber-600" />}
                  {declaration.status === 'FILED' && <Send className="size-5 text-teal-600" />}
                  {declaration.status === 'PAID' && <CheckCircle2 className="size-5 text-emerald-600" />}
                  <span className="font-medium">{declaration.status === 'DRAFT' ? t('إقرار في حالة مسودة', 'Declaration in Draft', lang) : declaration.status === 'FILED' ? t('تم تقديم الإقرار', 'Declaration Filed', lang) : t('تم الدفع', 'Payment Complete', lang)}</span>
                </div>
                <div className="flex gap-2">
                  {declaration.status === 'DRAFT' && <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" size="sm" onClick={() => fileMutation.mutate(declaration.id)} disabled={fileMutation.isPending}>{fileMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}{t('تقديم الإقرار', 'File Return', lang)}</Button>}
                  {declaration.status === 'FILED' && <Button className="bg-teal-600 hover:bg-teal-700 gap-1.5" size="sm" onClick={() => { setPayingId(declaration.id); setPayDialogOpen(true) }}><Wallet className="size-4" />{t('تسجيل الدفع', 'Record Payment', lang)}</Button>}
                </div>
              </div></CardContent>
            </Card>
          )}
          {!declaration && autoCalc && (
            <div className="flex justify-center"><Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" size="sm" onClick={() => createMutation.mutate({ year: selectedYear, quarter: selectedQuarter })} disabled={createMutation.isPending}>{createMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : null}{t('إنشاء إقرار ضريبي', 'Create VAT Return', lang)}</Button></div>
          )}

          {/* Filed Returns History */}
          {filedReturns.length > 0 && (
            <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><BookOpen className="size-5 text-emerald-600" />{t('الإقرارات المقدمة', 'Filed Returns', lang)}</CardTitle></CardHeader>
            <CardContent className="p-0"><div className="overflow-x-auto"><Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الفترة', 'Period', lang)}</TableHead>
                <TableHead className="text-right">{t('ض.مخرجات', 'Output VAT', lang)}</TableHead>
                <TableHead className="text-right">{t('ض.مدخلات', 'Input VAT', lang)}</TableHead>
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
                    <TableCell><Badge className={`${vr.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : vr.status === 'FILED' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'} border-0`}>{vr.status === 'DRAFT' ? t('مسودة', 'Draft', lang) : vr.status === 'FILED' ? t('مقدم', 'Filed', lang) : t('مدفوع', 'Paid', lang)}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div></CardContent></Card>
          )}
        </div>
      )}

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('تسجيل دفع الضريبة', 'Record VAT Payment', lang)}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4"><div className="space-y-2"><Label>{t('رقم مرجع الدفع', 'Payment Reference', lang)}</Label><Input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder={t('أدخل رقم المرجع', 'Enter reference number', lang)} dir="ltr" /></div></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => payMutation.mutate({ id: payingId, paymentReference: payReference })} disabled={!payReference || payMutation.isPending}>{payMutation.isPending ? <RefreshCw className="size-4 animate-spin mr-2" /> : null}{t('تأكيد الدفع', 'Confirm Payment', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ========================================================
// MAIN REPORTS MODULE
// ========================================================
export function ReportsModule() {
  const { activeSubModule, lang } = useAppStore()

  // Map activeSubModule to the corresponding tab component
  const renderTab = () => {
    switch (activeSubModule) {
      case 'report-projects': return <ProjectReportsTab lang={lang} />
      case 'report-rental': return <RentalReportsTab lang={lang} />
      case 'report-finance': return <FinancialReportsTab lang={lang} />
      case 'report-purchases': return <PurchaseReportsTab lang={lang} />
      case 'report-clients': return <ClientReportsTab lang={lang} />
      case 'report-tax': return <TaxReportsTab lang={lang} />
      default: return <ProjectReportsTab lang={lang} />
    }
  }

  return (
    <ModuleLayout
      title={{ ar: 'التقارير', en: 'Reports' }}
      subtitle={{ ar: 'تقارير شاملة للمشاريع والتأجير والمالية', en: 'Comprehensive reports for projects, rental, and finance' }}
    >
      {renderTab()}
    </ModuleLayout>
  )
}

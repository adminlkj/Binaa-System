'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, FileText, TrendingUp, TrendingDown, Users, Truck,
  RefreshCw, ArrowUpDown, CreditCard, Clock, AlertTriangle,
  DollarSign, Wallet, Percent, Activity, Wrench, Calendar,
  ChevronRight, Shield, Package,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useAppStore, formatNumber, formatDate } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'

// ============ Types ============
interface DashboardData {
  activeProjects: number
  totalProjects: number
  totalContractValue: number
  activeEmployees: number
  totalEquipment: number
  equipmentStatusMap: Record<string, number>
  equipmentUtilizationRate: number
  totalRevenue: number
  totalExpenses: number
  netProfit: number
  cashPosition: number
  outstandingReceivables: number
  outstandingPayables: number
  overdueReceivables: number
  overduePayables: number
  netVAT: number
  vatPayable: number
  vatReceivable: number
  lowInventoryItems: number
  monthlyData: { month: string; labelAr: string; labelEn: string; revenue: number; expenses: number; profit: number }[]
  projectProfitability: { id: string; code: string; name: string; status: string; clientName: string; contractValue: number; totalCosts: number; totalRevenue: number; profit: number; margin: number }[]
  recentTransactions: { id: string; entryNo: string; date: string; description: string; totalDebit: number; totalCredit: number; sourceType: string | null }[]
  projectStatusDistribution: { status: string; count: number }[]
  alerts: { type: string; title: string; detail: string; date: string; severity: string }[]
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const statusLabelsAr: Record<string, string> = {
  PLANNING: 'تخطيط', ACTIVE: 'نشط', ON_HOLD: 'معلق', COMPLETED: 'مكتمل', CANCELLED: 'ملغي',
}
const statusLabelsEn: Record<string, string> = {
  PLANNING: 'Planning', ACTIVE: 'Active', ON_HOLD: 'On Hold', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}
const statusColors: Record<string, string> = {
  ACTIVE: 'bg-emerald-500', PLANNING: 'bg-amber-500', ON_HOLD: 'bg-cyan-500', COMPLETED: 'bg-teal-500', CANCELLED: 'bg-gray-400',
}
const equipStatusColors: Record<string, { bg: string; text: string; dot: string }> = {
  AVAILABLE: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  IN_USE: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  MAINTENANCE: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  OUT_OF_SERVICE: { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' },
  RENTED: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
}
const equipStatusLabelAr: Record<string, string> = {
  AVAILABLE: 'متاحة', IN_USE: 'قيد الاستخدام', MAINTENANCE: 'صيانة', OUT_OF_SERVICE: 'خارج الخدمة', RENTED: 'مؤجرة',
}
const equipStatusLabelEn: Record<string, string> = {
  AVAILABLE: 'Available', IN_USE: 'In Use', MAINTENANCE: 'Maintenance', OUT_OF_SERVICE: 'Out of Service', RENTED: 'Rented',
}

// ============ KPI Card ============
function KPICard({ title, value, icon: Icon, colorClass, bgColorClass, subtitle }: {
  title: string; value: React.ReactNode; icon: React.ElementType; colorClass: string; bgColorClass: string; subtitle?: string
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${bgColorClass}`}>
            <Icon className={`size-5 ${colorClass}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <div className="mt-0.5">{value}</div>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============ Loading Skeleton ============
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><div className="flex items-center gap-3">
            <div className="size-11 animate-pulse rounded-xl bg-gray-200" />
            <div className="flex-1 space-y-2"><div className="h-3 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
          </div></CardContent></Card>
        ))}
      </div>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { lang } = useAppStore()
  return (
    <Card className="border-rose-200 bg-rose-50">
      <CardContent className="flex flex-col items-center gap-4 py-10">
        <AlertTriangle className="size-10 text-rose-500" />
        <p className="text-lg font-medium text-rose-700">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data', lang)}</p>
        <Button variant="outline" onClick={onRetry} className="gap-2"><RefreshCw className="size-4" />{t('إعادة المحاولة', 'Retry', lang)}</Button>
      </CardContent>
    </Card>
  )
}

// ============ Seed Button ============
function SeedButton({ onSeedSuccess }: { onSeedSuccess: () => void }) {
  const [isSeeding, setIsSeeding] = React.useState(false)
  const handleSeed = async () => {
    setIsSeeding(true)
    try { await fetch('/api/seed', { method: 'POST' }); onSeedSuccess() } catch {} finally { setIsSeeding(false) }
  }
  return (
    <Button onClick={handleSeed} disabled={isSeeding} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
      {isSeeding ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      {isSeeding ? t('جاري التهيئة...', 'Seeding...', 'ar') : t('تهيئة البيانات التجريبية', 'Seed Demo Data', 'ar')}
    </Button>
  )
}

// ============ Monthly Bar Chart (simple colored bars) ============
function MonthlyChart({ data, lang }: { data: DashboardData['monthlyData']; lang: 'ar' | 'en' }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.revenue, d.expenses)), 1)
  return (
    <div className="space-y-3">
      {data.map(m => {
        const revPct = Math.max((m.revenue / maxVal) * 100, 0)
        const expPct = Math.max((m.expenses / maxVal) * 100, 0)
        return (
          <div key={m.month} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">{lang === 'ar' ? m.labelAr : m.labelEn}</span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-600">{t('إيرادات', 'Rev', lang)}: <MoneyDisplay value={m.revenue} lang={lang} size="xs" inline showSymbol={false} /></span>
                <span className="text-rose-600">{t('مصروفات', 'Exp', lang)}: <MoneyDisplay value={m.expenses} lang={lang} size="xs" inline showSymbol={false} /></span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="h-2.5 w-full rounded-full bg-gray-100">
                <div className="h-2.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${revPct}%` }} />
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-100">
                <div className="h-2.5 rounded-full bg-rose-400 transition-all" style={{ width: `${expPct}%` }} />
              </div>
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-4 pt-2 text-xs">
        <div className="flex items-center gap-1.5"><div className="size-3 rounded-full bg-emerald-500" /><span className="text-muted-foreground">{t('الإيرادات', 'Revenue', lang)}</span></div>
        <div className="flex items-center gap-1.5"><div className="size-3 rounded-full bg-rose-400" /><span className="text-muted-foreground">{t('المصروفات', 'Expenses', lang)}</span></div>
      </div>
    </div>
  )
}

// ============ Main Dashboard ============
export function DashboardModule() {
  const { lang } = useAppStore()
  const { data: dashboard, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => { const res = await fetch('/api/dashboard'); if (!res.ok) throw new Error(); return res.json() },
    staleTime: 30000,
  })

  const hasNoData = dashboard && dashboard.totalProjects === 0 && dashboard.totalRevenue === 0

  if (isLoading) return <DashboardSkeleton />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  if (hasNoData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-lg border-emerald-200 bg-emerald-50">
          <CardHeader className="items-center text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-100"><Building2 className="size-8 text-emerald-600" /></div>
            <CardTitle className="mt-4 text-2xl">{t('لا توجد بيانات', 'No Data', lang)}</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground leading-relaxed">{t('يرجى تهيئة البيانات التجريبية لعرض لوحة التحكم', 'Please seed demo data to view dashboard', lang)}</p>
            <div className="mt-6"><SeedButton onSeedSuccess={() => refetch()} /></div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const overdueItems = (dashboard?.overdueReceivables || 0) + (dashboard?.overduePayables || 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('لوحة التحكم', 'Dashboard', lang)}</h1>
          <p className="text-sm text-muted-foreground">{t('نظرة شاملة على أداء المشاريع والمتابعة المالية', 'Overview of project performance and financial tracking', lang)}</p>
        </div>
        <div className="flex items-center gap-2">
          <SeedButton onSeedSuccess={() => refetch()} />
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh', lang)}><RefreshCw className="size-4" /></Button>
        </div>
      </div>

      {/* ===== First Row: Financial KPIs ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard
          title={t('إجمالي الإيرادات', 'Total Revenue', lang)}
          value={<MoneyDisplay value={dashboard?.totalRevenue || 0} lang={lang} size="sm" bold />}
          icon={TrendingUp}
          colorClass="text-emerald-600" bgColorClass="bg-emerald-100"
        />
        <KPICard
          title={t('إجمالي المصروفات', 'Total Expenses', lang)}
          value={<MoneyDisplay value={dashboard?.totalExpenses || 0} lang={lang} size="sm" bold />}
          icon={TrendingDown}
          colorClass="text-rose-600" bgColorClass="bg-rose-100"
        />
        <KPICard
          title={t('صافي الربح', 'Net Profit', lang)}
          value={<MoneyDisplay value={dashboard?.netProfit || 0} lang={lang} size="sm" bold />}
          icon={(dashboard?.netProfit || 0) >= 0 ? TrendingUp : TrendingDown}
          colorClass={(dashboard?.netProfit || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}
          bgColorClass={(dashboard?.netProfit || 0) >= 0 ? 'bg-emerald-100' : 'bg-rose-100'}
        />
        <KPICard
          title={t('الرصيد النقدي', 'Cash Balance', lang)}
          value={<MoneyDisplay value={dashboard?.cashPosition || 0} lang={lang} size="sm" bold />}
          icon={Wallet}
          colorClass="text-teal-600" bgColorClass="bg-teal-100"
        />
      </div>

      {/* ===== Second Row: Operational KPIs ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard
          title={t('المشاريع النشطة', 'Active Projects', lang)}
          value={
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold">{dashboard?.activeProjects || 0}</span>
              <span className="text-xs text-muted-foreground">/ {dashboard?.totalProjects || 0}</span>
            </div>
          }
          icon={Building2}
          colorClass="text-emerald-600" bgColorClass="bg-emerald-100"
          subtitle={t('نشطة / إجمالي', 'Active / Total', lang)}
        />
        <KPICard
          title={t('الموظفون النشطون', 'Active Employees', lang)}
          value={<span className="text-lg font-bold">{formatNumber(dashboard?.activeEmployees || 0)}</span>}
          icon={Users}
          colorClass="text-amber-600" bgColorClass="bg-amber-100"
        />
        <KPICard
          title={t('المعدات', 'Equipment', lang)}
          value={<span className="text-lg font-bold">{formatNumber(dashboard?.totalEquipment || 0)}</span>}
          icon={Truck}
          colorClass="text-purple-600" bgColorClass="bg-purple-100"
          subtitle={`${formatNumber(Math.round(dashboard?.equipmentUtilizationRate || 0))}% ${t('مستخدمة', 'utilized', lang)}`}
        />
        <KPICard
          title={t('بنود متأخرة', 'Overdue Items', lang)}
          value={<span className="text-lg font-bold text-rose-600">{formatNumber(overdueItems > 0 ? overdueItems : 0)}</span>}
          icon={AlertTriangle}
          colorClass="text-rose-600" bgColorClass="bg-rose-100"
          subtitle={t('مدينة + دائنة', 'Receivable + Payable', lang)}
        />
      </div>

      {/* ===== Third Row: Charts + Equipment + Alerts ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Revenue vs Expenses Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-5 text-emerald-600" />
              {t('الإيرادات مقابل المصروفات', 'Revenue vs Expenses', lang)}
              <span className="text-xs text-muted-foreground font-normal">({t('آخر 6 أشهر', 'Last 6 months', lang)})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard?.monthlyData ? <MonthlyChart data={dashboard.monthlyData} lang={lang} /> : <p className="text-center text-muted-foreground py-8">{t('لا توجد بيانات', 'No data', lang)}</p>}
          </CardContent>
        </Card>

        {/* Equipment Status + Alerts */}
        <div className="space-y-6">
          {/* Equipment Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="size-5 text-purple-600" />
                {t('حالة المعدات', 'Equipment Status', lang)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboard?.equipmentStatusMap && Object.entries(dashboard.equipmentStatusMap).map(([status, count]) => {
                const cfg = equipStatusColors[status] || { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' }
                const pct = dashboard.totalEquipment > 0 ? (count / dashboard.totalEquipment) * 100 : 0
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`size-2.5 rounded-full ${cfg.dot}`} />
                        <span className={cfg.text}>{lang === 'ar' ? (equipStatusLabelAr[status] || status) : (equipStatusLabelEn[status] || status)}</span>
                      </div>
                      <span className="font-medium">{count}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )
              })}
              {(!dashboard?.equipmentStatusMap || Object.keys(dashboard.equipmentStatusMap).length === 0) && (
                <p className="text-center text-sm text-muted-foreground py-4">{t('لا توجد معدات', 'No equipment', lang)}</p>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Alerts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-5 text-amber-600" />
                {t('تنبيهات قادمة', 'Upcoming Alerts', lang)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard?.alerts && dashboard.alerts.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {dashboard.alerts.map((alert, i) => {
                    const iconMap: Record<string, React.ElementType> = {
                      RESIDENCE_EXPIRY: Shield,
                      MAINTENANCE_DUE: Wrench,
                      CONTRACT_EXPIRY: Calendar,
                    }
                    const Icon = iconMap[alert.type] || AlertTriangle
                    const isWarning = alert.severity === 'warning'
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded-lg p-2 text-sm ${isWarning ? 'bg-amber-50' : 'bg-cyan-50'}`}>
                        <Icon className={`size-4 mt-0.5 shrink-0 ${isWarning ? 'text-amber-600' : 'text-cyan-600'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{alert.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{alert.detail}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">{t('لا توجد تنبيهات', 'No alerts', lang)}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== Fourth Row: Project Profitability + Receivables/Payables ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Project Profitability Table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-5 text-emerald-600" />
              {t('ربحية المشاريع', 'Project Profitability', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {dashboard?.projectProfitability && dashboard.projectProfitability.length > 0 ? (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                      <TableHead className="text-right">{t('قيمة العقد', 'Contract', lang)}</TableHead>
                      <TableHead className="text-right">{t('التكاليف', 'Costs', lang)}</TableHead>
                      <TableHead className="text-right">{t('الربح', 'Profit', lang)}</TableHead>
                      <TableHead className="text-right">{t('الهامش', 'Margin', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.projectProfitability.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.clientName}</p>
                          </div>
                        </TableCell>
                        <TableCell><MoneyDisplay value={p.contractValue} lang={lang} size="xs" inline showSymbol={false} /></TableCell>
                        <TableCell><MoneyDisplay value={p.totalCosts} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell>
                        <TableCell><MoneyDisplay value={p.profit} lang={lang} size="xs" bold inline showSymbol={false} className={p.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'} /></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${p.margin >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {formatNumber(Math.round(p.margin))}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">{t('لا توجد مشاريع', 'No projects', lang)}</p>
            )}
          </CardContent>
        </Card>

        {/* Receivables & Payables */}
        <div className="space-y-6">
          <Card className="border-cyan-200 bg-cyan-50/30">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="size-5 text-cyan-600" />
                <h3 className="font-semibold text-cyan-800">{t('الذمم المدينة', 'Receivables', lang)}</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('إجمالي مستحق', 'Total Outstanding', lang)}</span>
                  <MoneyDisplay value={dashboard?.outstandingReceivables || 0} lang={lang} size="sm" bold className="text-cyan-700" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-rose-600 font-medium">{t('متأخرة', 'Overdue', lang)}</span>
                  <MoneyDisplay value={dashboard?.overdueReceivables || 0} lang={lang} size="sm" bold className="text-rose-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-orange-50/30">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="size-5 text-orange-600" />
                <h3 className="font-semibold text-orange-800">{t('الذمم الدائنة', 'Payables', lang)}</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('إجمالي مستحق', 'Total Outstanding', lang)}</span>
                  <MoneyDisplay value={dashboard?.outstandingPayables || 0} lang={lang} size="sm" bold className="text-orange-700" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-rose-600 font-medium">{t('متأخرة', 'Overdue', lang)}</span>
                  <MoneyDisplay value={dashboard?.overduePayables || 0} lang={lang} size="sm" bold className="text-rose-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-purple-50/30">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Percent className="size-5 text-purple-600" />
                <h3 className="font-semibold text-purple-800">{t('الضريبة', 'VAT', lang)}</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('ضريبة مستحقة', 'VAT Payable', lang)}</span>
                  <MoneyDisplay value={dashboard?.vatPayable || 0} lang={lang} size="sm" className="text-purple-700" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('ضريبة قابلة للاسترداد', 'VAT Receivable', lang)}</span>
                  <MoneyDisplay value={dashboard?.vatReceivable || 0} lang={lang} size="sm" className="text-teal-700" />
                </div>
                <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t">
                  <span>{t('صافي الضريبة', 'Net VAT', lang)}</span>
                  <MoneyDisplay value={dashboard?.netVAT || 0} lang={lang} size="sm" bold className={(dashboard?.netVAT || 0) >= 0 ? 'text-amber-700' : 'text-teal-700'} />
                </div>
              </div>
            </CardContent>
          </Card>

          {dashboard?.lowInventoryItems && dashboard.lowInventoryItems > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Package className="size-5 text-amber-600" />
                  <div>
                    <h3 className="font-semibold text-amber-800">{t('أصناف منخفضة المخزون', 'Low Stock Items', lang)}</h3>
                    <p className="text-2xl font-bold text-amber-700">{dashboard.lowInventoryItems}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ===== Fifth Row: Recent Transactions ===== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-5 text-emerald-600" />
            {t('آخر القيود المحاسبية', 'Recent Journal Entries', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {dashboard?.recentTransactions && dashboard.recentTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الرقم', 'Entry No', lang)}</TableHead>
                    <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                    <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                    <TableHead className="text-right">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right">{t('دائن', 'Credit', lang)}</TableHead>
                    <TableHead className="text-right">{t('المصدر', 'Source', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.recentTransactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs">{tx.entryNo}</TableCell>
                      <TableCell className="text-xs">{formatDate(tx.date, lang)}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{tx.description}</TableCell>
                      <TableCell><MoneyDisplay value={tx.totalDebit} lang={lang} size="xs" inline showSymbol={false} className="text-emerald-600" /></TableCell>
                      <TableCell><MoneyDisplay value={tx.totalCredit} lang={lang} size="xs" inline showSymbol={false} className="text-rose-600" /></TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{tx.sourceType || t('يدوي', 'Manual', lang)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">{t('لا توجد قيود', 'No entries', lang)}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

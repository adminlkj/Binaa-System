'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, FileText, TrendingUp, ShoppingCart, Percent,
  AlertTriangle, RefreshCw, ArrowUpDown, CreditCard, Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'
import { useAppStore, formatNumber } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'

// ============ Types ============
interface DashboardData {
  activeProjects: number
  completedProjects: number
  totalProjects: number
  totalRevenue: number
  totalExpenses: number
  netProfit: number
  outstandingReceivables: number
  outstandingPayables: number
  vatPayable: number
  monthlyProfit: { month: string; revenue: number; costs: number; profit: number }[]
  projectStatusDistribution: { status: string; count: number }[]
  recentInvoices: { id: string; invoiceNo: string; clientName: string; totalAmount: number; status: string; date: string }[]
  recentExpenses: { id: string; description: string; amount: number; category: string; date: string }[]
  upcomingPayments: { id: string; description: string; amount: number; dueDate: string; type: string }[]
}

const PIE_COLORS = ['#10b981', '#14b8a6', '#f59e0b', '#06b6d4', '#f43f5e']

const statusLabels: Record<string, string> = {
  PLANNING: 'تخطيط', ACTIVE: 'نشط', ON_HOLD: 'معلق', COMPLETED: 'مكتمل', CANCELLED: 'ملغي',
}

const lineChartConfig: ChartConfig = {
  revenue: { label: 'الإيرادات', color: '#10b981' },
  costs: { label: 'التكاليف', color: '#f59e0b' },
  profit: { label: 'الأرباح', color: '#14b8a6' },
}

const pieChartConfig: ChartConfig = {
  نشط: { label: 'نشط', color: '#10b981' },
  مكتمل: { label: 'مكتمل', color: '#14b8a6' },
  تخطيط: { label: 'تخطيط', color: '#f59e0b' },
  معلق: { label: 'معلق', color: '#06b6d4' },
  ملغي: { label: 'ملغي', color: '#f43f5e' },
}

// ============ KPI Card ============
function KPICard({ title, value, icon: Icon, colorClass, bgColorClass, subtitle }: {
  title: string; value: string; icon: React.ElementType; colorClass: string; bgColorClass: string; subtitle?: string
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${bgColorClass}`}>
            <Icon className={`size-6 ${colorClass}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-xl font-bold leading-tight truncate">{value}</p>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><div className="flex items-center gap-4">
            <div className="size-12 animate-pulse rounded-xl bg-gray-200" />
            <div className="flex-1 space-y-2"><div className="h-4 w-24 animate-pulse rounded bg-gray-200" /><div className="h-6 w-32 animate-pulse rounded bg-gray-200" /></div>
          </div></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><div className="h-6 w-40 animate-pulse rounded bg-gray-200" /></CardHeader><CardContent><div className="h-64 animate-pulse rounded bg-gray-100" /></CardContent></Card>
        <Card><CardHeader><div className="h-6 w-36 animate-pulse rounded bg-gray-200" /></CardHeader><CardContent><div className="h-64 animate-pulse rounded bg-gray-100" /></CardContent></Card>
      </div>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-rose-200 bg-rose-50">
      <CardContent className="flex flex-col items-center gap-4 py-10">
        <AlertTriangle className="size-10 text-rose-500" />
        <p className="text-lg font-medium text-rose-700">حدث خطأ أثناء تحميل البيانات</p>
        <Button variant="outline" onClick={onRetry} className="gap-2"><RefreshCw className="size-4" />إعادة المحاولة</Button>
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
      {isSeeding ? 'جاري التهيئة...' : 'تهيئة البيانات التجريبية'}
    </Button>
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
            <CardTitle className="mt-4 text-2xl">لا توجد بيانات</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground leading-relaxed">يرجى تهيئة البيانات التجريبية لعرض لوحة التحكم</p>
            <div className="mt-6"><SeedButton onSeedSuccess={() => refetch()} /></div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const pieData = dashboard?.projectStatusDistribution?.map((item, idx) => ({
    name: item.status, value: item.count, fill: PIE_COLORS[idx % PIE_COLORS.length],
  })) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'نظرة شاملة على أداء المشاريع والمتابعة المالية' : 'Overview of project performance and financial tracking'}</p>
        </div>
        <div className="flex items-center gap-2">
          <SeedButton onSeedSuccess={() => refetch()} />
          <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث"><RefreshCw className="size-4" /></Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <KPICard title={lang === 'ar' ? 'المشاريع' : 'Projects'} value={`${formatNumber(dashboard?.activeProjects || 0)} / ${formatNumber(dashboard?.totalProjects || 0)}`} icon={Building2} colorClass="text-emerald-600" bgColorClass="bg-emerald-100" subtitle={lang === 'ar' ? 'نشطة / إجمالي' : 'Active / Total'} />
        <KPICard title={lang === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'} value={lang === 'ar' ? `${(dashboard?.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ﷼` : `SAR ${(dashboard?.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={TrendingUp} colorClass="text-teal-600" bgColorClass="bg-teal-100" />
        <KPICard title={lang === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'} value={lang === 'ar' ? `${(dashboard?.totalExpenses || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ﷼` : `SAR ${(dashboard?.totalExpenses || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={ShoppingCart} colorClass="text-amber-600" bgColorClass="bg-amber-100" />
        <KPICard title={lang === 'ar' ? 'صافي الربح' : 'Net Profit'} value={lang === 'ar' ? `${(dashboard?.netProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ﷼` : `SAR ${(dashboard?.netProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={FileText} colorClass={(dashboard?.netProfit || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'} bgColorClass={(dashboard?.netProfit || 0) >= 0 ? 'bg-emerald-100' : 'bg-rose-100'} />
        <KPICard title={lang === 'ar' ? 'ذمم مدينة' : 'Receivables'} value={lang === 'ar' ? `${(dashboard?.outstandingReceivables || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ﷼` : `SAR ${(dashboard?.outstandingReceivables || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={ArrowUpDown} colorClass="text-cyan-600" bgColorClass="bg-cyan-100" />
        <KPICard title={lang === 'ar' ? 'ذمم دائنة' : 'Payables'} value={lang === 'ar' ? `${(dashboard?.outstandingPayables || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ﷼` : `SAR ${(dashboard?.outstandingPayables || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={CreditCard} colorClass="text-orange-600" bgColorClass="bg-orange-100" />
        <KPICard title={lang === 'ar' ? 'ضريبة مستحقة' : 'VAT Payable'} value={lang === 'ar' ? `${(dashboard?.vatPayable || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ﷼` : `SAR ${(dashboard?.vatPayable || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={Percent} colorClass="text-purple-600" bgColorClass="bg-purple-100" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-lg">{lang === 'ar' ? 'الأرباح الشهرية' : 'Monthly Profit'}</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={lineChartConfig} className="h-[300px] w-full">
              <LineChart data={dashboard?.monthlyProfit || []} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => { if (value >= 1000000) return `${(value / 1000000).toFixed(1)}م`; if (value >= 1000) return `${(value / 1000).toFixed(0)}ك`; return value }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2} dot={{ r: 4 }} name="الإيرادات" />
                <Line type="monotone" dataKey="costs" stroke="var(--color-costs)" strokeWidth={2} dot={{ r: 4 }} name="التكاليف" />
                <Line type="monotone" dataKey="profit" stroke="var(--color-profit)" strokeWidth={2} dot={{ r: 4 }} name="الأرباح" />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">{lang === 'ar' ? 'توزيع المشاريع' : 'Project Distribution'}</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={pieChartConfig} className="h-[300px] w-full">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Items */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Invoices */}
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="size-5 text-emerald-600" />{lang === 'ar' ? 'أحدث الفواتير' : 'Recent Invoices'}</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            {dashboard?.recentInvoices?.length ? (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-right">{lang === 'ar' ? 'الرقم' : 'No.'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'العميل' : 'Client'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'المبلغ' : 'Amount'}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dashboard.recentInvoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoiceNo}</TableCell>
                      <TableCell className="text-sm truncate max-w-[100px]">{inv.clientName}</TableCell>
                      <TableCell><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" inline /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="px-6 text-sm text-muted-foreground text-center py-4">{lang === 'ar' ? 'لا توجد فواتير' : 'No invoices'}</p>}
          </CardContent>
        </Card>

        {/* Recent Expenses */}
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ShoppingCart className="size-5 text-amber-600" />{lang === 'ar' ? 'أحدث المصروفات' : 'Recent Expenses'}</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            {dashboard?.recentExpenses?.length ? (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'الفئة' : 'Category'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'المبلغ' : 'Amount'}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dashboard.recentExpenses.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell className="text-sm truncate max-w-[120px]">{exp.description}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{exp.category}</Badge></TableCell>
                      <TableCell><MoneyDisplay value={exp.amount} lang={lang} size="sm" inline /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="px-6 text-sm text-muted-foreground text-center py-4">{lang === 'ar' ? 'لا توجد مصروفات' : 'No expenses'}</p>}
          </CardContent>
        </Card>

        {/* Upcoming Payments */}
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="size-5 text-cyan-600" />{lang === 'ar' ? 'مدفوعات قادمة' : 'Upcoming Payments'}</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            {dashboard?.upcomingPayments?.length ? (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'المبلغ' : 'Amount'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'الاستحقاق' : 'Due'}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dashboard.upcomingPayments.map(pmt => (
                    <TableRow key={pmt.id}>
                      <TableCell className="text-sm truncate max-w-[120px]">{pmt.description}</TableCell>
                      <TableCell><MoneyDisplay value={pmt.amount} lang={lang} size="sm" inline /></TableCell>
                      <TableCell className="text-sm">{new Date(pmt.dueDate).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="px-6 text-sm text-muted-foreground text-center py-4">{lang === 'ar' ? 'لا توجد مدفوعات قادمة' : 'No upcoming payments'}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

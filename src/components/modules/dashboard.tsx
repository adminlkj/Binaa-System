'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  FileText,
  TrendingUp,
  ShoppingCart,
  Percent,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { useAppStore, formatSAR, formatNumber, formatDate, commonText } from '@/stores/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

// ============ Types ============
interface DashboardData {
  activeProjects: number
  totalContractValue: number
  uncollectedClaims: number
  unpaidSuppliers: number
  totalVAT: number
  lowInventoryItems: number
  monthlyProfit: { month: string; revenue: number; costs: number; profit: number }[]
  expiringContracts: { id: string; contractNo: string; endDate: string; project: string }[]
  recentProjects: { id: string; code: string; name: string; status: string; contractValue: number }[]
  projectStatusDistribution: { status: string; count: number }[]
}

// formatSAR, formatNumber, formatDate imported from store

const statusLabels: Record<string, string> = {
  PLANNING: 'تخطيط',
  ACTIVE: 'نشط',
  ON_HOLD: 'معلق',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
}

const statusColors: Record<string, string> = {
  PLANNING: 'bg-amber-100 text-amber-700 border-amber-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ON_HOLD: 'bg-orange-100 text-orange-700 border-orange-200',
  COMPLETED: 'bg-teal-100 text-teal-700 border-teal-200',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
}

// ============ Chart Configs ============
const lineChartConfig: ChartConfig = {
  revenue: { label: 'الإيرادات', color: '#10b981' },
  costs: { label: 'التكاليف', color: '#f59e0b' },
  profit: { label: 'الأرباح', color: '#14b8a6' },
}

const PIE_COLORS = ['#10b981', '#14b8a6', '#f59e0b', '#06b6d4', '#f43f5e']

const pieChartConfig: ChartConfig = {
  نشط: { label: 'نشط', color: '#10b981' },
  مكتمل: { label: 'مكتمل', color: '#14b8a6' },
  تخطيط: { label: 'تخطيط', color: '#f59e0b' },
  معلق: { label: 'معلق', color: '#06b6d4' },
  ملغي: { label: 'ملغي', color: '#f43f5e' },
}

// ============ KPI Card Component ============
function KPICard({
  title,
  value,
  icon: Icon,
  colorClass,
  bgColorClass,
  subtitle,
}: {
  title: string
  value: string
  icon: React.ElementType
  colorClass: string
  bgColorClass: string
  subtitle?: string
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
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
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
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="size-12 animate-pulse rounded-xl bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                  <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><div className="h-6 w-40 animate-pulse rounded bg-gray-200" /></CardHeader>
          <CardContent><div className="h-64 animate-pulse rounded bg-gray-100" /></CardContent>
        </Card>
        <Card>
          <CardHeader><div className="h-6 w-36 animate-pulse rounded bg-gray-200" /></CardHeader>
          <CardContent><div className="h-64 animate-pulse rounded bg-gray-100" /></CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============ Error State ============
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-rose-200 bg-rose-50">
      <CardContent className="flex flex-col items-center gap-4 py-10">
        <AlertTriangle className="size-10 text-rose-500" />
        <p className="text-lg font-medium text-rose-700">حدث خطأ أثناء تحميل البيانات</p>
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="size-4" />
          إعادة المحاولة
        </Button>
      </CardContent>
    </Card>
  )
}

// ============ Seed Button ============
function SeedButton({ onSeedSuccess }: { onSeedSuccess: () => void }) {
  const seedMutation = async () => {
    const res = await fetch('/api/seed', { method: 'POST' })
    if (!res.ok) throw new Error('Seed failed')
    return res.json()
  }

  const [isSeeding, setIsSeeding] = React.useState(false)

  const handleSeed = async () => {
    setIsSeeding(true)
    try {
      await seedMutation()
      onSeedSuccess()
    } catch {
      // Error handled silently, query will refetch
    } finally {
      setIsSeeding(false)
    }
  }

  return (
    <Button onClick={handleSeed} disabled={isSeeding} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
      {isSeeding ? (
        <RefreshCw className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
      {isSeeding ? 'جاري التهيئة...' : 'تهيئة البيانات التجريبية'}
    </Button>
  )
}

import React from 'react'

// ============ Main Dashboard Component ============
export function DashboardModule() {
  const { lang } = useAppStore()
  const {
    data: dashboard,
    isLoading,
    isError,
    refetch,
  } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      return res.json()
    },
    staleTime: 30000,
  })

  // Check if there's no data (empty database)
  const hasNoData = dashboard && dashboard.activeProjects === 0 && dashboard.totalContractValue === 0

  if (isLoading) return <DashboardSkeleton />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  if (hasNoData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-lg border-emerald-200 bg-emerald-50">
          <CardHeader className="items-center text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-100">
              <Building2 className="size-8 text-emerald-600" />
            </div>
            <CardTitle className="mt-4 text-2xl">لا توجد بيانات</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground leading-relaxed">
              يرجى تهيئة البيانات التجريبية لعرض لوحة التحكم
            </p>
            <div className="mt-6">
              <SeedButton onSeedSuccess={() => refetch()} />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const pieData = dashboard?.projectStatusDistribution?.map((item, idx) => ({
    name: item.status,
    value: item.count,
    fill: PIE_COLORS[idx % PIE_COLORS.length],
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
          <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KPICard
          title="المشاريع النشطة"
          value={formatNumber(dashboard?.activeProjects || 0)}
          // formatNumber always returns English digits
          icon={Building2}
          colorClass="text-emerald-600"
          bgColorClass="bg-emerald-100"
          subtitle="مشاريع جارية حالياً"
        />
        <KPICard
          title="قيمة العقود"
          value={formatSAR(dashboard?.totalContractValue || 0, lang)}
          icon={FileText}
          colorClass="text-teal-600"
          bgColorClass="bg-teal-100"
          subtitle="إجمالي العقود النشطة"
        />
        <KPICard
          title="المستخلصات غير المحصلة"
          value={formatSAR(dashboard?.uncollectedClaims || 0, lang)}
          icon={TrendingUp}
          colorClass="text-amber-600"
          bgColorClass="bg-amber-100"
          subtitle="مستخلصات معلقة"
        />
        <KPICard
          title="الموردون المستحقون"
          value={formatSAR(dashboard?.unpaidSuppliers || 0, lang)}
          icon={ShoppingCart}
          colorClass="text-rose-600"
          bgColorClass="bg-rose-100"
          subtitle="فواتير غير مدفوعة"
        />
        <KPICard
          title="ضريبة القيمة المضافة"
          value={formatSAR(dashboard?.totalVAT || 0, lang)}
          icon={Percent}
          colorClass="text-cyan-600"
          bgColorClass="bg-cyan-100"
          subtitle="صافي الضريبة المستحقة"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Monthly Profit Line Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">الأرباح الشهرية</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineChartConfig} className="h-[300px] w-full">
              <LineChart data={dashboard?.monthlyProfit || []} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => value}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}م`
                    if (value >= 1000) return `${(value / 1000).toFixed(0)}ك`
                    return value
                  }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="الإيرادات"
                />
                <Line
                  type="monotone"
                  dataKey="costs"
                  stroke="var(--color-costs)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="التكاليف"
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--color-profit)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="الأرباح"
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Project Status Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">توزيع المشاريع</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pieChartConfig} className="h-[300px] w-full">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Expiring Contracts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="size-5 text-amber-500" />
              العقود المنتهية قريباً
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {dashboard?.expiringContracts?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم العقد</TableHead>
                    <TableHead className="text-right">المشروع</TableHead>
                    <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.expiringContracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.contractNo}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{c.project}</TableCell>
                      <TableCell>{c.endDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-6 text-sm text-muted-foreground text-center py-4">
                لا توجد عقود تنتهي قريباً
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">آخر المشاريع</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {dashboard?.recentProjects?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">المشروع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">قيمة العقد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.recentProjects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.code}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{p.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColors[p.status] || 'bg-gray-100 text-gray-700'}
                        >
                          {statusLabels[p.status] || p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatSAR(p.contractValue, lang)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-6 text-sm text-muted-foreground text-center py-4">
                لا توجد مشاريع
              </p>
            )}
          </CardContent>
        </Card>

        {/* Low Inventory Alert */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="size-5 text-rose-500" />
              المخزون المنخفض
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex size-20 items-center justify-center rounded-full bg-rose-100">
                <span className="text-3xl font-bold text-rose-600">
                  {dashboard?.lowInventoryItems || 0}
                </span>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                صنف{dashboard?.lowInventoryItems === 1 ? '' : dashboard?.lowInventoryItems === 2 ? 'ان' : dashboard?.lowInventoryItems && dashboard.lowInventoryItems <= 10 ? 'أصناف' : 'صنف'} وصلت للحد الأدنى
              </p>
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                تحتاج إعادة طلب
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

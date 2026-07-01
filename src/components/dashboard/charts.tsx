'use client'

/**
 * P5-2 — Dashboard Charts
 * -----------------------
 * Real recharts-powered visualisations for the Binaa dashboard.
 *
 * Four charts exposed:
 *   1. <RevenueExpensesChart>      — Area chart, monthly revenue vs expenses (last 6 months).
 *   2. <FinancialPositionChart>   — Vertical bar chart, Cash / Receivables / Payables.
 *   3. <ProjectStatusChart>       — Donut chart, project status distribution.
 *   4. <TopExpensesChart>         — Horizontal bar chart, top 5 expense categories.
 *
 * Design rules (enforced by P5-2):
 *   • All charts are 'use client' (recharts needs the DOM).
 *   • Wrap every chart in <ChartContainer> from @/components/ui/chart — it injects
 *     <ResponsiveContainer> and a <ChartStyle> block that publishes --color-*
 *     CSS variables to recharts, so the same palette works in light AND dark mode.
 *   • Colours come from globals.css `--chart-1`..`--chart-5` (theme-aware oklch).
 *     Reference them inside ChartConfig as `var(--chart-N)`.
 *   • Bilingual labels: a tiny `t(ar, en)` helper selects the right string based on
 *     the `lang` prop. The dashboard module passes `lang` from `useAppStore()`.
 *   • RTL: when lang === 'ar' we set `reversed` on XAxis so the most-recent month
 *     appears on the right edge of the chart (matching RTL reading order).
 *   • Currency values inside tooltips render via <MoneyDisplay> (with showSymbol)
 *     so the user sees the SAR symbol image consistently across the app.
 *   • Empty-data guard: every chart returns a friendly bilingual placeholder
 *     instead of crashing on undefined/null arrays.
 */

import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { BarChart3, PieChart as PieChartIcon, TrendingUp, Wallet } from 'lucide-react'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import { MoneyDisplay } from '@/components/ui/money-display'

// ============ Types ============
type Lang = 'ar' | 'en'

interface MonthlyDatum {
  month: string
  labelAr: string
  labelEn: string
  revenue: number
  expenses: number
  profit: number
}

interface StatusDatum {
  status: string
  count: number
}

interface TopExpenseDatum {
  category: string
  amount: number
}

// ============ Helpers ============
function t(ar: string, en: string, lang: Lang) {
  return lang === 'ar' ? ar : en
}

// Compact currency formatter for axis ticks (no symbol — recharts axis ticks are
// tiny; the symbol would clip). Tooltip values use <MoneyDisplay> instead.
function compactCurrency(value: number): string {
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// ============ Empty State ============
function ChartEmptyState({ lang, hint }: { lang: Lang; hint?: string }) {
  return (
    <div
      className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-6 text-center"
      role="img"
      aria-label={t('لا توجد بيانات كافية', 'Not enough data yet', lang)}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <TrendingUp className="size-5" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        {t('لا توجد بيانات كافية', 'Not enough data yet', lang)}
      </p>
      {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  )
}

// ============ Custom Tooltip (uses MoneyDisplay) ============
interface TooltipPayloadItem {
  name?: string
  dataKey?: string | number
  value?: number | string | Array<number | string>
  color?: string
  payload?: Record<string, unknown>
}

function MoneyTooltipContent({
  active,
  payload,
  label,
  lang,
  labelMap,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string | number
  lang: Lang
  labelMap?: Record<string, { ar: string; en: string }>
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="grid min-w-[10rem] gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-xl">
      {label !== undefined && label !== '' && (
        <div className="font-semibold">
          {labelMap && typeof label === 'string' && labelMap[label]
            ? t(labelMap[label].ar, labelMap[label].en, lang)
            : label}
        </div>
      )}
      {payload.map((item, i) => {
        const raw = item.value
        const num = typeof raw === 'number' ? raw : Array.isArray(raw) ? Number(raw[0]) : Number(raw)
        const safeNum = isNaN(num) ? 0 : num
        const key = `${item.dataKey ?? item.name ?? i}`
        const displayLabel = labelMap && labelMap[key]
          ? t(labelMap[key].ar, labelMap[key].en, lang)
          : (item.name ?? key)
        return (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block size-2 rounded-[2px]"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              {displayLabel}
            </span>
            <MoneyDisplay
              value={safeNum}
              lang={lang}
              size="sm"
              bold
              inline
              className="text-foreground tabular-nums"
            />
          </div>
        )
      })}
    </div>
  )
}

// ============ Chart 1: Revenue vs Expenses (Area Chart) ============
const revenueExpenseConfig: ChartConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-1)' },
  expenses: { label: 'Expenses', color: 'var(--chart-5)' },
}

export function RevenueExpensesChart({
  data,
  lang,
}: {
  data: MonthlyDatum[] | undefined | null
  lang: Lang
}) {
  const safeData = Array.isArray(data) ? data : []
  const isAllZero = safeData.length > 0 && safeData.every(d => (d.revenue || 0) === 0 && (d.expenses || 0) === 0)

  if (safeData.length === 0) {
    return <ChartEmptyState lang={lang} />
  }

  const labelMap: Record<string, { ar: string; en: string }> = {
    revenue: { ar: 'الإيرادات', en: 'Revenue' },
    expenses: { ar: 'المصروفات', en: 'Expenses' },
  }

  return (
    <div className="space-y-2">
      <ChartContainer config={revenueExpenseConfig} className="aspect-[16/9] w-full">
        <AreaChart data={safeData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.7} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="fillExpenses" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-5)" stopOpacity={0.7} />
              <stop offset="95%" stopColor="var(--chart-5)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey={lang === 'ar' ? 'labelAr' : 'labelEn'}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            reversed={lang === 'ar'}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={compactCurrency}
            width={48}
            orientation={lang === 'ar' ? 'right' : 'left'}
          />
          <ChartTooltip
            content={
              <MoneyTooltipContent lang={lang} labelMap={labelMap} />
            }
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#fillRevenue)"
            name="revenue"
          />
          <Area
            type="monotone"
            dataKey="expenses"
            stroke="var(--chart-5)"
            strokeWidth={2}
            fill="url(#fillExpenses)"
            name="expenses"
          />
        </AreaChart>
      </ChartContainer>
      <ChartLegendInline
        lang={lang}
        items={[
          { color: 'var(--chart-1)', labelAr: 'الإيرادات', labelEn: 'Revenue' },
          { color: 'var(--chart-5)', labelAr: 'المصروفات', labelEn: 'Expenses' },
        ]}
      />
      {isAllZero && (
        <p className="text-center text-xs text-muted-foreground/80">
          {t('ابدأ بترحيل القيود لرؤية البيانات', 'Post journal entries to see data', lang)}
        </p>
      )}
    </div>
  )
}

// ============ Chart 2: Financial Position (Vertical Bar Chart) ============
const financialPositionConfig: ChartConfig = {
  cash: { label: 'Cash', color: 'var(--chart-2)' },
  receivables: { label: 'Receivables', color: 'var(--chart-3)' },
  payables: { label: 'Payables', color: 'var(--chart-4)' },
}

export function FinancialPositionChart({
  cashPosition,
  receivables,
  payables,
  lang,
}: {
  cashPosition: number | undefined | null
  receivables: number | undefined | null
  payables: number | undefined | null
  lang: Lang
}) {
  const cash = Number(cashPosition || 0)
  const recv = Number(receivables || 0)
  const payb = Number(payables || 0)
  const data = [
    { key: 'cash', value: cash, labelAr: 'النقدية', labelEn: 'Cash' },
    { key: 'receivables', value: recv, labelAr: 'الذمم المدينة', labelEn: 'Receivables' },
    { key: 'payables', value: payb, labelAr: 'الذمم الدائنة', labelEn: 'Payables' },
  ]
  const isAllZero = cash === 0 && recv === 0 && payb === 0

  if (isAllZero) {
    return <ChartEmptyState lang={lang} />
  }

  const labelMap: Record<string, { ar: string; en: string }> = {
    cash: { ar: 'النقدية', en: 'Cash' },
    receivables: { ar: 'الذمم المدينة', en: 'Receivables' },
    payables: { ar: 'الذمم الدائنة', en: 'Payables' },
  }
  const colorByKey: Record<string, string> = {
    cash: 'var(--chart-2)',
    receivables: 'var(--chart-3)',
    payables: 'var(--chart-4)',
  }

  return (
    <div className="space-y-2">
      <ChartContainer config={financialPositionConfig} className="aspect-[16/9] w-full">
        <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey={lang === 'ar' ? 'labelAr' : 'labelEn'}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            reversed={lang === 'ar'}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={compactCurrency}
            width={48}
            orientation={lang === 'ar' ? 'right' : 'left'}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            content={
              <MoneyTooltipContent lang={lang} labelMap={labelMap} />
            }
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} name="value">
            {data.map(d => (
              <Cell key={d.key} fill={colorByKey[d.key]} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <ChartLegendInline
        lang={lang}
        items={[
          { color: 'var(--chart-2)', labelAr: 'النقدية', labelEn: 'Cash' },
          { color: 'var(--chart-3)', labelAr: 'الذمم المدينة', labelEn: 'Receivables' },
          { color: 'var(--chart-4)', labelAr: 'الذمم الدائنة', labelEn: 'Payables' },
        ]}
      />
    </div>
  )
}

// ============ Chart 3: Project Status Distribution (Donut Chart) ============
const projectStatusMeta: Record<string, { ar: string; en: string; color: string }> = {
  PLANNING: { ar: 'تخطيط', en: 'Planning', color: 'var(--chart-4)' },
  ACTIVE: { ar: 'نشط', en: 'Active', color: 'var(--chart-2)' },
  ON_HOLD: { ar: 'معلق', en: 'On Hold', color: 'var(--chart-3)' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: 'var(--chart-1)' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: 'var(--chart-5)' },
}

const projectStatusConfig: ChartConfig = Object.fromEntries(
  Object.entries(projectStatusMeta).map(([k, v]) => [k, { label: v.en, color: v.color }])
)

export function ProjectStatusChart({
  data,
  lang,
}: {
  data: StatusDatum[] | undefined | null
  lang: Lang
}) {
  const safeData = Array.isArray(data) ? data.filter(d => (d.count || 0) > 0) : []
  const total = safeData.reduce((s, d) => s + (d.count || 0), 0)

  if (total === 0) {
    return <ChartEmptyState lang={lang} />
  }

  const chartData = safeData.map(d => ({
    key: d.status,
    name: lang === 'ar' ? projectStatusMeta[d.status]?.ar ?? d.status : projectStatusMeta[d.status]?.en ?? d.status,
    value: d.count,
    fill: projectStatusMeta[d.status]?.color ?? 'var(--chart-1)',
  }))

  const labelMap: Record<string, { ar: string; en: string }> = Object.fromEntries(
    Object.entries(projectStatusMeta).map(([k, v]) => [k, { ar: v.ar, en: v.en }])
  )

  return (
    <div className="space-y-2">
      <ChartContainer config={projectStatusConfig} className="aspect-[16/9] w-full">
        <PieChart>
          <ChartTooltip
            content={
              <MoneyTooltipContent lang={lang} labelMap={labelMap} />
            }
          />
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="key"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            strokeWidth={2}
          >
            {chartData.map(d => (
              <Cell key={d.key} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ChartLegendInline
        lang={lang}
        items={chartData.map(d => {
          const meta = projectStatusMeta[d.key] ?? { ar: d.key, en: d.key, color: 'var(--chart-1)' }
          return { color: meta.color, labelAr: meta.ar, labelEn: meta.en, count: d.value }
        })}
      />
      <p className="text-center text-xs text-muted-foreground">
        {t('إجمالي المشاريع', 'Total projects', lang)}: <span className="font-semibold tabular-nums">{total}</span>
      </p>
    </div>
  )
}

// ============ Chart 4: Top 5 Expense Categories (Horizontal Bar Chart) ============
// Subset of the canonical CATEGORY_LABELS map from the expenses module — covers
// every enum value currently used. New enum values fall back to the raw string.
const EXPENSE_CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  RENT: { ar: 'إيجارات', en: 'Rent' },
  MAINTENANCE: { ar: 'صيانة', en: 'Maintenance' },
  TRANSPORT: { ar: 'نقل', en: 'Transport' },
  DELIVERY: { ar: 'توصيل', en: 'Delivery' },
  CONSUMABLES: { ar: 'مواد استهلاكية', en: 'Consumables' },
  SERVICES: { ar: 'خدمات', en: 'Services' },
  INSURANCE: { ar: 'تأمين', en: 'Insurance' },
  FUEL: { ar: 'وقود', en: 'Fuel' },
  PERMITS: { ar: 'تصاريح', en: 'Permits' },
  OFFICE: { ar: 'قرطاسية', en: 'Stationery' },
  HOSPITALITY: { ar: 'ضيافة', en: 'Hospitality' },
  OTHER: { ar: 'متنوعة', en: 'Other' },
  SALARIES: { ar: 'رواتب', en: 'Salaries' },
  INTERNET: { ar: 'إنترنت', en: 'Internet' },
  ELECTRICITY: { ar: 'كهرباء', en: 'Electricity' },
  WATER: { ar: 'مياه', en: 'Water' },
  MANAGEMENT_CARS: { ar: 'سيارات الإدارة', en: 'Management Cars' },
  DRIVERS: { ar: 'سائقين', en: 'Drivers' },
  SEWAGE: { ar: 'الصرف الصحي', en: 'Sewage' },
  TELECOM: { ar: 'الاتصالات', en: 'Telecommunications' },
  POSTAL: { ar: 'البريد', en: 'Postal' },
  CLOUD_HOSTING: { ar: 'الاستضافة السحابية', en: 'Cloud Hosting' },
  ADMIN_VEHICLES_FUEL: { ar: 'وقود المركبات الإدارية', en: 'Admin Vehicles Fuel' },
  ADMIN_VEHICLES_MAINT: { ar: 'صيانة المركبات الإدارية', en: 'Admin Vehicles Maintenance' },
  VEHICLE_WASH: { ar: 'غسيل المركبات', en: 'Vehicle Wash' },
  TIRES: { ar: 'إطارات', en: 'Tires' },
  OILS_FILTERS: { ar: 'زيوت وفلاتر', en: 'Oils & Filters' },
  ROAD_PARKING_FEES: { ar: 'رسوم الطرق والمواقف', en: 'Road & Parking Fees' },
  BUILDING_MAINT: { ar: 'صيانة المبنى', en: 'Building Maintenance' },
  CLEANING: { ar: 'النظافة', en: 'Cleaning' },
  SECURITY: { ar: 'الأمن والحراسة', en: 'Security' },
  FURNITURE: { ar: 'الأثاث', en: 'Furniture' },
  OFFICE_EQUIPMENT: { ar: 'الأجهزة المكتبية', en: 'Office Equipment' },
  STATIONERY: { ar: 'الأدوات المكتبية والقرطاسية', en: 'Stationery & Office Supplies' },
  GOV_FEES: { ar: 'رسوم حكومية', en: 'Government Fees' },
  FINES: { ar: 'غرامات', en: 'Fines' },
  VIOLATIONS: { ar: 'مخالفات', en: 'Violations' },
  MUNICIPAL_FEES: { ar: 'رسوم بلدية', en: 'Municipal Fees' },
  CHAMBER_FEES: { ar: 'رسوم الغرف التجارية', en: 'Chamber of Commerce Fees' },
  HR_MINISTRY_FEES: { ar: 'رسوم وزارة الموارد البشرية', en: 'HR Ministry Fees' },
  GOSI_FEES: { ar: 'رسوم التأمينات', en: 'GOSI Fees' },
  PASSPORT_FEES: { ar: 'رسوم الجوازات', en: 'Passport Fees' },
  RESIDENCY_FEES: { ar: 'رسوم الإقامة', en: 'Residency Fees' },
  VISA_FEES: { ar: 'رسوم التأشيرات', en: 'Visa Fees' },
  LICENSE_FEES: { ar: 'رسوم الرخص', en: 'License Fees' },
  MEDICAL_INSURANCE: { ar: 'تأمين طبي', en: 'Medical Insurance' },
  VEHICLE_INSURANCE: { ar: 'تأمين المركبات', en: 'Vehicle Insurance' },
  EQUIPMENT_INSURANCE: { ar: 'تأمين المعدات العامة', en: 'General Equipment Insurance' },
  FIRE_INSURANCE: { ar: 'التأمين ضد الحريق', en: 'Fire Insurance' },
  PROPERTY_INSURANCE: { ar: 'التأمين على الممتلكات', en: 'Property Insurance' },
  SOFTWARE_SUBSCRIPTIONS: { ar: 'اشتراكات البرامج', en: 'Software Subscriptions' },
  SYSTEM_SUBSCRIPTIONS: { ar: 'اشتراكات الأنظمة', en: 'System Subscriptions' },
  WEBSITE_SUBSCRIPTIONS: { ar: 'اشتراكات المواقع', en: 'Website Subscriptions' },
  NEWSPAPERS: { ar: 'الصحف والمجلات', en: 'Newspapers & Magazines' },
  PROFESSIONAL_MEMBERSHIPS: { ar: 'عضويات مهنية', en: 'Professional Memberships' },
  BANK_FEES: { ar: 'رسوم بنكية', en: 'Bank Fees' },
  BANK_COMMISSIONS: { ar: 'عمولات بنكية', en: 'Bank Commissions' },
  TRANSFER_DIFFERENCES: { ar: 'فروقات تحويل', en: 'Transfer Differences' },
  POS_FEES: { ar: 'رسوم نقاط البيع', en: 'POS Fees' },
  PAYMENT_GATEWAY_FEES: { ar: 'رسوم بوابات الدفع', en: 'Payment Gateway Fees' },
  EMPLOYEE_TRAINING: { ar: 'تدريب الموظفين', en: 'Employee Training' },
  RECRUITMENT: { ar: 'استقطاب الموظفين', en: 'Recruitment' },
  JOB_ADVERTISEMENTS: { ar: 'إعلانات التوظيف', en: 'Job Advertisements' },
  NON_PAYROLL_BONUSES: { ar: 'مكافآت غير مرتبطة بالرواتب', en: 'Non-payroll Bonuses' },
  ADMIN_ALLOWANCES: { ar: 'بدلات إدارية', en: 'Administrative Allowances' },
  TRAVEL_TICKETS: { ar: 'تذاكر السفر', en: 'Travel Tickets' },
  HOTELS: { ar: 'الفنادق', en: 'Hotels' },
  DEPUTATIONS: { ar: 'الانتدابات', en: 'Deputations' },
  TRAVEL_ALLOWANCE: { ar: 'بدل السفر', en: 'Travel Allowance' },
  EXTERNAL_HOSPITALITY: { ar: 'الضيافة الخارجية', en: 'External Hospitality' },
  DONATIONS: { ar: 'تبرعات', en: 'Donations' },
  MINOR_LOSSES: { ar: 'خسائر بسيطة', en: 'Minor Losses' },
  CASH_DIFFERENCES: { ar: 'فروقات نقدية', en: 'Cash Differences' },
  MATERIAL_DAMAGE: { ar: 'إتلاف مواد', en: 'Material Damage' },
}

const TOP_EXPENSE_COLORS = [
  'var(--chart-5)',
  'var(--chart-4)',
  'var(--chart-3)',
  'var(--chart-2)',
  'var(--chart-1)',
]

const topExpensesConfig: ChartConfig = {
  amount: { label: 'Amount', color: 'var(--chart-5)' },
}

export function TopExpensesChart({
  data,
  lang,
}: {
  data: TopExpenseDatum[] | undefined | null
  lang: Lang
}) {
  const safeData = Array.isArray(data) ? data : []

  if (safeData.length === 0) {
    return <ChartEmptyState lang={lang} />
  }

  const chartData = safeData.map((d, i) => {
    const labels = EXPENSE_CATEGORY_LABELS[d.category] ?? { ar: d.category, en: d.category }
    return {
      key: d.category,
      labelAr: labels.ar,
      labelEn: labels.en,
      amount: Number(d.amount || 0),
      fill: TOP_EXPENSE_COLORS[i % TOP_EXPENSE_COLORS.length],
    }
  })

  const labelMap: Record<string, { ar: string; en: string }> = Object.fromEntries(
    chartData.map(d => [d.key, { ar: d.labelAr, en: d.labelEn }])
  )

  return (
    <div className="space-y-2">
      <ChartContainer config={topExpensesConfig} className="aspect-[16/9] w-full">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            type="number"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={compactCurrency}
            reversed={lang === 'ar'}
          />
          <YAxis
            type="category"
            dataKey={lang === 'ar' ? 'labelAr' : 'labelEn'}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={120}
            orientation={lang === 'ar' ? 'right' : 'left'}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            content={
              <MoneyTooltipContent lang={lang} labelMap={labelMap} />
            }
          />
          <Bar dataKey="amount" radius={[0, 6, 6, 0]} name="amount">
            {chartData.map(d => (
              <Cell key={d.key} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <ChartLegendInline
        lang={lang}
        items={chartData.map(d => ({ color: d.fill, labelAr: d.labelAr, labelEn: d.labelEn }))}
      />
    </div>
  )
}

// ============ Inline Legend (uses bilingual labels) ============
function ChartLegendInline({
  lang,
  items,
}: {
  lang: Lang
  items: Array<{ color: string; labelAr: string; labelEn: string; count?: number }>
}) {
  if (!items || items.length === 0) return null
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1 text-xs"
      role="list"
    >
      {items.map((item, i) => (
        <div key={`${item.labelEn}-${i}`} className="flex items-center gap-1.5" role="listitem">
          <span
            className="inline-block size-2.5 rounded-[3px]"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="text-muted-foreground">
            {t(item.labelAr, item.labelEn, lang)}
            {typeof item.count === 'number' && (
              <span className="ml-1 font-semibold tabular-nums text-foreground">({item.count})</span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

// ============ Chart Card Title (bilingual with icon) ============
export function ChartCardTitle({
  icon: Icon = TrendingUp,
  ar,
  en,
  lang,
}: {
  icon?: React.ElementType
  ar: string
  en: string
  lang: Lang
}) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <Icon className="size-4 text-muted-foreground" />
      {t(ar, en, lang)}
    </span>
  )
}

// Re-export the icon components so the dashboard module can use them when
// building <ChartCardTitle icon={...}> entries, without needing a separate
// import from lucide-react.
export { BarChart3, PieChartIcon, TrendingUp, Wallet }

// Named bag of all four chart components + the title helper.
export const DashboardCharts = {
  RevenueExpensesChart,
  FinancialPositionChart,
  ProjectStatusChart,
  TopExpensesChart,
  ChartCardTitle,
}

export default DashboardCharts

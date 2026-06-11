'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, Truck, RefreshCw, AlertTriangle, ArrowLeft,
  Users, Package, Wrench, Calculator,
  FileText, Clock, TrendingUp, TrendingDown, Wallet,
  ArrowRight, ArrowUpDown, CreditCard, Shield,
  Calendar, DollarSign, Link2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAppStore,
  CONSTRUCTION_WORKFLOW, RENTAL_WORKFLOW,
} from '@/stores/app-store'
import type { NavItem } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'

// ============ Types ============
interface RecentProject {
  id: string
  code: string
  name: string
  status: string
  contractValue: number
  client: { name: string }
  startDate: string
  endDate: string | null
}

interface RecentRentalContract {
  id: string
  contractNo: string
  status: string
  startDate: string
  endDate: string | null
  rate: number
  rateType: string
  deliveryFees: number
  totalAmount: number
  equipment: { id: string; code: string; name: string }
  client: { id: string; name: string }
}

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
  constructionProjects: number
  rentalProjects: number
  activeConstructionProjects: number
  activeRentalProjects: number
  constructionRevenue: number
  rentalRevenue: number
  constructionCosts: number
  rentalCosts: number
  constructionProfit: number
  rentalProfit: number
  rentedEquipment: number
  inUseEquipment: number
  availableEquipment: number
  recentConstructionProjects: RecentProject[]
  recentRentalContracts: RecentRentalContract[]
  totalExtracts: number
  totalExtractsAmount: number
  totalClientInvoices: number
  outstandingConstructionCollections: number
  outstandingRentalCollections: number
  constructionContractValue: number
  monthlyData: { month: string; labelAr: string; labelEn: string; revenue: number; expenses: number; profit: number }[]
  projectProfitability: { id: string; code: string; name: string; status: string; projectType: string; clientName: string; contractValue: number; totalCosts: number; totalRevenue: number; profit: number; margin: number }[]
  recentTransactions: { id: string; entryNo: string; date: string; description: string; totalDebit: number; totalCredit: number; sourceType: string | null }[]
  projectStatusDistribution: { status: string; count: number }[]
  alerts: { type: string; title: string; detail: string; date: string; severity: string }[]
}

// ============ Helpers ============
function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const projectStatusLabels: Record<string, { ar: string; en: string; color: string }> = {
  PLANNING: { ar: 'تخطيط', en: 'Planning', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  ACTIVE: { ar: 'نشط', en: 'Active', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  ON_HOLD: { ar: 'معلق', en: 'On Hold', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: 'bg-gray-100 text-gray-700 border-gray-200' },
}

const rentalStatusLabels: Record<string, { ar: string; en: string; color: string }> = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  ACTIVE: { ar: 'نشط', en: 'Active', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  PENDING: { ar: 'قيد الانتظار', en: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-200' },
}

const equipStatusConfig: Record<string, { ar: string; en: string; dotColor: string; bgColor: string }> = {
  AVAILABLE: { ar: 'متاحة', en: 'Available', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-50' },
  IN_USE: { ar: 'قيد الاستخدام', en: 'In Use', dotColor: 'bg-amber-500', bgColor: 'bg-amber-50' },
  MAINTENANCE: { ar: 'صيانة', en: 'Maintenance', dotColor: 'bg-rose-500', bgColor: 'bg-rose-50' },
  OUT_OF_SERVICE: { ar: 'خارج الخدمة', en: 'Out of Service', dotColor: 'bg-gray-400', bgColor: 'bg-gray-50' },
  RENTED: { ar: 'مؤجرة', en: 'Rented', dotColor: 'bg-purple-500', bgColor: 'bg-purple-50' },
}

// ============ Sub-Components ============

function HubMetricCard({ title, value, icon: Icon, theme }: {
  title: string; value: React.ReactNode; icon: React.ElementType; theme: 'emerald' | 'cyan'
}) {
  const themeClasses = theme === 'emerald'
    ? 'bg-emerald-50 border-emerald-100'
    : 'bg-cyan-50 border-cyan-100'
  const iconClasses = theme === 'emerald'
    ? 'bg-emerald-100 text-emerald-600'
    : 'bg-cyan-100 text-cyan-600'

  return (
    <Card className={`border ${themeClasses}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconClasses}`}>
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground leading-tight">{title}</p>
            <div className="mt-0.5">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function WorkflowChain({ steps, theme, lang }: {
  steps: typeof CONSTRUCTION_WORKFLOW
  theme: 'emerald' | 'cyan'
  lang: 'ar' | 'en'
}) {
  const activeColor = theme === 'emerald'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
    : 'bg-cyan-100 text-cyan-700 border-cyan-300'
  const pendingColor = 'bg-gray-50 text-gray-400 border-gray-200'
  const arrowColor = theme === 'emerald' ? 'text-emerald-400' : 'text-cyan-400'

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin" dir="ltr">
      {steps.map((step, i) => (
        <React.Fragment key={step.step}>
          <div
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium whitespace-nowrap transition-colors ${activeColor}`}
          >
            {lang === 'ar' ? step.label.ar : step.label.en}
          </div>
          {i < steps.length - 1 && (
            <ArrowRight className={`size-3 shrink-0 ${arrowColor}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function StatusBadge({ status, type = 'project', lang }: {
  status: string; type?: 'project' | 'rental'; lang: 'ar' | 'en'
}) {
  const labels = type === 'project' ? projectStatusLabels : rentalStatusLabels
  const cfg = labels[status] || { ar: status, en: status, color: 'bg-gray-100 text-gray-700 border-gray-200' }
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cfg.color}`}>
      {lang === 'ar' ? cfg.ar : cfg.en}
    </Badge>
  )
}

// ============ Construction Hub Panel ============
function ConstructionHubPanel({ data, lang, onNavigate }: {
  data: DashboardData; lang: 'ar' | 'en'; onNavigate: (item: NavItem) => void
}) {
  return (
    <Card className="border-emerald-200 overflow-hidden">
      {/* Hub Header */}
      <div className="bg-gradient-to-l from-emerald-600 to-emerald-700 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <Building2 className="size-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">{t('المشاريع التنفيذية', 'Construction Projects', lang)}</h2>
            <p className="text-xs text-emerald-100">
              {data.activeConstructionProjects} {t('مشروع نشط', 'active projects', lang)}
              {data.constructionProjects > 0 && (
                <span className="opacity-80"> ({t('إجمالي', 'total', lang)}: {data.constructionProjects})</span>
              )}
            </p>
          </div>
          <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30 text-xs">
            {t('محور التنفيذ', 'Construction Hub', lang)}
          </Badge>
        </div>
      </div>

      <CardContent className="p-5 space-y-5">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <HubMetricCard
            title={t('المشاريع النشطة', 'Active Projects', lang)}
            value={<span className="text-lg font-bold">{data.activeConstructionProjects}</span>}
            icon={Building2}
            theme="emerald"
          />
          <HubMetricCard
            title={t('قيمة العقود', 'Contract Value', lang)}
            value={<MoneyDisplay value={data.constructionContractValue || 0} lang={lang} size="sm" bold />}
            icon={DollarSign}
            theme="emerald"
          />
          <HubMetricCard
            title={t('المستخلصات', 'Extracts', lang)}
            value={<span className="text-lg font-bold">{data.totalExtracts}</span>}
            icon={FileText}
            theme="emerald"
          />
          <HubMetricCard
            title={t('فواتير العملاء', 'Client Invoices', lang)}
            value={<span className="text-lg font-bold">{data.totalClientInvoices}</span>}
            icon={CreditCard}
            theme="emerald"
          />
          <HubMetricCard
            title={t('تحصيلات معلقة', 'Outstanding', lang)}
            value={<MoneyDisplay value={data.outstandingConstructionCollections || 0} lang={lang} size="sm" bold />}
            icon={Clock}
            theme="emerald"
          />
          <HubMetricCard
            title={t('إجمالي الإيرادات', 'Total Revenue', lang)}
            value={<MoneyDisplay value={data.constructionRevenue || 0} lang={lang} size="sm" bold />}
            icon={TrendingUp}
            theme="emerald"
          />
        </div>

        {/* Revenue / Costs / Profit Summary */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-lg bg-emerald-50/60 p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">{t('الإيرادات', 'Revenue', lang)}</p>
            <MoneyDisplay value={data.constructionRevenue || 0} lang={lang} size="sm" bold className="text-emerald-700 justify-center" />
          </div>
          <div className="rounded-lg bg-rose-50/60 p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">{t('التكاليف', 'Costs', lang)}</p>
            <MoneyDisplay value={data.constructionCosts || 0} lang={lang} size="sm" bold className="text-rose-600 justify-center" />
          </div>
          <div className="rounded-lg bg-emerald-50/60 p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">{t('الربح', 'Profit', lang)}</p>
            <MoneyDisplay value={data.constructionProfit || 0} lang={lang} size="sm" bold className={(data.constructionProfit || 0) >= 0 ? 'text-emerald-700 justify-center' : 'text-rose-600 justify-center'} />
          </div>
        </div>

        {/* Workflow Chain */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">{t('سير العمل', 'Workflow Chain', lang)}</p>
          <WorkflowChain steps={CONSTRUCTION_WORKFLOW} theme="emerald" lang={lang} />
        </div>

        {/* Recent Projects */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">{t('أحدث المشاريع', 'Recent Projects', lang)}</p>
          {data.recentConstructionProjects && data.recentConstructionProjects.length > 0 ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {data.recentConstructionProjects.map(p => (
                <div key={p.id} className="flex items-center gap-2.5 rounded-lg bg-gray-50/80 px-3 py-2 hover:bg-gray-100/80 transition-colors">
                  <div className="flex size-7 items-center justify-center rounded-md bg-emerald-100">
                    <Building2 className="size-3.5 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.client?.name || '—'}</p>
                  </div>
                  <StatusBadge status={p.status} type="project" lang={lang} />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center">
              <Building2 className="mx-auto size-6 text-gray-300" />
              <p className="mt-1 text-xs text-muted-foreground">{t('لا توجد مشاريع تنفيذية', 'No construction projects', lang)}</p>
            </div>
          )}
        </div>

        {/* View All Button */}
        <Button
          onClick={() => onNavigate('projects')}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
        >
          {t('عرض جميع المشاريع', 'View All Projects', lang)}
          <ArrowLeft className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

// ============ Rental Hub Panel ============
function RentalHubPanel({ data, lang, onNavigate }: {
  data: DashboardData; lang: 'ar' | 'en'; onNavigate: (item: NavItem) => void
}) {
  const equipStatusEntries = Object.entries(data.equipmentStatusMap || {})

  return (
    <Card className="border-cyan-200 overflow-hidden">
      {/* Hub Header */}
      <div className="bg-gradient-to-l from-cyan-600 to-cyan-700 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <Truck className="size-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">{t('تأجير المعدات', 'Equipment Rental', lang)}</h2>
            <p className="text-xs text-cyan-100">
              {data.activeRentalProjects} {t('مشروع نشط', 'active projects', lang)}
              {data.rentalProjects > 0 && (
                <span className="opacity-80"> ({t('إجمالي', 'total', lang)}: {data.rentalProjects})</span>
              )}
            </p>
          </div>
          <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30 text-xs">
            {t('محور التأجير', 'Rental Hub', lang)}
          </Badge>
        </div>
      </div>

      <CardContent className="p-5 space-y-5">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <HubMetricCard
            title={t('معدات متاحة', 'Available', lang)}
            value={<span className="text-lg font-bold">{data.availableEquipment || 0}</span>}
            icon={Truck}
            theme="cyan"
          />
          <HubMetricCard
            title={t('معدات مؤجرة', 'Rented', lang)}
            value={<span className="text-lg font-bold">{(data.rentedEquipment || 0) + (data.inUseEquipment || 0)}</span>}
            icon={Link2}
            theme="cyan"
          />
          <HubMetricCard
            title={t('إيرادات التأجير', 'Rental Revenue', lang)}
            value={<MoneyDisplay value={data.rentalRevenue || 0} lang={lang} size="sm" bold />}
            icon={TrendingUp}
            theme="cyan"
          />
          <HubMetricCard
            title={t('تحصيلات معلقة', 'Outstanding', lang)}
            value={<MoneyDisplay value={data.outstandingRentalCollections || 0} lang={lang} size="sm" bold />}
            icon={Clock}
            theme="cyan"
          />
        </div>

        {/* Revenue / Costs / Profit Summary */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-lg bg-cyan-50/60 p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">{t('الإيرادات', 'Revenue', lang)}</p>
            <MoneyDisplay value={data.rentalRevenue || 0} lang={lang} size="sm" bold className="text-cyan-700 justify-center" />
          </div>
          <div className="rounded-lg bg-rose-50/60 p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">{t('التكاليف', 'Costs', lang)}</p>
            <MoneyDisplay value={data.rentalCosts || 0} lang={lang} size="sm" bold className="text-rose-600 justify-center" />
          </div>
          <div className="rounded-lg bg-cyan-50/60 p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">{t('الربح', 'Profit', lang)}</p>
            <MoneyDisplay value={data.rentalProfit || 0} lang={lang} size="sm" bold className={(data.rentalProfit || 0) >= 0 ? 'text-cyan-700 justify-center' : 'text-rose-600 justify-center'} />
          </div>
        </div>

        {/* Workflow Chain */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">{t('سير العمل', 'Workflow Chain', lang)}</p>
          <WorkflowChain steps={RENTAL_WORKFLOW} theme="cyan" lang={lang} />
        </div>

        {/* Equipment Status Summary */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">{t('حالة المعدات', 'Equipment Status', lang)}</p>
          {equipStatusEntries.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5">
              {equipStatusEntries.map(([status, count]) => {
                const cfg = equipStatusConfig[status] || { ar: status, en: status, dotColor: 'bg-gray-400', bgColor: 'bg-gray-50' }
                return (
                  <div key={status} className={`flex items-center gap-2 rounded-lg ${cfg.bgColor} px-2.5 py-1.5`}>
                    <div className={`size-2 rounded-full ${cfg.dotColor}`} />
                    <span className="text-[11px] flex-1">{lang === 'ar' ? cfg.ar : cfg.en}</span>
                    <span className="text-xs font-bold">{count}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 py-4 text-center">
              <p className="text-xs text-muted-foreground">{t('لا توجد معدات', 'No equipment', lang)}</p>
            </div>
          )}
        </div>

        {/* Recent Rental Contracts */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">{t('أحدث عقود التأجير', 'Recent Rental Contracts', lang)}</p>
          {data.recentRentalContracts && data.recentRentalContracts.length > 0 ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {data.recentRentalContracts.map(c => (
                <div key={c.id} className="flex items-center gap-2.5 rounded-lg bg-gray-50/80 px-3 py-2 hover:bg-gray-100/80 transition-colors">
                  <div className="flex size-7 items-center justify-center rounded-md bg-cyan-100">
                    <Truck className="size-3.5 text-cyan-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{c.equipment?.name || c.contractNo}</p>
                    <p className="text-[10px] text-muted-foreground">{c.client?.name || '—'} &bull; {c.contractNo}</p>
                  </div>
                  <StatusBadge status={c.status} type="rental" lang={lang} />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center">
              <Truck className="mx-auto size-6 text-gray-300" />
              <p className="mt-1 text-xs text-muted-foreground">{t('لا توجد عقود تأجير', 'No rental contracts', lang)}</p>
            </div>
          )}
        </div>

        {/* View All Button */}
        <Button
          onClick={() => onNavigate('equipment')}
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white gap-2"
        >
          {t('عرض جميع المعدات', 'View All Equipment', lang)}
          <ArrowLeft className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

// ============ Quick Link Card ============
function QuickLinkCard({ icon: Icon, title, description, color, onClick }: {
  icon: React.ElementType; title: string; description: string; color: string; onClick: () => void
}) {
  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 border-gray-200/60"
      onClick={onClick}
    >
      <CardContent className="p-3.5 flex items-center gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="size-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{title}</p>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ============ Loading Skeleton ============
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      {/* Financial Summary Skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-3"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
      </div>
      {/* Hub Panels Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map(i => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="h-20 w-full" />
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {Array.from({ length: i === 0 ? 6 : 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-16 w-full rounded-lg" />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-14 w-full rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-8 w-full" />
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-10 w-full rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Bottom Section Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  )
}

function ErrorState({ onRetry, lang }: { onRetry: () => void; lang: 'ar' | 'en' }) {
  return (
    <Card className="border-rose-200 bg-rose-50">
      <CardContent className="flex flex-col items-center gap-4 py-10">
        <AlertTriangle className="size-10 text-rose-500" />
        <p className="text-lg font-medium text-rose-700">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data', lang)}</p>
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="size-4" />
          {t('إعادة المحاولة', 'Retry', lang)}
        </Button>
      </CardContent>
    </Card>
  )
}

// ============ Seed Button ============
function SeedButton({ onSeedSuccess, lang }: { onSeedSuccess: () => void; lang: 'ar' | 'en' }) {
  const [isSeeding, setIsSeeding] = React.useState(false)
  const handleSeed = async () => {
    setIsSeeding(true)
    try { await fetch('/api/seed', { method: 'POST' }); onSeedSuccess() } catch { /* ignore */ } finally { setIsSeeding(false) }
  }
  return (
    <Button onClick={handleSeed} disabled={isSeeding} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
      {isSeeding ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      {isSeeding ? t('جاري التهيئة...', 'Seeding...', lang) : t('تهيئة البيانات التجريبية', 'Seed Demo Data', lang)}
    </Button>
  )
}

// ============ Alerts Section ============
function AlertsSection({ alerts, lang }: { alerts: DashboardData['alerts']; lang: 'ar' | 'en' }) {
  if (!alerts || alerts.length === 0) return null

  const iconMap: Record<string, React.ElementType> = {
    RESIDENCE_EXPIRY: Shield,
    MAINTENANCE_DUE: Wrench,
    CONTRACT_EXPIRY: Calendar,
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4 text-amber-600" />
          {t('التنبيهات', 'Alerts', lang)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {alerts.slice(0, 5).map((alert, i) => {
            const Icon = iconMap[alert.type] || AlertTriangle
            const isWarning = alert.severity === 'warning'
            return (
              <div key={i} className={`flex items-start gap-2 rounded-lg p-2 text-xs ${isWarning ? 'bg-amber-50' : 'bg-cyan-50'}`}>
                <Icon className={`size-3.5 mt-0.5 shrink-0 ${isWarning ? 'text-amber-600' : 'text-cyan-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{alert.title}</p>
                  {alert.detail && <p className="text-muted-foreground truncate">{alert.detail}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ============ Financial Summary Row ============
function FinancialSummaryRow({ data, lang }: { data: DashboardData; lang: 'ar' | 'en' }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-100">
              <TrendingUp className="size-4 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">{t('إجمالي الإيرادات', 'Total Revenue', lang)}</p>
              <MoneyDisplay value={data.totalRevenue || 0} lang={lang} size="sm" bold />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-rose-100">
              <TrendingDown className="size-4 text-rose-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">{t('إجمالي المصروفات', 'Total Expenses', lang)}</p>
              <MoneyDisplay value={data.totalExpenses || 0} lang={lang} size="sm" bold />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <div className={`flex size-8 items-center justify-center rounded-lg ${(data.netProfit || 0) >= 0 ? 'bg-emerald-100' : 'bg-rose-100'}`}>
              {(data.netProfit || 0) >= 0 ? <TrendingUp className="size-4 text-emerald-600" /> : <TrendingDown className="size-4 text-rose-600" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">{t('صافي الربح', 'Net Profit', lang)}</p>
              <MoneyDisplay value={data.netProfit || 0} lang={lang} size="sm" bold />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-teal-100">
              <Wallet className="size-4 text-teal-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">{t('الرصيد النقدي', 'Cash Balance', lang)}</p>
              <MoneyDisplay value={data.cashPosition || 0} lang={lang} size="sm" bold />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Main Dashboard Module ============
export function DashboardModule() {
  const { lang, setActiveItem } = useAppStore()
  const { data: dashboard, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => { const res = await fetch('/api/dashboard'); if (!res.ok) throw new Error(); return res.json() },
    staleTime: 30000,
  })

  const hasNoData = dashboard && dashboard.totalProjects === 0 && dashboard.totalRevenue === 0

  if (isLoading) return <DashboardSkeleton />
  if (isError) return <ErrorState onRetry={() => refetch()} lang={lang} />

  // Empty state - no data seeded yet
  if (hasNoData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-lg border-emerald-200 bg-emerald-50">
          <CardHeader className="items-center text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-100">
              <Building2 className="size-8 text-emerald-600" />
            </div>
            <CardTitle className="mt-4 text-2xl">{t('لا توجد بيانات', 'No Data', lang)}</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground leading-relaxed">{t('يرجى تهيئة البيانات التجريبية لعرض لوحة التحكم', 'Please seed demo data to view dashboard', lang)}</p>
            <div className="mt-6"><SeedButton onSeedSuccess={() => refetch()} lang={lang} /></div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('لوحة التحكم', 'Dashboard', lang)}</h1>
          <p className="text-sm text-muted-foreground">
            {t('نظرة شاملة على أنشطة المشاريع التنفيذية وتأجير المعدات', 'Overview of Construction Projects and Equipment Rental activities', lang)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SeedButton onSeedSuccess={() => refetch()} lang={lang} />
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh', lang)}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Financial Summary Row */}
      <FinancialSummaryRow data={dashboard!} lang={lang} />

      {/* ===== TWO HUB PANELS ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ConstructionHubPanel data={dashboard!} lang={lang} onNavigate={setActiveItem} />
        <RentalHubPanel data={dashboard!} lang={lang} onNavigate={setActiveItem} />
      </div>

      {/* ===== SHARED BOTTOM SECTION ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Links */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Link2 className="size-4 text-gray-500" />
              {t('روابط سريعة', 'Quick Links', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <QuickLinkCard
              icon={Users}
              title={t('الموارد البشرية', 'HR', lang)}
              description={t('الموظفون والرواتب', 'Employees & Salaries', lang)}
              color="bg-violet-500"
              onClick={() => setActiveItem('employees')}
            />
            <QuickLinkCard
              icon={Package}
              title={t('سلسلة التوريد', 'Supply Chain', lang)}
              description={t('المشتريات والموردين', 'Purchases & Suppliers', lang)}
              color="bg-amber-500"
              onClick={() => setActiveItem('purchase-requests')}
            />
            <QuickLinkCard
              icon={Wrench}
              title={t('التشغيل', 'Operations', lang)}
              description={t('تشغيل وصيانة المعدات', 'Equipment Ops & Maintenance', lang)}
              color="bg-orange-500"
              onClick={() => setActiveItem('equipment-operations')}
            />
            <QuickLinkCard
              icon={Calculator}
              title={t('المحاسبة', 'Accounting', lang)}
              description={t('القيود والتقارير', 'Journal Entries & Reports', lang)}
              color="bg-teal-500"
              onClick={() => setActiveItem('accounting')}
            />
          </CardContent>
        </Card>

        {/* Receivables & Payables */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ArrowUpDown className="size-4 text-cyan-600" />
              {t('الذمم المالية', 'Financial Position', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-cyan-50/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="size-4 text-cyan-600" />
                <span className="text-xs font-semibold text-cyan-800">{t('الذمم المدينة', 'Receivables', lang)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('إجمالي مستحق', 'Total Outstanding', lang)}</span>
                <MoneyDisplay value={dashboard?.outstandingReceivables || 0} lang={lang} size="sm" bold className="text-cyan-700" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-rose-600 font-medium">{t('متأخرة', 'Overdue', lang)}</span>
                <MoneyDisplay value={dashboard?.overdueReceivables || 0} lang={lang} size="sm" bold className="text-rose-600" />
              </div>
            </div>
            <div className="rounded-lg bg-orange-50/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-orange-600" />
                <span className="text-xs font-semibold text-orange-800">{t('الذمم الدائنة', 'Payables', lang)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('إجمالي مستحق', 'Total Outstanding', lang)}</span>
                <MoneyDisplay value={dashboard?.outstandingPayables || 0} lang={lang} size="sm" bold className="text-orange-700" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-rose-600 font-medium">{t('متأخرة', 'Overdue', lang)}</span>
                <MoneyDisplay value={dashboard?.overduePayables || 0} lang={lang} size="sm" bold className="text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <AlertsSection alerts={dashboard?.alerts || []} lang={lang} />
      </div>
    </div>
  )
}

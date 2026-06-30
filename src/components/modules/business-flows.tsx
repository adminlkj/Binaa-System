'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, Truck, Users, Package, ArrowLeft, ArrowRight,
  CheckCircle2, Circle, RefreshCw, AlertCircle,
  FileText, ClipboardList, Receipt, Wallet, BookOpen,
  HardHat, ClipboardCheck, Clock, Banknote,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore } from '@/stores/app-store'
import type { NavItem } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'

// ============ Types ============
interface WorkflowStep {
  step: string
  label: { ar: string; en: string }
  count: number
  navItem: string
}

interface ProjectInstance {
  id: string
  code: string
  name: string
  status: string
  contractValue: number
  progress: { contracts: number; boq: number; extracts: number; invoices: number }
}

interface RentalInstance {
  id: string
  code: string
  clientName: string
  equipmentName: string
  status: string
  progress: { deliveryOrders: number; timesheets: number }
}

interface HRInstance {
  id: string
  code: string
  period: string
  status: string
  totalNet: number
  employeeCount: number
}

interface BusinessFlowsData {
  workflows: {
    construction: { steps: WorkflowStep[]; activeInstances: ProjectInstance[] }
    rental: { steps: WorkflowStep[]; activeInstances: RentalInstance[] }
    hr: { steps: WorkflowStep[]; activeInstances: HRInstance[] }
    purchase: { steps: WorkflowStep[]; activeInstances: never[] }
  }
}

// ============ Step Icons ============
const stepIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  clients: Users,
  projects: Building2,
  contracts: FileText,
  boq: ClipboardList,
  extracts: ClipboardCheck,
  invoice: Receipt,
  collection: Wallet,
  accounting: BookOpen,
  reports: BookOpen,
  equipment: Truck,
  'rental-contract': FileText,
  delivery: Package,
  timesheet: Clock,
  employee: Users,
  contract: FileText,
  attendance: Clock,
  payroll: ClipboardCheck,
  salary: Banknote,
  payment: Wallet,
  request: ClipboardList,
  order: FileText,
  receipt: Package,
  'work-hours': Clock,
  purchases: Package,
  subcontractors: HardHat,
  expenses: Receipt,
}

// ============ Status Colors ============
const statusColors: Record<string, string> = {
  PLANNING: 'bg-blue-100 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  COMPLETED: 'bg-gray-100 text-gray-600 border-gray-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  DRAFT: 'bg-gray-100 text-gray-600 border-gray-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

function StatusBadge({ status }: { status: string }) {
  const colorClass = statusColors[status] || 'bg-gray-100 text-gray-600 border-gray-200'
  return (
    <Badge variant="outline" className={`${colorClass} text-xs font-medium`}>
      {status}
    </Badge>
  )
}

// ============ Workflow Stepper ============
function WorkflowStepper({ steps, lang, onNavigate }: {
  steps: WorkflowStep[]
  lang: 'ar' | 'en'
  onNavigate: (navItem: NavItem) => void
}) {
  const isRTL = lang === 'ar'
  const Arrow = isRTL ? ArrowLeft : ArrowRight

  return (
    <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
      {steps.map((step, idx) => {
        const Icon = stepIcons[step.step] || Circle
        const hasItems = step.count > 0
        return (
          <React.Fragment key={step.step}>
            <button
              onClick={() => onNavigate(step.navItem as NavItem)}
              className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 min-w-[120px] transition-all hover:shadow-md hover:border-primary/40 ${
                hasItems ? 'border-primary/20 bg-primary/5' : 'border-muted bg-muted/30'
              }`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                hasItems ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground'
              }`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-center">
                <div className="text-xs font-medium text-foreground leading-tight">
                  {lang === 'ar' ? step.label.ar : step.label.en}
                </div>
                <div className={`text-lg font-bold ${hasItems ? 'text-primary' : 'text-muted-foreground'}`}>
                  {step.count}
                </div>
              </div>
              {hasItems && (
                <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
            {idx < steps.length - 1 && (
              <div className="flex items-center px-1 text-muted-foreground/40">
                <Arrow className="h-5 w-5" />
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ============ Active Instances Lists ============
function ProjectInstances({ instances, lang, onNavigate }: {
  instances: ProjectInstance[]
  lang: 'ar' | 'en'
  onNavigate: (navItem: NavItem) => void
}) {
  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Building2 className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">{lang === 'ar' ? 'لا توجد مشاريع نشطة' : 'No active projects'}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {instances.map(p => (
        <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{p.name}</span>
              <StatusBadge status={p.status} />
            </div>
            <div className="text-xs text-muted-foreground">{p.code}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="secondary" className="text-xs" title={lang === 'ar' ? 'العقود' : 'Contracts'}>{p.progress.contracts} 📋</Badge>
            <Badge variant="secondary" className="text-xs" title={lang === 'ar' ? 'BOQ' : 'BOQ'}>{p.progress.boq} 📊</Badge>
            <Badge variant="secondary" className="text-xs" title={lang === 'ar' ? 'المستخلصات' : 'Extracts'}>{p.progress.extracts} 📝</Badge>
            <Badge variant="secondary" className="text-xs" title={lang === 'ar' ? 'الفواتير' : 'Invoices'}>{p.progress.invoices} 🧾</Badge>
          </div>
          {p.contractValue > 0 && (
            <MoneyDisplay amount={p.contractValue} className="text-sm font-semibold shrink-0" />
          )}
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onNavigate('projects')}>
            {lang === 'ar' ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      ))}
    </div>
  )
}

function RentalInstances({ instances, lang, onNavigate }: {
  instances: RentalInstance[]
  lang: 'ar' | 'en'
  onNavigate: (navItem: NavItem) => void
}) {
  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Truck className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">{lang === 'ar' ? 'لا توجد عقود تأجير نشطة' : 'No active rental contracts'}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {instances.map(r => (
        <div key={r.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 shrink-0">
            <Truck className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{r.equipmentName}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="text-xs text-muted-foreground">
              {r.code} · {r.clientName}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="secondary" className="text-xs" title={lang === 'ar' ? 'أوامر التسليم' : 'Delivery Orders'}>{r.progress.deliveryOrders} 📦</Badge>
            <Badge variant="secondary" className="text-xs" title={lang === 'ar' ? 'ساعات التشغيل' : 'Timesheets'}>{r.progress.timesheets} ⏱️</Badge>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onNavigate('rental-contracts')}>
            {lang === 'ar' ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      ))}
    </div>
  )
}

function HRInstances({ instances, lang, onNavigate }: {
  instances: HRInstance[]
  lang: 'ar' | 'en'
  onNavigate: (navItem: NavItem) => void
}) {
  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Users className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">{lang === 'ar' ? 'لا توجد مسيرات رواتب نشطة' : 'No active payroll runs'}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {instances.map(p => (
        <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700 shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{lang === 'ar' ? 'مسير' : 'Payroll'} {p.code}</span>
              <StatusBadge status={p.status} />
            </div>
            <div className="text-xs text-muted-foreground">
              {p.period} · {p.employeeCount} {lang === 'ar' ? 'موظف' : 'employees'}
            </div>
          </div>
          {p.totalNet > 0 && (
            <MoneyDisplay amount={p.totalNet} className="text-sm font-semibold shrink-0" />
          )}
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onNavigate('payroll-runs')}>
            {lang === 'ar' ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      ))}
    </div>
  )
}

// ============ Workflow Card ============
function WorkflowCard({ title, subtitle, icon: Icon, color, children }: {
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  children: React.ReactNode
}) {
  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-xs font-normal text-muted-foreground">{subtitle}</div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
      </CardContent>
    </Card>
  )
}

// ============ Main Module ============
export function BusinessFlowsModule() {
  const { lang, setActiveItem } = useAppStore()
  const [activeTab, setActiveTab] = useState('construction')

  const { data, isLoading, isError, refetch } = useQuery<BusinessFlowsData>({
    queryKey: ['business-flows'],
    queryFn: async () => {
      const res = await fetch('/api/business-flows')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const handleNavigate = (navItem: NavItem) => {
    setActiveItem(navItem)
  }

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">{t('فشل في تحميل تدفقات الأعمال', 'Failed to load business flows')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 ml-2" />
          {t('إعادة المحاولة', 'Retry')}
        </Button>
      </div>
    )
  }

  const { workflows } = data

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('تدفقات الأعمال', 'Business Flows')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('تتبع المسار الكامل لكل دورة عمل من البداية حتى القيد المحاسبي', 'Track the complete journey of each business cycle from start to journal entry')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 ml-2" />
          {t('تحديث', 'Refresh')}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
          <TabsTrigger value="construction" className="flex items-center gap-1.5 py-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('المشاريع', 'Construction')}</span>
          </TabsTrigger>
          <TabsTrigger value="rental" className="flex items-center gap-1.5 py-2">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">{t('التأجير', 'Rental')}</span>
          </TabsTrigger>
          <TabsTrigger value="hr" className="flex items-center gap-1.5 py-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{t('الموارد البشرية', 'HR')}</span>
          </TabsTrigger>
          <TabsTrigger value="purchase" className="flex items-center gap-1.5 py-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">{t('المشتريات', 'Purchase')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Construction Tab */}
        <TabsContent value="construction" className="space-y-4 mt-4">
          <WorkflowCard
            title={t('دورة المشاريع التنفيذية', 'Construction Project Cycle')}
            subtitle={t('العميل ← المشروع ← العقد ← BOQ ← المستخلص ← الفاتورة ← التحصيل ← القيد', 'Client → Project → Contract → BOQ → Extract → Invoice → Collection → Entry')}
            icon={Building2}
            color="bg-emerald-100 text-emerald-700"
          >
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {t('مراحل الدورة', 'Workflow Steps')}
              </h3>
              <WorkflowStepper steps={workflows.construction.steps} lang={lang} onNavigate={handleNavigate} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {t('المشاريع النشطة', 'Active Projects')} ({workflows.construction.activeInstances.length})
              </h3>
              <ProjectInstances
                instances={workflows.construction.activeInstances}
                lang={lang}
                onNavigate={handleNavigate}
              />
            </div>
          </WorkflowCard>
        </TabsContent>

        {/* Rental Tab */}
        <TabsContent value="rental" className="space-y-4 mt-4">
          <WorkflowCard
            title={t('دورة تأجير المعدات', 'Equipment Rental Cycle')}
            subtitle={t('العميل ← المعدة ← عقد التأجير ← أمر التسليم ← ساعات التشغيل ← الفاتورة ← التحصيل ← القيد', 'Client → Equipment → Contract → Delivery → Hours → Invoice → Collection → Entry')}
            icon={Truck}
            color="bg-cyan-100 text-cyan-700"
          >
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {t('مراحل الدورة', 'Workflow Steps')}
              </h3>
              <WorkflowStepper steps={workflows.rental.steps} lang={lang} onNavigate={handleNavigate} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {t('عقود التأجير النشطة', 'Active Rental Contracts')} ({workflows.rental.activeInstances.length})
              </h3>
              <RentalInstances
                instances={workflows.rental.activeInstances}
                lang={lang}
                onNavigate={handleNavigate}
              />
            </div>
          </WorkflowCard>
        </TabsContent>

        {/* HR Tab */}
        <TabsContent value="hr" className="space-y-4 mt-4">
          <WorkflowCard
            title={t('دورة الموارد البشرية', 'HR Cycle')}
            subtitle={t('الموظف ← عقد العمل ← الحضور ← مسير الرواتب ← الراتب ← الصرف ← القيد', 'Employee → Contract → Attendance → Payroll → Salary → Payment → Entry')}
            icon={Users}
            color="bg-violet-100 text-violet-700"
          >
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {t('مراحل الدورة', 'Workflow Steps')}
              </h3>
              <WorkflowStepper steps={workflows.hr.steps} lang={lang} onNavigate={handleNavigate} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {t('مسيرات الرواتب النشطة', 'Active Payroll Runs')} ({workflows.hr.activeInstances.length})
              </h3>
              <HRInstances
                instances={workflows.hr.activeInstances}
                lang={lang}
                onNavigate={handleNavigate}
              />
            </div>
          </WorkflowCard>
        </TabsContent>

        {/* Purchase Tab */}
        <TabsContent value="purchase" className="space-y-4 mt-4">
          <WorkflowCard
            title={t('دورة المشتريات', 'Purchase Cycle')}
            subtitle={t('طلب ← أمر ← استلام ← فاتورة ← سداد ← قيد', 'Request → Order → Receipt → Invoice → Payment → Entry')}
            icon={Package}
            color="bg-amber-100 text-amber-700"
          >
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {t('مراحل الدورة', 'Workflow Steps')}
              </h3>
              <WorkflowStepper steps={workflows.purchase.steps} lang={lang} onNavigate={handleNavigate} />
            </div>
          </WorkflowCard>
        </TabsContent>
      </Tabs>
    </div>
  )
}

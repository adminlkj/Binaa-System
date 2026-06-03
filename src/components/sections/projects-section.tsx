'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, Search, ArrowRight, RefreshCw, Plus,
  Eye, FileText, ClipboardList, TrendingUp, Calculator,
  HardHat, ShieldCheck, AlertTriangle, Mail, Receipt,
  DollarSign, FolderOpen, CalendarDays, MapPin, Users,
  BarChart3, Target, Clock, CheckCircle2, XCircle, Pause,
  Layers, Activity, Camera, FileQuestion, Send,
  ShieldAlert, FileCheck, FileSpreadsheet, FolderArchive,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  subModuleLabels,
  formatSAR,
  formatNumber,
  formatDate,
  commonText,
  type Lang,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { MoneyDisplay } from '@/components/ui/money-display'

// ============ Types ============

interface ClientSummary { id: string; name: string; code: string }
interface BranchSummary { id: string; name: string; code: string }
interface ContractSummary { id: string; contractNo: string; totalValue: number; status: string }

interface ProjectListItem {
  id: string
  code: string
  name: string
  nameAr: string | null
  location: string | null
  startDate: string
  endDate: string | null
  contractValue: number
  status: string
  description: string | null
  client: ClientSummary
  branch: BranchSummary
  contracts: ContractSummary[]
  _count: { boqItems: number; progressClaims: number }
}

interface BOQItem {
  id: string; code: string; description: string; unit: string
  quantity: number; unitPrice: number; totalPrice: number; category: string | null
}

interface ProgressClaimItem {
  id: string; claimNo: string; date: string; percentage: number; amount: number
  vatAmount: number; totalAmount: number; status: string
  contract: { contractNo: string }
}

interface CostSheet {
  contractValue: number; revenue: number; purchases: number; subcontractors: number
  labor: number; equipment: number; expenses: number
  totalCosts: number; profit: number; profitMargin: number
}

interface ProjectDetail {
  id: string
  code: string
  name: string
  nameAr: string | null
  location: string | null
  startDate: string
  endDate: string | null
  contractValue: number
  status: string
  description: string | null
  client: ClientSummary
  branch: BranchSummary
  contracts: (ContractSummary & { progressClaims: ProgressClaimItem[] })[]
  boqItems: BOQItem[]
  progressClaims: ProgressClaimItem[]
  costSheet: CostSheet
}

// ============ Constants ============

const statusLabels: Record<string, { ar: string; en: string }> = {
  PLANNING: { ar: 'تخطيط', en: 'Planning' },
  ACTIVE: { ar: 'نشط', en: 'Active' },
  ON_HOLD: { ar: 'معلق', en: 'On Hold' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled' },
}

const statusColors: Record<string, string> = {
  PLANNING: 'bg-amber-100 text-amber-700 border-amber-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ON_HOLD: 'bg-orange-100 text-orange-700 border-orange-200',
  COMPLETED: 'bg-teal-100 text-teal-700 border-teal-200',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
}

const statusProgressColors: Record<string, string> = {
  PLANNING: '[&>div]:bg-amber-500',
  ACTIVE: '[&>div]:bg-emerald-500',
  ON_HOLD: '[&>div]:bg-orange-500',
  COMPLETED: '[&>div]:bg-teal-500',
  CANCELLED: '[&>div]:bg-rose-400',
}

const contractStatusLabels: Record<string, { ar: string; en: string }> = {
  DRAFT: { ar: 'مسودة', en: 'Draft' },
  ACTIVE: { ar: 'نشط', en: 'Active' },
  EXPIRED: { ar: 'منتهي', en: 'Expired' },
  TERMINATED: { ar: 'ملغي', en: 'Terminated' },
}

const contractStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EXPIRED: 'bg-amber-100 text-amber-700 border-amber-200',
  TERMINATED: 'bg-rose-100 text-rose-700 border-rose-200',
}

const claimStatusLabels: Record<string, { ar: string; en: string }> = {
  DRAFT: { ar: 'مسودة', en: 'Draft' },
  SUBMITTED: { ar: 'مقدم', en: 'Submitted' },
  APPROVED: { ar: 'معتمد', en: 'Approved' },
  PARTIALLY_PAID: { ar: 'مدفوع جزئياً', en: 'Partially Paid' },
  PAID: { ar: 'مدفوع', en: 'Paid' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected' },
}

const claimStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SUBMITTED: 'bg-sky-100 text-sky-700 border-sky-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  PAID: 'bg-teal-100 text-teal-700 border-teal-200',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
}

// Project detail tabs definition
const projectSubTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'project-overview', icon: Eye },
  { key: 'project-contracting', icon: FileText },
  { key: 'project-planning', icon: ClipboardList },
  { key: 'project-execution', icon: HardHat },
  { key: 'project-boq', icon: Layers },
  { key: 'project-quality', icon: ShieldCheck },
  { key: 'project-safety', icon: ShieldAlert },
  { key: 'project-correspondence', icon: Mail },
  { key: 'project-extracts', icon: Receipt },
  { key: 'project-costs', icon: DollarSign },
  { key: 'project-documents', icon: FolderOpen },
]

// ============ Helpers ============

function t(ar: string, en: string, lang: Lang) {
  return lang === 'ar' ? ar : en
}

function getCompletionEstimate(status: string, claimCount: number, contractValue: number): number {
  if (contractValue <= 0) return 0
  switch (status) {
    case 'COMPLETED': return 100
    case 'CANCELLED': return 0
    case 'PLANNING': return Math.min(claimCount * 8, 15)
    case 'ON_HOLD': return Math.min(15 + claimCount * 12, 60)
    case 'ACTIVE': return Math.min(10 + claimCount * 15, 90)
    default: return 0
  }
}

function getActualCompletion(costSheet: CostSheet): number {
  if (!costSheet || costSheet.contractValue <= 0) return 0
  return Math.min(Math.round((costSheet.revenue / costSheet.contractValue) * 100), 100)
}

// ============ Skeleton Components ============

function ProjectCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-2/3" />
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ProjectListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-40" />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProjectCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 11 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-md shrink-0" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-20" /></CardContent></Card>
        ))}
      </div>
    </div>
  )
}

// ============ Error State ============

function ErrorState({ onRetry, lang }: { onRetry: () => void; lang: Lang }) {
  return (
    <Card className="border-rose-200 bg-rose-50">
      <CardContent className="flex flex-col items-center gap-4 py-10">
        <AlertTriangle className="size-10 text-rose-500" />
        <p className="text-lg font-medium text-rose-700">
          {t('حدث خطأ أثناء تحميل البيانات', 'An error occurred while loading data', lang)}
        </p>
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="size-4" />
          {t(commonText.retry.ar, commonText.retry.en, lang)}
        </Button>
      </CardContent>
    </Card>
  )
}

// ============ Tab Placeholder ============

function TabPlaceholder({
  icon: Icon,
  title,
  description,
  lang,
}: {
  icon: React.ElementType
  title: { ar: string; en: string }
  description: { ar: string; en: string }
  lang: Lang
}) {
  return (
    <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50">
      <CardContent className="flex flex-col items-center gap-4 py-16">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-gray-100">
          <Icon className="size-8 text-gray-400" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-gray-700">{title[lang]}</h3>
          <p className="text-sm text-muted-foreground max-w-md">{description[lang]}</p>
        </div>
        <Badge variant="outline" className="text-gray-500 border-gray-300">
          {t('قريباً', 'Coming Soon', lang)}
        </Badge>
      </CardContent>
    </Card>
  )
}

// ============ Project Card for List View ============

function ProjectCard({
  project,
  lang,
  onClick,
}: {
  project: ProjectListItem
  lang: Lang
  onClick: () => void
}) {
  const completion = getCompletionEstimate(project.status, project._count.progressClaims, project.contractValue)
  const statusLabel = statusLabels[project.status]?.[lang] || project.status
  const progressColor = statusProgressColors[project.status] || '[&>div]:bg-gray-400'

  return (
    <Card
      className="overflow-hidden cursor-pointer transition-all hover:shadow-md hover:border-emerald-200 group"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="space-y-3">
          {/* Header: Name + Status */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                {project.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {project.code} — {project.client.name}
              </p>
            </div>
            <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0.5 ${statusColors[project.status]}`}>
              {statusLabel}
            </Badge>
          </div>

          {/* Location */}
          {project.location && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{project.location}</span>
            </div>
          )}

          {/* Contract Value */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t('قيمة العقد', 'Contract Value', lang)}
            </span>
            <span className="text-sm font-bold text-emerald-700">
              <MoneyDisplay value={project.contractValue} mode="system" lang={lang} bold size="sm" />
            </span>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t('نسبة الإنجاز', 'Completion', lang)}
              </span>
              <span className="font-semibold text-gray-700">{completion}%</span>
            </div>
            <Progress value={completion} className={`h-2 ${progressColor}`} />
          </div>

          {/* Footer Stats */}
          <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileText className="size-3" />
              <span>{project._count.progressClaims} {t('مستخلص', 'claims', lang)}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ClipboardList className="size-3" />
              <span>{project._count.boqItems} {t('بند', 'items', lang)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============ PROJECT LIST VIEW ============

function ProjectListView() {
  const { lang, selectProject, setActiveSubModule } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: projects = [], isLoading, isError, refetch } = useQuery<ProjectListItem[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error('Failed to fetch projects')
      return res.json()
    },
    staleTime: 30000,
  })

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const matchSearch = !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        p.client.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.nameAr && p.nameAr.includes(search))
      const matchStatus = statusFilter === 'all' || p.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [projects, search, statusFilter])

  // Stats
  const totalContractValue = projects.reduce((s, p) => s + p.contractValue, 0)
  const activeCount = projects.filter(p => p.status === 'ACTIVE').length
  const completedCount = projects.filter(p => p.status === 'COMPLETED').length

  const handleSelectProject = (id: string) => {
    selectProject(id)
    setActiveSubModule('project-overview')
  }

  if (isLoading) return <ProjectListSkeleton />
  if (isError) return <ErrorState onRetry={() => refetch()} lang={lang} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('المشاريع', 'Projects', lang)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('إدارة ومتابعة مشاريع المقاولات', 'Manage and track construction projects', lang)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t(commonText.refresh.ar, commonText.refresh.en, lang)}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="size-4" />
            {t('مشروع جديد', 'New Project', lang)}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100">
                <Building2 className="size-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('إجمالي المشاريع', 'Total Projects', lang)}</p>
                <p className="text-xl font-bold">{formatNumber(projects.length)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-teal-100">
                <Activity className="size-5 text-teal-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('المشاريع النشطة', 'Active Projects', lang)}</p>
                <p className="text-xl font-bold">{formatNumber(activeCount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100">
                <DollarSign className="size-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('إجمالي العقود', 'Total Contracts', lang)}</p>
                <p className="text-lg font-bold">
                  <MoneyDisplay value={totalContractValue} mode="system" lang={lang} bold size="sm" />
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search / Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t('بحث بالاسم أو الكود أو العميل...', 'Search by name, code or client...', lang)}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={t('كل الحالات', 'All Statuses', lang)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الحالات', 'All Statuses', lang)}</SelectItem>
                <SelectItem value="PLANNING">{statusLabels.PLANNING[lang]}</SelectItem>
                <SelectItem value="ACTIVE">{statusLabels.ACTIVE[lang]}</SelectItem>
                <SelectItem value="ON_HOLD">{statusLabels.ON_HOLD[lang]}</SelectItem>
                <SelectItem value="COMPLETED">{statusLabels.COMPLETED[lang]}</SelectItem>
                <SelectItem value="CANCELLED">{statusLabels.CANCELLED[lang]}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Projects Grid */}
      {filtered.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-gray-100">
              <Building2 className="size-8 text-gray-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-700">
                {t('لا توجد مشاريع', 'No Projects Found', lang)}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {search || statusFilter !== 'all'
                  ? t('لا توجد نتائج مطابقة للبحث', 'No results match your search', lang)
                  : t('ابدأ بإنشاء مشروع جديد', 'Start by creating a new project', lang)}
              </p>
            </div>
            {!search && statusFilter === 'all' && (
              <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="size-4" />
                {t('مشروع جديد', 'New Project', lang)}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              lang={lang}
              onClick={() => handleSelectProject(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============ PROJECT DETAIL VIEW ============

function ProjectDetailView() {
  const { activeSubModule, setActiveSubModule, selectedProjectId, selectProject, lang } = useAppStore()

  const { data: project, isLoading, isError, refetch } = useQuery<ProjectDetail>({
    queryKey: ['project', selectedProjectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${selectedProjectId}`)
      if (!res.ok) throw new Error('Failed to fetch project')
      return res.json()
    },
    enabled: !!selectedProjectId,
    staleTime: 30000,
  })

  const handleBack = () => {
    selectProject(null)
    setActiveSubModule('project-list')
  }

  if (isLoading) return <DetailSkeleton />
  if (isError || !project) return <ErrorState onRetry={() => refetch()} lang={lang} />

  const completion = getActualCompletion(project.costSheet)
  const statusLabel = statusLabels[project.status]?.[lang] || project.status

  // Tab content rendering
  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'project-overview':
        return <OverviewTab project={project} completion={completion} lang={lang} />
      case 'project-contracting':
        return <ContractingTab project={project} lang={lang} />
      case 'project-planning':
        return (
          <TabPlaceholder
            icon={ClipboardList}
            title={{ ar: 'التخطيط', en: 'Planning' }}
            description={{
              ar: 'هيكل تقسيم العمل (WBS)، الأنشطة، الجدول الزمني، ونسب الإنجاز المخططة والفعلية',
              en: 'Work Breakdown Structure (WBS), activities, schedule, and planned vs actual completion percentages',
            }}
            lang={lang}
          />
        )
      case 'project-execution':
        return (
          <TabPlaceholder
            icon={HardHat}
            title={{ ar: 'التنفيذ', en: 'Execution' }}
            description={{
              ar: 'التقارير اليومية، سجل الموقع، الصور، والمطبات والعقبات',
              en: 'Daily reports, site diary, photos, obstacles and issues tracking',
            }}
            lang={lang}
          />
        )
      case 'project-boq':
        return <BOQTab project={project} lang={lang} />
      case 'project-quality':
        return (
          <TabPlaceholder
            icon={ShieldCheck}
            title={{ ar: 'الجودة', en: 'Quality' }}
            description={{
              ar: 'خطط فحص واختبار (ITP)، تقارير عدم المطابقة (NCR)، وطلبات الفحص',
              en: 'Inspection and Test Plans (ITP), Non-Conformance Reports (NCR), and inspection requests',
            }}
            lang={lang}
          />
        )
      case 'project-safety':
        return (
          <TabPlaceholder
            icon={ShieldAlert}
            title={{ ar: 'السلامة', en: 'Safety' }}
            description={{
              ar: 'الحوادث، تصاريح العمل، تقييم المخاطر، وتقارير السلامة',
              en: 'Incidents, work permits, risk assessments, and safety reports',
            }}
            lang={lang}
          />
        )
      case 'project-correspondence':
        return (
          <TabPlaceholder
            icon={Mail}
            title={{ ar: 'المراسلات', en: 'Correspondence' }}
            description={{
              ar: 'طلبات المعلومات (RFI)، التسليمات (Submittals)، الإحالات (Transmittals)، والخطابات الرسمية',
              en: 'Requests for Information (RFI), Submittals, Transmittals, and official letters',
            }}
            lang={lang}
          />
        )
      case 'project-extracts':
        return <ExtractsTab project={project} lang={lang} />
      case 'project-costs':
        return <CostsTab project={project} lang={lang} />
      case 'project-documents':
        return (
          <TabPlaceholder
            icon={FolderOpen}
            title={{ ar: 'الوثائق', en: 'Documents' }}
            description={{
              ar: 'المخططات، العقود، الملفات والمستندات المرتبطة بالمشروع',
              en: 'Drawings, contracts, files and documents associated with the project',
            }}
            lang={lang}
          />
        )
      default:
        return <OverviewTab project={project} completion={completion} lang={lang} />
    }
  }

  return (
    <div className="space-y-0">
      {/* Project Header with Back Button */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="outline" size="icon" onClick={handleBack} className="shrink-0">
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 truncate">{project.name}</h2>
            <Badge variant="outline" className={statusColors[project.status]}>
              {statusLabel}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {project.code} — {project.client.name}
            {project.location && ` — ${project.location}`}
          </p>
        </div>
      </div>

      {/* Section Layout with Tabs */}
      <SectionLayout
        title={{ ar: project.name, en: project.name }}
        subtitle={{ ar: project.description || project.code, en: project.description || project.code }}
        tabs={projectSubTabs}
        showPrintExport={false}
      >
        {renderTabContent()}
      </SectionLayout>
    </div>
  )
}

// ============ OVERVIEW TAB ============

function OverviewTab({ project, completion, lang }: { project: ProjectDetail; completion: number; lang: Lang }) {
  const cs = project.costSheet
  const isProfit = cs.profit >= 0

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100">
                <FileText className="size-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('قيمة العقد', 'Contract Value', lang)}</p>
                <p className="text-sm font-bold text-emerald-700">
                  <MoneyDisplay value={cs.contractValue} mode="system" lang={lang} bold size="sm" />
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-teal-100">
                <TrendingUp className="size-5 text-teal-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('الإيرادات', 'Revenue', lang)}</p>
                <p className="text-sm font-bold text-teal-700">
                  <MoneyDisplay value={cs.revenue} mode="system" lang={lang} bold size="sm" />
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-rose-100">
                <DollarSign className="size-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('إجمالي التكاليف', 'Total Costs', lang)}</p>
                <p className="text-sm font-bold text-rose-700">
                  <MoneyDisplay value={cs.totalCosts} mode="system" lang={lang} bold size="sm" />
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`flex size-10 items-center justify-center rounded-xl ${isProfit ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                <Calculator className={`size-5 ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('الربح', 'Profit', lang)}</p>
                <p className={`text-sm font-bold ${isProfit ? 'text-emerald-700' : 'text-rose-700'}`}>
                  <MoneyDisplay value={cs.profit} mode="system" lang={lang} bold size="sm" />
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Completion & Timeline Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Completion Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="size-4 text-emerald-600" />
              {t('نسبة الإنجاز', 'Completion Percentage', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="relative flex size-28 shrink-0 items-center justify-center">
                <svg className="size-28 -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke={completion >= 100 ? '#14b8a6' : '#10b981'}
                    strokeWidth="2.5"
                    strokeDasharray={`${completion}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-2xl font-bold text-gray-800">{completion}%</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('المستخلصات', 'Claims', lang)}</span>
                  <span className="font-medium">{formatNumber(project.progressClaims.length)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('بنود BOQ', 'BOQ Items', lang)}</span>
                  <span className="font-medium">{formatNumber(project.boqItems.length)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('العقود', 'Contracts', lang)}</span>
                  <span className="font-medium">{formatNumber(project.contracts.length)}</span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('هامش الربح', 'Profit Margin', lang)}</span>
                  <span className={`font-bold ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {Math.abs(cs.profitMargin).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project Info Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4 text-emerald-600" />
              {t('معلومات المشروع', 'Project Information', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('كود المشروع', 'Project Code', lang)}</p>
                <p className="font-medium">{project.code}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('العميل', 'Client', lang)}</p>
                <p className="font-medium">{project.client.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('الفرع', 'Branch', lang)}</p>
                <p className="font-medium">{project.branch.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('الموقع', 'Location', lang)}</p>
                <p className="font-medium">{project.location || '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('تاريخ البدء', 'Start Date', lang)}</p>
                <p className="font-medium">{formatDate(project.startDate, lang)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('تاريخ الانتهاء', 'End Date', lang)}</p>
                <p className="font-medium">{project.endDate ? formatDate(project.endDate, lang) : '—'}</p>
              </div>
              {project.description && (
                <div className="col-span-2 space-y-1">
                  <p className="text-xs text-muted-foreground">{t('الوصف', 'Description', lang)}</p>
                  <p className="font-medium text-gray-700">{project.description}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="size-4 text-emerald-600" />
            {t('ملخص التكاليف', 'Cost Summary', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: t('المشتريات', 'Purchases', lang), value: cs.purchases, color: 'bg-rose-500' },
              { label: t('مقاولو الباطن', 'Subcontractors', lang), value: cs.subcontractors, color: 'bg-orange-500' },
              { label: t('تكاليف العمالة', 'Labor', lang), value: cs.labor, color: 'bg-amber-500' },
              { label: t('تكاليف المعدات', 'Equipment', lang), value: cs.equipment, color: 'bg-cyan-500' },
              { label: t('المصروفات', 'Expenses', lang), value: cs.expenses, color: 'bg-purple-500' },
            ].map((item) => {
              const maxVal = Math.max(cs.totalCosts, 1)
              const pct = Math.round((item.value / maxVal) * 100)
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        <MoneyDisplay value={item.value} mode="system" lang={lang} size="sm" />
                      </span>
                      <span className="text-xs text-muted-foreground">({pct}%)</span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full ${item.color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            <Separator />
            <div className="flex items-center justify-between text-sm font-bold">
              <span>{t('إجمالي التكاليف', 'Total Costs', lang)}</span>
              <span className="text-rose-700">
                <MoneyDisplay value={cs.totalCosts} mode="system" lang={lang} bold size="md" />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ CONTRACTING TAB ============

function ContractingTab({ project, lang }: { project: ProjectDetail; lang: Lang }) {
  return (
    <div className="space-y-6">
      {/* Contracts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="size-4 text-emerald-600" />
            {t('العقود', 'Contracts', lang)}
            <Badge variant="secondary" className="mr-2">{project.contracts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {project.contracts.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('رقم العقد', 'Contract No.', lang)}</TableHead>
                    <TableHead className="text-right">{t('القيمة', 'Value', lang)}</TableHead>
                    <TableHead className="text-right">{t('ضريبة القيمة المضافة', 'VAT', lang)}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                    <TableHead className="text-right">{t('المستخلصات', 'Claims', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.contracts.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.contractNo}</TableCell>
                      <TableCell>{formatSAR(c.totalValue / 1.15, lang)}</TableCell>
                      <TableCell>{formatSAR(c.totalValue - c.totalValue / 1.15, lang)}</TableCell>
                      <TableCell className="font-semibold">{formatSAR(c.totalValue, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={contractStatusColors[c.status]}>
                          {contractStatusLabels[c.status]?.[lang] || c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{c.progressClaims?.length || 0}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8">
              <FileText className="size-8 text-gray-300" />
              <p className="text-sm text-muted-foreground">{t('لا توجد عقود لهذا المشروع', 'No contracts for this project', lang)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Orders - Placeholder */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <FileQuestion className="size-8 text-gray-400" />
          <div className="text-center">
            <p className="font-medium text-gray-600">{t('أوامر التغيير', 'Change Orders', lang)}</p>
            <p className="text-xs text-muted-foreground">{t('لم يتم تسجيل أوامر تغيير بعد', 'No change orders recorded yet', lang)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Warranties - Placeholder */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <ShieldCheck className="size-8 text-gray-400" />
          <div className="text-center">
            <p className="font-medium text-gray-600">{t('الضمانات', 'Warranties', lang)}</p>
            <p className="text-xs text-muted-foreground">{t('لم يتم تسجيل ضمانات بعد', 'No warranties recorded yet', lang)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ BOQ TAB ============

function BOQTab({ project, lang }: { project: ProjectDetail; lang: Lang }) {
  const totalBOQ = project.boqItems.reduce((s, i) => s + i.totalPrice, 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('عدد البنود', 'Total Items', lang)}</p>
            <p className="text-2xl font-bold">{formatNumber(project.boqItems.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('إجمالي BOQ', 'BOQ Total', lang)}</p>
            <p className="text-lg font-bold text-emerald-700">
              <MoneyDisplay value={totalBOQ} mode="system" lang={lang} bold size="sm" />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('قيمة العقد', 'Contract Value', lang)}</p>
            <p className="text-lg font-bold text-teal-700">
              <MoneyDisplay value={project.contractValue} mode="system" lang={lang} bold size="sm" />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* BOQ Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="size-4 text-emerald-600" />
            {t('جدول الكميات', 'Bill of Quantities', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {project.boqItems.length > 0 ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                    <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                    <TableHead className="text-right">{t('الوحدة', 'Unit', lang)}</TableHead>
                    <TableHead className="text-right">{t('الكمية', 'Qty', lang)}</TableHead>
                    <TableHead className="text-right">{t('سعر الوحدة', 'Unit Price', lang)}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    let currentCategory = ''
                    const rows: React.ReactNode[] = []
                    project.boqItems.forEach((item, idx) => {
                      if (item.category && item.category !== currentCategory) {
                        currentCategory = item.category
                        rows.push(
                          <TableRow key={`cat-${idx}`} className="bg-emerald-50">
                            <TableCell colSpan={6} className="font-bold text-emerald-700">{currentCategory}</TableCell>
                          </TableRow>
                        )
                      }
                      rows.push(
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.code}</TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>{formatNumber(item.quantity)}</TableCell>
                          <TableCell>{formatSAR(item.unitPrice, lang)}</TableCell>
                          <TableCell className="font-semibold">{formatSAR(item.totalPrice, lang)}</TableCell>
                        </TableRow>
                      )
                    })
                    rows.push(
                      <TableRow key="total" className="bg-gray-50 font-bold">
                        <TableCell colSpan={5} className="text-left">{t('الإجمالي', 'Total', lang)}</TableCell>
                        <TableCell>{formatSAR(totalBOQ, lang)}</TableCell>
                      </TableRow>
                    )
                    return rows
                  })()}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8">
              <Layers className="size-8 text-gray-300" />
              <p className="text-sm text-muted-foreground">{t('لا توجد بنود في جدول الكميات', 'No BOQ items', lang)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ EXTRACTS TAB ============

function ExtractsTab({ project, lang }: { project: ProjectDetail; lang: Lang }) {
  const totalClaimsAmount = project.progressClaims.reduce((s, c) => s + c.totalAmount, 0)
  const paidClaims = project.progressClaims.filter(c => c.status === 'PAID')
  const paidAmount = paidClaims.reduce((s, c) => s + c.totalAmount, 0)
  const pendingClaims = project.progressClaims.filter(c => ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_PAID'].includes(c.status))
  const pendingAmount = pendingClaims.reduce((s, c) => s + c.totalAmount, 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('عدد المستخلصات', 'Total Claims', lang)}</p>
            <p className="text-2xl font-bold">{formatNumber(project.progressClaims.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('إجمالي المستخلصات', 'Total Amount', lang)}</p>
            <p className="text-lg font-bold text-emerald-700">
              <MoneyDisplay value={totalClaimsAmount} mode="system" lang={lang} bold size="sm" />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('المحصل', 'Collected', lang)}</p>
            <p className="text-lg font-bold text-teal-700">
              <MoneyDisplay value={paidAmount} mode="system" lang={lang} bold size="sm" />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('المعلق', 'Pending', lang)}</p>
            <p className="text-lg font-bold text-amber-700">
              <MoneyDisplay value={pendingAmount} mode="system" lang={lang} bold size="sm" />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Claims Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="size-4 text-emerald-600" />
            {t('مستخلصات العميل', 'Client Extracts', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {project.progressClaims.length > 0 ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('رقم المستخلص', 'Claim No.', lang)}</TableHead>
                    <TableHead className="text-right">{t('العقد', 'Contract', lang)}</TableHead>
                    <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                    <TableHead className="text-right">{t('النسبة', '%', lang)}</TableHead>
                    <TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي مع الضريبة', 'Total incl. VAT', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.progressClaims.map(cl => (
                    <TableRow key={cl.id}>
                      <TableCell className="font-medium">{cl.claimNo}</TableCell>
                      <TableCell>{cl.contract.contractNo}</TableCell>
                      <TableCell>{formatDate(cl.date, lang)}</TableCell>
                      <TableCell>{cl.percentage}%</TableCell>
                      <TableCell>{formatSAR(cl.amount, lang)}</TableCell>
                      <TableCell className="font-semibold">{formatSAR(cl.totalAmount, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={claimStatusColors[cl.status]}>
                          {claimStatusLabels[cl.status]?.[lang] || cl.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-50 font-bold">
                    <TableCell colSpan={4}>{t('الإجمالي', 'Total', lang)}</TableCell>
                    <TableCell>{formatSAR(project.progressClaims.reduce((s, c) => s + c.amount, 0), lang)}</TableCell>
                    <TableCell>{formatSAR(totalClaimsAmount, lang)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8">
              <Receipt className="size-8 text-gray-300" />
              <p className="text-sm text-muted-foreground">{t('لا توجد مستخلصات', 'No claims', lang)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contractor Extracts - Placeholder */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <Send className="size-8 text-gray-400" />
          <div className="text-center">
            <p className="font-medium text-gray-600">{t('مستخلصات المقاولين', 'Contractor Extracts', lang)}</p>
            <p className="text-xs text-muted-foreground">{t('إدارة مستخلصات المقاولين من الباطن', 'Manage subcontractor extracts and payments', lang)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ COSTS TAB ============

function CostsTab({ project, lang }: { project: ProjectDetail; lang: Lang }) {
  const cs = project.costSheet
  const isProfit = cs.profit >= 0

  const costRows = [
    { label: t('المشتريات', 'Purchases', lang), value: cs.purchases, color: 'text-rose-600', bg: 'bg-rose-50/50' },
    { label: t('مصروفات المشروع', 'Project Expenses', lang), value: cs.expenses, color: 'text-rose-600', bg: 'bg-rose-50/30' },
    { label: t('مقاولو الباطن', 'Subcontractors', lang), value: cs.subcontractors, color: 'text-orange-600', bg: 'bg-orange-50/30' },
    { label: t('تكاليف العمالة', 'Labor Costs', lang), value: cs.labor, color: 'text-amber-600', bg: 'bg-amber-50/30' },
    { label: t('تكاليف المعدات', 'Equipment Costs', lang), value: cs.equipment, color: 'text-cyan-600', bg: 'bg-cyan-50/30' },
  ]

  // Budget variance calculations
  const budgetVariance = cs.contractValue - cs.totalCosts
  const budgetVariancePct = cs.contractValue > 0 ? ((budgetVariance / cs.contractValue) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Budget vs Actual Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('قيمة العقد (الموازنة)', 'Contract Value (Budget)', lang)}</p>
            <p className="text-lg font-bold text-emerald-700">
              <MoneyDisplay value={cs.contractValue} mode="system" lang={lang} bold size="sm" />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('التكاليف الفعلية', 'Actual Costs', lang)}</p>
            <p className="text-lg font-bold text-rose-700">
              <MoneyDisplay value={cs.totalCosts} mode="system" lang={lang} bold size="sm" />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('الفرق', 'Variance', lang)}</p>
            <p className={`text-lg font-bold ${budgetVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              <MoneyDisplay value={budgetVariance} mode="system" lang={lang} bold size="sm" />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('نسبة الفرق', 'Variance %', lang)}</p>
            <p className={`text-lg font-bold ${budgetVariancePct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {budgetVariancePct >= 0 ? '+' : ''}{budgetVariancePct.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown Card */}
      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-700 to-emerald-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-white/20">
              <Calculator className="size-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{t('كرت المشروع', 'Project Card')}</h3>
              <p className="text-sm text-emerald-200">{project.name}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="border-x border-b border-gray-200">
          {/* Revenue Section */}
          <div className="px-6 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-3">
              {t('الإيرادات', 'Revenue')}
            </p>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm font-medium text-gray-700">{t('قيمة العقد', 'Contract Value')}</span>
              <span className="text-emerald-700">
                <MoneyDisplay value={cs.contractValue} mode="system" lang={lang} bold size="md" />
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 border-t border-dashed border-gray-100">
              <span className="text-sm font-medium text-gray-700">{t('المستخلصات الصادرة', 'Progress Claims Issued')}</span>
              <span className="text-emerald-600">
                <MoneyDisplay value={cs.revenue} mode="system" lang={lang} bold size="md" />
              </span>
            </div>
          </div>

          <div className="mx-6 border-t-2 border-emerald-200" />

          {/* Costs Section */}
          <div className="px-6 pt-3 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 mb-3">
              {t('التكاليف', 'Costs')}
            </p>
            {costRows.map((row, idx) => (
              <div key={idx} className={`flex items-center justify-between py-2.5 ${idx < costRows.length - 1 ? 'border-b border-dashed border-gray-100' : ''}`}>
                <span className="text-sm font-medium text-gray-700">{row.label}</span>
                <span className={row.color}>
                  <MoneyDisplay value={row.value} mode="system" lang={lang} bold size="md" />
                </span>
              </div>
            ))}
          </div>

          <div className="mx-6 border-t-2 border-rose-200" />
          <div className="px-6 py-3 bg-rose-50/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">{t('إجمالي التكلفة', 'Total Cost')}</span>
              <span className="text-rose-700">
                <MoneyDisplay value={cs.totalCosts} mode="system" lang={lang} bold size="lg" />
              </span>
            </div>
          </div>

          <div className="mx-6 border-t-2 border-gray-200" />

          {/* Profit Section */}
          <div className={`px-6 py-4 ${isProfit ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex size-10 items-center justify-center rounded-full ${isProfit ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                  <TrendingUp className={`size-5 ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{t('الربح', 'Profit')}</p>
                  <span className={isProfit ? 'text-emerald-600' : 'text-rose-600'}>
                    <MoneyDisplay value={cs.profit} mode="system" lang={lang} bold size="xl" />
                  </span>
                </div>
              </div>
              <div className={`text-center rounded-xl px-5 py-3 ${isProfit ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                <p className="text-xs font-medium text-gray-500 mb-1">{t('هامش الربح', 'Profit Margin')}</p>
                <p className={`text-3xl font-bold ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {Math.abs(cs.profitMargin).toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ MAIN EXPORT ============

export function ProjectsSection() {
  const { activeSubModule, selectedProjectId } = useAppStore()

  // Show project list when no project is selected or activeSubModule is project-list
  if (!selectedProjectId || activeSubModule === 'project-list') {
    return <ProjectListView />
  }

  // Show project detail when a project is selected
  return <ProjectDetailView />
}

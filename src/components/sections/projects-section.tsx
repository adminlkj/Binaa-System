'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Search, ArrowRight, RefreshCw, Plus,
  Eye, FileText, TrendingUp, Calculator,
  Receipt, DollarSign, MapPin,
  BarChart3, Target, CreditCard,
  Landmark, Building, Send, CheckCircle2, Trash2,
  ShieldCheck, ShieldAlert, Mail, FolderOpen, ClipboardList, HardHat,
  Layers, Activity,
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
import { Skeleton } from '@/components/ui/skeleton'
import { MoneyDisplay } from '@/components/ui/money-display'
import { StatusBadge } from '@/components/shared/module-layout'

// ============ Types ============

interface ClientSummary { id: string; name: string; code: string }
interface BranchSummary { id: string; name: string; code: string }
interface ContractSummary { id: string; contractNo: string; totalValue: number; status: string; startDate?: string; endDate?: string }

interface ProgressClaimItem {
  id: string; claimNo: string; date: string; percentage: number; amount: number
  vatAmount: number; totalAmount: number; status: string; invoiced: boolean
  contract: { contractNo: string }
  salesInvoice?: { id: string; invoiceNo: string } | null
}

interface SalesInvoiceItem {
  id: string; invoiceNo: string; date: string; dueDate: string
  subtotal: number; vatAmount: number; totalAmount: number
  paidAmount: number; status: string; sourceType: string
  progressClaimId: string | null
  progressClaim?: { claimNo: string } | null
  journalEntryId: string | null
}

interface ClientPaymentItem {
  id: string; amount: number; date: string; receivedIn: string
  reference: string | null; journalEntryId: string | null
  invoice?: { invoiceNo: string } | null
}

interface CostSheet {
  contractValue: number; revenue: number; purchases: number; subcontractors: number
  labor: number; equipment: number; expenses: number
  totalCosts: number; profit: number; profitMargin: number
}

interface BOQItem {
  id: string; code: string; description: string; unit: string
  quantity: number; unitPrice: number; totalPrice: number; category: string | null
}

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
  projectType: string | null
  description: string | null
  client: ClientSummary
  branch: BranchSummary
  contracts: ContractSummary[]
  _count: { boqItems: number; progressClaims: number }
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
  projectType: string | null
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

const invoiceStatusLabels: Record<string, { ar: string; en: string }> = {
  DRAFT: { ar: 'مسودة', en: 'Draft' },
  SENT: { ar: 'مُرسل', en: 'Sent' },
  PARTIALLY_PAID: { ar: 'مدفوع جزئياً', en: 'Partially Paid' },
  PAID: { ar: 'مدفوع', en: 'Paid' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled' },
  OVERDUE: { ar: 'متأخر', en: 'Overdue' },
}

const invoiceStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SENT: 'bg-sky-100 text-sky-700 border-sky-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
  OVERDUE: 'bg-red-100 text-red-700 border-red-200',
}

const receivedInLabels: Record<string, { ar: string; en: string }> = {
  TREASURY: { ar: 'الخزينة', en: 'Treasury' },
  BANK: { ar: 'البنك', en: 'Bank' },
}

const receivedInColors: Record<string, string> = {
  TREASURY: 'bg-amber-100 text-amber-700 border-amber-200',
  BANK: 'bg-sky-100 text-sky-700 border-sky-200',
}

// Project detail tabs definition - Construction Workflow
const projectSubTabs: { key: SubModuleKey; icon: React.ElementType; label?: { ar: string; en: string } }[] = [
  { key: 'project-overview', icon: Eye, label: { ar: 'نظرة عامة', en: 'Overview' } },
  { key: 'project-contracts', icon: FileText, label: { ar: 'العقود', en: 'Contracts' } },
  { key: 'project-extracts', icon: Receipt, label: { ar: 'المستخلصات', en: 'Extracts' } },
  { key: 'project-invoices', icon: FileText, label: { ar: 'الفواتير', en: 'Invoices' } },
  { key: 'project-costs', icon: DollarSign, label: { ar: 'التكاليف', en: 'Costs' } },
  { key: 'project-collections', icon: CreditCard, label: { ar: 'التحصيلات', en: 'Collections' } },
  { key: 'project-boq', icon: Layers, label: { ar: 'BOQ', en: 'BOQ' } },
  { key: 'project-documents', icon: FolderOpen, label: { ar: 'الوثائق', en: 'Documents' } },
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
        {Array.from({ length: 8 }).map((_, i) => (
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
        <ShieldAlert className="size-10 text-rose-500" />
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

          {project.location && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{project.location}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t('قيمة العقد', 'Contract Value', lang)}</span>
            <span className="text-sm font-bold text-emerald-700">
              <MoneyDisplay value={project.contractValue} mode="system" lang={lang} bold size="sm" />
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('نسبة الإنجاز', 'Completion', lang)}</span>
              <span className="font-semibold text-gray-700">{completion}%</span>
            </div>
            <Progress value={completion} className={`h-2 ${progressColor}`} />
          </div>

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

  const totalContractValue = projects.reduce((s, p) => s + (p.contractValue ?? 0), 0)
  const activeCount = projects.filter(p => p.status === 'ACTIVE').length

  const handleSelectProject = (id: string) => {
    selectProject(id)
    setActiveSubModule('project-overview')
  }

  if (isLoading) return <ProjectListSkeleton />
  if (isError) return <ErrorState onRetry={() => refetch()} lang={lang} />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('المشاريع', 'Projects', lang)}</h1>
          <p className="text-sm text-muted-foreground">{t('إدارة ومتابعة مشاريع المقاولات', 'Manage and track construction projects', lang)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="size-4" />{t('مشروع جديد', 'New Project', lang)}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100"><Building2 className="size-5 text-emerald-600" /></div><div><p className="text-xs text-muted-foreground">{t('إجمالي المشاريع', 'Total Projects', lang)}</p><p className="text-xl font-bold">{formatNumber(projects.length)}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-teal-100"><Activity className="size-5 text-teal-600" /></div><div><p className="text-xs text-muted-foreground">{t('المشاريع النشطة', 'Active Projects', lang)}</p><p className="text-xl font-bold">{formatNumber(activeCount)}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-amber-100"><DollarSign className="size-5 text-amber-600" /></div><div><p className="text-xs text-muted-foreground">{t('إجمالي العقود', 'Total Contracts', lang)}</p><p className="text-lg font-bold"><MoneyDisplay value={totalContractValue} mode="system" lang={lang} bold size="sm" /></p></div></div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t('بحث بالاسم أو الكود أو العميل...', 'Search by name, code or client...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('كل الحالات', 'All Statuses', lang)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الحالات', 'All Statuses', lang)}</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v[lang]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <Building2 className="size-8 text-gray-400" />
            <p className="text-lg font-semibold text-gray-700">{t('لا توجد مشاريع', 'No Projects Found', lang)}</p>
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4" />{t('مشروع جديد', 'New Project', lang)}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(project => <ProjectCard key={project.id} project={project} lang={lang} onClick={() => handleSelectProject(project.id)} />)}
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

  // Fetch sales invoices for this project
  const { data: invoices = [] } = useQuery<SalesInvoiceItem[]>({
    queryKey: ['project-invoices', selectedProjectId],
    queryFn: async () => {
      const res = await fetch(`/api/sales-invoices?projectId=${selectedProjectId}`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!selectedProjectId && activeSubModule === 'project-invoices',
  })

  // Fetch client payments for this project's invoices
  const { data: payments = [] } = useQuery<ClientPaymentItem[]>({
    queryKey: ['project-payments', selectedProjectId],
    queryFn: async () => {
      const res = await fetch(`/api/client-payments?projectId=${selectedProjectId}`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!selectedProjectId && activeSubModule === 'project-collections',
  })

  const handleBack = () => {
    selectProject(null)
    setActiveSubModule('project-list')
  }

  if (isLoading) return <DetailSkeleton />
  if (isError || !project) return <ErrorState onRetry={() => refetch()} lang={lang} />

  const completion = getActualCompletion(project.costSheet)
  const statusLabel = statusLabels[project.status]?.[lang] || project.status

  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'project-overview':
        return <OverviewTab project={project} completion={completion} invoices={invoices} payments={payments} lang={lang} />
      case 'project-contracts':
        return <ContractsTab project={project} lang={lang} />
      case 'project-extracts':
        return <ExtractsTab project={project} lang={lang} />
      case 'project-invoices':
        return <InvoicesTab invoices={invoices} lang={lang} />
      case 'project-costs':
        return <CostsTab project={project} lang={lang} />
      case 'project-collections':
        return <CollectionsTab payments={payments} lang={lang} />
      case 'project-boq':
        return <BOQTab project={project} lang={lang} />
      case 'project-documents':
        return <DocumentsPlaceholder lang={lang} />
      default:
        return <OverviewTab project={project} completion={completion} invoices={invoices} payments={payments} lang={lang} />
    }
  }

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="outline" size="icon" onClick={handleBack} className="shrink-0">
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 truncate">{project.name}</h2>
            <Badge variant="outline" className={statusColors[project.status]}>{statusLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {project.code} — {project.client.name}{project.location && ` — ${project.location}`}
          </p>
        </div>
      </div>

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

function OverviewTab({ project, completion, invoices, payments, lang }: {
  project: ProjectDetail; completion: number; invoices: SalesInvoiceItem[]; payments: ClientPaymentItem[]; lang: Lang
}) {
  const cs = project.costSheet
  const isProfit = cs.profit >= 0
  const totalInvoiced = invoices.reduce((s, i) => s + (i.totalAmount ?? 0), 0)
  const totalCollected = payments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const totalRemaining = totalInvoiced - totalCollected

  return (
    <div className="space-y-6">
      {/* Financial Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: t('قيمة العقد', 'Contract', lang), value: cs.contractValue, color: 'text-emerald-700', bg: 'bg-emerald-100' },
          { label: t('المفوتر', 'Invoiced', lang), value: totalInvoiced, color: 'text-sky-700', bg: 'bg-sky-100' },
          { label: t('المحصل', 'Collected', lang), value: totalCollected, color: 'text-teal-700', bg: 'bg-teal-100' },
          { label: t('المتبقي', 'Remaining', lang), value: Math.max(totalRemaining, 0), color: 'text-amber-700', bg: 'bg-amber-100' },
          { label: t('التكاليف', 'Costs', lang), value: cs.totalCosts, color: 'text-rose-700', bg: 'bg-rose-100' },
          { label: t('الربح', 'Profit', lang), value: cs.profit, color: isProfit ? 'text-emerald-700' : 'text-rose-700', bg: isProfit ? 'bg-emerald-100' : 'bg-rose-100' },
        ].map(kpi => (
          <Card key={kpi.label} className="overflow-hidden">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={`text-sm font-bold ${kpi.color}`}>
                <MoneyDisplay value={kpi.value} mode="system" lang={lang} bold size="sm" />
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Workflow Visual: Contract → Extract → Invoice → Collection */}
      <Card className="border-emerald-200 bg-gradient-to-l from-emerald-50 to-teal-50">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-emerald-700 mb-3">{t('دورة العمل: عقد ← مستخلص ← فاتورة ← تحصيل', 'Workflow: Contract → Extract → Invoice → Collection', lang)}</p>
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            {[
              { label: t('العقود', 'Contracts', lang), count: project.contracts.length, icon: FileText, color: 'text-emerald-600' },
              { label: t('المستخلصات', 'Extracts', lang), count: project.progressClaims.length, icon: Receipt, color: 'text-sky-600' },
              { label: t('الفواتير', 'Invoices', lang), count: invoices.length, icon: FileText, color: 'text-purple-600' },
              { label: t('التحصيلات', 'Collections', lang), count: payments.length, icon: CreditCard, color: 'text-teal-600' },
            ].map((step, idx) => (
              <React.Fragment key={step.label}>
                <div className="flex flex-col items-center gap-1 min-w-[70px]">
                  <div className={`flex size-10 items-center justify-center rounded-full bg-white shadow-sm ${step.color}`}>
                    <step.icon className="size-5" />
                  </div>
                  <span className="text-xs font-medium text-gray-700">{step.count}</span>
                  <span className="text-[10px] text-muted-foreground">{step.label}</span>
                </div>
                {idx < 3 && <ArrowRight className="size-4 text-emerald-400 shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Completion & Project Info Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Target className="size-4 text-emerald-600" />{t('نسبة الإنجاز', 'Completion', lang)}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="relative flex size-28 shrink-0 items-center justify-center">
                <svg className="size-28 -rotate-90" viewBox="0 0 36 36">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={completion >= 100 ? '#14b8a6' : '#10b981'} strokeWidth="2.5" strokeDasharray={`${completion}, 100`} strokeLinecap="round" />
                </svg>
                <span className="absolute text-2xl font-bold text-gray-800">{completion}%</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('المستخلصات', 'Claims', lang)}</span><span className="font-medium">{formatNumber(project.progressClaims.length)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('العقود', 'Contracts', lang)}</span><span className="font-medium">{formatNumber(project.contracts.length)}</span></div>
                <Separator className="my-1" />
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t('هامش الربح', 'Profit Margin', lang)}</span><span className={`font-bold ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>{Math.abs(cs.profitMargin ?? 0).toFixed(2)}%</span></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Building2 className="size-4 text-emerald-600" />{t('معلومات المشروع', 'Project Information', lang)}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">{t('الكود', 'Code', lang)}</p><p className="font-medium">{project.code}</p></div>
              <div><p className="text-xs text-muted-foreground">{t('العميل', 'Client', lang)}</p><p className="font-medium">{project.client.name}</p></div>
              <div><p className="text-xs text-muted-foreground">{t('الموقع', 'Location', lang)}</p><p className="font-medium">{project.location || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">{t('تاريخ البدء', 'Start Date', lang)}</p><p className="font-medium">{formatDate(project.startDate, lang)}</p></div>
              {project.description && <div className="col-span-2"><p className="text-xs text-muted-foreground">{t('الوصف', 'Description', lang)}</p><p className="font-medium text-gray-700">{project.description}</p></div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="size-4 text-emerald-600" />{t('ملخص التكاليف', 'Cost Summary', lang)}</CardTitle></CardHeader>
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
                      <span className="font-medium"><MoneyDisplay value={item.value} mode="system" lang={lang} size="sm" /></span>
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
              <span className="text-rose-700"><MoneyDisplay value={cs.totalCosts} mode="system" lang={lang} bold size="md" /></span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ CONTRACTS TAB ============

function ContractsTab({ project, lang }: { project: ProjectDetail; lang: Lang }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('عدد العقود', 'Total Contracts', lang)}</p><p className="text-2xl font-bold">{project.contracts.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('إجمالي القيمة', 'Total Value', lang)}</p><p className="text-lg font-bold text-emerald-700"><MoneyDisplay value={project.contracts.reduce((s, c) => s + (c.totalValue ?? 0), 0)} mode="system" lang={lang} bold size="sm" /></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('العقود النشطة', 'Active Contracts', lang)}</p><p className="text-2xl font-bold text-emerald-700">{project.contracts.filter(c => c.status === 'ACTIVE').length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="size-4 text-emerald-600" />{t('العقود', 'Contracts', lang)}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          {project.contracts.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('رقم العقد', 'Contract No.', lang)}</TableHead>
                    <TableHead className="text-right">{t('القيمة', 'Value', lang)}</TableHead>
                    <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
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
                      <TableCell><Badge variant="outline" className={contractStatusColors[c.status]}>{contractStatusLabels[c.status]?.[lang] || c.status}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{c.progressClaims?.length || 0}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8"><FileText className="size-8 text-gray-300" /><p className="text-sm text-muted-foreground">{t('لا توجد عقود', 'No contracts', lang)}</p></div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ EXTRACTS TAB ============

function ExtractsTab({ project, lang }: { project: ProjectDetail; lang: Lang }) {
  const totalAmount = project.progressClaims.reduce((s, c) => s + (c.totalAmount ?? 0), 0)
  const invoicedCount = project.progressClaims.filter(c => c.invoiced).length
  const uninvoicedCount = project.progressClaims.filter(c => !c.invoiced && c.status === 'APPROVED').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('عدد المستخلصات', 'Total Claims', lang)}</p><p className="text-2xl font-bold">{project.progressClaims.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('إجمالي المبلغ', 'Total Amount', lang)}</p><p className="text-lg font-bold text-emerald-700"><MoneyDisplay value={totalAmount} mode="system" lang={lang} bold size="sm" /></p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('مفوتر', 'Invoiced', lang)}</p><p className="text-2xl font-bold text-sky-700">{invoicedCount}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('غير مفوتر', 'Uninvoiced', lang)}</p><p className="text-2xl font-bold text-amber-700">{uninvoicedCount}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Receipt className="size-4 text-emerald-600" />{t('مستخلصات المشروع', 'Project Extracts', lang)}</CardTitle></CardHeader>
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
                    <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                    <TableHead className="text-right">{t('مفوتر؟', 'Invoiced?', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.progressClaims.map(cl => (
                    <TableRow key={cl.id}>
                      <TableCell className="font-medium">{cl.claimNo}</TableCell>
                      <TableCell>{cl.contract.contractNo}</TableCell>
                      <TableCell>{formatDate(cl.date, lang)}</TableCell>
                      <TableCell>{cl.percentage}%</TableCell>
                      <TableCell><MoneyDisplay value={cl.amount} lang={lang} size="sm" inline /></TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={cl.totalAmount} lang={lang} size="sm" inline bold /></TableCell>
                      <TableCell><Badge variant="outline" className={claimStatusColors[cl.status]}>{claimStatusLabels[cl.status]?.[lang] || cl.status}</Badge></TableCell>
                      <TableCell>
                        {cl.invoiced ? (
                          <Badge className="bg-sky-100 text-sky-700 border-sky-200">{t('نعم', 'Yes', lang)}</Badge>
                        ) : cl.status === 'APPROVED' ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200">{t('لا', 'No', lang)}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8"><Receipt className="size-8 text-gray-300" /><p className="text-sm text-muted-foreground">{t('لا توجد مستخلصات', 'No claims', lang)}</p></div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ INVOICES TAB ============

function InvoicesTab({ invoices, lang }: { invoices: SalesInvoiceItem[]; lang: Lang }) {
  const totalInvoiced = invoices.reduce((s, i) => s + (i.totalAmount ?? 0), 0)
  const totalPaid = invoices.reduce((s, i) => s + (i.paidAmount ?? 0), 0)
  const totalRemaining = totalInvoiced - totalPaid

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('إجمالي الفواتير', 'Total Invoiced', lang)}</p><MoneyDisplay value={totalInvoiced} lang={lang} size="xl" bold className="text-emerald-700" /></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('المحصل', 'Collected', lang)}</p><MoneyDisplay value={totalPaid} lang={lang} size="xl" bold className="text-teal-700" /></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('المتبقي', 'Remaining', lang)}</p><MoneyDisplay value={Math.max(totalRemaining, 0)} lang={lang} size="xl" bold className="text-amber-700" /></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="size-4 text-emerald-600" />{t('فواتير المبيعات', 'Sales Invoices', lang)}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          {invoices.length > 0 ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No.', lang)}</TableHead>
                    <TableHead className="text-right">{t('المستخلص', 'Extract', lang)}</TableHead>
                    <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                    <TableHead className="text-right">{t('المدفوع', 'Paid', lang)}</TableHead>
                    <TableHead className="text-right">{t('المتبقي', 'Remaining', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                    <TableHead className="text-right">{t('قيد', 'JE', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(inv => {
                    const remaining = inv.totalAmount - inv.paidAmount
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.invoiceNo}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{inv.progressClaim?.claimNo || '—'}</TableCell>
                        <TableCell>{formatDate(inv.date, lang)}</TableCell>
                        <TableCell className="font-semibold"><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" inline bold /></TableCell>
                        <TableCell><MoneyDisplay value={inv.paidAmount} lang={lang} size="sm" inline /></TableCell>
                        <TableCell className={remaining > 0 ? 'text-amber-700 font-medium' : 'text-emerald-700'}>
                          <MoneyDisplay value={remaining} lang={lang} size="sm" inline bold />
                        </TableCell>
                        <TableCell><Badge variant="outline" className={invoiceStatusColors[inv.status] || ''}>{invoiceStatusLabels[inv.status]?.[lang] || inv.status}</Badge></TableCell>
                        <TableCell>
                          {inv.journalEntryId ? (
                            <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">JE</Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8"><FileText className="size-8 text-gray-300" /><p className="text-sm text-muted-foreground">{t('لا توجد فواتير', 'No invoices', lang)}</p></div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ COSTS TAB ============

function CostsTab({ project, lang }: { project: ProjectDetail; lang: Lang }) {
  const cs = project.costSheet
  const isProfit = cs.profit >= 0
  const budgetVariance = cs.contractValue - cs.totalCosts
  const budgetVariancePct = cs.contractValue > 0 ? ((budgetVariance / cs.contractValue) * 100) : 0

  const costRows = [
    { label: t('المشتريات', 'Purchases', lang), value: cs.purchases, color: 'text-rose-600' },
    { label: t('مصروفات المشروع', 'Project Expenses', lang), value: cs.expenses, color: 'text-rose-600' },
    { label: t('مقاولو الباطن', 'Subcontractors', lang), value: cs.subcontractors, color: 'text-orange-600' },
    { label: t('تكاليف العمالة', 'Labor Costs', lang), value: cs.labor, color: 'text-amber-600' },
    { label: t('تكاليف المعدات', 'Equipment Costs', lang), value: cs.equipment, color: 'text-cyan-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('قيمة العقد', 'Contract Value', lang)}</p><p className="text-lg font-bold text-emerald-700"><MoneyDisplay value={cs.contractValue} mode="system" lang={lang} bold size="sm" /></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('التكاليف الفعلية', 'Actual Costs', lang)}</p><p className="text-lg font-bold text-rose-700"><MoneyDisplay value={cs.totalCosts} mode="system" lang={lang} bold size="sm" /></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('الفرق', 'Variance', lang)}</p><p className={`text-lg font-bold ${budgetVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}><MoneyDisplay value={budgetVariance} mode="system" lang={lang} bold size="sm" /></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('نسبة الفرق', 'Variance %', lang)}</p><p className={`text-lg font-bold ${budgetVariancePct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{budgetVariancePct >= 0 ? '+' : ''}{(budgetVariancePct ?? 0).toFixed(2)}%</p></CardContent></Card>
      </div>

      {/* Project Card */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-700 to-emerald-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-white/20"><Calculator className="size-5 text-white" /></div>
            <div><h3 className="text-lg font-bold text-white">{t('كرت المشروع', 'Project Card')}</h3><p className="text-sm text-emerald-200">{project.name}</p></div>
          </div>
        </div>
        <div className="border-x border-b border-gray-200">
          <div className="px-6 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-3">{t('الإيرادات', 'Revenue')}</p>
            <div className="flex items-center justify-between py-2.5"><span className="text-sm font-medium text-gray-700">{t('قيمة العقد', 'Contract Value')}</span><span className="text-emerald-700"><MoneyDisplay value={cs.contractValue} mode="system" lang={lang} bold size="md" /></span></div>
            <div className="flex items-center justify-between py-2.5 border-t border-dashed border-gray-100"><span className="text-sm font-medium text-gray-700">{t('المستخلصات', 'Progress Claims')}</span><span className="text-emerald-600"><MoneyDisplay value={cs.revenue} mode="system" lang={lang} bold size="md" /></span></div>
          </div>
          <div className="mx-6 border-t-2 border-emerald-200" />
          <div className="px-6 pt-3 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 mb-3">{t('التكاليف', 'Costs')}</p>
            {costRows.map((row, idx) => (
              <div key={idx} className={`flex items-center justify-between py-2.5 ${idx < costRows.length - 1 ? 'border-b border-dashed border-gray-100' : ''}`}>
                <span className="text-sm font-medium text-gray-700">{row.label}</span>
                <span className={row.color}><MoneyDisplay value={row.value} mode="system" lang={lang} bold size="md" /></span>
              </div>
            ))}
          </div>
          <div className="mx-6 border-t-2 border-rose-200" />
          <div className="px-6 py-3 bg-rose-50/50">
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-gray-800">{t('إجمالي التكلفة', 'Total Cost')}</span><span className="text-rose-700"><MoneyDisplay value={cs.totalCosts} mode="system" lang={lang} bold size="lg" /></span></div>
          </div>
          <div className="mx-6 border-t-2 border-gray-200" />
          <div className={`px-6 py-4 ${isProfit ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex size-10 items-center justify-center rounded-full ${isProfit ? 'bg-emerald-100' : 'bg-rose-100'}`}><TrendingUp className={`size-5 ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`} /></div>
                <div><p className="text-sm font-bold text-gray-800">{t('الربح', 'Profit')}</p><span className={isProfit ? 'text-emerald-600' : 'text-rose-600'}><MoneyDisplay value={cs.profit} mode="system" lang={lang} bold size="xl" /></span></div>
              </div>
              <div className={`text-center rounded-xl px-5 py-3 ${isProfit ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                <p className="text-xs font-medium text-gray-500 mb-1">{t('هامش الربح', 'Profit Margin')}</p>
                <p className={`text-3xl font-bold ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>{Math.abs(cs.profitMargin ?? 0).toFixed(2)}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ COLLECTIONS TAB ============

function CollectionsTab({ payments, lang }: { payments: ClientPaymentItem[]; lang: Lang }) {
  const totalCollected = payments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const treasuryTotal = payments.filter(p => p.receivedIn === 'TREASURY').reduce((s, p) => s + (p.amount ?? 0), 0)
  const bankTotal = payments.filter(p => p.receivedIn === 'BANK').reduce((s, p) => s + (p.amount ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('إجمالي التحصيلات', 'Total Collected', lang)}</p><MoneyDisplay value={totalCollected} lang={lang} size="xl" bold className="text-emerald-700" /></CardContent></Card>
        <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('الخزينة', 'Treasury', lang)}</p><MoneyDisplay value={treasuryTotal} lang={lang} size="xl" bold className="text-amber-700" /></CardContent></Card>
        <Card className="bg-sky-50 border-sky-200"><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('البنك', 'Bank', lang)}</p><MoneyDisplay value={bankTotal} lang={lang} size="xl" bold className="text-sky-700" /></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="size-4 text-emerald-600" />{t('تحصيلات المشروع', 'Project Collections', lang)}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          {payments.length > 0 ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                    <TableHead className="text-right">{t('الفاتورة', 'Invoice', lang)}</TableHead>
                    <TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead>
                    <TableHead className="text-right">{t('التحصيل في', 'Received In', lang)}</TableHead>
                    <TableHead className="text-right">{t('المرجع', 'Reference', lang)}</TableHead>
                    <TableHead className="text-right">{t('قيد', 'JE', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.date, lang)}</TableCell>
                      <TableCell className="font-medium">{p.invoice?.invoiceNo || '—'}</TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={p.amount} lang={lang} size="sm" inline bold /></TableCell>
                      <TableCell><Badge variant="outline" className={`text-[10px] ${receivedInColors[p.receivedIn] || ''}`}>{receivedInLabels[p.receivedIn]?.[lang] || p.receivedIn}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.reference || '—'}</TableCell>
                      <TableCell>
                        {p.journalEntryId ? <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">JE</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8"><CreditCard className="size-8 text-gray-300" /><p className="text-sm text-muted-foreground">{t('لا توجد تحصيلات', 'No collections', lang)}</p></div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ BOQ TAB ============

function BOQTab({ project, lang }: { project: ProjectDetail; lang: Lang }) {
  const totalBOQ = project.boqItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('عدد البنود', 'Total Items', lang)}</p><p className="text-2xl font-bold">{formatNumber(project.boqItems.length)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('إجمالي BOQ', 'BOQ Total', lang)}</p><p className="text-lg font-bold text-emerald-700"><MoneyDisplay value={totalBOQ} mode="system" lang={lang} bold size="sm" /></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('قيمة العقد', 'Contract Value', lang)}</p><p className="text-lg font-bold text-teal-700"><MoneyDisplay value={project.contractValue} mode="system" lang={lang} bold size="sm" /></p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Layers className="size-4 text-emerald-600" />{t('جدول الكميات', 'Bill of Quantities', lang)}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          {project.boqItems.length > 0 ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead><TableHead className="text-right">{t('الوحدة', 'Unit', lang)}</TableHead><TableHead className="text-right">{t('الكمية', 'Qty', lang)}</TableHead><TableHead className="text-right">{t('سعر الوحدة', 'Unit Price', lang)}</TableHead><TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(() => {
                    let currentCategory = ''
                    const rows: React.ReactNode[] = []
                    project.boqItems.forEach((item, idx) => {
                      if (item.category && item.category !== currentCategory) {
                        currentCategory = item.category
                        rows.push(<TableRow key={`cat-${idx}`} className="bg-emerald-50"><TableCell colSpan={6} className="font-bold text-emerald-700">{currentCategory}</TableCell></TableRow>)
                      }
                      rows.push(<TableRow key={item.id}><TableCell className="font-medium">{item.code}</TableCell><TableCell>{item.description}</TableCell><TableCell>{item.unit}</TableCell><TableCell>{formatNumber(item.quantity)}</TableCell><TableCell>{formatSAR(item.unitPrice, lang)}</TableCell><TableCell className="font-semibold">{formatSAR(item.totalPrice, lang)}</TableCell></TableRow>)
                    })
                    rows.push(<TableRow key="total" className="bg-gray-50 font-bold"><TableCell colSpan={5} className="text-left">{t('الإجمالي', 'Total', lang)}</TableCell><TableCell>{formatSAR(totalBOQ, lang)}</TableCell></TableRow>)
                    return rows
                  })()}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8"><Layers className="size-8 text-gray-300" /><p className="text-sm text-muted-foreground">{t('لا توجد بنود', 'No BOQ items', lang)}</p></div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ DOCUMENTS PLACEHOLDER ============

function DocumentsPlaceholder({ lang }: { lang: Lang }) {
  return (
    <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50">
      <CardContent className="flex flex-col items-center gap-4 py-16">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-gray-100"><FolderOpen className="size-8 text-gray-400" /></div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-gray-700">{t('الوثائق', 'Documents', lang)}</h3>
          <p className="text-sm text-muted-foreground max-w-md">{t('المخططات، العقود، الملفات والمستندات المرتبطة بالمشروع', 'Drawings, contracts, files and documents associated with the project', lang)}</p>
        </div>
        <Badge variant="outline" className="text-gray-500 border-gray-300">{t('قريباً', 'Coming Soon', lang)}</Badge>
      </CardContent>
    </Card>
  )
}

// ============ MAIN EXPORT ============

export function ProjectsSection() {
  const { activeSubModule, selectedProjectId } = useAppStore()

  if (!selectedProjectId || activeSubModule === 'project-list') {
    return <ProjectListView />
  }

  return <ProjectDetailView />
}

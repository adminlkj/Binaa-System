'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TrendingUp, Plus, Search, RefreshCw, Eye, ArrowRight, Send, CheckCircle2, Trash2,
  FileText, CreditCard, Link2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout, StatusBadge } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { useAppStore, formatSAR, formatDate, formatNumber, commonText, type Lang } from '@/stores/app-store'

// ============ Types ============
interface ProjectSummary { id: string; name: string; code: string; nameAr?: string | null }
interface ContractSummary { id: string; contractNo: string; totalValue: number; value: number }
interface SalesInvoiceSummary { id: string; invoiceNo: string; status: string; totalAmount: number }

interface ClaimItem {
  id: string; claimNo: string; date: string; percentage: number
  amount: number; vatRate: number; vatAmount: number; totalAmount: number
  status: string; approvedDate: string | null; notes: string | null
  projectId: string; contractId: string; invoiced: boolean; journalEntryId: string | null
  project: ProjectSummary
  contract: ContractSummary
  salesInvoice?: SalesInvoiceSummary | null
}

interface ClaimFormData {
  projectId: string; contractId: string; claimNo: string; date: string
  percentage: string; amount: string; vatRate: string; status: string; notes: string
}

// ============ Labels ============
const labels = {
  title: { ar: 'المستخلصات', en: 'Progress Claims' },
  subtitle: { ar: 'متابعة مستخلصات المشاريع والعقود', en: 'Track project and contract claims' },
  claimNo: { ar: 'رقم المستخلص', en: 'Claim No.' },
  project: { ar: 'المشروع', en: 'Project' },
  contract: { ar: 'العقد', en: 'Contract' },
  date: { ar: 'التاريخ', en: 'Date' },
  percentage: { ar: 'نسبة الإنجاز', en: 'Completion %' },
  amount: { ar: 'المبلغ', en: 'Amount' },
  vat: { ar: 'الضريبة', en: 'VAT' },
  total: { ar: 'الإجمالي', en: 'Total' },
  status: { ar: 'الحالة', en: 'Status' },
  actions: { ar: 'الإجراءات', en: 'Actions' },
  newClaim: { ar: 'مستخلص جديد', en: 'New Claim' },
  search: { ar: 'بحث برقم المستخلص أو المشروع...', en: 'Search by claim no. or project...' },
  allStatus: { ar: 'كل الحالات', en: 'All Status' },
  allProjects: { ar: 'كل المشاريع', en: 'All Projects' },
  totalClaimed: { ar: 'إجمالي المستخلصات', en: 'Total Claimed' },
  collected: { ar: 'المحصل', en: 'Collected' },
  pending: { ar: 'قيد التحصيل', en: 'Pending Collection' },
  contractValue: { ar: 'قيمة العقد', en: 'Contract Value' },
  claimedAmount: { ar: 'المستخلص', en: 'Claimed' },
  completion: { ar: 'نسبة الإنجاز', en: 'Completion' },
  contractRunningTotals: { ar: 'إجمالي المستخلصات حسب العقد', en: 'Claims by Contract' },
  selectProject: { ar: 'اختر المشروع أولاً', en: 'Select project first' },
  deleteTitle: { ar: 'حذف المستخلص', en: 'Delete Claim' },
  deleteConfirm: { ar: 'هل أنت متأكد من حذف هذا المستخلص؟', en: 'Are you sure you want to delete this claim?' },
  noClaims: { ar: 'لا توجد مستخلصات', en: 'No claims found' },
  submit: { ar: 'تقديم', en: 'Submit' },
  approve: { ar: 'اعتماد', en: 'Approve' },
  exceedWarning: { ar: 'تحذير: النسبة التراكمية تتجاوز 100%', en: 'Warning: Cumulative percentage exceeds 100%' },
  cumulativePercentage: { ar: 'النسبة التراكمية', en: 'Cumulative %' },
  invoiced: { ar: 'مفوتر', en: 'Invoiced' },
  notInvoiced: { ar: 'غير مفوتر', en: 'Not Invoiced' },
  createInvoice: { ar: 'إنشاء فاتورة', en: 'Create Invoice' },
  linkedInvoice: { ar: 'الفاتورة المرتبطة', en: 'Linked Invoice' },
  accountingEntry: { ar: 'القيد المحاسبي', en: 'Accounting Entry' },
}

const defaultForm: ClaimFormData = {
  projectId: '', contractId: '', claimNo: '', date: '',
  percentage: '', amount: '', vatRate: '0.15', status: 'DRAFT', notes: '',
}

// ============ View State ============
type ViewState = { type: 'list' } | { type: 'create' } | { type: 'detail'; claimId: string }

// ============ Skeleton ============
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Create Claim Page ============
function CreateClaimPage({
  projects, existingClaims, onBack,
}: {
  projects: ProjectSummary[]; existingClaims: ClaimItem[]; onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [form, setForm] = useState<ClaimFormData>(defaultForm)

  const { data: projectContracts = [] } = useQuery<ContractSummary[]>({
    queryKey: ['contracts-for-project', form.projectId],
    queryFn: async () => {
      if (!form.projectId) return []
      const res = await fetch(`/api/contracts?projectId=${form.projectId}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.map((c: { id: string; contractNo: string; totalValue: number; value: number }) => ({
        id: c.id, contractNo: c.contractNo, totalValue: c.totalValue, value: c.value,
      }))
    },
    enabled: !!form.projectId,
  })

  const selectedContract = projectContracts.find(c => c.id === form.contractId)
  const pct = parseFloat(form.percentage) || 0
  const contractValueExVat = selectedContract ? selectedContract.value || (selectedContract.totalValue / 1.15) : 0
  const autoAmount = contractValueExVat > 0 ? Math.round(contractValueExVat * pct / 100 * 100) / 100 : 0

  const existingClaimsForContract = existingClaims.filter(c => c.contractId === form.contractId)
  const existingPercentage = existingClaimsForContract.reduce((s, c) => s + c.percentage, 0)
  const cumulativePercentage = existingPercentage + pct
  const exceeds100 = cumulativePercentage > 100

  React.useEffect(() => {
    if (autoAmount > 0) {
      setForm(f => ({ ...f, amount: autoAmount.toString() }))
    }
  }, [autoAmount, form.percentage, form.contractId])

  const val = parseFloat(form.amount) || 0
  const rate = parseFloat(form.vatRate) || 0
  const vatAmt = Math.round(val * rate * 100) / 100
  const totalAmt = Math.round((val + vatAmt) * 100) / 100

  const createMutation = useMutation({
    mutationFn: (data: ClaimFormData) =>
      fetch('/api/progress-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          percentage: parseFloat(data.percentage) || 0,
          amount: parseFloat(data.amount) || 0,
          vatRate: parseFloat(data.vatRate) || 0.15,
        }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress-claims'] })
      onBack()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (exceeds100) return
    createMutation.mutate(form)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t('مستخلص جديد', 'New Progress Claim')}</h1>
          <p className="text-sm text-muted-foreground">{t('إضافة مستخلص جديد للعقد', 'Add a new progress claim for a contract')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-lg">{t('بيانات العقد', 'Contract Information')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.project.ar, labels.project.en)} *</Label>
                <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v, contractId: '' }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر المشروع', 'Select project')} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.contract.ar, labels.contract.en)} *</Label>
                <Select value={form.contractId} onValueChange={v => setForm(f => ({ ...f, contractId: v }))} disabled={!form.projectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={form.projectId ? t('اختر العقد', 'Select contract') : t(labels.selectProject.ar, labels.selectProject.en)} /></SelectTrigger>
                  <SelectContent>
                    {projectContracts.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.contractNo} — <MoneyDisplay value={c.totalValue} lang={lang} size="sm" inline /></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedContract && (
              <div className="p-3 rounded-lg border bg-emerald-50 text-sm">
                <div className="flex items-center gap-4 flex-wrap">
                  <span><span className="text-muted-foreground">{t(labels.contractValue.ar, labels.contractValue.en)}:</span> <MoneyDisplay value={selectedContract.totalValue} lang={lang} size="sm" inline bold /></span>
                  {existingPercentage > 0 && (
                    <span><span className="text-muted-foreground">{t('المستخلص سابقاً', 'Previously claimed')}:</span> {(existingPercentage ?? 0).toFixed(1)}%</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-lg">{t('بيانات المستخلص', 'Claim Details')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t(labels.claimNo.ar, labels.claimNo.en)} *</Label><Input value={form.claimNo} onChange={e => setForm(f => ({ ...f, claimNo: e.target.value }))} placeholder="CLM-001-01" required /></div>
              <div className="space-y-2"><Label>{t(labels.date.ar, labels.date.en)} *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required /></div>
              <div className="space-y-2">
                <Label>{t(labels.percentage.ar, labels.percentage.en)} (%) *</Label>
                <Input type="number" step="0.1" min="0" max="100" value={form.percentage} onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))} placeholder="0" required />
                {pct > 0 && (
                  <p className={`text-xs ${exceeds100 ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>
                    {t(labels.cumulativePercentage.ar, labels.cumulativePercentage.en)}: {(cumulativePercentage ?? 0).toFixed(1)}%
                    {exceeds100 && ` - ${t(labels.exceedWarning.ar, labels.exceedWarning.en)}`}
                  </p>
                )}
              </div>
              <div className="space-y-2"><Label>{t(labels.amount.ar, labels.amount.en)} (قبل الضريبة) *</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required /></div>
              <div className="space-y-2"><Label>{t('نسبة الضريبة', 'VAT Rate')}</Label><Input type="number" step="0.01" value={form.vatRate} onChange={e => setForm(f => ({ ...f, vatRate: e.target.value }))} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>{t('ملاحظات', 'Notes')}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t('ملاحظات', 'Notes')} rows={2} /></div>
            </div>
            {exceeds100 && (
              <Card className="bg-rose-50 border-rose-200"><CardContent className="p-4"><p className="text-rose-700 font-medium">{t(labels.exceedWarning.ar, labels.exceedWarning.en)}</p></CardContent></Card>
            )}
          </CardContent>
        </Card>

        {val > 0 && (
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div><p className="text-xs text-muted-foreground">{t('المبلغ', 'Amount')}</p><MoneyDisplay value={val} lang={lang} size="md" bold className="justify-center" /></div>
                <div><p className="text-xs text-muted-foreground">{t('الضريبة', 'VAT')} ({((rate ?? 0) * 100).toFixed(0)}%)</p><MoneyDisplay value={vatAmt} lang={lang} size="md" bold className="justify-center" /></div>
                <div><p className="text-xs text-muted-foreground">{t('الإجمالي', 'Total')}</p><MoneyDisplay value={totalAmt} lang={lang} size="lg" bold className="justify-center text-emerald-700" /></div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>{commonText.cancel[lang]}</Button>
          <Button type="submit" disabled={createMutation.isPending || exceeds100 || !form.projectId || !form.contractId || !form.claimNo || !form.date || !form.percentage} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('إنشاء', 'Create')}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Main Progress Claims Module ============
export function ProgressClaimsModule() {
  const { lang, setActiveItem } = useAppStore()
  const queryClient = useQueryClient()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })
  const [search, setSearch] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Fetch claims
  const { data: claims = [], isLoading, isError, refetch } = useQuery<ClaimItem[]>({
    queryKey: ['progress-claims', selectedProjectId],
    queryFn: async () => {
      const url = selectedProjectId === 'all' ? '/api/progress-claims' : `/api/progress-claims?projectId=${selectedProjectId}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch projects for filter
  const { data: projects = [] } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-for-claims'],
    queryFn: async () => {
      const res = await fetch('/api/projects/list')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/progress-claims/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress-claims'] })
      setDeleteId(null)
    },
  })

  // Status workflow mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/progress-claims/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress-claims'] })
    },
  })

  // Filter
  const filtered = claims.filter(c => {
    const matchSearch = !search || c.claimNo.includes(search) || c.project.name.includes(search) || c.contract.contractNo.includes(search)
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  // Compute running totals per contract
  const contractTotals = useMemo(() => {
    const acc: Record<string, { contractNo: string; totalValue: number; claimedAmount: number }> = {}
    for (const c of claims) {
      if (!acc[c.contractId]) {
        acc[c.contractId] = { contractNo: c.contract.contractNo, totalValue: c.contract.totalValue, claimedAmount: 0 }
      }
      acc[c.contractId] = { contractNo: acc[c.contractId].contractNo, totalValue: acc[c.contractId].totalValue, claimedAmount: acc[c.contractId].claimedAmount + c.amount }
    }
    const result: Record<string, { contractNo: string; totalValue: number; claimedAmount: number; claimedPercent: string }> = {}
    for (const [key, val] of Object.entries(acc)) {
      const contractValueExVat = val.totalValue > 0 ? val.totalValue / 1.15 : 0
      const claimedPercent = contractValueExVat > 0 ? (((val.claimedAmount ?? 0) / contractValueExVat) * 100).toFixed(1) : '0'
      result[key] = { contractNo: val.contractNo, totalValue: val.totalValue, claimedAmount: val.claimedAmount, claimedPercent }
    }
    return result
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
  }, [claims])

  const totalClaimedAmount = filtered.reduce((s, c) => s + (c.totalAmount ?? 0), 0)
  const paidAmount = filtered.filter(c => c.status === 'PAID' || c.status === 'PARTIALLY_PAID').reduce((s, c) => s + (c.totalAmount ?? 0), 0)
  const pendingAmount = filtered.filter(c => ['SUBMITTED', 'APPROVED'].includes(c.status)).reduce((s, c) => s + (c.totalAmount ?? 0), 0)

  // Counters
  const invoicedCount = filtered.filter(c => c.invoiced).length
  const uninvoicedApprovedCount = filtered.filter(c => !c.invoiced && c.status === 'APPROVED').length

  // ============ CREATE VIEW ============
  if (viewState.type === 'create') {
    return (
      <CreateClaimPage
        projects={projects}
        existingClaims={claims}
        onBack={() => setViewState({ type: 'list' })}
      />
    )
  }

  // ============ DETAIL VIEW ============
  if (viewState.type === 'detail') {
    const claim = claims.find(c => c.id === viewState.claimId)
    if (!claim) {
      return (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('لم يتم العثور على المستخلص', 'Claim not found')}</p>
          <Button variant="outline" onClick={() => setViewState({ type: 'list' })}>{t('العودة', 'Back')}</Button>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setViewState({ type: 'list' })}>
            <ArrowRight className="size-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">{claim.claimNo}</h2>
              <StatusBadge status={claim.status} lang={lang} />
              {claim.invoiced && (
                <Badge className="bg-sky-100 text-sky-700 border-sky-200">
                  <FileText className="size-3 ml-1" />
                  {t(labels.invoiced.ar, labels.invoiced.en)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{claim.project.name} - {claim.contract.contractNo}</p>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.project.ar, labels.project.en)}</p><p className="text-sm font-medium truncate">{claim.project.name}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.contract.ar, labels.contract.en)}</p><p className="text-sm font-medium">{claim.contract.contractNo}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.percentage.ar, labels.percentage.en)}</p><p className="text-sm font-medium">{claim.percentage}%</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.date.ar, labels.date.en)}</p><p className="text-sm font-medium">{formatDate(claim.date, lang)}</p></CardContent></Card>
        </div>

        {/* Financial Details */}
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('البيانات المالية', 'Financial Details')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span>{t('المبلغ قبل الضريبة', 'Amount before VAT')}</span><span className="font-medium"><MoneyDisplay value={claim.amount} lang={lang} size="sm" inline /></span></div>
            <div className="flex justify-between text-sm"><span>{t(labels.vat.ar, labels.vat.en)} ({((claim.vatRate ?? 0) * 100).toFixed(0)}%)</span><span className="font-medium"><MoneyDisplay value={claim.vatAmount} lang={lang} size="sm" inline /></span></div>
            <Separator />
            <div className="flex justify-between text-lg font-bold"><span>{t(labels.total.ar, labels.total.en)}</span><span className="text-emerald-700"><MoneyDisplay value={claim.totalAmount} lang={lang} size="lg" inline bold /></span></div>
          </CardContent>
        </Card>

        {claim.notes && (
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground mb-1">{t('ملاحظات', 'Notes')}</p><p className="text-sm">{claim.notes}</p></CardContent></Card>
        )}

        {/* Linked Sales Invoice */}
        {claim.invoiced && claim.salesInvoice ? (
          <Card className="border-sky-200 bg-sky-50/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="size-4 text-sky-600" />
                <span className="text-sm font-semibold text-sky-700">{t(labels.linkedInvoice.ar, labels.linkedInvoice.en)}</span>
              </div>
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-sky-500" />
                <div>
                  <p className="font-medium">{claim.salesInvoice.invoiceNo}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <MoneyDisplay value={claim.salesInvoice.totalAmount} lang={lang} size="sm" inline />
                    <StatusBadge status={claim.salesInvoice.status} lang={lang} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Create Invoice Button for APPROVED uninvoiced claims */}
        {!claim.invoiced && claim.status === 'APPROVED' && (
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-700">{t(labels.notInvoiced.ar, labels.notInvoiced.en)}</p>
                  <p className="text-xs text-muted-foreground">{t('يمكنك إنشاء فاتورة مبيعات من هذا المستخلص', 'You can create a sales invoice from this claim', lang)}</p>
                </div>
                <Button
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    // Navigate to sales module with extract pre-fill
                    setActiveItem('sales')
                  }}
                >
                  <FileText className="size-4" />
                  {t(labels.createInvoice.ar, labels.createInvoice.en)}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Accounting Entry */}
        {claim.journalEntryId && (
          <Card className="border-sky-200 bg-sky-50/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sky-700 mb-1">
                <CreditCard className="size-4" />
                <span className="text-sm font-semibold">{t(labels.accountingEntry.ar, labels.accountingEntry.en)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('تم إنشاء قيد محاسبي تلقائي', 'Auto journal entry created', lang)}</p>
              <p className="text-xs font-mono mt-0.5">{claim.journalEntryId}</p>
            </CardContent>
          </Card>
        )}

        {/* Status Workflow Actions */}
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold">{t('إجراءات:', 'Actions:')}</span>
              {claim.status === 'DRAFT' && (
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => statusMutation.mutate({ id: claim.id, status: 'SUBMITTED' })} disabled={statusMutation.isPending}>
                  <Send className="size-4" /> {t(labels.submit.ar, labels.submit.en)}
                </Button>
              )}
              {claim.status === 'SUBMITTED' && (
                <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => statusMutation.mutate({ id: claim.id, status: 'APPROVED' })} disabled={statusMutation.isPending}>
                  <CheckCircle2 className="size-4" /> {t(labels.approve.ar, labels.approve.en)}
                </Button>
              )}
              {(claim.status === 'APPROVED' || claim.status === 'PARTIALLY_PAID') && (
                <Button className="gap-2 bg-teal-600 hover:bg-teal-700" onClick={() => statusMutation.mutate({ id: claim.id, status: 'PAID' })} disabled={statusMutation.isPending}>
                  <CheckCircle2 className="size-4" /> {t('تأكيد الدفع', 'Mark Paid')}
                </Button>
              )}
              {claim.status === 'PAID' && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-sm px-3 py-1">
                  <CheckCircle2 className="size-4 ml-1" /> {t('مدفوع', 'Paid')}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ============ LIST VIEW ============
  return (
    <ModuleLayout
      title={labels.title}
      subtitle={labels.subtitle}
      actions={
        <>
          <PrintButton type="extract" size="icon" />
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
            <Plus className="size-4" /> {t(labels.newClaim.ar, labels.newClaim.en)}
          </Button>
        </>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.totalClaimed.ar, labels.totalClaimed.en)}</p><MoneyDisplay value={totalClaimedAmount} lang={lang} size="xl" bold className="text-emerald-700" /></CardContent></Card>
        <Card className="bg-teal-50 border-teal-200"><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.collected.ar, labels.collected.en)}</p><MoneyDisplay value={paidAmount} lang={lang} size="xl" bold className="text-teal-700" /></CardContent></Card>
        <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.pending.ar, labels.pending.en)}</p><MoneyDisplay value={pendingAmount} lang={lang} size="xl" bold className="text-amber-700" /></CardContent></Card>
      </div>

      {/* Invoice Status Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-sky-200 bg-sky-50/30"><CardContent className="p-3 flex items-center gap-3"><FileText className="size-5 text-sky-500" /><div><p className="text-xs text-muted-foreground">{t(labels.invoiced.ar, labels.invoiced.en)}</p><p className="text-lg font-bold text-sky-700">{invoicedCount}</p></div></CardContent></Card>
        <Card className="border-amber-200 bg-amber-50/30"><CardContent className="p-3 flex items-center gap-3"><TrendingUp className="size-5 text-amber-500" /><div><p className="text-xs text-muted-foreground">{t('معتمد غير مفوتر', 'Approved Uninvoiced', lang)}</p><p className="text-lg font-bold text-amber-700">{uninvoicedApprovedCount}</p></div></CardContent></Card>
      </div>

      {/* Contract Running Totals */}
      {Object.keys(contractTotals).length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg">{t(labels.contractRunningTotals.ar, labels.contractRunningTotals.en)}</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">{t('رقم العقد', 'Contract No.')}</TableHead><TableHead className="text-right">{t(labels.contractValue.ar, labels.contractValue.en)}</TableHead><TableHead className="text-right">{t(labels.claimedAmount.ar, labels.claimedAmount.en)}</TableHead><TableHead className="text-right">{t(labels.completion.ar, labels.completion.en)}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {Object.values(contractTotals).map(ct => (
                    <TableRow key={ct.contractNo}>
                      <TableCell className="font-medium">{ct.contractNo}</TableCell>
                      <TableCell><MoneyDisplay value={ct.totalValue} lang={lang} size="sm" inline /></TableCell>
                      <TableCell><MoneyDisplay value={ct.claimedAmount} lang={lang} size="sm" inline /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]"><div className={`rounded-full h-2 transition-all ${parseFloat(ct.claimedPercent) > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(parseFloat(ct.claimedPercent), 100)}%` }} /></div>
                          <span className="text-sm font-medium">{ct.claimedPercent}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder={t(labels.allProjects.ar, labels.allProjects.en)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(labels.allProjects.ar, labels.allProjects.en)}</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t(labels.search.ar, labels.search.en)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t(labels.allStatus.ar, labels.allStatus.en)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(labels.allStatus.ar, labels.allStatus.en)}</SelectItem>
                <SelectItem value="DRAFT">{t('مسودة', 'Draft')}</SelectItem>
                <SelectItem value="SUBMITTED">{t('مقدم', 'Submitted')}</SelectItem>
                <SelectItem value="APPROVED">{t('معتمد', 'Approved')}</SelectItem>
                <SelectItem value="PARTIALLY_PAID">{t('مدفوع جزئياً', 'Partially Paid')}</SelectItem>
                <SelectItem value="PAID">{t('مدفوع', 'Paid')}</SelectItem>
                <SelectItem value="REJECTED">{t('مرفوض', 'Rejected')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Claims Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{commonText.error[lang]}</p>
              <Button variant="outline" onClick={() => refetch()}>{commonText.retry[lang]}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <TrendingUp className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t(labels.noClaims.ar, labels.noClaims.en)}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
                <Plus className="size-4 mr-1" /> {t(labels.newClaim.ar, labels.newClaim.en)}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(labels.claimNo.ar, labels.claimNo.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.project.ar, labels.project.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.contract.ar, labels.contract.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.date.ar, labels.date.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.percentage.ar, labels.percentage.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.amount.ar, labels.amount.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.total.ar, labels.total.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.status.ar, labels.status.en)}</TableHead>
                    <TableHead className="text-right">{t('مفوتر؟', 'Invoiced?', lang)}</TableHead>
                    <TableHead className="text-right">{t(labels.actions.ar, labels.actions.en)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', claimId: c.id })}>
                      <TableCell className="font-medium">{c.claimNo}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{c.project.name}</TableCell>
                      <TableCell>{c.contract.contractNo}</TableCell>
                      <TableCell>{formatDate(c.date, lang)}</TableCell>
                      <TableCell>{c.percentage}%</TableCell>
                      <TableCell><MoneyDisplay value={c.amount} lang={lang} size="sm" inline /></TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={c.totalAmount} lang={lang} size="sm" inline bold /></TableCell>
                      <TableCell><StatusBadge status={c.status} lang={lang} /></TableCell>
                      <TableCell>
                        {c.invoiced ? (
                          <Badge className="bg-sky-100 text-sky-700 border-sky-200 text-[10px]">{t(labels.invoiced.ar, labels.invoiced.en)}</Badge>
                        ) : c.status === 'APPROVED' ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">{t(labels.notInvoiced.ar, labels.notInvoiced.en)}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <PrintButton type="extract" documentId={c.id} size="icon" />
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewState({ type: 'detail', claimId: c.id })} title={t('عرض', 'View')}>
                            <Eye className="size-4" />
                          </Button>
                          {c.status === 'DRAFT' && (
                            <Button variant="ghost" size="icon" className="size-8 text-rose-500" onClick={() => setDeleteId(c.id)} title={t('حذف', 'Delete')}>
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(labels.deleteTitle.ar, labels.deleteTitle.en)}</AlertDialogTitle>
            <AlertDialogDescription>{t(labels.deleteConfirm.ar, labels.deleteConfirm.en)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{commonText.cancel[lang]}</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {commonText.delete[lang]}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModuleLayout>
  )
}

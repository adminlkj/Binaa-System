'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw, Pencil, Trash2, Eye, ArrowRight, X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout, StatusBadge } from '@/components/shared/module-layout'
import { useAppStore, formatSAR, formatDate, formatNumber, commonText } from '@/stores/app-store'

// ============ Types ============
interface ClientOption { id: string; code: string; name: string; nameAr?: string | null }
interface ProjectOption { id: string; code: string; name: string; nameAr?: string | null; clientId?: string }
interface EquipmentOption { id: string; code: string; name: string; nameAr?: string | null; hourlyRate: number }

interface ContractItem {
  id: string
  contractNo: string
  date: string
  value: number
  vatRate: number
  vatAmount: number
  totalValue: number
  startDate: string
  endDate: string | null
  status: string
  description: string | null
  contractType: string | null
  clientId: string | null
  equipmentId: string | null
  hourlyRate: number | null
  deliveryFees: number
  deliveryFeesTaxable: boolean
  paymentTerms: string | null
  salesOrderNo: string | null
  project: { id: string; name: string; code: string; nameAr?: string | null }
  _count?: { progressClaims: number; timesheets: number }
}

interface ContractFormData {
  projectId: string
  clientId: string
  equipmentId: string
  contractNo: string
  salesOrderNo: string
  date: string
  value: string
  vatRate: string
  startDate: string
  endDate: string
  status: string
  description: string
  contractType: string
  hourlyRate: string
  deliveryFees: string
  deliveryFeesTaxable: boolean
  paymentTerms: string
}

// ============ Labels ============
const labels = {
  title: { ar: 'عقود التأجير', en: 'Rental Contracts' },
  subtitle: { ar: 'إدارة عقود تأجير المعدات والآليات', en: 'Manage equipment and machinery rental contracts' },
  contractNo: { ar: 'رقم العقد', en: 'Contract No.' },
  salesOrderNo: { ar: 'رقم طلب البيع', en: 'Sales Order No.' },
  client: { ar: 'العميل', en: 'Client' },
  project: { ar: 'المشروع', en: 'Project' },
  equipment: { ar: 'المعدة', en: 'Equipment' },
  contractType: { ar: 'نوع العقد', en: 'Contract Type' },
  hourlyRate: { ar: 'سعر الساعة', en: 'Hourly Rate' },
  deliveryFees: { ar: 'رسوم النقل', en: 'Delivery Fees' },
  deliveryFeesTaxable: { ar: 'رسوم النقل خاضعة للضريبة', en: 'Delivery Fees Taxable' },
  paymentTerms: { ar: 'شروط السداد', en: 'Payment Terms' },
  startDate: { ar: 'تاريخ البدء', en: 'Start Date' },
  endDate: { ar: 'تاريخ الانتهاء', en: 'End Date' },
  value: { ar: 'قيمة العقد', en: 'Contract Value' },
  vatAmount: { ar: 'الضريبة', en: 'VAT' },
  totalValue: { ar: 'الإجمالي', en: 'Total' },
  status: { ar: 'الحالة', en: 'Status' },
  date: { ar: 'التاريخ', en: 'Date' },
  description: { ar: 'الوصف', en: 'Description' },
  newContract: { ar: 'عقد جديد', en: 'New Contract' },
  editContract: { ar: 'تعديل العقد', en: 'Edit Contract' },
  search: { ar: 'بحث برقم العقد، المشروع...', en: 'Search by contract no., project...' },
  allStatus: { ar: 'كل الحالات', en: 'All Status' },
  totalContractValue: { ar: 'إجمالي قيمة العقود', en: 'Total Contract Value' },
  contractCount: { ar: 'عدد العقود', en: 'Contracts Count' },
  deleteConfirm: { ar: 'هل أنت متأكد من حذف هذا العقد؟', en: 'Are you sure you want to delete this contract?' },
  deleteTitle: { ar: 'حذف العقد', en: 'Delete Contract' },
  claims: { ar: 'المستخلصات', en: 'Claims' },
  timesheets: { ar: 'ساعات العمل', en: 'Timesheets' },
  selectClient: { ar: 'اختر العميل', en: 'Select Client' },
  selectProject: { ar: 'اختر المشروع', en: 'Select Project' },
  selectEquipment: { ar: 'اختر المعدة', en: 'Select Equipment' },
  rental: { ar: 'تأجير', en: 'Rental' },
  projectType: { ar: 'مشروع', en: 'Project' },
  service: { ar: 'خدمة', en: 'Service' },
  create: { ar: 'إنشاء', en: 'Create' },
  saving: { ar: 'جاري الحفظ...', en: 'Saving...' },
  update: { ar: 'تحديث', en: 'Update' },
  noContracts: { ar: 'لا توجد عقود', en: 'No contracts found' },
}

const contractTypeOptions = [
  { value: 'RENTAL', label: { ar: 'تأجير', en: 'Rental' } },
  { value: 'PROJECT', label: { ar: 'مشروع', en: 'Project' } },
  { value: 'SERVICE', label: { ar: 'خدمة', en: 'Service' } },
]

const defaultForm: ContractFormData = {
  projectId: '', clientId: '', equipmentId: '', contractNo: '', salesOrderNo: '',
  date: '', value: '', vatRate: '0.15', startDate: '', endDate: '', status: 'DRAFT',
  description: '', contractType: 'RENTAL', hourlyRate: '', deliveryFees: '0',
  deliveryFeesTaxable: true, paymentTerms: '30 days',
}

// ============ View State ============
type ViewState = { type: 'list' } | { type: 'create' } | { type: 'edit'; contract: ContractItem } | { type: 'detail'; contractId: string }

// ============ Skeleton ============
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Contract Form Page ============
function ContractFormPage({
  form, setForm, onSubmit, onBack, isEdit, isLoading, clients, projects, equipmentList,
}: {
  form: ContractFormData; setForm: React.Dispatch<React.SetStateAction<ContractFormData>>
  onSubmit: (e: React.FormEvent) => void; onBack: () => void
  isEdit: boolean; isLoading: boolean
  clients: ClientOption[]; projects: ProjectOption[]; equipmentList: EquipmentOption[]
}) {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const val = parseFloat(form.value) || 0
  const rate = parseFloat(form.vatRate) || 0
  const vatAmount = Math.round(val * rate * 100) / 100
  const totalValue = Math.round((val + vatAmount) * 100) / 100

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? t(labels.editContract.ar, labels.editContract.en) : t(labels.newContract.ar, labels.newContract.en)}
          </h1>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Section 1: Basic Info */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('المعلومات الأساسية', 'Basic Information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.contractNo.ar, labels.contractNo.en)} *</Label>
                <Input value={form.contractNo} onChange={e => setForm(f => ({ ...f, contractNo: e.target.value }))} placeholder="CTR-2026-001" dir="ltr" required />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.salesOrderNo.ar, labels.salesOrderNo.en)}</Label>
                <Input value={form.salesOrderNo} onChange={e => setForm(f => ({ ...f, salesOrderNo: e.target.value }))} placeholder="SO-2026-001" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.contractType.ar, labels.contractType.en)}</Label>
                <Select value={form.contractType} onValueChange={v => setForm(f => ({ ...f, contractType: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {contractTypeOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{t(o.label.ar, o.label.en)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.client.ar, labels.client.en)} *</Label>
                <Select value={form.clientId} onValueChange={v => setForm(f => ({ ...f, clientId: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t(labels.selectClient.ar, labels.selectClient.en)} /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.project.ar, labels.project.en)} *</Label>
                <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t(labels.selectProject.ar, labels.selectProject.en)} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.equipment.ar, labels.equipment.en)}</Label>
                <Select value={form.equipmentId} onValueChange={v => {
                  setForm(f => ({ ...f, equipmentId: v }))
                  // Auto-fill hourly rate from equipment
                  const eq = equipmentList.find(e => e.id === v)
                  if (eq && eq.hourlyRate > 0) {
                    setForm(f => ({ ...f, hourlyRate: eq.hourlyRate.toString() }))
                  }
                }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t(labels.selectEquipment.ar, labels.selectEquipment.en)} /></SelectTrigger>
                  <SelectContent>
                    {equipmentList.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Financial Details */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('البيانات المالية', 'Financial Details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.value.ar, labels.value.en)} (قبل الضريبة) *</Label>
                <Input type="number" step="0.01" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0.00" dir="ltr" required />
              </div>
              <div className="space-y-2">
                <Label>{t('نسبة الضريبة', 'VAT Rate')}</Label>
                <Input type="number" step="0.01" value={form.vatRate} onChange={e => setForm(f => ({ ...f, vatRate: e.target.value }))} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.hourlyRate.ar, labels.hourlyRate.en)}</Label>
                <Input type="number" step="0.01" min="0" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))} placeholder="0.00" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.deliveryFees.ar, labels.deliveryFees.en)}</Label>
                <Input type="number" step="0.01" min="0" value={form.deliveryFees} onChange={e => setForm(f => ({ ...f, deliveryFees: e.target.value }))} placeholder="0.00" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.paymentTerms.ar, labels.paymentTerms.en)}</Label>
                <Input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="30 days" />
              </div>
              <div className="space-y-2 flex items-center gap-3 pt-6">
                <Switch checked={form.deliveryFeesTaxable} onCheckedChange={v => setForm(f => ({ ...f, deliveryFeesTaxable: v }))} />
                <Label className="text-sm">{t(labels.deliveryFeesTaxable.ar, labels.deliveryFeesTaxable.en)}</Label>
              </div>
            </div>

            {/* VAT Preview */}
            {val > 0 && (
              <Card className="bg-emerald-50 border-emerald-200">
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('القيمة', 'Value')}</p>
                      <MoneyDisplay value={val} lang={lang} bold size="md" className="justify-center" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('الضريبة', 'VAT')} ({(rate * 100).toFixed(0)}%)</p>
                      <MoneyDisplay value={vatAmount} lang={lang} bold size="md" className="justify-center" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('الإجمالي', 'Total')}</p>
                      <MoneyDisplay value={totalValue} lang={lang} bold size="lg" className="justify-center text-emerald-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Section 3: Dates & Status */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('التواريخ والحالة', 'Dates & Status')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.date.ar, labels.date.en)} *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.startDate.ar, labels.startDate.en)} *</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.endDate.ar, labels.endDate.en)}</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.status.ar, labels.status.en)}</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">{t('مسودة', 'Draft')}</SelectItem>
                    <SelectItem value="ACTIVE">{t('نشط', 'Active')}</SelectItem>
                    <SelectItem value="EXPIRED">{t('منتهي', 'Expired')}</SelectItem>
                    <SelectItem value="TERMINATED">{t('ملغي', 'Terminated')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Description */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t(labels.description.ar, labels.description.en)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('وصف العقد', 'Contract description')} rows={3} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>{commonText.cancel[lang]}</Button>
          <Button type="submit" disabled={isLoading || !form.projectId || !form.contractNo || !form.date || !form.value || !form.startDate} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {isLoading ? t(labels.saving.ar, labels.saving.en) : isEdit ? t(labels.update.ar, labels.update.en) : t(labels.create.ar, labels.create.en)}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Main Contracts Module ============
export function ContractsModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<ContractFormData>(defaultForm)

  // Fetch contracts
  const { data: contracts = [], isLoading, isError, refetch } = useQuery<ContractItem[]>({
    queryKey: ['contracts'],
    queryFn: async () => {
      const res = await fetch('/api/contracts')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch dropdown options
  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['clients-for-contracts'],
    queryFn: async () => {
      const res = await fetch('/api/clients?simple=true&active=true')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['projects-for-contracts'],
    queryFn: async () => {
      const res = await fetch('/api/projects/list')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: equipmentList = [] } = useQuery<EquipmentOption[]>({
    queryKey: ['equipment-for-contracts'],
    queryFn: async () => {
      const res = await fetch('/api/equipment')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: ContractFormData) =>
      fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          value: parseFloat(data.value) || 0,
          vatRate: parseFloat(data.vatRate) || 0.15,
          hourlyRate: parseFloat(data.hourlyRate) || null,
          deliveryFees: parseFloat(data.deliveryFees) || 0,
          clientId: data.clientId || null,
          equipmentId: data.equipmentId || null,
          salesOrderNo: data.salesOrderNo || null,
          paymentTerms: data.paymentTerms || null,
          contractType: data.contractType || null,
          description: data.description || null,
          endDate: data.endDate || null,
        }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      setViewState({ type: 'list' })
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ContractFormData }) =>
      fetch(`/api/contracts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          value: parseFloat(data.value) || 0,
          vatRate: parseFloat(data.vatRate) || 0.15,
          hourlyRate: parseFloat(data.hourlyRate) || null,
          deliveryFees: parseFloat(data.deliveryFees) || 0,
          clientId: data.clientId || null,
          equipmentId: data.equipmentId || null,
          salesOrderNo: data.salesOrderNo || null,
          paymentTerms: data.paymentTerms || null,
          contractType: data.contractType || null,
          description: data.description || null,
          endDate: data.endDate || null,
        }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      setViewState({ type: 'list' })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/contracts/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      setDeleteId(null)
    },
  })

  // Filters
  const filtered = contracts.filter(c => {
    const matchSearch = !search ||
      c.contractNo.toLowerCase().includes(search.toLowerCase()) ||
      c.project.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalContractValue = filtered.reduce((s, c) => s + c.totalValue, 0)

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (viewState.type === 'edit') {
      updateMutation.mutate({ id: viewState.contract.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  // ============ CREATE / EDIT VIEW ============
  if (viewState.type === 'create' || viewState.type === 'edit') {
    return (
      <ContractFormPage
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        onBack={() => setViewState({ type: 'list' })}
        isEdit={viewState.type === 'edit'}
        isLoading={createMutation.isPending || updateMutation.isPending}
        clients={clients}
        projects={projects}
        equipmentList={equipmentList}
      />
    )
  }

  // ============ DETAIL VIEW ============
  if (viewState.type === 'detail') {
    const contract = contracts.find(c => c.id === viewState.contractId)
    if (!contract) {
      return (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('لم يتم العثور على العقد', 'Contract not found')}</p>
          <Button variant="outline" onClick={() => setViewState({ type: 'list' })}>{t('العودة', 'Back')}</Button>
        </div>
      )
    }

    const clientName = contract.clientId ? (clients.find(c => c.id === contract.clientId)?.name || '—') : '—'
    const eqName = contract.equipmentId ? (equipmentList.find(e => e.id === contract.equipmentId)?.name || '—') : '—'
    const ctLabel = contractTypeOptions.find(o => o.value === contract.contractType)

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setViewState({ type: 'list' })}>
            <ArrowRight className="size-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">{contract.contractNo}</h2>
              <StatusBadge status={contract.status} lang={lang} />
            </div>
            <p className="text-sm text-muted-foreground">{contract.project.name}</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => {
            setForm({
              projectId: contract.project.id,
              clientId: contract.clientId || '',
              equipmentId: contract.equipmentId || '',
              contractNo: contract.contractNo,
              salesOrderNo: contract.salesOrderNo || '',
              date: contract.date?.split('T')[0] || '',
              value: contract.value.toString(),
              vatRate: contract.vatRate.toString(),
              startDate: contract.startDate?.split('T')[0] || '',
              endDate: contract.endDate?.split('T')[0] || '',
              status: contract.status,
              description: contract.description || '',
              contractType: contract.contractType || 'RENTAL',
              hourlyRate: contract.hourlyRate?.toString() || '',
              deliveryFees: contract.deliveryFees.toString(),
              deliveryFeesTaxable: contract.deliveryFeesTaxable,
              paymentTerms: contract.paymentTerms || '',
            })
            setViewState({ type: 'edit', contract })
          }}>
            <Pencil className="size-4" /> {t('تعديل', 'Edit')}
          </Button>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.client.ar, labels.client.en)}</p><p className="text-sm font-medium truncate">{clientName}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.equipment.ar, labels.equipment.en)}</p><p className="text-sm font-medium truncate">{eqName}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.contractType.ar, labels.contractType.en)}</p><p className="text-sm font-medium">{ctLabel ? t(ctLabel.label.ar, ctLabel.label.en) : '—'}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.salesOrderNo.ar, labels.salesOrderNo.en)}</p><p className="text-sm font-medium font-mono">{contract.salesOrderNo || '—'}</p></CardContent></Card>
        </div>

        {/* Financial Details */}
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('البيانات المالية', 'Financial Details')}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{t(labels.value.ar, labels.value.en)}</p>
                <MoneyDisplay value={contract.value} lang={lang} bold size="md" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t(labels.vatAmount.ar, labels.vatAmount.en)}</p>
                <MoneyDisplay value={contract.vatAmount} lang={lang} size="md" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t(labels.totalValue.ar, labels.totalValue.en)}</p>
                <MoneyDisplay value={contract.totalValue} lang={lang} bold size="lg" className="text-emerald-700" />
              </div>
              {contract.hourlyRate !== null && contract.hourlyRate > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">{t(labels.hourlyRate.ar, labels.hourlyRate.en)}</p>
                  <MoneyDisplay value={contract.hourlyRate} lang={lang} size="md" />
                </div>
              )}
              {contract.deliveryFees > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">{t(labels.deliveryFees.ar, labels.deliveryFees.en)}</p>
                  <MoneyDisplay value={contract.deliveryFees} lang={lang} size="md" />
                  <p className="text-xs text-muted-foreground">
                    {contract.deliveryFeesTaxable ? t('خاضعة للضريبة', 'Taxable') : t('غير خاضعة للضريبة', 'Not Taxable')}
                  </p>
                </div>
              )}
              {contract.paymentTerms && (
                <div>
                  <p className="text-xs text-muted-foreground">{t(labels.paymentTerms.ar, labels.paymentTerms.en)}</p>
                  <p className="text-sm font-medium">{contract.paymentTerms}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Dates */}
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('التواريخ', 'Dates')}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><p className="text-xs text-muted-foreground">{t(labels.date.ar, labels.date.en)}</p><p className="text-sm font-medium">{formatDate(contract.date, lang)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t(labels.startDate.ar, labels.startDate.en)}</p><p className="text-sm font-medium">{formatDate(contract.startDate, lang)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t(labels.endDate.ar, labels.endDate.en)}</p><p className="text-sm font-medium">{contract.endDate ? formatDate(contract.endDate, lang) : '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">{t(labels.status.ar, labels.status.en)}</p><StatusBadge status={contract.status} lang={lang} /></div>
            </div>
          </CardContent>
        </Card>

        {contract.description && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">{t(labels.description.ar, labels.description.en)}</p>
              <p className="text-sm">{contract.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Accounting Integration Note */}
        {/* When contract is activated, accounting engine should create:
            - Debit: Accounts Receivable
            - Credit: Contract Revenue
            This is handled via POST /api/journal-entries with sourceType: CONTRACT */}
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
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => {
            setForm(defaultForm)
            setViewState({ type: 'create' })
          }}>
            <Plus className="size-4" /> {t(labels.newContract.ar, labels.newContract.en)}
          </Button>
        </>
      }
    >
      {/* Summary Card */}
      <Card className="bg-emerald-50 border-emerald-200">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t(labels.totalContractValue.ar, labels.totalContractValue.en)}</p>
            <MoneyDisplay value={totalContractValue} lang={lang} size="xl" bold className="text-emerald-700" />
          </div>
          <div className="text-left">
            <p className="text-sm text-muted-foreground">{t(labels.contractCount.ar, labels.contractCount.en)}</p>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t(labels.search.ar, labels.search.en)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t(labels.allStatus.ar, labels.allStatus.en)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(labels.allStatus.ar, labels.allStatus.en)}</SelectItem>
                <SelectItem value="DRAFT">{t('مسودة', 'Draft')}</SelectItem>
                <SelectItem value="ACTIVE">{t('نشط', 'Active')}</SelectItem>
                <SelectItem value="EXPIRED">{t('منتهي', 'Expired')}</SelectItem>
                <SelectItem value="TERMINATED">{t('ملغي', 'Terminated')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Contracts Table */}
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
              <FileText className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t(labels.noContracts.ar, labels.noContracts.en)}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setForm(defaultForm); setViewState({ type: 'create' }) }}>
                <Plus className="size-4 mr-1" /> {t(labels.newContract.ar, labels.newContract.en)}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(labels.contractNo.ar, labels.contractNo.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.project.ar, labels.project.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.contractType.ar, labels.contractType.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.value.ar, labels.value.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.vatAmount.ar, labels.vatAmount.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.totalValue.ar, labels.totalValue.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.startDate.ar, labels.startDate.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.status.ar, labels.status.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.timesheets.ar, labels.timesheets.en)}</TableHead>
                    <TableHead className="text-right">{commonText.actions[lang]}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', contractId: c.id })}>
                      <TableCell className="font-medium font-mono">{c.contractNo}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{c.project.name}</TableCell>
                      <TableCell>
                        {(() => {
                          const ct = contractTypeOptions.find(o => o.value === c.contractType)
                          return ct ? t(ct.label.ar, ct.label.en) : '—'
                        })()}
                      </TableCell>
                      <TableCell><MoneyDisplay value={c.value} lang={lang} size="sm" inline /></TableCell>
                      <TableCell><MoneyDisplay value={c.vatAmount} lang={lang} size="sm" inline /></TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={c.totalValue} lang={lang} size="sm" inline bold /></TableCell>
                      <TableCell>{formatDate(c.startDate, lang)}</TableCell>
                      <TableCell><StatusBadge status={c.status} lang={lang} /></TableCell>
                      <TableCell>{c._count?.timesheets ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewState({ type: 'detail', contractId: c.id })} title={t('عرض', 'View')}>
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => {
                            setForm({
                              projectId: c.project.id,
                              clientId: c.clientId || '',
                              equipmentId: c.equipmentId || '',
                              contractNo: c.contractNo,
                              salesOrderNo: c.salesOrderNo || '',
                              date: c.date?.split('T')[0] || '',
                              value: c.value.toString(),
                              vatRate: c.vatRate.toString(),
                              startDate: c.startDate?.split('T')[0] || '',
                              endDate: c.endDate?.split('T')[0] || '',
                              status: c.status,
                              description: c.description || '',
                              contractType: c.contractType || 'RENTAL',
                              hourlyRate: c.hourlyRate?.toString() || '',
                              deliveryFees: c.deliveryFees.toString(),
                              deliveryFeesTaxable: c.deliveryFeesTaxable,
                              paymentTerms: c.paymentTerms || '',
                            })
                            setViewState({ type: 'edit', contract: c })
                          }} title={t('تعديل', 'Edit')}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => setDeleteId(c.id)} title={t('حذف', 'Delete')}>
                            <Trash2 className="size-4" />
                          </Button>
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

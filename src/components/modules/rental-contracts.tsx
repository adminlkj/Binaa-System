'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw, ArrowRight, Calendar,
  DollarSign, Clock, Truck, Info, Eye, Edit3,
  CheckCircle, AlertTriangle, MapPin,
  User, Phone, Fuel, Shield, Wrench, Send, Ban,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAppStore, formatNumber, formatDate } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'

// ============ Helper ============
function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

// ============ Types ============
interface EquipmentOption {
  id: string; code: string; name: string; nameAr: string | null; status: string
}

interface ClientOption {
  id: string; code: string; name: string; nameAr: string | null
}

interface ProjectOption {
  id: string; code: string; name: string; nameAr: string | null
}

interface Timesheet {
  id: string; contractId: string; month: number; year: number
  workedHours: number; hourlyRate: number; subtotal: number
  vatRate: number; vatAmount: number; totalAmount: number
  status: string; remarks: string | null; approvedBy: string | null
  approvedDate: string | null; invoiceId: string | null
  createdAt: string
}

interface RentalContract {
  id: string; contractNo: string
  equipmentId: string; clientId: string; projectId: string | null
  startDate: string; endDate: string | null
  // Pricing
  pricingType: string // HOURLY, DAILY, MONTHLY, LUMP_SUM
  referenceRate: number  // القيمة الشهرية المرجعية
  referenceHours: number // ساعات التسعير المرجعية
  hourlyRate: number     // محسوب تلقائياً
  dailyRate: number
  monthlyRate: number
  lumpSumAmount: number
  // Work Location
  workCity: string | null
  workLocation: string | null
  siteSupervisor: string | null
  siteSupervisorPhone: string | null
  // Delivery
  deliveryFeesType: string // NONE, FIXED, ONE_WAY, ROUND_TRIP, BY_DISTANCE
  deliveryFees: number
  deliveryFeesTaxable: boolean
  // Operation
  operationMode: string // WITHOUT_DRIVER, WITH_DRIVER, WITH_CREW
  fuelResponsibility: string | null // ON_CLIENT, ON_COMPANY
  insuranceResponsibility: string | null // ON_CLIENT, ON_COMPANY
  // References
  salesOrderNo: string | null
  purchaseOrderNo: string | null
  quotationNo: string | null
  // Terms
  status: string // DRAFT, UNDER_REVIEW, ACTIVE, EXPIRED, CANCELLED
  paymentDuration: string | null
  additionalTerms: string | null
  notes: string | null
  totalAmount: number
  createdAt: string; updatedAt: string
  equipment: { id: string; code: string; name: string; nameAr: string | null; status?: string }
  timesheets: Timesheet[]
  client?: { id: string; code: string; name: string; nameAr: string | null }
  project?: { id: string; name: string; code: string }
}

// ============ Status Config ============
const contractStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-yellow-700', bg: 'bg-yellow-100' },
  UNDER_REVIEW: { label: { ar: 'قيد المراجعة', en: 'Under Review' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  ACTIVE: { label: { ar: 'فعال', en: 'Active' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  EXPIRED: { label: { ar: 'منتهي', en: 'Expired' }, color: 'text-gray-600', bg: 'bg-gray-100' },
  CANCELLED: { label: { ar: 'ملغي', en: 'Cancelled' }, color: 'text-red-700', bg: 'bg-red-100' },
}

function ContractStatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = contractStatusConfig[status] || contractStatusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0 font-medium`}>{cfg.label[lang]}</Badge>
}

// Timesheet status config
const timesheetStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-gray-700', bg: 'bg-gray-100' },
  SUBMITTED: { label: { ar: 'مرسل', en: 'Submitted' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  APPROVED: { label: { ar: 'معتمد', en: 'Approved' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  REJECTED: { label: { ar: 'مرفوض', en: 'Rejected' }, color: 'text-red-700', bg: 'bg-red-100' },
}

function TimesheetStatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = timesheetStatusConfig[status] || timesheetStatusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0 text-xs`}>{cfg.label[lang]}</Badge>
}

// ============ Option Labels ============
const pricingTypeOptions: { value: string; ar: string; en: string }[] = [
  { value: 'HOURLY', ar: 'بالساعة', en: 'Hourly' },
  { value: 'DAILY', ar: 'باليوم', en: 'Daily' },
  { value: 'MONTHLY', ar: 'بالشهر', en: 'Monthly' },
  { value: 'LUMP_SUM', ar: 'مبلغ مقطوع', en: 'Lump Sum' },
]

const deliveryFeesTypeOptions: { value: string; ar: string; en: string }[] = [
  { value: 'NONE', ar: 'بدون رسوم', en: 'No Fees' },
  { value: 'FIXED', ar: 'مبلغ ثابت', en: 'Fixed Amount' },
  { value: 'ONE_WAY', ar: 'ذهاب فقط', en: 'One Way' },
  { value: 'ROUND_TRIP', ar: 'ذهاب وعودة', en: 'Round Trip' },
  { value: 'BY_DISTANCE', ar: 'حسب المسافة', en: 'By Distance' },
]

const operationModeOptions: { value: string; ar: string; en: string }[] = [
  { value: 'WITHOUT_DRIVER', ar: 'بدون سائق', en: 'Without Driver' },
  { value: 'WITH_DRIVER', ar: 'مع سائق', en: 'With Driver' },
  { value: 'WITH_CREW', ar: 'مع فريق تشغيل', en: 'With Crew' },
]

const responsibilityOptions: { value: string; ar: string; en: string }[] = [
  { value: 'ON_CLIENT', ar: 'على العميل', en: 'On Client' },
  { value: 'ON_COMPANY', ar: 'على الشركة', en: 'On Company' },
]

// Month names
const monthNames = [
  { ar: 'يناير', en: 'January' }, { ar: 'فبراير', en: 'February' },
  { ar: 'مارس', en: 'March' }, { ar: 'أبريل', en: 'April' },
  { ar: 'مايو', en: 'May' }, { ar: 'يونيو', en: 'June' },
  { ar: 'يوليو', en: 'July' }, { ar: 'أغسطس', en: 'August' },
  { ar: 'سبتمبر', en: 'September' }, { ar: 'أكتوبر', en: 'October' },
  { ar: 'نوفمبر', en: 'November' }, { ar: 'ديسمبر', en: 'December' },
]

// ============ Skeleton ============
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Detail Row Helper ============
function DetailRow({ label, value, mono, dirLtr }: { label: string; value: string | number | React.ReactNode; mono?: boolean; dirLtr?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${mono ? 'font-mono' : ''}`} dir={dirLtr ? 'ltr' : undefined}>
        {value || '—'}
      </span>
    </div>
  )
}

// ============ Main Component ============
type ViewMode = 'list' | 'create' | 'edit' | 'detail'

export function RentalContractsModule() {
  const { lang } = useAppStore()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Fetch contracts
  const { data: contracts = [], isLoading, refetch } = useQuery<RentalContract[]>({
    queryKey: ['rental-contracts', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const r = await fetch(`/api/equipment/rental-contracts?${params.toString()}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
  })

  // Fetch equipment options
  const { data: equipmentOptions = [] } = useQuery<EquipmentOption[]>({
    queryKey: ['equipment-options'],
    queryFn: async () => {
      const r = await fetch('/api/equipment')
      if (!r.ok) return []
      return r.json()
    },
  })

  // Fetch client options
  const { data: clientOptions = [] } = useQuery<ClientOption[]>({
    queryKey: ['client-options'],
    queryFn: async () => {
      const r = await fetch('/api/clients?simple=true')
      if (!r.ok) return []
      return r.json()
    },
  })

  // Fetch project options
  const { data: projectOptions = [] } = useQuery<ProjectOption[]>({
    queryKey: ['project-options'],
    queryFn: async () => {
      const r = await fetch('/api/projects/list')
      if (!r.ok) return []
      return r.json()
    },
  })

  // Filter contracts by search
  const filteredContracts = useMemo(() => {
    if (!searchQuery) return contracts
    const q = searchQuery.toLowerCase()
    return contracts.filter(c =>
      c.contractNo.toLowerCase().includes(q) ||
      c.equipment?.name?.toLowerCase().includes(q) ||
      c.equipment?.nameAr?.includes(q) ||
      c.client?.name?.toLowerCase().includes(q) ||
      c.purchaseOrderNo?.toLowerCase().includes(q)
    )
  }, [contracts, searchQuery])

  // KPIs
  const totalContracts = contracts.length
  const activeContracts = contracts.filter(c => c.status === 'ACTIVE').length
  const draftContracts = contracts.filter(c => c.status === 'DRAFT').length
  const expiredContracts = contracts.filter(c => c.status === 'EXPIRED').length

  // Handlers
  const handleCreate = () => {
    setSelectedId(null)
    setViewMode('create')
  }

  const handleEdit = (id: string) => {
    setSelectedId(id)
    setViewMode('edit')
  }

  const handleViewDetail = (id: string) => {
    setSelectedId(id)
    setViewMode('detail')
  }

  const handleBack = () => {
    setSelectedId(null)
    setViewMode('list')
  }

  // ============ LIST VIEW ============
  if (viewMode === 'list') {
    return (
      <ModuleLayout
        title={{ ar: 'عقود التأجير', en: 'Rental Contracts' }}
        subtitle={{ ar: 'إدارة عقود تأجير المعدات والآليات', en: 'Manage equipment and machinery rental contracts' }}
        actions={
          <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Plus className="size-4" />
            {t('عقد جديد', 'New Contract', lang)}
          </Button>
        }
      >
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <FileText className="size-4 text-emerald-600" />
                <p className="text-xs text-emerald-600">{t('إجمالي العقود', 'Total Contracts', lang)}</p>
              </div>
              <p className="text-2xl font-bold text-emerald-700">{formatNumber(totalContracts)}</p>
            </CardContent>
          </Card>
          <Card className="bg-teal-50 border-teal-200">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <CheckCircle className="size-4 text-teal-600" />
                <p className="text-xs text-teal-600">{t('عقود فعالة', 'Active', lang)}</p>
              </div>
              <p className="text-2xl font-bold text-teal-700">{formatNumber(activeContracts)}</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Edit3 className="size-4 text-yellow-600" />
                <p className="text-xs text-yellow-600">{t('مسودات', 'Drafts', lang)}</p>
              </div>
              <p className="text-2xl font-bold text-yellow-700">{formatNumber(draftContracts)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Clock className="size-4 text-gray-500" />
                <p className="text-xs text-gray-500">{t('منتهية', 'Expired', lang)}</p>
              </div>
              <p className="text-2xl font-bold text-gray-600">{formatNumber(expiredContracts)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('بحث برقم العقد، العميل، المعدة...', 'Search by contract no, client, equipment...', lang)}
              className="pr-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('الحالة', 'Status', lang)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('الكل', 'All', lang)}</SelectItem>
              {Object.entries(contractStatusConfig).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="size-4" />
          </Button>
        </div>

        {/* Contracts Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4"><TableSkeleton /></div>
            ) : filteredContracts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <FileText className="size-12 mx-auto mb-2 opacity-30" />
                <p>{t('لا توجد عقود تأجير', 'No rental contracts found', lang)}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t('رقم العقد', 'Contract No.', lang)}</TableHead>
                      <TableHead className="text-right">{t('العميل', 'Client', lang)}</TableHead>
                      <TableHead className="text-right">{t('المعدة', 'Equipment', lang)}</TableHead>
                      <TableHead className="text-right">{t('نوع التسعير', 'Pricing', lang)}</TableHead>
                      <TableHead className="text-right">{t('القيمة', 'Value', lang)}</TableHead>
                      <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                      <TableHead className="text-right">{t('تاريخ البداية', 'Start Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContracts.map(contract => {
                      const pricingLabel = pricingTypeOptions.find(p => p.value === contract.pricingType)
                      const contractValue = contract.pricingType === 'HOURLY' ? (contract.referenceRate ?? 0)
                        : contract.pricingType === 'DAILY' ? (contract.dailyRate ?? 0)
                        : contract.pricingType === 'MONTHLY' ? (contract.monthlyRate ?? 0)
                        : (contract.lumpSumAmount ?? 0)
                      return (
                        <TableRow key={contract.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewDetail(contract.id)}>
                          <TableCell className="font-mono font-semibold text-emerald-700">{contract.contractNo}</TableCell>
                          <TableCell>
                            <p className="font-medium">{contract.client?.name || '—'}</p>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{contract.equipment?.nameAr || contract.equipment?.name}</p>
                              <p className="text-xs text-muted-foreground">{contract.equipment?.code}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {pricingLabel ? pricingLabel[lang] : contract.pricingType}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            <MoneyDisplay value={contractValue} lang={lang} size="sm" bold />
                          </TableCell>
                          <TableCell><ContractStatusBadge status={contract.status} lang={lang} /></TableCell>
                          <TableCell>{formatDate(contract.startDate, lang)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="size-8" onClick={() => handleViewDetail(contract.id)}>
                                <Eye className="size-4" />
                              </Button>
                              {(contract.status === 'DRAFT' || contract.status === 'UNDER_REVIEW') && (
                                <Button variant="ghost" size="icon" className="size-8" onClick={() => handleEdit(contract.id)}>
                                  <Edit3 className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </ModuleLayout>
    )
  }

  // ============ CREATE / EDIT VIEW ============
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <ContractFormView
        mode={viewMode}
        contractId={selectedId}
        onBack={handleBack}
        equipmentOptions={equipmentOptions}
        clientOptions={clientOptions}
        projectOptions={projectOptions}
      />
    )
  }

  // ============ DETAIL VIEW ============
  if (viewMode === 'detail' && selectedId) {
    return (
      <ContractDetailView
        contractId={selectedId}
        onBack={handleBack}
        onEdit={() => handleEdit(selectedId)}
      />
    )
  }

  return null
}

// ============ Contract Form View (6 Sections) ============
function ContractFormView({
  mode, contractId, onBack, equipmentOptions, clientOptions, projectOptions,
}: {
  mode: 'create' | 'edit'
  contractId: string | null
  onBack: () => void
  equipmentOptions: EquipmentOption[]
  clientOptions: ClientOption[]
  projectOptions: ProjectOption[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  // For edit mode, fetch the contract
  const { data: editContract, isLoading: editLoading } = useQuery<RentalContract>({
    queryKey: ['rental-contract', contractId],
    queryFn: async () => {
      const r = await fetch(`/api/equipment/rental-contracts/${contractId}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
    enabled: mode === 'edit' && !!contractId,
  })

  // ═══════ Form State ═══════
  // Section 1: Contract Data
  const [equipmentId, setEquipmentId] = useState('')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Section 2: Work Location
  const [workCity, setWorkCity] = useState('')
  const [workLocation, setWorkLocation] = useState('')
  const [siteSupervisor, setSiteSupervisor] = useState('')
  const [siteSupervisorPhone, setSiteSupervisorPhone] = useState('')

  // Section 3: Pricing
  const [pricingType, setPricingType] = useState('HOURLY')
  const [referenceRate, setReferenceRate] = useState('')
  const [referenceHours, setReferenceHours] = useState('')
  const [dailyRate, setDailyRate] = useState('')
  const [monthlyRate, setMonthlyRate] = useState('')
  const [lumpSumAmount, setLumpSumAmount] = useState('')

  // Section 4: Additional Costs
  const [deliveryFeesType, setDeliveryFeesType] = useState('NONE')
  const [deliveryFees, setDeliveryFees] = useState('')
  const [deliveryFeesTaxable, setDeliveryFeesTaxable] = useState(true)
  const [fuelResponsibility, setFuelResponsibility] = useState('ON_CLIENT')
  const [operationMode, setOperationMode] = useState('WITHOUT_DRIVER')
  const [insuranceResponsibility, setInsuranceResponsibility] = useState('ON_CLIENT')

  // Section 5: Reference Documents
  const [purchaseOrderNo, setPurchaseOrderNo] = useState('')
  const [quotationNo, setQuotationNo] = useState('')

  // Section 6: Terms
  const [paymentDuration, setPaymentDuration] = useState('')
  const [additionalTerms, setAdditionalTerms] = useState('')
  const [notes, setNotes] = useState('')

  // Populate form for edit mode
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Legitimate: populate form fields from API data on load */
    if (mode === 'edit' && editContract) {
      const c = editContract
      setEquipmentId(c.equipmentId)
      setClientId(c.clientId)
      setProjectId(c.projectId || '')
      setStartDate(c.startDate ? new Date(c.startDate).toISOString().split('T')[0] : '')
      setEndDate(c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : '')
      setWorkCity(c.workCity || '')
      setWorkLocation(c.workLocation || '')
      setSiteSupervisor(c.siteSupervisor || '')
      setSiteSupervisorPhone(c.siteSupervisorPhone || '')
      setPricingType(c.pricingType || 'HOURLY')
      setReferenceRate(String(c.referenceRate || ''))
      setReferenceHours(String(c.referenceHours || ''))
      setDailyRate(String(c.dailyRate || ''))
      setMonthlyRate(String(c.monthlyRate || ''))
      setLumpSumAmount(String(c.lumpSumAmount || ''))
      setDeliveryFeesType(c.deliveryFeesType || 'NONE')
      setDeliveryFees(String(c.deliveryFees || ''))
      setDeliveryFeesTaxable(c.deliveryFeesTaxable !== false)
      setFuelResponsibility(c.fuelResponsibility || 'ON_CLIENT')
      setOperationMode(c.operationMode || 'WITHOUT_DRIVER')
      setInsuranceResponsibility(c.insuranceResponsibility || 'ON_CLIENT')
      setPurchaseOrderNo(c.purchaseOrderNo || '')
      setQuotationNo(c.quotationNo || '')
      setPaymentDuration(c.paymentDuration || '')
      setAdditionalTerms(c.additionalTerms || '')
      setNotes(c.notes || '')
    }
  }, [mode, editContract])

  // Auto-calculate hourly rate
  const refRate = parseFloat(referenceRate) || 0
  const refHours = parseFloat(referenceHours) || 0
  const calculatedHourlyRate = (pricingType === 'HOURLY' && refHours > 0) ? refRate / refHours : 0

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/rental-contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-contracts'] })
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      onBack()
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown> & { id: string }) =>
      fetch(`/api/equipment/rental-contracts/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-contracts'] })
      queryClient.invalidateQueries({ queryKey: ['rental-contract', contractId] })
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      onBack()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: Record<string, unknown> = {
      equipmentId,
      clientId,
      projectId: projectId || null,
      startDate,
      endDate: endDate || null,
      // Pricing
      pricingType,
      referenceRate: parseFloat(referenceRate) || 0,
      referenceHours: parseFloat(referenceHours) || 0,
      hourlyRate: calculatedHourlyRate,
      dailyRate: parseFloat(dailyRate) || 0,
      monthlyRate: parseFloat(monthlyRate) || 0,
      lumpSumAmount: parseFloat(lumpSumAmount) || 0,
      // Work Location
      workCity: workCity || null,
      workLocation: workLocation || null,
      siteSupervisor: siteSupervisor || null,
      siteSupervisorPhone: siteSupervisorPhone || null,
      // Delivery
      deliveryFeesType,
      deliveryFees: parseFloat(deliveryFees) || 0,
      deliveryFeesTaxable,
      // Operation
      operationMode,
      fuelResponsibility: fuelResponsibility || null,
      insuranceResponsibility: insuranceResponsibility || null,
      // Reference Documents
      purchaseOrderNo: purchaseOrderNo || null,
      quotationNo: quotationNo || null,
      // Terms
      paymentDuration: paymentDuration || null,
      additionalTerms: additionalTerms || null,
      notes: notes || null,
      status: 'DRAFT',
    }

    if (mode === 'create') {
      createMutation.mutate(data)
    } else if (contractId) {
      updateMutation.mutate({ ...data, id: contractId })
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const canSubmit = equipmentId && clientId && startDate && (
    (pricingType === 'HOURLY' && referenceRate && referenceHours) ||
    (pricingType === 'DAILY' && dailyRate) ||
    (pricingType === 'MONTHLY' && monthlyRate) ||
    (pricingType === 'LUMP_SUM' && lumpSumAmount)
  )

  if (mode === 'edit' && editLoading) {
    return <div className="p-4"><TableSkeleton rows={6} /></div>
  }

  return (
    <ModuleLayout
      title={{
        ar: mode === 'create' ? 'عقد تأجير جديد' : 'تعديل عقد التأجير',
        en: mode === 'create' ? 'New Rental Contract' : 'Edit Rental Contract',
      }}
      subtitle={mode === 'edit' && editContract ? { ar: editContract.contractNo, en: editContract.contractNo } : undefined}
      actions={
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ═══════════════════════════════════════════════════════════
            القسم الأول: بيانات العقد (Contract Data)
        ═══════════════════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <FileText className="size-5" />
              {t('القسم الأول: بيانات العقد', 'Section 1: Contract Data', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* رقم العقد (read-only, auto-generated) */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('رقم العقد', 'Contract No.', lang)}
                </Label>
                <Input
                  value={mode === 'edit' && editContract ? editContract.contractNo : t('تلقائي', 'Auto-generated', lang)}
                  readOnly
                  className="bg-muted"
                />
              </div>

              {/* العميل */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('العميل *', 'Client *', lang)}
                </Label>
                <Select value={clientId} onValueChange={setClientId} required>
                  <SelectTrigger>
                    <SelectValue placeholder={t('اختر العميل', 'Select client', lang)} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientOptions.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nameAr || c.name}
                        <span className="text-muted-foreground text-xs mr-1">({c.code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* المشروع */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('المشروع', 'Project', lang)}
                  <span className="text-muted-foreground text-xs"> ({t('اختياري', 'optional', lang)})</span>
                </Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('اختر المشروع', 'Select project', lang)} />
                  </SelectTrigger>
                  <SelectContent>
                    {projectOptions.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nameAr || p.name}
                        <span className="text-muted-foreground text-xs mr-1">({p.code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* المعدة */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('المعدة *', 'Equipment *', lang)}
                </Label>
                <Select value={equipmentId} onValueChange={setEquipmentId} required>
                  <SelectTrigger>
                    <SelectValue placeholder={t('اختر المعدة', 'Select equipment', lang)} />
                  </SelectTrigger>
                  <SelectContent>
                    {equipmentOptions.map(eq => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.nameAr || eq.name}
                        <span className="text-muted-foreground text-xs mr-1">({eq.code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* نوع النشاط */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('نوع النشاط', 'Activity Type', lang)}
                </Label>
                <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted">
                  <div className="size-4 rounded border border-primary bg-primary text-primary-foreground flex items-center justify-center">
                    <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <span className="text-sm font-medium">{t('تأجير معدات', 'Equipment Rental', lang)}</span>
                </div>
              </div>

              {/* تاريخ البداية */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('تاريخ البداية *', 'Start Date *', lang)}
                </Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
              </div>

              {/* تاريخ النهاية */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('تاريخ النهاية', 'End Date', lang)}
                  <span className="text-muted-foreground text-xs"> ({t('اختياري', 'optional', lang)})</span>
                </Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════
            القسم الثاني: موقع العمل (Work Location)
        ═══════════════════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-cyan-700">
              <MapPin className="size-5" />
              {t('القسم الثاني: موقع العمل', 'Section 2: Work Location', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('مدينة المشروع', 'Project City', lang)}
                </Label>
                <Input
                  value={workCity}
                  onChange={e => setWorkCity(e.target.value)}
                  placeholder={t('مثال: الرياض', 'e.g. Riyadh', lang)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('موقع العمل', 'Work Location', lang)}
                </Label>
                <Input
                  value={workLocation}
                  onChange={e => setWorkLocation(e.target.value)}
                  placeholder={t('وصف الموقع', 'Location description', lang)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-right block flex items-center gap-1">
                  <User className="size-3.5" />
                  {t('اسم المسؤول', 'Site Supervisor', lang)}
                </Label>
                <Input
                  value={siteSupervisor}
                  onChange={e => setSiteSupervisor(e.target.value)}
                  placeholder={t('اسم المسؤول بالموقع', 'Supervisor name', lang)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-right block flex items-center gap-1">
                  <Phone className="size-3.5" />
                  {t('رقم الجوال', 'Phone Number', lang)}
                </Label>
                <Input
                  value={siteSupervisorPhone}
                  onChange={e => setSiteSupervisorPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  dir="ltr"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════
            القسم الثالث: التسعير (Pricing)
        ═══════════════════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-teal-700">
              <DollarSign className="size-5" />
              {t('القسم الثالث: التسعير', 'Section 3: Pricing', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* نوع التسعير */}
            <div className="space-y-2">
              <Label className="text-right block">
                {t('نوع التسعير *', 'Pricing Type *', lang)}
              </Label>
              <Select value={pricingType} onValueChange={setPricingType}>
                <SelectTrigger className="w-full sm:w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pricingTypeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* القيمة الشهرية المرجعية */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('القيمة الشهرية المرجعية *', 'Monthly Reference Rate *', lang)}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={referenceRate}
                  onChange={e => setReferenceRate(e.target.value)}
                  dir="ltr"
                  placeholder={t('مثال: 240,000', 'e.g. 240,000', lang)}
                  required
                />
              </div>

              {/* ساعات التسعير المرجعية - only for HOURLY */}
              {pricingType === 'HOURLY' && (
                <div className="space-y-2">
                  <Label className="text-right block">
                    {t('ساعات التسعير المرجعية *', 'Reference Hours *', lang)}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={referenceHours}
                    onChange={e => setReferenceHours(e.target.value)}
                    dir="ltr"
                    placeholder={t('مثال: 260', 'e.g. 260', lang)}
                    required
                  />
                </div>
              )}

              {/* سعر الساعة - auto-calculated, read-only for HOURLY */}
              {pricingType === 'HOURLY' && (
                <div className="space-y-2">
                  <Label className="text-right block">
                    {t('سعر الساعة (محسوب)', 'Hourly Rate (calculated)', lang)}
                  </Label>
                  <Input
                    value={calculatedHourlyRate > 0 ? (calculatedHourlyRate ?? 0).toFixed(2) : ''}
                    readOnly
                    className="bg-emerald-50 border-emerald-200 font-bold text-emerald-700"
                    dir="ltr"
                  />
                </div>
              )}

              {/* السعر اليومي - for DAILY */}
              {pricingType === 'DAILY' && (
                <div className="space-y-2">
                  <Label className="text-right block">
                    {t('السعر اليومي *', 'Daily Rate *', lang)}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={dailyRate}
                    onChange={e => setDailyRate(e.target.value)}
                    dir="ltr"
                    placeholder={t('مثال: 2,500', 'e.g. 2,500', lang)}
                    required
                  />
                </div>
              )}

              {/* السعر الشهري - for MONTHLY */}
              {pricingType === 'MONTHLY' && (
                <div className="space-y-2">
                  <Label className="text-right block">
                    {t('السعر الشهري *', 'Monthly Rate *', lang)}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={monthlyRate}
                    onChange={e => setMonthlyRate(e.target.value)}
                    dir="ltr"
                    placeholder={t('مثال: 75,000', 'e.g. 75,000', lang)}
                    required
                  />
                </div>
              )}

              {/* المبلغ المقطوع - for LUMP_SUM */}
              {pricingType === 'LUMP_SUM' && (
                <div className="space-y-2">
                  <Label className="text-right block">
                    {t('المبلغ المقطوع *', 'Lump Sum Amount *', lang)}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={lumpSumAmount}
                    onChange={e => setLumpSumAmount(e.target.value)}
                    dir="ltr"
                    placeholder={t('مثال: 500,000', 'e.g. 500,000', lang)}
                    required
                  />
                </div>
              )}
            </div>

            {/* Hourly Rate Calculation Display */}
            {pricingType === 'HOURLY' && refRate > 0 && refHours > 0 && (
              <Card className="bg-emerald-50 border-emerald-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="size-4 text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-700">
                      {t('حساب سعر الساعة', 'Hourly Rate Calculation', lang)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-lg" dir="ltr">
                    <span className="font-semibold text-emerald-800">{formatNumber(refRate)}</span>
                    <span className="text-emerald-500">÷</span>
                    <span className="font-semibold text-emerald-800">{formatNumber(refHours)}</span>
                    <span className="text-emerald-500">=</span>
                    <span className="font-bold text-emerald-900 text-xl">{(calculatedHourlyRate ?? 0).toFixed(2)}</span>
                    <span className="text-emerald-600">{t('ر.س', 'SAR', lang)}</span>
                  </div>
                  <p className="text-xs text-emerald-500 mt-1">
                    {t(
                      'القيمة الشهرية المرجعية ÷ ساعات التسعير المرجعية = سعر الساعة',
                      'Monthly Reference Rate ÷ Reference Hours = Hourly Rate',
                      lang
                    )}
                  </p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════
            القسم الرابع: التكاليف الإضافية (Additional Costs)
        ═══════════════════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <Truck className="size-5" />
              {t('القسم الرابع: التكاليف الإضافية', 'Section 4: Additional Costs', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* رسوم النقل - نوع */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('رسوم النقل - نوع', 'Delivery Fees - Type', lang)}
                </Label>
                <Select value={deliveryFeesType} onValueChange={setDeliveryFeesType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {deliveryFeesTypeOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* رسوم النقل - مبلغ */}
              {deliveryFeesType !== 'NONE' && (
                <div className="space-y-2">
                  <Label className="text-right block">
                    {t('رسوم النقل - مبلغ', 'Delivery Fees - Amount', lang)}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deliveryFees}
                    onChange={e => setDeliveryFees(e.target.value)}
                    dir="ltr"
                    placeholder="0.00"
                  />
                </div>
              )}

              {/* خاضعة لضريبة القيمة المضافة */}
              {deliveryFeesType !== 'NONE' && (
                <div className="space-y-2">
                  <Label className="text-right block">
                    {t('ضريبة القيمة المضافة', 'VAT Applicable', lang)}
                  </Label>
                  <div className="flex items-center gap-2 h-10 px-3 border rounded-md">
                    <Checkbox
                      id="deliveryFeesTaxable"
                      checked={deliveryFeesTaxable}
                      onCheckedChange={(checked) => setDeliveryFeesTaxable(checked === true)}
                    />
                    <label htmlFor="deliveryFeesTaxable" className="text-sm">
                      {t('خاضعة لضريبة القيمة المضافة', 'Subject to VAT', lang)}
                    </label>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* الوقود */}
              <div className="space-y-2">
                <Label className="text-right block flex items-center gap-1">
                  <Fuel className="size-3.5" />
                  {t('الوقود', 'Fuel', lang)}
                </Label>
                <Select value={fuelResponsibility} onValueChange={setFuelResponsibility}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {responsibilityOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* السائق */}
              <div className="space-y-2">
                <Label className="text-right block flex items-center gap-1">
                  <Wrench className="size-3.5" />
                  {t('التشغيل', 'Operation', lang)}
                </Label>
                <Select value={operationMode} onValueChange={setOperationMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operationModeOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* التأمين */}
              <div className="space-y-2">
                <Label className="text-right block flex items-center gap-1">
                  <Shield className="size-3.5" />
                  {t('التأمين', 'Insurance', lang)}
                </Label>
                <Select value={insuranceResponsibility} onValueChange={setInsuranceResponsibility}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {responsibilityOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════
            القسم الخامس: المستندات المرجعية (Reference Documents)
        ═══════════════════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-violet-700">
              <FileText className="size-5" />
              {t('القسم الخامس: المستندات المرجعية', 'Section 5: Reference Documents', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* رقم طلب البيع */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('رقم طلب البيع', 'Sales Order No.', lang)}
                </Label>
                <Input
                  value={mode === 'edit' && editContract?.salesOrderNo ? editContract.salesOrderNo : t('تلقائي', 'Auto-generated', lang)}
                  readOnly
                  className="bg-muted"
                />
              </div>

              {/* رقم طلب شراء العميل */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('رقم طلب شراء العميل', 'Client PO No.', lang)}
                </Label>
                <Input
                  value={purchaseOrderNo}
                  onChange={e => setPurchaseOrderNo(e.target.value)}
                  placeholder={t('رقم طلب الشراء', 'PO number', lang)}
                  dir="ltr"
                />
              </div>

              {/* رقم عرض السعر */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {t('رقم عرض السعر', 'Quotation No.', lang)}
                </Label>
                <Input
                  value={quotationNo}
                  onChange={e => setQuotationNo(e.target.value)}
                  placeholder={t('رقم عرض السعر', 'Quotation number', lang)}
                  dir="ltr"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════
            القسم السادس: الشروط (Terms)
        ═══════════════════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-rose-700">
              <Calendar className="size-5" />
              {t('القسم السادس: الشروط', 'Section 6: Terms', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-right block">
                {t('مدة السداد', 'Payment Duration', lang)}
              </Label>
              <Input
                value={paymentDuration}
                onChange={e => setPaymentDuration(e.target.value)}
                placeholder={t('مثال: 60 يوم', 'e.g. 60 days', lang)}
                className="sm:w-[280px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-right block">
                {t('شروط إضافية', 'Additional Terms', lang)}
              </Label>
              <Textarea
                value={additionalTerms}
                onChange={e => setAdditionalTerms(e.target.value)}
                placeholder={t('أي شروط إضافية للعقد...', 'Any additional contract terms...', lang)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-right block">
                {t('ملاحظات', 'Notes', lang)}
              </Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('ملاحظات إضافية...', 'Additional notes...', lang)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>
            {t('إلغاء', 'Cancel', lang)}
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="bg-emerald-600 hover:bg-emerald-700 min-w-[140px]"
          >
            {isSubmitting
              ? t('جاري الحفظ...', 'Saving...', lang)
              : mode === 'create'
                ? t('إنشاء العقد', 'Create Contract', lang)
                : t('حفظ التعديلات', 'Save Changes', lang)
            }
          </Button>
        </div>
      </form>
    </ModuleLayout>
  )
}

// ============ Contract Detail View ============
function ContractDetailView({
  contractId, onBack, onEdit,
}: {
  contractId: string
  onBack: () => void
  onEdit: () => void
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const { data: contract, isLoading } = useQuery<RentalContract>({
    queryKey: ['rental-contract', contractId],
    queryFn: async () => {
      const r = await fetch(`/api/equipment/rental-contracts/${contractId}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
  })

  // Status change mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/equipment/rental-contracts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-contract', contractId] })
      queryClient.invalidateQueries({ queryKey: ['rental-contracts'] })
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
    },
  })

  const handleStatusChange = (newStatus: string) => {
    if (contract) {
      statusMutation.mutate({ id: contract.id, status: newStatus })
    }
  }

  if (isLoading) {
    return <div className="p-4"><TableSkeleton rows={6} /></div>
  }

  if (!contract) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="size-12 mx-auto mb-2 text-amber-500" />
        <p>{t('العقد غير موجود', 'Contract not found', lang)}</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          <ArrowRight className="size-4 ml-1" />
          {t('العودة', 'Go Back', lang)}
        </Button>
      </div>
    )
  }

  const timesheets = contract.timesheets || []
  const totalTimesheetAmount = timesheets.reduce((s, ts) => s + Number(ts.totalAmount || 0), 0)
  const totalWorkedHours = timesheets.reduce((s, ts) => s + (ts.workedHours ?? 0), 0)

  const pricingLabel = pricingTypeOptions.find(p => p.value === contract.pricingType)
  const deliveryLabel = deliveryFeesTypeOptions.find(d => d.value === contract.deliveryFeesType)
  const operationLabel = operationModeOptions.find(o => o.value === contract.operationMode)
  const fuelLabel = responsibilityOptions.find(f => f.value === contract.fuelResponsibility)
  const insuranceLabel = responsibilityOptions.find(i => i.value === contract.insuranceResponsibility)

  const contractValue = contract.pricingType === 'HOURLY' ? (contract.referenceRate ?? 0)
    : contract.pricingType === 'DAILY' ? (contract.dailyRate ?? 0)
    : contract.pricingType === 'MONTHLY' ? (contract.monthlyRate ?? 0)
    : (contract.lumpSumAmount ?? 0)

  return (
    <ModuleLayout
      title={{ ar: contract.contractNo, en: contract.contractNo }}
      subtitle={{
        ar: `${contract.equipment?.nameAr || contract.equipment?.name || ''} — ${contract.client?.name || ''}`,
        en: `${contract.equipment?.name || ''} — ${contract.client?.name || ''}`,
      }}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowRight className="size-4" />
          </Button>
          <PrintButton type="rental-contract" documentId={contract.id} size="sm" />
        </div>
      }
    >
      {/* Status + Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ContractStatusBadge status={contract.status} lang={lang} />
          <span className="text-sm text-muted-foreground">
            {t('تاريخ الإنشاء:', 'Created:', lang)} {formatDate(contract.createdAt, lang)}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {contract.status === 'DRAFT' && (
            <>
              <Button
                className="bg-blue-600 hover:bg-blue-700 gap-1"
                onClick={() => handleStatusChange('UNDER_REVIEW')}
                disabled={statusMutation.isPending}
              >
                <Send className="size-4" />
                {t('إرسال للمراجعة', 'Submit for Review', lang)}
              </Button>
              <Button variant="outline" onClick={onEdit} className="gap-1">
                <Edit3 className="size-4" />
                {t('تعديل', 'Edit', lang)}
              </Button>
            </>
          )}
          {contract.status === 'UNDER_REVIEW' && (
            <>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                onClick={() => handleStatusChange('ACTIVE')}
                disabled={statusMutation.isPending}
              >
                <CheckCircle className="size-4" />
                {t('تفعيل العقد', 'Activate Contract', lang)}
              </Button>
              <Button variant="outline" onClick={onEdit} className="gap-1">
                <Edit3 className="size-4" />
                {t('تعديل', 'Edit', lang)}
              </Button>
            </>
          )}
          {contract.status === 'ACTIVE' && (
            <Button
              variant="outline"
              className="gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
              onClick={() => handleStatusChange('EXPIRED')}
              disabled={statusMutation.isPending}
            >
              <Clock className="size-4" />
              {t('إنهاء العقد', 'Expire Contract', lang)}
            </Button>
          )}
          {contract.status !== 'CANCELLED' && contract.status !== 'EXPIRED' && (
            <Button
              variant="outline"
              className="gap-1 text-red-600 border-red-300 hover:bg-red-50"
              onClick={() => handleStatusChange('CANCELLED')}
              disabled={statusMutation.isPending}
            >
              <Ban className="size-4" />
              {t('إلغاء', 'Cancel', lang)}
            </Button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-600">{t('قيمة العقد', 'Contract Value', lang)}</p>
            <p className="text-lg font-bold text-emerald-700">
              <MoneyDisplay value={contractValue} lang={lang} size="lg" bold />
            </p>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-teal-600">
              {pricingTypeOptions.find(p => p.value === contract.pricingType)?.[lang] || contract.pricingType}
            </p>
            <p className="text-lg font-bold text-teal-700">
              {contract.pricingType === 'HOURLY' && <MoneyDisplay value={contract.hourlyRate} lang={lang} size="lg" bold />}
              {contract.pricingType === 'DAILY' && <MoneyDisplay value={contract.dailyRate} lang={lang} size="lg" bold />}
              {contract.pricingType === 'MONTHLY' && <MoneyDisplay value={contract.monthlyRate} lang={lang} size="lg" bold />}
              {contract.pricingType === 'LUMP_SUM' && <MoneyDisplay value={contract.lumpSumAmount} lang={lang} size="lg" bold />}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-amber-600">{t('إجمالي التايم شيت', 'Timesheet Total', lang)}</p>
            <p className="text-lg font-bold text-amber-700">
              <MoneyDisplay value={totalTimesheetAmount} lang={lang} size="lg" bold />
            </p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-purple-600">{t('ساعات العمل', 'Worked Hours', lang)}</p>
            <p className="text-lg font-bold text-purple-700" dir="ltr">{formatNumber(totalWorkedHours)}</p>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════ Section 1: بيانات العقد ═══════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-emerald-700 text-base">
            <FileText className="size-4" />
            {t('بيانات العقد', 'Contract Data', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
            <DetailRow label={t('رقم العقد', 'Contract No.', lang)} value={contract.contractNo} mono />
            <DetailRow label={t('العميل', 'Client', lang)} value={contract.client?.name || ''} />
            <DetailRow label={t('المشروع', 'Project', lang)} value={contract.project?.name || ''} />
            <DetailRow label={t('المعدة', 'Equipment', lang)} value={contract.equipment?.nameAr || contract.equipment?.name || ''} />
            <DetailRow label={t('كود المعدة', 'Equipment Code', lang)} value={contract.equipment?.code || ''} mono />
            <DetailRow label={t('نوع النشاط', 'Activity Type', lang)} value={t('تأجير معدات', 'Equipment Rental', lang)} />
            <DetailRow label={t('تاريخ البداية', 'Start Date', lang)} value={formatDate(contract.startDate, lang)} />
            <DetailRow label={t('تاريخ النهاية', 'End Date', lang)} value={contract.endDate ? formatDate(contract.endDate, lang) : t('مفتوح', 'Open', lang)} />
          </div>
        </CardContent>
      </Card>

      {/* ═══════════ Section 2: موقع العمل ═══════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-cyan-700 text-base">
            <MapPin className="size-4" />
            {t('موقع العمل', 'Work Location', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <DetailRow label={t('مدينة المشروع', 'Project City', lang)} value={contract.workCity || ''} />
            <DetailRow label={t('موقع العمل', 'Work Location', lang)} value={contract.workLocation || ''} />
            <DetailRow label={t('اسم المسؤول', 'Site Supervisor', lang)} value={contract.siteSupervisor || ''} />
            <DetailRow label={t('رقم الجوال', 'Phone Number', lang)} value={contract.siteSupervisorPhone || ''} dirLtr />
          </div>
        </CardContent>
      </Card>

      {/* ═══════════ Section 3: التسعير ═══════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-teal-700 text-base">
            <DollarSign className="size-4" />
            {t('التسعير', 'Pricing', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
            <DetailRow label={t('نوع التسعير', 'Pricing Type', lang)} value={pricingLabel ? pricingLabel[lang] : contract.pricingType} />
            <DetailRow label={t('القيمة الشهرية المرجعية', 'Monthly Reference Rate', lang)} value={<MoneyDisplay value={contract.referenceRate} lang={lang} size="sm" bold />} />
            {contract.pricingType === 'HOURLY' && (
              <>
                <DetailRow label={t('ساعات التسعير المرجعية', 'Reference Hours', lang)} value={formatNumber(contract.referenceHours)} dirLtr />
                <DetailRow label={t('سعر الساعة', 'Hourly Rate', lang)} value={<MoneyDisplay value={contract.hourlyRate} lang={lang} size="sm" bold />} />
              </>
            )}
            {contract.pricingType === 'DAILY' && (
              <DetailRow label={t('السعر اليومي', 'Daily Rate', lang)} value={<MoneyDisplay value={contract.dailyRate} lang={lang} size="sm" bold />} />
            )}
            {contract.pricingType === 'MONTHLY' && (
              <DetailRow label={t('السعر الشهري', 'Monthly Rate', lang)} value={<MoneyDisplay value={contract.monthlyRate} lang={lang} size="sm" bold />} />
            )}
            {contract.pricingType === 'LUMP_SUM' && (
              <DetailRow label={t('المبلغ المقطوع', 'Lump Sum', lang)} value={<MoneyDisplay value={contract.lumpSumAmount} lang={lang} size="sm" bold />} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════ Section 4: التكاليف الإضافية ═══════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-orange-700 text-base">
            <Truck className="size-4" />
            {t('التكاليف الإضافية', 'Additional Costs', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
            <DetailRow label={t('رسوم النقل', 'Delivery Fees Type', lang)} value={deliveryLabel ? deliveryLabel[lang] : contract.deliveryFeesType} />
            {(contract.deliveryFeesType ?? 'NONE') !== 'NONE' && (
              <>
                <DetailRow label={t('مبلغ النقل', 'Delivery Amount', lang)} value={<MoneyDisplay value={contract.deliveryFees} lang={lang} size="sm" bold />} />
                <DetailRow label={t('ضريبة القيمة المضافة', 'VAT Applicable', lang)} value={contract.deliveryFeesTaxable ? t('نعم', 'Yes', lang) : t('لا', 'No', lang)} />
              </>
            )}
            <DetailRow label={t('الوقود', 'Fuel', lang)} value={fuelLabel ? fuelLabel[lang] : contract.fuelResponsibility || ''} />
            <DetailRow label={t('التشغيل', 'Operation', lang)} value={operationLabel ? operationLabel[lang] : contract.operationMode} />
            <DetailRow label={t('التأمين', 'Insurance', lang)} value={insuranceLabel ? insuranceLabel[lang] : contract.insuranceResponsibility || ''} />
          </div>
        </CardContent>
      </Card>

      {/* ═══════════ Section 5: المستندات المرجعية ═══════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-violet-700 text-base">
            <FileText className="size-4" />
            {t('المستندات المرجعية', 'Reference Documents', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
            <DetailRow label={t('رقم طلب البيع', 'Sales Order No.', lang)} value={contract.salesOrderNo || ''} mono />
            <DetailRow label={t('رقم طلب شراء العميل', 'Client PO No.', lang)} value={contract.purchaseOrderNo || ''} mono dirLtr />
            <DetailRow label={t('رقم عرض السعر', 'Quotation No.', lang)} value={contract.quotationNo || ''} mono dirLtr />
          </div>
        </CardContent>
      </Card>

      {/* ═══════════ Section 6: الشروط ═══════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-rose-700 text-base">
            <Calendar className="size-4" />
            {t('الشروط', 'Terms', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <DetailRow label={t('مدة السداد', 'Payment Duration', lang)} value={contract.paymentDuration || ''} />
            {contract.additionalTerms && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t('شروط إضافية', 'Additional Terms', lang)}</p>
                <p className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">{contract.additionalTerms}</p>
              </div>
            )}
            {contract.notes && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t('ملاحظات', 'Notes', lang)}</p>
                <p className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">{contract.notes}</p>
              </div>
            )}
            {!contract.additionalTerms && !contract.notes && (
              <p className="text-sm text-muted-foreground">{t('لا توجد شروط أو ملاحظات', 'No terms or notes', lang)}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════ Timesheets Table ═══════════ */}
      {timesheets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4" />
              {t('ساعات التشغيل', 'Timesheets', lang)}
              <Badge variant="secondary" className="mr-2">{timesheets.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الشهر', 'Month', lang)}</TableHead>
                    <TableHead className="text-right">{t('السنة', 'Year', lang)}</TableHead>
                    <TableHead className="text-right">{t('ساعات العمل', 'Hours', lang)}</TableHead>
                    <TableHead className="text-right">{t('سعر الساعة', 'Rate', lang)}</TableHead>
                    <TableHead className="text-right">{t('المجموع الفرعي', 'Subtotal', lang)}</TableHead>
                    <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheets.map(ts => (
                    <TableRow key={ts.id}>
                      <TableCell>{monthNames[ts.month - 1]?.[lang] || ts.month}</TableCell>
                      <TableCell dir="ltr">{ts.year}</TableCell>
                      <TableCell dir="ltr">{formatNumber(ts.workedHours)}</TableCell>
                      <TableCell><MoneyDisplay value={ts.hourlyRate} lang={lang} size="sm" /></TableCell>
                      <TableCell><MoneyDisplay value={ts.subtotal} lang={lang} size="sm" /></TableCell>
                      <TableCell><MoneyDisplay value={ts.vatAmount} lang={lang} size="sm" /></TableCell>
                      <TableCell className="font-medium"><MoneyDisplay value={ts.totalAmount} lang={lang} size="sm" bold /></TableCell>
                      <TableCell><TimesheetStatusBadge status={ts.status} lang={lang} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Timesheet Totals */}
            <div className="flex items-center justify-between p-4 border-t bg-muted/50">
              <span className="text-sm font-medium">{t('الإجمالي', 'Total', lang)}</span>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {t('ساعات', 'Hours', lang)}: <span className="font-medium" dir="ltr">{formatNumber(totalWorkedHours)}</span>
                </span>
                <span className="text-sm font-bold">
                  <MoneyDisplay value={totalTimesheetAmount} lang={lang} size="md" bold />
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </ModuleLayout>
  )
}

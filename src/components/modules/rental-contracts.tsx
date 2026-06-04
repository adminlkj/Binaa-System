'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw, ArrowRight, Calendar,
  DollarSign, Clock, Truck, Info, ChevronLeft, Eye, Edit3,
  CheckCircle, XCircle, AlertTriangle, FileSpreadsheet,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAppStore, formatNumber, formatDate } from '@/stores/app-store'
import { CurrencyAmount } from '@/contexts/company-context'
import { useFormatCurrency } from '@/contexts/currency-hooks'

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
  referenceRate: number; referenceHours: number; hourlyRate: number
  paymentTerms: string | null; purchaseOrderNo: string | null
  deliveryExpense: number; notes: string | null
  status: string; createdAt: string; updatedAt: string
  equipment: { id: string; code: string; name: string; nameAr: string | null; status?: string }
  timesheets: Timesheet[]
  client?: ClientOption
  project?: ProjectOption
}

// ============ Status Config ============
const contractStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-gray-700', bg: 'bg-gray-100' },
  ACTIVE: { label: { ar: 'نشط', en: 'Active' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  EXPIRED: { label: { ar: 'منتهي', en: 'Expired' }, color: 'text-amber-700', bg: 'bg-amber-100' },
  TERMINATED: { label: { ar: 'ملغي', en: 'Terminated' }, color: 'text-red-700', bg: 'bg-red-100' },
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

// Payment terms labels
const paymentTermsOptions: { value: string; ar: string; en: string }[] = [
  { value: 'immediate', ar: 'فوري', en: 'Immediate' },
  { value: 'net15', ar: '15 يوم', en: 'Net 15' },
  { value: 'net30', ar: '30 يوم', en: 'Net 30' },
  { value: 'net60', ar: '60 يوم', en: 'Net 60' },
  { value: 'net90', ar: '90 يوم', en: 'Net 90' },
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

// ============ Main Component ============
type ViewMode = 'list' | 'create' | 'edit' | 'detail'

export function RentalContractsModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
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
      c.purchaseOrderNo?.toLowerCase().includes(q)
    )
  }, [contracts, searchQuery])

  // KPIs
  const totalContracts = contracts.length
  const activeContracts = contracts.filter(c => c.status === 'ACTIVE').length
  const draftContracts = contracts.filter(c => c.status === 'DRAFT').length
  const totalReferenceRate = contracts.filter(c => c.status === 'ACTIVE').reduce((s, c) => s + c.referenceRate, 0)

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
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-6 text-emerald-600" />
            <h2 className="text-xl font-bold">
              {lang === 'ar' ? 'عقود التأجير' : 'Rental Contracts'}
            </h2>
          </div>
          <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Plus className="size-4" />
            {lang === 'ar' ? 'عقد جديد' : 'New Contract'}
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-emerald-600">{lang === 'ar' ? 'إجمالي العقود' : 'Total Contracts'}</p>
              <p className="text-2xl font-bold text-emerald-700">{formatNumber(totalContracts)}</p>
            </CardContent>
          </Card>
          <Card className="bg-teal-50 border-teal-200">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-teal-600">{lang === 'ar' ? 'عقود نشطة' : 'Active'}</p>
              <p className="text-2xl font-bold text-teal-700">{formatNumber(activeContracts)}</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-amber-600">{lang === 'ar' ? 'مسودات' : 'Drafts'}</p>
              <p className="text-2xl font-bold text-amber-700">{formatNumber(draftContracts)}</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-purple-600">{lang === 'ar' ? 'القيمة المرجعية' : 'Reference Value'}</p>
              <p className="text-lg font-bold text-purple-700"><CurrencyAmount amount={totalReferenceRate} /></p>
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
              placeholder={lang === 'ar' ? 'بحث بالرقم، المعدة...' : 'Search by number, equipment...'}
              className="pr-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={lang === 'ar' ? 'الحالة' : 'Status'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === 'ar' ? 'الكل' : 'All'}</SelectItem>
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
                <p>{lang === 'ar' ? 'لا توجد عقود تأجير' : 'No rental contracts found'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{lang === 'ar' ? 'رقم العقد' : 'Contract No.'}</TableHead>
                      <TableHead className="text-right">{lang === 'ar' ? 'المعدة' : 'Equipment'}</TableHead>
                      <TableHead className="text-right">{lang === 'ar' ? 'القيمة المرجعية' : 'Ref. Rate'}</TableHead>
                      <TableHead className="text-right">{lang === 'ar' ? 'الساعات المرجعية' : 'Ref. Hours'}</TableHead>
                      <TableHead className="text-right">{lang === 'ar' ? 'سعر الساعة' : 'Hourly Rate'}</TableHead>
                      <TableHead className="text-right">{lang === 'ar' ? 'تاريخ البداية' : 'Start Date'}</TableHead>
                      <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      <TableHead className="text-right">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContracts.map(contract => (
                      <TableRow key={contract.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewDetail(contract.id)}>
                        <TableCell className="font-mono font-semibold text-emerald-700">{contract.contractNo}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{contract.equipment?.nameAr || contract.equipment?.name}</p>
                            <p className="text-xs text-muted-foreground">{contract.equipment?.code}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium"><CurrencyAmount amount={contract.referenceRate} /></TableCell>
                        <TableCell dir="ltr">{formatNumber(contract.referenceHours)}</TableCell>
                        <TableCell className="font-medium text-emerald-600"><CurrencyAmount amount={contract.hourlyRate} /></TableCell>
                        <TableCell>{formatDate(contract.startDate, lang)}</TableCell>
                        <TableCell><ContractStatusBadge status={contract.status} lang={lang} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => handleViewDetail(contract.id)}>
                              <Eye className="size-4" />
                            </Button>
                            {contract.status === 'DRAFT' && (
                              <Button variant="ghost" size="icon" className="size-8" onClick={() => handleEdit(contract.id)}>
                                <Edit3 className="size-4" />
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
      </div>
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
        contracts={contracts}
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
        clientOptions={clientOptions}
        projectOptions={projectOptions}
      />
    )
  }

  return null
}

// ============ Contract Form View (Full Page Create/Edit) ============
function ContractFormView({
  mode, contractId, onBack, equipmentOptions, clientOptions, projectOptions, contracts,
}: {
  mode: 'create' | 'edit'
  contractId: string | null
  onBack: () => void
  equipmentOptions: EquipmentOption[]
  clientOptions: ClientOption[]
  projectOptions: ProjectOption[]
  contracts: RentalContract[]
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

  // Form state
  const [equipmentId, setEquipmentId] = useState('')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [referenceRate, setReferenceRate] = useState('')
  const [referenceHours, setReferenceHours] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [purchaseOrderNo, setPurchaseOrderNo] = useState('')
  const [deliveryExpense, setDeliveryExpense] = useState('')
  const [notes, setNotes] = useState('')

  // Populate form for edit mode
  React.useEffect(() => {
    if (mode === 'edit' && editContract) {
      setEquipmentId(editContract.equipmentId)
      setClientId(editContract.clientId)
      setProjectId(editContract.projectId || '')
      setStartDate(editContract.startDate ? new Date(editContract.startDate).toISOString().split('T')[0] : '')
      setEndDate(editContract.endDate ? new Date(editContract.endDate).toISOString().split('T')[0] : '')
      setReferenceRate(String(editContract.referenceRate))
      setReferenceHours(String(editContract.referenceHours))
      setPaymentTerms(editContract.paymentTerms || '')
      setPurchaseOrderNo(editContract.purchaseOrderNo || '')
      setDeliveryExpense(String(editContract.deliveryExpense))
      setNotes(editContract.notes || '')
    }
  }, [mode, editContract])

  // Calculate hourly rate
  const refRate = parseFloat(referenceRate) || 0
  const refHours = parseFloat(referenceHours) || 0
  const calculatedHourlyRate = refHours > 0 ? refRate / refHours : 0

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
    const data = {
      equipmentId,
      clientId,
      projectId: projectId || null,
      startDate,
      endDate: endDate || null,
      referenceRate,
      referenceHours,
      paymentTerms: paymentTerms || null,
      purchaseOrderNo: purchaseOrderNo || null,
      deliveryExpense,
      notes: notes || null,
      status: 'DRAFT' as const,
    }

    if (mode === 'create') {
      createMutation.mutate(data)
    } else if (contractId) {
      updateMutation.mutate({ ...data, id: contractId })
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  if (mode === 'edit' && editLoading) {
    return (
      <div className="p-4"><TableSkeleton rows={6} /></div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">
            {mode === 'create'
              ? (lang === 'ar' ? 'عقد تأجير جديد' : 'New Rental Contract')
              : (lang === 'ar' ? 'تعديل عقد التأجير' : 'Edit Rental Contract')
            }
          </h2>
          {mode === 'edit' && editContract && (
            <p className="text-sm text-muted-foreground font-mono">{editContract.contractNo}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Contract Info Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <FileText className="size-5" />
              {lang === 'ar' ? 'بيانات العقد' : 'Contract Information'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Equipment Selector */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {lang === 'ar' ? 'المعدة *' : 'Equipment *'}
                </Label>
                <Select value={equipmentId} onValueChange={setEquipmentId} required>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === 'ar' ? 'اختر المعدة' : 'Select equipment'} />
                  </SelectTrigger>
                  <SelectContent>
                    {equipmentOptions.map(eq => (
                      <SelectItem key={eq.id} value={eq.id}>
                        <span>{eq.nameAr || eq.name}</span>
                        <span className="text-muted-foreground mr-1">({eq.code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Client Selector */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {lang === 'ar' ? 'العميل *' : 'Client *'}
                </Label>
                <Select value={clientId} onValueChange={setClientId} required>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === 'ar' ? 'اختر العميل' : 'Select client'} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientOptions.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Project Selector (optional) */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {lang === 'ar' ? 'المشروع' : 'Project'}
                  <span className="text-muted-foreground text-xs"> ({lang === 'ar' ? 'اختياري' : 'optional'})</span>
                </Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === 'ar' ? 'اختر المشروع' : 'Select project'} />
                  </SelectTrigger>
                  <SelectContent>
                    {projectOptions.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nameAr || p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {lang === 'ar' ? 'تاريخ البداية *' : 'Start Date *'}
                </Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {lang === 'ar' ? 'تاريخ النهاية' : 'End Date'}
                </Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-teal-700">
              <DollarSign className="size-5" />
              {lang === 'ar' ? 'التسعير المرجعي' : 'Reference Pricing'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* القيمة الشهرية المرجعية */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {lang === 'ar' ? 'القيمة الشهرية المرجعية *' : 'Monthly Reference Rate *'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={referenceRate}
                  onChange={e => setReferenceRate(e.target.value)}
                  dir="ltr"
                  placeholder={lang === 'ar' ? 'مثال: 240,000' : 'e.g. 240,000'}
                  required
                />
              </div>

              {/* ساعات التسعير المرجعية */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {lang === 'ar' ? 'ساعات التسعير المرجعية *' : 'Reference Pricing Hours *'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={referenceHours}
                  onChange={e => setReferenceHours(e.target.value)}
                  dir="ltr"
                  placeholder={lang === 'ar' ? 'مثال: 260' : 'e.g. 260'}
                  required
                />
              </div>
            </div>

            {/* Hourly Rate Calculation Display */}
            {refRate > 0 && refHours > 0 && (
              <Card className="bg-emerald-50 border-emerald-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="size-4 text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-700">
                      {lang === 'ar' ? 'سعر الساعة المحسوب' : 'Calculated Hourly Rate'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-lg" dir="ltr">
                    <span className="font-semibold text-emerald-800">{formatNumber(refRate)}</span>
                    <span className="text-emerald-500">÷</span>
                    <span className="font-semibold text-emerald-800">{formatNumber(refHours)}</span>
                    <span className="text-emerald-500">=</span>
                    <span className="font-bold text-emerald-900 text-xl">{calculatedHourlyRate.toFixed(2)}</span>
                    <span className="text-emerald-600">{lang === 'ar' ? '﷼' : 'SAR'}</span>
                  </div>
                  <p className="text-xs text-emerald-500 mt-1">
                    {lang === 'ar'
                      ? 'القيمة الشهرية المرجعية ÷ ساعات التسعير المرجعية = سعر الساعة'
                      : 'Monthly Reference Rate ÷ Reference Hours = Hourly Rate'
                    }
                  </p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Contract Details Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-purple-700">
              <Truck className="size-5" />
              {lang === 'ar' ? 'تفاصيل العقد' : 'Contract Details'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* شروط السداد */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {lang === 'ar' ? 'شروط السداد' : 'Payment Terms'}
                </Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === 'ar' ? 'اختر شروط السداد' : 'Select payment terms'} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentTermsOptions.map(pt => (
                      <SelectItem key={pt.value} value={pt.value}>{pt[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* رقم طلب الشراء */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {lang === 'ar' ? 'رقم طلب الشراء' : 'Purchase Order No.'}
                </Label>
                <Input
                  value={purchaseOrderNo}
                  onChange={e => setPurchaseOrderNo(e.target.value)}
                  placeholder={lang === 'ar' ? 'رقم طلب الشراء' : 'PO number'}
                  dir="ltr"
                />
              </div>

              {/* مصروف توصيل */}
              <div className="space-y-2">
                <Label className="text-right block">
                  {lang === 'ar' ? 'مصروف توصيل' : 'Delivery Expense'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryExpense}
                  onChange={e => setDeliveryExpense(e.target.value)}
                  dir="ltr"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* ملاحظات */}
            <div className="space-y-2">
              <Label className="text-right block">
                {lang === 'ar' ? 'ملاحظات' : 'Notes'}
              </Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={lang === 'ar' ? 'ملاحظات إضافية...' : 'Additional notes...'}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>
            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !equipmentId || !clientId || !startDate || !referenceRate || !referenceHours}
            className="bg-emerald-600 hover:bg-emerald-700 min-w-[140px]"
          >
            {isSubmitting
              ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...')
              : mode === 'create'
                ? (lang === 'ar' ? 'إنشاء العقد' : 'Create Contract')
                : (lang === 'ar' ? 'حفظ التعديلات' : 'Save Changes')
            }
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Contract Detail View ============
function ContractDetailView({
  contractId, onBack, onEdit, clientOptions, projectOptions,
}: {
  contractId: string
  onBack: () => void
  onEdit: () => void
  clientOptions: ClientOption[]
  projectOptions: ProjectOption[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const { formatText } = useFormatCurrency()

  const { data: contract, isLoading, refetch } = useQuery<RentalContract>({
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

  // Get client/project name from options
  const clientName = React.useMemo(() => {
    if (!contract) return ''
    const found = clientOptions.find(c => c.id === contract.clientId)
    return found?.name || contract.clientId
  }, [contract, clientOptions])

  const projectName = React.useMemo(() => {
    if (!contract?.projectId) return ''
    const found = projectOptions.find(p => p.id === contract.projectId)
    return found?.name || contract.projectId
  }, [contract, projectOptions])

  if (isLoading) {
    return <div className="p-4"><TableSkeleton rows={6} /></div>
  }

  if (!contract) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="size-12 mx-auto mb-2 text-amber-500" />
        <p>{lang === 'ar' ? 'العقد غير موجود' : 'Contract not found'}</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          <ArrowRight className="size-4 ml-1" />
          {lang === 'ar' ? 'العودة' : 'Go Back'}
        </Button>
      </div>
    )
  }

  const timesheets = contract.timesheets || []
  const totalTimesheetAmount = timesheets.reduce((s, t) => s + t.totalAmount, 0)
  const totalWorkedHours = timesheets.reduce((s, t) => s + t.workedHours, 0)

  // Payment terms display
  const paymentTermsDisplay = contract.paymentTerms
    ? paymentTermsOptions.find(pt => pt.value === contract.paymentTerms)?.[lang] || contract.paymentTerms
    : (lang === 'ar' ? 'غير محدد' : 'Not specified')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{contract.contractNo}</h2>
            <ContractStatusBadge status={contract.status} lang={lang} />
          </div>
          <p className="text-sm text-muted-foreground">
            {contract.equipment?.nameAr || contract.equipment?.name} — {clientName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {contract.status === 'DRAFT' && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-1"
              onClick={() => handleStatusChange('ACTIVE')}
              disabled={statusMutation.isPending}
            >
              <CheckCircle className="size-4" />
              {lang === 'ar' ? 'تفعيل' : 'Activate'}
            </Button>
          )}
          {contract.status === 'ACTIVE' && (
            <>
              <Button
                variant="outline"
                className="gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                onClick={() => handleStatusChange('EXPIRED')}
                disabled={statusMutation.isPending}
              >
                <Clock className="size-4" />
                {lang === 'ar' ? 'إنهاء' : 'Expire'}
              </Button>
              <Button
                variant="outline"
                className="gap-1 text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => handleStatusChange('TERMINATED')}
                disabled={statusMutation.isPending}
              >
                <XCircle className="size-4" />
                {lang === 'ar' ? 'إلغاء' : 'Terminate'}
              </Button>
            </>
          )}
          {contract.status === 'DRAFT' && (
            <Button variant="outline" onClick={onEdit} className="gap-1">
              <Edit3 className="size-4" />
              {lang === 'ar' ? 'تعديل' : 'Edit'}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-600">{lang === 'ar' ? 'القيمة المرجعية' : 'Reference Rate'}</p>
            <p className="text-lg font-bold text-emerald-700"><CurrencyAmount amount={contract.referenceRate} /></p>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-teal-600">{lang === 'ar' ? 'سعر الساعة' : 'Hourly Rate'}</p>
            <p className="text-lg font-bold text-teal-700"><CurrencyAmount amount={contract.hourlyRate} /></p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-amber-600">{lang === 'ar' ? 'إجمالي التايم شيت' : 'Timesheet Total'}</p>
            <p className="text-lg font-bold text-amber-700"><CurrencyAmount amount={totalTimesheetAmount} /></p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-purple-600">{lang === 'ar' ? 'ساعات العمل' : 'Worked Hours'}</p>
            <p className="text-lg font-bold text-purple-700" dir="ltr">{formatNumber(totalWorkedHours)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Contract Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Contract Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-emerald-700 text-base">
              <FileText className="size-4" />
              {lang === 'ar' ? 'بيانات العقد' : 'Contract Details'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <DetailRow label={lang === 'ar' ? 'رقم العقد' : 'Contract No.'} value={contract.contractNo} mono />
              <DetailRow label={lang === 'ar' ? 'المعدة' : 'Equipment'} value={contract.equipment?.nameAr || contract.equipment?.name || ''} />
              <DetailRow label={lang === 'ar' ? 'كود المعدة' : 'Equipment Code'} value={contract.equipment?.code || ''} mono />
              <DetailRow label={lang === 'ar' ? 'العميل' : 'Client'} value={clientName} />
              {projectName && <DetailRow label={lang === 'ar' ? 'المشروع' : 'Project'} value={projectName} />}
              <DetailRow label={lang === 'ar' ? 'تاريخ البداية' : 'Start Date'} value={formatDate(contract.startDate, lang)} />
              <DetailRow label={lang === 'ar' ? 'تاريخ النهاية' : 'End Date'} value={contract.endDate ? formatDate(contract.endDate, lang) : (lang === 'ar' ? 'غير محدد' : 'Not set')} />
              <DetailRow label={lang === 'ar' ? 'الحالة' : 'Status'} value="">
                <ContractStatusBadge status={contract.status} lang={lang} />
              </DetailRow>
            </div>
          </CardContent>
        </Card>

        {/* Right: Pricing & Terms */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-teal-700 text-base">
              <DollarSign className="size-4" />
              {lang === 'ar' ? 'التسعير والشروط' : 'Pricing & Terms'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <DetailRow label={lang === 'ar' ? 'القيمة الشهرية المرجعية' : 'Monthly Reference Rate'} value={formatText(contract.referenceRate)} dir="ltr" />
              <DetailRow label={lang === 'ar' ? 'ساعات التسعير المرجعية' : 'Reference Hours'} value={formatNumber(contract.referenceHours)} dir="ltr" />
              <DetailRow label={lang === 'ar' ? 'سعر الساعة' : 'Hourly Rate'} value={formatText(contract.hourlyRate)} dir="ltr" bold />

              {/* Calculation Display */}
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                <div className="flex items-center gap-2 text-sm" dir="ltr">
                  <span className="text-emerald-700">{formatNumber(contract.referenceRate)}</span>
                  <span className="text-emerald-400">÷</span>
                  <span className="text-emerald-700">{formatNumber(contract.referenceHours)}</span>
                  <span className="text-emerald-400">=</span>
                  <span className="font-bold text-emerald-800">{contract.hourlyRate.toFixed(2)}</span>
                  <span className="text-emerald-600">{lang === 'ar' ? '﷼' : 'SAR'}</span>
                </div>
              </div>

              <Separator />
              <DetailRow label={lang === 'ar' ? 'شروط السداد' : 'Payment Terms'} value={paymentTermsDisplay} />
              {contract.purchaseOrderNo && (
                <DetailRow label={lang === 'ar' ? 'رقم طلب الشراء' : 'PO Number'} value={contract.purchaseOrderNo} mono />
              )}
              {contract.deliveryExpense > 0 && (
                <DetailRow label={lang === 'ar' ? 'مصروف توصيل' : 'Delivery Expense'} value={formatText(contract.deliveryExpense)} dir="ltr" />
              )}
              {contract.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</p>
                  <p className="text-sm bg-gray-50 rounded p-2">{contract.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timesheets Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-purple-700 text-base">
              <FileSpreadsheet className="size-4" />
              {lang === 'ar' ? 'التايم شيت' : 'Timesheets'}
              <Badge variant="secondary" className="mr-2">{formatNumber(timesheets.length)}</Badge>
            </CardTitle>
            {contract.status === 'ACTIVE' && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-purple-600 border-purple-300 hover:bg-purple-50"
                onClick={() => {
                  const { setActiveModule } = useAppStore.getState()
                  setActiveModule('timesheets')
                }}
              >
                <Plus className="size-3" />
                {lang === 'ar' ? 'إضافة تايم شيت' : 'Add Timesheet'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {timesheets.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileSpreadsheet className="size-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{lang === 'ar' ? 'لا توجد سجلات تايم شيت لهذا العقد' : 'No timesheet records for this contract'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'الشهر' : 'Month'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الساعات الفعلية' : 'Worked Hours'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'سعر الساعة' : 'Hourly Rate'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المبلغ' : 'Subtotal'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'ضريبة' : 'VAT'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'ملاحظات' : 'Remarks'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheets.map(ts => (
                    <TableRow key={ts.id}>
                      <TableCell className="font-medium">
                        {monthNames[ts.month - 1]?.[lang]} {ts.year}
                      </TableCell>
                      <TableCell dir="ltr">{formatNumber(ts.workedHours)}</TableCell>
                      <TableCell><CurrencyAmount amount={ts.hourlyRate} /></TableCell>
                      <TableCell className="font-medium"><CurrencyAmount amount={ts.subtotal} /></TableCell>
                      <TableCell><CurrencyAmount amount={ts.vatAmount} /></TableCell>
                      <TableCell className="font-bold text-emerald-700"><CurrencyAmount amount={ts.totalAmount} /></TableCell>
                      <TableCell><TimesheetStatusBadge status={ts.status} lang={lang} /></TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {ts.remarks || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Helper: Detail Row ============
function DetailRow({
  label, value, mono, dir, bold, children,
}: {
  label: string
  value: string
  mono?: boolean
  dir?: string
  bold?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children || (
        <span className={`text-sm ${bold ? 'font-semibold' : 'font-medium'} ${mono ? 'font-mono' : ''}`} dir={dir}>
          {value}
        </span>
      )}
    </div>
  )
}

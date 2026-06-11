'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileCheck, Plus, Search, RefreshCw, Eye, ArrowRight,
  Download, Truck, CheckCircle2, RotateCcw, XCircle,
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { useAppStore, formatDate as storeFormatDate } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
interface EquipmentOption { id: string; code: string; name: string; nameAr?: string | null; hourlyRate: number; dailyRate: number; monthlyRate: number }
interface ClientOption { id: string; code: string; name: string; nameAr?: string | null }
interface ProjectOption { id: string; code: string; name: string; nameAr?: string | null }

interface DeliveryOrder {
  id: string; orderNo: string; rentalId: string | null; equipmentId: string; clientId: string; projectId: string | null
  site: string | null; deliveryDate: string; returnDate: string | null; status: string; notes: string | null
  createdAt: string; updatedAt: string
  equipment: { id: string; code: string; name: string; nameAr?: string | null }
  rental?: { id: string; rateType: string; rate: number; status: string } | null
  client: { id: string; code: string; name: string; nameAr?: string | null }
  project?: { id: string; code: string; name: string; nameAr?: string | null } | null
}

// ============ View State ============
type ViewState =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'detail'; orderId: string }

function formatDate(dateStr: string, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatDate(dateStr, lang)
}

const orderStatusLabels: Record<string, string> = {
  PENDING: 'في الانتظار', DELIVERED: 'تم التوصيل', RETURNED: 'تم الإرجاع', CANCELLED: 'ملغي',
}
const orderStatusLabelsEn: Record<string, string> = {
  PENDING: 'Pending', DELIVERED: 'Delivered', RETURNED: 'Returned', CANCELLED: 'Cancelled',
}
const orderStatusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  DELIVERED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  RETURNED: 'bg-blue-100 text-blue-700 border-blue-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
}
const orderStatusIcons: Record<string, React.ReactNode> = {
  PENDING: <Truck className="size-3.5" />,
  DELIVERED: <CheckCircle2 className="size-3.5" />,
  RETURNED: <RotateCcw className="size-3.5" />,
  CANCELLED: <XCircle className="size-3.5" />,
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Delivery Order Creation Form ============
function DeliveryOrderFormPage({
  clients, projects, equipmentList, onBack,
}: {
  clients: ClientOption[]; projects: ProjectOption[]; equipmentList: EquipmentOption[]; onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [equipmentId, setEquipmentId] = useState('')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [site, setSite] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [notes, setNotes] = useState('')

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/delivery-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['delivery-orders'] }); onBack() },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      equipmentId, clientId, projectId: projectId || null,
      site: site || null, deliveryDate, returnDate: returnDate || null,
      notes: notes || null,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 no-print">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t('أمر توصيل جديد', 'New Delivery Order')}</h1>
          <p className="text-sm text-muted-foreground">{t('إنشاء أمر توصيل معدات لموقع المشروع', 'Create equipment delivery order to project site')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Equipment & Client */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('المعلومات الأساسية', 'Basic Information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('المعدة *', 'Equipment *')}</Label>
                <Select value={equipmentId} onValueChange={setEquipmentId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر المعدة', 'Select equipment')} /></SelectTrigger>
                  <SelectContent>
                    {equipmentList.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('العميل *', 'Client *')}</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر العميل', 'Select client')} /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('المشروع', 'Project')}</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر المشروع', 'Select project')} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Delivery Details */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('تفاصيل التوصيل', 'Delivery Details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{t('موقع التوصيل', 'Delivery Site')}</Label>
                <Input value={site} onChange={e => setSite(e.target.value)} placeholder={t('موقع المشروع', 'Project site')} />
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ التوصيل *', 'Delivery Date *')}</Label>
                <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ الإرجاع المتوقع', 'Expected Return Date')}</Label>
                <Input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Notes */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('ملاحظات', 'Notes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ملاحظات إضافية', 'Additional notes')} rows={3} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 no-print">
          <Button type="button" variant="outline" onClick={onBack}>{t('إلغاء', 'Cancel')}</Button>
          <Button type="submit" disabled={createMutation.isPending || !equipmentId || !clientId || !deliveryDate} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء أمر التوصيل', 'Create Delivery Order')}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Main Delivery Orders Module ============
export function DeliveryOrdersModule() {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: orders = [], isLoading, isError, refetch } = useQuery<DeliveryOrder[]>({
    queryKey: ['delivery-orders'],
    queryFn: async () => {
      const res = await fetch('/api/delivery-orders')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['clients-simple'],
    queryFn: async () => {
      const res = await fetch('/api/clients?simple=true&active=true')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['projects-list'],
    queryFn: async () => {
      const res = await fetch('/api/projects/list')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: equipmentList = [] } = useQuery<EquipmentOption[]>({
    queryKey: ['equipment-list-do'],
    queryFn: async () => {
      const res = await fetch('/api/equipment')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Status update mutation
  const queryClient = useQueryClient()
  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch('/api/delivery-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['delivery-orders'] }) },
  })

  // ============ CREATE VIEW ============
  if (viewState.type === 'create') {
    return (
      <DeliveryOrderFormPage
        clients={clients}
        projects={projects}
        equipmentList={equipmentList}
        onBack={() => setViewState({ type: 'list' })}
      />
    )
  }

  // ============ DETAIL VIEW ============
  if (viewState.type === 'detail') {
    const order = orders.find(o => o.id === viewState.orderId)
    if (!order) {
      return (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('لم يتم العثور على أمر التوصيل', 'Delivery order not found')}</p>
          <Button variant="outline" onClick={() => setViewState({ type: 'list' })}>{t('العودة للقائمة', 'Back to list')}</Button>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 no-print">
          <Button variant="outline" size="icon" onClick={() => setViewState({ type: 'list' })}>
            <ArrowRight className="size-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">{t('أمر توصيل', 'Delivery Order')} {order.orderNo}</h2>
              <Badge variant="outline" className={orderStatusColors[order.status]}>
                <span className="flex items-center gap-1">
                  {orderStatusIcons[order.status]}
                  {orderStatusLabels[order.status]}
                </span>
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{order.client.name} — {order.equipment.name}</p>
          </div>
          <PrintButton type="delivery-order" documentId={order.id} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{t('العميل', 'Client')}</p>
              <p className="text-sm font-medium truncate">{order.client.name}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{t('المعدة', 'Equipment')}</p>
              <p className="text-sm font-medium truncate">{order.equipment.name}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{t('تاريخ التوصيل', 'Delivery Date')}</p>
              <p className="text-sm font-medium">{formatDate(order.deliveryDate, lang)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{t('تاريخ الإرجاع', 'Return Date')}</p>
              <p className="text-sm font-medium">{order.returnDate ? formatDate(order.returnDate, lang) : '—'}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('تفاصيل أمر التوصيل', 'Delivery Order Details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t('رقم أمر التوصيل', 'Order No.')}</Label>
                <p className="text-sm font-mono font-medium" dir="ltr">{order.orderNo}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t('المشروع', 'Project')}</Label>
                <p className="text-sm font-medium">{order.project?.name || '—'}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t('موقع التوصيل', 'Delivery Site')}</Label>
                <p className="text-sm font-medium">{order.site || '—'}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t('الحالة', 'Status')}</Label>
                <Badge variant="outline" className={orderStatusColors[order.status]}>
                  <span className="flex items-center gap-1">
                    {orderStatusIcons[order.status]}
                    {orderStatusLabels[order.status]}
                  </span>
                </Badge>
              </div>
            </div>

            {order.rental && (
              <>
                <Separator />
                <div>
                  <Label className="text-xs text-muted-foreground">{t('بيانات عقد الإيجار', 'Rental Contract Data')}</Label>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('نوع السعر', 'Rate Type')}</p>
                      <p className="text-sm font-medium">{order.rental.rateType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('السعر', 'Rate')}</p>
                      <MoneyDisplay value={order.rental.rate} lang={lang} size="sm" inline />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('حالة العقد', 'Contract Status')}</p>
                      <p className="text-sm font-medium">{order.rental.status}</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {order.notes && (
              <>
                <Separator />
                <div>
                  <Label className="text-xs text-muted-foreground">{t('ملاحظات', 'Notes')}</Label>
                  <p className="text-sm mt-1">{order.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Status Actions */}
        <Card className="no-print">
          <CardHeader>
            <CardTitle className="text-lg">{t('تحديث الحالة', 'Update Status')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {order.status === 'PENDING' && (
                <Button
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: order.id, status: 'DELIVERED' })}
                >
                  <CheckCircle2 className="size-4" />
                  {t('تأكيد التوصيل', 'Confirm Delivery')}
                </Button>
              )}
              {order.status === 'DELIVERED' && (
                <Button
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: order.id, status: 'RETURNED' })}
                >
                  <RotateCcw className="size-4" />
                  {t('تأكيد الإرجاع', 'Confirm Return')}
                </Button>
              )}
              {(order.status === 'PENDING' || order.status === 'DELIVERED') && (
                <Button
                  variant="outline"
                  className="gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: order.id, status: 'CANCELLED' })}
                >
                  <XCircle className="size-4" />
                  {t('إلغاء', 'Cancel')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ============ LIST VIEW ============
  const filtered = orders.filter(order => {
    const matchSearch = !search || order.orderNo.toLowerCase().includes(search.toLowerCase()) ||
      order.client.name.toLowerCase().includes(search.toLowerCase()) ||
      order.equipment.name.toLowerCase().includes(search.toLowerCase()) ||
      (order.site?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === 'all' || order.status === statusFilter
    return matchSearch && matchStatus
  })

  const pendingCount = orders.filter(o => o.status === 'PENDING').length
  const deliveredCount = orders.filter(o => o.status === 'DELIVERED').length
  const returnedCount = orders.filter(o => o.status === 'RETURNED').length

  const handleExport = () => {
    const csv = [
      [t('رقم الأمر', 'Order No'), t('العميل', 'Client'), t('المعدة', 'Equipment'), t('الموقع', 'Site'), t('تاريخ التوصيل', 'Delivery Date'), t('تاريخ الإرجاع', 'Return Date'), t('الحالة', 'Status')].join(','),
      ...filtered.map(order => [order.orderNo, `"${order.client.name}"`, `"${order.equipment.name}"`, `"${order.site || ''}"`, formatDate(order.deliveryDate, lang), order.returnDate ? formatDate(order.returnDate, lang) : '', orderStatusLabels[order.status]].join(','))
    ].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `delivery-orders-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('أوامر التوصيل', 'Delivery Orders')}</h1>
          <p className="text-sm text-muted-foreground">{t('إدارة أوامر توصيل المعدات للمواقع', 'Manage equipment delivery orders to sites')}</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport} title={t('تصدير', 'Export')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
            <Plus className="size-4" /> {t('أمر توصيل جديد', 'New Delivery Order')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm text-amber-600">{t('في الانتظار', 'Pending')}</p>
            <p className="text-xl font-bold text-amber-700">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4">
            <p className="text-sm text-emerald-600">{t('تم التوصيل', 'Delivered')}</p>
            <p className="text-xl font-bold text-emerald-700">{deliveredCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-sm text-blue-600">{t('تم الإرجاع', 'Returned')}</p>
            <p className="text-xl font-bold text-blue-700">{returnedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t('بحث برقم الأمر أو العميل أو المعدة...', 'Search by order no., client or equipment...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('كل الحالات', 'All Status')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الحالات', 'All Status')}</SelectItem>
                <SelectItem value="PENDING">{t('في الانتظار', 'Pending')}</SelectItem>
                <SelectItem value="DELIVERED">{t('تم التوصيل', 'Delivered')}</SelectItem>
                <SelectItem value="RETURNED">{t('تم الإرجاع', 'Returned')}</SelectItem>
                <SelectItem value="CANCELLED">{t('ملغي', 'Cancelled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
              <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <FileCheck className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t('لا توجد أوامر توصيل', 'No delivery orders')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
                <Plus className="size-4 mr-1" /> {t('إنشاء أمر توصيل', 'Create Delivery Order')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('رقم الأمر', 'Order No')}</TableHead>
                    <TableHead className="text-right">{t('العميل', 'Client')}</TableHead>
                    <TableHead className="text-right">{t('المعدة', 'Equipment')}</TableHead>
                    <TableHead className="text-right">{t('الموقع', 'Site')}</TableHead>
                    <TableHead className="text-right">{t('تاريخ التوصيل', 'Delivery Date')}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                    <TableHead className="text-right">{t('الإجراءات', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(order => (
                    <TableRow key={order.id} className="cursor-pointer hover:bg-amber-50/50" onClick={() => setViewState({ type: 'detail', orderId: order.id })}>
                      <TableCell className="font-medium font-mono">{order.orderNo}</TableCell>
                      <TableCell>{order.client.name}</TableCell>
                      <TableCell>{order.equipment.name}</TableCell>
                      <TableCell className="text-sm">{order.site || '—'}</TableCell>
                      <TableCell>{formatDate(order.deliveryDate, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={orderStatusColors[order.status]}>
                          <span className="flex items-center gap-1">
                            {orderStatusIcons[order.status]}
                            {orderStatusLabels[order.status]}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewState({ type: 'detail', orderId: order.id })} title={t('تفاصيل', 'Details')}>
                            <Eye className="size-4" />
                          </Button>
                          {order.status === 'PENDING' && (
                            <Button variant="ghost" size="icon" className="size-8 text-emerald-600" onClick={() => updateMutation.mutate({ id: order.id, status: 'DELIVERED' })} title={t('تأكيد التوصيل', 'Confirm Delivery')}>
                              <CheckCircle2 className="size-4" />
                            </Button>
                          )}
                          {order.status === 'DELIVERED' && (
                            <Button variant="ghost" size="icon" className="size-8 text-blue-600" onClick={() => updateMutation.mutate({ id: order.id, status: 'RETURNED' })} title={t('تأكيد الإرجاع', 'Confirm Return')}>
                              <RotateCcw className="size-4" />
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

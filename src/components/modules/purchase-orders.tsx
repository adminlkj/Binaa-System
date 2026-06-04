'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart, Plus, Search, RefreshCw, Eye, ArrowRight, X,
  Printer, Download, CheckCircle, Clock, AlertCircle,
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
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatSAR, formatDate, formatNumber } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
type ViewState =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'detail'; id: string }
  | { type: 'preview'; id: string }

interface SupplierOption { id: string; code: string; name: string }
interface ProjectOption { id: string; code: string; name: string }

interface POLineItem {
  id: string; description: string; quantity: number; unit: string | null
  unitPrice: number; totalPrice: number
}

interface PurchaseOrder {
  id: string; orderNo: string; projectId: string | null; supplierId: string
  date: string; deliveryDate: string | null; subtotal: number; vatRate: number
  vatAmount: number; totalAmount: number; paidAmount: number; status: string
  notes: string | null
  supplier: { id: string; name: string; code: string }
  project: { id: string; name: string; code: string } | null
  items: POLineItem[]
  _count: { invoices: number }
}

interface LineItemForm {
  description: string; quantity: number; unit: string; unitPrice: number
}

// ============ Constants ============
const poStatusLabels: Record<string, string> = {
  DRAFT: 'مسودة', PENDING_APPROVAL: 'بانتظار الاعتماد', APPROVED: 'معتمد',
  PARTIALLY_RECEIVED: 'مستلم جزئياً', RECEIVED: 'مستلم', CANCELLED: 'ملغي',
}
const poStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-blue-100 text-blue-700 border-blue-200',
  PARTIALLY_RECEIVED: 'bg-orange-100 text-orange-700 border-orange-200',
  RECEIVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
}

const defaultLineItem: LineItemForm = { description: '', quantity: 1, unit: '', unitPrice: 0 }

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Print Helper ============
function printElement() {
  window.print()
}

// ============ List View ============
function POListView({
  onCreateNew,
  onViewDetail,
  onPreview,
}: {
  onCreateNew: () => void
  onViewDetail: (id: string) => void
  onPreview: (id: string) => void
}) {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: purchaseOrders = [], isLoading, isError, refetch } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-orders')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const filtered = purchaseOrders.filter(po => {
    const matchSearch = !search || po.orderNo.toLowerCase().includes(search.toLowerCase()) || po.supplier.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || po.status === statusFilter
    return matchSearch && matchStatus
  })

  // Summary
  const totalPOAmount = purchaseOrders.reduce((s, o) => s + o.totalAmount, 0)
  const approvedCount = purchaseOrders.filter(o => o.status === 'APPROVED').length
  const pendingCount = purchaseOrders.filter(o => o.status === 'PENDING_APPROVAL' || o.status === 'DRAFT').length

  // Export
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'orderNo', label: t('رقم الأمر', 'PO Number') },
      { key: 'supplierName', label: t('المورد', 'Supplier') },
      { key: 'projectName', label: t('المشروع', 'Project') },
      { key: 'date', label: t('التاريخ', 'Date') },
      { key: 'subtotal', label: t('المجموع قبل الضريبة', 'Subtotal'), format: (v) => Number(v).toFixed(2) },
      { key: 'vatAmount', label: t('الضريبة', 'VAT'), format: (v) => Number(v).toFixed(2) },
      { key: 'totalAmount', label: t('الإجمالي', 'Total'), format: (v) => Number(v).toFixed(2) },
      { key: 'status', label: t('الحالة', 'Status'), format: (v) => poStatusLabels[v as string] || String(v) },
    ]
    const rows = filtered.map(po => ({
      orderNo: po.orderNo,
      supplierName: po.supplier.name,
      projectName: po.project?.name || '',
      date: formatDate(po.date, lang),
      subtotal: po.subtotal,
      vatAmount: po.vatAmount,
      totalAmount: po.totalAmount,
      status: po.status,
    }))
    exportToCSV(rows, `purchase-orders-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('أوامر الشراء', 'Purchase Orders')}</h1>
          <p className="text-sm text-muted-foreground">{t('إدارة أوامر شراء المواد والخدمات', 'Manage purchase orders for materials and services')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => printElement()} title={t('طباعة', 'Print')}>
            <Printer className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleExport} title={t('تصدير CSV', 'Export CSV')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={onCreateNew}>
            <Plus className="size-4" /> {t('أمر شراء جديد', 'New PO')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <ShoppingCart className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{t('إجمالي أوامر الشراء', 'Total POs')}</p>
              <MoneyDisplay value={totalPOAmount} mode="system" lang={lang} bold size="lg" className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center">
              <CheckCircle className="size-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-600">{t('أوامر معتمدة', 'Approved')}</p>
              <p className="text-xl font-bold text-blue-700">{formatNumber(approvedCount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600">{t('بانتظار الاعتماد', 'Pending')}</p>
              <p className="text-xl font-bold text-amber-700">{formatNumber(pendingCount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t('بحث بالرقم أو اسم المورد...', 'Search by number or supplier...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('كل الحالات', 'All Statuses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الحالات', 'All Statuses')}</SelectItem>
                {Object.entries(poStatusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
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
              <AlertCircle className="size-12 text-rose-300" />
              <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
              <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <ShoppingCart className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t('لا توجد أوامر شراء', 'No purchase orders')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onCreateNew}>
                <Plus className="size-4 mr-1" /> {t('إنشاء أمر شراء', 'Create PO')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('رقم الأمر', 'PO Number')}</TableHead>
                    <TableHead className="text-right">{t('المورد', 'Supplier')}</TableHead>
                    <TableHead className="text-right">{t('المشروع', 'Project')}</TableHead>
                    <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                    <TableHead className="text-right">{t('الإجراءات', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(po => (
                    <TableRow key={po.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => onViewDetail(po.id)}>
                      <TableCell className="font-medium font-mono">{po.orderNo}</TableCell>
                      <TableCell>{po.supplier.name}</TableCell>
                      <TableCell>{po.project?.name || '—'}</TableCell>
                      <TableCell>{formatDate(po.date, lang)}</TableCell>
                      <TableCell className="font-semibold">
                        <MoneyDisplay value={po.totalAmount} mode="system" lang={lang} bold size="sm" />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={poStatusColors[po.status]}>
                          {poStatusLabels[po.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); onViewDetail(po.id) }} title={t('عرض', 'View')}>
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); onPreview(po.id) }} title={t('معاينة', 'Preview')}>
                            <Printer className="size-4" />
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
    </div>
  )
}

// ============ Create View ============
function POCreateView({ onBack }: { onBack: () => void }) {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  const queryClient = useQueryClient()

  const [supplierId, setSupplierId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ ...defaultLineItem }])

  // Fetch suppliers & projects
  const { data: suppliers = [] } = useQuery<SupplierOption[]>({
    queryKey: ['suppliers-simple'],
    queryFn: async () => {
      const res = await fetch('/api/suppliers?active=true')
      if (!res.ok) return []
      const data = await res.json()
      return data.map((s: { id: string; code: string; name: string }) => ({ id: s.id, code: s.code, name: s.name }))
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

  const subtotal = useMemo(() => lineItems.reduce((s, i) => s + (i.quantity * i.unitPrice), 0), [lineItems])
  const vatRate = 0.15
  const vatAmount = subtotal * vatRate
  const totalAmount = subtotal + vatAmount

  const addLine = () => setLineItems([...lineItems, { ...defaultLineItem }])
  const removeLine = (idx: number) => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)) }
  const updateLine = (idx: number, field: keyof LineItemForm, value: string | number) => {
    setLineItems(lineItems.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/purchase-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); onBack() },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      supplierId, projectId: projectId || null, date, deliveryDate: deliveryDate || null, notes,
      items: lineItems.map(i => ({ description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice })),
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('أمر شراء جديد', 'New Purchase Order')}</h1>
          <p className="text-sm text-muted-foreground">{t('إنشاء أمر شراء جديد مع البنود', 'Create a new purchase order with line items')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('معلومات أساسية', 'Basic Information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('المورد *', 'Supplier *')}</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر المورد', 'Select supplier')} /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('المشروع (اختياري)', 'Project (optional)')}</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر المشروع', 'Select project')} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ الأمر *', 'Order Date *')}</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ التسليم', 'Delivery Date')}</Label>
                <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t('بنود أمر الشراء', 'PO Line Items')}</CardTitle>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
                <Plus className="size-3" /> {t('إضافة بند', 'Add Item')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2 p-3 rounded-lg border bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">{t('الوصف', 'Description')}</Label>
                    <Input value={item.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder={t('وصف البند', 'Item description')} className="h-9" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t('الكمية', 'Qty')}</Label>
                    <Input type="number" min="0" step="0.01" value={item.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t('الوحدة', 'Unit')}</Label>
                    <Input value={item.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} placeholder={t('وحدة', 'Unit')} className="h-9" />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">{t('سعر الوحدة', 'Unit Price')}</Label>
                    <Input type="number" min="0" step="0.01" value={item.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-28 text-left">
                    <Label className="text-xs">{t('الإجمالي', 'Total')}</Label>
                    <p className="text-sm font-medium mt-1.5">
                      <MoneyDisplay value={item.quantity * item.unitPrice} mode="system" lang={lang} size="sm" />
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 text-rose-500" onClick={() => removeLine(idx)} disabled={lineItems.length <= 1}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="bg-gray-50 border-dashed">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('المجموع قبل الضريبة', 'Subtotal')}</span>
              <span className="font-medium"><MoneyDisplay value={subtotal} mode="system" lang={lang} size="sm" /></span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t('ضريبة القيمة المضافة (15%)', 'VAT (15%)')}</span>
              <span className="font-medium"><MoneyDisplay value={vatAmount} mode="system" lang={lang} size="sm" /></span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>{t('الإجمالي', 'Total')}</span>
              <span className="text-emerald-700"><MoneyDisplay value={totalAmount} mode="system" lang={lang} bold size="lg" /></span>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('ملاحظات', 'Notes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ملاحظات إضافية', 'Additional notes')} rows={3} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>{t('إلغاء', 'Cancel')}</Button>
          <Button type="submit" disabled={createMutation.isPending || !supplierId || !date} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء أمر الشراء', 'Create PO')}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Detail View ============
function PODetailView({ id, onBack, onPreview }: { id: string; onBack: () => void; onPreview: (id: string) => void }) {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const { data: order, isLoading, isError, refetch } = useQuery<PurchaseOrder>({
    queryKey: ['purchase-orders', id],
    queryFn: async () => {
      const res = await fetch('/api/purchase-orders')
      if (!res.ok) throw new Error()
      const all: PurchaseOrder[] = await res.json()
      return all.find(o => o.id === id)!
    },
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6"><TableSkeleton /></div>
  if (isError || !order) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <AlertCircle className="size-12 text-rose-300" />
        <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
        <Button variant="outline" onClick={onBack}>{t('رجوع', 'Go Back')}</Button>
      </div>
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
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{t('أمر شراء', 'Purchase Order')} {order.orderNo}</h2>
            <Badge variant="outline" className={poStatusColors[order.status]}>
              {poStatusLabels[order.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{order.supplier.name}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => onPreview(id)}>
          <Printer className="size-4" /> {t('معاينة وطباعة', 'Preview & Print')}
        </Button>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('المورد', 'Supplier')}</p>
            <p className="text-sm font-medium truncate">{order.supplier.name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('المشروع', 'Project')}</p>
            <p className="text-sm font-medium truncate">{order.project?.name || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('تاريخ الأمر', 'Order Date')}</p>
            <p className="text-sm font-medium">{formatDate(order.date, lang)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('تاريخ التسليم', 'Delivery Date')}</p>
            <p className="text-sm font-medium">{order.deliveryDate ? formatDate(order.deliveryDate, lang) : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('بنود أمر الشراء', 'PO Line Items')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                  <TableHead className="text-right">{t('الكمية', 'Qty')}</TableHead>
                  <TableHead className="text-right">{t('الوحدة', 'Unit')}</TableHead>
                  <TableHead className="text-right">{t('سعر الوحدة', 'Unit Price')}</TableHead>
                  <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{formatNumber(item.quantity)}</TableCell>
                    <TableCell>{item.unit || '—'}</TableCell>
                    <TableCell><MoneyDisplay value={item.unitPrice} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={item.totalPrice} mode="system" lang={lang} bold size="sm" /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={4} className="text-left font-medium">{t('المجموع قبل الضريبة', 'Subtotal')}</TableCell>
                  <TableCell className="font-semibold"><MoneyDisplay value={order.subtotal} mode="system" lang={lang} size="sm" /></TableCell>
                </TableRow>
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={4} className="text-left font-medium">{t('ضريبة القيمة المضافة', 'VAT')} ({(order.vatRate * 100).toFixed(0)}%)</TableCell>
                  <TableCell className="font-semibold"><MoneyDisplay value={order.vatAmount} mode="system" lang={lang} size="sm" /></TableCell>
                </TableRow>
                <TableRow className="bg-emerald-50">
                  <TableCell colSpan={4} className="text-left font-bold text-emerald-700">{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell className="font-bold text-emerald-700"><MoneyDisplay value={order.totalAmount} mode="system" lang={lang} bold size="md" /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('ملاحظات', 'Notes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Preview View (Print-Ready) ============
function POPreviewView({ id, onBack }: { id: string; onBack: () => void }) {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const { data: order, isLoading } = useQuery<PurchaseOrder>({
    queryKey: ['purchase-orders', id],
    queryFn: async () => {
      const res = await fetch('/api/purchase-orders')
      if (!res.ok) throw new Error()
      const all: PurchaseOrder[] = await res.json()
      return all.find(o => o.id === id)!
    },
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6"><TableSkeleton /></div>
  if (!order) return <div className="p-6 text-center text-rose-600">{t('لم يتم العثور على الأمر', 'Order not found')}</div>

  return (
    <div className="space-y-4">
      {/* Screen-only toolbar */}
      <div className="flex items-center gap-3 print:hidden">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <h2 className="text-lg font-bold flex-1">{t('معاينة أمر الشراء', 'PO Preview')}</h2>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => window.print()}>
          <Printer className="size-4" /> {t('طباعة', 'Print')}
        </Button>
      </div>

      {/* Print-ready document */}
      <div className="bg-white border rounded-lg p-8 print:border-0 print:p-0 print:shadow-none" dir="rtl">
        {/* Company Header */}
        <div className="text-center border-b-2 border-emerald-600 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-emerald-800">بِنَاء للمقاولات</h1>
          <p className="text-sm text-gray-600">BINAA Construction Co.</p>
          <p className="text-xs text-gray-500 mt-1">رقم السجل التجاري: 1010XXXXXX | الرقم الضريبي: 3000XXXXXXXXXX</p>
        </div>

        {/* PO Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-emerald-700">أمر شراء</h2>
            <p className="text-sm text-gray-500">Purchase Order</p>
          </div>
          <div className="text-left">
            <p className="font-mono font-bold text-lg">{order.orderNo}</p>
            <p className="text-sm text-gray-600">{t('التاريخ:', 'Date:')} {formatDate(order.date, lang)}</p>
            {order.deliveryDate && (
              <p className="text-sm text-gray-600">{t('تاريخ التسليم:', 'Delivery:')} {formatDate(order.deliveryDate, lang)}</p>
            )}
          </div>
        </div>

        {/* Supplier Info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-500 mb-1">{t('المورد', 'Supplier')}</p>
            <p className="font-semibold">{order.supplier.name}</p>
            <p className="text-sm text-gray-600">كود: {order.supplier.code}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-500 mb-1">{t('المشروع', 'Project')}</p>
            <p className="font-semibold">{order.project?.name || '—'}</p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full border-collapse mb-6 text-sm">
          <thead>
            <tr className="bg-emerald-600 text-white">
              <th className="border border-emerald-700 p-2 text-right">#</th>
              <th className="border border-emerald-700 p-2 text-right">{t('الوصف', 'Description')}</th>
              <th className="border border-emerald-700 p-2 text-center">{t('الكمية', 'Qty')}</th>
              <th className="border border-emerald-700 p-2 text-center">{t('الوحدة', 'Unit')}</th>
              <th className="border border-emerald-700 p-2 text-left">{t('سعر الوحدة', 'Unit Price')}</th>
              <th className="border border-emerald-700 p-2 text-left">{t('الإجمالي', 'Total')}</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border border-gray-300 p-2">{idx + 1}</td>
                <td className="border border-gray-300 p-2">{item.description}</td>
                <td className="border border-gray-300 p-2 text-center">{formatNumber(item.quantity)}</td>
                <td className="border border-gray-300 p-2 text-center">{item.unit || '—'}</td>
                <td className="border border-gray-300 p-2 text-left" dir="ltr">{formatSAR(item.unitPrice, lang)}</td>
                <td className="border border-gray-300 p-2 text-left font-semibold" dir="ltr">{formatSAR(item.totalPrice, lang)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100">
              <td colSpan={5} className="border border-gray-300 p-2 text-left">{t('المجموع قبل الضريبة', 'Subtotal')}</td>
              <td className="border border-gray-300 p-2 text-left" dir="ltr">{formatSAR(order.subtotal, lang)}</td>
            </tr>
            <tr className="bg-gray-100">
              <td colSpan={5} className="border border-gray-300 p-2 text-left">{t('ضريبة القيمة المضافة', 'VAT')} ({(order.vatRate * 100).toFixed(0)}%)</td>
              <td className="border border-gray-300 p-2 text-left" dir="ltr">{formatSAR(order.vatAmount, lang)}</td>
            </tr>
            <tr className="bg-emerald-50">
              <td colSpan={5} className="border border-gray-300 p-2 text-left font-bold text-emerald-700">{t('الإجمالي', 'Total')}</td>
              <td className="border border-gray-300 p-2 text-left font-bold text-emerald-700" dir="ltr">{formatSAR(order.totalAmount, lang)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Notes */}
        {order.notes && (
          <div className="mb-6">
            <p className="text-sm font-semibold mb-1">{t('ملاحظات', 'Notes')}:</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap border border-gray-200 p-2 rounded">{order.notes}</p>
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-6 mt-12">
          <div className="text-center">
            <div className="border-t-2 border-gray-400 pt-2 mt-8">
              <p className="text-sm font-medium">{t('أعدّ', 'Prepared By')}</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t-2 border-gray-400 pt-2 mt-8">
              <p className="text-sm font-medium">{t('اعتمد', 'Approved By')}</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t-2 border-gray-400 pt-2 mt-8">
              <p className="text-sm font-medium">{t('استلم', 'Received By')}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 mt-8 pt-4 border-t border-gray-200">
          {t('هذا أمر شراء رسمي صادر عن شركة بِنَاء للمقاولات', 'This is an official purchase order issued by BINAA Construction Co.')}
        </div>
      </div>
    </div>
  )
}

// ============ Main Module ============
export function PurchaseOrdersModule() {
  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })

  switch (viewState.type) {
    case 'create':
      return <POCreateView onBack={() => setViewState({ type: 'list' })} />
    case 'detail':
      return <PODetailView id={viewState.id} onBack={() => setViewState({ type: 'list' })} onPreview={(id) => setViewState({ type: 'preview', id })} />
    case 'preview':
      return <POPreviewView id={viewState.id} onBack={() => setViewState({ type: 'detail', id: viewState.id })} />
    default:
      return (
        <POListView
          onCreateNew={() => setViewState({ type: 'create' })}
          onViewDetail={(id) => setViewState({ type: 'detail', id })}
          onPreview={(id) => setViewState({ type: 'preview', id })}
        />
      )
  }
}

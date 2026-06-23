'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart, Plus, Search, RefreshCw, Eye, ArrowRight, X,
  Download, CheckCircle, Clock, AlertCircle, Link2, Package, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { ModuleLayout } from '@/components/shared/module-layout'
import { useAppStore, formatDate, formatNumber } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { ProjectTypeBadge } from '@/components/shared/project-type-badge'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
type ViewState =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'detail'; id: string }

interface SupplierOption { id: string; code: string; name: string }
interface ProjectOption { id: string; code: string; name: string }

interface PRItem {
  id: string; description: string; quantity: number; unit: string | null; notes: string | null
}

interface PurchaseRequestOption {
  id: string; requestNo: string; source: string | null; projectId: string | null
  project: { id: string; name: string } | null
  items: PRItem[]
}

interface POLineItem {
  id: string; description: string; quantity: number; unit: string | null
  unitPrice: number; totalPrice: number
}

interface PurchaseOrder {
  id: string; orderNo: string; projectId: string | null; supplierId: string
  purchaseRequestId: string | null
  date: string; deliveryDate: string | null; subtotal: number; vatRate: number
  vatAmount: number; totalAmount: number; paidAmount: number; status: string
  receiptStatus?: string; notes: string | null
  supplier: { id: string; name: string; code: string }
  project: { id: string; name: string; code: string; projectType?: string } | null
  purchaseRequest: { id: string; requestNo: string; status: string } | null
  items: POLineItem[]
  goodsReceipts: { id: string; receiptNo: string; status: string; date: string }[]
  invoices: { id: string; invoiceNo: string; status: string; totalAmount: number; paidAmount: number }[]
  _count: { invoices: number }
}

interface LineItemForm {
  description: string; quantity: number; unit: string; unitPrice: number
}

// ============ Constants ============
const poStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-yellow-700', bg: 'bg-yellow-100' },
  PENDING_APPROVAL: { label: { ar: 'بانتظار الاعتماد', en: 'Pending Approval' }, color: 'text-orange-700', bg: 'bg-orange-100' },
  APPROVED: { label: { ar: 'معتمد', en: 'Approved' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  PARTIALLY_RECEIVED: { label: { ar: 'مستلم جزئياً', en: 'Partial Receipt' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  RECEIVED: { label: { ar: 'مستلم بالكامل', en: 'Received' }, color: 'text-teal-700', bg: 'bg-teal-100' },
  CANCELLED: { label: { ar: 'ملغي', en: 'Cancelled' }, color: 'text-red-700', bg: 'bg-red-100' },
}

const defaultLineItem: LineItemForm = { description: '', quantity: 1, unit: '', unitPrice: 0 }

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

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

// ============ Create View ============
function POCreateView({ onBack }: { onBack: () => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const [purchaseRequestId, setPurchaseRequestId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ ...defaultLineItem }])

  const { data: suppliers = [] } = useQuery<SupplierOption[]>({
    queryKey: ['suppliers-simple'],
    queryFn: async () => {
      const res = await fetch('/api/suppliers')
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

  const { data: purchaseRequests = [] } = useQuery<PurchaseRequestOption[]>({
    queryKey: ['purchase-requests-approved'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-requests?status=APPROVED')
      if (!res.ok) return []
      return res.json()
    },
  })

  React.useEffect(() => {
    if (purchaseRequestId) {
      const pr = purchaseRequests.find(p => p.id === purchaseRequestId)
      if (pr) {
        setLineItems(pr.items.map(i => ({
          description: i.description,
          quantity: i.quantity,
          unit: i.unit || '',
          unitPrice: 0,
        })))
        if (pr.projectId) setProjectId(pr.projectId)
      }
    }
  }, [purchaseRequestId, purchaseRequests])

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success(t('تم إنشاء أمر الشراء بنجاح', 'Purchase order created successfully', lang)); onBack() },
    onError: () => toast.error(t('فشل في إنشاء أمر الشراء', 'Failed to create purchase order', lang)),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      supplierId, projectId: projectId || null, purchaseRequestId: purchaseRequestId || null,
      date, deliveryDate: deliveryDate || null, notes,
      items: lineItems.map(i => ({ description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice })),
    })
  }

  const selectedPR = purchaseRequestId ? purchaseRequests.find(p => p.id === purchaseRequestId) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('أمر شراء جديد', 'New Purchase Order', lang)}</h1>
          <p className="text-sm text-muted-foreground">{t('إنشاء أمر شراء جديد من طلب معتمد', 'Create a new PO from approved request', lang)}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('معلومات أساسية', 'Basic Information', lang)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Link2 className="size-3" />
                  {t('طلب الشراء (اختياري)', 'Purchase Request (optional)', lang)}
                </Label>
                <Select value={purchaseRequestId} onValueChange={setPurchaseRequestId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر طلب شراء معتمد', 'Select approved PR', lang)} /></SelectTrigger>
                  <SelectContent>
                    {purchaseRequests.map(pr => (
                      <SelectItem key={pr.id} value={pr.id}>{pr.requestNo} - {pr.project?.name || t('بدون مشروع', 'No project', lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPR && (
                  <p className="text-xs text-emerald-600">{t('سيتم تحميل البنود من الطلب تلقائياً', 'Items will be loaded from the request automatically', lang)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t('المورد *', 'Supplier *', lang)}</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر المورد', 'Select supplier', lang)} /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('المشروع (اختياري)', 'Project (optional)', lang)}</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر المشروع', 'Select project', lang)} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ الأمر *', 'Order Date *', lang)}</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ التسليم', 'Delivery Date', lang)}</Label>
                <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t('بنود أمر الشراء', 'PO Line Items', lang)}</CardTitle>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
                <Plus className="size-3" /> {t('إضافة بند', 'Add Item', lang)}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2 p-3 rounded-lg border bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">{t('الوصف', 'Description', lang)}</Label>
                    <Input value={item.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder={t('وصف البند', 'Item description', lang)} className="h-9" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t('الكمية', 'Qty', lang)}</Label>
                    <Input type="number" min="0" step="0.01" value={item.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t('الوحدة', 'Unit', lang)}</Label>
                    <Input value={item.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} placeholder={t('وحدة', 'Unit', lang)} className="h-9" />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">{t('سعر الوحدة', 'Unit Price', lang)}</Label>
                    <Input type="number" min="0" step="0.01" value={item.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-28 text-left">
                    <Label className="text-xs">{t('الإجمالي', 'Total', lang)}</Label>
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

        <Card className="bg-gray-50 border-dashed">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('المجموع قبل الضريبة', 'Subtotal', lang)}</span>
              <span className="font-medium"><MoneyDisplay value={subtotal} mode="system" lang={lang} size="sm" /></span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t('ضريبة القيمة المضافة (15%)', 'VAT (15%)', lang)}</span>
              <span className="font-medium"><MoneyDisplay value={vatAmount} mode="system" lang={lang} size="sm" /></span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>{t('الإجمالي', 'Total', lang)}</span>
              <span className="text-emerald-700"><MoneyDisplay value={totalAmount} mode="system" lang={lang} bold size="lg" /></span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">{t('ملاحظات', 'Notes', lang)}</CardTitle></CardHeader>
          <CardContent><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ملاحظات إضافية', 'Additional notes', lang)} rows={3} /></CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>{t('إلغاء', 'Cancel', lang)}</Button>
          <Button type="submit" disabled={createMutation.isPending || !supplierId || !date} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...', lang) : t('إنشاء أمر الشراء', 'Create PO', lang)}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Detail View ============
function PODetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const { data: order, isLoading, isError } = useQuery<PurchaseOrder>({
    queryKey: ['purchase-orders', id],
    queryFn: async () => {
      const res = await fetch(`/api/purchase-orders/${id}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!id,
  })

  // Approve mutation: DRAFT → PENDING_APPROVAL → APPROVED
  const approveMutation = useMutation({
    mutationFn: (targetStatus: string) => fetch(`/api/purchase-orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: targetStatus }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders', id] }); queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success(t('تم الاعتماد بنجاح', 'Approved successfully', lang)) },
    onError: () => toast.error(t('فشل في الاعتماد', 'Failed to approve', lang)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => fetch(`/api/purchase-orders/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success(t('تم الحذف', 'Deleted', lang)); onBack() },
    onError: () => toast.error(t('فشل في الحذف', 'Failed to delete', lang)),
  })

  if (isLoading) return <div className="p-6"><TableSkeleton /></div>
  if (isError || !order) return (
    <div className="flex flex-col items-center gap-3 py-10">
      <AlertCircle className="size-12 text-rose-300" />
      <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data', lang)}</p>
      <Button variant="outline" onClick={onBack}>{t('رجوع', 'Go Back', lang)}</Button>
    </div>
  )

  const statusCfg = poStatusConfig[order.status] || poStatusConfig.DRAFT

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{t('أمر شراء', 'Purchase Order', lang)} {order.orderNo}</h2>
            <Badge className={`${statusCfg.bg} ${statusCfg.color} border-0`}>{statusCfg.label[lang]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{order.supplier.name}</p>
        </div>
        {/* Approval buttons */}
        {order.status === 'DRAFT' && (
          <Button className="gap-2 bg-orange-600 hover:bg-orange-700" onClick={() => approveMutation.mutate('PENDING_APPROVAL')} disabled={approveMutation.isPending}>
            <Clock className="size-4" /> {t('إرسال للاعتماد', 'Submit for Approval', lang)}
          </Button>
        )}
        {order.status === 'PENDING_APPROVAL' && (
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => approveMutation.mutate('APPROVED')} disabled={approveMutation.isPending}>
            <CheckCircle className="size-4" /> {t('اعتماد', 'Approve', lang)}
          </Button>
        )}
        {order.status === 'DRAFT' && (
          <Button variant="ghost" size="icon" className="size-8 text-rose-600" onClick={() => { if (confirm(t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang))) deleteMutation.mutate() }}><Trash2 className="size-4" /></Button>
        )}
        <PrintButton type="purchase-order" documentId={order.id} />
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('المورد', 'Supplier', lang)}</p>
          <p className="text-sm font-medium truncate">{order.supplier.name}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('المشروع', 'Project', lang)}</p>
          <p className="text-sm font-medium truncate">{order.project?.name || '—'}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('تاريخ الأمر', 'Order Date', lang)}</p>
          <p className="text-sm font-medium">{formatDate(order.date, lang)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('تاريخ التسليم', 'Delivery Date', lang)}</p>
          <p className="text-sm font-medium">{order.deliveryDate ? formatDate(order.deliveryDate, lang) : '—'}</p>
        </CardContent></Card>
      </div>

      {/* Linked PR */}
      {order.purchaseRequest && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 flex items-center gap-2">
            <Link2 className="size-4 text-blue-600" />
            <span className="text-sm text-blue-700">{t('مرتبط بطلب شراء', 'Linked to PR', lang)}: <strong>{order.purchaseRequest.requestNo}</strong></span>
          </CardContent>
        </Card>
      )}

      {/* Financial Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-600">{t('الإجمالي', 'Total', lang)}</p>
            <MoneyDisplay value={order.totalAmount} mode="system" lang={lang} bold size="lg" className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-teal-600">{t('المدفوع', 'Paid', lang)}</p>
            <MoneyDisplay value={order.paidAmount} mode="system" lang={lang} bold size="lg" className="text-teal-700" />
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-amber-600">{t('المتبقي', 'Balance', lang)}</p>
            <MoneyDisplay value={order.totalAmount - order.paidAmount} mode="system" lang={lang} bold size="lg" className="text-amber-700" />
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader><CardTitle className="text-lg">{t('بنود أمر الشراء', 'PO Line Items', lang)}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead className="text-right">{t('الكمية', 'Qty', lang)}</TableHead>
                <TableHead className="text-right">{t('الوحدة', 'Unit', lang)}</TableHead>
                <TableHead className="text-right">{t('سعر الوحدة', 'Unit Price', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
              </TableRow></TableHeader>
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
                  <TableCell colSpan={4} className="text-left font-medium">{t('المجموع قبل الضريبة', 'Subtotal', lang)}</TableCell>
                  <TableCell className="font-semibold"><MoneyDisplay value={order.subtotal} mode="system" lang={lang} size="sm" /></TableCell>
                </TableRow>
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={4} className="text-left font-medium">{t('ضريبة القيمة المضافة', 'VAT', lang)} ({((order.vatRate ?? 0) * 100).toFixed(0)}%)</TableCell>
                  <TableCell className="font-semibold"><MoneyDisplay value={order.vatAmount} mode="system" lang={lang} size="sm" /></TableCell>
                </TableRow>
                <TableRow className="bg-emerald-50">
                  <TableCell colSpan={4} className="text-left font-bold text-emerald-700">{t('الإجمالي', 'Total', lang)}</TableCell>
                  <TableCell className="font-bold text-emerald-700"><MoneyDisplay value={order.totalAmount} mode="system" lang={lang} bold size="md" /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Linked Goods Receipts */}
      {order.goodsReceipts && order.goodsReceipts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{t('إيصالات الاستلام', 'Goods Receipts', lang)}</CardTitle>
              <Badge className="bg-teal-100 text-teal-700 border-0">{order.goodsReceipts.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {order.goodsReceipts.map(gr => {
                const grStatusColor = gr.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : gr.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                return (
                  <Badge key={gr.id} className={`${grStatusColor} border-0 gap-1`}>
                    <Package className="size-3" />
                    {gr.receiptNo} - {gr.status}
                  </Badge>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Supplier Invoices */}
      {order.invoices && order.invoices.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{t('فواتير الموردين', 'Supplier Invoices', lang)}</CardTitle>
              <Badge className="bg-purple-100 text-purple-700 border-0">{order.invoices.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {order.invoices.map(inv => {
                const invStatusColor = inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                return (
                  <Badge key={inv.id} className={`${invStatusColor} border-0 gap-1`}>
                    {inv.invoiceNo} - {inv.status}
                  </Badge>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workflow indicator for APPROVED POs */}
      {(order.status === 'APPROVED' || order.status === 'PARTIALLY_RECEIVED') && (
        <Card className="bg-emerald-50 border-emerald-200 border-dashed">
          <CardContent className="p-4">
            <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
              <Badge className="bg-emerald-100 text-emerald-700 border-0">✓ {t('معتمد', 'Approved', lang)}</Badge>
              <span className="text-gray-400">→</span>
              <Badge className={order.goodsReceipts?.length > 0 ? 'bg-teal-100 text-teal-700 border-0' : 'bg-gray-100 text-gray-500 border-0'}>
                {order.goodsReceipts?.length > 0 ? `✓ ${t('استلام', 'Received', lang)}` : t('استلام بضائع', 'Receive Goods', lang)}
              </Badge>
              <span className="text-gray-400">→</span>
              <Badge className={order.invoices?.length > 0 ? 'bg-blue-100 text-blue-700 border-0' : 'bg-gray-100 text-gray-500 border-0'}>
                {order.invoices?.length > 0 ? `✓ ${t('فاتورة', 'Invoice', lang)}` : t('فاتورة مورد', 'Supplier Invoice', lang)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {order.notes && (
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('ملاحظات', 'Notes', lang)}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p></CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Main Module ============
export function PurchaseOrdersModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })

  const { data: purchaseOrders = [], isLoading, isError, refetch } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-orders')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, targetStatus }: { id: string; targetStatus: string }) => fetch(`/api/purchase-orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: targetStatus }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success(t('تم الاعتماد', 'Approved', lang)) },
    onError: () => toast.error(t('فشل في الاعتماد', 'Failed to approve', lang)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/purchase-orders/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success(t('تم الحذف', 'Deleted', lang)) },
    onError: () => toast.error(t('فشل في الحذف', 'Failed to delete', lang)),
  })

  const filtered = purchaseOrders.filter(po => {
    const matchSearch = !search || po.orderNo.toLowerCase().includes(search.toLowerCase()) || po.supplier.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || po.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPOAmount = purchaseOrders.reduce((s, o) => s + (Number(o.totalAmount || 0)), 0)
  const approvedCount = purchaseOrders.filter(o => o.status === 'APPROVED').length
  const pendingCount = purchaseOrders.filter(o => o.status === 'PENDING_APPROVAL' || o.status === 'DRAFT').length

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'orderNo', label: t('رقم الأمر', 'PO Number', lang) },
      { key: 'supplierName', label: t('المورد', 'Supplier', lang) },
      { key: 'projectName', label: t('المشروع', 'Project', lang) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
      { key: 'totalAmount', label: t('الإجمالي', 'Total', lang), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'status', label: t('الحالة', 'Status', lang) },
    ]
    exportToCSV(filtered.map(po => ({
      orderNo: po.orderNo, supplierName: po.supplier.name,
      projectName: po.project?.name || '', date: formatDate(po.date, lang),
      totalAmount: po.totalAmount, status: po.status,
    })), `purchase-orders-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  if (viewState.type === 'create') return <POCreateView onBack={() => setViewState({ type: 'list' })} />
  if (viewState.type === 'detail') return <PODetailView id={viewState.id} onBack={() => setViewState({ type: 'list' })} />

  return (
    <ModuleLayout
      title={{ ar: 'أوامر الشراء', en: 'Purchase Orders' }}
      subtitle={{ ar: 'إدارة أوامر شراء المواد والخدمات', en: 'Manage purchase orders for materials and services' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
            <Plus className="size-4" /> {t('أمر شراء جديد', 'New PO', lang)}
          </Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center"><ShoppingCart className="size-5 text-emerald-600" /></div>
            <div>
              <p className="text-sm text-emerald-600">{t('إجمالي أوامر الشراء', 'Total POs', lang)}</p>
              <MoneyDisplay value={totalPOAmount} mode="system" lang={lang} bold size="lg" className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center"><CheckCircle className="size-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-blue-600">{t('أوامر معتمدة', 'Approved', lang)}</p>
              <p className="text-xl font-bold text-blue-700">{formatNumber(approvedCount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center"><Clock className="size-5 text-amber-600" /></div>
            <div>
              <p className="text-sm text-amber-600">{t('بانتظار الاعتماد', 'Pending', lang)}</p>
              <p className="text-xl font-bold text-amber-700">{formatNumber(pendingCount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card><CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder={t('بحث بالرقم أو اسم المورد...', 'Search by number or supplier...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('كل الحالات', 'All Statuses', lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('كل الحالات', 'All Statuses', lang)}</SelectItem>
              {Object.entries(poStatusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="p-6"><TableSkeleton /></div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <AlertCircle className="size-12 text-rose-300" />
            <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data', lang)}</p>
            <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <ShoppingCart className="size-12 text-gray-300" />
            <p className="text-muted-foreground">{t('لا توجد أوامر شراء', 'No purchase orders', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
              <Plus className="size-4 mr-1" /> {t('إنشاء أمر شراء', 'Create PO', lang)}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('رقم الأمر', 'PO Number', lang)}</TableHead>
                <TableHead className="text-right">{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-right">{t('الاستلام', 'Receipt', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(po => {
                  const statusCfg = poStatusConfig[po.status] || poStatusConfig.DRAFT
                  const hasGR = po.goodsReceipts && po.goodsReceipts.length > 0
                  const hasPR = !!po.purchaseRequest
                  return (
                    <TableRow key={po.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', id: po.id })}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-medium">{po.orderNo}</span>
                          {hasPR && <Link2 className="size-3 text-blue-500" title={t('مرتبط بطلب شراء', 'Linked to PR', lang)} />}
                        </div>
                      </TableCell>
                      <TableCell>{po.supplier.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {po.project?.name || '—'}
                          {po.project?.projectType && <ProjectTypeBadge projectType={po.project.projectType} lang={lang} />}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(po.date, lang)}</TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={po.totalAmount} mode="system" lang={lang} bold size="sm" /></TableCell>
                      <TableCell><Badge className={`${statusCfg.bg} ${statusCfg.color} border-0`}>{statusCfg.label[lang]}</Badge></TableCell>
                      <TableCell>
                        {hasGR ? (
                          <Badge className="bg-teal-100 text-teal-700 border-0">{po.goodsReceipts.length} {t('إيصال', 'GR', lang)}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {po.status === 'DRAFT' && (
                            <Button variant="ghost" size="icon" className="size-8 text-orange-600" onClick={e => { e.stopPropagation(); approveMutation.mutate({ id: po.id, targetStatus: 'PENDING_APPROVAL' }) }} title={t('إرسال للاعتماد', 'Submit for Approval', lang)}><Clock className="size-4" /></Button>
                          )}
                          {po.status === 'PENDING_APPROVAL' && (
                            <Button variant="ghost" size="icon" className="size-8 text-emerald-600" onClick={e => { e.stopPropagation(); approveMutation.mutate({ id: po.id, targetStatus: 'APPROVED' }) }} title={t('اعتماد', 'Approve', lang)}><CheckCircle className="size-4" /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); setViewState({ type: 'detail', id: po.id }) }} title={t('عرض', 'View', lang)}>
                            <Eye className="size-4" />
                          </Button>
                          {po.status === 'DRAFT' && (
                            <Button variant="ghost" size="icon" className="size-8 text-rose-600" onClick={e => { e.stopPropagation(); if (confirm(t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang))) deleteMutation.mutate(po.id) }}><Trash2 className="size-4" /></Button>
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
      </CardContent></Card>
    </ModuleLayout>
  )
}

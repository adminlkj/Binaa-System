'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart, FileText, Plus, Search, RefreshCw, Eye, ArrowRight, X, ClipboardList,
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ModuleLayout } from '@/components/shared/module-layout'
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatDate, formatNumber, formatSAR } from '@/stores/app-store'
import { ProjectTypeBadge } from '@/components/shared/project-type-badge'

// ============ Types ============
interface SupplierOption { id: string; code: string; name: string }
interface ProjectOption { id: string; code: string; name: string }

interface PRItem {
  id: string; description: string; quantity: number; unit: string | null; notes: string | null
}

interface PurchaseRequest {
  id: string; requestNo: string; projectId: string | null; date: string
  description: string | null; status: string; requestedBy: string | null
  project: { id: string; name: string; code: string; projectType?: string } | null
  items: PRItem[]
}

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
  project: { id: string; name: string; code: string; projectType?: string } | null
  items: POLineItem[]
}

interface PILineItem {
  id: string; description: string; quantity: number; unitPrice: number; totalPrice: number
}

interface PurchaseInvoice {
  id: string; invoiceNo: string; purchaseOrderId: string | null; goodsReceiptId: string | null; projectId: string | null
  supplierId: string; date: string; dueDate: string
  supplierInvoiceNo: string | null; supplierInvoiceDate: string | null; attachmentPath: string | null
  subtotal: number; vatRate: number; vatAmount: number
  totalAmount: number; paidAmount: number; status: string; notes: string | null
  expenseCategory: string | null
  supplier: { id: string; name: string; code: string }
  purchaseOrder: { id: string; orderNo: string; status?: string } | null
  goodsReceipt: { id: string; receiptNo: string; status?: string } | null
  project: { id: string; name: string; code: string; projectType?: string } | null
  items: PILineItem[]
}

interface GRItem {
  id: string; description: string; quantityOrdered: number; quantityReceived: number
  quantityRemaining: number; unitPrice: number; totalPrice: number; destination: string
}

interface GoodsReceipt {
  id: string; receiptNo: string; purchaseOrderId: string; supplierId: string
  projectId: string | null; date: string; status: string; notes: string | null
  supplier: { id: string; name: string; code: string }
  purchaseOrder: { id: string; orderNo: string; status: string }
  project: { id: string; name: string; code: string; projectType?: string } | null
  items: GRItem[]
}

interface LineItemForm {
  description: string; quantity: number; unit: string; unitPrice: number
}

// ============ Bilingual Helpers ============
const t = (lang: 'ar' | 'en', ar: string, en: string) => lang === 'ar' ? ar : en

// Status labels
const poStatusLabels: Record<string, { ar: string; en: string }> = {
  DRAFT: { ar: 'مسودة', en: 'Draft' },
  PENDING_APPROVAL: { ar: 'بانتظار الاعتماد', en: 'Pending Approval' },
  APPROVED: { ar: 'معتمد', en: 'Approved' },
  PARTIALLY_RECEIVED: { ar: 'مستلم جزئياً', en: 'Partially Received' },
  RECEIVED: { ar: 'مستلم', en: 'Received' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled' },
}

const poStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-blue-100 text-blue-700 border-blue-200',
  PARTIALLY_RECEIVED: 'bg-orange-100 text-orange-700 border-orange-200',
  RECEIVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
}

const invoiceStatusLabels: Record<string, { ar: string; en: string }> = {
  DRAFT: { ar: 'مسودة', en: 'Draft' },
  SENT: { ar: 'مرسلة', en: 'Sent' },
  PARTIALLY_PAID: { ar: 'مدفوعة جزئياً', en: 'Partially Paid' },
  PAID: { ar: 'مدفوعة', en: 'Paid' },
  OVERDUE: { ar: 'متأخرة', en: 'Overdue' },
  CANCELLED: { ar: 'ملغية', en: 'Cancelled' },
}

const invoiceStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SENT: 'bg-blue-100 text-blue-700 border-blue-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  OVERDUE: 'bg-rose-100 text-rose-700 border-rose-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
}

const defaultLineItem: LineItemForm = { description: '', quantity: 1, unit: '', unitPrice: 0 }

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
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

// ============ Purchase Request Form Dialog ============
function PurchaseRequestFormDialog({
  open, onOpenChange, projects,
}: {
  open: boolean; onOpenChange: (open: boolean) => void; projects: ProjectOption[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [items, setItems] = useState<{ description: string; quantity: string; unit: string; notes: string }[]>([
    { description: '', quantity: '1', unit: '', notes: '' },
  ])

  React.useEffect(() => {
    if (open) { setProjectId(''); setDate(''); setDescription(''); setRequestedBy(''); setItems([{ description: '', quantity: '1', unit: '', notes: '' }]) }
  }, [open])

  const addItem = () => setItems([...items, { description: '', quantity: '1', unit: '', notes: '' }])
  const removeItem = (idx: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)) }
  const updateItem = (idx: number, field: string, value: string) => {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/purchase-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      projectId: projectId || null, date, description: description || null,
      requestedBy: requestedBy || null,
      items: items.map(i => ({ description: i.description, quantity: parseFloat(i.quantity) || 1, unit: i.unit || null, notes: i.notes || null })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(lang, 'طلب شراء جديد', 'New Purchase Request')}</DialogTitle>
          <DialogDescription>{t(lang, 'إنشاء طلب شراء جديد', 'Create a new purchase request')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t(lang, 'المشروع (اختياري)', 'Project (optional)')}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر المشروع', 'Select project')} /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'التاريخ *', 'Date *')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'الوصف', 'Description')}</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t(lang, 'وصف الطلب', 'Request description')} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'مقدم الطلب', 'Requested By')}</Label>
              <Input value={requestedBy} onChange={e => setRequestedBy(e.target.value)} placeholder={t(lang, 'اسم مقدم الطلب', 'Requester name')} />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">{t(lang, 'بنود الطلب', 'Request Items')}</Label>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addItem}>
                <Plus className="size-3" /> {t(lang, 'إضافة بند', 'Add Item')}
              </Button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2 p-2 rounded-lg border bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">{t(lang, 'الوصف', 'Description')}</Label>
                    <Input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder={t(lang, 'وصف البند', 'Item description')} className="h-9" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t(lang, 'الكمية', 'Qty')}</Label>
                    <Input type="number" min="0" step="0.01" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t(lang, 'الوحدة', 'Unit')}</Label>
                    <Input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder={t(lang, 'وحدة', 'Unit')} className="h-9" />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 text-rose-500" onClick={() => removeItem(idx)} disabled={items.length <= 1}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t(lang, 'إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t(lang, 'جاري الإنشاء...', 'Creating...') : t(lang, 'إنشاء طلب الشراء', 'Create Purchase Request')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Purchase Order Form Dialog ============
function PurchaseOrderFormDialog({
  open, onOpenChange, suppliers, projects,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  suppliers: SupplierOption[]; projects: ProjectOption[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const [supplierId, setSupplierId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ ...defaultLineItem }])

  React.useEffect(() => {
    if (open) {
      setSupplierId(''); setProjectId(''); setDate(''); setDeliveryDate('')
      setNotes(''); setLineItems([{ ...defaultLineItem }])
    }
  }, [open])

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      supplierId, projectId: projectId || null, date, deliveryDate: deliveryDate || null, notes,
      items: lineItems.map(i => ({ description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(lang, 'أمر شراء جديد', 'New Purchase Order')}</DialogTitle>
          <DialogDescription>{t(lang, 'إنشاء أمر شراء جديد مع البنود', 'Create a new purchase order with items')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t(lang, 'المورد *', 'Supplier *')}</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر المورد', 'Select supplier')} /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'المشروع (اختياري)', 'Project (optional)')}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر المشروع', 'Select project')} /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'تاريخ الأمر *', 'Order Date *')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'تاريخ التسليم', 'Delivery Date')}</Label>
              <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">{t(lang, 'بنود أمر الشراء', 'Order Items')}</Label>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
                <Plus className="size-3" /> {t(lang, 'إضافة بند', 'Add Item')}
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2 p-2 rounded-lg border bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">{t(lang, 'الوصف', 'Description')}</Label>
                    <Input value={item.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder={t(lang, 'وصف البند', 'Item description')} className="h-9" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t(lang, 'الكمية', 'Qty')}</Label>
                    <Input type="number" min="0" step="0.01" value={item.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t(lang, 'الوحدة', 'Unit')}</Label>
                    <Input value={item.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} placeholder={t(lang, 'وحدة', 'Unit')} className="h-9" />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">{t(lang, 'سعر الوحدة', 'Unit Price')}</Label>
                    <Input type="number" min="0" step="0.01" value={item.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-28 text-left">
                    <Label className="text-xs">{t(lang, 'الإجمالي', 'Total')}</Label>
                    <p className="text-sm font-medium mt-1.5"><MoneyDisplay value={item.quantity * item.unitPrice} lang={lang} size="xs" /></p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 text-rose-500" onClick={() => removeLine(idx)} disabled={lineItems.length <= 1}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <Card className="bg-gray-50 border-dashed">
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t(lang, 'المجموع قبل الضريبة', 'Subtotal')}</span>
                <span className="font-medium"><MoneyDisplay value={subtotal} lang={lang} size="sm" /></span>
              </div>
              <div className="flex justify-between text-sm">
                <span>{t(lang, 'ضريبة القيمة المضافة (15%)', 'VAT (15%)')}</span>
                <span className="font-medium"><MoneyDisplay value={vatAmount} lang={lang} size="sm" /></span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>{t(lang, 'الإجمالي', 'Total')}</span>
                <span className="text-emerald-700"><MoneyDisplay value={totalAmount} lang={lang} bold size="md" /></span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label>{t(lang, 'ملاحظات', 'Notes')}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t(lang, 'ملاحظات إضافية', 'Additional notes')} rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t(lang, 'إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || !supplierId || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t(lang, 'جاري الإنشاء...', 'Creating...') : t(lang, 'إنشاء أمر الشراء', 'Create Order')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ GR-Based Invoice Form Dialog ============
function GRBasedInvoiceDialog({
  open, onOpenChange,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const [goodsReceiptId, setGoodsReceiptId] = useState('')
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('')
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState('')
  const [attachmentPath, setAttachmentPath] = useState('')
  const [notes, setNotes] = useState('')

  // Fetch available (uninvoiced) GRs
  const { data: goodsReceipts = [], isLoading: grLoading } = useQuery<GoodsReceipt[]>({
    queryKey: ['goods-receipts-available'],
    queryFn: async () => {
      const res = await fetch('/api/goods-receipt')
      if (!res.ok) return []
      const allGRs: GoodsReceipt[] = await res.json()
      // Only show GRs that are confirmed and not yet invoiced
      return allGRs.filter(gr => gr.status === 'CONFIRMED' || gr.status === 'PENDING')
    },
    enabled: open,
  })

  const selectedGR = useMemo(
    () => goodsReceipts.find(gr => gr.id === goodsReceiptId),
    [goodsReceipts, goodsReceiptId]
  )

  // Financial amounts are computed from GR items (READ-ONLY)
  const subtotal = useMemo(() => selectedGR?.items.reduce((s, i) => s + Number(i.totalPrice || 0), 0) ?? 0, [selectedGR])
  const vatRate = 0.15
  const vatAmount = subtotal * vatRate
  const totalAmount = subtotal + vatAmount

  React.useEffect(() => {
    if (open) {
      setGoodsReceiptId(''); setDate(''); setDueDate('')
      setSupplierInvoiceNo(''); setSupplierInvoiceDate('')
      setAttachmentPath(''); setNotes('')
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/supplier-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(async r => {
        if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error((err as { error?: string }).error || 'Failed') }
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-invoices'] })
      onOpenChange(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      goodsReceiptId,
      date, dueDate,
      supplierInvoiceNo: supplierInvoiceNo || undefined,
      supplierInvoiceDate: supplierInvoiceDate || undefined,
      attachmentPath: attachmentPath || undefined,
      notes: notes || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(lang, 'فاتورة مورد من إيصال استلام', 'Supplier Invoice from Goods Receipt')}</DialogTitle>
          <DialogDescription>{t(lang, 'إنشاء فاتورة مورد بناءً على إيصال استلام بضائع', 'Create a supplier invoice based on a goods receipt')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* GR Selection */}
          <div className="space-y-2">
            <Label className="text-base font-semibold">{t(lang, 'إيصال الاستلام *', 'Goods Receipt *')}</Label>
            {grLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                <RefreshCw className="size-4 animate-spin" /> {t(lang, 'جاري التحميل...', 'Loading...')}
              </div>
            ) : goodsReceipts.length === 0 ? (
              <div className="p-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 text-sm text-amber-700">
                {t(lang, 'لا توجد إيصالات استلام متاحة. يجب إنشاء إيصال استلام أولاً قبل إصدار فاتورة.', 'No available goods receipts. A goods receipt must be created first before issuing an invoice.')}
              </div>
            ) : (
              <Select value={goodsReceiptId} onValueChange={setGoodsReceiptId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر إيصال الاستلام', 'Select Goods Receipt')} /></SelectTrigger>
                <SelectContent>
                  {goodsReceipts.map(gr => (
                    <SelectItem key={gr.id} value={gr.id}>
                      {gr.receiptNo} — {gr.supplier.name} ({formatDate(gr.date)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Auto-populated info from GR */}
          {selectedGR && (
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold">{t(lang, 'بيانات من إيصال الاستلام', 'Data from Goods Receipt')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t(lang, 'المورد', 'Supplier')}</span>
                    <p className="font-medium">{selectedGR.supplier.name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t(lang, 'أمر الشراء', 'Purchase Order')}</span>
                    <p className="font-medium font-mono">{selectedGR.purchaseOrder.orderNo}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t(lang, 'المشروع', 'Project')}</span>
                    <p className="font-medium">{selectedGR.project?.name || '—'}</p>
                  </div>
                </div>

                {/* GR Items (read-only) */}
                <div className="space-y-1 mt-2">
                  <p className="text-xs text-muted-foreground">{t(lang, 'بنود إيصال الاستلام', 'GR Items')}</p>
                  <div className="max-h-32 overflow-y-auto">
                    <Table size="sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs h-8">{t(lang, 'الوصف', 'Description')}</TableHead>
                          <TableHead className="text-xs h-8 w-16">{t(lang, 'الكمية', 'Qty')}</TableHead>
                          <TableHead className="text-xs h-8 w-24">{t(lang, 'سعر الوحدة', 'Unit Price')}</TableHead>
                          <TableHead className="text-xs h-8 w-24">{t(lang, 'الإجمالي', 'Total')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedGR.items.map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="text-xs py-1">{item.description}</TableCell>
                            <TableCell className="text-xs py-1 font-mono">{item.quantityReceived}</TableCell>
                            <TableCell className="text-xs py-1"><MoneyDisplay value={item.unitPrice} lang={lang} size="xs" /></TableCell>
                            <TableCell className="text-xs py-1 font-medium"><MoneyDisplay value={item.totalPrice} lang={lang} size="xs" /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <Separator />
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{t(lang, 'المجموع قبل الضريبة', 'Subtotal')}</span>
                    <span className="font-medium"><MoneyDisplay value={subtotal} lang={lang} size="sm" /></span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t(lang, 'ضريبة القيمة المضافة (15%)', 'VAT (15%)')}</span>
                    <span className="font-medium"><MoneyDisplay value={vatAmount} lang={lang} size="sm" /></span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>{t(lang, 'الإجمالي', 'Total')}</span>
                    <span className="text-emerald-700"><MoneyDisplay value={totalAmount} lang={lang} bold size="md" /></span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* User-editable fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t(lang, 'رقم فاتورة المورد', 'Supplier Invoice No')}</Label>
              <Input value={supplierInvoiceNo} onChange={e => setSupplierInvoiceNo(e.target.value)} placeholder={t(lang, 'رقم فاتورة المورد', 'Supplier invoice number')} />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'تاريخ فاتورة المورد', 'Supplier Invoice Date')}</Label>
              <Input type="date" value={supplierInvoiceDate} onChange={e => setSupplierInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'تاريخ الفاتورة *', 'Invoice Date *')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'تاريخ الاستحقاق *', 'Due Date *')}</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'المرفق', 'Attachment')}</Label>
              <Input value={attachmentPath} onChange={e => setAttachmentPath(e.target.value)} placeholder={t(lang, 'مسار المرفق', 'Attachment path')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t(lang, 'ملاحظات', 'Notes')}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t(lang, 'ملاحظات إضافية', 'Additional notes')} rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t(lang, 'إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || !goodsReceiptId || !date || !dueDate || goodsReceipts.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t(lang, 'جاري الإنشاء...', 'Creating...') : t(lang, 'إنشاء الفاتورة', 'Create Invoice')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Purchases Module ============
export function PurchasesModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('requests')
  const [prDialogOpen, setPrDialogOpen] = useState(false)
  const [poDialogOpen, setPoDialogOpen] = useState(false)
  const [piDialogOpen, setPiDialogOpen] = useState(false)

  // Fetch purchase requests
  const { data: purchaseRequests = [], isLoading: prLoading, isError: prError, refetch: refetchPR } = useQuery<PurchaseRequest[]>({
    queryKey: ['purchase-requests'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-requests')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Fetch purchase orders
  const { data: purchaseOrders = [], isLoading: poLoading, isError: poError, refetch: refetchPO } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-orders')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Fetch purchase invoices (supplier invoices)
  const { data: purchaseInvoices = [], isLoading: piLoading, isError: piError, refetch: refetchPI } = useQuery<PurchaseInvoice[]>({
    queryKey: ['supplier-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/supplier-invoices')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Fetch suppliers & projects for forms
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

  // Filters
  const filteredPR = purchaseRequests.filter(pr => {
    const matchSearch = !search || pr.requestNo.toLowerCase().includes(search.toLowerCase()) || (pr.description || '').toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const filteredPO = purchaseOrders.filter(po => {
    const matchSearch = !search || po.orderNo.toLowerCase().includes(search.toLowerCase()) || po.supplier.name.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const filteredPI = purchaseInvoices.filter(pi => {
    const matchSearch = !search || pi.invoiceNo.toLowerCase().includes(search.toLowerCase()) || pi.supplier.name.toLowerCase().includes(search.toLowerCase()) || (pi.goodsReceipt?.receiptNo || '').toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  // Summary
  const totalPR = purchaseRequests.length
  const totalPO = purchaseOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0)
  const totalPI = purchaseInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0)
  const totalPIPaid = purchaseInvoices.reduce((s, i) => s + Number(i.paidAmount || 0), 0)

  const refetchAll = () => { refetchPR(); refetchPO(); refetchPI() }

  return (
    <ModuleLayout
      title={{ ar: 'المشتريات', en: 'Purchases' }}
      subtitle={{ ar: 'إدارة طلبات الشراء وأوامر الشراء وفواتير الموردين', en: 'Manage purchase requests, orders, and supplier invoices' }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={refetchAll} title={t(lang, 'تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4">
            <p className="text-sm text-purple-600">{t(lang, 'طلبات الشراء', 'Purchase Requests')}</p>
            <p className="text-xl font-bold text-purple-700">{totalPR}</p>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4">
            <p className="text-sm text-teal-600">{t(lang, 'إجمالي أوامر الشراء', 'Total POs')}</p>
            <MoneyDisplay value={totalPO} lang={lang} bold size="lg" className="text-teal-700" />
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4">
            <p className="text-sm text-rose-600">{t(lang, 'إجمالي فواتير الشراء', 'Total Invoices')}</p>
            <MoneyDisplay value={totalPI} lang={lang} bold size="lg" className="text-rose-700" />
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm text-amber-600">{t(lang, 'المدفوع للموردين', 'Paid to Suppliers')}</p>
            <MoneyDisplay value={totalPIPaid} lang={lang} bold size="lg" className="text-amber-700" />
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder={t(lang, 'بحث بالرقم أو الاسم...', 'Search by number or name...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="requests" className="gap-1.5">
              <ClipboardList className="size-4" /> {t(lang, 'طلبات الشراء', 'Requests')}
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5">
              <ShoppingCart className="size-4" /> {t(lang, 'أوامر الشراء', 'Orders')}
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-1.5">
              <FileText className="size-4" /> {t(lang, 'فواتير الموردين', 'Invoices')}
            </TabsTrigger>
          </TabsList>
          {activeTab === 'requests' ? (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setPrDialogOpen(true)}>
              <Plus className="size-4" /> {t(lang, 'طلب شراء جديد', 'New Request')}
            </Button>
          ) : activeTab === 'orders' ? (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setPoDialogOpen(true)}>
              <Plus className="size-4" /> {t(lang, 'أمر شراء جديد', 'New Order')}
            </Button>
          ) : (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setPiDialogOpen(true)}>
              <Plus className="size-4" /> {t(lang, 'فاتورة من إيصال استلام', 'Invoice from GR')}
            </Button>
          )}
        </div>

        {/* Purchase Requests Tab */}
        <TabsContent value="requests">
          <Card>
            <CardContent className="p-0">
              {prLoading ? (
                <TableSkeleton />
              ) : prError ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-rose-600">{t(lang, 'حدث خطأ', 'An error occurred')}</p>
                  <Button variant="outline" onClick={() => refetchPR()}>{t(lang, 'إعادة المحاولة', 'Retry')}</Button>
                </div>
              ) : filteredPR.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <ClipboardList className="size-12 text-gray-300" />
                  <p className="text-muted-foreground">{t(lang, 'لا توجد طلبات شراء', 'No purchase requests')}</p>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setPrDialogOpen(true)}>
                    <Plus className="size-4 mr-1" /> {t(lang, 'إنشاء طلب', 'Create Request')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t(lang, 'رقم الطلب', 'Request No')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المشروع', 'Project')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الوصف', 'Description')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'عدد البنود', 'Items')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'التاريخ', 'Date')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الحالة', 'Status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPR.map(pr => (
                        <TableRow key={pr.id}>
                          <TableCell className="font-medium font-mono">{pr.requestNo}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {pr.project?.name || '—'}
                              {pr.project?.projectType && <ProjectTypeBadge projectType={pr.project.projectType} lang={lang} />}
                            </div>
                          </TableCell>
                          <TableCell>{pr.description || '—'}</TableCell>
                          <TableCell>{pr.items.length}</TableCell>
                          <TableCell>{formatDate(pr.date, lang)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={poStatusColors[pr.status] || 'bg-gray-100 text-gray-700'}>
                              {poStatusLabels[pr.status]?.[lang] || pr.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchase Orders Tab */}
        <TabsContent value="orders">
          <Card>
            <CardContent className="p-0">
              {poLoading ? (
                <TableSkeleton />
              ) : poError ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-rose-600">{t(lang, 'حدث خطأ', 'An error occurred')}</p>
                  <Button variant="outline" onClick={() => refetchPO()}>{t(lang, 'إعادة المحاولة', 'Retry')}</Button>
                </div>
              ) : filteredPO.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <ShoppingCart className="size-12 text-gray-300" />
                  <p className="text-muted-foreground">{t(lang, 'لا توجد أوامر شراء', 'No purchase orders')}</p>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setPoDialogOpen(true)}>
                    <Plus className="size-4 mr-1" /> {t(lang, 'إنشاء أمر شراء', 'Create PO')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t(lang, 'رقم الأمر', 'Order No')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المورد', 'Supplier')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المشروع', 'Project')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'التاريخ', 'Date')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الإجمالي', 'Total')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الحالة', 'Status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPO.map(po => (
                        <TableRow key={po.id}>
                          <TableCell className="font-medium font-mono">{po.orderNo}</TableCell>
                          <TableCell>{po.supplier.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {po.project?.name || '—'}
                              {po.project?.projectType && <ProjectTypeBadge projectType={po.project.projectType} lang={lang} />}
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(po.date, lang)}</TableCell>
                          <TableCell className="font-semibold">
                            <MoneyDisplay value={po.totalAmount} lang={lang} bold size="sm" />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={poStatusColors[po.status]}>
                              {poStatusLabels[po.status]?.[lang] || po.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchase Invoices Tab */}
        <TabsContent value="invoices">
          <Card>
            <CardContent className="p-0">
              {piLoading ? (
                <TableSkeleton />
              ) : piError ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-rose-600">{t(lang, 'حدث خطأ', 'An error occurred')}</p>
                  <Button variant="outline" onClick={() => refetchPI()}>{t(lang, 'إعادة المحاولة', 'Retry')}</Button>
                </div>
              ) : filteredPI.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <FileText className="size-12 text-gray-300" />
                  <p className="text-muted-foreground">{t(lang, 'لا توجد فواتير موردين', 'No supplier invoices')}</p>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setPiDialogOpen(true)}>
                    <Plus className="size-4 mr-1" /> {t(lang, 'إنشاء فاتورة من إيصال', 'Create Invoice from GR')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t(lang, 'رقم الفاتورة', 'Invoice No')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المورد', 'Supplier')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'إيصال الاستلام', 'GR')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'أمر الشراء', 'PO')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المشروع', 'Project')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الإجمالي', 'Total')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المدفوع', 'Paid')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الحالة', 'Status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPI.map(pi => (
                        <TableRow key={pi.id}>
                          <TableCell className="font-medium font-mono">{pi.invoiceNo}</TableCell>
                          <TableCell>{pi.supplier.name}</TableCell>
                          <TableCell>
                            {pi.goodsReceipt ? (
                              <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 gap-1">
                                <ArrowRight className="size-3" />
                                {pi.goodsReceipt.receiptNo}
                              </Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{pi.purchaseOrder?.orderNo || '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {pi.project?.name || '—'}
                              {pi.project?.projectType && <ProjectTypeBadge projectType={pi.project.projectType} lang={lang} />}
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">
                            <MoneyDisplay value={pi.totalAmount} lang={lang} bold size="sm" />
                          </TableCell>
                          <TableCell className="text-amber-700">
                            <MoneyDisplay value={pi.paidAmount} lang={lang} size="sm" />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={invoiceStatusColors[pi.status]}>
                              {invoiceStatusLabels[pi.status]?.[lang] || pi.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Form Dialogs */}
      <PurchaseRequestFormDialog open={prDialogOpen} onOpenChange={setPrDialogOpen} projects={projects} />
      <PurchaseOrderFormDialog open={poDialogOpen} onOpenChange={setPoDialogOpen} suppliers={suppliers} projects={projects} />
      <GRBasedInvoiceDialog open={piDialogOpen} onOpenChange={setPiDialogOpen} />
    </ModuleLayout>
  )
}

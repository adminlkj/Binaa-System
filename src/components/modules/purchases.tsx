'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart, FileText, Plus, Search, RefreshCw, Eye, ArrowRight, X,
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
import { useAppStore, formatSAR as storeFormatSAR, formatDate as storeFormatDate, formatNumber, commonText } from '@/stores/app-store'

// ============ Types ============
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

interface PILineItem {
  id: string; description: string; quantity: number; unitPrice: number; totalPrice: number
}

interface PurchaseInvoice {
  id: string; invoiceNo: string; purchaseOrderId: string | null
  supplierId: string; date: string; dueDate: string
  subtotal: number; vatRate: number; vatAmount: number
  totalAmount: number; paidAmount: number; status: string; notes: string | null
  supplier: { id: string; name: string; code: string }
  purchaseOrder: { id: string; orderNo: string } | null
  items: PILineItem[]
}

interface LineItemForm {
  description: string; quantity: number; unit: string; unitPrice: number
}

// formatSAR, formatDate, formatNumber imported from store

function formatSAR(value: number, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatSAR(value, lang)
}

function formatDate(dateStr: string, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatDate(dateStr, lang)
}

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

const invoiceStatusLabels: Record<string, string> = {
  DRAFT: 'مسودة', SENT: 'مرسلة', PARTIALLY_PAID: 'مدفوعة جزئياً',
  PAID: 'مدفوعة', OVERDUE: 'متأخرة', CANCELLED: 'ملغية',
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

// ============ Purchase Order Form Dialog ============
function PurchaseOrderFormDialog({
  open, onOpenChange, suppliers, projects,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  suppliers: SupplierOption[]; projects: ProjectOption[]
}) {
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
          <DialogTitle>أمر شراء جديد</DialogTitle>
          <DialogDescription>إنشاء أمر شراء جديد مع البنود</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>المورد *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المشروع (اختياري)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-date">تاريخ الأمر *</Label>
              <Input id="po-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-delivery">تاريخ التسليم</Label>
              <Input id="po-delivery" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">بنود أمر الشراء</Label>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
                <Plus className="size-3" /> إضافة بند
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2 p-2 rounded-lg border bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">الوصف</Label>
                    <Input value={item.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder="وصف البند" className="h-9" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">الكمية</Label>
                    <Input type="number" min="0" step="0.01" value={item.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">الوحدة</Label>
                    <Input value={item.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} placeholder="وحدة" className="h-9" />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">سعر الوحدة</Label>
                    <Input type="number" min="0" step="0.01" value={item.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-28 text-left">
                    <Label className="text-xs">الإجمالي</Label>
                    <p className="text-sm font-medium mt-1.5">{formatSAR(item.quantity * item.unitPrice, 'ar')}</p>
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
                <span>المجموع قبل الضريبة</span>
                <span className="font-medium">{formatSAR(subtotal, 'ar')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>ضريبة القيمة المضافة (15%)</span>
                <span className="font-medium">{formatSAR(vatAmount, 'ar')}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>الإجمالي</span>
                <span className="text-emerald-700">{formatSAR(totalAmount, 'ar')}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="po-notes">ملاحظات</Label>
            <Textarea id="po-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية" rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={createMutation.isPending || !supplierId || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء أمر الشراء'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Purchase Invoice Form Dialog ============
function PurchaseInvoiceFormDialog({
  open, onOpenChange, suppliers, purchaseOrders,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  suppliers: SupplierOption[]; purchaseOrders: PurchaseOrder[]
}) {
  const queryClient = useQueryClient()

  const [supplierId, setSupplierId] = useState('')
  const [purchaseOrderId, setPurchaseOrderId] = useState('')
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<{ description: string; quantity: number; unitPrice: number }[]>([{ description: '', quantity: 1, unitPrice: 0 }])

  React.useEffect(() => {
    if (open) {
      setSupplierId(''); setPurchaseOrderId(''); setDate(''); setDueDate('')
      setNotes(''); setLineItems([{ description: '', quantity: 1, unitPrice: 0 }])
    }
  }, [open])

  // When PO is selected, pre-fill items
  React.useEffect(() => {
    if (purchaseOrderId && open) {
      const po = purchaseOrders.find(p => p.id === purchaseOrderId)
      if (po) {
        setSupplierId(po.supplierId)
        setLineItems(po.items.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })))
      }
    }
  }, [purchaseOrderId, open, purchaseOrders])

  const subtotal = useMemo(() => lineItems.reduce((s, i) => s + (i.quantity * i.unitPrice), 0), [lineItems])
  const vatRate = 0.15
  const vatAmount = subtotal * vatRate
  const totalAmount = subtotal + vatAmount

  const addLine = () => setLineItems([...lineItems, { description: '', quantity: 1, unitPrice: 0 }])
  const removeLine = (idx: number) => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)) }
  const updateLine = (idx: number, field: string, value: string | number) => {
    setLineItems(lineItems.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/purchase-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      supplierId, purchaseOrderId: purchaseOrderId || null, date, dueDate, notes,
      items: lineItems.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>فاتورة شراء جديدة</DialogTitle>
          <DialogDescription>إنشاء فاتورة شراء جديدة</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>المورد *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>أمر الشراء (اختياري)</Label>
              <Select value={purchaseOrderId} onValueChange={setPurchaseOrderId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر أمر الشراء" /></SelectTrigger>
                <SelectContent>
                  {purchaseOrders.map(po => <SelectItem key={po.id} value={po.id}>{po.orderNo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pi-date">تاريخ الفاتورة *</Label>
              <Input id="pi-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pi-due">تاريخ الاستحقاق *</Label>
              <Input id="pi-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">بنود الفاتورة</Label>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
                <Plus className="size-3" /> إضافة بند
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2 p-2 rounded-lg border bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">الوصف</Label>
                    <Input value={item.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder="وصف البند" className="h-9" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">الكمية</Label>
                    <Input type="number" min="0" step="0.01" value={item.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">سعر الوحدة</Label>
                    <Input type="number" min="0" step="0.01" value={item.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-28 text-left">
                    <Label className="text-xs">الإجمالي</Label>
                    <p className="text-sm font-medium mt-1.5">{formatSAR(item.quantity * item.unitPrice, 'ar')}</p>
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
                <span>المجموع قبل الضريبة</span>
                <span className="font-medium">{formatSAR(subtotal, 'ar')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>ضريبة القيمة المضافة (15%)</span>
                <span className="font-medium">{formatSAR(vatAmount, 'ar')}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>الإجمالي</span>
                <span className="text-emerald-700">{formatSAR(totalAmount, 'ar')}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="pi-notes">ملاحظات</Label>
            <Textarea id="pi-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية" rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={createMutation.isPending || !supplierId || !date || !dueDate} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء الفاتورة'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Purchase Order Detail View ============
function PODetailView({ order, onBack }: { order: PurchaseOrder; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">أمر شراء {order.orderNo}</h2>
            <Badge variant="outline" className={poStatusColors[order.status]}>
              {poStatusLabels[order.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{order.supplier.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">المورد</p>
            <p className="text-sm font-medium truncate">{order.supplier.name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">المشروع</p>
            <p className="text-sm font-medium truncate">{order.project?.name || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">تاريخ الأمر</p>
            <p className="text-sm font-medium">{formatDate(order.date, 'ar')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">تاريخ التسليم</p>
            <p className="text-sm font-medium">{order.deliveryDate ? formatDate(order.deliveryDate, 'ar') : '—'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">بنود أمر الشراء</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الوصف</TableHead>
                  <TableHead className="text-right">الكمية</TableHead>
                  <TableHead className="text-right">الوحدة</TableHead>
                  <TableHead className="text-right">سعر الوحدة</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{formatNumber(item.quantity)}</TableCell>
                    <TableCell>{item.unit || '—'}</TableCell>
                    <TableCell>{formatSAR(item.unitPrice, 'ar')}</TableCell>
                    <TableCell className="font-semibold">{formatSAR(item.totalPrice, 'ar')}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={4} className="text-left font-medium">المجموع قبل الضريبة</TableCell>
                  <TableCell className="font-semibold">{formatSAR(order.subtotal, 'ar')}</TableCell>
                </TableRow>
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={4} className="text-left font-medium">ضريبة القيمة المضافة ({(order.vatRate * 100).toFixed(0)}%)</TableCell>
                  <TableCell className="font-semibold">{formatSAR(order.vatAmount, 'ar')}</TableCell>
                </TableRow>
                <TableRow className="bg-emerald-50">
                  <TableCell colSpan={4} className="text-left font-bold text-emerald-700">الإجمالي</TableCell>
                  <TableCell className="font-bold text-emerald-700">{formatSAR(order.totalAmount, 'ar')}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Main Purchases Module ============
export function PurchasesModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [poStatusFilter, setPoStatusFilter] = useState<string>('all')
  const [piStatusFilter, setPiStatusFilter] = useState<string>('all')
  const [poDialogOpen, setPoDialogOpen] = useState(false)
  const [piDialogOpen, setPiDialogOpen] = useState(false)
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('orders')

  // Fetch purchase orders
  const { data: purchaseOrders = [], isLoading: poLoading, isError: poError, refetch: refetchPO } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-orders')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch purchase invoices
  const { data: purchaseInvoices = [], isLoading: piLoading, isError: piError, refetch: refetchPI } = useQuery<PurchaseInvoice[]>({
    queryKey: ['purchase-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-invoices')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch selected PO detail
  const { data: poDetail, isLoading: isLoadingPODetail } = useQuery<PurchaseOrder>({
    queryKey: ['purchase-order', selectedPOId],
    queryFn: async () => {
      const res = await fetch('/api/purchase-orders')
      if (!res.ok) throw new Error()
      const all: PurchaseOrder[] = await res.json()
      return all.find(o => o.id === selectedPOId)!
    },
    enabled: !!selectedPOId,
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

  // PO detail view
  if (selectedPOId && poDetail) {
    return <PODetailView order={poDetail} onBack={() => setSelectedPOId(null)} />
  }
  if (selectedPOId && isLoadingPODetail) {
    return <div className="p-6"><TableSkeleton /></div>
  }

  // Filters
  const filteredPO = purchaseOrders.filter(po => {
    const matchSearch = !search || po.orderNo.toLowerCase().includes(search.toLowerCase()) || po.supplier.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = poStatusFilter === 'all' || po.status === poStatusFilter
    return matchSearch && matchStatus
  })

  const filteredPI = purchaseInvoices.filter(pi => {
    const matchSearch = !search || pi.invoiceNo.toLowerCase().includes(search.toLowerCase()) || pi.supplier.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = piStatusFilter === 'all' || pi.status === piStatusFilter
    return matchSearch && matchStatus
  })

  // Summary
  const totalPO = purchaseOrders.reduce((s, o) => s + o.totalAmount, 0)
  const totalPI = purchaseInvoices.reduce((s, i) => s + i.totalAmount, 0)
  const totalPIPaid = purchaseInvoices.reduce((s, i) => s + i.paidAmount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'المشتريات' : 'Purchases'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة أوامر الشراء وفواتير الشراء' : 'Manage purchase orders and invoices'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { refetchPO(); refetchPI() }} title="تحديث">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4">
            <p className="text-sm text-teal-600">إجمالي أوامر الشراء</p>
            <p className="text-xl font-bold text-teal-700">{formatSAR(totalPO, lang)}</p>
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4">
            <p className="text-sm text-rose-600">إجمالي فواتير الشراء</p>
            <p className="text-xl font-bold text-rose-700">{formatSAR(totalPI, lang)}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm text-amber-600">المدفوع للموردين</p>
            <p className="text-xl font-bold text-amber-700">{formatSAR(totalPIPaid, lang)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="بحث بالرقم أو اسم المورد..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <div className="flex items-center justify-between mb-2">
          <TabsList>
            <TabsTrigger value="orders" className="gap-1.5">
              <ShoppingCart className="size-4" /> أوامر الشراء
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-1.5">
              <FileText className="size-4" /> فواتير الشراء
            </TabsTrigger>
          </TabsList>
          {activeTab === 'orders' ? (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setPoDialogOpen(true)}>
              <Plus className="size-4" /> أمر شراء جديد
            </Button>
          ) : (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setPiDialogOpen(true)}>
              <Plus className="size-4" /> فاتورة شراء جديدة
            </Button>
          )}
        </div>

        {/* Purchase Orders Tab */}
        <TabsContent value="orders">
          <Card>
            <CardContent className="p-0">
              {poLoading ? (
                <div className="p-6"><TableSkeleton /></div>
              ) : poError ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-rose-600">حدث خطأ أثناء تحميل البيانات</p>
                  <Button variant="outline" onClick={() => refetchPO()}>إعادة المحاولة</Button>
                </div>
              ) : filteredPO.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <ShoppingCart className="size-12 text-gray-300" />
                  <p className="text-muted-foreground">لا توجد أوامر شراء</p>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setPoDialogOpen(true)}>
                    <Plus className="size-4 mr-1" /> إنشاء أمر شراء
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">رقم الأمر</TableHead>
                        <TableHead className="text-right">المورد</TableHead>
                        <TableHead className="text-right">المشروع</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">الإجمالي</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">عرض</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPO.map(po => (
                        <TableRow key={po.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setSelectedPOId(po.id)}>
                          <TableCell className="font-medium font-mono">{po.orderNo}</TableCell>
                          <TableCell>{po.supplier.name}</TableCell>
                          <TableCell>{po.project?.name || '—'}</TableCell>
                          <TableCell>{formatDate(po.date, lang)}</TableCell>
                          <TableCell className="font-semibold">{formatSAR(po.totalAmount, lang)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={poStatusColors[po.status]}>
                              {poStatusLabels[po.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); setSelectedPOId(po.id) }}>
                              <Eye className="size-4" />
                            </Button>
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
                <div className="p-6"><TableSkeleton /></div>
              ) : piError ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-rose-600">حدث خطأ أثناء تحميل البيانات</p>
                  <Button variant="outline" onClick={() => refetchPI()}>إعادة المحاولة</Button>
                </div>
              ) : filteredPI.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <FileText className="size-12 text-gray-300" />
                  <p className="text-muted-foreground">لا توجد فواتير شراء</p>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setPiDialogOpen(true)}>
                    <Plus className="size-4 mr-1" /> إنشاء فاتورة شراء
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">رقم الفاتورة</TableHead>
                        <TableHead className="text-right">المورد</TableHead>
                        <TableHead className="text-right">أمر الشراء</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">الإجمالي</TableHead>
                        <TableHead className="text-right">المدفوع</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPI.map(pi => (
                        <TableRow key={pi.id}>
                          <TableCell className="font-medium font-mono">{pi.invoiceNo}</TableCell>
                          <TableCell>{pi.supplier.name}</TableCell>
                          <TableCell>{pi.purchaseOrder?.orderNo || '—'}</TableCell>
                          <TableCell>{formatDate(pi.date, lang)}</TableCell>
                          <TableCell className="font-semibold">{formatSAR(pi.totalAmount, lang)}</TableCell>
                          <TableCell className="text-amber-700">{formatSAR(pi.paidAmount, lang)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={invoiceStatusColors[pi.status]}>
                              {invoiceStatusLabels[pi.status]}
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

      {/* PO Form Dialog */}
      <PurchaseOrderFormDialog
        open={poDialogOpen}
        onOpenChange={setPoDialogOpen}
        suppliers={suppliers}
        projects={projects}
      />

      {/* PI Form Dialog */}
      <PurchaseInvoiceFormDialog
        open={piDialogOpen}
        onOpenChange={setPiDialogOpen}
        suppliers={suppliers}
        purchaseOrders={purchaseOrders}
      />
    </div>
  )
}

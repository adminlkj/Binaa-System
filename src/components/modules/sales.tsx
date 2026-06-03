'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw, Eye, ArrowRight, X, Trash2, Printer,
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
import { Switch } from '@/components/ui/switch'
import { useAppStore, formatSAR as storeFormatSAR, formatDate as storeFormatDate, formatNumber, commonText } from '@/stores/app-store'
import { InvoicePreview } from '@/components/invoice/invoice-preview'
import type { InvoiceData, CompanySettings } from '@/components/invoice/invoice-preview'

// ============ Types ============
interface ClientOption { id: string; code: string; name: string }
interface ProjectOption { id: string; code: string; name: string }

interface SalesInvoiceItem {
  id: string; description: string; descriptionEn?: string | null; quantity: number; unit?: string | null; unitPrice: number; totalPrice: number; itemType?: string
}

interface SalesInvoice {
  id: string; invoiceNo: string; projectId: string | null; contractId?: string | null; clientId: string
  date: string; dueDate: string; subtotal: number; discountRate: number; discountAmount: number; netAmount: number
  vatRate: number; vatAmount: number; totalAmount: number; paidAmount: number; status: string; invoiceType?: string
  notes: string | null; paymentTerms?: string | null
  amountInWordsAr?: string | null; amountInWordsEn?: string | null
  referenceNo?: string | null; contractNo?: string | null; contractType?: string | null
  contractPeriodStart?: string | null; contractPeriodEnd?: string | null
  deliveryMonth?: string | null; includeDelivery?: boolean; deliveryAmount?: number; includeVat?: boolean
  client: { id: string; name: string; nameAr?: string | null; code: string; taxNumber?: string | null; phone?: string | null; email?: string | null; address?: string | null }
  project: { id: string; name: string; nameAr?: string | null; code: string } | null
  contract?: { id: string; contractNo: string } | null
  items: SalesInvoiceItem[]
}

interface LineItemForm {
  description: string; descriptionEn?: string; quantity: number; unitPrice: number; unit: string
}

// formatSAR, formatDate, formatNumber imported from store
function formatSAR(value: number, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatSAR(value, lang)
}

function formatDate(dateStr: string, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatDate(dateStr, lang)
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

const invoiceTypeOptions = [
  { value: 'TAX_INVOICE', label: 'فاتورة ضريبية / Tax Invoice' },
  { value: 'PROGRESS_CLAIM', label: 'مستخلص / Progress Claim' },
  { value: 'RENTAL', label: 'فاتورة إيجار / Rental Invoice' },
]

const contractTypeOptions = [
  { value: 'Lump Sum', label: 'مقطوعية / Lump Sum' },
  { value: 'Unit Rate', label: 'أسعار وحدوية / Unit Rate' },
  { value: 'Cost Plus', label: 'تكلفة + هامش / Cost Plus' },
  { value: 'Time & Materials', label: 'وقت ومواد / Time & Materials' },
]

const defaultLineItem: LineItemForm = { description: '', quantity: 1, unitPrice: 0, unit: '' }

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

// ============ Invoice Form Dialog ============
function SalesInvoiceFormDialog({
  open, onOpenChange, clients, projects,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  clients: ClientOption[]; projects: ProjectOption[]
}) {
  const queryClient = useQueryClient()

  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [invoiceType, setInvoiceType] = useState('TAX_INVOICE')
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('30 days')
  const [referenceNo, setReferenceNo] = useState('')
  const [contractNo, setContractNo] = useState('')
  const [contractType, setContractType] = useState('')
  const [contractPeriodStart, setContractPeriodStart] = useState('')
  const [contractPeriodEnd, setContractPeriodEnd] = useState('')
  const [deliveryMonth, setDeliveryMonth] = useState('')
  const [includeDelivery, setIncludeDelivery] = useState(false)
  const [deliveryAmount, setDeliveryAmount] = useState(0)
  const [includeVat, setIncludeVat] = useState(true)
  const [discountType, setDiscountType] = useState<'none' | 'rate' | 'amount'>('none')
  const [discountRate, setDiscountRate] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ ...defaultLineItem }])

  React.useEffect(() => {
    if (open) {
      setClientId(''); setProjectId(''); setDate(''); setDueDate('')
      setNotes(''); setLineItems([{ ...defaultLineItem }])
      setDiscountType('none'); setDiscountRate(0); setDiscountAmount(0)
      setInvoiceType('TAX_INVOICE'); setPaymentTerms('30 days')
      setReferenceNo(''); setContractNo(''); setContractType('')
      setContractPeriodStart(''); setContractPeriodEnd('')
      setDeliveryMonth(''); setIncludeDelivery(false); setDeliveryAmount(0)
      setIncludeVat(true)

      // Auto-suggest reference number
      const year = new Date().getFullYear()
      const rand = Math.floor(1000 + Math.random() * 9000)
      setReferenceNo(`REF-${year}-${rand}`)
    }
  }, [open])

  // Auto-calculate
  const subtotal = useMemo(() => lineItems.reduce((s, i) => s + (i.quantity * i.unitPrice), 0), [lineItems])
  const vatRate = 0.15
  const finalDiscountAmount = useMemo(() => {
    if (discountType === 'rate') return subtotal * (discountRate / 100)
    if (discountType === 'amount') return discountAmount
    return 0
  }, [subtotal, discountType, discountRate, discountAmount])
  const netAmount = subtotal - finalDiscountAmount
  const deliveryTotal = includeDelivery ? deliveryAmount : 0
  const vatAmount = includeVat ? (netAmount + deliveryTotal) * vatRate : 0
  const totalAmount = netAmount + deliveryTotal + vatAmount

  const addLine = () => setLineItems([...lineItems, { ...defaultLineItem }])
  const removeLine = (idx: number) => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)) }
  const updateLine = (idx: number, field: keyof LineItemForm, value: string | number) => {
    setLineItems(lineItems.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/sales-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sales-invoices'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      clientId, projectId: projectId || null, date, dueDate, notes, paymentTerms,
      invoiceType,
      referenceNo: referenceNo || null,
      contractNo: contractNo || null,
      contractType: contractType || null,
      contractPeriodStart: contractPeriodStart || null,
      contractPeriodEnd: contractPeriodEnd || null,
      deliveryMonth: deliveryMonth || null,
      includeDelivery,
      deliveryAmount: includeDelivery ? deliveryAmount : 0,
      includeVat,
      discountRate: discountType === 'rate' ? discountRate / 100 : 0,
      discountAmount: finalDiscountAmount,
      items: lineItems.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, unit: i.unit || undefined })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>فاتورة مبيعات جديدة</DialogTitle>
          <DialogDescription>إنشاء فاتورة مبيعات جديدة مع البنود</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Info Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>العميل *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
              <Label>نوع الفاتورة</Label>
              <Select value={invoiceType} onValueChange={setInvoiceType}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {invoiceTypeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="si-date">تاريخ الفاتورة *</Label>
              <Input id="si-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="si-due">تاريخ الاستحقاق *</Label>
              <Input id="si-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="si-payment-terms">شروط السداد</Label>
              <Input id="si-payment-terms" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="30 days" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="si-ref">رقم المرجع</Label>
              <Input id="si-ref" value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="REF-2026-0001" dir="ltr" />
            </div>
          </div>

          {/* Contract Section */}
          <div className="space-y-3 p-3 rounded-lg border bg-gray-50">
            <Label className="text-sm font-semibold">بيانات العقد (اختياري)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">رقم العقد</Label>
                <Input value={contractNo} onChange={e => setContractNo(e.target.value)} placeholder="CTR-001" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع العقد</Label>
                <Select value={contractType} onValueChange={setContractType}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                  <SelectContent>
                    {contractTypeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">بداية فترة العمل</Label>
                <Input type="date" value={contractPeriodStart} onChange={e => setContractPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نهاية فترة العمل</Label>
                <Input type="date" value={contractPeriodEnd} onChange={e => setContractPeriodEnd(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Delivery & VAT Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Delivery */}
            <div className="space-y-3 p-3 rounded-lg border bg-gray-50">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">رسوم التوصيل</Label>
                <Switch checked={includeDelivery} onCheckedChange={setIncludeDelivery} />
              </div>
              {includeDelivery && (
                <div className="space-y-1">
                  <Label className="text-xs">مبلغ التوصيل</Label>
                  <Input type="number" min="0" step="0.01" value={deliveryAmount || ''} onChange={e => setDeliveryAmount(parseFloat(e.target.value) || 0)} className="w-full" dir="ltr" placeholder="0.00" />
                </div>
              )}
            </div>
            {/* VAT Toggle */}
            <div className="space-y-3 p-3 rounded-lg border bg-gray-50">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">ضريبة القيمة المضافة (15%)</Label>
                <Switch checked={includeVat} onCheckedChange={setIncludeVat} />
              </div>
              <p className="text-xs text-muted-foreground">
                {includeVat ? 'سيتم احتساب ضريبة القيمة المضافة' : 'لن يتم احتساب ضريبة القيمة المضافة'}
              </p>
            </div>
          </div>

          {/* Delivery Month */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="si-delivery-month">شهر التسليم (اختياري)</Label>
              <Input id="si-delivery-month" type="month" value={deliveryMonth} onChange={e => setDeliveryMonth(e.target.value)} />
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
                  <div className="w-16">
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

          {/* Discount Section */}
          <div className="space-y-3 p-3 rounded-lg border bg-gray-50">
            <Label className="text-sm font-semibold">الخصم</Label>
            <div className="flex items-center gap-3">
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'none' | 'rate' | 'amount')}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون خصم</SelectItem>
                  <SelectItem value="rate">نسبة مئوية (%)</SelectItem>
                  <SelectItem value="amount">مبلغ ثابت</SelectItem>
                </SelectContent>
              </Select>
              {discountType === 'rate' && (
                <Input type="number" min="0" max="100" step="0.1" value={discountRate || ''} onChange={e => setDiscountRate(parseFloat(e.target.value) || 0)} className="w-24" dir="ltr" placeholder="%" />
              )}
              {discountType === 'amount' && (
                <Input type="number" min="0" step="0.01" value={discountAmount || ''} onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)} className="w-32" dir="ltr" placeholder="0.00" />
              )}
              {finalDiscountAmount > 0 && (
                <span className="text-sm text-rose-600 font-medium">-{formatSAR(finalDiscountAmount, 'ar')}</span>
              )}
            </div>
          </div>

          {/* Summary */}
          <Card className="bg-gray-50 border-dashed">
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>المجموع قبل الضريبة</span>
                <span className="font-medium">{formatSAR(subtotal, 'ar')}</span>
              </div>
              {finalDiscountAmount > 0 && (
                <div className="flex justify-between text-sm text-rose-600">
                  <span>الخصم</span>
                  <span className="font-medium">-{formatSAR(finalDiscountAmount, 'ar')}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>صافي المبلغ</span>
                <span className="font-medium">{formatSAR(netAmount, 'ar')}</span>
              </div>
              {includeDelivery && deliveryAmount > 0 && (
                <div className="flex justify-between text-sm text-amber-700">
                  <span>رسوم التوصيل</span>
                  <span className="font-medium">{formatSAR(deliveryAmount, 'ar')}</span>
                </div>
              )}
              {includeVat && (
                <div className="flex justify-between text-sm">
                  <span>ضريبة القيمة المضافة (15%)</span>
                  <span className="font-medium">{formatSAR(vatAmount, 'ar')}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>الإجمالي</span>
                <span className="text-emerald-700">{formatSAR(totalAmount, 'ar')}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="si-notes">ملاحظات</Label>
            <Textarea id="si-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية" rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={createMutation.isPending || !clientId || !date || !dueDate} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء الفاتورة'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Invoice Detail View ============
function InvoiceDetailView({ invoice, onBack }: { invoice: SalesInvoice; onBack: () => void }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">فاتورة {invoice.invoiceNo}</h2>
            <Badge variant="outline" className={invoiceStatusColors[invoice.status]}>
              {invoiceStatusLabels[invoice.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{invoice.client.name}</p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">العميل</p>
            <p className="text-sm font-medium truncate">{invoice.client.name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">المشروع</p>
            <p className="text-sm font-medium truncate">{invoice.project?.name || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">تاريخ الفاتورة</p>
            <p className="text-sm font-medium">{formatDate(invoice.date, 'ar')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">تاريخ الاستحقاق</p>
            <p className="text-sm font-medium">{formatDate(invoice.dueDate, 'ar')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">بنود الفاتورة</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الوصف</TableHead>
                  <TableHead className="text-right">الكمية</TableHead>
                  <TableHead className="text-right">سعر الوحدة</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{formatNumber(item.quantity)}</TableCell>
                    <TableCell>{formatSAR(item.unitPrice, 'ar')}</TableCell>
                    <TableCell className="font-semibold">{formatSAR(item.totalPrice, 'ar')}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={3} className="text-left font-medium">المجموع قبل الضريبة</TableCell>
                  <TableCell className="font-semibold">{formatSAR(invoice.subtotal, 'ar')}</TableCell>
                </TableRow>
                {invoice.discountAmount > 0 && (
                  <TableRow className="bg-rose-50">
                    <TableCell colSpan={3} className="text-left font-medium text-rose-700">الخصم</TableCell>
                    <TableCell className="font-semibold text-rose-700">-{formatSAR(invoice.discountAmount, 'ar')}</TableCell>
                  </TableRow>
                )}
                {invoice.includeDelivery && (invoice.deliveryAmount ?? 0) > 0 && (
                  <TableRow className="bg-amber-50">
                    <TableCell colSpan={3} className="text-left font-medium text-amber-700">رسوم التوصيل</TableCell>
                    <TableCell className="font-semibold text-amber-700">{formatSAR(invoice.deliveryAmount ?? 0, 'ar')}</TableCell>
                  </TableRow>
                )}
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={3} className="text-left font-medium">ضريبة القيمة المضافة ({(invoice.vatRate * 100).toFixed(0)}%)</TableCell>
                  <TableCell className="font-semibold">{formatSAR(invoice.vatAmount, 'ar')}</TableCell>
                </TableRow>
                <TableRow className="bg-emerald-50">
                  <TableCell colSpan={3} className="text-left font-bold text-emerald-700">الإجمالي</TableCell>
                  <TableCell className="font-bold text-emerald-700">{formatSAR(invoice.totalAmount, 'ar')}</TableCell>
                </TableRow>
                <TableRow className="bg-amber-50">
                  <TableCell colSpan={3} className="text-left font-medium text-amber-700">المدفوع</TableCell>
                  <TableCell className="font-medium text-amber-700">{formatSAR(invoice.paidAmount, 'ar')}</TableCell>
                </TableRow>
                <TableRow className="bg-rose-50">
                  <TableCell colSpan={3} className="text-left font-bold text-rose-700">المتبقي</TableCell>
                  <TableCell className="font-bold text-rose-700">{formatSAR(invoice.totalAmount - invoice.paidAmount, 'ar')}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-1">ملاحظات</p>
            <p className="text-sm">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Main Sales Module ============
export function SalesModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [previewInvoice, setPreviewInvoice] = useState<SalesInvoice | null>(null)

  const { data: invoices = [], isLoading, isError, refetch } = useQuery<SalesInvoice[]>({
    queryKey: ['sales-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/sales-invoices')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const { data: invoiceDetail, isLoading: isLoadingDetail } = useQuery<SalesInvoice>({
    queryKey: ['sales-invoice', selectedInvoiceId],
    queryFn: async () => {
      const res = await fetch('/api/sales-invoices')
      if (!res.ok) throw new Error('Failed to fetch')
      const all: SalesInvoice[] = await res.json()
      return all.find(i => i.id === selectedInvoiceId)!
    },
    enabled: !!selectedInvoiceId,
  })

  // Company settings for invoice preview
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const res = await fetch('/api/company-settings')
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

  const filtered = invoices.filter(inv => {
    const matchSearch = !search || inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      inv.client.name.toLowerCase().includes(search.toLowerCase()) ||
      (inv.project?.name?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter
    return matchSearch && matchStatus
  })

  // Summary
  const totalSales = invoices.reduce((s, i) => s + i.totalAmount, 0)
  const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0)
  const totalOutstanding = totalSales - totalPaid

  // Detail view
  if (selectedInvoiceId && invoiceDetail) {
    return <InvoiceDetailView invoice={invoiceDetail} onBack={() => setSelectedInvoiceId(null)} />
  }

  if (selectedInvoiceId && isLoadingDetail) {
    return <div className="p-6"><TableSkeleton /></div>
  }

  // Default company settings for preview
  const defaultCompany: CompanySettings = {
    nameAr: 'شركة البناء الحديثة للمقاولات',
    nameEn: 'Al Binaa Al Haditha Contracting Co.',
    taxNumber: '300123456700003',
    commercialReg: '1234567890',
    address: 'الدمام - المملكة العربية السعودية',
    phone: '0500000000',
    email: 'info@albinaa.com',
    bankName: 'الراجحي',
    bankIban: 'SA00 8000 0000 6080 1016 7519',
    bankAccountName: 'شركة البناء الحديثة للمقاولات',
    defaultVatRate: 0.15,
    currency: 'SAR',
    currencySymbol: '\uFDFC',
    currencySymbolEn: 'SAR',
    currencySymbolAr: '\uFDFC',
    invoiceTerms: 'مدة السداد 30 يوماً من تاريخ الفاتورة\nهذه الفاتورة صادرة إلكترونياً\nيرجى ذكر رقم الفاتورة عند التحويل',
  }

  const company = companySettings || defaultCompany

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'فواتير المبيعات' : 'Sales Invoices'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة فواتير المبيعات للعملاء' : 'Manage client sales invoices'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث">
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> فاتورة جديدة
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4">
            <p className="text-sm text-emerald-600">إجمالي المبيعات</p>
            <p className="text-xl font-bold text-emerald-700">{formatSAR(totalSales, lang)}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm text-amber-600">المدفوع</p>
            <p className="text-xl font-bold text-amber-700">{formatSAR(totalPaid, lang)}</p>
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4">
            <p className="text-sm text-rose-600">المستحق</p>
            <p className="text-xl font-bold text-rose-700">{formatSAR(totalOutstanding, lang)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="بحث برقم الفاتورة أو العميل..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="DRAFT">مسودة</SelectItem>
                <SelectItem value="SENT">مرسلة</SelectItem>
                <SelectItem value="PARTIALLY_PAID">مدفوعة جزئياً</SelectItem>
                <SelectItem value="PAID">مدفوعة</SelectItem>
                <SelectItem value="OVERDUE">متأخرة</SelectItem>
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
              <p className="text-rose-600">حدث خطأ أثناء تحميل البيانات</p>
              <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <FileText className="size-12 text-gray-300" />
              <p className="text-muted-foreground">لا توجد فواتير مبيعات</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> إنشاء فاتورة
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الفاتورة</TableHead>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">المشروع</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-right">المدفوع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(inv => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setSelectedInvoiceId(inv.id)}>
                      <TableCell className="font-medium font-mono">{inv.invoiceNo}</TableCell>
                      <TableCell>{inv.client.name}</TableCell>
                      <TableCell>{inv.project?.name || '—'}</TableCell>
                      <TableCell>{formatDate(inv.date, lang)}</TableCell>
                      <TableCell className="font-semibold">{formatSAR(inv.totalAmount, lang)}</TableCell>
                      <TableCell className="text-amber-700">{formatSAR(inv.paidAmount, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={invoiceStatusColors[inv.status]}>
                          {invoiceStatusLabels[inv.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); setSelectedInvoiceId(inv.id) }} title="عرض التفاصيل">
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-emerald-600 hover:text-emerald-700" onClick={e => { e.stopPropagation(); setPreviewInvoice(inv) }} title="عرض الفاتورة">
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

      {/* Invoice Form Dialog */}
      <SalesInvoiceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clients={clients}
        projects={projects}
      />

      {/* Invoice Preview Dialog */}
      <Dialog open={!!previewInvoice} onOpenChange={(open) => { if (!open) setPreviewInvoice(null) }}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto p-0" showCloseButton={true}>
          <div className="p-6 invoice-print-root overflow-x-auto">
            {previewInvoice && (
              <InvoicePreview
                invoice={previewInvoice as unknown as InvoiceData}
                company={company}
                onClose={() => setPreviewInvoice(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

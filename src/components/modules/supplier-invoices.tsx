'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw, Eye, ArrowRight, X,
  Printer, Download, AlertCircle, Clock, CheckCircle, DollarSign,
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
import { Switch } from '@/components/ui/switch'
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

interface PurchaseOrderOption {
  id: string; orderNo: string; supplierId: string; supplier: { name: string }
  items: { description: string; quantity: number; unitPrice: number }[]
}

interface LineItemForm {
  description: string; quantity: number; unitPrice: number
}

// ============ Constants ============
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

const defaultLineItem: LineItemForm = { description: '', quantity: 1, unitPrice: 0 }

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

// ============ List View ============
function InvoiceListView({
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
  const [supplierFilter, setSupplierFilter] = useState<string>('all')

  const { data: invoices = [], isLoading, isError, refetch } = useQuery<PurchaseInvoice[]>({
    queryKey: ['purchase-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-invoices')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch suppliers for filter
  const { data: suppliers = [] } = useQuery<SupplierOption[]>({
    queryKey: ['suppliers-simple'],
    queryFn: async () => {
      const res = await fetch('/api/suppliers?active=true')
      if (!res.ok) return []
      const data = await res.json()
      return data.map((s: { id: string; code: string; name: string }) => ({ id: s.id, code: s.code, name: s.name }))
    },
  })

  const filtered = invoices.filter(pi => {
    const matchSearch = !search || pi.invoiceNo.toLowerCase().includes(search.toLowerCase()) || pi.supplier.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || pi.status === statusFilter
    const matchSupplier = supplierFilter === 'all' || pi.supplierId === supplierFilter
    return matchSearch && matchStatus && matchSupplier
  })

  // Summary
  const totalAmount = invoices.reduce((s, i) => s + i.totalAmount, 0)
  const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0)
  const overdueCount = invoices.filter(i => i.status === 'OVERDUE').length
  const paidCount = invoices.filter(i => i.status === 'PAID').length

  // Export
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'invoiceNo', label: t('رقم الفاتورة', 'Invoice No.') },
      { key: 'supplierName', label: t('المورد', 'Supplier') },
      { key: 'poNumber', label: t('أمر الشراء', 'PO') },
      { key: 'date', label: t('التاريخ', 'Date') },
      { key: 'dueDate', label: t('تاريخ الاستحقاق', 'Due Date') },
      { key: 'subtotal', label: t('المجموع قبل الضريبة', 'Subtotal'), format: (v) => Number(v).toFixed(2) },
      { key: 'vatAmount', label: t('الضريبة', 'VAT'), format: (v) => Number(v).toFixed(2) },
      { key: 'totalAmount', label: t('الإجمالي', 'Total'), format: (v) => Number(v).toFixed(2) },
      { key: 'paidAmount', label: t('المدفوع', 'Paid'), format: (v) => Number(v).toFixed(2) },
      { key: 'status', label: t('الحالة', 'Status'), format: (v) => invoiceStatusLabels[v as string] || String(v) },
    ]
    const rows = filtered.map(pi => ({
      invoiceNo: pi.invoiceNo,
      supplierName: pi.supplier.name,
      poNumber: pi.purchaseOrder?.orderNo || '',
      date: formatDate(pi.date, lang),
      dueDate: formatDate(pi.dueDate, lang),
      subtotal: pi.subtotal,
      vatAmount: pi.vatAmount,
      totalAmount: pi.totalAmount,
      paidAmount: pi.paidAmount,
      status: pi.status,
    }))
    exportToCSV(rows, `supplier-invoices-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('فواتير الموردين', 'Supplier Invoices')}</h1>
          <p className="text-sm text-muted-foreground">{t('إدارة فواتير الموردين الواردة ومتابعة السداد', 'Manage supplier invoices and payment tracking')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => window.print()} title={t('طباعة', 'Print')}>
            <Printer className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleExport} title={t('تصدير CSV', 'Export CSV')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={onCreateNew}>
            <Plus className="size-4" /> {t('فاتورة جديدة', 'New Invoice')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <FileText className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{t('إجمالي الفواتير', 'Total Invoices')}</p>
              <MoneyDisplay value={totalAmount} mode="system" lang={lang} bold size="lg" className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-teal-100 flex items-center justify-center">
              <DollarSign className="size-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-teal-600">{t('المدفوع', 'Paid')}</p>
              <MoneyDisplay value={totalPaid} mode="system" lang={lang} bold size="lg" className="text-teal-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center">
              <CheckCircle className="size-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-600">{t('فواتير مدفوعة', 'Paid Invoices')}</p>
              <p className="text-xl font-bold text-blue-700">{formatNumber(paidCount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-rose-100 flex items-center justify-center">
              <Clock className="size-5 text-rose-600" />
            </div>
            <div>
              <p className="text-sm text-rose-600">{t('فواتير متأخرة', 'Overdue')}</p>
              <p className="text-xl font-bold text-rose-700">{formatNumber(overdueCount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
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
                {Object.entries(invoiceStatusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('كل الموردين', 'All Suppliers')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الموردين', 'All Suppliers')}</SelectItem>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
              <FileText className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t('لا توجد فواتير', 'No invoices found')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onCreateNew}>
                <Plus className="size-4 mr-1" /> {t('إنشاء فاتورة', 'Create Invoice')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No.')}</TableHead>
                    <TableHead className="text-right">{t('المورد', 'Supplier')}</TableHead>
                    <TableHead className="text-right">{t('أمر الشراء', 'PO')}</TableHead>
                    <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                    <TableHead className="text-right">{t('المدفوع', 'Paid')}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                    <TableHead className="text-right">{t('الإجراءات', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(pi => (
                    <TableRow key={pi.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => onViewDetail(pi.id)}>
                      <TableCell className="font-medium font-mono">{pi.invoiceNo}</TableCell>
                      <TableCell>{pi.supplier.name}</TableCell>
                      <TableCell>{pi.purchaseOrder?.orderNo || '—'}</TableCell>
                      <TableCell>{formatDate(pi.date, lang)}</TableCell>
                      <TableCell className="font-semibold">
                        <MoneyDisplay value={pi.totalAmount} mode="system" lang={lang} bold size="sm" />
                      </TableCell>
                      <TableCell>
                        <MoneyDisplay value={pi.paidAmount} mode="system" lang={lang} size="sm" className="text-amber-700" />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={invoiceStatusColors[pi.status]}>
                          {invoiceStatusLabels[pi.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); onViewDetail(pi.id) }} title={t('عرض', 'View')}>
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); onPreview(pi.id) }} title={t('معاينة', 'Preview')}>
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
function InvoiceCreateView({ onBack }: { onBack: () => void }) {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  const queryClient = useQueryClient()

  const [supplierId, setSupplierId] = useState('')
  const [purchaseOrderId, setPurchaseOrderId] = useState('')
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [vatEnabled, setVatEnabled] = useState(true)
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ ...defaultLineItem }])

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery<SupplierOption[]>({
    queryKey: ['suppliers-simple'],
    queryFn: async () => {
      const res = await fetch('/api/suppliers?active=true')
      if (!res.ok) return []
      const data = await res.json()
      return data.map((s: { id: string; code: string; name: string }) => ({ id: s.id, code: s.code, name: s.name }))
    },
  })

  // Fetch purchase orders for linking
  const { data: purchaseOrders = [] } = useQuery<PurchaseOrderOption[]>({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-orders')
      if (!res.ok) return []
      return res.json()
    },
  })

  // When PO is selected, pre-fill items
  React.useEffect(() => {
    if (purchaseOrderId) {
      const po = purchaseOrders.find(p => p.id === purchaseOrderId)
      if (po) {
        setSupplierId(po.supplierId)
        setLineItems(po.items.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })))
      }
    }
  }, [purchaseOrderId, purchaseOrders])

  const subtotal = useMemo(() => lineItems.reduce((s, i) => s + (i.quantity * i.unitPrice), 0), [lineItems])
  const vatRate = vatEnabled ? 0.15 : 0
  const vatAmount = subtotal * vatRate
  const totalAmount = subtotal + vatAmount

  const addLine = () => setLineItems([...lineItems, { ...defaultLineItem }])
  const removeLine = (idx: number) => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)) }
  const updateLine = (idx: number, field: keyof LineItemForm, value: string | number) => {
    setLineItems(lineItems.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/purchase-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] }); onBack() },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      supplierId, purchaseOrderId: purchaseOrderId || null, date, dueDate, notes,
      vatRate,
      items: lineItems.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
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
          <h1 className="text-2xl font-bold text-gray-900">{t('فاتورة مورد جديدة', 'New Supplier Invoice')}</h1>
          <p className="text-sm text-muted-foreground">{t('إنشاء فاتورة شراء جديدة', 'Create a new supplier invoice')}</p>
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
                <Label>{t('أمر الشراء (اختياري)', 'Purchase Order (optional)')}</Label>
                <Select value={purchaseOrderId} onValueChange={setPurchaseOrderId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر أمر الشراء', 'Select PO')} /></SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map(po => <SelectItem key={po.id} value={po.id}>{po.orderNo} - {po.supplier.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ الفاتورة *', 'Invoice Date *')}</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ الاستحقاق *', 'Due Date *')}</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
              </div>
            </div>

            {/* VAT Toggle */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
              <Switch checked={vatEnabled} onCheckedChange={setVatEnabled} />
              <div>
                <Label className="font-medium">{t('ضريبة القيمة المضافة (15%)', 'VAT (15%)')}</Label>
                <p className="text-xs text-muted-foreground">{t('تفعيل أو تعطيل ضريبة القيمة المضافة', 'Enable or disable VAT')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t('بنود الفاتورة', 'Invoice Line Items')}</CardTitle>
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
            {vatEnabled && (
              <div className="flex justify-between text-sm">
                <span>{t('ضريبة القيمة المضافة (15%)', 'VAT (15%)')}</span>
                <span className="font-medium"><MoneyDisplay value={vatAmount} mode="system" lang={lang} size="sm" /></span>
              </div>
            )}
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
          <Button type="submit" disabled={createMutation.isPending || !supplierId || !date || !dueDate} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء الفاتورة', 'Create Invoice')}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Detail View ============
function InvoiceDetailView({ id, onBack, onPreview }: { id: string; onBack: () => void; onPreview: (id: string) => void }) {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const { data: invoice, isLoading, isError } = useQuery<PurchaseInvoice>({
    queryKey: ['purchase-invoices', id],
    queryFn: async () => {
      const res = await fetch('/api/purchase-invoices')
      if (!res.ok) throw new Error()
      const all: PurchaseInvoice[] = await res.json()
      return all.find(i => i.id === id)!
    },
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6"><TableSkeleton /></div>
  if (isError || !invoice) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <AlertCircle className="size-12 text-rose-300" />
        <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
        <Button variant="outline" onClick={onBack}>{t('رجوع', 'Go Back')}</Button>
      </div>
    )
  }

  const balance = invoice.totalAmount - invoice.paidAmount

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{t('فاتورة مورد', 'Supplier Invoice')} {invoice.invoiceNo}</h2>
            <Badge variant="outline" className={invoiceStatusColors[invoice.status]}>
              {invoiceStatusLabels[invoice.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{invoice.supplier.name}</p>
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
            <p className="text-sm font-medium truncate">{invoice.supplier.name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('أمر الشراء', 'PO')}</p>
            <p className="text-sm font-medium">{invoice.purchaseOrder?.orderNo || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('تاريخ الفاتورة', 'Invoice Date')}</p>
            <p className="text-sm font-medium">{formatDate(invoice.date, lang)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('تاريخ الاستحقاق', 'Due Date')}</p>
            <p className="text-sm font-medium">{formatDate(invoice.dueDate, lang)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-600">{t('الإجمالي', 'Total')}</p>
            <MoneyDisplay value={invoice.totalAmount} mode="system" lang={lang} bold size="lg" className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-teal-600">{t('المدفوع', 'Paid')}</p>
            <MoneyDisplay value={invoice.paidAmount} mode="system" lang={lang} bold size="lg" className="text-teal-700" />
          </CardContent>
        </Card>
        <Card className={balance > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}>
          <CardContent className="p-3 text-center">
            <p className={`text-xs ${balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{t('المتبقي', 'Balance')}</p>
            <MoneyDisplay value={balance} mode="system" lang={lang} bold size="lg" className={balance > 0 ? 'text-amber-700' : 'text-emerald-700'} />
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('بنود الفاتورة', 'Invoice Line Items')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                  <TableHead className="text-right">{t('الكمية', 'Qty')}</TableHead>
                  <TableHead className="text-right">{t('سعر الوحدة', 'Unit Price')}</TableHead>
                  <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{formatNumber(item.quantity)}</TableCell>
                    <TableCell><MoneyDisplay value={item.unitPrice} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={item.totalPrice} mode="system" lang={lang} bold size="sm" /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={3} className="text-left font-medium">{t('المجموع قبل الضريبة', 'Subtotal')}</TableCell>
                  <TableCell className="font-semibold"><MoneyDisplay value={invoice.subtotal} mode="system" lang={lang} size="sm" /></TableCell>
                </TableRow>
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={3} className="text-left font-medium">{t('ضريبة القيمة المضافة', 'VAT')} ({(invoice.vatRate * 100).toFixed(0)}%)</TableCell>
                  <TableCell className="font-semibold"><MoneyDisplay value={invoice.vatAmount} mode="system" lang={lang} size="sm" /></TableCell>
                </TableRow>
                <TableRow className="bg-emerald-50">
                  <TableCell colSpan={3} className="text-left font-bold text-emerald-700">{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell className="font-bold text-emerald-700"><MoneyDisplay value={invoice.totalAmount} mode="system" lang={lang} bold size="md" /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('ملاحظات', 'Notes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Preview View (Print-Ready) ============
function InvoicePreviewView({ id, onBack }: { id: string; onBack: () => void }) {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const { data: invoice, isLoading } = useQuery<PurchaseInvoice>({
    queryKey: ['purchase-invoices', id],
    queryFn: async () => {
      const res = await fetch('/api/purchase-invoices')
      if (!res.ok) throw new Error()
      const all: PurchaseInvoice[] = await res.json()
      return all.find(i => i.id === id)!
    },
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6"><TableSkeleton /></div>
  if (!invoice) return <div className="p-6 text-center text-rose-600">{t('لم يتم العثور على الفاتورة', 'Invoice not found')}</div>

  return (
    <div className="space-y-4">
      {/* Screen-only toolbar */}
      <div className="flex items-center gap-3 print:hidden">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <h2 className="text-lg font-bold flex-1">{t('معاينة الفاتورة', 'Invoice Preview')}</h2>
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

        {/* Invoice Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-emerald-700">فاتورة مورد</h2>
            <p className="text-sm text-gray-500">Supplier Invoice</p>
          </div>
          <div className="text-left">
            <p className="font-mono font-bold text-lg">{invoice.invoiceNo}</p>
            <p className="text-sm text-gray-600">{t('تاريخ الفاتورة:', 'Invoice Date:')} {formatDate(invoice.date, lang)}</p>
            <p className="text-sm text-gray-600">{t('تاريخ الاستحقاق:', 'Due Date:')} {formatDate(invoice.dueDate, lang)}</p>
          </div>
        </div>

        {/* Supplier Info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-500 mb-1">{t('المورد', 'Supplier')}</p>
            <p className="font-semibold">{invoice.supplier.name}</p>
            <p className="text-sm text-gray-600">كود: {invoice.supplier.code}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-500 mb-1">{t('أمر الشراء', 'Purchase Order')}</p>
            <p className="font-semibold">{invoice.purchaseOrder?.orderNo || '—'}</p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full border-collapse mb-6 text-sm">
          <thead>
            <tr className="bg-emerald-600 text-white">
              <th className="border border-emerald-700 p-2 text-right">#</th>
              <th className="border border-emerald-700 p-2 text-right">{t('الوصف', 'Description')}</th>
              <th className="border border-emerald-700 p-2 text-center">{t('الكمية', 'Qty')}</th>
              <th className="border border-emerald-700 p-2 text-left">{t('سعر الوحدة', 'Unit Price')}</th>
              <th className="border border-emerald-700 p-2 text-left">{t('الإجمالي', 'Total')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border border-gray-300 p-2">{idx + 1}</td>
                <td className="border border-gray-300 p-2">{item.description}</td>
                <td className="border border-gray-300 p-2 text-center">{formatNumber(item.quantity)}</td>
                <td className="border border-gray-300 p-2 text-left" dir="ltr">{formatSAR(item.unitPrice, lang)}</td>
                <td className="border border-gray-300 p-2 text-left font-semibold" dir="ltr">{formatSAR(item.totalPrice, lang)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100">
              <td colSpan={4} className="border border-gray-300 p-2 text-left">{t('المجموع قبل الضريبة', 'Subtotal')}</td>
              <td className="border border-gray-300 p-2 text-left" dir="ltr">{formatSAR(invoice.subtotal, lang)}</td>
            </tr>
            <tr className="bg-gray-100">
              <td colSpan={4} className="border border-gray-300 p-2 text-left">{t('ضريبة القيمة المضافة', 'VAT')} ({(invoice.vatRate * 100).toFixed(0)}%)</td>
              <td className="border border-gray-300 p-2 text-left" dir="ltr">{formatSAR(invoice.vatAmount, lang)}</td>
            </tr>
            <tr className="bg-emerald-50">
              <td colSpan={4} className="border border-gray-300 p-2 text-left font-bold text-emerald-700">{t('الإجمالي', 'Total')}</td>
              <td className="border border-gray-300 p-2 text-left font-bold text-emerald-700" dir="ltr">{formatSAR(invoice.totalAmount, lang)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Payment Status */}
        <div className="mb-6 bg-gray-50 p-3 rounded">
          <div className="flex justify-between text-sm mb-1">
            <span>{t('المدفوع', 'Paid')}</span>
            <span dir="ltr">{formatSAR(invoice.paidAmount, lang)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <span>{t('المتبقي', 'Balance Due')}</span>
            <span className="text-amber-700" dir="ltr">{formatSAR(invoice.totalAmount - invoice.paidAmount, lang)}</span>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-6">
            <p className="text-sm font-semibold mb-1">{t('ملاحظات', 'Notes')}:</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap border border-gray-200 p-2 rounded">{invoice.notes}</p>
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-6 mt-12">
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
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 mt-8 pt-4 border-t border-gray-200">
          {t('هذه فاتورة رسمية صادرة عن شركة بِنَاء للمقاولات', 'This is an official invoice issued by BINAA Construction Co.')}
        </div>
      </div>
    </div>
  )
}

// ============ Main Module ============
export function SupplierInvoicesModule() {
  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })

  switch (viewState.type) {
    case 'create':
      return <InvoiceCreateView onBack={() => setViewState({ type: 'list' })} />
    case 'detail':
      return <InvoiceDetailView id={viewState.id} onBack={() => setViewState({ type: 'list' })} onPreview={(id) => setViewState({ type: 'preview', id })} />
    case 'preview':
      return <InvoicePreviewView id={viewState.id} onBack={() => setViewState({ type: 'detail', id: viewState.id })} />
    default:
      return (
        <InvoiceListView
          onCreateNew={() => setViewState({ type: 'create' })}
          onViewDetail={(id) => setViewState({ type: 'detail', id })}
          onPreview={(id) => setViewState({ type: 'preview', id })}
        />
      )
  }
}

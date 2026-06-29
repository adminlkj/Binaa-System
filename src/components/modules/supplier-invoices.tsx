'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw, Eye, ArrowRight,
  Download, AlertCircle, CheckCircle, BookOpen, Link2, Trash2,
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
import { AccountingEntryDisplay } from '@/components/shared/accounting-entry-display'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
type ViewState =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'detail'; id: string }

interface GROption {
  id: string; receiptNo: string; supplierId: string; purchaseOrderId: string; projectId: string | null; status: string
  supplier: { id: string; name: string; code: string }
  purchaseOrder: { id: string; orderNo: string }
  project: { id: string; name: string; code: string } | null
  items: { description: string; quantityReceived: number; unitPrice: number; totalPrice: number; destination: string | null }[]
}

interface InvoiceItem {
  id: string; description: string; quantity: number; unitPrice: number; totalPrice: number
}

interface SupplierInvoice {
  id: string; invoiceNo: string; supplierId: string; purchaseOrderId: string | null
  goodsReceiptId: string | null; projectId: string | null
  date: string; dueDate: string; supplierInvoiceNo: string | null
  supplierInvoiceDate: string | null; attachmentPath: string | null
  subtotal: number; vatRate: number; vatAmount: number; totalAmount: number
  paidAmount: number; status: string; journalEntryId: string | null; notes: string | null
  supplier: { id: string; name: string; code: string }
  purchaseOrder: { id: string; orderNo: string; status: string } | null
  goodsReceipt: { id: string; receiptNo: string; status: string } | null
  project: { id: string; name: string; code: string; projectType?: string } | null
  items: InvoiceItem[]
}

// ============ Constants ============
const invoiceStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-yellow-700', bg: 'bg-yellow-100' },
  SENT: { label: { ar: 'مرسلة', en: 'Sent' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  PARTIALLY_PAID: { label: { ar: 'مدفوعة جزئياً', en: 'Partially Paid' }, color: 'text-orange-700', bg: 'bg-orange-100' },
  PAID: { label: { ar: 'مدفوعة', en: 'Paid' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  CANCELLED: { label: { ar: 'ملغية', en: 'Cancelled' }, color: 'text-red-700', bg: 'bg-red-100' },
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-24 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Create View ============
function InvoiceCreateView({ onBack }: { onBack: () => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const [goodsReceiptId, setGoodsReceiptId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('')
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState('')
  const [attachmentPath, setAttachmentPath] = useState('')
  const [notes, setNotes] = useState('')

  const { data: goodsReceipts = [] } = useQuery<GROption[]>({
    queryKey: ['goods-receipts-for-invoice'],
    queryFn: async () => {
      const res = await fetch('/api/goods-receipt')
      if (!res.ok) return []
      const all: GROption[] = await res.json()
      return all.filter(gr => gr.status !== 'CANCELLED')
    },
  })

  const selectedGR = goodsReceiptId ? goodsReceipts.find(gr => gr.id === goodsReceiptId) : null

  const subtotal = useMemo(() => {
    if (!selectedGR) return 0
    return selectedGR.items.reduce((s, i) => s + Number(i.totalPrice || 0), 0)
  }, [selectedGR])

  const vatRate = 0.15
  const vatAmount = subtotal * vatRate
  const totalAmount = subtotal + vatAmount

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/supplier-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => {
        if (!r.ok) return r.json().then(err => { throw new Error(err.error || 'Failed') })
        return r.json()
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['supplier-invoices'] }); queryClient.invalidateQueries({ queryKey: ['goods-receipt'] }); toast.success(t('تم إنشاء الفاتورة بنجاح', 'Invoice created successfully', lang)); onBack() },
    onError: (err) => toast.error(err.message || t('فشل في إنشاء الفاتورة', 'Failed to create invoice', lang)),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      goodsReceiptId,
      date,
      dueDate,
      supplierInvoiceNo: supplierInvoiceNo || null,
      supplierInvoiceDate: supplierInvoiceDate || null,
      attachmentPath: attachmentPath || null,
      notes: notes || null,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('فاتورة مورد جديدة', 'New Supplier Invoice', lang)}</h1>
          <p className="text-sm text-muted-foreground">{t('إنشاء فاتورة من إيصال استلام', 'Create invoice from goods receipt', lang)}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="size-4 text-emerald-600" />
              {t('اختر إيصال الاستلام (مطلوب)', 'Select Goods Receipt (Required)', lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-medium">{t('إيصال الاستلام *', 'Goods Receipt *', lang)}</Label>
              <Select value={goodsReceiptId} onValueChange={setGoodsReceiptId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر إيصال استلام', 'Select goods receipt', lang)} /></SelectTrigger>
                <SelectContent>
                  {goodsReceipts.map(gr => (
                    <SelectItem key={gr.id} value={gr.id}>{gr.receiptNo} - {gr.supplier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedGR && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs text-gray-600">{t('المورد', 'Supplier', lang)}</p>
                  <p className="text-sm font-medium">{selectedGR.supplier.name}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs text-gray-600">{t('أمر الشراء', 'PO', lang)}</p>
                  <p className="text-sm font-medium">{selectedGR.purchaseOrder?.orderNo || '—'}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs text-gray-600">{t('المشروع', 'Project', lang)}</p>
                  <p className="text-sm font-medium">{selectedGR.project?.name || '—'}</p>
                </div>
              </div>
            )}

            {selectedGR && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                    <TableHead className="text-right">{t('الكمية', 'Qty', lang)}</TableHead>
                    <TableHead className="text-right">{t('سعر الوحدة', 'Unit Price', lang)}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                    <TableHead className="text-right">{t('الوجهة', 'Destination', lang)}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {selectedGR.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{formatNumber(item.quantityReceived)}</TableCell>
                        <TableCell><MoneyDisplay value={item.unitPrice} mode="system" lang={lang} size="sm" /></TableCell>
                        <TableCell className="font-semibold"><MoneyDisplay value={item.totalPrice} mode="system" lang={lang} bold size="sm" /></TableCell>
                        <TableCell>
                          <Badge className={item.destination === 'INVENTORY' ? 'bg-teal-100 text-teal-700 border-0' : 'bg-blue-100 text-blue-700 border-0'}>
                            {item.destination === 'INVENTORY' ? t('مخزون', 'Inventory', lang) : t('مشروع', 'Project', lang)}
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

        <Card>
          <CardHeader><CardTitle className="text-lg">{t('معلومات الفاتورة', 'Invoice Information', lang)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('رقم فاتورة المورد', 'Supplier Invoice No', lang)}</Label>
                <Input value={supplierInvoiceNo} onChange={e => setSupplierInvoiceNo(e.target.value)} placeholder={t('رقم الفاتورة من المورد', 'Invoice number from supplier', lang)} />
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ فاتورة المورد', 'Supplier Invoice Date', lang)}</Label>
                <Input type="date" value={supplierInvoiceDate} onChange={e => setSupplierInvoiceDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ الفاتورة *', 'Invoice Date *', lang)}</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ الاستحقاق *', 'Due Date *', lang)}</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>{t('المرفقات', 'Attachment', lang)}</Label>
                <Input value={attachmentPath} onChange={e => setAttachmentPath(e.target.value)} placeholder={t('رابط المرفق', 'Attachment URL', lang)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedGR && (
          <Card className="bg-gray-50 border-dashed">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground mb-2">{t('يتم حساب المبالغ تلقائياً من إيصال الاستلام', 'Amounts are auto-calculated from goods receipt', lang)}</p>
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
        )}

        <Card>
          <CardHeader><CardTitle className="text-lg">{t('ملاحظات', 'Notes', lang)}</CardTitle></CardHeader>
          <CardContent><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ملاحظات إضافية', 'Additional notes', lang)} rows={3} /></CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>{t('إلغاء', 'Cancel', lang)}</Button>
          <Button type="submit" disabled={createMutation.isPending || !goodsReceiptId || !date || !dueDate} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...', lang) : t('إنشاء الفاتورة', 'Create Invoice', lang)}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Detail View ============
function InvoiceDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const { data: invoice, isLoading, isError } = useQuery<SupplierInvoice>({
    queryKey: ['supplier-invoices', id],
    queryFn: async () => {
      const res = await fetch(`/api/supplier-invoices/${id}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!id,
  })

  const approveMutation = useMutation({
    mutationFn: () => fetch(`/api/supplier-invoices/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'SENT' }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['supplier-invoices', id] }); queryClient.invalidateQueries({ queryKey: ['supplier-invoices'] }); toast.success(t('تم اعتماد الفاتورة وإنشاء القيد المحاسبي', 'Invoice approved and accounting entry created', lang)) },
    onError: () => toast.error(t('فشل في اعتماد الفاتورة', 'Failed to approve invoice', lang)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => fetch(`/api/supplier-invoices/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['supplier-invoices'] }); toast.success(t('تم الحذف', 'Deleted', lang)); onBack() },
    onError: () => toast.error(t('فشل في الحذف', 'Failed to delete', lang)),
  })

  if (isLoading) return <div className="p-6"><TableSkeleton /></div>
  if (isError || !invoice) return (
    <div className="flex flex-col items-center gap-3 py-10">
      <p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p>
      <Button variant="outline" onClick={onBack}>{t('رجوع', 'Go Back', lang)}</Button>
    </div>
  )

  const cfg = invoiceStatusConfig[invoice.status] || invoiceStatusConfig.DRAFT
  const balance = invoice.totalAmount - invoice.paidAmount

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold">{t('فاتورة مورد', 'Supplier Invoice', lang)} {invoice.invoiceNo}</h2>
            <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
            {invoice.journalEntryId && (
              <Badge className="bg-purple-100 text-purple-700 border-0 gap-1"><BookOpen className="size-3" />{t('قيد محاسبي', 'Accounting Entry', lang)}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{invoice.supplier.name}</p>
        </div>
        {invoice.status === 'DRAFT' && (
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
            <CheckCircle className="size-4" /> {t('اعتماد وإنشاء قيد', 'Approve & Post', lang)}
          </Button>
        )}
        {invoice.status === 'DRAFT' && (
          <Button variant="ghost" size="icon" className="size-8 text-rose-600" onClick={() => { if (confirm(t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang))) deleteMutation.mutate() }}><Trash2 className="size-4" /></Button>
        )}
      </div>

      {/* Accounting entry reference */}
      {invoice.journalEntryId && (
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-3 flex items-center gap-2">
            <BookOpen className="size-4 text-purple-600" />
            <span className="text-sm text-purple-700">{t('تم إنشاء قيد محاسبي تلقائي', 'Auto accounting entry created', lang)}</span>
            <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">{invoice.journalEntryId.slice(0, 8)}...</Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('المورد', 'Supplier', lang)}</p>
          <p className="text-sm font-medium truncate">{invoice.supplier.name}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('أمر الشراء', 'PO', lang)}</p>
          <div className="flex items-center gap-1">
            <Link2 className="size-3 text-blue-500" />
            <p className="text-sm font-medium">{invoice.purchaseOrder?.orderNo || '—'}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('إيصال الاستلام', 'GR', lang)}</p>
          <div className="flex items-center gap-1">
            <Link2 className="size-3 text-teal-500" />
            <p className="text-sm font-medium">{invoice.goodsReceipt?.receiptNo || '—'}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('رقم فاتورة المورد', 'Supplier Inv No', lang)}</p>
          <p className="text-sm font-medium">{invoice.supplierInvoiceNo || '—'}</p>
        </CardContent></Card>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-600">{t('الإجمالي', 'Total', lang)}</p>
            <MoneyDisplay value={invoice.totalAmount} mode="system" lang={lang} bold size="lg" className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-teal-600">{t('المدفوع', 'Paid', lang)}</p>
            <MoneyDisplay value={invoice.paidAmount} mode="system" lang={lang} bold size="lg" className="text-teal-700" />
          </CardContent>
        </Card>
        <Card className={balance > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}>
          <CardContent className="p-3 text-center">
            <p className={`text-xs ${balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{t('المتبقي', 'Balance', lang)}</p>
            <MoneyDisplay value={balance} mode="system" lang={lang} bold size="lg" className={balance > 0 ? 'text-amber-700' : 'text-emerald-700'} />
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-lg">{t('بنود الفاتورة', 'Invoice Items', lang)}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead className="text-right">{t('الكمية', 'Qty', lang)}</TableHead>
                <TableHead className="text-right">{t('سعر الوحدة', 'Unit Price', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
              </TableRow></TableHeader>
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
                  <TableCell colSpan={3} className="text-left font-medium">{t('المجموع قبل الضريبة', 'Subtotal', lang)}</TableCell>
                  <TableCell className="font-semibold"><MoneyDisplay value={invoice.subtotal} mode="system" lang={lang} size="sm" /></TableCell>
                </TableRow>
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={3} className="text-left font-medium">{t('ضريبة القيمة المضافة', 'VAT', lang)} ({((invoice.vatRate ?? 0) * 100).toFixed(0)}%)</TableCell>
                  <TableCell className="font-semibold"><MoneyDisplay value={invoice.vatAmount} mode="system" lang={lang} size="sm" /></TableCell>
                </TableRow>
                <TableRow className="bg-emerald-50">
                  <TableCell colSpan={3} className="text-left font-bold text-emerald-700">{t('الإجمالي', 'Total', lang)}</TableCell>
                  <TableCell className="font-bold text-emerald-700"><MoneyDisplay value={invoice.totalAmount} mode="system" lang={lang} bold size="md" /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('ملاحظات', 'Notes', lang)}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p></CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Main Module ============
export function SupplierInvoicesModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })

  const { data: invoices = [], isLoading, isError, refetch } = useQuery<SupplierInvoice[]>({
    queryKey: ['supplier-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/supplier-invoices')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/supplier-invoices/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['supplier-invoices'] }); toast.success(t('تم الحذف', 'Deleted', lang)) },
    onError: () => toast.error(t('فشل في الحذف', 'Failed to delete', lang)),
  })

  const totalAmount = invoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0)
  const totalPaid = invoices.reduce((s, i) => s + Number(i.paidAmount || 0), 0)
  const paidCount = invoices.filter(i => i.status === 'PAID').length

  const filtered = invoices.filter(i => {
    const matchSearch = !search || i.invoiceNo.toLowerCase().includes(search.toLowerCase()) || i.supplier.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || i.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'invoiceNo', label: t('رقم الفاتورة', 'Invoice No', lang) },
      { key: 'supplierName', label: t('المورد', 'Supplier', lang) },
      { key: 'poNumber', label: t('أمر الشراء', 'PO', lang) },
      { key: 'grNumber', label: t('إيصال الاستلام', 'GR', lang) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
      { key: 'subtotal', label: t('المجموع الفرعي', 'Subtotal', lang), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'vatAmount', label: t('الضريبة', 'VAT', lang), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'totalAmount', label: t('الإجمالي', 'Total', lang), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'status', label: t('الحالة', 'Status', lang) },
    ]
    exportToCSV(filtered.map(i => ({
      invoiceNo: i.invoiceNo, supplierName: i.supplier.name,
      poNumber: i.purchaseOrder?.orderNo || '', grNumber: i.goodsReceipt?.receiptNo || '',
      date: formatDate(i.date, lang), subtotal: i.subtotal, vatAmount: i.vatAmount,
      totalAmount: i.totalAmount, status: i.status,
    })), `supplier-invoices-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  if (viewState.type === 'create') return <InvoiceCreateView onBack={() => setViewState({ type: 'list' })} />
  if (viewState.type === 'detail') return <InvoiceDetailView id={viewState.id} onBack={() => setViewState({ type: 'list' })} />

  return (
    <ModuleLayout
      title={{ ar: 'فواتير الموردين', en: 'Supplier Invoices' }}
      subtitle={{ ar: 'إدارة فواتير الموردين ومتابعة السداد', en: 'Manage supplier invoices and payment tracking' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
            <Plus className="size-4" /> {t('فاتورة جديدة', 'New Invoice', lang)}
          </Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center"><FileText className="size-5 text-emerald-600" /></div>
            <div>
              <p className="text-sm text-emerald-600">{t('إجمالي الفواتير', 'Total Invoices', lang)}</p>
              <MoneyDisplay value={totalAmount} mode="system" lang={lang} bold size="lg" className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-teal-100 flex items-center justify-center"><CheckCircle className="size-5 text-teal-600" /></div>
            <div>
              <p className="text-sm text-teal-600">{t('المدفوع', 'Paid', lang)}</p>
              <MoneyDisplay value={totalPaid} mode="system" lang={lang} bold size="lg" className="text-teal-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center"><AlertCircle className="size-5 text-amber-600" /></div>
            <div>
              <p className="text-sm text-amber-600">{t('المتبقي', 'Outstanding', lang)}</p>
              <MoneyDisplay value={totalAmount - totalPaid} mode="system" lang={lang} bold size="lg" className="text-amber-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center"><CheckCircle className="size-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-blue-600">{t('فواتير مدفوعة', 'Paid Invoices', lang)}</p>
              <p className="text-xl font-bold text-blue-700">{formatNumber(paidCount)}</p>
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
              {Object.entries(invoiceStatusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>)}
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
            <p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p>
            <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <FileText className="size-12 text-gray-300" />
            <p className="text-muted-foreground">{t('لا توجد فواتير', 'No invoices found', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
              <Plus className="size-4 mr-1" /> {t('إنشاء فاتورة', 'Create Invoice', lang)}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                <TableHead className="text-right">{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead className="text-right">{t('أمر الشراء', 'PO', lang)}</TableHead>
                <TableHead className="text-right">{t('إيصال الاستلام', 'GR', lang)}</TableHead>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-right">{t('القيد المحاسبي', 'Accounting', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(i => {
                  const cfg = invoiceStatusConfig[i.status] || invoiceStatusConfig.DRAFT
                  return (
                    <TableRow key={i.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', id: i.id })}>
                      <TableCell className="font-mono font-medium">{i.invoiceNo}</TableCell>
                      <TableCell>{i.supplier.name}</TableCell>
                      <TableCell><Badge className="bg-blue-50 text-blue-700 border-0 text-xs gap-1"><Link2 className="size-3" />{i.purchaseOrder?.orderNo || '—'}</Badge></TableCell>
                      <TableCell><Badge className="bg-teal-50 text-teal-700 border-0 text-xs gap-1"><Link2 className="size-3" />{i.goodsReceipt?.receiptNo || '—'}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {i.project?.name || '—'}
                          {i.project?.projectType && <ProjectTypeBadge projectType={i.project.projectType} lang={lang} />}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(i.date, lang)}</TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={i.totalAmount} mode="system" lang={lang} bold size="sm" /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
                          {i.journalEntryId && <BookOpen className="size-3 text-purple-500" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <AccountingEntryDisplay journalEntryId={i.journalEntryId} lang={lang} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); setViewState({ type: 'detail', id: i.id }) }} title={t('عرض', 'View', lang)}>
                            <Eye className="size-4" />
                          </Button>
                          {i.status === 'DRAFT' && (
                            <Button variant="ghost" size="icon" className="size-8 text-rose-600" onClick={e => { e.stopPropagation(); if (confirm(t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang))) deleteMutation.mutate(i.id) }}><Trash2 className="size-4" /></Button>
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

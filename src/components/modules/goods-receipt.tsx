'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Plus, Search, Trash2, RefreshCw, Eye, ArrowRight,
  Download, CheckCircle, AlertCircle, Link2, BookOpen, FileText,
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

interface POItem {
  id: string; description: string; quantity: number; unit: string | null; unitPrice: number; totalPrice: number
}

interface PurchaseOrderOption {
  id: string; orderNo: string; supplierId: string; projectId: string | null; status: string
  supplier: { id: string; name: string; code: string }
  project: { id: string; name: string; code: string } | null
  items: POItem[]
  goodsReceipts: { id: string; items: { quantityReceived: number }[] }[]
}

interface GoodsReceiptItem {
  id: string; description: string; quantityOrdered: number; quantityReceived: number
  quantityRemaining: number; unitPrice: number; totalPrice: number; destination: string | null
}

interface LinkedInvoice {
  id: string; invoiceNo: string; status: string; totalAmount: number; paidAmount: number
}

interface GoodsReceipt {
  id: string; receiptNo: string; purchaseOrderId: string; supplierId: string
  projectId: string | null; date: string; status: string; notes: string | null
  purchaseOrder: { id: string; orderNo: string; status: string; supplierId: string }
  supplier: { id: string; name: string; code: string }
  project: { id: string; name: string; code: string; projectType?: string } | null
  items: GoodsReceiptItem[]
  purchaseInvoice?: LinkedInvoice | null
}

interface GRItemForm {
  description: string; quantityOrdered: number; quantityReceived: string
  unitPrice: number; destination: string
}

// ============ Constants ============
const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  PENDING: { label: { ar: 'معلق', en: 'Pending' }, color: 'text-yellow-700', bg: 'bg-yellow-100' },
  PARTIAL: { label: { ar: 'جزئي', en: 'Partial' }, color: 'text-orange-700', bg: 'bg-orange-100' },
  COMPLETED: { label: { ar: 'مكتمل', en: 'Completed' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  CANCELLED: { label: { ar: 'ملغي', en: 'Cancelled' }, color: 'text-red-700', bg: 'bg-red-100' },
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Create View ============
function GRCreateView({ onBack }: { onBack: () => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const [purchaseOrderId, setPurchaseOrderId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<GRItemForm[]>([])

  const { data: purchaseOrders = [] } = useQuery<PurchaseOrderOption[]>({
    queryKey: ['purchase-orders-approved'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-orders')
      if (!res.ok) return []
      const all: PurchaseOrderOption[] = await res.json()
      return all.filter(po => po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED')
    },
  })

  const selectedPO = purchaseOrderId ? purchaseOrders.find(po => po.id === purchaseOrderId) : null

  React.useEffect(() => {
    if (selectedPO) {
      const receivedMap: Record<string, number> = {}
      selectedPO.goodsReceipts?.forEach(gr => {
        gr.items?.forEach((item: { quantityReceived: number }, idx: number) => {
          receivedMap[idx] = (receivedMap[idx] || 0) + item.quantityReceived
        })
      })
      setItems(selectedPO.items.map((item, idx) => ({
        description: item.description,
        quantityOrdered: item.quantity - (receivedMap[idx] || 0),
        quantityReceived: '',
        unitPrice: item.unitPrice,
        destination: 'INVENTORY',
      })))
    } else {
      setItems([])
    }
  }, [purchaseOrderId, selectedPO])

  const totalReceived = useMemo(() => items.reduce((s, i) => s + (parseFloat(i.quantityReceived) || 0), 0), [items])
  const totalOrdered = useMemo(() => items.reduce((s, i) => s + (i.quantityOrdered ?? 0), 0), [items])
  const totalAmount = useMemo(() => items.reduce((s, i) => s + ((parseFloat(i.quantityReceived) || 0) * (i.unitPrice ?? 0)), 0), [items])

  const updateItem = (idx: number, field: keyof GRItemForm, value: string) => {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/goods-receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goods-receipt'] }); queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success(t('تم تسجيل الاستلام بنجاح', 'Goods receipt recorded successfully', lang)); onBack() },
    onError: () => toast.error(t('فشل في تسجيل الاستلام', 'Failed to record goods receipt', lang)),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      purchaseOrderId,
      supplierId: selectedPO?.supplierId,
      projectId: selectedPO?.projectId || null,
      date,
      notes: notes || null,
      items: items.map(i => ({
        description: i.description,
        quantityOrdered: i.quantityOrdered,
        quantityReceived: parseFloat(i.quantityReceived) || 0,
        quantityRemaining: i.quantityOrdered - (parseFloat(i.quantityReceived) || 0),
        unitPrice: i.unitPrice,
        totalPrice: (parseFloat(i.quantityReceived) || 0) * i.unitPrice,
        destination: i.destination,
      })),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('إيصال استلام جديد', 'New Goods Receipt', lang)}</h1>
          <p className="text-sm text-muted-foreground">{t('استلام بضائع من أمر شراء معتمد', 'Receive goods from approved PO', lang)}</p>
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
                  {t('أمر الشراء *', 'Purchase Order *', lang)}
                </Label>
                <Select value={purchaseOrderId} onValueChange={setPurchaseOrderId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر أمر شراء معتمد', 'Select approved PO', lang)} /></SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map(po => (
                      <SelectItem key={po.id} value={po.id}>{po.orderNo} - {po.supplier.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ الاستلام *', 'Receipt Date *', lang)}</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
            </div>

            {selectedPO && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600">{t('المورد', 'Supplier', lang)}</p>
                  <p className="text-sm font-medium">{selectedPO.supplier.name}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600">{t('المشروع', 'Project', lang)}</p>
                  <p className="text-sm font-medium">{selectedPO.project?.name || '—'}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-xs text-emerald-600">{t('إجمالي أمر الشراء', 'PO Total', lang)}</p>
                  <p className="text-sm font-medium"><MoneyDisplay value={selectedPO.items.reduce((s, i) => s + (i.totalPrice ?? 0), 0)} mode="system" lang={lang} size="sm" /></p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{t('بنود الاستلام', 'Receipt Items', lang)}</CardTitle>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600">{t('مطلوب', 'Ordered', lang)}: <strong>{formatNumber(totalOrdered)}</strong></span>
                  <span className="text-emerald-600">{t('مستلم', 'Received', lang)}: <strong>{formatNumber(totalReceived)}</strong></span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {items.map((item, idx) => {
                  const qtyReceived = parseFloat(item.quantityReceived) || 0
                  const qtyRemaining = item.quantityOrdered - qtyReceived
                  return (
                    <div key={idx} className="p-3 rounded-lg border bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{item.description}</span>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-gray-100 text-gray-700 border-0 text-xs">{t('مطلوب', 'Ordered', lang)}: {formatNumber(item.quantityOrdered)}</Badge>
                          <Badge className={`${qtyRemaining >= 0 && qtyReceived > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'} border-0 text-xs`}>
                            {t('متبقي', 'Remaining', lang)}: {formatNumber(Math.max(0, qtyRemaining))}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">{t('الكمية المستلمة *', 'Qty Received *', lang)}</Label>
                          <Input type="number" min="0" max={item.quantityOrdered} step="0.01" value={item.quantityReceived} onChange={e => updateItem(idx, 'quantityReceived', e.target.value)} dir="ltr" className="h-9" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('سعر الوحدة', 'Unit Price', lang)}</Label>
                          <Input type="number" value={item.unitPrice} readOnly className="h-9 bg-gray-100" dir="ltr" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('الإجمالي', 'Total', lang)}</Label>
                          <p className="h-9 flex items-center text-sm font-medium">
                            <MoneyDisplay value={qtyReceived * item.unitPrice} mode="system" lang={lang} size="sm" />
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('الوجهة', 'Destination', lang)}</Label>
                          <Select value={item.destination} onValueChange={v => updateItem(idx, 'destination', v)}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="INVENTORY">{t('مخزون', 'Inventory', lang)}</SelectItem>
                              <SelectItem value="PROJECT">{t('مشروع', 'Project', lang)}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {items.length > 0 && (
          <Card className="bg-gray-50 border-dashed">
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('إجمالي المستلم', 'Total Received', lang)}</span>
                <span className="font-medium">{formatNumber(totalReceived)} / {formatNumber(totalOrdered)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>{t('إجمالي المبلغ', 'Total Amount', lang)}</span>
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
          <Button type="submit" disabled={createMutation.isPending || !purchaseOrderId || !date} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...', lang) : t('تسجيل الاستلام', 'Record Receipt', lang)}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Detail View ============
function GRDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const { data: receipt, isLoading, isError } = useQuery<GoodsReceipt>({
    queryKey: ['goods-receipt', id],
    queryFn: async () => {
      const res = await fetch(`/api/goods-receipt/${id}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!id,
  })

  const completeMutation = useMutation({
    mutationFn: () => fetch(`/api/goods-receipt/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goods-receipt', id] }); queryClient.invalidateQueries({ queryKey: ['goods-receipt'] }); toast.success(t('تم إكمال الاستلام', 'Receipt completed', lang)) },
    onError: () => toast.error(t('فشل في التحديث', 'Failed to update', lang)),
  })

  if (isLoading) return <div className="p-6"><TableSkeleton /></div>
  if (isError || !receipt) return (
    <div className="flex flex-col items-center gap-3 py-10">
      <p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p>
      <Button variant="outline" onClick={onBack}>{t('رجوع', 'Go Back', lang)}</Button>
    </div>
  )

  const cfg = statusConfig[receipt.status] || statusConfig.PENDING

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{t('إيصال استلام', 'Goods Receipt', lang)} {receipt.receiptNo}</h2>
            <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{receipt.supplier.name}</p>
        </div>
        {(receipt.status === 'PENDING' || receipt.status === 'PARTIAL') && (
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
            <CheckCircle className="size-4" /> {t('إكمال', 'Complete', lang)}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('المورد', 'Supplier', lang)}</p>
          <p className="text-sm font-medium">{receipt.supplier.name}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('أمر الشراء', 'PO', lang)}</p>
          <div className="flex items-center gap-1">
            <Link2 className="size-3 text-blue-500" />
            <p className="text-sm font-medium">{receipt.purchaseOrder?.orderNo || '—'}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('المشروع', 'Project', lang)}</p>
          <p className="text-sm font-medium">{receipt.project?.name || '—'}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('التاريخ', 'Date', lang)}</p>
          <p className="text-sm font-medium">{formatDate(receipt.date, lang)}</p>
        </CardContent></Card>
      </div>

      {/* Linked Supplier Invoice */}
      {receipt.purchaseInvoice && (
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-3 flex items-center gap-2">
            <FileText className="size-4 text-purple-600" />
            <span className="text-sm text-purple-700">{t('فاتورة مورد مرتبطة', 'Linked Supplier Invoice', lang)}: <strong>{receipt.purchaseInvoice.invoiceNo}</strong></span>
            <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">{receipt.purchaseInvoice.status}</Badge>
          </CardContent>
        </Card>
      )}

      {/* Items comparison table */}
      <Card>
        <CardHeader><CardTitle className="text-lg">{t('مقارنة الطلب والاستلام', 'Ordered vs Received', lang)}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead className="text-right">{t('مطلوب', 'Ordered', lang)}</TableHead>
                <TableHead className="text-right">{t('مستلم', 'Received', lang)}</TableHead>
                <TableHead className="text-right">{t('متبقي', 'Remaining', lang)}</TableHead>
                <TableHead className="text-right">{t('سعر الوحدة', 'Unit Price', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead className="text-right">{t('الوجهة', 'Destination', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {receipt.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{formatNumber(item.quantityOrdered)}</TableCell>
                    <TableCell className="font-semibold text-emerald-700">{formatNumber(item.quantityReceived)}</TableCell>
                    <TableCell>
                      <Badge className={item.quantityRemaining > 0 ? 'bg-amber-100 text-amber-700 border-0' : 'bg-emerald-100 text-emerald-700 border-0'}>
                        {formatNumber(item.quantityRemaining)}
                      </Badge>
                    </TableCell>
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
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Main Module ============
export function GoodsReceiptModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })

  const { data: receipts = [], isLoading, isError, refetch } = useQuery<GoodsReceipt[]>({
    queryKey: ['goods-receipt'],
    queryFn: async () => { const res = await fetch('/api/goods-receipt'); if (!res.ok) throw new Error(); return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/goods-receipt/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goods-receipt'] }); toast.success(t('تم الحذف', 'Deleted', lang)) },
    onError: () => toast.error(t('فشل في الحذف', 'Failed to delete', lang)),
  })

  const totalReceived = receipts.reduce((s, r) => s + r.items.reduce((si, i) => si + (i.quantityReceived ?? 0), 0), 0)
  const totalAmount = receipts.reduce((s, r) => s + r.items.reduce((si, i) => si + Number(i.totalPrice || 0), 0), 0)

  const filtered = receipts.filter(r => {
    const matchSearch = !search || (r.receiptNo || '').toLowerCase().includes(search.toLowerCase()) || (r.supplier?.name || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'receiptNo', label: t('رقم الإيصال', 'Receipt No', lang) },
      { key: 'supplier', label: t('المورد', 'Supplier', lang) },
      { key: 'purchaseOrder', label: t('أمر الشراء', 'PO', lang) },
      { key: 'project', label: t('المشروع', 'Project', lang) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
      { key: 'status', label: t('الحالة', 'Status', lang) },
    ]
    exportToCSV(filtered.map(r => ({
      receiptNo: r.receiptNo || '', supplier: r.supplier?.name || '',
      purchaseOrder: r.purchaseOrder?.orderNo || '', project: r.project?.name || '',
      date: formatDate(r.date, lang), status: r.status || '',
    })), `goods-receipt-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  if (viewState.type === 'create') return <GRCreateView onBack={() => setViewState({ type: 'list' })} />
  if (viewState.type === 'detail') return <GRDetailView id={viewState.id} onBack={() => setViewState({ type: 'list' })} />

  return (
    <ModuleLayout
      title={{ ar: 'الاستلام', en: 'Goods Receipt' }}
      subtitle={{ ar: 'إدارة استلام البضائع والمواد من أوامر الشراء', en: 'Manage goods receipt from purchase orders' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}><Plus className="size-4" />{t('استلام جديد', 'New Receipt', lang)}</Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center"><Package className="size-5 text-emerald-600" /></div>
            <div>
              <p className="text-sm text-emerald-600">{t('إجمالي الإيصالات', 'Total Receipts', lang)}</p>
              <p className="text-xl font-bold text-emerald-700">{formatNumber(receipts.length)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-teal-100 flex items-center justify-center"><Package className="size-5 text-teal-600" /></div>
            <div>
              <p className="text-sm text-teal-600">{t('إجمالي الوحدات المستلمة', 'Total Units Received', lang)}</p>
              <p className="text-xl font-bold text-teal-700">{formatNumber(totalReceived)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center"><Package className="size-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-blue-600">{t('إجمالي المبلغ المستلم', 'Total Amount', lang)}</p>
              <MoneyDisplay value={totalAmount} mode="system" lang={lang} bold size="lg" className="text-blue-700" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card><CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث بالرقم أو المورد...', 'Search by number or supplier...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('كل الحالات', 'All Statuses', lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('كل الحالات', 'All Statuses', lang)}</SelectItem>
              {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><Package className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد سجلات استلام', 'No goods receipt records', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}><Plus className="size-4 mr-1" />{t('استلام جديد', 'New Receipt', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('رقم الإيصال', 'Receipt No', lang)}</TableHead>
                <TableHead className="text-right">{t('أمر الشراء', 'PO', lang)}</TableHead>
                <TableHead className="text-right">{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-right">{t('فاتورة', 'Invoice', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const cfg = statusConfig[r.status] || statusConfig.PENDING
                  const hasInvoice = !!r.purchaseInvoice
                  return (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', id: r.id })}>
                      <TableCell className="font-mono font-medium">{r.receiptNo || '—'}</TableCell>
                      <TableCell>
                        <Badge className="bg-blue-50 text-blue-700 border-0 text-xs gap-1"><Link2 className="size-3" />{r.purchaseOrder?.orderNo || '—'}</Badge>
                      </TableCell>
                      <TableCell>{r.supplier?.name || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {r.project?.name || '—'}
                          {r.project?.projectType && <ProjectTypeBadge projectType={r.project.projectType} lang={lang} />}
                        </div>
                      </TableCell>
                      <TableCell>{r.date ? formatDate(r.date, lang) : '—'}</TableCell>
                      <TableCell><Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge></TableCell>
                      <TableCell>
                        {hasInvoice ? (
                          <Badge className="bg-purple-100 text-purple-700 border-0 text-xs gap-1"><FileText className="size-3" />{r.purchaseInvoice!.invoiceNo}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); setViewState({ type: 'detail', id: r.id }) }} title={t('عرض', 'View', lang)}><Eye className="size-4" /></Button>
                          {(r.status === 'PENDING' || r.status === 'PARTIAL') && (
                            <Button variant="ghost" size="icon" className="size-8 text-rose-600" onClick={e => { e.stopPropagation(); if (confirm(t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang))) deleteMutation.mutate(r.id) }}><Trash2 className="size-4" /></Button>
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

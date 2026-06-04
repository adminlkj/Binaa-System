'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw, Eye, ArrowRight, X, Printer, Send, CheckCircle, Trash2,
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout, StatusBadge } from '@/components/shared/module-layout'
import { useAppStore, formatSAR, formatDate, formatNumber, commonText } from '@/stores/app-store'

// ============ Types ============
interface ClientOption { id: string; code: string; name: string }
interface ProjectOption { id: string; code: string; name: string }

interface SalesInvoiceItem {
  id: string; description: string; quantity: number; unit?: string | null; unitPrice: number; totalPrice: number
}

interface SalesInvoice {
  id: string; invoiceNo: string; projectId: string | null; contractId?: string | null; clientId: string
  date: string; dueDate: string; subtotal: number; discountRate: number; discountAmount: number; netAmount: number
  vatRate: number; vatAmount: number; totalAmount: number; paidAmount: number; status: string; invoiceType?: string
  notes: string | null; paymentTerms?: string | null
  client: { id: string; name: string; nameAr?: string | null; code: string }
  project: { id: string; name: string; nameAr?: string | null; code: string } | null
  items: SalesInvoiceItem[]
}

interface LineItemForm {
  description: string; quantity: number; unitPrice: number; unit: string
}

// ============ Labels ============
const labels = {
  title: { ar: 'المبيعات', en: 'Sales Invoices' },
  subtitle: { ar: 'إدارة فواتير المبيعات والخدمات', en: 'Manage sales and service invoices' },
  invoiceNo: { ar: 'رقم الفاتورة', en: 'Invoice No.' },
  client: { ar: 'العميل', en: 'Client' },
  project: { ar: 'المشروع', en: 'Project' },
  date: { ar: 'التاريخ', en: 'Date' },
  dueDate: { ar: 'تاريخ الاستحقاق', en: 'Due Date' },
  subtotal: { ar: 'المجموع الفرعي', en: 'Subtotal' },
  vat: { ar: 'الضريبة (15%)', en: 'VAT (15%)' },
  total: { ar: 'الإجمالي', en: 'Total' },
  paid: { ar: 'المدفوع', en: 'Paid' },
  outstanding: { ar: 'المستحق', en: 'Outstanding' },
  status: { ar: 'الحالة', en: 'Status' },
  actions: { ar: 'الإجراءات', en: 'Actions' },
  newInvoice: { ar: 'فاتورة جديدة', en: 'New Invoice' },
  search: { ar: 'بحث برقم الفاتورة أو العميل...', en: 'Search by invoice no. or client...' },
  allStatus: { ar: 'كل الحالات', en: 'All Status' },
  totalSales: { ar: 'إجمالي المبيعات', en: 'Total Sales' },
  description: { ar: 'الوصف', en: 'Description' },
  quantity: { ar: 'الكمية', en: 'Qty' },
  unitPrice: { ar: 'سعر الوحدة', en: 'Unit Price' },
  lineTotal: { ar: 'الإجمالي', en: 'Total' },
  unit: { ar: 'الوحدة', en: 'Unit' },
  paymentTerms: { ar: 'شروط السداد', en: 'Payment Terms' },
  notes: { ar: 'ملاحظات', en: 'Notes' },
  invoiceItems: { ar: 'بنود الفاتورة', en: 'Invoice Items' },
  addItem: { ar: 'إضافة بند', en: 'Add Item' },
  invoiceSummary: { ar: 'ملخص الفاتورة', en: 'Invoice Summary' },
  deleteTitle: { ar: 'حذف الفاتورة', en: 'Delete Invoice' },
  deleteConfirm: { ar: 'هل أنت متأكد من حذف هذه الفاتورة؟', en: 'Are you sure you want to delete this invoice?' },
  noInvoices: { ar: 'لا توجد فواتير مبيعات', en: 'No sales invoices' },
  sendInvoice: { ar: 'إرسال', en: 'Send' },
  markPaid: { ar: 'تأكيد الدفع', en: 'Mark Paid' },
  print: { ar: 'طباعة', en: 'Print' },
}

const defaultLineItem: LineItemForm = { description: '', quantity: 1, unitPrice: 0, unit: '' }

// ============ View State ============
type ViewState = { type: 'list' } | { type: 'create' } | { type: 'detail'; invoiceId: string }

// ============ Skeleton ============
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
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

// ============ Invoice Form Page ============
function SalesInvoiceFormPage({
  clients, projects, onBack,
}: {
  clients: ClientOption[]; projects: ProjectOption[]; onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('30 days')
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ ...defaultLineItem }])

  const subtotal = useMemo(() => lineItems.reduce((s, i) => s + (i.quantity * i.unitPrice), 0), [lineItems])
  const vatRate = 0.15
  const vatAmount = Math.round(subtotal * vatRate * 100) / 100
  const totalAmount = Math.round((subtotal + vatAmount) * 100) / 100

  const addLine = () => setLineItems([...lineItems, { ...defaultLineItem }])
  const removeLine = (idx: number) => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)) }
  const updateLine = (idx: number, field: keyof LineItemForm, value: string | number) => {
    setLineItems(lineItems.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/sales-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
      onBack()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Accounting Integration: When invoice is confirmed/approved,
    // the accounting engine should create journal entries:
    // Debit: Accounts Receivable (totalAmount)
    // Credit: Sales Revenue (subtotal)
    // Credit: Output VAT (vatAmount)
    // This is handled via POST /api/journal-entries with sourceType: SALES_INVOICE
    createMutation.mutate({
      clientId,
      projectId: projectId || null,
      date,
      dueDate,
      notes,
      paymentTerms,
      invoiceType: 'SERVICE',
      discountRate: 0,
      discountAmount: 0,
      items: lineItems.map(i => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unit: i.unit || undefined,
        itemType: 'SERVICE',
      })),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t('فاتورة مبيعات جديدة', 'New Sales Invoice')}</h1>
          <p className="text-sm text-muted-foreground">{t('إنشاء فاتورة خدمة جديدة', 'Create a new service invoice')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Info */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('المعلومات الأساسية', 'Basic Information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.client.ar, labels.client.en)} *</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر العميل', 'Select client')} /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.project.ar, labels.project.en)}</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر المشروع (اختياري)', 'Select project (optional)')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('بدون مشروع', 'No project')}</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.date.ar, labels.date.en)} *</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.dueDate.ar, labels.dueDate.en)} *</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.paymentTerms.ar, labels.paymentTerms.en)}</Label>
                <Input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="30 days" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Line Items */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t(labels.invoiceItems.ar, labels.invoiceItems.en)}</CardTitle>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
                <Plus className="size-3" /> {t(labels.addItem.ar, labels.addItem.en)}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2 p-3 rounded-lg border bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">{t(labels.description.ar, labels.description.en)}</Label>
                    <Input value={item.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder={t('وصف الخدمة', 'Service description')} className="h-9" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t(labels.quantity.ar, labels.quantity.en)}</Label>
                    <Input type="number" min="0" step="0.01" value={item.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t(labels.unit.ar, labels.unit.en)}</Label>
                    <Input value={item.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} placeholder={t('وحدة', 'Unit')} className="h-9" />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">{t(labels.unitPrice.ar, labels.unitPrice.en)}</Label>
                    <Input type="number" min="0" step="0.01" value={item.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-28 text-left">
                    <Label className="text-xs">{t(labels.lineTotal.ar, labels.lineTotal.en)}</Label>
                    <p className="text-sm font-medium mt-1.5"><MoneyDisplay value={item.quantity * item.unitPrice} lang={lang} size="sm" inline /></p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 text-rose-500" onClick={() => removeLine(idx)} disabled={lineItems.length <= 1}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Summary */}
        <Card className="bg-gray-50 border-dashed">
          <CardContent className="p-6 space-y-3">
            <h3 className="text-lg font-semibold mb-2">{t(labels.invoiceSummary.ar, labels.invoiceSummary.en)}</h3>
            <div className="flex justify-between text-sm">
              <span>{t(labels.subtotal.ar, labels.subtotal.en)}</span>
              <span className="font-medium"><MoneyDisplay value={subtotal} lang={lang} size="sm" inline /></span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t(labels.vat.ar, labels.vat.en)}</span>
              <span className="font-medium"><MoneyDisplay value={vatAmount} lang={lang} size="sm" inline /></span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>{t(labels.total.ar, labels.total.en)}</span>
              <span className="text-emerald-700"><MoneyDisplay value={totalAmount} lang={lang} size="lg" inline bold /></span>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Notes */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t(labels.notes.ar, labels.notes.en)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ملاحظات إضافية', 'Additional notes')} rows={3} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>{commonText.cancel[lang]}</Button>
          <Button type="submit" disabled={createMutation.isPending || !clientId || !date || !dueDate} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء الفاتورة', 'Create Invoice')}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Main Sales Module ============
export function SalesModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Fetch invoices (SERVICE type only)
  const { data: invoices = [], isLoading, isError, refetch } = useQuery<SalesInvoice[]>({
    queryKey: ['sales-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/sales-invoices')
      if (!res.ok) throw new Error('Failed to fetch')
      const all: SalesInvoice[] = await res.json()
      // Show only SERVICE invoices here
      return all.filter(i => i.invoiceType === 'SERVICE' || !i.invoiceType)
    },
  })

  // Fetch dropdown options
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

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/sales-invoices/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
      setDeleteId(null)
    },
  })

  // Status workflow mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/sales-invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
    },
  })

  // Filters
  const filtered = invoices.filter(inv => {
    const matchSearch = !search || inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      inv.client.name.toLowerCase().includes(search.toLowerCase()) ||
      (inv.project?.name?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalSales = invoices.reduce((s, i) => s + i.totalAmount, 0)
  const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0)
  const totalOutstanding = totalSales - totalPaid

  // ============ CREATE VIEW ============
  if (viewState.type === 'create') {
    return (
      <SalesInvoiceFormPage
        clients={clients}
        projects={projects}
        onBack={() => setViewState({ type: 'list' })}
      />
    )
  }

  // ============ DETAIL VIEW ============
  if (viewState.type === 'detail') {
    const invoice = invoices.find(i => i.id === viewState.invoiceId)
    if (!invoice) {
      return (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('لم يتم العثور على الفاتورة', 'Invoice not found')}</p>
          <Button variant="outline" onClick={() => setViewState({ type: 'list' })}>{t('العودة', 'Back')}</Button>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setViewState({ type: 'list' })}>
            <ArrowRight className="size-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">{t('فاتورة', 'Invoice')} {invoice.invoiceNo}</h2>
              <StatusBadge status={invoice.status} lang={lang} />
            </div>
            <p className="text-sm text-muted-foreground">{invoice.client.name}</p>
          </div>
          {/* Print button - future integration with print service */}
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="size-4" />
            {t(labels.print.ar, labels.print.en)}
          </Button>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.client.ar, labels.client.en)}</p><p className="text-sm font-medium truncate">{invoice.client.name}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.project.ar, labels.project.en)}</p><p className="text-sm font-medium truncate">{invoice.project?.name || '—'}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.date.ar, labels.date.en)}</p><p className="text-sm font-medium">{formatDate(invoice.date, lang)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.dueDate.ar, labels.dueDate.en)}</p><p className="text-sm font-medium">{formatDate(invoice.dueDate, lang)}</p></CardContent></Card>
        </div>

        {/* Items Table */}
        <Card>
          <CardHeader><CardTitle className="text-lg">{t(labels.invoiceItems.ar, labels.invoiceItems.en)}</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(labels.description.ar, labels.description.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.quantity.ar, labels.quantity.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.unitPrice.ar, labels.unitPrice.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.lineTotal.ar, labels.lineTotal.en)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{formatNumber(item.quantity)}</TableCell>
                      <TableCell><MoneyDisplay value={item.unitPrice} lang={lang} size="sm" inline /></TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={item.totalPrice} lang={lang} size="sm" inline bold /></TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-50">
                    <TableCell colSpan={3} className="text-left font-medium">{t(labels.subtotal.ar, labels.subtotal.en)}</TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={invoice.subtotal} lang={lang} size="sm" inline /></TableCell>
                  </TableRow>
                  <TableRow className="bg-gray-50">
                    <TableCell colSpan={3} className="text-left font-medium">{t(labels.vat.ar, labels.vat.en)}</TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={invoice.vatAmount} lang={lang} size="sm" inline /></TableCell>
                  </TableRow>
                  <TableRow className="bg-emerald-50">
                    <TableCell colSpan={3} className="text-left font-bold text-emerald-700">{t(labels.total.ar, labels.total.en)}</TableCell>
                    <TableCell className="font-bold text-emerald-700"><MoneyDisplay value={invoice.totalAmount} lang={lang} size="md" inline bold /></TableCell>
                  </TableRow>
                  <TableRow className="bg-amber-50">
                    <TableCell colSpan={3} className="text-left font-medium text-amber-700">{t(labels.paid.ar, labels.paid.en)}</TableCell>
                    <TableCell className="font-medium text-amber-700"><MoneyDisplay value={invoice.paidAmount} lang={lang} size="sm" inline /></TableCell>
                  </TableRow>
                  <TableRow className="bg-rose-50">
                    <TableCell colSpan={3} className="text-left font-bold text-rose-700">{t(labels.outstanding.ar, labels.outstanding.en)}</TableCell>
                    <TableCell className="font-bold text-rose-700"><MoneyDisplay value={invoice.totalAmount - invoice.paidAmount} lang={lang} size="md" inline bold /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {invoice.notes && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">{t(labels.notes.ar, labels.notes.en)}</p>
              <p className="text-sm">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Status Workflow Actions */}
        {/* Accounting Integration: When invoice status changes to SENT/PAID,
            the accounting engine should create journal entries:
            - On SENT: Debit Accounts Receivable, Credit Sales Revenue + Output VAT
            - On PAID: Debit Cash/Bank, Credit Accounts Receivable
            This is handled via POST /api/journal-entries with sourceType: SALES_INVOICE */}
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold">{t('إجراءات:', 'Actions:')}</span>
              {invoice.status === 'DRAFT' && (
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => statusMutation.mutate({ id: invoice.id, status: 'SENT' })} disabled={statusMutation.isPending}>
                  <Send className="size-4" /> {t(labels.sendInvoice.ar, labels.sendInvoice.en)}
                </Button>
              )}
              {invoice.status === 'SENT' && (
                <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => statusMutation.mutate({ id: invoice.id, status: 'PAID' })} disabled={statusMutation.isPending}>
                  <CheckCircle className="size-4" /> {t(labels.markPaid.ar, labels.markPaid.en)}
                </Button>
              )}
              {invoice.status === 'PAID' && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-sm px-3 py-1">
                  <CheckCircle className="size-4 ml-1" /> {t('مدفوعة', 'Paid')}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ============ LIST VIEW ============
  return (
    <ModuleLayout
      title={labels.title}
      subtitle={labels.subtitle}
      actions={
        <>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
            <Plus className="size-4" /> {t(labels.newInvoice.ar, labels.newInvoice.en)}
          </Button>
        </>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4">
            <p className="text-sm text-emerald-600">{t(labels.totalSales.ar, labels.totalSales.en)}</p>
            <MoneyDisplay value={totalSales} lang={lang} size="xl" bold className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm text-amber-600">{t(labels.paid.ar, labels.paid.en)}</p>
            <MoneyDisplay value={totalPaid} lang={lang} size="xl" bold className="text-amber-700" />
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4">
            <p className="text-sm text-rose-600">{t(labels.outstanding.ar, labels.outstanding.en)}</p>
            <MoneyDisplay value={totalOutstanding} lang={lang} size="xl" bold className="text-rose-700" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t(labels.search.ar, labels.search.en)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t(labels.allStatus.ar, labels.allStatus.en)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(labels.allStatus.ar, labels.allStatus.en)}</SelectItem>
                <SelectItem value="DRAFT">{t('مسودة', 'Draft')}</SelectItem>
                <SelectItem value="SENT">{t('مرسلة', 'Sent')}</SelectItem>
                <SelectItem value="PARTIALLY_PAID">{t('مدفوعة جزئياً', 'Partially Paid')}</SelectItem>
                <SelectItem value="PAID">{t('مدفوعة', 'Paid')}</SelectItem>
                <SelectItem value="OVERDUE">{t('متأخرة', 'Overdue')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{commonText.error[lang]}</p>
              <Button variant="outline" onClick={() => refetch()}>{commonText.retry[lang]}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <FileText className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t(labels.noInvoices.ar, labels.noInvoices.en)}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
                <Plus className="size-4 mr-1" /> {t(labels.newInvoice.ar, labels.newInvoice.en)}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(labels.invoiceNo.ar, labels.invoiceNo.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.client.ar, labels.client.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.project.ar, labels.project.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.date.ar, labels.date.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.total.ar, labels.total.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.paid.ar, labels.paid.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.status.ar, labels.status.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.actions.ar, labels.actions.en)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(inv => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', invoiceId: inv.id })}>
                      <TableCell className="font-medium font-mono">{inv.invoiceNo}</TableCell>
                      <TableCell>{inv.client.name}</TableCell>
                      <TableCell>{inv.project?.name || '—'}</TableCell>
                      <TableCell>{formatDate(inv.date, lang)}</TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" inline bold /></TableCell>
                      <TableCell className="text-amber-700"><MoneyDisplay value={inv.paidAmount} lang={lang} size="sm" inline /></TableCell>
                      <TableCell><StatusBadge status={inv.status} lang={lang} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewState({ type: 'detail', invoiceId: inv.id })} title={t('عرض', 'View')}>
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-600" onClick={() => setDeleteId(inv.id)} title={t('حذف', 'Delete')} disabled={inv.status !== 'DRAFT'}>
                            <Trash2 className="size-4" />
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(labels.deleteTitle.ar, labels.deleteTitle.en)}</AlertDialogTitle>
            <AlertDialogDescription>{t(labels.deleteConfirm.ar, labels.deleteConfirm.en)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{commonText.cancel[lang]}</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {commonText.delete[lang]}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModuleLayout>
  )
}

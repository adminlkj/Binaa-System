'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Plus, Search, RefreshCw, Eye, Trash2, Download,
  Landmark, Building2, FileText,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { useAppStore, formatDate, commonText, type Lang } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { toast } from 'sonner'

// ============ Types ============

interface ClientSummary { id: string; name: string; code: string }

interface InvoiceSummary {
  id: string; invoiceNo: string; totalAmount: number; paidAmount: number
  status: string; sourceType: string; invoiceType: string
}

interface RentalPaymentItem {
  id: string
  clientId: string
  invoiceId: string | null
  amount: number
  date: string
  receivedIn: string
  reference: string | null
  notes: string | null
  journalEntryId: string | null
  createdAt: string
  client: ClientSummary
  invoice: InvoiceSummary | null
}

// ============ Labels ============

const labels = {
  title: { ar: 'تحصيلات التأجير', en: 'Rental Collections' },
  subtitle: { ar: 'تحصيلات فواتير التأجير', en: 'Collections for rental invoices' },
  newPayment: { ar: 'تحصيل جديد', en: 'New Collection' },
  search: { ar: 'بحث بالعميل أو المرجع...', en: 'Search by client or reference...' },
  client: { ar: 'العميل', en: 'Client' },
  invoice: { ar: 'الفاتورة', en: 'Invoice' },
  amount: { ar: 'المبلغ', en: 'Amount' },
  date: { ar: 'التاريخ', en: 'Date' },
  receivedIn: { ar: 'عن طريق', en: 'Via' },
  reference: { ar: 'المرجع', en: 'Reference' },
  notes: { ar: 'ملاحظات', en: 'Notes' },
  actions: { ar: 'الإجراءات', en: 'Actions' },
  totalPayments: { ar: 'إجمالي التحصيلات', en: 'Total Collections' },
  paymentCount: { ar: 'عدد التحصيلات', en: 'Payment Count' },
  avgPayment: { ar: 'متوسط التحصيل', en: 'Average Payment' },
  treasury: { ar: 'الخزينة', en: 'Treasury' },
  bank: { ar: 'البنك', en: 'Bank' },
  selectClient: { ar: 'اختر العميل', en: 'Select Client' },
  selectInvoice: { ar: 'اختر الفاتورة', en: 'Select Invoice' },
  noInvoices: { ar: 'لا توجد فواتير تأجير', en: 'No rental invoices' },
  deleteTitle: { ar: 'حذف التحصيل', en: 'Delete Collection' },
  deleteConfirm: { ar: 'هل أنت متأكد من حذف هذا التحصيل؟', en: 'Are you sure you want to delete this collection?' },
  noPayments: { ar: 'لا توجد تحصيلات تأجير', en: 'No rental collections' },
  editPayment: { ar: 'تعديل التحصيل', en: 'Edit Collection' },
  accountingEntry: { ar: 'القيد المحاسبي', en: 'Accounting Entry' },
}

// ============ Helpers ============

function t(ar: string, en: string, lang: Lang) {
  return lang === 'ar' ? ar : en
}

const receivedInLabels: Record<string, { ar: string; en: string }> = {
  TREASURY: { ar: 'الخزينة', en: 'Treasury' },
  BANK: { ar: 'البنك', en: 'Bank' },
}

const receivedInColors: Record<string, string> = {
  TREASURY: 'bg-amber-100 text-amber-700 border-amber-200',
  BANK: 'bg-sky-100 text-sky-700 border-sky-200',
}

// ============ Skeleton ============

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Add Payment Dialog ============

function AddPaymentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const tt = (ar: string, en: string) => t(ar, en, lang)

  const [clientId, setClientId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [receivedIn, setReceivedIn] = useState('TREASURY')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  // Fetch clients
  const { data: clients = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients-for-rental-payments'],
    queryFn: async () => {
      const res = await fetch('/api/clients')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Fetch rental invoices
  const { data: invoices = [] } = useQuery<InvoiceSummary[]>({
    queryKey: ['rental-invoices-for-payments', clientId],
    queryFn: async () => {
      const res = await fetch('/api/sales-invoices')
      if (!res.ok) return []
      const all: InvoiceSummary[] = await res.json()
      const rental = all.filter(inv =>
        inv.sourceType === 'TIMESHEET' || inv.invoiceType === 'RENTAL'
      )
      if (clientId) return rental.filter(inv => inv.status !== 'PAID' && inv.status !== 'CANCELLED')
      return rental
    },
    enabled: !!clientId,
  })

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setClientId(''); setInvoiceId(''); setAmount('')
      setDate(new Date().toISOString().split('T')[0])
      setReceivedIn('TREASURY'); setReference(''); setNotes('')
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/client-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-client-payments'] })
      toast(tt('تم تسجيل التحصيل بنجاح', 'Collection has been recorded successfully'))
      onClose()
    },
    onError: () => {
      toast.error(tt('فشل في تسجيل التحصيل', 'Failed to record collection'))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsedAmount = parseFloat(amount) || 0
    if (!clientId || parsedAmount <= 0 || !date) return

    createMutation.mutate({
      clientId,
      invoiceId: invoiceId || null,
      amount: parsedAmount,
      date,
      receivedIn,
      reference: reference || null,
      notes: notes || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-cyan-600" />
            {tt(labels.newPayment.ar, labels.newPayment.en)}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Client Selection */}
          <div className="space-y-2">
            <Label>{tt(labels.client.ar, labels.client.en)} *</Label>
            <Select value={clientId} onValueChange={v => { setClientId(v); setInvoiceId(''); setAmount('') }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={tt(labels.selectClient.ar, labels.selectClient.en)} />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Invoice Selection */}
          <div className="space-y-2">
            <Label>{tt(labels.invoice.ar, labels.invoice.en)}</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId} disabled={!clientId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={
                  !clientId
                    ? tt(labels.selectClient.ar, labels.selectClient.en)
                    : invoices.length === 0
                      ? tt(labels.noInvoices.ar, labels.noInvoices.en)
                      : tt(labels.selectInvoice.ar, labels.selectInvoice.en)
                } />
              </SelectTrigger>
              <SelectContent>
                {invoices.filter(inv => !clientId || inv.id === clientId || true).map(inv => (
                  <SelectItem key={inv.id} value={inv.id}>{inv.invoiceNo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>{tt(labels.amount.ar, labels.amount.en)} *</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" dir="ltr" required />
          </div>

          {/* Date & Received In */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{tt(labels.date.ar, labels.date.en)} *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{tt(labels.receivedIn.ar, labels.receivedIn.en)}</Label>
              <Select value={receivedIn} onValueChange={setReceivedIn}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TREASURY">
                    <span className="flex items-center gap-2">
                      <Landmark className="size-3.5" />
                      {tt(receivedInLabels.TREASURY.ar, receivedInLabels.TREASURY.en)}
                    </span>
                  </SelectItem>
                  <SelectItem value="BANK">
                    <span className="flex items-center gap-2">
                      <Building2 className="size-3.5" />
                      {tt(receivedInLabels.BANK.ar, receivedInLabels.BANK.en)}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reference */}
          <div className="space-y-2">
            <Label>{tt(labels.reference.ar, labels.reference.en)}</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder={tt('رقم الإيصال', 'Receipt No.')} />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{tt(labels.notes.ar, labels.notes.en)}</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={tt('ملاحظات', 'Notes')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{commonText.cancel[lang]}</Button>
            <Button type="submit" disabled={createMutation.isPending || !clientId || !amount || !date} className="bg-cyan-600 hover:bg-cyan-700 min-w-[140px]">
              {createMutation.isPending ? tt('جاري الحفظ...', 'Saving...') : tt('تسجيل التحصيل', 'Record Collection')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Edit Payment Dialog ============

function EditPaymentDialog({ payment, open, onClose }: { payment: RentalPaymentItem | null; open: boolean; onClose: () => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const tt = (ar: string, en: string) => t(ar, en, lang)

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [receivedIn, setReceivedIn] = useState('TREASURY')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  React.useEffect(() => {
    if (payment && open) {
      setAmount(String(payment.amount))
      setDate(payment.date ? new Date(payment.date).toISOString().split('T')[0] : '')
      setReceivedIn(payment.receivedIn || 'TREASURY')
      setReference(payment.reference || '')
      setNotes(payment.notes || '')
    }
  }, [payment, open])

  const editMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/client-payments/${payment?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-client-payments'] })
      queryClient.invalidateQueries({ queryKey: ['client-payments'] })
      toast(tt('تم تحديث التحصيل بنجاح', 'Collection has been updated successfully'))
      onClose()
    },
    onError: () => {
      toast.error(tt('فشل في تحديث التحصيل', 'Failed to update collection'))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    editMutation.mutate({
      amount: parseFloat(amount) || 0,
      date,
      receivedIn,
      reference: reference || null,
      notes: notes || null,
    })
  }

  if (!payment) return null

  const isPosted = !!payment.journalEntryId

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-cyan-600" />
            {tt(labels.editPayment.ar, labels.editPayment.en)}
          </DialogTitle>
        </DialogHeader>

        {isPosted && (
          <div className="p-3 rounded-lg border bg-amber-50 text-amber-700 text-sm">
            {tt('هذا التحصيل مرحّل محاسبياً - التعديل محدود', 'This collection is posted - editing is limited')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 rounded-lg bg-gray-50 text-sm">
            <span className="text-muted-foreground">{tt('العميل:', 'Client:')}</span>{' '}
            <span className="font-medium">{payment.client.name}</span>
            {payment.invoice && (
              <><span className="text-muted-foreground mx-2">|</span>
              <span className="text-muted-foreground">{tt('الفاتورة:', 'Invoice:')}</span>{' '}
              <span className="font-medium">{payment.invoice.invoiceNo}</span></>
            )}
          </div>

          <div className="space-y-2">
            <Label>{tt(labels.amount.ar, labels.amount.en)} *</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" required disabled={isPosted} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{tt(labels.date.ar, labels.date.en)} *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required disabled={isPosted} />
            </div>
            <div className="space-y-2">
              <Label>{tt(labels.receivedIn.ar, labels.receivedIn.en)}</Label>
              <Select value={receivedIn} onValueChange={setReceivedIn} disabled={isPosted}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TREASURY">{tt(receivedInLabels.TREASURY.ar, receivedInLabels.TREASURY.en)}</SelectItem>
                  <SelectItem value="BANK">{tt(receivedInLabels.BANK.ar, receivedInLabels.BANK.en)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{tt(labels.reference.ar, labels.reference.en)}</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} disabled={isPosted} />
          </div>

          <div className="space-y-2">
            <Label>{tt(labels.notes.ar, labels.notes.en)}</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} disabled={isPosted} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{commonText.cancel[lang]}</Button>
            <Button type="submit" disabled={editMutation.isPending || isPosted} className="bg-cyan-600 hover:bg-cyan-700 min-w-[140px]">
              {editMutation.isPending ? tt('جاري الحفظ...', 'Saving...') : tt('حفظ التعديلات', 'Save Changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Module ============

export function RentalPaymentsModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const tt = (ar: string, en: string) => t(ar, en, lang)

  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editPayment, setEditPayment] = useState<RentalPaymentItem | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Fetch payments
  const { data: payments = [], isLoading, isError, refetch } = useQuery<RentalPaymentItem[]>({
    queryKey: ['rental-client-payments'],
    queryFn: async () => {
      const res = await fetch('/api/client-payments')
      if (!res.ok) throw new Error('Failed')
      const all: RentalPaymentItem[] = await res.json()
      // Filter to only rental invoices
      return all.filter(p => !p.invoice || p.invoice.sourceType === 'TIMESHEET' || p.invoice.invoiceType === 'RENTAL')
    },
    staleTime: 30000,
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/client-payments/${id}`, { method: 'DELETE' }).then(r => {
        if (!r.ok) throw new Error()
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-client-payments'] })
      toast(tt('تم حذف التحصيل بنجاح', 'Collection has been deleted'))
      setDeleteId(null)
    },
    onError: () => {
      toast.error(tt('فشل في حذف التحصيل', 'Failed to delete collection'))
    },
  })

  // Filter
  const filtered = useMemo(() => {
    return payments.filter(p => {
      const matchSearch = !search ||
        p.client.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.reference && p.reference.toLowerCase().includes(search.toLowerCase())) ||
        (p.invoice?.invoiceNo && p.invoice.invoiceNo.toLowerCase().includes(search.toLowerCase()))
      return matchSearch
    })
  }, [payments, search])

  // Stats
  const totalPayments = filtered.reduce((s, p) => s + Number(p.amount || 0), 0)
  const avgPayment = filtered.length > 0 ? totalPayments / filtered.length : 0

  // CSV export
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'clientName', label: tt('العميل', 'Client') },
      { key: 'invoiceNo', label: tt('الفاتورة', 'Invoice') },
      { key: 'amount', label: tt('المبلغ', 'Amount'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'date', label: tt('التاريخ', 'Date') },
      { key: 'receivedIn', label: tt('عن طريق', 'Via'), format: (v) => receivedInLabels[v as string]?.[lang] || String(v) },
      { key: 'reference', label: tt('المرجع', 'Reference') },
      { key: 'notes', label: tt('ملاحظات', 'Notes') },
    ]
    const rows = filtered.map(p => ({
      clientName: p.client.name,
      invoiceNo: p.invoice?.invoiceNo || '',
      amount: p.amount,
      date: formatDate(p.date, lang),
      receivedIn: p.receivedIn,
      reference: p.reference || '',
      notes: p.notes || '',
    }))
    exportToCSV(rows, `rental-payments-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  // Print data
  const printData = useMemo(() => ({
    columns: [
      { key: 'clientName', label: lang === 'ar' ? 'العميل' : 'Client' },
      { key: 'invoiceNo', label: lang === 'ar' ? 'الفاتورة' : 'Invoice' },
      { key: 'amount', label: lang === 'ar' ? 'المبلغ' : 'Amount' },
      { key: 'date', label: lang === 'ar' ? 'التاريخ' : 'Date' },
      { key: 'receivedIn', label: lang === 'ar' ? 'عن طريق' : 'Via' },
    ],
    rows: filtered.map(p => ({
      clientName: p.client.name,
      invoiceNo: p.invoice?.invoiceNo || '—',
      amount: p.amount,
      date: formatDate(p.date, lang),
      receivedIn: receivedInLabels[p.receivedIn]?.[lang] || p.receivedIn,
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
      { label: lang === 'ar' ? 'الإجمالي' : 'Total', value: String(totalPayments) },
    ],
  }), [filtered, lang, totalPayments])

  return (
    <ModuleLayout
      title={labels.title}
      subtitle={labels.subtitle}
      actions={
        <>
          <PrintButton type="rental-payment" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport} title={tt('تصدير CSV', 'Export CSV')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={tt('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-cyan-600 hover:bg-cyan-700" onClick={() => setShowAddDialog(true)}>
            <Plus className="size-4" /> {tt(labels.newPayment.ar, labels.newPayment.en)}
          </Button>
        </>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-cyan-50 border-cyan-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{tt(labels.paymentCount.ar, labels.paymentCount.en)}</p>
            <p className="text-xl font-bold text-cyan-700">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{tt(labels.totalPayments.ar, labels.totalPayments.en)}</p>
            <MoneyDisplay value={totalPayments} lang={lang} size="xl" bold className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{tt(labels.avgPayment.ar, labels.avgPayment.en)}</p>
            <MoneyDisplay value={avgPayment} lang={lang} size="xl" bold className="text-amber-700" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={tt(labels.search.ar, labels.search.en)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
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
              <CreditCard className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{tt(labels.noPayments.ar, labels.noPayments.en)}</p>
              <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={() => setShowAddDialog(true)}>
                <Plus className="size-4 mr-1" /> {tt(labels.newPayment.ar, labels.newPayment.en)}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{tt(labels.date.ar, labels.date.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.client.ar, labels.client.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.invoice.ar, labels.invoice.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.amount.ar, labels.amount.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.receivedIn.ar, labels.receivedIn.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.reference.ar, labels.reference.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.accountingEntry.ar, labels.accountingEntry.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.actions.ar, labels.actions.en)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-cyan-50/50" onClick={() => setEditPayment(p)}>
                      <TableCell className="whitespace-nowrap">{formatDate(p.date, lang)}</TableCell>
                      <TableCell className="font-medium">{p.client.name}</TableCell>
                      <TableCell>
                        {p.invoice ? (
                          <span className="flex items-center gap-1 text-sm">
                            <FileText className="size-3.5 text-muted-foreground" />
                            {p.invoice.invoiceNo}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        <MoneyDisplay value={p.amount} lang={lang} size="sm" inline bold />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${receivedInColors[p.receivedIn] || ''}`}>
                          {receivedInLabels[p.receivedIn]?.[lang] || p.receivedIn}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.reference || '—'}</TableCell>
                      <TableCell>
                        {p.journalEntryId ? (
                          <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">
                            {tt('قيد', 'JE')}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditPayment(p)} title={tt('تعديل', 'Edit')}>
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-500" onClick={() => setDeleteId(p.id)} title={tt('حذف', 'Delete')}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total row */}
                  <TableRow className="bg-cyan-50 font-bold">
                    <TableCell colSpan={3}>{tt('الإجمالي', 'Total')}</TableCell>
                    <TableCell>
                      <MoneyDisplay value={totalPayments} lang={lang} bold size="sm" />
                    </TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <AddPaymentDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} />

      {/* Edit Dialog */}
      <EditPaymentDialog payment={editPayment} open={!!editPayment} onClose={() => setEditPayment(null)} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tt(labels.deleteTitle.ar, labels.deleteTitle.en)}</AlertDialogTitle>
            <AlertDialogDescription>{tt(labels.deleteConfirm.ar, labels.deleteConfirm.en)}</AlertDialogDescription>
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

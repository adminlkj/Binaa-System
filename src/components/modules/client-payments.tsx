'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Plus, Search, RefreshCw, Eye, Trash2, Download,
  Building2, FileText, Pencil,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { AccountSelector } from '@/components/shared/account-selector'
import { JePreview } from '@/components/shared/je-preview'
import { useAppStore, formatDate, commonText, type Lang } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { toast } from 'sonner'

// ============ Types ============

interface ClientSummary { id: string; name: string; code: string }

interface InvoiceSummary {
  id: string; invoiceNo: string; totalAmount: number; paidAmount: number
  status: string; projectId: string | null
  project?: { id: string; name: string; code: string } | null
}

interface ClientPaymentItem {
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
  title: { ar: 'تحصيلات العملاء', en: 'Client Payments' },
  subtitle: { ar: 'تسجيل ومتابعة تحصيلات العملاء', en: 'Record and track client payments' },
  newPayment: { ar: 'تحصيل جديد', en: 'New Payment' },
  search: { ar: 'بحث بالعميل أو المرجع...', en: 'Search by client or reference...' },
  client: { ar: 'العميل', en: 'Client' },
  invoice: { ar: 'الفاتورة', en: 'Invoice' },
  amount: { ar: 'المبلغ', en: 'Amount' },
  date: { ar: 'التاريخ', en: 'Date' },
  receivedIn: { ar: 'التحصيل في', en: 'Received In' },
  reference: { ar: 'المرجع', en: 'Reference' },
  notes: { ar: 'ملاحظات', en: 'Notes' },
  status: { ar: 'الحالة', en: 'Status' },
  actions: { ar: 'الإجراءات', en: 'Actions' },
  totalPayments: { ar: 'إجمالي التحصيلات', en: 'Total Payments' },
  treasury: { ar: 'الخزينة', en: 'Treasury' },
  bank: { ar: 'البنك', en: 'Bank' },
  remaining: { ar: 'المتبقي', en: 'Remaining' },
  accountingEntry: { ar: 'القيد المحاسبي', en: 'Accounting Entry' },
  selectClient: { ar: 'اختر العميل', en: 'Select Client' },
  selectInvoice: { ar: 'اختر الفاتورة', en: 'Select Invoice' },
  noInvoices: { ar: 'لا توجد فواتير غير مسددة', en: 'No unpaid invoices' },
  allClients: { ar: 'كل العملاء', en: 'All Clients' },
  deleteTitle: { ar: 'حذف التحصيل', en: 'Delete Payment' },
  deleteConfirm: { ar: 'هل أنت متأكد من حذف هذا التحصيل؟ سيتم عكس القيد المحاسبي.', en: 'Are you sure? The accounting entry will be reversed.' },
  noPayments: { ar: 'لا توجد تحصيلات', en: 'No payments found' },
  project: { ar: 'المشروع', en: 'Project' },
  balance: { ar: 'الرصيد المتبقي', en: 'Remaining Balance' },
  autoFill: { ar: 'تم تعبئة المبلغ تلقائياً من الفاتورة', en: 'Amount auto-filled from invoice' },
  editPayment: { ar: 'تعديل التحصيل', en: 'Edit Payment' },
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

function AddPaymentDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const tt = (ar: string, en: string) => t(ar, en, lang)

  const [clientId, setClientId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [receivedIn, setReceivedIn] = useState('TREASURY')
  const [receivingAccountId, setReceivingAccountId] = useState<string | null>(null)
  const [receivingAccountCode, setReceivingAccountCode] = useState('')
  const [receivingAccountName, setReceivingAccountName] = useState('')
  // خصائص الحساب المختار — للعرض الديناميكي (badges) وسلوك مستقبلي
  // Single-dropdown case: نُبقي roles=['CASH', 'BANK'] (انظر التعليق تحت AccountSelector)
  const [receivingAccountProps, setReceivingAccountProps] = useState<{
    showInCash?: boolean
    showInBank?: boolean
    allowsClient?: boolean
    allowsCostCenter?: boolean
    accountRole?: string | null
  } | null>(null)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  // Fetch clients
  const { data: clients = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const res = await fetch('/api/clients')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Fetch unpaid invoices for selected client
  const { data: invoices = [] } = useQuery<InvoiceSummary[]>({
    queryKey: ['unpaid-invoices', clientId],
    queryFn: async () => {
      if (!clientId) return []
      const res = await fetch(`/api/sales-invoices?clientId=${clientId}&status=unpaid`)
      if (!res.ok) return []
      const data = await res.json()
      return data.filter((inv: InvoiceSummary) =>
        inv.status !== 'PAID' && inv.status !== 'CANCELLED' && inv.totalAmount - inv.paidAmount > 0
      )
    },
    enabled: !!clientId,
  })

  // Selected invoice
  const selectedInvoice = invoices.find(inv => inv.id === invoiceId)
  const remainingBalance = selectedInvoice
    ? (Number(selectedInvoice.totalAmount || 0)) - (Number(selectedInvoice.paidAmount || 0))
    : 0

  // Auto-fill amount when invoice is selected
  React.useEffect(() => {
    if (selectedInvoice && remainingBalance > 0) {
      setAmount((remainingBalance ?? 0).toFixed(2))
    }
  }, [invoiceId, selectedInvoice, remainingBalance])

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setClientId('')
      setInvoiceId('')
      setAmount('')
      setDate(new Date().toISOString().split('T')[0])
      setReceivedIn('TREASURY')
      setReceivingAccountId(null)
      setReceivingAccountCode('')
      setReceivingAccountName('')
      setReceivingAccountProps(null)
      setReference('')
      setNotes('')
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/client-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => {
        if (!r.ok) throw new Error('Failed')
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-payments'] })
      toast(tt('تم تسجيل التحصيل بنجاح', 'Payment has been recorded successfully'))
      onClose()
    },
    onError: () => {
      toast.error(tt('فشل في تسجيل التحصيل', 'Failed to record payment'))
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
      receivingAccountId: receivingAccountId || null,
      receivingAccountCode: receivingAccountCode || null,
      receivingAccountName: receivingAccountName || null,
      reference: reference || null,
      notes: notes || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-emerald-600" />
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
                {invoices.map(inv => {
                  const remaining = inv.totalAmount - inv.paidAmount
                  return (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoiceNo} — {tt('متبقي', 'Remaining')}: <MoneyDisplay value={remaining} lang={lang} size="sm" inline />
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Invoice Info */}
          {selectedInvoice && (
            <div className="p-3 rounded-lg border bg-emerald-50 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tt('إجمالي الفاتورة', 'Invoice Total')}</span>
                <MoneyDisplay value={selectedInvoice.totalAmount} lang={lang} size="sm" inline bold />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tt('المدفوع', 'Paid')}</span>
                <MoneyDisplay value={selectedInvoice.paidAmount} lang={lang} size="sm" inline />
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-emerald-700">
                <span>{tt(labels.remaining.ar, labels.remaining.en)}</span>
                <MoneyDisplay value={remainingBalance} lang={lang} size="sm" inline bold />
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label>
              {tt(labels.amount.ar, labels.amount.en)} *
              {selectedInvoice && (
                <span className="text-xs text-emerald-600 ml-2">({tt(labels.autoFill.ar, labels.autoFill.en)})</span>
              )}
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={remainingBalance || undefined}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          {/* Date & Received In */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{tt(labels.date.ar, labels.date.en)} *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            {/* AccountSelector: Single-dropdown case (no cash/bank toggle).
                Per property-system rules: نُبقي roles=['CASH','BANK'] بدل filterByProperty
                لأن الـ dropdown يعرض النقدية والبنوك معاً ولا يوجد toggle صريح بينهما.
                Props المختارة تُخزَّن لعرض badges شفافة للسلوك. */}
            <AccountSelector
              roles={['CASH', 'BANK']}
              value={receivingAccountId}
              onValueChange={(id, account) => {
                setReceivingAccountId(id)
                setReceivingAccountCode(account.code)
                setReceivingAccountName(account.nameAr || account.name)
                // Backward compatibility: map account role to old receivedIn field
                setReceivedIn(account.accountRole === 'BANK' ? 'BANK' : 'TREASURY')
                // Property-based info for dynamic UI / badges
                setReceivingAccountProps({
                  showInCash: account.showInCash,
                  showInBank: account.showInBank,
                  allowsClient: account.allowsClient,
                  allowsCostCenter: account.allowsCostCenter,
                  accountRole: account.accountRole,
                })
              }}
              label={tt(labels.receivedIn.ar, labels.receivedIn.en)}
              placeholder={tt('اختر حساب التحصيل...', 'Select receiving account...')}
            />
          </div>

          {/* Property badges — عرض شفاف لخصائص الحساب المختار */}
          {receivingAccountId && receivingAccountProps && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
              <span className="text-xs text-emerald-700 font-medium">{tt('الخصائص:', 'Properties:')}</span>
              {receivingAccountProps.showInCash && (
                <Badge variant="outline" className="text-[9px] text-amber-700 border-amber-200 bg-amber-50">{tt('نقدية', 'cash')}</Badge>
              )}
              {receivingAccountProps.showInBank && (
                <Badge variant="outline" className="text-[9px] text-sky-700 border-sky-200 bg-sky-50">{tt('بنك', 'bank')}</Badge>
              )}
              {receivingAccountProps.allowsClient && (
                <Badge variant="outline" className="text-[9px] text-violet-700 border-violet-200 bg-violet-50">{tt('يسمح بعميل', 'allows client')}</Badge>
              )}
              {receivingAccountProps.allowsCostCenter && (
                <Badge variant="outline" className="text-[9px] text-sky-700 border-sky-200 bg-sky-50">{tt('يسمح بمركز تكلفة', 'allows cost center')}</Badge>
              )}
            </div>
          )}

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

          {/* JE Preview */}
          {parseFloat(amount) > 0 && receivingAccountId && (
            <JePreview
              lines={[
                {
                  accountCode: receivingAccountCode,
                  accountNameAr: receivingAccountName,
                  debit: parseFloat(amount) || 0,
                  credit: 0,
                },
                {
                  accountCode: '1210',
                  accountNameAr: 'عملاء',
                  debit: 0,
                  credit: parseFloat(amount) || 0,
                },
              ]}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {commonText.cancel[lang]}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !clientId || !amount || !date}
              className="bg-emerald-600 hover:bg-emerald-700 min-w-[140px]"
            >
              {createMutation.isPending ? tt('جاري الحفظ...', 'Saving...') : tt('تسجيل التحصيل', 'Record Payment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Edit Payment Dialog ============

function EditPaymentDialog({
  payment,
  open,
  onClose,
}: {
  payment: ClientPaymentItem | null
  open: boolean
  onClose: () => void
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const tt = (ar: string, en: string) => t(ar, en, lang)

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [receivedIn, setReceivedIn] = useState('TREASURY')
  const [receivingAccountId, setReceivingAccountId] = useState<string | null>(null)
  const [receivingAccountCode, setReceivingAccountCode] = useState('')
  const [receivingAccountName, setReceivingAccountName] = useState('')
  // خصائص الحساب المختار — للعرض الديناميكي (badges) وسلوك مستقبلي
  // Single-dropdown case: نُبقي roles=['CASH', 'BANK']
  const [receivingAccountProps, setReceivingAccountProps] = useState<{
    showInCash?: boolean
    showInBank?: boolean
    allowsClient?: boolean
    allowsCostCenter?: boolean
    accountRole?: string | null
  } | null>(null)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  React.useEffect(() => {
    if (payment && open) {
      setAmount(String(payment.amount))
      setDate(payment.date ? new Date(payment.date).toISOString().split('T')[0] : '')
      setReceivedIn(payment.receivedIn || 'TREASURY')
      // Reset account fields on edit open (will be set by AccountSelector if user picks one)
      setReceivingAccountId(null)
      setReceivingAccountCode('')
      setReceivingAccountName('')
      setReceivingAccountProps(null)
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
      queryClient.invalidateQueries({ queryKey: ['client-payments'] })
      toast(tt('تم تحديث التحصيل بنجاح', 'Payment has been updated successfully'))
      onClose()
    },
    onError: () => {
      toast.error(tt('فشل في تحديث التحصيل', 'Failed to update payment'))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    editMutation.mutate({
      amount: parseFloat(amount) || 0,
      date,
      receivedIn,
      receivingAccountId: receivingAccountId || null,
      receivingAccountCode: receivingAccountCode || null,
      receivingAccountName: receivingAccountName || null,
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
            <Pencil className="size-5 text-emerald-600" />
            {tt(labels.editPayment.ar, labels.editPayment.en)}
          </DialogTitle>
        </DialogHeader>

        {isPosted && (
          <div className="p-3 rounded-lg border bg-amber-50 text-amber-700 text-sm">
            {tt('هذا التحصيل مرحّل محاسبياً - التعديل محدود', 'This payment is posted - editing is limited')}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{tt(labels.date.ar, labels.date.en)} *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required disabled={isPosted} />
            </div>
            {/* AccountSelector: Single-dropdown case (no cash/bank toggle).
                نُبقي roles=['CASH','BANK'] بدل filterByProperty لأن الـ dropdown
                يعرض النقدية والبنوك معاً ولا toggle صريح بينهما. */}
            <AccountSelector
              roles={['CASH', 'BANK']}
              value={receivingAccountId}
              onValueChange={(id, account) => {
                setReceivingAccountId(id)
                setReceivingAccountCode(account.code)
                setReceivingAccountName(account.nameAr || account.name)
                setReceivedIn(account.accountRole === 'BANK' ? 'BANK' : 'TREASURY')
                setReceivingAccountProps({
                  showInCash: account.showInCash,
                  showInBank: account.showInBank,
                  allowsClient: account.allowsClient,
                  allowsCostCenter: account.allowsCostCenter,
                  accountRole: account.accountRole,
                })
              }}
              label={tt(labels.receivedIn.ar, labels.receivedIn.en)}
              placeholder={tt('اختر حساب التحصيل...', 'Select receiving account...')}
            />
          </div>

          {/* Property badges — عرض شفاف لخصائص الحساب المختار */}
          {receivingAccountId && receivingAccountProps && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
              <span className="text-xs text-emerald-700 font-medium">{tt('الخصائص:', 'Properties:')}</span>
              {receivingAccountProps.showInCash && (
                <Badge variant="outline" className="text-[9px] text-amber-700 border-amber-200 bg-amber-50">{tt('نقدية', 'cash')}</Badge>
              )}
              {receivingAccountProps.showInBank && (
                <Badge variant="outline" className="text-[9px] text-sky-700 border-sky-200 bg-sky-50">{tt('بنك', 'bank')}</Badge>
              )}
              {receivingAccountProps.allowsClient && (
                <Badge variant="outline" className="text-[9px] text-violet-700 border-violet-200 bg-violet-50">{tt('يسمح بعميل', 'allows client')}</Badge>
              )}
              {receivingAccountProps.allowsCostCenter && (
                <Badge variant="outline" className="text-[9px] text-sky-700 border-sky-200 bg-sky-50">{tt('يسمح بمركز تكلفة', 'allows cost center')}</Badge>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>{tt(labels.reference.ar, labels.reference.en)}</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} disabled={isPosted} />
          </div>

          <div className="space-y-2">
            <Label>{tt(labels.notes.ar, labels.notes.en)}</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} disabled={isPosted} />
          </div>

          {/* JE Preview */}
          {parseFloat(amount) > 0 && receivingAccountId && (
            <JePreview
              lines={[
                {
                  accountCode: receivingAccountCode,
                  accountNameAr: receivingAccountName,
                  debit: parseFloat(amount) || 0,
                  credit: 0,
                },
                {
                  accountCode: '1210',
                  accountNameAr: 'عملاء',
                  debit: 0,
                  credit: parseFloat(amount) || 0,
                },
              ]}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{commonText.cancel[lang]}</Button>
            <Button type="submit" disabled={editMutation.isPending || isPosted} className="bg-emerald-600 hover:bg-emerald-700 min-w-[140px]">
              {editMutation.isPending ? tt('جاري الحفظ...', 'Saving...') : tt('حفظ التعديلات', 'Save Changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Payment Detail Dialog ============

function PaymentDetailDialog({
  payment,
  open,
  onClose,
}: {
  payment: ClientPaymentItem | null
  open: boolean
  onClose: () => void
}) {
  const { lang } = useAppStore()
  const tt = (ar: string, en: string) => t(ar, en, lang)

  if (!payment) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-emerald-600" />
            {tt('تفاصيل التحصيل', 'Payment Details')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{tt(labels.client.ar, labels.client.en)}</p>
              <p className="font-medium">{payment.client.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{tt(labels.date.ar, labels.date.en)}</p>
              <p className="font-medium">{formatDate(payment.date, lang)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{tt(labels.amount.ar, labels.amount.en)}</p>
              <p className="font-bold text-emerald-700">
                <MoneyDisplay value={payment.amount} mode="system" lang={lang} bold size="md" />
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{tt(labels.receivedIn.ar, labels.receivedIn.en)}</p>
              <Badge variant="outline" className={receivedInColors[payment.receivedIn] || ''}>
                {receivedInLabels[payment.receivedIn]?.[lang] || payment.receivedIn}
              </Badge>
            </div>
          </div>

          {payment.invoice && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">{tt(labels.invoice.ar, labels.invoice.en)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="font-medium">{payment.invoice.invoiceNo}</span>
                  <span className="text-muted-foreground">—</span>
                  <MoneyDisplay value={payment.invoice.totalAmount} lang={lang} size="sm" inline />
                </div>
                {payment.invoice.project && (
                  <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                    <Building2 className="size-3.5" />
                    <span className="text-xs">{payment.invoice.project.name}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {payment.reference && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">{tt(labels.reference.ar, labels.reference.en)}</p>
                <p className="font-medium">{payment.reference}</p>
              </div>
            </>
          )}

          {payment.notes && (
            <div>
              <p className="text-xs text-muted-foreground">{tt(labels.notes.ar, labels.notes.en)}</p>
              <p>{payment.notes}</p>
            </div>
          )}

          {/* Accounting Entry Link */}
          {payment.journalEntryId && (
            <>
              <Separator />
              <div className="p-3 rounded-lg border bg-sky-50">
                <div className="flex items-center gap-2 text-sky-700">
                  <FileText className="size-4" />
                  <span className="text-xs font-medium">{tt(labels.accountingEntry.ar, labels.accountingEntry.en)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {tt('تم إنشاء قيد محاسبي تلقائي', 'Auto journal entry created')}
                </p>
                <p className="text-xs font-mono mt-0.5">{payment.journalEntryId}</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Module ============

export function ClientPaymentsModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const tt = (ar: string, en: string) => t(ar, en, lang)

  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [receivedInFilter, setReceivedInFilter] = useState<string>('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [detailPayment, setDetailPayment] = useState<ClientPaymentItem | null>(null)
  const [editPayment, setEditPayment] = useState<ClientPaymentItem | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Fetch payments
  const { data: payments = [], isLoading, isError, refetch } = useQuery<ClientPaymentItem[]>({
    queryKey: ['client-payments'],
    queryFn: async () => {
      const res = await fetch('/api/client-payments')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    staleTime: 30000,
  })

  // Fetch clients for filter
  const { data: clients = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients-list-for-payments'],
    queryFn: async () => {
      const res = await fetch('/api/clients')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/client-payments/${id}`, { method: 'DELETE' }).then(r => {
        if (!r.ok) throw new Error()
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-payments'] })
      toast(tt('تم حذف التحصيل بنجاح', 'Payment has been deleted'))
      setDeleteId(null)
    },
    onError: () => {
      toast.error(tt('فشل في حذف التحصيل', 'Failed to delete payment'))
    },
  })

  // Filter
  const filtered = useMemo(() => {
    return payments.filter(p => {
      const matchSearch = !search ||
        p.client.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.reference && p.reference.toLowerCase().includes(search.toLowerCase())) ||
        (p.invoice?.invoiceNo && p.invoice.invoiceNo.toLowerCase().includes(search.toLowerCase()))
      const matchClient = clientFilter === 'all' || p.clientId === clientFilter
      const matchReceivedIn = receivedInFilter === 'all' || p.receivedIn === receivedInFilter
      return matchSearch && matchClient && matchReceivedIn
    })
  }, [payments, search, clientFilter, receivedInFilter])

  // Stats
  const totalPayments = filtered.reduce((s, p) => s + Number(p.amount || 0), 0)
  const treasuryPayments = filtered.filter(p => p.receivedIn === 'TREASURY').reduce((s, p) => s + Number(p.amount || 0), 0)
  const bankPayments = filtered.filter(p => p.receivedIn === 'BANK').reduce((s, p) => s + Number(p.amount || 0), 0)

  // CSV Export
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'date', label: tt('التاريخ', 'Date') },
      { key: 'clientName', label: tt('العميل', 'Client') },
      { key: 'invoiceNo', label: tt('الفاتورة', 'Invoice') },
      { key: 'projectName', label: tt('المشروع', 'Project') },
      { key: 'amount', label: tt('المبلغ', 'Amount'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'receivedIn', label: tt('عن طريق', 'Via'), format: (v) => receivedInLabels[v as string]?.[lang] || String(v) },
      { key: 'reference', label: tt('المرجع', 'Reference') },
      { key: 'notes', label: tt('ملاحظات', 'Notes') },
    ]
    const rows = filtered.map(p => ({
      date: formatDate(p.date, lang),
      clientName: p.client.name,
      invoiceNo: p.invoice?.invoiceNo || '',
      projectName: p.invoice?.project?.name || '',
      amount: p.amount,
      receivedIn: p.receivedIn,
      reference: p.reference || '',
      notes: p.notes || '',
    }))
    exportToCSV(rows, `client-payments-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={labels.title}
      subtitle={labels.subtitle}
      actions={
        <>
          <PrintButton type="client-payment" size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport} title={tt('تصدير CSV', 'Export CSV')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={tt('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowAddDialog(true)}>
            <Plus className="size-4" /> {tt(labels.newPayment.ar, labels.newPayment.en)}
          </Button>
        </>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{tt(labels.totalPayments.ar, labels.totalPayments.en)}</p>
            <MoneyDisplay value={totalPayments} lang={lang} size="xl" bold className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{tt(labels.treasury.ar, labels.treasury.en)}</p>
            <MoneyDisplay value={treasuryPayments} lang={lang} size="xl" bold className="text-amber-700" />
          </CardContent>
        </Card>
        <Card className="bg-sky-50 border-sky-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{tt(labels.bank.ar, labels.bank.en)}</p>
            <MoneyDisplay value={bankPayments} lang={lang} size="xl" bold className="text-sky-700" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder={tt(labels.allClients.ar, labels.allClients.en)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tt(labels.allClients.ar, labels.allClients.en)}</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={tt(labels.search.ar, labels.search.en)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={receivedInFilter} onValueChange={setReceivedInFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder={tt(labels.receivedIn.ar, labels.receivedIn.en)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tt('الكل', 'All')}</SelectItem>
                <SelectItem value="TREASURY">{tt(receivedInLabels.TREASURY.ar, receivedInLabels.TREASURY.en)}</SelectItem>
                <SelectItem value="BANK">{tt(receivedInLabels.BANK.ar, receivedInLabels.BANK.en)}</SelectItem>
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
              <CreditCard className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{tt(labels.noPayments.ar, labels.noPayments.en)}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowAddDialog(true)}>
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
                    <TableHead className="text-right">{tt(labels.project.ar, labels.project.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.amount.ar, labels.amount.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.receivedIn.ar, labels.receivedIn.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.reference.ar, labels.reference.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.accountingEntry.ar, labels.accountingEntry.en)}</TableHead>
                    <TableHead className="text-right">{tt(labels.actions.ar, labels.actions.en)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setDetailPayment(p)}>
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
                      <TableCell>
                        {p.invoice?.project ? (
                          <span className="text-xs text-muted-foreground">{p.invoice.project.name}</span>
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
                          <PrintButton type="client-payment" documentId={p.id} size="icon" />
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditPayment(p)} title={tt('تعديل', 'Edit')}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setDetailPayment(p)} title={tt('عرض', 'View')}>
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-500" onClick={() => setDeleteId(p.id)} title={tt('حذف', 'Delete')}>
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

      {/* Add Payment Dialog */}
      <AddPaymentDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} />

      {/* Edit Dialog */}
      <EditPaymentDialog payment={editPayment} open={!!editPayment} onClose={() => setEditPayment(null)} />

      {/* Detail Dialog */}
      <PaymentDetailDialog payment={detailPayment} open={!!detailPayment} onClose={() => setDetailPayment(null)} />

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

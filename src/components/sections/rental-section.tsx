'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileSignature, Truck, Clock, Receipt, CreditCard,
  Search, RefreshCw, Plus, Eye, ChevronDown, ChevronUp,
  ArrowRight, Trash2,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
  formatDate,
  formatNumber,
  commonText,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout, StatusBadge } from '@/components/shared/module-layout'
import { ContractsModule } from '@/components/modules/contracts'
import { DeliveryOrdersModule } from '@/components/modules/delivery-orders'
import { TimesheetsModule } from '@/components/modules/timesheets'
import { RentalInvoicesModule } from '@/components/modules/rental-invoices'

// ============ Helpers ============

function t(ar: string, en: string, lang: Lang) {
  return lang === 'ar' ? ar : en
}

// ============ Accounting Entry Display ============

interface JournalLineItem {
  id: string
  accountId: string
  account: { id: string; code: string; name: string; nameAr?: string | null }
  debit: number
  credit: number
  description?: string | null
}

interface JournalEntryDetail {
  id: string
  entryNo: string
  date: string
  description?: string | null
  status: string
  sourceType?: string | null
  lines: JournalLineItem[]
}

function AccountingEntryDisplay({
  journalEntryId,
  lang,
}: {
  journalEntryId: string | null | undefined
  lang: Lang
}) {
  const [expanded, setExpanded] = useState(false)

  const { data: entry, isLoading } = useQuery<JournalEntryDetail | null>({
    queryKey: ['journal-entry', journalEntryId],
    queryFn: async () => {
      if (!journalEntryId) return null
      const res = await fetch(`/api/journal-entries/${journalEntryId}`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!journalEntryId && expanded,
  })

  if (!journalEntryId) {
    return (
      <span className="text-xs text-muted-foreground">
        {t('لا يوجد قيد محاسبي', 'No accounting entry', lang)}
      </span>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 hover:bg-amber-100 transition-colors text-sm"
      >
        <span className="flex items-center gap-2 font-medium text-amber-700">
          <Receipt className="size-3.5" />
          {t('القيد المحاسبي', 'Accounting Entry', lang)}
        </span>
        {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {expanded && (
        <div className="p-3 bg-amber-50/30">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" />
              {t('جاري التحميل...', 'Loading...', lang)}
            </div>
          ) : entry ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-mono">{entry.entryNo}</span>
                <span>{formatDate(entry.date, lang)}</span>
                {entry.description && <span>— {entry.description}</span>}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right h-8 text-xs">{t('الحساب', 'Account', lang)}</TableHead>
                    <TableHead className="text-right h-8 text-xs">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-right h-8 text-xs">{t('دائن', 'Credit', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entry.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="py-1 text-xs">
                        <span className="font-mono text-muted-foreground">{line.account.code}</span>
                        {' '}
                        <span>{lang === 'ar' ? (line.account.nameAr || line.account.name) : line.account.name}</span>
                      </TableCell>
                      <TableCell className="py-1 text-xs">
                        {line.debit > 0 ? <MoneyDisplay value={line.debit} lang={lang} size="xs" inline showSymbol={false} /> : '—'}
                      </TableCell>
                      <TableCell className="py-1 text-xs">
                        {line.credit > 0 ? <MoneyDisplay value={line.credit} lang={lang} size="xs" inline showSymbol={false} /> : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('لم يتم العثور على القيد', 'Entry not found', lang)}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ============ Tab Definitions ============

const rentalTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'rental-contracts', icon: FileSignature },
  { key: 'rental-delivery-orders', icon: Truck },
  { key: 'rental-timesheets', icon: Clock },
  { key: 'rental-invoices', icon: Receipt },
  { key: 'rental-collections', icon: CreditCard },
]

// ============ Collections Module ============

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
  client: { id: string; name: string; code: string }
  invoice: { id: string; invoiceNo: string; totalAmount: number; status: string; sourceType?: string; invoiceType?: string } | null
}

interface RentalInvoiceOption {
  id: string
  invoiceNo: string
  totalAmount: number
  paidAmount: number
  status: string
  client: { id: string; name: string; code: string }
}

function CollectionsModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const tl = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [viewEntryId, setViewEntryId] = useState<string | null>(null)

  // Form state
  const [formClientId, setFormClientId] = useState('')
  const [formInvoiceId, setFormInvoiceId] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formReceivedIn, setFormReceivedIn] = useState('TREASURY')
  const [formReference, setFormReference] = useState('')
  const [formNotes, setFormNotes] = useState('')

  // Fetch rental payments (client payments for rental invoices)
  const { data: payments = [], isLoading, isError, refetch } = useQuery<ClientPaymentItem[]>({
    queryKey: ['rental-collections'],
    queryFn: async () => {
      // First get rental invoice IDs
      const invRes = await fetch('/api/sales-invoices?invoiceType=RENTAL')
      if (!invRes.ok) return []
      const invoices: { id: string }[] = await invRes.json()
      const rentalInvoiceIds = new Set(invoices.map((i: { id: string }) => i.id))

      // Then get all client payments
      const payRes = await fetch('/api/client-payments')
      if (!payRes.ok) return []
      const allPayments: ClientPaymentItem[] = await payRes.json()

      // Filter to payments linked to rental invoices or unallocated payments from rental clients
      return allPayments.filter((p: ClientPaymentItem) =>
        (p.invoiceId && rentalInvoiceIds.has(p.invoiceId)) || !p.invoiceId
      )
    },
  })

  // Fetch clients for form
  const { data: clients = [] } = useQuery<{ id: string; name: string; code: string }[]>({
    queryKey: ['clients-for-collections'],
    queryFn: async () => {
      const res = await fetch('/api/clients?simple=true&active=true')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Fetch rental invoices for selected client
  const { data: rentalInvoices = [] } = useQuery<RentalInvoiceOption[]>({
    queryKey: ['rental-invoices-for-collection', formClientId],
    queryFn: async () => {
      if (!formClientId) return []
      const res = await fetch(`/api/sales-invoices?invoiceType=RENTAL&clientId=${formClientId}`)
      if (!res.ok) return []
      const all: RentalInvoiceOption[] = await res.json()
      return all.filter(i => i.status !== 'PAID' && i.status !== 'CANCELLED')
    },
    enabled: !!formClientId,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/client-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-collections'] })
      queryClient.invalidateQueries({ queryKey: ['rental-invoices-for-collection'] })
      setCreateOpen(false)
      resetForm()
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/client-payments/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-collections'] })
      setDeleteId(null)
    },
  })

  const resetForm = () => {
    setFormClientId('')
    setFormInvoiceId('')
    setFormAmount('')
    setFormDate('')
    setFormReceivedIn('TREASURY')
    setFormReference('')
    setFormNotes('')
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      clientId: formClientId,
      invoiceId: formInvoiceId || null,
      amount: parseFloat(formAmount) || 0,
      date: formDate,
      receivedIn: formReceivedIn,
      reference: formReference || null,
      notes: formNotes || null,
    })
  }

  // Filters
  const filtered = payments.filter(p => {
    const matchSearch = !search ||
      p.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      (p.reference?.toLowerCase().includes(search.toLowerCase())) ||
      (p.invoice?.invoiceNo?.toLowerCase().includes(search.toLowerCase()))
    return matchSearch
  })

  const totalCollected = filtered.reduce((s, p) => s + (p.amount ?? 0), 0)

  return (
    <ModuleLayout
      title={{ ar: 'التحصيلات', en: 'Collections' }}
      subtitle={{ ar: 'تحصيلات فواتير الإيجار', en: 'Rental invoice collections' }}
      actions={
        <>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={tl('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { resetForm(); setCreateOpen(true) }}>
            <Plus className="size-4" /> {tl('تحصيل جديد', 'New Collection')}
          </Button>
        </>
      }
    >
      {/* Summary */}
      <Card className="bg-emerald-50 border-emerald-200">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{tl('إجمالي التحصيلات', 'Total Collected')}</p>
            <MoneyDisplay value={totalCollected} lang={lang} size="xl" bold className="text-emerald-700" />
          </div>
          <div className="text-left">
            <p className="text-sm text-muted-foreground">{tl('عدد التحصيلات', 'Payment Count')}</p>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder={tl('بحث بالعميل، المرجع، رقم الفاتورة...', 'Search by client, reference, invoice no...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground">{commonText.loading[lang]}</div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{commonText.error[lang]}</p>
              <Button variant="outline" onClick={() => refetch()}>{commonText.retry[lang]}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <CreditCard className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{tl('لا توجد تحصيلات', 'No collections found')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { resetForm(); setCreateOpen(true) }}>
                <Plus className="size-4 mr-1" /> {tl('تحصيل جديد', 'New Collection')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{tl('العميل', 'Client')}</TableHead>
                    <TableHead className="text-right">{tl('الفاتورة', 'Invoice')}</TableHead>
                    <TableHead className="text-right">{tl('المبلغ', 'Amount')}</TableHead>
                    <TableHead className="text-right">{tl('التاريخ', 'Date')}</TableHead>
                    <TableHead className="text-right">{tl('طريقة الاستلام', 'Received In')}</TableHead>
                    <TableHead className="text-right">{tl('المرجع', 'Reference')}</TableHead>
                    <TableHead className="text-right">{tl('الإجراءات', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.client?.name || '—'}</TableCell>
                      <TableCell>
                        {p.invoice ? (
                          <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-xs">
                            {p.invoice.invoiceNo}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{tl('بدون فاتورة', 'No invoice')}</span>
                        )}
                      </TableCell>
                      <TableCell><MoneyDisplay value={p.amount} lang={lang} size="sm" inline bold /></TableCell>
                      <TableCell>{formatDate(p.date, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {p.receivedIn === 'BANK' ? tl('بنك', 'Bank') : tl('خزينة', 'Treasury')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{p.reference || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {p.journalEntryId && (
                            <Button variant="ghost" size="icon" className="size-7" onClick={() => setViewEntryId(p.journalEntryId)} title={tl('عرض القيد', 'View Entry')}>
                              <Receipt className="size-3.5 text-amber-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="size-7 text-rose-500" onClick={() => setDeleteId(p.id)} title={tl('حذف', 'Delete')}>
                            <Trash2 className="size-3.5" />
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

      {/* Accounting Entry Dialog */}
      <Dialog open={!!viewEntryId} onOpenChange={() => setViewEntryId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('القيد المحاسبي', 'Accounting Entry', lang)}</DialogTitle>
            <DialogDescription>{t('تفاصيل القيد المحاسبي للتحصيل', 'Accounting entry details for the collection', lang)}</DialogDescription>
          </DialogHeader>
          <AccountingEntryDisplay journalEntryId={viewEntryId} lang={lang} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewEntryId(null)}>{commonText.close[lang]}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Collection Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tl('تحصيل جديد', 'New Collection')}</DialogTitle>
            <DialogDescription>{tl('إنشاء تحصيل لفاتورة إيجار', 'Create a collection for a rental invoice')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>{tl('العميل', 'Client')} *</Label>
              <Select value={formClientId} onValueChange={v => { setFormClientId(v); setFormInvoiceId('') }}>
                <SelectTrigger><SelectValue placeholder={tl('اختر العميل', 'Select client')} /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {formClientId && rentalInvoices.length > 0 && (
              <div className="space-y-2">
                <Label>{tl('الفاتورة', 'Invoice')}</Label>
                <Select value={formInvoiceId} onValueChange={v => {
                  setFormInvoiceId(v)
                  const inv = rentalInvoices.find(i => i.id === v)
                  if (inv) setFormAmount(((inv.totalAmount ?? 0) - (inv.paidAmount ?? 0)).toString())
                }}>
                  <SelectTrigger><SelectValue placeholder={tl('اختر الفاتورة', 'Select invoice')} /></SelectTrigger>
                  <SelectContent>
                    {rentalInvoices.map(i => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.invoiceNo} — <MoneyDisplay value={(i.totalAmount ?? 0) - (i.paidAmount ?? 0)} lang={lang} size="xs" inline showSymbol={false} /> {tl('متبقي', 'remaining')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tl('المبلغ', 'Amount')} *</Label>
                <Input type="number" step="0.01" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} dir="ltr" required />
              </div>
              <div className="space-y-2">
                <Label>{tl('التاريخ', 'Date')} *</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tl('طريقة الاستلام', 'Received In')}</Label>
                <Select value={formReceivedIn} onValueChange={setFormReceivedIn}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TREASURY">{tl('خزينة', 'Treasury')}</SelectItem>
                    <SelectItem value="BANK">{tl('بنك', 'Bank')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tl('المرجع', 'Reference')}</Label>
                <Input value={formReference} onChange={e => setFormReference(e.target.value)} dir="ltr" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{tl('ملاحظات', 'Notes')}</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} />
            </div>

            {/* Accounting Entry Preview */}
            {parseFloat(formAmount) > 0 && formDate && (
              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-amber-700 mb-2">{tl('القيد المحاسبي التلقائي', 'Auto Accounting Entry')}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>{formReceivedIn === 'BANK' ? tl('البنوك (1120)', 'Bank (1120)') : tl('الخزينة (1110)', 'Treasury (1110)')}</span>
                      <span className="font-mono">{tl('مدين', 'Debit')}: <MoneyDisplay value={parseFloat(formAmount) || 0} lang={lang} size="xs" inline showSymbol={false} /></span>
                    </div>
                    <div className="flex justify-between">
                      <span>{tl('عملاء (1210)', 'Clients Receivable (1210)')}</span>
                      <span className="font-mono">{tl('دائن', 'Credit')}: <MoneyDisplay value={parseFloat(formAmount) || 0} lang={lang} size="xs" inline showSymbol={false} /></span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{commonText.cancel[lang]}</Button>
              <Button type="submit" disabled={createMutation.isPending || !formClientId || !formAmount || !formDate} className="bg-emerald-600 hover:bg-emerald-700">
                {createMutation.isPending ? tl('جاري الحفظ...', 'Saving...') : tl('إنشاء التحصيل', 'Create Collection')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tl('حذف التحصيل', 'Delete Collection')}</AlertDialogTitle>
            <AlertDialogDescription>{tl('هل أنت متأكد من حذف هذا التحصيل؟', 'Are you sure you want to delete this collection?')}</AlertDialogDescription>
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

// ============ Accounting Info Wrapper ============
// Wraps a module tab to show an accounting info banner at the top

function AccountingInfoBanner({
  titleAr, titleEn, descAr, descEn, lang,
  debitAccount, creditAccount, debitLabel, creditLabel,
}: {
  titleAr: string; titleEn: string; descAr: string; descEn: string; lang: Lang
  debitAccount: string; creditAccount: string; debitLabel: string; creditLabel: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="mb-4 border-amber-200 bg-amber-50/50">
      <CardContent className="p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-sm font-medium text-amber-700"
        >
          <span className="flex items-center gap-2">
            <Receipt className="size-4" />
            {t(titleAr, titleEn, lang)}
          </span>
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {expanded && (
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-muted-foreground">{t(descAr, descEn, lang)}</p>
            <div className="flex gap-4 mt-2">
              <div className="flex-1 bg-emerald-100/50 rounded p-2">
                <p className="font-medium text-emerald-700">{t('مدين (Debit)', 'Debit', lang)}</p>
                <p className="text-emerald-600">{debitAccount} — {debitLabel}</p>
              </div>
              <div className="flex-1 bg-blue-100/50 rounded p-2">
                <p className="font-medium text-blue-700">{t('دائن (Credit)', 'Credit', lang)}</p>
                <p className="text-blue-600">{creditAccount} — {creditLabel}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============ Main Rental Section ============

export function RentalSection() {
  const { activeSubModule, lang } = useAppStore()

  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'rental-contracts':
        return (
          <div>
            <AccountingInfoBanner
              titleAr="التأثير المحاسبي لعقود التأجير"
              titleEn="Accounting Impact of Rental Contracts"
              descAr="عند تفعيل عقد التأجير، يتم إنشاء قيد محاسبي تلقائي"
              descEn="When a rental contract is activated, an automatic journal entry is created"
              lang={lang}
              debitAccount="1210"
              creditAccount="6210"
              debitLabel={t("ذمم العملاء", "Clients Receivable", lang)}
              creditLabel={t("إيرادات تأجير المعدات", "Equipment Rental Revenue", lang)}
            />
            <ContractsModule />
          </div>
        )
      case 'rental-delivery-orders':
        return (
          <div>
            <AccountingInfoBanner
              titleAr="التأثير المحاسبي لأوامر التسليم"
              titleEn="Accounting Impact of Delivery Orders"
              descAr="أوامر التسليم لا تنشئ قيد محاسبي مباشر - يتم التسجيل عند الفوترة"
              descEn="Delivery orders don't create direct accounting entries - recorded upon invoicing"
              lang={lang}
              debitAccount="—"
              creditAccount="—"
              debitLabel={t("لا يوجد قيد مباشر", "No direct entry", lang)}
              creditLabel={t("يتم التسجيل عند الفوترة", "Recorded upon invoicing", lang)}
            />
            <DeliveryOrdersModule />
          </div>
        )
      case 'rental-timesheets':
        return (
          <div>
            <AccountingInfoBanner
              titleAr="التأثير المحاسبي لساعات العمل"
              titleEn="Accounting Impact of Timesheets"
              descAr="ساعات العمل لا تنشئ قيد محاسبي مباشر - يتم التسجيل عند إنشاء الفاتورة"
              descEn="Timesheets don't create direct accounting entries - recorded upon invoice creation"
              lang={lang}
              debitAccount="—"
              creditAccount="—"
              debitLabel={t("لا يوجد قيد مباشر", "No direct entry", lang)}
              creditLabel={t("يتم التسجيل عند الفوترة", "Recorded upon invoicing", lang)}
            />
            <TimesheetsModule />
          </div>
        )
      case 'rental-invoices':
        return (
          <div>
            <AccountingInfoBanner
              titleAr="التأثير المحاسبي لفواتير الإيجار"
              titleEn="Accounting Impact of Rental Invoices"
              descAr="عند إنشاء فاتورة إيجار، يتم إنشاء قيد محاسبي تلقائي"
              descEn="When a rental invoice is created, an automatic journal entry is created"
              lang={lang}
              debitAccount="1210"
              creditAccount="6210 / 3200"
              debitLabel={t("ذمم العملاء", "Clients Receivable", lang)}
              creditLabel={t("إيرادات التأجير + ضريبة القيمة المضافة", "Rental Revenue + VAT Payable", lang)}
            />
            <RentalInvoicesModule />
          </div>
        )
      case 'rental-collections':
        return <CollectionsModule />
      default:
        return (
          <div>
            <AccountingInfoBanner
              titleAr="التأثير المحاسبي لعقود التأجير"
              titleEn="Accounting Impact of Rental Contracts"
              descAr="عند تفعيل عقد التأجير، يتم إنشاء قيد محاسبي تلقائي"
              descEn="When a rental contract is activated, an automatic journal entry is created"
              lang={lang}
              debitAccount="1210"
              creditAccount="6210"
              debitLabel={t("ذمم العملاء", "Clients Receivable", lang)}
              creditLabel={t("إيرادات تأجير المعدات", "Equipment Rental Revenue", lang)}
            />
            <ContractsModule />
          </div>
        )
    }
  }

  return (
    <SectionLayout
      title={{ ar: 'التأجير', en: 'Rental' }}
      subtitle={{
        ar: 'إدارة عقود التأجير وأوامر التوصيل والفواتير والتحصيلات',
        en: 'Manage rental contracts, delivery orders, invoices, and collections',
      }}
      tabs={rentalTabs}
      showPrintExport={false}
    >
      {renderTabContent()}
    </SectionLayout>
  )
}

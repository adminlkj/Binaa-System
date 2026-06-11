'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Plus, Search, RefreshCw, ArrowRight,
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
import { useAppStore, formatSAR, formatDate } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { PrintButton } from '@/components/shared/print-button'

interface ClientPayment {
  id: string
  clientId: string
  invoiceId: string | null
  amount: number
  date: string
  receivedIn: string
  reference: string | null
  notes: string | null
  client: { id: string; name: string; code: string }
  invoice?: { id: string; invoiceNo: string; invoiceType: string; sourceType: string }
}

interface Client { id: string; code: string; name: string }
interface Invoice { id: string; invoiceNo: string; invoiceType: string; sourceType: string; totalAmount: number; clientId: string }

// Rental payments only show payments for rental invoices
export function RentalPaymentsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: payments = [], isLoading, refetch } = useQuery<ClientPayment[]>({
    queryKey: ['rental-client-payments'],
    queryFn: async () => {
      const res = await fetch('/api/client-payments')
      if (!res.ok) throw new Error()
      const all: ClientPayment[] = await res.json()
      // Filter to only rental invoices
      return all.filter(p => !p.invoice || p.invoice.sourceType === 'TIMESHEET' || p.invoice.invoiceType === 'RENTAL')
    },
  })

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients-for-rental-payments'],
    queryFn: async () => {
      const res = await fetch('/api/clients')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['rental-invoices-for-payments'],
    queryFn: async () => {
      const res = await fetch('/api/sales-invoices')
      if (!res.ok) return []
      const all: Invoice[] = await res.json()
      return all.filter(inv => inv.sourceType === 'TIMESHEET' || inv.invoiceType === 'RENTAL')
    },
  })

  const [form, setForm] = useState({
    clientId: '', invoiceId: '', amount: '', date: '', receivedIn: 'TREASURY', reference: '', notes: '',
  })

  React.useEffect(() => {
    if (dialogOpen) {
      setForm({ clientId: '', invoiceId: '', amount: '', date: '', receivedIn: 'TREASURY', reference: '', notes: '' })
    }
  }, [dialogOpen])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/client-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rental-client-payments'] }); setDialogOpen(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      clientId: form.clientId,
      invoiceId: form.invoiceId || null,
      amount: parseFloat(form.amount),
      date: form.date,
      receivedIn: form.receivedIn,
      reference: form.reference || null,
      notes: form.notes || null,
    })
  }

  const filtered = payments.filter(p => {
    const matchSearch = !search || p.client.name.includes(search) || (p.reference || '').includes(search)
    return matchSearch
  })

  const totalAmount = filtered.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{t('تحصيلات التأجير', 'Rental Collections')}</h1>
            <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 border">{t('تأجير', 'Rental')}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t('تحصيلات فواتير التأجير', 'Collections for rental invoices')}</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton type="rental-payment" size="icon" />
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-cyan-600 hover:bg-cyan-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {t('تحصيل جديد', 'New Collection')}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('عدد التحصيلات', 'Payment Count')}</p>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('إجمالي المحصل', 'Total Collected')}</p>
            <p className="text-2xl font-bold text-cyan-700">
              <MoneyDisplay value={totalAmount} mode="system" lang={lang} bold size="lg" />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('متوسط التحصيل', 'Average Payment')}</p>
            <p className="text-2xl font-bold">
              <MoneyDisplay value={filtered.length > 0 ? totalAmount / filtered.length : 0} mode="system" lang={lang} bold size="lg" />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder={t('بحث بالعميل أو المرجع...', 'Search by client or reference...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-gray-200" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <CreditCard className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t('لا توجد تحصيلات تأجير', 'No rental collections')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('العميل', 'Client')}</TableHead>
                    <TableHead className="text-right">{t('الفاتورة', 'Invoice')}</TableHead>
                    <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
                    <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                    <TableHead className="text-right">{t('عن طريق', 'Via')}</TableHead>
                    <TableHead className="text-right">{t('المرجع', 'Reference')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.client.name}</TableCell>
                      <TableCell>{p.invoice?.invoiceNo || '—'}</TableCell>
                      <TableCell className="font-semibold">
                        <MoneyDisplay value={p.amount} mode="system" lang={lang} bold size="md" />
                      </TableCell>
                      <TableCell>{formatDate(p.date, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {p.receivedIn === 'TREASURY' ? t('خزينة', 'Treasury') : p.receivedIn === 'BANK' ? t('بنك', 'Bank') : p.receivedIn}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.reference || '—'}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-cyan-50 font-bold">
                    <TableCell colSpan={2}>{t('الإجمالي', 'Total')}</TableCell>
                    <TableCell>
                      <MoneyDisplay value={totalAmount} mode="system" lang={lang} bold size="md" />
                    </TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('تحصيل تأجير جديد', 'New Rental Collection')}</DialogTitle>
            <DialogDescription>{t('تسجيل تحصيل لفاتورة تأجير', 'Record a collection for a rental invoice')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('العميل *', 'Client *')}</Label>
                <Select value={form.clientId} onValueChange={v => setForm(f => ({ ...f, clientId: v }))}>
                  <SelectTrigger><SelectValue placeholder={t('اختر العميل', 'Select client')} /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('الفاتورة', 'Invoice')}</Label>
                <Select value={form.invoiceId} onValueChange={v => setForm(f => ({ ...f, invoiceId: v }))}>
                  <SelectTrigger><SelectValue placeholder={t('اختر الفاتورة', 'Select invoice')} /></SelectTrigger>
                  <SelectContent>
                    {invoices.filter(inv => !form.clientId || inv.clientId === form.clientId).map(inv => (
                      <SelectItem key={inv.id} value={inv.id}>{inv.invoiceNo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('المبلغ *', 'Amount *')}</Label>
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} dir="ltr" required />
              </div>
              <div className="space-y-2">
                <Label>{t('التاريخ *', 'Date *')}</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>{t('عن طريق', 'Via')}</Label>
                <Select value={form.receivedIn} onValueChange={v => setForm(f => ({ ...f, receivedIn: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TREASURY">{t('خزينة', 'Treasury')}</SelectItem>
                    <SelectItem value="BANK">{t('بنك', 'Bank')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('المرجع', 'Reference')}</Label>
                <Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder={t('رقم الإيصال', 'Receipt no.')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('ملاحظات', 'Notes')}</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t('ملاحظات', 'Notes')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel')}</Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-cyan-600 hover:bg-cyan-700">
                {createMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('تسجيل', 'Record')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

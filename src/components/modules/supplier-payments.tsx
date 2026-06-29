'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Plus, Search, Trash2, RefreshCw, BookOpen,
  Download, Link2, DollarSign, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
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
import { Separator } from '@/components/ui/separator'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { AccountSelector } from '@/components/shared/account-selector'
import { JePreview } from '@/components/shared/je-preview'
import { useAppStore, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
interface Supplier { id: string; name: string; code: string }

interface InvoiceOption {
  id: string; invoiceNo: string; supplierId: string; totalAmount: number; paidAmount: number; status: string
  date: string; dueDate: string
}

interface SupplierPayment {
  id: string; supplierId: string; invoiceId: string | null; amount: number
  paidFrom: string | null; bankAccount: string | null; paymentMethod: string | null
  date: string; reference: string | null; notes: string | null; journalEntryId: string | null
  supplier: Supplier
}

interface PaymentFormData {
  supplierId: string; invoiceId: string; amount: string; date: string
  paidFrom: string; bankAccount: string; paymentMethod: string; reference: string; notes: string
  payingAccountId: string; payingAccountCode: string; payingAccountName: string
  // خصائص الحساب المختار — للعرض الديناميكي (badges) وسلوك مستقبلي
  payingAccountProps?: {
    showInCash?: boolean
    showInBank?: boolean
    allowsSupplier?: boolean
    allowsCostCenter?: boolean
    accountRole?: string | null
  } | null
}

const defaultForm: PaymentFormData = {
  supplierId: '', invoiceId: '', amount: '', date: new Date().toISOString().split('T')[0],
  paidFrom: 'TREASURY', bankAccount: '', paymentMethod: 'CASH', reference: '', notes: '',
  payingAccountId: '', payingAccountCode: '', payingAccountName: '',
  payingAccountProps: null,
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const paidFromConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  TREASURY: { label: { ar: 'نقدي', en: 'Treasury/Cash' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  BANK: { label: { ar: 'بنكي', en: 'Bank' }, color: 'text-blue-700', bg: 'bg-blue-100' },
}

const paymentMethodConfig: Record<string, { label: { ar: string; en: string } }> = {
  CASH: { label: { ar: 'نقدي', en: 'Cash' } },
  CHECK: { label: { ar: 'شيك', en: 'Check' } },
  TRANSFER: { label: { ar: 'تحويل بنكي', en: 'Bank Transfer' } },
  LETTER_OF_CREDIT: { label: { ar: 'اعتماد مستندي', en: 'Letter of Credit' } },
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Payment Form Dialog ============
function PaymentFormDialog({ open, onOpenChange, suppliers }: {
  open: boolean; onOpenChange: (open: boolean) => void; suppliers: Supplier[]
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PaymentFormData>(defaultForm)
  const { lang } = useAppStore()

  React.useEffect(() => {
    if (open) setForm({ ...defaultForm, date: new Date().toISOString().split('T')[0] })
  }, [open])

  // Fetch invoices filtered by selected supplier
  const { data: allInvoices = [] } = useQuery<InvoiceOption[]>({
    queryKey: ['supplier-invoices-for-payment'],
    queryFn: async () => {
      const res = await fetch('/api/supplier-invoices')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Filter invoices by selected supplier and unpaid/partially paid
  const availableInvoices = useMemo(() => {
    if (!form.supplierId) return []
    return allInvoices.filter(inv =>
      inv.supplierId === form.supplierId &&
      (inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID')
    )
  }, [form.supplierId, allInvoices])

  const selectedInvoice = form.invoiceId ? availableInvoices.find(inv => inv.id === form.invoiceId) : null
  const remainingAmount = selectedInvoice ? selectedInvoice.totalAmount - selectedInvoice.paidAmount : 0

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/supplier-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['supplier-payments'] }); queryClient.invalidateQueries({ queryKey: ['supplier-invoices'] }); toast.success(t('تم تسجيل الدفعة بنجاح', 'Payment recorded successfully', lang)); onOpenChange(false) },
    onError: () => toast.error(t('فشل في تسجيل الدفعة', 'Failed to record payment', lang)),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      supplierId: form.supplierId,
      invoiceId: form.invoiceId || null,
      amount: parseFloat(form.amount) || 0,
      paidFrom: form.paidFrom || 'TREASURY',
      payingAccountId: form.payingAccountId || null,
      payingAccountCode: form.payingAccountCode || null,
      payingAccountName: form.payingAccountName || null,
      bankAccount: form.bankAccount || null,
      paymentMethod: form.paymentMethod || null,
      date: form.date,
      reference: form.reference || null,
      notes: form.notes || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('سداد مورد', 'Supplier Payment', lang)}</DialogTitle>
          <DialogDescription>{t('تسجيل دفعة جديدة لمورد', 'Record a new payment to supplier', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('المورد *', 'Supplier *', lang)}</Label>
            <Select value={form.supplierId} onValueChange={v => setForm(f => ({ ...f, supplierId: v, invoiceId: '' }))}>
              <SelectTrigger><SelectValue placeholder={t('اختر المورد', 'Select supplier', lang)} /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {form.supplierId && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Link2 className="size-3" />
                {t('الفاتورة (اختياري)', 'Invoice (optional)', lang)}
              </Label>
              <Select value={form.invoiceId || 'NONE'} onValueChange={v => setForm(f => ({ ...f, invoiceId: v === 'NONE' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر فاتورة غير مدفوعة', 'Select unpaid invoice', lang)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{t('بدون فاتورة', 'No invoice', lang)}</SelectItem>
                  {availableInvoices.map(inv => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoiceNo} - {t('متبقي', 'Remaining', lang)}: <MoneyDisplay value={inv.totalAmount - inv.paidAmount} mode="system" lang={lang} size="sm" />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedInvoice && (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{t('إجمالي الفاتورة', 'Invoice Total', lang)}</span>
                  <span><MoneyDisplay value={selectedInvoice.totalAmount} mode="system" lang={lang} size="sm" /></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('المدفوع', 'Paid', lang)}</span>
                  <span className="text-teal-700"><MoneyDisplay value={selectedInvoice.paidAmount} mode="system" lang={lang} size="sm" /></span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm font-bold">
                  <span>{t('المبلغ المتبقي', 'Remaining Amount', lang)}</span>
                  <span className="text-amber-700"><MoneyDisplay value={remainingAmount} mode="system" lang={lang} bold size="md" /></span>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('المبلغ *', 'Amount *', lang)}</Label>
              <Input type="number" min="0" step="0.01" max={remainingAmount || undefined} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{t('التاريخ *', 'Date *', lang)}</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* AccountSelector: Single-dropdown case (no cash/bank toggle).
                نُبقي roles=['CASH','BANK'] بدل filterByProperty لأن الـ dropdown
                يعرض النقدية والبنوك معاً ولا toggle صريح بينهما.
                Props المختارة تُخزَّن في form.payingAccountProps لعرض badges شفافة. */}
            <AccountSelector
              roles={['CASH', 'BANK']}
              value={form.payingAccountId || null}
              onValueChange={(id, account) => {
                setForm(f => ({
                  ...f,
                  payingAccountId: id,
                  payingAccountCode: account.code,
                  payingAccountName: account.nameAr || account.name,
                  // Backward compatibility: map account role to old paidFrom field
                  paidFrom: account.accountRole === 'BANK' ? 'BANK' : 'TREASURY',
                  // Property-based info for dynamic UI / badges
                  payingAccountProps: {
                    showInCash: account.showInCash,
                    showInBank: account.showInBank,
                    allowsSupplier: account.allowsSupplier,
                    allowsCostCenter: account.allowsCostCenter,
                    accountRole: account.accountRole,
                  },
                }))
              }}
              label={t('السداد من', 'Paid From', lang)}
              placeholder={t('اختر حساب السداد...', 'Select paying account...', lang)}
            />
            <div className="space-y-2">
              <Label>{t('طريقة الدفع', 'Payment Method', lang)}</Label>
              <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(paymentMethodConfig).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Property badges — عرض شفاف لخصائص الحساب المختار */}
          {form.payingAccountId && form.payingAccountProps && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
              <span className="text-xs text-emerald-700 font-medium">{t('الخصائص:', 'Properties:', lang)}</span>
              {form.payingAccountProps.showInCash && (
                <Badge variant="outline" className="text-[9px] text-amber-700 border-amber-200 bg-amber-50">{t('نقدية', 'cash', lang)}</Badge>
              )}
              {form.payingAccountProps.showInBank && (
                <Badge variant="outline" className="text-[9px] text-sky-700 border-sky-200 bg-sky-50">{t('بنك', 'bank', lang)}</Badge>
              )}
              {form.payingAccountProps.allowsSupplier && (
                <Badge variant="outline" className="text-[9px] text-violet-700 border-violet-200 bg-violet-50">{t('يسمح بمورد', 'allows supplier', lang)}</Badge>
              )}
              {form.payingAccountProps.allowsCostCenter && (
                <Badge variant="outline" className="text-[9px] text-sky-700 border-sky-200 bg-sky-50">{t('يسمح بمركز تكلفة', 'allows cost center', lang)}</Badge>
              )}
            </div>
          )}

          {form.paidFrom === 'BANK' && (
            <div className="space-y-2">
              <Label>{t('الحساب البنكي', 'Bank Account', lang)}</Label>
              <Input value={form.bankAccount} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} placeholder={t('رقم الحساب البنكي', 'Bank account number', lang)} />
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('المرجع', 'Reference', lang)}</Label>
            <Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder={t('رقم المرجع أو الشيك', 'Reference or check number', lang)} dir="ltr" />
          </div>

          <div className="space-y-2">
            <Label>{t('ملاحظات', 'Notes', lang)}</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t('ملاحظات إضافية', 'Additional notes', lang)} />
          </div>

          {/* JE Preview */}
          {parseFloat(form.amount) > 0 && form.payingAccountId && (
            <JePreview
              lines={[
                {
                  accountCode: '3210',
                  accountNameAr: 'موردون',
                  debit: parseFloat(form.amount) || 0,
                  credit: 0,
                },
                {
                  accountCode: form.payingAccountCode,
                  accountNameAr: form.payingAccountName,
                  debit: 0,
                  credit: parseFloat(form.amount) || 0,
                },
              ]}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending || !form.supplierId || !form.amount || !form.date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t('جاري الحفظ...', 'Saving...', lang) : t('تسجيل الدفعة', 'Record Payment', lang)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Supplier Payments Module ============
export function SupplierPaymentsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: payments = [], isLoading, isError, refetch } = useQuery<SupplierPayment[]>({
    queryKey: ['supplier-payments'],
    queryFn: async () => { const res = await fetch('/api/supplier-payments'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers-list'],
    queryFn: async () => { const res = await fetch('/api/suppliers'); if (!res.ok) return []; return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/supplier-payments/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['supplier-payments'] }); queryClient.invalidateQueries({ queryKey: ['supplier-invoices'] }); toast.success(t('تم حذف الدفعة', 'Payment deleted', lang)) },
    onError: () => toast.error(t('فشل في حذف الدفعة', 'Failed to delete payment', lang)),
  })

  const filtered = payments.filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    return p.supplier.name.toLowerCase().includes(s) || (p.reference?.toLowerCase().includes(s))
  })

  const today = new Date().toISOString().split('T')[0]
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()

  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const paymentsToday = payments.filter(p => {
    const d = new Date(p.date)
    return d.toISOString().split('T')[0] === today
  }).reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const paymentsThisMonth = payments.filter(p => {
    const d = new Date(p.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  }).reduce((sum, p) => sum + Number(p.amount || 0), 0)

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'supplierName', label: t('المورد', 'Supplier', lang) },
      { key: 'amount', label: t('المبلغ', 'Amount', lang), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
      { key: 'paidFrom', label: t('طريقة الدفع', 'Paid From', lang) },
      { key: 'paymentMethod', label: t('وسيلة الدفع', 'Payment Method', lang) },
      { key: 'reference', label: t('المرجع', 'Reference', lang) },
    ]
    exportToCSV(filtered.map(p => ({
      supplierName: p.supplier.name, amount: p.amount,
      date: formatDate(p.date, lang), paidFrom: p.paidFrom || '',
      paymentMethod: p.paymentMethod || '', reference: p.reference || '',
    })), `supplier-payments-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  const printData = useMemo(() => ({
    columns: [
      { key: 'supplierName', label: lang === 'ar' ? 'المورد' : 'Supplier' },
      { key: 'amount', label: lang === 'ar' ? 'المبلغ' : 'Amount' },
      { key: 'date', label: lang === 'ar' ? 'التاريخ' : 'Date' },
      { key: 'paidFrom', label: lang === 'ar' ? 'السداد من' : 'Paid From' },
      { key: 'paymentMethod', label: lang === 'ar' ? 'طريقة الدفع' : 'Method' },
      { key: 'reference', label: lang === 'ar' ? 'المرجع' : 'Reference' },
    ],
    rows: filtered.map(p => ({
      supplierName: p.supplier.name,
      amount: p.amount,
      date: formatDate(p.date, lang),
      paidFrom: p.paidFrom || '—',
      paymentMethod: p.paymentMethod || '—',
      reference: p.reference || '—',
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
      { label: lang === 'ar' ? 'إجمالي المدفوعات' : 'Total Payments', value: String(totalPayments) },
    ],
  }), [filtered, lang, totalPayments])

  return (
    <ModuleLayout
      title={{ ar: 'سداد الموردين', en: 'Supplier Payments' }}
      subtitle={{ ar: 'تسجيل ومتابعة مدفوعات الموردين', en: 'Record and track supplier payments' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="supplier-payment" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4" />{t('سداد جديد', 'New Payment', lang)}</Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center"><DollarSign className="size-5 text-emerald-600" /></div>
            <div>
              <p className="text-sm text-emerald-600">{t('إجمالي المدفوعات', 'Total Payments', lang)}</p>
              <MoneyDisplay value={totalPayments} mode="system" lang={lang} bold size="lg" className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center"><Calendar className="size-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-blue-600">{t('مدفوعات اليوم', 'Today', lang)}</p>
              <MoneyDisplay value={paymentsToday} mode="system" lang={lang} bold size="lg" className="text-blue-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center"><CreditCard className="size-5 text-amber-600" /></div>
            <div>
              <p className="text-sm text-amber-600">{t('مدفوعات الشهر', 'This Month', lang)}</p>
              <MoneyDisplay value={paymentsThisMonth} mode="system" lang={lang} bold size="lg" className="text-amber-700" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card><CardContent className="p-4">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث باسم المورد أو المرجع...', 'Search by supplier or reference...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><CreditCard className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد مدفوعات', 'No payments', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4 mr-1" />{t('سداد جديد', 'New Payment', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead className="text-right">{t('الفاتورة', 'Invoice', lang)}</TableHead>
                <TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead>
                <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-right">{t('السداد من', 'Paid From', lang)}</TableHead>
                <TableHead className="text-right">{t('طريقة الدفع', 'Method', lang)}</TableHead>
                <TableHead className="text-right">{t('المرجع', 'Reference', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const pfCfg = paidFromConfig[p.paidFrom || 'TREASURY'] || paidFromConfig.TREASURY
                  const pmCfg = paymentMethodConfig[p.paymentMethod || 'CASH'] || paymentMethodConfig.CASH
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.supplier.name}</TableCell>
                      <TableCell>
                        {p.invoiceId ? (
                          <Badge className="bg-blue-50 text-blue-700 border-0 text-xs gap-1"><Link2 className="size-3" />{t('فاتورة', 'Inv', lang)}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell><MoneyDisplay value={p.amount} mode="system" lang={lang} size="sm" bold /></TableCell>
                      <TableCell>{formatDate(p.date, lang)}</TableCell>
                      <TableCell>
                        <Badge className={`${pfCfg.bg} ${pfCfg.color} border-0`}>{pfCfg.label[lang]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{pmCfg.label[lang]}</TableCell>
                      <TableCell dir="ltr" className="text-right">{p.reference || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {p.journalEntryId && (
                            <Badge className="bg-purple-100 text-purple-700 border-0 gap-1 text-xs"><BookOpen className="size-3" />{t('قيد', 'Entry', lang)}</Badge>
                          )}
                          {!p.journalEntryId && (
                            <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من حذف الدفعة؟', 'Are you sure you want to delete this payment?', lang))) deleteMutation.mutate(p.id) }}><Trash2 className="size-4" /></Button>
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

      <PaymentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} suppliers={suppliers} />
    </ModuleLayout>
  )
}

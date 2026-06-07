'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Percent, RefreshCw, FileText, CheckCircle2, CalendarDays,
  Printer, Download, Eye, PlusCircle, Clock,
  Send, Receipt, ShoppingBag, FileCheck, AlertTriangle, Wallet,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAppStore, formatDate } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { toast } from 'sonner'

// ============ Types ============
interface VATDeclaration {
  id: string; period: string; year: number; quarter: number
  totalSales: number; outputVat: number
  totalPurchases: number; inputVat: number
  netVat: number; status: string
  filedDate: string | null; paymentDate: string | null; paymentReference: string | null
  createdAt: string; updatedAt: string
}

interface SalesInvoiceBreakdown { id: string; invoiceNo: string; date: string; totalAmount: number; vatAmount: number; status: string }
interface ProgressClaimBreakdown { id: string; claimNo: string; date: string; totalAmount: number; vatAmount: number; status: string }
interface PurchaseInvoiceBreakdown { id: string; invoiceNo: string; date: string; totalAmount: number; vatAmount: number; status: string }
interface SubcontractorInvoiceBreakdown { id: string; invoiceNo: string; date: string; totalAmount: number; vatAmount: number; status: string }
interface ExpenseBreakdown { id: string; description: string; date: string; amount: number; vatAmount: number | null; category: string }

interface DeclarationBreakdown {
  salesInvoices: SalesInvoiceBreakdown[]
  progressClaims: ProgressClaimBreakdown[]
  purchaseInvoices: PurchaseInvoiceBreakdown[]
  subcontractorInvoices: SubcontractorInvoiceBreakdown[]
  expenses: ExpenseBreakdown[]
}

// ============ Helpers ============
function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string; icon: React.ReactNode }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-amber-700', bg: 'bg-amber-100', icon: <Clock className="size-3.5" /> },
  FILED: { label: { ar: 'مُقر', en: 'Filed' }, color: 'text-emerald-700', bg: 'bg-emerald-100', icon: <CheckCircle2 className="size-3.5" /> },
  PAID: { label: { ar: 'مدفوع', en: 'Paid' }, color: 'text-teal-700', bg: 'bg-teal-100', icon: <CheckCircle2 className="size-3.5" /> },
}

function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0 gap-1`}>{cfg.icon}{cfg.label[lang]}</Badge>
}

const quarterConfig: Record<number, { ar: string; en: string; monthsAr: string; monthsEn: string }> = {
  1: { ar: 'الربع الأول', en: 'Q1', monthsAr: 'يناير - مارس', monthsEn: 'January - March' },
  2: { ar: 'الربع الثاني', en: 'Q2', monthsAr: 'أبريل - يونيو', monthsEn: 'April - June' },
  3: { ar: 'الربع الثالث', en: 'Q3', monthsAr: 'يوليو - سبتمبر', monthsEn: 'July - September' },
  4: { ar: 'الربع الرابع', en: 'Q4', monthsAr: 'أكتوبر - ديسمبر', monthsEn: 'October - December' },
}

// ============ VAT Summary Tab ============
function VATSummaryTab({ vatReturns }: { vatReturns: VATDeclaration[] }) {
  const { lang } = useAppStore()

  const summary = useMemo(() => {
    const totalOutputVat = vatReturns.reduce((s, v) => s + v.outputVat, 0)
    const totalInputVat = vatReturns.reduce((s, v) => s + v.inputVat, 0)
    const totalSales = vatReturns.reduce((s, v) => s + v.totalSales, 0)
    const totalPurchases = vatReturns.reduce((s, v) => s + v.totalPurchases, 0)
    const netVat = totalOutputVat - totalInputVat
    return { totalOutputVat, totalInputVat, totalSales, totalPurchases, netVat }
  }, [vatReturns])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Output VAT */}
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <Receipt className="size-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-700">{t('ضريبة المخرجات', 'Output VAT', lang)}</p>
                <p className="text-xs text-muted-foreground">{t('من فواتير المبيعات والمستخلصات', 'From sales invoices & claims', lang)}</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('إجمالي المبيعات', 'Total Sales', lang)}</span>
                <MoneyDisplay value={summary.totalSales} lang={lang} size="sm" bold className="text-emerald-700" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{t('ضريبة المخرجات', 'Output VAT', lang)}</span>
                <MoneyDisplay value={summary.totalOutputVat} lang={lang} size="lg" bold className="text-emerald-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Input VAT */}
        <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-8 rounded-full bg-rose-100 flex items-center justify-center">
                <ShoppingBag className="size-4 text-rose-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-rose-700">{t('ضريبة المدخلات', 'Input VAT', lang)}</p>
                <p className="text-xs text-muted-foreground">{t('من المشتريات والمصروفات', 'From purchases & expenses', lang)}</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('إجمالي المشتريات', 'Total Purchases', lang)}</span>
                <MoneyDisplay value={summary.totalPurchases} lang={lang} size="sm" bold className="text-rose-700" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{t('ضريبة المدخلات', 'Input VAT', lang)}</span>
                <MoneyDisplay value={summary.totalInputVat} lang={lang} size="lg" bold className="text-rose-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Net VAT */}
        <Card className={`border-2 ${summary.netVat >= 0 ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-white' : 'border-teal-300 bg-gradient-to-br from-teal-50 to-white'}`}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className={`size-8 rounded-full flex items-center justify-center ${summary.netVat >= 0 ? 'bg-amber-100' : 'bg-teal-100'}`}>
                <Percent className={`size-4 ${summary.netVat >= 0 ? 'text-amber-600' : 'text-teal-600'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${summary.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'}`}>
                  {t('صافي الضريبة', 'Net VAT', lang)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary.netVat >= 0 ? t('مبلغ مستحق للدفع', 'Amount payable', lang) : t('مبلغ مسترد', 'Amount refundable', lang)}
                </p>
              </div>
            </div>
            <MoneyDisplay
              value={Math.abs(summary.netVat)}
              lang={lang} size="xl" bold
              className={summary.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============ Tax Declaration Tab ============
function TaxDeclarationTab({ vatReturns, isLoading, selectedYear, onSelectYear, onView, isCreating }: {
  vatReturns: VATDeclaration[]; isLoading: boolean
  selectedYear: number; onSelectYear: (y: number) => void
  onView: (declaration: VATDeclaration) => void
  isCreating: boolean
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [creatingQuarter, setCreatingQuarter] = useState<number | null>(null)
  const currentYear = new Date().getFullYear()
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

  const declarationsByQuarter = useMemo(() => {
    const map: Record<number, VATDeclaration> = {}
    vatReturns.forEach(v => { if (v.quarter >= 1 && v.quarter <= 4) map[v.quarter] = v })
    return map
  }, [vatReturns])

  const createMutation = useMutation({
    mutationFn: (data: { year: number; quarter: number }) =>
      fetch('/api/vat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', selectedYear] })
      toast.success(t('تم إنشاء الإقرار الضريبي', 'VAT return created', lang))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleCreate = (year: number, quarter: number) => {
    setCreatingQuarter(quarter)
    createMutation.mutate({ year, quarter })
  }

  return (
    <div className="space-y-4">
      {/* Year Selector */}
      <Card className="bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium">{t('السنة', 'Year', lang)}</Label>
            <Select value={String(selectedYear)} onValueChange={v => onSelectYear(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Quarter Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><div className="h-40 animate-pulse rounded bg-gray-100" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(quarter => {
            const declaration = declarationsByQuarter[quarter]
            const cfg = quarterConfig[quarter]
            const hasDeclaration = !!declaration

            return (
              <Card key={quarter} className={`transition-all hover:shadow-md ${hasDeclaration ? (declaration.status === 'PAID' ? 'border-emerald-300 bg-emerald-50/30' : declaration.status === 'FILED' ? 'border-teal-300 bg-teal-50/30' : 'border-amber-300 bg-amber-50/30') : 'border-gray-200'}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">{cfg[lang]} - {selectedYear}</h3>
                      <p className="text-sm text-muted-foreground">{lang === 'ar' ? cfg.monthsAr : cfg.monthsEn}</p>
                    </div>
                    {hasDeclaration ? <StatusBadge status={declaration.status} lang={lang} /> : <Badge className="bg-gray-100 text-gray-500 border-0">{t('لا يوجد', 'None', lang)}</Badge>}
                  </div>

                  {hasDeclaration ? (
                    <>
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t('ضريبة المخرجات', 'Output VAT', lang)}</span>
                          <MoneyDisplay value={declaration.outputVat} lang={lang} size="sm" className="text-emerald-600" />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t('ضريبة المدخلات', 'Input VAT', lang)}</span>
                          <MoneyDisplay value={declaration.inputVat} lang={lang} size="sm" className="text-rose-600" />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">{t('صافي الضريبة', 'Net VAT', lang)}</span>
                          <MoneyDisplay value={declaration.netVat} lang={lang} size="md" bold className={declaration.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => onView(declaration)}>
                          <Eye className="size-4" />{t('عرض التفاصيل', 'View Details', lang)}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col items-center justify-center py-4 mb-3">
                        <div className="size-12 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                          <FileText className="size-6 text-gray-400" />
                        </div>
                        <p className="text-sm text-muted-foreground text-center">{t('لم يتم إنشاء إقرار', 'No Declaration Created', lang)}</p>
                      </div>
                      <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5" size="sm" onClick={() => handleCreate(selectedYear, quarter)} disabled={createMutation.isPending && creatingQuarter === quarter}>
                        {createMutation.isPending && creatingQuarter === quarter ? (<><RefreshCw className="size-4 animate-spin" />{t('جاري الإنشاء...', 'Creating...', lang)}</>) : (<><PlusCircle className="size-4" />{t('إنشاء إقرار', 'Create Declaration', lang)}</>)}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============ Declaration Detail View ============
function DeclarationDetailView({ declaration, breakdown, lang, onBack, onSubmit, onPay, isSubmitting }: {
  declaration: VATDeclaration; breakdown: DeclarationBreakdown | null; lang: 'ar' | 'en'
  onBack: () => void; onSubmit: (id: string) => void; onPay: (id: string, reference: string) => void; isSubmitting: boolean
}) {
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payReference, setPayReference] = useState('')
  const cfg = quarterConfig[declaration.quarter]
  const isDraft = declaration.status === 'DRAFT'
  const isFiled = declaration.status === 'FILED' || declaration.status === 'PAID'

  const handleExportCSV = useCallback(() => {
    const rows = [
      [t('الحقل', 'Field', lang), t('القيمة', 'Value', lang)],
      [t('الفترة', 'Period', lang), declaration.period],
      [t('إجمالي المبيعات', 'Total Sales', lang), declaration.totalSales.toFixed(2)],
      [t('ضريبة المخرجات', 'Output VAT', lang), declaration.outputVat.toFixed(2)],
      [t('إجمالي المشتريات', 'Total Purchases', lang), declaration.totalPurchases.toFixed(2)],
      [t('ضريبة المدخلات', 'Input VAT', lang), declaration.inputVat.toFixed(2)],
      [t('صافي الضريبة', 'Net VAT', lang), declaration.netVat.toFixed(2)],
    ]
    const csvContent = rows.map(row => row.join(',')).join('\n')
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `VAT-${declaration.period}.csv`; link.click()
    URL.revokeObjectURL(url)
  }, [declaration, lang])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-emerald-600">←</Button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('تفاصيل الإقرار الضريبي', 'Tax Declaration Details', lang)}</h2>
            <p className="text-sm text-muted-foreground">{cfg[lang]} - {declaration.year} • {lang === 'ar' ? cfg.monthsAr : cfg.monthsEn}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={declaration.status} lang={lang} />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}><Printer className="size-4" />{t('طباعة', 'Print', lang)}</Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV}><Download className="size-4" />{t('تصدير CSV', 'Export CSV', lang)}</Button>
          {isDraft && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={() => onSubmit(declaration.id)} disabled={isSubmitting}>
              {isSubmitting ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
              {t('تقديم الإقرار', 'Submit Declaration', lang)}
            </Button>
          )}
          {declaration.status === 'FILED' && (
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 gap-1.5" onClick={() => setPayDialogOpen(true)}>
              <Wallet className="size-4" />{t('تسجيل الدفع', 'Record Payment', lang)}
            </Button>
          )}
        </div>
      </div>

      {/* Auto-calculated notice */}
      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
        <Percent className="size-4 shrink-0" />
        <span>{t('جميع الأرقام محسوبة تلقائياً من بيانات الفواتير الفعلية ومجمّدة عند التقديم', 'All figures are auto-calculated from actual invoice data and frozen upon filing', lang)}</span>
      </div>

      {/* Period Info */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-emerald-600" />
            <span className="font-medium text-emerald-800">{t('الفترة الضريبية', 'Tax Period', lang)}:</span>
            <span className="font-bold text-emerald-900 text-lg" dir="ltr">{declaration.period}</span>
            <span className="text-emerald-600 text-sm">{lang === 'ar' ? cfg.monthsAr : cfg.monthsEn}</span>
          </div>
        </CardContent>
      </Card>

      {/* VAT Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-emerald-700 mb-2">{t('ضريبة المخرجات', 'Output VAT', lang)}</p>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">{t('إجمالي المبيعات', 'Total Sales', lang)}</span>
              <MoneyDisplay value={declaration.totalSales} lang={lang} size="sm" bold className="text-emerald-700" />
            </div>
            <Separator className="my-2" />
            <MoneyDisplay value={declaration.outputVat} lang={lang} size="lg" bold className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-white">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-rose-700 mb-2">{t('ضريبة المدخلات', 'Input VAT', lang)}</p>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">{t('إجمالي المشتريات', 'Total Purchases', lang)}</span>
              <MoneyDisplay value={declaration.totalPurchases} lang={lang} size="sm" bold className="text-rose-700" />
            </div>
            <Separator className="my-2" />
            <MoneyDisplay value={declaration.inputVat} lang={lang} size="lg" bold className="text-rose-700" />
          </CardContent>
        </Card>
        <Card className={`border-2 ${declaration.netVat >= 0 ? 'border-amber-300' : 'border-teal-300'}`}>
          <CardContent className="p-5">
            <p className={`text-sm font-medium ${declaration.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'} mb-2`}>{t('صافي الضريبة', 'Net VAT', lang)}</p>
            <p className="text-xs text-muted-foreground mb-2">
              {declaration.netVat >= 0 ? t('مستحق للدفع', 'Payable', lang) : t('مسترد', 'Refundable', lang)}
            </p>
            <MoneyDisplay value={declaration.netVat} lang={lang} size="xl" bold className={declaration.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'} />
          </CardContent>
        </Card>
      </div>

      {/* Filing Info */}
      {isFiled && declaration.filedDate && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileCheck className="size-5 text-emerald-600" />
              <span className="text-emerald-800 font-medium">{t('تم تقديم الإقرار في', 'Declaration submitted on', lang)}: {formatDate(declaration.filedDate, lang)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {declaration.status === 'PAID' && declaration.paymentDate && (
        <Card className="border-teal-200 bg-teal-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-teal-600" />
              <span className="text-teal-800 font-medium">{t('تم الدفع في', 'Payment made on', lang)}: {formatDate(declaration.paymentDate, lang)} {declaration.paymentReference ? `(${t('مرجع', 'Ref', lang)}: ${declaration.paymentReference})` : ''}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Breakdown */}
      {breakdown && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><FileText className="size-5 text-emerald-600" />{t('تفصيل الفواتير', 'Invoice Breakdown', lang)}</h3>

          {breakdown.salesInvoices.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <h4 className="font-semibold text-emerald-800 flex items-center gap-2"><Receipt className="size-4" />{t('فواتير المبيعات', 'Sales Invoices', lang)}<Badge className="bg-emerald-100 text-emerald-700 border-0">{breakdown.salesInvoices.length}</Badge></h4>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                      <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {breakdown.salesInvoices.map(inv => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-sm">{inv.invoiceNo}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(inv.date, lang)}</TableCell>
                          <TableCell><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" /></TableCell>
                          <TableCell><MoneyDisplay value={inv.vatAmount} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {breakdown.progressClaims && breakdown.progressClaims.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <h4 className="font-semibold text-emerald-800 flex items-center gap-2"><FileText className="size-4" />{t('المستخلصات', 'Progress Claims', lang)}<Badge className="bg-emerald-100 text-emerald-700 border-0">{breakdown.progressClaims.length}</Badge></h4>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-right">{t('رقم المستخلص', 'Claim No', lang)}</TableHead>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                      <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {breakdown.progressClaims.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-sm">{c.claimNo}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(c.date, lang)}</TableCell>
                          <TableCell><MoneyDisplay value={c.totalAmount} lang={lang} size="sm" /></TableCell>
                          <TableCell><MoneyDisplay value={c.vatAmount} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {breakdown.purchaseInvoices.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <h4 className="font-semibold text-rose-800 flex items-center gap-2"><ShoppingBag className="size-4" />{t('فواتير المشتريات', 'Purchase Invoices', lang)}<Badge className="bg-rose-100 text-rose-700 border-0">{breakdown.purchaseInvoices.length}</Badge></h4>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                      <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {breakdown.purchaseInvoices.map(inv => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-sm">{inv.invoiceNo}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(inv.date, lang)}</TableCell>
                          <TableCell><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" /></TableCell>
                          <TableCell><MoneyDisplay value={inv.vatAmount} lang={lang} size="sm" className="text-rose-700" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {breakdown.subcontractorInvoices && breakdown.subcontractorInvoices.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <h4 className="font-semibold text-orange-800 flex items-center gap-2"><ShoppingBag className="size-4" />{t('فواتير مقاولي الباطن', 'Subcontractor Invoices', lang)}<Badge className="bg-orange-100 text-orange-700 border-0">{breakdown.subcontractorInvoices.length}</Badge></h4>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                      <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {breakdown.subcontractorInvoices.map(inv => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-sm">{inv.invoiceNo}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(inv.date, lang)}</TableCell>
                          <TableCell><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" /></TableCell>
                          <TableCell><MoneyDisplay value={inv.vatAmount} lang={lang} size="sm" className="text-orange-700" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {breakdown.expenses.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <h4 className="font-semibold text-purple-800 flex items-center gap-2"><Receipt className="size-4" />{t('المصروفات الخاضعة للضريبة', 'Taxed Expenses', lang)}<Badge className="bg-purple-100 text-purple-700 border-0">{breakdown.expenses.length}</Badge></h4>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                      <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead>
                      <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {breakdown.expenses.map(exp => (
                        <TableRow key={exp.id}>
                          <TableCell className="text-sm">{exp.description}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(exp.date, lang)}</TableCell>
                          <TableCell><MoneyDisplay value={exp.amount} lang={lang} size="sm" /></TableCell>
                          <TableCell><MoneyDisplay value={exp.vatAmount || 0} lang={lang} size="sm" className="text-purple-700" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {breakdown.salesInvoices.length === 0 && breakdown.purchaseInvoices.length === 0 && breakdown.expenses.length === 0 && (!breakdown.progressClaims || breakdown.progressClaims.length === 0) && (!breakdown.subcontractorInvoices || breakdown.subcontractorInvoices.length === 0) && (
            <Card className="border-dashed">
              <CardContent className="p-8 flex flex-col items-center gap-3">
                <FileText className="size-12 text-gray-300" />
                <p className="text-muted-foreground text-center">{t('لا توجد فواتير في هذه الفترة', 'No invoices in this period', lang)}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('تسجيل دفع الضريبة', 'Record VAT Payment', lang)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('رقم مرجع الدفع', 'Payment Reference', lang)}</Label>
              <Input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder={t('أدخل رقم المرجع', 'Enter reference number', lang)} dir="ltr" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { onPay(declaration.id, payReference); setPayDialogOpen(false) }} disabled={!payReference}>
              {t('تأكيد الدفع', 'Confirm Payment', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ Main VAT Module ============
export function VATModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const currentYear = new Date().getFullYear()
  const [activeTab, setActiveTab] = useState('summary')
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [viewState, setViewState] = useState<'list' | 'detail'>('list')
  const [selectedDeclaration, setSelectedDeclaration] = useState<VATDeclaration | null>(null)

  const { data: vatReturns = [], isLoading, refetch } = useQuery<VATDeclaration[]>({
    queryKey: ['vat-returns', selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/vat?year=${selectedYear}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: breakdownData } = useQuery<{ declaration: VATDeclaration | null; autoCalc: { outputVat: number; inputVat: number; netVat: number }; breakdown: DeclarationBreakdown }>({
    queryKey: ['vat-breakdown', selectedDeclaration?.id],
    queryFn: async () => {
      if (!selectedDeclaration) return { declaration: null, autoCalc: { outputVat: 0, inputVat: 0, netVat: 0 }, breakdown: { salesInvoices: [], progressClaims: [], purchaseInvoices: [], subcontractorInvoices: [], expenses: [] } }
      const res = await fetch(`/api/vat?year=${selectedDeclaration.year}&quarter=${selectedDeclaration.quarter}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: viewState === 'detail' && !!selectedDeclaration,
  })

  const submitMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/vat', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'FILE' }) })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: (data: VATDeclaration) => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', selectedYear] })
      setSelectedDeclaration(data)
      toast.success(t('تم تقديم الإقرار الضريبي بنجاح', 'VAT return filed successfully', lang))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const payMutation = useMutation({
    mutationFn: (data: { id: string; reference: string }) =>
      fetch('/api/vat', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, action: 'PAY', paymentReference: data.reference }) })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: (data: VATDeclaration) => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', selectedYear] })
      setSelectedDeclaration(data)
      toast.success(t('تم تسجيل الدفع بنجاح', 'Payment recorded successfully', lang))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Detail view
  if (viewState === 'detail' && selectedDeclaration) {
    return (
      <ModuleLayout title={{ ar: 'ضريبة القيمة المضافة', en: 'VAT' }} subtitle={{ ar: 'تفاصيل الإقرار الضريبي', en: 'Tax Declaration Details' }}>
        <DeclarationDetailView
          declaration={selectedDeclaration}
          breakdown={breakdownData?.breakdown || null}
          lang={lang}
          onBack={() => { setViewState('list'); setSelectedDeclaration(null) }}
          onSubmit={(id) => submitMutation.mutate(id)}
          onPay={(id, reference) => payMutation.mutate({ id, reference })}
          isSubmitting={submitMutation.isPending}
        />
      </ModuleLayout>
    )
  }

  return (
    <ModuleLayout
      title={{ ar: 'ضريبة القيمة المضافة', en: 'VAT' }}
      subtitle={{ ar: 'إدارة إقرارات الضريبة وملخص الضريبة', en: 'Manage tax declarations & VAT summary' }}
      actions={<Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="summary" className="gap-1">{t('ملخص الضريبة', 'VAT Summary', lang)}</TabsTrigger>
          <TabsTrigger value="declarations" className="gap-1">{t('الإقرار الضريبي', 'Tax Declaration', lang)}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <VATSummaryTab vatReturns={vatReturns} />
        </TabsContent>

        <TabsContent value="declarations">
          <TaxDeclarationTab
            vatReturns={vatReturns}
            isLoading={isLoading}
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
            onView={(dec) => { setSelectedDeclaration(dec); setViewState('detail') }}
            isCreating={false}
          />
        </TabsContent>
      </Tabs>
    </ModuleLayout>
  )
}

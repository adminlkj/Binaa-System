'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Percent, RefreshCw, FileText, CheckCircle2, CalendarDays,
  Download, Eye, PlusCircle, Clock, Trash2, Undo2, FileSpreadsheet,
  Send, Receipt, ShoppingBag, FileCheck, AlertTriangle, Wallet,
  ShieldCheck, ShieldAlert, XCircle, RotateCcw, Printer,
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
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore, formatDate } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { toast } from 'sonner'

// ============ Types ============
interface VATDeclaration {
  id: string; period: string; year: number; quarter: number
  totalSales: number; outputVat: number
  totalPurchases: number; inputVat: number
  netVat: number; status: string
  filedDate: string | null; paymentDate: string | null; paymentReference: string | null
  // ZATCA category breakdown
  standardRatedSales?: number; zeroRatedSales?: number; exemptSales?: number; standardRatedSalesVat?: number
  standardRatedPurchases?: number; zeroRatedPurchases?: number; exemptPurchases?: number
  importsSubjectToVAT?: number; standardRatedPurchasesVat?: number
  // GL cross-check
  glOutputVat?: number; glInputVat?: number; glMatch?: boolean
  // Reversal tracking
  cancelledAt?: string | null; cancelledReason?: string | null
  isAmendment?: boolean; amendedFromId?: string | null
  createdAt: string; updatedAt: string
}

interface SourceLine {
  id: string; ref: string; date: string; description: string
  subtotal: number; vatRate: number; vatAmount: number; total: number
  category: 'STANDARD' | 'ZERO' | 'EXEMPT'
  sourceType: 'SALES_INVOICE' | 'PROGRESS_CLAIM' | 'PURCHASE_INVOICE' | 'SUBCONTRACTOR_INVOICE' | 'EXPENSE'
  status: string; counterpartyName?: string
}

interface DeclarationBreakdown {
  salesInvoices: SourceLine[]
  progressClaims: SourceLine[]
  purchaseInvoices: SourceLine[]
  subcontractorInvoices: SourceLine[]
  expenses: SourceLine[]
}

interface AutoCalc {
  outputVat: number; inputVat: number; netVat: number
  totalSales: number; totalPurchases: number
  glOutputVat: number; glInputVat: number
  glMatch: boolean; glDiffOutput: number; glDiffInput: number
}

interface Categories {
  standardRatedSales: number; zeroRatedSales: number; exemptSales: number; standardRatedSalesVat: number
  standardRatedPurchases: number; zeroRatedPurchases: number; exemptPurchases: number
  importsSubjectToVAT: number; standardRatedPurchasesVat: number
}

// ============ Helpers ============
function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string; icon: React.ReactNode }> = {
  DRAFT:     { label: { ar: 'مسودة', en: 'Draft' },          color: 'text-amber-700',   bg: 'bg-amber-100',   icon: <Clock className="size-3.5" /> },
  FILED:     { label: { ar: 'مُقر', en: 'Filed' },            color: 'text-emerald-700', bg: 'bg-emerald-100', icon: <CheckCircle2 className="size-3.5" /> },
  PAID:      { label: { ar: 'مدفوع', en: 'Paid' },            color: 'text-teal-700',    bg: 'bg-teal-100',    icon: <CheckCircle2 className="size-3.5" /> },
  CANCELLED: { label: { ar: 'ملغي', en: 'Cancelled' },        color: 'text-red-700',     bg: 'bg-red-100',     icon: <XCircle className="size-3.5" /> },
  AMENDED:   { label: { ar: 'معدل', en: 'Amended' },          color: 'text-purple-700',  bg: 'bg-purple-100',  icon: <RotateCcw className="size-3.5" /> },
}

function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0 gap-1`}>{cfg.icon}{cfg.label[lang]}</Badge>
}

const quarterConfig: Record<number, { ar: string; en: string; monthsAr: string; monthsEn: string }> = {
  1: { ar: 'الربع الأول', en: 'Q1', monthsAr: 'يناير - مارس',       monthsEn: 'January - March' },
  2: { ar: 'الربع الثاني', en: 'Q2', monthsAr: 'أبريل - يونيو',      monthsEn: 'April - June' },
  3: { ar: 'الربع الثالث', en: 'Q3', monthsAr: 'يوليو - سبتمبر',     monthsEn: 'July - September' },
  4: { ar: 'الربع الرابع', en: 'Q4', monthsAr: 'أكتوبر - ديسمبر',    monthsEn: 'October - December' },
}

const categoryLabels: Record<string, { ar: string; en: string; color: string; bg: string }> = {
  STANDARD: { ar: 'خاضعة 15%', en: 'Standard 15%', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  ZERO:     { ar: 'صفريه', en: 'Zero-rated',      color: 'text-blue-700',    bg: 'bg-blue-100' },
  EXEMPT:   { ar: 'معفاة', en: 'Exempt',           color: 'text-gray-700',    bg: 'bg-gray-100' },
}

const sourceTypeLabels: Record<string, { ar: string; en: string }> = {
  SALES_INVOICE:        { ar: 'فاتورة مبيعات', en: 'Sales Invoice' },
  PROGRESS_CLAIM:       { ar: 'مستخلص', en: 'Progress Claim' },
  PURCHASE_INVOICE:     { ar: 'فاتورة مشتريات', en: 'Purchase Invoice' },
  SUBCONTRACTOR_INVOICE:{ ar: 'فاتورة مقاول باطن', en: 'Subcontractor Invoice' },
  EXPENSE:              { ar: 'مصروف', en: 'Expense' },
}

// ============ VAT Summary Tab ============
function VATSummaryTab({ vatReturns }: { vatReturns: VATDeclaration[] }) {
  const { lang } = useAppStore()

  const summary = useMemo(() => {
    // عدّ فقط الإقرارات النشطة (ليست ملغاة) في الإجماليات
    const active = vatReturns.filter(v => v.status !== 'CANCELLED')
    const totalOutputVat = active.reduce((s, v) => s + Number(v.outputVat || 0), 0)
    const totalInputVat = active.reduce((s, v) => s + Number(v.inputVat || 0), 0)
    const totalSales = active.reduce((s, v) => s + Number(v.totalSales || 0), 0)
    const totalPurchases = active.reduce((s, v) => s + Number(v.totalPurchases || 0), 0)
    const netVat = totalOutputVat - totalInputVat
    return { totalOutputVat, totalInputVat, totalSales, totalPurchases, netVat }
  }, [vatReturns])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

  // For each quarter, find the ACTIVE declaration (not CANCELLED)
  const declarationsByQuarter = useMemo(() => {
    const map: Record<number, VATDeclaration> = {}
    // فقط الإقرارات النشطة (غير الملغاة) - والأحدث
    vatReturns
      .filter(v => v.status !== 'CANCELLED')
      .forEach(v => { if (v.quarter >= 1 && v.quarter <= 4) map[v.quarter] = v })
    return map
  }, [vatReturns])

  // إقرارات ملغاة لكل ربع (لعرض سجل التعديلات)
  const cancelledByQuarter = useMemo(() => {
    const map: Record<number, number> = {}
    vatReturns
      .filter(v => v.status === 'CANCELLED')
      .forEach(v => { if (v.quarter >= 1 && v.quarter <= 4) map[v.quarter] = (map[v.quarter] || 0) + 1 })
    return map
  }, [vatReturns])

  const createMutation = useMutation({
    mutationFn: (data: { year: number; quarter: number }) =>
      fetch('/api/vat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', selectedYear] })
      toast.success(t('تم إنشاء الإقرار الضريبي بنجاح', 'VAT return created successfully', lang))
    },
    onError: (err: Error) => toast.error(t('فشل في إنشاء الإقرار: ', 'Failed to create: ', lang) + err.message),
  })

  const handleCreate = (year: number, quarter: number) => {
    setCreatingQuarter(quarter)
    createMutation.mutate({ year, quarter })
  }

  return (
    <div className="space-y-4">
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
            const cancelledCount = cancelledByQuarter[quarter] || 0

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
                      {declaration.isAmendment && (
                        <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1">
                          <RotateCcw className="size-3" />
                          {t('إقرار معدل', 'Amended return', lang)}
                        </div>
                      )}
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
                        {cancelledCount > 0 && (
                          <p className="text-xs text-amber-600 mt-1">
                            {t(`يوجد ${cancelledCount} إقرار ملغي`, `${cancelledCount} cancelled return(s)`, lang)}
                          </p>
                        )}
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
function DeclarationDetailView({
  declaration, breakdown, autoCalc, categories, lang, onBack, onSubmit, onPay, onReverse, onDelete, isSubmitting, isReversing,
}: {
  declaration: VATDeclaration
  breakdown: DeclarationBreakdown | null
  autoCalc: AutoCalc | null
  categories: Categories | null
  lang: 'ar' | 'en'
  onBack: () => void
  onSubmit: (id: string) => void
  onPay: (id: string, reference: string) => void
  onReverse: (id: string, reason: string) => void
  onDelete: (id: string) => void
  isSubmitting: boolean
  isReversing: boolean
}) {
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payReference, setPayReference] = useState('')
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')
  const cfg = quarterConfig[declaration.quarter]
  const isDraft = declaration.status === 'DRAFT'
  const isFiled = declaration.status === 'FILED'
  const isPaid = declaration.status === 'PAID'
  const isCancelled = declaration.status === 'CANCELLED'
  const canReverse = isFiled || isPaid

  // ===== Export helpers =====
  const handleExportCSV = useCallback(() => {
    const rows: (string | number)[][] = [
      [t('الحقل', 'Field', lang), t('القيمة', 'Value', lang)],
      [t('الفترة', 'Period', lang), declaration.period],
      [t('السنة', 'Year', lang), declaration.year],
      [t('الربع', 'Quarter', lang), cfg[lang]],
      [t('الحالة', 'Status', lang), declaration.status],
      [t('إجمالي المبيعات', 'Total Sales', lang), (declaration.totalSales ?? 0).toFixed(2)],
      [t('  - مبيعات خاضعة 15%', '  - Standard-rated sales', lang), (declaration.standardRatedSales ?? 0).toFixed(2)],
      [t('  - مبيعات صفريه', '  - Zero-rated sales', lang), (declaration.zeroRatedSales ?? 0).toFixed(2)],
      [t('  - مبيعات معفاة', '  - Exempt sales', lang), (declaration.exemptSales ?? 0).toFixed(2)],
      [t('ضريبة المخرجات', 'Output VAT', lang), (declaration.outputVat ?? 0).toFixed(2)],
      [t('إجمالي المشتريات', 'Total Purchases', lang), (declaration.totalPurchases ?? 0).toFixed(2)],
      [t('  - مشتريات خاضعة 15%', '  - Standard-rated purchases', lang), (declaration.standardRatedPurchases ?? 0).toFixed(2)],
      [t('  - مشتريات صفريه', '  - Zero-rated purchases', lang), (declaration.zeroRatedPurchases ?? 0).toFixed(2)],
      [t('  - مشتريات معفاة', '  - Exempt purchases', lang), (declaration.exemptPurchases ?? 0).toFixed(2)],
      [t('ضريبة المدخلات', 'Input VAT', lang), (declaration.inputVat ?? 0).toFixed(2)],
      [t('صافي الضريبة', 'Net VAT', lang), (declaration.netVat ?? 0).toFixed(2)],
    ]
    if (autoCalc) {
      rows.push([t('— التحقق من دفتر اليومية —', '— GL Verification —', lang), ''])
      rows.push([t('ضريبة المخرجات في اليومية', 'GL Output VAT', lang), (autoCalc.glOutputVat ?? 0).toFixed(2)])
      rows.push([t('ضريبة المدخلات في اليومية', 'GL Input VAT', lang), (autoCalc.glInputVat ?? 0).toFixed(2)])
      rows.push([t('مطابقة اليومية', 'GL Match', lang), autoCalc.glMatch ? t('نعم', 'Yes', lang) : t('لا', 'No', lang)])
    }
    const csvContent = rows.map(row => row.map(c => typeof c === 'string' && c.includes(',') ? `"${c}"` : c).join(',')).join('\n')
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `VAT-${declaration.period}.csv`; link.click()
    URL.revokeObjectURL(url)
    toast.success(t('تم تصدير ملف CSV', 'CSV exported', lang))
  }, [declaration, autoCalc, lang, cfg])

  // تصدير Excel بصيغة CSV (يعمل في Excel مباشرة)
  const handleExportExcel = useCallback(() => {
    const rows: (string | number)[][] = [
      [t('إقرار ضريبة القيمة المضافة', 'VAT Return', lang), ''],
      [t('الفترة', 'Period', lang), declaration.period],
      [t('السنة', 'Year', lang), declaration.year],
      [t('الربع', 'Quarter', lang), cfg[lang]],
      [t('الحالة', 'Status', lang), declaration.status],
      ['', ''],
      [t('القسم الأول: ضريبة المخرجات', 'Section 1: Output VAT', lang), ''],
      [t('إجمالي المبيعات', 'Total Sales', lang), (declaration.totalSales ?? 0).toFixed(2)],
      [t('  مبيعات خاضعة 15%', '  Standard-rated sales (15%)', lang), (declaration.standardRatedSales ?? 0).toFixed(2)],
      [t('  مبيعات صفريه', '  Zero-rated sales', lang), (declaration.zeroRatedSales ?? 0).toFixed(2)],
      [t('  مبيعات معفاة', '  Exempt sales', lang), (declaration.exemptSales ?? 0).toFixed(2)],
      [t('ضريبة المخرجات', 'Output VAT', lang), (declaration.outputVat ?? 0).toFixed(2)],
      ['', ''],
      [t('القسم الثاني: ضريبة المدخلات', 'Section 2: Input VAT', lang), ''],
      [t('إجمالي المشتريات', 'Total Purchases', lang), (declaration.totalPurchases ?? 0).toFixed(2)],
      [t('  مشتريات خاضعة 15%', '  Standard-rated purchases (15%)', lang), (declaration.standardRatedPurchases ?? 0).toFixed(2)],
      [t('  مشتريات صفريه', '  Zero-rated purchases', lang), (declaration.zeroRatedPurchases ?? 0).toFixed(2)],
      [t('  مشتريات معفاة', '  Exempt purchases', lang), (declaration.exemptPurchases ?? 0).toFixed(2)],
      [t('ضريبة المدخلات', 'Input VAT', lang), (declaration.inputVat ?? 0).toFixed(2)],
      ['', ''],
      [t('القسم الثالث: صافي الضريبة', 'Section 3: Net VAT', lang), ''],
      [t('صافي الضريبة', 'Net VAT', lang), (declaration.netVat ?? 0).toFixed(2)],
      [t('النوع', 'Type', lang), declaration.netVat >= 0 ? t('مستحق للدفع', 'Payable', lang) : t('مسترد', 'Refundable', lang)],
    ]
    if (autoCalc) {
      rows.push(['', ''])
      rows.push([t('التحقق من دفتر اليومية', 'GL Verification', lang), ''])
      rows.push([t('ضريبة المخرجات في اليومية', 'GL Output VAT', lang), (autoCalc.glOutputVat ?? 0).toFixed(2)])
      rows.push([t('ضريبة المدخلات في اليومية', 'GL Input VAT', lang), (autoCalc.glInputVat ?? 0).toFixed(2)])
      rows.push([t('مطابقة', 'Match', lang), autoCalc.glMatch ? t('متطابقة', 'Matched', lang) : t('غير متطابقة', 'Mismatched', lang)])
    }
    if (breakdown) {
      rows.push(['', ''])
      rows.push([t('تفصيل البنود', 'Line Items', lang), ''])
      rows.push([t('النوع', 'Type', lang), t('المرجع', 'Ref', lang), t('التاريخ', 'Date', lang), t('الوصف', 'Description', lang), t('قبل الضريبة', 'Subtotal', lang), t('الضريبة', 'VAT', lang), t('الإجمالي', 'Total', lang)])
      const allLines = [
        ...breakdown.salesInvoices,
        ...breakdown.progressClaims,
        ...breakdown.purchaseInvoices,
        ...breakdown.subcontractorInvoices,
        ...breakdown.expenses,
      ]
      allLines.forEach(l => {
        rows.push([
          sourceTypeLabels[l.sourceType]?.[lang] || l.sourceType,
          l.ref, formatDate(l.date, lang), l.description,
          l.subtotal.toFixed(2), l.vatAmount.toFixed(2), l.total.toFixed(2),
        ])
      })
    }
    const csvContent = rows.map(row => row.map(c => typeof c === 'string' && c.includes(',') ? `"${c}"` : c).join(',')).join('\n')
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `VAT-${declaration.period}.xls`; link.click()
    URL.revokeObjectURL(url)
    toast.success(t('تم تصدير ملف Excel', 'Excel exported', lang))
  }, [declaration, autoCalc, breakdown, lang, cfg])

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
          {!isCancelled && (
            <PrintButton type="tax-declaration" documentId={declaration.id} size="sm" className="gap-1.5" />
          )}
          {!isCancelled && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportExcel}>
              <FileSpreadsheet className="size-4" />{t('Excel', 'Excel', lang)}
            </Button>
          )}
          {!isCancelled && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV}>
              <Download className="size-4" />{t('CSV', 'CSV', lang)}
            </Button>
          )}
          {isDraft && (
            <>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={() => onSubmit(declaration.id)} disabled={isSubmitting}>
                {isSubmitting ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
                {t('تقديم الإقرار', 'Submit Declaration', lang)}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50" onClick={() => onDelete(declaration.id)}>
                <Trash2 className="size-4" />{t('حذف', 'Delete', lang)}
              </Button>
            </>
          )}
          {isFiled && (
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 gap-1.5" onClick={() => setPayDialogOpen(true)}>
              <Wallet className="size-4" />{t('تسجيل الدفع', 'Record Payment', lang)}
            </Button>
          )}
          {canReverse && (
            <Button size="sm" variant="outline" className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50" onClick={() => setReverseDialogOpen(true)} disabled={isReversing}>
              {isReversing ? <RefreshCw className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
              {t('إلغاء وإعادة الإنشاء', 'Reverse & Recreate', lang)}
            </Button>
          )}
        </div>
      </div>

      {/* Cancelled banner */}
      {isCancelled && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-800">
              <XCircle className="size-5" />
              <div>
                <p className="font-bold">
                  {t('تم إلغاء هذا الإقرار', 'This return has been cancelled', lang)}
                </p>
                {declaration.cancelledReason && (
                  <p className="text-sm">{t('السبب', 'Reason', lang)}: {declaration.cancelledReason}</p>
                )}
                {declaration.cancelledAt && (
                  <p className="text-sm">{t('تاريخ الإلغاء', 'Cancelled at', lang)}: {formatDate(declaration.cancelledAt, lang)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Amendment banner */}
      {declaration.isAmendment && !isCancelled && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-amber-800 text-sm">
              <RotateCcw className="size-4" />
              <span>{t('هذا الإقرار تعديل لإقرار سابق تم إلغاؤه - الأرقام معاد احتسابها بالكامل', 'This is an amended return — figures have been fully recalculated', lang)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auto-calculated notice */}
      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
        <Percent className="size-4 shrink-0" />
        <span>{t('جميع الأرقام محسوبة تلقائياً من بيانات الفواتير الفعلية ومجمّدة عند التقديم. الأرقام تتطابق مع دفتر اليومية.', 'All figures are auto-calculated from actual invoice data, frozen upon filing, and match the general ledger.', lang)}</span>
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

      {/* GL Cross-check */}
      {autoCalc && (
        <Card className={`${autoCalc.glMatch ? 'border-emerald-300 bg-emerald-50/50' : 'border-red-300 bg-red-50/50'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              {autoCalc.glMatch ? (
                <ShieldCheck className="size-5 text-emerald-600" />
              ) : (
                <ShieldAlert className="size-5 text-red-600" />
              )}
              <h3 className={`font-bold ${autoCalc.glMatch ? 'text-emerald-800' : 'text-red-800'}`}>
                {t('التحقق من دفتر اليومية', 'General Ledger Verification', lang)}
              </h3>
              <Badge className={`${autoCalc.glMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} border-0`}>
                {autoCalc.glMatch ? t('متطابقة', 'Matched', lang) : t('غير متطابقة', 'Mismatched', lang)}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white rounded p-3 border">
                <p className="text-xs text-muted-foreground mb-1">{t('ضريبة المخرجات', 'Output VAT', lang)}</p>
                <div className="flex justify-between text-sm">
                  <span>{t('الإقرار', 'Return', lang)}:</span>
                  <MoneyDisplay value={declaration.outputVat} lang={lang} size="sm" bold />
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('اليومية', 'GL', lang)}:</span>
                  <MoneyDisplay value={autoCalc.glOutputVat} lang={lang} size="sm" />
                </div>
                <div className="flex justify-between text-sm pt-1 border-t mt-1">
                  <span className="text-muted-foreground">{t('الفرق', 'Diff', lang)}:</span>
                  <span className={`font-bold ${Math.abs(autoCalc.glDiffOutput) < 0.5 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {autoCalc.glDiffOutput.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="bg-white rounded p-3 border">
                <p className="text-xs text-muted-foreground mb-1">{t('ضريبة المدخلات', 'Input VAT', lang)}</p>
                <div className="flex justify-between text-sm">
                  <span>{t('الإقرار', 'Return', lang)}:</span>
                  <MoneyDisplay value={declaration.inputVat} lang={lang} size="sm" bold />
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('اليومية', 'GL', lang)}:</span>
                  <MoneyDisplay value={autoCalc.glInputVat} lang={lang} size="sm" />
                </div>
                <div className="flex justify-between text-sm pt-1 border-t mt-1">
                  <span className="text-muted-foreground">{t('الفرق', 'Diff', lang)}:</span>
                  <span className={`font-bold ${Math.abs(autoCalc.glDiffInput) < 0.5 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {autoCalc.glDiffInput.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* VAT Category Breakdown (ZATCA standard form) */}
      {categories && (declaration.standardRatedSales !== undefined) && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <FileText className="size-5 text-emerald-600" />
              {t('تصنيف الأرقام وفق معايير هيئة الزكاة والضريبة', 'ZATCA Standard Category Breakdown', lang)}
            </h3>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            {/* Output VAT categories */}
            <div>
              <p className="text-sm font-semibold text-emerald-700 mb-2">{t('القسم الأول: ضريبة المخرجات (المبيعات)', 'Section 1: Output VAT (Sales)', lang)}</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">#</TableHead>
                      <TableHead className="text-right text-xs">{t('الفئة', 'Category', lang)}</TableHead>
                      <TableHead className="text-right text-xs">{t('المبلغ', 'Amount', lang)}</TableHead>
                      <TableHead className="text-right text-xs">{t('الضريبة', 'VAT', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-mono text-xs">1</TableCell>
                      <TableCell className="text-sm">{t('مبيعات خاضعة 15%', 'Standard-rated sales (15%)', lang)}</TableCell>
                      <TableCell><MoneyDisplay value={declaration.standardRatedSales || 0} lang={lang} size="sm" /></TableCell>
                      <TableCell><MoneyDisplay value={declaration.standardRatedSalesVat || 0} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono text-xs">2</TableCell>
                      <TableCell className="text-sm">{t('مبيعات صفريه (صادرات)', 'Zero-rated sales', lang)}</TableCell>
                      <TableCell><MoneyDisplay value={declaration.zeroRatedSales || 0} lang={lang} size="sm" /></TableCell>
                      <TableCell className="text-muted-foreground text-xs">0.00</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono text-xs">3</TableCell>
                      <TableCell className="text-sm">{t('مبيعات معفاة', 'Exempt sales', lang)}</TableCell>
                      <TableCell><MoneyDisplay value={declaration.exemptSales || 0} lang={lang} size="sm" /></TableCell>
                      <TableCell className="text-muted-foreground text-xs">—</TableCell>
                    </TableRow>
                    <TableRow className="bg-emerald-50/50">
                      <TableCell className="font-mono text-xs font-bold">4-5</TableCell>
                      <TableCell className="text-sm font-bold">{t('الإجمالي', 'Total', lang)}</TableCell>
                      <TableCell><MoneyDisplay value={declaration.totalSales} lang={lang} size="sm" bold /></TableCell>
                      <TableCell><MoneyDisplay value={declaration.outputVat} lang={lang} size="sm" bold className="text-emerald-700" /></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Input VAT categories */}
            <div>
              <p className="text-sm font-semibold text-rose-700 mb-2">{t('القسم الثاني: ضريبة المدخلات (المشتريات)', 'Section 2: Input VAT (Purchases)', lang)}</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">#</TableHead>
                      <TableHead className="text-right text-xs">{t('الفئة', 'Category', lang)}</TableHead>
                      <TableHead className="text-right text-xs">{t('المبلغ', 'Amount', lang)}</TableHead>
                      <TableHead className="text-right text-xs">{t('الضريبة', 'VAT', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-mono text-xs">6</TableCell>
                      <TableCell className="text-sm">{t('مشتريات خاضعة 15%', 'Standard-rated purchases (15%)', lang)}</TableCell>
                      <TableCell><MoneyDisplay value={declaration.standardRatedPurchases || 0} lang={lang} size="sm" /></TableCell>
                      <TableCell><MoneyDisplay value={declaration.standardRatedPurchasesVat || 0} lang={lang} size="sm" className="text-rose-700" /></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono text-xs">7</TableCell>
                      <TableCell className="text-sm">{t('مشتريات صفريه', 'Zero-rated purchases', lang)}</TableCell>
                      <TableCell><MoneyDisplay value={declaration.zeroRatedPurchases || 0} lang={lang} size="sm" /></TableCell>
                      <TableCell className="text-muted-foreground text-xs">0.00</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono text-xs">8</TableCell>
                      <TableCell className="text-sm">{t('مشتريات معفاة', 'Exempt purchases', lang)}</TableCell>
                      <TableCell><MoneyDisplay value={declaration.exemptPurchases || 0} lang={lang} size="sm" /></TableCell>
                      <TableCell className="text-muted-foreground text-xs">—</TableCell>
                    </TableRow>
                    <TableRow className="bg-rose-50/50">
                      <TableCell className="font-mono text-xs font-bold">10-11</TableCell>
                      <TableCell className="text-sm font-bold">{t('الإجمالي', 'Total', lang)}</TableCell>
                      <TableCell><MoneyDisplay value={declaration.totalPurchases} lang={lang} size="sm" bold /></TableCell>
                      <TableCell><MoneyDisplay value={declaration.inputVat} lang={lang} size="sm" bold className="text-rose-700" /></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
      {(isFiled || isPaid) && declaration.filedDate && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileCheck className="size-5 text-emerald-600" />
              <span className="text-emerald-800 font-medium">{t('تم تقديم الإقرار في', 'Declaration submitted on', lang)}: {formatDate(declaration.filedDate, lang)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isPaid && declaration.paymentDate && (
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
          <SourceLinesCard title={t('فواتير المبيعات', 'Sales Invoices', lang)} icon={<Receipt className="size-4" />} color="emerald" lines={breakdown.salesInvoices} lang={lang} />
          {breakdown.progressClaims && breakdown.progressClaims.length > 0 && (
            <SourceLinesCard title={t('المستخلصات', 'Progress Claims', lang)} icon={<FileText className="size-4" />} color="emerald" lines={breakdown.progressClaims} lang={lang} />
          )}
          <SourceLinesCard title={t('فواتير المشتريات', 'Purchase Invoices', lang)} icon={<ShoppingBag className="size-4" />} color="rose" lines={breakdown.purchaseInvoices} lang={lang} />
          {breakdown.subcontractorInvoices && breakdown.subcontractorInvoices.length > 0 && (
            <SourceLinesCard title={t('فواتير مقاولي الباطن', 'Subcontractor Invoices', lang)} icon={<ShoppingBag className="size-4" />} color="orange" lines={breakdown.subcontractorInvoices} lang={lang} />
          )}
          <SourceLinesCard title={t('المصروفات الخاضعة للضريبة', 'Taxed Expenses', lang)} icon={<Receipt className="size-4" />} color="purple" lines={breakdown.expenses} lang={lang} />

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
            <DialogDescription>
              {t('سيتم إنشاء قيد محاسبي تلقائي بخصم حساب الضريبة المستحقة وإضافة البنك.', 'A journal entry will be created automatically debiting VAT Due and crediting Bank.', lang)}
            </DialogDescription>
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

      {/* Reverse Dialog */}
      <Dialog open={reverseDialogOpen} onOpenChange={setReverseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-800 flex items-center gap-2">
              <Undo2 className="size-5" />
              {t('إلغاء الإقرار وإعادة الإنشاء', 'Reverse & Recreate Declaration', lang)}
            </DialogTitle>
            <DialogDescription>
              {t('سيتم إلغاء هذا الإقرار وعكس قيوده المحاسبية. يمكنك بعدها إنشاء إقرار جديد للفترة لإعادة احتساب الأرصدة بالكامل.', 'This will cancel the return and reverse its journal entries. You can then create a new return for the same period to fully recalculate balances.', lang)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold mb-1">{t('تنبيه', 'Warning', lang)}</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>{t('سيتم عكس القيود المحاسبية المرتبطة بهذا الإقرار', 'Journal entries linked to this return will be reversed', lang)}</li>
                  <li>{t('سيتم تعليم الإقرار كملغي مع حفظ السبب', 'The return will be marked as cancelled with the reason saved', lang)}</li>
                  <li>{t('يمكنك إنشاء إقرار جديد لنفس الفترة بعدها', 'You can create a new return for the same period afterwards', lang)}</li>
                  <li>{t('الإقرار الملغي يبقى محفوظاً للمراجعة', 'The cancelled return is preserved for audit', lang)}</li>
                </ul>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('سبب الإلغاء', 'Cancellation Reason', lang)}</Label>
              <Textarea
                value={reverseReason}
                onChange={e => setReverseReason(e.target.value)}
                placeholder={t('مثال: تعديل الفواتير، تصحيح أرصدة، إلخ', 'Example: invoice corrections, balance adjustments, etc.', lang)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseDialogOpen(false)}>{t('إلغاء العملية', 'Cancel', lang)}</Button>
            <Button
              variant="outline"
              className="border-amber-500 text-amber-700 hover:bg-amber-50"
              onClick={() => { onReverse(declaration.id, reverseReason || t('إلغاء لإعادة الإنشاء', 'Cancelled for recreation', lang)); setReverseDialogOpen(false); setReverseReason('') }}
              disabled={isReversing || !reverseReason.trim()}
            >
              {isReversing ? <RefreshCw className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
              {t('تأكيد الإلغاء', 'Confirm Reversal', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ Source Lines Card (reusable) ============
function SourceLinesCard({ title, icon, color, lines, lang }: {
  title: string
  icon: React.ReactNode
  color: 'emerald' | 'rose' | 'orange' | 'purple'
  lines: SourceLine[]
  lang: 'ar' | 'en'
}) {
  if (!lines || lines.length === 0) return null
  const colorMap = {
    emerald: { text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700' },
    rose: { text: 'text-rose-800', badge: 'bg-rose-100 text-rose-700' },
    orange: { text: 'text-orange-800', badge: 'bg-orange-100 text-orange-700' },
    purple: { text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700' },
  }
  const c = colorMap[color]
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <h4 className={`font-semibold flex items-center gap-2 ${c.text}`}>
          {icon}{title}
          <Badge className={`${c.badge} border-0`}>{lines.length}</Badge>
        </h4>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right text-xs">{t('المرجع', 'Ref', lang)}</TableHead>
                <TableHead className="text-right text-xs">{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-right text-xs">{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead className="text-right text-xs">{t('الفئة', 'Category', lang)}</TableHead>
                <TableHead className="text-right text-xs">{t('قبل الضريبة', 'Subtotal', lang)}</TableHead>
                <TableHead className="text-right text-xs">{t('الضريبة', 'VAT', lang)}</TableHead>
                <TableHead className="text-right text-xs">{t('الإجمالي', 'Total', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(l => (
                <TableRow key={`${l.sourceType}-${l.id}`}>
                  <TableCell className="font-mono text-xs">{l.ref}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(l.date, lang)}</TableCell>
                  <TableCell className="text-xs">{l.description}</TableCell>
                  <TableCell>
                    <Badge className={`${categoryLabels[l.category]?.bg} ${categoryLabels[l.category]?.color} border-0 text-[10px]`}>
                      {categoryLabels[l.category]?.[lang] || l.category}
                    </Badge>
                  </TableCell>
                  <TableCell><MoneyDisplay value={l.subtotal} lang={lang} size="sm" /></TableCell>
                  <TableCell><MoneyDisplay value={l.vatAmount} lang={lang} size="sm" className={color === 'emerald' ? 'text-emerald-700' : color === 'rose' ? 'text-rose-700' : color === 'orange' ? 'text-orange-700' : 'text-purple-700'} /></TableCell>
                  <TableCell><MoneyDisplay value={l.total} lang={lang} size="sm" bold /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
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

  // Fetch the breakdown + autoCalc + categories for the selected declaration
  const { data: breakdownData } = useQuery<{
    declaration: VATDeclaration | null
    autoCalc: AutoCalc
    breakdown: DeclarationBreakdown
    categories: Categories
  }>({
    queryKey: ['vat-breakdown', selectedDeclaration?.id],
    queryFn: async () => {
      if (!selectedDeclaration) return {
        declaration: null,
        autoCalc: { outputVat: 0, inputVat: 0, netVat: 0, totalSales: 0, totalPurchases: 0, glOutputVat: 0, glInputVat: 0, glMatch: true, glDiffOutput: 0, glDiffInput: 0 },
        breakdown: { salesInvoices: [], progressClaims: [], purchaseInvoices: [], subcontractorInvoices: [], expenses: [] },
        categories: { standardRatedSales: 0, zeroRatedSales: 0, exemptSales: 0, standardRatedSalesVat: 0, standardRatedPurchases: 0, zeroRatedPurchases: 0, exemptPurchases: 0, importsSubjectToVAT: 0, standardRatedPurchasesVat: 0 },
      }
      const res = await fetch(`/api/vat?year=${selectedDeclaration.year}&quarter=${selectedDeclaration.quarter}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: viewState === 'detail' && !!selectedDeclaration,
  })

  // Submit (FILE) mutation
  const submitMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/vat', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'FILE' }) })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: (data: VATDeclaration) => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', selectedYear] })
      queryClient.invalidateQueries({ queryKey: ['vat-breakdown', selectedDeclaration?.id] })
      setSelectedDeclaration(data)
      toast.success(t('تم تقديم الإقرار الضريبي بنجاح وإنشاء قيد اليومية', 'VAT return filed successfully — journal entry created', lang))
    },
    onError: (err: Error) => toast.error(t('فشل في تقديم الإقرار: ', 'Failed to file: ', lang) + err.message),
  })

  // Pay mutation
  const payMutation = useMutation({
    mutationFn: (data: { id: string; reference: string }) =>
      fetch('/api/vat', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, action: 'PAY', paymentReference: data.reference }) })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: (data: VATDeclaration) => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', selectedYear] })
      queryClient.invalidateQueries({ queryKey: ['vat-breakdown', selectedDeclaration?.id] })
      setSelectedDeclaration(data)
      toast.success(t('تم تسجيل الدفع بنجاح وإنشاء قيد السداد', 'Payment recorded successfully — payment journal entry created', lang))
    },
    onError: (err: Error) => toast.error(t('فشل في تسجيل الدفع: ', 'Failed to record payment: ', lang) + err.message),
  })

  // Reverse mutation
  const reverseMutation = useMutation({
    mutationFn: (data: { id: string; reason: string }) =>
      fetch('/api/vat', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, action: 'REVERSE', reason: data.reason }) })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', selectedYear] })
      toast.success(t('تم إلغاء الإقرار بنجاح. يمكنك الآن إنشاء إقرار جديد للفترة.', 'Return reversed successfully. You can now create a new return for the same period.', lang))
      setViewState('list')
      setSelectedDeclaration(null)
    },
    onError: (err: Error) => toast.error(t('فشل في إلغاء الإقرار: ', 'Failed to reverse: ', lang) + err.message),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/vat?id=${id}`, { method: 'DELETE' })
        .then(async r => { if (!r.ok) { const err = await r.json(); throw new Error(err.error || 'Failed') } return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', selectedYear] })
      toast.success(t('تم حذف مسودة الإقرار بنجاح', 'Draft return deleted successfully', lang))
      setViewState('list')
      setSelectedDeclaration(null)
    },
    onError: (err: Error) => toast.error(t('فشل في الحذف: ', 'Failed to delete: ', lang) + err.message),
  })

  // Detail view
  if (viewState === 'detail' && selectedDeclaration) {
    return (
      <ModuleLayout title={{ ar: 'ضريبة القيمة المضافة', en: 'VAT' }} subtitle={{ ar: 'تفاصيل الإقرار الضريبي', en: 'Tax Declaration Details' }}>
        <DeclarationDetailView
          declaration={selectedDeclaration}
          breakdown={breakdownData?.breakdown || null}
          autoCalc={breakdownData?.autoCalc || null}
          categories={breakdownData?.categories || null}
          lang={lang}
          onBack={() => { setViewState('list'); setSelectedDeclaration(null) }}
          onSubmit={(id) => submitMutation.mutate(id)}
          onPay={(id, reference) => payMutation.mutate({ id, reference })}
          onReverse={(id, reason) => reverseMutation.mutate({ id, reason })}
          onDelete={(id) => deleteMutation.mutate(id)}
          isSubmitting={submitMutation.isPending}
          isReversing={reverseMutation.isPending}
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

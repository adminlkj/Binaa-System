'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Percent, RefreshCw, FileText, CheckCircle2, AlertCircle, CalendarDays,
  Printer, Download, ArrowRight, ArrowLeft, Eye, PlusCircle, Clock,
  Send, Receipt, ShoppingBag, FileCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useAppStore, formatDate } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'

// ============ Types ============
interface VATDeclaration {
  id: string
  period: string
  year: number
  quarter: number
  totalSales: number
  outputVat: number
  totalPurchases: number
  inputVat: number
  netVat: number
  status: string
  filedDate: string | null
  createdAt: string
  updatedAt: string
}

interface SalesInvoiceBreakdown {
  id: string
  invoiceNo: string
  date: string
  totalAmount: number
  vatAmount: number
  status: string
}

interface PurchaseInvoiceBreakdown {
  id: string
  invoiceNo: string
  date: string
  totalAmount: number
  vatAmount: number
  status: string
}

interface SubcontractorInvoiceBreakdown {
  id: string
  invoiceNo: string
  date: string
  totalAmount: number
  vatAmount: number
  status: string
}

interface ExpenseBreakdown {
  id: string
  description: string
  date: string
  amount: number
  vatAmount: number | null
  category: string
}

interface DeclarationBreakdown {
  salesInvoices: SalesInvoiceBreakdown[]
  purchaseInvoices: PurchaseInvoiceBreakdown[]
  subcontractorInvoices: SubcontractorInvoiceBreakdown[]
  expenses: ExpenseBreakdown[]
}

// ============ Bilingual Helper ============
function t(ar: string, en: string, lang: 'ar' | 'en') {
  return lang === 'ar' ? ar : en
}

// ============ Status Config ============
const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string; icon: React.ReactNode }> = {
  DRAFT: {
    label: { ar: 'مسودة', en: 'Draft' },
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    icon: <Clock className="size-3.5" />,
  },
  SUBMITTED: {
    label: { ar: 'مقدّم', en: 'Submitted' },
    color: 'text-emerald-700',
    bg: 'bg-emerald-100',
    icon: <CheckCircle2 className="size-3.5" />,
  },
  FILED: {
    label: { ar: 'مقدّم', en: 'Filed' },
    color: 'text-emerald-700',
    bg: 'bg-emerald-100',
    icon: <CheckCircle2 className="size-3.5" />,
  },
}

function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.DRAFT
  return (
    <Badge className={`${cfg.bg} ${cfg.color} border-0 gap-1`}>
      {cfg.icon}
      {cfg.label[lang]}
    </Badge>
  )
}

// ============ Quarter Config ============
const quarterConfig: Record<number, {
  ar: string; en: string;
  monthsAr: string; monthsEn: string;
  months: string[]
}> = {
  1: {
    ar: 'الربع الأول',
    en: 'Q1',
    monthsAr: 'يناير - مارس',
    monthsEn: 'January - March',
    months: ['Jan', 'Feb', 'Mar'],
  },
  2: {
    ar: 'الربع الثاني',
    en: 'Q2',
    monthsAr: 'أبريل - يونيو',
    monthsEn: 'April - June',
    months: ['Apr', 'May', 'Jun'],
  },
  3: {
    ar: 'الربع الثالث',
    en: 'Q3',
    monthsAr: 'يوليو - سبتمبر',
    monthsEn: 'July - September',
    months: ['Jul', 'Aug', 'Sep'],
  },
  4: {
    ar: 'الربع الرابع',
    en: 'Q4',
    monthsAr: 'أكتوبر - ديسمبر',
    monthsEn: 'October - December',
    months: ['Oct', 'Nov', 'Dec'],
  },
}

// ============ Skeleton ============
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
      </div>
      <div className="h-9 w-full animate-pulse rounded bg-gray-100" />
    </div>
  )
}

// ============ Quarter Card ============
function QuarterCard({
  quarter,
  year,
  declaration,
  lang,
  onCreate,
  onView,
  isCreating,
}: {
  quarter: number
  year: number
  declaration: VATDeclaration | undefined
  lang: 'ar' | 'en'
  onCreate: (year: number, quarter: number) => void
  onView: (declaration: VATDeclaration) => void
  isCreating: boolean
}) {
  const cfg = quarterConfig[quarter]
  const hasDeclaration = !!declaration
  const status = declaration?.status

  // Determine card border color based on status
  const borderColor = !hasDeclaration
    ? 'border-gray-200'
    : status === 'SUBMITTED' || status === 'FILED'
      ? 'border-emerald-300'
      : 'border-amber-300'

  const bgColor = !hasDeclaration
    ? 'bg-white'
    : status === 'SUBMITTED' || status === 'FILED'
      ? 'bg-emerald-50/30'
      : 'bg-amber-50/30'

  return (
    <Card className={`${borderColor} ${bgColor} transition-all hover:shadow-md`}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-gray-900 text-base">
              {cfg[lang]} - {year}
            </h3>
            <p className="text-sm text-muted-foreground">
              {lang === 'ar' ? cfg.monthsAr : cfg.monthsEn}
            </p>
          </div>
          <StatusBadge
            status={hasDeclaration ? status! : 'NONE'}
            lang={lang}
          />
        </div>

        {hasDeclaration ? (
          <>
            {/* Financial Summary */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t('إجمالي المبيعات', 'Total Sales', lang)}
                </span>
                <MoneyDisplay
                  value={declaration.totalSales}
                  lang={lang}
                  size="sm"
                  bold
                  className="text-emerald-700"
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t('ضريبة المخرجات', 'Output VAT', lang)}
                </span>
                <MoneyDisplay
                  value={declaration.outputVat}
                  lang={lang}
                  size="sm"
                  className="text-emerald-600"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t('إجمالي المشتريات', 'Total Purchases', lang)}
                </span>
                <MoneyDisplay
                  value={declaration.totalPurchases}
                  lang={lang}
                  size="sm"
                  bold
                  className="text-rose-700"
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t('ضريبة المدخلات', 'Input VAT', lang)}
                </span>
                <MoneyDisplay
                  value={declaration.inputVat}
                  lang={lang}
                  size="sm"
                  className="text-rose-600"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between pt-1">
                <span className="font-semibold text-sm">
                  {t('صافي الضريبة', 'Net VAT', lang)}
                </span>
                <MoneyDisplay
                  value={declaration.netVat}
                  lang={lang}
                  size="md"
                  bold
                  className={declaration.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={() => onView(declaration)}
              >
                <Eye className="size-4" />
                {t('عرض التفاصيل', 'View Details', lang)}
              </Button>
              {status === 'DRAFT' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => onView(declaration)}
                >
                  <Printer className="size-4" />
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* No Declaration */}
            <div className="flex flex-col items-center justify-center py-4 mb-3">
              <div className="size-12 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                <FileText className="size-6 text-gray-400" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {t('لم يتم إنشاء إقرار', 'No Declaration Created', lang)}
              </p>
            </div>

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              size="sm"
              onClick={() => onCreate(year, quarter)}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  {t('جاري الإنشاء...', 'Creating...', lang)}
                </>
              ) : (
                <>
                  <PlusCircle className="size-4" />
                  {t('إنشاء إقرار', 'Create Declaration', lang)}
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ============ NONE Status Badge (special case) ============
function StatusBadgeWithNone({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  if (status === 'NONE') {
    return (
      <Badge className="bg-gray-100 text-gray-500 border-0">
        {t('لا يوجد', 'None', lang)}
      </Badge>
    )
  }
  const cfg = statusConfig[status] || statusConfig.DRAFT
  return (
    <Badge className={`${cfg.bg} ${cfg.color} border-0 gap-1`}>
      {cfg.icon}
      {cfg.label[lang]}
    </Badge>
  )
}

// ============ Detail View ============
function DeclarationDetailView({
  declaration,
  breakdown,
  lang,
  onBack,
  onSubmit,
  onPrint,
  onExportCSV,
  isSubmitting,
}: {
  declaration: VATDeclaration
  breakdown: DeclarationBreakdown | null
  lang: 'ar' | 'en'
  onBack: () => void
  onSubmit: (id: string) => void
  onPrint: () => void
  onExportCSV: () => void
  isSubmitting: boolean
}) {
  const cfg = quarterConfig[declaration.quarter]
  const isDraft = declaration.status === 'DRAFT'
  const isSubmitted = declaration.status === 'SUBMITTED' || declaration.status === 'FILED'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-emerald-600">
            {lang === 'ar' ? <ArrowLeft className="size-5" /> : <ArrowRight className="size-5" />}
          </Button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {t('تفاصيل الإقرار الضريبي', 'Tax Declaration Details', lang)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {cfg[lang]} - {declaration.year} • {lang === 'ar' ? cfg.monthsAr : cfg.monthsEn}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadgeWithNone status={declaration.status} lang={lang} />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onPrint}
          >
            <Printer className="size-4" />
            {t('طباعة', 'Print', lang)}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onExportCSV}
          >
            <Download className="size-4" />
            {t('تصدير CSV', 'Export CSV', lang)}
          </Button>
          {isDraft && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              onClick={() => onSubmit(declaration.id)}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {t('تقديم الإقرار', 'Submit Declaration', lang)}
            </Button>
          )}
        </div>
      </div>

      {/* Period Info */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-5 text-emerald-600" />
              <span className="font-medium text-emerald-800">
                {t('الفترة الضريبية', 'Tax Period', lang)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-emerald-900 text-lg" dir="ltr">
                {declaration.period}
              </span>
              <span className="text-emerald-600 text-sm">
                {lang === 'ar' ? cfg.monthsAr : cfg.monthsEn}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* VAT Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Output VAT */}
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <Receipt className="size-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-700">
                  {t('ضريبة المخرجات', 'Output VAT', lang)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('محسوبة من فواتير المبيعات', 'Calculated from sales invoices', lang)}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('إجمالي المبيعات', 'Total Sales', lang)}</span>
                <MoneyDisplay value={declaration.totalSales} lang={lang} size="sm" bold className="text-emerald-700" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{t('ضريبة المخرجات', 'Output VAT', lang)}</span>
                <MoneyDisplay value={declaration.outputVat} lang={lang} size="lg" bold className="text-emerald-700" />
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
                <p className="text-sm font-medium text-rose-700">
                  {t('ضريبة المدخلات', 'Input VAT', lang)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('محسوبة من المشتريات والمصروفات', 'Calculated from purchases & expenses', lang)}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('إجمالي المشتريات', 'Total Purchases', lang)}</span>
                <MoneyDisplay value={declaration.totalPurchases} lang={lang} size="sm" bold className="text-rose-700" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{t('ضريبة المدخلات', 'Input VAT', lang)}</span>
                <MoneyDisplay value={declaration.inputVat} lang={lang} size="lg" bold className="text-rose-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Net VAT */}
        <Card className={`border-2 ${declaration.netVat >= 0 ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-white' : 'border-teal-300 bg-gradient-to-br from-teal-50 to-white'}`}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className={`size-8 rounded-full flex items-center justify-center ${declaration.netVat >= 0 ? 'bg-amber-100' : 'bg-teal-100'}`}>
                <Percent className={`size-4 ${declaration.netVat >= 0 ? 'text-amber-600' : 'text-teal-600'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${declaration.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'}`}>
                  {t('صافي الضريبة', 'Net VAT', lang)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {declaration.netVat >= 0
                    ? t('مبلغ مستحق للدفع', 'Amount payable', lang)
                    : t('مبلغ مسترد', 'Amount refundable', lang)}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t('المخرجات - المدخلات', 'Output - Input', lang)}
                </span>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {declaration.outputVat.toFixed(2)} - {declaration.inputVat.toFixed(2)}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-bold">{t('صافي الضريبة', 'Net VAT', lang)}</span>
                <MoneyDisplay
                  value={declaration.netVat}
                  lang={lang}
                  size="xl"
                  bold
                  className={declaration.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submission Info */}
      {isSubmitted && declaration.filedDate && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileCheck className="size-5 text-emerald-600" />
              <span className="text-emerald-800 font-medium">
                {t('تم تقديم الإقرار في', 'Declaration submitted on', lang)}:
              </span>
              <span className="font-bold text-emerald-900">
                {formatDate(declaration.filedDate, lang)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Breakdown Section */}
      {breakdown && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            {t('تفصيل الفواتير', 'Invoice Breakdown', lang)}
          </h3>

          {/* Sales Invoices Breakdown */}
          {breakdown.salesInvoices.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                  <Receipt className="size-4" />
                  {t('فواتير المبيعات', 'Sales Invoices', lang)}
                  <Badge className="bg-emerald-100 text-emerald-700 border-0">
                    {breakdown.salesInvoices.length}
                  </Badge>
                </h4>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                        <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                        <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                        <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {breakdown.salesInvoices.map((inv) => (
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

          {/* Purchase Invoices Breakdown */}
          {breakdown.purchaseInvoices.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <h4 className="font-semibold text-rose-800 flex items-center gap-2">
                  <ShoppingBag className="size-4" />
                  {t('فواتير المشتريات', 'Purchase Invoices', lang)}
                  <Badge className="bg-rose-100 text-rose-700 border-0">
                    {breakdown.purchaseInvoices.length}
                  </Badge>
                </h4>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                        <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                        <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                        <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {breakdown.purchaseInvoices.map((inv) => (
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

          {/* Subcontractor Invoices Breakdown */}
          {breakdown.subcontractorInvoices.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <h4 className="font-semibold text-orange-800 flex items-center gap-2">
                  <FileText className="size-4" />
                  {t('فواتير المقاولين', 'Subcontractor Invoices', lang)}
                  <Badge className="bg-orange-100 text-orange-700 border-0">
                    {breakdown.subcontractorInvoices.length}
                  </Badge>
                </h4>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                        <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                        <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                        <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {breakdown.subcontractorInvoices.map((inv) => (
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

          {/* Expenses Breakdown */}
          {breakdown.expenses.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <h4 className="font-semibold text-purple-800 flex items-center gap-2">
                  <Receipt className="size-4" />
                  {t('المصروفات الخاضعة للضريبة', 'Taxed Expenses', lang)}
                  <Badge className="bg-purple-100 text-purple-700 border-0">
                    {breakdown.expenses.length}
                  </Badge>
                </h4>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                        <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                        <TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead>
                        <TableHead className="text-right">{t('الضريبة', 'VAT', lang)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {breakdown.expenses.map((exp) => (
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

          {/* No breakdown data message */}
          {breakdown.salesInvoices.length === 0 &&
            breakdown.purchaseInvoices.length === 0 &&
            breakdown.subcontractorInvoices.length === 0 &&
            breakdown.expenses.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 flex flex-col items-center gap-3">
                <FileText className="size-12 text-gray-300" />
                <p className="text-muted-foreground text-center">
                  {t('لا توجد فواتير في هذه الفترة', 'No invoices in this period', lang)}
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  {t('جميع القيم محسوبة تلقائياً من بيانات الفواتير الفعلية', 'All values are auto-calculated from actual invoice data', lang)}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ============ Main VAT Module ============
export function VATModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const currentYear = new Date().getFullYear()

  // State
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [viewState, setViewState] = useState<'list' | 'detail'>('list')
  const [selectedDeclaration, setSelectedDeclaration] = useState<VATDeclaration | null>(null)
  const [creatingQuarter, setCreatingQuarter] = useState<number | null>(null)

  // Year options: current - 2 to current + 1
  const yearOptions = useMemo(() => {
    return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]
  }, [currentYear])

  // Fetch VAT returns for selected year
  const { data: vatReturns = [], isLoading, isError, refetch } = useQuery<VATDeclaration[]>({
    queryKey: ['vat-returns', selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/vat?year=${selectedYear}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Fetch breakdown for detail view
  const { data: breakdownData, isLoading: isLoadingBreakdown } = useQuery<{
    declaration: VATDeclaration | null
    breakdown: DeclarationBreakdown
  }>({
    queryKey: ['vat-breakdown', selectedDeclaration?.id],
    queryFn: async () => {
      if (!selectedDeclaration) return { declaration: null, breakdown: { salesInvoices: [], purchaseInvoices: [], subcontractorInvoices: [], expenses: [] } }
      const res = await fetch(`/api/vat?year=${selectedDeclaration.year}&quarter=${selectedDeclaration.quarter}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: viewState === 'detail' && !!selectedDeclaration,
  })

  // Create declaration mutation
  const createMutation = useMutation({
    mutationFn: (data: { year: number; quarter: number }) =>
      fetch('/api/vat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json()
          throw new Error(err.error || 'Failed')
        }
        return r.json()
      }),
    onSuccess: (data: VATDeclaration) => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', selectedYear] })
      setSelectedDeclaration(data)
      setViewState('detail')
      setCreatingQuarter(null)
    },
    onError: () => {
      setCreatingQuarter(null)
    },
  })

  // Submit declaration mutation
  const submitMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/vat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'SUBMIT' }),
      }).then(async r => {
        if (!r.ok) throw new Error()
        return r.json()
      }),
    onSuccess: (data: VATDeclaration) => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', selectedYear] })
      setSelectedDeclaration(data)
    },
  })

  // Handle create declaration
  const handleCreate = useCallback((year: number, quarter: number) => {
    setCreatingQuarter(quarter)
    createMutation.mutate({ year, quarter })
  }, [createMutation])

  // Handle view declaration
  const handleView = useCallback((declaration: VATDeclaration) => {
    setSelectedDeclaration(declaration)
    setViewState('detail')
  }, [])

  // Handle back
  const handleBack = useCallback(() => {
    setViewState('list')
    setSelectedDeclaration(null)
  }, [])

  // Handle submit
  const handleSubmit = useCallback((id: string) => {
    submitMutation.mutate(id)
  }, [submitMutation])

  // Handle print
  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  // Handle export CSV
  const handleExportCSV = useCallback(() => {
    if (!selectedDeclaration) return

    const dec = selectedDeclaration
    const rows = [
      [t('الحقل', 'Field', lang), t('القيمة', 'Value', lang)],
      [t('الفترة', 'Period', lang), dec.period],
      [t('السنة', 'Year', lang), String(dec.year)],
      [t('الربع', 'Quarter', lang), String(dec.quarter)],
      [t('الحالة', 'Status', lang), dec.status === 'DRAFT' ? t('مسودة', 'Draft', lang) : t('مقدّم', 'Submitted', lang)],
      [''],
      [t('إجمالي المبيعات', 'Total Sales', lang), dec.totalSales.toFixed(2)],
      [t('ضريبة المخرجات', 'Output VAT', lang), dec.outputVat.toFixed(2)],
      [t('إجمالي المشتريات', 'Total Purchases', lang), dec.totalPurchases.toFixed(2)],
      [t('ضريبة المدخلات', 'Input VAT', lang), dec.inputVat.toFixed(2)],
      [''],
      [t('صافي الضريبة', 'Net VAT', lang), dec.netVat.toFixed(2)],
    ]

    if (dec.filedDate) {
      rows.push([t('تاريخ التقديم', 'Submission Date', lang), formatDate(dec.filedDate, lang)])
    }

    // Add breakdown data
    if (breakdownData?.breakdown) {
      const bd = breakdownData.breakdown
      if (bd.salesInvoices.length > 0) {
        rows.push([''])
        rows.push([t('--- فواتير المبيعات ---', '--- Sales Invoices ---', lang)])
        rows.push([t('رقم الفاتورة', 'Invoice No', lang), t('التاريخ', 'Date', lang), t('الإجمالي', 'Total', lang), t('الضريبة', 'VAT', lang)])
        bd.salesInvoices.forEach(inv => {
          rows.push([inv.invoiceNo, formatDate(inv.date, 'en'), inv.totalAmount.toFixed(2), inv.vatAmount.toFixed(2)])
        })
      }
      if (bd.purchaseInvoices.length > 0) {
        rows.push([''])
        rows.push([t('--- فواتير المشتريات ---', '--- Purchase Invoices ---', lang)])
        rows.push([t('رقم الفاتورة', 'Invoice No', lang), t('التاريخ', 'Date', lang), t('الإجمالي', 'Total', lang), t('الضريبة', 'VAT', lang)])
        bd.purchaseInvoices.forEach(inv => {
          rows.push([inv.invoiceNo, formatDate(inv.date, 'en'), inv.totalAmount.toFixed(2), inv.vatAmount.toFixed(2)])
        })
      }
    }

    const csvContent = rows.map(row => row.join(',')).join('\n')
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `VAT-Declaration-${dec.period}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [selectedDeclaration, breakdownData, lang])

  // Map declarations by quarter for quick lookup
  const declarationsByQuarter = useMemo(() => {
    const map: Record<number, VATDeclaration> = {}
    vatReturns.forEach((v: VATDeclaration) => {
      if (v.quarter >= 1 && v.quarter <= 4) {
        map[v.quarter] = v
      }
    })
    return map
  }, [vatReturns])

  // Summary calculations
  const yearSummary = useMemo(() => {
    return vatReturns.reduce(
      (acc, v) => ({
        totalSales: acc.totalSales + v.totalSales,
        outputVat: acc.outputVat + v.outputVat,
        totalPurchases: acc.totalPurchases + v.totalPurchases,
        inputVat: acc.inputVat + v.inputVat,
        netVat: acc.netVat + v.netVat,
      }),
      { totalSales: 0, outputVat: 0, totalPurchases: 0, inputVat: 0, netVat: 0 }
    )
  }, [vatReturns])

  // ================== RENDER ==================

  // Detail View
  if (viewState === 'detail' && selectedDeclaration) {
    return (
      <DeclarationDetailView
        declaration={selectedDeclaration}
        breakdown={breakdownData?.breakdown || null}
        lang={lang}
        onBack={handleBack}
        onSubmit={handleSubmit}
        onPrint={handlePrint}
        onExportCSV={handleExportCSV}
        isSubmitting={submitMutation.isPending}
      />
    )
  }

  // List View (Year → Quarters)
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('الإقرار الضريبي', 'Tax Declaration', lang)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('إدارة إقرارات ضريبة القيمة المضافة', 'Manage VAT declarations', lang)}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Year Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Receipt className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{t('ضريبة المخرجات', 'Output VAT', lang)}</p>
              <MoneyDisplay value={yearSummary.outputVat} lang={lang} size="lg" bold className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-rose-100 flex items-center justify-center">
              <ShoppingBag className="size-5 text-rose-600" />
            </div>
            <div>
              <p className="text-sm text-rose-600">{t('ضريبة المدخلات', 'Input VAT', lang)}</p>
              <MoneyDisplay value={yearSummary.inputVat} lang={lang} size="lg" bold className="text-rose-700" />
            </div>
          </CardContent>
        </Card>
        <Card className={yearSummary.netVat >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`size-10 rounded-full flex items-center justify-center ${yearSummary.netVat >= 0 ? 'bg-amber-100' : 'bg-teal-100'}`}>
              <Percent className={`size-5 ${yearSummary.netVat >= 0 ? 'text-amber-600' : 'text-teal-600'}`} />
            </div>
            <div>
              <p className={`text-sm ${yearSummary.netVat >= 0 ? 'text-amber-600' : 'text-teal-600'}`}>
                {t('صافي الضريبة', 'Net VAT', lang)}
              </p>
              <MoneyDisplay
                value={yearSummary.netVat}
                lang={lang}
                size="lg"
                bold
                className={yearSummary.netVat >= 0 ? 'text-amber-700' : 'text-teal-700'}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Year Selector */}
      <Card className="border-emerald-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="size-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {t('اختر السنة', 'Select Year', lang)}
            </h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            {yearOptions.map(y => (
              <Button
                key={y}
                variant={selectedYear === y ? 'default' : 'outline'}
                className={selectedYear === y
                  ? 'bg-emerald-600 hover:bg-emerald-700 min-w-[80px]'
                  : 'min-w-[80px] border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                }
                onClick={() => setSelectedYear(y)}
              >
                {y}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quarter Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <AlertCircle className="size-12 text-rose-400" />
          <p className="text-rose-600">{t('حدث خطأ في تحميل البيانات', 'Error loading data', lang)}</p>
          <Button variant="outline" onClick={() => refetch()}>
            {t('إعادة المحاولة', 'Retry', lang)}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(quarter => (
            <QuarterCard
              key={quarter}
              quarter={quarter}
              year={selectedYear}
              declaration={declarationsByQuarter[quarter]}
              lang={lang}
              onCreate={handleCreate}
              onView={handleView}
              isCreating={creatingQuarter === quarter}
            />
          ))}
        </div>
      )}

      {/* Error message for create mutation */}
      {createMutation.isError && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-5 text-rose-600" />
              <p className="text-sm text-rose-700">
                {createMutation.error?.message || t('حدث خطأ في إنشاء الإقرار', 'Error creating declaration', lang)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auto-calculated notice */}
      <Card className="border-dashed border-gray-300 bg-gray-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="size-5 text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-700">
                {t('جميع القيم محسوبة تلقائياً', 'All values are auto-calculated', lang)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  'يتم حساب ضريبة القيمة المضافة تلقائياً من فواتير المبيعات والمشتريات والمصروفات الفعلية. لا يمكن تعديل المبالغ يدوياً.',
                  'VAT is automatically calculated from actual sales invoices, purchase invoices, and expenses. Amounts cannot be manually edited.',
                  lang
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

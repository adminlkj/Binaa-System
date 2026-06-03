'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Percent, RefreshCw, FileText, CheckCircle2, AlertCircle, CalendarDays,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAppStore, formatDate } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'

// ============ Types ============
interface VATReturn {
  id: string; period: string; salesVAT: number; purchaseVAT: number
  netVAT: number; status: string; filedDate: string | null; createdAt: string; updatedAt: string
}

// ============ Status Config ============
const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-amber-700', bg: 'bg-amber-100' },
  FILED: { label: { ar: 'مقدّم', en: 'Filed' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
}

function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

// ============ Quarter Config ============
const quarterLabels: Record<number, { ar: string; en: string }> = {
  1: { ar: 'الربع الأول', en: 'Q1' },
  2: { ar: 'الربع الثاني', en: 'Q2' },
  3: { ar: 'الربع الثالث', en: 'Q3' },
  4: { ar: 'الربع الرابع', en: 'Q4' },
}

function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Main VAT Module ============
export function VATModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()))
  const [selectedQuarter, setSelectedQuarter] = useState<string>('')
  const [selectedDeclaration, setSelectedDeclaration] = useState<VATReturn | null>(null)

  // Generate year options (current year and previous 2 years)
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return [currentYear, currentYear - 1, currentYear - 2]
  }, [])

  // Fetch VAT returns
  const { data: vatReturns = [], isLoading, isError, refetch } = useQuery<VATReturn[]>({
    queryKey: ['vat-returns'],
    queryFn: async () => {
      const res = await fetch('/api/vat')
      if (!res.ok) throw new Error()
      return res.json()
    },
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
    onSuccess: (data: VATReturn) => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] })
      setSelectedDeclaration(data)
      setSelectedQuarter('')
    },
  })

  // File declaration mutation
  const fileMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/vat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'FILE' }),
      }).then(async r => {
        if (!r.ok) throw new Error()
        return r.json()
      }),
    onSuccess: (data: VATReturn) => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] })
      setSelectedDeclaration(data)
    },
  })

  // Handle create declaration
  const handleCreate = () => {
    if (!selectedYear || !selectedQuarter) return
    createMutation.mutate({
      year: parseInt(selectedYear),
      quarter: parseInt(selectedQuarter),
    })
  }

  // Summary
  const totalSalesVAT = vatReturns.reduce((s, v) => s + v.salesVAT, 0)
  const totalPurchaseVAT = vatReturns.reduce((s, v) => s + v.purchaseVAT, 0)
  const totalNetVAT = vatReturns.reduce((s, v) => s + v.netVAT, 0)

  // Previous declarations (FILED)
  const filedDeclarations = vatReturns.filter(v => v.status === 'FILED')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'ar' ? 'الإقرار الضريبي' : 'Tax Declaration'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === 'ar' ? 'إدارة إقرارات ضريبة القيمة المضافة' : 'Manage VAT declarations'}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Percent className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{lang === 'ar' ? 'ضريبة المبيعات' : 'Sales VAT'}</p>
              <MoneyDisplay value={totalSalesVAT} lang={lang} size="lg" bold className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-rose-100 flex items-center justify-center">
              <Percent className="size-5 text-rose-600" />
            </div>
            <div>
              <p className="text-sm text-rose-600">{lang === 'ar' ? 'ضريبة المشتريات' : 'Purchase VAT'}</p>
              <MoneyDisplay value={totalPurchaseVAT} lang={lang} size="lg" bold className="text-rose-700" />
            </div>
          </CardContent>
        </Card>
        <Card className={totalNetVAT >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`size-10 rounded-full flex items-center justify-center ${totalNetVAT >= 0 ? 'bg-amber-100' : 'bg-teal-100'}`}>
              <Percent className={`size-5 ${totalNetVAT >= 0 ? 'text-amber-600' : 'text-teal-600'}`} />
            </div>
            <div>
              <p className={`text-sm ${totalNetVAT >= 0 ? 'text-amber-600' : 'text-teal-600'}`}>
                {lang === 'ar' ? 'صافي الضريبة' : 'Net VAT'}
              </p>
              <MoneyDisplay value={totalNetVAT} lang={lang} size="lg" bold className={totalNetVAT >= 0 ? 'text-amber-700' : 'text-teal-700'} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Creation Section */}
      <Card className="border-emerald-200">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CalendarDays className="size-5 text-emerald-600" />
            {lang === 'ar' ? 'إنشاء إقرار جديد' : 'Create New Declaration'}
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-2 flex-1 min-w-[140px]">
              <Label className="text-sm font-medium">
                {lang === 'ar' ? 'السنة' : 'Year'}
              </Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder={lang === 'ar' ? 'اختر السنة' : 'Select year'} />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => (
                    <SelectItem key={y} value={String(y)}>{String(y)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label className="text-sm font-medium">
                {lang === 'ar' ? 'الربع' : 'Quarter'}
              </Label>
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger>
                  <SelectValue placeholder={lang === 'ar' ? 'اختر الربع' : 'Select quarter'} />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map(q => (
                    <SelectItem key={q} value={String(q)}>
                      {quarterLabels[q][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 min-w-[180px]"
              onClick={handleCreate}
              disabled={createMutation.isPending || !selectedYear || !selectedQuarter}
            >
              {createMutation.isPending
                ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...')
                : (lang === 'ar' ? 'إنشاء الإقرار' : 'Create Declaration')
              }
            </Button>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-rose-600 mt-2 flex items-center gap-1">
              <AlertCircle className="size-4" />
              {createMutation.error?.message || (lang === 'ar' ? 'حدث خطأ' : 'An error occurred')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Declaration Display */}
      {selectedDeclaration && (
        <Card className="border-2 border-emerald-300 shadow-md">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="size-5 text-emerald-600" />
                {lang === 'ar' ? 'تفاصيل الإقرار' : 'Declaration Details'}
              </h2>
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedDeclaration.status} lang={lang} />
                {selectedDeclaration.status === 'DRAFT' && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                    onClick={() => fileMutation.mutate(selectedDeclaration.id)}
                    disabled={fileMutation.isPending}
                  >
                    <CheckCircle2 className="size-4" />
                    {lang === 'ar' ? 'تقديم الإقرار' : 'File Declaration'}
                  </Button>
                )}
              </div>
            </div>

            {/* Period */}
            <div className="bg-emerald-50 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-emerald-600 font-medium">
                  {lang === 'ar' ? 'الفترة' : 'Period'}
                </span>
                <span className="text-lg font-bold text-emerald-800" dir="ltr">
                  {selectedDeclaration.period}
                </span>
              </div>
            </div>

            <Separator className="mb-4" />

            {/* VAT Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Sales VAT */}
              <div className="bg-emerald-50 rounded-lg p-4 text-center">
                <p className="text-sm text-emerald-600 mb-1">
                  {lang === 'ar' ? 'ضريبة المبيعات' : 'Sales VAT'}
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  {lang === 'ar' ? '(محسوبة تلقائياً من الفواتير)' : '(Auto-calculated from invoices)'}
                </p>
                <MoneyDisplay value={selectedDeclaration.salesVAT} lang={lang} size="xl" bold className="text-emerald-700" />
              </div>

              {/* Purchase VAT */}
              <div className="bg-rose-50 rounded-lg p-4 text-center">
                <p className="text-sm text-rose-600 mb-1">
                  {lang === 'ar' ? 'ضريبة المشتريات' : 'Purchase VAT'}
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  {lang === 'ar' ? '(محسوبة تلقائياً من المشتريات والمصروفات)' : '(Auto-calculated from purchases & expenses)'}
                </p>
                <MoneyDisplay value={selectedDeclaration.purchaseVAT} lang={lang} size="xl" bold className="text-rose-700" />
              </div>

              {/* Net VAT */}
              <div className={`rounded-lg p-4 text-center ${selectedDeclaration.netVAT >= 0 ? 'bg-amber-50' : 'bg-teal-50'}`}>
                <p className={`text-sm mb-1 ${selectedDeclaration.netVAT >= 0 ? 'text-amber-600' : 'text-teal-600'}`}>
                  {lang === 'ar' ? 'صافي الضريبة' : 'Net VAT'}
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  {selectedDeclaration.netVAT >= 0
                    ? (lang === 'ar' ? '(مبلغ مستحق للدفع)' : '(Amount payable)')
                    : (lang === 'ar' ? '(مبلغ مسترد)' : '(Amount refundable)')
                  }
                </p>
                <MoneyDisplay
                  value={selectedDeclaration.netVAT}
                  lang={lang}
                  size="xl"
                  bold
                  className={selectedDeclaration.netVAT >= 0 ? 'text-amber-700' : 'text-teal-700'}
                />
              </div>
            </div>

            {/* Filed Date */}
            {selectedDeclaration.filedDate && (
              <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">
                <CheckCircle2 className="size-4" />
                <span>
                  {lang === 'ar' ? 'تاريخ التقديم:' : 'Filed date:'}{' '}
                  {formatDate(selectedDeclaration.filedDate, lang)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Previous Declarations Table */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            {lang === 'ar' ? 'الإقرارات السابقة' : 'Previous Declarations'}
          </h2>

          {isLoading ? (
            <TableSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}</p>
              <Button variant="outline" onClick={() => refetch()}>
                {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
              </Button>
            </div>
          ) : vatReturns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Percent className="size-12 text-gray-300" />
              <p className="text-muted-foreground">
                {lang === 'ar' ? 'لا توجد إقرارات ضريبية' : 'No VAT declarations'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'الفترة' : 'Period'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'ضريبة المبيعات' : 'Sales VAT'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'ضريبة المشتريات' : 'Purchase VAT'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'صافي الضريبة' : 'Net VAT'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'تاريخ التقديم' : 'Filed Date'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'عرض' : 'View'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vatReturns.map(v => (
                    <TableRow
                      key={v.id}
                      className={`cursor-pointer hover:bg-emerald-50/50 ${selectedDeclaration?.id === v.id ? 'bg-emerald-50' : ''}`}
                      onClick={() => setSelectedDeclaration(v)}
                    >
                      <TableCell className="font-mono font-medium">{v.period}</TableCell>
                      <TableCell>
                        <MoneyDisplay value={v.salesVAT} lang={lang} size="sm" className="text-emerald-700" />
                      </TableCell>
                      <TableCell>
                        <MoneyDisplay value={v.purchaseVAT} lang={lang} size="sm" className="text-rose-700" />
                      </TableCell>
                      <TableCell>
                        <MoneyDisplay
                          value={v.netVAT}
                          lang={lang}
                          size="sm"
                          bold
                          className={v.netVAT >= 0 ? 'text-amber-700' : 'text-teal-700'}
                        />
                      </TableCell>
                      <TableCell><StatusBadge status={v.status} lang={lang} /></TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {v.filedDate ? formatDate(v.filedDate, lang) : '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-emerald-600"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedDeclaration(v)
                          }}
                        >
                          {lang === 'ar' ? 'عرض' : 'View'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

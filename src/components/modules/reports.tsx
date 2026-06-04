'use client'

import React, { useState, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, FileText, Receipt, TrendingUp, ShoppingCart,
  Package, Scale, PieChart, Eye, ArrowRight, Truck,
  Printer, Download, CreditCard, TrendingDown, Wrench,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore, formatNumber } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

type ReportType = 'project-card' | 'projects' | 'claims' | 'expenses' | 'sales' | 'purchases' | 'inventory' | 'balance-sheet' | 'income-statement'

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

interface ReportGroup {
  key: string; label: { ar: string; en: string }; reports: { type: ReportType; icon: React.ElementType; title: { ar: string; en: string }; description: { ar: string; en: string }; color: string; bgColor: string; iconColor: string }[]
}

const reportGroups: ReportGroup[] = [
  {
    key: 'projects', label: { ar: 'تقارير المشاريع', en: 'Project Reports' },
    reports: [
      { type: 'project-card', icon: CreditCard, title: { ar: 'كارت المشروع', en: 'Project Card' }, description: { ar: 'ملخص مالي شامل لكل مشروع', en: 'Comprehensive financial summary per project' }, color: 'border-emerald-400', bgColor: 'bg-emerald-50', iconColor: 'text-emerald-700' },
      { type: 'projects', icon: BarChart3, title: { ar: 'تقرير المشاريع', en: 'Project Report' }, description: { ar: 'ملخص تكاليف وأرباح المشاريع', en: 'Project costs and profit summary' }, color: 'border-emerald-300', bgColor: 'bg-emerald-50', iconColor: 'text-emerald-600' },
      { type: 'claims', icon: FileText, title: { ar: 'تقرير المستخلصات', en: 'Claims Report' }, description: { ar: 'حالة المستخلصات والتحصيلات', en: 'Claims status and collections' }, color: 'border-teal-300', bgColor: 'bg-teal-50', iconColor: 'text-teal-600' },
    ]
  },
  {
    key: 'financial', label: { ar: 'التقارير المالية', en: 'Financial Reports' },
    reports: [
      { type: 'expenses', icon: Receipt, title: { ar: 'تقرير المصروفات', en: 'Expenses Report' }, description: { ar: 'تفصيل المصروفات حسب الفئة', en: 'Expenses breakdown by category' }, color: 'border-orange-300', bgColor: 'bg-orange-50', iconColor: 'text-orange-600' },
      { type: 'sales', icon: TrendingUp, title: { ar: 'تقرير المبيعات', en: 'Sales Report' }, description: { ar: 'ملخص المبيعات والتحصيلات', en: 'Sales and collections summary' }, color: 'border-cyan-300', bgColor: 'bg-cyan-50', iconColor: 'text-cyan-600' },
      { type: 'purchases', icon: ShoppingCart, title: { ar: 'تقرير المشتريات', en: 'Purchases Report' }, description: { ar: 'ملخص المشتريات والمستحقات', en: 'Purchases and payables summary' }, color: 'border-amber-300', bgColor: 'bg-amber-50', iconColor: 'text-amber-600' },
      { type: 'balance-sheet', icon: Scale, title: { ar: 'الميزانية العمومية', en: 'Balance Sheet' }, description: { ar: 'الأصول والالتزامات وحقوق الملكية', en: 'Assets, liabilities, and equity' }, color: 'border-rose-300', bgColor: 'bg-rose-50', iconColor: 'text-rose-600' },
      { type: 'income-statement', icon: PieChart, title: { ar: 'قائمة الدخل', en: 'Income Statement' }, description: { ar: 'الإيرادات والمصروفات وصافي الربح', en: 'Revenue, expenses, and net income' }, color: 'border-green-300', bgColor: 'bg-green-50', iconColor: 'text-green-600' },
    ]
  },
  {
    key: 'equipment', label: { ar: 'تقارير المعدات', en: 'Equipment Reports' },
    reports: [
      { type: 'inventory', icon: Package, title: { ar: 'تقرير المخزون', en: 'Inventory Report' }, description: { ar: 'مستويات المخزون والأصناف المنخفضة', en: 'Stock levels and low items' }, color: 'border-purple-300', bgColor: 'bg-purple-50', iconColor: 'text-purple-600' },
    ]
  },
]

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-24 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

function usePrintReport() {
  const printRef = useRef<HTMLDivElement>(null)
  const handlePrint = useCallback(() => { window.print() }, [])
  return { printRef, handlePrint }
}

// ============ Report View ============
function ReportView({ type, onBack }: { type: ReportType; onBack: () => void }) {
  const { lang } = useAppStore()
  const { printRef, handlePrint } = usePrintReport()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['report', type],
    queryFn: async () => {
      const res = await fetch(`/api/reports?type=${type}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Find the report card config
  const reportCard = reportGroups.flatMap(g => g.reports).find(r => r.type === type)!
  const Icon = reportCard.icon

  const handleExport = useCallback(() => {
    if (!data) return
    const columns: CSVColumn[] = [{ key: 'key', label: t('الحقل', 'Field', lang) }, { key: 'value', label: t('القيمة', 'Value', lang) }]
    const rows = Array.isArray(data) ? data.map((item: Record<string, unknown>, i: number) => ({ key: String(i), value: JSON.stringify(item) })) : [{ key: 'report', value: JSON.stringify(data) }]
    exportToCSV(rows, `report-${type}-${new Date().toISOString().slice(0, 10)}`, columns)
  }, [data, type, lang])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
          <div className={`size-10 rounded-full ${reportCard.bgColor} flex items-center justify-center`}><Icon className={`size-5 ${reportCard.iconColor}`} /></div>
          <div><h2 className="text-xl font-bold">{reportCard.title[lang]}</h2><p className="text-sm text-muted-foreground">{reportCard.description[lang]}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}><Eye className="size-4" /></Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}><Printer className="size-4" />{t('طباعة', 'Print', lang)}</Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}><Download className="size-4" />{t('تصدير CSV', 'Export CSV', lang)}</Button>
        </div>
      </div>

      <div ref={printRef}>
        {isLoading ? (<Card><CardContent className="p-6"><TableSkeleton /></CardContent></Card>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : !data ? null : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {type === 'projects' && (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                      <TableHead className="text-right">{t('العميل', 'Client', lang)}</TableHead>
                      <TableHead className="text-right">{t('قيمة العقد', 'Contract Value', lang)}</TableHead>
                      <TableHead className="text-right">{t('التكاليف', 'Costs', lang)}</TableHead>
                      <TableHead className="text-right">{t('الإيرادات', 'Revenue', lang)}</TableHead>
                      <TableHead className="text-right">{t('الربح', 'Profit', lang)}</TableHead>
                      <TableHead className="text-right">{t('الهامش', 'Margin', lang)}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {(data as { code: string; name: string; client: string; contractValue: number; totalCosts: number; totalRevenue: number; profit: number; margin: number }[]).map((p, i) => (
                        <TableRow key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-muted-foreground">{p.client}</TableCell>
                          <TableCell><MoneyDisplay value={p.contractValue} lang={lang} size="sm" inline /></TableCell>
                          <TableCell className="text-rose-700"><MoneyDisplay value={p.totalCosts} lang={lang} size="sm" inline /></TableCell>
                          <TableCell className="text-emerald-700"><MoneyDisplay value={p.totalRevenue} lang={lang} size="sm" inline /></TableCell>
                          <TableCell className={p.profit >= 0 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}><MoneyDisplay value={p.profit} lang={lang} size="sm" bold inline /></TableCell>
                          <TableCell><Badge variant="outline" className={p.margin >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>{formatNumber(p.margin)}%</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {type === 'expenses' && (() => {
                  const expData = data as { expenses: { date: string; description: string; category: string; amount: number; project: { name: string } | null }[]; totalExpenses: number; byCategory: Record<string, number> }
                  return (
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-4 text-center"><p className="text-sm text-emerald-600">{t('إجمالي المصروفات', 'Total Expenses', lang)}</p><MoneyDisplay value={expData.totalExpenses} lang={lang} size="lg" bold inline /></CardContent></Card>
                        <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4 text-center"><p className="text-sm text-amber-600">{t('عدد الفئات', 'Categories', lang)}</p><p className="text-xl font-bold text-amber-700">{formatNumber(Object.keys(expData.byCategory).length)}</p></CardContent></Card>
                        <Card className="bg-teal-50 border-teal-200"><CardContent className="p-4 text-center"><p className="text-sm text-teal-600">{t('عدد المعاملات', 'Transactions', lang)}</p><p className="text-xl font-bold text-teal-700">{formatNumber(expData.expenses.length)}</p></CardContent></Card>
                      </div>
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                          <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                          <TableHead className="text-right">{t('الفئة', 'Category', lang)}</TableHead>
                          <TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead>
                          <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {expData.expenses.map((e: { date: string; description: string; category: string; amount: number; project: { name: string } | null }, i: number) => (
                            <TableRow key={i}><TableCell className="text-sm">{new Date(e.date).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}</TableCell><TableCell>{e.description}</TableCell><TableCell><Badge variant="outline">{e.category}</Badge></TableCell><TableCell><MoneyDisplay value={e.amount} lang={lang} size="sm" inline /></TableCell><TableCell>{e.project?.name || t('بدون مشروع', 'No Project', lang)}</TableCell></TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                })()}
                {type === 'sales' && (() => {
                  const salesData = data as { invoices: { invoiceNo: string; date: string; client: { name: string }; totalAmount: number; paidAmount: number; status: string }[]; totalSales: number; totalPaid: number; totalOutstanding: number }
                  return (
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-4 text-center"><p className="text-sm text-emerald-600">{t('إجمالي المبيعات', 'Total Sales', lang)}</p><MoneyDisplay value={salesData.totalSales} lang={lang} size="lg" bold inline /></CardContent></Card>
                        <Card className="bg-teal-50 border-teal-200"><CardContent className="p-4 text-center"><p className="text-sm text-teal-600">{t('المحصل', 'Collected', lang)}</p><MoneyDisplay value={salesData.totalPaid} lang={lang} size="lg" bold inline /></CardContent></Card>
                        <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4 text-center"><p className="text-sm text-amber-600">{t('المستحق', 'Outstanding', lang)}</p><MoneyDisplay value={salesData.totalOutstanding} lang={lang} size="lg" bold inline /></CardContent></Card>
                      </div>
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                          <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                          <TableHead className="text-right">{t('العميل', 'Client', lang)}</TableHead>
                          <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                          <TableHead className="text-right">{t('المدفوع', 'Paid', lang)}</TableHead>
                          <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {salesData.invoices.map((inv, i) => (
                            <TableRow key={i}><TableCell className="font-mono">{inv.invoiceNo}</TableCell><TableCell>{new Date(inv.date).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}</TableCell><TableCell>{inv.client.name}</TableCell><TableCell><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" inline /></TableCell><TableCell><MoneyDisplay value={inv.paidAmount} lang={lang} size="sm" inline /></TableCell><TableCell><Badge variant="outline">{inv.status}</Badge></TableCell></TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                })()}
                {type === 'purchases' && (() => {
                  const purchData = data as { purchaseInvoices: { invoiceNo: string; date: string; supplier: { name: string }; totalAmount: number; paidAmount: number; status: string }[]; totalPIs: number; totalPaid: number; totalOutstanding: number }
                  return (
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4 text-center"><p className="text-sm text-amber-600">{t('إجمالي المشتريات', 'Total Purchases', lang)}</p><MoneyDisplay value={purchData.totalPIs} lang={lang} size="lg" bold inline /></CardContent></Card>
                        <Card className="bg-teal-50 border-teal-200"><CardContent className="p-4 text-center"><p className="text-sm text-teal-600">{t('المدفوع', 'Paid', lang)}</p><MoneyDisplay value={purchData.totalPaid} lang={lang} size="lg" bold inline /></CardContent></Card>
                        <Card className="bg-rose-50 border-rose-200"><CardContent className="p-4 text-center"><p className="text-sm text-rose-600">{t('المستحق', 'Outstanding', lang)}</p><MoneyDisplay value={purchData.totalOutstanding} lang={lang} size="lg" bold inline /></CardContent></Card>
                      </div>
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                          <TableHead className="text-right">{t('المورد', 'Supplier', lang)}</TableHead>
                          <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                          <TableHead className="text-right">{t('المدفوع', 'Paid', lang)}</TableHead>
                          <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {purchData.purchaseInvoices.map((inv, i) => (
                            <TableRow key={i}><TableCell className="font-mono">{inv.invoiceNo}</TableCell><TableCell>{inv.supplier.name}</TableCell><TableCell><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" inline /></TableCell><TableCell><MoneyDisplay value={inv.paidAmount} lang={lang} size="sm" inline /></TableCell><TableCell><Badge variant="outline">{inv.status}</Badge></TableCell></TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                })()}
                {type === 'inventory' && (() => {
                  const invData = data as { items: { code: string; name: string; unit: string; quantity: number; unitPrice: number; category: string | null; warehouse: { name: string } }[]; totalValue: number; lowStockCount: number }
                  return (
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-4 text-center"><p className="text-sm text-emerald-600">{t('قيمة المخزون', 'Stock Value', lang)}</p><MoneyDisplay value={invData.totalValue} lang={lang} size="lg" bold inline /></CardContent></Card>
                        <Card className="bg-purple-50 border-purple-200"><CardContent className="p-4 text-center"><p className="text-sm text-purple-600">{t('عدد الأصناف', 'Total Items', lang)}</p><p className="text-xl font-bold text-purple-700">{formatNumber(invData.items.length)}</p></CardContent></Card>
                        <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4 text-center"><p className="text-sm text-amber-600">{t('أصناف منخفضة', 'Low Stock', lang)}</p><p className="text-xl font-bold text-amber-700">{formatNumber(invData.lowStockCount)}</p></CardContent></Card>
                      </div>
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                          <TableHead className="text-right">{t('الاسم', 'Name', lang)}</TableHead>
                          <TableHead className="text-right">{t('الوحدة', 'Unit', lang)}</TableHead>
                          <TableHead className="text-right">{t('الكمية', 'Qty', lang)}</TableHead>
                          <TableHead className="text-right">{t('سعر الوحدة', 'Unit Price', lang)}</TableHead>
                          <TableHead className="text-right">{t('القيمة', 'Value', lang)}</TableHead>
                          <TableHead className="text-right">{t('المستودع', 'Warehouse', lang)}</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {invData.items.map((item: { code: string; name: string; unit: string; quantity: number; unitPrice: number; warehouse: { name: string } }, i: number) => (
                            <TableRow key={i}><TableCell className="font-mono">{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.unit}</TableCell><TableCell>{formatNumber(item.quantity)}</TableCell><TableCell><MoneyDisplay value={item.unitPrice} lang={lang} size="sm" inline /></TableCell><TableCell><MoneyDisplay value={item.quantity * item.unitPrice} lang={lang} size="sm" inline /></TableCell><TableCell>{item.warehouse.name}</TableCell></TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                })()}
                {type === 'balance-sheet' && (() => {
                  const bsData = data as { accounts: { code: string; name: string; type: string; balance: number }[]; totalAssets: number; totalLiabilities: number; totalEquity: number }
                  return (
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Card className="bg-sky-50 border-sky-200"><CardContent className="p-4 text-center"><p className="text-sm text-sky-600">{t('إجمالي الأصول', 'Total Assets', lang)}</p><MoneyDisplay value={bsData.totalAssets} lang={lang} size="lg" bold inline /></CardContent></Card>
                        <Card className="bg-orange-50 border-orange-200"><CardContent className="p-4 text-center"><p className="text-sm text-orange-600">{t('إجمالي الخصوم', 'Total Liabilities', lang)}</p><MoneyDisplay value={bsData.totalLiabilities} lang={lang} size="lg" bold inline /></CardContent></Card>
                        <Card className="bg-purple-50 border-purple-200"><CardContent className="p-4 text-center"><p className="text-sm text-purple-600">{t('حقوق الملكية', 'Equity', lang)}</p><MoneyDisplay value={bsData.totalEquity} lang={lang} size="lg" bold inline /></CardContent></Card>
                      </div>
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead><TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead><TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {bsData.accounts.map((a, i) => (<TableRow key={i}><TableCell className="font-mono">{a.code}</TableCell><TableCell>{a.name}</TableCell><TableCell><Badge variant="outline">{a.type}</Badge></TableCell><TableCell><MoneyDisplay value={a.balance} lang={lang} size="sm" bold inline /></TableCell></TableRow>))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                })()}
                {type === 'income-statement' && (() => {
                  const isData = data as { accounts: { code: string; name: string; type: string; balance: number }[]; totalRevenue: number; totalExpenses: number; netIncome: number }
                  return (
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-4 text-center"><p className="text-sm text-emerald-600">{t('إجمالي الإيرادات', 'Total Revenue', lang)}</p><MoneyDisplay value={isData.totalRevenue} lang={lang} size="lg" bold inline /></CardContent></Card>
                        <Card className="bg-rose-50 border-rose-200"><CardContent className="p-4 text-center"><p className="text-sm text-rose-600">{t('إجمالي المصروفات', 'Total Expenses', lang)}</p><MoneyDisplay value={isData.totalExpenses} lang={lang} size="lg" bold inline /></CardContent></Card>
                        <Card className={isData.netIncome >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}><CardContent className="p-4 text-center"><p className={`text-sm ${isData.netIncome >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t('صافي الدخل', 'Net Income', lang)}</p><MoneyDisplay value={isData.netIncome} lang={lang} size="lg" bold inline /></CardContent></Card>
                      </div>
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead><TableHead className="text-right">{t('الحساب', 'Account', lang)}</TableHead><TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead><TableHead className="text-right">{t('الرصيد', 'Balance', lang)}</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {isData.accounts.map((a, i) => (<TableRow key={i}><TableCell className="font-mono">{a.code}</TableCell><TableCell>{a.name}</TableCell><TableCell><Badge variant="outline">{a.type}</Badge></TableCell><TableCell><MoneyDisplay value={a.balance} lang={lang} size="sm" bold inline /></TableCell></TableRow>))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                })()}
                {type === 'project-card' && (() => {
                  const pcData = data as { projects: { id: string; code: string; name: string; client: string; status: string; contractValue: number; issuedExtracts: number; purchases: number; projectExpenses: number; totalCost: number; profit: number; profitMargin: number }[]; totals: { contractValue: number; issuedExtracts: number; purchases: number; projectExpenses: number; totalCost: number; profit: number; profitMargin: number } }
                  return (
                    <div className="space-y-4 p-6">
                      {pcData.projects.map((p) => {
                        const isProfitable = p.profit >= 0
                        return (
                          <Card key={p.id} className={`overflow-hidden ${isProfitable ? 'border-emerald-200' : 'border-rose-200'}`} style={{ borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: isProfitable ? '#059669' : '#dc2626' }}>
                            <CardContent className="p-5">
                              <div className="flex items-start justify-between mb-4">
                                <div><div className="flex items-center gap-2"><span className="font-mono text-sm text-muted-foreground">{p.code}</span><h3 className="text-lg font-bold">{p.name}</h3></div><p className="text-sm text-muted-foreground mt-0.5">{p.client}</p></div>
                                <Badge variant="outline" className={isProfitable ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>{isProfitable ? t('رابح', 'Profitable', lang) : t('خاسر', 'Losing', lang)}</Badge>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <div className="bg-sky-50 rounded-lg p-3 text-center"><p className="text-xs text-sky-600 font-medium">{t('قيمة العقد', 'Contract Value', lang)}</p><MoneyDisplay value={p.contractValue} lang={lang} size="sm" bold inline /></div>
                                <div className="bg-teal-50 rounded-lg p-3 text-center"><p className="text-xs text-teal-600 font-medium">{t('المستخلصات', 'Extracts', lang)}</p><MoneyDisplay value={p.issuedExtracts} lang={lang} size="sm" bold inline /></div>
                                <div className="bg-amber-50 rounded-lg p-3 text-center"><p className="text-xs text-amber-600 font-medium">{t('المشتريات', 'Purchases', lang)}</p><MoneyDisplay value={p.purchases} lang={lang} size="sm" bold inline /></div>
                                <div className="bg-orange-50 rounded-lg p-3 text-center"><p className="text-xs text-orange-600 font-medium">{t('المصروفات', 'Expenses', lang)}</p><MoneyDisplay value={p.projectExpenses} lang={lang} size="sm" bold inline /></div>
                              </div>
                              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200">
                                <div className="text-center"><p className="text-xs text-gray-500">{t('إجمالي التكلفة', 'Total Cost', lang)}</p><MoneyDisplay value={p.totalCost} lang={lang} size="sm" bold inline /></div>
                                <div className={`text-center rounded-lg p-2 ${isProfitable ? 'bg-emerald-50' : 'bg-rose-50'}`}><p className={`text-xs ${isProfitable ? 'text-emerald-600' : 'text-rose-600'}`}>{t('الربح', 'Profit', lang)}</p><MoneyDisplay value={p.profit} lang={lang} size="sm" bold inline /></div>
                                <div className={`text-center rounded-lg p-2 ${isProfitable ? 'bg-emerald-50' : 'bg-rose-50'}`}><p className={`text-xs ${isProfitable ? 'text-emerald-600' : 'text-rose-600'}`}>{t('الهامش', 'Margin', lang)}</p><p className={`text-sm font-bold ${isProfitable ? 'text-emerald-800' : 'text-rose-800'}`}>{formatNumber(p.profitMargin)}%</p></div>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )
                })()}
                {type === 'claims' && (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-right">{t('رقم المستخلص', 'Claim No.', lang)}</TableHead>
                      <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                      <TableHead className="text-right">{t('النسبة', 'Percentage', lang)}</TableHead>
                      <TableHead className="text-right">{t('الإجمالي', 'Total', lang)}</TableHead>
                      <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {(data as { claimNo: string; project: { name: string }; percentage: number; totalAmount: number; status: string }[]).map((c, i) => (
                        <TableRow key={i}><TableCell className="font-mono">{c.claimNo}</TableCell><TableCell>{c.project.name}</TableCell><TableCell>{formatNumber(c.percentage)}%</TableCell><TableCell className="font-semibold"><MoneyDisplay value={c.totalAmount} lang={lang} size="sm" bold inline /></TableCell><TableCell><Badge variant="outline">{c.status}</Badge></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ============ Main Reports Module ============
export function ReportsModule() {
  const { lang } = useAppStore()
  const [activeTab, setActiveTab] = useState('projects')
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null)

  if (selectedReport) {
    return <ReportView type={selectedReport} onBack={() => setSelectedReport(null)} />
  }

  return (
    <ModuleLayout
      title={{ ar: 'التقارير', en: 'Reports' }}
      subtitle={{ ar: 'تقارير شاملة لإدارة المشاريع والمالية', en: 'Comprehensive project and financial reports' }}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="projects">{t('المشاريع', 'Projects', lang)}</TabsTrigger>
          <TabsTrigger value="financial">{t('المالية', 'Financial', lang)}</TabsTrigger>
          <TabsTrigger value="equipment">{t('المعدات', 'Equipment', lang)}</TabsTrigger>
        </TabsList>

        {reportGroups.map(group => (
          <TabsContent key={group.key} value={group.key}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.reports.map(report => {
                const Icon = report.icon
                return (
                  <Card key={report.type} className={`cursor-pointer transition-all hover:shadow-md ${report.color}`} onClick={() => setSelectedReport(report.type)}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className={`size-12 rounded-xl ${report.bgColor} flex items-center justify-center shrink-0`}>
                          <Icon className={`size-6 ${report.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900">{report.title[lang]}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{report.description[lang]}</p>
                        </div>
                        <ArrowRight className="size-5 text-gray-400 shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </ModuleLayout>
  )
}

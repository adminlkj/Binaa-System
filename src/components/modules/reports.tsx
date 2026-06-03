'use client'

import React, { useState, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, FileText, Receipt, TrendingUp, ShoppingCart,
  Package, Scale, PieChart, Eye, ArrowRight,
  Printer, Download, CreditCard, TrendingDown,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useAppStore, formatSAR, formatDate, formatNumber } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Report Types ============
type ReportType = 'projects' | 'claims' | 'expenses' | 'sales' | 'purchases' | 'inventory' | 'balance-sheet' | 'income-statement' | 'project-card'

interface ReportCard {
  type: ReportType
  icon: React.ElementType
  title: { ar: string; en: string }
  description: { ar: string; en: string }
  color: string; bgColor: string; iconColor: string
}

const reportCards: ReportCard[] = [
  {
    type: 'project-card', icon: CreditCard,
    title: { ar: 'كارت المشروع', en: 'Project Card' },
    description: { ar: 'ملخص مالي شامل لكل مشروع', en: 'Comprehensive financial summary per project' },
    color: 'border-emerald-400', bgColor: 'bg-emerald-50', iconColor: 'text-emerald-700',
  },
  {
    type: 'projects', icon: BarChart3,
    title: { ar: 'تقرير المشاريع', en: 'Project Report' },
    description: { ar: 'ملخص تكاليف وأرباح المشاريع', en: 'Project costs and profit summary' },
    color: 'border-emerald-300', bgColor: 'bg-emerald-50', iconColor: 'text-emerald-600',
  },
  {
    type: 'claims', icon: FileText,
    title: { ar: 'تقرير المستخلصات', en: 'Claims Report' },
    description: { ar: 'حالة المستخلصات والتحصيلات', en: 'Claims status and collections' },
    color: 'border-teal-300', bgColor: 'bg-teal-50', iconColor: 'text-teal-600',
  },
  {
    type: 'expenses', icon: Receipt,
    title: { ar: 'تقرير المصروفات', en: 'Expenses Report' },
    description: { ar: 'تفصيل المصروفات حسب الفئة', en: 'Expenses breakdown by category' },
    color: 'border-orange-300', bgColor: 'bg-orange-50', iconColor: 'text-orange-600',
  },
  {
    type: 'sales', icon: TrendingUp,
    title: { ar: 'تقرير المبيعات', en: 'Sales Report' },
    description: { ar: 'ملخص المبيعات والتحصيلات', en: 'Sales and collections summary' },
    color: 'border-cyan-300', bgColor: 'bg-cyan-50', iconColor: 'text-cyan-600',
  },
  {
    type: 'purchases', icon: ShoppingCart,
    title: { ar: 'تقرير المشتريات', en: 'Purchases Report' },
    description: { ar: 'ملخص المشتريات والمستحقات', en: 'Purchases and payables summary' },
    color: 'border-amber-300', bgColor: 'bg-amber-50', iconColor: 'text-amber-600',
  },
  {
    type: 'inventory', icon: Package,
    title: { ar: 'تقرير المخزون', en: 'Inventory Report' },
    description: { ar: 'مستويات المخزون والأصناف المنخفضة', en: 'Stock levels and low items' },
    color: 'border-purple-300', bgColor: 'bg-purple-50', iconColor: 'text-purple-600',
  },
  {
    type: 'balance-sheet', icon: Scale,
    title: { ar: 'الميزانية العمومية', en: 'Balance Sheet' },
    description: { ar: 'الأصول والالتزامات وحقوق الملكية', en: 'Assets, liabilities, and equity' },
    color: 'border-rose-300', bgColor: 'bg-rose-50', iconColor: 'text-rose-600',
  },
  {
    type: 'income-statement', icon: PieChart,
    title: { ar: 'قائمة الدخل', en: 'Income Statement' },
    description: { ar: 'الإيرادات والمصروفات وصافي الربح', en: 'Revenue, expenses, and net income' },
    color: 'border-green-300', bgColor: 'bg-green-50', iconColor: 'text-green-600',
  },
]

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
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

// ============ Report Header Component ============
function ReportHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { lang } = useAppStore()
  const now = new Date()
  const dateStr = lang === 'ar'
    ? now.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
    : now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="border-b-2 border-gray-800 pb-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'نظام بِنَاء' : 'Binaa ERP'}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{lang === 'ar' ? 'نظام إدارة مشاريع البناء' : 'Construction Project Management System'}</p>
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
          <p className="text-xs text-gray-400 mt-1">{dateStr} - {timeStr}</p>
        </div>
      </div>
    </div>
  )
}

// ============ Report Toolbar (Print + Export) ============
function ReportToolbar({
  onPrint,
  onExport,
  printLabel,
  exportLabel,
}: {
  onPrint: () => void
  onExport: () => void
  printLabel?: string
  exportLabel?: string
}) {
  const { lang } = useAppStore()

  return (
    <div className="flex items-center gap-2 report-no-print">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={onPrint}
      >
        <Printer className="size-4" />
        {printLabel || (lang === 'ar' ? 'طباعة' : 'Print')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={onExport}
      >
        <Download className="size-4" />
        {exportLabel || (lang === 'ar' ? 'تصدير CSV' : 'Export CSV')}
      </Button>
    </div>
  )
}

// ============ Print Report Helper ============
function usePrintReport() {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = useCallback(() => {
    const printArea = printRef.current
    if (!printArea) return

    // Create a wrapper for printing
    const printWrapper = document.createElement('div')
    printWrapper.className = 'report-print-area'
    printWrapper.innerHTML = printArea.innerHTML

    // Add page number footer
    const footer = document.createElement('div')
    footer.className = 'report-print-footer'
    footer.textContent = '---'
    printWrapper.appendChild(footer)

    document.body.appendChild(printWrapper)
    window.print()

    // Cleanup after print dialog closes
    setTimeout(() => {
      document.body.removeChild(printWrapper)
    }, 1000)
  }, [])

  return { printRef, handlePrint }
}

// ============ Project Card Report (MOST IMPORTANT) ============
interface ProjectCardData {
  id: string
  code: string
  name: string
  nameAr: string | null
  client: string
  status: string
  contractValue: number
  issuedExtracts: number
  purchases: number
  projectExpenses: number
  totalCost: number
  profit: number
  profitMargin: number
}

interface ProjectCardTotals {
  contractValue: number
  issuedExtracts: number
  purchases: number
  projectExpenses: number
  totalCost: number
  profit: number
  profitMargin: number
}

function ProjectCardReport() {
  const { lang } = useAppStore()
  const { printRef, handlePrint } = usePrintReport()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['report', 'project-card'],
    queryFn: async () => {
      const res = await fetch('/api/reports?type=project-card')
      if (!res.ok) throw new Error()
      return res.json() as Promise<{ projects: ProjectCardData[]; totals: ProjectCardTotals }>
    },
  })

  const handleExport = useCallback(() => {
    if (!data?.projects) return
    const columns: CSVColumn[] = [
      { key: 'code', label: lang === 'ar' ? 'رقم المشروع' : 'Project Code' },
      { key: 'name', label: lang === 'ar' ? 'اسم المشروع' : 'Project Name' },
      { key: 'client', label: lang === 'ar' ? 'العميل' : 'Client' },
      { key: 'status', label: lang === 'ar' ? 'الحالة' : 'Status' },
      { key: 'contractValue', label: lang === 'ar' ? 'قيمة العقد' : 'Contract Value' },
      { key: 'issuedExtracts', label: lang === 'ar' ? 'المستخلصات الصادرة' : 'Issued Extracts' },
      { key: 'purchases', label: lang === 'ar' ? 'المشتريات' : 'Purchases' },
      { key: 'projectExpenses', label: lang === 'ar' ? 'مصروفات المشروع' : 'Project Expenses' },
      { key: 'totalCost', label: lang === 'ar' ? 'إجمالي التكلفة' : 'Total Cost' },
      { key: 'profit', label: lang === 'ar' ? 'الربح' : 'Profit' },
      { key: 'profitMargin', label: lang === 'ar' ? 'هامش الربح %' : 'Profit Margin %' },
    ]
    exportToCSV(data.projects as unknown as Record<string, unknown>[], `project-card-${new Date().toISOString().slice(0, 10)}`, columns)
  }, [data, lang])

  const card = reportCards.find(c => c.type === 'project-card')!
  const Icon = card.icon

  if (isLoading) {
    return (
      <Card><CardContent className="p-6"><TableSkeleton rows={6} /></CardContent></Card>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <p className="text-rose-600">{lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}</p>
        <Button variant="outline" onClick={() => refetch()}>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Button>
      </div>
    )
  }

  if (!data) return null

  const { projects, totals } = data

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`size-10 rounded-full ${card.bgColor} flex items-center justify-center`}>
            <Icon className={`size-5 ${card.iconColor}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold">{card.title[lang]}</h2>
            <p className="text-sm text-muted-foreground">{card.description[lang]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <Eye className="size-4" />
          </Button>
          <ReportToolbar onPrint={handlePrint} onExport={handleExport} />
        </div>
      </div>

      {/* Print area */}
      <div ref={printRef}>
        <div className="report-page">
          {/* Report header for print */}
          <ReportHeader
            title={card.title[lang]}
            subtitle={card.description[lang]}
          />

          {/* Project Cards */}
          <div className="space-y-4">
            {projects.map((p) => {
              const isProfitable = p.profit >= 0
              return (
                <Card
                  key={p.id}
                  className={`overflow-hidden ${isProfitable ? 'project-card-profit border-emerald-200' : 'project-card-loss border-rose-200'}`}
                  style={{ borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: isProfitable ? '#059669' : '#dc2626' }}
                >
                  <CardContent className="p-5">
                    {/* Project header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-muted-foreground">{p.code}</span>
                          <h3 className="text-lg font-bold">{p.name}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{p.client}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={isProfitable
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                          }
                        >
                          {isProfitable
                            ? (lang === 'ar' ? 'رابح' : 'Profitable')
                            : (lang === 'ar' ? 'خاسر' : 'Losing')
                          }
                        </Badge>
                        <Badge variant="outline" className="bg-gray-50">{p.status}</Badge>
                      </div>
                    </div>

                    {/* Financial metrics grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      {/* Contract Value */}
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-blue-600 font-medium">
                          {lang === 'ar' ? 'قيمة العقد' : 'Contract Value'}
                        </p>
                        <p className="text-base font-bold text-blue-800 mt-1">
                          <MoneyDisplay value={p.contractValue} lang={lang} size="sm" bold showSymbol={false} inline />
                        </p>
                      </div>
                      {/* Issued Extracts */}
                      <div className="bg-teal-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-teal-600 font-medium">
                          {lang === 'ar' ? 'المستخلصات الصادرة' : 'Issued Extracts'}
                        </p>
                        <p className="text-base font-bold text-teal-800 mt-1">
                          <MoneyDisplay value={p.issuedExtracts} lang={lang} size="sm" bold showSymbol={false} inline />
                        </p>
                      </div>
                      {/* Purchases */}
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-amber-600 font-medium">
                          {lang === 'ar' ? 'المشتريات' : 'Purchases'}
                        </p>
                        <p className="text-base font-bold text-amber-800 mt-1">
                          <MoneyDisplay value={p.purchases} lang={lang} size="sm" bold showSymbol={false} inline />
                        </p>
                      </div>
                      {/* Project Expenses */}
                      <div className="bg-orange-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-orange-600 font-medium">
                          {lang === 'ar' ? 'مصروفات المشروع' : 'Project Expenses'}
                        </p>
                        <p className="text-base font-bold text-orange-800 mt-1">
                          <MoneyDisplay value={p.projectExpenses} lang={lang} size="sm" bold showSymbol={false} inline />
                        </p>
                      </div>
                    </div>

                    {/* Summary row */}
                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200">
                      {/* Total Cost */}
                      <div className="text-center">
                        <p className="text-xs text-gray-500 font-medium">
                          {lang === 'ar' ? 'إجمالي التكلفة' : 'Total Cost'}
                        </p>
                        <p className="text-sm font-bold text-gray-800 mt-0.5">
                          <MoneyDisplay value={p.totalCost} lang={lang} size="sm" bold showSymbol={false} inline />
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {lang === 'ar' ? '(مشتريات + مصروفات)' : '(Purchases + Expenses)'}
                        </p>
                      </div>
                      {/* Profit */}
                      <div className={`text-center ${isProfitable ? 'bg-emerald-50' : 'bg-rose-50'} rounded-lg p-2`}>
                        <p className={`text-xs font-medium ${isProfitable ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {lang === 'ar' ? 'الربح' : 'Profit'}
                        </p>
                        <p className={`text-sm font-bold mt-0.5 ${isProfitable ? 'text-emerald-800' : 'text-rose-800'}`}>
                          <MoneyDisplay value={p.profit} lang={lang} size="sm" bold showSymbol={false} inline />
                        </p>
                      </div>
                      {/* Profit Margin */}
                      <div className={`text-center ${isProfitable ? 'bg-emerald-50' : 'bg-rose-50'} rounded-lg p-2`}>
                        <p className={`text-xs font-medium ${isProfitable ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {lang === 'ar' ? 'هامش الربح' : 'Profit Margin'}
                        </p>
                        <div className="mt-1">
                          <p className={`text-sm font-bold ${isProfitable ? 'text-emerald-800' : 'text-rose-800'}`}>
                            {formatNumber(p.profitMargin)}%
                          </p>
                          {/* Visual margin bar */}
                          <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isProfitable ? 'bg-emerald-500' : 'bg-rose-500'}`}
                              style={{ width: `${Math.min(Math.abs(p.profitMargin), 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {/* Totals Summary */}
            {projects.length > 0 && (
              <Card className="border-2 border-gray-800 overflow-hidden">
                <CardContent className="p-5">
                  <h3 className="text-lg font-bold mb-4 text-center border-b border-gray-300 pb-2">
                    {lang === 'ar' ? 'الإجمالي العام لجميع المشاريع' : 'Grand Total - All Projects'}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-gray-500">{lang === 'ar' ? 'إجمالي قيمة العقود' : 'Total Contract Value'}</p>
                      <p className="text-sm font-bold"><MoneyDisplay value={totals.contractValue} lang={lang} size="sm" bold inline /></p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">{lang === 'ar' ? 'إجمالي المستخلصات' : 'Total Extracts'}</p>
                      <p className="text-sm font-bold"><MoneyDisplay value={totals.issuedExtracts} lang={lang} size="sm" bold inline /></p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">{lang === 'ar' ? 'إجمالي التكلفة' : 'Total Cost'}</p>
                      <p className="text-sm font-bold"><MoneyDisplay value={totals.totalCost} lang={lang} size="sm" bold inline /></p>
                    </div>
                    <div className={`text-center rounded-lg p-2 ${totals.profit >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                      <p className={`text-xs ${totals.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {lang === 'ar' ? 'إجمالي الربح' : 'Total Profit'}
                      </p>
                      <p className={`text-sm font-bold ${totals.profit >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                        <MoneyDisplay value={totals.profit} lang={lang} size="sm" bold inline />
                      </p>
                      <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${totals.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(Math.abs(totals.profitMargin), 100)}%` }}
                        />
                      </div>
                      <p className={`text-xs mt-0.5 font-semibold ${totals.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatNumber(totals.profitMargin)}% {lang === 'ar' ? 'هامش الربح' : 'margin'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ Report View Component ============
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

  const card = reportCards.find(c => c.type === type)!
  const Icon = card.icon

  // CSV export handlers per report type
  const handleExport = useCallback(() => {
    if (!data) return

    if (type === 'projects') {
      const projects = data as { code: string; name: string; client: string; contractValue: number; totalCosts: number; totalRevenue: number; profit: number; margin: number }[]
      const columns: CSVColumn[] = [
        { key: 'code', label: lang === 'ar' ? 'الرقم' : 'Code' },
        { key: 'name', label: lang === 'ar' ? 'المشروع' : 'Project' },
        { key: 'client', label: lang === 'ar' ? 'العميل' : 'Client' },
        { key: 'contractValue', label: lang === 'ar' ? 'قيمة العقد' : 'Contract Value' },
        { key: 'totalCosts', label: lang === 'ar' ? 'التكاليف' : 'Costs' },
        { key: 'totalRevenue', label: lang === 'ar' ? 'الإيرادات' : 'Revenue' },
        { key: 'profit', label: lang === 'ar' ? 'الربح' : 'Profit' },
        { key: 'margin', label: lang === 'ar' ? 'الهامش %' : 'Margin %' },
      ]
      exportToCSV(projects as unknown as Record<string, unknown>[], `projects-report-${new Date().toISOString().slice(0, 10)}`, columns)
    } else if (type === 'claims') {
      const claims = data as { claimNo: string; project: { name: string }; contract: { contractNo: string }; percentage: number; totalAmount: number; status: string }[]
      const flatData = claims.map(c => ({
        claimNo: c.claimNo,
        projectName: c.project.name,
        contractNo: c.contract.contractNo,
        percentage: c.percentage,
        totalAmount: c.totalAmount,
        status: c.status,
      }))
      const columns: CSVColumn[] = [
        { key: 'claimNo', label: lang === 'ar' ? 'رقم المستخلص' : 'Claim No.' },
        { key: 'projectName', label: lang === 'ar' ? 'المشروع' : 'Project' },
        { key: 'contractNo', label: lang === 'ar' ? 'العقد' : 'Contract' },
        { key: 'percentage', label: lang === 'ar' ? 'النسبة' : 'Percentage' },
        { key: 'totalAmount', label: lang === 'ar' ? 'الإجمالي' : 'Total' },
        { key: 'status', label: lang === 'ar' ? 'الحالة' : 'Status' },
      ]
      exportToCSV(flatData as unknown as Record<string, unknown>[], `claims-report-${new Date().toISOString().slice(0, 10)}`, columns)
    } else if (type === 'expenses') {
      const expData = data as { expenses: { date: string; description: string; category: string; amount: number; project: { name: string } | null }[]; totalExpenses: number; byCategory: Record<string, number> }
      const flatData = expData.expenses.map(e => ({
        date: e.date,
        description: e.description,
        category: e.category,
        amount: e.amount,
        project: e.project?.name || (lang === 'ar' ? 'بدون مشروع' : 'No Project'),
      }))
      const columns: CSVColumn[] = [
        { key: 'date', label: lang === 'ar' ? 'التاريخ' : 'Date' },
        { key: 'description', label: lang === 'ar' ? 'الوصف' : 'Description' },
        { key: 'category', label: lang === 'ar' ? 'الفئة' : 'Category' },
        { key: 'amount', label: lang === 'ar' ? 'المبلغ' : 'Amount' },
        { key: 'project', label: lang === 'ar' ? 'المشروع' : 'Project' },
      ]
      exportToCSV(flatData as unknown as Record<string, unknown>[], `expenses-report-${new Date().toISOString().slice(0, 10)}`, columns)
    } else if (type === 'sales') {
      const salesData = data as { invoices: { invoiceNo: string; date: string; client: { name: string }; totalAmount: number; paidAmount: number; status: string }[]; totalSales: number; totalPaid: number; totalOutstanding: number }
      const flatData = salesData.invoices.map(i => ({
        invoiceNo: i.invoiceNo,
        date: i.date,
        client: i.client.name,
        totalAmount: i.totalAmount,
        paidAmount: i.paidAmount,
        outstanding: i.totalAmount - i.paidAmount,
        status: i.status,
      }))
      const columns: CSVColumn[] = [
        { key: 'invoiceNo', label: lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No.' },
        { key: 'date', label: lang === 'ar' ? 'التاريخ' : 'Date' },
        { key: 'client', label: lang === 'ar' ? 'العميل' : 'Client' },
        { key: 'totalAmount', label: lang === 'ar' ? 'الإجمالي' : 'Total' },
        { key: 'paidAmount', label: lang === 'ar' ? 'المدفوع' : 'Paid' },
        { key: 'outstanding', label: lang === 'ar' ? 'المستحق' : 'Outstanding' },
        { key: 'status', label: lang === 'ar' ? 'الحالة' : 'Status' },
      ]
      exportToCSV(flatData as unknown as Record<string, unknown>[], `sales-report-${new Date().toISOString().slice(0, 10)}`, columns)
    } else if (type === 'purchases') {
      const purchData = data as { purchaseOrders: { orderNo: string; date: string; supplier: { name: string }; totalAmount: number; status: string }[]; purchaseInvoices: { invoiceNo: string; date: string; supplier: { name: string }; totalAmount: number; paidAmount: number; status: string }[]; totalPOs: number; totalPIs: number; totalPaid: number; totalOutstanding: number }
      const flatData = purchData.purchaseInvoices.map(i => ({
        invoiceNo: i.invoiceNo,
        date: i.date,
        supplier: i.supplier.name,
        totalAmount: i.totalAmount,
        paidAmount: i.paidAmount,
        outstanding: i.totalAmount - i.paidAmount,
        status: i.status,
      }))
      const columns: CSVColumn[] = [
        { key: 'invoiceNo', label: lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No.' },
        { key: 'date', label: lang === 'ar' ? 'التاريخ' : 'Date' },
        { key: 'supplier', label: lang === 'ar' ? 'المورد' : 'Supplier' },
        { key: 'totalAmount', label: lang === 'ar' ? 'الإجمالي' : 'Total' },
        { key: 'paidAmount', label: lang === 'ar' ? 'المدفوع' : 'Paid' },
        { key: 'outstanding', label: lang === 'ar' ? 'المستحق' : 'Outstanding' },
        { key: 'status', label: lang === 'ar' ? 'الحالة' : 'Status' },
      ]
      exportToCSV(flatData as unknown as Record<string, unknown>[], `purchases-report-${new Date().toISOString().slice(0, 10)}`, columns)
    } else if (type === 'inventory') {
      const invData = data as { items: { code: string; name: string; unit: string; quantity: number; unitPrice: number; category: string | null; warehouse: { name: string } }[]; totalValue: number; lowStockCount: number; totalItems: number }
      const flatData = invData.items.map(i => ({
        code: i.code,
        name: i.name,
        unit: i.unit,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalValue: i.quantity * i.unitPrice,
        category: i.category || '',
        warehouse: i.warehouse.name,
      }))
      const columns: CSVColumn[] = [
        { key: 'code', label: lang === 'ar' ? 'الرقم' : 'Code' },
        { key: 'name', label: lang === 'ar' ? 'الاسم' : 'Name' },
        { key: 'unit', label: lang === 'ar' ? 'الوحدة' : 'Unit' },
        { key: 'quantity', label: lang === 'ar' ? 'الكمية' : 'Quantity' },
        { key: 'unitPrice', label: lang === 'ar' ? 'سعر الوحدة' : 'Unit Price' },
        { key: 'totalValue', label: lang === 'ar' ? 'القيمة' : 'Value' },
        { key: 'category', label: lang === 'ar' ? 'الفئة' : 'Category' },
        { key: 'warehouse', label: lang === 'ar' ? 'المستودع' : 'Warehouse' },
      ]
      exportToCSV(flatData as unknown as Record<string, unknown>[], `inventory-report-${new Date().toISOString().slice(0, 10)}`, columns)
    } else if (type === 'balance-sheet') {
      const bsData = data as { accounts: { code: string; name: string; type: string; balance: number }[]; totalAssets: number; totalLiabilities: number; totalEquity: number }
      const columns: CSVColumn[] = [
        { key: 'code', label: lang === 'ar' ? 'الرقم' : 'Code' },
        { key: 'name', label: lang === 'ar' ? 'الاسم' : 'Name' },
        { key: 'type', label: lang === 'ar' ? 'النوع' : 'Type' },
        { key: 'balance', label: lang === 'ar' ? 'الرصيد' : 'Balance' },
      ]
      exportToCSV(bsData.accounts as unknown as Record<string, unknown>[], `balance-sheet-${new Date().toISOString().slice(0, 10)}`, columns)
    } else if (type === 'income-statement') {
      const isData = data as { accounts: { code: string; name: string; type: string; balance: number }[]; totalRevenue: number; totalExpenses: number; netIncome: number }
      const columns: CSVColumn[] = [
        { key: 'code', label: lang === 'ar' ? 'الرقم' : 'Code' },
        { key: 'name', label: lang === 'ar' ? 'الاسم' : 'Name' },
        { key: 'type', label: lang === 'ar' ? 'النوع' : 'Type' },
        { key: 'balance', label: lang === 'ar' ? 'الرصيد' : 'Balance' },
      ]
      exportToCSV(isData.accounts as unknown as Record<string, unknown>[], `income-statement-${new Date().toISOString().slice(0, 10)}`, columns)
    }
  }, [data, type, lang])

  return (
    <div className="space-y-4">
      {/* Header with toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="report-no-print" onClick={onBack}>
            <ArrowRight className="size-4" />
          </Button>
          <div className={`size-10 rounded-full ${card.bgColor} flex items-center justify-center`}>
            <Icon className={`size-5 ${card.iconColor}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold">{card.title[lang]}</h2>
            <p className="text-sm text-muted-foreground">{card.description[lang]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 report-no-print">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <Eye className="size-4" />
          </Button>
          <ReportToolbar onPrint={handlePrint} onExport={handleExport} />
        </div>
      </div>

      {/* Print area */}
      <div ref={printRef}>
        <div className="report-page">
          <ReportHeader title={card.title[lang]} subtitle={card.description[lang]} />

          {isLoading ? (
            <Card><CardContent className="p-6"><TableSkeleton /></CardContent></Card>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}</p>
              <Button variant="outline" onClick={() => refetch()}>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Button>
            </div>
          ) : !data ? null : (
            <>
              {/* Projects Report */}
              {type === 'projects' && (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="text-right">{lang === 'ar' ? 'المشروع' : 'Project'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'العميل' : 'Client'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'قيمة العقد' : 'Contract Value'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'التكاليف' : 'Costs'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'الإيرادات' : 'Revenue'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'الربح' : 'Profit'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'الهامش' : 'Margin'}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(data as { code: string; name: string; client: string; contractValue: number; totalCosts: number; totalRevenue: number; profit: number; margin: number }[]).map((p, i) => (
                            <TableRow key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-muted-foreground">{p.client}</TableCell>
                              <TableCell><MoneyDisplay value={p.contractValue} lang={lang} size="sm" inline /></TableCell>
                              <TableCell className="text-rose-700"><MoneyDisplay value={p.totalCosts} lang={lang} size="sm" inline /></TableCell>
                              <TableCell className="text-emerald-700"><MoneyDisplay value={p.totalRevenue} lang={lang} size="sm" inline /></TableCell>
                              <TableCell className={p.profit >= 0 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                                <MoneyDisplay value={p.profit} lang={lang} size="sm" bold inline />
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={p.margin >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>
                                  {formatNumber(p.margin)}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Claims Report */}
              {type === 'claims' && (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="text-right">{lang === 'ar' ? 'رقم المستخلص' : 'Claim No.'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'المشروع' : 'Project'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'العقد' : 'Contract'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'النسبة' : 'Percentage'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                            <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(data as { claimNo: string; project: { name: string }; contract: { contractNo: string }; percentage: number; totalAmount: number; status: string }[]).map((c, i) => (
                            <TableRow key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                              <TableCell className="font-mono">{c.claimNo}</TableCell>
                              <TableCell>{c.project.name}</TableCell>
                              <TableCell className="text-muted-foreground">{c.contract.contractNo}</TableCell>
                              <TableCell>{formatNumber(c.percentage)}%</TableCell>
                              <TableCell className="font-semibold"><MoneyDisplay value={c.totalAmount} lang={lang} size="sm" bold inline /></TableCell>
                              <TableCell>
                                <Badge variant="outline" className={
                                  c.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                                  c.status === 'APPROVED' ? 'bg-teal-50 text-teal-700' :
                                  c.status === 'REJECTED' ? 'bg-rose-50 text-rose-700' :
                                  'bg-gray-50'
                                }>
                                  {c.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Expenses Report */}
              {type === 'expenses' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Card className="bg-emerald-50 border-emerald-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}</p>
                        <p className="text-xl font-bold text-emerald-700 mt-1">
                          <MoneyDisplay value={(data as { totalExpenses: number }).totalExpenses} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-amber-50 border-amber-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-amber-600">{lang === 'ar' ? 'عدد الفئات' : 'Categories'}</p>
                        <p className="text-xl font-bold text-amber-700 mt-1">
                          {formatNumber(Object.keys((data as { byCategory: Record<string, number> }).byCategory).length)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-teal-50 border-teal-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-teal-600">{lang === 'ar' ? 'عدد المعاملات' : 'Transactions'}</p>
                        <p className="text-xl font-bold text-teal-700 mt-1">
                          {formatNumber((data as { expenses: unknown[] }).expenses.length)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-3">{lang === 'ar' ? 'تفصيل حسب الفئة' : 'Breakdown by Category'}</h3>
                      <div className="space-y-2">
                        {Object.entries((data as { byCategory: Record<string, number> }).byCategory)
                          .sort(([, a], [, b]) => b - a)
                          .map(([cat, amount], i) => {
                            const totalExp = (data as { totalExpenses: number }).totalExpenses
                            const pct = totalExp > 0 ? (amount / totalExp) * 100 : 0
                            return (
                              <div key={cat} className={`flex justify-between items-center p-3 rounded ${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <span className="font-medium text-sm truncate">{cat}</span>
                                  <div className="flex-1 max-w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-xs text-gray-500">{formatNumber(pct)}%</span>
                                </div>
                                <span className="font-semibold text-emerald-700 text-sm ml-3">
                                  <MoneyDisplay value={amount} lang={lang} size="sm" bold inline />
                                </span>
                              </div>
                            )
                          })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Sales Report */}
              {type === 'sales' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Card className="bg-emerald-50 border-emerald-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</p>
                        <p className="text-xl font-bold text-emerald-700 mt-1">
                          <MoneyDisplay value={(data as { totalSales: number }).totalSales} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-teal-50 border-teal-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-teal-600">{lang === 'ar' ? 'المدفوع' : 'Paid'}</p>
                        <p className="text-xl font-bold text-teal-700 mt-1">
                          <MoneyDisplay value={(data as { totalPaid: number }).totalPaid} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-amber-50 border-amber-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-amber-600">{lang === 'ar' ? 'المستحق' : 'Outstanding'}</p>
                        <p className="text-xl font-bold text-amber-700 mt-1">
                          <MoneyDisplay value={(data as { totalOutstanding: number }).totalOutstanding} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  {/* Sales invoice table */}
                  {(data as { invoices: unknown[] }).invoices?.length > 0 && (
                    <Card>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-50">
                                <TableHead className="text-right">{lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No.'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'العميل' : 'Client'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'المدفوع' : 'Paid'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(data as { invoices: { invoiceNo: string; client: { name: string }; totalAmount: number; paidAmount: number; status: string }[] }).invoices.map((inv, i) => (
                                <TableRow key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                                  <TableCell className="font-mono">{inv.invoiceNo}</TableCell>
                                  <TableCell>{inv.client.name}</TableCell>
                                  <TableCell><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" inline /></TableCell>
                                  <TableCell><MoneyDisplay value={inv.paidAmount} lang={lang} size="sm" inline /></TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={
                                      inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                                      inv.status === 'OVERDUE' ? 'bg-rose-50 text-rose-700' :
                                      'bg-gray-50'
                                    }>
                                      {inv.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Purchases Report */}
              {type === 'purchases' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="bg-emerald-50 border-emerald-200">
                      <CardContent className="p-3 text-center">
                        <p className="text-xs text-emerald-600">{lang === 'ar' ? 'أوامر الشراء' : 'Purchase Orders'}</p>
                        <p className="text-lg font-bold text-emerald-700 mt-1">
                          <MoneyDisplay value={(data as { totalPOs: number }).totalPOs} lang={lang} size="sm" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-rose-50 border-rose-200">
                      <CardContent className="p-3 text-center">
                        <p className="text-xs text-rose-600">{lang === 'ar' ? 'فواتير الشراء' : 'Purchase Invoices'}</p>
                        <p className="text-lg font-bold text-rose-700 mt-1">
                          <MoneyDisplay value={(data as { totalPIs: number }).totalPIs} lang={lang} size="sm" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-teal-50 border-teal-200">
                      <CardContent className="p-3 text-center">
                        <p className="text-xs text-teal-600">{lang === 'ar' ? 'المدفوع' : 'Paid'}</p>
                        <p className="text-lg font-bold text-teal-700 mt-1">
                          <MoneyDisplay value={(data as { totalPaid: number }).totalPaid} lang={lang} size="sm" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-amber-50 border-amber-200">
                      <CardContent className="p-3 text-center">
                        <p className="text-xs text-amber-600">{lang === 'ar' ? 'المستحق' : 'Outstanding'}</p>
                        <p className="text-lg font-bold text-amber-700 mt-1">
                          <MoneyDisplay value={(data as { totalOutstanding: number }).totalOutstanding} lang={lang} size="sm" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  {/* Purchase invoices table */}
                  {(data as { purchaseInvoices: unknown[] }).purchaseInvoices?.length > 0 && (
                    <Card>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-50">
                                <TableHead className="text-right">{lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No.'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'المورد' : 'Supplier'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'المدفوع' : 'Paid'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(data as { purchaseInvoices: { invoiceNo: string; supplier: { name: string }; totalAmount: number; paidAmount: number; status: string }[] }).purchaseInvoices.map((inv, i) => (
                                <TableRow key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                                  <TableCell className="font-mono">{inv.invoiceNo}</TableCell>
                                  <TableCell>{inv.supplier.name}</TableCell>
                                  <TableCell><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" inline /></TableCell>
                                  <TableCell><MoneyDisplay value={inv.paidAmount} lang={lang} size="sm" inline /></TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={
                                      inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                                      'bg-gray-50'
                                    }>
                                      {inv.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Inventory Report */}
              {type === 'inventory' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Card className="bg-emerald-50 border-emerald-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي الأصناف' : 'Total Items'}</p>
                        <p className="text-xl font-bold text-emerald-700 mt-1">{formatNumber((data as { totalItems: number }).totalItems)}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-teal-50 border-teal-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-teal-600">{lang === 'ar' ? 'قيمة المخزون' : 'Stock Value'}</p>
                        <p className="text-xl font-bold text-teal-700 mt-1">
                          <MoneyDisplay value={(data as { totalValue: number }).totalValue} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-amber-50 border-amber-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-amber-600">{lang === 'ar' ? 'أصناف منخفضة' : 'Low Stock'}</p>
                        <p className="text-xl font-bold text-amber-700 mt-1">{formatNumber((data as { lowStockCount: number }).lowStockCount)}</p>
                      </CardContent>
                    </Card>
                  </div>
                  {/* Inventory items table */}
                  {(data as { items: unknown[] }).items?.length > 0 && (
                    <Card>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto max-h-96">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-50">
                                <TableHead className="text-right">{lang === 'ar' ? 'الرقم' : 'Code'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'الكمية' : 'Qty'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'السعر' : 'Price'}</TableHead>
                                <TableHead className="text-right">{lang === 'ar' ? 'القيمة' : 'Value'}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(data as { items: { code: string; name: string; quantity: number; unitPrice: number; minQuantity: number }[] }).items.map((item, i) => (
                                <TableRow key={i} className={`${i % 2 === 1 ? 'bg-gray-50/50' : ''} ${item.quantity <= item.minQuantity ? 'bg-amber-50' : ''}`}>
                                  <TableCell className="font-mono">{item.code}</TableCell>
                                  <TableCell>{item.name}</TableCell>
                                  <TableCell className={item.quantity <= item.minQuantity ? 'text-amber-700 font-semibold' : ''}>{formatNumber(item.quantity)}</TableCell>
                                  <TableCell><MoneyDisplay value={item.unitPrice} lang={lang} size="sm" inline /></TableCell>
                                  <TableCell><MoneyDisplay value={item.quantity * item.unitPrice} lang={lang} size="sm" inline /></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Balance Sheet */}
              {type === 'balance-sheet' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Card className="bg-emerald-50 border-emerald-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي الأصول' : 'Total Assets'}</p>
                        <p className="text-xl font-bold text-emerald-700 mt-1">
                          <MoneyDisplay value={(data as { totalAssets: number }).totalAssets} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-orange-50 border-orange-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-orange-600">{lang === 'ar' ? 'إجمالي الالتزامات' : 'Total Liabilities'}</p>
                        <p className="text-xl font-bold text-orange-700 mt-1">
                          <MoneyDisplay value={(data as { totalLiabilities: number }).totalLiabilities} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-purple-50 border-purple-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-purple-600">{lang === 'ar' ? 'حقوق الملكية' : 'Equity'}</p>
                        <p className="text-xl font-bold text-purple-700 mt-1">
                          <MoneyDisplay value={(data as { totalEquity: number }).totalEquity} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto max-h-96">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50">
                              <TableHead className="text-right">{lang === 'ar' ? 'الرقم' : 'Code'}</TableHead>
                              <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                              <TableHead className="text-right">{lang === 'ar' ? 'النوع' : 'Type'}</TableHead>
                              <TableHead className="text-right">{lang === 'ar' ? 'الرصيد' : 'Balance'}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {((data as { accounts: { code: string; name: string; type: string; balance: number }[] }).accounts).map((a, i) => (
                              <TableRow key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                                <TableCell className="font-mono text-sm">{a.code}</TableCell>
                                <TableCell>{a.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={
                                    a.type === 'ASSET' ? 'bg-emerald-50 text-emerald-700' :
                                    a.type === 'LIABILITY' ? 'bg-orange-50 text-orange-700' :
                                    'bg-purple-50 text-purple-700'
                                  }>
                                    {a.type}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-semibold">
                                  <MoneyDisplay value={a.balance} lang={lang} size="sm" bold inline />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Income Statement */}
              {type === 'income-statement' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Card className="bg-emerald-50 border-emerald-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}</p>
                        <p className="text-xl font-bold text-emerald-700 mt-1">
                          <MoneyDisplay value={(data as { totalRevenue: number }).totalRevenue} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-rose-50 border-rose-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-rose-600">{lang === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}</p>
                        <p className="text-xl font-bold text-rose-700 mt-1">
                          <MoneyDisplay value={(data as { totalExpenses: number }).totalExpenses} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                    <Card className={(data as { netIncome: number }).netIncome >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}>
                      <CardContent className="p-4 text-center">
                        <p className={`text-sm ${(data as { netIncome: number }).netIncome >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {lang === 'ar' ? 'صافي الدخل' : 'Net Income'}
                        </p>
                        <p className={`text-xl font-bold mt-1 ${(data as { netIncome: number }).netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          <MoneyDisplay value={(data as { netIncome: number }).netIncome} lang={lang} size="lg" bold inline />
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto max-h-96">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50">
                              <TableHead className="text-right">{lang === 'ar' ? 'الرقم' : 'Code'}</TableHead>
                              <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                              <TableHead className="text-right">{lang === 'ar' ? 'النوع' : 'Type'}</TableHead>
                              <TableHead className="text-right">{lang === 'ar' ? 'الرصيد' : 'Balance'}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {((data as { accounts: { code: string; name: string; type: string; balance: number }[] }).accounts).map((a, i) => (
                              <TableRow key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                                <TableCell className="font-mono text-sm">{a.code}</TableCell>
                                <TableCell>{a.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={
                                    a.type === 'REVENUE' ? 'bg-emerald-50 text-emerald-700' :
                                    'bg-rose-50 text-rose-700'
                                  }>
                                    {a.type}
                                  </Badge>
                                </TableCell>
                                <TableCell className={`font-semibold ${a.type === 'REVENUE' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  <MoneyDisplay value={a.balance} lang={lang} size="sm" bold inline />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ Main Reports Module ============
export function ReportsModule() {
  const { lang } = useAppStore()
  const [activeReport, setActiveReport] = useState<ReportType | null>(null)

  // Project Card has its own dedicated component
  if (activeReport === 'project-card') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setActiveReport(null)}>
            <ArrowRight className="size-4" />
          </Button>
        </div>
        <ProjectCardReport />
      </div>
    )
  }

  if (activeReport) {
    return <ReportView type={activeReport} onBack={() => setActiveReport(null)} />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'التقارير' : 'Reports'}</h1>
        <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'تقارير شاملة للنظام' : 'Comprehensive system reports'}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportCards.map(card => {
          const Icon = card.icon
          const isProjectCard = card.type === 'project-card'
          return (
            <Card
              key={card.type}
              className={`cursor-pointer transition-all hover:shadow-md ${card.color} ${isProjectCard ? 'ring-2 ring-emerald-300 ring-offset-2' : ''}`}
              onClick={() => setActiveReport(card.type)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`size-12 rounded-full ${card.bgColor} flex items-center justify-center shrink-0`}>
                    <Icon className={`size-6 ${card.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{card.title[lang]}</h3>
                      {isProjectCard && (
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5">
                          {lang === 'ar' ? 'مهم' : 'KEY'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{card.description[lang]}</p>
                    <Button
                      size="sm"
                      variant={isProjectCard ? 'default' : 'ghost'}
                      className={`mt-3 h-8 text-xs gap-1.5 px-3 ${isProjectCard ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setActiveReport(card.type) }}
                    >
                      {lang === 'ar' ? 'عرض التقرير' : 'View Report'}
                      <Eye className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, FileText, Receipt, TrendingUp, ShoppingCart,
  Package, Scale, PieChart, Eye, ArrowRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useAppStore, formatSAR, formatDate, formatNumber } from '@/stores/app-store'

// ============ Report Types ============
type ReportType = 'projects' | 'claims' | 'expenses' | 'sales' | 'purchases' | 'inventory' | 'balance-sheet' | 'income-statement'

interface ReportCard {
  type: ReportType
  icon: React.ElementType
  title: { ar: string; en: string }
  description: { ar: string; en: string }
  color: string; bgColor: string; iconColor: string
}

const reportCards: ReportCard[] = [
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

// ============ Report View Component ============
function ReportView({ type, onBack }: { type: ReportType; onBack: () => void }) {
  const { lang } = useAppStore()

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div className={`size-10 rounded-full ${card.bgColor} flex items-center justify-center`}>
          <Icon className={`size-5 ${card.iconColor}`} />
        </div>
        <div>
          <h2 className="text-xl font-bold">{card.title[lang]}</h2>
          <p className="text-sm text-muted-foreground">{card.description[lang]}</p>
        </div>
        <Button variant="outline" size="icon" className="mr-auto" onClick={() => refetch()}>
          <Eye className="size-4" />
        </Button>
      </div>

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
                      <TableRow>
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
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-muted-foreground">{p.client}</TableCell>
                          <TableCell>{formatSAR(p.contractValue, lang)}</TableCell>
                          <TableCell className="text-rose-700">{formatSAR(p.totalCosts, lang)}</TableCell>
                          <TableCell className="text-emerald-700">{formatSAR(p.totalRevenue, lang)}</TableCell>
                          <TableCell className={p.profit >= 0 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                            {formatSAR(p.profit, lang)}
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
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'رقم المستخلص' : 'Claim No.'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'المشروع' : 'Project'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'العقد' : 'Contract'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'النسبة' : 'Percentage'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data as { claimNo: string; project: { name: string }; contract: { contractNo: string }; percentage: number; totalAmount: number; status: string }[]).map((c: { claimNo: string; project: { name: string }; contract: { contractNo: string }; percentage: number; totalAmount: number; status: string }, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono">{c.claimNo}</TableCell>
                          <TableCell>{c.project.name}</TableCell>
                          <TableCell className="text-muted-foreground">{c.contract.contractNo}</TableCell>
                          <TableCell>{formatNumber(c.percentage)}%</TableCell>
                          <TableCell className="font-semibold">{formatSAR(c.totalAmount, lang)}</TableCell>
                          <TableCell><Badge variant="outline" className="bg-gray-50">{c.status}</Badge></TableCell>
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
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}</p>
                    <p className="text-xl font-bold text-emerald-700">{formatSAR((data as { totalExpenses: number }).totalExpenses, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-amber-600">{lang === 'ar' ? 'عدد الفئات' : 'Categories'}</p>
                    <p className="text-xl font-bold text-amber-700">{formatNumber(Object.keys((data as { byCategory: Record<string, number> }).byCategory).length)}</p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">{lang === 'ar' ? 'تفصيل حسب الفئة' : 'Breakdown by Category'}</h3>
                  <div className="space-y-2">
                    {Object.entries((data as { byCategory: Record<string, number> }).byCategory).map(([cat, amount]) => (
                      <div key={cat} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <span className="font-medium">{cat}</span>
                        <span className="font-semibold text-emerald-700">{formatSAR(amount, lang)}</span>
                      </div>
                    ))}
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
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</p>
                    <p className="text-xl font-bold text-emerald-700">{formatSAR((data as { totalSales: number }).totalSales, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-teal-50 border-teal-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-teal-600">{lang === 'ar' ? 'المدفوع' : 'Paid'}</p>
                    <p className="text-xl font-bold text-teal-700">{formatSAR((data as { totalPaid: number }).totalPaid, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-amber-600">{lang === 'ar' ? 'المستحق' : 'Outstanding'}</p>
                    <p className="text-xl font-bold text-amber-700">{formatSAR((data as { totalOutstanding: number }).totalOutstanding, lang)}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Purchases Report */}
          {type === 'purchases' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-emerald-50 border-emerald-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-emerald-600">{lang === 'ar' ? 'أوامر الشراء' : 'Purchase Orders'}</p>
                    <p className="text-lg font-bold text-emerald-700">{formatSAR((data as { totalPOs: number }).totalPOs, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-rose-50 border-rose-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-rose-600">{lang === 'ar' ? 'فواتير الشراء' : 'Purchase Invoices'}</p>
                    <p className="text-lg font-bold text-rose-700">{formatSAR((data as { totalPIs: number }).totalPIs, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-teal-50 border-teal-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-teal-600">{lang === 'ar' ? 'المدفوع' : 'Paid'}</p>
                    <p className="text-lg font-bold text-teal-700">{formatSAR((data as { totalPaid: number }).totalPaid, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-amber-600">{lang === 'ar' ? 'المستحق' : 'Outstanding'}</p>
                    <p className="text-lg font-bold text-amber-700">{formatSAR((data as { totalOutstanding: number }).totalOutstanding, lang)}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Inventory Report */}
          {type === 'inventory' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="bg-emerald-50 border-emerald-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي الأصناف' : 'Total Items'}</p>
                    <p className="text-xl font-bold text-emerald-700">{formatNumber((data as { totalItems: number }).totalItems)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-teal-50 border-teal-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-teal-600">{lang === 'ar' ? 'قيمة المخزون' : 'Stock Value'}</p>
                    <p className="text-xl font-bold text-teal-700">{formatSAR((data as { totalValue: number }).totalValue, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-amber-600">{lang === 'ar' ? 'أصناف منخفضة' : 'Low Stock'}</p>
                    <p className="text-xl font-bold text-amber-700">{formatNumber((data as { lowStockCount: number }).lowStockCount)}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Balance Sheet */}
          {type === 'balance-sheet' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="bg-emerald-50 border-emerald-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي الأصول' : 'Total Assets'}</p>
                    <p className="text-xl font-bold text-emerald-700">{formatSAR((data as { totalAssets: number }).totalAssets, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 border-orange-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-orange-600">{lang === 'ar' ? 'إجمالي الالتزامات' : 'Total Liabilities'}</p>
                    <p className="text-xl font-bold text-orange-700">{formatSAR((data as { totalLiabilities: number }).totalLiabilities, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-purple-600">{lang === 'ar' ? 'حقوق الملكية' : 'Equity'}</p>
                    <p className="text-xl font-bold text-purple-700">{formatSAR((data as { totalEquity: number }).totalEquity, lang)}</p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    {((data as { accounts: { code: string; name: string; type: string; balance: number }[] }).accounts).map((a, i) => (
                      <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-muted-foreground">{a.code}</span>
                          <span>{a.name}</span>
                        </div>
                        <span className="font-semibold">{formatSAR(a.balance, lang)}</span>
                      </div>
                    ))}
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
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}</p>
                    <p className="text-xl font-bold text-emerald-700">{formatSAR((data as { totalRevenue: number }).totalRevenue, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-rose-50 border-rose-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-rose-600">{lang === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}</p>
                    <p className="text-xl font-bold text-rose-700">{formatSAR((data as { totalExpenses: number }).totalExpenses, lang)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm text-amber-600">{lang === 'ar' ? 'صافي الدخل' : 'Net Income'}</p>
                    <p className={`text-xl font-bold ${(data as { netIncome: number }).netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatSAR((data as { netIncome: number }).netIncome, lang)}</p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    {((data as { accounts: { code: string; name: string; type: string; balance: number }[] }).accounts).map((a, i) => (
                      <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-muted-foreground">{a.code}</span>
                          <span>{a.name}</span>
                          <Badge variant="outline" className="text-xs">{a.type}</Badge>
                        </div>
                        <span className={`font-semibold ${a.type === 'REVENUE' ? 'text-emerald-700' : 'text-rose-700'}`}>{formatSAR(a.balance, lang)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============ Main Reports Module ============
export function ReportsModule() {
  const { lang } = useAppStore()
  const [activeReport, setActiveReport] = useState<ReportType | null>(null)

  if (activeReport) {
    return <ReportView type={activeReport} onBack={() => setActiveReport(null)} />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'التقارير' : 'Reports'}</h1>
        <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'تقارير شاملة للنظام' : 'Comprehensive system reports'}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {reportCards.map(card => {
          const Icon = card.icon
          return (
            <Card key={card.type} className={`cursor-pointer transition-all hover:shadow-md ${card.color}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`size-10 rounded-full ${card.bgColor} flex items-center justify-center shrink-0`}>
                    <Icon className={`size-5 ${card.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{card.title[lang]}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{card.description[lang]}</p>
                    <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs gap-1 px-2" onClick={() => setActiveReport(card.type)}>
                      {lang === 'ar' ? 'عرض' : 'View'}
                      <Eye className="size-3" />
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

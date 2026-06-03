'use client'

import {
  LayoutDashboard,
  Building2,
  FileText,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
  Users2,
  ClipboardList,
  HardHat,
  Truck,
  Wallet,
  Package,
  Calculator,
  Percent,
  BarChart3,
  Settings,
  FileCheck,
  FileSpreadsheet,
  FileMinus,
  CreditCard,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ModuleKey } from '@/stores/app-store'

interface ModuleInfo {
  label: string
  description: string
  icon: LucideIcon
  color: string
}

const moduleInfoMap: Record<ModuleKey, ModuleInfo> = {
  // Main
  dashboard: {
    label: 'الرئيسية',
    description: 'نظرة شاملة على أداء المشاريع والمتابعة المالية',
    icon: LayoutDashboard,
    color: 'emerald',
  },
  // Equipment Rental
  contracts: {
    label: 'العقود',
    description: 'إدارة عقود إيجار المعدات والاتفاقيات',
    icon: FileText,
    color: 'amber',
  },
  'delivery-orders': {
    label: 'أوامر التوصيل',
    description: 'إدارة أوامر توصيل المعدات للمواقع',
    icon: FileCheck,
    color: 'orange',
  },
  timesheets: {
    label: 'ساعات العمل',
    description: 'تسجيل ومتابعة ساعات عمل المعدات',
    icon: ClipboardList,
    color: 'cyan',
  },
  'rental-invoices': {
    label: 'فواتير الإيجار',
    description: 'إدارة فواتير إيجار المعدات بناءً على العقود',
    icon: FileSpreadsheet,
    color: 'emerald',
  },
  equipment: {
    label: 'المعدات',
    description: 'إدارة المعدات والآليات ومتابعة الصيانة',
    icon: Wrench,
    color: 'slate',
  },
  // Projects
  projects: {
    label: 'المشاريع',
    description: 'إدارة وتتبع جميع المشاريع الحكومية والخاصة',
    icon: Building2,
    color: 'teal',
  },
  'progress-claims': {
    label: 'المستخلصات',
    description: 'إدارة مستخلصات الأعمال والمتابعة المالية',
    icon: TrendingUp,
    color: 'cyan',
  },
  boq: {
    label: 'جدول الكميات',
    description: 'إدارة جداول الكميات والأسعار',
    icon: ClipboardList,
    color: 'sky',
  },
  // Services
  'service-invoices': {
    label: 'فواتير الخدمات',
    description: 'إدارة فواتير الخدمات المقدمة للعملاء',
    icon: CreditCard,
    color: 'teal',
  },
  clients: {
    label: 'العملاء',
    description: 'إدارة بيانات العملاء والمتعاملين',
    icon: Users2,
    color: 'teal',
  },
  // Purchases
  'purchase-orders': {
    label: 'أوامر الشراء',
    description: 'إدارة أوامر شراء المواد والخدمات',
    icon: ShoppingCart,
    color: 'orange',
  },
  'supplier-invoices': {
    label: 'فواتير الموردين',
    description: 'إدارة فواتير الموردين الواردة',
    icon: FileMinus,
    color: 'rose',
  },
  suppliers: {
    label: 'الموردين',
    description: 'إدارة بيانات الموردين والمتعاقدين',
    icon: Truck,
    color: 'amber',
  },
  subcontractors: {
    label: 'مقاولو الباطن',
    description: 'إدارة مقاولي الباطن والعقود الفرعية',
    icon: Users,
    color: 'violet',
  },
  // Costs
  expenses: {
    label: 'المصروفات',
    description: 'تتبع وإدارة المصروفات التشغيلية',
    icon: Receipt,
    color: 'rose',
  },
  labor: {
    label: 'تكاليف العمالة',
    description: 'إدارة تكاليف العمالة والرواتب والمهمات',
    icon: HardHat,
    color: 'yellow',
  },
  advances: {
    label: 'العهد والسلف',
    description: 'إدارة العهد والسلف والمتابعة المالية',
    icon: Wallet,
    color: 'fuchsia',
  },
  'petty-cash': {
    label: 'الصندوق النقدي',
    description: 'إدارة السلف النقدية والمصروفات البسيطة',
    icon: Wallet,
    color: 'lime',
  },
  // Accounting
  accounting: {
    label: 'المحاسبة',
    description: 'القيود المحاسبية والتقارير المالية',
    icon: Calculator,
    color: 'emerald',
  },
  vat: {
    label: 'ضريبة القيمة المضافة',
    description: 'إدارة ضريبة القيمة المضافة والإقرارات الضريبية',
    icon: Percent,
    color: 'red',
  },
  // Inventory
  inventory: {
    label: 'المخزون',
    description: 'إدارة المخزون والمستودعات وحركة المواد',
    icon: Package,
    color: 'sky',
  },
  // Reports & Settings
  reports: {
    label: 'التقارير',
    description: 'التقارير والإحصائيات الشاملة',
    icon: BarChart3,
    color: 'purple',
  },
  settings: {
    label: 'الإعدادات',
    description: 'إعدادات النظام والتخصيص',
    icon: Settings,
    color: 'gray',
  },
  // Legacy
  sales: {
    label: 'فواتير الخدمات',
    description: 'إدارة فواتير الخدمات والعملاء',
    icon: Receipt,
    color: 'green',
  },
  purchases: {
    label: 'أوامر الشراء',
    description: 'إدارة أوامر الشراء والموردين',
    icon: ShoppingCart,
    color: 'orange',
  },
}

const colorMap: Record<string, { bg: string; text: string; light: string; border: string }> = {
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-600', light: 'bg-teal-50', border: 'border-teal-200' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600', light: 'bg-amber-50', border: 'border-amber-200' },
  green: { bg: 'bg-green-100', text: 'text-green-600', light: 'bg-green-50', border: 'border-green-200' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-600', light: 'bg-orange-50', border: 'border-orange-200' },
  cyan: { bg: 'bg-cyan-100', text: 'text-cyan-600', light: 'bg-cyan-50', border: 'border-cyan-200' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600', light: 'bg-violet-50', border: 'border-violet-200' },
  blue: { bg: 'bg-sky-100', text: 'text-sky-600', light: 'bg-sky-50', border: 'border-sky-200' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-600', light: 'bg-rose-50', border: 'border-rose-200' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600', light: 'bg-yellow-50', border: 'border-yellow-200' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600', light: 'bg-slate-50', border: 'border-slate-200' },
  lime: { bg: 'bg-lime-100', text: 'text-lime-600', light: 'bg-lime-50', border: 'border-lime-200' },
  fuchsia: { bg: 'bg-fuchsia-100', text: 'text-fuchsia-600', light: 'bg-fuchsia-50', border: 'border-fuchsia-200' },
  sky: { bg: 'bg-sky-100', text: 'text-sky-600', light: 'bg-sky-50', border: 'border-sky-200' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600', light: 'bg-indigo-50', border: 'border-indigo-200' },
  red: { bg: 'bg-red-100', text: 'text-red-600', light: 'bg-red-50', border: 'border-red-200' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-600', light: 'bg-purple-50', border: 'border-purple-200' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-600', light: 'bg-gray-50', border: 'border-gray-200' },
}

export function ModulePlaceholder({ moduleKey }: { moduleKey: ModuleKey }) {
  const info = moduleInfoMap[moduleKey]
  const colors = colorMap[info.color] || colorMap.emerald
  const Icon = info.icon

  return (
    <div className="flex h-full items-center justify-center">
      <Card className={`w-full max-w-lg border ${colors.border} ${colors.light}`}>
        <CardHeader className="items-center text-center">
          <div className={`flex size-16 items-center justify-center rounded-2xl ${colors.bg}`}>
            <Icon className={`size-8 ${colors.text}`} />
          </div>
          <CardTitle className="mt-4 text-2xl">{info.label}</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground leading-relaxed">
            {info.description}
          </p>
          <div className={`mt-6 inline-flex items-center gap-2 rounded-full ${colors.bg} px-4 py-2`}>
            <div className={`size-2 rounded-full ${colors.text} bg-current animate-pulse`} />
            <span className={`text-sm font-medium ${colors.text}`}>قيد التطوير</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

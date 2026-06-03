'use client'

import {
  LayoutDashboard,
  Building2,
  Users,
  Truck,
  Warehouse,
  KeyRound,
  Wallet,
  Handshake,
  BarChart3,
  Settings,
  type LucideIcon,
  HardHat,
  ClipboardList,
  FileText,
  Clock,
  FileSpreadsheet,
  ShoppingCart,
  CreditCard,
  Calculator,
  Percent,
  Package,
  UserCheck,
  FileCheck,
  Briefcase,
  PieChart,
  Landmark,
  Receipt,
  Banknote,
  BookOpen,
  TrendingUp,
  FileMinus,
  Users2,
  Wrench,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SubModuleKey } from '@/stores/app-store'
import { subModuleLabels } from '@/stores/app-store'
import { useAppStore } from '@/stores/app-store'

interface ModuleInfo {
  description: string
  icon: LucideIcon
  color: string
}

const moduleInfoMap: Record<string, ModuleInfo> = {
  // Resources
  'employees': { description: 'إدارة بيانات الموظفين والموارد البشرية', icon: Users, color: 'teal' },
  'employee-contracts': { description: 'إدارة عقود الموظفين والاتفاقيات', icon: FileText, color: 'amber' },
  'employee-attendance': { description: 'تسجيل ومتابعة حضور الموظفين', icon: Clock, color: 'cyan' },
  'employee-salaries': { description: 'إدارة الرواتب والمستحقات', icon: Banknote, color: 'emerald' },
  'equipment-list': { description: 'إدارة المعدات والآليات', icon: Wrench, color: 'slate' },
  'equipment-operations': { description: 'متابعة عمليات تشغيل المعدات', icon: Settings, color: 'orange' },
  'equipment-maintenance': { description: 'جدولة ومتابعة صيانة المعدات', icon: Wrench, color: 'yellow' },
  'equipment-fuel': { description: 'تتبع استهلاك الوقود للمعدات', icon: Receipt, color: 'red' },
  'teams': { description: 'إدارة فرق العمل وتشكيلها', icon: Users2, color: 'violet' },
  'team-assignments': { description: 'توزيع الموارد على المشاريع', icon: ClipboardList, color: 'sky' },
  'resource-distribution': { description: 'توزيع الموارد وتحسين استخدامها', icon: PieChart, color: 'purple' },
  // Supply Chain
  'purchase-requests': { description: 'إدارة طلبات الشراء والاعتمادات', icon: FileCheck, color: 'orange' },
  'goods-receipt': { description: 'إدارة استلام البضائع والمواد', icon: Package, color: 'sky' },
  // Finance extras
  'treasury': { description: 'إدارة الخزينة والسيولة النقدية', icon: Landmark, color: 'emerald' },
  'banks': { description: 'إدارة الحسابات البنكية والتحويلات', icon: Building2, color: 'teal' },
  'checks': { description: 'إدارة الشيكات الواردة والصادرة', icon: CreditCard, color: 'cyan' },
  'receivables': { description: 'متابعة الذمم المدينة والتحصيلات', icon: TrendingUp, color: 'green' },
  'payables': { description: 'متابعة الذمم الدائنة والمدفوعات', icon: FileMinus, color: 'rose' },
  'fixed-assets': { description: 'إدارة الأصول الثابتة وتتبعها', icon: Building2, color: 'amber' },
  'depreciation': { description: 'حساب وتتبع إهلاك الأصول', icon: Calculator, color: 'orange' },
  'budgets': { description: 'إعداد ومتابعة الموازنات التقديرية', icon: PieChart, color: 'purple' },
  'cash-flow': { description: 'تحليل وتوقعات التدفق النقدي', icon: TrendingUp, color: 'cyan' },
  // CRM extras
  'opportunities': { description: 'تتبع الفرص التجارية والمشتريات', icon: TrendingUp, color: 'teal' },
  'quotations': { description: 'إدارة عروض الأسعار والتسعير', icon: FileText, color: 'amber' },
  'follow-ups': { description: 'متابعة العملاء والتنبيهات', icon: Clock, color: 'sky' },
  // Default fallback
  'default': { description: 'هذا القسم قيد التطوير', icon: LayoutDashboard, color: 'gray' },
}

const colorMap: Record<string, { bg: string; text: string; light: string; border: string }> = {
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-600', light: 'bg-teal-50', border: 'border-teal-200' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600', light: 'bg-amber-50', border: 'border-amber-200' },
  green: { bg: 'bg-green-100', text: 'text-green-600', light: 'bg-green-50', border: 'border-green-200' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-600', light: 'bg-orange-50', border: 'border-orange-200' },
  cyan: { bg: 'bg-cyan-100', text: 'text-cyan-600', light: 'bg-cyan-50', border: 'border-cyan-200' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600', light: 'bg-violet-50', border: 'border-violet-200' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-600', light: 'bg-rose-50', border: 'border-rose-200' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600', light: 'bg-yellow-50', border: 'border-yellow-200' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600', light: 'bg-slate-50', border: 'border-slate-200' },
  sky: { bg: 'bg-sky-100', text: 'text-sky-600', light: 'bg-sky-50', border: 'border-sky-200' },
  red: { bg: 'bg-red-100', text: 'text-red-600', light: 'bg-red-50', border: 'border-red-200' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-600', light: 'bg-purple-50', border: 'border-purple-200' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-600', light: 'bg-gray-50', border: 'border-gray-200' },
}

export function ModulePlaceholder({ moduleKey }: { moduleKey: SubModuleKey | string }) {
  const { lang } = useAppStore()
  const info = moduleInfoMap[moduleKey] || moduleInfoMap['default']
  const colors = colorMap[info.color] || colorMap.emerald
  const Icon = info.icon
  const labelText = (moduleKey as SubModuleKey) in subModuleLabels
    ? subModuleLabels[moduleKey as SubModuleKey][lang]
    : moduleKey

  return (
    <div className="flex h-full items-center justify-center">
      <Card className={`w-full max-w-lg border ${colors.border} ${colors.light}`}>
        <CardHeader className="items-center text-center">
          <div className={`flex size-16 items-center justify-center rounded-2xl ${colors.bg}`}>
            <Icon className={`size-8 ${colors.text}`} />
          </div>
          <CardTitle className="mt-4 text-2xl">{labelText}</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground leading-relaxed">
            {info.description}
          </p>
          <div className={`mt-6 inline-flex items-center gap-2 rounded-full ${colors.bg} px-4 py-2`}>
            <div className={`size-2 rounded-full ${colors.text} bg-current animate-pulse`} />
            <span className={`text-sm font-medium ${colors.text}`}>
              {lang === 'ar' ? 'قيد التطوير' : 'Under Development'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

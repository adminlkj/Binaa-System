'use client'

// ============================================================================
// Unified Expenses Module — نظام بِنَاء ERP
// ----------------------------------------------------------------------------
// Single screen consolidating ALL expense operations into internal sections:
//   1. وقود (Fuel)               → FUEL_EXPENSE
//   2. صيانة (Maintenance)        → MAINTENANCE_EXPENSE
//   3. نقل (Transport)            → TRANSPORT_EXPENSE
//   4. سائقين (Drivers)           → DRIVER_EXPENSE
//   5. تشغيلية (Operations)       → PROJECT_COST + SUBCONTRACTOR_COST
//   6. إدارية (Administrative)    → ADMIN_EXPENSE + PAYROLL_EXPENSE + GOSI_EXPENSE
//                                    + DEPRECIATION_EXPENSE + ZAKAT_EXPENSE
//                                    + RENTAL_DEPRECIATION
//   7. عامة (General / Other)     → fallback for all other expense accounts
//
// Each section exposes a role-based account dropdown fetched via
// /api/accounts/by-role?role=<ROLES>. The same shared form handles every
// section, providing flexible linking (Project / Equipment / Cost Center /
// Employee / Company), a VAT toggle, payment account selection, and a live
// journal-entry preview.
//
// Journal Entry (created server-side via buildExpenseJournalEntryWithExplicitAccounts):
//   Dr: Selected expense account (role-based)        — amount
//   Dr: VAT_INPUT account (1410)                     — vatAmount (if VAT on)
//   Cr: Payment account (CASH or BANK role)          — totalAmount
// ============================================================================

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Receipt, Plus, Search, RefreshCw, TrendingUp,
  Building2, Briefcase, Download, Landmark, Wallet, Banknote,
  Target, CheckCircle2, Fuel as FuelIcon, Wrench, Truck, Users,
  Cog, FileCog, FolderOpen, User as UserIcon, Building,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { ProjectTypeBadge } from '@/components/shared/project-type-badge'
import { AccountingEntryDisplay } from '@/components/shared/accounting-entry-display'
import { AccountSelector } from '@/components/shared/account-selector'
import { JePreview, type JePreviewLine } from '@/components/shared/je-preview'

// ============ Types ============
interface ProjectOption { id: string; code: string; name: string }
interface EquipmentOption { id: string; code: string; name: string; nameAr: string | null }
interface EmployeeOption { id: string; code: string; name: string; nameAr: string | null }
interface CostCenterOption { id: string; code: string; name: string; parentId: string | null }

interface Expense {
  id: string
  projectId: string | null
  equipmentId: string | null
  costCenterId?: string | null
  expenseType: string
  activityType: string
  category: string
  description: string
  amount: number
  vatRate: number
  vatAmount: number | null
  totalAmount: number
  date: string
  reference: string | null
  payFrom: string
  attachmentPath: string | null
  journalEntryId: string | null
  project: { id: string; code: string; name: string; projectType?: string } | null
  equipment: { id: string; code: string; name: string; nameAr: string | null } | null
  costCenter?: { id: string; code: string; name: string } | null
}

// ============ Bilingual Helper ============
const t = (lang: 'ar' | 'en', ar: string, en: string) => lang === 'ar' ? ar : en

// ============ Section Configuration ============
export type ExpenseSection =
  | 'fuel'
  | 'maintenance'
  | 'transport'
  | 'drivers'
  | 'operations'
  | 'administrative'
  | 'general'

interface SectionConfig {
  key: ExpenseSection
  labelAr: string
  labelEn: string
  icon: React.ElementType
  roles: string[]                          // account roles for the dropdown
  categories: string[]                     // ExpenseCategory values mapped to this section
  color: string                            // tailwind base color (emerald, rose, etc.)
  descriptionAr: string
  descriptionEn: string
  defaultLinkType: LinkType                // sensible default link for the section
}

type LinkType = 'COMPANY' | 'PROJECT' | 'EQUIPMENT' | 'COST_CENTER' | 'EMPLOYEE'

const SECTIONS: SectionConfig[] = [
  {
    key: 'fuel',
    labelAr: 'وقود',
    labelEn: 'Fuel',
    icon: FuelIcon,
    roles: ['FUEL_EXPENSE'],
    categories: ['FUEL'],
    color: 'rose',
    descriptionAr: 'تكاليف وقود المعدات والآليات والمركبات',
    descriptionEn: 'Fuel costs for equipment, machinery, and vehicles',
    defaultLinkType: 'EQUIPMENT',
  },
  {
    key: 'maintenance',
    labelAr: 'صيانة',
    labelEn: 'Maintenance',
    icon: Wrench,
    roles: ['MAINTENANCE_EXPENSE'],
    categories: ['MAINTENANCE'],
    color: 'orange',
    descriptionAr: 'تكاليف صيانة المعدات والآليات والمركبات',
    descriptionEn: 'Maintenance costs for equipment, machinery, and vehicles',
    defaultLinkType: 'EQUIPMENT',
  },
  {
    key: 'transport',
    labelAr: 'نقل',
    labelEn: 'Transport',
    icon: Truck,
    roles: ['TRANSPORT_EXPENSE'],
    categories: ['TRANSPORT', 'DELIVERY'],
    color: 'teal',
    descriptionAr: 'تكاليف نقل المعدات والآليات وال materials',
    descriptionEn: 'Transportation and delivery costs',
    defaultLinkType: 'PROJECT',
  },
  {
    key: 'drivers',
    labelAr: 'سائقين',
    labelEn: 'Drivers',
    icon: Users,
    roles: ['DRIVER_EXPENSE'],
    categories: ['DRIVERS'],
    color: 'lime',
    descriptionAr: 'تكاليف السائقين ورواتبهم ومستلزماتهم',
    descriptionEn: 'Driver costs, salaries, and allowances',
    defaultLinkType: 'EMPLOYEE',
  },
  {
    key: 'operations',
    labelAr: 'مصروفات تشغيلية',
    labelEn: 'Operations',
    icon: Cog,
    roles: ['PROJECT_COST', 'SUBCONTRACTOR_COST'],
    categories: ['CONSUMABLES', 'SERVICES', 'RENT', 'INSURANCE', 'PERMITS'],
    color: 'amber',
    descriptionAr: 'تكاليف المشاريع المباشرة والمقاولين من الباطن والمواد الاستهلاكية',
    descriptionEn: 'Direct project costs, subcontractors, and consumables',
    defaultLinkType: 'PROJECT',
  },
  {
    key: 'administrative',
    labelAr: 'مصروفات إدارية',
    labelEn: 'Administrative',
    icon: Briefcase,
    roles: ['ADMIN_EXPENSE', 'PAYROLL_EXPENSE', 'GOSI_EXPENSE', 'DEPRECIATION_EXPENSE', 'ZAKAT_EXPENSE', 'RENTAL_DEPRECIATION'],
    categories: ['SALARIES', 'INTERNET', 'ELECTRICITY', 'WATER', 'MANAGEMENT_CARS', 'OFFICE', 'HOSPITALITY'],
    color: 'violet',
    descriptionAr: 'المصروفات الإدارية والعمومية والرواتب والإهلاك والزكاة',
    descriptionEn: 'Administrative, payroll, depreciation, and zakat expenses',
    defaultLinkType: 'COMPANY',
  },
  {
    key: 'general',
    labelAr: 'مصروفات عامة',
    labelEn: 'General / Other',
    icon: FolderOpen,
    roles: [], // Fallback: fetch ALL expense accounts (filtered client-side to exclude those already covered)
    categories: ['OTHER'],
    color: 'gray',
    descriptionAr: 'أي حسابات مصروفات أخرى غير مصنّفة ضمن الأقسام السابقة',
    descriptionEn: 'Any other expense accounts not covered by the previous sections',
    defaultLinkType: 'COMPANY',
  },
]

const SECTION_MAP: Record<ExpenseSection, SectionConfig> =
  SECTIONS.reduce((acc, s) => { acc[s.key] = s; return acc }, {} as Record<ExpenseSection, SectionConfig>)

// All expense roles for the "general" fallback dropdown (every EXPENSE account that allows posting)
const ALL_EXPENSE_ROLES = [
  'FUEL_EXPENSE', 'MAINTENANCE_EXPENSE', 'DRIVER_EXPENSE', 'TRANSPORT_EXPENSE',
  'PROJECT_COST', 'SUBCONTRACTOR_COST', 'ADMIN_EXPENSE', 'PAYROLL_EXPENSE',
  'GOSI_EXPENSE', 'DEPRECIATION_EXPENSE', 'ZAKAT_EXPENSE', 'RENTAL_DEPRECIATION',
]

// Reverse map: category → section key (used to bucket returned expenses into tabs)
const CATEGORY_TO_SECTION: Record<string, ExpenseSection> = (() => {
  const map: Record<string, ExpenseSection> = {}
  for (const section of SECTIONS) {
    for (const cat of section.categories) {
      // Only assign the first section that claims a category (avoids transport stealing OTHER from general)
      if (!map[cat]) map[cat] = section.key
    }
  }
  return map
})()

// Map accountRole → ExpenseCategory (used when account is selected in the form)
const ACCOUNT_ROLE_TO_CATEGORY: Record<string, string> = {
  FUEL_EXPENSE: 'FUEL',
  MAINTENANCE_EXPENSE: 'MAINTENANCE',
  DRIVER_EXPENSE: 'DRIVERS',
  TRANSPORT_EXPENSE: 'TRANSPORT',
  PROJECT_COST: 'CONSUMABLES',
  SUBCONTRACTOR_COST: 'SERVICES',
  PAYROLL_EXPENSE: 'SALARIES',
  GOSI_EXPENSE: 'SALARIES',
  ADMIN_EXPENSE: 'OTHER',
  DEPRECIATION_EXPENSE: 'OTHER',
  ZAKAT_EXPENSE: 'OTHER',
  RENTAL_DEPRECIATION: 'OTHER',
}

// Bilingual labels for the ExpenseCategory enum values
const categoryLabels: Record<string, { ar: string; en: string }> = {
  RENT: { ar: 'إيجارات', en: 'Rent' },
  MAINTENANCE: { ar: 'صيانة', en: 'Maintenance' },
  TRANSPORT: { ar: 'نقل', en: 'Transport' },
  DELIVERY: { ar: 'توصيل', en: 'Delivery' },
  CONSUMABLES: { ar: 'مواد استهلاكية', en: 'Consumables' },
  SERVICES: { ar: 'خدمات', en: 'Services' },
  INSURANCE: { ar: 'تأمين', en: 'Insurance' },
  FUEL: { ar: 'وقود', en: 'Fuel' },
  PERMITS: { ar: 'تصاريح', en: 'Permits' },
  OFFICE: { ar: 'قرطاسية', en: 'Office' },
  HOSPITALITY: { ar: 'ضيافة', en: 'Hospitality' },
  OTHER: { ar: 'أخرى', en: 'Other' },
  SALARIES: { ar: 'رواتب', en: 'Salaries' },
  INTERNET: { ar: 'إنترنت', en: 'Internet' },
  ELECTRICITY: { ar: 'كهرباء', en: 'Electricity' },
  WATER: { ar: 'مياه', en: 'Water' },
  MANAGEMENT_CARS: { ar: 'سيارات الإدارة', en: 'Management Cars' },
  DRIVERS: { ar: 'سائقين', en: 'Drivers' },
}

const categoryColors: Record<string, string> = {
  RENT: 'bg-blue-100 text-blue-700',
  MAINTENANCE: 'bg-orange-100 text-orange-700',
  TRANSPORT: 'bg-teal-100 text-teal-700',
  DELIVERY: 'bg-cyan-100 text-cyan-700',
  CONSUMABLES: 'bg-amber-100 text-amber-700',
  SERVICES: 'bg-purple-100 text-purple-700',
  INSURANCE: 'bg-green-100 text-green-700',
  FUEL: 'bg-rose-100 text-rose-700',
  DRIVERS: 'bg-lime-100 text-lime-700',
  PERMITS: 'bg-emerald-100 text-emerald-700',
  OFFICE: 'bg-gray-100 text-gray-700',
  HOSPITALITY: 'bg-pink-100 text-pink-700',
  OTHER: 'bg-gray-100 text-gray-600',
  SALARIES: 'bg-emerald-100 text-emerald-700',
  INTERNET: 'bg-sky-100 text-sky-700',
  ELECTRICITY: 'bg-yellow-100 text-yellow-700',
  WATER: 'bg-blue-100 text-blue-700',
  MANAGEMENT_CARS: 'bg-violet-100 text-violet-700',
}

// Bilingual labels for payment-method / link-type selectors
const payFromLabels: Record<string, { ar: string; en: string; icon: React.ElementType }> = {
  TREASURY: { ar: 'الخزينة', en: 'Treasury', icon: Landmark },
  BANK: { ar: 'البنك', en: 'Bank', icon: Banknote },
  PETTY_CASH: { ar: 'الصندوق النقدي', en: 'Petty Cash', icon: Wallet },
}

const linkTypeLabels: Record<LinkType, { ar: string; en: string; icon: React.ElementType }> = {
  COMPANY: { ar: 'خاص بالشركة', en: 'Company / General', icon: Building },
  PROJECT: { ar: 'مشروع', en: 'Project', icon: Building2 },
  EQUIPMENT: { ar: 'معدة', en: 'Equipment', icon: Cog },
  COST_CENTER: { ar: 'مركز تكلفة', en: 'Cost Center', icon: Target },
  EMPLOYEE: { ar: 'موظف', en: 'Employee', icon: UserIcon },
}

// Color helper for section badges & accents
const sectionColorMap: Record<string, { bg: string; text: string; border: string; soft: string }> = {
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    soft: 'bg-rose-100' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  soft: 'bg-orange-100' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    soft: 'bg-teal-100' },
  lime:    { bg: 'bg-lime-50',    text: 'text-lime-700',    border: 'border-lime-200',    soft: 'bg-lime-100' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   soft: 'bg-amber-100' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  soft: 'bg-violet-100' },
  gray:    { bg: 'bg-gray-50',    text: 'text-gray-700',    border: 'border-gray-200',    soft: 'bg-gray-100' },
}

// ============ Skeleton ============
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Helper: determine section for a fetched expense ============
function getExpenseSection(expense: Expense): ExpenseSection {
  // 1. Try by category
  const byCategory = CATEGORY_TO_SECTION[expense.category]
  if (byCategory) return byCategory
  // 2. Fallback: project expenses → operations, internal → administrative, otherwise general
  if (expense.expenseType === 'PROJECT') return 'operations'
  if (expense.expenseType === 'INTERNAL') return 'administrative'
  return 'general'
}

// ============ Expense Form Dialog (unified, shared across all sections) ============
interface ExpenseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: ExpenseSection
  projects: ProjectOption[]
  equipment: EquipmentOption[]
  employees: EmployeeOption[]
  costCenters: CostCenterOption[]
}

function ExpenseFormDialog({
  open, onOpenChange, section, projects, equipment, employees, costCenters,
}: ExpenseFormDialogProps) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const sectionCfg = SECTION_MAP[section]
  const colorCfg = sectionColorMap[sectionCfg.color]

  // Form state
  const [linkType, setLinkType] = useState<LinkType>(sectionCfg.defaultLinkType)
  const [projectId, setProjectId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [vatEnabled, setVatEnabled] = useState(true)
  const [date, setDate] = useState(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })
  const [reference, setReference] = useState('')

  // Account selection (role-based dropdown)
  const [expenseAccountId, setExpenseAccountId] = useState<string | null>(null)
  const [expenseAccountCode, setExpenseAccountCode] = useState('')
  const [expenseAccountNameAr, setExpenseAccountNameAr] = useState('')
  const [expenseAccountRole, setExpenseAccountRole] = useState<string | null>(null)

  // Payment account (CASH / BANK)
  const [payingAccountId, setPayingAccountId] = useState<string | null>(null)
  const [payingAccountCode, setPayingAccountCode] = useState('')
  const [payingAccountName, setPayingAccountName] = useState('')
  const [payFrom, setPayFrom] = useState('TREASURY')

  // NOTE: Form state is initialized via useState's initial values. When the dialog
  // closes and re-opens, the parent passes a fresh `key` prop that forces React to
  // remount this component — guaranteeing a clean form without any setState-in-effect.

  // Computed amounts
  const parsedAmount = parseFloat(amount) || 0
  const vatRate = vatEnabled ? 0.15 : 0
  const autoVat = useMemo(() => Math.round(parsedAmount * vatRate * 100) / 100, [parsedAmount, vatRate])
  const totalAmount = useMemo(() => Math.round((parsedAmount + autoVat) * 100) / 100, [parsedAmount, autoVat])

  // Determine the role list for the account dropdown
  // - For 'general' section: show all expense roles (the user picks any)
  // - For named sections: show only that section's roles
  const dropdownRoles = section === 'general' ? ALL_EXPENSE_ROLES : sectionCfg.roles

  // Auto-derive category from the selected account role
  const derivedCategory = useMemo(() => {
    if (!expenseAccountRole) {
      // Fallback by section: pick the section's primary category
      return sectionCfg.categories[0] || 'OTHER'
    }
    return ACCOUNT_ROLE_TO_CATEGORY[expenseAccountRole] || sectionCfg.categories[0] || 'OTHER'
  }, [expenseAccountRole, sectionCfg])

  // Determine expenseType (PROJECT vs INTERNAL) from the linkType / account code prefix
  const expenseType = useMemo<string>(() => {
    if (linkType === 'PROJECT' && projectId) return 'PROJECT'
    if (linkType === 'EQUIPMENT' && equipmentId) return 'PROJECT'
    // For company / cost center / employee → INTERNAL
    return 'INTERNAL'
  }, [linkType, projectId, equipmentId])

  // Build a synthetic reference string when an employee is selected (Expense model has no employeeId)
  const effectiveReference = useMemo(() => {
    const parts: string[] = []
    if (reference) parts.push(reference)
    if (linkType === 'EMPLOYEE' && employeeId) {
      const emp = employees.find(e => e.id === employeeId)
      if (emp) {
        const name = emp.nameAr || emp.name
        parts.push(`Employee: ${name} (${emp.code})`)
      }
    }
    return parts.join(' | ')
  }, [reference, linkType, employeeId, employees])

  // Live journal-entry preview lines
  const jeLines = useMemo<JePreviewLine[]>(() => {
    if (parsedAmount <= 0 || !expenseAccountId || !payingAccountId) return []
    const lines: JePreviewLine[] = []
    lines.push({
      accountCode: expenseAccountCode,
      accountNameAr: expenseAccountNameAr,
      debit: parsedAmount,
      credit: 0,
    })
    if (autoVat > 0) {
      lines.push({
        accountCode: '1410',
        accountNameAr: 'ضريبة مدخلات',
        debit: autoVat,
        credit: 0,
      })
    }
    lines.push({
      accountCode: payingAccountCode,
      accountNameAr: payingAccountName,
      debit: 0,
      credit: totalAmount,
    })
    return lines
  }, [parsedAmount, autoVat, totalAmount, expenseAccountId, expenseAccountCode, expenseAccountNameAr, payingAccountId, payingAccountCode, payingAccountName])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => {
        if (!r.ok) {
          return r.json().then(err => { throw new Error(err.error || err.details || 'Failed') })
        }
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expenses-by-section'] })
      onOpenChange(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate the selected link
    if (linkType === 'PROJECT' && !projectId) {
      alert(t(lang, 'الرجاء اختيار المشروع', 'Please select a project'))
      return
    }
    if (linkType === 'EQUIPMENT' && !equipmentId) {
      alert(t(lang, 'الرجاء اختيار المعدة', 'Please select equipment'))
      return
    }
    if (linkType === 'COST_CENTER' && !costCenterId) {
      alert(t(lang, 'الرجاء اختيار مركز التكلفة', 'Please select a cost center'))
      return
    }
    if (linkType === 'EMPLOYEE' && !employeeId) {
      alert(t(lang, 'الرجاء اختيار الموظف', 'Please select an employee'))
      return
    }

    const isProject = expenseType === 'PROJECT'
    createMutation.mutate({
      projectId: isProject ? (projectId || null) : null,
      equipmentId: linkType === 'EQUIPMENT' ? equipmentId : null,
      costCenterId: costCenterId || (linkType === 'COST_CENTER' ? costCenterId : null) || undefined,
      expenseType,
      activityType: 'GENERAL',
      category: derivedCategory,
      description,
      amount: parsedAmount,
      vatRate,
      vatAmount: autoVat || null,
      totalAmount,
      date,
      reference: effectiveReference || null,
      payFrom,
      // Account-based fields → server uses buildExpenseJournalEntryWithExplicitAccounts
      accountId: expenseAccountId,
      payingAccountId,
      payingAccountCode,
      payingAccountName,
      expenseAccountCode,
      expenseAccountNameAr,
    })
  }

  const linkTypeOptions: { value: LinkType; label: string; icon: React.ElementType }[] = [
    { value: 'COMPANY',    label: t(lang, 'خاص بالشركة', 'Company / General'), icon: Building },
    { value: 'PROJECT',    label: t(lang, 'مشروع', 'Project'),                 icon: Building2 },
    { value: 'EQUIPMENT',  label: t(lang, 'معدة', 'Equipment'),                icon: Cog },
    { value: 'COST_CENTER',label: t(lang, 'مركز تكلفة', 'Cost Center'),        icon: Target },
    { value: 'EMPLOYEE',   label: t(lang, 'موظف', 'Employee'),                 icon: UserIcon },
  ]

  const SubmitDisabled =
    createMutation.isPending ||
    !expenseAccountId ||
    !payingAccountId ||
    !description ||
    !amount ||
    !date ||
    (linkType === 'PROJECT' && !projectId) ||
    (linkType === 'EQUIPMENT' && !equipmentId) ||
    (linkType === 'COST_CENTER' && !costCenterId) ||
    (linkType === 'EMPLOYEE' && !employeeId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`inline-flex size-8 items-center justify-center rounded-lg ${colorCfg.soft} ${colorCfg.text}`}>
              <sectionCfg.icon className="size-4" />
            </span>
            {t(lang, `مصروف جديد — ${sectionCfg.labelAr}`, `New Expense — ${sectionCfg.labelEn}`)}
          </DialogTitle>
          <DialogDescription>
            {t(lang, sectionCfg.descriptionAr, sectionCfg.descriptionEn)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Section info banner */}
          <div className={`flex items-start gap-2 rounded-lg ${colorCfg.bg} border ${colorCfg.border} px-3 py-2.5`}>
            <AlertCircle className={`size-4 ${colorCfg.text} shrink-0 mt-0.5`} />
            <p className={`text-xs ${colorCfg.text}`}>
              {t(lang,
                'اختر الحساب المتعلق بهذا القسم من القائمة المنسدلة أدناه. سيُنشأ القيد المحاسبي تلقائياً عند الحفظ.',
                'Pick the account relevant to this section from the dropdown below. The journal entry will be created automatically on save.'
              )}
            </p>
          </div>

          {/* ─── 1. Link type selector ─────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t(lang, 'نوع الربط', 'Link Type')}
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {linkTypeOptions.map(opt => {
                const Icon = opt.icon
                const isActive = linkType === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLinkType(opt.value)}
                    className={`flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                      isActive
                        ? `${colorCfg.bg} ${colorCfg.border} ${colorCfg.text} ring-1 ring-current/30`
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="size-4" />
                    <span className="text-center leading-tight">{opt.label}</span>
                  </button>
                )
              })}
            </div>
            {linkType === 'COMPANY' && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Building className="size-3" />
                {t(lang,
                  'سيُسجّل المصروف كمصروف عام للشركة بدون ربط بمشروع أو معدة أو مركز تكلفة.',
                  'The expense will be recorded as a company-wide general expense with no project/equipment/cost-center link.'
                )}
              </p>
            )}
          </div>

          {/* ─── 2. Conditional selector for the chosen link type ──── */}
          {linkType === 'PROJECT' && (
            <div className="space-y-2">
              <Label>{t(lang, 'المشروع *', 'Project *')}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر المشروع', 'Select project')} /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {linkType === 'EQUIPMENT' && (
            <div className="space-y-2">
              <Label>{t(lang, 'المعدة *', 'Equipment *')}</Label>
              <Select value={equipmentId} onValueChange={setEquipmentId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر المعدة', 'Select equipment')} /></SelectTrigger>
                <SelectContent>
                  {equipment.map(e => <SelectItem key={e.id} value={e.id}>{e.nameAr || e.name} ({e.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {linkType === 'COST_CENTER' && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Target className="size-3.5 text-muted-foreground" />
                {t(lang, 'مركز التكلفة *', 'Cost Center *')}
              </Label>
              <Select value={costCenterId} onValueChange={setCostCenterId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر مركز التكلفة', 'Select cost center')} /></SelectTrigger>
                <SelectContent>
                  {costCenters.map(cc => (
                    <SelectItem key={cc.id} value={cc.id}>
                      <span className="font-mono text-xs ml-1">{cc.code}</span> — {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {linkType === 'EMPLOYEE' && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <UserIcon className="size-3.5 text-muted-foreground" />
                {t(lang, 'الموظف *', 'Employee *')}
              </Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(lang, 'اختر الموظف', 'Select employee')} /></SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      <span className="font-mono text-xs ml-1">{emp.code}</span> — {emp.nameAr || emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="size-3" />
                {t(lang,
                  'سيُحفظ اسم الموظف في حقل المرجع نظراً لأن نموذج المصروف لا يحتوي على حقل employeeId.',
                  'The employee name will be saved in the reference field since the Expense model has no employeeId column.'
                )}
              </p>
            </div>
          )}

          {/* ─── 3. Expense Account selector (role-based) ──────────── */}
          <AccountSelector
            roles={dropdownRoles}
            value={expenseAccountId}
            onValueChange={(id, account) => {
              setExpenseAccountId(id)
              setExpenseAccountCode(account.code)
              setExpenseAccountNameAr(account.nameAr || account.name)
              setExpenseAccountRole(account.accountRole)
            }}
            label={t(lang, 'حساب المصروف *', 'Expense Account *')}
            placeholder={t(lang, 'اختر حساب المصروف...', 'Select expense account...')}
          />
          {expenseAccountId && (
            <div className={`flex items-center gap-2 rounded-lg ${colorCfg.bg} border ${colorCfg.border} px-3 py-2`}>
              <span className="font-mono text-xs bg-white text-gray-700 px-1.5 py-0.5 rounded border">{expenseAccountCode}</span>
              <span className={`text-sm ${colorCfg.text}`}>{expenseAccountNameAr}</span>
              {expenseAccountRole && (
                <Badge variant="outline" className={`text-[10px] ${colorCfg.text} ${colorCfg.border} bg-white ml-auto`}>
                  {expenseAccountRole}
                </Badge>
              )}
            </div>
          )}

          {/* ─── 4. Description + Amount + VAT toggle ──────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'الوصف *', 'Description *')}</Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t(lang, 'وصف المصروف', 'Expense description')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'المبلغ *', 'Amount *')}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                dir="ltr"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'التاريخ *', 'Date *')}</Label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
            </div>
            {/* VAT toggle */}
            <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${vatEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <Switch
                  checked={vatEnabled}
                  onCheckedChange={setVatEnabled}
                />
                <div>
                  <p className="text-sm font-medium">
                    {t(lang, 'ضريبة القيمة المضافة (15%)', 'Value Added Tax (15%)')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {vatEnabled
                      ? t(lang, 'يُحسب 15% ضريبة وتُسجّل في حساب ضريبة المدخلات (1410)', '15% VAT calculated and posted to Input VAT account (1410)')
                      : t(lang, 'بدون ضريبة — المصروف معفى أو غير خاضع للضريبة', 'No VAT — expense is exempt or non-taxable')}
                  </p>
                </div>
              </div>
              {vatEnabled && parsedAmount > 0 && (
                <div className="text-left">
                  <p className="text-xs text-emerald-700">{t(lang, 'الضريبة', 'VAT')}</p>
                  <p className="font-bold text-emerald-700">
                    <MoneyDisplay value={autoVat} lang={lang} size="sm" inline showSymbol={false} />
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'المرجع', 'Reference')}</Label>
              <Input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder={t(lang, 'رقم المرجع / الفاتورة', 'Reference / invoice no.')}
              />
            </div>
          </div>

          {/* ─── 5. Payment account (CASH / BANK) ──────────────────── */}
          <AccountSelector
            roles={['CASH', 'BANK']}
            value={payingAccountId}
            onValueChange={(id, account) => {
              setPayingAccountId(id)
              setPayingAccountCode(account.code)
              setPayingAccountName(account.nameAr || account.name)
              if (account.accountRole === 'BANK') setPayFrom('BANK')
              else if (account.accountRole === 'CASH') setPayFrom('PETTY_CASH')
              else setPayFrom('TREASURY')
            }}
            label={t(lang, 'حساب السداد *', 'Payment Account *')}
            placeholder={t(lang, 'اختر حساب السداد...', 'Select payment account...')}
          />

          {/* ─── 6. JE preview ─────────────────────────────────────── */}
          <JePreview lines={jeLines} />

          {/* ─── 7. Total summary ──────────────────────────────────── */}
          {parsedAmount > 0 && (
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t(lang, 'المبلغ', 'Amount')}</span>
                  <span className="font-medium"><MoneyDisplay value={parsedAmount} lang={lang} size="sm" /></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t(lang, `الضريبة (${vatEnabled ? '15' : '0'}%)`, `VAT (${vatEnabled ? '15' : '0'}%)`)}</span>
                  <span className="font-medium"><MoneyDisplay value={autoVat} lang={lang} size="sm" /></span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>{t(lang, 'الإجمالي', 'Total')}</span>
                  <span className="text-emerald-700"><MoneyDisplay value={totalAmount} lang={lang} bold size="md" /></span>
                </div>
              </CardContent>
            </Card>
          )}

          {createMutation.isError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
              {t(lang, 'خطأ: ', 'Error: ')}{(createMutation.error as Error)?.message || t(lang, 'فشل في حفظ المصروف', 'Failed to save expense')}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t(lang, 'إلغاء', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={SubmitDisabled}
              className={`gap-2 ${colorCfg.bg.replace('50', '600')} hover:opacity-90 text-white`}
            >
              <Plus className="size-4" />
              {createMutation.isPending
                ? t(lang, 'جاري الحفظ...', 'Saving...')
                : t(lang, 'حفظ المصروف', 'Save Expense')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Expenses Module ============
export function ExpensesModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const [activeSection, setActiveSection] = useState<ExpenseSection>('fuel')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [vatFilter, setVatFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  // Counter that increments each time the dialog opens — used as a React `key`
  // on the form so it remounts with a fresh state on every open.
  const [dialogKey, setDialogKey] = useState(0)
  const openDialog = () => { setDialogKey(k => k + 1); setDialogOpen(true) }

  // Fetch ALL expenses once and bucket client-side into sections.
  // This avoids N round-trips (one per section) and gives us full summary cards.
  const { data: expenses = [], isLoading, isError, refetch } = useQuery<Expense[]>({
    queryKey: ['expenses'],
    queryFn: async () => {
      const res = await fetch('/api/expenses')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['projects-list'],
    queryFn: async () => {
      const res = await fetch('/api/projects/list')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: equipment = [] } = useQuery<EquipmentOption[]>({
    queryKey: ['equipment-list'],
    queryFn: async () => {
      const res = await fetch('/api/equipment')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['employees-list-active'],
    queryFn: async () => {
      const res = await fetch('/api/employees?active=true')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: costCenters = [] } = useQuery<CostCenterOption[]>({
    queryKey: ['cost-centers-list'],
    queryFn: async () => {
      const res = await fetch('/api/cost-centers')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Bucket expenses by section (memoized for performance)
  const expensesBySection = useMemo(() => {
    const map: Record<ExpenseSection, Expense[]> = {
      fuel: [], maintenance: [], transport: [], drivers: [],
      operations: [], administrative: [], general: [],
    }
    for (const exp of expenses) {
      const section = getExpenseSection(exp)
      map[section].push(exp)
    }
    return map
  }, [expenses])

  const sectionCfg = SECTION_MAP[activeSection]
  const colorCfg = sectionColorMap[sectionCfg.color]

  // Apply filters to the active section's expenses
  const filtered = useMemo(() => {
    const sectionExpenses = expensesBySection[activeSection] || []
    return sectionExpenses.filter(exp => {
      const matchProject = projectFilter === 'all' || exp.projectId === projectFilter
      const matchVat =
        vatFilter === 'all' ||
        (vatFilter === 'with' && (exp.vatAmount ?? 0) > 0) ||
        (vatFilter === 'without' && (exp.vatAmount ?? 0) === 0)
      const matchSearch =
        !search ||
        exp.description.toLowerCase().includes(search.toLowerCase()) ||
        (exp.project?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (exp.equipment?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (exp.reference || '').toLowerCase().includes(search.toLowerCase()) ||
        (categoryLabels[exp.category]?.[lang] || '').toLowerCase().includes(search.toLowerCase())
      return matchProject && matchVat && matchSearch
    })
  }, [expensesBySection, activeSection, search, projectFilter, vatFilter, lang])

  // ── Summary computations ────────────────────────────────────────────
  const totalAllExpenses = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.totalAmount), 0),
    [expenses]
  )

  const sectionTotals = useMemo(() => {
    const totals: Record<ExpenseSection, { count: number; amount: number; total: number }> = {
      fuel: { count: 0, amount: 0, total: 0 },
      maintenance: { count: 0, amount: 0, total: 0 },
      transport: { count: 0, amount: 0, total: 0 },
      drivers: { count: 0, amount: 0, total: 0 },
      operations: { count: 0, amount: 0, total: 0 },
      administrative: { count: 0, amount: 0, total: 0 },
      general: { count: 0, amount: 0, total: 0 },
    }
    for (const exp of expenses) {
      const s = getExpenseSection(exp)
      totals[s].count += 1
      totals[s].amount += Number(exp.amount)
      totals[s].total += Number(exp.totalAmount)
    }
    return totals
  }, [expenses])

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const thisMonthTotal = useMemo(
    () => expenses
      .filter(e => {
        const d = new Date(e.date)
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
      })
      .reduce((s, e) => s + Number(e.totalAmount), 0),
    [expenses, currentMonth, currentYear]
  )

  // ── Export handler (active section) ─────────────────────────────────
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'section',       label: t(lang, 'القسم', 'Section') },
      { key: 'category',      label: t(lang, 'الفئة', 'Category'), format: v => categoryLabels[v as string]?.[lang] || String(v) },
      { key: 'description',   label: t(lang, 'الوصف', 'Description') },
      { key: 'projectName',   label: t(lang, 'المشروع', 'Project') },
      { key: 'equipmentName', label: t(lang, 'المعدة', 'Equipment') },
      { key: 'amount',        label: t(lang, 'المبلغ', 'Amount'),   format: v => (Number(v) || 0).toFixed(2) },
      { key: 'vatAmount',     label: t(lang, 'الضريبة', 'VAT'),     format: v => v ? (Number(v) || 0).toFixed(2) : '' },
      { key: 'totalAmount',   label: t(lang, 'الإجمالي', 'Total'),  format: v => (Number(v) || 0).toFixed(2) },
      { key: 'payFrom',       label: t(lang, 'السداد من', 'Pay From'), format: v => payFromLabels[v as string]?.[lang] || String(v) },
      { key: 'date',          label: t(lang, 'التاريخ', 'Date') },
      { key: 'reference',     label: t(lang, 'المرجع', 'Reference') },
    ]
    const rows = filtered.map(exp => ({
      section: sectionCfg[lang],
      category: exp.category,
      description: exp.description,
      projectName: exp.project?.name || '',
      equipmentName: exp.equipment ? (exp.equipment.nameAr || exp.equipment.name) : '',
      amount: exp.amount,
      vatAmount: exp.vatAmount,
      totalAmount: exp.totalAmount,
      payFrom: exp.payFrom,
      date: formatDate(exp.date, lang),
      reference: exp.reference || '',
    }))
    exportToCSV(rows, `expenses-${activeSection}-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  // ── Print data for the active section ───────────────────────────────
  const printData = useMemo(() => ({
    columns: [
      { key: 'category',    label: lang === 'ar' ? 'الفئة'    : 'Category' },
      { key: 'description', label: lang === 'ar' ? 'الوصف'    : 'Description' },
      { key: 'project',     label: lang === 'ar' ? 'المرتبط'  : 'Linked To' },
      { key: 'amount',      label: lang === 'ar' ? 'المبلغ'   : 'Amount' },
      { key: 'totalAmount', label: lang === 'ar' ? 'الإجمالي' : 'Total' },
      { key: 'date',        label: lang === 'ar' ? 'التاريخ'  : 'Date' },
    ],
    rows: filtered.map(exp => ({
      category: categoryLabels[exp.category]?.[lang] || exp.category,
      description: exp.description,
      project: exp.project?.name || (exp.equipment ? (exp.equipment.nameAr || exp.equipment.name) : (lang === 'ar' ? 'عام' : 'General')),
      amount: exp.amount,
      totalAmount: exp.totalAmount,
      date: formatDate(exp.date, lang),
    })),
    infoItems: [
      { label: lang === 'ar' ? 'القسم' : 'Section', value: lang === 'ar' ? sectionCfg.labelAr : sectionCfg.labelEn },
      { label: lang === 'ar' ? 'عدد السجلات' : 'Records', value: String(filtered.length) },
      { label: lang === 'ar' ? 'الإجمالي' : 'Total', value: filtered.reduce((s, e) => s + Number(e.totalAmount), 0).toFixed(2) },
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
    ],
  }), [filtered, lang, sectionCfg])

  const PayFromBadge = ({ value }: { value: string }) => {
    const config = payFromLabels[value]
    if (!config) return <span>{value}</span>
    const Icon = config.icon
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Icon className="size-3" />
        {config[lang]}
      </Badge>
    )
  }

  return (
    <ModuleLayout
      title={{ ar: 'المصروفات', en: 'Expenses' }}
      subtitle={{
        ar: 'شاشة موحدة لجميع المصروفات: وقود، صيانة، نقل، سائقين، تشغيلية، إدارية، وعامة',
        en: 'Unified screen for all expenses: fuel, maintenance, transport, drivers, operations, administrative, and general',
      }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="expense-report" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport} title={t(lang, 'تصدير CSV', 'Export CSV')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t(lang, 'تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button
            className={`gap-2 ${colorCfg.bg.replace('50', '600')} hover:opacity-90 text-white`}
            onClick={openDialog}
          >
            <Plus className="size-4" />
            {t(lang, 'مصروف جديد', 'New Expense')}
          </Button>
        </div>
      }
    >
      {/* ── Summary cards (4) ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Receipt className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{t(lang, 'إجمالي المصروفات', 'Total Expenses')}</p>
              <MoneyDisplay value={totalAllExpenses} lang={lang} bold size="lg" className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>

        <Card className={`${colorCfg.bg} ${colorCfg.border}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`size-10 rounded-full ${colorCfg.soft} flex items-center justify-center`}>
              <sectionCfg.icon className={`size-5 ${colorCfg.text}`} />
            </div>
            <div>
              <p className={`text-sm ${colorCfg.text}`}>
                {t(lang, `القسم النشط: ${sectionCfg.labelAr}`, `Active Section: ${sectionCfg.labelEn}`)}
              </p>
              <MoneyDisplay
                value={sectionTotals[activeSection].total}
                lang={lang}
                bold
                size="lg"
                className={colorCfg.text}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Briefcase className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600">{t(lang, 'مصروفات إدارية', 'Administrative')}</p>
              <MoneyDisplay
                value={sectionTotals.administrative.total}
                lang={lang}
                bold
                size="lg"
                className="text-amber-700"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-gray-100 flex items-center justify-center">
              <TrendingUp className="size-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">{t(lang, 'هذا الشهر', 'This Month')}</p>
              <MoneyDisplay value={thisMonthTotal} lang={lang} bold size="lg" className="text-gray-700" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Section tabs ───────────────────────────────────────────── */}
      <Tabs
        value={activeSection}
        onValueChange={v => {
          setActiveSection(v as ExpenseSection)
          setProjectFilter('all')
          setVatFilter('all')
          setSearch('')
        }}
      >
        <TabsList className="w-full flex-wrap h-auto justify-start gap-1 p-1">
          {SECTIONS.map(sec => {
            const Icon = sec.icon
            const c = sectionColorMap[sec.color]
            const isActive = activeSection === sec.key
            return (
              <TabsTrigger
                key={sec.key}
                value={sec.key}
                className={`gap-1.5 flex-1 sm:flex-none px-3 py-1.5 ${isActive ? `${c.bg} ${c.text}` : ''}`}
              >
                <Icon className="size-4" />
                <span>{t(lang, sec.labelAr, sec.labelEn)}</span>
                <Badge variant="outline" className={`text-[10px] ml-1 ${c.text} ${c.border} ${c.bg}`}>
                  {sectionTotals[sec.key].count}
                </Badge>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {/* Single TabsContent shared across all sections — content adapts to activeSection */}
        <TabsContent value={activeSection}>
          {/* Filters */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder={t(lang,
                      'بحث بالوصف أو المشروع أو المعدة أو المرجع...',
                      'Search by description, project, equipment, or reference...'
                    )}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pr-9"
                  />
                </div>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={t(lang, 'كل المشاريع', 'All Projects')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t(lang, 'كل المشاريع', 'All Projects')}</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={vatFilter} onValueChange={setVatFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder={t(lang, 'الضريبة', 'VAT')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t(lang, 'الكل', 'All')}</SelectItem>
                    <SelectItem value="with">{t(lang, 'مع ضريبة', 'With VAT')}</SelectItem>
                    <SelectItem value="without">{t(lang, 'بدون ضريبة', 'Without VAT')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Section info banner */}
          <div className={`mt-4 flex items-start gap-2 rounded-lg ${colorCfg.bg} border ${colorCfg.border} px-4 py-3`}>
            <sectionCfg.icon className={`size-5 ${colorCfg.text} shrink-0 mt-0.5`} />
            <div>
              <p className={`text-sm font-medium ${colorCfg.text}`}>
                {t(lang, sectionCfg.labelAr, sectionCfg.labelEn)} — {t(lang, sectionCfg.descriptionAr, sectionCfg.descriptionEn)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t(lang,
                  'يتم سحب حسابات هذا القسم تلقائياً من دليل الحسابات بناءً على الأدوار الوظيفية المربوطة.',
                  'Accounts for this section are pulled automatically from the chart of accounts based on their linked functional roles.'
                )}
                {sectionCfg.roles.length > 0 && (
                  <span className="font-mono ml-1">({sectionCfg.roles.join(', ')})</span>
                )}
              </p>
            </div>
          </div>

          {/* Table */}
          <Card className="mt-4">
            <CardContent className="p-0">
              {isLoading ? (
                <TableSkeleton />
              ) : isError ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-rose-600">{t(lang, 'حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
                  <Button variant="outline" onClick={() => refetch()}>{t(lang, 'إعادة المحاولة', 'Retry')}</Button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <sectionCfg.icon className="size-12 text-gray-300" />
                  <p className="text-muted-foreground">
                    {t(lang,
                      `لا توجد مصروفات في قسم ${sectionCfg.labelAr}`,
                      `No expenses in the ${sectionCfg.labelEn} section`
                    )}
                  </p>
                  <Button
                    className={`${colorCfg.bg.replace('50', '600')} hover:opacity-90 text-white`}
                    onClick={openDialog}
                  >
                    <Plus className="size-4 mr-1" />
                    {t(lang, 'إضافة مصروف', 'Add Expense')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead className="text-right">{t(lang, 'الفئة', 'Category')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الوصف', 'Description')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المرتبط بـ', 'Linked To')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المبلغ', 'Amount')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'ضريبة', 'VAT')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'الإجمالي', 'Total')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'السداد من', 'Pay From')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'التاريخ', 'Date')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'المرجع', 'Reference')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'القيد المحاسبي', 'Accounting')}</TableHead>
                        <TableHead className="text-right">{t(lang, 'إجراءات', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(exp => {
                        const sectionForRow = getExpenseSection(exp)
                        const rowColor = sectionColorMap[SECTION_MAP[sectionForRow].color]
                        return (
                          <TableRow key={exp.id}>
                            <TableCell>
                              <Badge className={`${categoryColors[exp.category] || 'bg-gray-100 text-gray-700'} border-0`}>
                                {categoryLabels[exp.category]?.[lang] || exp.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium max-w-xs truncate" title={exp.description}>
                              {exp.description}
                            </TableCell>
                            <TableCell>
                              {exp.project ? (
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                                    <Building2 className="size-3" />
                                    {exp.project.name}
                                  </Badge>
                                  {exp.project.projectType && <ProjectTypeBadge projectType={exp.project.projectType} lang={lang} />}
                                </div>
                              ) : exp.equipment ? (
                                <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200 gap-1">
                                  <Cog className="size-3" />
                                  {exp.equipment.nameAr || exp.equipment.name}
                                </Badge>
                              ) : exp.costCenter ? (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                                  <Target className="size-3" />
                                  {exp.costCenter.name}
                                </Badge>
                              ) : exp.reference?.includes('Employee:') ? (
                                <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 gap-1">
                                  <UserIcon className="size-3" />
                                  {exp.reference.replace(/^.*Employee:\s*/, '').trim()}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-gray-50 text-gray-600 gap-1">
                                  <Building className="size-3" />
                                  {t(lang, 'خاص بالشركة', 'Company')}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <MoneyDisplay value={exp.amount} lang={lang} size="sm" />
                            </TableCell>
                            <TableCell>
                              {(exp.vatAmount ?? 0) > 0 ? (
                                <span className="text-gray-600">
                                  <MoneyDisplay value={exp.vatAmount!} lang={lang} size="sm" />
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">{t(lang, 'بدون', 'None')}</span>
                              )}
                            </TableCell>
                            <TableCell className="font-semibold">
                              <span className={rowColor.text}>
                                <MoneyDisplay value={exp.totalAmount} lang={lang} bold size="sm" />
                              </span>
                            </TableCell>
                            <TableCell><PayFromBadge value={exp.payFrom} /></TableCell>
                            <TableCell className="whitespace-nowrap">{formatDate(exp.date, lang)}</TableCell>
                            <TableCell className="text-muted-foreground text-xs max-w-[180px] truncate" title={exp.reference || ''}>
                              {exp.reference || '—'}
                            </TableCell>
                            <TableCell>
                              <AccountingEntryDisplay journalEntryId={exp.journalEntryId} lang={lang} />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <PrintButton type="expense-report" documentId={exp.id} size="icon" variant="ghost" className="size-8" />
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active section totals footer */}
          {filtered.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="outline" className={`${colorCfg.bg} ${colorCfg.border} ${colorCfg.text} gap-1`}>
                {t(lang, 'عدد السجلات', 'Records')}: <strong>{filtered.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-gray-50 border-gray-200 gap-1">
                {t(lang, 'إجمالي المبلغ', 'Total Amount')}: <strong>{(filtered.reduce((s, e) => s + Number(e.amount), 0)).toFixed(2)}</strong>
              </Badge>
              <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700 gap-1">
                {t(lang, 'الإجمالي مع الضريبة', 'Grand Total')}: <strong>{(filtered.reduce((s, e) => s + Number(e.totalAmount), 0)).toFixed(2)}</strong>
              </Badge>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Form dialog (shared across sections) ───────────────────── */}
      <ExpenseFormDialog
        key={`${activeSection}-${dialogKey}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        section={activeSection}
        projects={projects}
        equipment={equipment}
        employees={employees}
        costCenters={costCenters}
      />

      {/* Quick-link helper: keeps the query cache fresh after mutations */}
      <span className="hidden" data-query-key="expenses-by-section">
        {queryClient.getQueryData(['expenses']) ? '' : 'loading'}
      </span>
    </ModuleLayout>
  )
}

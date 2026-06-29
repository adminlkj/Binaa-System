'use client'

// ============================================================================
// General Expenses Module — نظام بِنَاء ERP
// ----------------------------------------------------------------------------
// RESPONSIBILITY BOUNDARIES (single source of truth):
//
// This screen is the SINGLE entry point ONLY for general/administrative
// expenses that have NO dedicated workflow screen. Specifically:
//
//   ✅ Government fees, Internet, Stationery, Hospitality, Postal, Bank fees,
//      Administrative rent, Office electricity/water, Phone, Insurance
//      (non-payroll), Misc.
//
//   ❌ Fuel            → شاشة الوقود (FuelModule)
//   ❌ Maintenance     → شاشة الصيانة (EquipmentMaintenanceModule)
//   ❌ Salaries        → شاشة الرواتب (SalariesModule / PayrollRunsModule)
//   ❌ Subcontractors  → شاشة مقاولي الباطن (SubcontractorsModule)
//   ❌ Operations      → شاشة التشغيل (EquipmentOperationsModule)
//   ❌ Rentals         → شاشة التأجير (RentalContractsModule)
//   ❌ Labor / Drivers → شاشة تكاليف العمالة (LaborModule)
//   ❌ Advances        → شاشة السلف (AdvancesModule)
//   ❌ Suppliers       → فواتير الموردين (SupplierInvoicesModule)
//
// Historical records created before this boundary (with categories like
// FUEL, MAINTENANCE, DRIVERS, etc.) are still DISPLAYED in the table for
// read-only audit history — but no NEW such records can be created here.
//
// Journal Entry (created server-side via /api/expenses POST):
//   Dr: Selected expense account (ADMIN_EXPENSE role)   — amount
//   Dr: VAT_INPUT account (1410)                        — vatAmount (if VAT on)
//   Cr: Payment account (CASH or BANK role)             — totalAmount
// ============================================================================

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Receipt, Plus, Search, RefreshCw, TrendingUp,
  Building2, Briefcase, Download, Landmark, Wallet, Banknote,
  Target, Building, User as UserIcon,
  AlertCircle, Info, ArrowLeft, FileText,
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

// ============ Categories — RESTRICTED to general/admin expenses ONLY ============
// NOTE: FUEL, MAINTENANCE, DRIVERS, TRANSPORT, DELIVERY, CONSUMABLES, SERVICES,
// SALARIES, PERMITS, MANAGEMENT_CARS are intentionally EXCLUDED — they belong
// to their own specialized screens (see header comment).
const NEW_CATEGORY_OPTIONS: Array<{
  value: string
  labelAr: string
  labelEn: string
}> = [
  { value: 'INTERNET',      labelAr: 'اشتراك إنترنت',     labelEn: 'Internet Subscription' },
  { value: 'ELECTRICITY',   labelAr: 'كهرباء المكتب',     labelEn: 'Office Electricity' },
  { value: 'WATER',         labelAr: 'مياه المكتب',       labelEn: 'Office Water' },
  { value: 'RENT',          labelAr: 'إيجارات إدارية',    labelEn: 'Administrative Rent' },
  { value: 'OFFICE',        labelAr: 'قرطاسية ومستلزمات', labelEn: 'Stationery & Supplies' },
  { value: 'HOSPITALITY',   labelAr: 'ضيافة',             labelEn: 'Hospitality' },
  { value: 'INSURANCE',     labelAr: 'تأمين (غير رواتب)', labelEn: 'Insurance (non-payroll)' },
  { value: 'OTHER',         labelAr: 'مصروفات متنوعة',    labelEn: 'Miscellaneous' },
]

// Default category when opening the form
const DEFAULT_NEW_CATEGORY = 'OTHER'

// Role for the expense-account dropdown (single role — admin expense catch-all)
const EXPENSE_ACCOUNT_ROLES = ['ADMIN_EXPENSE']

// ============ Backwards-compatible labels for DISPLAY ============
// Old records (with FUEL, MAINTENANCE, DRIVERS, etc.) still render correctly
// in the table — they're shown for read-only audit history.
const CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  RENT: { ar: 'إيجارات', en: 'Rent' },
  MAINTENANCE: { ar: 'صيانة', en: 'Maintenance' },
  TRANSPORT: { ar: 'نقل', en: 'Transport' },
  DELIVERY: { ar: 'توصيل', en: 'Delivery' },
  CONSUMABLES: { ar: 'مواد استهلاكية', en: 'Consumables' },
  SERVICES: { ar: 'خدمات', en: 'Services' },
  INSURANCE: { ar: 'تأمين', en: 'Insurance' },
  FUEL: { ar: 'وقود', en: 'Fuel' },
  PERMITS: { ar: 'تصاريح', en: 'Permits' },
  OFFICE: { ar: 'قرطاسية', en: 'Stationery' },
  HOSPITALITY: { ar: 'ضيافة', en: 'Hospitality' },
  OTHER: { ar: 'متنوعة', en: 'Other' },
  SALARIES: { ar: 'رواتب', en: 'Salaries' },
  INTERNET: { ar: 'إنترنت', en: 'Internet' },
  ELECTRICITY: { ar: 'كهرباء', en: 'Electricity' },
  WATER: { ar: 'مياه', en: 'Water' },
  MANAGEMENT_CARS: { ar: 'سيارات الإدارة', en: 'Management Cars' },
  DRIVERS: { ar: 'سائقين', en: 'Drivers' },
}

// Categories that were ONCE allowed here but now belong to specialized screens.
// Records with these categories are flagged with a "redirect" badge in the table
// to help users understand where to enter them going forward.
const SPECIALIZED_CATEGORIES = new Set([
  'FUEL', 'MAINTENANCE', 'DRIVERS', 'TRANSPORT', 'DELIVERY',
  'CONSUMABLES', 'SERVICES', 'SALARIES', 'PERMITS', 'MANAGEMENT_CARS',
])

// Map specialized category → suggested screen name (for the redirect badge)
const SPECIALIZED_SCREEN: Record<string, { ar: string; en: string }> = {
  FUEL: { ar: '← شاشة الوقود', en: '← Fuel screen' },
  MAINTENANCE: { ar: '← شاشة الصيانة', en: '← Maintenance screen' },
  DRIVERS: { ar: '← شاشة تكاليف العمالة', en: '← Labor screen' },
  TRANSPORT: { ar: '← شاشة التشغيل', en: '← Operations screen' },
  DELIVERY: { ar: '← شاشة التشغيل', en: '← Operations screen' },
  CONSUMABLES: { ar: '← شاشة التشغيل', en: '← Operations screen' },
  SERVICES: { ar: '← شاشة مقاولي الباطن', en: '← Subcontractors screen' },
  SALARIES: { ar: '← شاشة الرواتب', en: '← Salaries screen' },
  PERMITS: { ar: '← شاشة المشاريع', en: '← Projects screen' },
  MANAGEMENT_CARS: { ar: '← شاشة المعدات', en: '← Equipment screen' },
}

// Color helper for category badges
const CATEGORY_COLORS: Record<string, string> = {
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

// Payment-method labels
const PAY_FROM_LABELS: Record<string, { ar: string; en: string; icon: React.ElementType }> = {
  TREASURY: { ar: 'الخزينة', en: 'Treasury', icon: Landmark },
  BANK: { ar: 'البنك', en: 'Bank', icon: Banknote },
  PETTY_CASH: { ar: 'الصندوق النقدي', en: 'Petty Cash', icon: Wallet },
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

// ============ Expense Form Dialog (general/admin expenses only) ============
interface ExpenseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: ProjectOption[]
  costCenters: CostCenterOption[]
}

function ExpenseFormDialog({
  open, onOpenChange, projects, costCenters,
}: ExpenseFormDialogProps) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  // Form state
  const [category, setCategory] = useState<string>(DEFAULT_NEW_CATEGORY)
  const [linkType, setLinkType] = useState<'COMPANY' | 'PROJECT' | 'COST_CENTER'>('COMPANY')
  const [projectId, setProjectId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
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

  // Account selection (single ADMIN_EXPENSE role)
  const [expenseAccountId, setExpenseAccountId] = useState<string | null>(null)
  const [expenseAccountCode, setExpenseAccountCode] = useState('')
  const [expenseAccountNameAr, setExpenseAccountNameAr] = useState('')

  // Payment account (CASH / BANK)
  const [payingAccountId, setPayingAccountId] = useState<string | null>(null)
  const [payingAccountCode, setPayingAccountCode] = useState('')
  const [payingAccountName, setPayingAccountName] = useState('')
  const [payFrom, setPayFrom] = useState('TREASURY')

  // Computed amounts
  const parsedAmount = parseFloat(amount) || 0
  const vatRate = vatEnabled ? 0.15 : 0
  const autoVat = useMemo(() => Math.round(parsedAmount * vatRate * 100) / 100, [parsedAmount, vatRate])
  const totalAmount = useMemo(() => Math.round((parsedAmount + autoVat) * 100) / 100, [parsedAmount, autoVat])

  // Determine expenseType (PROJECT vs INTERNAL) from linkType
  const expenseType = useMemo<string>(() => {
    if (linkType === 'PROJECT' && projectId) return 'PROJECT'
    return 'INTERNAL'
  }, [linkType, projectId])

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
    if (linkType === 'COST_CENTER' && !costCenterId) {
      alert(t(lang, 'الرجاء اختيار مركز التكلفة', 'Please select a cost center'))
      return
    }

    const isProject = expenseType === 'PROJECT'
    createMutation.mutate({
      projectId: isProject ? (projectId || null) : null,
      costCenterId: costCenterId || (linkType === 'COST_CENTER' ? costCenterId : null) || undefined,
      expenseType,
      activityType: 'GENERAL',
      category,
      description,
      amount: parsedAmount,
      vatRate,
      vatAmount: autoVat || null,
      totalAmount,
      date,
      reference: reference || null,
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

  const linkTypeOptions: { value: 'COMPANY' | 'PROJECT' | 'COST_CENTER'; label: string; icon: React.ElementType }[] = [
    { value: 'COMPANY',     label: t(lang, 'خاص بالشركة', 'Company / General'),  icon: Building },
    { value: 'PROJECT',     label: t(lang, 'مشروع', 'Project'),                   icon: Building2 },
    { value: 'COST_CENTER', label: t(lang, 'مركز تكلفة', 'Cost Center'),          icon: Target },
  ]

  const SubmitDisabled =
    createMutation.isPending ||
    !expenseAccountId ||
    !payingAccountId ||
    !description ||
    !amount ||
    !date ||
    (linkType === 'PROJECT' && !projectId) ||
    (linkType === 'COST_CENTER' && !costCenterId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <Plus className="size-4" />
            </span>
            {t(lang, 'مصروف عام جديد', 'New General Expense')}
          </DialogTitle>
          <DialogDescription>
            {t(lang,
              'للمصروفات العامة والإدارية التي لا تمتلك شاشة متخصصة. للوقود/الصيانة/الرواتب/المقاولين استخدم شاشاتها الخاصة.',
              'For general & administrative expenses only. For fuel/maintenance/salaries/subcontractors use their dedicated screens.'
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Boundary reminder banner */}
          <div className="flex items-start gap-2 rounded-lg bg-violet-50 border border-violet-200 px-3 py-2.5">
            <Info className="size-4 text-violet-700 shrink-0 mt-0.5" />
            <p className="text-xs text-violet-700">
              {t(lang,
                'هذه الشاشة مخصصة للمصروفات العامة والإدارية فقط. كل مصروف له دورة عمل متخصصة (وقود/صيانة/رواتب/مقاولين/تشغيل/تأجير/عمالة) يُسجَّل من شاشته المختصة لضمان نقطة إدخال واحدة ومصدر واحد للحقيقة.',
                'This screen is for general & administrative expenses only. Any expense with a dedicated workflow (fuel/maintenance/salaries/subcontractors/operations/rentals/labor) must be entered from its own screen — single entry point, single source of truth.'
              )}
            </p>
          </div>

          {/* ─── 1. Category selector ─────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t(lang, 'نوع المصروف *', 'Expense Category *')}
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t(lang, 'اختر نوع المصروف', 'Select category')} />
              </SelectTrigger>
              <SelectContent>
                {NEW_CATEGORY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(lang, opt.labelAr, opt.labelEn)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ─── 2. Link type selector ─────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t(lang, 'الربط بـ', 'Link To')}
            </Label>
            <div className="grid grid-cols-3 gap-2">
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
                        ? 'bg-violet-50 border-violet-200 text-violet-700 ring-1 ring-violet-300'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="size-4" />
                    <span className="text-center leading-tight">{opt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ─── 3. Conditional selector for the chosen link type ──── */}
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

          {/* ─── 4. Expense Account selector (ADMIN_EXPENSE role only) ── */}
          <AccountSelector
            roles={EXPENSE_ACCOUNT_ROLES}
            value={expenseAccountId}
            onValueChange={(id, account) => {
              setExpenseAccountId(id)
              setExpenseAccountCode(account.code)
              setExpenseAccountNameAr(account.nameAr || account.name)
            }}
            label={t(lang, 'حساب المصروف *', 'Expense Account *')}
            placeholder={t(lang, 'اختر حساب المصروف...', 'Select expense account...')}
          />
          {expenseAccountId && (
            <div className="flex items-center gap-2 rounded-lg bg-violet-50 border border-violet-200 px-3 py-2">
              <span className="font-mono text-xs bg-white text-gray-700 px-1.5 py-0.5 rounded border">{expenseAccountCode}</span>
              <span className="text-sm text-violet-700">{expenseAccountNameAr}</span>
              <Badge variant="outline" className="text-[10px] text-violet-700 border-violet-200 bg-white ml-auto">
                ADMIN_EXPENSE
              </Badge>
            </div>
          )}

          {/* ─── 5. Description + Amount + VAT toggle ──────────────── */}
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
                      ? t(lang, '15% ضريبة تُسجّل في حساب ضريبة المدخلات (1410)', '15% VAT posted to Input VAT (1410)')
                      : t(lang, 'بدون ضريبة', 'No VAT')}
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

          {/* ─── 6. Payment account (CASH / BANK) ──────────────────── */}
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

          {/* ─── 7. JE preview ─────────────────────────────────────── */}
          <JePreview lines={jeLines} />

          {/* ─── 8. Total summary ──────────────────────────────────── */}
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
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
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

  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [vatFilter, setVatFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  // Counter that increments each time the dialog opens — used as a React `key`
  // on the form so it remounts with a fresh state on every open.
  const [dialogKey, setDialogKey] = useState(0)
  const openDialog = () => { setDialogKey(k => k + 1); setDialogOpen(true) }

  // Fetch ALL expenses — display them all (backwards-compatible history).
  // New entries are restricted to general categories via the form.
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

  const { data: costCenters = [] } = useQuery<CostCenterOption[]>({
    queryKey: ['cost-centers-list'],
    queryFn: async () => {
      const res = await fetch('/api/cost-centers')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Apply filters
  const filtered = useMemo(() => {
    return expenses.filter(exp => {
      const matchProject = projectFilter === 'all' || exp.projectId === projectFilter
      const matchCategory = categoryFilter === 'all' || exp.category === categoryFilter
      const matchVat =
        vatFilter === 'all' ||
        (vatFilter === 'with' && (exp.vatAmount ?? 0) > 0) ||
        (vatFilter === 'without' && (exp.vatAmount ?? 0) === 0)
      const matchSearch =
        !search ||
        exp.description.toLowerCase().includes(search.toLowerCase()) ||
        (exp.project?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (exp.reference || '').toLowerCase().includes(search.toLowerCase()) ||
        (CATEGORY_LABELS[exp.category]?.[lang] || '').toLowerCase().includes(search.toLowerCase())
      return matchProject && matchCategory && matchVat && matchSearch
    })
  }, [expenses, search, projectFilter, categoryFilter, vatFilter, lang])

  // ── Summary computations ────────────────────────────────────────────
  const totalAllExpenses = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.totalAmount), 0),
    [expenses]
  )

  // Count of "general" expenses (those that belong here) vs "specialized"
  // (those that should be redirected to their own screens)
  const generalCount = useMemo(
    () => expenses.filter(e => !SPECIALIZED_CATEGORIES.has(e.category)).length,
    [expenses]
  )
  const specializedCount = useMemo(
    () => expenses.filter(e => SPECIALIZED_CATEGORIES.has(e.category)).length,
    [expenses]
  )

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

  // ── Export handler ─────────────────────────────────────────
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'category',      label: t(lang, 'الفئة', 'Category'),       format: v => CATEGORY_LABELS[v as string]?.[lang] || String(v) },
      { key: 'description',   label: t(lang, 'الوصف', 'Description') },
      { key: 'projectName',   label: t(lang, 'المشروع', 'Project') },
      { key: 'amount',        label: t(lang, 'المبلغ', 'Amount'),        format: v => (Number(v) || 0).toFixed(2) },
      { key: 'vatAmount',     label: t(lang, 'الضريبة', 'VAT'),          format: v => v ? (Number(v) || 0).toFixed(2) : '' },
      { key: 'totalAmount',   label: t(lang, 'الإجمالي', 'Total'),       format: v => (Number(v) || 0).toFixed(2) },
      { key: 'payFrom',       label: t(lang, 'السداد من', 'Pay From'),   format: v => PAY_FROM_LABELS[v as string]?.[lang] || String(v) },
      { key: 'date',          label: t(lang, 'التاريخ', 'Date') },
      { key: 'reference',     label: t(lang, 'المرجع', 'Reference') },
      { key: 'isSpecialized', label: t(lang, 'متخصص؟', 'Specialized?'),  format: v => v ? t(lang, 'نعم', 'Yes') : t(lang, 'لا', 'No') },
    ]
    const rows = filtered.map(exp => ({
      category: exp.category,
      description: exp.description,
      projectName: exp.project?.name || '',
      amount: exp.amount,
      vatAmount: exp.vatAmount,
      totalAmount: exp.totalAmount,
      payFrom: exp.payFrom,
      date: formatDate(exp.date, lang),
      reference: exp.reference || '',
      isSpecialized: SPECIALIZED_CATEGORIES.has(exp.category),
    }))
    exportToCSV(rows, `general-expenses-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  // ── Print data ──────────────────────────────────────────────
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
      category: CATEGORY_LABELS[exp.category]?.[lang] || exp.category,
      description: exp.description,
      project: exp.project?.name || (lang === 'ar' ? 'عام' : 'General'),
      amount: exp.amount,
      totalAmount: exp.totalAmount,
      date: formatDate(exp.date, lang),
    })),
    infoItems: [
      { label: lang === 'ar' ? 'القسم' : 'Section', value: lang === 'ar' ? 'المصروفات العامة' : 'General Expenses' },
      { label: lang === 'ar' ? 'عدد السجلات' : 'Records', value: String(filtered.length) },
      { label: lang === 'ar' ? 'الإجمالي' : 'Total', value: filtered.reduce((s, e) => s + Number(e.totalAmount), 0).toFixed(2) },
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
    ],
  }), [filtered, lang])

  const PayFromBadge = ({ value }: { value: string }) => {
    const config = PAY_FROM_LABELS[value]
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
      title={{ ar: 'المصروفات العامة', en: 'General Expenses' }}
      subtitle={{
        ar: 'للمصروفات العامة والإدارية فقط (إنترنت، كهرباء، ماء، إيجار، قرطاسية، ضيافة، رسوم متنوعة). المصروفات المتخصصة (وقود/صيانة/رواتب/مقاولين/تشغيل) تُسجَّل من شاشاتها المختصة.',
        en: 'General & administrative expenses only (internet, electricity, water, rent, stationery, hospitality, misc). Specialized expenses (fuel/maintenance/salaries/subcontractors/operations) are entered from their own screens.',
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
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            onClick={openDialog}
          >
            <Plus className="size-4" />
            {t(lang, 'مصروف عام جديد', 'New General Expense')}
          </Button>
        </div>
      }
    >
      {/* ── Responsibility boundaries banner ──────────────────── */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 mb-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {t(lang, 'حدود المسؤولية بين الشاشات', 'Responsibility Boundaries')}
            </p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              {t(lang,
                'هذه الشاشة مخصصة للمصروفات العامة والإدارية فقط. كل مصروف له دورة عمل متخصصة يجب تسجيله من شاشته الخاصة:',
                'This screen is for general & administrative expenses only. Any expense with a dedicated workflow must be entered from its own screen:'
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] gap-1">
                <ArrowLeft className="size-3" />
                {t(lang, 'الوقود → شاشة الوقود', 'Fuel → Fuel screen')}
              </Badge>
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px] gap-1">
                <ArrowLeft className="size-3" />
                {t(lang, 'الصيانة → شاشة الصيانة', 'Maintenance → Maintenance screen')}
              </Badge>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                <ArrowLeft className="size-3" />
                {t(lang, 'الرواتب → شاشة الرواتب', 'Salaries → Salaries screen')}
              </Badge>
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] gap-1">
                <ArrowLeft className="size-3" />
                {t(lang, 'مقاولو الباطن → شاشة المقاولين', 'Subcontractors → Subcontractors screen')}
              </Badge>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] gap-1">
                <ArrowLeft className="size-3" />
                {t(lang, 'التشغيل → شاشة التشغيل', 'Operations → Operations screen')}
              </Badge>
              <Badge variant="outline" className="bg-lime-50 text-lime-700 border-lime-200 text-[10px] gap-1">
                <ArrowLeft className="size-3" />
                {t(lang, 'تكاليف العمالة → شاشة العمالة', 'Labor → Labor screen')}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary cards (4) ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-violet-50 border-violet-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-violet-100 flex items-center justify-center">
              <Receipt className="size-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm text-violet-600">{t(lang, 'إجمالي المصروفات', 'Total Expenses')}</p>
              <MoneyDisplay value={totalAllExpenses} lang={lang} bold size="lg" className="text-violet-700" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <FileText className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{t(lang, 'مصروفات عامة', 'General')}</p>
              <p className="text-2xl font-bold text-emerald-700">{generalCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertCircle className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600">{t(lang, 'متخصصة (تاريخية)', 'Specialized (legacy)')}</p>
              <p className="text-2xl font-bold text-amber-700">{specializedCount}</p>
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

      {/* ── Filters ───────────────────────────────────────────────── */}
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t(lang,
                  'بحث بالوصف أو المشروع أو المرجع...',
                  'Search by description, project, or reference...'
                )}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t(lang, 'كل الفئات', 'All Categories')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(lang, 'كل الفئات', 'All Categories')}</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label[lang]}
                    {SPECIALIZED_CATEGORIES.has(key) && (
                      <span className="text-amber-600 text-[10px] mr-1">★</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {/* ── Table ─────────────────────────────────────────────────── */}
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
              <Receipt className="size-12 text-gray-300" />
              <p className="text-muted-foreground">
                {t(lang, 'لا توجد مصروفات عامة بعد', 'No general expenses yet')}
              </p>
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={openDialog}
              >
                <Plus className="size-4 mr-1" />
                {t(lang, 'إضافة مصروف عام', 'Add General Expense')}
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
                    const isSpecialized = SPECIALIZED_CATEGORIES.has(exp.category)
                    const redirectScreen = SPECIALIZED_SCREEN[exp.category]
                    return (
                      <TableRow key={exp.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge className={`${CATEGORY_COLORS[exp.category] || 'bg-gray-100 text-gray-700'} border-0`}>
                              {CATEGORY_LABELS[exp.category]?.[lang] || exp.category}
                            </Badge>
                            {isSpecialized && redirectScreen && (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] gap-0.5">
                                {redirectScreen[lang]}
                              </Badge>
                            )}
                          </div>
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
                          ) : exp.costCenter ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                              <Target className="size-3" />
                              {exp.costCenter.name}
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
                          <span className="text-violet-700">
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
          <Badge variant="outline" className="bg-violet-50 border-violet-200 text-violet-700 gap-1">
            {t(lang, 'عدد السجلات', 'Records')}: <strong>{filtered.length}</strong>
          </Badge>
          <Badge variant="outline" className="bg-gray-50 border-gray-200 gap-1">
            {t(lang, 'إجمالي المبلغ', 'Total Amount')}: <strong>{(filtered.reduce((s, e) => s + Number(e.amount), 0)).toFixed(2)}</strong>
          </Badge>
          <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700 gap-1">
            {t(lang, 'الإجمالي مع الضريبة', 'Grand Total')}: <strong>{(filtered.reduce((s, e) => s + Number(e.totalAmount), 0)).toFixed(2)}</strong>
          </Badge>
          {specializedCount > 0 && (
            <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 gap-1">
              {t(lang, 'سجلات تاريخية متخصصة', 'Legacy Specialized')}: <strong>{specializedCount}</strong>
            </Badge>
          )}
        </div>
      )}

      {/* ── Form dialog (general expenses only) ───────────────────── */}
      <ExpenseFormDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projects={projects}
        costCenters={costCenters}
      />
    </ModuleLayout>
  )
}

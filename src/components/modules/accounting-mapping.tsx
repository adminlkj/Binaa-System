'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw, ChevronDown, ChevronRight, AlertTriangle,
  CheckCircle2, Link2, Pencil, Shield, TrendingUp,
  BarChart3, Building2, Truck, CreditCard, Users,
  Wallet, Landmark, Banknote, Wrench, Package,
  CircleDollarSign, FileSearch, ArrowRightLeft,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useAppStore, formatNumber } from '@/stores/app-store'
import { ModuleLayout } from '@/components/shared/module-layout'
import { AccountSelector } from '@/components/shared/account-selector'

// ============ Types ============
interface RoleMappingAccount {
  id: string
  code: string
  name: string
  nameAr: string | null
}

interface RoleMappingItem {
  role: string
  labelAr: string
  labelEn: string
  description: string
  defaultCodes: string[]
  accounts: RoleMappingAccount[]
  primaryAccount: RoleMappingAccount | null
}

interface ValidationResponse {
  isValid: boolean
  totalRoles: number
  mappedCount: number
  unmappedCount: number
  unmappedRoles: {
    role: string
    labelAr: string
    labelEn: string
    description: string
    defaultCodes: string[]
    error: string
  }[]
  message: string
}

// ============ Helpers ============
function t(ar: string, en: string, lang: 'ar' | 'en') {
  return lang === 'ar' ? ar : en
}

// ============ Operation Groups ============
// This defines the BUSINESS OPERATIONS perspective - grouping by operation type
// rather than by account type (which is what the Role Mapping tab does)

interface OperationGroup {
  key: string
  letter: string
  labelAr: string
  labelEn: string
  icon: React.ElementType
  color: string
  operations: {
    labelAr: string
    labelEn: string
    role: string
    expectedAccountAr: string
    expectedAccountEn: string
  }[]
}

const operationGroups: OperationGroup[] = [
  {
    key: 'revenue',
    letter: 'أ',
    labelAr: 'الإيرادات',
    labelEn: 'Revenue',
    icon: TrendingUp,
    color: 'emerald',
    operations: [
      { labelAr: 'إيراد التأجير', labelEn: 'Rental Revenue', role: 'RENTAL_REVENUE', expectedAccountAr: '6210 - إيرادات تأجير المعدات', expectedAccountEn: '6210 - Equipment Rental Revenue' },
      { labelAr: 'إيراد النقل', labelEn: 'Transport Revenue', role: 'RENTAL_REVENUE', expectedAccountAr: '6220 - إيرادات نقل وتوصيل', expectedAccountEn: '6220 - Transport & Delivery Revenue' },
      { labelAr: 'إيراد المشاريع', labelEn: 'Project Revenue', role: 'PROJECT_REVENUE', expectedAccountAr: '6110 - إيرادات المستخلصات', expectedAccountEn: '6110 - Progress Claims Revenue' },
      { labelAr: 'إيراد الخدمات', labelEn: 'Service Revenue', role: 'SERVICE_REVENUE', expectedAccountAr: '6340 - إيرادات خدمات', expectedAccountEn: '6340 - Service Revenue' },
    ],
  },
  {
    key: 'receivables-payables',
    letter: 'ب',
    labelAr: 'الذمم',
    labelEn: 'Receivables/Payables',
    icon: Users,
    color: 'sky',
    operations: [
      { labelAr: 'العملاء', labelEn: 'Customers', role: 'CUSTOMER_AR', expectedAccountAr: '1210 - عملاء', expectedAccountEn: '1210 - Customers' },
      { labelAr: 'الموردون', labelEn: 'Suppliers', role: 'SUPPLIER_AP', expectedAccountAr: '3210 - موردون', expectedAccountEn: '3210 - Suppliers' },
      { labelAr: 'مقاولو الباطن', labelEn: 'Subcontractors', role: 'SUBCONTRACTOR_AP', expectedAccountAr: '3220 - مقاولو الباطن', expectedAccountEn: '3220 - Subcontractors' },
      { labelAr: 'الاحتجازات', labelEn: 'Retentions', role: 'RETENTION_RECEIVABLE', expectedAccountAr: '1220 - مبالغ محتجزة', expectedAccountEn: '1220 - Retention Amounts' },
    ],
  },
  {
    key: 'cash-banks',
    letter: 'ج',
    labelAr: 'النقدية والبنوك',
    labelEn: 'Cash & Banks',
    icon: Landmark,
    color: 'teal',
    operations: [
      { labelAr: 'الخزينة', labelEn: 'Treasury', role: 'CASH', expectedAccountAr: '1110 - الصندوق', expectedAccountEn: '1110 - Cash' },
      { labelAr: 'البنك', labelEn: 'Bank', role: 'BANK', expectedAccountAr: '1120 - البنوك', expectedAccountEn: '1120 - Banks' },
      { labelAr: 'الصندوق النقدي', labelEn: 'Petty Cash', role: 'CASH', expectedAccountAr: '1130 - الصندوق النقدي', expectedAccountEn: '1130 - Petty Cash' },
    ],
  },
  {
    key: 'direct-costs',
    letter: 'د',
    labelAr: 'التكاليف المباشرة',
    labelEn: 'Direct Costs',
    icon: Wrench,
    color: 'orange',
    operations: [
      { labelAr: 'تكاليف المشاريع', labelEn: 'Project Costs', role: 'PROJECT_COST', expectedAccountAr: '7110 - تكاليف المواد', expectedAccountEn: '7110 - Material Costs' },
      { labelAr: 'مقاولو الباطن', labelEn: 'Subcontractor Costs', role: 'SUBCONTRACTOR_COST', expectedAccountAr: '7130 - تكاليف مقاولي الباطن', expectedAccountEn: '7130 - Subcontractor Costs' },
      { labelAr: 'الوقود', labelEn: 'Fuel', role: 'FUEL_EXPENSE', expectedAccountAr: '7210 - وقود المعدات', expectedAccountEn: '7210 - Equipment Fuel' },
      { labelAr: 'الصيانة', labelEn: 'Maintenance', role: 'MAINTENANCE_EXPENSE', expectedAccountAr: '7220 - صيانة المعدات', expectedAccountEn: '7220 - Equipment Maintenance' },
      { labelAr: 'السائقين', labelEn: 'Drivers', role: 'DRIVER_EXPENSE', expectedAccountAr: '7230 - تكاليف السائقين', expectedAccountEn: '7230 - Driver Costs' },
      { labelAr: 'النقل', labelEn: 'Transport', role: 'TRANSPORT_EXPENSE', expectedAccountAr: '7240 - تكاليف نقل المعدات', expectedAccountEn: '7240 - Equipment Transport' },
      { labelAr: 'إهلاك التأجير', labelEn: 'Rental Depreciation', role: 'RENTAL_DEPRECIATION', expectedAccountAr: '7250 - إهلاك معدات التأجير', expectedAccountEn: '7250 - Rental Equipment Depreciation' },
    ],
  },
  {
    key: 'operating-expenses',
    letter: 'هـ',
    labelAr: 'المصروفات التشغيلية',
    labelEn: 'Operating Expenses',
    icon: Building2,
    color: 'amber',
    operations: [
      { labelAr: 'الرواتب', labelEn: 'Payroll', role: 'PAYROLL_EXPENSE', expectedAccountAr: '8110 - رواتب وأجور', expectedAccountEn: '8110 - Salaries & Wages' },
      { labelAr: 'التأمينات', labelEn: 'GOSI', role: 'GOSI_EXPENSE', expectedAccountAr: '8210 - تأمينات اجتماعية', expectedAccountEn: '8210 - Social Insurance' },
      { labelAr: 'إدارية', labelEn: 'Administrative', role: 'ADMIN_EXPENSE', expectedAccountAr: 'غير مربوط', expectedAccountEn: 'Unmapped' },
      { labelAr: 'إهلاك', labelEn: 'Depreciation', role: 'DEPRECIATION_EXPENSE', expectedAccountAr: '8310 - إهلاك معدات إنشاء', expectedAccountEn: '8310 - Construction Equipment Depreciation' },
      { labelAr: 'الزكاة', labelEn: 'Zakat', role: 'ZAKAT_EXPENSE', expectedAccountAr: '8510 - زكاة', expectedAccountEn: '8510 - Zakat' },
    ],
  },
  {
    key: 'taxes',
    letter: 'و',
    labelAr: 'الضرائب',
    labelEn: 'Taxes',
    icon: CircleDollarSign,
    color: 'purple',
    operations: [
      { labelAr: 'ضريبة مخرجات', labelEn: 'Output VAT', role: 'VAT_OUTPUT', expectedAccountAr: '3110 - ضريبة مخرجات', expectedAccountEn: '3110 - Output VAT' },
      { labelAr: 'ضريبة مدخلات', labelEn: 'Input VAT', role: 'VAT_INPUT', expectedAccountAr: '1410 - ضريبة مستحقة الاسترداد', expectedAccountEn: '1410 - Recoverable VAT' },
      { labelAr: 'ضريبة مستحقة', labelEn: 'VAT Due', role: 'VAT_DUE', expectedAccountAr: '3130 - ضريبة مستحقة', expectedAccountEn: '3130 - VAT Due' },
    ],
  },
  {
    key: 'liabilities',
    letter: 'ز',
    labelAr: 'الالتزامات',
    labelEn: 'Liabilities',
    icon: CreditCard,
    color: 'rose',
    operations: [
      { labelAr: 'رواتب مستحقة', labelEn: 'Salaries Payable', role: 'SALARIES_PAYABLE', expectedAccountAr: '3310 - رواتب مستحقة', expectedAccountEn: '3310 - Salaries Payable' },
      { labelAr: 'تأمينات مستحقة', labelEn: 'GOSI Payable', role: 'GOSI_PAYABLE', expectedAccountAr: '3830 - تأمينات اجتماعية مستحقة', expectedAccountEn: '3830 - GOSI Payable' },
      { labelAr: 'زكاة مستحقة', labelEn: 'Zakat Payable', role: 'ZAKAT_PAYABLE', expectedAccountAr: '3810 - زكاة مستحقة', expectedAccountEn: '3810 - Zakat Payable' },
      { labelAr: 'مقدمات العملاء', labelEn: 'Customer Advances', role: 'CUSTOMER_ADVANCE', expectedAccountAr: '3410 - مقدمات عملاء المشاريع', expectedAccountEn: '3410 - Project Customer Advances' },
      { labelAr: 'مكافأة نهاية الخدمة', labelEn: 'EOS Provision', role: 'EOS_PROVISION', expectedAccountAr: '3710 - مخصص مكافأة نهاية الخدمة', expectedAccountEn: '3710 - End of Service Provision' },
    ],
  },
  {
    key: 'assets',
    letter: 'ح',
    labelAr: 'الأصول',
    labelEn: 'Assets',
    icon: Wallet,
    color: 'teal',
    operations: [
      { labelAr: 'أصول ثابتة', labelEn: 'Fixed Assets', role: 'FIXED_ASSET', expectedAccountAr: '2110 - معدات الإنشاء', expectedAccountEn: '2110 - Construction Equipment' },
      { labelAr: 'مجمع إهلاك', labelEn: 'Accumulated Depreciation', role: 'ACCUM_DEPRECIATION', expectedAccountAr: '2210 - إهلاك متراكم', expectedAccountEn: '2210 - Accumulated Depreciation' },
      { labelAr: 'سلف الموظفين', labelEn: 'Employee Advances', role: 'EMPLOYEE_ADVANCE', expectedAccountAr: '1230 - سلف الموظفين', expectedAccountEn: '1230 - Employee Advances' },
    ],
  },
]

// ============ Summary Card ============
function MappingSummaryCard({ title, value, icon: Icon, color = 'emerald' }: {
  title: string; value: number | string; icon: React.ElementType; color?: string
}) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
    sky: 'bg-sky-50 border-sky-200 text-sky-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    teal: 'bg-teal-50 border-teal-200 text-teal-700',
  }
  return (
    <Card className={`${colors[color] || colors.emerald} border`}>
      <CardContent className="p-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Icon className="size-4" />
          <p className="text-xs font-medium">{title}</p>
        </div>
        <p className="text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}

// ============ Main Module ============
export function AccountingMappingModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  // Expandable groups state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(operationGroups.map(g => g.key))
  )

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editOperation, setEditOperation] = useState<{
    labelAr: string; labelEn: string; role: string
  } | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResponse | null>(null)

  // Fetch role mapping data
  const { data: mappingData, isLoading, isError, refetch } = useQuery<{ mappings: RoleMappingItem[] }>({
    queryKey: ['role-mapping'],
    queryFn: async () => {
      const res = await fetch('/api/accounts/role-mapping')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const mappings = mappingData?.mappings || []

  // Build a quick lookup: role -> RoleMappingItem
  const mappingByRole = useMemo(() => {
    const map = new Map<string, RoleMappingItem>()
    for (const m of mappings) {
      map.set(m.role, m)
    }
    return map
  }, [mappings])

  // Calculate summary stats
  const allOperations = useMemo(
    () => operationGroups.flatMap(g => g.operations),
    []
  )

  const mappedOps = useMemo(
    () => allOperations.filter(op => {
      const mapping = mappingByRole.get(op.role)
      return mapping?.primaryAccount != null
    }),
    [allOperations, mappingByRole]
  )

  const unmappedOps = useMemo(
    () => allOperations.filter(op => {
      const mapping = mappingByRole.get(op.role)
      return !mapping?.primaryAccount
    }),
    [allOperations, mappingByRole]
  )

  const mappingPercentage = allOperations.length > 0
    ? Math.round((mappedOps.length / allOperations.length) * 100)
    : 0

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ accountId, accountRole }: { accountId: string; accountRole: string }) => {
      const res = await fetch('/api/accounts/role-mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, accountRole }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-mapping'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setEditDialogOpen(false)
      setEditOperation(null)
      setSelectedAccountId(null)
    },
  })

  // Validation mutation
  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/accounts/role-mapping', {
        method: 'POST',
      })
      if (!res.ok) throw new Error()
      return res.json() as Promise<ValidationResponse>
    },
    onSuccess: (data) => {
      setValidationResult(data)
    },
  })

  // Toggle group expand/collapse
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Edit handlers
  const handleEdit = useCallback((operation: { labelAr: string; labelEn: string; role: string }) => {
    setEditOperation(operation)
    const mapping = mappingByRole.get(operation.role)
    setSelectedAccountId(mapping?.primaryAccount?.id || null)
    setEditDialogOpen(true)
  }, [mappingByRole])

  const handleSave = useCallback(() => {
    if (!selectedAccountId || !editOperation) return
    updateMutation.mutate({ accountId: selectedAccountId, accountRole: editOperation.role })
  }, [selectedAccountId, editOperation, updateMutation])

  // Color mapping for group icons
  const groupIconColors: Record<string, string> = {
    emerald: 'text-emerald-600',
    sky: 'text-sky-600',
    teal: 'text-teal-600',
    orange: 'text-orange-600',
    amber: 'text-amber-600',
    purple: 'text-purple-600',
    rose: 'text-rose-600',
  }

  const groupBgColors: Record<string, string> = {
    emerald: 'bg-emerald-50',
    sky: 'bg-sky-50',
    teal: 'bg-teal-50',
    orange: 'bg-orange-50',
    amber: 'bg-amber-50',
    purple: 'bg-purple-50',
    rose: 'bg-rose-50',
  }

  // Current edit mapping info
  const currentEditMapping = editOperation ? mappingByRole.get(editOperation.role) : null

  return (
    <ModuleLayout
      title={{ ar: 'الربط المحاسبي', en: 'Accounting Mapping' }}
      subtitle={{
        ar: 'ربط العمليات التجارية بالحسابات المحاسبية - المصدر الوحيد للحقيقة المالية هو القيد اليومي',
        en: 'Mapping business operations to accounting accounts - The single source of financial truth is the journal entry',
      }}
      actions={
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => refetch()}
        >
          <RefreshCw className="size-4" />
          {t('تحديث', 'Refresh', lang)}
        </Button>
      }
    >
      <div className="space-y-6" dir="rtl">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MappingSummaryCard
            title={t('إجمالي العمليات', 'Total Operations', lang)}
            value={allOperations.length}
            icon={ArrowRightLeft}
            color="teal"
          />
          <MappingSummaryCard
            title={t('مربوطة', 'Mapped', lang)}
            value={mappedOps.length}
            icon={CheckCircle2}
            color="emerald"
          />
          <MappingSummaryCard
            title={t('غير مربوطة', 'Unmapped', lang)}
            value={unmappedOps.length}
            icon={AlertTriangle}
            color="rose"
          />
          <MappingSummaryCard
            title={t('نسبة الربط', 'Mapping %', lang)}
            value={`${mappingPercentage}%`}
            icon={BarChart3}
            color={mappingPercentage === 100 ? 'emerald' : mappingPercentage >= 70 ? 'amber' : 'rose'}
          />
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex gap-4 p-3">
                    <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
                  </div>
                  <div className="space-y-2 mt-3">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={j} className="flex gap-4 p-2">
                        <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
                        <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
                        <div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <AlertTriangle className="size-10 text-rose-500" />
            <p className="text-rose-600">{t('حدث خطأ في تحميل البيانات', 'Error loading data', lang)}</p>
            <Button variant="outline" onClick={() => refetch()}>
              {t('إعادة المحاولة', 'Retry', lang)}
            </Button>
          </div>
        ) : (
          /* Operation Groups */
          <div className="space-y-4">
            {operationGroups.map(group => {
              const isExpanded = expandedGroups.has(group.key)
              const groupMapped = group.operations.filter(op => mappingByRole.get(op.role)?.primaryAccount).length
              const groupTotal = group.operations.length
              const allMapped = groupMapped === groupTotal
              const hasUnmapped = groupMapped < groupTotal
              const IconComp = group.icon

              return (
                <Collapsible
                  key={group.key}
                  open={isExpanded}
                  onOpenChange={() => toggleGroup(group.key)}
                >
                  <Card className={`border-r-4 ${hasUnmapped ? 'border-r-rose-400' : 'border-r-emerald-400'}`}>
                    <CollapsibleTrigger asChild>
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center justify-center size-9 rounded-lg ${groupBgColors[group.color] || 'bg-gray-50'}`}>
                            <IconComp className={`size-5 ${groupIconColors[group.color] || 'text-gray-600'}`} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-muted-foreground">{group.letter}.</span>
                            <h3 className="font-bold">{lang === 'ar' ? group.labelAr : group.labelEn}</h3>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-xs ${allMapped ? 'border-emerald-300 text-emerald-700' : 'border-rose-300 text-rose-700'}`}
                          >
                            {groupMapped}/{groupTotal} {t('مربوط', 'mapped', lang)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {allMapped ? (
                            <CheckCircle2 className="size-5 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="size-5 text-rose-500" />
                          )}
                          {isExpanded ? (
                            <ChevronDown className="size-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="px-4 pb-4 pt-0">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-right">{t('العملية', 'Operation', lang)}</TableHead>
                                <TableHead className="text-right">{t('الدور', 'Role', lang)}</TableHead>
                                <TableHead className="text-right">{t('الحساب الحالي', 'Current Account', lang)}</TableHead>
                                <TableHead className="text-right">{t('الإجراء', 'Action', lang)}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.operations.map((op, idx) => {
                                const mapping = mappingByRole.get(op.role)
                                const isMapped = !!mapping?.primaryAccount

                                return (
                                  <TableRow key={`${op.role}-${idx}`}>
                                    <TableCell>
                                      <p className="font-medium">{lang === 'ar' ? op.labelAr : op.labelEn}</p>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="font-mono text-xs">
                                        {op.role}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      {isMapped && mapping!.primaryAccount ? (
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-sm font-medium">
                                            {mapping!.primaryAccount.code}
                                          </span>
                                          <span className="text-muted-foreground">-</span>
                                          <span className="text-sm">
                                            {lang === 'ar' && mapping!.primaryAccount.nameAr
                                              ? mapping!.primaryAccount.nameAr
                                              : mapping!.primaryAccount.name}
                                          </span>
                                          <CheckCircle2 className="size-4 text-emerald-500" />
                                        </div>
                                      ) : (
                                        <Badge className="bg-rose-100 text-rose-700 border-0 gap-1">
                                          <AlertTriangle className="size-3" />
                                          {t('غير مربوط', 'Unmapped', lang)}
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1 text-xs"
                                        onClick={() => handleEdit(op)}
                                      >
                                        <Pencil className="size-3" />
                                        {t('تغيير', 'Change', lang)}
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )
            })}
          </div>
        )}

        {/* Validation Section */}
        <Card className="border-t-4 border-t-teal-500">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-teal-50">
                  <Shield className="size-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-bold">{t('التحقق من الربط', 'Validate Mapping', lang)}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      'التحقق من أن جميع العمليات مربوطة بحسابات محاسبية',
                      'Verify all operations are mapped to accounting accounts',
                      lang
                    )}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => validateMutation.mutate()}
                disabled={validateMutation.isPending}
                className="gap-2 bg-teal-600 hover:bg-teal-700 text-white"
              >
                {validateMutation.isPending ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <FileSearch className="size-4" />
                )}
                {t('التحقق من الربط', 'Validate Mapping', lang)}
              </Button>
            </div>

            {/* Validation Results */}
            {validationResult && (
              <div className="mt-4">
                <Separator className="mb-4" />
                {validationResult.isValid ? (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 className="size-6 text-emerald-600" />
                    <div>
                      <p className="font-bold text-emerald-800">
                        {t(
                          'جميع العمليات مربوطة بحسابات',
                          'All operations are mapped to accounts',
                          lang
                        )}
                      </p>
                      <p className="text-sm text-emerald-700">
                        {t(
                          `${validationResult.mappedCount} من ${validationResult.totalRoles} دور مربوط`,
                          `${validationResult.mappedCount} of ${validationResult.totalRoles} roles mapped`,
                          lang
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Big Warning */}
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-rose-50 border border-rose-200">
                      <AlertTriangle className="size-6 text-rose-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-bold text-rose-800">
                          {t(
                            '⚠️ عمليات النظام قد لا تعمل بشكل صحيح حتى يتم ربط جميع الأدوار',
                            '⚠️ System operations may not function correctly until all roles are mapped',
                            lang
                          )}
                        </p>
                        <p className="text-sm text-rose-700 mt-1">
                          {validationResult.message}
                        </p>
                      </div>
                    </div>

                    {/* Unmapped roles list */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">{t('الدور', 'Role', lang)}</TableHead>
                            <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                            <TableHead className="text-right">{t('التفاصيل', 'Details', lang)}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {validationResult.unmappedRoles.map((unmapped) => (
                            <TableRow key={unmapped.role}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="size-4 text-rose-500" />
                                  <div>
                                    <p className="font-medium text-rose-700">
                                      {lang === 'ar' ? unmapped.labelAr : unmapped.labelEn}
                                    </p>
                                    <p className="text-xs font-mono text-muted-foreground">
                                      {unmapped.role}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {unmapped.description}
                              </TableCell>
                              <TableCell className="text-sm">
                                <p className="text-rose-600">{unmapped.error}</p>
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {unmapped.defaultCodes.map(code => (
                                    <Badge key={code} variant="outline" className="text-xs font-mono">
                                      {code}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open)
        if (!open) {
          setEditOperation(null)
          setSelectedAccountId(null)
        }
      }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5 text-teal-600" />
              {t('تغيير الحساب المرتبط', 'Change Linked Account', lang)}
            </DialogTitle>
          </DialogHeader>
          {editOperation && (
            <div className="space-y-4">
              {/* Current operation info */}
              <div>
                <p className="text-xs text-muted-foreground">{t('العملية', 'Operation', lang)}</p>
                <p className="text-lg font-bold">
                  {lang === 'ar' ? editOperation.labelAr : editOperation.labelEn}
                </p>
                <Badge variant="outline" className="font-mono text-xs mt-1">
                  {editOperation.role}
                </Badge>
              </div>

              <Separator />

              {/* Current account info */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t('الحساب الحالي', 'Current Account', lang)}
                </p>
                {currentEditMapping?.primaryAccount ? (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                    <span className="font-mono font-medium">
                      {currentEditMapping.primaryAccount.code}
                    </span>
                    <span className="text-muted-foreground">-</span>
                    <span>
                      {lang === 'ar' && currentEditMapping.primaryAccount.nameAr
                        ? currentEditMapping.primaryAccount.nameAr
                        : currentEditMapping.primaryAccount.name}
                    </span>
                  </div>
                ) : (
                  <Badge className="bg-rose-100 text-rose-700 border-0 gap-1">
                    <AlertTriangle className="size-3" />
                    {t('غير مربوط', 'Unmapped', lang)}
                  </Badge>
                )}
              </div>

              {/* Account Selector */}
              <AccountSelector
                roles={[editOperation.role]}
                value={selectedAccountId}
                onValueChange={(accountId) => {
                  setSelectedAccountId(accountId)
                }}
                label={t('الحساب الجديد', 'New Account', lang)}
                placeholder={t('اختر الحساب...', 'Select account...', lang)}
              />

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="size-5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">
                  {t(
                    '⚠️ تغيير الحساب سيؤثر على جميع العمليات المستقبلية من هذا النوع',
                    '⚠️ Changing the account will affect all future operations of this type',
                    lang
                  )}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditDialogOpen(false)
                    setEditOperation(null)
                    setSelectedAccountId(null)
                  }}
                >
                  {t('إلغاء', 'Cancel', lang)}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!selectedAccountId || updateMutation.isPending}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {updateMutation.isPending ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {t('حفظ', 'Save', lang)}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ModuleLayout>
  )
}

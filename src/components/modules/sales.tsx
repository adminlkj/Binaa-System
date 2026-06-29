'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw, Eye, ArrowRight,
  Send, CheckCircle, Trash2, ArrowLeft, Building2, HardHat,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout, StatusBadge } from '@/components/shared/module-layout'
import { ProjectTypeBadge } from '@/components/shared/project-type-badge'
import { AccountingEntryDisplay } from '@/components/shared/accounting-entry-display'
import { useAppStore, formatDate, formatNumber, commonText } from '@/stores/app-store'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
interface ProgressClaimSource {
  id: string; claimNo: string; date: string; amount: number; vatAmount: number; totalAmount: number
  project: { id: string; name: string; code: string; client: { id: string; name: string } }
  contract: { id: string; contractNo: string }
  invoiced: boolean; status: string
}

interface TimesheetSource {
  id: string; operatingHours: number; month: number; year: number; status: string
  project: { id: string; name: string; code: string; client: { id: string; name: string } }
  equipment: { id: string; name: string; code: string; nameAr: string | null }
  rental: { id: string; hourlyRate: number; deliveryFees: number; deliveryFeesTaxable: boolean }
  contract: { id: string; contractNo: string; hourlyRate: number; paymentTerms: string }
  clientName?: string; clientNameAr?: string
}

interface SalesInvoiceItem {
  id: string; description: string; quantity: number; unit?: string | null; unitPrice: number; totalPrice: number
}

interface SalesInvoice {
  id: string; invoiceNo: string; sourceType: string; invoiceType: string
  clientId: string; projectId: string | null; contractId: string | null
  date: string; dueDate: string; subtotal: number; vatRate: number; vatAmount: number; totalAmount: number
  paidAmount: number; status: string; notes: string | null
  progressClaimId: string | null; timesheetId: string | null
  journalEntryId: string | null
  client: { id: string; name: string; code: string }
  project: { id: string; name: string; code: string; projectType?: string } | null
  contract: { id: string; contractNo: string } | null
  items: SalesInvoiceItem[]
  timesheet?: TimesheetSource | null
  progressClaim?: ProgressClaimSource | null
  operatingHours?: number | null
  hourlyRate?: number | null
  equipmentName?: string | null
  includeDelivery?: boolean
  deliveryAmount?: number
  deliveryFeesTaxable?: boolean
  deliveryMonth?: string | null
  contractPeriodStart?: string | null
  contractPeriodEnd?: string | null
}

// ============ Labels ============
const labels = {
  title: { ar: 'فواتير المبيعات', en: 'Sales Invoices' },
  subtitle: { ar: 'إدارة فواتير المبيعات من المستخلصات وسجلات الساعات', en: 'Manage sales invoices from extracts and timesheets' },
  invoiceNo: { ar: 'رقم الفاتورة', en: 'Invoice No.' },
  sourceType: { ar: 'نوع المصدر', en: 'Source Type' },
  client: { ar: 'العميل', en: 'Client' },
  project: { ar: 'المشروع', en: 'Project' },
  date: { ar: 'التاريخ', en: 'Date' },
  dueDate: { ar: 'تاريخ الاستحقاق', en: 'Due Date' },
  subtotal: { ar: 'المجموع الفرعي', en: 'Subtotal' },
  vat: { ar: 'الضريبة (15%)', en: 'VAT (15%)' },
  total: { ar: 'الإجمالي', en: 'Total' },
  paid: { ar: 'المدفوع', en: 'Paid' },
  outstanding: { ar: 'المستحق', en: 'Outstanding' },
  status: { ar: 'الحالة', en: 'Status' },
  actions: { ar: 'الإجراءات', en: 'Actions' },
  createInvoice: { ar: 'إنشاء فاتورة', en: 'Create Invoice' },
  search: { ar: 'بحث برقم الفاتورة أو العميل...', en: 'Search by invoice no. or client...' },
  allStatus: { ar: 'كل الحالات', en: 'All Status' },
  allSources: { ar: 'كل المصادر', en: 'All Sources' },
  totalSales: { ar: 'إجمالي المبيعات', en: 'Total Sales' },
  notes: { ar: 'ملاحظات', en: 'Notes' },
  invoiceItems: { ar: 'بنود الفاتورة', en: 'Invoice Items' },
  invoiceSummary: { ar: 'ملخص الفاتورة', en: 'Invoice Summary' },
  deleteTitle: { ar: 'حذف الفاتورة', en: 'Delete Invoice' },
  deleteConfirm: { ar: 'هل أنت متأكد من حذف هذه الفاتورة؟', en: 'Are you sure you want to delete this invoice?' },
  noInvoices: { ar: 'لا توجد فواتير مبيعات', en: 'No sales invoices' },
  sendInvoice: { ar: 'إرسال', en: 'Send' },
  markPaid: { ar: 'تأكيد الدفع', en: 'Mark Paid' },
  print: { ar: 'طباعة', en: 'Print' },
  // Source type labels
  extractSource: { ar: 'مستخلص مشروع', en: 'Project Extract' },
  extractSourceDesc: { ar: 'فاتورة من مستخلص مشروع إنشائي', en: 'Invoice from a construction project extract' },
  timesheetSource: { ar: 'تايم شيت تأجير معدات', en: 'Equipment Rental Timesheet' },
  timesheetSourceDesc: { ar: 'فاتورة من سجل ساعات تأجير معدات', en: 'Invoice from equipment rental timesheet' },
  // Create flow steps
  step1Title: { ar: 'اختيار نوع المصدر', en: 'Select Source Type' },
  step2Title: { ar: 'اختيار المستند المصدر', en: 'Select Source Document' },
  step3Title: { ar: 'معاينة الفاتورة', en: 'Invoice Preview' },
  step: { ar: 'خطوة', en: 'Step' },
  of: { ar: 'من', en: 'of' },
  next: { ar: 'التالي', en: 'Next' },
  back: { ar: 'رجوع', en: 'Back' },
  // Extract-specific
  claimNo: { ar: 'رقم المستخلص', en: 'Claim No.' },
  claimAmount: { ar: 'مبلغ المستخلص', en: 'Claim Amount' },
  // Timesheet-specific
  tsNo: { ar: 'رقم السجل', en: 'TS No.' },
  equipment: { ar: 'المعدة', en: 'Equipment' },
  operatingHours: { ar: 'ساعات التشغيل', en: 'Operating Hours' },
  hourlyRate: { ar: 'سعر الساعة', en: 'Hourly Rate' },
  deliveryFees: { ar: 'رسوم النقل', en: 'Delivery Fees' },
  contractNo: { ar: 'رقم العقد', en: 'Contract No.' },
  // Read-only notices
  autoFromClaim: { ar: 'تعبئة تلقائية من المستخلص - للقراءة فقط', en: 'Auto-filled from claim - read only' },
  autoFromTimesheet: { ar: 'تعبئة تلقائية من سجل الساعات والعقد - للقراءة فقط', en: 'Auto-filled from timesheet & contract - read only' },
  // No sources available
  noApprovedClaims: { ar: 'لا توجد مستخلصات معتمدة غير مفوترة', en: 'No approved uninvoiced extracts' },
  noApprovedTimesheets: { ar: 'لا توجد سجلات ساعات معتمدة غير مفوترة', en: 'No approved uninvoiced timesheets' },
  // Source reference in detail
  sourceRef: { ar: 'المستند المصدر', en: 'Source Document' },
  financialDetails: { ar: 'التفاصيل المالية', en: 'Financial Details' },
  rentalInfo: { ar: 'بيانات الإيجار', en: 'Rental Information' },
}

// ============ View State ============
type ViewState =
  | { type: 'list' }
  | { type: 'create'; step: number; sourceType: 'EXTRACT' | 'TIMESHEET' | null; selectedSourceId: string | null }
  | { type: 'detail'; invoiceId: string }

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

// ============ Source Type Badge ============
function SourceTypeBadge({ sourceType, lang }: { sourceType: string; lang: 'ar' | 'en' }) {
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  if (sourceType === 'EXTRACT') {
    return (
      <Badge className="bg-teal-100 text-teal-700 border-teal-200 gap-1 text-xs">
        <Building2 className="size-3" />
        {t('مستخلص', 'Extract')}
      </Badge>
    )
  }
  if (sourceType === 'TIMESHEET') {
    return (
      <Badge className="bg-purple-100 text-purple-700 border-purple-200 gap-1 text-xs">
        <Clock className="size-3" />
        {t('تايم شيت', 'Timesheet')}
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-xs">{sourceType}</Badge>
}

// ============ Create Invoice Flow ============
function CreateInvoiceFlow({
  initialState,
  onBack,
  onComplete,
}: {
  initialState: ViewState & { type: 'create' }
  onBack: () => void
  onComplete: () => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [step, setStep] = useState(initialState.step || 1)
  const [sourceType, setSourceType] = useState<'EXTRACT' | 'TIMESHEET' | null>(initialState.sourceType || null)
  const [selectedClaimId, setSelectedClaimId] = useState<string>(initialState.selectedSourceId || '')
  const [selectedTimesheetId, setSelectedTimesheetId] = useState<string>(initialState.selectedSourceId || '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')

  // Fetch uninvoiced approved claims
  const { data: approvedClaims = [], isLoading: claimsLoading } = useQuery<ProgressClaimSource[]>({
    queryKey: ['uninvoiced-claims'],
    queryFn: async () => {
      const res = await fetch('/api/progress-claims?status=APPROVED&invoiced=false')
      if (!res.ok) return []
      return res.json()
    },
    enabled: sourceType === 'EXTRACT' || step === 2,
  })

  // Fetch uninvoiced approved timesheets
  const { data: approvedTimesheets = [], isLoading: timesheetsLoading } = useQuery<TimesheetSource[]>({
    queryKey: ['uninvoiced-timesheets'],
    queryFn: async () => {
      const res = await fetch('/api/equipment/timesheets?status=APPROVED')
      if (!res.ok) return []
      const data = await res.json()
      // Filter: only timesheets not yet invoiced (no invoice linked)
      return (Array.isArray(data) ? data : []).filter(
        (ts: { status: string; invoice: null }) => ts.status === 'APPROVED' && !ts.invoice
      )
    },
    enabled: sourceType === 'TIMESHEET' || step === 2,
  })

  // Selected source
  const selectedClaim = approvedClaims.find(c => c.id === selectedClaimId)
  const selectedTimesheet = approvedTimesheets.find(ts => ts.id === selectedTimesheetId)

  // Auto-calculations for EXTRACT source
  const extractSubtotal = selectedClaim?.amount || 0
  const extractVat = selectedClaim?.vatAmount || 0
  const extractTotal = selectedClaim?.totalAmount || 0

  // Auto-calculations for TIMESHEET source
  const tsHourlyRate = selectedTimesheet?.rental?.hourlyRate || selectedTimesheet?.contract?.hourlyRate || 0
  const tsOperatingHours = selectedTimesheet?.operatingHours || 0
  const tsDeliveryFees = selectedTimesheet?.rental?.deliveryFees || 0
  const tsDeliveryFeesTaxable = selectedTimesheet?.rental?.deliveryFeesTaxable ?? true
  const tsSubtotal = tsOperatingHours * tsHourlyRate
  const tsVatRate = 0.15
  const tsRentalVat = Math.round(tsSubtotal * tsVatRate * 100) / 100
  const tsDeliveryVat = tsDeliveryFeesTaxable && tsDeliveryFees > 0 ? Math.round(tsDeliveryFees * tsVatRate * 100) / 100 : 0
  const tsTotalVat = tsRentalVat + tsDeliveryVat
  const tsTotalAmount = tsSubtotal + tsDeliveryFees + tsTotalVat

  const currentVat = sourceType === 'EXTRACT' ? extractVat : tsTotalVat
  const currentTotal = sourceType === 'EXTRACT' ? extractTotal : tsTotalAmount

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/sales-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error((err as { error?: string }).error || 'Failed')
        }
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['uninvoiced-claims'] })
      queryClient.invalidateQueries({ queryKey: ['uninvoiced-timesheets'] })
      onComplete()
    },
  })

  const handleNext = () => {
    if (step === 1 && sourceType) {
      setStep(2)
    } else if (step === 2 && (selectedClaimId || selectedTimesheetId)) {
      setStep(3)
    }
  }

  const handleBack = () => {
    if (step === 1) {
      onBack()
    } else {
      setStep(step - 1)
    }
  }

  const handleSubmit = () => {
    if (sourceType === 'EXTRACT' && selectedClaimId) {
      createMutation.mutate({
        sourceType: 'EXTRACT',
        progressClaimId: selectedClaimId,
        date,
        dueDate,
        notes,
      })
    } else if (sourceType === 'TIMESHEET' && selectedTimesheetId) {
      createMutation.mutate({
        sourceType: 'TIMESHEET',
        timesheetId: selectedTimesheetId,
        date,
        dueDate,
        notes,
      })
    }
  }

  const canProceed = () => {
    if (step === 1) return !!sourceType
    if (step === 2) {
      if (sourceType === 'EXTRACT') return !!selectedClaimId
      if (sourceType === 'TIMESHEET') return !!selectedTimesheetId
    }
    if (step === 3) return !!date && !!dueDate
    return false
  }

  // ============ STEP 1: Select Source Type ============
  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-1">{t(labels.step1Title.ar, labels.step1Title.en)}</h3>
        <p className="text-sm text-muted-foreground">
          {t('اختر نوع المستند المصدر لإنشاء الفاتورة', 'Select the source document type to create an invoice')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {/* Extract Source Card */}
        <button
          type="button"
          onClick={() => setSourceType('EXTRACT')}
          className={`relative p-6 rounded-xl border-2 transition-all text-start ${
            sourceType === 'EXTRACT'
              ? 'border-teal-500 bg-teal-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/30'
          }`}
        >
          {sourceType === 'EXTRACT' && (
            <div className="absolute top-3 end-3">
              <CheckCircle className="size-5 text-teal-600" />
            </div>
          )}
          <div className="flex items-center gap-3 mb-3">
            <div className={`flex size-12 items-center justify-center rounded-xl ${sourceType === 'EXTRACT' ? 'bg-teal-100' : 'bg-gray-100'}`}>
              <Building2 className={`size-6 ${sourceType === 'EXTRACT' ? 'text-teal-600' : 'text-gray-500'}`} />
            </div>
            <div>
              <h4 className="font-semibold">{t(labels.extractSource.ar, labels.extractSource.en)}</h4>
              <p className="text-xs text-muted-foreground">{t('للمشاريع الإنشائية', 'For construction projects')}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t(labels.extractSourceDesc.ar, labels.extractSourceDesc.en)}</p>
        </button>

        {/* Timesheet Source Card */}
        <button
          type="button"
          onClick={() => setSourceType('TIMESHEET')}
          className={`relative p-6 rounded-xl border-2 transition-all text-start ${
            sourceType === 'TIMESHEET'
              ? 'border-purple-500 bg-purple-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/30'
          }`}
        >
          {sourceType === 'TIMESHEET' && (
            <div className="absolute top-3 end-3">
              <CheckCircle className="size-5 text-purple-600" />
            </div>
          )}
          <div className="flex items-center gap-3 mb-3">
            <div className={`flex size-12 items-center justify-center rounded-xl ${sourceType === 'TIMESHEET' ? 'bg-purple-100' : 'bg-gray-100'}`}>
              <HardHat className={`size-6 ${sourceType === 'TIMESHEET' ? 'text-purple-600' : 'text-gray-500'}`} />
            </div>
            <div>
              <h4 className="font-semibold">{t(labels.timesheetSource.ar, labels.timesheetSource.en)}</h4>
              <p className="text-xs text-muted-foreground">{t('لتأجير المعدات', 'For equipment rental')}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t(labels.timesheetSourceDesc.ar, labels.timesheetSourceDesc.en)}</p>
        </button>
      </div>
    </div>
  )

  // ============ STEP 2: Select Source Document ============
  const renderStep2 = () => {
    if (sourceType === 'EXTRACT') {
      if (claimsLoading) {
        return (
          <div className="flex flex-col items-center py-10">
            <div className="size-8 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
            <p className="mt-3 text-sm text-muted-foreground">{commonText.loading[lang]}</p>
          </div>
        )
      }

      if (approvedClaims.length === 0) {
        return (
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-6 text-center">
              <Building2 className="size-10 text-amber-400 mx-auto mb-3" />
              <p className="text-amber-700 font-medium">{t(labels.noApprovedClaims.ar, labels.noApprovedClaims.en)}</p>
              <p className="text-sm text-amber-600 mt-1">
                {t('يجب اعتماد مستخلص أولاً من وحدة المستخلصات', 'An extract must be approved first from the Extracts module')}
              </p>
            </CardContent>
          </Card>
        )
      }

      return (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t(labels.step2Title.ar, labels.step2Title.en)}</h3>
          <p className="text-sm text-muted-foreground">
            {t('اختر مستخلص معتمد غير مفوتر', 'Select an approved uninvoiced extract')}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead className="text-right">{t(labels.claimNo.ar, labels.claimNo.en)}</TableHead>
                  <TableHead className="text-right">{t(labels.client.ar, labels.client.en)}</TableHead>
                  <TableHead className="text-right">{t(labels.project.ar, labels.project.en)}</TableHead>
                  <TableHead className="text-right">{t(labels.claimAmount.ar, labels.claimAmount.en)}</TableHead>
                  <TableHead className="text-right">{t(labels.vat.ar, labels.vat.en)}</TableHead>
                  <TableHead className="text-right">{t(labels.total.ar, labels.total.en)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedClaims.map(claim => (
                  <TableRow
                    key={claim.id}
                    className={`cursor-pointer transition-colors ${selectedClaimId === claim.id ? 'bg-teal-50 ring-1 ring-teal-300' : 'hover:bg-gray-50'}`}
                    onClick={() => setSelectedClaimId(claim.id)}
                  >
                    <TableCell className="w-10">
                      <div className={`size-5 rounded-full border-2 flex items-center justify-center ${selectedClaimId === claim.id ? 'border-teal-500 bg-teal-500' : 'border-gray-300'}`}>
                        {selectedClaimId === claim.id && <CheckCircle className="size-3 text-white" />}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono font-medium">{claim.claimNo}</TableCell>
                    <TableCell>{claim.project?.client?.name || '—'}</TableCell>
                    <TableCell>{claim.project?.name || '—'}</TableCell>
                    <TableCell><MoneyDisplay value={claim.amount} lang={lang} size="sm" inline /></TableCell>
                    <TableCell><MoneyDisplay value={claim.vatAmount} lang={lang} size="sm" inline /></TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={claim.totalAmount} lang={lang} size="sm" inline bold /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )
    }

    // TIMESHEET
    if (timesheetsLoading) {
      return (
        <div className="flex flex-col items-center py-10">
          <div className="size-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
          <p className="mt-3 text-sm text-muted-foreground">{commonText.loading[lang]}</p>
        </div>
      )
    }

    if (approvedTimesheets.length === 0) {
      return (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-6 text-center">
            <HardHat className="size-10 text-amber-400 mx-auto mb-3" />
            <p className="text-amber-700 font-medium">{t(labels.noApprovedTimesheets.ar, labels.noApprovedTimesheets.en)}</p>
            <p className="text-sm text-amber-600 mt-1">
              {t('يجب اعتماد سجل ساعات أولاً من وحدة ساعات العمل', 'An approved timesheet must be created first from the Timesheets module')}
            </p>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t(labels.step2Title.ar, labels.step2Title.en)}</h3>
        <p className="text-sm text-muted-foreground">
          {t('اختر سجل ساعات معتمد غير مفوتر', 'Select an approved uninvoiced timesheet')}
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">{t(labels.equipment.ar, labels.equipment.en)}</TableHead>
                <TableHead className="text-right">{t(labels.client.ar, labels.client.en)}</TableHead>
                <TableHead className="text-right">{t(labels.project.ar, labels.project.en)}</TableHead>
                <TableHead className="text-right">{t(labels.operatingHours.ar, labels.operatingHours.en)}</TableHead>
                <TableHead className="text-right">{t(labels.contractNo.ar, labels.contractNo.en)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedTimesheets.map(ts => (
                <TableRow
                  key={ts.id}
                  className={`cursor-pointer transition-colors ${selectedTimesheetId === ts.id ? 'bg-purple-50 ring-1 ring-purple-300' : 'hover:bg-gray-50'}`}
                  onClick={() => setSelectedTimesheetId(ts.id)}
                >
                  <TableCell className="w-10">
                    <div className={`size-5 rounded-full border-2 flex items-center justify-center ${selectedTimesheetId === ts.id ? 'border-purple-500 bg-purple-500' : 'border-gray-300'}`}>
                      {selectedTimesheetId === ts.id && <CheckCircle className="size-3 text-white" />}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{ts.equipment?.name || '—'}</TableCell>
                  <TableCell>{ts.clientName || ts.project?.client?.name || '—'}</TableCell>
                  <TableCell>{ts.project?.name || '—'}</TableCell>
                  <TableCell>{formatNumber(ts.operatingHours)} {t('ساعة', 'hrs')}</TableCell>
                  <TableCell className="font-mono">{ts.contract?.contractNo || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  // ============ STEP 3: Invoice Preview ============
  const renderStep3 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">{t(labels.step3Title.ar, labels.step3Title.en)}</h3>

      {/* Read-only notice */}
      <Card className={sourceType === 'EXTRACT' ? 'bg-teal-50 border-teal-200' : 'bg-purple-50 border-purple-200'}>
        <CardContent className="p-3 flex items-center gap-2">
          {sourceType === 'EXTRACT' ? (
            <>
              <Building2 className="size-4 text-teal-600" />
              <p className="text-sm text-teal-700 font-medium">
                {t(labels.autoFromClaim.ar, labels.autoFromClaim.en)}
              </p>
            </>
          ) : (
            <>
              <HardHat className="size-4 text-purple-600" />
              <p className="text-sm text-purple-700 font-medium">
                {t(labels.autoFromTimesheet.ar, labels.autoFromTimesheet.en)}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Source Reference Info */}
      {sourceType === 'EXTRACT' && selectedClaim && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t(labels.sourceRef.ar, labels.sourceRef.en)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t(labels.claimNo.ar, labels.claimNo.en)}:</span>
                <p className="font-medium font-mono">{selectedClaim.claimNo}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.client.ar, labels.client.en)}:</span>
                <p className="font-medium">{selectedClaim.project?.client?.name || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.project.ar, labels.project.en)}:</span>
                <p className="font-medium">{selectedClaim.project?.name || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.contractNo.ar, labels.contractNo.en)}:</span>
                <p className="font-medium font-mono">{selectedClaim.contract?.contractNo || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {sourceType === 'TIMESHEET' && selectedTimesheet && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t(labels.sourceRef.ar, labels.sourceRef.en)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t(labels.equipment.ar, labels.equipment.en)}:</span>
                <p className="font-medium">{selectedTimesheet.equipment?.name || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.client.ar, labels.client.en)}:</span>
                <p className="font-medium">{selectedTimesheet.clientName || selectedTimesheet.project?.client?.name || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.project.ar, labels.project.en)}:</span>
                <p className="font-medium">{selectedTimesheet.project?.name || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.contractNo.ar, labels.contractNo.en)}:</span>
                <p className="font-medium font-mono">{selectedTimesheet.contract?.contractNo || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial Details - READ ONLY */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t(labels.financialDetails.ar, labels.financialDetails.en)}</CardTitle>
        </CardHeader>
        <CardContent>
          {sourceType === 'TIMESHEET' && selectedTimesheet && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>{t(labels.operatingHours.ar, labels.operatingHours.en)}</Label>
                  <Input type="number" value={tsOperatingHours || ''} readOnly className="bg-gray-100" dir="ltr" />
                  <p className="text-xs text-muted-foreground">{t('من سجل الساعات', 'From timesheet')}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t(labels.hourlyRate.ar, labels.hourlyRate.en)}</Label>
                  <Input type="number" value={tsHourlyRate || ''} readOnly className="bg-gray-100" dir="ltr" />
                  <p className="text-xs text-muted-foreground">{t('من العقد', 'From contract')}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t(labels.subtotal.ar, labels.subtotal.en)} ({t('ساعات × سعر', 'hrs × rate')})</Label>
                  <div className="h-9 flex items-center">
                    <MoneyDisplay value={tsSubtotal} lang={lang} size="md" bold />
                  </div>
                </div>
              </div>
              {tsDeliveryFees > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label>{t(labels.deliveryFees.ar, labels.deliveryFees.en)}</Label>
                    <Input type="number" value={tsDeliveryFees} readOnly className="bg-gray-100" dir="ltr" />
                  </div>
                  <div className="space-y-2 flex items-center gap-2 pt-6">
                    <Badge variant="outline" className={tsDeliveryFeesTaxable ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}>
                      {tsDeliveryFeesTaxable ? t('خاضعة للضريبة', 'Taxable') : t('غير خاضعة للضريبة', 'Not Taxable')}
                    </Badge>
                  </div>
                </div>
              )}
            </>
          )}

          {sourceType === 'EXTRACT' && selectedClaim && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <Label>{t(labels.claimAmount.ar, labels.claimAmount.en)}</Label>
                <Input type="number" value={extractSubtotal || ''} readOnly className="bg-gray-100" dir="ltr" />
                <p className="text-xs text-muted-foreground">{t('من المستخلص', 'From claim')}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Summary - Computed */}
      <Card className="bg-gray-50 border-dashed">
        <CardContent className="p-6 space-y-3">
          <h3 className="text-lg font-semibold mb-2">{t(labels.invoiceSummary.ar, labels.invoiceSummary.en)}</h3>
          {sourceType === 'TIMESHEET' && (
            <div className="flex justify-between text-sm">
              <span>{t(labels.subtotal.ar, labels.subtotal.en)} ({formatNumber(tsOperatingHours)} {t('ساعة', 'hrs')} × <MoneyDisplay value={tsHourlyRate} lang={lang} size="xs" inline showSymbol={false} />)</span>
              <span className="font-medium"><MoneyDisplay value={tsSubtotal} lang={lang} size="sm" inline /></span>
            </div>
          )}
          {sourceType === 'EXTRACT' && (
            <div className="flex justify-between text-sm">
              <span>{t(labels.subtotal.ar, labels.subtotal.en)}</span>
              <span className="font-medium"><MoneyDisplay value={extractSubtotal} lang={lang} size="sm" inline /></span>
            </div>
          )}
          {sourceType === 'TIMESHEET' && tsDeliveryFees > 0 && (
            <div className="flex justify-between text-sm text-amber-700">
              <span>{t(labels.deliveryFees.ar, labels.deliveryFees.en)}</span>
              <span className="font-medium"><MoneyDisplay value={tsDeliveryFees} lang={lang} size="sm" inline /></span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span>{t(labels.vat.ar, labels.vat.en)}</span>
            <span className="font-medium"><MoneyDisplay value={currentVat} lang={lang} size="sm" inline /></span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-bold">
            <span>{t(labels.total.ar, labels.total.en)}</span>
            <span className="text-emerald-700"><MoneyDisplay value={currentTotal} lang={lang} size="lg" inline bold /></span>
          </div>
        </CardContent>
      </Card>

      {/* User-entered fields: Date, Due Date, Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('بيانات الفاتورة', 'Invoice Details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t(labels.date.ar, labels.date.en)} *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{t(labels.dueDate.ar, labels.dueDate.en)} *</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{t(labels.notes.ar, labels.notes.en)}</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ملاحظات اختيارية', 'Optional notes')} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  // ============ Step indicator ============
  const steps = [
    { num: 1, label: t(labels.step1Title.ar, labels.step1Title.en) },
    { num: 2, label: t(labels.step2Title.ar, labels.step2Title.en) },
    { num: 3, label: t(labels.step3Title.ar, labels.step3Title.en) },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t(labels.createInvoice.ar, labels.createInvoice.en)}</h1>
          <p className="text-sm text-muted-foreground">
            {t('إنشاء فاتورة من مستند مصدر', 'Create invoice from a source document')}
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <React.Fragment key={s.num}>
            <div className="flex items-center gap-2">
              <div className={`flex size-8 items-center justify-center rounded-full text-sm font-bold ${
                step >= s.num
                  ? (sourceType === 'EXTRACT' ? 'bg-teal-600 text-white' : 'bg-purple-600 text-white')
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {s.num}
              </div>
              <span className={`text-sm font-medium hidden sm:inline ${step >= s.num ? 'text-gray-900' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 ${step > s.num ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step Content */}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}

      {/* Error display */}
      {createMutation.isError && (
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-3">
            <p className="text-sm text-rose-700">
              {t('خطأ في إنشاء الفاتورة', 'Error creating invoice')}: {(createMutation.error as Error)?.message || t('حدث خطأ', 'An error occurred')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={handleBack} className="gap-2">
          <ArrowRight className="size-4" />
          {step === 1 ? commonText.cancel[lang] : t(labels.back.ar, labels.back.en)}
        </Button>

        <div className="flex items-center gap-3">
          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className={sourceType === 'EXTRACT' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-purple-600 hover:bg-purple-700'}
            >
              {t(labels.next.ar, labels.next.en)}
              <ArrowLeft className="size-4 ms-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !canProceed()}
              className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]"
            >
              {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء الفاتورة', 'Create Invoice')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ Invoice Detail View ============
function InvoiceDetailView({
  invoice,
  onBack,
}: {
  invoice: SalesInvoice
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/sales-invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
    },
  })

  const isExtract = invoice.sourceType === 'EXTRACT'
  const isTimesheet = invoice.sourceType === 'TIMESHEET'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{t('فاتورة', 'Invoice')} {invoice.invoiceNo}</h2>
            <SourceTypeBadge sourceType={invoice.sourceType} lang={lang} />
            <StatusBadge status={invoice.status} lang={lang} />
          </div>
          <p className="text-sm text-muted-foreground">{invoice.client.name}</p>
        </div>
        <PrintButton type="service-invoice" documentId={invoice.id} />
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.client.ar, labels.client.en)}</p><p className="text-sm font-medium truncate">{invoice.client.name}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.project.ar, labels.project.en)}</p><p className="text-sm font-medium truncate">{invoice.project?.name || '—'}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.date.ar, labels.date.en)}</p><p className="text-sm font-medium">{formatDate(invoice.date, lang)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.dueDate.ar, labels.dueDate.en)}</p><p className="text-sm font-medium">{formatDate(invoice.dueDate, lang)}</p></CardContent></Card>
      </div>

      {/* Source Document Reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t(labels.sourceRef.ar, labels.sourceRef.en)}</CardTitle>
        </CardHeader>
        <CardContent>
          {isExtract && invoice.progressClaim && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t(labels.claimNo.ar, labels.claimNo.en)}:</span>
                <p className="font-medium font-mono">{invoice.progressClaim.claimNo}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.project.ar, labels.project.en)}:</span>
                <p className="font-medium">{invoice.progressClaim.project?.name || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.contractNo.ar, labels.contractNo.en)}:</span>
                <p className="font-medium font-mono">{invoice.progressClaim.contract?.contractNo || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('حالة المستخلص', 'Claim Status')}:</span>
                <StatusBadge status={invoice.progressClaim.status} lang={lang} />
              </div>
            </div>
          )}
          {isTimesheet && invoice.timesheet && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t(labels.equipment.ar, labels.equipment.en)}:</span>
                <p className="font-medium">{invoice.equipmentName || invoice.timesheet.equipment?.name || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.operatingHours.ar, labels.operatingHours.en)}:</span>
                <p className="font-medium">{formatNumber(invoice.operatingHours ?? invoice.timesheet.operatingHours)} {t('ساعة', 'hrs')}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.hourlyRate.ar, labels.hourlyRate.en)}:</span>
                <MoneyDisplay value={invoice.hourlyRate ?? invoice.timesheet?.rental?.hourlyRate ?? 0} lang={lang} size="sm" inline />
              </div>
              <div>
                <span className="text-muted-foreground">{t(labels.contractNo.ar, labels.contractNo.en)}:</span>
                <p className="font-medium font-mono">{invoice.timesheet.contract?.contractNo || invoice.contract?.contractNo || '—'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rental-specific info */}
      {isTimesheet && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg">{t(labels.rentalInfo.ar, labels.rentalInfo.en)}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {(invoice.operatingHours ?? 0) > 0 && (
                <div>
                  <span className="text-muted-foreground">{t(labels.operatingHours.ar, labels.operatingHours.en)}:</span>
                  <p className="font-medium">{formatNumber(invoice.operatingHours ?? 0)} {t('ساعة', 'hrs')}</p>
                </div>
              )}
              {(invoice.hourlyRate ?? 0) > 0 && (
                <div>
                  <span className="text-muted-foreground">{t(labels.hourlyRate.ar, labels.hourlyRate.en)}:</span>
                  <p className="font-medium"><MoneyDisplay value={invoice.hourlyRate ?? 0} lang={lang} size="sm" inline /></p>
                </div>
              )}
              {invoice.deliveryMonth && (
                <div>
                  <span className="text-muted-foreground">{t('شهر التسليم', 'Delivery Month')}:</span>
                  <p className="font-medium">{invoice.deliveryMonth}</p>
                </div>
              )}
              {invoice.includeDelivery && (invoice.deliveryAmount ?? 0) > 0 && (
                <div>
                  <span className="text-muted-foreground">{t(labels.deliveryFees.ar, labels.deliveryFees.en)}:</span>
                  <p className="font-medium">
                    <MoneyDisplay value={invoice.deliveryAmount ?? 0} lang={lang} size="sm" inline />
                    {invoice.deliveryFeesTaxable && (
                      <Badge variant="outline" className="ms-1 text-xs bg-emerald-100 text-emerald-700">{t('خاضعة للضريبة', 'Taxable')}</Badge>
                    )}
                  </p>
                </div>
              )}
              {invoice.contractPeriodStart && invoice.contractPeriodEnd && (
                <div>
                  <span className="text-muted-foreground">{t('فترة العقد', 'Contract Period')}:</span>
                  <p className="font-medium">{formatDate(invoice.contractPeriodStart, lang)} - {formatDate(invoice.contractPeriodEnd, lang)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Construction-specific info - revenue account 6110 */}
      {isExtract && invoice.progressClaim && (
        <Card className="border-teal-200 bg-teal-50/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="size-4 text-teal-600" />
              <span className="text-sm font-semibold text-teal-800">{t('مشروع إنشائي', 'Construction Project')}</span>
              <Badge variant="outline" className="text-xs border-teal-300 text-teal-700 bg-white">6110</Badge>
              <span className="text-xs text-teal-600">{t('إيرادات مستخلصات', 'Progress Claims Revenue')}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rental revenue info - account 6210 */}
      {isTimesheet && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="size-4 text-purple-600" />
              <span className="text-sm font-semibold text-purple-800">{t('تأجير معدات', 'Equipment Rental')}</span>
              <Badge variant="outline" className="text-xs border-purple-300 text-purple-700 bg-white">6210</Badge>
              <span className="text-xs text-purple-600">{t('إيرادات تأجير معدات', 'Equipment Rental Revenue')}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items Table */}
      <Card>
        <CardHeader><CardTitle className="text-lg">{t(labels.invoiceItems.ar, labels.invoiceItems.en)}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                  <TableHead className="text-right">{t('الكمية', 'Qty')}</TableHead>
                  <TableHead className="text-right">{t('سعر الوحدة', 'Unit Price')}</TableHead>
                  <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{formatNumber(item.quantity)}</TableCell>
                    <TableCell><MoneyDisplay value={item.unitPrice} lang={lang} size="sm" inline /></TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={item.totalPrice} lang={lang} size="sm" inline bold /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={3} className="text-left font-medium">{t(labels.subtotal.ar, labels.subtotal.en)}</TableCell>
                  <TableCell className="font-semibold"><MoneyDisplay value={invoice.subtotal} lang={lang} size="sm" inline /></TableCell>
                </TableRow>
                {isTimesheet && invoice.includeDelivery && (invoice.deliveryAmount ?? 0) > 0 && (
                  <TableRow className="bg-amber-50">
                    <TableCell colSpan={3} className="text-left font-medium text-amber-700">
                      {t(labels.deliveryFees.ar, labels.deliveryFees.en)} {invoice.deliveryFeesTaxable ? `(${t('خاضعة للضريبة', 'Taxable')})` : `(${t('غير خاضعة', 'Not Taxable')})`}
                    </TableCell>
                    <TableCell className="font-semibold text-amber-700"><MoneyDisplay value={invoice.deliveryAmount ?? 0} lang={lang} size="sm" inline /></TableCell>
                  </TableRow>
                )}
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={3} className="text-left font-medium">{t('ضريبة القيمة المضافة', 'VAT')} ({((invoice.vatRate ?? 0) * 100).toFixed(0)}%)</TableCell>
                  <TableCell className="font-semibold"><MoneyDisplay value={invoice.vatAmount} lang={lang} size="sm" inline /></TableCell>
                </TableRow>
                <TableRow className="bg-emerald-50">
                  <TableCell colSpan={3} className="text-left font-bold text-emerald-700">{t(labels.total.ar, labels.total.en)}</TableCell>
                  <TableCell className="font-bold text-emerald-700"><MoneyDisplay value={invoice.totalAmount} lang={lang} size="md" inline bold /></TableCell>
                </TableRow>
                <TableRow className="bg-amber-50">
                  <TableCell colSpan={3} className="text-left font-medium text-amber-700">{t(labels.paid.ar, labels.paid.en)}</TableCell>
                  <TableCell className="font-medium text-amber-700"><MoneyDisplay value={invoice.paidAmount} lang={lang} size="sm" inline /></TableCell>
                </TableRow>
                <TableRow className="bg-rose-50">
                  <TableCell colSpan={3} className="text-left font-bold text-rose-700">{t(labels.outstanding.ar, labels.outstanding.en)}</TableCell>
                  <TableCell className="font-bold text-rose-700"><MoneyDisplay value={invoice.totalAmount - invoice.paidAmount} lang={lang} size="md" inline bold /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-1">{t(labels.notes.ar, labels.notes.en)}</p>
            <p className="text-sm">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Accounting Entry */}
      <AccountingEntryDisplay journalEntryId={invoice.journalEntryId} lang={lang} />

      {/* Status Workflow Actions */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">{t('إجراءات:', 'Actions:')}</span>
            {invoice.status === 'DRAFT' && (
              <Button
                className="gap-2 bg-blue-600 hover:bg-blue-700"
                onClick={() => statusMutation.mutate({ id: invoice.id, status: 'SENT' })}
                disabled={statusMutation.isPending}
              >
                <Send className="size-4" /> {t(labels.sendInvoice.ar, labels.sendInvoice.en)}
              </Button>
            )}
            {invoice.status === 'SENT' && (
              <Button
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => statusMutation.mutate({ id: invoice.id, status: 'PAID' })}
                disabled={statusMutation.isPending}
              >
                <CheckCircle className="size-4" /> {t(labels.markPaid.ar, labels.markPaid.en)}
              </Button>
            )}
            {invoice.status === 'PAID' && (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-sm px-3 py-1">
                <CheckCircle className="size-4 ml-1" /> {t('مدفوعة', 'Paid')}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Main Sales Module ============
export function SalesModule() {
  const { lang, prefillProgressClaimId, setPrefillProgressClaimId } = useAppStore()
  const queryClient = useQueryClient()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  // L2-CRIT-004 fix: if progress-claims module asked to pre-fill a claim, open the
  // create-from-claim dialog directly with that claim selected.
  const [viewState, setViewState] = useState<ViewState>(() =>
    prefillProgressClaimId
      ? { type: 'create', step: 2, sourceType: 'EXTRACT', selectedSourceId: prefillProgressClaimId }
      : { type: 'list' }
  )

  // Clear the prefill once consumed so a later plain navigation to sales starts fresh.
  useEffect(() => {
    if (prefillProgressClaimId) {
      setPrefillProgressClaimId(null)
    }
  }, [prefillProgressClaimId, setPrefillProgressClaimId])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('all')
  const [projectTypeFilter, setProjectTypeFilter] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Fetch all sales invoices
  const { data: invoices = [], isLoading, isError, refetch } = useQuery<SalesInvoice[]>({
    queryKey: ['sales-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/sales-invoices')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/sales-invoices/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
      setDeleteId(null)
    },
  })

  // Filters
  const filtered = invoices.filter(inv => {
    const matchSearch = !search || inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      inv.client.name.toLowerCase().includes(search.toLowerCase()) ||
      (inv.project?.name?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter
    const matchSource = sourceTypeFilter === 'all' || inv.sourceType === sourceTypeFilter
    const invProjectType = inv.sourceType === 'EXTRACT' ? 'CONSTRUCTION' : inv.sourceType === 'TIMESHEET' ? 'EQUIPMENT_RENTAL' : 'ALL'
    const matchProjectType = projectTypeFilter === 'all' || invProjectType === projectTypeFilter
    return matchSearch && matchStatus && matchSource && matchProjectType
  })

  const totalSales = invoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0)
  const totalPaid = invoices.reduce((s, i) => s + Number(i.paidAmount || 0), 0)
  const totalOutstanding = totalSales - totalPaid

  // ============ CREATE VIEW ============
  if (viewState.type === 'create') {
    return (
      <CreateInvoiceFlow
        initialState={viewState}
        onBack={() => setViewState({ type: 'list' })}
        onComplete={() => setViewState({ type: 'list' })}
      />
    )
  }

  // ============ DETAIL VIEW ============
  if (viewState.type === 'detail') {
    const invoice = invoices.find(i => i.id === viewState.invoiceId)
    if (!invoice) {
      return (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('لم يتم العثور على الفاتورة', 'Invoice not found')}</p>
          <Button variant="outline" onClick={() => setViewState({ type: 'list' })}>{t('العودة', 'Back')}</Button>
        </div>
      )
    }
    return (
      <InvoiceDetailView
        invoice={invoice}
        onBack={() => setViewState({ type: 'list' })}
      />
    )
  }

  // ============ LIST VIEW ============
  return (
    <ModuleLayout
      title={labels.title}
      subtitle={labels.subtitle}
      actions={
        <>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create', step: 1, sourceType: null, selectedSourceId: null })}>
            <Plus className="size-4" /> {t(labels.createInvoice.ar, labels.createInvoice.en)}
          </Button>
        </>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4">
            <p className="text-sm text-emerald-600">{t(labels.totalSales.ar, labels.totalSales.en)}</p>
            <MoneyDisplay value={totalSales} lang={lang} size="xl" bold className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm text-amber-600">{t(labels.paid.ar, labels.paid.en)}</p>
            <MoneyDisplay value={totalPaid} lang={lang} size="xl" bold className="text-amber-700" />
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4">
            <p className="text-sm text-rose-600">{t(labels.outstanding.ar, labels.outstanding.en)}</p>
            <MoneyDisplay value={totalOutstanding} lang={lang} size="xl" bold className="text-rose-700" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t(labels.search.ar, labels.search.en)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t(labels.allStatus.ar, labels.allStatus.en)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(labels.allStatus.ar, labels.allStatus.en)}</SelectItem>
                <SelectItem value="DRAFT">{t('مسودة', 'Draft')}</SelectItem>
                <SelectItem value="SENT">{t('مرسلة', 'Sent')}</SelectItem>
                <SelectItem value="PARTIALLY_PAID">{t('مدفوعة جزئياً', 'Partially Paid')}</SelectItem>
                <SelectItem value="PAID">{t('مدفوعة', 'Paid')}</SelectItem>
                <SelectItem value="OVERDUE">{t('متأخرة', 'Overdue')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={t(labels.allSources.ar, labels.allSources.en)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(labels.allSources.ar, labels.allSources.en)}</SelectItem>
                <SelectItem value="EXTRACT">{t('مستخلصات', 'Extracts')}</SelectItem>
                <SelectItem value="TIMESHEET">{t('تايم شيت', 'Timesheets')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={projectTypeFilter} onValueChange={setProjectTypeFilter}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={t('كل الأنشطة', 'All Activities')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الأنشطة', 'All Activities')}</SelectItem>
                <SelectItem value="CONSTRUCTION">{t('مشاريع إنشائية', 'Construction')}</SelectItem>
                <SelectItem value="EQUIPMENT_RENTAL">{t('تأجير معدات', 'Equipment Rental')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{commonText.error[lang]}</p>
              <Button variant="outline" onClick={() => refetch()}>{commonText.retry[lang]}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <FileText className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t(labels.noInvoices.ar, labels.noInvoices.en)}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create', step: 1, sourceType: null, selectedSourceId: null })}>
                <Plus className="size-4 mr-1" /> {t(labels.createInvoice.ar, labels.createInvoice.en)}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(labels.invoiceNo.ar, labels.invoiceNo.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.sourceType.ar, labels.sourceType.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.client.ar, labels.client.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.project.ar, labels.project.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.date.ar, labels.date.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.subtotal.ar, labels.subtotal.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.vat.ar, labels.vat.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.total.ar, labels.total.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.status.ar, labels.status.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.actions.ar, labels.actions.en)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(inv => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', invoiceId: inv.id })}>
                      <TableCell className="font-medium font-mono">{inv.invoiceNo}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          <SourceTypeBadge sourceType={inv.sourceType} lang={lang} />
                          <ProjectTypeBadge projectType={inv.sourceType === 'EXTRACT' ? 'CONSTRUCTION' : inv.sourceType === 'TIMESHEET' ? 'EQUIPMENT_RENTAL' : ''} lang={lang} />
                        </div>
                      </TableCell>
                      <TableCell>{inv.client.name}</TableCell>
                      <TableCell>{inv.project?.name || '—'}</TableCell>
                      <TableCell>{formatDate(inv.date, lang)}</TableCell>
                      <TableCell><MoneyDisplay value={inv.subtotal} lang={lang} size="sm" inline /></TableCell>
                      <TableCell><MoneyDisplay value={inv.vatAmount} lang={lang} size="sm" inline /></TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" inline bold /></TableCell>
                      <TableCell><StatusBadge status={inv.status} lang={lang} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewState({ type: 'detail', invoiceId: inv.id })} title={t('عرض', 'View')}>
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-600" onClick={() => setDeleteId(inv.id)} title={t('حذف', 'Delete')} disabled={inv.status !== 'DRAFT'}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(labels.deleteTitle.ar, labels.deleteTitle.en)}</AlertDialogTitle>
            <AlertDialogDescription>{t(labels.deleteConfirm.ar, labels.deleteConfirm.en)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{commonText.cancel[lang]}</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {commonText.delete[lang]}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModuleLayout>
  )
}

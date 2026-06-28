'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw, Eye, ArrowRight, Download, FileSpreadsheet, Trash2,
  RotateCcw, Send, XCircle,
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
import { PrintButton } from '@/components/shared/print-button'
import { JePreview, JePreviewLine } from '@/components/shared/je-preview'
import { AccountSelector } from '@/components/shared/account-selector'
import { useAppStore, formatDate, formatNumber, commonText } from '@/stores/app-store'

// ============ Arabic/English Month Names ============
const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const englishMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatMonthYear(month: number, year: number, lang: 'ar' | 'en'): string {
  if (lang === 'ar') return `${arabicMonths[month - 1]} ${year}`
  return `${englishMonths[month - 1]} ${year}`
}

// ============ Types ============
interface TimesheetOption {
  id: string
  contractId: string
  projectId: string
  equipmentId: string
  month: number
  year: number
  operatingHours: number
  status: string
  notes: string | null
  clientName?: string
  clientNameAr?: string
  contract: {
    id: string; contractNo: string; hourlyRate: number; deliveryFees: number
    deliveryFeesTaxable: boolean; salesOrderNo: string | null; paymentTerms: string | null
    clientId: string
    project: { id: string; name: string; nameAr: string | null; code: string }
  }
  project: { id: string; name: string; nameAr: string | null; code: string }
  equipment: { id: string; name: string; nameAr: string | null; code: string }
  rental: { id: string; hourlyRate: number; clientId: string; deliveryFees: number; deliveryFeesTaxable: boolean; salesOrderNo: string | null; paymentDuration: string | null }
  invoice: { id: string; invoiceNo: string } | null
}

interface RentalInvoiceItem {
  id: string; description: string; quantity: number; unit?: string | null; unitPrice: number; totalPrice: number
}

interface RentalInvoice {
  id: string; invoiceNo: string; projectId: string | null; contractId?: string | null; clientId: string
  date: string; dueDate: string; subtotal: number; discountRate: number; discountAmount: number; netAmount: number
  vatRate: number; vatAmount: number; totalAmount: number; paidAmount: number; status: string; invoiceType?: string
  notes: string | null; paymentTerms?: string | null
  timesheetId?: string | null; deliveryMonth?: string | null; includeDelivery?: boolean; deliveryAmount?: number
  deliveryFeesTaxable?: boolean; contractNo?: string | null; salesOrderNo?: string | null
  equipmentName?: string | null; operatingHours?: number | null; hourlyRate?: number | null
  client: { id: string; name: string; nameAr?: string | null; code: string }
  project: { id: string; name: string; nameAr?: string | null; code: string } | null
  items: RentalInvoiceItem[]
}

// ============ Labels ============
const labels = {
  title: { ar: 'فواتير الإيجار', en: 'Rental Invoices' },
  subtitle: { ar: 'إدارة فواتير إيجار المعدات والآليات', en: 'Manage equipment and machinery rental invoices' },
  invoiceNo: { ar: 'رقم الفاتورة', en: 'Invoice No.' },
  client: { ar: 'العميل', en: 'Client' },
  project: { ar: 'المشروع', en: 'Project' },
  equipment: { ar: 'المعدة', en: 'Equipment' },
  date: { ar: 'التاريخ', en: 'Date' },
  dueDate: { ar: 'تاريخ الاستحقاق', en: 'Due Date' },
  subtotal: { ar: 'المجموع الفرعي', en: 'Subtotal' },
  vat: { ar: 'الضريبة (15%)', en: 'VAT (15%)' },
  total: { ar: 'الإجمالي', en: 'Total' },
  paid: { ar: 'المدفوع', en: 'Paid' },
  outstanding: { ar: 'المستحق', en: 'Outstanding' },
  status: { ar: 'الحالة', en: 'Status' },
  actions: { ar: 'الإجراءات', en: 'Actions' },
  newInvoice: { ar: 'فاتورة إيجار جديدة', en: 'New Rental Invoice' },
  search: { ar: 'بحث برقم الفاتورة أو العميل...', en: 'Search by invoice no. or client...' },
  allStatus: { ar: 'كل الحالات', en: 'All Status' },
  totalRevenue: { ar: 'إجمالي إيرادات الإيجار', en: 'Total Rental Revenue' },
  selectTimesheet: { ar: 'اختر سجل ساعات العمل المعتمد', en: 'Select Approved Timesheet' },
  contractNo: { ar: 'رقم العقد', en: 'Contract No.' },
  salesOrderNo: { ar: 'رقم طلب البيع', en: 'Sales Order No.' },
  hourlyRate: { ar: 'سعر الساعة', en: 'Hourly Rate' },
  operatingHours: { ar: 'ساعات التشغيل', en: 'Operating Hours' },
  deliveryFees: { ar: 'رسوم النقل', en: 'Delivery Fees' },
  deliveryFeesTaxable: { ar: 'رسوم النقل خاضعة للضريبة', en: 'Delivery Fees Taxable' },
  paymentTerms: { ar: 'شروط السداد', en: 'Payment Terms' },
  deliveryMonth: { ar: 'شهر التسليم', en: 'Delivery Month' },
  notes: { ar: 'ملاحظات', en: 'Notes' },
  invoiceSummary: { ar: 'ملخص الفاتورة', en: 'Invoice Summary' },
  autoFilledFromContract: { ar: 'تعبئة تلقائية من العقد', en: 'Auto-filled from Contract' },
  autoFilledFromTimesheet: { ar: 'تعبئة تلقائية من سجل الساعات', en: 'Auto-filled from Timesheet' },
  readOnlyFromContract: { ar: 'من العقد فقط - للقراءة فقط', en: 'From contract only - read only' },
  deleteTitle: { ar: 'حذف الفاتورة', en: 'Delete Invoice' },
  deleteConfirm: { ar: 'هل أنت متأكد من حذف هذه الفاتورة؟', en: 'Are you sure you want to delete this invoice?' },
  noInvoices: { ar: 'لا توجد فواتير إيجار', en: 'No rental invoices' },
  noApprovedTimesheets: { ar: 'لا توجد سجلات ساعات معتمدة غير مفوترة', en: 'No approved uninvoiced timesheets' },
  period: { ar: 'فترة العمل', en: 'Period' },
}

// ============ View State ============
type ViewState = { type: 'list' } | { type: 'create' } | { type: 'detail'; invoiceId: string }

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

// ============ Create Rental Invoice Page ============
function CreateRentalInvoicePage({
  approvedTimesheets, onBack,
}: {
  approvedTimesheets: TimesheetOption[]; onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [timesheetId, setTimesheetId] = useState('')
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [rentalRevenueAccountId, setRentalRevenueAccountId] = useState<string | null>(null)
  const [rentalRevenueAccountCode, setRentalRevenueAccountCode] = useState('6210')
  const [rentalRevenueAccountNameAr, setRentalRevenueAccountNameAr] = useState('إيرادات تأجير المعدات')

  // Selected timesheet - RULE: User selects ONLY a Timesheet
  const selectedTimesheet = approvedTimesheets.find(ts => ts.id === timesheetId)

  // RULE: System auto-fills from contract and timesheet
  // Auto-filled from contract: client, project, equipment, contract no, sales order no, hourly rate, delivery fees, payment terms
  // Auto-filled from timesheet: month, year, operating hours
  // RULE: Rate is read-only (from contract)
  const contract = selectedTimesheet?.contract
  const rental = selectedTimesheet?.rental
  const hourlyRate = rental?.hourlyRate || contract?.hourlyRate || 0
  const operatingHours = selectedTimesheet?.operatingHours || 0
  const deliveryFees = rental?.deliveryFees || contract?.deliveryFees || 0
  const deliveryFeesTaxable = rental?.deliveryFeesTaxable ?? contract?.deliveryFeesTaxable ?? true
  const clientId = rental?.clientId || contract?.clientId || ''
  const clientName = selectedTimesheet?.clientName || selectedTimesheet?.clientNameAr || ''
  const projectId = selectedTimesheet?.projectId || ''
  const projectName = selectedTimesheet?.project?.name || ''
  const equipmentName = selectedTimesheet?.equipment?.nameAr || selectedTimesheet?.equipment?.name || ''
  const contractNo = contract?.contractNo || ''
  const salesOrderNo = rental?.salesOrderNo || contract?.salesOrderNo || ''
  const paymentTerms = rental?.paymentDuration || contract?.paymentTerms || '30 days'

  // RULE: System auto-calculates: hours × rate = subtotal
  const subtotal = operatingHours * hourlyRate
  const vatRate = 0.15
  const rentalVat = Math.round(subtotal * vatRate * 100) / 100
  // Delivery fees (with/without VAT based on contract setting)
  const deliveryVat = deliveryFeesTaxable && deliveryFees > 0 ? Math.round(deliveryFees * vatRate * 100) / 100 : 0
  const totalVat = rentalVat + deliveryVat
  const totalAmount = subtotal + deliveryFees + totalVat

  // Compute JE preview lines
  const jeLines = useMemo<JePreviewLine[]>(() => {
    const ts = approvedTimesheets.find(t => t.id === timesheetId)
    if (!ts) return []
    const _hourlyRate = ts.rental?.hourlyRate || ts.contract?.hourlyRate || 0
    const _operatingHours = ts.operatingHours || 0
    const _deliveryFees = ts.rental?.deliveryFees || ts.contract?.deliveryFees || 0
    const _deliveryFeesTaxable = ts.rental?.deliveryFeesTaxable ?? ts.contract?.deliveryFeesTaxable ?? true
    const _subtotal = _operatingHours * _hourlyRate
    const _rentalVat = Math.round(_subtotal * 0.15 * 100) / 100
    const _deliveryVat = _deliveryFeesTaxable && _deliveryFees > 0 ? Math.round(_deliveryFees * 0.15 * 100) / 100 : 0
    const _totalVat = _rentalVat + _deliveryVat
    const _totalAmount = _subtotal + _deliveryFees + _totalVat
    if (_totalAmount <= 0) return []
    const lines: JePreviewLine[] = []
    // Debit: Clients Receivable
    lines.push({ accountCode: '1210', accountNameAr: 'عملاء', debit: _totalAmount, credit: 0 })
    // Credit: Rental Revenue (or Delivery Revenue)
    const revenueCode = rentalRevenueAccountCode || '6210'
    const revenueName = rentalRevenueAccountNameAr || 'إيرادات تأجير المعدات'
    if (_subtotal > 0) {
      lines.push({ accountCode: revenueCode, accountNameAr: revenueName, debit: 0, credit: _subtotal })
    }
    if (_deliveryFees > 0) {
      lines.push({ accountCode: '6220', accountNameAr: 'إيرادات نقل وتوصيل', debit: 0, credit: _deliveryFees })
    }
    // Credit: Output VAT if VAT > 0
    if (_totalVat > 0) {
      lines.push({ accountCode: '3110', accountNameAr: 'ضريبة مخرجات', debit: 0, credit: _totalVat })
    }
    return lines
  }, [timesheetId, approvedTimesheets, rentalRevenueAccountCode, rentalRevenueAccountNameAr])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/sales-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error((err as { error?: string }).error || 'فشل في إنشاء الفاتورة')
        }
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['equipment-timesheets'] })
      onBack()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!timesheetId || !date || !dueDate || !clientId) return

    // Accounting Integration: When rental invoice is created,
    // the accounting engine should create journal entries:
    // Debit: Accounts Receivable (totalAmount)
    // Credit: Rental Revenue (subtotal)
    // Credit: Delivery Revenue (deliveryFees) if applicable
    // Credit: Output VAT (totalVat)
    // Also, timesheet status should be updated to INVOICED
    // This is handled via POST /api/journal-entries with sourceType: SALES_INVOICE
    createMutation.mutate({
      sourceType: 'TIMESHEET',
      timesheetId,
      date,
      dueDate,
      notes,
      rentalRevenueAccountId: rentalRevenueAccountId || undefined,
      rentalRevenueAccountCode: rentalRevenueAccountCode || undefined,
    })
  }

  // RULE: Cannot create invoice without an approved timesheet
  if (approvedTimesheets.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowRight className="size-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{t('فاتورة إيجار جديدة', 'New Rental Invoice')}</h1>
          </div>
        </div>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-6 text-center">
            <p className="text-amber-700 font-medium">{t(labels.noApprovedTimesheets.ar, labels.noApprovedTimesheets.en)}</p>
            <p className="text-sm text-amber-600 mt-1">{t('يجب اعتماد سجل ساعات عمل أولاً من وحدة ساعات العمل', 'An approved timesheet must be created first from the Timesheets module')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t('فاتورة إيجار جديدة', 'New Rental Invoice')}</h1>
          <p className="text-sm text-muted-foreground">{t('إنشاء فاتورة إيجار من سجل ساعات عمل معتمد', 'Create rental invoice from an approved timesheet')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* RULE: User selects ONLY a Timesheet */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('اختيار سجل الساعات', 'Select Timesheet')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t(labels.selectTimesheet.ar, labels.selectTimesheet.en)} *</Label>
              <Select value={timesheetId} onValueChange={setTimesheetId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t(labels.selectTimesheet.ar, labels.selectTimesheet.en)} /></SelectTrigger>
                <SelectContent>
                  {approvedTimesheets.map(ts => (
                    <SelectItem key={ts.id} value={ts.id}>
                      {ts.equipment?.name || '—'} - {formatMonthYear(ts.month, ts.year, lang)} ({formatNumber(ts.operatingHours)} {t('ساعة', 'hrs')}) [{ts.contract?.contractNo}]
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Auto-filled info from timesheet & contract */}
            {selectedTimesheet && (
              <div className="p-4 rounded-lg border bg-blue-50 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700 mb-2">
                  <FileText className="size-4" />
                  {t(labels.autoFilledFromContract.ar, labels.autoFilledFromContract.en)} / {t(labels.autoFilledFromTimesheet.ar, labels.autoFilledFromTimesheet.en)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-muted-foreground">{t(labels.client.ar, labels.client.en)}:</span><p className="font-medium">{clientName}</p></div>
                  <div><span className="text-muted-foreground">{t(labels.project.ar, labels.project.en)}:</span><p className="font-medium">{projectName}</p></div>
                  <div><span className="text-muted-foreground">{t(labels.equipment.ar, labels.equipment.en)}:</span><p className="font-medium">{equipmentName}</p></div>
                  <div><span className="text-muted-foreground">{t(labels.deliveryMonth.ar, labels.deliveryMonth.en)}:</span><p className="font-medium">{formatMonthYear(selectedTimesheet.month, selectedTimesheet.year, lang)}</p></div>
                  <div><span className="text-muted-foreground">{t(labels.contractNo.ar, labels.contractNo.en)}:</span><p className="font-medium font-mono">{contractNo}</p></div>
                  <div><span className="text-muted-foreground">{t(labels.salesOrderNo.ar, labels.salesOrderNo.en)}:</span><p className="font-medium font-mono">{salesOrderNo || '—'}</p></div>
                  <div><span className="text-muted-foreground">{t(labels.paymentTerms.ar, labels.paymentTerms.en)}:</span><p className="font-medium">{paymentTerms}</p></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Operating Hours & Rate - RULE: No manual editing of rate or hours */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('ساعات التشغيل والسعر', 'Operating Hours & Rate')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.operatingHours.ar, labels.operatingHours.en)}</Label>
                {/* Auto-filled from timesheet - read only */}
                <Input type="number" value={operatingHours || ''} readOnly className="bg-gray-100" dir="ltr" />
                <p className="text-xs text-muted-foreground">{t('من سجل الساعات - للقراءة فقط', 'From timesheet - read only')}</p>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.hourlyRate.ar, labels.hourlyRate.en)}</Label>
                {/* RULE: Rate is read-only (from contract) */}
                <Input type="number" value={hourlyRate || ''} readOnly className="bg-gray-100" dir="ltr" />
                <p className="text-xs text-muted-foreground">{t(labels.readOnlyFromContract.ar, labels.readOnlyFromContract.en)}</p>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.subtotal.ar, labels.subtotal.en)} ({t('ساعات × سعر', 'hrs × rate')})</Label>
                <div className="h-9 flex items-center">
                  <MoneyDisplay value={subtotal} lang={lang} size="md" bold />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Fees (from contract) */}
        {deliveryFees > 0 && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{t(labels.deliveryFees.ar, labels.deliveryFees.en)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t(labels.deliveryFees.ar, labels.deliveryFees.en)}</Label>
                  <Input type="number" value={deliveryFees} readOnly className="bg-gray-100" dir="ltr" />
                </div>
                <div className="space-y-2 flex items-center gap-2 pt-6">
                  <Badge variant="outline" className={deliveryFeesTaxable ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}>
                    {deliveryFeesTaxable ? t('خاضعة للضريبة', 'Taxable') : t('غير خاضعة للضريبة', 'Not Taxable')}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dates */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('التواريخ', 'Dates')}</CardTitle>
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

        {/* Revenue Account Selection */}
        {selectedTimesheet && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{t('حساب الإيرادات', 'Revenue Account')}</CardTitle>
            </CardHeader>
            <CardContent>
              <AccountSelector
                roles={['RENTAL_REVENUE']}
                value={rentalRevenueAccountId}
                onValueChange={(id, account) => {
                  setRentalRevenueAccountId(id)
                  setRentalRevenueAccountCode(account.code)
                  setRentalRevenueAccountNameAr(account.nameAr || account.name)
                }}
                label={t('حساب إيرادات التأجير', 'Rental Revenue Account')}
                placeholder={t('اختر حساب الإيرادات...', 'Select revenue account...')}
              />
              <p className="text-xs text-muted-foreground mt-2">{t('اختر حساب الإيرادات الذي سيُقيد في الجانب الدائن من القيد المحاسبي', 'Select the revenue account to be credited in the journal entry')}</p>
            </CardContent>
          </Card>
        )}

        {/* Invoice Summary */}
        {selectedTimesheet && subtotal > 0 && (
          <Card className="bg-gray-50 border-dashed">
            <CardContent className="p-6 space-y-3">
              <h3 className="text-lg font-semibold mb-2">{t(labels.invoiceSummary.ar, labels.invoiceSummary.en)}</h3>
              <div className="flex justify-between text-sm">
                <span>{t(labels.subtotal.ar, labels.subtotal.en)} ({formatNumber(operatingHours)} {t('ساعة', 'hrs')} × <MoneyDisplay value={hourlyRate} lang={lang} size="xs" inline showSymbol={false} />)</span>
                <span className="font-medium"><MoneyDisplay value={subtotal} lang={lang} size="sm" inline /></span>
              </div>
              {deliveryFees > 0 && (
                <div className="flex justify-between text-sm text-amber-700">
                  <span>{t(labels.deliveryFees.ar, labels.deliveryFees.en)} {deliveryFeesTaxable ? `(${t('خاضعة للضريبة', 'taxable')})` : `(${t('غير خاضعة', 'not taxable')})`}</span>
                  <span className="font-medium"><MoneyDisplay value={deliveryFees} lang={lang} size="sm" inline /></span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>{t(labels.vat.ar, labels.vat.en)}</span>
                <span className="font-medium"><MoneyDisplay value={totalVat} lang={lang} size="sm" inline /></span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>{t(labels.total.ar, labels.total.en)}</span>
                <span className="text-emerald-700"><MoneyDisplay value={totalAmount} lang={lang} size="lg" inline bold /></span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* JE Preview */}
        {selectedTimesheet && totalAmount > 0 && (
          <JePreview lines={jeLines} title={t('القيد المحاسبي المتوقع', 'Expected Journal Entry')} />
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          {createMutation.isError && (
            <p className="text-sm text-rose-600">{(createMutation.error as Error)?.message || t('فشل في إنشاء الفاتورة', 'Failed to create invoice')}</p>
          )}
          <Button type="button" variant="outline" onClick={onBack}>{commonText.cancel[lang]}</Button>
          <Button type="submit" disabled={createMutation.isPending || !timesheetId || !date || !dueDate || !clientId} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء فاتورة الإيجار', 'Create Rental Invoice')}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Main Rental Invoices Module ============
export function RentalInvoicesModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<'revert' | 'cancel' | null>(null)

  // Fetch rental invoices
  const { data: invoices = [], isLoading, isError, refetch } = useQuery<RentalInvoice[]>({
    queryKey: ['rental-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/sales-invoices?invoiceType=RENTAL')
      if (!res.ok) throw new Error('Failed to fetch')
      const all: RentalInvoice[] = await res.json()
      return all.filter(i => i.invoiceType === 'RENTAL')
    },
  })

  // Fetch approved uninvoiced timesheets for create form
  // RULE: Cannot create invoice without an approved timesheet
  // RULE: No duplicate invoice for same timesheet
  const { data: approvedTimesheets = [] } = useQuery<TimesheetOption[]>({
    queryKey: ['approved-timesheets'],
    queryFn: async () => {
      const res = await fetch('/api/equipment/timesheets?status=APPROVED')
      if (!res.ok) return []
      const data = await res.json()
      // RULE: Only APPROVED timesheets that are not yet invoiced
      return (Array.isArray(data) ? data : []).filter((ts: { status: string; invoice: null }) => ts.status === 'APPROVED' && !ts.invoice)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/sales-invoices/${id}`, { method: 'DELETE' }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || 'فشل في الحذف') }
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['approved-timesheets'] })
      queryClient.invalidateQueries({ queryKey: ['equipment-timesheets'] })
      setDeleteId(null)
    },
  })

  // Status change mutation (revert to draft, cancel, send)
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/sales-invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || 'فشل في تحديث الحالة') }
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['approved-timesheets'] })
      queryClient.invalidateQueries({ queryKey: ['equipment-timesheets'] })
      setActionId(null)
      setActionType(null)
    },
  })

  // Handle status actions
  const handleRevertToDraft = (id: string) => {
    setActionId(id)
    setActionType('revert')
  }

  const handleCancel = (id: string) => {
    setActionId(id)
    setActionType('cancel')
  }

  const confirmAction = () => {
    if (!actionId || !actionType) return
    const status = actionType === 'revert' ? 'DRAFT' : 'CANCELLED'
    statusMutation.mutate({ id: actionId, status })
  }

  // Filters
  const filtered = invoices.filter(inv => {
    const matchSearch = !search || inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      inv.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      (inv.project?.name?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalRevenue = invoices.reduce((s, i) => s + (Number(i.totalAmount || 0)), 0)
  const totalPaid = invoices.reduce((s, i) => s + (Number(i.paidAmount || 0)), 0)
  const totalOutstanding = totalRevenue - totalPaid

  const handleExport = () => {
    const csv = [
      [t('رقم الفاتورة', 'Invoice No'), t('العميل', 'Client'), t('المشروع', 'Project'), t('التاريخ', 'Date'), t('الإجمالي', 'Total'), t('المدفوع', 'Paid'), t('المتبقي', 'Outstanding'), t('الحالة', 'Status')].join(','),
      ...filtered.map(inv => [inv.invoiceNo, `"${inv.client?.name || ''}"`, `"${inv.project?.name || ''}"`, formatDate(inv.date, lang), (Number(inv.totalAmount || 0)).toFixed(2), (Number(inv.paidAmount || 0)).toFixed(2), ((Number(inv.totalAmount || 0)) - (Number(inv.paidAmount || 0))).toFixed(2), inv.status].join(','))
    ].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `rental-invoices-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  // ============ CREATE VIEW ============
  if (viewState.type === 'create') {
    return (
      <CreateRentalInvoicePage
        approvedTimesheets={approvedTimesheets}
        onBack={() => setViewState({ type: 'list' })}
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
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setViewState({ type: 'list' })}>
            <ArrowRight className="size-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">{t('فاتورة إيجار', 'Rental Invoice')} {invoice.invoiceNo}</h2>
              <StatusBadge status={invoice.status} lang={lang} />
            </div>
            <p className="text-sm text-muted-foreground">{invoice.client?.name || '—'}</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintButton type="rental-invoice" documentId={invoice.id} />
            {/* Status Actions */}
            {invoice.status === 'DRAFT' && (
              <Button variant="outline" size="sm" className="gap-1 text-blue-600" onClick={() => statusMutation.mutate({ id: invoice.id, status: 'SENT' })} disabled={statusMutation.isPending}>
                <Send className="size-4" /> {t('إرسال', 'Send')}
              </Button>
            )}
            {invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED' && (
              <Button variant="outline" size="sm" className="gap-1 text-amber-600" onClick={() => handleRevertToDraft(invoice.id)} disabled={statusMutation.isPending}>
                <RotateCcw className="size-4" /> {t('إرجاع كمسودة', 'Revert to Draft')}
              </Button>
            )}
            {invoice.status !== 'CANCELLED' && (
              <Button variant="outline" size="sm" className="gap-1 text-rose-600" onClick={() => handleCancel(invoice.id)} disabled={statusMutation.isPending}>
                <XCircle className="size-4" /> {t('إلغاء الفاتورة', 'Cancel Invoice')}
              </Button>
            )}
            {(invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') && (
              <Button variant="outline" size="sm" className="gap-1 text-rose-600" onClick={() => setDeleteId(invoice.id)} disabled={deleteMutation.isPending}>
                <Trash2 className="size-4" /> {t('حذف', 'Delete')}
              </Button>
            )}
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.client.ar, labels.client.en)}</p><p className="text-sm font-medium truncate">{invoice.client?.name || '—'}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.project.ar, labels.project.en)}</p><p className="text-sm font-medium truncate">{invoice.project?.name || '—'}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.date.ar, labels.date.en)}</p><p className="text-sm font-medium">{formatDate(invoice.date, lang)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.dueDate.ar, labels.dueDate.en)}</p><p className="text-sm font-medium">{formatDate(invoice.dueDate, lang)}</p></CardContent></Card>
        </div>

        {/* Rental Contract Info */}
        {(invoice.contractNo || invoice.salesOrderNo || invoice.equipmentName) && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-lg">{t('بيانات العقد', 'Contract Information')}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {invoice.contractNo && <div><span className="text-muted-foreground">{t(labels.contractNo.ar, labels.contractNo.en)}:</span><p className="font-medium font-mono">{invoice.contractNo}</p></div>}
                {invoice.salesOrderNo && <div><span className="text-muted-foreground">{t(labels.salesOrderNo.ar, labels.salesOrderNo.en)}:</span><p className="font-medium font-mono">{invoice.salesOrderNo}</p></div>}
                {invoice.equipmentName && <div><span className="text-muted-foreground">{t(labels.equipment.ar, labels.equipment.en)}:</span><p className="font-medium">{invoice.equipmentName}</p></div>}
                {invoice.deliveryMonth && <div><span className="text-muted-foreground">{t(labels.deliveryMonth.ar, labels.deliveryMonth.en)}:</span><p className="font-medium">{invoice.deliveryMonth}</p></div>}
                {invoice.operatingHours !== null && invoice.operatingHours !== undefined && (
                  <div><span className="text-muted-foreground">{t(labels.operatingHours.ar, labels.operatingHours.en)}:</span><p className="font-medium">{formatNumber(invoice.operatingHours)} {t('ساعة', 'hrs')}</p></div>
                )}
                {invoice.hourlyRate !== null && invoice.hourlyRate !== undefined && (
                  <div><span className="text-muted-foreground">{t(labels.hourlyRate.ar, labels.hourlyRate.en)}:</span><MoneyDisplay value={invoice.hourlyRate} lang={lang} size="sm" inline /></div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items Table */}
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('بنود الإيجار', 'Rental Items')}</CardTitle></CardHeader>
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
                  {invoice.includeDelivery && (invoice.deliveryAmount ?? 0) > 0 && (
                    <TableRow className="bg-amber-50">
                      <TableCell colSpan={3} className="text-left font-medium text-amber-700">{t(labels.deliveryFees.ar, labels.deliveryFees.en)} {invoice.deliveryFeesTaxable ? `(${t('خاضعة للضريبة', 'Taxable')})` : `(${t('غير خاضعة', 'Not Taxable')})`}</TableCell>
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
                    <TableCell className="font-bold text-rose-700"><MoneyDisplay value={(Number(invoice.totalAmount || 0)) - (Number(invoice.paidAmount || 0))} lang={lang} size="md" inline bold /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {invoice.notes && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">{t(labels.notes.ar, labels.notes.en)}</p>
              <p className="text-sm">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Status Change Confirmation */}
        <AlertDialog open={!!actionId && !!actionType} onOpenChange={() => { setActionId(null); setActionType(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{actionType === 'revert' ? t('إرجاع الفاتورة كمسودة', 'Revert Invoice to Draft') : t('إلغاء الفاتورة', 'Cancel Invoice')}</AlertDialogTitle>
              <AlertDialogDescription>
                {actionType === 'revert'
                  ? t('هل أنت متأكد من إرجاع هذه الفاتورة كمسودة؟ سيتم إعادة سجل الساعات إلى حالة معتمد ويمكن إنشاء فاتورة جديدة.', 'Are you sure you want to revert this invoice to draft? The timesheet will be reverted to Approved status and a new invoice can be created.')
                  : t('هل أنت متأكد من إلغاء هذه الفاتورة؟ سيتم إعادة سجل الساعات إلى حالة معتمد.', 'Are you sure you want to cancel this invoice? The timesheet will be reverted to Approved status.')
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{commonText.cancel[lang]}</AlertDialogCancel>
              <AlertDialogAction
                className={actionType === 'revert' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'}
                onClick={confirmAction}
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? t('جاري التنفيذ...', 'Processing...') : actionType === 'revert' ? t('إرجاع كمسودة', 'Revert to Draft') : t('إلغاء الفاتورة', 'Cancel Invoice')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ============ LIST VIEW ============
  return (
    <ModuleLayout
      title={labels.title}
      subtitle={labels.subtitle}
      actions={
        <>
          <Button variant="outline" size="icon" onClick={handleExport} title={t('تصدير', 'Export')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
            <Plus className="size-4" /> {t(labels.newInvoice.ar, labels.newInvoice.en)}
          </Button>
        </>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4">
            <p className="text-sm text-emerald-600">{t(labels.totalRevenue.ar, labels.totalRevenue.en)}</p>
            <MoneyDisplay value={totalRevenue} lang={lang} size="xl" bold className="text-emerald-700" />
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

      {/* Available Timesheets Notice */}
      {approvedTimesheets.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 flex items-center gap-3">
            <FileText className="size-5 text-blue-600" />
            <div>
              <p className="text-sm text-blue-700 font-medium">
                {t('سجلات ساعات معتمدة جاهزة للفاتورة', 'Approved timesheets ready for invoicing')}: {approvedTimesheets.length}
              </p>
              <Button variant="link" className="p-0 h-auto text-blue-700 text-sm" onClick={() => setViewState({ type: 'create' })}>
                {t('إنشاء فاتورة الآن', 'Create invoice now')} →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                <SelectItem value="CANCELLED">{t('ملغاة', 'Cancelled')}</SelectItem>
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
              <FileSpreadsheet className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t(labels.noInvoices.ar, labels.noInvoices.en)}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
                <Plus className="size-4 mr-1" /> {t(labels.newInvoice.ar, labels.newInvoice.en)}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(labels.invoiceNo.ar, labels.invoiceNo.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.client.ar, labels.client.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.project.ar, labels.project.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.equipment.ar, labels.equipment.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.period.ar, labels.period.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.total.ar, labels.total.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.paid.ar, labels.paid.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.status.ar, labels.status.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.actions.ar, labels.actions.en)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(inv => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', invoiceId: inv.id })}>
                      <TableCell className="font-medium font-mono">{inv.invoiceNo}</TableCell>
                      <TableCell>{inv.client?.name || '—'}</TableCell>
                      <TableCell>{inv.project?.name || '—'}</TableCell>
                      <TableCell>{inv.equipmentName || '—'}</TableCell>
                      <TableCell>{inv.deliveryMonth || '—'}</TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" inline bold /></TableCell>
                      <TableCell className="text-amber-700"><MoneyDisplay value={inv.paidAmount} lang={lang} size="sm" inline /></TableCell>
                      <TableCell><StatusBadge status={inv.status} lang={lang} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewState({ type: 'detail', invoiceId: inv.id })} title={t('عرض', 'View')}>
                            <Eye className="size-4" />
                          </Button>
                          <PrintButton type="rental-invoice" documentId={inv.id} size="icon" variant="ghost" className="size-8" />
                          {(inv.status === 'DRAFT' || inv.status === 'CANCELLED') && (
                            <Button variant="ghost" size="icon" className="size-8 text-rose-600" onClick={() => setDeleteId(inv.id)} title={t('حذف', 'Delete')}>
                              <Trash2 className="size-4" />
                            </Button>
                          )}
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

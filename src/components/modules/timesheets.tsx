'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, Plus, Search, RefreshCw, ArrowRight, Eye, Trash2,
  Send, CheckCircle, FileText,
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
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout, StatusBadge } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { useAppStore, formatNumber, commonText } from '@/stores/app-store'

// ============ Arabic/English Month Names ============
const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const englishMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatMonthYear(month: number, year: number, lang: 'ar' | 'en'): string {
  if (lang === 'ar') return `${arabicMonths[month - 1]} ${year}`
  return `${englishMonths[month - 1]} ${year}`
}

// ============ Types ============
interface RentalContractOption {
  id: string; contractId: string; hourlyRate: number; deliveryFees: number
  deliveryFeesTaxable: boolean; salesOrderNo: string | null; paymentDuration: string | null
  clientId: string; equipmentId: string; projectId: string | null
  client: { id: string; name: string; nameAr?: string | null }
  project: { id: string; name: string; nameAr?: string | null } | null
  equipment: { id: string; name: string; nameAr?: string | null; code: string }
  contract: { id: string; contractNo: string; status: string }
}

interface TimesheetItem {
  id: string
  rentalId: string
  contractId: string
  projectId: string
  equipmentId: string
  month: number
  year: number
  operatingHours: number
  status: string // DRAFT | SUBMITTED | APPROVED | INVOICED
  approvedDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  contract: {
    id: string; contractNo: string; hourlyRate: number; deliveryFees: number
    deliveryFeesTaxable: boolean; salesOrderNo: string | null; paymentTerms: string | null
    project: { id: string; name: string; nameAr: string | null; code: string }
  }
  project: { id: string; name: string; nameAr: string | null; code: string }
  equipment: { id: string; name: string; nameAr: string | null; code: string }
  rental: { id: string; hourlyRate: number; pricingType: string; clientId: string; client?: { id: string; name: string; nameAr: string | null } } | null
  invoice: { id: string; invoiceNo: string; status: string } | null
  clientName?: string
  clientNameAr?: string
}

// ============ Labels ============
const labels = {
  title: { ar: 'ساعات العمل', en: 'Timesheets' },
  subtitle: { ar: 'إدارة سجلات ساعات عمل المعدات', en: 'Manage equipment working hours records' },
  contract: { ar: 'العقد', en: 'Contract' },
  month: { ar: 'الشهر', en: 'Month' },
  year: { ar: 'السنة', en: 'Year' },
  operatingHours: { ar: 'ساعات التشغيل', en: 'Operating Hours' },
  hourlyRate: { ar: 'سعر الساعة', en: 'Hourly Rate' },
  billingAmount: { ar: 'مبلغ الفاتورة', en: 'Billing Amount' },
  status: { ar: 'الحالة', en: 'Status' },
  actions: { ar: 'الإجراءات', en: 'Actions' },
  project: { ar: 'المشروع', en: 'Project' },
  equipment: { ar: 'المعدة', en: 'Equipment' },
  client: { ar: 'العميل', en: 'Client' },
  newTimesheet: { ar: 'سجل جديد', en: 'New Timesheet' },
  search: { ar: 'بحث بالشهر، المشروع، العقد...', en: 'Search by month, project, contract...' },
  allStatus: { ar: 'كل الحالات', en: 'All Status' },
  deliveryMonth: { ar: 'شهر التسليم', en: 'Delivery Month' },
  notes: { ar: 'ملاحظات', en: 'Notes' },
  selectContract: { ar: 'اختر العقد النشط', en: 'Select Active Contract' },
  totalHours: { ar: 'إجمالي الساعات', en: 'Total Hours' },
  totalAmount: { ar: 'إجمالي المبلغ', en: 'Total Amount' },
  submit: { ar: 'تقديم', en: 'Submit' },
  approve: { ar: 'اعتماد', en: 'Approve' },
  invoiceGenerated: { ar: 'تم إنشاء الفاتورة', en: 'Invoice Generated' },
  deleteTitle: { ar: 'حذف سجل الساعات', en: 'Delete Timesheet' },
  deleteConfirm: { ar: 'هل أنت متأكد من حذف هذا السجل؟', en: 'Are you sure you want to delete this timesheet?' },
  noTimesheets: { ar: 'لا توجد سجلات ساعات عمل', en: 'No timesheets found' },
  noActiveContracts: { ar: 'لا توجد عقود نشطة', en: 'No active contracts' },
  cannotModifyInvoiced: { ar: 'لا يمكن تعديل سجل مفوتر', en: 'Cannot modify invoiced timesheet' },
  billingPreview: { ar: 'معاينة الفاتورة', en: 'Billing Preview' },
  subtotal: { ar: 'المجموع الفرعي', en: 'Subtotal' },
  deliveryFees: { ar: 'رسوم النقل', en: 'Delivery Fees' },
  vat: { ar: 'الضريبة (15%)', en: 'VAT (15%)' },
  totalWithVat: { ar: 'الإجمالي مع الضريبة', en: 'Total with VAT' },
  salesOrderNo: { ar: 'رقم طلب البيع', en: 'Sales Order No.' },
  paymentTerms: { ar: 'شروط السداد', en: 'Payment Terms' },
}

// ============ View State ============
type ViewState = { type: 'list' } | { type: 'create' } | { type: 'detail'; timesheetId: string }

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

// ============ Create Timesheet Page ============
function CreateTimesheetPage({
  contracts, onBack,
}: {
  contracts: RentalContractOption[]; onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [contractId, setContractId] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [operatingHours, setOperatingHours] = useState('')
  const [notes, setNotes] = useState('')

  // Selected contract details
  const selectedContract = contracts.find(c => c.id === contractId)

  // Auto-calculate billing
  const hours = parseFloat(operatingHours) || 0
  const hourlyRate = selectedContract?.hourlyRate || 0
  const subtotal = hours * hourlyRate
  const vatRate = 0.15
  const vatAmount = Math.round(subtotal * vatRate * 100) / 100
  const deliveryFees = selectedContract?.deliveryFees || 0
  const deliveryVat = selectedContract?.deliveryFeesTaxable ? Math.round(deliveryFees * vatRate * 100) / 100 : 0
  const totalWithVat = subtotal + vatAmount + deliveryFees + deliveryVat

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-timesheets'] })
      onBack()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!contractId || !month || !year || !operatingHours) return

    createMutation.mutate({
      rentalId: selectedContract?.id, // EquipmentRental ID
      contractId: selectedContract?.contractId, // Parent Contract ID
      projectId: selectedContract?.projectId,
      equipmentId: selectedContract?.equipmentId,
      month: parseInt(month),
      year: parseInt(year),
      operatingHours: hours,
      notes,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t('سجل ساعات عمل جديد', 'New Timesheet')}</h1>
          <p className="text-sm text-muted-foreground">{t('إنشاء سجل ساعات عمل مرتبط بعقد تأجير نشط', 'Create a timesheet linked to an active rental contract')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* RULE: No timesheet without an active contract */}
        {contracts.length === 0 ? (
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-6 text-center">
              <p className="text-amber-700 font-medium">{t(labels.noActiveContracts.ar, labels.noActiveContracts.en)}</p>
              <p className="text-sm text-amber-600 mt-1">{t('يجب إنشاء عقد تأجير نشط أولاً', 'An active rental contract must be created first')}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Contract Selection */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">{t('بيانات العقد', 'Contract Information')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t(labels.contract.ar, labels.contract.en)} *</Label>
                    <Select value={contractId} onValueChange={setContractId}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t(labels.selectContract.ar, labels.selectContract.en)} /></SelectTrigger>
                      <SelectContent>
                        {contracts.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.contract?.contractNo || '—'} - {c.equipment?.name || c.project?.name || '—'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t(labels.month.ar, labels.month.en)} *</Label>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر الشهر', 'Select month')} /></SelectTrigger>
                      <SelectContent>
                        {arabicMonths.map((m, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>
                            {lang === 'ar' ? m : englishMonths[i]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t(labels.year.ar, labels.year.en)} *</Label>
                    <Input type="number" min="2020" max="2099" value={year} onChange={e => setYear(e.target.value)} dir="ltr" />
                  </div>
                </div>

                {/* Auto-filled contract info */}
                {selectedContract && (
                  <div className="p-3 rounded-lg border bg-emerald-50 text-sm space-y-1">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span><span className="text-muted-foreground">{t(labels.client.ar, labels.client.en)}:</span> <span className="font-medium">{selectedContract.client?.name || '—'}</span></span>
                      <span><span className="text-muted-foreground">{t(labels.project.ar, labels.project.en)}:</span> <span className="font-medium">{selectedContract.project?.name || '—'}</span></span>
                      <span><span className="text-muted-foreground">{t(labels.equipment.ar, labels.equipment.en)}:</span> <span className="font-medium">{selectedContract.equipment?.name || '—'}</span></span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <span><span className="text-muted-foreground">{t(labels.hourlyRate.ar, labels.hourlyRate.en)}:</span> <MoneyDisplay value={selectedContract.hourlyRate} lang={lang} size="sm" inline bold /></span>
                      {selectedContract.deliveryFees > 0 && (
                        <span><span className="text-muted-foreground">{t(labels.deliveryFees.ar, labels.deliveryFees.en)}:</span> <MoneyDisplay value={selectedContract.deliveryFees} lang={lang} size="sm" inline /></span>
                      )}
                      {selectedContract.contract?.contractNo && (
                        <span><span className="text-muted-foreground">{t('رقم العقد', 'Contract No.')}:</span> <span className="font-medium font-mono">{selectedContract.contract.contractNo}</span></span>
                      )}
                      {selectedContract.salesOrderNo && (
                        <span><span className="text-muted-foreground">{t(labels.salesOrderNo.ar, labels.salesOrderNo.en)}:</span> <span className="font-medium font-mono">{selectedContract.salesOrderNo}</span></span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Operating Hours - RULE: Hourly rate comes from contract ONLY (read-only) */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">{t('ساعات التشغيل', 'Operating Hours')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t(labels.operatingHours.ar, labels.operatingHours.en)} *</Label>
                    <Input type="number" min="0" step="0.5" value={operatingHours || ''} onChange={e => setOperatingHours(e.target.value)} placeholder="0" dir="ltr" required />
                  </div>
                  <div className="space-y-2">
                    <Label>{t(labels.hourlyRate.ar, labels.hourlyRate.en)} ({t('من العقد', 'From Contract')})</Label>
                    {/* RULE: Rate is read-only from contract */}
                    <Input type="number" value={hourlyRate || ''} readOnly className="bg-gray-100" dir="ltr" />
                    <p className="text-xs text-muted-foreground">{t('سعر الساعة من العقد فقط - للقراءة فقط', 'Rate from contract only - read only')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t(labels.billingAmount.ar, labels.billingAmount.en)}</Label>
                    <div className="h-9 flex items-center">
                      <MoneyDisplay value={subtotal} lang={lang} size="md" bold />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Billing Preview */}
            {hours > 0 && selectedContract && (
              <Card className="bg-emerald-50 border-emerald-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{t(labels.billingPreview.ar, labels.billingPreview.en)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t('ساعات التشغيل', 'Operating Hours')}</span>
                    <span className="font-medium">{formatNumber(hours)} {t('ساعة', 'hours')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t(labels.subtotal.ar, labels.subtotal.en)}</span>
                    <span className="font-medium"><MoneyDisplay value={subtotal} lang={lang} size="sm" inline /></span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t(labels.vat.ar, labels.vat.en)}</span>
                    <span className="font-medium"><MoneyDisplay value={vatAmount} lang={lang} size="sm" inline /></span>
                  </div>
                  {deliveryFees > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-amber-700">
                        <span>{t(labels.deliveryFees.ar, labels.deliveryFees.en)}</span>
                        <span className="font-medium"><MoneyDisplay value={deliveryFees} lang={lang} size="sm" inline /></span>
                      </div>
                      {deliveryVat > 0 && (
                        <div className="flex justify-between text-sm text-amber-700">
                          <span>{t('ضريبة رسوم النقل', 'Delivery Fees VAT')}</span>
                          <span className="font-medium"><MoneyDisplay value={deliveryVat} lang={lang} size="sm" inline /></span>
                        </div>
                      )}
                    </>
                  )}
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>{t(labels.totalWithVat.ar, labels.totalWithVat.en)}</span>
                    <span className="text-emerald-700"><MoneyDisplay value={totalWithVat} lang={lang} size="lg" inline bold /></span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            <Card>
              <CardContent className="p-4">
                <Label>{t(labels.notes.ar, labels.notes.en)}</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ملاحظات إضافية', 'Additional notes')} rows={2} className="mt-2" />
              </CardContent>
            </Card>
          </>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>{commonText.cancel[lang]}</Button>
          <Button type="submit" disabled={createMutation.isPending || !contractId || !month || !year || !operatingHours || contracts.length === 0} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء السجل', 'Create Timesheet')}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Main Timesheets Module ============
export function TimesheetsModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Fetch timesheets
  const { data: timesheets = [], isLoading, isError, refetch } = useQuery<TimesheetItem[]>({
    queryKey: ['equipment-timesheets'],
    queryFn: async () => {
      const res = await fetch('/api/equipment/timesheets')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch active rental contracts for create form
  const { data: rentalContracts = [] } = useQuery<RentalContractOption[]>({
    queryKey: ['rental-contracts-for-timesheets'],
    queryFn: async () => {
      const res = await fetch('/api/equipment/rental-contracts')
      if (!res.ok) return []
      const data = await res.json()
      // Only active contracts
      return (Array.isArray(data) ? data : []).filter((c: { status: string }) => c.status === 'ACTIVE')
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/equipment/timesheets/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-timesheets'] })
      setDeleteId(null)
    },
  })

  // Status workflow mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/equipment/timesheets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-timesheets'] })
    },
  })

  // Filters
  const filtered = timesheets.filter(ts => {
    const monthYear = formatMonthYear(ts.month, ts.year, 'ar')
    const monthYearEn = formatMonthYear(ts.month, ts.year, 'en')
    const projectName = ts.project?.name || ''
    const contractNo = ts.contract?.contractNo || ''
    const matchSearch = !search ||
      monthYear.includes(search) ||
      monthYearEn.toLowerCase().includes(search.toLowerCase()) ||
      projectName.includes(search) ||
      contractNo.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || ts.status === statusFilter
    return matchSearch && matchStatus
  })

  // Summary
  const totalTimesheets = timesheets.length
  const draftCount = timesheets.filter(ts => ts.status === 'DRAFT').length
  const submittedCount = timesheets.filter(ts => ts.status === 'SUBMITTED').length
  const approvedCount = timesheets.filter(ts => ts.status === 'APPROVED').length
  const invoicedCount = timesheets.filter(ts => ts.status === 'INVOICED').length

  // ============ CREATE VIEW ============
  if (viewState.type === 'create') {
    return (
      <CreateTimesheetPage
        contracts={rentalContracts}
        onBack={() => setViewState({ type: 'list' })}
      />
    )
  }

  // ============ DETAIL VIEW ============
  if (viewState.type === 'detail') {
    const timesheet = timesheets.find(ts => ts.id === viewState.timesheetId)
    if (!timesheet) {
      return (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('لم يتم العثور على السجل', 'Timesheet not found')}</p>
          <Button variant="outline" onClick={() => setViewState({ type: 'list' })}>{t('العودة', 'Back')}</Button>
        </div>
      )
    }

    const hourlyRate = timesheet.rental?.hourlyRate || timesheet.contract?.hourlyRate || 0
    const subtotal = timesheet.operatingHours * hourlyRate
    const vatAmount = Math.round(subtotal * 0.15 * 100) / 100
    const totalAmount = subtotal + vatAmount
    const isInvoiced = timesheet.status === 'INVOICED'

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setViewState({ type: 'list' })}>
            <ArrowRight className="size-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">
                {t('سجل ساعات عمل', 'Timesheet')} - {formatMonthYear(timesheet.month, timesheet.year, lang)}
              </h2>
              <StatusBadge status={timesheet.status} lang={lang} />
            </div>
            <p className="text-sm text-muted-foreground">
              {timesheet.project?.name || '—'} - {timesheet.contract?.contractNo || '—'}
            </p>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.client.ar, labels.client.en)}</p><p className="text-sm font-medium truncate">{timesheet.clientName || timesheet.rental?.client?.name || '—'}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.project.ar, labels.project.en)}</p><p className="text-sm font-medium truncate">{timesheet.project?.name || '—'}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.equipment.ar, labels.equipment.en)}</p><p className="text-sm font-medium truncate">{timesheet.equipment?.name || '—'}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.operatingHours.ar, labels.operatingHours.en)}</p><p className="text-sm font-medium">{formatNumber(timesheet.operatingHours)} {t('ساعة', 'hrs')}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t(labels.deliveryMonth.ar, labels.deliveryMonth.en)}</p><p className="text-sm font-medium">{formatMonthYear(timesheet.month, timesheet.year, lang)}</p></CardContent></Card>
        </div>

        {/* Billing Details */}
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('تفاصيل الفوترة', 'Billing Details')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t(labels.operatingHours.ar, labels.operatingHours.en)}</span>
              <span className="font-medium">{formatNumber(timesheet.operatingHours)} {t('ساعة', 'hours')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t(labels.hourlyRate.ar, labels.hourlyRate.en)} ({t('من العقد', 'From Contract')})</span>
              <span className="font-medium"><MoneyDisplay value={hourlyRate} lang={lang} size="sm" inline /></span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span>{t('المجموع الفرعي', 'Subtotal')}</span>
              <span className="font-medium"><MoneyDisplay value={subtotal} lang={lang} size="sm" inline /></span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t(labels.vat.ar, labels.vat.en)}</span>
              <span className="font-medium"><MoneyDisplay value={vatAmount} lang={lang} size="sm" inline /></span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>{t('الإجمالي', 'Total')}</span>
              <span className="text-emerald-700"><MoneyDisplay value={totalAmount} lang={lang} size="lg" inline bold /></span>
            </div>
          </CardContent>
        </Card>

        {timesheet.notes && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">{t(labels.notes.ar, labels.notes.en)}</p>
              <p className="text-sm">{timesheet.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* RULE: Only APPROVED timesheets can be invoiced */}
        {/* RULE: Once INVOICED, timesheet cannot be modified */}
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold">{t('إجراءات سير العمل:', 'Workflow Actions:')}</span>
              {timesheet.status === 'DRAFT' && (
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => statusMutation.mutate({ id: timesheet.id, status: 'SUBMITTED' })} disabled={statusMutation.isPending}>
                  <Send className="size-4" /> {t(labels.submit.ar, labels.submit.en)}
                </Button>
              )}
              {timesheet.status === 'SUBMITTED' && (
                <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => statusMutation.mutate({ id: timesheet.id, status: 'APPROVED' })} disabled={statusMutation.isPending}>
                  <CheckCircle className="size-4" /> {t(labels.approve.ar, labels.approve.en)}
                </Button>
              )}
              {timesheet.status === 'APPROVED' && (
                <p className="text-sm text-emerald-700 font-medium">{t('جاهز للفاتورة - يمكن إنشاء فاتورة إيجار من وحدة فواتير الإيجار', 'Ready for invoicing - Create rental invoice from Rental Invoices module')}</p>
              )}
              {isInvoiced && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-sm px-3 py-1">
                  <FileText className="size-4 ml-1" />
                  {timesheet.invoice ? `${t(labels.invoiceGenerated.ar, labels.invoiceGenerated.en)} - ${timesheet.invoice.invoiceNo}` : t(labels.invoiceGenerated.ar, labels.invoiceGenerated.en)}
                </Badge>
              )}
              {isInvoiced && (
                <p className="text-xs text-muted-foreground">{t(labels.cannotModifyInvoiced.ar, labels.cannotModifyInvoiced.en)}</p>
              )}
            </div>
          </CardContent>
        </Card>
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
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
            <Plus className="size-4" /> {t(labels.newTimesheet.ar, labels.newTimesheet.en)}
          </Button>
        </>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">{t('إجمالي السجلات', 'Total')}</p>
            <p className="text-xl font-bold text-gray-700">{formatNumber(totalTimesheets)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">{t('مسودة', 'Draft')}</p>
            <p className="text-xl font-bold text-gray-700">{formatNumber(draftCount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-sm text-blue-500">{t('مقدمة', 'Submitted')}</p>
            <p className="text-xl font-bold text-blue-700">{formatNumber(submittedCount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4">
            <p className="text-sm text-emerald-500">{t('معتمدة', 'Approved')}</p>
            <p className="text-xl font-bold text-emerald-700">{formatNumber(approvedCount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4">
            <p className="text-sm text-purple-500">{t('مفوترة', 'Invoiced')}</p>
            <p className="text-xl font-bold text-purple-700">{formatNumber(invoicedCount)}</p>
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
                <SelectItem value="SUBMITTED">{t('مقدمة', 'Submitted')}</SelectItem>
                <SelectItem value="APPROVED">{t('معتمدة', 'Approved')}</SelectItem>
                <SelectItem value="INVOICED">{t('مفوترة', 'Invoiced')}</SelectItem>
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
              <Clock className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t(labels.noTimesheets.ar, labels.noTimesheets.en)}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
                <Plus className="size-4 mr-1" /> {t(labels.newTimesheet.ar, labels.newTimesheet.en)}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(labels.deliveryMonth.ar, labels.deliveryMonth.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.project.ar, labels.project.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.equipment.ar, labels.equipment.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.operatingHours.ar, labels.operatingHours.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.hourlyRate.ar, labels.hourlyRate.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.billingAmount.ar, labels.billingAmount.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.status.ar, labels.status.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.actions.ar, labels.actions.en)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(ts => {
                    const rate = ts.rental?.hourlyRate || ts.contract?.hourlyRate || 0
                    const amount = ts.operatingHours * rate
                    return (
                      <TableRow key={ts.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', timesheetId: ts.id })}>
                        <TableCell className="font-medium">{formatMonthYear(ts.month, ts.year, lang)}</TableCell>
                        <TableCell>{ts.project?.name || '—'}</TableCell>
                        <TableCell>{ts.equipment?.name || '—'}</TableCell>
                        <TableCell>{formatNumber(ts.operatingHours)}</TableCell>
                        <TableCell><MoneyDisplay value={rate} lang={lang} size="sm" inline /></TableCell>
                        <TableCell className="font-semibold"><MoneyDisplay value={amount} lang={lang} size="sm" inline bold /></TableCell>
                        <TableCell><StatusBadge status={ts.status} lang={lang} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <PrintButton type="timesheet-report" documentId={ts.id} size="icon" />
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewState({ type: 'detail', timesheetId: ts.id })} title={t('عرض', 'View')}>
                              <Eye className="size-4" />
                            </Button>
                            {/* RULE: Only DRAFT can be deleted; Once INVOICED, cannot be modified */}
                            {ts.status === 'DRAFT' && (
                              <Button variant="ghost" size="icon" className="size-8 text-rose-500" onClick={() => setDeleteId(ts.id)} title={t('حذف', 'Delete')}>
                                <Trash2 className="size-4" />
                              </Button>
                            )}
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

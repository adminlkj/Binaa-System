'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, Plus, Search, RefreshCw, ArrowRight, X, Trash2, Eye,
  Send, CheckCircle, FileText, ChevronDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { useAppStore, formatSAR as storeFormatSAR, formatNumber, commonText } from '@/stores/app-store'

// ============ Arabic Month Names ============
const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]
const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatMonthYear(month: number, year: number, lang: 'ar' | 'en'): string {
  if (lang === 'ar') {
    return `${arabicMonths[month - 1]}-${year}`
  }
  return `${englishMonths[month - 1]}-${year}`
}

function formatSAR(value: number, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatSAR(value, lang)
}

// ============ Types ============
interface ContractOption {
  id: string; contractNo: string; value: number; vatRate: number
  project: { id: string; name: string; nameAr: string | null; code: string }
}

interface TimesheetEntry {
  id: string; description: string; hours: number; rate: number; totalAmount: number
}

interface Timesheet {
  id: string; contractId: string; projectId: string; month: number; year: number
  status: string; notes: string | null; createdAt: string; updatedAt: string
  contract: { id: string; contractNo: string; value: number; vatRate: number; project: { id: string; name: string; nameAr: string | null; code: string; client: { id: string; name: string; nameAr: string | null } | null } | null }
  project: { id: string; name: string; nameAr: string | null; code: string; client: { id: string; name: string; nameAr: string | null } | null }
  entries: TimesheetEntry[]
}

interface EntryForm {
  description: string; hours: number; rate: number
}

// ============ Status Config ============
const statusLabels: Record<string, Record<string, string>> = {
  DRAFT: { ar: 'مسودة', en: 'Draft' },
  SUBMITTED: { ar: 'مقدمة', en: 'Submitted' },
  APPROVED: { ar: 'معتمدة', en: 'Approved' },
  INVOICED: { ar: 'مفوترة', en: 'Invoiced' },
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SUBMITTED: 'bg-blue-100 text-blue-700 border-blue-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  INVOICED: 'bg-purple-100 text-purple-700 border-purple-200',
}

const defaultEntry: EntryForm = { description: '', hours: 0, rate: 0 }

// ============ Skeleton ============
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
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

// ============ Create Timesheet Dialog ============
function CreateTimesheetDialog({
  open, onOpenChange, contracts,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  contracts: ContractOption[]
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()

  const [contractId, setContractId] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [notes, setNotes] = useState('')
  const [entries, setEntries] = useState<EntryForm[]>([{ ...defaultEntry }])

  React.useEffect(() => {
    if (open) {
      setContractId(''); setMonth(''); setYear(new Date().getFullYear().toString())
      setNotes(''); setEntries([{ ...defaultEntry }])
    }
  }, [open])

  // Auto-fill rate from contract value (spread across 12 months as a suggestion)
  const selectedContract = contracts.find(c => c.id === contractId)

  const addEntry = () => setEntries([...entries, { ...defaultEntry }])
  const removeEntry = (idx: number) => {
    if (entries.length > 1) setEntries(entries.filter((_, i) => i !== idx))
  }
  const updateEntry = (idx: number, field: keyof EntryForm, value: string | number) => {
    setEntries(entries.map((entry, i) => i === idx ? { ...entry, [field]: value } : entry))
  }

  const totalHours = useMemo(() => entries.reduce((s, e) => s + (parseFloat(String(e.hours)) || 0), 0), [entries])
  const totalAmount = useMemo(() => entries.reduce((s, e) => s + ((parseFloat(String(e.hours)) || 0) * (parseFloat(String(e.rate)) || 0)), 0), [entries])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/timesheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => {
        if (!r.ok) throw new Error()
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] })
      onOpenChange(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      contractId,
      projectId: selectedContract?.project?.id || '',
      month: parseInt(month),
      year: parseInt(year),
      notes,
      entries: entries.map(e => ({
        description: e.description,
        hours: parseFloat(String(e.hours)) || 0,
        rate: parseFloat(String(e.rate)) || 0,
      })),
    })
  }

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('سجل ساعات عمل جديد', 'New Timesheet')}</DialogTitle>
          <DialogDescription>{t('إنشاء سجل ساعات عمل مرتبط بعقد', 'Create a timesheet linked to a contract')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contract & Period */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t('العقد *', 'Contract *')}</Label>
              <Select value={contractId} onValueChange={setContractId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر العقد', 'Select contract')} /></SelectTrigger>
                <SelectContent>
                  {contracts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contractNo} - {c.project?.name || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('الشهر *', 'Month *')}</Label>
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
              <Label>{t('السنة *', 'Year *')}</Label>
              <Input
                type="number"
                min="2020"
                max="2099"
                value={year}
                onChange={e => setYear(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>

          {/* Project info (auto-filled) */}
          {selectedContract && (
            <div className="p-3 rounded-lg border bg-emerald-50 text-sm">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">{t('المشروع:', 'Project:')}</span>
                <span className="font-medium">{selectedContract.project?.name || '—'}</span>
                <span className="text-muted-foreground">{t('قيمة العقد:', 'Contract Value:')}</span>
                <span className="font-medium">{formatSAR(selectedContract.value, lang)}</span>
              </div>
            </div>
          )}

          {/* Entries */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">{t('بنود ساعات العمل', 'Timesheet Entries')}</Label>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addEntry}>
                <Plus className="size-3" /> {t('إضافة بند', 'Add Entry')}
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {entries.map((entry, idx) => (
                <div key={idx} className="flex items-end gap-2 p-2 rounded-lg border bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">{t('الوصف', 'Description')}</Label>
                    <Input
                      value={entry.description}
                      onChange={e => updateEntry(idx, 'description', e.target.value)}
                      placeholder={t('وصف العمل', 'Work description')}
                      className="h-9"
                    />
                  </div>
                  <div className="w-24">
                    <Label className="text-xs">{t('الساعات', 'Hours')}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={entry.hours || ''}
                      onChange={e => updateEntry(idx, 'hours', parseFloat(e.target.value) || 0)}
                      className="h-9"
                      dir="ltr"
                    />
                  </div>
                  <div className="w-32">
                    <Label className="text-xs">{t('سعر الساعة', 'Hourly Rate')}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={entry.rate || ''}
                      onChange={e => updateEntry(idx, 'rate', parseFloat(e.target.value) || 0)}
                      className="h-9"
                      dir="ltr"
                    />
                  </div>
                  <div className="w-28 text-left">
                    <Label className="text-xs">{t('الإجمالي', 'Total')}</Label>
                    <p className="text-sm font-medium mt-1.5">
                      {formatSAR((entry.hours || 0) * (entry.rate || 0), lang)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 text-rose-500"
                    onClick={() => removeEntry(idx)}
                    disabled={entries.length <= 1}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <Card className="bg-gray-50 border-dashed">
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('إجمالي الساعات', 'Total Hours')}</span>
                <span className="font-medium">{formatNumber(totalHours)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>{t('إجمالي المبلغ', 'Total Amount')}</span>
                <span className="text-emerald-700">{formatSAR(totalAmount, lang)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('ملاحظات', 'Notes')}</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('ملاحظات إضافية', 'Additional notes')}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {commonText.cancel[lang]}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !contractId || !month || !year}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {createMutation.isPending
                ? t('جاري الإنشاء...', 'Creating...')
                : t('إنشاء السجل', 'Create Timesheet')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Timesheet Detail View ============
function TimesheetDetailView({
  timesheet, onBack,
}: {
  timesheet: Timesheet; onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { lang, setActiveModule } = useAppStore()

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const totalHours = timesheet.entries.reduce((s, e) => s + e.hours, 0)
  const totalAmount = timesheet.entries.reduce((s, e) => s + e.totalAmount, 0)

  const clientName = timesheet.project?.client?.name ||
    (timesheet.contract?.project as { client?: { name: string } } | null)?.client?.name || '—'

  // Status workflow mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/timesheets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] })
      queryClient.invalidateQueries({ queryKey: ['timesheet', timesheet.id] })
    },
  })

  // Generate Invoice mutation
  const generateInvoiceMutation = useMutation({
    mutationFn: async () => {
      // Create a SalesInvoice from timesheet entries
      const now = new Date()
      const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      const deliveryMonth = formatMonthYear(timesheet.month, timesheet.year, 'ar')

      const vatRate = timesheet.contract?.vatRate ?? 0.15
      const vatAmount = totalAmount * vatRate
      const totalWithVat = totalAmount + vatAmount

      const clientId = timesheet.project?.client?.id ||
        (timesheet.contract?.project as { client?: { id: string } } | null)?.client?.id

      if (!clientId) throw new Error('No client found')

      const invoiceData = {
        clientId,
        projectId: timesheet.projectId,
        contractId: timesheet.contractId,
        date: now.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        invoiceType: 'TAX_INVOICE',
        contractNo: timesheet.contract?.contractNo || null,
        contractType: 'Time & Materials',
        contractPeriodStart: null,
        contractPeriodEnd: null,
        deliveryMonth,
        includeDelivery: false,
        deliveryAmount: 0,
        includeVat: true,
        paymentTerms: '30 days',
        notes: `${t('فاتورة عن ساعات عمل - ', 'Invoice for timesheet - ')}${deliveryMonth}`,
        items: timesheet.entries.map(e => ({
          description: e.description,
          quantity: e.hours,
          unit: lang === 'ar' ? 'ساعة' : 'hour',
          unitPrice: e.rate,
          itemType: 'SERVICE',
        })),
      }

      const res = await fetch('/api/sales-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData),
      })
      if (!res.ok) throw new Error('Failed to create invoice')
      const invoice = await res.json()

      // Mark timesheet as INVOICED
      await fetch(`/api/timesheets/${timesheet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INVOICED' }),
      })

      return invoice
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] })
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
      // Navigate to sales module
      setActiveModule('sales')
    },
  })

  const handleStatusChange = (newStatus: string) => {
    updateStatusMutation.mutate({ id: timesheet.id, status: newStatus })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">
              {t('سجل ساعات عمل', 'Timesheet')} - {formatMonthYear(timesheet.month, timesheet.year, lang)}
            </h2>
            <Badge variant="outline" className={statusColors[timesheet.status]}>
              {statusLabels[timesheet.status]?.[lang] || timesheet.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {timesheet.project?.name || '—'} - {timesheet.contract?.contractNo || '—'}
          </p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('المشروع', 'Project')}</p>
            <p className="text-sm font-medium truncate">{timesheet.project?.name || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('العقد', 'Contract')}</p>
            <p className="text-sm font-medium">{timesheet.contract?.contractNo || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('العميل', 'Client')}</p>
            <p className="text-sm font-medium truncate">{clientName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('شهر التسليم', 'Delivery Month')}</p>
            <p className="text-sm font-medium">{formatMonthYear(timesheet.month, timesheet.year, lang)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('بنود ساعات العمل', 'Timesheet Entries')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">#</TableHead>
                  <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                  <TableHead className="text-right">{t('الساعات', 'Hours')}</TableHead>
                  <TableHead className="text-right">{t('سعر الساعة', 'Hourly Rate')}</TableHead>
                  <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timesheet.entries.map((entry, idx) => (
                  <TableRow key={entry.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell>{formatNumber(entry.hours)}</TableCell>
                    <TableCell>{formatSAR(entry.rate, lang)}</TableCell>
                    <TableCell className="font-semibold">{formatSAR(entry.totalAmount, lang)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={2} className="text-left font-medium">{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell className="font-semibold">{formatNumber(totalHours)}</TableCell>
                  <TableCell />
                  <TableCell className="font-bold text-emerald-700">{formatSAR(totalAmount, lang)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {timesheet.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-1">{t('ملاحظات', 'Notes')}</p>
            <p className="text-sm">{timesheet.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Status Workflow Actions */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">{t('إجراءات سير العمل:', 'Workflow Actions:')}</span>
            {timesheet.status === 'DRAFT' && (
              <Button
                className="gap-2 bg-blue-600 hover:bg-blue-700"
                onClick={() => handleStatusChange('SUBMITTED')}
                disabled={updateStatusMutation.isPending}
              >
                <Send className="size-4" />
                {t('تقديم', 'Submit')}
              </Button>
            )}
            {timesheet.status === 'SUBMITTED' && (
              <Button
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => handleStatusChange('APPROVED')}
                disabled={updateStatusMutation.isPending}
              >
                <CheckCircle className="size-4" />
                {t('اعتماد', 'Approve')}
              </Button>
            )}
            {timesheet.status === 'APPROVED' && (
              <Button
                className="gap-2 bg-purple-600 hover:bg-purple-700"
                onClick={() => generateInvoiceMutation.mutate()}
                disabled={generateInvoiceMutation.isPending}
              >
                <FileText className="size-4" />
                {generateInvoiceMutation.isPending
                  ? t('جاري إنشاء الفاتورة...', 'Creating invoice...')
                  : t('إنشاء فاتورة', 'Generate Invoice')}
              </Button>
            )}
            {timesheet.status === 'INVOICED' && (
              <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-sm px-3 py-1">
                <FileText className="size-4 ml-1" />
                {t('تم إنشاء الفاتورة', 'Invoice Generated')}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Main Timesheets Module ============
export function TimesheetsModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  // Fetch timesheets
  const { data: timesheets = [], isLoading, isError, refetch } = useQuery<Timesheet[]>({
    queryKey: ['timesheets'],
    queryFn: async () => {
      const res = await fetch('/api/timesheets')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch timesheet detail
  const { data: timesheetDetail, isLoading: isLoadingDetail } = useQuery<Timesheet>({
    queryKey: ['timesheet', selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets/${selectedId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!selectedId,
  })

  // Fetch contracts for dropdown
  const { data: contracts = [] } = useQuery<ContractOption[]>({
    queryKey: ['contracts-for-timesheets'],
    queryFn: async () => {
      const res = await fetch('/api/contracts')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/timesheets/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] })
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
  const draftCount = timesheets.filter(t => t.status === 'DRAFT').length
  const submittedCount = timesheets.filter(t => t.status === 'SUBMITTED').length
  const approvedCount = timesheets.filter(t => t.status === 'APPROVED').length
  const invoicedCount = timesheets.filter(t => t.status === 'INVOICED').length

  // Detail view
  if (selectedId && timesheetDetail) {
    return <TimesheetDetailView timesheet={timesheetDetail} onBack={() => setSelectedId(null)} />
  }

  if (selectedId && isLoadingDetail) {
    return <div className="p-6"><TableSkeleton /></div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('ساعات العمل', 'Timesheets')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('إدارة سجلات ساعات العمل والعقود', 'Manage timesheet records and contracts')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {t('سجل جديد', 'New Timesheet')}
          </Button>
        </div>
      </div>

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
              <Input
                placeholder={t('بحث بالشهر، المشروع، العقد...', 'Search by month, project, contract...')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={t('كل الحالات', 'All Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الحالات', 'All Status')}</SelectItem>
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
            <div className="p-6"><TableSkeleton /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
              <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Clock className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t('لا توجد سجلات ساعات عمل', 'No timesheets found')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> {t('إنشاء سجل', 'Create Timesheet')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('شهر التسليم', 'Delivery Month')}</TableHead>
                    <TableHead className="text-right">{t('المشروع', 'Project')}</TableHead>
                    <TableHead className="text-right">{t('العقد', 'Contract')}</TableHead>
                    <TableHead className="text-right">{t('الساعات', 'Hours')}</TableHead>
                    <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                    <TableHead className="text-right">{t('الإجراءات', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(ts => {
                    const tsTotalHours = ts.entries.reduce((s, e) => s + e.hours, 0)
                    const tsTotalAmount = ts.entries.reduce((s, e) => s + e.totalAmount, 0)
                    return (
                      <TableRow
                        key={ts.id}
                        className="cursor-pointer hover:bg-emerald-50/50"
                        onClick={() => setSelectedId(ts.id)}
                      >
                        <TableCell className="font-medium">
                          {formatMonthYear(ts.month, ts.year, lang)}
                        </TableCell>
                        <TableCell>{ts.project?.name || '—'}</TableCell>
                        <TableCell className="font-mono">{ts.contract?.contractNo || '—'}</TableCell>
                        <TableCell>{formatNumber(tsTotalHours)}</TableCell>
                        <TableCell className="font-semibold">{formatSAR(tsTotalAmount, lang)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColors[ts.status]}>
                            {statusLabels[ts.status]?.[lang] || ts.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={e => { e.stopPropagation(); setSelectedId(ts.id) }}
                              title={t('عرض التفاصيل', 'View Details')}
                            >
                              <Eye className="size-4" />
                            </Button>
                            {ts.status === 'DRAFT' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-rose-500 hover:text-rose-700"
                                onClick={e => {
                                  e.stopPropagation()
                                  if (confirm(t('هل أنت متأكد من حذف هذا السجل؟', 'Are you sure you want to delete this timesheet?'))) {
                                    deleteMutation.mutate(ts.id)
                                  }
                                }}
                                title={t('حذف', 'Delete')}
                              >
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

      {/* Create Dialog */}
      <CreateTimesheetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contracts={contracts}
      />
    </div>
  )
}

'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Plus, Search, RefreshCw, Eye, ArrowRight, X, Printer,
  Download, FileText,
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useAppStore, formatSAR as storeFormatSAR, formatDate as storeFormatDate, formatNumber } from '@/stores/app-store'
import { PrintButton } from '@/components/shared/print-button'
import { MoneyDisplay } from '@/components/ui/money-display'
import { InvoicePreview } from '@/components/invoice/invoice-preview'
import type { InvoiceData, CompanySettings } from '@/components/invoice/invoice-preview'

// ============ Types ============
interface ClientOption { id: string; code: string; name: string }
interface ProjectOption { id: string; code: string; name: string }

interface ServiceInvoiceItem {
  id: string; description: string; descriptionEn?: string | null; quantity: number; unit?: string | null; unitPrice: number; totalPrice: number; itemType?: string
}

interface ServiceInvoice {
  id: string; invoiceNo: string; projectId: string | null; contractId?: string | null; clientId: string
  date: string; dueDate: string; subtotal: number; discountRate: number; discountAmount: number; netAmount: number
  vatRate: number; vatAmount: number; totalAmount: number; paidAmount: number; status: string; invoiceType?: string
  notes: string | null; paymentTerms?: string | null
  amountInWordsAr?: string | null; amountInWordsEn?: string | null
  referenceNo?: string | null; contractNo?: string | null; contractType?: string | null
  contractPeriodStart?: string | null; contractPeriodEnd?: string | null
  deliveryMonth?: string | null; includeDelivery?: boolean; deliveryAmount?: number; includeVat?: boolean
  client: { id: string; name: string; nameAr?: string | null; code: string; taxNumber?: string | null; phone?: string | null; email?: string | null; address?: string | null }
  project: { id: string; name: string; nameAr?: string | null; code: string } | null
  contract?: { id: string; contractNo: string } | null
  items: ServiceInvoiceItem[]
}

interface LineItemForm {
  description: string; descriptionEn?: string; quantity: number; unitPrice: number; unit: string; itemType: string
}

// ============ View State ============
type ViewState =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'detail'; invoiceId: string }
  | { type: 'preview'; invoiceId: string }

function formatSAR(value: number, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatSAR(value, lang)
}

function formatDate(dateStr: string, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatDate(dateStr, lang)
}

const serviceStatusLabels: Record<string, string> = {
  DRAFT: 'مسودة', SENT: 'مرسلة', PARTIALLY_PAID: 'مدفوعة جزئياً',
  PAID: 'مدفوعة', OVERDUE: 'متأخرة', CANCELLED: 'ملغية',
}
const serviceStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SENT: 'bg-blue-100 text-blue-700 border-blue-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  OVERDUE: 'bg-rose-100 text-rose-700 border-rose-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
}

const serviceUnitOptions = [
  { value: 'ساعة', label: 'ساعة / Hour' },
  { value: 'يوم', label: 'يوم / Day' },
  { value: 'أسبوع', label: 'أسبوع / Week' },
  { value: 'شهر', label: 'شهر / Month' },
  { value: 'زيارة', label: 'زيارة / Visit' },
  { value: 'مشروع', label: 'مشروع / Project' },
]

const defaultLineItem: LineItemForm = { description: '', quantity: 1, unitPrice: 0, unit: 'ساعة', itemType: 'SERVICE' }

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

// ============ Service Invoice Creation Form ============
function ServiceInvoiceFormPage({
  clients, projects, onBack,
}: {
  clients: ClientOption[]; projects: ProjectOption[]; onBack: () => void
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('30 days')
  const [referenceNo, setReferenceNo] = useState('')
  const [contractNo, setContractNo] = useState('')
  const [contractType, setContractType] = useState('')
  const [contractPeriodStart, setContractPeriodStart] = useState('')
  const [contractPeriodEnd, setContractPeriodEnd] = useState('')
  const [includeVat, setIncludeVat] = useState(true)
  const [discountType, setDiscountType] = useState<'none' | 'rate' | 'amount'>('none')
  const [discountRate, setDiscountRate] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ ...defaultLineItem }])

  // Auto-suggest reference number
  React.useEffect(() => {
    const year = new Date().getFullYear()
    const rand = Math.floor(1000 + Math.random() * 9000)
    setReferenceNo(`SVC-REF-${year}-${rand}`)
  }, [])

  // Auto-calculate
  const subtotal = useMemo(() => lineItems.reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unitPrice || 0)), 0), [lineItems])
  const vatRate = 0.15
  const finalDiscountAmount = useMemo(() => {
    if (discountType === 'rate') return subtotal * (discountRate / 100)
    if (discountType === 'amount') return discountAmount
    return 0
  }, [subtotal, discountType, discountRate, discountAmount])
  const netAmount = subtotal - finalDiscountAmount
  const vatAmount = includeVat ? netAmount * vatRate : 0
  const totalAmount = netAmount + vatAmount

  const addLine = () => setLineItems([...lineItems, { ...defaultLineItem }])
  const removeLine = (idx: number) => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)) }
  const updateLine = (idx: number, field: keyof LineItemForm, value: string | number) => {
    setLineItems(lineItems.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/sales-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-invoices'] }); onBack() },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      clientId, projectId: projectId || null, date, dueDate, notes, paymentTerms,
      invoiceType: 'SERVICE',
      referenceNo: referenceNo || null,
      contractNo: contractNo || null,
      contractType: contractType || null,
      contractPeriodStart: contractPeriodStart || null,
      contractPeriodEnd: contractPeriodEnd || null,
      includeDelivery: false,
      deliveryAmount: 0,
      includeVat,
      discountRate: discountType === 'rate' ? discountRate / 100 : 0,
      discountAmount: finalDiscountAmount,
      items: lineItems.map(i => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unit: i.unit || undefined,
        itemType: 'SERVICE',
      })),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 no-print">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t('فاتورة خدمة جديدة', 'New Service Invoice')}</h1>
          <p className="text-sm text-muted-foreground">{t('إنشاء فاتورة خدمات استشارية أو فنية', 'Create consulting or technical service invoice')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Info */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('المعلومات الأساسية', 'Basic Information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('العميل *', 'Client *')}</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر العميل', 'Select client')} /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('المشروع', 'Project')}</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر المشروع', 'Select project')} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{t('تاريخ الفاتورة *', 'Invoice Date *')}</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t('تاريخ الاستحقاق *', 'Due Date *')}</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t('شروط السداد', 'Payment Terms')}</Label>
                <Input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('رقم المرجع', 'Reference No.')}</Label>
                <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} dir="ltr" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Contract Data */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('بيانات العقد', 'Contract Data')} ({t('اختياري', 'Optional')})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{t('رقم العقد', 'Contract No.')}</Label>
                <Input value={contractNo} onChange={e => setContractNo(e.target.value)} placeholder="CTR-001" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('نوع العقد', 'Contract Type')}</Label>
                <Select value={contractType} onValueChange={setContractType}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر النوع', 'Select type')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lump Sum">{t('مقطوعية / Lump Sum', 'Lump Sum')}</SelectItem>
                    <SelectItem value="Unit Rate">{t('أسعار وحدوية / Unit Rate', 'Unit Rate')}</SelectItem>
                    <SelectItem value="Time & Materials">{t('وقت ومواد / Time & Materials', 'Time & Materials')}</SelectItem>
                    <SelectItem value="Cost Plus">{t('تكلفة + هامش / Cost Plus', 'Cost Plus')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('بداية فترة العمل', 'Period Start')}</Label>
                <Input type="date" value={contractPeriodStart} onChange={e => setContractPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('نهاية فترة العمل', 'Period End')}</Label>
                <Input type="date" value={contractPeriodEnd} onChange={e => setContractPeriodEnd(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: VAT */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('الضريبة', 'Tax')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg border bg-gray-50">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{t('ضريبة القيمة المضافة (15%)', 'VAT (15%)')}</Label>
                <Switch checked={includeVat} onCheckedChange={setIncludeVat} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {includeVat ? t('سيتم احتساب ضريبة القيمة المضافة', 'VAT will be calculated') : t('لن يتم احتساب ضريبة القيمة المضافة', 'VAT will not be calculated')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Line Items */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t('بنود الخدمة', 'Service Items')}</CardTitle>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
                <Plus className="size-3" /> {t('إضافة بند', 'Add Item')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2 p-3 rounded-lg border bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">{t('وصف الخدمة', 'Service Description')}</Label>
                    <Input value={item.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder={t('وصف الخدمة المقدمة', 'Service description')} className="h-9" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t('الكمية', 'Qty')}</Label>
                    <Input type="number" min="0" step="0.01" value={item.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-24">
                    <Label className="text-xs">{t('الوحدة', 'Unit')}</Label>
                    <Select value={item.unit} onValueChange={v => updateLine(idx, 'unit', v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {serviceUnitOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">{t('سعر الوحدة', 'Unit Price')}</Label>
                    <Input type="number" min="0" step="0.01" value={item.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-28 text-left">
                    <Label className="text-xs">{t('الإجمالي', 'Total')}</Label>
                    <p className="text-sm font-medium mt-1.5">{formatSAR(item.quantity * item.unitPrice, lang)}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 text-rose-500" onClick={() => removeLine(idx)} disabled={lineItems.length <= 1}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Discount */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('الخصم', 'Discount')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'none' | 'rate' | 'amount')}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('بدون خصم', 'No Discount')}</SelectItem>
                  <SelectItem value="rate">{t('نسبة مئوية (%)', 'Percentage (%)')}</SelectItem>
                  <SelectItem value="amount">{t('مبلغ ثابت', 'Fixed Amount')}</SelectItem>
                </SelectContent>
              </Select>
              {discountType === 'rate' && (
                <Input type="number" min="0" max="100" step="0.1" value={discountRate || ''} onChange={e => setDiscountRate(parseFloat(e.target.value) || 0)} className="w-24" dir="ltr" placeholder="%" />
              )}
              {discountType === 'amount' && (
                <Input type="number" min="0" step="0.01" value={discountAmount || ''} onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)} className="w-32" dir="ltr" placeholder="0.00" />
              )}
              {finalDiscountAmount > 0 && (
                <span className="text-sm text-rose-600 font-medium">-{formatSAR(finalDiscountAmount, lang)}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 6: Summary */}
        <Card className="bg-gray-50 border-dashed">
          <CardContent className="p-6 space-y-3">
            <h3 className="text-lg font-semibold mb-2">{t('ملخص الفاتورة', 'Invoice Summary')}</h3>
            <div className="flex justify-between text-sm">
              <span>{t('المجموع قبل الضريبة', 'Subtotal')}</span>
              <span className="font-medium">{formatSAR(subtotal, lang)}</span>
            </div>
            {finalDiscountAmount > 0 && (
              <div className="flex justify-between text-sm text-rose-600">
                <span>{t('الخصم', 'Discount')}</span>
                <span className="font-medium">-{formatSAR(finalDiscountAmount, lang)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>{t('صافي المبلغ', 'Net Amount')}</span>
              <span className="font-medium">{formatSAR(netAmount, lang)}</span>
            </div>
            {includeVat && (
              <div className="flex justify-between text-sm">
                <span>{t('ضريبة القيمة المضافة (15%)', 'VAT (15%)')}</span>
                <span className="font-medium">{formatSAR(vatAmount, lang)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>{t('الإجمالي', 'Total')}</span>
              <span className="text-emerald-700">{formatSAR(totalAmount, lang)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Section 7: Notes */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('ملاحظات', 'Notes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ملاحظات إضافية', 'Additional notes')} rows={3} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 no-print">
          <Button type="button" variant="outline" onClick={onBack}>{t('إلغاء', 'Cancel')}</Button>
          <Button type="submit" disabled={createMutation.isPending || !clientId || !date || !dueDate} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء فاتورة الخدمة', 'Create Service Invoice')}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Main Service Invoices Module ============
export function ServiceInvoicesModule() {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: invoices = [], isLoading, isError, refetch } = useQuery<ServiceInvoice[]>({
    queryKey: ['service-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/sales-invoices?invoiceType=SERVICE')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const selectedInvoiceId = viewState.type === 'detail' || viewState.type === 'preview' ? viewState.invoiceId : null

  const { data: invoiceDetail, isLoading: isLoadingDetail } = useQuery<ServiceInvoice>({
    queryKey: ['service-invoice', selectedInvoiceId],
    queryFn: async () => {
      const res = await fetch('/api/sales-invoices?invoiceType=SERVICE')
      if (!res.ok) throw new Error('Failed to fetch')
      const all: ServiceInvoice[] = await res.json()
      return all.find(i => i.id === selectedInvoiceId)!
    },
    enabled: !!selectedInvoiceId,
  })

  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const res = await fetch('/api/company-settings')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['clients-simple'],
    queryFn: async () => {
      const res = await fetch('/api/clients?simple=true&active=true')
      if (!res.ok) return []
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

  const defaultCompany: CompanySettings = {
    nameAr: 'شركة البناء الحديثة للمقاولات',
    nameEn: 'Al Binaa Al Haditha Contracting Co.',
    taxNumber: '300123456700003',
    commercialReg: '1234567890',
    address: 'الدمام - المملكة العربية السعودية',
    phone: '0500000000',
    email: 'info@albinaa.com',
    bankName: 'الراجحي',
    bankIban: 'SA00 8000 0000 6080 1016 7519',
    bankAccountName: 'شركة البناء الحديثة للمقاولات',
    defaultVatRate: 0.15,
    currency: 'SAR',
    currencySymbol: '\uFDFC',
    currencySymbolEn: 'SAR',
    currencySymbolAr: '\uFDFC',
    invoiceTerms: 'مدة السداد 30 يوماً من تاريخ الفاتورة\nهذه الفاتورة صادرة إلكترونياً\nيرجى ذكر رقم الفاتورة عند التحويل',
  }

  const company = companySettings || defaultCompany

  // ============ CREATE VIEW ============
  if (viewState.type === 'create') {
    return (
      <ServiceInvoiceFormPage
        clients={clients}
        projects={projects}
        onBack={() => setViewState({ type: 'list' })}
      />
    )
  }

  // ============ PREVIEW VIEW ============
  if (viewState.type === 'preview') {
    if (isLoadingDetail) return <div className="p-6"><TableSkeleton /></div>
    if (!invoiceDetail) {
      return (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('لم يتم العثور على الفاتورة', 'Invoice not found')}</p>
          <Button variant="outline" onClick={() => setViewState({ type: 'list' })}>{t('العودة للقائمة', 'Back to list')}</Button>
        </div>
      )
    }
    return (
      <div className="invoice-print-root space-y-4">
        <div className="flex items-center gap-3 no-print">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setViewState({ type: 'list' })}>
            <ArrowRight className="size-4" />
            {t('العودة للقائمة', 'Back to list')}
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setViewState({ type: 'detail', invoiceId: viewState.invoiceId })}>
            <Eye className="size-4" />
            {t('عرض التفاصيل', 'View Details')}
          </Button>
        </div>
        <InvoicePreview
          invoice={invoiceDetail as unknown as InvoiceData}
          company={company}
          onClose={() => setViewState({ type: 'list' })}
        />
      </div>
    )
  }

  // ============ DETAIL VIEW ============
  if (viewState.type === 'detail') {
    if (isLoadingDetail) return <div className="p-6"><TableSkeleton /></div>
    if (!invoiceDetail) {
      return (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('لم يتم العثور على الفاتورة', 'Invoice not found')}</p>
          <Button variant="outline" onClick={() => setViewState({ type: 'list' })}>{t('العودة للقائمة', 'Back to list')}</Button>
        </div>
      )
    }

    const invoice = invoiceDetail

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 no-print">
          <Button variant="outline" size="icon" onClick={() => setViewState({ type: 'list' })}>
            <ArrowRight className="size-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">{t('فاتورة خدمة', 'Service Invoice')} {invoice.invoiceNo}</h2>
              <Badge variant="outline" className={serviceStatusColors[invoice.status]}>
                {serviceStatusLabels[invoice.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{invoice.client?.name || '—'}</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => setViewState({ type: 'preview', invoiceId: invoice.id })}>
            <Printer className="size-4" />
            {t('معاينة الفاتورة', 'Preview Invoice')}
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{t('العميل', 'Client')}</p>
              <p className="text-sm font-medium truncate">{invoice.client?.name || '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{t('المشروع', 'Project')}</p>
              <p className="text-sm font-medium truncate">{invoice.project?.name || '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{t('تاريخ الفاتورة', 'Invoice Date')}</p>
              <p className="text-sm font-medium">{formatDate(invoice.date, lang)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{t('تاريخ الاستحقاق', 'Due Date')}</p>
              <p className="text-sm font-medium">{formatDate(invoice.dueDate, lang)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('بنود الخدمة', 'Service Items')}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                    <TableHead className="text-right">{t('الكمية', 'Qty')}</TableHead>
                    <TableHead className="text-right">{t('الوحدة', 'Unit')}</TableHead>
                    <TableHead className="text-right">{t('سعر الوحدة', 'Unit Price')}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{formatNumber(item.quantity)}</TableCell>
                      <TableCell>{item.unit || '—'}</TableCell>
                      <TableCell>{formatSAR(item.unitPrice, lang)}</TableCell>
                      <TableCell className="font-semibold">{formatSAR(item.totalPrice, lang)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-50">
                    <TableCell colSpan={4} className="text-left font-medium">{t('المجموع قبل الضريبة', 'Subtotal')}</TableCell>
                    <TableCell className="font-semibold">{formatSAR(invoice.subtotal, lang)}</TableCell>
                  </TableRow>
                  {(invoice.discountAmount ?? 0) > 0 && (
                    <TableRow className="bg-rose-50">
                      <TableCell colSpan={4} className="text-left font-medium text-rose-700">{t('الخصم', 'Discount')}</TableCell>
                      <TableCell className="font-semibold text-rose-700">-{formatSAR(invoice.discountAmount, lang)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow className="bg-gray-50">
                    <TableCell colSpan={4} className="text-left font-medium">{t('ضريبة القيمة المضافة', 'VAT')} ({((invoice.vatRate ?? 0) * 100).toFixed(0)}%)</TableCell>
                    <TableCell className="font-semibold">{formatSAR(invoice.vatAmount, lang)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-emerald-50">
                    <TableCell colSpan={4} className="text-left font-bold text-emerald-700">{t('الإجمالي', 'Total')}</TableCell>
                    <TableCell className="font-bold text-emerald-700">{formatSAR(invoice.totalAmount, lang)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-amber-50">
                    <TableCell colSpan={4} className="text-left font-medium text-amber-700">{t('المدفوع', 'Paid')}</TableCell>
                    <TableCell className="font-medium text-amber-700">{formatSAR(invoice.paidAmount, lang)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-rose-50">
                    <TableCell colSpan={4} className="text-left font-bold text-rose-700">{t('المتبقي', 'Outstanding')}</TableCell>
                    <TableCell className="font-bold text-rose-700">{formatSAR((Number(invoice.totalAmount || 0)) - (Number(invoice.paidAmount || 0)), lang)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {invoice.notes && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">{t('ملاحظات', 'Notes')}</p>
              <p className="text-sm">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // ============ LIST VIEW ============
  const filtered = invoices.filter(inv => {
    const matchSearch = !search || inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      inv.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      (inv.project?.name?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalRevenue = invoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0)
  const totalPaid = invoices.reduce((s, i) => s + Number(i.paidAmount || 0), 0)
  const totalOutstanding = totalRevenue - totalPaid

  const handleExport = () => {
    const csv = [
      [t('رقم الفاتورة', 'Invoice No'), t('العميل', 'Client'), t('المشروع', 'Project'), t('التاريخ', 'Date'), t('الإجمالي', 'Total'), t('المدفوع', 'Paid'), t('المتبقي', 'Outstanding'), t('الحالة', 'Status')].join(','),
      ...filtered.map(inv => [inv.invoiceNo, `"${inv.client?.name || ''}"`, `"${inv.project?.name || ''}"`, formatDate(inv.date, lang), (Number(inv.totalAmount || 0)).toFixed(2), (Number(inv.paidAmount || 0)).toFixed(2), ((Number(inv.totalAmount || 0)) - (Number(inv.paidAmount || 0))).toFixed(2), inv.status].join(','))
    ].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `service-invoices-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('فواتير الخدمات', 'Service Invoices')}</h1>
          <p className="text-sm text-muted-foreground">{t('إدارة فواتير الخدمات الاستشارية والفنية', 'Manage consulting and technical service invoices')}</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport} title={t('تصدير', 'Export')}>
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
            <Plus className="size-4" /> {t('فاتورة خدمة جديدة', 'New Service Invoice')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4">
            <p className="text-sm text-emerald-600">{t('إجمالي إيرادات الخدمات', 'Total Service Revenue')}</p>
            <MoneyDisplay value={totalRevenue} lang={lang} size="xl" bold className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm text-amber-600">{t('المدفوع', 'Paid')}</p>
            <MoneyDisplay value={totalPaid} lang={lang} size="xl" bold className="text-amber-700" />
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4">
            <p className="text-sm text-rose-600">{t('المستحق', 'Outstanding')}</p>
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
              <Input placeholder={t('بحث برقم الفاتورة أو العميل...', 'Search by invoice no. or client...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('كل الحالات', 'All Status')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الحالات', 'All Status')}</SelectItem>
                <SelectItem value="DRAFT">{t('مسودة', 'Draft')}</SelectItem>
                <SelectItem value="SENT">{t('مرسلة', 'Sent')}</SelectItem>
                <SelectItem value="PARTIALLY_PAID">{t('مدفوعة جزئياً', 'Partially Paid')}</SelectItem>
                <SelectItem value="PAID">{t('مدفوعة', 'Paid')}</SelectItem>
                <SelectItem value="OVERDUE">{t('متأخرة', 'Overdue')}</SelectItem>
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
              <CreditCard className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t('لا توجد فواتير خدمات', 'No service invoices')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}>
                <Plus className="size-4 mr-1" /> {t('إنشاء فاتورة خدمة', 'Create Service Invoice')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No')}</TableHead>
                    <TableHead className="text-right">{t('العميل', 'Client')}</TableHead>
                    <TableHead className="text-right">{t('المشروع', 'Project')}</TableHead>
                    <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                    <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                    <TableHead className="text-right">{t('المدفوع', 'Paid')}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                    <TableHead className="text-right">{t('الإجراءات', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(inv => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', invoiceId: inv.id })}>
                      <TableCell className="font-medium font-mono">{inv.invoiceNo}</TableCell>
                      <TableCell>{inv.client?.name || '—'}</TableCell>
                      <TableCell>{inv.project?.name || '—'}</TableCell>
                      <TableCell>{formatDate(inv.date, lang)}</TableCell>
                      <TableCell className="font-semibold">
                        <MoneyDisplay value={inv.totalAmount} lang={lang} size="sm" bold inline />
                      </TableCell>
                      <TableCell className="text-amber-700">
                        <MoneyDisplay value={inv.paidAmount} lang={lang} size="sm" inline />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={serviceStatusColors[inv.status]}>
                          {serviceStatusLabels[inv.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewState({ type: 'detail', invoiceId: inv.id })} title={t('تفاصيل', 'Details')}>
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewState({ type: 'preview', invoiceId: inv.id })} title={t('معاينة', 'Preview')}>
                            <Printer className="size-4" />
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
    </div>
  )
}

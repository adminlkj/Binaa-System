'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck, Plus, Search, RefreshCw, Wrench, Fuel, Clock,
  ArrowRight, DollarSign, Calendar, Shield, FileText, Receipt,
  Download, ChevronLeft, ChevronRight, Eye,
  TrendingUp, TrendingDown, BarChart3, Link2, Users,
  ArrowLeftRight, CheckCircle2, Circle, AlertCircle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { JePreview, JePreviewLine } from '@/components/shared/je-preview'
import { AccountSelector } from '@/components/shared/account-selector'
import { useAppStore, formatSAR, formatNumber, formatDate, RENTAL_WORKFLOW } from '@/stores/app-store'
import type { NavItem } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
interface Supplier {
  id: string; code: string; name: string; nameAr: string | null
}

interface Equipment {
  id: string; code: string; name: string; nameAr: string | null
  type: string | null; model: string | null; serialNumber: string | null
  status: string; ownershipType: string; supplierId: string | null; ownerId: string | null; clientId: string | null
  purchasePrice: number; sellingPrice: number
  hourlyRate: number; dailyRate: number; monthlyRate: number
  purchaseDate: string | null; warrantyExpiry: string | null
  isActive: boolean
  supplier: Supplier | null
  usages?: EquipmentUsage[]
  maintenance?: EquipmentMaintenance[]
  fuelLogs?: EquipmentFuelLog[]
  rentals?: EquipmentRental[]
  expenses?: EquipmentExpense[]
  deliveryOrders?: EquipmentDeliveryOrder[]
  timesheets?: EquipmentTimesheet[]
  operatorLogs?: EquipmentOperation[]
}

interface EquipmentUsage {
  id: string; equipmentId: string; projectId: string
  date: string; hours: number; description: string | null; cost: number
  project: { id: string; code: string; name: string }
}

interface EquipmentMaintenance {
  id: string; equipmentId: string; date: string; description: string
  cost: number; nextDate: string | null
}

interface EquipmentFuelLog {
  id: string; equipmentId: string; date: string; liters: number
  costPerLiter: number; totalCost: number; projectId: string | null
  project?: { id: string; code: string; name: string } | null
}

interface EquipmentRental {
  id: string; equipmentId: string; clientId: string; projectId: string | null
  startDate: string; endDate: string | null; rateType: string
  rate: number; totalAmount: number; status: string; notes: string | null
  deliveryFees: number; salesOrderNo: string | null; paymentTerms: string | null
  createdAt: string
  client: { id: string; code: string; name: string; nameAr: string | null }
  contract: { id: string; contractNo: string; hourlyRate: number; deliveryFees: number; salesOrderNo: string | null; paymentTerms: string | null }
  deliveryOrders: EquipmentDeliveryOrder[]
  timesheets: EquipmentTimesheet[]
}

interface EquipmentExpense {
  id: string; equipmentId: string; category: string; description: string
  amount: number; date: string; reference: string | null
}

interface EquipmentDeliveryOrder {
  id: string; orderNo: string; rentalId: string | null; equipmentId: string
  clientId: string | null; deliveryDate: string; returnDate: string | null
  status: string; site: string | null
  client?: { id: string; name: string } | null
  rental?: { id: string; contract: { contractNo: string } } | null
}

interface EquipmentTimesheet {
  id: string; rentalId: string; contractId: string; projectId: string
  equipmentId: string; month: number; year: number; operatingHours: number
  status: string; notes: string | null
  project: { id: string; code: string; name: string }
  contract: { id: string; contractNo: string; hourlyRate: number }
  rental: { id: string; hourlyRate: number; client: { id: string; name: string } }
  invoice: { id: string; invoiceNo: string; totalAmount: number; status: string } | null
}

interface EquipmentOperation {
  id: string; equipmentId: string; operatorId: string | null; projectId: string | null
  date: string; hours: number; notes: string | null
  operator: { id: string; name: string; nameAr: string | null } | null
  project: { id: string; code: string; name: string } | null
}

interface ClientOption { id: string; code: string; name: string; nameAr: string | null }
interface ProjectOption { id: string; code: string; name: string }

// ============ Constants ============
const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  AVAILABLE: { label: { ar: 'متاحة', en: 'Available' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  IN_USE: { label: { ar: 'قيد الاستخدام', en: 'In Use' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  MAINTENANCE: { label: { ar: 'صيانة', en: 'Maintenance' }, color: 'text-orange-700', bg: 'bg-orange-100' },
  OUT_OF_SERVICE: { label: { ar: 'خارج الخدمة', en: 'Out of Service' }, color: 'text-red-700', bg: 'bg-red-100' },
  RENTED: { label: { ar: 'مؤجرة', en: 'Rented' }, color: 'text-purple-700', bg: 'bg-purple-100' },
}

const ownershipTypeConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  COMPANY_OWNED: { label: { ar: 'مملوكة للشركة', en: 'Company Owned' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  LEASED_ASSET: { label: { ar: 'مستأجرة', en: 'Leased Asset' }, color: 'text-amber-700', bg: 'bg-amber-100' },
  CUSTOMER_OWNED: { label: { ar: 'مملوكة للعميل', en: 'Customer Owned' }, color: 'text-purple-700', bg: 'bg-purple-100' },
}

const rentalStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  ACTIVE: { label: { ar: 'نشط', en: 'Active' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  RETURNED: { label: { ar: 'مرتجع', en: 'Returned' }, color: 'text-gray-700', bg: 'bg-gray-100' },
  OVERDUE: { label: { ar: 'متأخر', en: 'Overdue' }, color: 'text-red-700', bg: 'bg-red-100' },
}

const expenseCategoryLabels: Record<string, { ar: string; en: string }> = {
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
}

const expenseCategoryOptions = Object.entries(expenseCategoryLabels).map(([key, val]) => ({
  value: key, ...val,
}))

const rateTypeLabels: Record<string, { ar: string; en: string }> = {
  HOURLY: { ar: 'بالساعة', en: 'Hourly' },
  DAILY: { ar: 'يومي', en: 'Daily' },
  MONTHLY: { ar: 'شهري', en: 'Monthly' },
}

const doStatusLabels: Record<string, { ar: string; en: string }> = {
  PENDING: { ar: 'معلق', en: 'Pending' },
  DELIVERED: { ar: 'تم التوصيل', en: 'Delivered' },
  RETURNED: { ar: 'مرتجع', en: 'Returned' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled' },
}

const timesheetStatusLabels: Record<string, { ar: string; en: string }> = {
  DRAFT: { ar: 'مسودة', en: 'Draft' },
  SUBMITTED: { ar: 'مقدم', en: 'Submitted' },
  APPROVED: { ar: 'معتمد', en: 'Approved' },
  INVOICED: { ar: 'مفوتر', en: 'Invoiced' },
}

// ============ Helper Components ============
function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.AVAILABLE
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

function OwnershipBadge({ ownershipType, lang }: { ownershipType: string; lang: 'ar' | 'en' }) {
  const cfg = ownershipTypeConfig[ownershipType] || ownershipTypeConfig.COMPANY_OWNED
  return <Badge className={`${cfg.bg} ${cfg.color} border-0 text-[10px]`}>{cfg.label[lang]}</Badge>
}

function ActivityBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  if (status === 'RENTED') {
    return <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 text-[10px] px-1.5 py-0 border">{lang === 'ar' ? 'تأجير' : 'Rental'}</Badge>
  }
  if (status === 'IN_USE') {
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0 border">{lang === 'ar' ? 'تنفيذي' : 'Const.'}</Badge>
  }
  return null
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  )
}

const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const englishMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function formatMonthYear(month: number, year: number, lang: 'ar' | 'en'): string {
  if (lang === 'ar') return `${arabicMonths[month - 1]} ${year}`
  return `${englishMonths[month - 1]} ${year}`
}

// ============ New Equipment Dialog ============
function NewEquipmentDialog({ open, onOpenChange, suppliers, clients }: {
  open: boolean; onOpenChange: (v: boolean) => void; suppliers: Supplier[]; clients: ClientOption[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [type, setType] = useState('')
  const [model, setModel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [status, setStatus] = useState('AVAILABLE')
  const [ownershipType, setOwnershipType] = useState('COMPANY_OWNED')
  const [supplierId, setSupplierId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [dailyRate, setDailyRate] = useState('')
  const [monthlyRate, setMonthlyRate] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [warrantyExpiry, setWarrantyExpiry] = useState('')
  const [assetAccountId, setAssetAccountId] = useState<string | null>(null)
  const [assetAccountCode, setAssetAccountCode] = useState('2110')
  const [assetAccountNameAr, setAssetAccountNameAr] = useState('معدات وآليات')

  React.useEffect(() => {
    if (open) {
      setName(''); setNameAr(''); setType(''); setModel('')
      setSerialNumber(''); setStatus('AVAILABLE'); setOwnershipType('COMPANY_OWNED'); setSupplierId(''); setOwnerId('')
      setPurchasePrice(''); setSellingPrice(''); setHourlyRate('')
      setDailyRate(''); setMonthlyRate(''); setPurchaseDate(''); setWarrantyExpiry('')
      setAssetAccountId(null); setAssetAccountCode('2110'); setAssetAccountNameAr('معدات وآليات')
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      name, nameAr, type, model, serialNumber, status,
      ownershipType,
      supplierId: supplierId || null,
      ownerId: ownershipType === 'CUSTOMER_OWNED' ? (ownerId || null) : null,
      purchasePrice, sellingPrice, hourlyRate, dailyRate, monthlyRate,
      purchaseDate: purchaseDate || null,
      warrantyExpiry: warrantyExpiry || null,
      assetAccountId: assetAccountId || undefined,
      assetAccountCode: assetAccountCode || undefined,
    })
  }

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('معدة جديدة', 'New Equipment')}</DialogTitle>
          <DialogDescription>{t('إضافة معدة جديدة مع بيانات الشراء والتأجير', 'Add new equipment with purchase and rental details')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-emerald-700 border-b border-emerald-200 pb-1">{t('المعلومات الأساسية', 'Basic Information')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t('الاسم *', 'Name *')}</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder={t('اسم المعدة', 'Equipment name')} required /></div>
              <div className="space-y-2"><Label>{t('الاسم بالعربي', 'Arabic Name')}</Label><Input value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder={t('الاسم بالعربية', 'Arabic name')} /></div>
              <div className="space-y-2">
                <Label>{t('النوع', 'Type')}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue placeholder={t('اختر النوع', 'Select type')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="حفارة">{t('حفارة', 'Excavator')}</SelectItem>
                    <SelectItem value="شيول">{t('شيول', 'Shovel')}</SelectItem>
                    <SelectItem value="كرين">{t('كرين', 'Crane')}</SelectItem>
                    <SelectItem value="قلاب">{t('قلاب', 'Dump Truck')}</SelectItem>
                    <SelectItem value="بولدوزر">{t('بولدوزر', 'Bulldozer')}</SelectItem>
                    <SelectItem value="رافعة">{t('رافعة', 'Lift')}</SelectItem>
                    <SelectItem value="ضاغط">{t('ضاغط', 'Compressor')}</SelectItem>
                    <SelectItem value="أخرى">{t('أخرى', 'Other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{t('الموديل', 'Model')}</Label><Input value={model} onChange={e => setModel(e.target.value)} placeholder={t('الموديل', 'Model')} /></div>
              <div className="space-y-2"><Label>{t('الرقم التسلسلي', 'Serial No.')}</Label><Input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder={t('الرقم التسلسلي', 'Serial number')} /></div>
              <div className="space-y-2">
                <Label>{t('الحالة', 'Status')}</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('نوع الملكية', 'Ownership Type')}</Label>
                <Select value={ownershipType} onValueChange={v => { setOwnershipType(v); if (v !== 'LEASED_ASSET') setSupplierId(''); if (v !== 'CUSTOMER_OWNED') setOwnerId('') }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ownershipTypeConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {/* Ownership Info */}
          {ownershipType === 'LEASED_ASSET' && (
            <div className="p-3 rounded-lg border bg-amber-50 border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="size-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">{t('معلومات التأجير - المورد إلزامي', 'Lease Info - Supplier is required')}</span>
              </div>
            </div>
          )}
          {ownershipType === 'CUSTOMER_OWNED' && (
            <div className="p-3 rounded-lg border bg-purple-50 border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Users className="size-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-700">{t('معدات مملوكة للعميل - حدد المالك', 'Customer-owned equipment - select owner')}</span>
              </div>
            </div>
          )}
          {/* Asset Account Selection */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-emerald-700 border-b border-emerald-200 pb-1">{t('حساب الأصل الثابت', 'Fixed Asset Account')}</h4>
            <AccountSelector
              roles={['FIXED_ASSET']}
              value={assetAccountId}
              onValueChange={(id, account) => {
                setAssetAccountId(id)
                setAssetAccountCode(account.code)
                setAssetAccountNameAr(account.nameAr || account.name)
              }}
              label={t('حساب الأصل الثابت', 'Fixed Asset Account')}
              placeholder={t('اختر حساب الأصل...', 'Select asset account...')}
            />
            <p className="text-xs text-muted-foreground">{t('اختر حساب الأصل الثابت الذي سيُقيد في الجانب المدين عند شراء المعدة', 'Select the fixed asset account to be debited when purchasing equipment')}</p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-teal-700 border-b border-teal-200 pb-1">{t('معلومات الشراء', 'Purchase Information')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('المورد', 'Supplier')} {ownershipType === 'LEASED_ASSET' ? '*' : ''}</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder={t('اختر المورد', 'Select supplier')} /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                {ownershipType === 'LEASED_ASSET' && !supplierId && <p className="text-xs text-amber-600">{t('المورد إلزامي للمعدات المستأجرة', 'Supplier is required for leased equipment')}</p>}
              </div>
              {ownershipType === 'CUSTOMER_OWNED' && (
                <div className="space-y-2">
                  <Label>{t('مالك المعدة *', 'Equipment Owner *')}</Label>
                  <Select value={ownerId} onValueChange={setOwnerId}>
                    <SelectTrigger><SelectValue placeholder={t('اختر العميل المالك', 'Select owner client')} /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2"><Label>{t('سعر الشراء', 'Purchase Price')}</Label><Input type="number" min="0" step="0.01" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} dir="ltr" placeholder="0.00" /></div>
              <div className="space-y-2"><Label>{t('سعر البيع/التأجير', 'Selling/Rental Price')}</Label><Input type="number" min="0" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} dir="ltr" placeholder="0.00" /></div>
              <div className="space-y-2"><Label>{t('تاريخ الشراء', 'Purchase Date')}</Label><Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
              <div className="space-y-2"><Label>{t('انتهاء الضمان', 'Warranty Expiry')}</Label><Input type="date" value={warrantyExpiry} onChange={e => setWarrantyExpiry(e.target.value)} /></div>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-purple-700 border-b border-purple-200 pb-1">{t('أسعار التأجير', 'Rental Rates')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2"><Label>{t('الأجر بالساعة', 'Hourly Rate')}</Label><Input type="number" min="0" step="0.01" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} dir="ltr" placeholder="0.00" /></div>
              <div className="space-y-2"><Label>{t('الأجر اليومي', 'Daily Rate')}</Label><Input type="number" min="0" step="0.01" value={dailyRate} onChange={e => setDailyRate(e.target.value)} dir="ltr" placeholder="0.00" /></div>
              <div className="space-y-2"><Label>{t('الأجر الشهري', 'Monthly Rate')}</Label><Input type="number" min="0" step="0.01" value={monthlyRate} onChange={e => setMonthlyRate(e.target.value)} dir="ltr" placeholder="0.00" /></div>
            </div>
          </div>
          {/* JE Preview for equipment purchase */}
          {purchasePrice && parseFloat(purchasePrice) > 0 && (
            <JePreview
              lines={[
                { accountCode: assetAccountCode, accountNameAr: assetAccountNameAr, debit: parseFloat(purchasePrice) || 0, credit: 0 },
                ...(ownershipType === 'LEASED_ASSET' && supplierId
                  ? [{ accountCode: '3210', accountNameAr: 'الموردون', debit: 0, credit: parseFloat(purchasePrice) || 0 }]
                  : [{ accountCode: '1110', accountNameAr: 'الصندوق', debit: 0, credit: parseFloat(purchasePrice) || 0 }]),
              ]}
              title={t('القيد المحاسبي المتوقع لشراء المعدة', 'Expected Journal Entry for Equipment Purchase')}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || !name || (ownershipType === 'LEASED_ASSET' && !supplierId) || (ownershipType === 'CUSTOMER_OWNED' && !ownerId)} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إضافة', 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Add Rental Dialog ============
function AddRentalDialog({ open, onOpenChange, equipmentId, clients, projects }: {
  open: boolean; onOpenChange: (v: boolean) => void; equipmentId: string
  clients: ClientOption[]; projects: ProjectOption[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [rateType, setRateType] = useState('DAILY')
  const [rate, setRate] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [notes, setNotes] = useState('')

  React.useEffect(() => {
    if (open) { setClientId(''); setProjectId(''); setStartDate(''); setEndDate(''); setRateType('DAILY'); setRate(''); setTotalAmount(''); setNotes('') }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/rentals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-rentals'] })
      queryClient.invalidateQueries({ queryKey: ['equipment-detail'] })
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      onOpenChange(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ equipmentId, clientId, projectId: projectId || null, startDate, endDate: endDate || null, rateType, rate, totalAmount, notes: notes || null })
  }

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('عقد تأجير جديد', 'New Rental Contract')}</DialogTitle>
          <DialogDescription>{t('إنشاء عقد تأجير جديد للمعدة', 'Create a new rental contract for equipment')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('العميل *', 'Client *')}</Label><Select value={clientId} onValueChange={setClientId}><SelectTrigger><SelectValue placeholder={t('اختر العميل', 'Select client')} /></SelectTrigger><SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>{t('المشروع', 'Project')}</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder={t('اختر المشروع', 'Select project')} /></SelectTrigger><SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>{t('تاريخ البداية *', 'Start Date *')}</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required /></div>
            <div className="space-y-2"><Label>{t('تاريخ النهاية', 'End Date')}</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('نوع الأجر *', 'Rate Type *')}</Label><Select value={rateType} onValueChange={setRateType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(rateTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v[lang]}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>{t('الأجر *', 'Rate *')}</Label><Input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} dir="ltr" required /></div>
            <div className="space-y-2"><Label>{t('الإجمالي *', 'Total Amount *')}</Label><Input type="number" min="0" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} dir="ltr" required /></div>
            <div className="space-y-2"><Label>{t('ملاحظات', 'Notes')}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ملاحظات', 'Notes')} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || !clientId || !startDate || !rate || !totalAmount} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('إنشاء العقد', 'Create Contract')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Add Equipment Expense Dialog ============
function AddEquipmentExpenseDialog({ open, onOpenChange, equipmentId }: { open: boolean; onOpenChange: (v: boolean) => void; equipmentId: string }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [reference, setReference] = useState('')

  React.useEffect(() => { if (open) { setCategory(''); setDescription(''); setAmount(''); setDate(''); setReference('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-expenses'] }); queryClient.invalidateQueries({ queryKey: ['equipment-detail'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); createMutation.mutate({ equipmentId, category, description, amount, date, reference: reference || null }) }

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('مصروف معدة', 'Equipment Expense')}</DialogTitle><DialogDescription>{t('إضافة مصروف جديد للمعدة', 'Add new expense for equipment')}</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2"><Label>{t('الفئة *', 'Category *')}</Label><Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue placeholder={t('اختر الفئة', 'Select category')} /></SelectTrigger><SelectContent>{expenseCategoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c[lang]}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>{t('الوصف *', 'Description *')}</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('وصف المصروف', 'Expense description')} required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('المبلغ *', 'Amount *')}</Label><Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" required /></div>
            <div className="space-y-2"><Label>{t('التاريخ *', 'Date *')}</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
          </div>
          <div className="space-y-2"><Label>{t('المرجع', 'Reference')}</Label><Input value={reference} onChange={e => setReference(e.target.value)} placeholder={t('رقم المرجع', 'Reference number')} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || !category || !description || !amount || !date} className="bg-emerald-600 hover:bg-emerald-700">{createMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('إضافة', 'Add')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Add Usage Dialog ============
function AddUsageDialog({ open, onOpenChange, equipmentId, projects }: { open: boolean; onOpenChange: (v: boolean) => void; equipmentId: string; projects: ProjectOption[] }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState('')
  const [hours, setHours] = useState('')
  const [cost, setCost] = useState('')
  const [description, setDescription] = useState('')

  React.useEffect(() => { if (open) { setProjectId(''); setDate(''); setHours(''); setCost(''); setDescription('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/usages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-usages'] }); queryClient.invalidateQueries({ queryKey: ['equipment-detail'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); createMutation.mutate({ equipmentId, projectId, date, hours, cost, description }) }
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('سجل استخدام', 'Add Usage')}</DialogTitle><DialogDescription>{t('إضافة سجل استخدام جديد', 'Add new usage record')}</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2"><Label>{t('المشروع *', 'Project *')}</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder={t('اختر المشروع', 'Select project')} /></SelectTrigger><SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('التاريخ *', 'Date *')}</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="space-y-2"><Label>{t('الساعات *', 'Hours *')}</Label><Input type="number" min="0" step="0.5" value={hours} onChange={e => setHours(e.target.value)} dir="ltr" required /></div>
          </div>
          <div className="space-y-2"><Label>{t('التكلفة *', 'Cost *')}</Label><Input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} dir="ltr" required /></div>
          <div className="space-y-2"><Label>{t('الوصف', 'Description')}</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('وصف العمل', 'Work description')} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">{createMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('إضافة', 'Add')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Add Maintenance Dialog ============
function AddMaintenanceDialog({ open, onOpenChange, equipmentId }: { open: boolean; onOpenChange: (v: boolean) => void; equipmentId: string }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [cost, setCost] = useState('')
  const [nextDate, setNextDate] = useState('')

  React.useEffect(() => { if (open) { setDate(''); setDescription(''); setCost(''); setNextDate('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-maintenance'] }); queryClient.invalidateQueries({ queryKey: ['equipment-detail'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); createMutation.mutate({ equipmentId, date, description, cost, nextDate: nextDate || null }) }
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('سجل صيانة', 'Add Maintenance')}</DialogTitle><DialogDescription>{t('إضافة سجل صيانة جديد', 'Add new maintenance record')}</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('التاريخ *', 'Date *')}</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="space-y-2"><Label>{t('التكلفة *', 'Cost *')}</Label><Input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} dir="ltr" required /></div>
          </div>
          <div className="space-y-2"><Label>{t('الوصف *', 'Description *')}</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('وصف الصيانة', 'Maintenance description')} required /></div>
          <div className="space-y-2"><Label>{t('تاريخ الصيانة القادمة', 'Next Maintenance Date')}</Label><Input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">{createMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('إضافة', 'Add')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Add Fuel Dialog ============
function AddFuelDialog({ open, onOpenChange, equipmentId, projects }: { open: boolean; onOpenChange: (v: boolean) => void; equipmentId: string; projects: ProjectOption[] }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [date, setDate] = useState('')
  const [liters, setLiters] = useState('')
  const [costPerLiter, setCostPerLiter] = useState('')
  const [projectId, setProjectId] = useState('')

  const totalCost = (parseFloat(liters) || 0) * (parseFloat(costPerLiter) || 0)

  React.useEffect(() => { if (open) { setDate(''); setLiters(''); setCostPerLiter(''); setProjectId('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/fuel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-fuel'] }); queryClient.invalidateQueries({ queryKey: ['equipment-detail'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); createMutation.mutate({ equipmentId, date, liters, costPerLiter, projectId: projectId || null }) }
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('سجل وقود', 'Add Fuel Log')}</DialogTitle><DialogDescription>{t('إضافة سجل وقود جديد', 'Add new fuel log')}</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('التاريخ *', 'Date *')}</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="space-y-2"><Label>{t('اللترات *', 'Liters *')}</Label><Input type="number" min="0" step="0.1" value={liters} onChange={e => setLiters(e.target.value)} dir="ltr" required /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('سعر اللتر *', 'Cost/Liter *')}</Label><Input type="number" min="0" step="0.01" value={costPerLiter} onChange={e => setCostPerLiter(e.target.value)} dir="ltr" required /></div>
            <div className="space-y-2"><Label>{t('المشروع', 'Project')}</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder={t('اختر', 'Select')} /></SelectTrigger><SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {totalCost > 0 && (
            <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3"><p className="text-sm text-emerald-600">{t('الإجمالي', 'Total')}: <span className="font-bold text-emerald-700"><MoneyDisplay value={totalCost} lang={lang} size="sm" inline /></span></p></CardContent></Card>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">{createMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('إضافة', 'Add')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Rental Workflow Chain Component ============
function RentalWorkflowChain({ activeRentals, lang, onNavigate }: { activeRentals: EquipmentRental[]; lang: 'ar' | 'en'; onNavigate: (navItem: NavItem) => void }) {
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  const hasActive = activeRentals.length > 0

  const workflowSteps = RENTAL_WORKFLOW.map((step, idx) => {
    const isActive = hasActive
    const isLast = idx === RENTAL_WORKFLOW.length - 1
    let stepCount = 0

    if (step.step === 'rental-contract') stepCount = activeRentals.length
    if (step.step === 'delivery' && hasActive) stepCount = activeRentals.reduce((s, r) => s + (r.deliveryOrders?.length || 0), 0)
    if (step.step === 'timesheet' && hasActive) stepCount = activeRentals.reduce((s, r) => s + (r.timesheets?.length || 0), 0)
    if (step.step === 'invoice' && hasActive) stepCount = activeRentals.reduce((s, r) => s + (r.timesheets?.filter(ts => ts.invoice)?.length || 0), 0)

    return { ...step, isActive, stepCount, isLast }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Link2 className="size-5 text-cyan-600" />
        <h3 className="font-semibold text-cyan-700">{t('سلسلة التأجير', 'Rental Workflow Chain')}</h3>
        {hasActive && <Badge className="bg-emerald-100 text-emerald-700 border-0">{t('نشط', 'Active')} ({activeRentals.length})</Badge>}
      </div>

      {/* Visual Chain */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-center gap-1 min-w-max">
          {workflowSteps.map((step, idx) => (
            <React.Fragment key={step.step}>
              <button
                onClick={() => onNavigate(step.navItem)}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border-2 transition-all min-w-[80px] hover:shadow-md cursor-pointer ${
                  step.isActive
                    ? 'border-cyan-400 bg-cyan-50 shadow-sm'
                    : 'border-gray-200 bg-gray-50 opacity-60'
                }`}
              >
                {step.isActive ? (
                  <CheckCircle2 className="size-5 text-cyan-600" />
                ) : (
                  <Circle className="size-5 text-gray-400" />
                )}
                <span className={`text-xs font-medium text-center leading-tight ${step.isActive ? 'text-cyan-700' : 'text-gray-500'}`}>
                  {step.label[lang]}
                </span>
                {step.stepCount > 0 && (
                  <Badge className="bg-cyan-600 text-white text-[10px] px-1.5 py-0 border-0">{step.stepCount}</Badge>
                )}
              </button>
              {!step.isLast && (
                <ChevronLeft className="size-4 text-gray-400 shrink-0 rotate-180" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Active Rentals Detail */}
      {activeRentals.length > 0 && (
        <Card className="border-cyan-200 bg-cyan-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-cyan-700">{t('عقود التأجير النشطة', 'Active Rental Contracts')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeRentals.map(rental => (
                <div key={rental.id} className="p-3 rounded-lg bg-white border border-cyan-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-cyan-100 text-cyan-700 border-0">{rental.contract?.contractNo || '—'}</Badge>
                      <span className="text-sm font-medium">{rental.client?.name || '—'}</span>
                    </div>
                    <MoneyDisplay value={rental.totalAmount} lang={lang} size="sm" bold className="text-cyan-700" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                    <div>{t('البداية', 'Start')}: {formatDate(rental.startDate, lang)}</div>
                    <div>{t('النهاية', 'End')}: {rental.endDate ? formatDate(rental.endDate, lang) : '—'}</div>
                    <div>{t('أوامر التوصيل', 'Delivery Orders')}: {rental.deliveryOrders?.length || 0}</div>
                    <div>{t('سجلات الساعات', 'Timesheets')}: {rental.timesheets?.length || 0}</div>
                  </div>
                  {/* Mini workflow for this rental */}
                  <div className="flex items-center gap-1 pt-1 border-t border-cyan-100">
                    {[
                      { label: t('عقد', 'Contract'), done: true },
                      { label: t('توصيل', 'Delivery'), done: (rental.deliveryOrders?.length || 0) > 0 },
                      { label: t('ساعات', 'Hours'), done: (rental.timesheets?.length || 0) > 0 },
                      { label: t('فاتورة', 'Invoice'), done: (rental.timesheets?.filter(ts => ts.invoice)?.length || 0) > 0 },
                      { label: t('تحصيل', 'Collect'), done: false },
                    ].map((mini, mi, arr) => (
                      <React.Fragment key={mi}>
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${mini.done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {mini.done ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
                          {mini.label}
                        </div>
                        {mi < arr.length - 1 && <ArrowLeftRight className="size-3 text-gray-300" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeRentals.length === 0 && (
        <Card className="bg-gray-50 border-dashed">
          <CardContent className="p-6 text-center">
            <AlertCircle className="size-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">{t('لا توجد عقود تأجير نشطة', 'No active rental contracts')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('أضف عقد تأجير لتفعيل سلسلة العمل', 'Add a rental contract to activate the workflow')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Equipment Detail View (كرت المعدة) ============
function EquipmentDetailView({ equipmentId, onBack }: { equipmentId: string; onBack: () => void }) {
  const { lang, setActiveItem } = useAppStore()
  const [activeTab, setActiveTab] = useState('card')
  const [usageDialogOpen, setUsageDialogOpen] = useState(false)
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false)
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false)
  const [rentalDialogOpen, setRentalDialogOpen] = useState(false)
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const { data: equipment, isLoading, refetch } = useQuery<Equipment>({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: async () => {
      const r = await fetch(`/api/equipment/${equipmentId}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
  })

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['projects-list'],
    queryFn: async () => { const r = await fetch('/api/projects/list'); if (!r.ok) return []; return r.json() },
  })

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['clients-list'],
    queryFn: async () => { const r = await fetch('/api/clients'); if (!r.ok) return []; return r.json() },
  })

  const handleNavigate = (navItem: NavItem) => {
    setActiveItem(navItem)
  }

  // Computed values
  const computed = useMemo(() => {
    if (!equipment) return null

    const usages = equipment.usages || []
    const maintenance = equipment.maintenance || []
    const fuelLogs = equipment.fuelLogs || []
    const rentals = equipment.rentals || []
    const expenses = equipment.expenses || []
    const deliveryOrders = equipment.deliveryOrders || []
    const timesheets = equipment.timesheets || []
    const operatorLogs = equipment.operatorLogs || []

    // Revenue
    const totalRentalRevenue = rentals.reduce((s, r) => s + r.totalAmount, 0)
    const totalOperatingHours = timesheets.reduce((s, ts) => s + ts.operatingHours, 0)
    const totalUsageHours = usages.reduce((s, u) => s + u.hours, 0)
    const totalOperationHours = operatorLogs.reduce((s, o) => s + o.hours, 0)
    const allHours = totalOperatingHours + totalUsageHours + totalOperationHours

    // Costs
    const totalUsageCost = usages.reduce((s, u) => s + u.cost, 0)
    const totalMaintenanceCost = maintenance.reduce((s, m) => s + m.cost, 0)
    const totalFuelCost = fuelLogs.reduce((s, f) => s + f.totalCost, 0)
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
    const totalOperatingCost = operatorLogs.reduce((s, o) => s + (o.hours * (equipment.hourlyRate || 0)), 0)
    const totalTransportCost = expenses.filter(e => e.category === 'TRANSPORT' || e.category === 'DELIVERY').reduce((s, e) => s + e.amount, 0)
    const driverCosts = expenses.filter(e => e.category === 'DRIVERS').reduce((s, e) => s + e.amount, 0)

    // Depreciation (simplified: purchase price / 10 years, or monthly rate)
    const depreciationPerYear = equipment.purchasePrice / 10
    const depreciationPerMonth = depreciationPerYear / 12

    const totalCosts = totalUsageCost + totalMaintenanceCost + totalFuelCost + totalExpenses + totalOperatingCost + depreciationPerMonth
    const profit = totalRentalRevenue - totalCosts
    const profitMargin = totalRentalRevenue > 0 ? (profit / totalRentalRevenue) * 100 : 0

    // Cost breakdown by category
    const costByCategory: Record<string, number> = {}
    expenses.forEach(e => {
      costByCategory[e.category] = (costByCategory[e.category] || 0) + e.amount
    })

    const activeRentals = rentals.filter(r => r.status === 'ACTIVE')

    return {
      usages, maintenance, fuelLogs, rentals, expenses, deliveryOrders, timesheets, operatorLogs,
      totalRentalRevenue, totalOperatingHours, totalUsageHours, totalOperationHours, allHours,
      totalUsageCost, totalMaintenanceCost, totalFuelCost, totalExpenses, totalOperatingCost,
      totalTransportCost, driverCosts, depreciationPerMonth, depreciationPerYear,
      totalCosts, profit, profitMargin, costByCategory, activeRentals,
    }
  }, [equipment])

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <CardSkeleton />
        <TableSkeleton rows={3} />
        <TableSkeleton rows={5} />
      </div>
    )
  }

  if (!equipment || !computed) return null

  const isWarrantyExpired = equipment.warrantyExpiry ? new Date(equipment.warrantyExpiry) < new Date() : false

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{equipment.name}</h2>
            <StatusBadge status={equipment.status} lang={lang} />
            <ActivityBadge status={equipment.status} lang={lang} />
            <OwnershipBadge ownershipType={equipment.ownershipType || 'COMPANY_OWNED'} lang={lang} />
          </div>
          <p className="text-sm text-muted-foreground">{equipment.code} {equipment.model ? `| ${equipment.model}` : ''} {equipment.type ? `| ${equipment.type}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}><RefreshCw className="size-4" /></Button>
        </div>
      </div>

      {/* Rate Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-purple-600">{t('الأجر بالساعة', 'Hourly Rate')}</p>
            <MoneyDisplay value={equipment.hourlyRate} lang={lang} size="lg" bold className="text-purple-700" />
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-purple-600">{t('الأجر اليومي', 'Daily Rate')}</p>
            <MoneyDisplay value={equipment.dailyRate} lang={lang} size="lg" bold className="text-purple-700" />
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-purple-600">{t('الأجر الشهري', 'Monthly Rate')}</p>
            <MoneyDisplay value={equipment.monthlyRate} lang={lang} size="lg" bold className="text-purple-700" />
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-teal-600">{t('سعر الشراء', 'Purchase Price')}</p>
            <MoneyDisplay value={equipment.purchasePrice} lang={lang} size="lg" bold className="text-teal-700" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs - 5 tabs as specified */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="card" className="gap-1 text-xs"><FileText className="size-3" /> <span className="hidden sm:inline">{t('كرت المعدة', 'Card')}</span></TabsTrigger>
          <TabsTrigger value="workflow" className="gap-1 text-xs"><Link2 className="size-3" /> <span className="hidden sm:inline">{t('السلسلة', 'Workflow')}</span></TabsTrigger>
          <TabsTrigger value="costs" className="gap-1 text-xs"><TrendingDown className="size-3" /> <span className="hidden sm:inline">{t('التكاليف', 'Costs')}</span></TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1 text-xs"><TrendingUp className="size-3" /> <span className="hidden sm:inline">{t('الإيرادات', 'Revenue')}</span></TabsTrigger>
          <TabsTrigger value="operations" className="gap-1 text-xs"><Users className="size-3" /> <span className="hidden sm:inline">{t('التشغيل', 'Ops')}</span></TabsTrigger>
        </TabsList>

        {/* ====== TAB 1: كرت المعدة (Equipment Card) - Financial Overview ====== */}
        <TabsContent value="card" className="space-y-4">
          {/* Revenue Section */}
          <Card className="border-emerald-200">
            <CardHeader className="pb-2 bg-emerald-50 rounded-t-lg">
              <CardTitle className="text-sm text-emerald-700 flex items-center gap-2"><TrendingUp className="size-4" /> {t('الإيرادات', 'Revenue')}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg">
                  <span className="text-sm text-emerald-700">{t('إجمالي إيرادات التأجير', 'Total Rental Revenue')}</span>
                  <MoneyDisplay value={computed.totalRentalRevenue} lang={lang} size="lg" bold className="text-emerald-700" />
                </div>
                <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg">
                  <span className="text-sm text-emerald-700">{t('إجمالي ساعات التشغيل', 'Total Operating Hours')}</span>
                  <span className="text-lg font-bold text-emerald-700">{formatNumber(computed.allHours)} {t('ساعة', 'hrs')}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Costs Section */}
          <Card className="border-rose-200">
            <CardHeader className="pb-2 bg-rose-50 rounded-t-lg">
              <CardTitle className="text-sm text-rose-700 flex items-center gap-2"><TrendingDown className="size-4" /> {t('التكاليف', 'Costs')}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              <div className="space-y-2">
                {[
                  { label: t('تكلفة الوقود', 'Fuel Costs'), value: computed.totalFuelCost, icon: Fuel },
                  { label: t('تكلفة الصيانة', 'Maintenance Costs'), value: computed.totalMaintenanceCost, icon: Wrench },
                  { label: t('تكلفة السائق', 'Driver Costs'), value: computed.driverCosts, icon: Users },
                  { label: t('تكلفة النقل', 'Transport Costs'), value: computed.totalTransportCost, icon: Truck },
                  { label: t('الإهلاك الشهري', 'Monthly Depreciation'), value: computed.depreciationPerMonth, icon: BarChart3 },
                  { label: t('تكلفة التشغيل', 'Operating Costs'), value: computed.totalUsageCost, icon: Clock },
                  { label: t('مصروفات أخرى', 'Other Expenses'), value: computed.totalExpenses, icon: Receipt },
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2 hover:bg-rose-50 rounded">
                    <span className="text-sm text-rose-700 flex items-center gap-2"><item.icon className="size-3.5" /> {item.label}</span>
                    <MoneyDisplay value={item.value} lang={lang} size="sm" bold className="text-rose-700" />
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex justify-between items-center p-3 bg-rose-100 rounded-lg">
                <span className="font-semibold text-rose-800">{t('إجمالي التكاليف', 'Total Costs')}</span>
                <MoneyDisplay value={computed.totalCosts} lang={lang} size="lg" bold className="text-rose-800" />
              </div>
            </CardContent>
          </Card>

          {/* Profit Section */}
          <Card className={`border-2 ${computed.profit >= 0 ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{t('الإيرادات', 'Revenue')}</p>
                  <MoneyDisplay value={computed.totalRentalRevenue} lang={lang} size="xl" bold className="text-emerald-700" />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{t('التكاليف', 'Costs')}</p>
                  <MoneyDisplay value={computed.totalCosts} lang={lang} size="xl" bold className="text-rose-700" />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{t('الربح', 'Profit')}</p>
                  <MoneyDisplay value={computed.profit} lang={lang} size="xl" bold className={computed.profit >= 0 ? 'text-emerald-700' : 'text-red-700'} />
                  <p className={`text-sm font-semibold mt-1 ${computed.profitMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {(computed.profitMargin ?? 0).toFixed(1)}% {t('هامش الربح', 'margin')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Purchase & Warranty Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm text-teal-700 flex items-center gap-2"><DollarSign className="size-4" /> {t('معلومات الشراء', 'Purchase Info')}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('سعر الشراء', 'Purchase Price')}</span><MoneyDisplay value={equipment.purchasePrice} lang={lang} size="sm" bold inline /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('المورد', 'Supplier')}</span><span className="font-medium">{equipment.supplier?.name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('تاريخ الشراء', 'Purchase Date')}</span><span>{equipment.purchaseDate ? formatDate(equipment.purchaseDate, lang) : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('الرقم التسلسلي', 'Serial No.')}</span><span className="font-mono">{equipment.serialNumber || '—'}</span></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2"><Shield className="size-4" /> {t('الضمان والمعلومات', 'Warranty & Info')}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('انتهاء الضمان', 'Warranty Expiry')}</span><span className={isWarrantyExpired ? 'text-red-600 font-semibold' : ''}>{equipment.warrantyExpiry ? formatDate(equipment.warrantyExpiry, lang) : '—'}{isWarrantyExpired && ` (${t('منتهي', 'Expired')})`}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('الموديل', 'Model')}</span><span>{equipment.model || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('النوع', 'Type')}</span><span>{equipment.type || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('الإهلاك السنوي', 'Annual Depreciation')}</span><MoneyDisplay value={computed.depreciationPerYear} lang={lang} size="sm" inline /></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ====== TAB 2: سلسلة التأجير (Rental Workflow) ====== */}
        <TabsContent value="workflow" className="space-y-4">
          <RentalWorkflowChain activeRentals={computed.activeRentals} lang={lang} onNavigate={handleNavigate} />

          {/* Quick Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => setRentalDialogOpen(true)}>
              <FileText className="size-5 text-cyan-600" />
              <span className="text-xs">{t('عقد تأجير', 'Rental Contract')}</span>
            </Button>
            <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleNavigate('delivery-orders')}>
              <Truck className="size-5 text-cyan-600" />
              <span className="text-xs">{t('أمر توصيل', 'Delivery Order')}</span>
            </Button>
            <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleNavigate('timesheets')}>
              <Clock className="size-5 text-cyan-600" />
              <span className="text-xs">{t('سجل ساعات', 'Timesheet')}</span>
            </Button>
            <Button variant="outline" className="gap-2 h-auto py-3 flex-col" onClick={() => handleNavigate('rental-invoices')}>
              <Receipt className="size-5 text-cyan-600" />
              <span className="text-xs">{t('فاتورة تأجير', 'Rental Invoice')}</span>
            </Button>
          </div>

          {/* All Rentals Table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{t('جميع عقود التأجير', 'All Rental Contracts')}</CardTitle>
                <Button size="sm" className="gap-1 bg-cyan-600 hover:bg-cyan-700" onClick={() => setRentalDialogOpen(true)}><Plus className="size-3.5" /> {t('عقد جديد', 'New Contract')}</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {computed.rentals.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">{t('لا توجد عقود تأجير', 'No rental contracts')}</p>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{t('العميل', 'Client')}</TableHead>
                        <TableHead className="text-right">{t('رقم العقد', 'Contract')}</TableHead>
                        <TableHead className="text-right">{t('البداية', 'Start')}</TableHead>
                        <TableHead className="text-right">{t('النهاية', 'End')}</TableHead>
                        <TableHead className="text-right">{t('نوع الأجر', 'Rate Type')}</TableHead>
                        <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                        <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {computed.rentals.map(r => {
                        const rCfg = rentalStatusConfig[r.status] || rentalStatusConfig.ACTIVE
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.client?.name || '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="font-mono text-xs">{r.contract?.contractNo || '—'}</Badge></TableCell>
                            <TableCell>{formatDate(r.startDate, lang)}</TableCell>
                            <TableCell>{r.endDate ? formatDate(r.endDate, lang) : '—'}</TableCell>
                            <TableCell>{rateTypeLabels[r.rateType]?.[lang] || r.rateType}</TableCell>
                            <TableCell><MoneyDisplay value={r.totalAmount} lang={lang} size="sm" bold inline className="text-cyan-700" /></TableCell>
                            <TableCell><Badge className={`${rCfg.bg} ${rCfg.color} border-0`}>{rCfg.label[lang]}</Badge></TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== TAB 3: التكاليف (Costs) ====== */}
        <TabsContent value="costs" className="space-y-4">
          {/* Cost Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3 text-center"><p className="text-xs text-amber-600">{t('تكلفة الوقود', 'Fuel Cost')}</p><MoneyDisplay value={computed.totalFuelCost} lang={lang} size="lg" bold className="text-amber-700" /></CardContent></Card>
            <Card className="bg-orange-50 border-orange-200"><CardContent className="p-3 text-center"><p className="text-xs text-orange-600">{t('تكلفة الصيانة', 'Maintenance Cost')}</p><MoneyDisplay value={computed.totalMaintenanceCost} lang={lang} size="lg" bold className="text-orange-700" /></CardContent></Card>
            <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('تكلفة التشغيل', 'Operating Cost')}</p><MoneyDisplay value={computed.totalUsageCost} lang={lang} size="lg" bold className="text-emerald-700" /></CardContent></Card>
            <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center"><p className="text-xs text-rose-600">{t('المصروفات', 'Expenses')}</p><MoneyDisplay value={computed.totalExpenses} lang={lang} size="lg" bold className="text-rose-700" /></CardContent></Card>
          </div>

          {/* Fuel Logs */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Fuel className="size-4 text-amber-600" /> {t('سجلات الوقود', 'Fuel Logs')}</CardTitle>
                <Button size="sm" className="gap-1 bg-amber-600 hover:bg-amber-700" onClick={() => setFuelDialogOpen(true)}><Plus className="size-3.5" /> {t('إضافة', 'Add')}</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {computed.fuelLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">{t('لا توجد سجلات وقود', 'No fuel records')}</p>
              ) : (
                <div className="overflow-x-auto max-h-64">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead><TableHead className="text-right">{t('اللترات', 'Liters')}</TableHead><TableHead className="text-right">{t('سعر اللتر', 'Cost/Liter')}</TableHead><TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead><TableHead className="text-right">{t('المشروع', 'Project')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {computed.fuelLogs.map(f => (
                        <TableRow key={f.id}>
                          <TableCell>{formatDate(f.date, lang)}</TableCell>
                          <TableCell>{formatNumber(f.liters)}</TableCell>
                          <TableCell><MoneyDisplay value={f.costPerLiter} lang={lang} size="sm" inline /></TableCell>
                          <TableCell><MoneyDisplay value={f.totalCost} lang={lang} size="sm" bold inline className="text-amber-700" /></TableCell>
                          <TableCell className="text-muted-foreground text-xs">{f.project?.name || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Maintenance Records */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Wrench className="size-4 text-orange-600" /> {t('سجلات الصيانة', 'Maintenance Records')}</CardTitle>
                <Button size="sm" className="gap-1 bg-orange-600 hover:bg-orange-700" onClick={() => setMaintenanceDialogOpen(true)}><Plus className="size-3.5" /> {t('إضافة', 'Add')}</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {computed.maintenance.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">{t('لا توجد سجلات صيانة', 'No maintenance records')}</p>
              ) : (
                <div className="overflow-x-auto max-h-64">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead><TableHead className="text-right">{t('الوصف', 'Description')}</TableHead><TableHead className="text-right">{t('التكلفة', 'Cost')}</TableHead><TableHead className="text-right">{t('القادمة', 'Next')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {computed.maintenance.map(m => (
                        <TableRow key={m.id}>
                          <TableCell>{formatDate(m.date, lang)}</TableCell>
                          <TableCell>{m.description}</TableCell>
                          <TableCell><MoneyDisplay value={m.cost} lang={lang} size="sm" bold inline className="text-orange-700" /></TableCell>
                          <TableCell>{m.nextDate ? formatDate(m.nextDate, lang) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expenses by Category */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Receipt className="size-4 text-rose-600" /> {t('المصروفات حسب الفئة', 'Expenses by Category')}</CardTitle>
                <Button size="sm" className="gap-1 bg-rose-600 hover:bg-rose-700" onClick={() => setExpenseDialogOpen(true)}><Plus className="size-3.5" /> {t('إضافة', 'Add')}</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {Object.keys(computed.costByCategory).length === 0 ? (
                <p className="text-center text-muted-foreground py-6">{t('لا توجد مصروفات', 'No expenses')}</p>
              ) : (
                <div className="overflow-x-auto max-h-64">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('الفئة', 'Category')}</TableHead><TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {Object.entries(computed.costByCategory).map(([cat, amount]) => (
                        <TableRow key={cat}>
                          <TableCell><Badge variant="outline" className="bg-gray-50">{expenseCategoryLabels[cat]?.[lang] || cat}</Badge></TableCell>
                          <TableCell><MoneyDisplay value={amount} lang={lang} size="sm" bold inline className="text-rose-700" /></TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-rose-50">
                        <TableCell className="font-bold">{t('الإجمالي', 'Total')}</TableCell>
                        <TableCell><MoneyDisplay value={computed.totalExpenses} lang={lang} size="sm" bold inline className="text-rose-800" /></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* All Expenses Detail */}
          {computed.expenses.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t('تفاصيل المصروفات', 'Expense Details')}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-64">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead><TableHead className="text-right">{t('الفئة', 'Category')}</TableHead><TableHead className="text-right">{t('الوصف', 'Description')}</TableHead><TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {computed.expenses.map(e => (
                        <TableRow key={e.id}>
                          <TableCell>{formatDate(e.date, lang)}</TableCell>
                          <TableCell><Badge variant="outline" className="bg-gray-50 text-xs">{expenseCategoryLabels[e.category]?.[lang] || e.category}</Badge></TableCell>
                          <TableCell>{e.description}</TableCell>
                          <TableCell><MoneyDisplay value={e.amount} lang={lang} size="sm" bold inline className="text-rose-600" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ====== TAB 4: الإيرادات (Revenue) ====== */}
        <TabsContent value="revenue" className="space-y-4">
          {/* Revenue Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('إجمالي الإيرادات', 'Total Revenue')}</p><MoneyDisplay value={computed.totalRentalRevenue} lang={lang} size="xl" bold className="text-emerald-700" /></CardContent></Card>
            <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('عقود نشطة', 'Active Contracts')}</p><p className="text-2xl font-bold text-cyan-700">{computed.activeRentals.length}</p></CardContent></Card>
            <Card className="bg-purple-50 border-purple-200"><CardContent className="p-3 text-center"><p className="text-xs text-purple-600">{t('إجمالي ساعات التشغيل', 'Total Operating Hours')}</p><p className="text-2xl font-bold text-purple-700">{formatNumber(computed.allHours)}</p></CardContent></Card>
          </div>

          {/* Rental Contracts */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{t('عقود التأجير', 'Rental Contracts')}</CardTitle>
                <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setRentalDialogOpen(true)}><Plus className="size-3.5" /> {t('عقد جديد', 'New Contract')}</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {computed.rentals.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">{t('لا توجد عقود تأجير', 'No rental contracts')}</p>
              ) : (
                <div className="overflow-x-auto max-h-72">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('العميل', 'Client')}</TableHead><TableHead className="text-right">{t('العقد', 'Contract')}</TableHead><TableHead className="text-right">{t('الفترة', 'Period')}</TableHead><TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead><TableHead className="text-right">{t('الحالة', 'Status')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {computed.rentals.map(r => {
                        const rCfg = rentalStatusConfig[r.status] || rentalStatusConfig.ACTIVE
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.client?.name || '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="font-mono text-xs">{r.contract?.contractNo || '—'}</Badge></TableCell>
                            <TableCell className="text-xs">{formatDate(r.startDate, lang)} - {r.endDate ? formatDate(r.endDate, lang) : '—'}</TableCell>
                            <TableCell><MoneyDisplay value={r.totalAmount} lang={lang} size="sm" bold inline className="text-emerald-700" /></TableCell>
                            <TableCell><Badge className={`${rCfg.bg} ${rCfg.color} border-0`}>{rCfg.label[lang]}</Badge></TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timesheets */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{t('سجلات ساعات التشغيل', 'Operating Timesheets')}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {computed.timesheets.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">{t('لا توجد سجلات ساعات', 'No timesheets')}</p>
              ) : (
                <div className="overflow-x-auto max-h-72">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('الشهر', 'Month')}</TableHead><TableHead className="text-right">{t('المشروع', 'Project')}</TableHead><TableHead className="text-right">{t('الساعات', 'Hours')}</TableHead><TableHead className="text-right">{t('سعر الساعة', 'Rate')}</TableHead><TableHead className="text-right">{t('الحالة', 'Status')}</TableHead><TableHead className="text-right">{t('الفاتورة', 'Invoice')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {computed.timesheets.map(ts => (
                        <TableRow key={ts.id}>
                          <TableCell className="font-medium">{formatMonthYear(ts.month, ts.year, lang)}</TableCell>
                          <TableCell>{ts.project?.name || '—'}</TableCell>
                          <TableCell>{formatNumber(ts.operatingHours)}</TableCell>
                          <TableCell><MoneyDisplay value={ts.contract?.hourlyRate || ts.rental?.hourlyRate || 0} lang={lang} size="sm" inline /></TableCell>
                          <TableCell><Badge className={`${timesheetStatusLabels[ts.status] ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'} border-0`}>{timesheetStatusLabels[ts.status]?.[lang] || ts.status}</Badge></TableCell>
                          <TableCell>{ts.invoice ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">{ts.invoice.invoiceNo}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delivery Orders */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{t('أوامر التوصيل', 'Delivery Orders')}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {computed.deliveryOrders.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">{t('لا توجد أوامر توصيل', 'No delivery orders')}</p>
              ) : (
                <div className="overflow-x-auto max-h-72">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('رقم الأمر', 'Order No.')}</TableHead><TableHead className="text-right">{t('العميل', 'Client')}</TableHead><TableHead className="text-right">{t('تاريخ التوصيل', 'Delivery Date')}</TableHead><TableHead className="text-right">{t('تاريخ الإرجاع', 'Return Date')}</TableHead><TableHead className="text-right">{t('الحالة', 'Status')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {computed.deliveryOrders.map(d => (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono text-xs">{d.orderNo}</TableCell>
                          <TableCell>{d.client?.name || '—'}</TableCell>
                          <TableCell>{formatDate(d.deliveryDate, lang)}</TableCell>
                          <TableCell>{d.returnDate ? formatDate(d.returnDate, lang) : '—'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{doStatusLabels[d.status]?.[lang] || d.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== TAB 5: التشغيل (Operations) ====== */}
        <TabsContent value="operations" className="space-y-4">
          {/* Operating Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-blue-50 border-blue-200"><CardContent className="p-3 text-center"><p className="text-xs text-blue-600">{t('ساعات سجلات العمل', 'Timesheet Hours')}</p><p className="text-2xl font-bold text-blue-700">{formatNumber(computed.totalOperatingHours)}</p></CardContent></Card>
            <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center"><p className="text-xs text-emerald-600">{t('ساعات الاستخدام', 'Usage Hours')}</p><p className="text-2xl font-bold text-emerald-700">{formatNumber(computed.totalUsageHours)}</p></CardContent></Card>
            <Card className="bg-purple-50 border-purple-200"><CardContent className="p-3 text-center"><p className="text-xs text-purple-600">{t('ساعات التشغيل', 'Operation Hours')}</p><p className="text-2xl font-bold text-purple-700">{formatNumber(computed.totalOperationHours)}</p></CardContent></Card>
            <Card className="bg-cyan-50 border-cyan-200"><CardContent className="p-3 text-center"><p className="text-xs text-cyan-600">{t('إجمالي الساعات', 'Total Hours')}</p><p className="text-2xl font-bold text-cyan-700">{formatNumber(computed.allHours)}</p></CardContent></Card>
          </div>

          {/* Operator Logs */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="size-4" /> {t('سجلات المشغلين', 'Operator Logs')}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {computed.operatorLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">{t('لا توجد سجلات مشغلين', 'No operator logs')}</p>
              ) : (
                <div className="overflow-x-auto max-h-72">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead><TableHead className="text-right">{t('المشغل', 'Operator')}</TableHead><TableHead className="text-right">{t('المشروع', 'Project')}</TableHead><TableHead className="text-right">{t('الساعات', 'Hours')}</TableHead><TableHead className="text-right">{t('ملاحظات', 'Notes')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {computed.operatorLogs.map(o => (
                        <TableRow key={o.id}>
                          <TableCell>{formatDate(o.date, lang)}</TableCell>
                          <TableCell className="font-medium">{o.operator?.name || o.operator?.nameAr || '—'}</TableCell>
                          <TableCell>{o.project?.name || '—'}</TableCell>
                          <TableCell>{formatNumber(o.hours)}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{o.notes || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage Records */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Clock className="size-4" /> {t('سجلات الاستخدام', 'Usage Records')}</CardTitle>
                <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setUsageDialogOpen(true)}><Plus className="size-3.5" /> {t('إضافة', 'Add')}</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {computed.usages.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">{t('لا توجد سجلات استخدام', 'No usage records')}</p>
              ) : (
                <div className="overflow-x-auto max-h-72">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead><TableHead className="text-right">{t('المشروع', 'Project')}</TableHead><TableHead className="text-right">{t('الساعات', 'Hours')}</TableHead><TableHead className="text-right">{t('التكلفة', 'Cost')}</TableHead><TableHead className="text-right">{t('الوصف', 'Description')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {computed.usages.map(u => (
                        <TableRow key={u.id}>
                          <TableCell>{formatDate(u.date, lang)}</TableCell>
                          <TableCell className="font-medium">{u.project.name}</TableCell>
                          <TableCell>{formatNumber(u.hours)}</TableCell>
                          <TableCell><MoneyDisplay value={u.cost} lang={lang} size="sm" bold inline className="text-emerald-700" /></TableCell>
                          <TableCell className="text-muted-foreground text-xs">{u.description || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddRentalDialog open={rentalDialogOpen} onOpenChange={setRentalDialogOpen} equipmentId={equipmentId} clients={clients} projects={projects} />
      <AddUsageDialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen} equipmentId={equipmentId} projects={projects} />
      <AddMaintenanceDialog open={maintenanceDialogOpen} onOpenChange={setMaintenanceDialogOpen} equipmentId={equipmentId} />
      <AddFuelDialog open={fuelDialogOpen} onOpenChange={setFuelDialogOpen} equipmentId={equipmentId} projects={projects} />
      <AddEquipmentExpenseDialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen} equipmentId={equipmentId} />
    </div>
  )
}

// ============ Main Equipment Module ============
export function EquipmentModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null)

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const { data: equipment = [], isLoading, isError, refetch } = useQuery<Equipment[]>({
    queryKey: ['equipment'],
    queryFn: async () => {
      const res = await fetch('/api/equipment')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers-list'],
    queryFn: async () => { const r = await fetch('/api/suppliers'); if (!r.ok) return []; return r.json() },
  })

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['clients-list'],
    queryFn: async () => { const r = await fetch('/api/clients'); if (!r.ok) return []; return r.json() },
  })

  const filtered = equipment.filter(eq => {
    if (!search) return true
    return eq.name.toLowerCase().includes(search.toLowerCase()) ||
      eq.code.toLowerCase().includes(search.toLowerCase()) ||
      (eq.type || '').toLowerCase().includes(search.toLowerCase()) ||
      (eq.supplier?.name || '').toLowerCase().includes(search.toLowerCase())
  }).filter(eq => {
    if (statusFilter === 'all') return true
    return eq.status === statusFilter
  })

  const total = equipment.length
  const available = equipment.filter(e => e.status === 'AVAILABLE').length
  const rented = equipment.filter(e => e.status === 'RENTED').length
  const inUse = equipment.filter(e => e.status === 'IN_USE').length
  const maintenanceCount = equipment.filter(e => e.status === 'MAINTENANCE').length

  const printData = {
    columns: [
      { key: 'code', label: lang === 'ar' ? 'الكود' : 'Code' },
      { key: 'name', label: lang === 'ar' ? 'الاسم' : 'Name' },
      { key: 'type', label: lang === 'ar' ? 'النوع' : 'Type' },
      { key: 'model', label: lang === 'ar' ? 'الموديل' : 'Model' },
      { key: 'status', label: lang === 'ar' ? 'الحالة' : 'Status' },
      { key: 'hourlyRate', label: lang === 'ar' ? 'الأجر/ساعة' : 'Hourly Rate' },
    ],
    rows: filtered.map(eq => ({
      code: eq.code,
      name: eq.name,
      type: eq.type || '',
      model: eq.model || '',
      status: statusConfig[eq.status]?.label[lang] || eq.status,
      hourlyRate: eq.hourlyRate,
    })),
    infoItems: [
      { label: lang === 'ar' ? 'الإجمالي' : 'Total', value: String(total) },
      { label: lang === 'ar' ? 'متاحة' : 'Available', value: String(available) },
      { label: lang === 'ar' ? 'مؤجرة' : 'Rented', value: String(rented) },
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
    ],
  }

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code') },
      { key: 'name', label: t('الاسم', 'Name') },
      { key: 'type', label: t('النوع', 'Type') },
      { key: 'model', label: t('الموديل', 'Model') },
      { key: 'status', label: t('الحالة', 'Status'), format: (v) => statusConfig[v as string]?.label[lang] || String(v) },
      { key: 'hourlyRate', label: t('الأجر بالساعة', 'Hourly Rate'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'dailyRate', label: t('الأجر اليومي', 'Daily Rate'), format: (v) => (Number(v) || 0).toFixed(2) },
      { key: 'monthlyRate', label: t('الأجر الشهري', 'Monthly Rate'), format: (v) => (Number(v) || 0).toFixed(2) },
    ]
    const rows = filtered.map(eq => ({
      code: eq.code, name: eq.name, type: eq.type || '', model: eq.model || '',
      status: eq.status, hourlyRate: eq.hourlyRate, dailyRate: eq.dailyRate, monthlyRate: eq.monthlyRate,
    }))
    exportToCSV(rows, `equipment-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  if (selectedEquipmentId) {
    return <EquipmentDetailView equipmentId={selectedEquipmentId} onBack={() => setSelectedEquipmentId(null)} />
  }

  return (
    <ModuleLayout
      title={{ ar: 'المعدات', en: 'Equipment Hub' }}
      subtitle={{ ar: 'كرت المعدة - مركز نشاط التأجير', en: 'Equipment Card - Center of Rental Activity' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="equipment-report" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport} title={t('تصدير CSV', 'Export CSV')}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {t('معدة جديدة', 'New Equipment')}
          </Button>
        </div>
      }
    >

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center"><Truck className="size-5 text-emerald-600" /></div>
            <div><p className="text-sm text-emerald-600">{t('الإجمالي', 'Total')}</p><p className="text-xl font-bold text-emerald-700">{formatNumber(total)}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle2 className="size-5 text-green-600" /></div>
            <div><p className="text-sm text-green-600">{t('متاحة', 'Available')}</p><p className="text-xl font-bold text-green-700">{formatNumber(available)}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-purple-100 flex items-center justify-center"><Receipt className="size-5 text-purple-600" /></div>
            <div><p className="text-sm text-purple-600">{t('مؤجرة', 'Rented')}</p><p className="text-xl font-bold text-purple-700">{formatNumber(rented)}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center"><Clock className="size-5 text-blue-600" /></div>
            <div><p className="text-sm text-blue-600">{t('قيد الاستخدام', 'In Use')}</p><p className="text-xl font-bold text-blue-700">{formatNumber(inUse)}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-orange-100 flex items-center justify-center"><Wrench className="size-5 text-orange-600" /></div>
            <div><p className="text-sm text-orange-600">{t('صيانة', 'Maintenance')}</p><p className="text-xl font-bold text-orange-700">{formatNumber(maintenanceCount)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t('بحث بالاسم أو الكود أو النوع أو المورد...', 'Search by name, code, type, or supplier...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('كل الحالات', 'All Status')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الحالات', 'All Status')}</SelectItem>
                {Object.entries(statusConfig).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>
                ))}
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
              <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
              <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Truck className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t('لا توجد معدات', 'No equipment found')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> {t('إضافة معدة', 'Add Equipment')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('الكود', 'Code')}</TableHead>
                    <TableHead className="text-right">{t('الاسم', 'Name')}</TableHead>
                    <TableHead className="text-right">{t('النوع', 'Type')}</TableHead>
                    <TableHead className="text-right">{t('الموديل', 'Model')}</TableHead>
                    <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                    <TableHead className="text-right">{t('النشاط', 'Activity')}</TableHead>
                    <TableHead className="text-right">{t('الملكية', 'Ownership')}</TableHead>
                    <TableHead className="text-right">{t('الأجر/ساعة', 'Hourly Rate')}</TableHead>
                    <TableHead className="text-right">{t('النشاط الحالي', 'Current Activity')}</TableHead>
                    <TableHead className="text-right">{t('عرض', 'View')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(eq => (
                    <TableRow key={eq.id} className="cursor-pointer hover:bg-cyan-50/50" onClick={() => setSelectedEquipmentId(eq.id)}>
                      <TableCell className="font-mono text-xs">{eq.code}</TableCell>
                      <TableCell className="font-medium">{eq.name}</TableCell>
                      <TableCell className="text-muted-foreground">{eq.type || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{eq.model || '—'}</TableCell>
                      <TableCell><StatusBadge status={eq.status} lang={lang} /></TableCell>
                      <TableCell><ActivityBadge status={eq.status} lang={lang} /></TableCell>
                      <TableCell><OwnershipBadge ownershipType={eq.ownershipType || 'COMPANY_OWNED'} lang={lang} /></TableCell>
                      <TableCell><MoneyDisplay value={eq.hourlyRate} lang={lang} size="sm" inline /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {eq.status === 'RENTED' ? t('تأجير', 'Rental') : eq.status === 'IN_USE' ? t('تنفيذي', 'Construction') : '—'}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="gap-1 text-cyan-600 hover:text-cyan-700" onClick={(e) => { e.stopPropagation(); setSelectedEquipmentId(eq.id) }}>
                          <Eye className="size-3.5" /> {t('كرت المعدة', 'Card')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Equipment Dialog */}
      <NewEquipmentDialog open={dialogOpen} onOpenChange={setDialogOpen} suppliers={suppliers} clients={clients} />
    </ModuleLayout>
  )
}

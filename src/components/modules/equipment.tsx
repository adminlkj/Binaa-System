'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck, Plus, Search, RefreshCw, Wrench, Fuel, Clock,
  ArrowRight, DollarSign, Calendar, Shield, FileText, Receipt,
  HandMetal, ChevronLeft,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
import { useAppStore, formatSAR, formatNumber, formatDate } from '@/stores/app-store'

// ============ Types ============
interface Supplier {
  id: string; code: string; name: string; nameAr: string | null
}

interface Equipment {
  id: string; code: string; name: string; nameAr: string | null
  type: string | null; model: string | null; serialNumber: string | null
  status: string; supplierId: string | null; clientId: string | null
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
}

interface EquipmentRental {
  id: string; equipmentId: string; clientId: string; projectId: string | null
  startDate: string; endDate: string | null; rateType: string
  rate: number; totalAmount: number; status: string; notes: string | null
  createdAt: string
  equipment: { id: string; code: string; name: string; nameAr: string | null }
}

interface EquipmentExpense {
  id: string; equipmentId: string; category: string; description: string
  amount: number; date: string; reference: string | null
}

interface ClientOption { id: string; code: string; name: string; nameAr: string | null }
interface ProjectOption { id: string; code: string; name: string }

// ============ Status Helpers ============
const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  AVAILABLE: { label: { ar: 'متاحة', en: 'Available' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  IN_USE: { label: { ar: 'قيد الاستخدام', en: 'In Use' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  MAINTENANCE: { label: { ar: 'صيانة', en: 'Maintenance' }, color: 'text-orange-700', bg: 'bg-orange-100' },
  OUT_OF_SERVICE: { label: { ar: 'خارج الخدمة', en: 'Out of Service' }, color: 'text-red-700', bg: 'bg-red-100' },
  RENTED: { label: { ar: 'مؤجرة', en: 'Rented' }, color: 'text-purple-700', bg: 'bg-purple-100' },
}

function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.AVAILABLE
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

// Rental status config
const rentalStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  ACTIVE: { label: { ar: 'نشط', en: 'Active' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  RETURNED: { label: { ar: 'مرتجع', en: 'Returned' }, color: 'text-gray-700', bg: 'bg-gray-100' },
  OVERDUE: { label: { ar: 'متأخر', en: 'Overdue' }, color: 'text-red-700', bg: 'bg-red-100' },
}

// Expense category labels
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

// Rate type labels
const rateTypeLabels: Record<string, { ar: string; en: string }> = {
  HOURLY: { ar: 'بالساعة', en: 'Hourly' },
  DAILY: { ar: 'يومي', en: 'Daily' },
  MONTHLY: { ar: 'شهري', en: 'Monthly' },
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
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

// ============ New Equipment Dialog ============
function NewEquipmentDialog({ open, onOpenChange, suppliers }: {
  open: boolean; onOpenChange: (v: boolean) => void; suppliers: Supplier[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [type, setType] = useState('')
  const [model, setModel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [status, setStatus] = useState('AVAILABLE')
  const [supplierId, setSupplierId] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [dailyRate, setDailyRate] = useState('')
  const [monthlyRate, setMonthlyRate] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [warrantyExpiry, setWarrantyExpiry] = useState('')

  React.useEffect(() => {
    if (open) {
      setName(''); setNameAr(''); setType(''); setModel('')
      setSerialNumber(''); setStatus('AVAILABLE'); setSupplierId('')
      setPurchasePrice(''); setSellingPrice(''); setHourlyRate('')
      setDailyRate(''); setMonthlyRate(''); setPurchaseDate(''); setWarrantyExpiry('')
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
      supplierId: supplierId || null,
      purchasePrice, sellingPrice, hourlyRate, dailyRate, monthlyRate,
      purchaseDate: purchaseDate || null,
      warrantyExpiry: warrantyExpiry || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'معدة جديدة' : 'New Equipment'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة معدة جديدة مع بيانات الشراء والتأجير' : 'Add new equipment with purchase and rental details'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Info */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-emerald-700 border-b border-emerald-200 pb-1">
              {lang === 'ar' ? 'المعلومات الأساسية' : 'Basic Information'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'الاسم *' : 'Name *'}</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={lang === 'ar' ? 'اسم المعدة' : 'Equipment name'} required />
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'الاسم بالعربي' : 'Arabic Name'}</Label>
                <Input value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder={lang === 'ar' ? 'الاسم بالعربية' : 'Arabic name'} />
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'النوع' : 'Type'}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر النوع' : 'Select type'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="حفارة">{lang === 'ar' ? 'حفارة' : 'Excavator'}</SelectItem>
                    <SelectItem value="شيول">{lang === 'ar' ? 'شيول' : 'Shovel'}</SelectItem>
                    <SelectItem value="كرين">{lang === 'ar' ? 'كرين' : 'Crane'}</SelectItem>
                    <SelectItem value="قلاب">{lang === 'ar' ? 'قلاب' : 'Dump Truck'}</SelectItem>
                    <SelectItem value="بولدوزر">{lang === 'ar' ? 'بولدوزر' : 'Bulldozer'}</SelectItem>
                    <SelectItem value="رافعة">{lang === 'ar' ? 'رافعة' : 'Lift'}</SelectItem>
                    <SelectItem value="ضاغط">{lang === 'ar' ? 'ضاغط' : 'Compressor'}</SelectItem>
                    <SelectItem value="أخرى">{lang === 'ar' ? 'أخرى' : 'Other'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'الموديل' : 'Model'}</Label>
                <Input value={model} onChange={e => setModel(e.target.value)} placeholder={lang === 'ar' ? 'الموديل' : 'Model'} />
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'الرقم التسلسلي' : 'Serial No.'}</Label>
                <Input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder={lang === 'ar' ? 'الرقم التسلسلي' : 'Serial number'} />
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'الحالة' : 'Status'}</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Purchase Info */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-teal-700 border-b border-teal-200 pb-1">
              {lang === 'ar' ? 'معلومات الشراء' : 'Purchase Information'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'المورد' : 'Supplier'}</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر المورد' : 'Select supplier'} /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'سعر الشراء' : 'Purchase Price'}</Label>
                <Input type="number" min="0" step="0.01" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} dir="ltr" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'سعر البيع/التأجير' : 'Selling/Rental Price'}</Label>
                <Input type="number" min="0" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} dir="ltr" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'تاريخ الشراء' : 'Purchase Date'}</Label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'انتهاء الضمان' : 'Warranty Expiry'}</Label>
                <Input type="date" value={warrantyExpiry} onChange={e => setWarrantyExpiry(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Rental Rates */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-purple-700 border-b border-purple-200 pb-1">
              {lang === 'ar' ? 'أسعار التأجير' : 'Rental Rates'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'الأجر بالساعة' : 'Hourly Rate'}</Label>
                <Input type="number" min="0" step="0.01" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} dir="ltr" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'الأجر اليومي' : 'Daily Rate'}</Label>
                <Input type="number" min="0" step="0.01" value={dailyRate} onChange={e => setDailyRate(e.target.value)} dir="ltr" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'الأجر الشهري' : 'Monthly Rate'}</Label>
                <Input type="number" min="0" step="0.01" value={monthlyRate} onChange={e => setMonthlyRate(e.target.value)} dir="ltr" placeholder="0.00" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !name} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة' : 'Add')}
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
    if (open) {
      setClientId(''); setProjectId(''); setStartDate(''); setEndDate('')
      setRateType('DAILY'); setRate(''); setTotalAmount(''); setNotes('')
    }
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
    createMutation.mutate({
      equipmentId, clientId, projectId: projectId || null,
      startDate, endDate: endDate || null, rateType, rate, totalAmount,
      notes: notes || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'عقد تأجير جديد' : 'New Rental Contract'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إنشاء عقد تأجير جديد للمعدة' : 'Create a new rental contract for equipment'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'العميل *' : 'Client *'}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر العميل' : 'Select client'} /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'المشروع' : 'Project'}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر المشروع' : 'Select project'} /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'تاريخ البداية *' : 'Start Date *'}</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'تاريخ النهاية' : 'End Date'}</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'نوع الأجر *' : 'Rate Type *'}</Label>
              <Select value={rateType} onValueChange={setRateType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(rateTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v[lang]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الأجر *' : 'Rate *'}</Label>
              <Input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الإجمالي *' : 'Total Amount *'}</Label>
              <Input type="number" min="0" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'ملاحظات' : 'Notes'}</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={lang === 'ar' ? 'ملاحظات' : 'Notes'} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !clientId || !startDate || !rate || !totalAmount} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'إنشاء العقد' : 'Create Contract')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Add Equipment Expense Dialog ============
function AddEquipmentExpenseDialog({ open, onOpenChange, equipmentId }: {
  open: boolean; onOpenChange: (v: boolean) => void; equipmentId: string
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [reference, setReference] = useState('')

  React.useEffect(() => {
    if (open) {
      setCategory(''); setDescription(''); setAmount(''); setDate(''); setReference('')
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['equipment-detail'] })
      onOpenChange(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ equipmentId, category, description, amount, date, reference: reference || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'مصروف معدة' : 'Equipment Expense'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة مصروف جديد للمعدة' : 'Add new expense for equipment'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الفئة *' : 'Category *'}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر الفئة' : 'Select category'} /></SelectTrigger>
              <SelectContent>
                {expenseCategoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c[lang]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الوصف *' : 'Description *'}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={lang === 'ar' ? 'وصف المصروف' : 'Expense description'} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'المبلغ *' : 'Amount *'}</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'التاريخ *' : 'Date *'}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'المرجع' : 'Reference'}</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder={lang === 'ar' ? 'رقم المرجع' : 'Reference number'} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !category || !description || !amount || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Add Usage Dialog ============
function AddUsageDialog({ open, onOpenChange, equipmentId, projects }: {
  open: boolean; onOpenChange: (v: boolean) => void; equipmentId: string; projects: ProjectOption[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState('')
  const [hours, setHours] = useState('')
  const [cost, setCost] = useState('')
  const [description, setDescription] = useState('')

  React.useEffect(() => {
    if (open) { setProjectId(''); setDate(''); setHours(''); setCost(''); setDescription('') }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/usages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-usages'] }); queryClient.invalidateQueries({ queryKey: ['equipment-detail'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ equipmentId, projectId, date, hours, cost, description })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'سجل استخدام' : 'Add Usage'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة سجل استخدام جديد' : 'Add new usage record'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'المشروع *' : 'Project *'}</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر المشروع' : 'Select project'} /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'التاريخ *' : 'Date *'}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الساعات *' : 'Hours *'}</Label>
              <Input type="number" min="0" step="0.5" value={hours} onChange={e => setHours(e.target.value)} dir="ltr" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'التكلفة *' : 'Cost *'}</Label>
            <Input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} dir="ltr" required />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الوصف' : 'Description'}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={lang === 'ar' ? 'وصف العمل' : 'Work description'} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Add Maintenance Dialog ============
function AddMaintenanceDialog({ open, onOpenChange, equipmentId }: {
  open: boolean; onOpenChange: (v: boolean) => void; equipmentId: string
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [cost, setCost] = useState('')
  const [nextDate, setNextDate] = useState('')

  React.useEffect(() => {
    if (open) { setDate(''); setDescription(''); setCost(''); setNextDate('') }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-maintenance'] }); queryClient.invalidateQueries({ queryKey: ['equipment-detail'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ equipmentId, date, description, cost, nextDate: nextDate || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'سجل صيانة' : 'Add Maintenance'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة سجل صيانة جديد' : 'Add new maintenance record'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'التاريخ *' : 'Date *'}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'التكلفة *' : 'Cost *'}</Label>
              <Input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} dir="ltr" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الوصف *' : 'Description *'}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={lang === 'ar' ? 'وصف الصيانة' : 'Maintenance description'} required />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'تاريخ الصيانة القادمة' : 'Next Maintenance Date'}</Label>
            <Input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Add Fuel Dialog ============
function AddFuelDialog({ open, onOpenChange, equipmentId, projects }: {
  open: boolean; onOpenChange: (v: boolean) => void; equipmentId: string; projects: ProjectOption[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [date, setDate] = useState('')
  const [liters, setLiters] = useState('')
  const [costPerLiter, setCostPerLiter] = useState('')
  const [projectId, setProjectId] = useState('')

  const totalCost = (parseFloat(liters) || 0) * (parseFloat(costPerLiter) || 0)

  React.useEffect(() => {
    if (open) { setDate(''); setLiters(''); setCostPerLiter(''); setProjectId('') }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/equipment/fuel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-fuel'] }); queryClient.invalidateQueries({ queryKey: ['equipment-detail'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ equipmentId, date, liters, costPerLiter, projectId: projectId || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'سجل وقود' : 'Add Fuel Log'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة سجل وقود جديد' : 'Add new fuel log'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'التاريخ *' : 'Date *'}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'اللترات *' : 'Liters *'}</Label>
              <Input type="number" min="0" step="0.1" value={liters} onChange={e => setLiters(e.target.value)} dir="ltr" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'سعر اللتر *' : 'Cost/Liter *'}</Label>
              <Input type="number" min="0" step="0.01" value={costPerLiter} onChange={e => setCostPerLiter(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'المشروع' : 'Project'}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {totalCost > 0 && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-3">
                <p className="text-sm text-emerald-600">{lang === 'ar' ? 'الإجمالي' : 'Total'}: <span className="font-bold text-emerald-700">{formatSAR(totalCost, lang)}</span></p>
              </CardContent>
            </Card>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Equipment Detail View ============
function EquipmentDetailView({ equipmentId, onBack }: { equipmentId: string; onBack: () => void }) {
  const { lang } = useAppStore()
  const [activeTab, setActiveTab] = useState('overview')
  const [usageDialogOpen, setUsageDialogOpen] = useState(false)
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false)
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false)
  const [rentalDialogOpen, setRentalDialogOpen] = useState(false)
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)

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

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <TableSkeleton rows={3} />
        <TableSkeleton rows={5} />
      </div>
    )
  }

  if (!equipment) return null

  const usages = equipment.usages || []
  const maintenance = equipment.maintenance || []
  const fuelLogs = equipment.fuelLogs || []
  const rentals = equipment.rentals || []
  const expenses = equipment.expenses || []

  const totalUsageCost = usages.reduce((s, u) => s + u.cost, 0)
  const totalMaintenanceCost = maintenance.reduce((s, m) => s + m.cost, 0)
  const totalFuelCost = fuelLogs.reduce((s, f) => s + f.totalCost, 0)
  const totalRentalRevenue = rentals.filter(r => r.status === 'ACTIVE').reduce((s, r) => s + r.totalAmount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)

  const isWarrantyExpired = equipment.warrantyExpiry ? new Date(equipment.warrantyExpiry) < new Date() : false

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{equipment.name}</h2>
          <p className="text-sm text-muted-foreground">{equipment.code} {equipment.model ? `| ${equipment.model}` : ''} {equipment.type ? `| ${equipment.type}` : ''}</p>
        </div>
        <StatusBadge status={equipment.status} lang={lang} />
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-600">{lang === 'ar' ? 'تكلفة الاستخدام' : 'Usage Cost'}</p>
            <p className="text-lg font-bold text-emerald-700">{formatSAR(totalUsageCost, lang)}</p>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-teal-600">{lang === 'ar' ? 'تكلفة الصيانة' : 'Maintenance Cost'}</p>
            <p className="text-lg font-bold text-teal-700">{formatSAR(totalMaintenanceCost, lang)}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-amber-600">{lang === 'ar' ? 'تكلفة الوقود' : 'Fuel Cost'}</p>
            <p className="text-lg font-bold text-amber-700">{formatSAR(totalFuelCost, lang)}</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-purple-600">{lang === 'ar' ? 'إيرادات التأجير' : 'Rental Revenue'}</p>
            <p className="text-lg font-bold text-purple-700">{formatSAR(totalRentalRevenue, lang)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="overview" className="gap-1 text-xs"><FileText className="size-3" /> <span className="hidden sm:inline">{lang === 'ar' ? 'نظرة عامة' : 'Overview'}</span></TabsTrigger>
          <TabsTrigger value="rentals" className="gap-1 text-xs"><HandMetal className="size-3" /> <span className="hidden sm:inline">{lang === 'ar' ? 'التأجير' : 'Rentals'}</span></TabsTrigger>
          <TabsTrigger value="usages" className="gap-1 text-xs"><Clock className="size-3" /> <span className="hidden sm:inline">{lang === 'ar' ? 'الاستخدام' : 'Usages'}</span></TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-1 text-xs"><Wrench className="size-3" /> <span className="hidden sm:inline">{lang === 'ar' ? 'الصيانة' : 'Maint.'}</span></TabsTrigger>
          <TabsTrigger value="fuel" className="gap-1 text-xs"><Fuel className="size-3" /> <span className="hidden sm:inline">{lang === 'ar' ? 'الوقود' : 'Fuel'}</span></TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1 text-xs"><Receipt className="size-3" /> <span className="hidden sm:inline">{lang === 'ar' ? 'المصروفات' : 'Expenses'}</span></TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Purchase Info */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm text-teal-700 flex items-center gap-2">
                  <DollarSign className="size-4" /> {lang === 'ar' ? 'معلومات الشراء' : 'Purchase Info'}
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === 'ar' ? 'سعر الشراء' : 'Purchase Price'}</span>
                    <span className="font-semibold">{formatSAR(equipment.purchasePrice, lang)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === 'ar' ? 'سعر البيع/التأجير' : 'Selling/Rental Price'}</span>
                    <span className="font-semibold">{formatSAR(equipment.sellingPrice, lang)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === 'ar' ? 'المورد' : 'Supplier'}</span>
                    <span className="font-medium">{equipment.supplier?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === 'ar' ? 'تاريخ الشراء' : 'Purchase Date'}</span>
                    <span>{equipment.purchaseDate ? formatDate(equipment.purchaseDate, lang) : '—'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Warranty Info */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Shield className="size-4" /> {lang === 'ar' ? 'الضمان والمعلومات' : 'Warranty & Info'}
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === 'ar' ? 'انتهاء الضمان' : 'Warranty Expiry'}</span>
                    <span className={isWarrantyExpired ? 'text-red-600 font-semibold' : ''}>
                      {equipment.warrantyExpiry ? formatDate(equipment.warrantyExpiry, lang) : '—'}
                      {isWarrantyExpired && ` (${lang === 'ar' ? 'منتهي' : 'Expired'})`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === 'ar' ? 'الرقم التسلسلي' : 'Serial No.'}</span>
                    <span className="font-mono">{equipment.serialNumber || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === 'ar' ? 'الموديل' : 'Model'}</span>
                    <span>{equipment.model || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === 'ar' ? 'النوع' : 'Type'}</span>
                    <span>{equipment.type || '—'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rental Rates */}
            <Card className="sm:col-span-2">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm text-purple-700 flex items-center gap-2">
                  <Calendar className="size-4" /> {lang === 'ar' ? 'أسعار التأجير' : 'Rental Rates'}
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-xs text-purple-600">{lang === 'ar' ? 'بالساعة' : 'Hourly'}</p>
                    <p className="text-lg font-bold text-purple-700">{formatSAR(equipment.hourlyRate, lang)}</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-xs text-purple-600">{lang === 'ar' ? 'يومي' : 'Daily'}</p>
                    <p className="text-lg font-bold text-purple-700">{formatSAR(equipment.dailyRate, lang)}</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-xs text-purple-600">{lang === 'ar' ? 'شهري' : 'Monthly'}</p>
                    <p className="text-lg font-bold text-purple-700">{formatSAR(equipment.monthlyRate, lang)}</p>
                  </div>
                </div>
                {/* Total Expenses Summary */}
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">{lang === 'ar' ? 'إجمالي مصروفات المعدة' : 'Total Equipment Expenses'}</span>
                  <span className="font-bold text-rose-600">{formatSAR(totalExpenses, lang)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Rentals Tab */}
        <TabsContent value="rentals" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-purple-600 hover:bg-purple-700" onClick={() => setRentalDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'عقد تأجير' : 'Add Rental'}
            </Button>
          </div>
          {rentals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{lang === 'ar' ? 'لا توجد عقود تأجير' : 'No rental contracts'}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'العميل' : 'Client'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'البداية' : 'Start'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'النهاية' : 'End'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'نوع الأجر' : 'Rate Type'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الأجر' : 'Rate'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rentals.map(r => {
                    const rCfg = rentalStatusConfig[r.status] || rentalStatusConfig.ACTIVE
                    const client = clients.find(c => c.id === r.clientId)
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{client?.name || r.clientId}</TableCell>
                        <TableCell>{formatDate(r.startDate, lang)}</TableCell>
                        <TableCell>{r.endDate ? formatDate(r.endDate, lang) : '—'}</TableCell>
                        <TableCell>{rateTypeLabels[r.rateType]?.[lang] || r.rateType}</TableCell>
                        <TableCell>{formatSAR(r.rate, lang)}</TableCell>
                        <TableCell className="font-semibold text-purple-700">{formatSAR(r.totalAmount, lang)}</TableCell>
                        <TableCell><Badge className={`${rCfg.bg} ${rCfg.color} border-0`}>{rCfg.label[lang]}</Badge></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Usages Tab */}
        <TabsContent value="usages" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setUsageDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'سجل استخدام' : 'Add Usage'}
            </Button>
          </div>
          {usages.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{lang === 'ar' ? 'لا توجد سجلات استخدام' : 'No usage records'}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المشروع' : 'Project'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الساعات' : 'Hours'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'التكلفة' : 'Cost'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usages.map(u => (
                    <TableRow key={u.id}>
                      <TableCell>{formatDate(u.date, lang)}</TableCell>
                      <TableCell className="font-medium">{u.project.name}</TableCell>
                      <TableCell>{formatNumber(u.hours)}</TableCell>
                      <TableCell className="font-semibold text-emerald-700">{formatSAR(u.cost, lang)}</TableCell>
                      <TableCell className="text-muted-foreground">{u.description || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Maintenance Tab */}
        <TabsContent value="maintenance" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setMaintenanceDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'سجل صيانة' : 'Add Maintenance'}
            </Button>
          </div>
          {maintenance.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{lang === 'ar' ? 'لا توجد سجلات صيانة' : 'No maintenance records'}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'التكلفة' : 'Cost'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الصيانة القادمة' : 'Next Date'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenance.map(m => (
                    <TableRow key={m.id}>
                      <TableCell>{formatDate(m.date, lang)}</TableCell>
                      <TableCell>{m.description}</TableCell>
                      <TableCell className="font-semibold text-teal-700">{formatSAR(m.cost, lang)}</TableCell>
                      <TableCell>{m.nextDate ? formatDate(m.nextDate, lang) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Fuel Tab */}
        <TabsContent value="fuel" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setFuelDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'سجل وقود' : 'Add Fuel'}
            </Button>
          </div>
          {fuelLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{lang === 'ar' ? 'لا توجد سجلات وقود' : 'No fuel records'}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'اللترات' : 'Liters'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'سعر اللتر' : 'Cost/Liter'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fuelLogs.map(f => (
                    <TableRow key={f.id}>
                      <TableCell>{formatDate(f.date, lang)}</TableCell>
                      <TableCell>{formatNumber(f.liters)}</TableCell>
                      <TableCell>{formatSAR(f.costPerLiter, lang)}</TableCell>
                      <TableCell className="font-semibold text-amber-700">{formatSAR(f.totalCost, lang)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {lang === 'ar' ? 'الإجمالي' : 'Total'}: <span className="font-bold text-rose-600">{formatSAR(totalExpenses, lang)}</span>
            </span>
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setExpenseDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'مصروف' : 'Add Expense'}
            </Button>
          </div>
          {expenses.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{lang === 'ar' ? 'لا توجد مصروفات' : 'No expenses'}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الفئة' : 'Category'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المبلغ' : 'Amount'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المرجع' : 'Reference'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map(e => (
                    <TableRow key={e.id}>
                      <TableCell>{formatDate(e.date, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-gray-50">{expenseCategoryLabels[e.category]?.[lang] || e.category}</Badge>
                      </TableCell>
                      <TableCell>{e.description}</TableCell>
                      <TableCell className="font-semibold text-rose-600">{formatSAR(e.amount, lang)}</TableCell>
                      <TableCell className="text-muted-foreground">{e.reference || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null)

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

  const filtered = equipment.filter(eq => {
    if (!search) return true
    return eq.name.toLowerCase().includes(search.toLowerCase()) ||
      eq.code.toLowerCase().includes(search.toLowerCase()) ||
      (eq.type || '').toLowerCase().includes(search.toLowerCase()) ||
      (eq.supplier?.name || '').toLowerCase().includes(search.toLowerCase())
  })

  // Summary
  const total = equipment.length
  const available = equipment.filter(e => e.status === 'AVAILABLE').length
  const rented = equipment.filter(e => e.status === 'RENTED').length
  const maintenanceCount = equipment.filter(e => e.status === 'MAINTENANCE').length

  if (selectedEquipmentId) {
    return <EquipmentDetailView equipmentId={selectedEquipmentId} onBack={() => setSelectedEquipmentId(null)} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'المعدات' : 'Equipment'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة معدات المشاريع والتأجير' : 'Manage project & rental equipment'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title={lang === 'ar' ? 'تحديث' : 'Refresh'}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {lang === 'ar' ? 'معدة جديدة' : 'New Equipment'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Truck className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي المعدات' : 'Total'}</p>
              <p className="text-xl font-bold text-emerald-700">{formatNumber(total)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-green-100 flex items-center justify-center">
              <Truck className="size-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-green-600">{lang === 'ar' ? 'متاحة' : 'Available'}</p>
              <p className="text-xl font-bold text-green-700">{formatNumber(available)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-purple-100 flex items-center justify-center">
              <HandMetal className="size-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-purple-600">{lang === 'ar' ? 'مؤجرة' : 'Rented'}</p>
              <p className="text-xl font-bold text-purple-700">{formatNumber(rented)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Wrench className="size-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-orange-600">{lang === 'ar' ? 'صيانة' : 'Maintenance'}</p>
              <p className="text-xl font-bold text-orange-700">{formatNumber(maintenanceCount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder={lang === 'ar' ? 'بحث بالاسم أو الكود أو النوع أو المورد...' : 'Search by name, code, type, or supplier...'} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
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
              <p className="text-rose-600">{lang === 'ar' ? 'حدث خطأ أثناء تحميل البيانات' : 'Error loading data'}</p>
              <Button variant="outline" onClick={() => refetch()}>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Truck className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{lang === 'ar' ? 'لا توجد معدات' : 'No equipment found'}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> {lang === 'ar' ? 'إضافة معدة' : 'Add Equipment'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'النوع' : 'Type'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المورد' : 'Supplier'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'سعر الشراء' : 'Purchase Price'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'سعر البيع/التأجير' : 'Selling/Rental'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(eq => (
                    <TableRow key={eq.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setSelectedEquipmentId(eq.id)}>
                      <TableCell className="font-mono text-sm">{eq.code}</TableCell>
                      <TableCell className="font-medium">{eq.name}</TableCell>
                      <TableCell>{eq.type || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{eq.supplier?.name || '—'}</TableCell>
                      <TableCell className="text-teal-700">{formatSAR(eq.purchasePrice, lang)}</TableCell>
                      <TableCell className="text-purple-700">{formatSAR(eq.sellingPrice, lang)}</TableCell>
                      <TableCell><StatusBadge status={eq.status} lang={lang} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewEquipmentDialog open={dialogOpen} onOpenChange={setDialogOpen} suppliers={suppliers} />
    </div>
  )
}

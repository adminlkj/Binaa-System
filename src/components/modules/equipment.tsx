'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck, Plus, Search, RefreshCw, Wrench, Fuel, Clock,
  ArrowRight, X,
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
interface Equipment {
  id: string; code: string; name: string; nameAr: string | null
  type: string | null; model: string | null; serialNumber: string | null
  status: string; hourlyRate: number; dailyRate: number
  purchaseDate: string | null; isActive: boolean
}

interface EquipmentUsage {
  id: string; equipmentId: string; projectId: string
  date: string; hours: number; description: string | null; cost: number
  equipment: { id: string; code: string; name: string }
  project: { id: string; code: string; name: string }
}

interface EquipmentMaintenance {
  id: string; equipmentId: string; date: string; description: string
  cost: number; nextDate: string | null
  equipment: { id: string; code: string; name: string }
}

interface EquipmentFuelLog {
  id: string; equipmentId: string; date: string; liters: number
  costPerLiter: number; totalCost: number; projectId: string | null
  equipment: { id: string; code: string; name: string }
}

interface ProjectOption { id: string; code: string; name: string }

// ============ Status Helpers ============
const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  AVAILABLE: { label: { ar: 'متاحة', en: 'Available' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  IN_USE: { label: { ar: 'قيد الاستخدام', en: 'In Use' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  MAINTENANCE: { label: { ar: 'صيانة', en: 'Maintenance' }, color: 'text-orange-700', bg: 'bg-orange-100' },
  OUT_OF_SERVICE: { label: { ar: 'خارج الخدمة', en: 'Out of Service' }, color: 'text-red-700', bg: 'bg-red-100' },
}

function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.AVAILABLE
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
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
function NewEquipmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [type, setType] = useState('')
  const [model, setModel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [status, setStatus] = useState('AVAILABLE')
  const [hourlyRate, setHourlyRate] = useState('')
  const [dailyRate, setDailyRate] = useState('')

  React.useEffect(() => {
    if (open) {
      setName(''); setNameAr(''); setType(''); setModel('')
      setSerialNumber(''); setStatus('AVAILABLE'); setHourlyRate(''); setDailyRate('')
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
    createMutation.mutate({ name, nameAr, type, model, serialNumber, status, hourlyRate, dailyRate })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'معدة جديدة' : 'New Equipment'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة معدة جديدة' : 'Add new equipment'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الأجر بالساعة' : 'Hourly Rate'}</Label>
              <Input type="number" min="0" step="0.01" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الأجر اليومي' : 'Daily Rate'}</Label>
              <Input type="number" min="0" step="0.01" value={dailyRate} onChange={e => setDailyRate(e.target.value)} dir="ltr" />
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-usages'] }); onOpenChange(false) },
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-maintenance'] }); onOpenChange(false) },
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['equipment-fuel'] }); onOpenChange(false) },
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
function EquipmentDetailView({ equipment, onBack }: { equipment: Equipment; onBack: () => void }) {
  const { lang } = useAppStore()
  const [activeTab, setActiveTab] = useState('usages')
  const [usageDialogOpen, setUsageDialogOpen] = useState(false)
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false)
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false)

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['projects-list'],
    queryFn: async () => { const r = await fetch('/api/projects/list'); if (!r.ok) return []; return r.json() },
  })

  const { data: usages = [], isLoading: loadingUsages } = useQuery<EquipmentUsage[]>({
    queryKey: ['equipment-usages', equipment.id],
    queryFn: async () => {
      const r = await fetch(`/api/equipment/usages?equipmentId=${equipment.id}`)
      if (!r.ok) throw new Error(); return r.json()
    },
  })

  const { data: maintenance = [], isLoading: loadingMaintenance } = useQuery<EquipmentMaintenance[]>({
    queryKey: ['equipment-maintenance', equipment.id],
    queryFn: async () => {
      const r = await fetch(`/api/equipment/maintenance?equipmentId=${equipment.id}`)
      if (!r.ok) throw new Error(); return r.json()
    },
  })

  const { data: fuelLogs = [], isLoading: loadingFuel } = useQuery<EquipmentFuelLog[]>({
    queryKey: ['equipment-fuel', equipment.id],
    queryFn: async () => {
      const r = await fetch(`/api/equipment/fuel?equipmentId=${equipment.id}`)
      if (!r.ok) throw new Error(); return r.json()
    },
  })

  const totalUsageCost = usages.reduce((s, u) => s + u.cost, 0)
  const totalMaintenanceCost = maintenance.reduce((s, m) => s + m.cost, 0)
  const totalFuelCost = fuelLogs.reduce((s, f) => s + f.totalCost, 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div>
          <h2 className="text-xl font-bold">{equipment.name}</h2>
          <p className="text-sm text-muted-foreground">{equipment.code} {equipment.model ? `| ${equipment.model}` : ''}</p>
        </div>
        <div className="mr-auto"><StatusBadge status={equipment.status} lang={lang} /></div>
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
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-600">{lang === 'ar' ? 'الأجر بالساعة / اليومي' : 'Hourly / Daily'}</p>
            <p className="text-sm font-bold text-gray-700">{formatSAR(equipment.hourlyRate, lang)} / {formatSAR(equipment.dailyRate, lang)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="usages" className="gap-1"><Clock className="size-3.5" /> {lang === 'ar' ? 'الاستخدام' : 'Usages'}</TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-1"><Wrench className="size-3.5" /> {lang === 'ar' ? 'الصيانة' : 'Maintenance'}</TabsTrigger>
          <TabsTrigger value="fuel" className="gap-1"><Fuel className="size-3.5" /> {lang === 'ar' ? 'الوقود' : 'Fuel'}</TabsTrigger>
        </TabsList>

        <TabsContent value="usages" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setUsageDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'سجل استخدام' : 'Add Usage'}
            </Button>
          </div>
          {loadingUsages ? <TableSkeleton /> : usages.length === 0 ? (
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

        <TabsContent value="maintenance" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setMaintenanceDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'سجل صيانة' : 'Add Maintenance'}
            </Button>
          </div>
          {loadingMaintenance ? <TableSkeleton /> : maintenance.length === 0 ? (
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

        <TabsContent value="fuel" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setFuelDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'سجل وقود' : 'Add Fuel'}
            </Button>
          </div>
          {loadingFuel ? <TableSkeleton /> : fuelLogs.length === 0 ? (
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
      </Tabs>

      {/* Dialogs */}
      <AddUsageDialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen} equipmentId={equipment.id} projects={projects} />
      <AddMaintenanceDialog open={maintenanceDialogOpen} onOpenChange={setMaintenanceDialogOpen} equipmentId={equipment.id} />
      <AddFuelDialog open={fuelDialogOpen} onOpenChange={setFuelDialogOpen} equipmentId={equipment.id} projects={projects} />
    </div>
  )
}

// ============ Main Equipment Module ============
export function EquipmentModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)

  const { data: equipment = [], isLoading, isError, refetch } = useQuery<Equipment[]>({
    queryKey: ['equipment'],
    queryFn: async () => {
      const res = await fetch('/api/equipment')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const filtered = equipment.filter(eq => {
    if (!search) return true
    return eq.name.toLowerCase().includes(search.toLowerCase()) ||
      eq.code.toLowerCase().includes(search.toLowerCase()) ||
      (eq.type || '').toLowerCase().includes(search.toLowerCase())
  })

  // Summary
  const total = equipment.length
  const available = equipment.filter(e => e.status === 'AVAILABLE').length
  const inUse = equipment.filter(e => e.status === 'IN_USE').length
  const maintenanceCount = equipment.filter(e => e.status === 'MAINTENANCE').length

  if (selectedEquipment) {
    return <EquipmentDetailView equipment={selectedEquipment} onBack={() => setSelectedEquipment(null)} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'المعدات' : 'Equipment'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة معدات المشاريع' : 'Manage project equipment'}</p>
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
              <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي المعدات' : 'Total Equipment'}</p>
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
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Clock className="size-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-600">{lang === 'ar' ? 'قيد الاستخدام' : 'In Use'}</p>
              <p className="text-xl font-bold text-blue-700">{formatNumber(inUse)}</p>
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
            <Input placeholder={lang === 'ar' ? 'بحث بالاسم أو الكود أو النوع...' : 'Search by name, code, or type...'} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
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
                    <TableHead className="text-right">{lang === 'ar' ? 'الموديل' : 'Model'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الأجر بالساعة' : 'Hourly Rate'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الأجر اليومي' : 'Daily Rate'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(eq => (
                    <TableRow key={eq.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setSelectedEquipment(eq)}>
                      <TableCell className="font-mono text-sm">{eq.code}</TableCell>
                      <TableCell className="font-medium">{eq.name}</TableCell>
                      <TableCell>{eq.type || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{eq.model || '—'}</TableCell>
                      <TableCell><StatusBadge status={eq.status} lang={lang} /></TableCell>
                      <TableCell className="text-emerald-700">{formatSAR(eq.hourlyRate, lang)}</TableCell>
                      <TableCell className="text-emerald-700">{formatSAR(eq.dailyRate, lang)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewEquipmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

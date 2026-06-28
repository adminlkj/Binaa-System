'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Plus, Search, Eye, Pencil, Trash2, ArrowRight,
  FileText, ClipboardList, TrendingUp, Calculator, RefreshCw,
  Truck, Users, Clock, Fuel, Wrench, Package, Receipt,
  DollarSign, AlertTriangle, ChevronLeft, ChevronDown,
  CircleDot, ArrowDown, User, HardHat, Cog, CreditCard,
  BookOpen, BarChart3, Link2, Shield,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore, formatSAR as storeFormatSAR, formatDate as storeFormatDate, formatNumber, CONSTRUCTION_WORKFLOW } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { PrintButton } from '@/components/shared/print-button'
import { ModuleLayout } from '@/components/shared/module-layout'

// ============ Types ============
interface Client { id: string; code: string; name: string }
interface Branch { id: string; code: string; name: string }
interface ContractSummary { id: string; contractNo: string; totalValue: number; status: string }
interface ProjectListItem {
  id: string; code: string; name: string; nameAr: string | null; location: string | null
  startDate: string; endDate: string | null; status: string; description: string | null
  projectType: string; contractValue: number
  client: { id: string; name: string; code: string }
  branch: { id: string; name: string; code: string }
  contracts: ContractSummary[]
  _count: { boqItems: number; progressClaims: number }
}

interface BOQItem {
  id: string; code: string; description: string; unit: string
  quantity: number; unitPrice: number; totalPrice: number; category: string | null
}

interface ProgressClaimItem {
  id: string; claimNo: string; date: string; percentage: number; amount: number
  vatAmount: number; totalAmount: number; status: string
  contract: { contractNo: string; id: string }
}

interface ClientPayment {
  id: string; amount: number; date: string; reference: string | null; notes: string | null
}

interface SalesInvoiceItem {
  id: string; invoiceNo: string; date: string; dueDate: string; subtotal: number
  vatAmount: number; totalAmount: number; paidAmount: number; status: string
  sourceType: string; invoiceType: string
  client: { id: string; name: string; code: string }
  progressClaim: { claimNo: string; id: string } | null
  timesheet: { id: string; operatingHours: number } | null
  clientPayments: ClientPayment[]
}

interface PurchaseInvoiceItem {
  id: string; invoiceNo: string; date: string; totalAmount: number; status: string
  supplierInvoiceNo: string | null
  supplier: { id: string; name: string; code: string }
  goodsReceipt: { receiptNo: string; id: string } | null
}

interface ExpenseItem {
  id: string; category: string; description: string; amount: number
  vatAmount: number; totalAmount: number; date: string; expenseType: string
}

interface LaborCostItem {
  id: string; description: string; workers: number; days: number
  dailyRate: number; totalAmount: number; date: string
}

interface EquipmentCostItem {
  id: string; description: string; amount: number; date: string
}

interface EquipmentUsageItem {
  id: string; date: string; hours: number; cost: number; description: string | null
  equipment: { id: string; name: string; code: string }
}

interface SubcontractorInvoiceItem {
  id: string; invoiceNo: string; date: string; amount: number
  vatAmount: number; totalAmount: number; status: string; description: string | null
  subcontractor: { id: string; name: string; code: string }
}

interface EquipmentOperationItem {
  id: string; date: string; hours: number; notes: string | null
  equipment: { id: string; name: string; code: string }
  operator: { id: string; name: string; code: string } | null
}

interface FuelLogItem {
  id: string; date: string; liters: number; costPerLiter: number; totalCost: number
  equipment: { id: string; name: string; code: string }
}

interface TimesheetItem {
  id: string; month: number; year: number; operatingHours: number; status: string
  equipment: { id: string; name: string; code: string }
  rental: { id: string; rateType: string; rate: number } | null
}

interface WorkTeamItem {
  id: string; code: string; name: string; specialty: string | null; isActive: boolean
  members: { id: string; role: string | null; isLeader: boolean; employee: { id: string; name: string; code: string } }[]
}

interface ResourceAllocationItem {
  id: string; resourceType: string; resourceId: string; startDate: string; endDate: string | null; notes: string | null
}

interface CostSheet {
  contractValue: number; revenue: number; serviceInvoices: number; totalRevenue: number
  purchases: number; subcontractors: number; labor: number; equipment: number
  expenses: number; totalCosts: number; profit: number; profitMargin: number
}

interface WorkflowCounts {
  clients: number; projects: number; contracts: number; boq: number
  workHours: number; expenses: number; subcontractors: number; purchases: number
  extracts: number; invoice: number; collection: number; accounting: number
}

interface ProjectDetail extends Omit<ProjectListItem, 'contracts' | '_count'> {
  contractValue: number
  contracts: (ContractSummary & { progressClaims: ProgressClaimItem[] })[]
  boqItems: BOQItem[]
  progressClaims: ProgressClaimItem[]
  salesInvoices: SalesInvoiceItem[]
  purchaseOrders: { id: string; orderNo: string; totalAmount: number; status: string; date: string; supplier: { id: string; name: string } }[]
  purchaseInvoices: PurchaseInvoiceItem[]
  expenses: ExpenseItem[]
  laborCosts: LaborCostItem[]
  equipmentCosts: EquipmentCostItem[]
  equipmentUsages: EquipmentUsageItem[]
  subcontractorInvoices: SubcontractorInvoiceItem[]
  goodsReceipts: { id: string; receiptNo: string; date: string; status: string; supplier: { id: string; name: string }; purchaseOrder: { orderNo: string } }[]
  timesheets: TimesheetItem[]
  workTeams: WorkTeamItem[]
  fuelLogs: FuelLogItem[]
  equipmentOperations: EquipmentOperationItem[]
  resourceAllocations: ResourceAllocationItem[]
  costSheet: CostSheet
  workflowCounts: WorkflowCounts
}

// ============ Format Helpers ============
function formatSAR(value: number, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatSAR(value, lang)
}

function formatDate(dateStr: string | null, lang: 'ar' | 'en' = 'ar'): string {
  if (!dateStr) return '—'
  return storeFormatDate(dateStr, lang)
}

// ============ Status Configs ============
const statusLabels: Record<string, string> = {
  PLANNING: 'تخطيط', ACTIVE: 'نشط', ON_HOLD: 'معلق', COMPLETED: 'مكتمل', CANCELLED: 'ملغي',
}
const statusColors: Record<string, string> = {
  PLANNING: 'bg-amber-100 text-amber-700 border-amber-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ON_HOLD: 'bg-orange-100 text-orange-700 border-orange-200',
  COMPLETED: 'bg-teal-100 text-teal-700 border-teal-200',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
}

const contractStatusLabels: Record<string, string> = {
  DRAFT: 'مسودة', ACTIVE: 'نشط', EXPIRED: 'منتهي', TERMINATED: 'ملغي',
}
const contractStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EXPIRED: 'bg-amber-100 text-amber-700 border-amber-200',
  TERMINATED: 'bg-rose-100 text-rose-700 border-rose-200',
}

const claimStatusLabels: Record<string, string> = {
  DRAFT: 'مسودة', SUBMITTED: 'مقدم', APPROVED: 'معتمد',
  PARTIALLY_PAID: 'مدفوع جزئياً', PAID: 'مدفوع', REJECTED: 'مرفوض',
}
const claimStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SUBMITTED: 'bg-blue-100 text-blue-700 border-blue-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  PAID: 'bg-teal-100 text-teal-700 border-teal-200',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
}

const invoiceStatusLabels: Record<string, string> = {
  DRAFT: 'مسودة', SENT: 'مرسلة', PARTIALLY_PAID: 'مدفوعة جزئياً',
  PAID: 'مدفوعة', OVERDUE: 'متأخرة', CANCELLED: 'ملغاة',
}
const invoiceStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SENT: 'bg-blue-100 text-blue-700 border-blue-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  OVERDUE: 'bg-rose-100 text-rose-700 border-rose-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
}

const expenseCategoryLabels: Record<string, string> = {
  RENT: 'إيجار', MAINTENANCE: 'صيانة', TRANSPORT: 'نقل', DELIVERY: 'توصيل',
  CONSUMABLES: 'مستهلكات', SERVICES: 'خدمات', INSURANCE: 'تأمين', FUEL: 'وقود',
  PERMITS: 'تراخيص', OFFICE: 'مكتبية', HOSPITALITY: 'ضيافة', OTHER: 'أخرى',
  SALARIES: 'رواتب', INTERNET: 'إنترنت', ELECTRICITY: 'كهرباء', WATER: 'مياه',
  MANAGEMENT_CARS: 'سيارات إدارية', DRIVERS: 'سائقون',
}

// ============ Skeleton ============
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

// ============ Project Form Dialog ============
interface ProjectFormData {
  code: string; name: string; nameAr: string; clientId: string; branchId: string
  location: string; startDate: string; endDate: string; status: string; description: string
  contractValue: string; projectType: string
}

function ProjectFormDialog({
  open, onOpenChange, editingProject, clients, branches,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  editingProject: ProjectListItem | null
  clients: Client[]; branches: Branch[]
}) {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const isEdit = !!editingProject

  const [form, setForm] = useState<ProjectFormData>({
    code: '', name: '', nameAr: '', clientId: '', branchId: '',
    location: '', startDate: '', endDate: '', status: 'PLANNING', description: '',
    contractValue: '', projectType: 'CONSTRUCTION',
  })

  React.useEffect(() => {
    if (open) {
      if (editingProject) {
        setForm({
          code: editingProject.code,
          name: editingProject.name,
          nameAr: editingProject.nameAr || '',
          clientId: editingProject.client.id,
          branchId: editingProject.branch.id,
          location: editingProject.location || '',
          startDate: editingProject.startDate ? new Date(editingProject.startDate).toISOString().split('T')[0] : '',
          endDate: editingProject.endDate ? new Date(editingProject.endDate).toISOString().split('T')[0] : '',
          status: editingProject.status,
          description: editingProject.description || '',
          contractValue: editingProject.contractValue ? String(editingProject.contractValue) : '',
          projectType: editingProject.projectType || 'CONSTRUCTION',
        })
      } else {
        setForm({ code: '', name: '', nameAr: '', clientId: '', branchId: '', location: '', startDate: '', endDate: '', status: 'PLANNING', description: '', contractValue: '', projectType: 'CONSTRUCTION' })
      }
    }
  }, [open, editingProject])

  const createMutation = useMutation({
    mutationFn: (data: ProjectFormData) =>
      fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['projects'] }); onOpenChange(false) },
  })

  const updateMutation = useMutation({
    mutationFn: (data: ProjectFormData) =>
      fetch(`/api/projects/${editingProject?.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['projects'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isEdit) updateMutation.mutate(form)
    else createMutation.mutate(form)
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? (isEdit ? 'تعديل المشروع' : 'مشروع جديد') : (isEdit ? 'Edit Project' : 'New Project')}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? (isEdit ? 'تعديل بيانات المشروع' : 'إضافة مشروع جديد للنظام') : (isEdit ? 'Edit project details' : 'Add a new project to the system')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Type Selector */}
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'نوع المشروع' : 'Project Type'}</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, projectType: 'CONSTRUCTION' }))}
                className={`flex items-center gap-3 rounded-lg border-2 p-4 transition-all ${
                  form.projectType === 'CONSTRUCTION'
                    ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className={`flex size-10 items-center justify-center rounded-lg ${
                  form.projectType === 'CONSTRUCTION' ? 'bg-emerald-100' : 'bg-gray-100'
                }`}>
                  <Building2 className={`size-5 ${form.projectType === 'CONSTRUCTION' ? 'text-emerald-600' : 'text-gray-400'}`} />
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${form.projectType === 'CONSTRUCTION' ? 'text-emerald-700' : 'text-gray-700'}`}>
                    {lang === 'ar' ? 'مشروع تنفيذي' : 'Construction'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {lang === 'ar' ? 'مشروع تنفيذي' : 'Construction Project'}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, projectType: 'EQUIPMENT_RENTAL' }))}
                className={`flex items-center gap-3 rounded-lg border-2 p-4 transition-all ${
                  form.projectType === 'EQUIPMENT_RENTAL'
                    ? 'border-cyan-500 bg-cyan-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className={`flex size-10 items-center justify-center rounded-lg ${
                  form.projectType === 'EQUIPMENT_RENTAL' ? 'bg-cyan-100' : 'bg-gray-100'
                }`}>
                  <Truck className={`size-5 ${form.projectType === 'EQUIPMENT_RENTAL' ? 'text-cyan-600' : 'text-gray-400'}`} />
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${form.projectType === 'EQUIPMENT_RENTAL' ? 'text-cyan-700' : 'text-gray-700'}`}>
                    {lang === 'ar' ? 'مشروع تأجير معدات' : 'Equipment Rental'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {lang === 'ar' ? 'مشروع تأجير معدات' : 'Equipment Rental Project'}
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">كود المشروع *</Label>
              <Input id="code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="PRJ-004" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">اسم المشروع *</Label>
              <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المشروع" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameAr">الاسم بالعربي</Label>
              <Input id="nameAr" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="الاسم بالعربي" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">الموقع</Label>
              <Input id="location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="المدينة - الحي" />
            </div>
            <div className="space-y-2">
              <Label>العميل *</Label>
              <Select value={form.clientId} onValueChange={v => setForm(f => ({ ...f, clientId: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الفرع *</Label>
              <Select value={form.branchId} onValueChange={v => setForm(f => ({ ...f, branchId: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">تاريخ البدء *</Label>
              <Input id="startDate" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">تاريخ الانتهاء</Label>
              <Input id="endDate" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractValue">قيمة العقد</Label>
              <Input id="contractValue" type="number" min="0" step="0.01" value={form.contractValue} onChange={e => setForm(f => ({ ...f, contractValue: e.target.value }))} placeholder="0.00" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLANNING">تخطيط</SelectItem>
                  <SelectItem value="ACTIVE">نشط</SelectItem>
                  <SelectItem value="ON_HOLD">معلق</SelectItem>
                  <SelectItem value="COMPLETED">مكتمل</SelectItem>
                  <SelectItem value="CANCELLED">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea id="description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف المشروع" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700">
              {isLoading ? 'جاري الحفظ...' : isEdit ? 'تحديث' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Workflow Chain Step Icon Map ============
const workflowStepIcons: Record<string, React.ReactNode> = {
  'clients': <User className="size-4" />,
  'projects': <Building2 className="size-4" />,
  'contracts': <FileText className="size-4" />,
  'boq': <ClipboardList className="size-4" />,
  'work-hours': <Clock className="size-4" />,
  'expenses': <Receipt className="size-4" />,
  'subcontractors': <HardHat className="size-4" />,
  'purchases': <Package className="size-4" />,
  'extracts': <TrendingUp className="size-4" />,
  'invoice': <DollarSign className="size-4" />,
  'collection': <CreditCard className="size-4" />,
  'accounting': <BookOpen className="size-4" />,
  'reports': <BarChart3 className="size-4" />,
}

// ============ Cost Sheet Component (كرت المشروع) ============
function CostSheetView({ costSheet, projectName, lang }: { costSheet: CostSheet; projectName: string; lang: 'ar' | 'en' }) {
  const isProfit = costSheet.profit >= 0
  const profitColor = isProfit ? 'text-emerald-600' : 'text-rose-600'
  const profitBg = isProfit ? 'bg-emerald-50' : 'bg-rose-50'

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const revenueRows = [
    { label: t('قيمة العقد', 'Contract Value'), value: costSheet.contractValue, color: 'text-emerald-700' },
    { label: t('إجمالي المستخلصات', 'Total Progress Claims'), value: costSheet.revenue, color: 'text-emerald-600' },
    { label: t('فواتير الخدمة', 'Service Invoices'), value: costSheet.serviceInvoices, color: 'text-teal-600' },
  ]

  const costRows = [
    { label: t('المشتريات', 'Purchases'), value: costSheet.purchases, color: 'text-rose-600', icon: <Package className="size-3.5" /> },
    { label: t('مصروفات المشروع', 'Project Expenses'), value: costSheet.expenses, color: 'text-rose-600', icon: <Receipt className="size-3.5" /> },
    { label: t('مقاولو الباطن', 'Subcontractors'), value: costSheet.subcontractors, color: 'text-orange-600', icon: <HardHat className="size-3.5" /> },
    { label: t('تكاليف العمالة', 'Labor Costs'), value: costSheet.labor, color: 'text-amber-600', icon: <Users className="size-3.5" /> },
    { label: t('تكاليف المعدات', 'Equipment Costs'), value: costSheet.equipment, color: 'text-cyan-600', icon: <Cog className="size-3.5" /> },
  ]

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-l from-emerald-700 to-emerald-800 rounded-t-lg px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white/20">
            <Calculator className="size-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{t('كرت المشروع', 'Project Card')}</h3>
            <p className="text-sm text-emerald-200">{projectName}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="border-x border-b rounded-b-lg border-gray-200 overflow-hidden">
        {/* Revenue Section */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-3">
            {t('الإيرادات', 'Revenue')}
          </p>
          {revenueRows.map((row, idx) => (
            <div key={idx} className={`flex items-center justify-between py-2.5 ${idx < revenueRows.length - 1 ? 'border-b border-dashed border-gray-100' : ''}`}>
              <span className="text-sm font-medium text-gray-700">{row.label}</span>
              <span className={row.color}>
                <MoneyDisplay value={row.value} mode="system" lang={lang} bold size="md" />
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2.5 bg-emerald-50/50 -mx-6 px-6 mt-1">
            <span className="text-sm font-bold text-emerald-800">{t('إجمالي الإيرادات', 'Total Revenue')}</span>
            <span className="text-emerald-700">
              <MoneyDisplay value={costSheet.totalRevenue} mode="system" lang={lang} bold size="lg" />
            </span>
          </div>
        </div>

        <div className="mx-6 border-t-2 border-emerald-200" />

        {/* Costs Section */}
        <div className="px-6 pt-3 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 mb-3">
            {t('التكاليف', 'Costs')}
          </p>
          {costRows.map((row, idx) => (
            <div key={idx} className={`flex items-center justify-between py-2.5 ${idx < costRows.length - 1 ? 'border-b border-dashed border-gray-100' : ''}`}>
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <span className="text-gray-400">{row.icon}</span>
                {row.label}
              </span>
              <span className={row.color}>
                <MoneyDisplay value={row.value} mode="system" lang={lang} bold size="md" />
              </span>
            </div>
          ))}
        </div>

        {/* Total Costs */}
        <div className="mx-6 border-t-2 border-rose-200" />
        <div className="px-6 py-3 bg-rose-50/50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800">{t('إجمالي التكلفة', 'Total Cost')}</span>
            <span className="text-rose-700">
              <MoneyDisplay value={costSheet.totalCosts} mode="system" lang={lang} bold size="lg" />
            </span>
          </div>
        </div>

        <div className="mx-6 border-t-2 border-gray-200" />

        {/* Profit Section */}
        <div className={`px-6 py-4 ${profitBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex size-12 items-center justify-center rounded-full ${isProfit ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                <TrendingUp className={`size-6 ${profitColor}`} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">{t('الربح / الخسارة', 'Profit / Loss')}</p>
                <span className={profitColor}>
                  <MoneyDisplay value={costSheet.profit} mode="system" lang={lang} bold size="xl" />
                </span>
              </div>
            </div>
            <div className={`text-center rounded-xl px-6 py-3 ${isProfit ? 'bg-emerald-100' : 'bg-rose-100'}`}>
              <p className="text-xs font-medium text-gray-500 mb-1">{t('هامش الربح', 'Profit Margin')}</p>
              <p className={`text-3xl font-bold ${profitColor}`}>
                {Math.abs(costSheet.profitMargin ?? 0).toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ Workflow Chain Component (سلسلة العمل) ============
function WorkflowChainView({ project, lang }: { project: ProjectDetail; lang: 'ar' | 'en' }) {
  const { setActiveItem } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const steps = CONSTRUCTION_WORKFLOW.map((wf, idx) => {
    const count = project.workflowCounts[wf.step as keyof WorkflowCounts] || 0
    const hasData = count > 0
    const isSkipped = !hasData && idx > 1 // Client and Project always have data
    // Check if previous step has data but this one doesn't
    const prevCount = idx > 0 ? project.workflowCounts[CONSTRUCTION_WORKFLOW[idx - 1].step as keyof WorkflowCounts] || 0 : 1
    const isWarning = prevCount > 0 && !hasData && idx > 2

    return {
      ...wf,
      count,
      hasData,
      isSkipped,
      isWarning,
      stepIndex: idx,
    }
  })

  const handleNavigate = (navItem: string) => {
    setActiveItem(navItem as 'projects' | 'contracts' | 'boq' | 'extracts' | 'sales' | 'client-payments' | 'expenses' | 'subcontractors' | 'purchase-requests' | 'attendance' | 'accounting' | 'reports' | 'clients')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100">
          <Link2 className="size-5 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{t('سلسلة العمل', 'Workflow Chain')}</h3>
          <p className="text-sm text-muted-foreground">{t('الخطوات المتسلسلة لمشروع المقاولات', 'Sequential steps for construction project')}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded-full bg-emerald-500" />
          <span className="text-gray-600">{t('بيانات موجودة', 'Has data')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded-full bg-gray-300" />
          <span className="text-gray-600">{t('لا توجد بيانات', 'No data')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded-full bg-amber-500" />
          <span className="text-gray-600">{t('تنبيه: خطوة مفقودة', 'Warning: Missing step')}</span>
        </div>
      </div>

      {/* Workflow Steps - Vertical chain */}
      <div className="space-y-0">
        {steps.map((step, idx) => (
          <div key={step.step} className="relative">
            {/* Connector line */}
            {idx > 0 && (
              <div className={`absolute right-5 top-0 w-0.5 h-4 ${
                step.hasData ? 'bg-emerald-300' : 'bg-gray-200'
              }`} />
            )}
            <button
              onClick={() => handleNavigate(step.navItem)}
              className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-all hover:shadow-sm ${
                step.hasData
                  ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
                  : step.isWarning
                    ? 'border-amber-200 bg-amber-50/50 hover:bg-amber-50'
                    : 'border-gray-200 bg-gray-50/50 hover:bg-gray-50'
              }`}
            >
              {/* Step indicator */}
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${
                step.hasData
                  ? 'border-emerald-500 bg-emerald-100 text-emerald-600'
                  : step.isWarning
                    ? 'border-amber-500 bg-amber-100 text-amber-600'
                    : 'border-gray-300 bg-gray-100 text-gray-400'
              }`}>
                {workflowStepIcons[step.step] || <CircleDot className="size-4" />}
              </div>

              {/* Step info */}
              <div className="flex-1 text-right">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${
                    step.hasData ? 'text-emerald-700' : step.isWarning ? 'text-amber-700' : 'text-gray-500'
                  }`}>
                    {lang === 'ar' ? step.label.ar : step.label.en}
                  </span>
                  {step.isWarning && (
                    <span className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="size-3" />
                      {t('مفقود', 'Missing')}
                    </span>
                  )}
                </div>
                <span className={`text-xs ${step.hasData ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {step.hasData
                    ? t(`${step.count} سجل`, `${step.count} record${step.count !== 1 ? 's' : ''}`)
                    : t('لا توجد بيانات', 'No data')
                  }
                </span>
              </div>

              {/* Count badge */}
              <div className={`flex size-8 items-center justify-center rounded-full text-xs font-bold ${
                step.hasData
                  ? 'bg-emerald-200 text-emerald-700'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {step.count}
              </div>

              {/* Navigate icon */}
              <ChevronLeft className="size-4 text-gray-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ Costs Tab Component (التكاليف) ============
function CostsTab({ project, lang }: { project: ProjectDetail; lang: 'ar' | 'en' }) {
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const purchaseTotal = project.purchaseInvoices.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0)
  const expenseTotal = project.expenses.reduce((s, e) => s + (Number(e.totalAmount) || 0), 0)
  const laborTotal = project.laborCosts.reduce((s, l) => s + (Number(l.totalAmount) || 0), 0)
  const equipmentTotal = project.equipmentCosts.reduce((s, e) => s + (Number(e.amount) || 0), 0) +
    project.equipmentUsages.reduce((s, e) => s + (Number(e.cost || 0)), 0)
  const subcontractorTotal = project.subcontractorInvoices.reduce((s, si) => s + (Number(si.totalAmount) || 0), 0)

  const categories = [
    { key: 'purchases', label: t('فواتير المشتريات', 'Purchase Invoices'), count: project.purchaseInvoices.length, total: purchaseTotal, color: 'bg-rose-50 border-rose-200', badge: 'bg-rose-100 text-rose-700' },
    { key: 'expenses', label: t('المصروفات', 'Expenses'), count: project.expenses.length, total: expenseTotal, color: 'bg-orange-50 border-orange-200', badge: 'bg-orange-100 text-orange-700' },
    { key: 'labor', label: t('تكاليف العمالة', 'Labor Costs'), count: project.laborCosts.length, total: laborTotal, color: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700' },
    { key: 'equipment', label: t('تكاليف المعدات', 'Equipment Costs'), count: project.equipmentCosts.length + project.equipmentUsages.length, total: equipmentTotal, color: 'bg-cyan-50 border-cyan-200', badge: 'bg-cyan-100 text-cyan-700' },
    { key: 'subcontractors', label: t('مقاولو الباطن', 'Subcontractors'), count: project.subcontractorInvoices.length, total: subcontractorTotal, color: 'bg-violet-50 border-violet-200', badge: 'bg-violet-100 text-violet-700' },
  ]

  const grandTotal = purchaseTotal + expenseTotal + laborTotal + equipmentTotal + subcontractorTotal

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {categories.map(cat => (
          <Card key={cat.key} className={`${cat.color} border`}>
            <CardContent className="p-3">
              <p className="text-xs font-medium text-gray-600 mb-1">{cat.label}</p>
              <p className="text-sm font-bold">
                <MoneyDisplay value={cat.total} mode="system" lang={lang} bold size="sm" />
              </p>
              <Badge className={`${cat.badge} text-[10px] mt-1`}>{cat.count} {t('سجل', 'records')}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Grand Total */}
      <Card className="border-2 border-gray-300">
        <CardContent className="p-4 flex items-center justify-between">
          <span className="text-base font-bold text-gray-800">{t('إجمالي التكاليف', 'Total Costs')}</span>
          <span className="text-rose-700">
            <MoneyDisplay value={grandTotal} mode="system" lang={lang} bold size="xl" />
          </span>
        </CardContent>
      </Card>

      {/* Purchase Invoices Table */}
      {project.purchaseInvoices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="size-4 text-rose-600" />
              {t('فواتير المشتريات', 'Purchase Invoices')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No')}</TableHead>
                  <TableHead className="text-right">{t('المورد', 'Supplier')}</TableHead>
                  <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                  <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
                  <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.purchaseInvoices.map(pi => (
                  <TableRow key={pi.id}>
                    <TableCell className="font-medium">{pi.invoiceNo}</TableCell>
                    <TableCell>{pi.supplier.name}</TableCell>
                    <TableCell>{formatDate(pi.date, lang)}</TableCell>
                    <TableCell><MoneyDisplay value={pi.totalAmount} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={invoiceStatusColors[pi.status] || 'bg-gray-100 text-gray-600'}>
                        {invoiceStatusLabels[pi.status] || pi.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-rose-50 font-bold">
                  <TableCell colSpan={3}>{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell><MoneyDisplay value={purchaseTotal} mode="system" lang={lang} bold size="sm" /></TableCell>
                  <TableCell />
                </TableRow>
              </TableBody></Table>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Expenses Table */}
      {project.expenses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="size-4 text-orange-600" />
              {t('المصروفات', 'Expenses')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('الفئة', 'Category')}</TableHead>
                  <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                  <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                  <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
                  <TableHead className="text-right">{t('الضريبة', 'VAT')}</TableHead>
                  <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.expenses.map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell>
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 text-[10px]">
                        {expenseCategoryLabels[exp.category] || exp.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{exp.description}</TableCell>
                    <TableCell>{formatDate(exp.date, lang)}</TableCell>
                    <TableCell><MoneyDisplay value={exp.amount} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={exp.vatAmount} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={exp.totalAmount} mode="system" lang={lang} bold size="sm" /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-orange-50 font-bold">
                  <TableCell colSpan={3}>{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell><MoneyDisplay value={project.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)} mode="system" lang={lang} bold size="sm" /></TableCell>
                  <TableCell><MoneyDisplay value={project.expenses.reduce((s, e) => s + Number(e.vatAmount || 0), 0)} mode="system" lang={lang} bold size="sm" /></TableCell>
                  <TableCell><MoneyDisplay value={expenseTotal} mode="system" lang={lang} bold size="sm" /></TableCell>
                </TableRow>
              </TableBody></Table>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Labor Costs Table */}
      {project.laborCosts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4 text-amber-600" />
              {t('تكاليف العمالة', 'Labor Costs')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                  <TableHead className="text-right">{t('العمال', 'Workers')}</TableHead>
                  <TableHead className="text-right">{t('الأيام', 'Days')}</TableHead>
                  <TableHead className="text-right">{t('اليومية', 'Daily Rate')}</TableHead>
                  <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                  <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.laborCosts.map(lc => (
                  <TableRow key={lc.id}>
                    <TableCell>{lc.description}</TableCell>
                    <TableCell>{lc.workers}</TableCell>
                    <TableCell>{lc.days}</TableCell>
                    <TableCell><MoneyDisplay value={lc.dailyRate} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={lc.totalAmount} mode="system" lang={lang} bold size="sm" /></TableCell>
                    <TableCell>{formatDate(lc.date, lang)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-amber-50 font-bold">
                  <TableCell colSpan={4}>{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell><MoneyDisplay value={laborTotal} mode="system" lang={lang} bold size="sm" /></TableCell>
                  <TableCell />
                </TableRow>
              </TableBody></Table>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Equipment Costs */}
      {(project.equipmentCosts.length > 0 || project.equipmentUsages.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Cog className="size-4 text-cyan-600" />
              {t('تكاليف المعدات', 'Equipment Costs')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('النوع', 'Type')}</TableHead>
                  <TableHead className="text-right">{t('المعدة', 'Equipment')}</TableHead>
                  <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                  <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                  <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.equipmentUsages.map(eu => (
                  <TableRow key={`u-${eu.id}`}>
                    <TableCell><Badge className="bg-cyan-100 text-cyan-700 text-[10px]">{t('استخدام', 'Usage')}</Badge></TableCell>
                    <TableCell>{eu.equipment.name}</TableCell>
                    <TableCell>{eu.description || `${eu.hours} ${t('ساعات', 'hours')}`}</TableCell>
                    <TableCell>{formatDate(eu.date, lang)}</TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={eu.cost} mode="system" lang={lang} bold size="sm" /></TableCell>
                  </TableRow>
                ))}
                {project.equipmentCosts.map(ec => (
                  <TableRow key={`c-${ec.id}`}>
                    <TableCell><Badge className="bg-teal-100 text-teal-700 text-[10px]">{t('تكلفة', 'Cost')}</Badge></TableCell>
                    <TableCell>—</TableCell>
                    <TableCell>{ec.description}</TableCell>
                    <TableCell>{formatDate(ec.date, lang)}</TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={ec.amount} mode="system" lang={lang} bold size="sm" /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-cyan-50 font-bold">
                  <TableCell colSpan={4}>{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell><MoneyDisplay value={equipmentTotal} mode="system" lang={lang} bold size="sm" /></TableCell>
                </TableRow>
              </TableBody></Table>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Subcontractor Invoices */}
      {project.subcontractorInvoices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <HardHat className="size-4 text-violet-600" />
              {t('فواتير مقاولي الباطن', 'Subcontractor Invoices')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No')}</TableHead>
                  <TableHead className="text-right">{t('المقاول', 'Subcontractor')}</TableHead>
                  <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                  <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
                  <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.subcontractorInvoices.map(si => (
                  <TableRow key={si.id}>
                    <TableCell className="font-medium">{si.invoiceNo}</TableCell>
                    <TableCell>{si.subcontractor.name}</TableCell>
                    <TableCell>{formatDate(si.date, lang)}</TableCell>
                    <TableCell><MoneyDisplay value={si.totalAmount} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={invoiceStatusColors[si.status] || 'bg-gray-100 text-gray-600'}>
                        {invoiceStatusLabels[si.status] || si.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-violet-50 font-bold">
                  <TableCell colSpan={3}>{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell><MoneyDisplay value={subcontractorTotal} mode="system" lang={lang} bold size="sm" /></TableCell>
                  <TableCell />
                </TableRow>
              </TableBody></Table>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {grandTotal === 0 && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Receipt className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('لا توجد تكاليف مسجلة لهذا المشروع', 'No costs recorded for this project')}</p>
        </div>
      )}
    </div>
  )
}

// ============ Revenue Tab Component (الإيرادات) ============
function RevenueTab({ project, lang }: { project: ProjectDetail; lang: 'ar' | 'en' }) {
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const extractsTotal = project.progressClaims.reduce((s, c) => s + (Number(c.totalAmount) || 0), 0)
  const invoicesTotal = project.salesInvoices.reduce((s, si) => s + (Number(si.totalAmount) || 0), 0)
  const paidTotal = project.salesInvoices.reduce((s, si) => s + (Number(si.paidAmount || 0)), 0)
  const collectionsTotal = project.salesInvoices.reduce((s, si) =>
    s + si.clientPayments.reduce((ps, cp) => ps + (Number(cp.amount) || 0), 0), 0)

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-3">
            <p className="text-xs text-gray-600">{t('إجمالي المستخلصات', 'Total Claims')}</p>
            <p className="text-sm font-bold text-emerald-700"><MoneyDisplay value={extractsTotal} mode="system" lang={lang} bold size="sm" /></p>
          </CardContent>
        </Card>
        <Card className="border-teal-200 bg-teal-50/50">
          <CardContent className="p-3">
            <p className="text-xs text-gray-600">{t('إجمالي الفواتير', 'Total Invoices')}</p>
            <p className="text-sm font-bold text-teal-700"><MoneyDisplay value={invoicesTotal} mode="system" lang={lang} bold size="sm" /></p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-3">
            <p className="text-xs text-gray-600">{t('المحصل', 'Collected')}</p>
            <p className="text-sm font-bold text-blue-700"><MoneyDisplay value={paidTotal} mode="system" lang={lang} bold size="sm" /></p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3">
            <p className="text-xs text-gray-600">{t('المتبقي', 'Outstanding')}</p>
            <p className="text-sm font-bold text-amber-700"><MoneyDisplay value={invoicesTotal - paidTotal} mode="system" lang={lang} bold size="sm" /></p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Claims Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald-600" />
            {t('المستخلصات', 'Progress Claims')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {project.progressClaims.length > 0 ? (
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('رقم المستخلص', 'Claim No')}</TableHead>
                  <TableHead className="text-right">{t('العقد', 'Contract')}</TableHead>
                  <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                  <TableHead className="text-right">{t('النسبة', '%')}</TableHead>
                  <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
                  <TableHead className="text-right">{t('الإجمالي', 'Total')}</TableHead>
                  <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.progressClaims.map(cl => (
                  <TableRow key={cl.id}>
                    <TableCell className="font-medium">{cl.claimNo}</TableCell>
                    <TableCell>{cl.contract.contractNo}</TableCell>
                    <TableCell>{formatDate(cl.date, lang)}</TableCell>
                    <TableCell>{cl.percentage}%</TableCell>
                    <TableCell><MoneyDisplay value={cl.amount} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={cl.totalAmount} mode="system" lang={lang} bold size="sm" /></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={claimStatusColors[cl.status]}>
                        {claimStatusLabels[cl.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-emerald-50 font-bold">
                  <TableCell colSpan={4}>{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell><MoneyDisplay value={project.progressClaims.reduce((s, c) => s + (Number(c.amount) || 0), 0)} mode="system" lang={lang} bold size="sm" /></TableCell>
                  <TableCell><MoneyDisplay value={extractsTotal} mode="system" lang={lang} bold size="sm" /></TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table></div>
          ) : (
            <p className="px-6 py-6 text-center text-muted-foreground">{t('لا توجد مستخلصات', 'No claims')}</p>
          )}
        </CardContent>
      </Card>

      {/* Sales Invoices Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="size-4 text-teal-600" />
            {t('فواتير العملاء', 'Client Invoices')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {project.salesInvoices.length > 0 ? (
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('رقم الفاتورة', 'Invoice No')}</TableHead>
                  <TableHead className="text-right">{t('المصدر', 'Source')}</TableHead>
                  <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                  <TableHead className="text-right">{t('المبلغ', 'Amount')}</TableHead>
                  <TableHead className="text-right">{t('المدفوع', 'Paid')}</TableHead>
                  <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.salesInvoices.map(si => (
                  <TableRow key={si.id}>
                    <TableCell className="font-medium">{si.invoiceNo}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${si.sourceType === 'EXTRACT' ? 'bg-teal-100 text-teal-700' : 'bg-purple-100 text-purple-700'}`}>
                        {si.sourceType === 'EXTRACT' ? t('مستخلص', 'Extract') : t('تايم شيت', 'Timesheet')}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(si.date, lang)}</TableCell>
                    <TableCell><MoneyDisplay value={si.totalAmount} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={si.paidAmount} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={invoiceStatusColors[si.status] || 'bg-gray-100'}>
                        {invoiceStatusLabels[si.status] || si.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-teal-50 font-bold">
                  <TableCell colSpan={3}>{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell><MoneyDisplay value={invoicesTotal} mode="system" lang={lang} bold size="sm" /></TableCell>
                  <TableCell><MoneyDisplay value={paidTotal} mode="system" lang={lang} bold size="sm" /></TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table></div>
          ) : (
            <p className="px-6 py-6 text-center text-muted-foreground">{t('لا توجد فواتير', 'No invoices')}</p>
          )}
        </CardContent>
      </Card>

      {/* Collections from Client Payments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="size-4 text-blue-600" />
            {t('التحصيلات', 'Collections')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {collectionsTotal > 0 ? (
            <div className="px-6 py-4">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-gray-700">{t('إجمالي التحصيلات', 'Total Collections')}</span>
                <span className="text-blue-700">
                  <MoneyDisplay value={collectionsTotal} mode="system" lang={lang} bold size="lg" />
                </span>
              </div>
            </div>
          ) : (
            <p className="px-6 py-6 text-center text-muted-foreground">{t('لا توجد تحصيلات', 'No collections')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Resources Tab Component (الموارد) ============
function ResourcesTab({ project, lang }: { project: ProjectDetail; lang: 'ar' | 'en' }) {
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const totalEmployees = project.workTeams.reduce((s, wt) => s + wt.members.length, 0) +
    project.resourceAllocations.filter(ra => ra.resourceType === 'EMPLOYEE').length

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-violet-200 bg-violet-50/50">
          <CardContent className="p-3">
            <p className="text-xs text-gray-600">{t('فرق العمل', 'Work Teams')}</p>
            <p className="text-2xl font-bold text-violet-700">{project.workTeams.length}</p>
            <p className="text-xs text-gray-500">{t(`${totalEmployees} موظف`, `${totalEmployees} employees`)}</p>
          </CardContent>
        </Card>
        <Card className="border-cyan-200 bg-cyan-50/50">
          <CardContent className="p-3">
            <p className="text-xs text-gray-600">{t('المعدات', 'Equipment')}</p>
            <p className="text-2xl font-bold text-cyan-700">{project.equipmentOperations.length + project.equipmentUsages.length}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3">
            <p className="text-xs text-gray-600">{t('ساعات التشغيل', 'Operating Hours')}</p>
            <p className="text-2xl font-bold text-amber-700">{formatNumber(project.equipmentOperations.reduce((s, eo) => s + eo.hours, 0) + project.equipmentUsages.reduce((s, eu) => s + eu.hours, 0))}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="p-3">
            <p className="text-xs text-gray-600">{t('الوقود', 'Fuel')}</p>
            <p className="text-2xl font-bold text-orange-700">{project.fuelLogs.length}</p>
            <p className="text-xs text-gray-500">{formatNumber(project.fuelLogs.reduce((s, f) => s + f.liters, 0))} {t('لتر', 'L')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Work Teams */}
      {project.workTeams.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4 text-violet-600" />
              {t('فرق العمل', 'Work Teams')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              {project.workTeams.map(wt => (
                <div key={wt.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{wt.name}</span>
                      <span className="text-xs text-gray-400">{wt.code}</span>
                      {wt.specialty && <Badge className="bg-violet-100 text-violet-700 text-[10px]">{wt.specialty}</Badge>}
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {wt.members.length} {t('أعضاء', 'members')}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {wt.members.map(m => (
                      <div key={m.id} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                        m.isLeader ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {m.isLeader && <Shield className="size-3" />}
                        {m.employee.name}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Equipment Operations */}
      {project.equipmentOperations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Cog className="size-4 text-cyan-600" />
              {t('تشغيل المعدات', 'Equipment Operations')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('المعدة', 'Equipment')}</TableHead>
                  <TableHead className="text-right">{t('المشغل', 'Operator')}</TableHead>
                  <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                  <TableHead className="text-right">{t('الساعات', 'Hours')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.equipmentOperations.map(eo => (
                  <TableRow key={eo.id}>
                    <TableCell className="font-medium">{eo.equipment.name}</TableCell>
                    <TableCell>{eo.operator?.name || '—'}</TableCell>
                    <TableCell>{formatDate(eo.date, lang)}</TableCell>
                    <TableCell>{eo.hours}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Fuel Logs */}
      {project.fuelLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Fuel className="size-4 text-orange-600" />
              {t('سجل الوقود', 'Fuel Log')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('المعدة', 'Equipment')}</TableHead>
                  <TableHead className="text-right">{t('التاريخ', 'Date')}</TableHead>
                  <TableHead className="text-right">{t('اللترات', 'Liters')}</TableHead>
                  <TableHead className="text-right">{t('سعر اللتر', 'Price/L')}</TableHead>
                  <TableHead className="text-right">{t('التكلفة', 'Cost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.fuelLogs.map(fl => (
                  <TableRow key={fl.id}>
                    <TableCell className="font-medium">{fl.equipment.name}</TableCell>
                    <TableCell>{formatDate(fl.date, lang)}</TableCell>
                    <TableCell>{fl.liters}</TableCell>
                    <TableCell><MoneyDisplay value={fl.costPerLiter} mode="system" lang={lang} size="sm" /></TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={fl.totalCost} mode="system" lang={lang} bold size="sm" /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-orange-50 font-bold">
                  <TableCell colSpan={2}>{t('الإجمالي', 'Total')}</TableCell>
                  <TableCell>{formatNumber(project.fuelLogs.reduce((s, f) => s + f.liters, 0))}</TableCell>
                  <TableCell />
                  <TableCell><MoneyDisplay value={project.fuelLogs.reduce((s, f) => s + (Number(f.totalCost) || 0), 0)} mode="system" lang={lang} bold size="sm" /></TableCell>
                </TableRow>
              </TableBody></Table>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Timesheets */}
      {project.timesheets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="size-4 text-amber-600" />
              {t('ساعات التشغيل', 'Timesheets')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('المعدة', 'Equipment')}</TableHead>
                  <TableHead className="text-right">{t('الشهر', 'Month')}</TableHead>
                  <TableHead className="text-right">{t('ساعات التشغيل', 'Hours')}</TableHead>
                  <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.timesheets.map(ts => (
                  <TableRow key={ts.id}>
                    <TableCell className="font-medium">{ts.equipment.name}</TableCell>
                    <TableCell>{ts.month}/{ts.year}</TableCell>
                    <TableCell>{ts.operatingHours}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={claimStatusColors[ts.status] || 'bg-gray-100'}>
                        {claimStatusLabels[ts.status] || ts.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Resource Allocations */}
      {project.resourceAllocations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4 text-teal-600" />
              {t('توزيع الموارد', 'Resource Allocations')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('نوع المورد', 'Resource Type')}</TableHead>
                  <TableHead className="text-right">{t('تاريخ البدء', 'Start Date')}</TableHead>
                  <TableHead className="text-right">{t('تاريخ الانتهاء', 'End Date')}</TableHead>
                  <TableHead className="text-right">{t('ملاحظات', 'Notes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.resourceAllocations.map(ra => (
                  <TableRow key={ra.id}>
                    <TableCell>
                      <Badge className={`text-[10px] ${
                        ra.resourceType === 'EMPLOYEE' ? 'bg-violet-100 text-violet-700' :
                        ra.resourceType === 'TEAM' ? 'bg-amber-100 text-amber-700' :
                        'bg-cyan-100 text-cyan-700'
                      }`}>
                        {ra.resourceType === 'EMPLOYEE' ? t('موظف', 'Employee') :
                         ra.resourceType === 'TEAM' ? t('فريق', 'Team') :
                         t('معدة', 'Equipment')}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(ra.startDate, lang)}</TableCell>
                    <TableCell>{formatDate(ra.endDate, lang)}</TableCell>
                    <TableCell>{ra.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {totalEmployees === 0 && project.equipmentOperations.length === 0 && project.fuelLogs.length === 0 && project.timesheets.length === 0 && project.resourceAllocations.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Users className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('لا توجد موارد مخصصة لهذا المشروع', 'No resources allocated to this project')}</p>
        </div>
      )}
    </div>
  )
}

// ============ Project Detail View ============
function ProjectDetailView({ project, onBack, lang }: { project: ProjectDetail; onBack: () => void; lang: 'ar' | 'en' }) {
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold">{project.name}</h2>
            <Badge variant="outline" className={statusColors[project.status]}>
              {statusLabels[project.status]}
            </Badge>
            <Badge className={`text-[10px] px-2 py-0.5 ${
              project.projectType === 'CONSTRUCTION'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-cyan-100 text-cyan-700 border-cyan-200'
            }`}>
              {project.projectType === 'CONSTRUCTION' ? t('تنفيذي', 'Construction') : t('تأجير', 'Rental')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{project.code} — {project.client.name}</p>
        </div>
      </div>

      {/* Project Type Banner */}
      {project.projectType === 'EQUIPMENT_RENTAL' ? (
        <div className="flex items-center gap-3 rounded-lg bg-cyan-50 border border-cyan-200 px-4 py-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-cyan-100">
            <Truck className="size-5 text-cyan-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-cyan-700">{t('مشروع تأجير معدات', 'Equipment Rental Project')}</p>
            <p className="text-xs text-cyan-600">{t('هذا المشروع مخصص لتأجير المعدات', 'This project is dedicated to equipment rental')}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100">
            <Building2 className="size-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-700">{t('مشروع تنفيذي', 'Construction Project')}</p>
            <p className="text-xs text-emerald-600">{t('هذا المشروع تنفيذي للمقاولات', 'This is a construction project')}</p>
          </div>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('قيمة العقد', 'Contract Value')}</p>
            <p className="text-sm font-medium text-emerald-700">
              <MoneyDisplay value={project.contractValue || 0} mode="system" lang={lang} bold size="sm" />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('العميل', 'Client')}</p>
            <p className="text-sm font-medium truncate">{project.client.name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('الموقع', 'Location')}</p>
            <p className="text-sm font-medium truncate">{project.location || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('تاريخ البدء', 'Start Date')}</p>
            <p className="text-sm font-medium">{formatDate(project.startDate, lang)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('تاريخ الانتهاء', 'End Date')}</p>
            <p className="text-sm font-medium">{formatDate(project.endDate, lang)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('العقود', 'Contracts')}</p>
            <p className="text-sm font-medium">{project.contracts.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="project-card" dir="rtl">
        <TabsList className="flex-wrap">
          <TabsTrigger value="project-card" className="gap-1.5">
            <Calculator className="size-4" /> {t('كرت المشروع', 'Project Card')}
          </TabsTrigger>
          <TabsTrigger value="workflow" className="gap-1.5">
            <Link2 className="size-4" /> {t('سلسلة العمل', 'Workflow')}
          </TabsTrigger>
          <TabsTrigger value="costs" className="gap-1.5">
            <Receipt className="size-4" /> {t('التكاليف', 'Costs')}
          </TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1.5">
            <TrendingUp className="size-4" /> {t('الإيرادات', 'Revenue')}
          </TabsTrigger>
          <TabsTrigger value="resources" className="gap-1.5">
            <Users className="size-4" /> {t('الموارد', 'Resources')}
          </TabsTrigger>
        </TabsList>

        {/* Project Card Tab (كرت المشروع) */}
        <TabsContent value="project-card">
          <CostSheetView costSheet={project.costSheet} projectName={project.name} lang={lang} />
        </TabsContent>

        {/* Workflow Chain Tab (سلسلة العمل) */}
        <TabsContent value="workflow">
          <Card>
            <CardContent className="p-6">
              <WorkflowChainView project={project} lang={lang} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Costs Tab (التكاليف) */}
        <TabsContent value="costs">
          <CostsTab project={project} lang={lang} />
        </TabsContent>

        {/* Revenue Tab (الإيرادات) */}
        <TabsContent value="revenue">
          <RevenueTab project={project} lang={lang} />
        </TabsContent>

        {/* Resources Tab (الموارد) */}
        <TabsContent value="resources">
          <ResourcesTab project={project} lang={lang} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============ Project Card (List Item) ============
function ProjectCard({ project, lang, onClick, onEdit, onDelete }: {
  project: ProjectListItem; lang: 'ar' | 'en'
  onClick: () => void; onEdit: () => void; onDelete: () => void
}) {
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  const isConstruction = project.projectType === 'CONSTRUCTION'

  return (
    <Card className={`cursor-pointer hover:shadow-md transition-all border-r-4 ${
      isConstruction ? 'border-r-emerald-500' : 'border-r-cyan-500'
    }`} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-bold text-base truncate">{project.name}</h3>
              <Badge className={`text-[10px] ${
                isConstruction ? 'bg-emerald-100 text-emerald-700' : 'bg-cyan-100 text-cyan-700'
              }`}>
                {isConstruction ? t('تنفيذي', 'Const.') : t('تأجير', 'Rental')}
              </Badge>
              <Badge variant="outline" className={statusColors[project.status]}>
                {statusLabels[project.status]}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
              <span>{project.code}</span>
              <span>•</span>
              <span>{project.client.name}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>{t('قيمة العقد', 'Contract')}: <span className="font-semibold text-emerald-700"><MoneyDisplay value={project.contractValue || 0} mode="system" lang={lang} bold size="xs" showSymbol={false} /></span></span>
              <span>{t('العقود', 'Contracts')}: {project.contracts.length}</span>
              <span>{t('المستخلصات', 'Claims')}: {project._count.progressClaims}</span>
              <span>{t('BOQ', 'BOQ')}: {project._count.boqItems}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); onEdit() }}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-rose-500 hover:text-rose-700" onClick={e => { e.stopPropagation(); onDelete() }}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============ Main Projects Module ============
export function ProjectsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectListItem | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  // Fetch projects list
  const { data: projects = [], isLoading, isError, refetch } = useQuery<ProjectListItem[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch project detail
  const { data: projectDetail, isLoading: isLoadingDetail } = useQuery<ProjectDetail>({
    queryKey: ['project', selectedProjectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${selectedProjectId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!selectedProjectId,
  })

  // Fetch clients & branches for form
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients-for-form'],
    queryFn: async () => {
      const res = await fetch('/api/clients')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches-for-form'],
    queryFn: async () => {
      const res = await fetch('/api/branches')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/projects/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  // Filter projects
  const filtered = projects.filter(p => {
    const matchSearch = !search || p.name.includes(search) || p.code.includes(search) || p.client.name.includes(search)
    const matchStatus = statusFilter === 'all' || p.status === statusFilter
    const matchType = typeFilter === 'all' || p.projectType === typeFilter
    return matchSearch && matchStatus && matchType
  })

  // Detail view
  if (selectedProjectId && projectDetail) {
    return <ProjectDetailView project={projectDetail} onBack={() => setSelectedProjectId(null)} lang={lang} />
  }

  if (selectedProjectId && isLoadingDetail) {
    return <DetailSkeleton />
  }

  // Summary stats
  const totalContractValue = filtered.reduce((s, p) => s + (Number(p.contractValue) || 0), 0)
  const activeProjects = filtered.filter(p => p.status === 'ACTIVE').length
  const constructionProjects = filtered.filter(p => p.projectType === 'CONSTRUCTION').length
  const rentalProjects = filtered.filter(p => p.projectType === 'EQUIPMENT_RENTAL').length

  return (
    <ModuleLayout
      title={{ ar: 'المشاريع', en: 'Projects' }}
      subtitle={{ ar: 'إدارة ومتابعة مشاريع المقاولات', en: 'Manage and track construction projects' }}
      actions={
        <>
          <PrintButton type="generic-table" size="icon" />
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingProject(null); setDialogOpen(true) }}>
            <Plus className="size-4" /> {t('مشروع جديد', 'New Project')}
          </Button>
        </>
      }
    >

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-emerald-200">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">{t('إجمالي المشاريع', 'Total Projects')}</p>
            <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">{t('المشاريع النشطة', 'Active Projects')}</p>
            <p className="text-2xl font-bold text-emerald-700">{activeProjects}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">{t('قيمة العقود', 'Contract Value')}</p>
            <p className="text-sm font-bold text-emerald-700">
              <MoneyDisplay value={totalContractValue} mode="system" lang={lang} bold size="sm" />
            </p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-emerald-600">{t('تنفيذي', 'Const.')}: <span className="font-bold">{constructionProjects}</span></p>
                <p className="text-xs text-cyan-600">{t('تأجير', 'Rental')}: <span className="font-bold">{rentalProjects}</span></p>
              </div>
            </div>
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
                placeholder={t('بحث بالاسم أو الكود أو العميل...', 'Search by name, code or client...')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder={t('كل الحالات', 'All Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الحالات', 'All Status')}</SelectItem>
                <SelectItem value="PLANNING">{t('تخطيط', 'Planning')}</SelectItem>
                <SelectItem value="ACTIVE">{t('نشط', 'Active')}</SelectItem>
                <SelectItem value="ON_HOLD">{t('معلق', 'On Hold')}</SelectItem>
                <SelectItem value="COMPLETED">{t('مكتمل', 'Completed')}</SelectItem>
                <SelectItem value="CANCELLED">{t('ملغي', 'Cancelled')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder={t('كل الأنواع', 'All Types')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الأنواع', 'All Types')}</SelectItem>
                <SelectItem value="CONSTRUCTION">{t('تنفيذي', 'Construction')}</SelectItem>
                <SelectItem value="EQUIPMENT_RENTAL">{t('تأجير', 'Rental')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Projects Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data')}</p>
          <Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Building2 className="size-12 text-gray-300" />
          <p className="text-muted-foreground">{t('لا توجد مشاريع', 'No projects found')}</p>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingProject(null); setDialogOpen(true) }}>
            <Plus className="size-4 mr-1" /> {t('إنشاء مشروع', 'Create Project')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              lang={lang}
              onClick={() => setSelectedProjectId(project.id)}
              onEdit={() => { setEditingProject(project); setDialogOpen(true) }}
              onDelete={() => { if (confirm(t('هل أنت متأكد من حذف هذا المشروع؟', 'Are you sure you want to delete this project?'))) deleteMutation.mutate(project.id) }}
            />
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <ProjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingProject={editingProject}
        clients={clients}
        branches={branches}
      />
    </ModuleLayout>
  )
}

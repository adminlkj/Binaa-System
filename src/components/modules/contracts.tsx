'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw, Pencil, Trash2, Eye, ArrowRight,
  CheckCircle2, Send, Ban, Clock, MapPin, Users, FileCheck, DollarSign,
  ClipboardList, Building2, AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useAppStore, formatDate, commonText } from '@/stores/app-store'

// ============ Types ============
interface ClientOption { id: string; code: string; name: string; nameAr?: string | null }
interface ProjectOption { id: string; code: string; name: string; nameAr?: string | null; clientId?: string }

interface ContractItem {
  id: string
  contractNo: string
  projectId: string
  date: string
  value: number
  vatRate: number
  vatAmount: number
  totalValue: number
  startDate: string
  endDate: string | null
  status: string
  description: string | null
  contractType: string | null
  clientId: string | null
  equipmentId: string | null
  hourlyRate: number | null
  deliveryFees: number
  deliveryFeesTaxable: boolean
  paymentTerms: string | null
  salesOrderNo: string | null
  journalEntryId: string | null
  // New Project Contract Fields
  quotationNo: string | null
  loaNo: string | null
  purchaseOrderNo: string | null
  projectDuration: string | null
  warrantyPeriod: string | null
  maintenancePeriod: string | null
  billingMethod: string | null
  firstClaimNo: string | null
  advancePaymentPercent: number | null
  retentionPercent: number | null
  projectManager: string | null
  projectEngineer: string | null
  projectLocation: string | null
  projectCity: string | null
  projectType: string | null
  createdAt: string
  updatedAt: string
  // Relations
  project: { id: string; name: string; code: string; nameAr?: string | null }
  client: { id: string; name: string; code: string; nameAr?: string | null } | null
  _count?: { progressClaims: number }
  progressClaims?: {
    id: string
    claimNo: string
    date: string
    percentage: number
    amount: number
    totalAmount: number
    status: string
  }[]
}

interface ContractFormData {
  projectId: string
  clientId: string
  contractNo: string
  date: string
  value: string
  vatRate: string
  startDate: string
  endDate: string
  status: string
  description: string
  contractType: string
  hourlyRate: string
  deliveryFees: string
  deliveryFeesTaxable: boolean
  paymentTerms: string
  salesOrderNo: string
  // New Project Contract Fields
  quotationNo: string
  loaNo: string
  purchaseOrderNo: string
  projectDuration: string
  warrantyPeriod: string
  maintenancePeriod: string
  billingMethod: string
  firstClaimNo: string
  advancePaymentPercent: string
  retentionPercent: string
  projectManager: string
  projectEngineer: string
  projectLocation: string
  projectCity: string
  projectType: string
  notes: string
}

// ============ Labels ============
const labels = {
  title: { ar: 'عقود المشاريع', en: 'Project Contracts' },
  subtitle: { ar: 'إدارة عقود المشاريع التنفيذية والمستخلصات', en: 'Manage execution project contracts and progress claims' },
  contractNo: { ar: 'رقم العقد', en: 'Contract No.' },
  client: { ar: 'العميل', en: 'Client' },
  project: { ar: 'المشروع', en: 'Project' },
  contractType: { ar: 'نوع العقد', en: 'Contract Type' },
  startDate: { ar: 'تاريخ البدء', en: 'Start Date' },
  endDate: { ar: 'تاريخ النهاية', en: 'End Date' },
  value: { ar: 'قيمة العقد', en: 'Contract Value' },
  vatRate: { ar: 'نسبة الضريبة', en: 'VAT Rate' },
  vatAmount: { ar: 'قيمة الضريبة', en: 'VAT Amount' },
  totalValue: { ar: 'إجمالي العقد', en: 'Total Value' },
  status: { ar: 'الحالة', en: 'Status' },
  date: { ar: 'تاريخ العقد', en: 'Contract Date' },
  description: { ar: 'وصف العقد', en: 'Description' },
  newContract: { ar: 'عقد مشروع جديد', en: 'New Project Contract' },
  editContract: { ar: 'تعديل العقد', en: 'Edit Contract' },
  search: { ar: 'بحث برقم العقد، المشروع، العميل...', en: 'Search by contract no., project, client...' },
  allStatus: { ar: 'كل الحالات', en: 'All Status' },
  totalContractValue: { ar: 'إجمالي قيمة العقود', en: 'Total Contract Value' },
  activeContracts: { ar: 'العقود الفعالة', en: 'Active Contracts' },
  totalProjects: { ar: 'عدد المشاريع', en: 'Total Projects' },
  deleteConfirm: { ar: 'هل أنت متأكد من حذف هذا العقد؟ لا يمكن الحذف إلا للعقود في حالة المسودة التي لا تحتوي على مستخلصات.', en: 'Are you sure you want to delete this contract? Only draft contracts with no progress claims can be deleted.' },
  deleteTitle: { ar: 'حذف العقد', en: 'Delete Contract' },
  claims: { ar: 'المستخلصات', en: 'Progress Claims' },
  selectClient: { ar: 'اختر العميل', en: 'Select Client' },
  selectProject: { ar: 'اختر المشروع', en: 'Select Project' },
  create: { ar: 'إنشاء', en: 'Create' },
  saving: { ar: 'جاري الحفظ...', en: 'Saving...' },
  update: { ar: 'تحديث', en: 'Update' },
  noContracts: { ar: 'لا توجد عقود مشاريع', en: 'No project contracts found' },
  // Section titles
  section1: { ar: 'القسم الأول: بيانات العقد الأساسية', en: 'Section 1: Basic Contract Data' },
  section2: { ar: 'القسم الثاني: البيانات المالية', en: 'Section 2: Financial Data' },
  section3: { ar: 'القسم الثالث: بيانات التنفيذ', en: 'Section 3: Execution Data' },
  section4: { ar: 'القسم الرابع: بيانات المستخلصات', en: 'Section 4: Progress Claims Data' },
  section5: { ar: 'القسم الخامس: بيانات المشروع', en: 'Section 5: Project Data' },
  section6: { ar: 'القسم السادس: المستندات المرجعية', en: 'Section 6: Reference Documents' },
  section7: { ar: 'القسم السابع: الشروط والملاحظات', en: 'Section 7: Terms & Notes' },
  // Field labels
  projectContract: { ar: 'عقد مشروع', en: 'Project Contract' },
  projectDuration: { ar: 'مدة المشروع', en: 'Project Duration' },
  warrantyPeriod: { ar: 'مدة الضمان', en: 'Warranty Period' },
  maintenancePeriod: { ar: 'مدة الصيانة', en: 'Maintenance Period' },
  billingMethod: { ar: 'طريقة الفوترة', en: 'Billing Method' },
  firstClaimNo: { ar: 'رقم أول مستخلص', en: 'First Claim No.' },
  advancePaymentPercent: { ar: 'نسبة الدفعة المقدمة', en: 'Advance Payment %' },
  retentionPercent: { ar: 'نسبة الاحتجاز', en: 'Retention %' },
  projectManager: { ar: 'مدير المشروع', en: 'Project Manager' },
  projectEngineer: { ar: 'مهندس المشروع', en: 'Project Engineer' },
  projectLocation: { ar: 'الموقع', en: 'Location' },
  projectCity: { ar: 'المدينة', en: 'City' },
  projectType: { ar: 'نوع المشروع', en: 'Project Type' },
  quotationNo: { ar: 'رقم عرض السعر', en: 'Quotation No.' },
  loaNo: { ar: 'رقم أمر الترسية LOA', en: 'LOA No.' },
  purchaseOrderNo: { ar: 'رقم أمر الشراء PO', en: 'Purchase Order No.' },
  paymentTerms: { ar: 'شروط السداد', en: 'Payment Terms' },
  notes: { ar: 'ملاحظات', en: 'Notes' },
  salesOrderNo: { ar: 'رقم طلب البيع', en: 'Sales Order No.' },
  deliveryFees: { ar: 'رسوم النقل', en: 'Delivery Fees' },
  deliveryFeesTaxable: { ar: 'رسوم النقل خاضعة للضريبة', en: 'Delivery Fees Taxable' },
  hourlyRate: { ar: 'سعر الساعة', en: 'Hourly Rate' },
  sendForReview: { ar: 'إرسال للمراجعة', en: 'Send for Review' },
  activateContract: { ar: 'تفعيل العقد', en: 'Activate Contract' },
  expireContract: { ar: 'إنهاء العقد', en: 'Expire Contract' },
  cancelContract: { ar: 'إلغاء العقد', en: 'Cancel Contract' },
  relatedClaims: { ar: 'المستخلصات المرتبطة', en: 'Related Progress Claims' },
  claimNo: { ar: 'رقم المستخلص', en: 'Claim No.' },
  percentage: { ar: 'النسبة', en: 'Percentage' },
  amount: { ar: 'المبلغ', en: 'Amount' },
}

// ============ Options ============
const billingMethodOptions = [
  { value: 'PROGRESS_CLAIMS', label: { ar: 'مستخلصات', en: 'Progress Claims' } },
  { value: 'MILESTONES', label: { ar: 'مراحل', en: 'Milestones' } },
]

const projectTypeOptions = [
  { value: 'RESIDENTIAL', label: { ar: 'سكني', en: 'Residential' } },
  { value: 'COMMERCIAL', label: { ar: 'تجاري', en: 'Commercial' } },
  { value: 'GOVERNMENT', label: { ar: 'حكومي', en: 'Government' } },
  { value: 'INFRASTRUCTURE', label: { ar: 'بنية تحتية', en: 'Infrastructure' } },
  { value: 'MAINTENANCE_OPS', label: { ar: 'صيانة وتشغيل', en: 'Maintenance & Operations' } },
]

const statusOptions = [
  { value: 'DRAFT', label: { ar: 'مسودة', en: 'Draft' }, color: 'bg-yellow-100 text-yellow-800' },
  { value: 'UNDER_REVIEW', label: { ar: 'قيد المراجعة', en: 'Under Review' }, color: 'bg-blue-100 text-blue-800' },
  { value: 'ACTIVE', label: { ar: 'فعال', en: 'Active' }, color: 'bg-emerald-100 text-emerald-800' },
  { value: 'EXPIRED', label: { ar: 'منتهي', en: 'Expired' }, color: 'bg-gray-100 text-gray-800' },
  { value: 'CANCELLED', label: { ar: 'ملغي', en: 'Cancelled' }, color: 'bg-red-100 text-red-800' },
]

const defaultForm: ContractFormData = {
  projectId: '', clientId: '', contractNo: '',
  date: '', value: '', vatRate: '0.15', startDate: '', endDate: '',
  status: 'DRAFT', description: '', contractType: 'PROJECT',
  hourlyRate: '', deliveryFees: '0', deliveryFeesTaxable: true,
  paymentTerms: '', salesOrderNo: '',
  quotationNo: '', loaNo: '', purchaseOrderNo: '',
  projectDuration: '', warrantyPeriod: '', maintenancePeriod: '',
  billingMethod: 'PROGRESS_CLAIMS', firstClaimNo: '',
  advancePaymentPercent: '0', retentionPercent: '0',
  projectManager: '', projectEngineer: '',
  projectLocation: '', projectCity: '', projectType: '',
  notes: '',
}

// ============ View State ============
type ViewState = { type: 'list' } | { type: 'create' } | { type: 'edit'; contract: ContractItem } | { type: 'detail'; contractId: string }

// ============ Status Badge for Contracts ============
function ContractStatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const config = statusOptions.find(s => s.value === status)
  if (!config) return <StatusBadge status={status} lang={lang} />
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
      {config.label[lang]}
    </span>
  )
}

// ============ Skeleton ============
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Section Header ============
function SectionHeader({ icon: Icon, title, lang }: { icon: React.ElementType; title: { ar: string; en: string }; lang: 'ar' | 'en' }) {
  return (
    <div className="flex items-center gap-2 pb-3 border-b mb-4">
      <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-100">
        <Icon className="size-4 text-emerald-600" />
      </div>
      <h3 className="text-base font-semibold">{title[lang]}</h3>
    </div>
  )
}

// ============ Contract Form Page ============
function ContractFormPage({
  form, setForm, onSubmit, onBack, isEdit, isLoading, clients, projects,
}: {
  form: ContractFormData; setForm: React.Dispatch<React.SetStateAction<ContractFormData>>
  onSubmit: (e: React.FormEvent) => void; onBack: () => void
  isEdit: boolean; isLoading: boolean
  clients: ClientOption[]; projects: ProjectOption[]
}) {
  const { lang } = useAppStore()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const val = parseFloat(form.value) || 0
  const rate = parseFloat(form.vatRate) || 0
  const vatAmount = Math.round(val * rate * 100) / 100
  const totalValue = Math.round((val + vatAmount) * 100) / 100

  // Filter projects by selected client
  const filteredProjects = form.clientId
    ? projects.filter(p => !p.clientId || p.clientId === form.clientId)
    : projects

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowRight className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? t(labels.editContract.ar, labels.editContract.en) : t(labels.newContract.ar, labels.newContract.en)}
          </h1>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* القسم الأول: بيانات العقد الأساسية */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={FileCheck} title={labels.section1} lang={lang} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.contractNo.ar, labels.contractNo.en)}</Label>
                <Input value={form.contractNo} readOnly className="bg-gray-50" dir="ltr" placeholder="CTR-0001" />
                <p className="text-xs text-muted-foreground">{t('يتم التوليد تلقائياً', 'Auto-generated')}</p>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.client.ar, labels.client.en)} *</Label>
                <Select value={form.clientId} onValueChange={v => setForm(f => ({ ...f, clientId: v, projectId: '' }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t(labels.selectClient.ar, labels.selectClient.en)} /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.project.ar, labels.project.en)} *</Label>
                <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t(labels.selectProject.ar, labels.selectProject.en)} /></SelectTrigger>
                  <SelectContent>
                    {filteredProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.contractType.ar, labels.contractType.en)}</Label>
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-emerald-50 border-emerald-200">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">{t(labels.projectContract.ar, labels.projectContract.en)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.date.ar, labels.date.en)} *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.startDate.ar, labels.startDate.en)} *</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.endDate.ar, labels.endDate.en)}</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* القسم الثاني: البيانات المالية */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={DollarSign} title={labels.section2} lang={lang} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.value.ar, labels.value.en)} *</Label>
                <Input type="number" step="0.01" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0.00" dir="ltr" required />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.vatRate.ar, labels.vatRate.en)}</Label>
                <Input type="number" step="0.01" value={form.vatRate} onChange={e => setForm(f => ({ ...f, vatRate: e.target.value }))} dir="ltr" />
                <p className="text-xs text-muted-foreground">({((rate ?? 0) * 100).toFixed(0)}%)</p>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.vatAmount.ar, labels.vatAmount.en)}</Label>
                <Input value={(vatAmount ?? 0).toFixed(2)} readOnly className="bg-gray-50" dir="ltr" />
                <p className="text-xs text-muted-foreground">{t('محسوب تلقائياً', 'Auto-calculated')}</p>
              </div>
            </div>

            {/* VAT Preview */}
            {val > 0 && (
              <Card className="bg-emerald-50 border-emerald-200 mt-4">
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('القيمة', 'Value')}</p>
                      <MoneyDisplay value={val} lang={lang} bold size="md" className="justify-center" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('الضريبة', 'VAT')} ({((rate ?? 0) * 100).toFixed(0)}%)</p>
                      <MoneyDisplay value={vatAmount} lang={lang} bold size="md" className="justify-center" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('الإجمالي', 'Total')}</p>
                      <MoneyDisplay value={totalValue} lang={lang} bold size="lg" className="justify-center text-emerald-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* القسم الثالث: بيانات التنفيذ */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={Clock} title={labels.section3} lang={lang} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.projectDuration.ar, labels.projectDuration.en)}</Label>
                <Input value={form.projectDuration} onChange={e => setForm(f => ({ ...f, projectDuration: e.target.value }))} placeholder={t('مثال: 12 شهر', 'e.g. 12 months')} />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.warrantyPeriod.ar, labels.warrantyPeriod.en)}</Label>
                <Input value={form.warrantyPeriod} onChange={e => setForm(f => ({ ...f, warrantyPeriod: e.target.value }))} placeholder={t('مثال: 24 شهر', 'e.g. 24 months')} />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.maintenancePeriod.ar, labels.maintenancePeriod.en)}</Label>
                <Input value={form.maintenancePeriod} onChange={e => setForm(f => ({ ...f, maintenancePeriod: e.target.value }))} placeholder={t('مثال: 12 شهر', 'e.g. 12 months')} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* القسم الرابع: بيانات المستخلصات */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={ClipboardList} title={labels.section4} lang={lang} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.billingMethod.ar, labels.billingMethod.en)}</Label>
                <Select value={form.billingMethod} onValueChange={v => setForm(f => ({ ...f, billingMethod: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {billingMethodOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{t(o.label.ar, o.label.en)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.firstClaimNo.ar, labels.firstClaimNo.en)}</Label>
                <Input value={form.firstClaimNo} onChange={e => setForm(f => ({ ...f, firstClaimNo: e.target.value }))} placeholder="EX-001" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.advancePaymentPercent.ar, labels.advancePaymentPercent.en)}</Label>
                <div className="relative">
                  <Input type="number" step="0.01" min="0" max="100" value={form.advancePaymentPercent} onChange={e => setForm(f => ({ ...f, advancePaymentPercent: e.target.value }))} placeholder="0" dir="ltr" />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t(labels.retentionPercent.ar, labels.retentionPercent.en)}</Label>
                <div className="relative">
                  <Input type="number" step="0.01" min="0" max="100" value={form.retentionPercent} onChange={e => setForm(f => ({ ...f, retentionPercent: e.target.value }))} placeholder="0" dir="ltr" />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* القسم الخامس: بيانات المشروع */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={Building2} title={labels.section5} lang={lang} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.projectManager.ar, labels.projectManager.en)}</Label>
                <Input value={form.projectManager} onChange={e => setForm(f => ({ ...f, projectManager: e.target.value }))} placeholder={t('اسم مدير المشروع', 'Project manager name')} />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.projectEngineer.ar, labels.projectEngineer.en)}</Label>
                <Input value={form.projectEngineer} onChange={e => setForm(f => ({ ...f, projectEngineer: e.target.value }))} placeholder={t('اسم مهندس المشروع', 'Project engineer name')} />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.projectLocation.ar, labels.projectLocation.en)}</Label>
                <Input value={form.projectLocation} onChange={e => setForm(f => ({ ...f, projectLocation: e.target.value }))} placeholder={t('الموقع', 'Location')} />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.projectCity.ar, labels.projectCity.en)}</Label>
                <Input value={form.projectCity} onChange={e => setForm(f => ({ ...f, projectCity: e.target.value }))} placeholder={t('المدينة', 'City')} />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.projectType.ar, labels.projectType.en)}</Label>
                <Select value={form.projectType} onValueChange={v => setForm(f => ({ ...f, projectType: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('اختر نوع المشروع', 'Select project type')} /></SelectTrigger>
                  <SelectContent>
                    {projectTypeOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{t(o.label.ar, o.label.en)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* القسم السادس: المستندات المرجعية */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={FileText} title={labels.section6} lang={lang} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t(labels.quotationNo.ar, labels.quotationNo.en)}</Label>
                <Input value={form.quotationNo} onChange={e => setForm(f => ({ ...f, quotationNo: e.target.value }))} placeholder="QT-001" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.loaNo.ar, labels.loaNo.en)}</Label>
                <Input value={form.loaNo} onChange={e => setForm(f => ({ ...f, loaNo: e.target.value }))} placeholder="LOA-001" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.purchaseOrderNo.ar, labels.purchaseOrderNo.en)}</Label>
                <Input value={form.purchaseOrderNo} onChange={e => setForm(f => ({ ...f, purchaseOrderNo: e.target.value }))} placeholder="PO-001" dir="ltr" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* القسم السابع: الشروط والملاحظات */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={Users} title={labels.section7} lang={lang} />
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t(labels.paymentTerms.ar, labels.paymentTerms.en)}</Label>
                <Input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder={t('شروط السداد', 'Payment terms')} />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.description.ar, labels.description.en)}</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('وصف العقد', 'Contract description')} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>{t(labels.notes.ar, labels.notes.en)}</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t('ملاحظات إضافية', 'Additional notes')} rows={2} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>{commonText.cancel[lang]}</Button>
          <Button type="submit" disabled={isLoading || !form.projectId || !form.date || !form.value || !form.startDate || !form.clientId} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {isLoading ? t(labels.saving.ar, labels.saving.en) : isEdit ? t(labels.update.ar, labels.update.en) : t(labels.create.ar, labels.create.en)}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Detail Info Row ============
function DetailRow({ label, value, lang }: { label: { ar: string; en: string }; value: string | number | null | undefined; lang: 'ar' | 'en' }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label[lang]}</p>
      <p className="text-sm font-medium">{value ?? '—'}</p>
    </div>
  )
}

function DetailMoneyRow({ label, value, lang }: { label: { ar: string; en: string }; value: number; lang: 'ar' | 'en' }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label[lang]}</p>
      <MoneyDisplay value={value} lang={lang} bold size="md" />
    </div>
  )
}

// ============ Main Contracts Module ============
export function ContractsModule() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<ContractFormData>(defaultForm)

  // Fetch contracts
  const { data: contracts = [], isLoading, isError, refetch } = useQuery<ContractItem[]>({
    queryKey: ['contracts', 'PROJECT'],
    queryFn: async () => {
      const res = await fetch('/api/contracts?contractType=PROJECT')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch single contract detail (with progress claims)
  const { data: detailContract } = useQuery<ContractItem>({
    queryKey: ['contract-detail', viewState.type === 'detail' ? viewState.contractId : null],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${(viewState as { type: 'detail'; contractId: string }).contractId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: viewState.type === 'detail',
  })

  // Fetch dropdown options
  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['clients-for-contracts'],
    queryFn: async () => {
      const res = await fetch('/api/clients?simple=true&active=true')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['projects-for-contracts'],
    queryFn: async () => {
      const res = await fetch('/api/projects/list')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Build form data from contract for editing
  const contractToForm = (c: ContractItem): ContractFormData => ({
    projectId: c.project.id,
    clientId: c.clientId || '',
    contractNo: c.contractNo,
    date: c.date?.split('T')[0] || '',
    value: (c.value ?? 0).toString(),
    vatRate: (c.vatRate ?? 0).toString(),
    startDate: c.startDate?.split('T')[0] || '',
    endDate: c.endDate?.split('T')[0] || '',
    status: c.status,
    description: c.description || '',
    contractType: c.contractType || 'PROJECT',
    hourlyRate: c.hourlyRate?.toString() || '',
    deliveryFees: (c.deliveryFees ?? 0).toString(),
    deliveryFeesTaxable: c.deliveryFeesTaxable,
    paymentTerms: c.paymentTerms || '',
    salesOrderNo: c.salesOrderNo || '',
    quotationNo: c.quotationNo || '',
    loaNo: c.loaNo || '',
    purchaseOrderNo: c.purchaseOrderNo || '',
    projectDuration: c.projectDuration || '',
    warrantyPeriod: c.warrantyPeriod || '',
    maintenancePeriod: c.maintenancePeriod || '',
    billingMethod: c.billingMethod || 'PROGRESS_CLAIMS',
    firstClaimNo: c.firstClaimNo || '',
    advancePaymentPercent: c.advancePaymentPercent?.toString() || '0',
    retentionPercent: c.retentionPercent?.toString() || '0',
    projectManager: c.projectManager || '',
    projectEngineer: c.projectEngineer || '',
    projectLocation: c.projectLocation || '',
    projectCity: c.projectCity || '',
    projectType: c.projectType || '',
    notes: '',
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: ContractFormData) =>
      fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          contractType: 'PROJECT', // Always PROJECT for this module
          value: parseFloat(data.value) || 0,
          vatRate: parseFloat(data.vatRate) || 0.15,
          hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : null,
          deliveryFees: parseFloat(data.deliveryFees) || 0,
          clientId: data.clientId || null,
          salesOrderNo: data.salesOrderNo || null,
          paymentTerms: data.paymentTerms || null,
          description: data.description || null,
          endDate: data.endDate || null,
          quotationNo: data.quotationNo || null,
          loaNo: data.loaNo || null,
          purchaseOrderNo: data.purchaseOrderNo || null,
          projectDuration: data.projectDuration || null,
          warrantyPeriod: data.warrantyPeriod || null,
          maintenancePeriod: data.maintenancePeriod || null,
          billingMethod: data.billingMethod || null,
          firstClaimNo: data.firstClaimNo || null,
          advancePaymentPercent: parseFloat(data.advancePaymentPercent) || 0,
          retentionPercent: parseFloat(data.retentionPercent) || 0,
          projectManager: data.projectManager || null,
          projectEngineer: data.projectEngineer || null,
          projectLocation: data.projectLocation || null,
          projectCity: data.projectCity || null,
          projectType: data.projectType || null,
        }),
      }).then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Failed') }); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      setViewState({ type: 'list' })
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ContractFormData }) =>
      fetch(`/api/contracts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          contractType: 'PROJECT',
          value: parseFloat(data.value) || 0,
          vatRate: parseFloat(data.vatRate) || 0.15,
          hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : null,
          deliveryFees: parseFloat(data.deliveryFees) || 0,
          clientId: data.clientId || null,
          salesOrderNo: data.salesOrderNo || null,
          paymentTerms: data.paymentTerms || null,
          description: data.description || null,
          endDate: data.endDate || null,
          quotationNo: data.quotationNo || null,
          loaNo: data.loaNo || null,
          purchaseOrderNo: data.purchaseOrderNo || null,
          projectDuration: data.projectDuration || null,
          warrantyPeriod: data.warrantyPeriod || null,
          maintenancePeriod: data.maintenancePeriod || null,
          billingMethod: data.billingMethod || null,
          firstClaimNo: data.firstClaimNo || null,
          advancePaymentPercent: parseFloat(data.advancePaymentPercent) || 0,
          retentionPercent: parseFloat(data.retentionPercent) || 0,
          projectManager: data.projectManager || null,
          projectEngineer: data.projectEngineer || null,
          projectLocation: data.projectLocation || null,
          projectCity: data.projectCity || null,
          projectType: data.projectType || null,
        }),
      }).then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Failed') }); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] })
      setViewState({ type: 'list' })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/contracts/${id}`, { method: 'DELETE' }).then(r => {
        if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Failed') })
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      setDeleteId(null)
    },
  })

  // Status transition mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/contracts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Failed') }); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] })
    },
  })

  // Filters
  const filtered = useMemo(() => contracts.filter(c => {
    const matchSearch = !search ||
      c.contractNo.toLowerCase().includes(search.toLowerCase()) ||
      c.project.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.client?.name || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  }), [contracts, search, statusFilter])

  const totalContractValue = useMemo(() => filtered.reduce((s, c) => s + c.totalValue, 0), [filtered])
  const activeContractsCount = useMemo(() => filtered.filter(c => c.status === 'ACTIVE').length, [filtered])
  const uniqueProjects = useMemo(() => new Set(filtered.map(c => c.project?.id || c.projectId)).size, [filtered])

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (viewState.type === 'edit') {
      updateMutation.mutate({ id: viewState.contract.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  // ============ CREATE / EDIT VIEW ============
  if (viewState.type === 'create' || viewState.type === 'edit') {
    return (
      <ContractFormPage
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        onBack={() => setViewState({ type: 'list' })}
        isEdit={viewState.type === 'edit'}
        isLoading={createMutation.isPending || updateMutation.isPending}
        clients={clients}
        projects={projects}
      />
    )
  }

  // ============ DETAIL VIEW ============
  if (viewState.type === 'detail') {
    const contract = detailContract || contracts.find(c => c.id === viewState.contractId)
    if (!contract) {
      return (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-rose-600">{t('لم يتم العثور على العقد', 'Contract not found')}</p>
          <Button variant="outline" onClick={() => setViewState({ type: 'list' })}>{t('العودة', 'Back')}</Button>
        </div>
      )
    }

    const clientName = contract.client?.name || (contract.clientId ? (clients.find(c => c.id === contract.clientId)?.name || '—') : '—')
    const claims = contract.progressClaims || []
    const billingLabel = billingMethodOptions.find(o => o.value === contract.billingMethod)
    const pTypeLabel = projectTypeOptions.find(o => o.value === contract.projectType)

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setViewState({ type: 'list' })}>
            <ArrowRight className="size-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">{contract.contractNo}</h2>
              <ContractStatusBadge status={contract.status} lang={lang} />
            </div>
            <p className="text-sm text-muted-foreground">{contract.project.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintButton type={contract.contractType === 'RENTAL' ? 'rental-contract' : 'generic-table'} documentId={contract.id} />
            {contract.status === 'DRAFT' && (
              <Button variant="outline" className="gap-2" onClick={() => {
                setForm(contractToForm(contract))
                setViewState({ type: 'edit', contract })
              }}>
                <Pencil className="size-4" /> {t('تعديل', 'Edit')}
              </Button>
            )}
          </div>
        </div>

        {/* Status Action Buttons */}
        {(contract.status === 'DRAFT' || contract.status === 'UNDER_REVIEW' || contract.status === 'ACTIVE') && (
          <Card className="bg-gray-50">
            <CardContent className="p-4 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">{t('إجراءات:', 'Actions:')}</span>
              {contract.status === 'DRAFT' && (
                <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => statusMutation.mutate({ id: contract.id, status: 'UNDER_REVIEW' })} disabled={statusMutation.isPending}>
                  <Send className="size-4" /> {t(labels.sendForReview.ar, labels.sendForReview.en)}
                </Button>
              )}
              {contract.status === 'UNDER_REVIEW' && (
                <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => statusMutation.mutate({ id: contract.id, status: 'ACTIVE' })} disabled={statusMutation.isPending}>
                  <CheckCircle2 className="size-4" /> {t(labels.activateContract.ar, labels.activateContract.en)}
                </Button>
              )}
              {contract.status === 'ACTIVE' && (
                <>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => statusMutation.mutate({ id: contract.id, status: 'EXPIRED' })} disabled={statusMutation.isPending}>
                    <Clock className="size-4" /> {t(labels.expireContract.ar, labels.expireContract.en)}
                  </Button>
                </>
              )}
              {(contract.status === 'DRAFT' || contract.status === 'UNDER_REVIEW') && (
                <Button size="sm" variant="outline" className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => statusMutation.mutate({ id: contract.id, status: 'CANCELLED' })} disabled={statusMutation.isPending}>
                  <Ban className="size-4" /> {t(labels.cancelContract.ar, labels.cancelContract.en)}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* القسم الأول: بيانات العقد الأساسية */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={FileCheck} title={labels.section1} lang={lang} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <DetailRow label={labels.contractNo} value={contract.contractNo} lang={lang} />
              <DetailRow label={labels.client} value={clientName} lang={lang} />
              <DetailRow label={labels.project} value={contract.project.name} lang={lang} />
              <DetailRow label={labels.contractType} value={t(labels.projectContract.ar, labels.projectContract.en)} lang={lang} />
              <DetailRow label={labels.date} value={formatDate(contract.date, lang)} lang={lang} />
              <DetailRow label={labels.startDate} value={formatDate(contract.startDate, lang)} lang={lang} />
              <DetailRow label={labels.endDate} value={contract.endDate ? formatDate(contract.endDate, lang) : '—'} lang={lang} />
            </div>
          </CardContent>
        </Card>

        {/* القسم الثاني: البيانات المالية */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={DollarSign} title={labels.section2} lang={lang} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailMoneyRow label={labels.value} value={contract.value} lang={lang} />
              <DetailMoneyRow label={labels.vatAmount} value={contract.vatAmount} lang={lang} />
              <div>
                <p className="text-xs text-muted-foreground">{t(labels.totalValue.ar, labels.totalValue.en)}</p>
                <MoneyDisplay value={contract.totalValue} lang={lang} bold size="lg" className="text-emerald-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* القسم الثالث: بيانات التنفيذ */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={Clock} title={labels.section3} lang={lang} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailRow label={labels.projectDuration} value={contract.projectDuration} lang={lang} />
              <DetailRow label={labels.warrantyPeriod} value={contract.warrantyPeriod} lang={lang} />
              <DetailRow label={labels.maintenancePeriod} value={contract.maintenancePeriod} lang={lang} />
            </div>
          </CardContent>
        </Card>

        {/* القسم الرابع: بيانات المستخلصات */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={ClipboardList} title={labels.section4} lang={lang} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailRow label={labels.billingMethod} value={billingLabel ? t(billingLabel.label.ar, billingLabel.label.en) : null} lang={lang} />
              <DetailRow label={labels.firstClaimNo} value={contract.firstClaimNo} lang={lang} />
              <DetailRow label={labels.advancePaymentPercent} value={contract.advancePaymentPercent != null ? `${contract.advancePaymentPercent}%` : null} lang={lang} />
              <DetailRow label={labels.retentionPercent} value={contract.retentionPercent != null ? `${contract.retentionPercent}%` : null} lang={lang} />
            </div>
          </CardContent>
        </Card>

        {/* القسم الخامس: بيانات المشروع */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={Building2} title={labels.section5} lang={lang} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailRow label={labels.projectManager} value={contract.projectManager} lang={lang} />
              <DetailRow label={labels.projectEngineer} value={contract.projectEngineer} lang={lang} />
              <DetailRow label={labels.projectLocation} value={contract.projectLocation} lang={lang} />
              <DetailRow label={labels.projectCity} value={contract.projectCity} lang={lang} />
              <DetailRow label={labels.projectType} value={pTypeLabel ? t(pTypeLabel.label.ar, pTypeLabel.label.en) : null} lang={lang} />
            </div>
          </CardContent>
        </Card>

        {/* القسم السادس: المستندات المرجعية */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={FileText} title={labels.section6} lang={lang} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailRow label={labels.quotationNo} value={contract.quotationNo} lang={lang} />
              <DetailRow label={labels.loaNo} value={contract.loaNo} lang={lang} />
              <DetailRow label={labels.purchaseOrderNo} value={contract.purchaseOrderNo} lang={lang} />
            </div>
          </CardContent>
        </Card>

        {/* القسم السابع: الشروط والملاحظات */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={Users} title={labels.section7} lang={lang} />
            <div className="space-y-4">
              <DetailRow label={labels.paymentTerms} value={contract.paymentTerms} lang={lang} />
              <DetailRow label={labels.description} value={contract.description} lang={lang} />
            </div>
          </CardContent>
        </Card>

        {/* Related Progress Claims */}
        <Card>
          <CardContent className="pt-6">
            <SectionHeader icon={ClipboardList} title={labels.relatedClaims} lang={lang} />
            {claims.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <ClipboardList className="size-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('لا توجد مستخلصات مرتبطة', 'No related progress claims')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t(labels.claimNo.ar, labels.claimNo.en)}</TableHead>
                      <TableHead className="text-right">{t(labels.date.ar, labels.date.en)}</TableHead>
                      <TableHead className="text-right">{t(labels.percentage.ar, labels.percentage.en)}</TableHead>
                      <TableHead className="text-right">{t(labels.amount.ar, labels.amount.en)}</TableHead>
                      <TableHead className="text-right">{t(labels.totalValue.ar, labels.totalValue.en)}</TableHead>
                      <TableHead className="text-right">{t(labels.status.ar, labels.status.en)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {claims.map(cl => (
                      <TableRow key={cl.id}>
                        <TableCell className="font-medium font-mono">{cl.claimNo}</TableCell>
                        <TableCell>{formatDate(cl.date, lang)}</TableCell>
                        <TableCell>{cl.percentage}%</TableCell>
                        <TableCell><MoneyDisplay value={cl.amount} lang={lang} size="sm" inline /></TableCell>
                        <TableCell><MoneyDisplay value={cl.totalAmount} lang={lang} size="sm" inline bold /></TableCell>
                        <TableCell><StatusBadge status={cl.status} lang={lang} /></TableCell>
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
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => {
            setForm(defaultForm)
            setViewState({ type: 'create' })
          }}>
            <Plus className="size-4" /> {t(labels.newContract.ar, labels.newContract.en)}
          </Button>
        </>
      }
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t(labels.totalContractValue.ar, labels.totalContractValue.en)}</p>
            <MoneyDisplay value={totalContractValue} lang={lang} size="xl" bold className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t(labels.activeContracts.ar, labels.activeContracts.en)}</p>
            <p className="text-3xl font-bold text-blue-700">{activeContractsCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t(labels.totalProjects.ar, labels.totalProjects.en)}</p>
            <p className="text-3xl font-bold text-amber-700">{uniqueProjects}</p>
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
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={t(labels.allStatus.ar, labels.allStatus.en)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(labels.allStatus.ar, labels.allStatus.en)}</SelectItem>
                {statusOptions.map(s => (
                  <SelectItem key={s.value} value={s.value}>{t(s.label.ar, s.label.en)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Contracts Table */}
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
              <p className="text-muted-foreground">{t(labels.noContracts.ar, labels.noContracts.en)}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setForm(defaultForm); setViewState({ type: 'create' }) }}>
                <Plus className="size-4 mr-1" /> {t(labels.newContract.ar, labels.newContract.en)}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(labels.contractNo.ar, labels.contractNo.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.project.ar, labels.project.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.client.ar, labels.client.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.value.ar, labels.value.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.totalValue.ar, labels.totalValue.en)}</TableHead>
                    <TableHead className="text-right">{t(labels.status.ar, labels.status.en)}</TableHead>
                    <TableHead className="text-right">{commonText.actions[lang]}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', contractId: c.id })}>
                      <TableCell className="font-medium font-mono">{c.contractNo}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{c.project.name}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{c.client?.name || '—'}</TableCell>
                      <TableCell><MoneyDisplay value={c.value} lang={lang} size="sm" inline /></TableCell>
                      <TableCell className="font-semibold"><MoneyDisplay value={c.totalValue} lang={lang} size="sm" inline bold /></TableCell>
                      <TableCell><ContractStatusBadge status={c.status} lang={lang} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewState({ type: 'detail', contractId: c.id })} title={t('عرض', 'View')}>
                            <Eye className="size-4" />
                          </Button>
                          {c.status === 'DRAFT' && (
                            <>
                              <Button variant="ghost" size="icon" className="size-8" onClick={() => {
                                setForm(contractToForm(c))
                                setViewState({ type: 'edit', contract: c })
                              }} title={t('تعديل', 'Edit')}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => setDeleteId(c.id)} title={t('حذف', 'Delete')}>
                                <Trash2 className="size-4" />
                              </Button>
                            </>
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
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId) }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('جاري الحذف...', 'Deleting...') : t('حذف', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModuleLayout>
  )
}

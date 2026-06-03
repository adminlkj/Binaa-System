'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Plus, Search, Eye, Pencil, Trash2, ArrowRight,
  FileText, ClipboardList, TrendingUp, Calculator, RefreshCw,
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
import { useAppStore, formatSAR as storeFormatSAR, formatDate as storeFormatDate, formatNumber, commonText } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'

// ============ Types ============
interface Client { id: string; code: string; name: string }
interface Branch { id: string; code: string; name: string }
interface ContractSummary { id: string; contractNo: string; totalValue: number; status: string }
interface ProjectListItem {
  id: string; code: string; name: string; nameAr: string | null; location: string | null
  startDate: string; endDate: string | null; status: string; description: string | null
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
  contract: { contractNo: string }
}

interface CostSheet {
  contractValue: number; revenue: number; purchases: number; subcontractors: number
  labor: number; equipment: number; expenses: number
  totalCosts: number; profit: number; profitMargin: number
}

interface ProjectDetail extends Omit<ProjectListItem, 'contracts' | '_count'> {
  contractValue: number
  contracts: (ContractSummary & { progressClaims: ProgressClaimItem[] })[]
  boqItems: BOQItem[]
  progressClaims: ProgressClaimItem[]
  costSheet: CostSheet
}

// formatSAR, formatDate, formatNumber imported from store

function formatSAR(value: number, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatSAR(value, lang)
}

function formatDate(dateStr: string | null, lang: 'ar' | 'en' = 'ar'): string {
  if (!dateStr) return '—'
  return storeFormatDate(dateStr, lang)
}

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

// ============ Project Form Dialog ============
interface ProjectFormData {
  code: string; name: string; nameAr: string; clientId: string; branchId: string
  location: string; startDate: string; endDate: string; status: string; description: string
  contractValue: string
}

function ProjectFormDialog({
  open, onOpenChange, editingProject, clients, branches,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  editingProject: ProjectListItem | null
  clients: Client[]; branches: Branch[]
}) {
  const queryClient = useQueryClient()
  const isEdit = !!editingProject

  const [form, setForm] = useState<ProjectFormData>({
    code: '', name: '', nameAr: '', clientId: '', branchId: '',
    location: '', startDate: '', endDate: '', status: 'PLANNING', description: '',
    contractValue: '',
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
          contractValue: '',
        })
      } else {
        setForm({ code: '', name: '', nameAr: '', clientId: '', branchId: '', location: '', startDate: '', endDate: '', status: 'PLANNING', description: '', contractValue: '' })
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
          <DialogTitle>{isEdit ? 'تعديل المشروع' : 'مشروع جديد'}</DialogTitle>
          <DialogDescription>{isEdit ? 'تعديل بيانات المشروع' : 'إضافة مشروع جديد للنظام'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="space-y-2 sm:col-span-2">
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

// ============ Cost Sheet Component (كرت المشروع) ============
function CostSheetView({ costSheet, projectName, lang }: { costSheet: CostSheet; projectName: string; lang: 'ar' | 'en' }) {
  const isProfit = costSheet.profit >= 0
  const profitColor = isProfit ? 'text-emerald-600' : 'text-rose-600'
  const profitBg = isProfit ? 'bg-emerald-50' : 'bg-rose-50'
  const profitBorder = isProfit ? 'border-emerald-300' : 'border-rose-300'

  // Bilingual labels for cost sheet
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const rows = [
    { label: t('قيمة العقد', 'Contract Value'), value: costSheet.contractValue, color: 'text-emerald-700', bg: 'bg-emerald-50/50', type: 'revenue' as const },
    { label: t('المستخلصات الصادرة', 'Progress Claims Issued'), value: costSheet.revenue, color: 'text-emerald-600', bg: 'bg-emerald-50/30', type: 'revenue' as const },
    { label: t('المشتريات', 'Purchases'), value: costSheet.purchases, color: 'text-rose-600', bg: 'bg-rose-50/30', type: 'cost' as const },
    { label: t('مصروفات المشروع', 'Project Expenses'), value: costSheet.expenses, color: 'text-rose-600', bg: 'bg-rose-50/30', type: 'cost' as const },
    { label: t('مقاولو الباطن', 'Subcontractors'), value: costSheet.subcontractors, color: 'text-orange-600', bg: 'bg-orange-50/30', type: 'cost' as const },
    { label: t('تكاليف العمالة', 'Labor Costs'), value: costSheet.labor, color: 'text-amber-600', bg: 'bg-amber-50/30', type: 'cost' as const },
    { label: t('تكاليف المعدات', 'Equipment Costs'), value: costSheet.equipment, color: 'text-cyan-600', bg: 'bg-cyan-50/30', type: 'cost' as const },
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
          {rows.filter(r => r.type === 'revenue').map((row, idx) => (
            <div key={idx} className={`flex items-center justify-between py-2.5 ${idx < rows.filter(r => r.type === 'revenue').length - 1 ? 'border-b border-dashed border-gray-100' : ''}`}>
              <span className="text-sm font-medium text-gray-700">{row.label}</span>
              <span className={row.color}>
                <MoneyDisplay value={row.value} mode="system" lang={lang} bold size="md" />
              </span>
            </div>
          ))}
        </div>

        <div className="mx-6 border-t-2 border-emerald-200" />

        {/* Costs Section */}
        <div className="px-6 pt-3 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 mb-3">
            {t('التكاليف', 'Costs')}
          </p>
          {rows.filter(r => r.type === 'cost').map((row, idx) => (
            <div key={idx} className={`flex items-center justify-between py-2.5 ${idx < rows.filter(r => r.type === 'cost').length - 1 ? 'border-b border-dashed border-gray-100' : ''}`}>
              <span className="text-sm font-medium text-gray-700">{row.label}</span>
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
              <div className={`flex size-10 items-center justify-center rounded-full ${isProfit ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                <TrendingUp className={`size-5 ${profitColor}`} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">{t('الربح', 'Profit')}</p>
                <span className={profitColor}>
                  <MoneyDisplay value={costSheet.profit} mode="system" lang={lang} bold size="xl" />
                </span>
              </div>
            </div>
            <div className={`text-center rounded-xl px-5 py-3 ${isProfit ? 'bg-emerald-100' : 'bg-rose-100'}`}>
              <p className="text-xs font-medium text-gray-500 mb-1">{t('هامش الربح', 'Profit Margin')}</p>
              <p className={`text-3xl font-bold ${profitColor}`}>
                {Math.abs(costSheet.profitMargin).toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </div>
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
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{project.name}</h2>
            <Badge variant="outline" className={statusColors[project.status]}>
              {statusLabels[project.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{project.code} — {project.client.name}</p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
      </div>

      {/* Tabs */}
      <Tabs defaultValue="cost-sheet" dir="rtl">
        <TabsList>
          <TabsTrigger value="cost-sheet" className="gap-1.5">
            <Calculator className="size-4" /> {t('كرت المشروع', 'Project Card')}
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1.5">
            <FileText className="size-4" /> {t('العقود', 'Contracts')}
          </TabsTrigger>
          <TabsTrigger value="boq" className="gap-1.5">
            <ClipboardList className="size-4" /> {t('جدول الكميات', 'BOQ')}
          </TabsTrigger>
          <TabsTrigger value="claims" className="gap-1.5">
            <TrendingUp className="size-4" /> {t('المستخلصات', 'Claims')}
          </TabsTrigger>
        </TabsList>

        {/* Cost Sheet Tab */}
        <TabsContent value="cost-sheet">
          <CostSheetView costSheet={project.costSheet} projectName={project.name} lang={lang} />
        </TabsContent>

        {/* Contracts Tab */}
        <TabsContent value="contracts">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">عقود المشروع</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {project.contracts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم العقد</TableHead>
                      <TableHead className="text-right">القيمة</TableHead>
                      <TableHead className="text-right">ضريبة القيمة المضافة</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.contracts.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.contractNo}</TableCell>
                        <TableCell>{formatSAR(c.totalValue / (1 + 0.15), lang)}</TableCell>
                        <TableCell>{formatSAR(c.totalValue - c.totalValue / 1.15, lang)}</TableCell>
                        <TableCell className="font-semibold">{formatSAR(c.totalValue, lang)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={contractStatusColors[c.status]}>
                            {contractStatusLabels[c.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="px-6 py-6 text-center text-muted-foreground">لا توجد عقود لهذا المشروع</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOQ Tab */}
        <TabsContent value="boq">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">جدول الكميات</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {project.boqItems.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الكود</TableHead>
                      <TableHead className="text-right">الوصف</TableHead>
                      <TableHead className="text-right">الوحدة</TableHead>
                      <TableHead className="text-right">الكمية</TableHead>
                      <TableHead className="text-right">سعر الوحدة</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      let currentCategory = ''
                      const rows: React.ReactNode[] = []
                      project.boqItems.forEach((item, idx) => {
                        if (item.category && item.category !== currentCategory) {
                          currentCategory = item.category
                          rows.push(
                            <TableRow key={`cat-${idx}`} className="bg-emerald-50">
                              <TableCell colSpan={6} className="font-bold text-emerald-700">{currentCategory}</TableCell>
                            </TableRow>
                          )
                        }
                        rows.push(
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.code}</TableCell>
                            <TableCell>{item.description}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell>{formatNumber(item.quantity)}</TableCell>
                            <TableCell>{formatSAR(item.unitPrice, lang)}</TableCell>
                            <TableCell className="font-semibold">{formatSAR(item.totalPrice, lang)}</TableCell>
                          </TableRow>
                        )
                      })
                      const total = project.boqItems.reduce((s, i) => s + i.totalPrice, 0)
                      rows.push(
                        <TableRow key="total" className="bg-gray-50 font-bold">
                          <TableCell colSpan={5} className="text-left">الإجمالي</TableCell>
                          <TableCell>{formatSAR(total, lang)}</TableCell>
                        </TableRow>
                      )
                      return rows
                    })()}
                  </TableBody>
                </Table>
              ) : (
                <p className="px-6 py-6 text-center text-muted-foreground">لا توجد بنود في جدول الكميات</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Claims Tab */}
        <TabsContent value="claims">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">المستخلصات</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {project.progressClaims.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم المستخلص</TableHead>
                      <TableHead className="text-right">العقد</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">النسبة</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">الإجمالي مع الضريبة</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.progressClaims.map(cl => (
                      <TableRow key={cl.id}>
                        <TableCell className="font-medium">{cl.claimNo}</TableCell>
                        <TableCell>{cl.contract.contractNo}</TableCell>
                        <TableCell>{formatDate(cl.date, lang)}</TableCell>
                        <TableCell>{cl.percentage}%</TableCell>
                        <TableCell>{formatSAR(cl.amount, lang)}</TableCell>
                        <TableCell className="font-semibold">{formatSAR(cl.totalAmount, lang)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={claimStatusColors[cl.status]}>
                            {claimStatusLabels[cl.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-gray-50 font-bold">
                      <TableCell colSpan={4} className="text-left">إجمالي المستخلصات</TableCell>
                      <TableCell>{formatSAR(project.progressClaims.reduce((s, c) => s + c.amount, 0), lang)}</TableCell>
                      <TableCell>{formatSAR(project.progressClaims.reduce((s, c) => s + c.totalAmount, 0), lang)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <p className="px-6 py-6 text-center text-muted-foreground">لا توجد مستخلصات</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============ Main Projects Module ============
export function ProjectsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectListItem | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

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
    return matchSearch && matchStatus
  })

  // Detail view
  if (selectedProjectId && projectDetail) {
    return <ProjectDetailView project={projectDetail} onBack={() => setSelectedProjectId(null)} lang={lang} />
  }

  if (selectedProjectId && isLoadingDetail) {
    return <TableSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'المشاريع' : 'Projects'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة ومتابعة مشاريع المقاولات' : 'Manage and track construction projects'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث">
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingProject(null); setDialogOpen(true) }}>
            <Plus className="size-4" /> مشروع جديد
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الكود أو العميل..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="كل الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="PLANNING">تخطيط</SelectItem>
                <SelectItem value="ACTIVE">نشط</SelectItem>
                <SelectItem value="ON_HOLD">معلق</SelectItem>
                <SelectItem value="COMPLETED">مكتمل</SelectItem>
                <SelectItem value="CANCELLED">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Projects Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">حدث خطأ أثناء تحميل البيانات</p>
              <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Building2 className="size-12 text-gray-300" />
              <p className="text-muted-foreground">لا توجد مشاريع</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingProject(null); setDialogOpen(true) }}>
                <Plus className="size-4 mr-1" /> إنشاء مشروع
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">اسم المشروع</TableHead>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">الموقع</TableHead>
                    <TableHead className="text-right">تاريخ البدء</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setSelectedProjectId(p.id)}>
                      <TableCell className="font-medium">{p.code}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{p.client.name}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{p.location || '—'}</TableCell>
                      <TableCell>{formatDate(p.startDate, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[p.status]}>
                          {statusLabels[p.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setSelectedProjectId(p.id)} title="عرض">
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditingProject(p); setDialogOpen(true) }} title="تعديل">
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm('هل أنت متأكد من حذف المشروع؟')) deleteMutation.mutate(p.id) }} title="حذف">
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

      {/* Project Form Dialog */}
      <ProjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingProject={editingProject}
        clients={clients}
        branches={branches}
      />
    </div>
  )
}

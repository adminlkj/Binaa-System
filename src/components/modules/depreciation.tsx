'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TrendingDown, Plus, Search, RefreshCw, Play, FileText,
  Building2, Truck, Car, Monitor, Package, AlertCircle,
  CheckCircle2, XCircle, Calendar, Wallet, BarChart3,
  Eye, RotateCcw, Trash2, Pencil, Calculator, BookOpen,
  ChevronLeft, ChevronRight, Info,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ModuleLayout } from '@/components/shared/module-layout'
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatDate } from '@/stores/app-store'
import { toast } from 'sonner'

// ============ Types ============
interface FixedAsset {
  id: string
  assetCode: string
  name: string
  nameAr: string | null
  category: string
  acquisitionDate: string
  acquisitionCost: number
  residualValue: number
  usefulLifeMonths: number
  usefulLifeYears: number
  depreciationRate: number
  depreciationMethod: string
  monthlyDepreciation: number
  annualDepreciation: number
  accumulatedDepreciation: number
  netBookValue: number
  lastDepreciationDate: string | null
  status: string
  notes: string | null
  account?: { id: string; code: string; name: string; nameAr: string | null } | null
  depExpenseAccount?: { id: string; code: string; name: string; nameAr: string | null } | null
  accumDepAccount?: { id: string; code: string; name: string; nameAr: string | null } | null
  remainingMonths: number
  depreciatedMonths: number
  depreciationProgress: number
}

interface AssetSummary {
  totalAssets: number
  totalCost: number
  totalAccumulatedDep: number
  totalNetBookValue: number
  totalMonthlyDepreciation: number
  totalAnnualDepreciation: number
  activeAssets: number
  fullyDepreciated: number
}

interface ScheduleRow {
  period: string
  year: number
  month: number
  beginningNBV: number
  depreciationAmount: number
  accumulatedDepreciation: number
  endingNBV: number
  isPosted: boolean
  journalEntryNo?: string | null
}

interface DepreciationRecord {
  id: string
  fixedAssetId: string
  year: number
  month: number
  depreciationAmount: number
  beginningNBV: number
  endingNBV: number
  reversed: boolean
  reversedAt: string | null
  createdAt: string
  fixedAsset?: { assetCode: string; name: string; nameAr: string | null }
  journalEntry?: { id: string; entryNo: string; date: string; descriptionAr: string | null; status: string } | null
}

// ============ Bilingual Helpers ============
const t = (lang: 'ar' | 'en', ar: string, en: string) => lang === 'ar' ? ar : en

const categoryLabels: Record<string, { ar: string; en: string; icon: React.ElementType }> = {
  EQUIPMENT: { ar: 'معدات', en: 'Equipment', icon: Truck },
  VEHICLE: { ar: 'مركبات', en: 'Vehicles', icon: Car },
  OFFICE_EQUIPMENT: { ar: 'أجهزة مكتبية', en: 'Office Equipment', icon: Monitor },
  SOFTWARE: { ar: 'برمجيات', en: 'Software', icon: Package },
  BUILDING: { ar: 'مبانٍ', en: 'Building', icon: Building2 },
  FURNITURE: { ar: 'أثاث', en: 'Furniture', icon: Package },
  OTHER: { ar: 'أخرى', en: 'Other', icon: Building2 },
}

const statusLabels: Record<string, { ar: string; en: string; color: string }> = {
  ACTIVE: { ar: 'نشط', en: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  FULLY_DEPRECIATED: { ar: 'مستهلك بالكامل', en: 'Fully Depreciated', color: 'bg-gray-100 text-gray-700' },
  SOLD: { ar: 'مباع', en: 'Sold', color: 'bg-amber-100 text-amber-700' },
  DISPOSED: { ar: 'متخلص منه', en: 'Disposed', color: 'bg-rose-100 text-rose-700' },
}

const monthNames = (lang: 'ar' | 'en') => lang === 'ar'
  ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ============ Summary Card ============
function SummaryCard({ icon: Icon, label, value, color, lang }: {
  icon: React.ElementType
  label: { ar: string; en: string }
  value: number | string
  color: string
  lang: 'ar' | 'en'
}) {
  return (
    <Card className={`${color} border-0`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium opacity-80 truncate">{label[lang]}</p>
          {typeof value === 'number' ? (
            <MoneyDisplay value={value} lang={lang} bold className="text-lg" />
          ) : (
            <p className="text-lg font-bold">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============ Simplified Asset Form Dialog ============
// المستخدم يُدخل فقط: الاسم، النوع، القيمة، التاريخ، السنوات، النسبة
function AssetFormDialog({ open, onClose, editAsset }: {
  open: boolean
  onClose: () => void
  editAsset?: FixedAsset | null
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '', nameAr: '', category: 'EQUIPMENT',
    acquisitionDate: new Date().toISOString().split('T')[0],
    acquisitionCost: '', usefulLifeYears: '', depreciationRate: '',
    notes: '',
    // متقدم (اختياري)
    showAdvanced: false,
    accountId: '', depExpenseAccountId: '', accumDepAccountId: '',
    createAcquisitionEntry: true, payFrom: 'TREASURY' as 'TREASURY' | 'BANK',
  })

  React.useEffect(() => {
    if (editAsset) {
      setForm({
        name: editAsset.name,
        nameAr: editAsset.nameAr || '',
        category: editAsset.category,
        acquisitionDate: new Date(editAsset.acquisitionDate).toISOString().split('T')[0],
        acquisitionCost: String(editAsset.acquisitionCost),
        usefulLifeYears: String(editAsset.usefulLifeYears || (editAsset.usefulLifeMonths / 12)),
        depreciationRate: String(editAsset.depreciationRate),
        notes: editAsset.notes || '',
        showAdvanced: false,
        accountId: editAsset.account?.id || '',
        depExpenseAccountId: editAsset.depExpenseAccount?.id || '',
        accumDepAccountId: editAsset.accumDepAccount?.id || '',
        createAcquisitionEntry: false,
        payFrom: 'TREASURY',
      })
    } else {
      setForm(f => ({
        ...f,
        name: '', nameAr: '', category: 'EQUIPMENT',
        acquisitionDate: new Date().toISOString().split('T')[0],
        acquisitionCost: '', usefulLifeYears: '', depreciationRate: '',
        notes: '', showAdvanced: false,
        accountId: '', depExpenseAccountId: '', accumDepAccountId: '',
      }))
    }
  }, [editAsset, open])

  // حساب المعاينة الحي
  const preview = useMemo(() => {
    const cost = Number(form.acquisitionCost) || 0
    const years = Number(form.usefulLifeYears) || 0
    let rate = Number(form.depreciationRate) || 0
    if (rate <= 0 && years > 0) rate = 100 / years
    const annual = cost * (rate / 100)
    const monthly = annual / 12
    const residual = Math.max(0, cost - annual * years)
    const totalDep = cost - residual
    return { cost, years, rate, annual, monthly, residual, totalDep }
  }, [form.acquisitionCost, form.usefulLifeYears, form.depreciationRate])

  // Fetch accounts for advanced section
  const { data: fixedAssetAccounts } = useQuery({
    queryKey: ['accounts-by-role', 'FIXED_ASSET'],
    queryFn: async () => {
      const res = await fetch('/api/accounts/by-role?role=FIXED_ASSET')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : (data.accounts || [])
    },
    enabled: open && form.showAdvanced,
  })
  const { data: depExpenseAccounts } = useQuery({
    queryKey: ['accounts-by-role', 'DEPRECIATION_EXPENSE'],
    queryFn: async () => {
      const res = await fetch('/api/accounts/by-role?role=DEPRECIATION_EXPENSE')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : (data.accounts || [])
    },
    enabled: open && form.showAdvanced,
  })
  const { data: accumDepAccounts } = useQuery({
    queryKey: ['accounts-by-role', 'ACCUM_DEPRECIATION'],
    queryFn: async () => {
      const res = await fetch('/api/accounts/by-role?role=ACCUM_DEPRECIATION')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : (data.accounts || [])
    },
    enabled: open && form.showAdvanced,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        nameAr: form.nameAr || null,
        category: form.category,
        acquisitionDate: form.acquisitionDate,
        acquisitionCost: Number(form.acquisitionCost) || 0,
        usefulLifeYears: Number(form.usefulLifeYears) || 0,
        depreciationRate: Number(form.depreciationRate) || 0,
        notes: form.notes || null,
        accountId: form.accountId || null,
        depExpenseAccountId: form.depExpenseAccountId || null,
        accumDepAccountId: form.accumDepAccountId || null,
        createAcquisitionEntry: form.createAcquisitionEntry,
        payFrom: form.payFrom,
      }
      const url = editAsset ? `/api/fixed-assets/${editAsset.id}` : '/api/fixed-assets'
      const method = editAsset ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'فشل')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success(editAsset ? t(lang, 'تم تحديث الأصل وإعادة حساب الإهلاك', 'Asset updated & recalculated') : (data.message || t(lang, 'تم إنشاء الأصل', 'Asset created')))
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      queryClient.invalidateQueries({ queryKey: ['depreciation-report'] })
      queryClient.invalidateQueries({ queryKey: ['asset-depreciations'] })
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSubmit = () => {
    if (!form.name || !form.acquisitionCost || !form.usefulLifeYears) {
      toast.error(t(lang, 'يرجى تعبئة: الاسم، التكلفة، عدد السنوات', 'Please fill: name, cost, years'))
      return
    }
    if (Number(form.usefulLifeYears) <= 0) {
      toast.error(t(lang, 'عدد السنوات يجب أن يكون أكبر من صفر', 'Years must be > 0'))
      return
    }
    mutation.mutate()
  }

  const accountLabel = (a: any) => `${a.code} - ${lang === 'ar' && a.nameAr ? a.nameAr : a.name}`

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="size-5 text-teal-600" />
            {editAsset ? t(lang, 'تعديل أصل ثابت', 'Edit Fixed Asset') : t(lang, 'إضافة أصل ثابت', 'Add Fixed Asset')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t(lang,
              'أدخل البيانات الأساسية فقط — النظام يحسب الإهلاك ويُنشئ القيود تلقائياً',
              'Enter only basic data — the system calculates depreciation & creates journal entries automatically'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* المدخلات الأساسية فقط */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">{t(lang, 'اسم الأصل (عربي)', 'Asset Name (Arabic)')} *</Label>
            <Input value={form.nameAr} onChange={e => setForm({ ...form, nameAr: e.target.value, name: form.name || e.target.value })} placeholder="مثال: حفارة كاتربيلر 320" dir="rtl" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">{t(lang, 'اسم الأصل (إنجليزي)', 'Asset Name (English)')}</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t(lang, "مثال: حفار CAT 320", "e.g. Excavator CAT 320")} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'نوع الأصل', 'Asset Category')} *</Label>
            <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(categoryLabels).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{lang === 'ar' ? val.ar : val.en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'تاريخ الشراء', 'Acquisition Date')} *</Label>
            <Input type="date" value={form.acquisitionDate} onChange={e => setForm({ ...form, acquisitionDate: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'قيمة الشراء', 'Acquisition Cost')} *</Label>
            <Input type="number" value={form.acquisitionCost} onChange={e => setForm({ ...form, acquisitionCost: e.target.value })} placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'عدد السنوات', 'Useful Life (Years)')} *</Label>
            <Input type="number" value={form.usefulLifeYears} onChange={e => setForm({ ...form, usefulLifeYears: e.target.value })} placeholder="5" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">
              {t(lang, 'النسبة المقدرة للاهلاك سنوياً (%)', 'Estimated Annual Depreciation Rate (%)')}
            </Label>
            <Input
              type="number" step="0.1"
              value={form.depreciationRate}
              onChange={e => setForm({ ...form, depreciationRate: e.target.value })}
              placeholder={preview.years > 0 && !form.depreciationRate ? `${(100 / preview.years).toFixed(2)} (تلقائي)` : '10'}
            />
            <p className="text-[10px] text-muted-foreground">
              {t(lang,
                'إن تُركت فارغة تُحسب تلقائياً = 100 ÷ عدد السنوات',
                'If left empty, auto-calculated as 100 ÷ years'
              )}
            </p>
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">{t(lang, 'ملاحظات', 'Notes')}</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>

        {/* معاينة حية للإهلاك */}
        {preview.cost > 0 && preview.years > 0 && (
          <div className="bg-gradient-to-l from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="size-4 text-teal-600" />
              <p className="font-semibold text-teal-800 text-sm">
                {t(lang, 'معاينة حساب الإهلاك التلقائي', 'Auto Depreciation Preview')}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t(lang, 'النسبة السنوية', 'Annual Rate')}</p>
                <p className="font-bold text-teal-700">{preview.rate.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t(lang, 'إهلاك سنوي', 'Annual Dep.')}</p>
                <p className="font-bold text-teal-700">{preview.annual.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t(lang, 'إهلاك شهري', 'Monthly Dep.')}</p>
                <p className="font-bold text-teal-700">{preview.monthly.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t(lang, 'القيمة المتبقية', 'Residual')}</p>
                <p className="font-bold text-cyan-700">{preview.residual.toFixed(2)}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-teal-200 text-xs text-teal-700">
              {t(lang,
                `إجمالي الإهلاك على ${preview.years} سنوات = ${preview.totalDep.toFixed(2)}`,
                `Total depreciation over ${preview.years} years = ${preview.totalDep.toFixed(2)}`
              )}
            </div>
          </div>
        )}

        {/* القسم المتقدم (اختياري) */}
        {!editAsset && (
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => setForm({ ...form, showAdvanced: !form.showAdvanced })}
              className="w-full p-3 flex items-center justify-between text-sm font-medium hover:bg-gray-50"
            >
              <span className="flex items-center gap-2">
                <Info className="size-4 text-gray-500" />
                {t(lang, 'إعدادات متقدمة (اختياري)', 'Advanced Settings (optional)')}
              </span>
              <span className="text-xs text-muted-foreground">
                {form.showAdvanced ? '−' : '+'}
              </span>
            </button>
            {form.showAdvanced && (
              <div className="p-3 pt-0 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.createAcquisitionEntry}
                    onChange={e => setForm({ ...form, createAcquisitionEntry: e.target.checked })}
                    className="size-4"
                  />
                  <span className="text-sm font-medium">
                    {t(lang, 'إنشاء قيد التملك تلقائياً (Dr: أصل / Cr: خزينة)', 'Create acquisition JE automatically')}
                  </span>
                </label>
                {form.createAcquisitionEntry && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{t(lang, 'السداد من', 'Pay from')}</Label>
                      <Select value={form.payFrom} onValueChange={v => setForm({ ...form, payFrom: v as any })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TREASURY">{t(lang, 'الخزينة', 'Treasury')}</SelectItem>
                          <SelectItem value="BANK">{t(lang, 'البنك', 'Bank')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <Label className="text-xs">{t(lang, 'حساب الأصل (تلقائي من الدور)', 'Fixed Asset Account (auto)')}</Label>
                    <Select value={form.accountId} onValueChange={v => setForm({ ...form, accountId: v })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder={t(lang, 'تلقائي', 'Auto')} /></SelectTrigger>
                      <SelectContent>
                        {(fixedAssetAccounts || []).map((a: any) => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{t(lang, 'حساب مصروف الإهلاك', 'Depreciation Expense Account')}</Label>
                    <Select value={form.depExpenseAccountId} onValueChange={v => setForm({ ...form, depExpenseAccountId: v })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder={t(lang, 'تلقائي', 'Auto')} /></SelectTrigger>
                      <SelectContent>
                        {(depExpenseAccounts || []).map((a: any) => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{t(lang, 'حساب مجمع الإهلاك', 'Accumulated Depreciation Account')}</Label>
                    <Select value={form.accumDepAccountId} onValueChange={v => setForm({ ...form, accumDepAccountId: v })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder={t(lang, 'تلقائي', 'Auto')} /></SelectTrigger>
                      <SelectContent>
                        {(accumDepAccounts || []).map((a: any) => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t(lang, 'إلغاء', 'Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} className="gap-1">
            {mutation.isPending
              ? t(lang, 'جاري الحفظ...', 'Saving...')
              : editAsset
                ? <>{t(lang, 'تحديث وإعادة حساب', 'Update & Recalculate')}</>
                : <>{t(lang, 'إنشاء الأصل', 'Create Asset')}</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ Asset Detail Dialog (جدول الإهلاك الكامل) ============
function AssetDetailDialog({ assetId, open, onClose }: {
  assetId: string | null
  open: boolean
  onClose: () => void
}) {
  const { lang } = useAppStore()
  const [schedulePage, setSchedulePage] = useState(0)
  const pageSize = 12

  const { data, isLoading } = useQuery({
    queryKey: ['asset-detail', assetId],
    queryFn: async () => {
      const res = await fetch(`/api/fixed-assets/${assetId}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!assetId && open,
  })

  const schedule: ScheduleRow[] = data?.schedule || []
  const totalPages = Math.ceil(schedule.length / pageSize)
  const currentRows = schedule.slice(schedulePage * pageSize, (schedulePage + 1) * pageSize)

  React.useEffect(() => { setSchedulePage(0) }, [assetId])

  if (!data) return null
  const asset = data
  const calc = data.calculation || {}

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-5 text-teal-600" />
            {t(lang, 'تفاصيل الأصل وجدول الإهلاك', 'Asset Details & Depreciation Schedule')}
          </DialogTitle>
        </DialogHeader>

        {/* بطاقات معلومات الأصل */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-sky-50 border-0">
            <CardContent className="p-3">
              <p className="text-xs text-sky-700">{t(lang, 'قيمة الشراء', 'Acquisition Cost')}</p>
              <MoneyDisplay value={asset.acquisitionCost} lang={lang} bold className="text-sky-800" />
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-0">
            <CardContent className="p-3">
              <p className="text-xs text-amber-700">{t(lang, 'مجمع الإهلاك', 'Accum. Dep.')}</p>
              <MoneyDisplay value={asset.accumulatedDepreciation} lang={lang} bold className="text-amber-800" />
            </CardContent>
          </Card>
          <Card className="bg-emerald-50 border-0">
            <CardContent className="p-3">
              <p className="text-xs text-emerald-700">{t(lang, 'القيمة الدفترية', 'Net Book Value')}</p>
              <MoneyDisplay value={asset.netBookValue} lang={lang} bold className="text-emerald-800" />
            </CardContent>
          </Card>
          <Card className="bg-teal-50 border-0">
            <CardContent className="p-3">
              <p className="text-xs text-teal-700">{t(lang, 'إهلاك شهري', 'Monthly Dep.')}</p>
              <MoneyDisplay value={asset.monthlyDepreciation || calc.monthlyDepreciation} lang={lang} bold className="text-teal-800" />
            </CardContent>
          </Card>
        </div>

        {/* معلومات الحسابات المحاسبية */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="size-4 text-teal-600" />
              <h4 className="font-semibold text-sm">{t(lang, 'الحسابات المحاسبية المرتبطة', 'Linked Accounting Accounts')}</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <div className="border rounded p-2">
                <p className="text-xs text-muted-foreground">{t(lang, 'حساب الأصل', 'Asset Account')}</p>
                <p className="font-mono font-semibold">{asset.account?.code || '—'}</p>
                <p className="text-xs">{asset.account ? (lang === 'ar' && asset.account.nameAr ? asset.account.nameAr : asset.account.name) : t(lang, 'غير مربوط', 'Not linked')}</p>
              </div>
              <div className="border rounded p-2">
                <p className="text-xs text-muted-foreground">{t(lang, 'مصروف الإهلاك', 'Dep. Expense')}</p>
                <p className="font-mono font-semibold">{asset.depExpenseAccount?.code || '—'}</p>
                <p className="text-xs">{asset.depExpenseAccount ? (lang === 'ar' && asset.depExpenseAccount.nameAr ? asset.depExpenseAccount.nameAr : asset.depExpenseAccount.name) : '—'}</p>
              </div>
              <div className="border rounded p-2">
                <p className="text-xs text-muted-foreground">{t(lang, 'مجمع الإهلاك', 'Accum. Dep.')}</p>
                <p className="font-mono font-semibold">{asset.accumDepAccount?.code || '—'}</p>
                <p className="text-xs">{asset.accumDepAccount ? (lang === 'ar' && asset.accumDepAccount.nameAr ? asset.accumDepAccount.nameAr : asset.accumDepAccount.name) : '—'}</p>
              </div>
            </div>
            {asset.acquisitionEntry && (
              <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
                <FileText className="size-4 text-sky-600" />
                <span className="text-muted-foreground">{t(lang, 'قيد التملك:', 'Acquisition Entry:')}</span>
                <span className="font-mono font-semibold">{asset.acquisitionEntry.entryNo}</span>
                <span className="text-xs text-muted-foreground">— {formatDate(asset.acquisitionEntry.date, lang)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* جدول الإهلاك الكامل */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold flex items-center gap-2 text-sm">
                <Calendar className="size-4 text-teal-600" />
                {t(lang, 'جدول الإهلاك الكامل', 'Full Depreciation Schedule')}
              </h4>
              <Badge variant="outline" className="text-xs">
                {schedule.filter(r => r.isPosted).length} / {schedule.length} {t(lang, 'منفذ', 'posted')}
              </Badge>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="text-right">{t(lang, 'الفترة', 'Period')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'القيمة بداية الشهر', 'Beginning NBV')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'مبلغ الإهلاك', 'Depreciation')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'مجمع الإهلاك', 'Accum. Dep.')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'القيمة نهاية الشهر', 'Ending NBV')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الحالة', 'Status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">{t(lang, 'جاري التحميل...', 'Loading...')}</TableCell></TableRow>
                  ) : currentRows.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">{t(lang, 'لا توجد بيانات', 'No data')}</TableCell></TableRow>
                  ) : currentRows.map((row) => (
                    <TableRow key={row.period} className={row.isPosted ? 'bg-emerald-50/50' : ''}>
                      <TableCell className="font-mono text-xs">
                        {monthNames(lang)[row.month - 1]} {row.year}
                      </TableCell>
                      <TableCell><MoneyDisplay value={row.beginningNBV} lang={lang} size="sm" /></TableCell>
                      <TableCell><MoneyDisplay value={row.depreciationAmount} lang={lang} size="sm" className="text-teal-700" /></TableCell>
                      <TableCell><MoneyDisplay value={row.accumulatedDepreciation} lang={lang} size="sm" className="text-amber-700" /></TableCell>
                      <TableCell><MoneyDisplay value={row.endingNBV} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                      <TableCell>
                        {row.isPosted ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs gap-1">
                            <CheckCircle2 className="size-3" />
                            {t(lang, 'منفذ', 'Posted')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">{t(lang, 'متوقع', 'Expected')}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* ترقيم الصفحات */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setSchedulePage(p => Math.max(0, p - 1))}
                  disabled={schedulePage === 0}
                  className="gap-1"
                >
                  <ChevronRight className="size-4" />
                  {t(lang, 'السابق', 'Prev')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t(lang, `صفحة ${schedulePage + 1} من ${totalPages}`, `Page ${schedulePage + 1} of ${totalPages}`)}
                </span>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setSchedulePage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={schedulePage >= totalPages - 1}
                  className="gap-1"
                >
                  {t(lang, 'التالي', 'Next')}
                  <ChevronLeft className="size-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}

// ============ Delete Confirmation Dialog ============
function DeleteDialog({ asset, open, onClose }: {
  asset: FixedAsset | null
  open: boolean
  onClose: () => void
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/fixed-assets/${asset!.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'فشل')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success(data.message || t(lang, 'تم حذف الأصل', 'Asset deleted'))
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <AlertCircle className="size-5" />
            {t(lang, 'تأكيد حذف الأصل', 'Confirm Asset Deletion')}
          </DialogTitle>
          <DialogDescription>
            {t(lang,
              `سيتم عكس قيد التملك وحذف الأصل "${asset?.nameAr || asset?.name}". لا يمكن التراجع.`,
              `This will reverse the acquisition entry and delete asset "${asset?.name}". Cannot be undone.`
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t(lang, 'إلغاء', 'Cancel')}</Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1">
            <Trash2 className="size-4" />
            {mutation.isPending ? t(lang, 'جاري الحذف...', 'Deleting...') : t(lang, 'حذف نهائي', 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ Assets Tab ============
function AssetsTab({ onAdd }: { onAdd: () => void }) {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [detailAsset, setDetailAsset] = useState<string | null>(null)
  const [editAsset, setEditAsset] = useState<FixedAsset | null>(null)
  const [deleteAsset, setDeleteAsset] = useState<FixedAsset | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data, isLoading, refetch } = useQuery<{ assets: FixedAsset[]; summary: AssetSummary }>({
    queryKey: ['fixed-assets', search, categoryFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      const res = await fetch(`/api/fixed-assets?${params}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const assets = data?.assets || []
  const summary = data?.summary

  const handleEdit = (a: FixedAsset) => {
    setEditAsset(a)
    setEditOpen(true)
  }
  const handleDelete = (a: FixedAsset) => {
    setDeleteAsset(a)
    setDeleteOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={Package} label={{ ar: 'إجمالي الأصول', en: 'Total Assets' }} value={summary.totalAssets} color="bg-teal-50 text-teal-700" lang={lang} />
          <SummaryCard icon={Wallet} label={{ ar: 'إجمالي التكلفة', en: 'Total Cost' }} value={summary.totalCost} color="bg-sky-50 text-sky-700" lang={lang} />
          <SummaryCard icon={TrendingDown} label={{ ar: 'مجمع الإهلاك', en: 'Accum. Dep.' }} value={summary.totalAccumulatedDep} color="bg-amber-50 text-amber-700" lang={lang} />
          <SummaryCard icon={BarChart3} label={{ ar: 'صافي القيمة الدفترية', en: 'Net Book Value' }} value={summary.totalNetBookValue} color="bg-emerald-50 text-emerald-700" lang={lang} />
        </div>
      )}

      {/* Monthly/Annual Depreciation Card */}
      {summary && (
        <Card className="bg-gradient-to-l from-teal-50 to-cyan-50 border-teal-200">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calculator className="size-5 text-teal-600" />
              <div>
                <p className="text-xs font-medium text-teal-700">{t(lang, 'إجمالي الإهلاك الشهري المتوقع', 'Total Monthly Depreciation')}</p>
                <MoneyDisplay value={summary.totalMonthlyDepreciation} lang={lang} bold className="text-teal-800 text-lg" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="size-5 text-cyan-600" />
              <div>
                <p className="text-xs font-medium text-cyan-700">{t(lang, 'إجمالي الإهلاك السنوي المتوقع', 'Total Annual Depreciation')}</p>
                <MoneyDisplay value={summary.totalAnnualDepreciation} lang={lang} bold className="text-cyan-800 text-lg" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-end">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">{t(lang, 'بحث', 'Search')}</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t(lang, 'كود أو اسم الأصل...', 'Code or name...')} className="pr-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'الفئة', 'Category')}</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t(lang, 'الكل', 'All')}</SelectItem>
                {Object.entries(categoryLabels).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{lang === 'ar' ? val.ar : val.en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'الحالة', 'Status')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t(lang, 'الكل', 'All')}</SelectItem>
                {Object.entries(statusLabels).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{lang === 'ar' ? val.ar : val.en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="size-4" />
          </Button>
          <Button onClick={onAdd} className="gap-1">
            <Plus className="size-4" />
            {t(lang, 'إضافة أصل', 'Add Asset')}
          </Button>
        </CardContent>
      </Card>

      {/* Assets Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t(lang, 'الكود', 'Code')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'الاسم', 'Name')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'الفئة', 'Category')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'تاريخ الشراء', 'Acq. Date')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'التكلفة', 'Cost')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'النسبة', 'Rate')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'إهلاك شهري', 'Monthly Dep.')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'مجمع الإهلاك', 'Accum. Dep.')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'القيمة الدفترية', 'Book Value')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'التقدم', 'Progress')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'الحالة', 'Status')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'إجراءات', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">{t(lang, 'جاري التحميل...', 'Loading...')}</TableCell></TableRow>
                ) : assets.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">{t(lang, 'لا توجد أصول — أضف أول أصل ثابت', 'No assets — add your first fixed asset')}</TableCell></TableRow>
                ) : assets.map(a => {
                  const cat = categoryLabels[a.category] || categoryLabels.OTHER
                  const stat = statusLabels[a.status] || statusLabels.ACTIVE
                  const CatIcon = cat.icon
                  return (
                    <TableRow key={a.id} className="hover:bg-muted/40">
                      <TableCell className="font-mono text-xs">{a.assetCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CatIcon className="size-4 text-muted-foreground shrink-0" />
                          <span className="font-medium">{lang === 'ar' && a.nameAr ? a.nameAr : a.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{lang === 'ar' ? cat.ar : cat.en}</TableCell>
                      <TableCell className="text-xs">{formatDate(a.acquisitionDate, lang)}</TableCell>
                      <TableCell><MoneyDisplay value={a.acquisitionCost} lang={lang} size="sm" /></TableCell>
                      <TableCell className="text-xs">{(a.depreciationRate || 0).toFixed(2)}%</TableCell>
                      <TableCell><MoneyDisplay value={a.monthlyDepreciation} lang={lang} size="sm" className="text-teal-700" /></TableCell>
                      <TableCell><MoneyDisplay value={a.accumulatedDepreciation} lang={lang} size="sm" className="text-amber-700" /></TableCell>
                      <TableCell><MoneyDisplay value={a.netBookValue} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                      <TableCell className="text-xs w-24">
                        <div className="flex items-center gap-1">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[40px]">
                            <div
                              className="bg-teal-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, a.depreciationProgress || 0)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono">{(a.depreciationProgress || 0).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${stat.color} border-0 text-xs`}>{lang === 'ar' ? stat.ar : stat.en}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => setDetailAsset(a.id)}
                            title={t(lang, 'عرض الجدول', 'View Schedule')}
                            className="size-7 p-0"
                          >
                            <Eye className="size-3.5 text-sky-600" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleEdit(a)}
                            title={t(lang, 'تعديل', 'Edit')}
                            className="size-7 p-0"
                          >
                            <Pencil className="size-3.5 text-amber-600" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleDelete(a)}
                            title={t(lang, 'حذف', 'Delete')}
                            className="size-7 p-0"
                          >
                            <Trash2 className="size-3.5 text-rose-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <AssetDetailDialog
        assetId={detailAsset}
        open={!!detailAsset}
        onClose={() => setDetailAsset(null)}
      />

      {/* Edit Dialog */}
      <AssetFormDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditAsset(null) }}
        editAsset={editAsset}
      />

      {/* Delete Dialog */}
      <DeleteDialog
        asset={deleteAsset}
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeleteAsset(null) }}
      />
    </div>
  )
}

// ============ Run Depreciation Tab ============
function RunDepreciationTab() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [results, setResults] = useState<any>(null)

  const { data: previewData, isLoading: previewLoading } = useQuery<{ assets: FixedAsset[]; summary: AssetSummary }>({
    queryKey: ['fixed-assets-preview'],
    queryFn: async () => {
      const res = await fetch('/api/fixed-assets?status=ACTIVE')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/fixed-assets/depreciate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'فشل')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success(data.message)
      setResults(data)
      setConfirmOpen(false)
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      queryClient.invalidateQueries({ queryKey: ['fixed-assets-preview'] })
      queryClient.invalidateQueries({ queryKey: ['asset-depreciations'] })
      queryClient.invalidateQueries({ queryKey: ['depreciation-report'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setConfirmOpen(false)
    },
  })

  const previewAssets = (previewData?.assets || []).filter(a => a.status === 'ACTIVE')
  const totalPreview = previewAssets.reduce((s, a) => s + (a.monthlyDepreciation || 0), 0)

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <Card className="bg-teal-50/50 border-teal-200">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <p className="text-sm font-semibold mb-1">{t(lang, 'فترة الإهلاك', 'Depreciation Period')}</p>
            <p className="text-xs text-muted-foreground">{t(lang, 'اختر الشهر والسنة لتشغيل الإهلاك لجميع الأصول النشطة', 'Select month/year to run depreciation for all active assets')}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'الشهر', 'Month')}</Label>
            <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthNames(lang).map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'السنة', 'Year')}</Label>
            <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={previewAssets.length === 0}
            className="gap-1 bg-teal-600 hover:bg-teal-700"
          >
            <Play className="size-4" />
            {t(lang, 'تشغيل الإهلاك', 'Run Depreciation')}
          </Button>
        </CardContent>
      </Card>

      {/* Preview Table */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <FileText className="size-4 text-teal-600" />
              {t(lang, 'معاينة الأصول المراد إهلاكها', 'Preview of Assets to Depreciate')}
            </h3>
            <Badge variant="outline">{previewAssets.length} {t(lang, 'أصل', 'assets')}</Badge>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="text-right">{t(lang, 'الكود', 'Code')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'الاسم', 'Name')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'التكلفة', 'Cost')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'مجمع الإهلاك', 'Accum. Dep.')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'القيمة الدفترية', 'Current NBV')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'إهلاك شهري', 'Monthly Dep.')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'القيمة بعد الإهلاك', 'New NBV')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">{t(lang, 'جاري التحميل...', 'Loading...')}</TableCell></TableRow>
                ) : previewAssets.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">{t(lang, 'لا توجد أصول نشطة', 'No active assets')}</TableCell></TableRow>
                ) : previewAssets.map(a => {
                  const newNBV = a.netBookValue - (a.monthlyDepreciation || 0)
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.assetCode}</TableCell>
                      <TableCell className="font-medium">{lang === 'ar' && a.nameAr ? a.nameAr : a.name}</TableCell>
                      <TableCell><MoneyDisplay value={a.acquisitionCost} lang={lang} size="sm" /></TableCell>
                      <TableCell><MoneyDisplay value={a.accumulatedDepreciation} lang={lang} size="sm" className="text-amber-700" /></TableCell>
                      <TableCell><MoneyDisplay value={a.netBookValue} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                      <TableCell><MoneyDisplay value={a.monthlyDepreciation} lang={lang} size="sm" className="text-teal-700" /></TableCell>
                      <TableCell><MoneyDisplay value={Math.max(a.residualValue, newNBV)} lang={lang} size="sm" /></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {previewAssets.length > 0 && (
            <div className="mt-3 pt-3 border-t flex justify-between items-center">
              <span className="text-sm font-semibold">{t(lang, 'إجمالي الإهلاك المتوقع', 'Total Expected Depreciation')}</span>
              <MoneyDisplay value={totalPreview} lang={lang} bold className="text-teal-700 text-lg" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              <h3 className="font-semibold text-emerald-800">{t(lang, 'نتيجة تشغيل الإهلاك', 'Depreciation Run Result')}</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">{t(lang, 'أصول مُعالَجة', 'Processed')}</p>
                <p className="text-xl font-bold text-emerald-700">{results.processed}</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">{t(lang, 'أصول متخطاة', 'Skipped')}</p>
                <p className="text-xl font-bold text-amber-700">{results.skipped}</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">{t(lang, 'إجمالي الإهلاك', 'Total Depreciation')}</p>
                <p className="text-xl font-bold text-teal-700">{(results.totalAmount || 0).toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">{t(lang, 'قيود مُنشأة', 'Journal Entries')}</p>
                <p className="text-xl font-bold text-sky-700">{results.journalEntryIds?.length || 0}</p>
              </div>
            </div>
            {results.skipped > 0 && results.skippedDetails?.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-amber-700 font-medium">{t(lang, 'عرض الأصول المتخطاة', 'Show skipped assets')}</summary>
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {results.skippedDetails.map((s: any, i: number) => (
                    <div key={i} className="text-xs bg-amber-50 rounded p-1.5">
                      <span className="font-mono">{s.assetCode}</span> - {s.assetName}: {s.skipReason || s.reason}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="size-5 text-amber-600" />
              {t(lang, 'تأكيد تشغيل الإهلاك', 'Confirm Depreciation Run')}
            </DialogTitle>
            <DialogDescription>
              {t(lang,
                `سيتم إنشاء قيود إهلاك لـ ${previewAssets.length} أصل نشط لفترة ${monthNames(lang)[month - 1]} ${year}. إجمالي الإهلاك: ${totalPreview.toFixed(2)}.`,
                `Depreciation entries will be created for ${previewAssets.length} active assets for ${monthNames('en')[month - 1]} ${year}. Total: ${totalPreview.toFixed(2)}.`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t(lang, 'إلغاء', 'Cancel')}</Button>
            <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} className="gap-1">
              {runMutation.isPending ? t(lang, 'جاري التنفيذ...', 'Running...') : t(lang, 'تأكيد التنفيذ', 'Confirm & Execute')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ Depreciation Records Tab (مع عكس) ============
function DepreciationRecordsTab() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [yearFilter, setYearFilter] = useState('ALL')
  const [assetFilter, setAssetFilter] = useState('ALL')
  const [reverseTarget, setReverseTarget] = useState<DepreciationRecord | null>(null)

  const { data, isLoading, refetch } = useQuery<{ records: DepreciationRecord[]; summary: any }>({
    queryKey: ['asset-depreciations', yearFilter, assetFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (yearFilter !== 'ALL') params.set('year', yearFilter)
      if (assetFilter !== 'ALL') params.set('fixedAssetId', assetFilter)
      const res = await fetch(`/api/asset-depreciations?${params}`)
      if (!res.ok) return { records: [], summary: {} }
      return res.json()
    },
  })

  const { data: assetsData } = useQuery<{ assets: FixedAsset[] }>({
    queryKey: ['fixed-assets'],
    queryFn: async () => {
      const res = await fetch('/api/fixed-assets')
      if (!res.ok) return { assets: [] }
      return res.json()
    },
  })

  const records = data?.records || []
  const summary = data?.summary
  const years = Array.from(new Set(records.map(r => r.year))).sort((a, b) => b - a)

  const reverseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/asset-depreciations/${id}/reverse`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'فشل')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success(data.message || t(lang, 'تم عكس الإهلاك', 'Depreciation reversed'))
      queryClient.invalidateQueries({ queryKey: ['asset-depreciations'] })
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      setReverseTarget(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="space-y-4">
      {/* ملخص */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={FileText} label={{ ar: 'إجمالي السجلات', en: 'Total Records' }} value={summary.totalRecords || 0} color="bg-sky-50 text-sky-700" lang={lang} />
          <SummaryCard icon={CheckCircle2} label={{ ar: 'سجلات نشطة', en: 'Active Records' }} value={summary.activeRecords || 0} color="bg-emerald-50 text-emerald-700" lang={lang} />
          <SummaryCard icon={RotateCcw} label={{ ar: 'سجلات معكوسة', en: 'Reversed' }} value={summary.reversedRecords || 0} color="bg-amber-50 text-amber-700" lang={lang} />
          <SummaryCard icon={TrendingDown} label={{ ar: 'إجمالي المبلغ', en: 'Total Amount' }} value={summary.totalAmount || 0} color="bg-teal-50 text-teal-700" lang={lang} />
        </div>
      )}

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'السنة', 'Year')}</Label>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t(lang, 'الكل', 'All')}</SelectItem>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">{t(lang, 'الأصل', 'Asset')}</Label>
            <Select value={assetFilter} onValueChange={setAssetFilter}>
              <SelectTrigger><SelectValue placeholder={t(lang, 'كل الأصول', 'All assets')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t(lang, 'كل الأصول', 'All assets')}</SelectItem>
                {(assetsData?.assets || []).map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.assetCode} - {lang === 'ar' && a.nameAr ? a.nameAr : a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="size-4" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="text-right">{t(lang, 'الأصل', 'Asset')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'الفترة', 'Period')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'القيمة بداية الشهر', 'Beginning NBV')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'مبلغ الإهلاك', 'Depreciation Amount')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'القيمة نهاية الشهر', 'Ending NBV')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'رقم القيد', 'Entry No')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'الحالة', 'Status')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'إجراء', 'Action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t(lang, 'جاري التحميل...', 'Loading...')}</TableCell></TableRow>
                ) : records.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t(lang, 'لا توجد قيود إهلاك', 'No depreciation records')}</TableCell></TableRow>
                ) : records.map(r => (
                  <TableRow key={r.id} className={r.reversed ? 'opacity-60 bg-amber-50/30' : ''}>
                    <TableCell>
                      <span className="font-medium">{r.fixedAsset ? (lang === 'ar' && r.fixedAsset.nameAr ? r.fixedAsset.nameAr : r.fixedAsset.name) : '—'}</span>
                      {r.fixedAsset && <span className="text-xs text-muted-foreground block font-mono">{r.fixedAsset.assetCode}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{monthNames(lang)[r.month - 1]} {r.year}</TableCell>
                    <TableCell><MoneyDisplay value={r.beginningNBV} lang={lang} size="sm" /></TableCell>
                    <TableCell><MoneyDisplay value={r.depreciationAmount} lang={lang} size="sm" className="text-teal-700" /></TableCell>
                    <TableCell><MoneyDisplay value={r.endingNBV} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                    <TableCell className="font-mono text-xs">{r.journalEntry?.entryNo || '—'}</TableCell>
                    <TableCell>
                      {r.reversed ? (
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-xs gap-1">
                          <XCircle className="size-3" />
                          {t(lang, 'معكوس', 'Reversed')}
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs gap-1">
                          <CheckCircle2 className="size-3" />
                          {t(lang, 'فعّال', 'Active')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!r.reversed && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setReverseTarget(r)}
                          className="gap-1 text-amber-700 hover:text-amber-800"
                        >
                          <RotateCcw className="size-3.5" />
                          {t(lang, 'عكس', 'Reverse')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {records.length > 0 && summary && (
            <div className="border-t p-3 flex justify-between items-center">
              <span className="font-semibold">{t(lang, 'الإجمالي النشط', 'Active Total')}</span>
              <MoneyDisplay value={summary.totalAmount || 0} lang={lang} bold className="text-teal-700" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reverse Confirmation */}
      <Dialog open={!!reverseTarget} onOpenChange={() => setReverseTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <RotateCcw className="size-5" />
              {t(lang, 'تأكيد عكس الإهلاك', 'Confirm Reversal')}
            </DialogTitle>
            <DialogDescription>
              {t(lang,
                `سيتم عكس قيد الإهلاك لـ "${reverseTarget?.fixedAsset?.nameAr || reverseTarget?.fixedAsset?.name}" لفترة ${reverseTarget ? monthNames(lang)[reverseTarget.month - 1] : ''} ${reverseTarget?.year}. سيُعاد حساب مجمع الإهلاك والقيمة الدفترية للأصل.`,
                `This will reverse the depreciation entry for "${reverseTarget?.fixedAsset?.name}" for ${reverseTarget ? monthNames('en')[reverseTarget.month - 1] : ''} ${reverseTarget?.year}. The asset's accumulated depreciation and NBV will be recalculated.`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseTarget(null)}>{t(lang, 'إلغاء', 'Cancel')}</Button>
            <Button
              variant="default"
              onClick={() => reverseTarget && reverseMutation.mutate(reverseTarget.id)}
              disabled={reverseMutation.isPending}
              className="gap-1 bg-amber-600 hover:bg-amber-700"
            >
              <RotateCcw className="size-4" />
              {reverseMutation.isPending ? t(lang, 'جاري العكس...', 'Reversing...') : t(lang, 'تأكيد العكس', 'Confirm Reverse')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ Report Tab ============
function ReportTab() {
  const { lang } = useAppStore()
  const { data, isLoading } = useQuery({
    queryKey: ['depreciation-report'],
    queryFn: async () => {
      const res = await fetch('/api/fixed-assets/report')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const summary = data?.summary
  const categorySummary = data?.categorySummary || []

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={Package} label={{ ar: 'إجمالي الأصول', en: 'Total Assets' }} value={summary.totalAssets} color="bg-teal-50 text-teal-700" lang={lang} />
          <SummaryCard icon={Wallet} label={{ ar: 'إجمالي التكلفة', en: 'Total Cost' }} value={summary.totalCost} color="bg-sky-50 text-sky-700" lang={lang} />
          <SummaryCard icon={TrendingDown} label={{ ar: 'إجمالي الإهلاك', en: 'Total Depreciation' }} value={summary.totalAccumDep} color="bg-amber-50 text-amber-700" lang={lang} />
          <SummaryCard icon={BarChart3} label={{ ar: 'صافي القيمة', en: 'Net Book Value' }} value={summary.totalNBV} color="bg-emerald-50 text-emerald-700" lang={lang} />
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="size-4 text-teal-600" />
            {t(lang, 'تقرير الإهلاك حسب الفئة', 'Depreciation by Category')}
          </h3>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">{t(lang, 'جاري التحميل...', 'Loading...')}</p>
          ) : categorySummary.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{t(lang, 'لا توجد بيانات', 'No data')}</p>
          ) : (
            <div className="space-y-3">
              {categorySummary.map((cat: any) => {
                const catInfo = categoryLabels[cat.category] || categoryLabels.OTHER
                const CatIcon = catInfo.icon
                const percentage = summary?.totalCost ? (cat.cost / summary.totalCost) * 100 : 0
                return (
                  <div key={cat.category} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CatIcon className="size-4 text-muted-foreground" />
                        <span className="font-medium">{lang === 'ar' ? catInfo.ar : catInfo.en}</span>
                        <Badge variant="outline" className="text-xs">{cat.count} {t(lang, 'أصل', 'assets')}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                      <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${percentage}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">{t(lang, 'التكلفة', 'Cost')}</p>
                        <MoneyDisplay value={cat.cost} lang={lang} size="sm" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t(lang, 'الإهلاك', 'Depreciation')}</p>
                        <MoneyDisplay value={cat.accumDep} lang={lang} size="sm" className="text-amber-700" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t(lang, 'القيمة الدفترية', 'NBV')}</p>
                        <MoneyDisplay value={cat.nbv} lang={lang} size="sm" className="text-emerald-700" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {data?.monthlyTrend?.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Calendar className="size-4 text-teal-600" />
              {t(lang, 'اتجاه الإهلاك الشهري', 'Monthly Depreciation Trend')}
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.monthlyTrend.map((item: any) => (
                <div key={item.period} className="flex items-center gap-3">
                  <span className="text-xs font-mono w-20">{item.period}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 relative">
                    <div
                      className="bg-teal-500 h-4 rounded-full"
                      style={{ width: `${Math.min(100, (item.amount / Math.max(...data.monthlyTrend.map((m: any) => m.amount))) * 100)}%` }}
                    />
                  </div>
                  <MoneyDisplay value={item.amount} lang={lang} size="sm" className="w-24 text-left" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Main Module ============
export function DepreciationModule() {
  const { lang } = useAppStore()
  const [activeTab, setActiveTab] = useState('assets')
  const [formOpen, setFormOpen] = useState(false)

  return (
    <ModuleLayout
      title={{ ar: 'الإهلاك', en: 'Depreciation' }}
      subtitle={{
        ar: 'إدارة الأصول الثابتة — أدخل البيانات الأساسية والنظام يحسب الإهلاك ويُنشئ القيود تلقائياً',
        en: 'Fixed assets — enter basic data, system auto-calculates depreciation & creates journal entries'
      }}
      actions={
        <Button onClick={() => setFormOpen(true)} className="gap-1">
          <Plus className="size-4" />
          {t(lang, 'إضافة أصل', 'Add Asset')}
        </Button>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-max min-w-full overflow-x-auto">
          <TabsTrigger value="assets" className="gap-1 text-xs whitespace-nowrap">
            <Package className="size-3.5" />
            {t(lang, 'الأصول الثابتة', 'Fixed Assets')}
          </TabsTrigger>
          <TabsTrigger value="run" className="gap-1 text-xs whitespace-nowrap">
            <Play className="size-3.5" />
            {t(lang, 'تشغيل الإهلاك', 'Run Depreciation')}
          </TabsTrigger>
          <TabsTrigger value="records" className="gap-1 text-xs whitespace-nowrap">
            <FileText className="size-3.5" />
            {t(lang, 'سجلات الإهلاك', 'Depreciation Records')}
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1 text-xs whitespace-nowrap">
            <BarChart3 className="size-3.5" />
            {t(lang, 'تقرير الإهلاك', 'Report')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets">
          <AssetsTab onAdd={() => setFormOpen(true)} />
        </TabsContent>
        <TabsContent value="run">
          <RunDepreciationTab />
        </TabsContent>
        <TabsContent value="records">
          <DepreciationRecordsTab />
        </TabsContent>
        <TabsContent value="report">
          <ReportTab />
        </TabsContent>
      </Tabs>

      <AssetFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </ModuleLayout>
  )
}

'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TrendingDown, Plus, Search, RefreshCw, Play, FileText,
  Building2, Truck, Car, Monitor, Package, AlertCircle,
  CheckCircle2, XCircle, Calendar, Wallet, BarChart3,
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
  depreciationMethod: string
  accumulatedDepreciation: number
  netBookValue: number
  status: string
  monthlyDepreciation: number
  remainingMonths: number
  depreciatedMonths: number
  depreciationCount: number
  account?: { id: string; code: string; name: string; nameAr: string | null } | null
  depExpenseAccount?: { id: string; code: string; name: string; nameAr: string | null } | null
  accumDepAccount?: { id: string; code: string; name: string; nameAr: string | null } | null
}

interface AssetSummary {
  totalAssets: number
  totalCost: number
  totalAccumulatedDep: number
  totalNetBookValue: number
  activeAssets: number
  fullyDepreciated: number
}

interface DepreciationRecord {
  id: string
  fixedAssetId: string
  year: number
  month: number
  depreciationAmount: number
  journalEntryId: string | null
  createdAt: string
  fixedAsset?: { assetCode: string; name: string; nameAr: string | null }
  journalEntry?: { id: string; entryNo: string; date: string; descriptionAr: string | null } | null
}

interface AccountOption { id: string; code: string; name: string; nameAr: string | null }

// ============ Bilingual Helpers ============
const t = (lang: 'ar' | 'en', ar: string, en: string) => lang === 'ar' ? ar : en

const categoryLabels: Record<string, { ar: string; en: string; icon: React.ElementType }> = {
  EQUIPMENT: { ar: 'معدات', en: 'Equipment', icon: Truck },
  VEHICLE: { ar: 'مركبات', en: 'Vehicles', icon: Car },
  OFFICE_EQUIPMENT: { ar: 'أجهزة مكتبية', en: 'Office Equipment', icon: Monitor },
  SOFTWARE: { ar: 'برمجيات', en: 'Software', icon: Package },
  OTHER: { ar: 'أخرى', en: 'Other', icon: Building2 },
}

const statusLabels: Record<string, { ar: string; en: string; color: string }> = {
  ACTIVE: { ar: 'نشط', en: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  FULLY_DEPRECIATED: { ar: 'مستهلك بالكامل', en: 'Fully Depreciated', color: 'bg-gray-100 text-gray-700' },
  SOLD: { ar: 'مباع', en: 'Sold', color: 'bg-amber-100 text-amber-700' },
  DISPOSED: { ar: 'متخلص منه', en: 'Disposed', color: 'bg-rose-100 text-rose-700' },
}

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

// ============ Asset Form Dialog ============
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
    acquisitionCost: '', residualValue: '0', usefulLifeMonths: '',
    depreciationMethod: 'STRAIGHT_LINE',
    accountId: '', depExpenseAccountId: '', accumDepAccountId: '',
    payFrom: 'TREASURY', createAcquisitionEntry: true,
  })

  // Fetch accounts by role
  const { data: fixedAssetAccounts } = useQuery<AccountOption[]>({
    queryKey: ['accounts-by-role', 'FIXED_ASSET'],
    queryFn: async () => {
      const res = await fetch('/api/accounts/by-role?role=FIXED_ASSET')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : (data.accounts || [])
    },
    enabled: open,
  })
  const { data: depExpenseAccounts } = useQuery<AccountOption[]>({
    queryKey: ['accounts-by-role', 'DEPRECIATION_EXPENSE'],
    queryFn: async () => {
      const res = await fetch('/api/accounts/by-role?role=DEPRECIATION_EXPENSE')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : (data.accounts || [])
    },
    enabled: open,
  })
  const { data: accumDepAccounts } = useQuery<AccountOption[]>({
    queryKey: ['accounts-by-role', 'ACCUM_DEPRECIATION'],
    queryFn: async () => {
      const res = await fetch('/api/accounts/by-role?role=ACCUM_DEPRECIATION')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : (data.accounts || [])
    },
    enabled: open,
  })

  React.useEffect(() => {
    if (editAsset) {
      setForm({
        name: editAsset.name,
        nameAr: editAsset.nameAr || '',
        category: editAsset.category,
        acquisitionDate: new Date(editAsset.acquisitionDate).toISOString().split('T')[0],
        acquisitionCost: String(editAsset.acquisitionCost),
        residualValue: String(editAsset.residualValue),
        usefulLifeMonths: String(editAsset.usefulLifeMonths),
        depreciationMethod: editAsset.depreciationMethod,
        accountId: editAsset.account?.id || '',
        depExpenseAccountId: editAsset.depExpenseAccount?.id || '',
        accumDepAccountId: editAsset.accumDepAccount?.id || '',
        payFrom: 'TREASURY',
        createAcquisitionEntry: false,
      })
    } else {
      setForm(f => ({
        ...f,
        name: '', nameAr: '', category: 'EQUIPMENT',
        acquisitionDate: new Date().toISOString().split('T')[0],
        acquisitionCost: '', residualValue: '0', usefulLifeMonths: '',
        accountId: '', depExpenseAccountId: '', accumDepAccountId: '',
      }))
    }
  }, [editAsset, open])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        acquisitionCost: Number(form.acquisitionCost) || 0,
        residualValue: Number(form.residualValue) || 0,
        usefulLifeMonths: parseInt(form.usefulLifeMonths) || 0,
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
      toast.success(editAsset ? t(lang, 'تم تحديث الأصل', 'Asset updated') : (data.message || t(lang, 'تم إنشاء الأصل', 'Asset created')))
      queryClient.invalidateQueries({ queryKey: ['fixed-assets'] })
      queryClient.invalidateQueries({ queryKey: ['depreciation-report'] })
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSubmit = () => {
    if (!form.name || !form.acquisitionCost || !form.usefulLifeMonths) {
      toast.error(t(lang, 'يرجى تعبئة الحقول المطلوبة', 'Please fill required fields'))
      return
    }
    mutation.mutate()
  }

  const accountLabel = (a: AccountOption) => `${a.code} - ${lang === 'ar' && a.nameAr ? a.nameAr : a.name}`

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="size-5 text-teal-600" />
            {editAsset ? t(lang, 'تعديل أصل ثابت', 'Edit Fixed Asset') : t(lang, 'إضافة أصل ثابت', 'Add Fixed Asset')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">{t(lang, 'اسم الأصل (إنجليزي)', 'Asset Name (English)')} *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Excavator CAT 320" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">{t(lang, 'اسم الأصل (عربي)', 'Asset Name (Arabic)')}</Label>
            <Input value={form.nameAr} onChange={e => setForm({ ...form, nameAr: e.target.value })} placeholder="مثال: حفارة كاتربيلر 320" dir="rtl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'الفئة', 'Category')} *</Label>
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
            <Label className="text-xs">{t(lang, 'تاريخ التملك', 'Acquisition Date')} *</Label>
            <Input type="date" value={form.acquisitionDate} onChange={e => setForm({ ...form, acquisitionDate: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'تكلفة التملك', 'Acquisition Cost')} *</Label>
            <Input type="number" value={form.acquisitionCost} onChange={e => setForm({ ...form, acquisitionCost: e.target.value })} placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'القيمة المتبقية', 'Residual Value')}</Label>
            <Input type="number" value={form.residualValue} onChange={e => setForm({ ...form, residualValue: e.target.value })} placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'العمر الإنتاجي (شهور)', 'Useful Life (months)')} *</Label>
            <Input type="number" value={form.usefulLifeMonths} onChange={e => setForm({ ...form, usefulLifeMonths: e.target.value })} placeholder="60" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'طريقة الإهلاك', 'Depreciation Method')}</Label>
            <Select value={form.depreciationMethod} onValueChange={v => setForm({ ...form, depreciationMethod: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="STRAIGHT_LINE">{t(lang, 'القسط الثابت', 'Straight Line')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t(lang, 'الحسابات المحاسبية (اختياري - تُجلب تلقائياً من الأدوار)', 'Accounting Accounts (optional - auto from roles)')}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'حساب الأصل', 'Fixed Asset Account')}</Label>
            <Select value={form.accountId} onValueChange={v => setForm({ ...form, accountId: v })}>
              <SelectTrigger><SelectValue placeholder={t(lang, 'تلقائي (FIXED_ASSET)', 'Auto (FIXED_ASSET)')} /></SelectTrigger>
              <SelectContent>
                {(fixedAssetAccounts || []).map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'حساب مصروف الإهلاك', 'Depreciation Expense Account')}</Label>
            <Select value={form.depExpenseAccountId} onValueChange={v => setForm({ ...form, depExpenseAccountId: v })}>
              <SelectTrigger><SelectValue placeholder={t(lang, 'تلقائي (DEPRECIATION_EXPENSE)', 'Auto (DEPRECIATION_EXPENSE)')} /></SelectTrigger>
              <SelectContent>
                {(depExpenseAccounts || []).map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">{t(lang, 'حساب مجمع الإهلاك', 'Accumulated Depreciation Account')}</Label>
            <Select value={form.accumDepAccountId} onValueChange={v => setForm({ ...form, accumDepAccountId: v })}>
              <SelectTrigger><SelectValue placeholder={t(lang, 'تلقائي (ACCUM_DEPRECIATION)', 'Auto (ACCUM_DEPRECIATION)')} /></SelectTrigger>
              <SelectContent>
                {(accumDepAccounts || []).map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!editAsset && (
            <div className="col-span-2 bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.createAcquisitionEntry}
                  onChange={e => setForm({ ...form, createAcquisitionEntry: e.target.checked })}
                  className="size-4"
                />
                <span className="text-sm font-medium">{t(lang, 'إنشاء قيد محاسبي للتملك', 'Create acquisition journal entry')}</span>
              </label>
              {form.createAcquisitionEntry && (
                <div>
                  <Label className="text-xs">{t(lang, 'السداد من', 'Pay from')}</Label>
                  <Select value={form.payFrom} onValueChange={v => setForm({ ...form, payFrom: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TREASURY">{t(lang, 'الخزينة', 'Treasury (CASH)')}</SelectItem>
                      <SelectItem value="BANK">{t(lang, 'البنك', 'Bank (BANK)')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Preview */}
        {form.acquisitionCost && form.usefulLifeMonths && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-semibold mb-1">{t(lang, 'معاينة الإهلاك الشهري', 'Monthly Depreciation Preview')}</p>
            <p className="text-muted-foreground">
              {t(lang, 'الإهلاك الشهري', 'Monthly Depreciation')}: <span className="font-bold text-teal-600">
                {(((Number(form.acquisitionCost) || 0) - (Number(form.residualValue) || 0)) / (parseInt(form.usefulLifeMonths) || 1)).toFixed(2)}
              </span>
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t(lang, 'إلغاء', 'Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? t(lang, 'جاري الحفظ...', 'Saving...') : (editAsset ? t(lang, 'تحديث', 'Update') : t(lang, 'إنشاء', 'Create'))}
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
                  <TableHead className="text-right">{t(lang, 'تاريخ التملك', 'Acq. Date')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'التكلفة', 'Cost')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'مجمع الإهلاك', 'Accum. Dep.')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'القيمة الدفترية', 'Book Value')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'إهلاك شهري', 'Monthly Dep.')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'متبقي', 'Remaining')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'الحالة', 'Status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">{t(lang, 'جاري التحميل...', 'Loading...')}</TableCell></TableRow>
                ) : assets.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">{t(lang, 'لا توجد أصول — أضف أول أصل ثابت', 'No assets — add your first fixed asset')}</TableCell></TableRow>
                ) : assets.map(a => {
                  const cat = categoryLabels[a.category] || categoryLabels.OTHER
                  const stat = statusLabels[a.status] || statusLabels.ACTIVE
                  const CatIcon = cat.icon
                  return (
                    <TableRow key={a.id}>
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
                      <TableCell><MoneyDisplay value={a.accumulatedDepreciation} lang={lang} size="sm" className="text-amber-700" /></TableCell>
                      <TableCell><MoneyDisplay value={a.netBookValue} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                      <TableCell><MoneyDisplay value={a.monthlyDepreciation} lang={lang} size="sm" /></TableCell>
                      <TableCell className="text-xs">{a.remainingMonths} {t(lang, 'شهر', 'mo')}</TableCell>
                      <TableCell>
                        <Badge className={`${stat.color} border-0 text-xs`}>{lang === 'ar' ? stat.ar : stat.en}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
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

  // Preview assets
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
      queryClient.invalidateQueries({ queryKey: ['depreciation-schedule'] })
      queryClient.invalidateQueries({ queryKey: ['depreciation-report'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setConfirmOpen(false)
    },
  })

  const previewAssets = (previewData?.assets || []).filter(a => a.status === 'ACTIVE')
  const totalPreview = previewAssets.reduce((s, a) => s + a.monthlyDepreciation, 0)

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <Card className="bg-teal-50/50 border-teal-200">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <p className="text-sm font-semibold mb-1">{t(lang, 'فترة الإهلاك', 'Depreciation Period')}</p>
            <p className="text-xs text-muted-foreground">{t(lang, 'اختر الشهر والسنة لتشغيل الإهلاك', 'Select month and year to run depreciation')}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t(lang, 'الشهر', 'Month')}</Label>
            <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <SelectItem key={m} value={String(m)}>{m}</SelectItem>
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
                  const newNBV = a.netBookValue - a.monthlyDepreciation
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
                      <span className="font-mono">{s.assetCode}</span> - {s.assetName}: {s.reason}
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
                `سيتم إنشاء قيود إهلاك لـ ${previewAssets.length} أصل نشط لفترة ${month}/${year}. إجمالي الإهلاك: ${totalPreview.toFixed(2)}. لا يمكن التراجع عن هذه العملية.`,
                `Depreciation journal entries will be created for ${previewAssets.length} active assets for period ${month}/${year}. Total: ${totalPreview.toFixed(2)}. This cannot be undone.`
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

// ============ Depreciation Schedule Tab ============
function ScheduleTab() {
  const { lang } = useAppStore()
  const [yearFilter, setYearFilter] = useState('ALL')
  const [assetFilter, setAssetFilter] = useState('ALL')

  const { data: schedule, isLoading, refetch } = useQuery<DepreciationRecord[]>({
    queryKey: ['depreciation-schedule', yearFilter, assetFilter],
    queryFn: async () => {
      const res = await fetch('/api/asset-depreciations')
      if (!res.ok) return []
      const data = await res.json()
      const records = Array.isArray(data) ? data : (data.records || [])
      let filtered = records
      if (yearFilter !== 'ALL') filtered = filtered.filter((r: DepreciationRecord) => r.year === parseInt(yearFilter))
      if (assetFilter !== 'ALL') filtered = filtered.filter((r: DepreciationRecord) => r.fixedAssetId === assetFilter)
      return filtered
    },
  })

  // Fetch assets for filter dropdown
  const { data: assetsData } = useQuery<{ assets: FixedAsset[] }>({
    queryKey: ['fixed-assets'],
    queryFn: async () => {
      const res = await fetch('/api/fixed-assets')
      if (!res.ok) return { assets: [] }
      return res.json()
    },
  })

  const records = schedule || []
  const totalAmount = records.reduce((s, r) => s + r.depreciationAmount, 0)
  const years = Array.from(new Set(records.map(r => r.year))).sort((a, b) => b - a)

  return (
    <div className="space-y-4">
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
                  <TableHead className="text-right">{t(lang, 'مبلغ الإهلاك', 'Depreciation Amount')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'رقم القيد', 'Entry No')}</TableHead>
                  <TableHead className="text-right">{t(lang, 'التاريخ', 'Date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t(lang, 'جاري التحميل...', 'Loading...')}</TableCell></TableRow>
                ) : records.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t(lang, 'لا توجد قيود إهلاك', 'No depreciation records')}</TableCell></TableRow>
                ) : records.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="font-medium">{r.fixedAsset ? (lang === 'ar' && r.fixedAsset.nameAr ? r.fixedAsset.nameAr : r.fixedAsset.name) : '—'}</span>
                      {r.fixedAsset && <span className="text-xs text-muted-foreground block font-mono">{r.fixedAsset.assetCode}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{r.month}/{r.year}</TableCell>
                    <TableCell><MoneyDisplay value={r.depreciationAmount} lang={lang} size="sm" className="text-teal-700" /></TableCell>
                    <TableCell className="font-mono text-xs">{r.journalEntry?.entryNo || '—'}</TableCell>
                    <TableCell className="text-xs">{formatDate(r.createdAt, lang)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {records.length > 0 && (
            <div className="border-t p-3 flex justify-between items-center">
              <span className="font-semibold">{t(lang, 'الإجمالي', 'Total')}</span>
              <MoneyDisplay value={totalAmount} lang={lang} bold className="text-teal-700" />
            </div>
          )}
        </CardContent>
      </Card>
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

      {/* Monthly trend */}
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
      subtitle={{ ar: 'إدارة الأصول الثابتة وتشغيل الإهلاك التلقائي مع القيود المحاسبية', en: 'Fixed assets management with automatic depreciation journal entries' }}
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
          <TabsTrigger value="schedule" className="gap-1 text-xs whitespace-nowrap">
            <Calendar className="size-3.5" />
            {t(lang, 'جدول الإهلاك', 'Schedule')}
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
        <TabsContent value="schedule">
          <ScheduleTab />
        </TabsContent>
        <TabsContent value="report">
          <ReportTab />
        </TabsContent>
      </Tabs>

      <AssetFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </ModuleLayout>
  )
}

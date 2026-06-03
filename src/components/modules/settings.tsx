'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Plus, RefreshCw, Building2, Warehouse, Target, Coins, Users,
  Save, Eye, Globe, Phone, Mail, FileText, CreditCard, Stamp, ImageIcon, Hash,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import { useAppStore, formatNumber } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { Switch } from '@/components/ui/switch'

// ============ Types ============
interface Branch { id: string; code: string; name: string; address: string | null; isActive: boolean }
interface Warehouse { id: string; code: string; name: string; branchId: string; isActive: boolean; branch: { id: string; code: string; name: string } }
interface CostCenter { id: string; code: string; name: string; parentId: string | null; parent: { id: string; code: string; name: string } | null; children: { id: string; code: string; name: string }[] }
interface Currency { id: string; code: string; name: string; symbol: string; rate: number; isActive: boolean }
interface Employee { id: string; code: string; name: string; position: string | null; branchId: string; phone: string | null; email: string | null; isActive: boolean; branch: { id: string; code: string; name: string } }

interface CompanySettings {
  id?: string
  nameAr: string
  nameEn: string
  taxNumber: string | null
  commercialReg: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  bankName: string | null
  bankIban: string | null
  bankAccountName: string | null
  defaultVatRate: number
  currencySymbol: string
  currencySymbolEn: string
  currencySymbolAr: string
  useThousandSeparatorsSystem: boolean
  useThousandSeparatorsOfficial: boolean
  invoiceTerms: string | null
  logoUrl: string | null
  stamp: string | null
}

function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Company Settings Tab ============
function CompanySettingsTab() {
  const { lang, setCurrencySymbol, setThousandSeparatorSettings: updateStoreSeparators } = useAppStore()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CompanySettings>({
    nameAr: '',
    nameEn: '',
    taxNumber: '',
    commercialReg: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    bankName: '',
    bankIban: '',
    bankAccountName: '',
    defaultVatRate: 0.15,
    currencySymbol: '\uFDFC',
    currencySymbolEn: 'SAR',
    currencySymbolAr: 'ر.س',
    useThousandSeparatorsSystem: true,
    useThousandSeparatorsOfficial: false,
    invoiceTerms: '',
    logoUrl: '',
    stamp: '',
  })

  const { data: settings, isLoading } = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const r = await fetch('/api/company-settings')
      if (!r.ok) throw new Error('Failed to fetch')
      return r.json()
    },
  })

  const settingsData = settings ? {
    nameAr: settings.nameAr || '',
    nameEn: settings.nameEn || '',
    taxNumber: settings.taxNumber || '',
    commercialReg: settings.commercialReg || '',
    address: settings.address || '',
    phone: settings.phone || '',
    email: settings.email || '',
    website: settings.website || '',
    bankName: settings.bankName || '',
    bankIban: settings.bankIban || '',
    bankAccountName: settings.bankAccountName || '',
    defaultVatRate: settings.defaultVatRate ?? 0.15,
    currencySymbol: settings.currencySymbol || '\uFDFC',
    currencySymbolEn: settings.currencySymbolEn || 'SAR',
    currencySymbolAr: settings.currencySymbolAr || 'ر.س',
    useThousandSeparatorsSystem: settings.useThousandSeparatorsSystem ?? true,
    useThousandSeparatorsOfficial: settings.useThousandSeparatorsOfficial ?? false,
    invoiceTerms: settings.invoiceTerms || '',
    logoUrl: settings.logoUrl || '',
    stamp: settings.stamp || '',
  } : null

  // Sync form when settings load (only once)
  const settingsLoadedRef = React.useRef(false)
  React.useEffect(() => {
    if (settingsData && !settingsLoadedRef.current) {
      settingsLoadedRef.current = true
      setForm(settingsData)
    }
  }, [settingsData])

  const saveMutation = useMutation({
    mutationFn: (data: CompanySettings) =>
      fetch('/api/company-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => {
        if (!r.ok) throw new Error('Failed to save')
        return r.json()
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
      // Update global currency symbols
      setCurrencySymbol(
        data.currencySymbol || '\uFDFC',
        data.currencySymbolEn || 'SAR',
        data.currencySymbolAr || 'ر.س'
      )
      // Update thousand separator settings in global store
      updateStoreSeparators(
        data.useThousandSeparatorsSystem ?? true,
        data.useThousandSeparatorsOfficial ?? false
      )
    },
  })

  const handleSave = () => {
    saveMutation.mutate(form)
  }

  const updateField = (field: keyof CompanySettings, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          <Save className="size-4" />
          {saveMutation.isPending
            ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...')
            : (lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
        </Button>
      </div>

      {saveMutation.isSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-700 text-sm">
          {lang === 'ar' ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully'}
        </div>
      )}

      {saveMutation.isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
          {lang === 'ar' ? 'فشل في حفظ الإعدادات' : 'Failed to save settings'}
        </div>
      )}

      {/* Company Names */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-emerald-600" />
            {lang === 'ar' ? 'أسماء الشركة' : 'Company Names'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الاسم بالعربية *' : 'Arabic Name *'}</Label>
            <Input
              value={form.nameAr}
              onChange={e => updateField('nameAr', e.target.value)}
              placeholder={lang === 'ar' ? 'شركة البناء الحديثة للمقاولات' : 'Al Binaa Al Haditha Contracting Co.'}
            />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الاسم بالإنجليزية *' : 'English Name *'}</Label>
            <Input
              value={form.nameEn}
              onChange={e => updateField('nameEn', e.target.value)}
              placeholder="Al Binaa Al Haditha Contracting Co."
              dir="ltr"
            />
          </div>
        </CardContent>
      </Card>

      {/* Registration & Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-emerald-600" />
            {lang === 'ar' ? 'التسجيل والتواصل' : 'Registration & Contact'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الرقم الضريبي' : 'Tax Number'}</Label>
            <Input
              value={form.taxNumber || ''}
              onChange={e => updateField('taxNumber', e.target.value)}
              placeholder="300123456700003"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'السجل التجاري' : 'Commercial Registration'}</Label>
            <Input
              value={form.commercialReg || ''}
              onChange={e => updateField('commercialReg', e.target.value)}
              placeholder="1234567890"
              dir="ltr"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{lang === 'ar' ? 'العنوان' : 'Address'}</Label>
            <Input
              value={form.address || ''}
              onChange={e => updateField('address', e.target.value)}
              placeholder={lang === 'ar' ? 'الدمام - المملكة العربية السعودية' : 'Dammam - Saudi Arabia'}
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Phone className="size-3" /> {lang === 'ar' ? 'الهاتف' : 'Phone'}</Label>
            <Input
              value={form.phone || ''}
              onChange={e => updateField('phone', e.target.value)}
              placeholder="0500000000"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Mail className="size-3" /> {lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</Label>
            <Input
              type="email"
              value={form.email || ''}
              onChange={e => updateField('email', e.target.value)}
              placeholder="info@company.com"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Globe className="size-3" /> {lang === 'ar' ? 'الموقع الإلكتروني' : 'Website'}</Label>
            <Input
              value={form.website || ''}
              onChange={e => updateField('website', e.target.value)}
              placeholder="www.company.com"
              dir="ltr"
            />
          </div>
        </CardContent>
      </Card>

      {/* Bank Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4 text-emerald-600" />
            {lang === 'ar' ? 'بيانات البنك' : 'Bank Information'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'اسم البنك' : 'Bank Name'}</Label>
            <Input
              value={form.bankName || ''}
              onChange={e => updateField('bankName', e.target.value)}
              placeholder={lang === 'ar' ? 'الراجحي' : 'Al Rajhi Bank'}
            />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'IBAN' : 'IBAN'}</Label>
            <Input
              value={form.bankIban || ''}
              onChange={e => updateField('bankIban', e.target.value)}
              placeholder="SA00 8000 0000 6080 1016 7519"
              dir="ltr"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{lang === 'ar' ? 'اسم الحساب' : 'Account Name'}</Label>
            <Input
              value={form.bankAccountName || ''}
              onChange={e => updateField('bankAccountName', e.target.value)}
              placeholder={lang === 'ar' ? 'شركة البناء الحديثة للمقاولات' : 'Company Account Name'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Currency & VAT */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="size-4 text-emerald-600" />
            {lang === 'ar' ? 'العملة والضريبة' : 'Currency & VAT'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'رمز العملة (عربي)' : 'Currency Symbol (Arabic)'}</Label>
              <Input
                value={form.currencySymbol}
                onChange={e => updateField('currencySymbol', e.target.value)}
                placeholder="﷼"
              />
              <p className="text-xs text-muted-foreground">
                {lang === 'ar' ? 'الافتراضي: ﷼' : 'Default: ﷼'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'رمز العملة (إنجليزي)' : 'Currency Symbol (English)'}</Label>
              <Input
                value={form.currencySymbolEn}
                onChange={e => updateField('currencySymbolEn', e.target.value)}
                placeholder="SAR"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                {lang === 'ar' ? 'الافتراضي: SAR' : 'Default: SAR'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'رمز العملة (اختصار عربي)' : 'Currency Symbol (Arabic Abbr.)'}</Label>
              <Input
                value={form.currencySymbolAr}
                onChange={e => updateField('currencySymbolAr', e.target.value)}
                placeholder="ر.س"
              />
              <p className="text-xs text-muted-foreground">
                {lang === 'ar' ? 'الافتراضي: ر.س' : 'Default: ر.س'}
              </p>
            </div>
          </div>

          {/* Live Preview */}
          <div className="rounded-lg border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="size-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700">
                {lang === 'ar' ? 'معاينة مباشرة' : 'Live Preview'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-md bg-white p-3 text-center border">
                <p className="text-xs text-muted-foreground mb-1">
                  {lang === 'ar' ? 'عرض عربي' : 'Arabic Display'}
                </p>
                <p className="text-lg font-bold" dir="rtl">
                  150,000.00 {form.currencySymbol}
                </p>
              </div>
              <div className="rounded-md bg-white p-3 text-center border">
                <p className="text-xs text-muted-foreground mb-1">
                  {lang === 'ar' ? 'عرض إنجليزي' : 'English Display'}
                </p>
                <p className="text-lg font-bold" dir="ltr">
                  {form.currencySymbolEn} 150,000.00
                </p>
              </div>
              <div className="rounded-md bg-white p-3 text-center border">
                <p className="text-xs text-muted-foreground mb-1">
                  {lang === 'ar' ? 'اختصار عربي' : 'Arabic Abbreviation'}
                </p>
                <p className="text-lg font-bold" dir="rtl">
                  150,000.00 {form.currencySymbolAr}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'نسبة ضريبة القيمة المضافة الافتراضية' : 'Default VAT Rate'}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={form.defaultVatRate}
                  onChange={e => updateField('defaultVatRate', parseFloat(e.target.value) || 0)}
                  dir="ltr"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  ({(form.defaultVatRate * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Number Format / تنسيق المبالغ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Hash className="size-4 text-emerald-600" />
            {lang === 'ar' ? 'تنسيق المبالغ' : 'Number Format'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* System thousand separators toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {lang === 'ar' ? 'استخدام فواصل الآلاف داخل النظام' : 'Use thousand separators in system'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {lang === 'ar'
                  ? 'عرض المبالغ بفواصل الآلاف في شاشات النظام الداخلية'
                  : 'Display amounts with thousand separators in system screens'}
              </p>
            </div>
            <Switch
              checked={form.useThousandSeparatorsSystem}
              onCheckedChange={(checked: boolean) =>
                setForm(prev => ({ ...prev, useThousandSeparatorsSystem: checked }))
              }
            />
          </div>

          {/* Official documents thousand separators toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {lang === 'ar' ? 'استخدام فواصل الآلاف في المستندات الرسمية' : 'Use thousand separators in official documents'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {lang === 'ar'
                  ? 'عرض المبالغ بفواصل الآلاف في الفواتير والمستندات الرسمية (فاتورة ضريبية، مستخلصات...)'
                  : 'Display amounts with thousand separators in invoices and official documents (tax invoices, claims...)'}
              </p>
            </div>
            <Switch
              checked={form.useThousandSeparatorsOfficial}
              onCheckedChange={(checked: boolean) =>
                setForm(prev => ({ ...prev, useThousandSeparatorsOfficial: checked }))
              }
            />
          </div>

          {/* Live Preview */}
          <div className="rounded-lg border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="size-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700">
                {lang === 'ar' ? 'معاينة مباشرة' : 'Live Preview'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-md bg-white p-3 text-center border">
                <p className="text-xs text-muted-foreground mb-2">
                  {lang === 'ar' ? 'داخل النظام' : 'Inside System'}
                </p>
                <MoneyDisplay
                  value={42514.85}
                  mode={form.useThousandSeparatorsSystem ? 'system' : 'official'}
                  lang={lang}
                  symbolAr={form.currencySymbol}
                  symbolEn={form.currencySymbolEn}
                  size="lg"
                  bold
                />
              </div>
              <div className="rounded-md bg-white p-3 text-center border">
                <p className="text-xs text-muted-foreground mb-2">
                  {lang === 'ar' ? 'المستندات الرسمية' : 'Official Documents'}
                </p>
                <MoneyDisplay
                  value={42514.85}
                  mode={form.useThousandSeparatorsOfficial ? 'system' : 'official'}
                  lang={lang}
                  symbolAr={form.currencySymbol}
                  symbolEn={form.currencySymbolEn}
                  size="lg"
                  bold
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-emerald-600" />
            {lang === 'ar' ? 'إعدادات الفاتورة' : 'Invoice Settings'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'شروط الفاتورة' : 'Invoice Terms'}</Label>
            <Textarea
              value={form.invoiceTerms || ''}
              onChange={e => updateField('invoiceTerms', e.target.value)}
              placeholder={lang === 'ar'
                ? 'مدة السداد 30 يوماً من تاريخ الفاتورة\nهذه الفاتورة صادرة إلكترونياً'
                : 'Payment due within 30 days\nThis is an electronically generated invoice'}
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Logo & Stamp */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="size-4 text-emerald-600" />
            {lang === 'ar' ? 'الشعار والختم' : 'Logo & Stamp'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'رابط الشعار (Logo URL)' : 'Logo URL'}</Label>
            <Input
              value={form.logoUrl || ''}
              onChange={e => updateField('logoUrl', e.target.value)}
              placeholder="https://example.com/logo.png"
              dir="ltr"
            />
            {form.logoUrl && (
              <div className="mt-2 rounded-md border bg-white p-2 flex items-center justify-center h-20">
                <img
                  src={form.logoUrl}
                  alt="Logo Preview"
                  className="max-h-16 max-w-full object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Stamp className="size-3" /> {lang === 'ar' ? 'رابط الختم (Stamp URL)' : 'Stamp URL'}</Label>
            <Input
              value={form.stamp || ''}
              onChange={e => updateField('stamp', e.target.value)}
              placeholder="https://example.com/stamp.png"
              dir="ltr"
            />
            {form.stamp && (
              <div className="mt-2 rounded-md border bg-white p-2 flex items-center justify-center h-20">
                <img
                  src={form.stamp}
                  alt="Stamp Preview"
                  className="max-h-16 max-w-full object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Branch Dialog ============
function BranchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  React.useEffect(() => { if (open) { setName(''); setAddress('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/branches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ name, address: address || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'فرع جديد' : 'New Branch'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة فرع جديد' : 'Add new branch'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'اسم الفرع *' : 'Branch Name *'}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'العنوان' : 'Address'}</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} />
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

// ============ Warehouse Dialog ============
function WarehouseDialog({ open, onOpenChange, branches }: { open: boolean; onOpenChange: (v: boolean) => void; branches: Branch[] }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState('')

  React.useEffect(() => { if (open) { setName(''); setBranchId('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/warehouses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['warehouses'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ name, branchId })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'مستودع جديد' : 'New Warehouse'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة مستودع جديد' : 'Add new warehouse'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'اسم المستودع *' : 'Warehouse Name *'}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الفرع *' : 'Branch *'}</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر الفرع' : 'Select branch'} /></SelectTrigger>
              <SelectContent>
                {branches.filter(b => b.isActive).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !name || !branchId} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Cost Center Dialog ============
function CostCenterDialog({ open, onOpenChange, costCenters }: { open: boolean; onOpenChange: (v: boolean) => void; costCenters: CostCenter[] }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')

  React.useEffect(() => { if (open) { setName(''); setParentId('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/cost-centers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cost-centers'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ name, parentId: parentId || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'مركز تكلفة جديد' : 'New Cost Center'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة مركز تكلفة جديد' : 'Add new cost center'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الاسم *' : 'Name *'}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'مركز أب' : 'Parent Center'}</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'مركز رئيسي' : 'Root center'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{lang === 'ar' ? 'رئيسي (بدون أب)' : 'Root (no parent)'}</SelectItem>
                {costCenters.filter(cc => !cc.parentId).map(cc => (
                  <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

// ============ Main Settings Module ============
export function SettingsModule() {
  const { lang } = useAppStore()
  const [activeTab, setActiveTab] = useState('company')
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false)
  const [costCenterDialogOpen, setCostCenterDialogOpen] = useState(false)

  // Fetch data
  const { data: branches = [], isLoading: loadingBranches, refetch: refetchBranches } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => { const r = await fetch('/api/branches'); if (!r.ok) return []; return r.json() },
  })

  const { data: warehouses = [], isLoading: loadingWarehouses, refetch: refetchWarehouses } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: async () => { const r = await fetch('/api/warehouses'); if (!r.ok) return []; return r.json() },
  })

  const { data: costCenters = [], isLoading: loadingCC, refetch: refetchCC } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers'],
    queryFn: async () => { const r = await fetch('/api/cost-centers'); if (!r.ok) return []; return r.json() },
  })

  const { data: currencies = [], isLoading: loadingCurrencies } = useQuery<Currency[]>({
    queryKey: ['currencies'],
    queryFn: async () => { const r = await fetch('/api/currencies'); if (!r.ok) return []; return r.json() },
  })

  const { data: employees = [], isLoading: loadingEmployees } = useQuery<Employee[]>({
    queryKey: ['employees-full'],
    queryFn: async () => { const r = await fetch('/api/employees'); if (!r.ok) return []; return r.json() },
  })

  const refetchAll = () => { refetchBranches(); refetchWarehouses(); refetchCC() }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'الإعدادات' : 'Settings'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إعدادات النظام والبيانات الأساسية' : 'System settings and master data'}</p>
        </div>
        <Button variant="outline" size="icon" onClick={refetchAll}><RefreshCw className="size-4" /></Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full max-w-2xl">
          <TabsTrigger value="company" className="gap-1 text-xs"><Settings className="size-3" /> {lang === 'ar' ? 'بيانات الشركة' : 'Company'}</TabsTrigger>
          <TabsTrigger value="branches" className="gap-1 text-xs"><Building2 className="size-3" /> {lang === 'ar' ? 'الفروع' : 'Branches'}</TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1 text-xs"><Warehouse className="size-3" /> {lang === 'ar' ? 'المستودعات' : 'Warehouses'}</TabsTrigger>
          <TabsTrigger value="cost-centers" className="gap-1 text-xs"><Target className="size-3" /> {lang === 'ar' ? 'التكلفة' : 'Cost Ctrs'}</TabsTrigger>
          <TabsTrigger value="currencies" className="gap-1 text-xs"><Coins className="size-3" /> {lang === 'ar' ? 'العملات' : 'Currencies'}</TabsTrigger>
          <TabsTrigger value="employees" className="gap-1 text-xs"><Users className="size-3" /> {lang === 'ar' ? 'الموظفين' : 'Employees'}</TabsTrigger>
        </TabsList>

        {/* Company Settings Tab */}
        <TabsContent value="company" className="space-y-3">
          <CompanySettingsTab />
        </TabsContent>

        {/* Branches Tab */}
        <TabsContent value="branches" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setBranchDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'فرع جديد' : 'New Branch'}
            </Button>
          </div>
          {loadingBranches ? <TableSkeleton /> : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'العنوان' : 'Address'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branches.map(b => (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono">{b.code}</TableCell>
                          <TableCell className="font-medium">{b.name}</TableCell>
                          <TableCell className="text-muted-foreground">{b.address || '—'}</TableCell>
                          <TableCell>
                            <Badge className={b.isActive ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-700 border-0'}>
                              {b.isActive ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Warehouses Tab */}
        <TabsContent value="warehouses" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setWarehouseDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'مستودع جديد' : 'New Warehouse'}
            </Button>
          </div>
          {loadingWarehouses ? <TableSkeleton /> : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الفرع' : 'Branch'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warehouses.map(w => (
                        <TableRow key={w.id}>
                          <TableCell className="font-mono">{w.code}</TableCell>
                          <TableCell className="font-medium">{w.name}</TableCell>
                          <TableCell className="text-muted-foreground">{w.branch.name}</TableCell>
                          <TableCell>
                            <Badge className={w.isActive ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-700 border-0'}>
                              {w.isActive ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Cost Centers Tab */}
        <TabsContent value="cost-centers" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setCostCenterDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'مركز تكلفة جديد' : 'New Cost Center'}
            </Button>
          </div>
          {loadingCC ? <TableSkeleton /> : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'مركز أب' : 'Parent'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costCenters.map(cc => (
                        <TableRow key={cc.id}>
                          <TableCell className="font-mono">{cc.code}</TableCell>
                          <TableCell className="font-medium">{cc.name}</TableCell>
                          <TableCell className="text-muted-foreground">{cc.parent ? `${cc.parent.code} - ${cc.parent.name}` : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Currencies Tab */}
        <TabsContent value="currencies" className="space-y-3">
          {loadingCurrencies ? <TableSkeleton /> : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الرمز' : 'Symbol'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'السعر' : 'Rate'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currencies.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono">{c.code}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>{c.symbol}</TableCell>
                          <TableCell dir="ltr">{formatNumber(c.rate)}</TableCell>
                          <TableCell>
                            <Badge className={c.isActive ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-700 border-0'}>
                              {c.isActive ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Employees Tab */}
        <TabsContent value="employees" className="space-y-3">
          {loadingEmployees ? <TableSkeleton /> : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'المنصب' : 'Position'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الفرع' : 'Branch'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map(emp => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-mono">{emp.code}</TableCell>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell className="text-muted-foreground">{emp.position || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{emp.branch?.name || '—'}</TableCell>
                          <TableCell>
                            <Badge className={emp.isActive ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-700 border-0'}>
                              {emp.isActive ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <BranchDialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen} />
      <WarehouseDialog open={warehouseDialogOpen} onOpenChange={setWarehouseDialogOpen} branches={branches} />
      <CostCenterDialog open={costCenterDialogOpen} onOpenChange={setCostCenterDialogOpen} costCenters={costCenters} />
    </div>
  )
}

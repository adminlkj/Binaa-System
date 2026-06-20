'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Plus, RefreshCw, Building2, Warehouse, Target, Coins,
  Save, Eye, Globe, Phone, Mail, FileText, CreditCard, Stamp, ImageIcon, Hash,
  Upload, X, Loader2,
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
  currencySymbolImage: string | null
  headerImage: string | null
  footerImage: string | null
  // Invoice template customization
  invoiceTemplate?: string
  invoicePrimaryColor?: string
  invoiceAccentColor?: string
  invoiceFontFamily?: string
  invoiceShowBankDetails?: boolean
  invoiceShowSignature?: boolean
  invoiceShowStamp?: boolean
}

// ============ ImageUploadField Component ============
function ImageUploadField({ 
  value, 
  onChange, 
  label, 
  labelAr,
  lang,
  hint,
  hintAr,
  previewHeight = 'h-24',
  accept = 'image/svg+xml,image/png,image/jpeg,image/webp',
}: {
  value: string | null
  onChange: (url: string | null) => void
  label: string
  labelAr: string
  lang: 'ar' | 'en'
  hint?: string
  hintAr?: string
  previewHeight?: string
  accept?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [error, setError] = useState<string | null>(null)

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError(lang === 'ar' ? 'حجم الملف يتجاوز 5 ميجابايت' : 'File size exceeds 5MB')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Upload failed')
      }
      const data = await res.json()
      onChange(data.url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(lang === 'ar' ? `فشل في رفع الملف: ${msg}` : `Failed to upload file: ${msg}`)
    } finally {
      setUploading(false)
    }
  }, [lang, onChange])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setError(null)
      uploadFile(file)
    }
    // Reset input so same file can be re-selected
    setTimeout(() => { if (fileInputRef.current) fileInputRef.current.value = '' }, 100)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const displayLabel = lang === 'ar' ? labelAr : label
  const displayHint = lang === 'ar' ? hintAr : hint

  return (
    <div className="space-y-2">
      <Label>{displayLabel}</Label>
      {value ? (
        <div className={`relative rounded-lg border bg-white p-2 ${previewHeight} flex items-center justify-center group overflow-hidden`}>
          <img
            src={value}
            alt={displayLabel}
            className="max-h-20 max-w-full object-contain"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-1 left-1 size-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onClick={() => { setError(null); onChange(null) }}
            type="button"
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : (
        <div
          className={`rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
            dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300 bg-gray-50 hover:border-emerald-300 hover:bg-emerald-50/50'
          } ${previewHeight} flex flex-col items-center justify-center gap-1`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {uploading ? (
            <>
              <Loader2 className="size-5 text-emerald-500 animate-spin" />
              <span className="text-xs text-muted-foreground">
                {lang === 'ar' ? 'جاري الرفع...' : 'Uploading...'}
              </span>
            </>
          ) : (
            <>
              <Upload className="size-5 text-gray-400" />
              <span className="text-xs text-muted-foreground">
                {lang === 'ar' ? 'اسحب الملف هنا أو انقر للاختيار' : 'Drag & drop or click to upload'}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {lang === 'ar' ? 'SVG, PNG, JPG - حد أقصى 5MB' : 'SVG, PNG, JPG - Max 5MB'}
              </span>
            </>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      {displayHint && !error && (
        <p className="text-xs text-muted-foreground">{displayHint}</p>
      )}
    </div>
  )
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
  const { lang, setCurrencySymbolImage, setThousandSeparatorSettings: updateStoreSeparators } = useAppStore()
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
    currencySymbolImage: '',
    headerImage: '',
    footerImage: '',
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
    currencySymbolImage: settings.currencySymbolImage || '',
    headerImage: settings.headerImage || '',
    footerImage: settings.footerImage || '',
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
      // Reset the loaded ref so form will re-sync with fresh data
      settingsLoadedRef.current = false
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
      // Update currency symbol image in global store
      setCurrencySymbolImage(data.currencySymbolImage || null)
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

  const updateField = (field: keyof CompanySettings, value: string | number | null) => {
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
          {/* Currency Symbol Image Upload */}
          <ImageUploadField
            value={form.currencySymbolImage}
            onChange={url => updateField('currencySymbolImage', url)}
            label="Currency Symbol Image"
            labelAr="صورة رمز العملة"
            lang={lang}
            hint="When set, this image replaces text currency symbols in MoneyDisplay. SVG/PNG recommended."
            hintAr="عند التعيين، تحل هذه الصورة محل رموز العملة النصية في عرض المبالغ. يُفضل SVG/PNG."
            previewHeight="h-28"
          />

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
                <MoneyDisplay
                  value={150000}
                  mode="system"
                  lang="ar"
                  symbolAr={form.currencySymbol}
                  symbolEn={form.currencySymbolEn}
                  symbolImage={form.currencySymbolImage}
                  size="lg"
                  bold
                />
              </div>
              <div className="rounded-md bg-white p-3 text-center border">
                <p className="text-xs text-muted-foreground mb-1">
                  {lang === 'ar' ? 'عرض إنجليزي' : 'English Display'}
                </p>
                <MoneyDisplay
                  value={150000}
                  mode="system"
                  lang="en"
                  symbolAr={form.currencySymbol}
                  symbolEn={form.currencySymbolEn}
                  symbolImage={form.currencySymbolImage}
                  size="lg"
                  bold
                />
              </div>
              <div className="rounded-md bg-white p-3 text-center border">
                <p className="text-xs text-muted-foreground mb-1">
                  {lang === 'ar' ? 'اختصار عربي' : 'Arabic Abbreviation'}
                </p>
                <MoneyDisplay
                  value={150000}
                  mode="system"
                  lang="ar"
                  symbolAr={form.currencySymbolAr}
                  symbolEn={form.currencySymbolEn}
                  symbolImage={form.currencySymbolImage}
                  size="lg"
                  bold
                />
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
                  ({((form.defaultVatRate ?? 0) * 100).toFixed(0)}%)
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
                  symbolImage={form.currencySymbolImage}
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
                  symbolImage={form.currencySymbolImage}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ImageUploadField
              value={form.headerImage}
              onChange={url => updateField('headerImage', url)}
              label="Invoice Header Image"
              labelAr="صورة رأس الفاتورة"
              lang={lang}
              hint="Displayed at the top of invoices. SVG/PNG recommended."
              hintAr="تعرض في أعلى الفاتورة. يُفضل SVG/PNG."
              previewHeight="h-28"
            />
            <ImageUploadField
              value={form.footerImage}
              onChange={url => updateField('footerImage', url)}
              label="Invoice Footer Image"
              labelAr="صورة تذييل الفاتورة"
              lang={lang}
              hint="Displayed at the bottom of invoices. SVG/PNG recommended."
              hintAr="تعرض في أسفل الفاتورة. يُفضل SVG/PNG."
              previewHeight="h-28"
            />
          </div>
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
          <ImageUploadField
            value={form.logoUrl}
            onChange={url => updateField('logoUrl', url)}
            label="Company Logo"
            labelAr="شعار الشركة"
            lang={lang}
            hint="SVG/PNG/JPG. Used in invoices and official documents."
            hintAr="SVG/PNG/JPG. يُستخدم في الفواتير والمستندات الرسمية."
            previewHeight="h-28"
          />
          <ImageUploadField
            value={form.stamp}
            onChange={url => updateField('stamp', url)}
            label="Company Stamp"
            labelAr="ختم الشركة"
            lang={lang}
            hint="SVG preferred, PNG/JPG. Recommended size: 120-160px."
            hintAr="يُفضل SVG، PNG/JPG. الحجم الموصى به: 120-160 بكسل."
            previewHeight="h-28"
          />
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
        <TabsList className="grid grid-cols-6 w-full max-w-3xl">
          <TabsTrigger value="company" className="gap-1 text-xs"><Settings className="size-3" /> {lang === 'ar' ? 'بيانات الشركة' : 'Company'}</TabsTrigger>
          <TabsTrigger value="branches" className="gap-1 text-xs"><Building2 className="size-3" /> {lang === 'ar' ? 'الفروع' : 'Branches'}</TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1 text-xs"><Warehouse className="size-3" /> {lang === 'ar' ? 'المستودعات' : 'Warehouses'}</TabsTrigger>
          <TabsTrigger value="cost-centers" className="gap-1 text-xs"><Target className="size-3" /> {lang === 'ar' ? 'التكلفة' : 'Cost Ctrs'}</TabsTrigger>
          <TabsTrigger value="currencies" className="gap-1 text-xs"><Coins className="size-3" /> {lang === 'ar' ? 'العملات' : 'Currencies'}</TabsTrigger>
          <TabsTrigger value="invoice-templates" className="gap-1 text-xs"><FileText className="size-3" /> {lang === 'ar' ? 'قوالب الفاتورة' : 'Invoice Templates'}</TabsTrigger>
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

        {/* Invoice Templates Tab */}
        <TabsContent value="invoice-templates" className="space-y-3">
          <InvoiceTemplatesTab />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <BranchDialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen} />
      <WarehouseDialog open={warehouseDialogOpen} onOpenChange={setWarehouseDialogOpen} branches={branches} />
      <CostCenterDialog open={costCenterDialogOpen} onOpenChange={setCostCenterDialogOpen} costCenters={costCenters} />
    </div>
  )
}

// ============ Invoice Templates Tab ============
const INVOICE_TEMPLATES = [
  {
    id: 'classic',
    nameAr: 'كلاسيكي',
    nameEn: 'Classic',
    descAr: 'تصميم تقليدي بإطار نظيف - مناسب للشركات الرسمية',
    descEn: 'Traditional design with clean borders - suited for formal companies',
    primary: '#0f766e',
    accent: '#34d399',
  },
  {
    id: 'modern',
    nameAr: 'عصري',
    nameEn: 'Modern',
    descAr: 'تصميم عصري بألوان متدرجة - مناسب للشركات التقنية',
    descEn: 'Modern design with gradient colors - suited for tech companies',
    primary: '#7c3aed',
    accent: '#a78bfa',
  },
  {
    id: 'minimal',
    nameAr: 'مبسط',
    nameEn: 'Minimal',
    descAr: 'تصميم مبسط بمساحات بيضاء - مناسب للشركات الاستشارية',
    descEn: 'Minimal design with whitespace - suited for consulting firms',
    primary: '#374151',
    accent: '#9ca3af',
  },
  {
    id: 'corporate',
    nameAr: 'مؤسسي',
    nameEn: 'Corporate',
    descAr: 'تصميم مؤسسي قوي - مناسب للشركات الكبرى والمقاولات',
    descEn: 'Strong corporate design - suited for large enterprises and contractors',
    primary: '#b45309',
    accent: '#fbbf24',
  },
  {
    id: 'royal',
    nameAr: 'ملكي',
    nameEn: 'Royal',
    descAr: 'تصميم فاخر بلمسات ذهبية - مناسب للشركات المرموقة',
    descEn: 'Luxurious design with golden touches - suited for prestigious companies',
    primary: '#9a3412',
    accent: '#f59e0b',
  },
  {
    id: 'ocean',
    nameAr: 'محيط',
    nameEn: 'Ocean',
    descAr: 'تصميم بألوان البحر الهادئة - مناسب للشركات الخدمية',
    descEn: 'Calm ocean-colored design - suited for service companies',
    primary: '#0369a1',
    accent: '#38bdf8',
  },
]

const PRESET_COLORS = [
  '#0f766e', '#0369a1', '#7c3aed', '#b45309', '#9a3412', '#be123c',
  '#15803d', '#a16207', '#475569', '#1e293b', '#0d9488', '#c2410c',
]

function InvoiceTemplatesTab() {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    invoiceTemplate: 'classic',
    invoicePrimaryColor: '#0f766e',
    invoiceAccentColor: '#34d399',
    invoiceFontFamily: 'default',
    invoiceShowBankDetails: true,
    invoiceShowSignature: true,
    invoiceShowStamp: false,
  })
  const [saving, setSaving] = useState(false)

  // Load existing settings
  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const res = await fetch('/api/company-settings')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  useEffect(() => {
    if (settings) {
      setForm({
        invoiceTemplate: settings.invoiceTemplate || 'classic',
        invoicePrimaryColor: settings.invoicePrimaryColor || '#0f766e',
        invoiceAccentColor: settings.invoiceAccentColor || '#34d399',
        invoiceFontFamily: settings.invoiceFontFamily || 'default',
        invoiceShowBankDetails: settings.invoiceShowBankDetails ?? true,
        invoiceShowSignature: settings.invoiceShowSignature ?? true,
        invoiceShowStamp: settings.invoiceShowStamp ?? false,
      })
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      setSaving(true)
      const res = await fetch('/api/company-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
      setSaving(false)
    },
    onError: () => setSaving(false),
  })

  const selectedTemplate = INVOICE_TEMPLATES.find(t => t.id === form.invoiceTemplate) || INVOICE_TEMPLATES[0]

  const applyTemplate = (templateId: string) => {
    const tpl = INVOICE_TEMPLATES.find(t => t.id === templateId)
    if (tpl) {
      setForm(f => ({
        ...f,
        invoiceTemplate: templateId,
        invoicePrimaryColor: tpl.primary,
        invoiceAccentColor: tpl.accent,
      }))
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <FileText className="size-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {lang === 'ar' ? 'قوالب تصميم الفواتير' : 'Invoice Design Templates'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {lang === 'ar'
                  ? 'اختر قالباً جاهزاً أو خصص الألوان والخطوط مع معاينة مباشرة'
                  : 'Choose a ready template or customize colors and fonts with live preview'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saving}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="size-4" />
            {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Template selection & customization */}
        <div className="space-y-4">
          {/* Ready templates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="size-4 text-emerald-600" />
                {lang === 'ar' ? 'القوالب الجاهزة' : 'Ready Templates'}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {INVOICE_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className={`text-right p-3 rounded-lg border-2 transition-all ${
                    form.invoiceTemplate === tpl.id
                      ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                      : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="size-8 rounded-md" style={{ background: `linear-gradient(135deg, ${tpl.primary}, ${tpl.accent})` }} />
                    <span className="font-medium text-sm">{lang === 'ar' ? tpl.nameAr : tpl.nameEn}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {lang === 'ar' ? tpl.descAr : tpl.descEn}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Color customization */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Stamp className="size-4 text-emerald-600" />
                {lang === 'ar' ? 'تخصيص الألوان' : 'Color Customization'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Primary color */}
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'اللون الأساسي' : 'Primary Color'}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.invoicePrimaryColor}
                    onChange={e => setForm(f => ({ ...f, invoicePrimaryColor: e.target.value }))}
                    className="size-10 rounded-md border border-gray-300 cursor-pointer"
                  />
                  <Input
                    value={form.invoicePrimaryColor}
                    onChange={e => setForm(f => ({ ...f, invoicePrimaryColor: e.target.value }))}
                    dir="ltr"
                    className="font-mono flex-1"
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, invoicePrimaryColor: c }))}
                      className="size-6 rounded-md border-2 border-white shadow-sm hover:scale-110 transition-transform"
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              {/* Accent color */}
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'لون التمييز' : 'Accent Color'}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.invoiceAccentColor}
                    onChange={e => setForm(f => ({ ...f, invoiceAccentColor: e.target.value }))}
                    className="size-10 rounded-md border border-gray-300 cursor-pointer"
                  />
                  <Input
                    value={form.invoiceAccentColor}
                    onChange={e => setForm(f => ({ ...f, invoiceAccentColor: e.target.value }))}
                    dir="ltr"
                    className="font-mono flex-1"
                  />
                </div>
              </div>
              {/* Font family */}
              <div className="space-y-2">
                <Label>{lang === 'ar' ? 'نوع الخط' : 'Font Family'}</Label>
                <Select
                  value={form.invoiceFontFamily}
                  onValueChange={v => setForm(f => ({ ...f, invoiceFontFamily: v }))}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{lang === 'ar' ? 'الافتراضي (System)' : 'Default (System)'}</SelectItem>
                    <SelectItem value="tajawal">Tajawal</SelectItem>
                    <SelectItem value="cairo">Cairo</SelectItem>
                    <SelectItem value="amiri">Amiri</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Display options */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="size-4 text-emerald-600" />
                {lang === 'ar' ? 'خيارات العرض' : 'Display Options'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{lang === 'ar' ? 'إظهار بيانات البنك' : 'Show Bank Details'}</Label>
                <Switch
                  checked={form.invoiceShowBankDetails}
                  onCheckedChange={v => setForm(f => ({ ...f, invoiceShowBankDetails: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{lang === 'ar' ? 'إظهار التوقيع' : 'Show Signature'}</Label>
                <Switch
                  checked={form.invoiceShowSignature}
                  onCheckedChange={v => setForm(f => ({ ...f, invoiceShowSignature: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{lang === 'ar' ? 'إظهار الختم' : 'Show Stamp'}</Label>
                <Switch
                  checked={form.invoiceShowStamp}
                  onCheckedChange={v => setForm(f => ({ ...f, invoiceShowStamp: v }))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Live preview */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="size-4 text-emerald-600" />
                {lang === 'ar' ? 'معاينة مباشرة' : 'Live Preview'}
                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs mr-auto">
                  {lang === 'ar' ? selectedTemplate.nameAr : selectedTemplate.nameEn}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mini invoice preview */}
              <div
                className="bg-white rounded-lg border shadow-sm overflow-hidden mx-auto"
                style={{ maxWidth: '420px', fontFamily: form.invoiceFontFamily === 'default' ? 'inherit' : form.invoiceFontFamily }}
                dir="rtl"
              >
                {/* Header band */}
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ background: `linear-gradient(135deg, ${form.invoicePrimaryColor}, ${form.invoicePrimaryColor}dd)` }}
                >
                  <div className="text-white">
                    <div className="text-base font-bold">شركة البناء الحديثة</div>
                    <div className="text-[10px] opacity-90">Al Binaa Al Haditha Contracting</div>
                  </div>
                  <div
                    className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: form.invoiceAccentColor, color: form.invoicePrimaryColor }}
                  >
                    فاتورة ضريبية
                  </div>
                </div>

                {/* Invoice meta */}
                <div className="px-4 py-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] border-b" style={{ borderColor: `${form.invoicePrimaryColor}22` }}>
                  <div>
                    <span className="text-gray-500">رقم الفاتورة:</span>
                    <span className="font-mono font-semibold mr-1">INV-2025-0001</span>
                  </div>
                  <div>
                    <span className="text-gray-500">التاريخ:</span>
                    <span className="font-semibold mr-1">٣٠ يونيو ٢٠٢٥</span>
                  </div>
                  <div>
                    <span className="text-gray-500">العميل:</span>
                    <span className="font-semibold mr-1">شركة المقاولات المتحدة</span>
                  </div>
                  <div>
                    <span className="text-gray-500">الرقم الضريبي:</span>
                    <span className="font-mono mr-1">300000000100003</span>
                  </div>
                </div>

                {/* Line items */}
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ background: `${form.invoicePrimaryColor}11`, color: form.invoicePrimaryColor }}>
                      <th className="text-right px-3 py-1.5 font-semibold">#</th>
                      <th className="text-right px-2 py-1.5 font-semibold">الوصف</th>
                      <th className="text-center px-2 py-1.5 font-semibold">الكمية</th>
                      <th className="text-left px-2 py-1.5 font-semibold">السعر</th>
                      <th className="text-left px-3 py-1.5 font-semibold">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-3 py-1.5">1</td>
                      <td className="px-2 py-1.5">تأجير حفارة - 180 ساعة</td>
                      <td className="text-center px-2 py-1.5">180</td>
                      <td className="text-left px-2 py-1.5 font-mono">923.08</td>
                      <td className="text-left px-3 py-1.5 font-mono font-semibold">166,153.85</td>
                    </tr>
                  </tbody>
                </table>

                {/* Totals */}
                <div className="px-4 py-2 space-y-1 text-[10px] border-t" style={{ borderColor: `${form.invoicePrimaryColor}22` }}>
                  <div className="flex justify-between">
                    <span className="text-gray-500">المجموع الفرعي</span>
                    <span className="font-mono">166,153.85 ر.س</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">ضريبة القيمة المضافة (15%)</span>
                    <span className="font-mono">24,923.08 ر.س</span>
                  </div>
                  <div
                    className="flex justify-between items-center px-2 py-1.5 rounded mt-1"
                    style={{ background: `${form.invoicePrimaryColor}11` }}
                  >
                    <span className="font-bold" style={{ color: form.invoicePrimaryColor }}>الإجمالي</span>
                    <span className="font-mono font-bold text-sm" style={{ color: form.invoicePrimaryColor }}>191,076.93 ر.س</span>
                  </div>
                </div>

                {/* Footer band */}
                <div
                  className="px-4 py-2 flex items-center justify-between text-[9px] text-white"
                  style={{ background: form.invoicePrimaryColor }}
                >
                  <span>ض.ر: 300123456700003</span>
                  <span>info@albinaa.com</span>
                </div>

                {/* Conditional sections */}
                {form.invoiceShowBankDetails && (
                  <div className="px-4 py-1.5 text-[9px] text-gray-600 border-t border-gray-100">
                    <span className="font-semibold">البنك:</span> الراجحي |
                    <span className="font-semibold mr-1">IBAN:</span> SA00 8000 0000 6080 1016 7519
                  </div>
                )}
                {form.invoiceShowSignature && (
                  <div className="px-4 py-2 flex justify-between text-[9px] text-gray-500 border-t border-gray-100">
                    <div className="border-t border-dashed border-gray-300 pt-1 mt-3 w-24 text-center">توقيع الشركة</div>
                    <div className="border-t border-dashed border-gray-300 pt-1 mt-3 w-24 text-center">توقيع العميل</div>
                  </div>
                )}
                {form.invoiceShowStamp && (
                  <div className="px-4 pb-3 flex justify-center">
                    <div
                      className="size-12 rounded-full border-2 flex items-center justify-center text-[8px] font-bold opacity-60"
                      style={{ borderColor: form.invoiceAccentColor, color: form.invoicePrimaryColor }}
                    >
                      ختم
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground text-center mt-3">
                {lang === 'ar'
                  ? 'هذه معاينة توضيحية - سيتم تطبيق القالب على جميع الفواتير المطبوعة'
                  : 'This is an illustrative preview - the template will be applied to all printed invoices'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

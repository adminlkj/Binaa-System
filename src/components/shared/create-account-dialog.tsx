'use client'

/**
 * CreateAccountDialog
 * --------------------
 * A reusable bilingual (AR/EN) dialog for creating or editing an Account
 * in the chart of accounts.
 *
 * Features:
 *  - Full validation (name, type, parent, code uniqueness check via API)
 *  - Auto-generates account code based on type prefix when user leaves blank
 *  - Optional account role assignment (linked to the role-mapping system)
 *  - allowPosting toggle (true = leaf/posting account; false = group/header)
 *  - activityType selector (CONSTRUCTION / EQUIPMENT_RENTAL / BOTH)
 *  - Optional Arabic + English names & descriptions
 *  - Edit mode (passes initialAccount) – updates via PUT /api/accounts/[id]
 *  - Create mode (no initialAccount) – creates via POST /api/accounts
 *
 * After successful save, callers' queries are invalidated via the
 * `accountCreated` / `accountUpdated` callback so the chart of accounts,
 * role mapping, and account selectors across the app refresh automatically.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/stores/app-store'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Save, PlusCircle, Pencil, Info } from 'lucide-react'
import { ACCOUNT_ROLES, type AccountRoleKey } from '@/lib/account-roles'

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface AccountFormData {
  id?: string
  code: string
  name: string
  nameAr: string
  type: string
  parentId: string
  accountRole: string
  activityType: string
  allowPosting: boolean
  description: string
  descriptionAr: string
}

export interface CreateAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** If provided, dialog acts in "edit" mode */
  initialAccount?: AccountFormData | null
  /** Pre-selected parent account id (when "add child" is clicked) */
  presetParentId?: string
  /** Pre-selected account type */
  presetType?: string
  /** Pre-selected account role (when "create for role" is clicked in role mapping) */
  presetRole?: string
  /** Callback after a successful create or update */
  onSaved?: (accountId: string, isEdit: boolean) => void
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const TYPE_OPTIONS = [
  { value: 'ASSET',     labelAr: 'أصول',           labelEn: 'Asset',     prefix: '1' },
  { value: 'LIABILITY', labelAr: 'خصوم',           labelEn: 'Liability', prefix: '3' },
  { value: 'EQUITY',    labelAr: 'حقوق ملكية',     labelEn: 'Equity',    prefix: '5' },
  { value: 'REVENUE',   labelAr: 'إيرادات',        labelEn: 'Revenue',   prefix: '6' },
  { value: 'EXPENSE',   labelAr: 'مصروفات',        labelEn: 'Expense',   prefix: '7' },
]

const ACTIVITY_OPTIONS = [
  { value: 'BOTH',              labelAr: 'مشترك (مشاريع + تأجير)', labelEn: 'Both (Construction + Rental)' },
  { value: 'CONSTRUCTION',      labelAr: 'مشاريع إنشائية',         labelEn: 'Construction' },
  { value: 'EQUIPMENT_RENTAL',  labelAr: 'تأجير المعدات',          labelEn: 'Equipment Rental' },
]

function emptyForm(): AccountFormData {
  return {
    code: '',
    name: '',
    nameAr: '',
    type: 'ASSET',
    parentId: '',
    accountRole: '',
    activityType: 'BOTH',
    allowPosting: true,
    description: '',
    descriptionAr: '',
  }
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function CreateAccountDialog({
  open,
  onOpenChange,
  initialAccount,
  presetParentId,
  presetType,
  presetRole,
  onSaved,
}: CreateAccountDialogProps) {
  const { lang } = useAppStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const isEdit = !!initialAccount?.id
  const [form, setForm] = useState<AccountFormData>(emptyForm())
  const [saving, setSaving] = useState(false)

  // Load all accounts for parent selection
  const { data: allAccounts = [] } = useQuery<{ id: string; code: string; name: string; nameAr: string | null; type: string }[]>({
    queryKey: ['all-accounts-light'],
    queryFn: async () => {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      return (data.accounts || []).map((a: any) => ({
        id: a.id, code: a.code, name: a.name, nameAr: a.nameAr, type: a.type,
      }))
    },
    enabled: open,
  })

  // Reset / populate form when dialog opens or initialAccount changes
  useEffect(() => {
    if (!open) return
    if (initialAccount) {
      setForm({ ...initialAccount })
    } else {
      setForm({
        ...emptyForm(),
        parentId: presetParentId || '',
        type: presetType || 'ASSET',
        accountRole: presetRole || '',
      })
    }
  }, [open, initialAccount, presetParentId, presetType, presetRole])

  // Filtered parent options: same type, not the account itself
  const parentOptions = useMemo(() => {
    return allAccounts
      .filter(a => a.type === form.type && a.id !== form.id)
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [allAccounts, form.type, form.id])

  // Roles filtered to be relevant for the chosen type
  const roleOptions = useMemo(() => {
    const roleToTypeMap: Record<string, string> = {
      CASH: 'ASSET', BANK: 'ASSET', CUSTOMER_AR: 'ASSET', RETENTION_RECEIVABLE: 'ASSET',
      EMPLOYEE_ADVANCE: 'ASSET', FIXED_ASSET: 'ASSET', ACCUM_DEPRECIATION: 'ASSET',
      VAT_INPUT: 'ASSET', PROJECT_WIP: 'ASSET', CONTRACT_ASSET: 'ASSET',
      INVENTORY: 'ASSET', GRNI: 'LIABILITY', SUBCONTRACTOR_ADVANCE: 'ASSET',

      VAT_OUTPUT: 'LIABILITY', VAT_DUE: 'LIABILITY', VAT_SETTLEMENT: 'LIABILITY',
      SUPPLIER_AP: 'LIABILITY', SUBCONTRACTOR_AP: 'LIABILITY', SALARIES_PAYABLE: 'LIABILITY',
      GOSI_PAYABLE: 'LIABILITY', ZAKAT_PAYABLE: 'LIABILITY', CUSTOMER_ADVANCE: 'LIABILITY',
      EOS_PROVISION: 'LIABILITY', CONTRACT_LIABILITY: 'LIABILITY',
      SUBCONTRACTOR_RETENTION_PAYABLE: 'LIABILITY',

      RETAINED_EARNINGS: 'EQUITY',

      RENTAL_REVENUE: 'REVENUE', PROJECT_REVENUE: 'REVENUE', SERVICE_REVENUE: 'REVENUE',
      UNBILLED_REVENUE: 'REVENUE', DELAY_PENALTY_REVENUE: 'REVENUE', FX_GAIN: 'REVENUE',

      FUEL_EXPENSE: 'EXPENSE', MAINTENANCE_EXPENSE: 'EXPENSE', DRIVER_EXPENSE: 'EXPENSE',
      TRANSPORT_EXPENSE: 'EXPENSE', RENTAL_DEPRECIATION: 'EXPENSE',
      PROJECT_COST: 'EXPENSE', SUBCONTRACTOR_COST: 'EXPENSE',
      PAYROLL_EXPENSE: 'EXPENSE', GOSI_EXPENSE: 'EXPENSE', ADMIN_EXPENSE: 'EXPENSE',
      DEPRECIATION_EXPENSE: 'EXPENSE', ZAKAT_EXPENSE: 'EXPENSE', FX_LOSS: 'EXPENSE',
    }
    return (Object.keys(ACCOUNT_ROLES) as AccountRoleKey[])
      .filter(role => roleToTypeMap[role] === form.type)
      .map(role => ({
        role,
        labelAr: ACCOUNT_ROLES[role].labelAr,
        labelEn: ACCOUNT_ROLES[role].labelEn,
        description: ACCOUNT_ROLES[role].description,
      }))
  }, [form.type])

  const update = <K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Auto-suggest a code based on type prefix
  const suggestCode = () => {
    const typeOpt = TYPE_OPTIONS.find(t => t.value === form.type)
    const prefix = typeOpt?.prefix || '1'
    const sameType = allAccounts
      .filter(a => a.type === form.type)
      .map(a => a.code)
      .sort()
    let nextNum = 1
    if (sameType.length > 0) {
      const last = sameType[sameType.length - 1]
      const match = last.match(/(\d+)$/)
      if (match) nextNum = parseInt(match[1], 10) + 1
    }
    update('code', `${prefix}${String(nextNum).padStart(3, '0')}`)
  }

  const handleSave = async () => {
    // Validation
    if (!form.name?.trim()) {
      toast({ title: t('تنبيه', 'Notice', lang), description: t('اسم الحساب مطلوب', 'Account name is required', lang), variant: 'destructive' })
      return
    }
    if (!form.type) {
      toast({ title: t('تنبيه', 'Notice', lang), description: t('نوع الحساب مطلوب', 'Account type is required', lang), variant: 'destructive' })
      return
    }
    if (form.allowPosting && !form.parentId) {
      toast({
        title: t('تنبيه', 'Notice', lang),
        description: t('حساب الترحيل يجب أن يكون له حساب أب — اختر الحساب الأب أو عطّل خيار "قبول الترحيل"', 'Posting account must have a parent — pick a parent or disable "Allow Posting"', lang),
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || null,
        description: form.description.trim() || null,
        descriptionAr: form.descriptionAr.trim() || null,
        accountRole: form.accountRole || null,
        activityType: form.activityType || null,
        parentId: form.parentId || null,
      }

      let res: Response
      if (isEdit && form.id) {
        res = await fetch(`/api/accounts/${form.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save account')
      }

      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['all-accounts-light'] })
      queryClient.invalidateQueries({ queryKey: ['financial-mapping-overview'] })
      queryClient.invalidateQueries({ queryKey: ['financial-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['accounts-by-role'] })
      queryClient.invalidateQueries({ queryKey: ['role-mapping'] })

      toast({
        title: t('تم بنجاح', 'Success', lang),
        description: isEdit
          ? t('تم تحديث الحساب بنجاح', 'Account updated successfully', lang)
          : t('تم إنشاء الحساب بنجاح', 'Account created successfully', lang),
      })

      onSaved?.(form.id || data.id || '', isEdit)
      onOpenChange(false)
    } catch (err) {
      toast({
        title: t('خطأ', 'Error', lang),
        description: err instanceof Error ? err.message : t('فشل الحفظ', 'Failed to save', lang),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Pencil className="size-5 text-teal-600" /> : <PlusCircle className="size-5 text-emerald-600" />}
            {isEdit
              ? t('تعديل حساب', 'Edit Account', lang)
              : t('إنشاء حساب جديد', 'Create New Account', lang)}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('تعديل بيانات الحساب في دليل الحسابات', 'Edit account details in the chart of accounts', lang)
              : t('إضافة حساب جديد إلى دليل الحسابات — سيظهر تلقائياً في الربط المحاسبي والعمليات عند تخصيص دور له', 'Add a new account to the chart of accounts — it will automatically appear in role mapping and operations when a role is assigned', lang)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info banner */}
          <div className="flex items-start gap-2 p-3 rounded-md bg-sky-50 border border-sky-200">
            <Info className="size-4 text-sky-600 mt-0.5 shrink-0" />
            <p className="text-xs text-sky-800 leading-relaxed">
              {t(
                'عند تخصيص "دور الحساب" (مثل: البنوك، النقدية، ذمم العملاء...) سيظهر هذا الحساب تلقائياً في كل شاشات العمليات المرتبطة بهذا الدور (الدفع، التحصيل، السداد، الفواتير...) دون الحاجة لأي إعداد إضافي.',
                'When you assign an "Account Role" (e.g. BANK, CASH, CUSTOMER_AR...), this account will automatically appear in all operation screens linked to that role (payments, collections, invoices...) with no extra setup.',
                lang
              )}
            </p>
          </div>

          {/* Type + Code */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('نوع الحساب *', 'Account Type *', lang)}
              </Label>
              <Select
                value={form.type}
                onValueChange={(v) => {
                  update('type', v)
                  // Reset role when type changes
                  update('accountRole', '')
                  // Reset parent if it's not of the new type
                  update('parentId', '')
                }}
                disabled={isEdit}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="font-mono text-xs ml-1 text-muted-foreground">{opt.prefix}</span>
                      {lang === 'ar' ? opt.labelAr : opt.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('كود الحساب', 'Account Code', lang)}
              </Label>
              <div className="flex gap-2">
                <Input
                  value={form.code}
                  onChange={(e) => update('code', e.target.value)}
                  placeholder={t('تلقائي', 'Auto', lang)}
                  className="font-mono"
                  dir="ltr"
                />
                {!isEdit && (
                  <Button type="button" variant="outline" size="sm" onClick={suggestCode} className="shrink-0">
                    {t('توليد', 'Generate', lang)}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('اتركه فارغاً للتوليد التلقائي', 'Leave empty to auto-generate', lang)}
              </p>
            </div>
          </div>

          {/* Names */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('الاسم بالعربية *', 'Arabic Name *', lang)}
              </Label>
              <Input
                value={form.nameAr}
                onChange={(e) => update('nameAr', e.target.value)}
                placeholder={t('مثال: البنك الأهلي', 'e.g. Al Rajhi Bank', lang)}
                dir="rtl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('الاسم بالإنجليزية', 'English Name', lang)}
              </Label>
              <Input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="e.g. Al Rajhi Bank"
                dir="ltr"
              />
            </div>
          </div>

          {/* Parent account */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t('الحساب الأب', 'Parent Account', lang)}
              {form.allowPosting && <span className="text-rose-600 mr-1">*</span>}
            </Label>
            <Select
              value={form.parentId}
              onValueChange={(v) => update('parentId', v)}
            >
              <SelectTrigger><SelectValue placeholder={t('اختر الحساب الأب...', 'Select parent account...', lang)} /></SelectTrigger>
              <SelectContent>
                {parentOptions.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                    {t('لا توجد حسابات من نفس النوع', 'No accounts of the same type', lang)}
                  </div>
                ) : (
                  parentOptions.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono text-xs ml-1">{a.code}</span>
                      <span className="mx-1 text-muted-foreground">-</span>
                      <span>{lang === 'ar' && a.nameAr ? a.nameAr : a.name}</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Account role + activity type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('دور الحساب (الربط المحاسبي)', 'Account Role (Accounting Link)', lang)}
              </Label>
              <Select
                value={form.accountRole}
                onValueChange={(v) => update('accountRole', v === '__none__' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder={t('بدون دور', 'No role', lang)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">{t('— بدون دور —', '— No role —', lang)}</span>
                  </SelectItem>
                  {roleOptions.map(r => (
                    <SelectItem key={r.role} value={r.role}>
                      <div className="flex flex-col">
                        <span>{lang === 'ar' ? r.labelAr : r.labelEn}</span>
                        <span className="text-xs text-muted-foreground font-mono">{r.role}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.accountRole && (
                <Badge variant="outline" className="text-xs gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                  {t('سيظهر في العمليات المرتبطة بهذا الدور', 'Will appear in operations linked to this role', lang)}
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('نوع النشاط', 'Activity Type', lang)}
              </Label>
              <Select
                value={form.activityType}
                onValueChange={(v) => update('activityType', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {lang === 'ar' ? opt.labelAr : opt.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Allow posting toggle */}
          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium cursor-pointer" htmlFor="allow-posting">
                {t('قبول الترحيل', 'Allow Posting', lang)}
              </Label>
              <p className="text-xs text-muted-foreground">
                {form.allowPosting
                  ? t('حساب تفصيلي يقبل القيود المحاسبية', 'Leaf account that accepts journal entries', lang)
                  : t('حساب رئيسي/مجمّع — لا يقبل القيود', 'Group/header account — does not accept entries', lang)}
              </p>
            </div>
            <Switch
              id="allow-posting"
              checked={form.allowPosting}
              onCheckedChange={(v) => update('allowPosting', v)}
            />
          </div>

          {/* Descriptions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('وصف (عربي)', 'Description (Arabic)', lang)}
              </Label>
              <Textarea
                value={form.descriptionAr}
                onChange={(e) => update('descriptionAr', e.target.value)}
                rows={2}
                dir="rtl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t('وصف (إنجليزي)', 'Description (English)', lang)}
              </Label>
              <Textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                rows={2}
                dir="ltr"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('إلغاء', 'Cancel', lang)}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <RefreshCw className="size-4 animate-spin" /> : isEdit ? <Save className="size-4" /> : <PlusCircle className="size-4" />}
            {isEdit ? t('حفظ التعديلات', 'Save Changes', lang) : t('إنشاء الحساب', 'Create Account', lang)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

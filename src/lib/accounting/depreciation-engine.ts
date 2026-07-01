// ============================================================================
// نظام بِنَاء ERP - محرك إهلاك الأصول الثابتة المركزي
// Binaa ERP - Central Fixed Assets Depreciation Engine
// ============================================================================
//
// هذا الملف هو المصدر الوحيد للحقيقة (Single Source of Truth) لكل ما يتعلق
// بإهلاك الأصول الثابتة. كل الحسابات، الجداول، والقيود تُنشأ من هنا.
//
// فلسفة التصميم:
// 1. المستخدم يُدخل فقط: اسم الأصل، نوعه، قيمة الشراء، تاريخ الشراء،
//    عدد السنوات، والنسبة المقدرة للاهلاك.
// 2. كل شيء آخر (الحسابات، الإهلاك الشهري/السنوي، القيمة المتبقية،
//    قيد التملك، جدول الإهلاك الكامل) يُحسب ويُنشأ تلقائياً.
// 3. المنطق تسلسلي ودقيق: كل خطوة تبني على السابقة.
// 4. جميع الحسابات تُجلب عبر الأدوار المحاسبية (Account Roles) وليس
//    أكواداً ثابتة.
// ============================================================================

import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import {
  createJournalEntry,
  reverseEntry,
  PrismaTransaction,
} from '@/lib/accounting/engine'
import { getNextEntryNo } from '@/lib/accounting/guard'
import { mulMoney, divMoney, subMoney, addMoney, round2Money } from '@/lib/safe-money'
import {
  AccountRole,
  getAccountCodeByRole,
  getDefaultAccountByRole,
  requireAccountCodeByRole,
} from '@/lib/account-roles'

// ---------------------------------------------------------------------------
// أنواع البيانات
// ---------------------------------------------------------------------------

/** المدخلات الأساسية لإنشاء أصل ثابت — فقط ما يُدخله المستخدم */
export interface CreateAssetInput {
  name: string
  nameAr?: string | null
  category: string
  acquisitionCost: number
  acquisitionDate: Date | string
  usefulLifeYears: number
  depreciationRate: number // النسبة المئوية السنوية (مثلاً 10 يعني 10%)
  notes?: string | null
  // اختياري: تجاوز الحسابات الافتراضية المأخوذة من الأدوار
  accountId?: string | null
  depExpenseAccountId?: string | null
  accumDepAccountId?: string | null
  // اختياري: إنشاء قيد التملك (افتراضياً true)
  createAcquisitionEntry?: boolean
  // اختياري: طريقة السداد لقيد التملك
  payFrom?: 'TREASURY' | 'BANK'
}

/** المدخلات لتحديث أصل */
export interface UpdateAssetInput extends Partial<CreateAssetInput> {
  id: string
}

/** نتيجة حساب الإهلاك */
export interface DepreciationCalculation {
  acquisitionCost: number
  residualValue: number
  usefulLifeMonths: number
  usefulLifeYears: number
  depreciationRate: number
  annualDepreciation: number
  monthlyDepreciation: number
  totalDepreciableAmount: number
  netBookValue: number
}

/** صف في جدول الإهلاك */
export interface ScheduleRow {
  period: string // YYYY-MM
  year: number
  month: number
  beginningNBV: number
  depreciationAmount: number
  accumulatedDepreciation: number
  endingNBV: number
  isPosted: boolean // هل تم ترحيل هذا الشهر فعلياً
  journalEntryNo?: string | null
}

/** نتيجة إنشاء الأصل */
export interface CreateAssetResult {
  asset: any
  acquisitionJournalEntryId: string | null
  schedule: ScheduleRow[]
  calculation: DepreciationCalculation
}

// ---------------------------------------------------------------------------
// 1) حساب الإهلاك — القلب المنطقي للمحرك
// ---------------------------------------------------------------------------

/**
 * حساب قيم الإهلاك بطريقة القسط الثابت (Straight-Line).
 *
 * المعادلة المعتمدة (IAS 16 / SOCPA):
 *   الإهلاك السنوي = قيمة الشراء × النسبة المئوية
 *   الإهلاك الشهري = الإهلاك السنوي ÷ 12
 *   القيمة المتبقية التقديرية = قيمة الشراء × (1 - النسبة × عدد السنوات)
 *     (إذا سالبة أو صفر → نأخذ 0 أو قيمة دنيا رمزية)
 *   مجموع الإهلاك القابل للخصم = قيمة الشراء - القيمة المتبقية
 *
 * إذا لم تكن النسبة متوفرة، نستنتجها من عدد السنوات:
 *   النسبة = 100 ÷ عدد السنوات
 */
export function calculateDepreciation(input: {
  acquisitionCost: number
  usefulLifeYears?: number
  usefulLifeMonths?: number
  depreciationRate?: number
  residualValue?: number
  accumulatedDepreciation?: number
}): DepreciationCalculation {
  // P1-4b FIX: استخدم Decimal.js للحسابات لمنع تراكم أخطاء التقريب عبر 60 شهراً
  const acquisitionCost = Math.max(0, Number(input.acquisitionCost) || 0)
  const providedYears = Number(input.usefulLifeYears) || 0
  const providedMonths = Number(input.usefulLifeMonths) || 0
  let depreciationRate = Number(input.depreciationRate) || 0

  // اشتقاق عدد السنوات من الأشهر إذا لم تُعطَ مباشرة
  const usefulLifeYears = providedYears > 0
    ? providedYears
    : providedMonths > 0
      ? providedMonths / 12
      : 0
  const usefulLifeMonths = providedMonths > 0
    ? providedMonths
    : usefulLifeYears > 0
      ? Math.round(usefulLifeYears * 12)
      : 0

  // اشتقاق النسبة من عدد السنوات إذا لم تُعطَ مباشرة
  if (depreciationRate <= 0 && usefulLifeYears > 0) {
    depreciationRate = 100 / usefulLifeYears
  }

  // P1-4b FIX: استخدم Decimal.js للإهلاك السنوي/الشهري لمنع تراكم أخطاء التقريب
  // عبر 60 شهراً (الإهلاك الشهري يُخزَّن ويُجمع شهرياً في قاعدة البيانات)
  const annualDepreciation = round2Money(mulMoney(acquisitionCost, divMoney(depreciationRate, 100))).toNumber()
  const monthlyDepreciation = usefulLifeMonths > 0
    ? round2Money(divMoney(mulMoney(acquisitionCost, divMoney(depreciationRate, 100)), 12)).toNumber()
    : 0

  // القيمة المتبقية التقديرية = التكلفة - (الإهلاك السنوي × عدد السنوات)
  // إذا كانت النتيجة سلبية نأخذ 0 (الأصل يُهلك بالكامل)
  let residualValue: number
  if (input.residualValue !== undefined && input.residualValue !== null) {
    residualValue = Math.max(0, Number(input.residualValue) || 0)
  } else if (usefulLifeYears > 0 && annualDepreciation > 0) {
    residualValue = Math.max(0, acquisitionCost - annualDepreciation * usefulLifeYears)
  } else {
    residualValue = 0
  }

  const totalDepreciableAmount = Math.max(0, acquisitionCost - residualValue)
  const accumulatedDepreciation = Math.max(0, Number(input.accumulatedDepreciation) || 0)
  const netBookValue = Math.max(residualValue, acquisitionCost - accumulatedDepreciation)

  return {
    acquisitionCost,
    residualValue,
    usefulLifeMonths,
    usefulLifeYears,
    depreciationRate,
    annualDepreciation,
    monthlyDepreciation,
    totalDepreciableAmount,
    netBookValue,
  }
}

// ---------------------------------------------------------------------------
// 2) توليد جدول الإهلاك الكامل (متوقع) لكل أشهر عمر الأصل
// ---------------------------------------------------------------------------

/**
 * توليد جدول الإهلاك الكامل من تاريخ التملك حتى نهاية العمر الإنتاجي.
 * كل صف يمثل شهراً واحداً مع: القيمة الدفترية بداية الشهر، الإهلاك،
 * القيمة الدفترية نهاية الشهر، ومجمع الإهلاك التراكمي.
 *
 * @param asset بيانات الأصل
 * @param postedRecords سجلات الإهلاك الفعلية المُرحَّلة (لتمييز المنفَّذ)
 */
export function generateDepreciationSchedule(
  asset: {
    acquisitionCost: any
    residualValue: any
    usefulLifeMonths: number
    usefulLifeYears?: number
    depreciationRate: any
    acquisitionDate: Date | string
    accumulatedDepreciation?: any
  },
  postedRecords: Array<{
    year: number
    month: number
    depreciationAmount: any
    journalEntry?: { entryNo: string } | null
  }> = []
): ScheduleRow[] {
  const calc = calculateDepreciation({
    acquisitionCost: toNumber(asset.acquisitionCost),
    usefulLifeMonths: asset.usefulLifeMonths,
    usefulLifeYears: asset.usefulLifeYears,
    depreciationRate: toNumber(asset.depreciationRate),
    residualValue: toNumber(asset.residualValue),
  })

  if (calc.monthlyDepreciation <= 0 || calc.usefulLifeMonths <= 0) {
    return []
  }

  const startDate = new Date(asset.acquisitionDate)
  const startYear = startDate.getFullYear()
  const startMonth = startDate.getMonth() + 1 // 1-12

  // خريطة سريعة للسجلات المنفذة
  const postedMap = new Map<string, { amount: number; entryNo?: string }>()
  for (const r of postedRecords) {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`
    postedMap.set(key, {
      amount: toNumber(r.depreciationAmount),
      entryNo: r.journalEntry?.entryNo || undefined,
    })
  }

  const rows: ScheduleRow[] = []
  let accumulated = 0
  let beginningNBV = calc.acquisitionCost

  for (let i = 0; i < calc.usefulLifeMonths; i++) {
    // حساب الشهر والسنة (مع لف السنة)
    const year = startYear + Math.floor((startMonth - 1 + i) / 12)
    const month = ((startMonth - 1 + i) % 12) + 1

    const periodKey = `${year}-${String(month).padStart(2, '0')}`
    const posted = postedMap.get(periodKey)

    // الإهلاك لهذا الشهر (آخر شهر قد يكون مُعدَّلاً للوصول للقيمة المتبقية)
    let depreciationAmount = calc.monthlyDepreciation
    if (i === calc.usefulLifeMonths - 1) {
      // آخر شهر: نُسوّي الفرق للوصول للقيمة المتبقية بالضبط
      depreciationAmount = Math.max(0, calc.acquisitionCost - calc.residualValue - accumulated)
    }

    // التأكد من عدم تجاوز القيمة المتبقية
    if (beginningNBV - depreciationAmount < calc.residualValue) {
      depreciationAmount = Math.max(0, beginningNBV - calc.residualValue)
    }

    const endingNBV = beginningNBV - depreciationAmount
    accumulated += depreciationAmount

    rows.push({
      period: periodKey,
      year,
      month,
      beginningNBV,
      depreciationAmount: posted ? posted.amount : depreciationAmount,
      accumulatedDepreciation: accumulated,
      endingNBV: Math.max(calc.residualValue, endingNBV),
      isPosted: !!posted,
      journalEntryNo: posted?.entryNo || null,
    })

    beginningNBV = Math.max(calc.residualValue, endingNBV)

    // إذا وصلنا للقيمة المتبقية نتوقف
    if (beginningNBV <= calc.residualValue + 0.001) break
  }

  return rows
}

// ---------------------------------------------------------------------------
// 3) حلّ الحسابات المحاسبية للأصل عبر الأدوار
// ---------------------------------------------------------------------------

/**
 * حلّ الحسابات الثلاثة للأصل:
 *   - حساب الأصل الثابت (FIXED_ASSET)
 *   - حساب مصروف الإهلاك (DEPRECIATION_EXPENSE أو RENTAL_DEPRECIATION للمعدات)
 *   - حساب مجمع الإهلاك (ACCUM_DEPRECIATION)
 *
 * إذا لم تُعطَ IDs صريحة، تُجلب من الأدوار تلقائياً.
 */
export async function resolveAssetAccounts(
  category: string,
  overrides?: {
    accountId?: string | null
    depExpenseAccountId?: string | null
    accumDepAccountId?: string | null
  },
  tx?: PrismaTransaction
): Promise<{
  accountId: string | null
  depExpenseAccountId: string | null
  accumDepAccountId: string | null
  assetAccountCode: string | null
  depExpenseAccountCode: string | null
  accumDepAccountCode: string | null
}> {
  const client = tx || db
  const isRental = category === 'EQUIPMENT'
  const expenseRole = isRental ? AccountRole.RENTAL_DEPRECIATION : AccountRole.DEPRECIATION_EXPENSE

  // حساب الأصل
  let accountId: string | null = overrides?.accountId || null
  let assetAccountCode: string | null = null
  if (accountId) {
    const acc = await client.account.findUnique({ where: { id: accountId }, select: { code: true } })
    assetAccountCode = acc?.code || null
  } else {
    const acc = await getDefaultAccountByRole(AccountRole.FIXED_ASSET, tx)
    accountId = acc?.id || null
    assetAccountCode = acc?.code || null
  }

  // حساب مصروف الإهلاك
  let depExpenseAccountId: string | null = overrides?.depExpenseAccountId || null
  let depExpenseAccountCode: string | null = null
  if (depExpenseAccountId) {
    const acc = await client.account.findUnique({ where: { id: depExpenseAccountId }, select: { code: true } })
    depExpenseAccountCode = acc?.code || null
  } else {
    const acc = await getDefaultAccountByRole(expenseRole, tx)
    depExpenseAccountId = acc?.id || null
    depExpenseAccountCode = acc?.code || null
    // إذا لم نجد RENTAL_DEPRECIATION نرجع للدور العام
    if (!acc && isRental) {
      const fallback = await getDefaultAccountByRole(AccountRole.DEPRECIATION_EXPENSE, tx)
      depExpenseAccountId = fallback?.id || null
      depExpenseAccountCode = fallback?.code || null
    }
  }

  // حساب مجمع الإهلاك
  let accumDepAccountId: string | null = overrides?.accumDepAccountId || null
  let accumDepAccountCode: string | null = null
  if (accumDepAccountId) {
    const acc = await client.account.findUnique({ where: { id: accumDepAccountId }, select: { code: true } })
    accumDepAccountCode = acc?.code || null
  } else {
    const acc = await getDefaultAccountByRole(AccountRole.ACCUM_DEPRECIATION, tx)
    accumDepAccountId = acc?.id || null
    accumDepAccountCode = acc?.code || null
  }

  return {
    accountId,
    depExpenseAccountId,
    accumDepAccountId,
    assetAccountCode,
    depExpenseAccountCode,
    accumDepAccountCode,
  }
}

// ---------------------------------------------------------------------------
// 4) توليد كود الأصل التالي
// ---------------------------------------------------------------------------

export async function generateAssetCode(tx?: PrismaTransaction): Promise<string> {
  const client = tx || db
  const last = await client.fixedAsset.findFirst({
    orderBy: { assetCode: 'desc' },
    select: { assetCode: true },
  })
  let nextNum = 1
  if (last?.assetCode) {
    const match = last.assetCode.match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  return `AST-${String(nextNum).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// 5) إنشاء أصل ثابت كامل مع قيد التملك والجدول المتوقع
// ---------------------------------------------------------------------------

/**
 * إنشاء أصل ثابت كامل تسلسلياً:
 *   1) حساب قيم الإهلاك (الشهري/السنوي/المتبقي)
 *   2) حلّ الحسابات الثلاثة عبر الأدوار
 *   3) توليد كود الأصل
 *   4) إنشاء سجل الأصل في قاعدة البيانات
 *   5) إنشاء قيد التملك (Dr: أصل ثابت / Cr: خزينة أو بنك) — إن طُلب
 *   6) توليد جدول الإهلاك المتوقع الكامل
 *
 * كل شيء يُنفذ داخل معاملة واحدة لضمان الاتساق.
 */
export async function createAssetWithAcquisition(
  input: CreateAssetInput
): Promise<CreateAssetResult> {
  return db.$transaction(async (tx) => {
    // (1) حساب قيم الإهلاك
    const calc = calculateDepreciation({
      acquisitionCost: input.acquisitionCost,
      usefulLifeYears: input.usefulLifeYears,
      depreciationRate: input.depreciationRate,
    })

    // (2) حلّ الحسابات
    const accounts = await resolveAssetAccounts(input.category, {
      accountId: input.accountId,
      depExpenseAccountId: input.depExpenseAccountId,
      accumDepAccountId: input.accumDepAccountId,
    }, tx)

    // (3) توليد الكود
    const assetCode = await generateAssetCode(tx)

    // (4) إنشاء السجل
    const acquisitionDate = new Date(input.acquisitionDate)
    const asset = await tx.fixedAsset.create({
      data: {
        assetCode,
        name: input.name,
        nameAr: input.nameAr || null,
        category: input.category,
        acquisitionDate,
        acquisitionCost: calc.acquisitionCost,
        residualValue: calc.residualValue,
        usefulLifeMonths: calc.usefulLifeMonths,
        usefulLifeYears: calc.usefulLifeYears,
        depreciationRate: calc.depreciationRate,
        depreciationMethod: 'STRAIGHT_LINE',
        monthlyDepreciation: calc.monthlyDepreciation,
        annualDepreciation: calc.annualDepreciation,
        accumulatedDepreciation: 0,
        netBookValue: calc.acquisitionCost,
        status: 'ACTIVE',
        accountId: accounts.accountId,
        depExpenseAccountId: accounts.depExpenseAccountId,
        accumDepAccountId: accounts.accumDepAccountId,
        notes: input.notes || null,
      },
      include: {
        account: { select: { id: true, code: true, name: true, nameAr: true } },
        depExpenseAccount: { select: { id: true, code: true, name: true, nameAr: true } },
        accumDepAccount: { select: { id: true, code: true, name: true, nameAr: true } },
        depreciations: true,
      },
    })

    // (5) قيد التملك (إن طُلب ووجد حساب الأصل)
    let acquisitionJournalEntryId: string | null = null
    if (input.createAcquisitionEntry !== false && accounts.assetAccountCode) {
      const paymentRole = input.payFrom === 'BANK' ? AccountRole.BANK : AccountRole.CASH
      // BA-08: no hardcoded fallback — throw if role not mapped
      const paymentCode = await requireAccountCodeByRole(paymentRole, 'تملك أصل ثابت', tx)
      const assetName = input.nameAr || input.name

      try {
        const je = await createJournalEntry({
          date: acquisitionDate,
          description: `Acquisition of ${input.name}`,
          descriptionAr: `تملك أصل ثابت: ${assetName}`,
          lines: [
            { accountCode: accounts.assetAccountCode, debit: calc.acquisitionCost, credit: 0 },
            { accountCode: paymentCode, debit: 0, credit: calc.acquisitionCost },
          ],
          sourceType: 'ASSET_ACQUISITION',
          sourceId: asset.id,
        }, tx)

        acquisitionJournalEntryId = je?.id || null
        if (acquisitionJournalEntryId) {
          await tx.fixedAsset.update({
            where: { id: asset.id },
            data: { journalEntryId: acquisitionJournalEntryId },
          })
        }
      } catch (err) {
        console.error('[depreciation-engine] Acquisition JE failed:', err)
        // نكمل حتى لو فشل القيد — الأصل أُنشئ
      }
    }

    // (6) جدول الإهلاك المتوقع
    const schedule = generateDepreciationSchedule(asset)

    return {
      asset: { ...asset, journalEntryId: acquisitionJournalEntryId },
      acquisitionJournalEntryId,
      schedule,
      calculation: calc,
    }
  })
}

// ---------------------------------------------------------------------------
// 6) تحديث أصل ثابت وإعادة حساب القيم
// ---------------------------------------------------------------------------

/**
 * تحديث أصل ثابت. إذا تغيّرت القيم الجوهرية (التكلفة، السنوات، النسبة)
 * تُعاد حساب قيم الإهلاك تلقائياً.
 *
 * القاعدة: لا يمكن تعديل أصل تم إهلاكه ما لم يُعكس القيد أولاً.
 */
export async function updateAssetAndRecalculate(
  input: UpdateAssetInput
): Promise<{ asset: any; calculation: DepreciationCalculation; schedule: ScheduleRow[] }> {
  return db.$transaction(async (tx) => {
    const existing = await tx.fixedAsset.findUnique({
      where: { id: input.id },
      include: { _count: { select: { depreciations: true } } },
    })

    if (!existing) {
      throw new Error('الأصل غير موجود')
    }

    // التحقق من عدم وجود إهلاكات منفذة
    const activeDeps = await tx.assetDepreciation.count({
      where: { fixedAssetId: input.id, reversed: false },
    })
    if (activeDeps > 0) {
      throw new Error('لا يمكن تعديل أصل تم إهلاكه — يجب عكس القيود أولاً')
    }

    // تجميع القيم الجديدة (نأخذ القديم إذا لم يُعطَ جديد)
    const newCost = input.acquisitionCost !== undefined ? Number(input.acquisitionCost) : toNumber(existing.acquisitionCost)
    const newYears = input.usefulLifeYears !== undefined ? Number(input.usefulLifeYears) : existing.usefulLifeYears
    const newRate = input.depreciationRate !== undefined ? Number(input.depreciationRate) : toNumber(existing.depreciationRate)
    const newCategory = input.category || existing.category

    // إعادة الحساب
    const calc = calculateDepreciation({
      acquisitionCost: newCost,
      usefulLifeYears: newYears,
      depreciationRate: newRate,
    })

    // حلّ الحسابات (فقط إذا تغيّرت)
    let accountOverrides: any = {}
    if (input.accountId !== undefined || input.depExpenseAccountId !== undefined || input.accumDepAccountId !== undefined || input.category !== undefined) {
      const accounts = await resolveAssetAccounts(newCategory, {
        accountId: input.accountId !== undefined ? input.accountId : existing.accountId,
        depExpenseAccountId: input.depExpenseAccountId !== undefined ? input.depExpenseAccountId : existing.depExpenseAccountId,
        accumDepAccountId: input.accumDepAccountId !== undefined ? input.accumDepAccountId : existing.accumDepAccountId,
      }, tx)
      accountOverrides = {
        accountId: accounts.accountId,
        depExpenseAccountId: accounts.depExpenseAccountId,
        accumDepAccountId: accounts.accumDepAccountId,
      }
    }

    const updated = await tx.fixedAsset.update({
      where: { id: input.id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.nameAr !== undefined && { nameAr: input.nameAr }),
        ...(input.category && { category: input.category }),
        ...(input.acquisitionDate && { acquisitionDate: new Date(input.acquisitionDate) }),
        acquisitionCost: calc.acquisitionCost,
        residualValue: calc.residualValue,
        usefulLifeMonths: calc.usefulLifeMonths,
        usefulLifeYears: calc.usefulLifeYears,
        depreciationRate: calc.depreciationRate,
        monthlyDepreciation: calc.monthlyDepreciation,
        annualDepreciation: calc.annualDepreciation,
        netBookValue: calc.acquisitionCost, // لا يوجد إهلاك بعد (تم التحقق)
        accumulatedDepreciation: 0,
        ...(input.notes !== undefined && { notes: input.notes }),
        ...accountOverrides,
      },
      include: {
        account: { select: { id: true, code: true, name: true, nameAr: true } },
        depExpenseAccount: { select: { id: true, code: true, name: true, nameAr: true } },
        accumDepAccount: { select: { id: true, code: true, name: true, nameAr: true } },
        depreciations: true,
      },
    })

    const schedule = generateDepreciationSchedule(updated, [])

    return { asset: updated, calculation: calc, schedule }
  })
}

// ---------------------------------------------------------------------------
// 7) تشغيل الإهلاك لأصل واحد لشهر محدد
// ---------------------------------------------------------------------------

export interface DepreciationRunResult {
  assetId: string
  assetCode: string
  assetName: string
  period: string
  depreciationAmount: number
  beginningNBV: number
  endingNBV: number
  journalEntryId: string | null
  journalEntryNo: string | null
  fullyDepreciated: boolean
  skipped?: boolean
  skipReason?: string
}

/**
 * تشغيل الإهلاك لأصل واحد لشهر وسنة محددة.
 *
 * التسلسل:
 *   1) التحقق من حالة الأصل (نشط)
 *   2) التحقق من عدم وجود إهلاك سابق لنفس الفترة
 *   3) حساب مبلغ الإهلاك (مع تسوية آخر شهر للقيمة المتبقية)
 *   4) التحقق من عدم تجاوز القيمة المتبقية
 *   5) إنشاء قيد اليومية (Dr: مصروف إهلاك / Cr: مجمع إهلاك)
 *   6) إنشاء سجل AssetDepreciation
 *   7) تحديث الأصل (مجمع الإهلاك، القيمة الدفترية، الحالة، آخر إهلاك)
 */
export async function runDepreciationForAsset(
  assetId: string,
  year: number,
  month: number,
  tx?: PrismaTransaction
): Promise<DepreciationRunResult> {
  const run = async (t: PrismaTransaction) => {
    const asset = await t.fixedAsset.findUnique({ where: { id: assetId } })
    if (!asset) throw new Error('الأصل غير موجود')

    const assetName = asset.nameAr || asset.name
    const period = `${year}-${String(month).padStart(2, '0')}`

    if (asset.status !== 'ACTIVE') {
      return {
        assetId, assetCode: asset.assetCode, assetName, period,
        depreciationAmount: 0, beginningNBV: 0, endingNBV: 0,
        journalEntryId: null, journalEntryNo: null, fullyDepreciated: false,
        skipped: true, skipReason: `الأصل ليس نشطاً (${asset.status})`,
      }
    }

    // التحقق من التكرار
    const existing = await t.assetDepreciation.findFirst({
      where: { fixedAssetId: assetId, year, month, reversed: false },
    })
    if (existing) {
      return {
        assetId, assetCode: asset.assetCode, assetName, period,
        depreciationAmount: 0, beginningNBV: 0, endingNBV: 0,
        journalEntryId: null, journalEntryNo: null, fullyDepreciated: false,
        skipped: true, skipReason: 'تم الإهلاك مسبقاً لهذه الفترة',
      }
    }

    // الحساب
    const currentAccumDep = toNumber(asset.accumulatedDepreciation)
    const acquisitionCost = toNumber(asset.acquisitionCost)
    const residualValue = toNumber(asset.residualValue)
    const monthlyDep = toNumber(asset.monthlyDepreciation)

    if (monthlyDep <= 0) {
      return {
        assetId, assetCode: asset.assetCode, assetName, period,
        depreciationAmount: 0, beginningNBV: acquisitionCost - currentAccumDep, endingNBV: acquisitionCost - currentAccumDep,
        journalEntryId: null, journalEntryNo: null, fullyDepreciated: false,
        skipped: true, skipReason: 'قيمة الإهلاك الشهري صفر',
      }
    }

    const beginningNBV = acquisitionCost - currentAccumDep
    if (beginningNBV <= residualValue + 0.01) {
      return {
        assetId, assetCode: asset.assetCode, assetName, period,
        depreciationAmount: 0, beginningNBV, endingNBV: beginningNBV,
        journalEntryId: null, journalEntryNo: null, fullyDepreciated: true,
        skipped: true, skipReason: 'وصل للقيمة المتبقية',
      }
    }

    // حساب مبلغ الإهلاك (مع تسوية الشهر الأخير)
    let depreciationAmount = monthlyDep
    const projectedNBV = beginningNBV - monthlyDep
    if (projectedNBV < residualValue) {
      depreciationAmount = beginningNBV - residualValue
    }

    if (depreciationAmount <= 0) {
      return {
        assetId, assetCode: asset.assetCode, assetName, period,
        depreciationAmount: 0, beginningNBV, endingNBV: beginningNBV,
        journalEntryId: null, journalEntryNo: null, fullyDepreciated: true,
        skipped: true, skipReason: 'لا يوجد مبلغ قابل للإهلاك',
      }
    }

    // حلّ الحسابات
    const isRental = asset.category === 'EQUIPMENT'
    const expenseRole = isRental ? AccountRole.RENTAL_DEPRECIATION : AccountRole.DEPRECIATION_EXPENSE
    let depExpenseCode = await getAccountCodeByRole(expenseRole, t)
    if (!depExpenseCode && isRental) {
      depExpenseCode = await getAccountCodeByRole(AccountRole.DEPRECIATION_EXPENSE, t)
    }
    const accumDepCode = await getAccountCodeByRole(AccountRole.ACCUM_DEPRECIATION, t)

    if (!depExpenseCode || !accumDepCode) {
      return {
        assetId, assetCode: asset.assetCode, assetName, period,
        depreciationAmount, beginningNBV, endingNBV: beginningNBV - depreciationAmount,
        journalEntryId: null, journalEntryNo: null, fullyDepreciated: false,
        skipped: true, skipReason: 'لم يتم ربط حسابات الإهلاك في دليل الحسابات',
      }
    }

    // تاريخ القيد (أول يوم من الشهر)
    const periodDate = new Date(year, month - 1, 1)

    // إنشاء القيد
    let journalEntryId: string | null = null
    let journalEntryNo: string | null = null
    try {
      // FIX-RBAC-VAT / AUDIT-ACCT Q7: use the shared sequential entry-no
      // generator (JE-NNNNNN) instead of a Date.now() suffix — bulk
      // depreciation runs otherwise collide on the same millisecond and the
      // guard's R7 uniqueness check fails the entire run atomically.
      const stdEntryNo = await getNextEntryNo(t)
      const je = await createJournalEntry({
        entryNo: stdEntryNo,
        date: periodDate,
        description: `Depreciation - ${asset.name} (${month}/${year})`,
        descriptionAr: `إهلاك ${assetName} - ${month}/${year}`,
        lines: [
          { accountCode: depExpenseCode, debit: depreciationAmount, credit: 0 },
          { accountCode: accumDepCode, debit: 0, credit: depreciationAmount },
        ],
        sourceType: 'DEPRECIATION',
        sourceId: asset.id,
      }, t)
      journalEntryId = je?.id || null
      journalEntryNo = je?.entryNo || null
    } catch (err: unknown) {
      console.error(`[depreciation-engine] JE failed for ${asset.assetCode}:`, err)
      const errMsg = err instanceof Error ? err.message : String(err)
      return {
        assetId, assetCode: asset.assetCode, assetName, period,
        depreciationAmount, beginningNBV, endingNBV: beginningNBV - depreciationAmount,
        journalEntryId: null, journalEntryNo: null, fullyDepreciated: false,
        skipped: true, skipReason: `فشل إنشاء القيد: ${errMsg}`,
      }
    }

    // P1-4b FIX: استخدم Decimal.js للإهلاك المتراكم وصافي القيمة الدفترية
    // لمنع تراكم أخطاء التقريب عبر أشهر الإهلاك المتعددة
    const newAccumDep = round2Money(addMoney(currentAccumDep, depreciationAmount)).toNumber()
    const newNBV = round2Money(subMoney(acquisitionCost, newAccumDep)).toNumber()
    const isFullyDepreciated = newNBV <= residualValue + 0.01

    await t.assetDepreciation.create({
      data: {
        fixedAssetId: assetId,
        year, month,
        depreciationAmount,
        beginningNBV,
        endingNBV: newNBV,
        journalEntryId,
      },
    })

    // تحديث الأصل
    await t.fixedAsset.update({
      where: { id: assetId },
      data: {
        accumulatedDepreciation: newAccumDep,
        netBookValue: newNBV,
        lastDepreciationDate: periodDate,
        status: isFullyDepreciated ? 'FULLY_DEPRECIATED' : 'ACTIVE',
      },
    })

    return {
      assetId, assetCode: asset.assetCode, assetName, period,
      depreciationAmount, beginningNBV, endingNBV: newNBV,
      journalEntryId, journalEntryNo, fullyDepreciated: isFullyDepreciated,
    }
  }

  return tx ? run(tx) : db.$transaction(run)
}

// ---------------------------------------------------------------------------
// 8) تشغيل الإهلاك المجمع لجميع الأصول النشطة
// ---------------------------------------------------------------------------

export interface BulkDepreciationResult {
  processed: number
  skipped: number
  totalAmount: number
  results: DepreciationRunResult[]
  skippedDetails: DepreciationRunResult[]
  journalEntryIds: string[]
}

export async function runBulkDepreciation(
  year: number,
  month: number,
  assetIds?: string[]
): Promise<BulkDepreciationResult> {
  const assets = await db.fixedAsset.findMany({
    where: {
      status: 'ACTIVE',
      ...(assetIds && assetIds.length > 0 ? { id: { in: assetIds } } : {}),
    },
    orderBy: { assetCode: 'asc' },
  })

  const results: DepreciationRunResult[] = []
  const skippedDetails: DepreciationRunResult[] = []
  let totalAmount = 0
  const journalEntryIds: string[] = []

  for (const asset of assets) {
    const r = await runDepreciationForAsset(asset.id, year, month)
    if (r.skipped) {
      skippedDetails.push(r)
    } else {
      results.push(r)
      totalAmount += r.depreciationAmount
      if (r.journalEntryId) journalEntryIds.push(r.journalEntryId)
    }
  }

  return {
    processed: results.length,
    skipped: skippedDetails.length,
    totalAmount,
    results,
    skippedDetails,
    journalEntryIds,
  }
}

// ---------------------------------------------------------------------------
// 9) عكس إهلاك شهر محدد
// ---------------------------------------------------------------------------

/**
 * عكس إهلاك شهر محدد لأصل ما:
 *   1) التحقق من وجود السجل وأنه لم يُعكس سابقاً
 *   2) عكس قيد اليومية المرتبط (عبر reverseEntry)
 *   3) تعليم السجل بـ reversed=true
 *   4) إعادة حساب مجمع الإهلاك والقيمة الدفترية للأصل
 *   5) إعادة الحالة إلى ACTIVE إذا كانت FULLY_DEPRECIATED
 */
export async function reverseAssetDepreciation(
  depreciationId: string,
  tx?: PrismaTransaction
): Promise<{ success: boolean; message: string }> {
  const run = async (t: PrismaTransaction) => {
    const dep = await t.assetDepreciation.findUnique({
      where: { id: depreciationId },
      include: { fixedAsset: true },
    })

    if (!dep) throw new Error('سجل الإهلاك غير موجود')
    if (dep.reversed) throw new Error('تم عكس هذا الإهلاك مسبقاً')
    if (!dep.journalEntryId) throw new Error('لا يوجد قيد محاسبي مرتبط بهذا الإهلاك')

    // (2) عكس القيد
    await reverseEntry(dep.journalEntryId, t)

    // (3) تعليم السجل
    await t.assetDepreciation.update({
      where: { id: depreciationId },
      data: {
        reversed: true,
        reversedAt: new Date(),
      },
    })

    // (4) إعادة حساب الأصل
    const asset = dep.fixedAsset
    const newAccumDep = toNumber(asset.accumulatedDepreciation) - toNumber(dep.depreciationAmount)
    const newNBV = toNumber(asset.acquisitionCost) - newAccumDep

    await t.fixedAsset.update({
      where: { id: asset.id },
      data: {
        accumulatedDepreciation: Math.max(0, newAccumDep),
        netBookValue: newNBV,
        status: 'ACTIVE', // نُعيد الحالة إلى نشط
      },
    })

    return { success: true, message: `تم عكس إهلاك ${dep.month}/${dep.year} للأصل ${asset.assetCode}` }
  }

  return tx ? run(tx) : db.$transaction(run)
}

// ---------------------------------------------------------------------------
// 10) حذف أصل (مع التحقق من عدم وجود إهلاكات فعالة)
// ---------------------------------------------------------------------------

export async function deleteAsset(
  assetId: string,
  tx?: PrismaTransaction
): Promise<{ success: boolean; message: string }> {
  const run = async (t: PrismaTransaction) => {
    const asset = await t.fixedAsset.findUnique({
      where: { id: assetId },
      include: { _count: { select: { depreciations: true } } },
    })

    if (!asset) throw new Error('الأصل غير موجود')

    const activeDeps = await t.assetDepreciation.count({
      where: { fixedAssetId: assetId, reversed: false },
    })
    if (activeDeps > 0) {
      throw new Error('لا يمكن حذف أصل تم إهلاكه — يجب عكس القيود أولاً')
    }

    // عكس قيد التملك إن وُجد
    if (asset.journalEntryId) {
      try {
        await reverseEntry(asset.journalEntryId, t)
      } catch (err) {
        console.warn('[depreciation-engine] Could not reverse acquisition JE:', err)
      }
    }

    // حذف سجلات الإهلاك المعكوسة (إن وُجدت) ثم الأصل
    await t.assetDepreciation.deleteMany({ where: { fixedAssetId: assetId } })
    await t.fixedAsset.delete({ where: { id: assetId } })

    return { success: true, message: `تم حذف الأصل ${asset.assetCode}` }
  }

  return tx ? run(tx) : db.$transaction(run)
}

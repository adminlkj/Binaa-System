// ============================================================================
// نظام بِنَاء ERP - الثوابت المحاسبية الموحّدة
// Binaa ERP - Unified Accounting Constants
// ============================================================================
//
// هذا الملف هو المصدر الوحيد (Single Source of Truth) لكل الثوابت المحاسبية:
//   - أنواع الحسابات (AccountType)
//   - الرصيد الطبيعي لكل نوع (NORMAL_BALANCE)
//   - قالب دليل الحسابات (CHART_OF_ACCOUNTS_TEMPLATE)
//   - أنواع القيود (JournalEntryTemplate)
//
// أي كود في النظام يحتاج هذه الثوابت MUST يستوردها من هنا، وليس من engine.ts.
// engine.ts و report-engine.ts (queries.ts) كلاهما يعيد تصدير هذه الثوابت للتوافق الخلفي.
// ============================================================================

import type { PrismaClient } from '@prisma/client'

// ============ ACCOUNT TYPE ============

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

// Backward-compat alias (engine.ts historically used `AccountTypeValue`)
export type AccountTypeValue = AccountType

export const AccountType = {
  ASSET: 'ASSET',           // أصول
  LIABILITY: 'LIABILITY',   // خصوم
  EQUITY: 'EQUITY',         // حقوق ملكية
  REVENUE: 'REVENUE',       // إيرادات
  EXPENSE: 'EXPENSE',       // مصروفات
} as const

// Normal balance side for each account type — the canonical reference.
// ASSET/EXPENSE → DEBIT normal (debit increases, credit decreases)
// LIABILITY/EQUITY/REVENUE → CREDIT normal (credit increases, debit decreases)
export const NORMAL_BALANCE: Record<AccountType, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
  EXPENSE: 'DEBIT',
}

/**
 * Sign multiplier for converting raw (debit - credit) into signed balance
 * respecting normal balance side.
 *
 *   signed = signForType(type) * (debit - credit)
 *
 * ASSET/EXPENSE → +1 (debit-positive)
 * LIABILITY/EQUITY/REVENUE → -1 (credit-positive, returned as positive number)
 */
export function signForType(type: string): 1 | -1 {
  return NORMAL_BALANCE[type as AccountType] === 'DEBIT' ? 1 : -1
}

// ============ TRANSACTION CLIENT TYPE ============

/** Prisma transaction client type — used by all functions that accept `tx?`. */
export type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

// ============ ACCOUNT TEMPLATE (Chart of Accounts seed) ============

export interface AccountTemplate {
  code: string
  name: string
  nameAr: string
  type: AccountType
  parentId?: string
  activityType?: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL' | 'BOTH'
  accountRole?: string
  isSystem?: boolean
  allowPosting?: boolean
  level?: number
}

// ============ JOURNAL ENTRY TEMPLATE (input shape for write paths) ============

export interface JournalEntryTemplate {
  entryNo: string
  date: Date
  description: string
  descriptionAr: string
  lines: {
    accountCode: string
    debit: number
    credit: number
    costCenterId?: string
    description?: string
  }[]
  sourceType: string
  sourceId: string
}

// ============ DATE RANGE (used by all read functions) ============

export interface DateRange {
  from?: Date
  to?: Date
}

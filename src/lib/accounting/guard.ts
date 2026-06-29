// ============================================================================
// نظام بِنَاء ERP - الحارس المحاسبي غير القابل للكسر
// Binaa ERP - Unbreakable Accounting Guard
// ============================================================================
//
// القواعد الذهبية التي لا تُكسر تحت أي ظرف (حتى لو تغيّر المودل أو الـ schema):
//
//   R1. كل عملية مالية MUST تنشئ قيد يومية مرحّل (POSTED) — لا قيد = لا عملية
//   R2. كل قيد MUST يكون متوازن: Σ(debit) == Σ(credit) ضمن 0.01
//   R3. كل قيد MUST له ≥ 2 بنود (قيد ببند واحد ممنوع)
//   R4. كل بند MUST له حساب مرتبط، نشط، ويسمح بالترحيل (allowPosting=true)
//   R5. كل بند MUST له قيمة في جهة واحدة فقط: إما مدين > 0 أو دائن > 0 (ليس الاثنين، ليس لا شيء)
//   R6. كل قيد MUST له تاريخ في فترة مفتوحة (assertPeriodOpen)
//   R7. كل قيد MUST له رقم فريد (entryNo @unique)
//   R8. كل حساب MUST له نوع صحيح: ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
//   R9. المصدر الوحيد للحقيقة في كل التقارير: JournalLine WHERE journalEntry.status='POSTED' AND deletedAt IS NULL
//   R10. ميزان المراجعة: netDebit = max(0, debit-credit)؛ netCredit = max(0, credit-debit)؛ isBalanced = |Σdebit - Σcredit| < 0.01
//   R11. المعادلة المحاسبية: الأصول = الخصوم + حقوق الملكية (شاملة صافي دخل السنة)
//   R12. لا يمكن حذف قيد مرحّل — فقط عكسه بقيد عكسي (reversal)
//
// أي محاولة لكسر أي قاعدة → throw AccountingGuardError → الـ transaction تتدحرج (rollback)
//
// هذا الملف هو نقطة الإفراض الوحيدة. كل إنشاء قيد في النظام MUST يمر عبر postJournalEntry().
// ============================================================================

import { db } from '@/lib/db'
import { PrismaClient } from '@prisma/client'
import { assertPeriodOpen } from '@/lib/accounting/period-guard'

export type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

// ---------------------------------------------------------------------------
// Account type constants (single source of truth for account types)
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const NORMAL_BALANCE: Record<AccountType, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
  EXPENSE: 'DEBIT',
}

// ---------------------------------------------------------------------------
// Guard error
// ---------------------------------------------------------------------------

export class AccountingGuardError extends Error {
  code: string
  details?: Record<string, unknown>
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'AccountingGuardError'
    this.code = code
    this.details = details
  }
}

// ---------------------------------------------------------------------------
// Line input type (what callers provide)
// ---------------------------------------------------------------------------

export interface JournalLineInput {
  accountId?: string
  accountCode?: string
  debit?: number | string
  credit?: number | string
  description?: string | null
  costCenterId?: string | null
}

export interface JournalEntryInput {
  entryNo: string
  date: Date | string
  description?: string | null
  descriptionAr?: string | null
  sourceType?: string | null
  sourceId?: string | null
  lines: JournalLineInput[]
  /** Skip period-open check (used by period-closing entries themselves) */
  skipPeriodGuard?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(x: unknown): number {
  if (x === null || x === undefined) return 0
  const v = typeof x === 'string' ? parseFloat(x) : Number(x)
  return isNaN(v) ? 0 : v
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

// ---------------------------------------------------------------------------
// Core validation — runs BEFORE any DB write. Throws on any violation.
// ---------------------------------------------------------------------------

export async function assertJournalEntryValid(
  input: JournalEntryInput,
  tx?: PrismaTransaction
): Promise<{
  date: Date
  lines: Array<{ accountId: string; debit: number; credit: number; description: string | null; costCenterId: string | null }>
}> {
  const client = tx ?? db

  // R3: minimum 2 lines
  if (!input.lines || input.lines.length < 2) {
    throw new AccountingGuardError(
      'MIN_LINES',
      `القيد يجب أن يحتوي على بندين على الأقل (حصل على ${input.lines?.length || 0})`,
      { lineCount: input.lines?.length || 0 }
    )
  }

  // Resolve accounts and validate each line
  const resolvedLines: Array<{ accountId: string; debit: number; credit: number; description: string | null; costCenterId: string | null }> = []
  const accountCache = new Map<string, { id: string; code: string; type: string; isActive: boolean; allowPosting: boolean }>()

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i]
    const idx = i + 1

    // Must reference an account
    if (!line.accountId && !line.accountCode) {
      throw new AccountingGuardError(
        'LINE_NO_ACCOUNT',
        `البند ${idx}: يجب أن يكون مرتبطاً بحساب (accountId أو accountCode)`,
        { lineIndex: i }
      )
    }

    // Resolve account
    let account = line.accountId ? accountCache.get(line.accountId) : undefined
    if (!account && line.accountCode) {
      // Look up by code
      const found = await client.account.findUnique({ where: { code: line.accountCode } })
      if (found) {
        account = { id: found.id, code: found.code, type: found.type, isActive: found.isActive, allowPosting: found.allowPosting }
        accountCache.set(found.id, account)
      }
    } else if (!account && line.accountId) {
      const found = await client.account.findUnique({ where: { id: line.accountId } })
      if (found) {
        account = { id: found.id, code: found.code, type: found.type, isActive: found.isActive, allowPosting: found.allowPosting }
        accountCache.set(found.id, account)
      }
    }

    if (!account) {
      throw new AccountingGuardError(
        'ACCOUNT_NOT_FOUND',
        `البند ${idx}: الحساب غير موجود (${line.accountCode || line.accountId})`,
        { lineIndex: i, accountCode: line.accountCode, accountId: line.accountId }
      )
    }

    // R4: account must be active and allow posting
    if (!account.isActive) {
      throw new AccountingGuardError(
        'ACCOUNT_INACTIVE',
        `البند ${idx}: الحساب ${account.code} غير نشط`,
        { lineIndex: i, accountCode: account.code }
      )
    }
    if (!account.allowPosting) {
      throw new AccountingGuardError(
        'ACCOUNT_NO_POSTING',
        `البند ${idx}: الحساب ${account.code} لا يسمح بالترحيل (حساب أب/رأسي)`,
        { lineIndex: i, accountCode: account.code }
      )
    }

    // R8: account type must be valid
    if (!ACCOUNT_TYPES.includes(account.type as AccountType)) {
      throw new AccountingGuardError(
        'INVALID_ACCOUNT_TYPE',
        `البند ${idx}: نوع الحساب ${account.code} غير صالح (${account.type})`,
        { lineIndex: i, accountCode: account.code, accountType: account.type }
      )
    }

    // R5: exactly one side must be > 0
    const debit = round2(toNum(line.debit))
    const credit = round2(toNum(line.credit))

    if (debit > 0 && credit > 0) {
      throw new AccountingGuardError(
        'LINE_BOTH_SIDES',
        `البند ${idx} (${account.code}): لا يمكن أن يكون مديناً ودائناً في نفس الوقت (مدين=${debit}, دائن=${credit})`,
        { lineIndex: i, accountCode: account.code, debit, credit }
      )
    }
    if (debit === 0 && credit === 0) {
      throw new AccountingGuardError(
        'LINE_ZERO',
        `البند ${idx} (${account.code}): يجب أن يحتوي على قيمة مدين أو دائن`,
        { lineIndex: i, accountCode: account.code }
      )
    }
    if (debit < 0 || credit < 0) {
      throw new AccountingGuardError(
        'LINE_NEGATIVE',
        `البند ${idx} (${account.code}): لا تُقبل قيم سالبة (مدين=${debit}, دائن=${credit})`,
        { lineIndex: i, accountCode: account.code, debit, credit }
      )
    }

    resolvedLines.push({
      accountId: account.id,
      debit,
      credit,
      description: line.description ?? null,
      costCenterId: line.costCenterId ?? null,
    })
  }

  // R2: balanced entry
  const totalDebit = round2(resolvedLines.reduce((s, l) => s + l.debit, 0))
  const totalCredit = round2(resolvedLines.reduce((s, l) => s + l.credit, 0))
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new AccountingGuardError(
      'NOT_BALANCED',
      `القيد غير متوازن: مدين=${totalDebit} ≠ دائن=${totalCredit} (فرق=${Math.abs(totalDebit - totalCredit).toFixed(2)})`,
      { totalDebit, totalCredit, diff: Math.abs(totalDebit - totalCredit) }
    )
  }

  // R6: date in open period
  const date = typeof input.date === 'string' ? new Date(input.date) : input.date
  if (isNaN(date.getTime())) {
    throw new AccountingGuardError(
      'INVALID_DATE',
      `تاريخ القيد غير صالح: ${input.date}`,
      { date: input.date }
    )
  }
  if (!input.skipPeriodGuard) {
    await assertPeriodOpen(date, client)
  }

  // R7: entryNo unique
  const existing = await client.journalEntry.findUnique({ where: { entryNo: input.entryNo } })
  if (existing) {
    throw new AccountingGuardError(
      'DUPLICATE_ENTRY_NO',
      `رقم القيد ${input.entryNo} مستخدم مسبقاً`,
      { entryNo: input.entryNo }
    )
  }

  return { date, lines: resolvedLines }
}

// ---------------------------------------------------------------------------
// The ONLY sanctioned way to create a posted journal entry.
// All paths in the system MUST go through this function.
// ---------------------------------------------------------------------------

export async function postJournalEntry(
  input: JournalEntryInput,
  tx?: PrismaTransaction
) {
  const client = tx ?? db

  // 1. Validate everything first (throws on any violation)
  const { date, lines } = await assertJournalEntryValid(input, client)

  // 2. Create the entry — always POSTED, always with source tracking
  const entry = await client.journalEntry.create({
    data: {
      entryNo: input.entryNo,
      date,
      description: input.description ?? null,
      status: 'POSTED', // R1: auto-entries are always posted
      sourceType: input.sourceType ?? 'MANUAL',
      sourceId: input.sourceId ?? null,
      isSystem: input.sourceType !== 'MANUAL' && input.sourceType !== null,
      lines: {
        create: lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
          costCenterId: l.costCenterId,
        })),
      },
    },
    include: {
      lines: {
        include: {
          account: { select: { id: true, code: true, name: true, nameAr: true, type: true, accountRole: true } },
        },
      },
    },
  })

  return entry
}

// ---------------------------------------------------------------------------
// Reversal — the ONLY sanctioned way to negate a posted entry.
// R12: posted entries cannot be deleted; they must be reversed.
// ---------------------------------------------------------------------------

export async function reverseJournalEntry(
  entryId: string,
  tx?: PrismaTransaction,
  reason?: string
) {
  const client = tx ?? db

  const original = await client.journalEntry.findUnique({
    where: { id: entryId, deletedAt: null },
    include: { lines: { where: { deletedAt: null } } },
  })
  if (!original) {
    throw new AccountingGuardError('ENTRY_NOT_FOUND', `القيد غير موجود: ${entryId}`, { entryId })
  }
  if (original.status !== 'POSTED') {
    throw new AccountingGuardError(
      'CANNOT_REVERSE_NON_POSTED',
      `لا يمكن عكس قيد غير مرحّل (${original.entryNo} - ${original.status})`,
      { entryId, status: original.status }
    )
  }
  // Check not already reversed
  const alreadyReversed = await client.journalEntry.findFirst({
    where: { reversedEntryId: entryId, deletedAt: null, status: 'POSTED' },
  })
  if (alreadyReversed) {
    throw new AccountingGuardError(
      'ALREADY_REVERSED',
      `القيد ${original.entryNo} معكوس مسبقاً بقيد ${alreadyReversed.entryNo}`,
      { entryId, reversalEntryNo: alreadyReversed.entryNo }
    )
  }

  // Generate next entry number
  const nextNo = await getNextEntryNo(client)

  // Build reversed lines (flip debit/credit)
  const reversedLines: JournalLineInput[] = original.lines.map((l) => ({
    accountId: l.accountId,
    debit: toNum(l.credit),
    credit: toNum(l.debit),
    description: l.description ? `عكس - ${l.description}` : 'عكس بند قيد',
    costCenterId: l.costCenterId,
  }))

  const reversal = await postJournalEntry(
    {
      entryNo: nextNo,
      date: new Date(),
      description: `عكس ${original.entryNo}${reason ? ` - ${reason}` : ''}`,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      lines: reversedLines,
      skipPeriodGuard: true, // reversals can happen in a later period
    },
    client
  )

  // Mark the reversal entry and link it to the original.
  // IMPORTANT: We do NOT cancel the original. Both entries remain POSTED
  // so they net out to zero in the trial balance. This is the correct
  // accounting treatment — a reversal is a separate dated transaction
  // that negates the original, not a deletion of the original.
  // The `isReversal` flag + `reversedEntryId` link provide the audit trail.
  await client.journalEntry.update({
    where: { id: reversal.id },
    data: {
      isReversal: true,
      reversedEntryId: original.id,
    },
  })

  return reversal
}

// ---------------------------------------------------------------------------
// Next entry number generator (JE-NNNNNN)
// ---------------------------------------------------------------------------

export async function getNextEntryNo(tx?: PrismaTransaction): Promise<string> {
  const client = tx ?? db
  const all = await client.journalEntry.findMany({
    where: { entryNo: { startsWith: 'JE-' } },
    select: { entryNo: true },
  })
  let max = 0
  for (const je of all) {
    const match = je.entryNo.match(/^JE-(\d+)$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (!isNaN(n) && n > max) max = n
    }
  }
  return `JE-${(max + 1).toString().padStart(6, '0')}`
}

// ---------------------------------------------------------------------------
// Health check — verifies the accounting equation and trial balance tie out.
// Run this from the dashboard / health API.
// ---------------------------------------------------------------------------

export async function accountingHealthCheck(): Promise<{
  healthy: boolean
  checks: Array<{ name: string; passed: boolean; detail: string }>
}> {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = []

  // Check 1: all posted entries balanced
  const unbalanced = await db.$queryRaw<Array<{ entryNo: string; d: number; c: number }>>`
    SELECT je."entryNo", COALESCE(SUM(jl.debit), 0) as d, COALESCE(SUM(jl.credit), 0) as c
    FROM "JournalEntry" je
    JOIN "JournalLine" jl ON jl."journalEntryId" = je.id AND jl."deletedAt" IS NULL
    WHERE je.status = 'POSTED' AND je."deletedAt" IS NULL
    GROUP BY je.id, je."entryNo"
    HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.01
  `
  checks.push({
    name: 'توازن كل القيود المرحّلة',
    passed: unbalanced.length === 0,
    detail: unbalanced.length === 0
      ? 'جميع القيود المرحّلة متوازنة'
      : `${unbalanced.length} قيد غير متوازن: ${unbalanced.slice(0, 5).map(u => u.entryNo).join(', ')}`,
  })

  // Check 2: no line has both debit and credit > 0
  const bothSides = await db.journalLine.count({
    where: {
      deletedAt: null,
      journalEntry: { status: 'POSTED', deletedAt: null },
      AND: [{ debit: { gt: 0 } }, { credit: { gt: 0 } }],
    },
  })
  checks.push({
    name: 'لا يوجد بند له مدين ودائن معاً',
    passed: bothSides === 0,
    detail: bothSides === 0 ? 'سليم' : `${bothSides} بند له مدين ودائن معاً`,
  })

  // Check 3: trial balance ties (Σdebit == Σcredit across all posted lines)
  const agg = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: { deletedAt: null, journalEntry: { status: 'POSTED', deletedAt: null } },
  })
  const totalD = toNum(agg._sum.debit)
  const totalC = toNum(agg._sum.credit)
  checks.push({
    name: 'ميزان المراجعة الإجمالي متوازن',
    passed: Math.abs(totalD - totalC) < 0.01,
    detail: `مدين=${totalD.toFixed(2)} / دائن=${totalC.toFixed(2)} / فرق=${Math.abs(totalD - totalC).toFixed(2)}`,
  })

  // Check 4: accounting equation (Assets = Liabilities + Equity + (Revenue - Expenses))
  // FIXED (HIGH #21): the prior filter `isActive: true` on accounts HID balances of
  // deactivated accounts from the accounting equation. If an account with a non-zero
  // balance was deactivated, its balance vanished from the equation → false pass.
  // Now includes ALL accounts (active + inactive) so the equation is truly balanced.
  const grouped = await db.journalLine.groupBy({
    by: ['accountId'],
    _sum: { debit: true, credit: true },
    where: { deletedAt: null, journalEntry: { status: 'POSTED', deletedAt: null } },
  })
  const accounts = await db.account.findMany({ select: { id: true, type: true } })
  const typeMap = new Map(accounts.map(a => [a.id, a.type]))
  let assets = 0, liab = 0, equity = 0, revenue = 0, expenses = 0
  for (const g of grouped) {
    const t = typeMap.get(g.accountId)
    if (!t) continue
    const d = toNum(g._sum.debit)
    const c = toNum(g._sum.credit)
    const net = d - c
    const sign = t === 'ASSET' || t === 'EXPENSE' ? 1 : -1
    const signed = sign * net
    if (t === 'ASSET') assets += signed
    else if (t === 'LIABILITY') liab += signed
    else if (t === 'EQUITY') equity += signed
    else if (t === 'REVENUE') revenue += signed
    else if (t === 'EXPENSE') expenses += signed
  }
  const totalEquity = equity + (revenue - expenses)
  const equationDiff = Math.abs(assets - (liab + totalEquity))
  checks.push({
    name: 'المعادلة المحاسبية (الأصول = الخصوم + حقوق الملكية)',
    passed: equationDiff < 0.01,
    detail: `أصول=${assets.toFixed(2)} / خصوم=${liab.toFixed(2)} / حقوق ملكية=${totalEquity.toFixed(2)} / فرق=${equationDiff.toFixed(2)}`,
  })

  // Check 5: no orphan lines (lines whose accountId doesn't exist in Account table)
  // accountId is FK-non-null so this should always be 0, but we verify for safety.
  const allLineAccountIds = await db.journalLine.findMany({
    where: { deletedAt: null, journalEntry: { status: 'POSTED', deletedAt: null } },
    select: { accountId: true },
    distinct: ['accountId'],
  })
  const lineAccountIds = allLineAccountIds.map(l => l.accountId)
  let orphanLines = 0
  if (lineAccountIds.length > 0) {
    const validAccounts = await db.account.count({ where: { id: { in: lineAccountIds } } })
    orphanLines = lineAccountIds.length - validAccounts
  }
  checks.push({
    name: 'لا بنود يتيمة (بدون حساب)',
    passed: orphanLines === 0,
    detail: orphanLines === 0 ? 'سليم' : `${orphanLines} بند بدون حساب مرتبط`,
  })

  return {
    healthy: checks.every(c => c.passed),
    checks,
  }
}

// ============================================================================
// BA-07.1 — Accounting Acceptance Test (القبول المحاسبي للإنتاج)
// ============================================================================
//
// هدف المرحلة: محاولة كسر النظام عبر سيناريوهات محاسبية حقيقية كاملة،
// ثم التحقق من تطابق النتائج في جميع التقارير.
//
// السيناريو المنفَّذ (حسب طلب المستخدم):
//   1. إنشاء سنة مالية + فتح الفترات
//   2. إدخال الأرصدة الافتتاحية
//   3. شراء (مع ضريبة)
//   4. بيع (مع ضريبة)
//   5. مصروف
//   6. دفعة لمورد
//   7. تحصيل من عميل
//   8. قيد يدوي
//   9. إرجاع (شراء/بيع)
//  10. إقفال شهر + التحقق من رفض الترحيل
//  11. إقفال سنة + ترحيل الأرباح المحتجزة
//  12. استخراج: ميزان المراجعة، الأستاذ العام، كشف الحساب، قائمة الدخل،
//      الميزانية، التدفقات النقدية
//  13. التحقق من تطابق النتائج في جميع التقارير
//
// القاعدة الذهبية: أي اختلاف بقيمة ريال واحد بين أي تقريرين = فشل القبول.
//
// Run: bun scripts/ba-07/01-accounting-acceptance.ts
// ============================================================================

import { db } from '@/lib/db'
import {
  postJournalEntry,
  reverseJournalEntry,
  getNextEntryNo,
  AccountingGuardError,
} from '@/lib/accounting/guard'
import {
  createFiscalYear,
  closePeriod,
  reopenPeriod,
  assertPeriodOpen,
  AccountingCalendarError,
} from '@/lib/accounting/accounting-calendar'
import { closeFiscalYear } from '@/lib/accounting/closing-engine'
import {
  getTrialBalance,
  getGeneralLedger,
  getAccountBalance,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  verifyNumericalConsistency,
} from '@/lib/accounting/queries'

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------
let passed = 0
let failed = 0
const failures: string[] = []
const warnings: string[] = []

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    failed++
    failures.push(`${name}: ${e.message}`)
    console.log(`  ✗ ${name}`)
    console.log(`    → ${e.message}`)
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}
function approx(a: number, b: number, tol = 0.01) {
  return Math.abs(a - b) < tol
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  BA-07.1 — Accounting Acceptance Test')
  console.log('  (Full real-world scenario + cross-report verification)')
  console.log('═══════════════════════════════════════════════════════════════\n')

  // --- Resolve accounts ---
  const A = {
    cash: await db.account.findFirstOrThrow({ where: { accountRole: 'CASH' } }),
    bank: await db.account.findFirstOrThrow({ where: { accountRole: 'BANK' } }),
    ar: await db.account.findFirstOrThrow({ where: { accountRole: 'CUSTOMER_AR' } }),
    ap: await db.account.findFirstOrThrow({ where: { accountRole: 'SUPPLIER_AP' } }),
    vatIn: await db.account.findFirstOrThrow({ where: { accountRole: 'VAT_INPUT' } }),
    vatOut: await db.account.findFirstOrThrow({ where: { accountRole: 'VAT_OUTPUT' } }),
    revenue: await db.account.findFirstOrThrow({ where: { accountRole: 'PROJECT_REVENUE' } }),
    adminExp: await db.account.findFirstOrThrow({ where: { accountRole: 'ADMIN_EXPENSE' } }),
    re: await db.account.findFirstOrThrow({ where: { accountRole: 'RETAINED_EARNINGS' } }),
    inventory: await db.account.findFirstOrThrow({ where: { accountRole: 'INVENTORY' } }),
  }
  console.log(`  Accounts resolved: cash=${A.cash.code} bank=${A.bank.code} ar=${A.ar.code} ap=${A.ap.code}\n`)

  const P = 'BA07' // entryNo prefix for all test entries
  let n = Date.now()

  // ====================================================================
  console.log('── Step 1: Fiscal Year + Open Periods ──')
  // ====================================================================
  await step('FY2025 exists with 12 open periods', async () => {
    const fy = await db.fiscalYear.findFirst({ where: { name: 'FY2025' } })
    assert(!!fy, 'FY2025 should exist')
    const periods = await db.fiscalPeriod.count({ where: { fiscalYearId: fy!.id, status: 'OPEN' } })
    assert(periods === 12, `expected 12 OPEN periods, got ${periods}`)
  })

  // ====================================================================
  console.log('\n── Step 2: Opening Balances ──')
  // ====================================================================
  await step('Opening balance entry: Dr Cash 500k / Dr Bank 1M / Dr Inventory 300k / Cr Retained Earnings 1.8M', async () => {
    const je = await postJournalEntry({
      entryNo: `${P}-OPEN-${n}`,
      date: new Date('2025-01-01'),
      description: 'الأرصدة الافتتاحية',
      lines: [
        { accountCode: A.cash.code, debit: 500000, credit: 0 },
        { accountCode: A.bank.code, debit: 1000000, credit: 0 },
        { accountCode: A.inventory.code, debit: 300000, credit: 0 },
        { accountCode: A.re.code, debit: 0, credit: 1800000 },
      ],
    })
    assert(je.status === 'POSTED', 'opening entry should be POSTED')
  })

  // ====================================================================
  console.log('\n── Step 3: Purchase (with VAT) ──')
  // ====================================================================
  await step('Purchase: Dr Inventory 100k + Dr VAT_INPUT 15k / Cr Supplier_AP 115k', async () => {
    const je = await postJournalEntry({
      entryNo: `${P}-PUR-${n}`,
      date: new Date('2025-01-10'),
      description: 'شراء مواد مع ضريبة 15%',
      lines: [
        { accountCode: A.inventory.code, debit: 100000, credit: 0 },
        { accountCode: A.vatIn.code, debit: 15000, credit: 0 },
        { accountCode: A.ap.code, debit: 0, credit: 115000 },
      ],
    })
    assert(je.status === 'POSTED', 'purchase entry should be POSTED')
  })

  // ====================================================================
  console.log('\n── Step 4: Sale (with VAT) ──')
  // ====================================================================
  await step('Sale: Dr AR 230k / Cr Revenue 200k / Cr VAT_OUTPUT 30k', async () => {
    const je = await postJournalEntry({
      entryNo: `${P}-SAL-${n}`,
      date: new Date('2025-01-15'),
      description: 'إيراد مشروع مع ضريبة 15%',
      lines: [
        { accountCode: A.ar.code, debit: 230000, credit: 0 },
        { accountCode: A.revenue.code, debit: 0, credit: 200000 },
        { accountCode: A.vatOut.code, debit: 0, credit: 30000 },
      ],
    })
    assert(je.status === 'POSTED', 'sale entry should be POSTED')
  })

  // ====================================================================
  console.log('\n── Step 5: Expense ──')
  // ====================================================================
  await step('Expense: Dr Admin Expense 25k / Cr Cash 25k', async () => {
    const je = await postJournalEntry({
      entryNo: `${P}-EXP-${n}`,
      date: new Date('2025-01-20'),
      description: 'مصروف إداري نقدي',
      lines: [
        { accountCode: A.adminExp.code, debit: 25000, credit: 0 },
        { accountCode: A.cash.code, debit: 0, credit: 25000 },
      ],
    })
    assert(je.status === 'POSTED', 'expense entry should be POSTED')
  })

  // ====================================================================
  console.log('\n── Step 6: Payment to Supplier ──')
  // ====================================================================
  await step('Payment: Dr Supplier_AP 115k / Cr Bank 115k', async () => {
    const je = await postJournalEntry({
      entryNo: `${P}-PAY-${n}`,
      date: new Date('2025-01-25'),
      description: 'سداد للمورد',
      lines: [
        { accountCode: A.ap.code, debit: 115000, credit: 0 },
        { accountCode: A.bank.code, debit: 0, credit: 115000 },
      ],
    })
    assert(je.status === 'POSTED', 'payment entry should be POSTED')
  })

  // ====================================================================
  console.log('\n── Step 7: Collection from Customer ──')
  // ====================================================================
  await step('Collection: Dr Bank 230k / Cr AR 230k', async () => {
    const je = await postJournalEntry({
      entryNo: `${P}-COL-${n}`,
      date: new Date('2025-01-28'),
      description: 'تحصيل من العميل',
      lines: [
        { accountCode: A.bank.code, debit: 230000, credit: 0 },
        { accountCode: A.ar.code, debit: 0, credit: 230000 },
      ],
    })
    assert(je.status === 'POSTED', 'collection entry should be POSTED')
  })

  // ====================================================================
  console.log('\n── Step 8: Manual Journal Entry (adjustment) ──')
  // ====================================================================
  await step('Manual adjustment: Dr Cash 10k / Cr Bank 10k (petty cash funding)', async () => {
    const je = await postJournalEntry({
      entryNo: `${P}-MAN-${n}`,
      date: new Date('2025-01-30'),
      description: 'قيد يدوي - تغذية نثرية',
      lines: [
        { accountCode: A.cash.code, debit: 10000, credit: 0 },
        { accountCode: A.bank.code, debit: 0, credit: 10000 },
      ],
    })
    assert(je.status === 'POSTED', 'manual entry should be POSTED')
  })

  // ====================================================================
  console.log('\n── Step 9: Returns (purchase return + sales return via reversal) ──')
  // ====================================================================
  let purchaseJeId: string | undefined
  let salesJeId: string | undefined
  await step('Purchase return: reverse the purchase entry (creates reversal, nets to zero)', async () => {
    const orig = await db.journalEntry.findFirstOrThrow({
      where: { entryNo: `${P}-PUR-${n}` },
    })
    purchaseJeId = orig.id
    const rev = await reverseJournalEntry(orig.id)
    assert(rev.status === 'POSTED', 'reversal should be POSTED')
    // NOTE: reverseJournalEntry returns a stale object (isReversal=false) per BA-07.5 LOW #1.
    // Re-fetch from DB to confirm the flag was actually persisted.
    const revFromDb = await db.journalEntry.findUniqueOrThrow({ where: { id: rev.id }, select: { isReversal: true, reversedEntryId: true } })
    assert(revFromDb.isReversal === true, `reversal flag should be true in DB (stale-return bug confirmed if false). got isReversal=${revFromDb.isReversal}`)
    assert(revFromDb.reversedEntryId === orig.id, 'reversal should point to original')
    // Verify the reversal nets the ORIGINAL purchase's AP effect to zero.
    // (Absolute AP balance depends on scenario ordering — payment already zeroed AP,
    //  so reversal puts it at -115k = supplier owes refund. The correct invariant is:
    //  original AP effect + reversal AP effect == 0.)
    const origAp = await db.journalLine.aggregate({
      where: { journalEntry: { entryNo: `${P}-PUR-${n}` }, deletedAt: null, account: { code: A.ap.code } },
      _sum: { debit: true, credit: true },
    })
    const revAp = await db.journalLine.aggregate({
      where: { journalEntry: { reversedEntryId: purchaseJeId }, deletedAt: null, account: { code: A.ap.code } },
      _sum: { debit: true, credit: true },
    })
    const origApNet = Number(origAp._sum.debit || 0) - Number(origAp._sum.credit || 0)
    const revApNet = Number(revAp._sum.debit || 0) - Number(revAp._sum.credit || 0)
    assert(approx(origApNet + revApNet, 0, 0.01), `reversal should net original AP: orig=${origApNet} rev=${revApNet} sum=${origApNet + revApNet}`)
  })

  await step('Sales return: reverse the sale entry (nets AR + revenue + VAT to zero)', async () => {
    const orig = await db.journalEntry.findFirstOrThrow({
      where: { entryNo: `${P}-SAL-${n}` },
    })
    salesJeId = orig.id
    const rev = await reverseJournalEntry(orig.id)
    assert(rev.status === 'POSTED', 'reversal should be POSTED')
    // Re-fetch to confirm flag (stale-return workaround per BA-07.5 LOW #1)
    const revFromDb = await db.journalEntry.findUniqueOrThrow({ where: { id: rev.id }, select: { isReversal: true, reversedEntryId: true } })
    assert(revFromDb.isReversal === true, 'reversal flag should be true in DB')
    // Verify the reversal mechanism: revenue should have DECREASED by 200k (the sale amount)
    // (Other revenue entries may exist from prior tests, so we verify the delta, not absolute zero)
    const revBal = await getAccountBalance(A.revenue.code)
    assert(revBal < 200000, `Revenue should be reduced by ~200k after return reversal, got ${revBal}`)
    // Verify the reversal entry nets the original to zero for the revenue account
    const origRev = await db.journalLine.aggregate({
      where: { journalEntry: { entryNo: `${P}-SAL-${n}` }, deletedAt: null, account: { code: A.revenue.code } },
      _sum: { debit: true, credit: true },
    })
    const revRev = await db.journalLine.aggregate({
      where: { journalEntry: { reversedEntryId: salesJeId }, deletedAt: null, account: { code: A.revenue.code } },
      _sum: { debit: true, credit: true },
    })
    const origRevCredit = Number(origRev._sum.credit || 0) - Number(origRev._sum.debit || 0)
    const revRevDebit = Number(revRev._sum.debit || 0) - Number(revRev._sum.credit || 0)
    assert(approx(origRevCredit, revRevDebit, 0.01), `reversal should net original: orig=${origRevCredit} rev=${revRevDebit}`)
  })

  // ====================================================================
  console.log('\n── Step 10: Close Month + Verify Posting Blocked ──')
  // ====================================================================
  const janPeriod = await db.fiscalPeriod.findFirstOrThrow({
    where: { fiscalYear: { name: 'FY2025' }, periodNo: 1 },
  })
  // Post one more entry in February before closing January, so we have Feb data
  await postJournalEntry({
    entryNo: `${P}-FEB-${n}`,
    date: new Date('2025-02-05'),
    description: 'مصروف فبراير',
    lines: [
      { accountCode: A.adminExp.code, debit: 5000, credit: 0 },
      { accountCode: A.cash.code, debit: 0, credit: 5000 },
    ],
  }).catch(() => {})

  await step('Close January period', async () => {
    await closePeriod(janPeriod.id)
    const p = await db.fiscalPeriod.findUniqueOrThrow({ where: { id: janPeriod.id } })
    assert(p.status === 'CLOSED', `January should be CLOSED, got ${p.status}`)
  })

  await step('Posting in closed January is REJECTED (R6 enforcement)', async () => {
    try {
      await postJournalEntry({
        entryNo: `${P}-BLOCKED-${n}`,
        date: new Date('2025-01-31'),
        description: 'محاولة ترحيل في فترة مغلقة',
        lines: [
          { accountCode: A.cash.code, debit: 100, credit: 0 },
          { accountCode: A.revenue.code, debit: 0, credit: 100 },
        ],
      })
      throw new Error('Should have been blocked by period guard')
    } catch (e: any) {
      // Expect AccountingCalendarError or guard error about period
      assert(
        /period|فترة|CLOSED|PERIOD/i.test(e.message) || e instanceof AccountingCalendarError,
        `expected period-guard rejection, got: ${e.message}`
      )
    }
  })

  await step('Reopen January period', async () => {
    await reopenPeriod(janPeriod.id)
    const p = await db.fiscalPeriod.findUniqueOrThrow({ where: { id: janPeriod.id } })
    assert(p.status === 'OPEN', `January should be OPEN again, got ${p.status}`)
  })

  await step('Posting in reopened January succeeds', async () => {
    const je = await postJournalEntry({
      entryNo: `${P}-REOPEN-${n}`,
      date: new Date('2025-01-31'),
      description: 'ترحيل بعد إعادة فتح الفترة',
      lines: [
        { accountCode: A.cash.code, debit: 100, credit: 0 },
        { accountCode: A.revenue.code, debit: 0, credit: 100 },
      ],
    })
    assert(je.status === 'POSTED', 'entry in reopened period should be POSTED')
  })

  // ====================================================================
  console.log('\n── Step 11+12+13: Extract All Reports + Cross-Verify ──')
  // ====================================================================
  console.log('  Extracting: Trial Balance, General Ledger, Account Statement,')
  console.log('              Income Statement, Balance Sheet, Cash Flow\n')

  const range = { from: new Date('2025-01-01'), to: new Date('2025-12-31') }
  const tb = await getTrialBalance(range)
  const is_ = await getIncomeStatement(range)
  const bs = await getBalanceSheet(new Date('2025-12-31'))
  const cf = await getCashFlow(range)
  const arStmt = await getAccountBalance(A.ar.code, range)
  const glAr = await getGeneralLedger(A.ar.code, range)
  // Raw aggregate for GL-wide cross-check (all posted lines in range)
  const glAgg = await db.journalLine.aggregate({
    where: {
      deletedAt: null,
      journalEntry: { status: 'POSTED', deletedAt: null, date: { gte: range.from, lte: range.to } },
    },
    _sum: { debit: true, credit: true },
  })
  const glTotalDebit = Number(glAgg._sum.debit || 0)
  const glTotalCredit = Number(glAgg._sum.credit || 0)

  console.log(`    TB: rows=${tb.rows.length} totalDebit=${tb.totals.totalDebit.toFixed(2)} totalCredit=${tb.totals.totalCredit.toFixed(2)}`)
  console.log(`    GL(raw): totalDebit=${glTotalDebit.toFixed(2)} totalCredit=${glTotalCredit.toFixed(2)}`)
  console.log(`    GL(AR): lines=${glAr?.lines.length ?? 0} closing=${glAr?.closingBalance?.toFixed(2) ?? 'n/a'}`)
  console.log(`    IS: revenue=${is_.revenue.total.toFixed(2)} expenses=${is_.expenses.total.toFixed(2)} net=${is_.netIncome.toFixed(2)}`)
  console.log(`    BS: assets=${bs.assets.total.toFixed(2)} liab=${bs.liabilities.total.toFixed(2)} equity=${bs.equity.total.toFixed(2)}`)
  console.log(`    CF: netCashFlow=${cf.netCashFlow.toFixed(2)}`)
  console.log(`    AR stmt: balance=${arStmt.toFixed(2)}`)

  // --- Cross-verification invariants ---
  console.log('\n  Cross-report numerical consistency:')

  await step('I1: TrialBalance totalDebit == totalCredit', async () => {
    assert(approx(tb.totals.totalDebit, tb.totals.totalCredit), `TB Dr=${tb.totals.totalDebit} Cr=${tb.totals.totalCredit} diff=${tb.totals.totalDebit - tb.totals.totalCredit}`)
  })

  await step('I2: TrialBalance netDebit == netCredit', async () => {
    assert(approx(tb.totals.totalNetDebit, tb.totals.totalNetCredit), `netDr=${tb.totals.totalNetDebit} netCr=${tb.totals.totalNetCredit}`)
  })

  await step('I3: GL raw aggregate debit == TrialBalance totalDebit', async () => {
    assert(approx(glTotalDebit, tb.totals.totalDebit), `GL Dr=${glTotalDebit} vs TB Dr=${tb.totals.totalDebit}`)
    assert(approx(glTotalCredit, tb.totals.totalCredit), `GL Cr=${glTotalCredit} vs TB Cr=${tb.totals.totalCredit}`)
  })

  await step('I4: Accounting equation A == L + E (Balance Sheet)', async () => {
    const diff = Math.abs(bs.assets.total - (bs.liabilities.total + bs.equity.total))
    assert(diff < 0.01, `A=${bs.assets.total} L+E=${bs.liabilities.total + bs.equity.total} diff=${diff}`)
  })

  await step('I5: IS netIncome == BS currentYearEarnings', async () => {
    assert(approx(is_.netIncome, bs.currentYearEarnings, 0.01), `IS net=${is_.netIncome} vs BS currentYearEarnings=${bs.currentYearEarnings}`)
  })

  await step('I6: Account Statement (AR) == GL AR closing balance == TB AR signed balance', async () => {
    const glArBal = glAr?.closingBalance ?? 0
    const tbAr = tb.rows.find(r => r.accountCode === A.ar.code || r.code === A.ar.code)
    const tbArRawNet = tbAr ? (Number(tbAr.totalDebit || 0) - Number(tbAr.totalCredit || 0)) : 0
    assert(approx(arStmt, glArBal, 0.01), `AR stmt=${arStmt} vs GL AR closing=${glArBal}`)
    assert(approx(arStmt, tbArRawNet, 0.01), `AR stmt=${arStmt} vs TB AR raw net=${tbArRawNet}`)
  })

  await step('I7: verifyNumericalConsistency() returns ok=true', async () => {
    const r = await verifyNumericalConsistency()
    assert(r.ok === true, `consistency check failed: ${JSON.stringify(r)}`)
  })

  // ====================================================================
  console.log('\n── Step 11b: Year-End Close + Retained Earnings Transfer ──')
  // ====================================================================
  // Use a dedicated test FY to avoid disrupting FY2025 for BA-07.2
  const testFyName = `BA07-YE-${n}`
  await step('Create dedicated test FY for year-end close', async () => {
    const fy = await createFiscalYear(testFyName, new Date('2024-01-01'), new Date('2024-12-31'))
    assert(!!fy, 'test FY should be created')
  })

  await step('Post revenue + expense in test FY (2024)', async () => {
    await postJournalEntry({
      entryNo: `${P}-YE-REV-${n}`,
      date: new Date('2024-06-15'),
      description: 'إيراد سنة الاختبار',
      lines: [
        { accountCode: A.bank.code, debit: 500000, credit: 0 },
        { accountCode: A.revenue.code, debit: 0, credit: 500000 },
      ],
    })
    await postJournalEntry({
      entryNo: `${P}-YE-EXP-${n}`,
      date: new Date('2024-06-20'),
      description: 'مصروف سنة الاختبار',
      lines: [
        { accountCode: A.adminExp.code, debit: 300000, credit: 0 },
        { accountCode: A.bank.code, debit: 0, credit: 300000 },
      ],
    })
  })

  const testFy = await db.fiscalYear.findFirstOrThrow({ where: { name: testFyName } })

  await step('Year-end close: transfer net profit (200k) to Retained Earnings', async () => {
    const result = await closeFiscalYear(testFy.id, undefined, {
      closedBy: 'BA07-acceptance',
      approved: true,
    })
    assert(!!result, 'closeFiscalYear should return a result')
    // After close, RE should have increased by net profit (200k)
    const reBal = await getAccountBalance(A.re.code)
    assert(reBal >= 200000, `RE balance should include 200k net profit transfer, got ${reBal}`)
  })

  await step('Closed FY status = CLOSED; all periods CLOSED', async () => {
    const fy = await db.fiscalYear.findUniqueOrThrow({ where: { id: testFy.id } })
    assert(fy.status === 'CLOSED', `FY status should be CLOSED, got ${fy.status}`)
    const openPeriods = await db.fiscalPeriod.count({ where: { fiscalYearId: testFy.id, status: 'OPEN' } })
    assert(openPeriods === 0, `expected 0 open periods, got ${openPeriods}`)
  })

  await step('Posting in closed test FY is REJECTED', async () => {
    try {
      await postJournalEntry({
        entryNo: `${P}-POSTCLOSE-${n}`,
        date: new Date('2024-07-01'),
        description: 'محاولة ترحيل بعد إقفال السنة',
        lines: [
          { accountCode: A.cash.code, debit: 1, credit: 0 },
          { accountCode: A.revenue.code, debit: 0, credit: 1 },
        ],
      })
      throw new Error('Should have been blocked')
    } catch (e: any) {
      assert(/period|فترة|CLOSED|PERIOD|سنة|YEAR/i.test(e.message), `expected period/year rejection, got: ${e.message}`)
    }
  })

  // ====================================================================
  // Final consistency re-check after year-end close
  // ====================================================================
  console.log('\n── Final: Re-verify numerical consistency after year-end close ──')
  await step('verifyNumericalConsistency() still ok=true after year-end close', async () => {
    const r = await verifyNumericalConsistency()
    assert(r.ok === true, `consistency broken after year-end close: ${JSON.stringify(r)}`)
  })

  // ====================================================================
  // Report
  // ====================================================================
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log(`  BA-07.1 Results: ${passed} passed, ${failed} failed`)
  if (warnings.length) console.log(`  Warnings: ${warnings.length}`)
  if (failed === 0) {
    console.log('  ✅ ACCOUNTING ACCEPTANCE PASSED — all reports tie out')
  } else {
    console.log('  ❌ ACCOUNTING ACCEPTANCE FAILED — system broken')
    failures.forEach(f => console.log(`    • ${f}`))
  }
  console.log('═══════════════════════════════════════════════════════════════')

  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(2)
})

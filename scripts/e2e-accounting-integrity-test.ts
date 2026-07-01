// ============================================================================
// P1 E2E: اختبار سلامة المحاسبة من البداية للنهاية (مستوى قاعدة البيانات)
// يختبر محرك المحاسبة الفعلي: postJournalEntry, reverseJournalEntry,
// getTrialBalance, getBalanceSheet, verifyNumericalConsistency
// ============================================================================

import { db } from '@/lib/db'
import { postJournalEntry, reverseJournalEntry, getNextEntryNo, accountingHealthCheck } from '@/lib/accounting/guard'
import { getTrialBalance, getBalanceSheet, getIncomeStatement, verifyNumericalConsistency, getProjectCostBreakdown } from '@/lib/accounting/queries'
import { toDecimal, addMoney, subMoney, eqMoney, sumMoney, round2Money } from '@/lib/safe-money'

const results: Array<{ test: string; passed: boolean; detail: string }> = []

function log(test: string, passed: boolean, detail: string = '') {
  const icon = passed ? '✓' : '✗'
  console.log(`  ${icon} ${test}${detail ? ': ' + detail : ''}`)
  results.push({ test, passed, detail })
}

async function getAccountByRole(role: string) {
  return db.account.findFirst({ where: { accountRole: role, isActive: true, allowPosting: true } })
}

async function test1_JournalEntryCreation() {
  console.log('\n── 1) دورة: قيد يدوي → ترحيل → JournalLine ──')
  const cash = await getAccountByRole('CASH')
  const revenue = await getAccountByRole('RENTAL_REVENUE') || await getAccountByRole('CONSTRUCTION_REVENUE')
  if (!cash || !revenue) {
    log('توفُّر حسابات النقد والإيراد', false, `CASH=${!!cash}, REVENUE=${!!revenue}`)
    return null
  }
  log('توفُّر حسابات النقد والإيراد', true, `CASH=${cash.code}, REV=${revenue.code}`)

  const entryNo = await db.$transaction(async (tx) => getNextEntryNo(tx))
  log('توليد رقم قيد تسلسلي', /^JE-\d{6}$/.test(entryNo), `entryNo=${entryNo}`)

  const je = await db.$transaction(async (tx) => {
    return postJournalEntry({
      entryNo,
      date: new Date(),
      description: 'E2E Test: manual revenue entry',
      descriptionAr: 'اختبار: قيد إيراد يدوي',
      lines: [
        { accountId: cash.id, debit: 1000, credit: 0 },
        { accountId: revenue.id, debit: 0, credit: 1000 },
      ],
      sourceType: 'MANUAL',
      sourceId: `E2E-TEST-${Date.now()}`,
    }, tx)
  })

  log('إنشاء قيد يدوي', !!je, `entryNo=${je?.entryNo}`)
  log('القيد مرحَّل (POSTED)', je?.status === 'POSTED', `status=${je?.status}`)
  log('القيد له بنود (JournalLines)', (je?.lines?.length || 0) >= 2, `${je?.lines?.length} بند`)
  return je
}

async function test2_Reversal(je: any) {
  console.log('\n── 2) دورة: عكس القيد → منع العكس المزدوج ──')
  if (!je) { log('تخطي (لا يوجد قيد)', false); return }

  const reversal = await db.$transaction(async (tx) => {
    return reverseJournalEntry(je.id, tx, 'E2E test reversal')
  })
  log('عكس القيد (أول مرة)', !!reversal, `entryNo=${reversal?.entryNo}`)
  log('القيد العكسي معلَّم (isReversal)', reversal?.isReversal === true)
  log('القيد العكسي مرتبط بالأصلي', reversal?.reversedEntryId === je.id)

  // Try double reversal — should fail
  try {
    await db.$transaction(async (tx) => reverseJournalEntry(je.id, tx, 'double reversal'))
    log('منع العكس المزدوج', false, 'لم يتم منع العكس المزدوج!')
  } catch (e: any) {
    log('منع العكس المزدوج', e.code === 'ALREADY_REVERSED', `code=${e.code}`)
  }
}

async function test3_TrialBalance() {
  console.log('\n── 3) التحقق: ميزان المراجعة ──')
  const tb = await getTrialBalance()
  const rows = tb.rows || []
  const totalDebit = toDecimal(tb.totals?.totalDebit ?? tb.totalDebit ?? 0)
  const totalCredit = toDecimal(tb.totals?.totalCredit ?? tb.totalCredit ?? 0)
  const balanced = eqMoney(totalDebit, totalCredit)
  log('ميزان المراجعة متوازن', balanced, `مدين=${totalDebit.toFixed(2)} / دائن=${totalCredit.toFixed(2)} / ${rows.length} حساب`)
}

async function test4_BalanceSheet() {
  console.log('\n── 4) التحقق: الميزانية العمومية (الأصول = الخصوم + حقوق الملكية) ──')
  const bs = await getBalanceSheet()
  const assets = toDecimal(bs.totalAssets)
  const liab = toDecimal(bs.totalLiabilities)
  const equity = toDecimal(bs.totalEquity)
  const diff = assets.sub(liab.add(equity)).abs()
  log('المعادلة المحاسبية', diff.lt(0.02), `أصول=${assets.toFixed(2)} / خصوم=${liab.toFixed(2)} / حقوق=${equity.toFixed(2)} / فرق=${diff.toFixed(4)}`)
}

async function test5_IncomeStatement() {
  console.log('\n── 5) التحقق: قائمة الدخل ──')
  const is = await getIncomeStatement()
  const revenue = toDecimal(is.revenue?.total ?? is.totalRevenue ?? 0)
  const expenses = toDecimal(is.expenses?.total ?? is.totalExpenses ?? 0)
  const netIncome = toDecimal(is.netIncome ?? is.netProfit ?? 0)
  const computed = revenue.sub(expenses)
  const diff = netIncome.sub(computed).abs()
  log('صافي الدخل = إيرادات - مصروفات', diff.lt(0.02), `إيراد=${revenue.toFixed(2)} / مصروف=${expenses.toFixed(2)} / صافي=${netIncome.toFixed(2)}`)
}

async function test6_AccountingHealthCheck() {
  console.log('\n── 6) التحقق: فحص صحة المحاسبة (5 فحوصات) ──')
  const hc = await accountingHealthCheck()
  log('فحص الصحة الشامل', hc.healthy, `healthy=${hc.healthy}`)
  for (const check of hc.checks) {
    log(`  ${check.name}`, check.passed, check.detail?.slice(0, 100))
  }
}

async function test7_NumericalConsistency() {
  console.log('\n── 7) التحقق: الاتساق العددي (I1-I7) ──')
  const nc = await verifyNumericalConsistency()
  log('الاتساق العددي', nc.ok === true, `ok=${nc.ok}, accounts=${nc.accountsChecked || 0}, diffs=${nc.diffs || 0}`)
}

async function test8_IdempotencyIndexes() {
  console.log('\n── 8) التحقق: فهارس Idempotency ──')
  // Check that the partial unique indexes exist
  const indexes = await db.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master 
    WHERE type='index' AND name LIKE 'JournalEntry_%unique%'
  `
  const indexNames = indexes.map(i => i.name)
  log('فهرس منع الترحيل المزدوج', indexNames.includes('JournalEntry_source_isReversal_unique'), indexNames.includes('JournalEntry_source_isReversal_unique') ? 'موجود' : 'مفقود')
  log('فهرس منع العكس المزدوج', indexNames.includes('JournalEntry_reversedEntryId_unique'), indexNames.includes('JournalEntry_reversedEntryId_unique') ? 'موجود' : 'مفقود')
}

async function test9_SequenceTable() {
  console.log('\n── 9) التحقق: جدول التسلسل (Sequence) ──')
  const seq = await db.sequence.findUnique({ where: { id: 'default' } })
  log('جدول Sequence موجود', !!seq, `lastEntryNo=${seq?.lastEntryNo}`)

  // Verify getNextEntryNo requires tx
  try {
    await getNextEntryNo(undefined as any)
    log('getNextEntryNo يرفض العمل بدون tx', false, 'لم يرفض!')
  } catch (e: any) {
    log('getNextEntryNo يرفض العمل بدون tx', e.code === 'GET_NEXT_ENTRY_NO_NO_TX', `code=${e.code}`)
  }

  // Verify getNextEntryNo works with tx and increments
  const before = seq?.lastEntryNo || 0
  const nextNo = await db.$transaction(async (tx) => getNextEntryNo(tx))
  const after = await db.sequence.findUnique({ where: { id: 'default' } })
  log('getNextEntryNo يولد رقماً تسلسلياً', /^JE-\d{6}$/.test(nextNo), `nextNo=${nextNo}`)
  log('Sequence تزداد بشكل صحيح', (after?.lastEntryNo || 0) > before, `before=${before} → after=${after?.lastEntryNo}`)
}

async function test10_AllJEsBalanced() {
  console.log('\n── 10) التحقق: كل القيود المرحَّلة متوازنة ──')
  const unbalanced = await db.$queryRaw<Array<{ entryNo: string; d: number; c: number }>>`
    SELECT je."entryNo", COALESCE(SUM(jl.debit), 0) as d, COALESCE(SUM(jl.credit), 0) as c
    FROM "JournalEntry" je
    JOIN "JournalLine" jl ON jl."journalEntryId" = je.id AND jl."deletedAt" IS NULL
    WHERE je.status = 'POSTED' AND je."deletedAt" IS NULL
    GROUP BY je.id, je."entryNo"
    HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.01
  `
  log('كل القيود المرحَّلة متوازنة', unbalanced.length === 0, unbalanced.length === 0 ? 'سليم' : `${unbalanced.length} قيد غير متوازن`)
}

async function test11_NoOrphanLines() {
  console.log('\n── 11) التحقق: لا بنود يتيمة ──')
  // Check that every JournalLine has a valid JournalEntry
  const orphanLines = await db.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*) as count FROM "JournalLine" jl
    LEFT JOIN "JournalEntry" je ON jl."journalEntryId" = je.id
    WHERE je.id IS NULL AND jl."deletedAt" IS NULL
  `
  log('لا بنود يتيمة (بدون قيد)', (orphanLines[0]?.count || 0) === 0, `orphan count=${orphanLines[0]?.count || 0}`)
}

async function test12_SSOT_ReportsUseJournalLine() {
  console.log('\n── 12) التحقق: التقارير تعتمد على JournalLine (SSOT) ──')
  // The trial balance, balance sheet, and income statement should all derive
  // from the same posted JournalLine data. Cross-check:
  const tb = await getTrialBalance()
  const bs = await getBalanceSheet()
  const is = await getIncomeStatement()

  // TB totalDebit should equal sum of all posted line debits
  const totalPostedDebit = await db.journalLine.aggregate({
    _sum: { debit: true },
    where: { deletedAt: null, journalEntry: { status: 'POSTED', deletedAt: null } },
  })
  const tbTotalDebit = toDecimal(tb.totals?.totalDebit ?? tb.totalDebit ?? 0)
  const glTotalDebit = toDecimal(totalPostedDebit._sum.debit)
  log('TB totalDebit = GL sum(debit)', eqMoney(tbTotalDebit, glTotalDebit), `TB=${tbTotalDebit.toFixed(2)} / GL=${glTotalDebit.toFixed(2)}`)

  // Income statement netIncome should tie to balance sheet currentYearEarnings
  const isNetIncome = toDecimal(is.netIncome)
  const bsCurrentYear = toDecimal(bs.currentYearEarnings || 0)
  log('IS netIncome = BS currentYearEarnings', eqMoney(isNetIncome, bsCurrentYear), `IS=${isNetIncome.toFixed(2)} / BS=${bsCurrentYear.toFixed(2)}`)
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  P1 E2E: اختبار سلامة المحاسبة من البداية للنهاية')
  console.log('  يختبر محرك المحاسبة الفعلي + التقارير + سلامة البيانات')
  console.log('═══════════════════════════════════════════════════════════════')

  const je = await test1_JournalEntryCreation()
  await test2_Reversal(je)
  await test3_TrialBalance()
  await test4_BalanceSheet()
  await test5_IncomeStatement()
  await test6_AccountingHealthCheck()
  await test7_NumericalConsistency()
  await test8_IdempotencyIndexes()
  await test9_SequenceTable()
  await test10_AllJEsBalanced()
  await test11_NoOrphanLines()
  await test12_SSOT_ReportsUseJournalLine()

  console.log('\n═══════════════════════════════════════════════════════════════')
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`  النتائج: ${passed} نجح، ${failed} فشل`)
  if (failed === 0) {
    console.log('  ✅ جميع اختبارات سلامة المحاسبة اجتازت بنجاح')
  } else {
    console.log('  ⚠️  توجد اختبارات فاشلة — راجع التفاصيل أعلاه')
  }
  console.log('═══════════════════════════════════════════════════════════════')

  await db.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

// ============================================================================
// تدقيق محاسبي شامل لقاعدة البيانات - Accounting Audit Script
// يفحص: توازن كل قيد، اتجاهات المدين/الدائن، الميزان، الميزانية، التسريبات
// ============================================================================
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

function n(x: any): number {
  if (x === null || x === undefined) return 0
  const v = typeof x === 'string' ? parseFloat(x) : Number(x)
  return isNaN(v) ? 0 : v
}

async function main() {
  console.log('\n========================================================')
  console.log('1) فحص توازن كل قيد يومية مرحّل (debit sum == credit sum)')
  console.log('========================================================')
  const entries = await db.journalEntry.findMany({
    where: { status: 'POSTED', deletedAt: null },
    include: { lines: { where: { deletedAt: null } } },
    orderBy: { entryNo: 'asc' },
  })
  console.log(`عدد القيود المرحّلة: ${entries.length}`)
  let unbalancedCount = 0
  for (const e of entries) {
    const dr = e.lines.reduce((s, l) => s + n(l.debit), 0)
    const cr = e.lines.reduce((s, l) => s + n(l.credit), 0)
    const diff = Math.abs(dr - cr)
    if (diff > 0.01) {
      unbalancedCount++
      console.log(`  ❌ ${e.entryNo} | ${e.description || ''} | مدين=${dr.toFixed(2)} دائن=${cr.toFixed(2)} فرق=${diff.toFixed(2)}`)
    }
  }
  console.log(`قيود غير متوازنة: ${unbalancedCount}`)

  console.log('\n========================================================')
  console.log('2) فحص بنود القيود — أي بند له مدين ودائن معاً (ممنوع)')
  console.log('========================================================')
  const badLines = await db.journalLine.findMany({
    where: { deletedAt: null, journalEntry: { status: 'POSTED', deletedAt: null } },
  })
  let bothSides = 0
  for (const l of badLines) {
    if (n(l.debit) > 0.01 && n(l.credit) > 0.01) {
      bothSides++
      console.log(`  ❌ Line ${l.id}: debit=${l.debit} credit=${l.credit} (كلاهما > 0)`)
    }
  }
  console.log(`بنود لها مدين ودائن معاً: ${bothSides}`)

  console.log('\n========================================================')
  console.log('3) ميزان المراجعة لكل حساب (from JournalLine)')
  console.log('========================================================')
  const accounts = await db.account.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  })
  const grouped = await db.journalLine.groupBy({
    by: ['accountId'],
    _sum: { debit: true, credit: true },
    where: { deletedAt: null, journalEntry: { status: 'POSTED', deletedAt: null } },
  })
  const map = new Map<string, { d: number; c: number }>()
  for (const g of grouped) {
    map.set(g.accountId, { d: n(g._sum.debit), c: n(g._sum.credit) })
  }
  let totalD = 0, totalC = 0
  console.log('CODE    | TYPE     | ROLE                | DEBIT          | CREDIT         | NET')
  console.log('--------|----------|---------------------|----------------|----------------|----------------')
  for (const a of accounts) {
    const s = map.get(a.id) || { d: 0, c: 0 }
    if (s.d === 0 && s.c === 0) continue
    const net = s.d - s.c
    totalD += s.d
    totalC += s.c
    console.log(`${a.code.padEnd(7)} | ${a.type.padEnd(8)} | ${(a.accountRole||'-').padEnd(19)} | ${s.d.toFixed(2).padStart(14)} | ${s.c.toFixed(2).padStart(14)} | ${net.toFixed(2).padStart(14)}`)
  }
  console.log('--------|----------|---------------------|----------------|----------------|----------------')
  console.log(`TOTAL                                                        | ${totalD.toFixed(2).padStart(14)} | ${totalC.toFixed(2).padStart(14)}`)
  console.log(`الفرق: ${Math.abs(totalD - totalC).toFixed(2)} ${Math.abs(totalD - totalC) < 0.01 ? '✓ متوازن' : '❌ غير متوازن'}`)

  console.log('\n========================================================')
  console.log('4) التحقق من المعادلة المحاسبية (الأصول = الخصوم + حقوق الملكية)')
  console.log('========================================================')
  let assets = 0, liab = 0, equity = 0, revenue = 0, expenses = 0
  for (const a of accounts) {
    const s = map.get(a.id) || { d: 0, c: 0 }
    const net = s.d - s.c
    const sign = a.type === 'ASSET' || a.type === 'EXPENSE' ? 1 : -1
    const signed = sign * net
    if (a.type === 'ASSET') assets += signed
    else if (a.type === 'LIABILITY') liab += signed
    else if (a.type === 'EQUITY') equity += signed
    else if (a.type === 'REVENUE') revenue += signed
    else if (a.type === 'EXPENSE') expenses += signed
  }
  const currentEarnings = revenue - expenses
  const totalEquity = equity + currentEarnings
  console.log(`الأصول:                  ${assets.toFixed(2)}`)
  console.log(`الخصوم:                  ${liab.toFixed(2)}`)
  console.log(`حقوق الملكية (رصيد):    ${equity.toFixed(2)}`)
  console.log(`+ أرباح السنة الحالية:   ${currentEarnings.toFixed(2)} (إيرادات ${revenue.toFixed(2)} - مصروفات ${expenses.toFixed(2)})`)
  console.log(`= إجمالي حقوق الملكية:   ${totalEquity.toFixed(2)}`)
  console.log(`الخصوم + حقوق الملكية:   ${(liab + totalEquity).toFixed(2)}`)
  console.log(`الفرق: ${(assets - (liab + totalEquity)).toFixed(2)} ${Math.abs(assets - (liab + totalEquity)) < 0.01 ? '✓ متوازنة' : '❌ غير متوازنة'}`)

  console.log('\n========================================================')
  console.log('5) فحص الحسابات ذات الأرصدة السالبة غير الطبيعية')
  console.log('========================================================')
  for (const a of accounts) {
    const s = map.get(a.id) || { d: 0, c: 0 }
    const net = s.d - s.c
    const sign = a.type === 'ASSET' || a.type === 'EXPENSE' ? 1 : -1
    const signed = sign * net
    if (Math.abs(signed) > 0.01 && signed < 0) {
      console.log(`  ⚠ ${a.code} ${a.nameAr || a.name} (${a.type}) رصيد سالك غير طبيعي: ${signed.toFixed(2)}`)
    }
  }

  console.log('\n========================================================')
  console.log('6) قيود بمصدر غير مرتبط (no sourceType/sourceId)')
  console.log('========================================================')
  const orphanEntries = entries.filter(e => !e.sourceType || !e.sourceId)
  console.log(`قيود بدون مصدر: ${orphanEntries.length}`)
  for (const e of orphanEntries) {
    console.log(`  ${e.entryNo} | ${e.description || ''}`)
  }

  console.log('\n========================================================')
  console.log('7) عدد القيود لكل نوع مصدر')
  console.log('========================================================')
  const bySource = new Map<string, number>()
  for (const e of entries) {
    const k = e.sourceType || 'MANUAL'
    bySource.set(k, (bySource.get(k) || 0) + 1)
  }
  for (const [k, v] of bySource) {
    console.log(`  ${k}: ${v}`)
  }

  console.log('\n========================================================')
  console.log('8) هل هنالك قيود DRAFT معطّلة؟')
  console.log('========================================================')
  const drafts = await db.journalEntry.count({ where: { status: 'DRAFT', deletedAt: null } })
  const cancelled = await db.journalEntry.count({ where: { status: 'CANCELLED', deletedAt: null } })
  console.log(`DRAFT: ${drafts} | CANCELLED: ${cancelled}`)

  console.log('\n========================================================')
  console.log('انتهى التدقيق')
  console.log('========================================================\n')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())

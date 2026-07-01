import { db } from '@/lib/db'
import { getIncomeStatement } from '@/lib/accounting/queries'
async function main() {
  const is = await getIncomeStatement()
  console.log('IS top-level keys:', Object.keys(is))
  console.log('revenue keys:', Object.keys(is.revenue || {}))
  console.log('expenses keys:', Object.keys(is.expenses || {}))
  // Check if there's a totalRevenue somewhere
  const any = is as any
  console.log('totalRevenue?', any.totalRevenue)
  console.log('revenue.total?', any.revenue?.total)
  console.log('netIncome:', any.netIncome)
  console.log('grossProfit:', any.grossProfit)
  // Sum revenue accounts
  const revTotal = (any.revenue?.accounts || []).reduce((s: number, a: any) => s + (typeof a.balance === 'number' ? a.balance : Number(a.balance || 0)), 0)
  const expTotal = (any.expenses?.accounts || []).reduce((s: number, a: any) => s + (typeof a.balance === 'number' ? a.balance : Number(a.balance || 0)), 0)
  console.log(`computed revenue total: ${revTotal}`)
  console.log(`computed expenses total: ${expTotal}`)
  console.log(`netIncome = rev - exp = ${revTotal - expTotal}`)
  await db.$disconnect()
}
main().catch(console.error)

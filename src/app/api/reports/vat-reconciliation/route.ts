import { NextResponse } from 'next/server'
import { getVATReconciliation } from '@/lib/report-engine'

// GET /api/reports/vat-reconciliation?dateFrom=...&dateTo=...
// مطابقة ضريبة القيمة المضافة — المصدر: القيود اليومية المرحّلة فقط
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const range = (dateFrom || dateTo) ? {
      from: dateFrom ? new Date(dateFrom) : undefined,
      to: dateTo ? new Date(dateTo) : undefined,
    } : undefined

    const data = await getVATReconciliation(range)
    return NextResponse.json({ ...data, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('[API] VAT reconciliation error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء مطابقة الضريبة' }, { status: 500 })
  }
}

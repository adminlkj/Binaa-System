import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const contractId = searchParams.get('contractId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const month = searchParams.get('month')
    const year = searchParams.get('year')

    const where: Record<string, unknown> = {}
    if (contractId) where.contractId = contractId
    if (projectId) where.projectId = projectId
    if (status) where.status = status
    if (month) where.month = parseInt(month)
    if (year) where.year = parseInt(year)

    const timesheets = await db.timesheet.findMany({
      where,
      include: {
        contract: { select: { id: true, contractNo: true, value: true, vatRate: true, project: { select: { id: true, name: true, nameAr: true, code: true } } } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        entries: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })

    return NextResponse.json(timesheets)
  } catch (error) {
    console.error('Error fetching timesheets:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجلات ساعات العمل' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { contractId, projectId, month, year, notes, entries } = body

    if (!contractId || !projectId || !month || !year || !entries?.length) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة: العقد، المشروع، الشهر، السنة، والبنود مطلوبة' }, { status: 400 })
    }

    // Validate contract exists
    const contract = await db.contract.findUnique({
      where: { id: contractId },
      include: { project: { select: { id: true } } },
    })

    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    // Auto-calculate totalAmount for each entry
    const processedEntries = entries.map((entry: { description: string; hours: number; rate: number }) => ({
      description: entry.description,
      hours: parseFloat(String(entry.hours)) || 0,
      rate: parseFloat(String(entry.rate)) || 0,
      totalAmount: (parseFloat(String(entry.hours)) || 0) * (parseFloat(String(entry.rate)) || 0),
    }))

    const timesheet = await db.timesheet.create({
      data: {
        contractId,
        projectId,
        month: parseInt(String(month)),
        year: parseInt(String(year)),
        status: 'DRAFT',
        notes: notes || null,
        entries: {
          create: processedEntries,
        },
      },
      include: {
        contract: { select: { id: true, contractNo: true, value: true, vatRate: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        entries: true,
      },
    })

    return NextResponse.json(timesheet, { status: 201 })
  } catch (error) {
    console.error('Error creating timesheet:', error)
    return NextResponse.json({ error: 'فشل في إنشاء سجل ساعات العمل' }, { status: 500 })
  }
}

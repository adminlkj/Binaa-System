import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET: List all timesheets with contract info (includes equipment, client, project)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const contractId = searchParams.get('contractId')
    const year = searchParams.get('year')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (contractId) where.contractId = contractId
    if (year) where.year = parseInt(year)

    const timesheets = await db.equipmentTimesheet.findMany({
      where,
      include: {
        contract: {
          include: {
            equipment: {
              select: { id: true, code: true, name: true, nameAr: true },
            },
          },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })

    // Enrich with client and project names
    const enrichedTimesheets = await Promise.all(
      timesheets.map(async (ts) => {
        let clientName = ''
        let clientNameAr = ''
        let projectName = ''
        let projectNameAr = ''

        if (ts.contract.clientId) {
          const client = await db.client.findUnique({
            where: { id: ts.contract.clientId },
            select: { name: true, nameAr: true },
          })
          clientName = client?.name || ''
          clientNameAr = client?.nameAr || ''
        }

        if (ts.contract.projectId) {
          const project = await db.project.findUnique({
            where: { id: ts.contract.projectId },
            select: { name: true, nameAr: true },
          })
          projectName = project?.name || ''
          projectNameAr = project?.nameAr || ''
        }

        return {
          ...ts,
          contract: {
            ...ts.contract,
            clientName,
            clientNameAr,
            projectName,
            projectNameAr,
          },
        }
      })
    )

    return NextResponse.json(enrichedTimesheets)
  } catch (error) {
    console.error('Error fetching timesheets:', error)
    return NextResponse.json({ error: 'فشل في تحميل التايم شيت' }, { status: 500 })
  }
}

// POST: Create new timesheet with auto-calculation
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { contractId, month, year, workedHours, remarks } = body

    if (!contractId || !month || !year || workedHours === undefined) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Get contract hourly rate
    const contract = await db.equipmentRentalContract.findUnique({
      where: { id: contractId },
      select: { hourlyRate: true, status: true },
    })

    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    if (contract.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'يجب أن يكون العقد نشطاً لإنشاء تايم شيت' }, { status: 400 })
    }

    // Check for duplicate month/year
    const existing = await db.equipmentTimesheet.findFirst({
      where: { contractId, month: parseInt(month), year: parseInt(year) },
    })
    if (existing) {
      return NextResponse.json({ error: 'يوجد تايم شيت لهذا الشهر بالفعل' }, { status: 400 })
    }

    const hourlyRate = contract.hourlyRate
    const wh = parseFloat(workedHours) || 0
    const subtotal = wh * hourlyRate
    const vatRate = 0.15
    const vatAmount = subtotal * vatRate
    const totalAmount = subtotal + vatAmount

    const timesheet = await db.equipmentTimesheet.create({
      data: {
        contractId,
        month: parseInt(month),
        year: parseInt(year),
        workedHours: wh,
        hourlyRate,
        subtotal,
        vatRate,
        vatAmount,
        totalAmount,
        status: 'DRAFT',
        remarks: remarks || null,
      },
      include: {
        contract: {
          include: {
            equipment: {
              select: { id: true, code: true, name: true, nameAr: true },
            },
          },
        },
      },
    })

    return NextResponse.json(timesheet, { status: 201 })
  } catch (error) {
    console.error('Error creating timesheet:', error)
    return NextResponse.json({ error: 'فشل في إنشاء التايم شيت' }, { status: 500 })
  }
}

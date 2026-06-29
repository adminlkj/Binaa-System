import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Legacy timesheets route - delegates to /api/equipment/timesheets
// This route previously referenced 'entries' and 'TimesheetEntry' which don't exist in the schema

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const contractId = searchParams.get('contractId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const year = searchParams.get('year')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)

    const where: Record<string, unknown> = {}
    if (contractId) where.contractId = contractId
    if (projectId) where.projectId = projectId
    if (status) where.status = status
    if (year) where.year = parseInt(year)

    const include = {
      contract: {
        select: {
          id: true, contractNo: true, hourlyRate: true, deliveryFees: true,
          deliveryFeesTaxable: true, paymentTerms: true,
          project: { select: { id: true, name: true, nameAr: true, code: true } },
        },
      },
      project: { select: { id: true, name: true, nameAr: true, code: true } },
      equipment: { select: { id: true, code: true, name: true, nameAr: true } },
      rental: {
        select: { id: true, hourlyRate: true, pricingType: true, status: true, clientId: true },
      },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const timesheets = await db.timesheet.findMany({
        where: whereClause,
        include,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      })
      return NextResponse.json(timesheets)
    }

    const [data, total] = await Promise.all([
      db.timesheet.findMany({
        where: whereClause,
        include,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.timesheet.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('[API] Failed to fetch timesheets:', error)
    return NextResponse.json({ error: 'Failed to fetch timesheets' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { rentalId, contractId, month, year, operatingHours, notes } = body

    if (!rentalId || !contractId || !month || !year || operatingHours === undefined) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Get rental details
    const rental = await db.equipmentRental.findUnique({
      where: { id: rentalId },
      select: {
        hourlyRate: true,
        pricingType: true,
        status: true,
        equipmentId: true,
        projectId: true,
        clientId: true,
      },
    })

    if (!rental) {
      return NextResponse.json({ error: 'عقد الإيجار غير موجود' }, { status: 404 })
    }

    // Get contract for project info
    const contract = await db.contract.findUnique({
      where: { id: contractId },
      select: { projectId: true, status: true },
    })

    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    const oh = parseFloat(operatingHours) || 0

    const timesheet = await db.timesheet.create({
      data: {
        rentalId,
        contractId,
        projectId: rental.projectId || contract.projectId,
        equipmentId: rental.equipmentId,
        month: parseInt(month),
        year: parseInt(year),
        operatingHours: oh,
        status: 'DRAFT',
        notes: notes || null,
      },
      include: {
        contract: {
          select: { id: true, contractNo: true, hourlyRate: true, deliveryFees: true, deliveryFeesTaxable: true, paymentTerms: true },
        },
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: { id: true, hourlyRate: true, pricingType: true },
        },
        project: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
      },
    })

    return NextResponse.json(timesheet, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create timesheet:', error)
    return NextResponse.json({ error: 'Failed to create timesheet' }, { status: 500 })
  }
}

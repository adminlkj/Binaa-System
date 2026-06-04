import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET: List all timesheets with contract info (includes equipment, client, project)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const contractId = searchParams.get('contractId')
    const year = searchParams.get('year')
    const rentalId = searchParams.get('rentalId')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (contractId) where.contractId = contractId
    if (year) where.year = parseInt(year)
    if (rentalId) where.rentalId = rentalId

    const timesheets = await db.timesheet.findMany({
      where,
      include: {
        contract: {
          include: {
            equipment: {
              select: { id: true, code: true, name: true, nameAr: true },
            },
          },
        },
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: { id: true, rate: true, rateType: true, status: true },
        },
        project: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        invoice: {
          select: { id: true, invoiceNo: true, status: true },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })

    // Enrich with client names from the rental
    const enrichedTimesheets = await Promise.all(
      timesheets.map(async (ts) => {
        let clientName = ''
        let clientNameAr = ''

        if (ts.rental) {
          const client = await db.client.findUnique({
            where: { id: ts.rental.clientId || '' },
            select: { name: true, nameAr: true },
          })
          // Get clientId from rental directly
          const rentalWithClient = await db.equipmentRental.findUnique({
            where: { id: ts.rentalId },
            select: { clientId: true },
          })
          if (rentalWithClient) {
            const cl = await db.client.findUnique({
              where: { id: rentalWithClient.clientId },
              select: { name: true, nameAr: true },
            })
            clientName = cl?.name || ''
            clientNameAr = cl?.nameAr || ''
          }
        }

        return {
          ...ts,
          clientName,
          clientNameAr,
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
    const { rentalId, contractId, month, year, operatingHours, notes } = body

    if (!rentalId || !contractId || !month || !year || operatingHours === undefined) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Get rental details
    const rental = await db.equipmentRental.findUnique({
      where: { id: rentalId },
      select: { 
        rate: true, 
        rateType: true, 
        status: true, 
        equipmentId: true,
        projectId: true,
        clientId: true,
      },
    })

    if (!rental) {
      return NextResponse.json({ error: 'عقد الإيجار غير موجود' }, { status: 404 })
    }

    if (rental.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'يجب أن يكون عقد الإيجار نشطاً لإنشاء تايم شيت' }, { status: 400 })
    }

    // Get contract for project info
    const contract = await db.contract.findUnique({
      where: { id: contractId },
      select: { projectId: true, status: true },
    })

    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    // Check for duplicate month/year
    const existing = await db.timesheet.findFirst({
      where: { contractId, month: parseInt(month), year: parseInt(year) },
    })
    if (existing) {
      return NextResponse.json({ error: 'يوجد تايم شيت لهذا الشهر بالفعل' }, { status: 400 })
    }

    const oh = parseFloat(operatingHours) || 0
    const hourlyRate = rental.rate

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
          include: {
            equipment: {
              select: { id: true, code: true, name: true, nameAr: true },
            },
          },
        },
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: { id: true, rate: true, rateType: true },
        },
        project: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
      },
    })

    return NextResponse.json(timesheet, { status: 201 })
  } catch (error) {
    console.error('Error creating timesheet:', error)
    return NextResponse.json({ error: 'فشل في إنشاء التايم شيت' }, { status: 500 })
  }
}

// PUT: Update timesheet (prevent modifications when INVOICED)
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: 'معرف التايم شيت مطلوب' }, { status: 400 })
    }

    const existing = await db.timesheet.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'التايم شيت غير موجود' }, { status: 404 })
    }

    // PREVENT MODIFICATIONS WHEN INVOICED
    if (existing.status === 'INVOICED') {
      return NextResponse.json(
        { error: 'لا يمكن تعديل تايم شيت تم إصدار فاتورة له. يجب إلغاء الفاتورة أولاً' },
        { status: 403 }
      )
    }

    // If status is changing to INVOICED, validate the transition
    if (updateData.status === 'INVOICED' && existing.status !== 'INVOICED') {
      // Can only change to INVOICED from APPROVED
      if (existing.status !== 'APPROVED') {
        return NextResponse.json(
          { error: 'لا يمكن تغيير حالة التايم شيت إلى "مفوتر" إلا من حالة "معتمد"' },
          { status: 400 }
        )
      }
    }

    // Handle operatingHours update
    if (updateData.operatingHours !== undefined) {
      updateData.operatingHours = parseFloat(updateData.operatingHours) || 0
    }

    // Handle approvedDate
    if (updateData.approvedDate) {
      updateData.approvedDate = new Date(updateData.approvedDate)
    }

    const updated = await db.timesheet.update({
      where: { id },
      data: updateData,
      include: {
        contract: {
          include: {
            equipment: {
              select: { id: true, code: true, name: true, nameAr: true },
            },
          },
        },
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: { id: true, rate: true, rateType: true },
        },
        project: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        invoice: {
          select: { id: true, invoiceNo: true, status: true },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating timesheet:', error)
    return NextResponse.json({ error: 'فشل في تحديث التايم شيت' }, { status: 500 })
  }
}

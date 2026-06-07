import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const resourceType = searchParams.get('resourceType')

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId
    if (resourceType) where.resourceType = resourceType

    const allocations = await db.resourceAllocation.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        project: { select: { id: true, code: true, name: true, nameAr: true, projectType: true } },
      },
      orderBy: { startDate: 'desc' },
    })

    // Enrich with resource details based on resourceType
    const enriched = await Promise.all(
      allocations.map(async (allocation) => {
        let resource: Record<string, unknown> | null = null

        switch (allocation.resourceType) {
          case 'EMPLOYEE': {
            resource = await db.employee.findUnique({
              where: { id: allocation.resourceId },
              select: { id: true, code: true, name: true, nameAr: true, profession: true, status: true },
            })
            break
          }
          case 'TEAM': {
            resource = await db.workTeam.findUnique({
              where: { id: allocation.resourceId },
              select: {
                id: true,
                code: true,
                name: true,
                nameAr: true,
                specialty: true,
                isActive: true,
                members: {
                  include: {
                    employee: { select: { id: true, code: true, name: true } },
                  },
                },
              },
            })
            break
          }
          case 'EQUIPMENT': {
            resource = await db.equipment.findUnique({
              where: { id: allocation.resourceId },
              select: { id: true, code: true, name: true, nameAr: true, type: true, status: true, hourlyRate: true },
            })
            break
          }
        }

        return {
          ...allocation,
          resource,
        }
      })
    )

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Error fetching resource distribution:', error)
    return NextResponse.json({ error: 'فشل في تحميل توزيع الموارد' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate resourceType
    const validTypes = ['EMPLOYEE', 'TEAM', 'EQUIPMENT']
    if (!validTypes.includes(body.resourceType)) {
      return NextResponse.json(
        { error: 'نوع المورد غير صالح. يجب أن يكون: EMPLOYEE, TEAM, أو EQUIPMENT' },
        { status: 400 }
      )
    }

    // Validate resource exists
    let resourceExists = false
    switch (body.resourceType) {
      case 'EMPLOYEE':
        resourceExists = !!(await db.employee.findUnique({ where: { id: body.resourceId } }))
        break
      case 'TEAM':
        resourceExists = !!(await db.workTeam.findUnique({ where: { id: body.resourceId } }))
        break
      case 'EQUIPMENT':
        resourceExists = !!(await db.equipment.findUnique({ where: { id: body.resourceId } }))
        break
    }

    if (!resourceExists) {
      return NextResponse.json({ error: 'المورد المحدد غير موجود' }, { status: 400 })
    }

    const allocation = await db.resourceAllocation.create({
      data: {
        projectId: body.projectId,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        notes: body.notes || null,
      },
      include: {
        project: { select: { id: true, code: true, name: true, nameAr: true, projectType: true } },
      },
    })

    return NextResponse.json(allocation, { status: 201 })
  } catch (error) {
    console.error('Error creating resource allocation:', error)
    return NextResponse.json({ error: 'فشل في إنشاء توزيع المورد' }, { status: 500 })
  }
}

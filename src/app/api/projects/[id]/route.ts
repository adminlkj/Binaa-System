import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const project = await db.project.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
        contracts: {
          include: {
            progressClaims: { orderBy: { date: 'desc' } },
          },
          orderBy: { date: 'desc' },
        },
        boqItems: { orderBy: { code: 'asc' } },
        progressClaims: {
          include: { contract: { select: { contractNo: true } } },
          orderBy: { date: 'desc' },
        },
        purchaseOrders: { select: { id: true, totalAmount: true } },
        expenses: { select: { id: true, amount: true } },
        laborCosts: { select: { id: true, totalAmount: true } },
        equipmentCosts: { select: { id: true, amount: true } },
        equipmentUsages: { select: { id: true, cost: true } },
        subcontractorInvoices: { select: { id: true, totalAmount: true } },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    // Compute cost sheet for "كرت المشروع"
    const contractValue = project.contractValue || 0
    const progressClaimsTotal = project.progressClaims.reduce((sum, c) => sum + c.amount, 0)
    const purchases = project.purchaseOrders.reduce((sum, p) => sum + p.totalAmount, 0)
    const subcontractors = project.subcontractorInvoices.reduce((sum, s) => sum + s.totalAmount, 0)
    const labor = project.laborCosts.reduce((sum, l) => sum + l.totalAmount, 0)
    const equipment = project.equipmentCosts.reduce((sum, e) => sum + e.amount, 0) +
      project.equipmentUsages.reduce((sum, e) => sum + e.cost, 0)
    const projectExpenses = project.expenses.reduce((sum, e) => sum + e.amount, 0)
    const totalCosts = purchases + subcontractors + labor + equipment + projectExpenses
    const profit = progressClaimsTotal - totalCosts
    const profitMargin = progressClaimsTotal > 0 ? ((profit / progressClaimsTotal) * 100) : 0

    const costSheet = {
      contractValue,
      revenue: progressClaimsTotal,
      purchases,
      subcontractors,
      labor,
      equipment,
      expenses: projectExpenses,
      totalCosts,
      profit,
      profitMargin,
    }

    return NextResponse.json({ ...project, costSheet })
  } catch (error) {
    console.error('Error fetching project:', error)
    return NextResponse.json({ error: 'فشل في تحميل المشروع' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { code, name, nameAr, clientId, branchId, location, startDate, endDate, status, description, contractValue, projectType } = body

    const existing = await db.project.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    if (code && code !== existing.code) {
      const duplicate = await db.project.findUnique({ where: { code } })
      if (duplicate) {
        return NextResponse.json({ error: 'كود المشروع موجود بالفعل' }, { status: 400 })
      }
    }

    const project = await db.project.update({
      where: { id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(nameAr !== undefined && { nameAr: nameAr || null }),
        ...(clientId !== undefined && { clientId }),
        ...(branchId !== undefined && { branchId }),
        ...(location !== undefined && { location: location || null }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(status !== undefined && { status }),
        ...(description !== undefined && { description: description || null }),
        ...(contractValue !== undefined && { contractValue: parseFloat(contractValue) || 0 }),
        ...(projectType !== undefined && { projectType }),
      },
      include: {
        client: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json(project)
  } catch (error) {
    console.error('Error updating project:', error)
    return NextResponse.json({ error: 'فشل في تحديث المشروع' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.project.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    await db.project.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف المشروع بنجاح' })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: 'فشل في حذف المشروع' }, { status: 500 })
  }
}

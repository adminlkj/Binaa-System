import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const project = await db.project.findFirst({
      where: { id, deletedAt: null },
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
          include: { contract: { select: { contractNo: true, id: true } } },
          orderBy: { date: 'desc' },
        },
        salesInvoices: {
          include: {
            client: { select: { id: true, name: true, code: true } },
            progressClaim: { select: { claimNo: true, id: true } },
            timesheet: { select: { id: true, operatingHours: true } },
            clientPayments: { orderBy: { date: 'desc' } },
          },
          orderBy: { date: 'desc' },
        },
        purchaseOrders: {
          include: {
            supplier: { select: { id: true, name: true, code: true } },
          },
          orderBy: { date: 'desc' },
        },
        purchaseInvoices: {
          include: {
            supplier: { select: { id: true, name: true, code: true } },
            goodsReceipt: { select: { receiptNo: true, id: true } },
          },
          orderBy: { date: 'desc' },
        },
        expenses: {
          orderBy: { date: 'desc' },
        },
        laborCosts: {
          orderBy: { date: 'desc' },
        },
        equipmentCosts: {
          orderBy: { date: 'desc' },
        },
        equipmentUsages: {
          include: {
            equipment: { select: { id: true, name: true, code: true } },
          },
          orderBy: { date: 'desc' },
        },
        subcontractorInvoices: {
          include: {
            subcontractor: { select: { id: true, name: true, code: true } },
          },
          orderBy: { date: 'desc' },
        },
        goodsReceipts: {
          include: {
            supplier: { select: { id: true, name: true } },
            purchaseOrder: { select: { orderNo: true } },
          },
          orderBy: { date: 'desc' },
        },
        timesheets: {
          include: {
            equipment: { select: { id: true, name: true, code: true } },
            rental: { select: { id: true, pricingType: true, hourlyRate: true } },
          },
          orderBy: { year: 'desc' },
        },
        workTeams: {
          include: {
            members: {
              include: {
                employee: { select: { id: true, name: true, code: true } },
              },
            },
          },
        },
        fuelLogs: {
          include: {
            equipment: { select: { id: true, name: true, code: true } },
          },
          orderBy: { date: 'desc' },
        },
        equipmentOperations: {
          include: {
            equipment: { select: { id: true, name: true, code: true } },
            operator: { select: { id: true, name: true, code: true } },
          },
          orderBy: { date: 'desc' },
        },
        resourceAllocations: {
          orderBy: { startDate: 'desc' },
        },
        purchaseRequests: {
          orderBy: { date: 'desc' },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    // Compute cost sheet for "كرت المشروع"
    const contractValue = project.contractValue || 0
    const progressClaimsTotal = project.progressClaims.reduce((sum, c) => sum + Number(c.amount || 0), 0)
    const salesInvoicesTotal = project.salesInvoices.reduce((sum, si) => sum + Number(si.totalAmount || 0), 0)
    const purchases = project.purchaseInvoices.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0)
    const subcontractors = project.subcontractorInvoices.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
    const labor = project.laborCosts.reduce((sum, l) => sum + Number(l.totalAmount || 0), 0)
    const equipment = project.equipmentCosts.reduce((sum, e) => sum + Number(e.amount || 0), 0) +
      project.equipmentUsages.reduce((sum, e) => sum + Number(e.cost || 0), 0)
    const projectExpenses = project.expenses.reduce((sum, e) => sum + Number(e.totalAmount || 0), 0)
    const totalCosts = purchases + subcontractors + labor + equipment + projectExpenses
    const totalRevenue = progressClaimsTotal + salesInvoicesTotal
    const profit = totalRevenue - totalCosts
    const profitMargin = totalRevenue > 0 ? ((profit / totalRevenue) * 100) : 0

    // Service invoices (non-extract based)
    const serviceInvoicesTotal = project.salesInvoices
      .filter(si => si.sourceType === 'TIMESHEET')
      .reduce((sum, si) => sum + Number(si.totalAmount || 0), 0)

    const costSheet = {
      contractValue,
      revenue: progressClaimsTotal,
      serviceInvoices: serviceInvoicesTotal,
      totalRevenue,
      purchases,
      subcontractors,
      labor,
      equipment,
      expenses: projectExpenses,
      totalCosts,
      profit,
      profitMargin,
    }

    // Compute workflow chain data
    const workflowCounts = {
      clients: project.client ? 1 : 0,
      projects: 1,
      contracts: project.contracts.length,
      boq: project.boqItems.length,
      workHours: project.equipmentOperations.length + project.timesheets.length,
      expenses: project.expenses.length,
      subcontractors: project.subcontractorInvoices.length,
      purchases: project.purchaseOrders.length + project.purchaseInvoices.length,
      extracts: project.progressClaims.length,
      invoice: project.salesInvoices.length,
      collection: project.salesInvoices.reduce((sum, si) => sum + si.clientPayments.length, 0),
      accounting: project.salesInvoices.filter(si => si.journalEntryId).length +
        project.purchaseInvoices.filter(pi => pi.journalEntryId).length +
        project.expenses.filter(e => e.journalEntryId).length +
        project.subcontractorInvoices.filter(si => si.journalEntryId).length,
    }

    return NextResponse.json({
      ...project,
      costSheet,
      workflowCounts,
    })
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

    // L4-DATA-006: Validate name non-empty + date order (endDate >= startDate).
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json({ error: 'اسم المشروع لا يمكن أن يكون فارغاً' }, { status: 400 })
    }
    if (startDate !== undefined || endDate !== undefined) {
      const effectiveStart = startDate !== undefined ? new Date(startDate) : existing.startDate
      const effectiveEnd = endDate !== undefined ? (endDate ? new Date(endDate) : null) : existing.endDate
      if (startDate !== undefined && isNaN(effectiveStart.getTime())) {
        return NextResponse.json({ error: 'تاريخ بداية المشروع غير صالح' }, { status: 400 })
      }
      if (endDate !== undefined && endDate && isNaN(effectiveEnd!.getTime())) {
        return NextResponse.json({ error: 'تاريخ نهاية المشروع غير صالح' }, { status: 400 })
      }
      if (effectiveEnd && effectiveEnd < effectiveStart) {
        return NextResponse.json({ error: 'تاريخ نهاية المشروع لا يمكن أن يكون قبل تاريخ بدايته' }, { status: 400 })
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

    const existing = await db.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            // Block delete if there are active (non-DRAFT/CANCELLED) contracts
            contracts: { where: { status: { in: ['ACTIVE', 'UNDER_REVIEW'] } } },
            // Block if there are submitted/approved claims (not DRAFT/REJECTED)
            progressClaims: { where: { status: { in: ['SUBMITTED', 'APPROVED', 'PARTIALLY_PAID', 'PAID'] } } },
            // Block if there are issued invoices (not DRAFT/CANCELLED)
            salesInvoices: { where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] } } },
            purchaseInvoices: { where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] } } },
            expenses: true,
            subcontractorInvoices: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    if (existing.deletedAt) {
      return NextResponse.json({ error: 'المشروع محذوف بالفعل' }, { status: 400 })
    }

    // P2-CRIT-009 fix: block hard-delete entirely. Projects must be CANCELLED, not deleted.
    // Block if there are any financial records that reference the project.
    const c = existing._count
    const blockingCount =
      c.contracts + c.progressClaims + c.salesInvoices + c.purchaseInvoices +
      c.expenses + c.subcontractorInvoices

    if (blockingCount > 0) {
      return NextResponse.json(
        {
          error: `لا يمكن حذف مشروع له سجلات مالية مرتبطة (${blockingCount} سجل). استخدم الإلغاء بدلاً من الحذف.`,
          counts: {
            contracts: c.contracts,
            progressClaims: c.progressClaims,
            salesInvoices: c.salesInvoices,
            purchaseInvoices: c.purchaseInvoices,
            expenses: c.expenses,
            subcontractorInvoices: c.subcontractorInvoices,
          },
        },
        { status: 400 }
      )
    }

    // P2-CRIT-009 fix: soft-delete instead of hard-delete.
    // Sets deletedAt + status=CANCELLED. All JEs, cost centers, etc. remain intact.
    await db.project.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'CANCELLED',
      },
    })

    return NextResponse.json({ message: 'تم إلغاء المشروع (soft-delete). السجلات المالية محفوظة.' })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: 'فشل في حذف المشروع' }, { status: 500 })
  }
}

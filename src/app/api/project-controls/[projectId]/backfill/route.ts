import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRoleApi } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

// POST /api/project-controls/[projectId]/backfill
// يرحّل التكاليف التاريخية (Expense/LaborCost/SubcontractorInvoice/EquipmentCost/Salary) إلى CostEntry
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response
  try {
    const { projectId } = await params
    const results = { expenses: 0, laborCosts: 0, subcontractorInvoices: 0, equipmentCosts: 0, salaries: 0 }

    // 1) Expenses
    try {
      const expenses = await db.expense.findMany({ where: { projectId, journalEntryId: { not: null } } })
      for (const exp of expenses) {
        // Check if already backfilled
        const existing = await db.costEntry.findFirst({
          where: { sourceType: 'EXPENSE', sourceId: exp.id },
        })
        if (existing) continue

        await db.costEntry.create({
          data: {
            projectId,
            costType: 'OVERHEAD',
            sourceType: 'EXPENSE',
            sourceId: exp.id,
            sourceDocument: exp.reference || `EXP-${exp.id.slice(-6)}`,
            description: exp.description || 'مصروف',
            amount: Number(exp.amount),
            quantity: 1,
            unitCost: Number(exp.amount),
            date: exp.date,
            periodYear: exp.date.getFullYear(),
            periodMonth: exp.date.getMonth() + 1,
            isCommitted: false,
            journalEntryId: exp.journalEntryId,
            costCenterId: exp.costCenterId,
          },
        })
        results.expenses++
      }
    } catch (e) {
      console.error('Backfill expenses error:', e)
    }

    // 2) LaborCosts
    try {
      const laborCosts = await db.laborCost.findMany({ where: { projectId } })
      for (const lc of laborCosts) {
        const existing = await db.costEntry.findFirst({
          where: { sourceType: 'LABOR_COST', sourceId: lc.id },
        })
        if (existing) continue

        await db.costEntry.create({
          data: {
            projectId,
            costType: 'LABOR',
            sourceType: 'LABOR_COST',
            sourceId: lc.id,
            sourceDocument: `LAB-${lc.id.slice(-6)}`,
            description: lc.description || 'تكلفة عمالة',
            amount: Number(lc.totalAmount),
            quantity: Number(lc.workers || 1),
            unitCost: Number(lc.workers || 1) > 0 ? Number(lc.totalAmount) / Number(lc.workers) : Number(lc.totalAmount),
            date: lc.date,
            periodYear: lc.date.getFullYear(),
            periodMonth: lc.date.getMonth() + 1,
            isCommitted: false,
          },
        })
        results.laborCosts++
      }
    } catch (e) {
      console.error('Backfill labor costs error:', e)
    }

    // 3) SubcontractorInvoices
    try {
      const subInvoices = await db.subcontractorInvoice.findMany({ where: { projectId } })
      for (const si of subInvoices) {
        const existing = await db.costEntry.findFirst({
          where: { sourceType: 'SUBCONTRACTOR_INVOICE', sourceId: si.id },
        })
        if (existing) continue

        await db.costEntry.create({
          data: {
            projectId,
            costType: 'SUBCONTRACTOR',
            sourceType: 'SUBCONTRACTOR_INVOICE',
            sourceId: si.id,
            sourceDocument: si.invoiceNo || `SUB-${si.id.slice(-6)}`,
            description: si.description || 'فاتورة مقاول باطن',
            amount: Number(si.amount),
            quantity: 1,
            unitCost: Number(si.amount),
            date: si.date,
            periodYear: si.date.getFullYear(),
            periodMonth: si.date.getMonth() + 1,
            isCommitted: false,
          },
        })
        results.subcontractorInvoices++
      }
    } catch (e) {
      console.error('Backfill subcontractor invoices error:', e)
    }

    // 4) EquipmentCosts
    try {
      const equipCosts = await db.equipmentCost.findMany({ where: { projectId } })
      for (const ec of equipCosts) {
        const existing = await db.costEntry.findFirst({
          where: { sourceType: 'EQUIPMENT_COST', sourceId: ec.id },
        })
        if (existing) continue

        await db.costEntry.create({
          data: {
            projectId,
            costType: 'EQUIPMENT',
            sourceType: 'EQUIPMENT_COST',
            sourceId: ec.id,
            sourceDocument: `EQC-${ec.id.slice(-6)}`,
            description: 'تكلفة معدات',
            amount: Number(ec.amount),
            quantity: 1,
            unitCost: Number(ec.amount),
            date: ec.date,
            periodYear: ec.date.getFullYear(),
            periodMonth: ec.date.getMonth() + 1,
            isCommitted: false,
          },
        })
        results.equipmentCosts++
      }
    } catch (e) {
      console.error('Backfill equipment costs error:', e)
    }

    return NextResponse.json({
      success: true,
      results,
      total: results.expenses + results.laborCosts + results.subcontractorInvoices + results.equipmentCosts,
    })
  } catch (error: unknown) {
    console.error('Backfill POST error:', error)
    return NextResponse.json(
      { error: 'Failed to backfill costs' },
      { status: 500 }
    )
  }
}

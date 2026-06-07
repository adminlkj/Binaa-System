import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET: Aggregated project costs for the Project Cost Sheet
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, code: true, name: true, nameAr: true, contractValue: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    // 1. Material costs (from GoodsReceipt items where destination=PROJECT)
    const goodsReceiptItems = await db.goodsReceiptItem.findMany({
      where: {
        destination: 'PROJECT',
        goodsReceipt: { projectId },
      },
      include: {
        goodsReceipt: { select: { receiptNo: true, date: true } },
      },
    })
    const materialCosts = goodsReceiptItems.reduce((sum, item) => sum + item.totalPrice, 0)

    // 2. Equipment costs (from EquipmentCost table)
    const equipmentCosts = await db.equipmentCost.findMany({ where: { projectId } })
    const equipmentCostTotal = equipmentCosts.reduce((sum, c) => sum + c.amount, 0)

    // 3. Equipment operations (from EquipmentOperation linked to project)
    const equipmentOperations = await db.equipmentOperation.findMany({
      where: { projectId },
      include: { equipment: { select: { name: true, hourlyRate: true } } },
    })
    const equipmentOperationCosts = equipmentOperations.map(op => ({
      ...op,
      calculatedCost: op.hours * (op.equipment.hourlyRate || 0),
    }))
    const equipmentOperationTotal = equipmentOperationCosts.reduce((sum, op) => sum + op.calculatedCost, 0)

    // 4. Equipment fuel (from EquipmentFuelLog linked to project)
    const fuelLogs = await db.equipmentFuelLog.findMany({ where: { projectId } })
    const fuelCostTotal = fuelLogs.reduce((sum, f) => sum + f.totalCost, 0)

    // 5. Equipment maintenance (where equipment has allocation to project)
    const equipmentAllocations = await db.resourceAllocation.findMany({
      where: { resourceType: 'EQUIPMENT', projectId },
      select: { resourceId: true },
    })
    const equipmentIds = equipmentAllocations.map(a => a.resourceId)
    const maintenanceRecords = equipmentIds.length > 0
      ? await db.equipmentMaintenance.findMany({
          where: { equipmentId: { in: equipmentIds } },
        })
      : []
    const maintenanceCostTotal = maintenanceRecords.reduce((sum, m) => sum + m.cost, 0)

    // 6. Subcontractor costs (from SubcontractorInvoice linked to project)
    const subcontractorInvoices = await db.subcontractorInvoice.findMany({
      where: { projectId },
      include: { subcontractor: { select: { name: true } } },
    })
    const subcontractorCostTotal = subcontractorInvoices.reduce((sum, inv) => sum + inv.amount, 0)

    // 7. Labor costs (from LaborCost linked to project)
    const laborCosts = await db.laborCost.findMany({ where: { projectId } })
    const laborCostTotal = laborCosts.reduce((sum, lc) => sum + lc.totalAmount, 0)

    // 8. Salary costs (from Salary where employee has allocation to project)
    const employeeAllocations = await db.resourceAllocation.findMany({
      where: { resourceType: 'EMPLOYEE', projectId },
      select: { resourceId: true },
    })
    const employeeIds = employeeAllocations.map(a => a.resourceId)
    const salaryCosts = employeeIds.length > 0
      ? await db.salary.findMany({
          where: {
            employeeId: { in: employeeIds },
            status: { in: ['APPROVED', 'PAID'] },
          },
          include: { employee: { select: { name: true } } },
        })
      : []
    const salaryCostTotal = salaryCosts.reduce((sum, s) => sum + s.netSalary, 0)

    // 9. Project expenses (from Expense linked to project)
    const expenses = await db.expense.findMany({ where: { projectId } })
    const expenseTotal = expenses.reduce((sum, e) => sum + e.totalAmount, 0)

    // Total project cost
    const totalCost = materialCosts + equipmentCostTotal + equipmentOperationTotal + fuelCostTotal + maintenanceCostTotal + subcontractorCostTotal + laborCostTotal + salaryCostTotal + expenseTotal

    // Contract value and profit margin
    const contractValue = project.contractValue || 0
    const profitLoss = contractValue - totalCost
    const profitMargin = contractValue > 0 ? ((profitLoss / contractValue) * 100) : 0

    return NextResponse.json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        nameAr: project.nameAr,
        contractValue,
      },
      costs: {
        materials: { total: materialCosts, items: goodsReceiptItems },
        equipmentCosts: { total: equipmentCostTotal, items: equipmentCosts },
        equipmentOperations: { total: equipmentOperationTotal, items: equipmentOperationCosts },
        fuel: { total: fuelCostTotal, items: fuelLogs },
        maintenance: { total: maintenanceCostTotal, items: maintenanceRecords },
        subcontractors: { total: subcontractorCostTotal, items: subcontractorInvoices },
        labor: { total: laborCostTotal, items: laborCosts },
        salaries: { total: salaryCostTotal, items: salaryCosts },
        expenses: { total: expenseTotal, items: expenses },
      },
      totalCost,
      contractValue,
      profitLoss,
      profitMargin: Math.round(profitMargin * 100) / 100,
      budgetUtilization: contractValue > 0 ? Math.round((totalCost / contractValue) * 10000) / 100 : 0,
    })
  } catch (error) {
    console.error('Error fetching project costs:', error)
    return NextResponse.json({ error: 'فشل في تحميل تكاليف المشروع' }, { status: 500 })
  }
}

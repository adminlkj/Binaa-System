import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET: Project Cost Sheet Report
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'يرجى تحديد المشروع' }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { name: true } },
        contracts: { select: { contractNo: true, totalValue: true, status: true } },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    // ===== Materials: from Goods Receipt items with destination=PROJECT =====
    const goodsReceiptItems = await db.goodsReceiptItem.findMany({
      where: {
        destination: 'PROJECT',
        goodsReceipt: { projectId: projectId },
      },
      select: { totalPrice: true },
    })
    const materialsFromGR = goodsReceiptItems.reduce((s, i) => s + i.totalPrice, 0)

    // Also from purchase invoices linked to project
    const purchaseInvoiceItems = await db.purchaseInvoice.findMany({
      where: { projectId: projectId, status: { not: 'CANCELLED' } },
      select: { subtotal: true, vatAmount: true },
    })
    const materialsFromPI = purchaseInvoiceItems.reduce((s, i) => s + i.subtotal, 0)
    const inputVatFromPI = purchaseInvoiceItems.reduce((s, i) => s + i.vatAmount, 0)

    const materials = materialsFromGR + materialsFromPI

    // ===== Equipment Operations =====
    const equipOps = await db.equipmentOperation.findMany({
      where: { projectId: projectId },
      include: { equipment: { select: { hourlyRate: true } } },
    })
    const equipmentOperations = equipOps.reduce((s, op) => {
      const rate = op.equipment?.hourlyRate || 0
      return s + (rate * op.hours)
    }, 0)

    // ===== Equipment Maintenance (equipment allocated to project) =====
    const resourceAllocations = await db.resourceAllocation.findMany({
      where: { projectId: projectId, resourceType: 'EQUIPMENT' },
      select: { resourceId: true },
    })
    const equipmentIds = resourceAllocations.map(r => r.resourceId)
    const maintenanceRecords = await db.equipmentMaintenance.findMany({
      where: { equipmentId: { in: equipmentIds } },
      select: { cost: true },
    })
    const equipmentMaintenance = maintenanceRecords.reduce((s, m) => s + m.cost, 0)

    // ===== Equipment Fuel =====
    const fuelLogs = await db.equipmentFuelLog.findMany({
      where: { projectId: projectId },
      select: { totalCost: true },
    })
    const equipmentFuel = fuelLogs.reduce((s, f) => s + f.totalCost, 0)

    // ===== Subcontractors =====
    const subInvoices = await db.subcontractorInvoice.findMany({
      where: { projectId: projectId, status: { not: 'CANCELLED' } },
      select: { amount: true, vatAmount: true },
    })
    const subcontractors = subInvoices.reduce((s, i) => s + i.amount, 0)
    const inputVatFromSub = subInvoices.reduce((s, i) => s + i.vatAmount, 0)

    // ===== Labor Costs =====
    const laborCosts = await db.laborCost.findMany({
      where: { projectId: projectId },
      select: { totalAmount: true },
    })
    const labor = laborCosts.reduce((s, l) => s + l.totalAmount, 0)

    // ===== Salaries (employees allocated to project) =====
    const employeeAllocations = await db.resourceAllocation.findMany({
      where: { projectId: projectId, resourceType: 'EMPLOYEE' },
      select: { resourceId: true },
    })
    const employeeIds = employeeAllocations.map(r => r.resourceId)
    const salaryRecords = await db.salary.findMany({
      where: { employeeId: { in: employeeIds }, status: { in: ['APPROVED', 'PAID'] } },
      select: { netSalary: true },
    })
    const salaries = salaryRecords.reduce((s, sal) => s + sal.netSalary, 0)

    // ===== Project Expenses =====
    const expenses = await db.expense.findMany({
      where: { projectId: projectId },
      select: { amount: true, vatAmount: true },
    })
    const projectExpenses = expenses.reduce((s, e) => s + e.amount, 0)
    const inputVatFromExpenses = expenses.reduce((s, e) => s + (e.vatAmount || 0), 0)

    // ===== Equipment Costs (from EquipmentCost model) =====
    const equipCosts = await db.equipmentCost.findMany({
      where: { projectId: projectId },
      select: { amount: true },
    })
    const equipmentCosts = equipCosts.reduce((s, e) => s + e.amount, 0)

    // ===== Equipment Usage (from EquipmentUsage model) =====
    const equipUsages = await db.equipmentUsage.findMany({
      where: { projectId: projectId },
      select: { cost: true },
    })
    const equipmentUsages = equipUsages.reduce((s, e) => s + e.cost, 0)

    // ===== Totals =====
    const totalCost = materials + equipmentOperations + equipmentMaintenance + equipmentFuel +
      subcontractors + labor + salaries + projectExpenses + equipmentCosts + equipmentUsages

    const contractValue = project.contractValue || project.contracts.reduce((s, c) => s + c.totalValue, 0)
    const grossProfit = contractValue - totalCost
    const profitMargin = contractValue > 0 ? (grossProfit / contractValue) * 100 : 0
    const inputVat = inputVatFromPI + inputVatFromSub + inputVatFromExpenses

    return NextResponse.json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        nameAr: project.nameAr,
        status: project.status,
        clientName: project.client.name,
        contractValue,
      },
      costs: {
        materials,
        equipmentOperations,
        equipmentMaintenance,
        equipmentFuel,
        subcontractors,
        labor,
        salaries,
        projectExpenses,
        equipmentCosts,
        equipmentUsages,
      },
      totalCost,
      contractValue,
      grossProfit,
      profitMargin,
      inputVat,
    })
  } catch (error) {
    console.error('Error generating project cost report:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تقرير تكاليف المشروع' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getProjectCostBreakdown } from '@/lib/accounting/queries'

// GET: Aggregated project costs for the Project Cost Sheet
//
// ⚠️  SSOT (P1-1-FIX / C23): جميع المجاميع المالية مصدرها JournalLine
//    (status='POSTED', deletedAt IS NULL) عبر `getProjectCostBreakdown` في
//    `@/lib/accounting/queries`. الجداول التشغيلية السابقة (GoodsReceiptItem,
//    EquipmentCost, EquipmentOperation, EquipmentFuelLog, EquipmentMaintenance,
//    SubcontractorInvoice, LaborCost, Salary, Expense, ResourceAllocation) لم
//    تعد مصدراً للمجاميع المالية. خريطة byRole إلى الفئات التسع:
//      PROJECT_COST → materials
//      DRIVER_EXPENSE + TRANSPORT_EXPENSE + RENTAL_DEPRECIATION → equipmentCosts / equipmentOperations
//      FUEL_EXPENSE → fuel
//      MAINTENANCE_EXPENSE → maintenance
//      SUBCONTRACTOR_COST → subcontractors
//      PAYROLL_EXPENSE → labor + salaries
//      ADMIN_EXPENSE + GOSI_EXPENSE + DEPRECIATION_EXPENSE + ZAKAT_EXPENSE + OTHER → expenses
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

    // ===== المصدر الموحّد: JournalLine المرحّلة على مركز تكلفة المشروع =====
    const breakdown = await getProjectCostBreakdown(projectId)
    const role = (key: string): number => breakdown.byRole.get(key) || 0

    const materialCosts = role('PROJECT_COST')
    const equipmentCostTotal =
      role('DRIVER_EXPENSE') +
      role('TRANSPORT_EXPENSE') +
      role('RENTAL_DEPRECIATION')
    const equipmentOperationTotal = equipmentCostTotal // مُدمج
    const fuelCostTotal = role('FUEL_EXPENSE')
    const maintenanceCostTotal = role('MAINTENANCE_EXPENSE')
    const subcontractorCostTotal = role('SUBCONTRACTOR_COST')
    const laborCostTotal = role('PAYROLL_EXPENSE')
    const salaryCostTotal = role('PAYROLL_EXPENSE') // رواتب = نفس بند الأجور في النظام المحاسبي
    const expenseTotal =
      role('ADMIN_EXPENSE') +
      role('GOSI_EXPENSE') +
      role('DEPRECIATION_EXPENSE') +
      role('ZAKAT_EXPENSE') +
      role('OTHER')

    const totalCost = breakdown.total

    // Contract value and profit margin
    const contractValue = Number(project.contractValue) || 0
    // الإيراد من القيود المحاسبية (المصدر الموحّد) — ليس من contractValue
    const profitLoss = breakdown.revenue - totalCost
    const profitMargin = breakdown.revenue > 0
      ? ((profitLoss / breakdown.revenue) * 100)
      : 0

    return NextResponse.json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        nameAr: project.nameAr,
        contractValue,
      },
      costs: {
        materials: { total: materialCosts, items: [] },
        equipmentCosts: { total: equipmentCostTotal, items: [] },
        equipmentOperations: { total: equipmentOperationTotal, items: [] },
        fuel: { total: fuelCostTotal, items: [] },
        maintenance: { total: maintenanceCostTotal, items: [] },
        subcontractors: { total: subcontractorCostTotal, items: [] },
        labor: { total: laborCostTotal, items: [] },
        salaries: { total: salaryCostTotal, items: [] },
        expenses: { total: expenseTotal, items: [] },
      },
      totalCost,
      contractValue,
      // الإيراد من القيود المحاسبية (المصدر الموحّد)
      revenue: breakdown.revenue,
      profitLoss,
      profitMargin: Math.round(profitMargin * 100) / 100,
      budgetUtilization: contractValue > 0 ? Math.round((totalCost / contractValue) * 10000) / 100 : 0,
      costCenterId: breakdown.costCenterId,
      source: 'posted-journal-entries',
    })
  } catch (error) {
    console.error('Error fetching project costs:', error)
    return NextResponse.json({ error: 'فشل في تحميل تكاليف المشروع' }, { status: 500 })
  }
}

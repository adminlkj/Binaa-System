import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { toNumber } from '@/lib/decimal'

// ============================================================================
// BA-09: Business Flows API
// ----------------------------------------------------------------------------
// Returns counts and status for each step of the 4 business workflows.
// Uses Promise.allSettled so one missing model doesn't break the whole API.
// ============================================================================

async function safeCount(promise: Promise<number>): Promise<number> {
  try {
    return await promise
  } catch {
    return 0
  }
}

export async function GET() {
  try {
    const results = await Promise.allSettled([
      db.client.count(),
      db.project.count(),
      db.contract.count(),
      safeCount(db.bOQItem.count()),
      db.progressClaim.count(),
      db.salesInvoice.count({ where: { invoiceType: { in: ['PROJECT', 'SERVICE'] } } }),
      db.clientPayment.count(),
      db.equipment.count(),
      safeCount(db.equipmentRental.count()),
      safeCount(db.equipmentDeliveryOrder.count()),
      db.timesheet.count(),
      db.salesInvoice.count({ where: { invoiceType: 'RENTAL' } }),
      db.clientPayment.count({ where: { paymentType: 'RENTAL' } }),
      db.employee.count(),
      safeCount(db.employeeContract.count()),
      safeCount(db.attendance.count()),
      db.payrollRun.count(),
      db.salary.count(),
      db.salaryPayment.count(),
      safeCount(db.purchaseRequest.count()),
      safeCount(db.purchaseOrder.count()),
      safeCount(db.goodsReceipt.count()),
      safeCount(db.purchaseInvoice.count()),
      safeCount(db.supplierPayment.count()),
      db.journalEntry.count({ where: { deletedAt: null } }),
    ])

    const val = (i: number): number =>
      results[i].status === 'fulfilled' ? results[i].value : 0

    const clientsCount = val(0)
    const projectsCount = val(1)
    const contractsCount = val(2)
    const boqCount = val(3)
    const extractsCount = val(4)
    const salesInvoicesCount = val(5)
    const clientPaymentsCount = val(6)
    const equipmentCount = val(7)
    const rentalContractsCount = val(8)
    const deliveryOrdersCount = val(9)
    const timesheetsCount = val(10)
    const rentalInvoicesCount = val(11)
    const rentalPaymentsCount = val(12)
    const employeesCount = val(13)
    const employeeContractsCount = val(14)
    const attendanceCount = val(15)
    const payrollRunsCount = val(16)
    const salariesCount = val(17)
    const salaryPaymentsCount = val(18)
    const purchaseRequestsCount = val(19)
    const purchaseOrdersCount = val(20)
    const goodsReceiptCount = val(21)
    const supplierInvoicesCount = val(22)
    const supplierPaymentsCount = val(23)
    const journalEntriesCount = val(24)

    // Construction workflow step counts
    const constructionSteps = [
      { step: 'clients', label: { ar: 'العميل', en: 'Client' }, count: clientsCount, navItem: 'clients' },
      { step: 'projects', label: { ar: 'المشروع', en: 'Project' }, count: projectsCount, navItem: 'projects' },
      { step: 'contracts', label: { ar: 'العقد', en: 'Contract' }, count: contractsCount, navItem: 'contracts' },
      { step: 'boq', label: { ar: 'BOQ', en: 'BOQ' }, count: boqCount, navItem: 'boq' },
      { step: 'extracts', label: { ar: 'المستخلص', en: 'Extract' }, count: extractsCount, navItem: 'extracts' },
      { step: 'invoice', label: { ar: 'فاتورة', en: 'Invoice' }, count: salesInvoicesCount, navItem: 'sales' },
      { step: 'collection', label: { ar: 'التحصيل', en: 'Collection' }, count: clientPaymentsCount, navItem: 'client-payments' },
      { step: 'accounting', label: { ar: 'قيد محاسبي', en: 'Journal Entry' }, count: journalEntriesCount, navItem: 'accounting' },
    ]

    // Rental workflow step counts
    const rentalSteps = [
      { step: 'clients', label: { ar: 'العميل', en: 'Client' }, count: clientsCount, navItem: 'clients' },
      { step: 'equipment', label: { ar: 'المعدة', en: 'Equipment' }, count: equipmentCount, navItem: 'equipment' },
      { step: 'rental-contract', label: { ar: 'عقد التأجير', en: 'Rental Contract' }, count: rentalContractsCount, navItem: 'rental-contracts' },
      { step: 'delivery', label: { ar: 'أمر التسليم', en: 'Delivery Order' }, count: deliveryOrdersCount, navItem: 'delivery-orders' },
      { step: 'timesheet', label: { ar: 'ساعات التشغيل', en: 'Operating Hours' }, count: timesheetsCount, navItem: 'timesheets' },
      { step: 'invoice', label: { ar: 'فاتورة', en: 'Invoice' }, count: rentalInvoicesCount, navItem: 'rental-invoices' },
      { step: 'collection', label: { ar: 'التحصيل', en: 'Collection' }, count: rentalPaymentsCount, navItem: 'rental-payments' },
      { step: 'accounting', label: { ar: 'قيد محاسبي', en: 'Journal Entry' }, count: journalEntriesCount, navItem: 'accounting' },
    ]

    // HR workflow step counts
    const hrSteps = [
      { step: 'employee', label: { ar: 'الموظف', en: 'Employee' }, count: employeesCount, navItem: 'employees' },
      { step: 'contract', label: { ar: 'عقد العمل', en: 'Contract' }, count: employeeContractsCount, navItem: 'employee-contracts' },
      { step: 'attendance', label: { ar: 'الحضور', en: 'Attendance' }, count: attendanceCount, navItem: 'attendance' },
      { step: 'payroll', label: { ar: 'مسير الرواتب', en: 'Payroll' }, count: payrollRunsCount, navItem: 'payroll-runs' },
      { step: 'salary', label: { ar: 'الراتب', en: 'Salary' }, count: salariesCount, navItem: 'salaries' },
      { step: 'payment', label: { ar: 'الصرف', en: 'Payment' }, count: salaryPaymentsCount, navItem: 'salary-payments' },
      { step: 'accounting', label: { ar: 'قيد محاسبي', en: 'Journal Entry' }, count: journalEntriesCount, navItem: 'accounting' },
    ]

    // Purchase workflow step counts
    const purchaseSteps = [
      { step: 'request', label: { ar: 'طلب شراء', en: 'Request' }, count: purchaseRequestsCount, navItem: 'purchase-requests' },
      { step: 'order', label: { ar: 'أمر شراء', en: 'Order' }, count: purchaseOrdersCount, navItem: 'purchase-orders' },
      { step: 'receipt', label: { ar: 'استلام', en: 'Receipt' }, count: goodsReceiptCount, navItem: 'goods-receipt' },
      { step: 'invoice', label: { ar: 'فاتورة', en: 'Invoice' }, count: supplierInvoicesCount, navItem: 'supplier-invoices' },
      { step: 'payment', label: { ar: 'سداد', en: 'Payment' }, count: supplierPaymentsCount, navItem: 'supplier-payments' },
      { step: 'accounting', label: { ar: 'قيد محاسبي', en: 'Journal Entry' }, count: journalEntriesCount, navItem: 'accounting' },
    ]

    // Active project instances
    const activeProjects = await db.project.findMany({
      where: { status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        status: true,
        contractValue: true,
        _count: {
          select: {
            contracts: true,
            bOQItems: true,
            progressClaims: true,
            salesInvoices: true,
          },
        },
      },
    }).catch(() => [])

    // Active rental contracts
    const activeRentalContracts = await db.equipmentRental.findMany({
      where: { status: { in: ['ACTIVE', 'PENDING', 'IN_PROGRESS'] } },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        salesOrderNo: true,
        status: true,
        client: { select: { id: true, name: true, nameAr: true } },
        equipment: { select: { id: true, name: true, nameAr: true } },
        _count: {
          select: {
            deliveryOrders: true,
            timesheets: true,
          },
        },
      },
    }).catch(() => [])

    // Active payroll runs
    const activePayrollRuns = await db.payrollRun.findMany({
      where: { status: { in: ['DRAFT', 'APPROVED', 'PARTIALLY_PAID'] } },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        month: true,
        year: true,
        status: true,
        totalNet: true,
        _count: { select: { lines: true } },
      },
    }).catch(() => [])

    return NextResponse.json({
      workflows: {
        construction: {
          steps: constructionSteps,
          activeInstances: activeProjects.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            code: p.code as string,
            name: (p.nameAr as string) || (p.name as string),
            status: p.status as string,
            contractValue: toNumber(p.contractValue as { toString(): string } | null | undefined || 0),
            progress: {
              contracts: (p._count as Record<string, number>)?.contracts ?? 0,
              boq: (p._count as Record<string, number>)?.bOQItems ?? 0,
              extracts: (p._count as Record<string, number>)?.progressClaims ?? 0,
              invoices: (p._count as Record<string, number>)?.salesInvoices ?? 0,
            },
          })),
        },
        rental: {
          steps: rentalSteps,
          activeInstances: activeRentalContracts.map((r: Record<string, unknown>) => ({
            id: r.id as string,
            code: (r.salesOrderNo as string) || '—',
            clientName: (r.client as { nameAr?: string; name?: string })?.nameAr || (r.client as { name?: string })?.name || '—',
            equipmentName: (r.equipment as { nameAr?: string; name?: string })?.nameAr || (r.equipment as { name?: string })?.name || '—',
            status: r.status as string,
            progress: {
              deliveryOrders: (r._count as Record<string, number>)?.deliveryOrders ?? 0,
              timesheets: (r._count as Record<string, number>)?.timesheets ?? 0,
            },
          })),
        },
        hr: {
          steps: hrSteps,
          activeInstances: activePayrollRuns.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            code: p.code as string,
            period: `${p.month}/${p.year}`,
            status: p.status as string,
            totalNet: toNumber(p.totalNet as { toString(): string } | null | undefined || 0),
            employeeCount: (p._count as Record<string, number>)?.lines ?? 0,
          })),
        },
        purchase: { steps: purchaseSteps, activeInstances: [] },
      },
    })
  } catch (error) {
    console.error('[API] business-flows error:', error)
    return NextResponse.json({ error: 'فشل في تحميل تدفقات الأعمال' }, { status: 500 })
  }
}

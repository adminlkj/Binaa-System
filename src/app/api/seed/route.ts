import { db } from '@/lib/db'
import { initializeChartOfAccounts } from '@/lib/accounting/engine'
import { seedFinancialMappings } from '@/lib/financial-mapping-engine'
import { NextResponse } from 'next/server'

/**
 * SECURITY GUARD: This endpoint WIPES THE ENTIRE DATABASE.
 * It requires an explicit `confirm=WIPE_ALL_DATA` query parameter to proceed.
 * Without it, the request is rejected with 403.
 * This prevents accidental data destruction via misclicks or automated tools.
 */
export async function POST(request: Request) {
  // ============ SECURITY: require explicit confirmation ============
  const url = new URL(request.url)
  const confirm = url.searchParams.get('confirm')
  if (confirm !== 'WIPE_ALL_DATA') {
    return NextResponse.json(
      {
        success: false,
        message:
          'تم رفض الطلب: هذه العملية تمسح قاعدة البيانات بالكامل. مطلوب تأكيد صريح.',
      },
      { status: 403 }
    )
  }

  try {
    // ============ CLEAR EXISTING DATA (respect relations) ============
    // Delete in reverse dependency order

    // Timesheets and their invoices first
    await db.salesInvoiceItem.deleteMany()
    await db.salesInvoice.deleteMany()

    // Journal lines first (depends on JournalEntry, Account, CostCenter)
    await db.journalLine.deleteMany()
    await db.journalEntry.deleteMany()

    // Company settings (top-level, no dependents)
    await db.companySetting.deleteMany()

    // Invoice items
    await db.purchaseInvoiceItem.deleteMany()
    await db.purchaseRequestItem.deleteMany()
    await db.purchaseOrderItem.deleteMany()

    // Invoices and orders
    await db.goodsReceiptItem.deleteMany()
    await db.goodsReceipt.deleteMany()
    await db.purchaseInvoice.deleteMany()
    await db.purchaseOrder.deleteMany()
    await db.purchaseRequest.deleteMany()
    await db.subcontractorInvoice.deleteMany()

    // Progress claims (depend on Contract)
    await db.progressClaim.deleteMany()

    // Equipment delivery orders depend on EquipmentRental
    await db.equipmentDeliveryOrder.deleteMany()

    // Timesheets depend on EquipmentRental and Contract
    await db.timesheet.deleteMany()

    // Equipment rentals & expenses (depend on Contract and Equipment)
    await db.equipmentRental.deleteMany()
    await db.equipmentExpense.deleteMany()

    // BOQ Items
    await db.bOQItem.deleteMany()

    // Costs & expenses
    await db.expense.deleteMany()
    await db.laborCost.deleteMany()
    await db.equipmentCost.deleteMany()
    await db.equipmentUsage.deleteMany()
    await db.equipmentFuelLog.deleteMany()
    await db.equipmentMaintenance.deleteMany()

    // Equipment operations
    await db.equipmentOperation.deleteMany()

    // Contracts (after all dependents are deleted)
    await db.contract.deleteMany()

    // Petty cash & advances
    await db.pettyCash.deleteMany()
    await db.employeeAdvance.deleteMany()

    // Client/Supplier payments
    try { await db.clientPayment.deleteMany() } catch {}
    try { await db.supplierPayment.deleteMany() } catch {}

    // Subcontractor contracts (depend on Subcontractor)
    try { await db.subcontractorContract.deleteMany() } catch {}

    // Employee contracts & salaries & attendance (depend on Employee)
    try { await db.employeeContract.deleteMany() } catch {}
    try { await db.salary.deleteMany() } catch {}
    try { await db.attendance.deleteMany() } catch {}

    // Work teams & team members (depend on Employee)
    try { await db.teamMember.deleteMany() } catch {}
    try { await db.workTeam.deleteMany() } catch {}

    // Fixed assets & depreciation
    try { await db.assetDepreciation.deleteMany() } catch {}
    try { await db.fixedAsset.deleteMany() } catch {}

    // Provision movements & provisions
    try { await db.provisionMovement.deleteMany() } catch {}
    try { await db.provision.deleteMany() } catch {}

    // Bank transactions, reconciliations, accounts
    try { await db.bankTransaction.deleteMany() } catch {}
    try { await db.bankReconciliation.deleteMany() } catch {}
    try { await db.bankAccount.deleteMany() } catch {}

    // Period closings
    try { await db.periodClosing.deleteMany() } catch {}

    // Equipment
    await db.equipment.deleteMany()

    // Inventory
    await db.inventoryItem.deleteMany()

    // Employees
    await db.employee.deleteMany()

    // Warehouse
    await db.warehouse.deleteMany()

    // Projects
    await db.project.deleteMany()

    // Clients, Suppliers, Subcontractors
    await db.client.deleteMany()
    await db.supplier.deleteMany()
    await db.subcontractor.deleteMany()

    // Cost Centers
    await db.costCenter.deleteMany()

    // Accounts
    await db.account.deleteMany()

    // VAT Returns
    await db.vATReturn.deleteMany()

    // Attachments & Audit logs
    await db.attachment.deleteMany()
    await db.auditLog.deleteMany()

    // Branches (last - top level)
    await db.branch.deleteMany()

    // ============ SEED DATA ============

    // 0. Initialize Chart of Accounts using the accounting engine
    const coaResult = await initializeChartOfAccounts()
    console.log(`Chart of Accounts initialized: ${coaResult.created} created, ${coaResult.total} total`)

    // 0b. Seed Financial Mapping Engine
    const mappingResult = await seedFinancialMappings()
    console.log(`Financial Mappings seeded: ${mappingResult.created} created, ${mappingResult.skipped} skipped`)

    // 1. Company Settings
    await db.companySetting.create({
      data: {
        nameAr: 'شركة البناء الحديثة للمقاولات',
        nameEn: 'Al Binaa Al Haditha Contracting Co.',
        taxNumber: '300123456700003',
        commercialReg: '1234567890',
        address: 'الدمام - المملكة العربية السعودية',
        phone: '0500000000',
        email: 'info@albinaa.com',
        bankName: 'الراجحي',
        bankIban: 'SA00 8000 0000 6080 1016 7519',
        bankAccountName: 'شركة البناء الحديثة للمقاولات',
        defaultVatRate: 0.15,
        currency: 'SAR',
        currencySymbol: '\uFDFC',
        currencySymbolEn: 'SAR',
        currencySymbolAr: '\uFDFC',
        invoiceTerms: 'مدة السداد 30 يوماً من تاريخ الفاتورة\nهذه الفاتورة صادرة إلكترونياً\nيرجى ذكر رقم الفاتورة عند التحويل',
      }
    })

    // 2. Branch
    const branch = await db.branch.create({
      data: {
        code: 'BR-001',
        name: 'الفرع الرئيسي',
        address: 'الرياض، حي العليا، طريق الملك فهد',
        isActive: true,
      },
    })

    // 3. Warehouse
    const warehouse = await db.warehouse.create({
      data: {
        code: 'WH-001',
        name: 'المستودع الرئيسي',
        branchId: branch.id,
        isActive: true,
      },
    })

    // 4. Currency (removed - using CompanySetting.currencySymbolImage instead)

    // 5. Cost Centers (for projects)
    const costCenters = await Promise.all([
      db.costCenter.create({ data: { code: 'CC-001', name: 'مشروع مجمع الملقا' } }),
      db.costCenter.create({ data: { code: 'CC-002', name: 'مشروع مدرسة النسيم' } }),
      db.costCenter.create({ data: { code: 'CC-003', name: 'مشروع فيلا الورود' } }),
    ])

    // 6. Clients
    const clients = await Promise.all([
      db.client.create({
        data: {
          code: 'CLT-001', name: 'شركة المقاولات المتحدة', nameAr: 'شركة المقاولات المتحدة',
          contactPerson: 'أحمد محمد العتيبي', email: 'info@united-contractors.sa', phone: '0112345678',
          address: 'الرياض، حي الملقا', taxNumber: '300000000100003', isActive: true,
        },
      }),
      db.client.create({
        data: {
          code: 'CLT-002', name: 'مؤسسة البناء الحديث', nameAr: 'مؤسسة البناء الحديث',
          contactPerson: 'خالد عبدالله الشمري', email: 'info@modern-build.sa', phone: '0113456789',
          address: 'جدة، حي الحمراء', taxNumber: '300000000200003', isActive: true,
        },
      }),
      db.client.create({
        data: {
          code: 'CLT-003', name: 'شركة التطوير العقاري', nameAr: 'شركة التطوير العقاري',
          contactPerson: 'سعود فهد القحطاني', email: 'info@realestate-dev.sa', phone: '0114567890',
          address: 'الدمام، حي الفيصلية', taxNumber: '300000000300003', isActive: true,
        },
      }),
      db.client.create({
        data: {
          code: 'CLT-004', name: 'وزارة الإسكان', nameAr: 'وزارة الإسكان',
          contactPerson: 'م. عبدالرحمن الحربي', email: 'projects@moh.sa', phone: '0115678901',
          address: 'الرياض، حي الورود', taxNumber: '300000000400003', isActive: true,
        },
      }),
      db.client.create({
        data: {
          code: 'CLT-005', name: 'شركة المشاريع الصناعية', nameAr: 'شركة المشاريع الصناعية',
          contactPerson: 'ناصر إبراهيم الدوسري', email: 'info@industrial-projects.sa', phone: '0116789012',
          address: 'الرياض، المنطقة الصناعية', taxNumber: '300000000500003', isActive: true,
        },
      }),
    ])

    // 7. Suppliers
    const suppliers = await Promise.all([
      db.supplier.create({
        data: {
          code: 'SUP-001', name: 'شركة الحديد الوطنية', nameAr: 'شركة الحديد الوطنية',
          contactPerson: 'محمد سعيد الغامدي', email: 'sales@national-iron.sa', phone: '0117890123',
          address: 'الرياض، المنطقة الصناعية الثانية', taxNumber: '300000001000003', isActive: true,
        },
      }),
      db.supplier.create({
        data: {
          code: 'SUP-002', name: 'مؤسسة الخرسانة الجاهزة', nameAr: 'مؤسسة الخرسانة الجاهزة',
          contactPerson: 'عبدالعزيز يوسف', email: 'orders@ready-mix.sa', phone: '0118901234',
          address: 'الرياض، طريق مكة القديم', taxNumber: '300000001100003', isActive: true,
        },
      }),
      db.supplier.create({
        data: {
          code: 'SUP-003', name: 'شركة مواد البناء المتكاملة', nameAr: 'شركة مواد البناء المتكاملة',
          contactPerson: 'فهد عوض العنزي', email: 'info@integrated-materials.sa', phone: '0119012345',
          address: 'جدة، حي الصفا', taxNumber: '300000001200003', isActive: true,
        },
      }),
      db.supplier.create({
        data: {
          code: 'SUP-004', name: 'مصنع الطوب والإسمنت', nameAr: 'مصنع الطوب والإسمنت',
          contactPerson: 'صالح حسن المالكي', email: 'sales@brick-cement.sa', phone: '0120123456',
          address: 'الدمام، المنطقة الصناعية', taxNumber: '300000001300003', isActive: true,
        },
      }),
      db.supplier.create({
        data: {
          code: 'SUP-005', name: 'شركة المعدات الثقيلة', nameAr: 'شركة المعدات الثقيلة',
          contactPerson: 'تركي مشعل السبيعي', email: 'rental@heavy-equip.sa', phone: '0121234567',
          address: 'الرياض، طريق الخرج', taxNumber: '300000001400003', isActive: true,
        },
      }),
    ])

    // 8. Subcontractors
    const subcontractors = await Promise.all([
      db.subcontractor.create({
        data: {
          code: 'SUB-001', name: 'مؤسسة السباكة الحديثة', nameAr: 'مؤسسة السباكة الحديثة',
          specialty: 'سباكة', contactPerson: 'عمر أحمد', email: 'info@modern-plumbing.sa',
          phone: '0122345678', address: 'الرياض، حي النسيم', taxNumber: '300000002000003', isActive: true,
        },
      }),
      db.subcontractor.create({
        data: {
          code: 'SUB-002', name: 'شركة الكهرباء والإنارة', nameAr: 'شركة الكهرباء والإنارة',
          specialty: 'كهرباء', contactPerson: 'ماجد سلطان', email: 'info@elec-lighting.sa',
          phone: '0123456789', address: 'الرياض، حي الروضة', taxNumber: '300000002100003', isActive: true,
        },
      }),
      db.subcontractor.create({
        data: {
          code: 'SUB-003', name: 'مؤسسة الجبس والديكور', nameAr: 'مؤسسة الجبس والديكور',
          specialty: 'جبس', contactPerson: 'ياسر حمد', email: 'info@gypsum-decor.sa',
          phone: '0124567890', address: 'جدة، حي النزهة', taxNumber: '300000002200003', isActive: true,
        },
      }),
      db.subcontractor.create({
        data: {
          code: 'SUB-004', name: 'شركة الدهان والتشطيبات', nameAr: 'شركة الدهان والتشطيبات',
          specialty: 'دهان', contactPerson: 'بدر عادل', email: 'info@painting-finishing.sa',
          phone: '0125678901', address: 'الدمام، حي الشاطئ', taxNumber: '300000002300003', isActive: true,
        },
      }),
    ])

    // 9. Employees
    const employees = await Promise.all([
      db.employee.create({ data: { code: 'EMP-001', name: 'م. عبدالله خالد العتيبي', nameAr: 'م. عبدالله خالد العتيبي', profession: 'مهندس مشروع', basicSalary: 15000, branchId: branch.id, phone: '0551234567', email: 'a.otibi@erp.sa', isActive: true } }),
      db.employee.create({ data: { code: 'EMP-002', name: 'فهد محمد الشمري', nameAr: 'فهد محمد الشمري', profession: 'مراقب موقع', basicSalary: 10000, branchId: branch.id, phone: '0552345678', email: 'f.shamri@erp.sa', isActive: true } }),
      db.employee.create({ data: { code: 'EMP-003', name: 'سعد ناصر القحطاني', nameAr: 'سعد ناصر القحطاني', profession: 'محاسب', basicSalary: 12000, branchId: branch.id, phone: '0553456789', email: 's.qahtani@erp.sa', isActive: true } }),
      db.employee.create({ data: { code: 'EMP-004', name: 'محمد إبراهيم الحربي', nameAr: 'محمد إبراهيم الحربي', profession: 'مسؤول مشتريات', basicSalary: 9000, branchId: branch.id, phone: '0554567890', email: 'm.harbi@erp.sa', isActive: true } }),
      db.employee.create({ data: { code: 'EMP-005', name: 'يوسف عبدالرحمن الدوسري', nameAr: 'يوسف عبدالرحمن الدوسري', profession: 'مهندس مدني', basicSalary: 14000, branchId: branch.id, phone: '0555678901', email: 'y.dosari@erp.sa', isActive: true } }),
    ])

    // 10. Projects
    const projects = await Promise.all([
      db.project.create({
        data: {
          code: 'PRJ-001', name: 'مشروع بناء مجمع سكني بالملقا', nameAr: 'مشروع بناء مجمع سكني بالملقا',
          location: 'الرياض - حي الملقا', branchId: branch.id, clientId: clients[0].id,
          startDate: new Date('2024-03-01'), endDate: new Date('2025-06-30'), status: 'ACTIVE',
          description: 'بناء مجمع سكني يتكون من 5 أبراج سكنية بمساحة إجمالية 25,000 م²',
          contractValue: 5175000,
        },
      }),
      db.project.create({
        data: {
          code: 'PRJ-002', name: 'مشروع إنشاء مدرسة بحي النسيم', nameAr: 'مشروع إنشاء مدرسة بحي النسيم',
          location: 'الرياض - حي النسيم', branchId: branch.id, clientId: clients[3].id,
          startDate: new Date('2024-06-15'), endDate: new Date('2025-03-31'), status: 'ACTIVE',
          description: 'إنشاء مدرسة ابتدائية ومتوسطة للبنين بمساحة 8,000 م²',
          contractValue: 3220000,
        },
      }),
      db.project.create({
        data: {
          code: 'PRJ-003', name: 'مشروع تشطيب فيلا بحي الورود', nameAr: 'مشروع تشطيب فيلا بحي الورود',
          location: 'الرياض - حي الورود', branchId: branch.id, clientId: clients[1].id,
          startDate: new Date('2024-09-01'), endDate: new Date('2025-01-31'), status: 'COMPLETED',
          description: 'تشطيب فيلا فاخرة بمساحة 1,200 م² تشمل أعمال السباكة والكهرباء والديكور',
          contractValue: 1092500,
        },
      }),
    ])

    // 11. Contracts
    const contracts = await Promise.all([
      db.contract.create({
        data: {
          projectId: projects[0].id, contractNo: 'CNT-2024-001', date: new Date('2024-03-01'),
          value: 4500000, vatRate: 0.15, vatAmount: 675000, totalValue: 5175000,
          startDate: new Date('2024-03-01'), endDate: new Date('2025-06-30'), status: 'ACTIVE',
          description: 'عقد إنشاء مجمع سكني بالملقا',
        },
      }),
      db.contract.create({
        data: {
          projectId: projects[1].id, contractNo: 'CNT-2024-002', date: new Date('2024-06-15'),
          value: 2800000, vatRate: 0.15, vatAmount: 420000, totalValue: 3220000,
          startDate: new Date('2024-06-15'), endDate: new Date('2025-03-31'), status: 'ACTIVE',
          description: 'عقد إنشاء مدرسة بحي النسيم',
        },
      }),
      db.contract.create({
        data: {
          projectId: projects[2].id, contractNo: 'CNT-2024-003', date: new Date('2024-09-01'),
          value: 950000, vatRate: 0.15, vatAmount: 142500, totalValue: 1092500,
          startDate: new Date('2024-09-01'), endDate: new Date('2025-01-31'), status: 'ACTIVE',
          description: 'عقد تشطيب فيلا بحي الورود',
        },
      }),
    ])

    // 12. BOQ Items
    await Promise.all([
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-001', description: 'أعمال الحفر والتسوية', unit: 'م²', quantity: 25000, unitPrice: 35, totalPrice: 875000, category: 'أعمال ترابية' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-002', description: 'خرسانة عادية قواعد', unit: 'م³', quantity: 1200, unitPrice: 450, totalPrice: 540000, category: 'أعمال خرسانية' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-003', description: 'خرسانة مسلحة أعمدة', unit: 'م³', quantity: 800, unitPrice: 850, totalPrice: 680000, category: 'أعمال خرسانية' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-004', description: 'حديد تسليح', unit: 'طن', quantity: 350, unitPrice: 4200, totalPrice: 1470000, category: 'مواد هيكلية' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-005', description: 'بلوك خرساني 20 سم', unit: 'م²', quantity: 15000, unitPrice: 65, totalPrice: 975000, category: 'أعمال بناء' } }),
    ])

    await Promise.all([
      db.bOQItem.create({ data: { projectId: projects[1].id, code: 'BOQ2-001', description: 'أعمال الحفر', unit: 'م²', quantity: 8000, unitPrice: 30, totalPrice: 240000, category: 'أعمال ترابية' } }),
      db.bOQItem.create({ data: { projectId: projects[1].id, code: 'BOQ2-002', description: 'خرسانة عادية', unit: 'م³', quantity: 450, unitPrice: 450, totalPrice: 202500, category: 'أعمال خرسانية' } }),
      db.bOQItem.create({ data: { projectId: projects[1].id, code: 'BOQ2-003', description: 'خرسانة مسلحة', unit: 'م³', quantity: 600, unitPrice: 850, totalPrice: 510000, category: 'أعمال خرسانية' } }),
    ])

    await Promise.all([
      db.bOQItem.create({ data: { projectId: projects[2].id, code: 'BOQ3-001', description: 'أعمال الجبس والديكور', unit: 'م²', quantity: 3500, unitPrice: 85, totalPrice: 297500, category: 'أعمال تشطيب' } }),
      db.bOQItem.create({ data: { projectId: projects[2].id, code: 'BOQ3-002', description: 'أعمال الدهان', unit: 'م²', quantity: 4500, unitPrice: 35, totalPrice: 157500, category: 'أعمال تشطيب' } }),
      db.bOQItem.create({ data: { projectId: projects[2].id, code: 'BOQ3-003', description: 'أعمال السباكة', unit: 'م²', quantity: 1200, unitPrice: 60, totalPrice: 72000, category: 'أعمال صحية' } }),
    ])

    // 13. Equipment
    const equipmentItems = await Promise.all([
      db.equipment.create({ data: { code: 'EQ-001', name: 'حفارة كاتربيلر 320', nameAr: 'حفارة كاتربيلر 320', type: 'حفارة', model: 'CAT 320', status: 'IN_USE', hourlyRate: 350, dailyRate: 2800, monthlyRate: 60000, isActive: true } }),
      db.equipment.create({ data: { code: 'EQ-002', name: 'رافعة برجية Liebherr', nameAr: 'رافعة برجية Liebherr', type: 'رافعة', model: 'Liebherr 150 EC-B', status: 'IN_USE', hourlyRate: 500, dailyRate: 4000, monthlyRate: 80000, isActive: true } }),
      db.equipment.create({ data: { code: 'EQ-003', name: 'خلاطة خرسانة', nameAr: 'خلاطة خرسانة', type: 'خلاطة', model: 'Elba 60', status: 'AVAILABLE', hourlyRate: 150, dailyRate: 1200, monthlyRate: 25000, isActive: true } }),
    ])

    // 14. Progress Claims (with accounting entries)
    const progressClaimsData = [
      { projectId: projects[0].id, contractId: contracts[0].id, claimNo: 'CLM-001-01', date: new Date('2024-04-30'), percentage: 10, amount: 450000, vatRate: 0.15, vatAmount: 67500, totalAmount: 517500, status: 'PAID' as const, approvedDate: new Date('2024-05-15'), notes: 'المستخلص الأول - أعمال الحفر' },
      { projectId: projects[0].id, contractId: contracts[0].id, claimNo: 'CLM-001-02', date: new Date('2024-06-30'), percentage: 15, amount: 675000, vatRate: 0.15, vatAmount: 101250, totalAmount: 776250, status: 'PAID' as const, approvedDate: new Date('2024-07-15'), notes: 'المستخلص الثاني - القواعد' },
      { projectId: projects[0].id, contractId: contracts[0].id, claimNo: 'CLM-001-03', date: new Date('2024-08-31'), percentage: 20, amount: 900000, vatRate: 0.15, vatAmount: 135000, totalAmount: 1035000, status: 'PARTIALLY_PAID' as const, approvedDate: new Date('2024-09-10'), notes: 'المستخلص الثالث - الهيكل الخرساني' },
      { projectId: projects[1].id, contractId: contracts[1].id, claimNo: 'CLM-002-01', date: new Date('2024-08-15'), percentage: 15, amount: 420000, vatRate: 0.15, vatAmount: 63000, totalAmount: 483000, status: 'PAID' as const, approvedDate: new Date('2024-09-01'), notes: 'المستخلص الأول' },
      { projectId: projects[2].id, contractId: contracts[2].id, claimNo: 'CLM-003-01', date: new Date('2024-10-15'), percentage: 25, amount: 237500, vatRate: 0.15, vatAmount: 35625, totalAmount: 273125, status: 'PAID' as const, approvedDate: new Date('2024-10-30'), notes: 'المستخلص الأول' },
    ]

    for (const claimData of progressClaimsData) {
      await db.progressClaim.create({ data: claimData })
      // Note: Auto accounting entries will be generated when transactions are processed
    }

    // 15. Sales Invoices (with accounting entries)
    const salesInvoicesData = [
      { invoiceNo: 'INV-2024-001', projectId: projects[0].id, contractId: contracts[0].id, clientId: clients[0].id, date: new Date('2024-05-01'), dueDate: new Date('2024-06-01'), subtotal: 450000, discountRate: 0, discountAmount: 0, netAmount: 450000, vatRate: 0.15, vatAmount: 67500, totalAmount: 517500, paidAmount: 517500, status: 'PAID' as const, invoiceType: 'TAX_INVOICE', paymentTerms: '30 days', notes: 'فاتورة المستخلص الأول - مجمع الملقا' },
      { invoiceNo: 'INV-2024-002', projectId: projects[0].id, contractId: contracts[0].id, clientId: clients[0].id, date: new Date('2024-07-01'), dueDate: new Date('2024-08-01'), subtotal: 675000, discountRate: 0, discountAmount: 0, netAmount: 675000, vatRate: 0.15, vatAmount: 101250, totalAmount: 776250, paidAmount: 776250, status: 'PAID' as const, invoiceType: 'TAX_INVOICE', paymentTerms: '30 days', notes: 'فاتورة المستخلص الثاني - مجمع الملقا' },
      { invoiceNo: 'INV-2024-003', projectId: projects[1].id, contractId: contracts[1].id, clientId: clients[3].id, date: new Date('2024-09-01'), dueDate: new Date('2024-10-01'), subtotal: 420000, discountRate: 0, discountAmount: 0, netAmount: 420000, vatRate: 0.15, vatAmount: 63000, totalAmount: 483000, paidAmount: 483000, status: 'PAID' as const, invoiceType: 'TAX_INVOICE', paymentTerms: '30 days', notes: 'فاتورة المستخلص الأول - مدرسة النسيم' },
      { invoiceNo: 'INV-2024-004', projectId: projects[0].id, contractId: contracts[0].id, clientId: clients[0].id, date: new Date('2024-09-15'), dueDate: new Date('2024-10-15'), subtotal: 900000, discountRate: 0, discountAmount: 0, netAmount: 900000, vatRate: 0.15, vatAmount: 135000, totalAmount: 1035000, paidAmount: 500000, status: 'PARTIALLY_PAID' as const, invoiceType: 'TAX_INVOICE', paymentTerms: '30 days', notes: 'فاتورة المستخلص الثالث - مجمع الملقا' },
    ]

    const salesInvoices = []
    for (const invData of salesInvoicesData) {
      const invoice = await db.salesInvoice.create({
        data: {
          ...invData,
          items: {
            create: [{ description: invData.notes || '', quantity: 1, unit: 'مقطوعية', unitPrice: invData.subtotal, totalPrice: invData.subtotal, itemType: 'SERVICE' }]
          }
        }
      })
      salesInvoices.push(invoice)
      // Note: Auto accounting entries will be generated when transactions are processed
    }

    // 16. Purchase Orders
    const purchaseOrders = await Promise.all([
      db.purchaseOrder.create({
        data: {
          orderNo: 'PO-2024-001', projectId: projects[0].id, supplierId: suppliers[0].id,
          date: new Date('2024-03-15'), deliveryDate: new Date('2024-04-01'),
          subtotal: 630000, vatRate: 0.15, vatAmount: 94500, totalAmount: 724500,
          paidAmount: 724500, status: 'RECEIVED', notes: 'أمر شراء حديد تسليح',
          items: { create: [{ description: 'حديد تسليح', quantity: 150, unit: 'طن', unitPrice: 4200, totalPrice: 630000 }] }
        },
      }),
      db.purchaseOrder.create({
        data: {
          orderNo: 'PO-2024-002', projectId: projects[0].id, supplierId: suppliers[1].id,
          date: new Date('2024-03-20'), deliveryDate: new Date('2024-04-15'),
          subtotal: 540000, vatRate: 0.15, vatAmount: 81000, totalAmount: 621000,
          paidAmount: 621000, status: 'RECEIVED', notes: 'أمر شراء خرسانة جاهزة',
          items: { create: [{ description: 'خرسانة جاهزة', quantity: 1200, unit: 'م³', unitPrice: 450, totalPrice: 540000 }] }
        },
      }),
    ])

    // 17. Purchase Invoices (with accounting entries)
    const purchaseInvoicesData = [
      { invoiceNo: 'PI-2024-001', purchaseOrderId: purchaseOrders[0].id, supplierId: suppliers[0].id, date: new Date('2024-04-01'), dueDate: new Date('2024-05-01'), subtotal: 630000, vatRate: 0.15, vatAmount: 94500, totalAmount: 724500, paidAmount: 724500, status: 'PAID' as const, expenseCategory: 'CONSUMABLES' },
      { invoiceNo: 'PI-2024-002', purchaseOrderId: purchaseOrders[1].id, supplierId: suppliers[1].id, date: new Date('2024-04-15'), dueDate: new Date('2024-05-15'), subtotal: 540000, vatRate: 0.15, vatAmount: 81000, totalAmount: 621000, paidAmount: 621000, status: 'PAID' as const, expenseCategory: 'CONSUMABLES' },
    ]

    for (const piData of purchaseInvoicesData) {
      await db.purchaseInvoice.create({
        data: {
          ...piData,
          items: { create: [{ description: 'مواد بناء', quantity: 1, unitPrice: piData.subtotal, totalPrice: piData.subtotal }] }
        }
      })
      // Note: Auto accounting entries will be generated when transactions are processed
    }

    // 18. Subcontractor Invoices
    await Promise.all([
      db.subcontractorInvoice.create({
        data: {
          subcontractorId: subcontractors[0].id, projectId: projects[0].id, invoiceNo: 'SCI-2024-001',
          date: new Date('2024-08-15'), amount: 350000, vatRate: 0.15, vatAmount: 52500,
          totalAmount: 402500, paidAmount: 402500, status: 'PAID',
          description: 'أعمال السباكة - المرحلة الأولى',
        },
      }),
      db.subcontractorInvoice.create({
        data: {
          subcontractorId: subcontractors[1].id, projectId: projects[0].id, invoiceNo: 'SCI-2024-002',
          date: new Date('2024-09-15'), amount: 450000, vatRate: 0.15, vatAmount: 67500,
          totalAmount: 517500, paidAmount: 300000, status: 'PARTIALLY_PAID',
          description: 'أعمال الكهرباء - المرحلة الأولى',
        },
      }),
    ])

    // 19. Expenses (with accounting entries)
    const expensesData = [
      { projectId: projects[0].id, category: 'FUEL' as const, description: 'وقود معدات - مارس 2024', amount: 15000, vatAmount: 2250, totalAmount: 17250, date: new Date('2024-03-31'), payFrom: 'TREASURY' as const },
      { projectId: projects[0].id, category: 'MAINTENANCE' as const, description: 'صيانة حفارة', amount: 8500, vatAmount: 1275, totalAmount: 9775, date: new Date('2024-04-15'), payFrom: 'BANK' as const },
      { projectId: projects[1].id, category: 'TRANSPORT' as const, description: 'نقل مواد - مشروع النسيم', amount: 12000, vatAmount: 1800, totalAmount: 13800, date: new Date('2024-07-20'), payFrom: 'TREASURY' as const },
      { projectId: null, category: 'OFFICE' as const, description: 'لوازم مكتبية', amount: 3500, vatAmount: 525, totalAmount: 4025, date: new Date('2024-05-10'), payFrom: 'PETTY_CASH' as const },
      { projectId: null, category: 'ELECTRICITY' as const, description: 'فاتورة كهرباء المكتب', amount: 4500, vatAmount: 675, totalAmount: 5175, date: new Date('2024-06-01'), payFrom: 'BANK' as const },
    ]

    for (const expData of expensesData) {
      await db.expense.create({ data: expData })
      // Note: Auto accounting entries will be generated when transactions are processed
    }

    // 20. Equipment expenses
    await Promise.all([
      db.equipmentExpense.create({ data: { equipmentId: equipmentItems[0].id, category: 'FUEL', description: 'وقود حفارة', amount: 12000, date: new Date('2024-04-10') } }),
      db.equipmentExpense.create({ data: { equipmentId: equipmentItems[1].id, category: 'MAINTENANCE', description: 'صيانة رافعة', amount: 25000, date: new Date('2024-05-15') } }),
    ])

    // 21. Inventory Items
    await Promise.all([
      db.inventoryItem.create({ data: { code: 'INV-001', name: 'أسمنت بورتلاندي', nameAr: 'أسمنت بورتلاندي', itemType: 'PRODUCT', unit: 'كيس', purchasePrice: 18, sellingPrice: 22, quantity: 500, minQuantity: 50, warehouseId: warehouse.id, category: 'مواد بناء', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-002', name: 'حديد تسليح 12مم', nameAr: 'حديد تسليح 12مم', itemType: 'PRODUCT', unit: 'طن', purchasePrice: 3800, sellingPrice: 4200, quantity: 50, minQuantity: 10, warehouseId: warehouse.id, category: 'حديد', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-003', name: 'بلوك خرساني 20سم', nameAr: 'بلوك خرساني 20سم', itemType: 'PRODUCT', unit: 'قطعة', purchasePrice: 3.5, sellingPrice: 4.5, quantity: 10000, minQuantity: 1000, warehouseId: warehouse.id, category: 'بلوك', isActive: true } }),
    ])

    // 22. VAT Return (using correct schema fields - snapshot)
    const vatSalesInvoices = await db.salesInvoice.findMany({
      where: { date: { gte: new Date('2024-07-01'), lte: new Date('2024-09-30') }, status: { not: 'CANCELLED' } },
      select: { id: true, totalAmount: true, vatAmount: true },
    })
    const vatPurchaseInvoices = await db.purchaseInvoice.findMany({
      where: { date: { gte: new Date('2024-07-01'), lte: new Date('2024-09-30') }, status: { not: 'CANCELLED' } },
      select: { id: true, totalAmount: true, vatAmount: true },
    })
    const vatExpenses = await db.expense.findMany({
      where: { date: { gte: new Date('2024-07-01'), lte: new Date('2024-09-30') }, vatAmount: { gt: 0 } },
      select: { id: true, amount: true, vatAmount: true },
    })

    const vatOutputVat = vatSalesInvoices.reduce((sum, inv) => sum + (inv.vatAmount || 0), 0)
    const vatInputVat = vatPurchaseInvoices.reduce((sum, inv) => sum + (inv.vatAmount || 0), 0) + vatExpenses.reduce((sum, exp) => sum + (exp.vatAmount || 0), 0)
    const vatTotalSales = vatSalesInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0)
    const vatTotalPurchases = vatPurchaseInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0) + vatExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0)

    await db.vATReturn.create({
      data: {
        period: '2024-Q3',
        year: 2024,
        quarter: 3,
        totalSales: vatTotalSales,
        outputVat: vatOutputVat,
        totalPurchases: vatTotalPurchases,
        inputVat: vatInputVat,
        netVat: vatOutputVat - vatInputVat,
        salesInvoiceIds: JSON.stringify(vatSalesInvoices.map(i => i.id)),
        purchaseInvoiceIds: JSON.stringify(vatPurchaseInvoices.map(i => i.id)),
        expenseIds: JSON.stringify(vatExpenses.map(e => e.id)),
        status: 'FILED',
        filedDate: new Date('2024-10-31'),
      },
    })

    // Get final account count
    const finalAccountCount = await db.account.count()
    const finalJournalEntryCount = await db.journalEntry.count({ where: { deletedAt: null } })

    return NextResponse.json({
      success: true,
      message: 'تم تهيئة البيانات التجريبية بنجاح مع التكامل المحاسبي',
      data: {
        companySettings: 1,
        branches: 1,
        warehouses: 1,
        clients: clients.length,
        suppliers: suppliers.length,
        subcontractors: subcontractors.length,
        employees: employees.length,
        projects: projects.length,
        contracts: contracts.length,
        boqItems: 11,
        progressClaims: progressClaimsData.length,
        salesInvoices: salesInvoices.length,
        purchaseOrders: purchaseOrders.length,
        purchaseInvoices: purchaseInvoicesData.length,
        subcontractorInvoices: 2,
        equipment: equipmentItems.length,
        expenses: expensesData.length,
        inventoryItems: 3,
        costCenters: costCenters.length,
        accounts: finalAccountCount,
        journalEntries: finalJournalEntryCount,
        vatReturns: 1,
        chartOfAccounts: coaResult,
      }
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { success: false, message: 'حدث خطأ أثناء تهيئة البيانات', error: String(error) },
      { status: 500 }
    )
  }
}

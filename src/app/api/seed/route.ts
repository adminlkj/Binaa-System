import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    // ============ CLEAR EXISTING DATA (respect relations) ============
    // Delete in reverse dependency order

    // Company settings (top-level, no dependents)
    await db.companySetting.deleteMany()

    // Journal lines first (depends on JournalEntry, Account, CostCenter)
    await db.journalLine.deleteMany()
    await db.journalEntry.deleteMany()

    // Invoice items
    await db.salesInvoiceItem.deleteMany()
    await db.purchaseInvoiceItem.deleteMany()
    await db.purchaseRequestItem.deleteMany()
    await db.purchaseOrderItem.deleteMany()

    // Invoices and orders
    await db.salesInvoice.deleteMany()
    await db.purchaseInvoice.deleteMany()
    await db.purchaseOrder.deleteMany()
    await db.purchaseRequest.deleteMany()
    await db.subcontractorInvoice.deleteMany()

    // Progress claims
    await db.progressClaim.deleteMany()

    // Contracts
    await db.contract.deleteMany()

    // BOQ Items
    await db.bOQItem.deleteMany()

    // Costs & expenses
    await db.expense.deleteMany()
    await db.laborCost.deleteMany()
    await db.equipmentCost.deleteMany()
    await db.equipmentUsage.deleteMany()
    await db.equipmentFuelLog.deleteMany()
    await db.equipmentMaintenance.deleteMany()

    // Equipment rentals & expenses (depend on Equipment)
    await db.equipmentRental.deleteMany()
    await db.equipmentExpense.deleteMany()

    // Petty cash & advances
    await db.pettyCash.deleteMany()
    await db.employeeAdvance.deleteMany()

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

    // Currencies
    await db.currency.deleteMany()

    // Branches (last - top level)
    await db.branch.deleteMany()

    // ============ SEED DATA ============

    // 0. Company Settings
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
        invoiceTerms: 'مدة السداد 30 يوماً من تاريخ الفاتورة\nهذه الفاتورة صادرة إلكترونياً\nيرجى ذكر رقم الفاتورة عند التحويل',
      }
    })

    // 1. Branch
    const branch = await db.branch.create({
      data: {
        code: 'BR-001',
        name: 'الفرع الرئيسي',
        address: 'الرياض، حي العليا، طريق الملك فهد',
        isActive: true,
      },
    })

    // 2. Warehouse
    const warehouse = await db.warehouse.create({
      data: {
        code: 'WH-001',
        name: 'المستودع الرئيسي',
        branchId: branch.id,
        isActive: true,
      },
    })

    // 3. Currency
    await db.currency.create({
      data: {
        code: 'SAR',
        name: 'ريال سعودي',
        symbol: 'ر.س',
        rate: 1.0,
        isActive: true,
      },
    })

    // 4. Clients
    const clients = await Promise.all([
      db.client.create({
        data: {
          code: 'CLT-001',
          name: 'شركة المقاولات المتحدة',
          nameAr: 'شركة المقاولات المتحدة',
          contactPerson: 'أحمد محمد العتيبي',
          email: 'info@united-contractors.sa',
          phone: '0112345678',
          address: 'الرياض، حي الملقا',
          taxNumber: '300000000100003',
          isActive: true,
        },
      }),
      db.client.create({
        data: {
          code: 'CLT-002',
          name: 'مؤسسة البناء الحديث',
          nameAr: 'مؤسسة البناء الحديث',
          contactPerson: 'خالد عبدالله الشمري',
          email: 'info@modern-build.sa',
          phone: '0113456789',
          address: 'جدة، حي الحمراء',
          taxNumber: '300000000200003',
          isActive: true,
        },
      }),
      db.client.create({
        data: {
          code: 'CLT-003',
          name: 'شركة التطوير العقاري',
          nameAr: 'شركة التطوير العقاري',
          contactPerson: 'سعود فهد القحطاني',
          email: 'info@realestate-dev.sa',
          phone: '0114567890',
          address: 'الدمام، حي الفيصلية',
          taxNumber: '300000000300003',
          isActive: true,
        },
      }),
      db.client.create({
        data: {
          code: 'CLT-004',
          name: 'وزارة الإسكان',
          nameAr: 'وزارة الإسكان',
          contactPerson: 'م. عبدالرحمن الحربي',
          email: 'projects@moh.sa',
          phone: '0115678901',
          address: 'الرياض، حي الورود',
          taxNumber: '300000000400003',
          isActive: true,
        },
      }),
      db.client.create({
        data: {
          code: 'CLT-005',
          name: 'شركة المشاريع الصناعية',
          nameAr: 'شركة المشاريع الصناعية',
          contactPerson: 'ناصر إبراهيم الدوسري',
          email: 'info@industrial-projects.sa',
          phone: '0116789012',
          address: 'الرياض، المنطقة الصناعية',
          taxNumber: '300000000500003',
          isActive: true,
        },
      }),
    ])

    // 5. Suppliers
    const suppliers = await Promise.all([
      db.supplier.create({
        data: {
          code: 'SUP-001',
          name: 'شركة الحديد الوطنية',
          nameAr: 'شركة الحديد الوطنية',
          contactPerson: 'محمد سعيد الغامدي',
          email: 'sales@national-iron.sa',
          phone: '0117890123',
          address: 'الرياض، المنطقة الصناعية الثانية',
          taxNumber: '300000001000003',
          isActive: true,
        },
      }),
      db.supplier.create({
        data: {
          code: 'SUP-002',
          name: 'مؤسسة الخرسانة الجاهزة',
          nameAr: 'مؤسسة الخرسانة الجاهزة',
          contactPerson: 'عبدالعزيز يوسف',
          email: 'orders@ready-mix.sa',
          phone: '0118901234',
          address: 'الرياض، طريق مكة القديم',
          taxNumber: '300000001100003',
          isActive: true,
        },
      }),
      db.supplier.create({
        data: {
          code: 'SUP-003',
          name: 'شركة مواد البناء المتكاملة',
          nameAr: 'شركة مواد البناء المتكاملة',
          contactPerson: 'فهد عوض العنزي',
          email: 'info@integrated-materials.sa',
          phone: '0119012345',
          address: 'جدة، حي الصفا',
          taxNumber: '300000001200003',
          isActive: true,
        },
      }),
      db.supplier.create({
        data: {
          code: 'SUP-004',
          name: 'مصنع الطوب والإسمنت',
          nameAr: 'مصنع الطوب والإسمنت',
          contactPerson: 'صالح حسن المالكي',
          email: 'sales@brick-cement.sa',
          phone: '0120123456',
          address: 'الدمام، المنطقة الصناعية',
          taxNumber: '300000001300003',
          isActive: true,
        },
      }),
      db.supplier.create({
        data: {
          code: 'SUP-005',
          name: 'شركة المعدات الثقيلة',
          nameAr: 'شركة المعدات الثقيلة',
          contactPerson: 'تركي مشعل السبيعي',
          email: 'rental@heavy-equip.sa',
          phone: '0121234567',
          address: 'الرياض، طريق الخرج',
          taxNumber: '300000001400003',
          isActive: true,
        },
      }),
    ])

    // 6. Subcontractors
    const subcontractors = await Promise.all([
      db.subcontractor.create({
        data: {
          code: 'SUB-001',
          name: 'مؤسسة السباكة الحديثة',
          nameAr: 'مؤسسة السباكة الحديثة',
          specialty: 'سباكة',
          contactPerson: 'عمر أحمد',
          email: 'info@modern-plumbing.sa',
          phone: '0122345678',
          address: 'الرياض، حي النسيم',
          taxNumber: '300000002000003',
          isActive: true,
        },
      }),
      db.subcontractor.create({
        data: {
          code: 'SUB-002',
          name: 'شركة الكهرباء والإنارة',
          nameAr: 'شركة الكهرباء والإنارة',
          specialty: 'كهرباء',
          contactPerson: 'ماجد سلطان',
          email: 'info@elec-lighting.sa',
          phone: '0123456789',
          address: 'الرياض، حي الروضة',
          taxNumber: '300000002100003',
          isActive: true,
        },
      }),
      db.subcontractor.create({
        data: {
          code: 'SUB-003',
          name: 'مؤسسة الجبس والديكور',
          nameAr: 'مؤسسة الجبس والديكور',
          specialty: 'جبس',
          contactPerson: 'ياسر حمد',
          email: 'info@gypsum-decor.sa',
          phone: '0124567890',
          address: 'جدة، حي النزهة',
          taxNumber: '300000002200003',
          isActive: true,
        },
      }),
      db.subcontractor.create({
        data: {
          code: 'SUB-004',
          name: 'شركة الدهان والتشطيبات',
          nameAr: 'شركة الدهان والتشطيبات',
          specialty: 'دهان',
          contactPerson: 'بدر عادل',
          email: 'info@painting-finishing.sa',
          phone: '0125678901',
          address: 'الدمام، حي الشاطئ',
          taxNumber: '300000002300003',
          isActive: true,
        },
      }),
    ])

    // 7. Employees
    const employees = await Promise.all([
      db.employee.create({
        data: {
          code: 'EMP-001',
          name: 'م. عبدالله خالد العتيبي',
          nameAr: 'م. عبدالله خالد العتيبي',
          position: 'مهندس مشروع',
          branchId: branch.id,
          phone: '0551234567',
          email: 'a.otibi@erp.sa',
          isActive: true,
        },
      }),
      db.employee.create({
        data: {
          code: 'EMP-002',
          name: 'فهد محمد الشمري',
          nameAr: 'فهد محمد الشمري',
          position: 'مراقب موقع',
          branchId: branch.id,
          phone: '0552345678',
          email: 'f.shamri@erp.sa',
          isActive: true,
        },
      }),
      db.employee.create({
        data: {
          code: 'EMP-003',
          name: 'سعد ناصر القحطاني',
          nameAr: 'سعد ناصر القحطاني',
          position: 'محاسب',
          branchId: branch.id,
          phone: '0553456789',
          email: 's.qahtani@erp.sa',
          isActive: true,
        },
      }),
      db.employee.create({
        data: {
          code: 'EMP-004',
          name: 'محمد إبراهيم الحربي',
          nameAr: 'محمد إبراهيم الحربي',
          position: 'مسؤول مشتريات',
          branchId: branch.id,
          phone: '0554567890',
          email: 'm.harbi@erp.sa',
          isActive: true,
        },
      }),
      db.employee.create({
        data: {
          code: 'EMP-005',
          name: 'يوسف عبدالرحمن الدوسري',
          nameAr: 'يوسف عبدالرحمن الدوسري',
          position: 'مهندس مدني',
          branchId: branch.id,
          phone: '0555678901',
          email: 'y.dosari@erp.sa',
          isActive: true,
        },
      }),
    ])

    // 8. Projects
    const projects = await Promise.all([
      db.project.create({
        data: {
          code: 'PRJ-001',
          name: 'مشروع بناء مجمع سكني بالملقا',
          nameAr: 'مشروع بناء مجمع سكني بالملقا',
          location: 'الرياض - حي الملقا',
          branchId: branch.id,
          clientId: clients[0].id,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2025-06-30'),
          status: 'ACTIVE',
          description: 'بناء مجمع سكني يتكون من 5 أبراج سكنية بمساحة إجمالية 25,000 م²',
        },
      }),
      db.project.create({
        data: {
          code: 'PRJ-002',
          name: 'مشروع إنشاء مدرسة بحي النسيم',
          nameAr: 'مشروع إنشاء مدرسة بحي النسيم',
          location: 'الرياض - حي النسيم',
          branchId: branch.id,
          clientId: clients[3].id,
          startDate: new Date('2024-06-15'),
          endDate: new Date('2025-03-31'),
          status: 'ACTIVE',
          description: 'إنشاء مدرسة ابتدائية ومتوسطة للبنين بمساحة 8,000 م²',
        },
      }),
      db.project.create({
        data: {
          code: 'PRJ-003',
          name: 'مشروع تشطيب فيلا بحي الورود',
          nameAr: 'مشروع تشطيب فيلا بحي الورود',
          location: 'الرياض - حي الورود',
          branchId: branch.id,
          clientId: clients[1].id,
          startDate: new Date('2024-09-01'),
          endDate: new Date('2025-01-31'),
          status: 'COMPLETED',
          description: 'تشطيب فيلا فاخرة بمساحة 1,200 م² تشمل أعمال السباكة والكهرباء والديكور',
        },
      }),
    ])

    // 9. Contracts
    const contracts = await Promise.all([
      db.contract.create({
        data: {
          projectId: projects[0].id,
          contractNo: 'CNT-2024-001',
          date: new Date('2024-03-01'),
          value: 4500000,
          vatRate: 0.15,
          vatAmount: 675000,
          totalValue: 5175000,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2025-06-30'),
          status: 'ACTIVE',
          description: 'عقد إنشاء مجمع سكني بالملقا - القيمة الإجمالية 4,500,000 ر.س',
        },
      }),
      db.contract.create({
        data: {
          projectId: projects[1].id,
          contractNo: 'CNT-2024-002',
          date: new Date('2024-06-15'),
          value: 2800000,
          vatRate: 0.15,
          vatAmount: 420000,
          totalValue: 3220000,
          startDate: new Date('2024-06-15'),
          endDate: new Date('2025-03-31'),
          status: 'ACTIVE',
          description: 'عقد إنشاء مدرسة بحي النسيم - القيمة الإجمالية 2,800,000 ر.س',
        },
      }),
      db.contract.create({
        data: {
          projectId: projects[2].id,
          contractNo: 'CNT-2024-003',
          date: new Date('2024-09-01'),
          value: 950000,
          vatRate: 0.15,
          vatAmount: 142500,
          totalValue: 1092500,
          startDate: new Date('2024-09-01'),
          endDate: new Date('2025-01-31'),
          status: 'ACTIVE',
          description: 'عقد تشطيب فيلا بحي الورود - القيمة الإجمالية 950,000 ر.س',
        },
      }),
    ])

    // 10. BOQ Items for each project
    // Project 1 - Residential Complex
    await Promise.all([
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-001', description: 'أعمال الحفر والتسوية', unit: 'م²', quantity: 25000, unitPrice: 35, totalPrice: 875000, category: 'أعمال ترابية' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-002', description: 'خرسانة عادية قواعد', unit: 'م³', quantity: 1200, unitPrice: 450, totalPrice: 540000, category: 'أعمال خرسانية' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-003', description: 'خرسانة مسلحة أعمدة', unit: 'م³', quantity: 800, unitPrice: 850, totalPrice: 680000, category: 'أعمال خرسانية' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-004', description: 'حديد تسليح', unit: 'طن', quantity: 350, unitPrice: 4200, totalPrice: 1470000, category: 'مواد هيكلية' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-005', description: 'بلوك خرساني 20 سم', unit: 'م²', quantity: 15000, unitPrice: 65, totalPrice: 975000, category: 'أعمال بناء' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-006', description: 'أعمال العزل المائي', unit: 'م²', quantity: 5000, unitPrice: 45, totalPrice: 225000, category: 'أعمال عزل' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-007', description: 'أعمال السباكة', unit: 'م²', quantity: 25000, unitPrice: 55, totalPrice: 1375000, category: 'أعمال صحية' } }),
      db.bOQItem.create({ data: { projectId: projects[0].id, code: 'BOQ1-008', description: 'أعمال الكهرباء', unit: 'م²', quantity: 25000, unitPrice: 75, totalPrice: 1875000, category: 'أعمال كهربائية' } }),
    ])

    // Project 2 - School
    await Promise.all([
      db.bOQItem.create({ data: { projectId: projects[1].id, code: 'BOQ2-001', description: 'أعمال الحفر', unit: 'م²', quantity: 8000, unitPrice: 30, totalPrice: 240000, category: 'أعمال ترابية' } }),
      db.bOQItem.create({ data: { projectId: projects[1].id, code: 'BOQ2-002', description: 'خرسانة عادية', unit: 'م³', quantity: 450, unitPrice: 450, totalPrice: 202500, category: 'أعمال خرسانية' } }),
      db.bOQItem.create({ data: { projectId: projects[1].id, code: 'BOQ2-003', description: 'خرسانة مسلحة', unit: 'م³', quantity: 600, unitPrice: 850, totalPrice: 510000, category: 'أعمال خرسانية' } }),
      db.bOQItem.create({ data: { projectId: projects[1].id, code: 'BOQ2-004', description: 'حديد تسليح', unit: 'طن', quantity: 180, unitPrice: 4200, totalPrice: 756000, category: 'مواد هيكلية' } }),
      db.bOQItem.create({ data: { projectId: projects[1].id, code: 'BOQ2-005', description: 'بلوك خرساني', unit: 'م²', quantity: 6000, unitPrice: 65, totalPrice: 390000, category: 'أعمال بناء' } }),
      db.bOQItem.create({ data: { projectId: projects[1].id, code: 'BOQ2-006', description: 'أعمال السباكة', unit: 'م²', quantity: 8000, unitPrice: 50, totalPrice: 400000, category: 'أعمال صحية' } }),
      db.bOQItem.create({ data: { projectId: projects[1].id, code: 'BOQ2-007', description: 'أعمال الكهرباء', unit: 'م²', quantity: 8000, unitPrice: 70, totalPrice: 560000, category: 'أعمال كهربائية' } }),
    ])

    // Project 3 - Villa
    await Promise.all([
      db.bOQItem.create({ data: { projectId: projects[2].id, code: 'BOQ3-001', description: 'أعمال الجبس والديكور', unit: 'م²', quantity: 3500, unitPrice: 85, totalPrice: 297500, category: 'أعمال تشطيب' } }),
      db.bOQItem.create({ data: { projectId: projects[2].id, code: 'BOQ3-002', description: 'أعمال الدهان', unit: 'م²', quantity: 4500, unitPrice: 35, totalPrice: 157500, category: 'أعمال تشطيب' } }),
      db.bOQItem.create({ data: { projectId: projects[2].id, code: 'BOQ3-003', description: 'أعمال السباكة', unit: 'م²', quantity: 1200, unitPrice: 60, totalPrice: 72000, category: 'أعمال صحية' } }),
      db.bOQItem.create({ data: { projectId: projects[2].id, code: 'BOQ3-004', description: 'أعمال الكهرباء', unit: 'م²', quantity: 1200, unitPrice: 80, totalPrice: 96000, category: 'أعمال كهربائية' } }),
      db.bOQItem.create({ data: { projectId: projects[2].id, code: 'BOQ3-005', description: 'أرضيات رخام وسيراميك', unit: 'م²', quantity: 1200, unitPrice: 180, totalPrice: 216000, category: 'أعمال تشطيب' } }),
      db.bOQItem.create({ data: { projectId: projects[2].id, code: 'BOQ3-006', description: 'أعمال النجارة والأبواب', unit: 'عدد', quantity: 45, unitPrice: 3500, totalPrice: 157500, category: 'أعمال تشطيب' } }),
    ])

    // 11. Progress Claims
    // Project 1 - 5 claims
    await Promise.all([
      db.progressClaim.create({ data: { projectId: projects[0].id, contractId: contracts[0].id, claimNo: 'CLM-001-01', date: new Date('2024-04-30'), percentage: 10, amount: 450000, vatRate: 0.15, vatAmount: 67500, totalAmount: 517500, status: 'PAID', approvedDate: new Date('2024-05-15'), notes: 'المستخلص الأول - أعمال الحفر' } }),
      db.progressClaim.create({ data: { projectId: projects[0].id, contractId: contracts[0].id, claimNo: 'CLM-001-02', date: new Date('2024-06-30'), percentage: 15, amount: 675000, vatRate: 0.15, vatAmount: 101250, totalAmount: 776250, status: 'PAID', approvedDate: new Date('2024-07-15'), notes: 'المستخلص الثاني - القواعد' } }),
      db.progressClaim.create({ data: { projectId: projects[0].id, contractId: contracts[0].id, claimNo: 'CLM-001-03', date: new Date('2024-08-31'), percentage: 20, amount: 900000, vatRate: 0.15, vatAmount: 135000, totalAmount: 1035000, status: 'PARTIALLY_PAID', approvedDate: new Date('2024-09-10'), notes: 'المستخلص الثالث - الهيكل الخرساني' } }),
      db.progressClaim.create({ data: { projectId: projects[0].id, contractId: contracts[0].id, claimNo: 'CLM-001-04', date: new Date('2024-10-31'), percentage: 15, amount: 675000, vatRate: 0.15, vatAmount: 101250, totalAmount: 776250, status: 'APPROVED', approvedDate: new Date('2024-11-15'), notes: 'المستخلص الرابع - البلوك' } }),
      db.progressClaim.create({ data: { projectId: projects[0].id, contractId: contracts[0].id, claimNo: 'CLM-001-05', date: new Date('2024-12-31'), percentage: 10, amount: 450000, vatRate: 0.15, vatAmount: 67500, totalAmount: 517500, status: 'SUBMITTED', notes: 'المستخلص الخامس - السباكة والكهرباء' } }),
    ])

    // Project 2 - 3 claims
    await Promise.all([
      db.progressClaim.create({ data: { projectId: projects[1].id, contractId: contracts[1].id, claimNo: 'CLM-002-01', date: new Date('2024-08-15'), percentage: 15, amount: 420000, vatRate: 0.15, vatAmount: 63000, totalAmount: 483000, status: 'PAID', approvedDate: new Date('2024-09-01'), notes: 'المستخلص الأول' } }),
      db.progressClaim.create({ data: { projectId: projects[1].id, contractId: contracts[1].id, claimNo: 'CLM-002-02', date: new Date('2024-10-15'), percentage: 20, amount: 560000, vatRate: 0.15, vatAmount: 84000, totalAmount: 644000, status: 'PARTIALLY_PAID', approvedDate: new Date('2024-11-01'), notes: 'المستخلص الثاني' } }),
      db.progressClaim.create({ data: { projectId: projects[1].id, contractId: contracts[1].id, claimNo: 'CLM-002-03', date: new Date('2024-12-15'), percentage: 25, amount: 700000, vatRate: 0.15, vatAmount: 105000, totalAmount: 805000, status: 'SUBMITTED', notes: 'المستخلص الثالث' } }),
    ])

    // Project 3 - 4 claims (completed)
    await Promise.all([
      db.progressClaim.create({ data: { projectId: projects[2].id, contractId: contracts[2].id, claimNo: 'CLM-003-01', date: new Date('2024-10-15'), percentage: 25, amount: 237500, vatRate: 0.15, vatAmount: 35625, totalAmount: 273125, status: 'PAID', approvedDate: new Date('2024-10-30'), notes: 'المستخلص الأول' } }),
      db.progressClaim.create({ data: { projectId: projects[2].id, contractId: contracts[2].id, claimNo: 'CLM-003-02', date: new Date('2024-11-15'), percentage: 25, amount: 237500, vatRate: 0.15, vatAmount: 35625, totalAmount: 273125, status: 'PAID', approvedDate: new Date('2024-12-01'), notes: 'المستخلص الثاني' } }),
      db.progressClaim.create({ data: { projectId: projects[2].id, contractId: contracts[2].id, claimNo: 'CLM-003-03', date: new Date('2024-12-15'), percentage: 30, amount: 285000, vatRate: 0.15, vatAmount: 42750, totalAmount: 327750, status: 'PAID', approvedDate: new Date('2024-12-30'), notes: 'المستخلص الثالث' } }),
      db.progressClaim.create({ data: { projectId: projects[2].id, contractId: contracts[2].id, claimNo: 'CLM-003-04', date: new Date('2025-01-15'), percentage: 20, amount: 190000, vatRate: 0.15, vatAmount: 28500, totalAmount: 218500, status: 'APPROVED', approvedDate: new Date('2025-01-31'), notes: 'المستخلص الأخير' } }),
    ])

    // 12. Sales Invoices (updated with new fields)
    const salesInvoices = await Promise.all([
      db.salesInvoice.create({
        data: {
          invoiceNo: 'INV-2024-001',
          projectId: projects[0].id,
          contractId: contracts[0].id,
          clientId: clients[0].id,
          date: new Date('2024-05-01'),
          dueDate: new Date('2024-06-01'),
          subtotal: 450000,
          discountRate: 0,
          discountAmount: 0,
          netAmount: 450000,
          vatRate: 0.15,
          vatAmount: 67500,
          totalAmount: 517500,
          paidAmount: 517500,
          status: 'PAID',
          invoiceType: 'TAX_INVOICE',
          paymentTerms: '30 days',
          notes: 'فاتورة المستخلص الأول - مجمع الملقا',
          items: {
            create: [
              { description: 'أعمال الحفر والتسوية - مستخلص 1', quantity: 25000, unit: 'م²', unitPrice: 18, totalPrice: 450000, itemType: 'SERVICE' },
            ]
          }
        },
      }),
      db.salesInvoice.create({
        data: {
          invoiceNo: 'INV-2024-002',
          projectId: projects[0].id,
          contractId: contracts[0].id,
          clientId: clients[0].id,
          date: new Date('2024-07-01'),
          dueDate: new Date('2024-08-01'),
          subtotal: 675000,
          discountRate: 0,
          discountAmount: 0,
          netAmount: 675000,
          vatRate: 0.15,
          vatAmount: 101250,
          totalAmount: 776250,
          paidAmount: 776250,
          status: 'PAID',
          invoiceType: 'TAX_INVOICE',
          paymentTerms: '30 days',
          notes: 'فاتورة المستخلص الثاني - مجمع الملقا',
          items: {
            create: [
              { description: 'أعمال القواعد الخرسانية - مستخلص 2', quantity: 1, unit: 'مقطوعية', unitPrice: 675000, totalPrice: 675000, itemType: 'SERVICE' },
            ]
          }
        },
      }),
      db.salesInvoice.create({
        data: {
          invoiceNo: 'INV-2024-003',
          projectId: projects[1].id,
          contractId: contracts[1].id,
          clientId: clients[3].id,
          date: new Date('2024-09-01'),
          dueDate: new Date('2024-10-01'),
          subtotal: 420000,
          discountRate: 0,
          discountAmount: 0,
          netAmount: 420000,
          vatRate: 0.15,
          vatAmount: 63000,
          totalAmount: 483000,
          paidAmount: 483000,
          status: 'PAID',
          invoiceType: 'TAX_INVOICE',
          paymentTerms: '30 days',
          notes: 'فاتورة المستخلص الأول - مدرسة النسيم',
          items: {
            create: [
              { description: 'أعمال الحفر والأساسات - مستخلص 1', quantity: 1, unit: 'مقطوعية', unitPrice: 420000, totalPrice: 420000, itemType: 'SERVICE' },
            ]
          }
        },
      }),
      db.salesInvoice.create({
        data: {
          invoiceNo: 'INV-2024-004',
          projectId: projects[0].id,
          contractId: contracts[0].id,
          clientId: clients[0].id,
          date: new Date('2024-09-15'),
          dueDate: new Date('2024-10-15'),
          subtotal: 900000,
          discountRate: 0,
          discountAmount: 0,
          netAmount: 900000,
          vatRate: 0.15,
          vatAmount: 135000,
          totalAmount: 1035000,
          paidAmount: 500000,
          status: 'PARTIALLY_PAID',
          invoiceType: 'TAX_INVOICE',
          paymentTerms: '30 days',
          notes: 'فاتورة المستخلص الثالث - مجمع الملقا',
          items: {
            create: [
              { description: 'أعمال الهيكل الخرساني - مستخلص 3', quantity: 1, unit: 'مقطوعية', unitPrice: 900000, totalPrice: 900000, itemType: 'SERVICE' },
            ]
          }
        },
      }),
      db.salesInvoice.create({
        data: {
          invoiceNo: 'INV-2024-005',
          projectId: projects[2].id,
          contractId: contracts[2].id,
          clientId: clients[1].id,
          date: new Date('2024-11-01'),
          dueDate: new Date('2024-12-01'),
          subtotal: 475000,
          discountRate: 0,
          discountAmount: 0,
          netAmount: 475000,
          vatRate: 0.15,
          vatAmount: 71250,
          totalAmount: 546250,
          paidAmount: 546250,
          status: 'PAID',
          invoiceType: 'TAX_INVOICE',
          paymentTerms: '30 days',
          notes: 'فاتورة المستخلصين الأول والثاني - فيلا الورود',
          items: {
            create: [
              { description: 'أعمال التشطيب - مستخلصات 1 و2', quantity: 1, unit: 'مقطوعية', unitPrice: 475000, totalPrice: 475000, itemType: 'SERVICE' },
            ]
          }
        },
      }),
      db.salesInvoice.create({
        data: {
          invoiceNo: 'INV-2024-006',
          projectId: projects[0].id,
          contractId: contracts[0].id,
          clientId: clients[0].id,
          date: new Date('2024-11-15'),
          dueDate: new Date('2024-12-15'),
          subtotal: 675000,
          discountRate: 0,
          discountAmount: 0,
          netAmount: 675000,
          vatRate: 0.15,
          vatAmount: 101250,
          totalAmount: 776250,
          paidAmount: 0,
          status: 'SENT',
          invoiceType: 'TAX_INVOICE',
          paymentTerms: '30 days',
          notes: 'فاتورة المستخلص الرابع - مجمع الملقا',
          items: {
            create: [
              { description: 'أعمال البلوك - مستخلص 4', quantity: 1, unit: 'مقطوعية', unitPrice: 675000, totalPrice: 675000, itemType: 'SERVICE' },
            ]
          }
        },
      }),
    ])

    // 13. Purchase Orders
    const purchaseOrders = await Promise.all([
      db.purchaseOrder.create({
        data: {
          orderNo: 'PO-2024-001',
          projectId: projects[0].id,
          supplierId: suppliers[0].id,
          date: new Date('2024-03-15'),
          deliveryDate: new Date('2024-04-01'),
          subtotal: 630000,
          vatRate: 0.15,
          vatAmount: 94500,
          totalAmount: 724500,
          paidAmount: 724500,
          status: 'RECEIVED',
          notes: 'أمر شراء حديد تسليح - مشروع الملقا',
          items: {
            create: [
              { description: 'حديد تسليح قطر 12 مم', quantity: 100, unit: 'طن', unitPrice: 4200, totalPrice: 420000 },
              { description: 'حديد تسليح قطر 16 مم', quantity: 50, unit: 'طن', unitPrice: 4200, totalPrice: 210000 },
            ]
          }
        },
      }),
      db.purchaseOrder.create({
        data: {
          orderNo: 'PO-2024-002',
          projectId: projects[0].id,
          supplierId: suppliers[1].id,
          date: new Date('2024-03-20'),
          deliveryDate: new Date('2024-04-15'),
          subtotal: 540000,
          vatRate: 0.15,
          vatAmount: 81000,
          totalAmount: 621000,
          paidAmount: 621000,
          status: 'RECEIVED',
          notes: 'أمر شراء خرسانة جاهزة - مشروع الملقا',
          items: {
            create: [
              { description: 'خرسانة جاهزة عيار 300', quantity: 600, unit: 'م³', unitPrice: 450, totalPrice: 270000 },
              { description: 'خرسانة جاهزة عيار 400', quantity: 600, unit: 'م³', unitPrice: 450, totalPrice: 270000 },
            ]
          }
        },
      }),
      db.purchaseOrder.create({
        data: {
          orderNo: 'PO-2024-003',
          projectId: projects[1].id,
          supplierId: suppliers[3].id,
          date: new Date('2024-07-01'),
          deliveryDate: new Date('2024-07-20'),
          subtotal: 351000,
          vatRate: 0.15,
          vatAmount: 52650,
          totalAmount: 403650,
          paidAmount: 403650,
          status: 'RECEIVED',
          notes: 'أمر شراء بلوك وإسمنت - مدرسة النسيم',
          items: {
            create: [
              { description: 'بلوك خرساني 20 سم', quantity: 3000, unit: 'م²', unitPrice: 65, totalPrice: 195000 },
              { description: 'إسمنت بورتلاندي', quantity: 520, unit: 'كيس', unitPrice: 300, totalPrice: 156000 },
            ]
          }
        },
      }),
      db.purchaseOrder.create({
        data: {
          orderNo: 'PO-2024-004',
          projectId: projects[0].id,
          supplierId: suppliers[2].id,
          date: new Date('2024-08-01'),
          deliveryDate: new Date('2024-08-20'),
          subtotal: 225000,
          vatRate: 0.15,
          vatAmount: 33750,
          totalAmount: 258750,
          paidAmount: 100000,
          status: 'PARTIALLY_RECEIVED',
          notes: 'أمر شراء مواد العزل - مشروع الملقا',
          items: {
            create: [
              { description: 'مادة عزل مائي', quantity: 5000, unit: 'م²', unitPrice: 45, totalPrice: 225000 },
            ]
          }
        },
      }),
      db.purchaseOrder.create({
        data: {
          orderNo: 'PO-2024-005',
          projectId: projects[2].id,
          supplierId: suppliers[2].id,
          date: new Date('2024-09-15'),
          deliveryDate: new Date('2024-10-01'),
          subtotal: 180000,
          vatRate: 0.15,
          vatAmount: 27000,
          totalAmount: 207000,
          paidAmount: 207000,
          status: 'RECEIVED',
          notes: 'أمر شراء مواد تشطيب - فيلا الورود',
          items: {
            create: [
              { description: 'رخام إيطالي', quantity: 500, unit: 'م²', unitPrice: 200, totalPrice: 100000 },
              { description: 'سيراميك أرضيات', quantity: 700, unit: 'م²', unitPrice: 80, totalPrice: 56000 },
              { description: 'ألواح جبس', quantity: 3500, unit: 'م²', unitPrice: 25, totalPrice: 87500 },
            ]
          }
        },
      }),
    ])

    // Purchase Invoices
    await Promise.all([
      db.purchaseInvoice.create({
        data: {
          invoiceNo: 'PI-2024-001',
          purchaseOrderId: purchaseOrders[0].id,
          supplierId: suppliers[0].id,
          date: new Date('2024-04-01'),
          dueDate: new Date('2024-05-01'),
          subtotal: 630000,
          vatRate: 0.15,
          vatAmount: 94500,
          totalAmount: 724500,
          paidAmount: 724500,
          status: 'PAID',
          items: {
            create: [
              { description: 'حديد تسليح قطر 12 مم', quantity: 100, unitPrice: 4200, totalPrice: 420000 },
              { description: 'حديد تسليح قطر 16 مم', quantity: 50, unitPrice: 4200, totalPrice: 210000 },
            ]
          }
        },
      }),
      db.purchaseInvoice.create({
        data: {
          invoiceNo: 'PI-2024-002',
          purchaseOrderId: purchaseOrders[1].id,
          supplierId: suppliers[1].id,
          date: new Date('2024-04-15'),
          dueDate: new Date('2024-05-15'),
          subtotal: 540000,
          vatRate: 0.15,
          vatAmount: 81000,
          totalAmount: 621000,
          paidAmount: 621000,
          status: 'PAID',
          items: {
            create: [
              { description: 'خرسانة جاهزة عيار 300', quantity: 600, unitPrice: 450, totalPrice: 270000 },
              { description: 'خرسانة جاهزة عيار 400', quantity: 600, unitPrice: 450, totalPrice: 270000 },
            ]
          }
        },
      }),
      db.purchaseInvoice.create({
        data: {
          invoiceNo: 'PI-2024-003',
          purchaseOrderId: purchaseOrders[2].id,
          supplierId: suppliers[3].id,
          date: new Date('2024-07-20'),
          dueDate: new Date('2024-08-20'),
          subtotal: 351000,
          vatRate: 0.15,
          vatAmount: 52650,
          totalAmount: 403650,
          paidAmount: 403650,
          status: 'PAID',
          items: {
            create: [
              { description: 'بلوك خرساني 20 سم', quantity: 3000, unitPrice: 65, totalPrice: 195000 },
              { description: 'إسمنت بورتلاندي', quantity: 520, unitPrice: 300, totalPrice: 156000 },
            ]
          }
        },
      }),
      db.purchaseInvoice.create({
        data: {
          invoiceNo: 'PI-2024-004',
          purchaseOrderId: purchaseOrders[3].id,
          supplierId: suppliers[2].id,
          date: new Date('2024-08-20'),
          dueDate: new Date('2024-09-20'),
          subtotal: 225000,
          vatRate: 0.15,
          vatAmount: 33750,
          totalAmount: 258750,
          paidAmount: 100000,
          status: 'PARTIALLY_PAID',
          items: {
            create: [
              { description: 'مادة عزل مائي', quantity: 5000, unitPrice: 45, totalPrice: 225000 },
            ]
          }
        },
      }),
      db.purchaseInvoice.create({
        data: {
          invoiceNo: 'PI-2024-005',
          purchaseOrderId: purchaseOrders[4].id,
          supplierId: suppliers[2].id,
          date: new Date('2024-10-01'),
          dueDate: new Date('2024-11-01'),
          subtotal: 180000,
          vatRate: 0.15,
          vatAmount: 27000,
          totalAmount: 207000,
          paidAmount: 0,
          status: 'OVERDUE',
          items: {
            create: [
              { description: 'مواد تشطيب متنوعة', quantity: 1, unitPrice: 180000, totalPrice: 180000 },
            ]
          }
        },
      }),
    ])

    // 14. Subcontractor Invoices
    await Promise.all([
      db.subcontractorInvoice.create({
        data: {
          subcontractorId: subcontractors[0].id,
          projectId: projects[0].id,
          invoiceNo: 'SCI-2024-001',
          date: new Date('2024-08-15'),
          amount: 350000,
          vatRate: 0.15,
          vatAmount: 52500,
          totalAmount: 402500,
          paidAmount: 402500,
          status: 'PAID',
          description: 'أعمال السباكة - المرحلة الأولى - مجمع الملقا',
        },
      }),
      db.subcontractorInvoice.create({
        data: {
          subcontractorId: subcontractors[1].id,
          projectId: projects[0].id,
          invoiceNo: 'SCI-2024-002',
          date: new Date('2024-09-15'),
          amount: 450000,
          vatRate: 0.15,
          vatAmount: 67500,
          totalAmount: 517500,
          paidAmount: 300000,
          status: 'PARTIALLY_PAID',
          description: 'أعمال الكهرباء - المرحلة الأولى - مجمع الملقا',
        },
      }),
      db.subcontractorInvoice.create({
        data: {
          subcontractorId: subcontractors[2].id,
          projectId: projects[2].id,
          invoiceNo: 'SCI-2024-003',
          date: new Date('2024-10-15'),
          amount: 180000,
          vatRate: 0.15,
          vatAmount: 27000,
          totalAmount: 207000,
          paidAmount: 207000,
          status: 'PAID',
          description: 'أعمال الجبس والديكور - فيلا الورود',
        },
      }),
      db.subcontractorInvoice.create({
        data: {
          subcontractorId: subcontractors[3].id,
          projectId: projects[2].id,
          invoiceNo: 'SCI-2024-004',
          date: new Date('2024-11-15'),
          amount: 120000,
          vatRate: 0.15,
          vatAmount: 18000,
          totalAmount: 138000,
          paidAmount: 0,
          status: 'SENT',
          description: 'أعمال الدهان والتشطيبات - فيلا الورود',
        },
      }),
    ])

    // 15. Expenses per project (using ExpenseCategory enum)
    await Promise.all([
      // Project 1 expenses
      db.expense.create({ data: { projectId: projects[0].id, category: 'CONSUMABLES', description: 'مواد لاصقة ومكملات', amount: 45000, vatAmount: 6750, date: new Date('2024-05-10'), reference: 'EXP-001' } }),
      db.expense.create({ data: { projectId: projects[0].id, category: 'TRANSPORT', description: 'نقل مواد من المستودع للموقع', amount: 15000, vatAmount: 2250, date: new Date('2024-06-15'), reference: 'EXP-002' } }),
      db.expense.create({ data: { projectId: projects[0].id, category: 'RENT', description: 'إيجار سكن عمال', amount: 36000, vatAmount: 5400, date: new Date('2024-07-01'), reference: 'EXP-003' } }),
      db.expense.create({ data: { projectId: projects[0].id, category: 'MAINTENANCE', description: 'صيانة معدات الموقع', amount: 12000, vatAmount: 1800, date: new Date('2024-08-20'), reference: 'EXP-004' } }),
      // Project 2 expenses
      db.expense.create({ data: { projectId: projects[1].id, category: 'CONSUMABLES', description: 'مواد تكسية خارجية', amount: 28000, vatAmount: 4200, date: new Date('2024-08-01'), reference: 'EXP-005' } }),
      db.expense.create({ data: { projectId: projects[1].id, category: 'TRANSPORT', description: 'نقل رمال وأحجار', amount: 8000, vatAmount: 1200, date: new Date('2024-09-10'), reference: 'EXP-006' } }),
      // Project 3 expenses
      db.expense.create({ data: { projectId: projects[2].id, category: 'CONSUMABLES', description: 'مستلزمات تشطيب متنوعة', amount: 22000, vatAmount: 3300, date: new Date('2024-10-05'), reference: 'EXP-007' } }),
      // General expenses (no project)
      db.expense.create({ data: { projectId: null, category: 'OFFICE', description: 'مستلزمات مكتبية وقرطاسية', amount: 3500, vatAmount: 525, date: new Date('2024-04-15'), reference: 'EXP-008' } }),
      db.expense.create({ data: { projectId: null, category: 'INSURANCE', description: 'تأمين شامل على المعدات', amount: 18000, vatAmount: 2700, date: new Date('2024-01-01'), reference: 'EXP-009' } }),
      db.expense.create({ data: { projectId: null, category: 'HOSPITALITY', description: 'ضيافة اجتماع المقاولين', amount: 5500, vatAmount: 825, date: new Date('2024-07-20'), reference: 'EXP-010' } }),
    ])

    // 16. Labor Costs
    await Promise.all([
      db.laborCost.create({ data: { projectId: projects[0].id, description: 'عمال بناء - أعمال خرسانة', workers: 30, days: 25, dailyRate: 180, totalAmount: 135000, date: new Date('2024-05-01') } }),
      db.laborCost.create({ data: { projectId: projects[0].id, description: 'عمال بناء - أعمال بلوك', workers: 20, days: 30, dailyRate: 170, totalAmount: 102000, date: new Date('2024-08-01') } }),
      db.laborCost.create({ data: { projectId: projects[0].id, description: 'عمال عامة - تنظيف ومساعدة', workers: 10, days: 20, dailyRate: 150, totalAmount: 30000, date: new Date('2024-10-01') } }),
      db.laborCost.create({ data: { projectId: projects[1].id, description: 'عمال بناء - أساسات', workers: 25, days: 20, dailyRate: 180, totalAmount: 90000, date: new Date('2024-08-01') } }),
      db.laborCost.create({ data: { projectId: projects[1].id, description: 'عمال سباكة وكهرباء', workers: 8, days: 15, dailyRate: 200, totalAmount: 24000, date: new Date('2024-11-01') } }),
      db.laborCost.create({ data: { projectId: projects[2].id, description: 'عمال تشطيب - جبس ودهان', workers: 12, days: 30, dailyRate: 200, totalAmount: 72000, date: new Date('2024-10-01') } }),
    ])

    // 17. Equipment (updated with new fields)
    const equipmentItems = await Promise.all([
      db.equipment.create({
        data: {
          code: 'EQ-001',
          name: 'حفارة كاتربيلر 320',
          nameAr: 'حفارة كاتربيلر 320',
          type: 'حفارة',
          model: 'CAT 320',
          serialNumber: 'CAT320-2022-001',
          status: 'IN_USE',
          supplierId: suppliers[4].id,
          purchasePrice: 1200000,
          sellingPrice: 0,
          hourlyRate: 350,
          dailyRate: 2800,
          monthlyRate: 55000,
          purchaseDate: new Date('2022-01-15'),
          warrantyExpiry: new Date('2024-01-15'),
          isActive: true,
        },
      }),
      db.equipment.create({
        data: {
          code: 'EQ-002',
          name: 'شيول كوماتسو',
          nameAr: 'شيول كوماتسو',
          type: 'شيول',
          model: 'KOMATSU PC200',
          serialNumber: 'KOM-2023-001',
          status: 'IN_USE',
          supplierId: suppliers[4].id,
          purchasePrice: 950000,
          sellingPrice: 0,
          hourlyRate: 300,
          dailyRate: 2400,
          monthlyRate: 48000,
          purchaseDate: new Date('2023-03-20'),
          isActive: true,
        },
      }),
      db.equipment.create({
        data: {
          code: 'EQ-003',
          name: 'كرين برجي Liebherr',
          nameAr: 'كرين برجي Liebherr',
          type: 'كرين',
          model: 'LIEBHERR 150EC-B',
          serialNumber: 'LIE-2021-003',
          status: 'IN_USE',
          supplierId: suppliers[4].id,
          purchasePrice: 2800000,
          sellingPrice: 0,
          hourlyRate: 500,
          dailyRate: 4000,
          monthlyRate: 85000,
          purchaseDate: new Date('2021-06-10'),
          warrantyExpiry: new Date('2023-06-10'),
          isActive: true,
        },
      }),
      db.equipment.create({
        data: {
          code: 'EQ-004',
          name: 'قلاب فولفو',
          nameAr: 'قلاب فولفو',
          type: 'قلاب',
          model: 'VOLVO FMX 500',
          serialNumber: 'VOL-2022-004',
          status: 'RENTED',
          supplierId: suppliers[4].id,
          purchasePrice: 650000,
          sellingPrice: 0,
          hourlyRate: 250,
          dailyRate: 2000,
          monthlyRate: 40000,
          purchaseDate: new Date('2022-09-01'),
          isActive: true,
        },
      }),
      db.equipment.create({
        data: {
          code: 'EQ-005',
          name: 'رافعة شوكية Toyota',
          nameAr: 'رافعة شوكية Toyota',
          type: 'رافعة شوكية',
          model: 'Toyota 8FD25',
          serialNumber: 'TOY-2024-005',
          status: 'AVAILABLE',
          supplierId: suppliers[4].id,
          purchasePrice: 280000,
          sellingPrice: 0,
          hourlyRate: 150,
          dailyRate: 1200,
          monthlyRate: 22000,
          purchaseDate: new Date('2024-01-10'),
          warrantyExpiry: new Date('2026-01-10'),
          isActive: true,
        },
      }),
    ])

    // 18. Equipment Usages
    await Promise.all([
      db.equipmentUsage.create({ data: { equipmentId: equipmentItems[0].id, projectId: projects[0].id, date: new Date('2024-04-01'), hours: 160, description: 'أعمال الحفر - مجمع الملقا', cost: 56000 } }),
      db.equipmentUsage.create({ data: { equipmentId: equipmentItems[1].id, projectId: projects[0].id, date: new Date('2024-04-15'), hours: 120, description: 'أعمال التسوية - مجمع الملقا', cost: 36000 } }),
      db.equipmentUsage.create({ data: { equipmentId: equipmentItems[2].id, projectId: projects[0].id, date: new Date('2024-06-01'), hours: 200, description: 'رفع مواد - مجمع الملقا', cost: 100000 } }),
      db.equipmentUsage.create({ data: { equipmentId: equipmentItems[3].id, projectId: projects[1].id, date: new Date('2024-07-15'), hours: 80, description: 'نقل مخلفات - مدرسة النسيم', cost: 20000 } }),
      db.equipmentUsage.create({ data: { equipmentId: equipmentItems[0].id, projectId: projects[1].id, date: new Date('2024-08-01'), hours: 100, description: 'أعمال الحفر - مدرسة النسيم', cost: 35000 } }),
    ])

    // 19. Equipment Rentals
    await Promise.all([
      db.equipmentRental.create({
        data: {
          equipmentId: equipmentItems[3].id,
          clientId: clients[2].id,
          projectId: null,
          startDate: new Date('2024-10-01'),
          endDate: new Date('2025-03-31'),
          rateType: 'MONTHLY',
          rate: 40000,
          totalAmount: 240000,
          status: 'ACTIVE',
          notes: 'تأجير قلاب فولفو لشركة التطوير العقاري - 6 أشهر',
        },
      }),
      db.equipmentRental.create({
        data: {
          equipmentId: equipmentItems[4].id,
          clientId: clients[4].id,
          projectId: null,
          startDate: new Date('2024-12-01'),
          endDate: new Date('2025-02-28'),
          rateType: 'MONTHLY',
          rate: 22000,
          totalAmount: 66000,
          status: 'ACTIVE',
          notes: 'تأجير رافعة شوكية لشركة المشاريع الصناعية - 3 أشهر',
        },
      }),
      db.equipmentRental.create({
        data: {
          equipmentId: equipmentItems[0].id,
          clientId: clients[1].id,
          projectId: projects[2].id,
          startDate: new Date('2024-09-15'),
          endDate: new Date('2024-10-15'),
          rateType: 'DAILY',
          rate: 2800,
          totalAmount: 84000,
          status: 'RETURNED',
          notes: 'تأجير حفارة لمشروع فيلا الورود - شهر واحد',
        },
      }),
    ])

    // 20. Equipment Expenses
    await Promise.all([
      db.equipmentExpense.create({
        data: {
          equipmentId: equipmentItems[0].id,
          category: 'DELIVERY',
          description: 'نقل الحفارة من موقع الملقا لموقع النسيم',
          amount: 8000,
          date: new Date('2024-07-25'),
          reference: 'EQ-EXP-001',
        },
      }),
      db.equipmentExpense.create({
        data: {
          equipmentId: equipmentItems[2].id,
          category: 'INSURANCE',
          description: 'تأمين شامل للكرين البرجي - سنة 2024',
          amount: 45000,
          date: new Date('2024-01-01'),
          reference: 'EQ-EXP-002',
        },
      }),
      db.equipmentExpense.create({
        data: {
          equipmentId: equipmentItems[1].id,
          category: 'MAINTENANCE',
          description: 'صيانة دورية للشيول - تغيير فلاتر وزيوت',
          amount: 12000,
          date: new Date('2024-06-15'),
          reference: 'EQ-EXP-003',
        },
      }),
      db.equipmentExpense.create({
        data: {
          equipmentId: equipmentItems[3].id,
          category: 'DELIVERY',
          description: 'نقل القلاب لموقع العميل - التطوير العقاري',
          amount: 5000,
          date: new Date('2024-10-01'),
          reference: 'EQ-EXP-004',
        },
      }),
    ])

    // 21. Petty Cash
    await Promise.all([
      db.pettyCash.create({ data: { branchId: branch.id, description: 'شراء مستلزمات مكتبية', amount: 2500, date: new Date('2024-04-01'), category: 'مصروفات إدارية', reference: 'PC-001' } }),
      db.pettyCash.create({ data: { branchId: branch.id, description: 'صيانة تكييف المكتب', amount: 1800, date: new Date('2024-05-15'), category: 'صيانة', reference: 'PC-002' } }),
      db.pettyCash.create({ data: { branchId: branch.id, description: 'ضيافة اجتماع المقاولين', amount: 3500, date: new Date('2024-07-20'), category: 'ضيافة', reference: 'PC-003' } }),
      db.pettyCash.create({ data: { branchId: branch.id, description: 'وقود مركبة الموقع', amount: 1200, date: new Date('2024-09-10'), category: 'وقود', reference: 'PC-004' } }),
      db.pettyCash.create({ data: { branchId: branch.id, description: 'شراء أدوات أمن وسلامة', amount: 4200, date: new Date('2024-10-01'), category: 'أمن وسلامة', reference: 'PC-005' } }),
    ])

    // 22. Employee Advances
    await Promise.all([
      db.employeeAdvance.create({ data: { employeeId: employees[0].id, amount: 5000, date: new Date('2024-04-01'), settledAmount: 5000, status: 'SETTLED', description: 'سلفة مؤقتة - مصاريف ميدانية' } }),
      db.employeeAdvance.create({ data: { employeeId: employees[1].id, amount: 3000, date: new Date('2024-06-15'), settledAmount: 3000, status: 'SETTLED', description: 'سلفة نقل' } }),
      db.employeeAdvance.create({ data: { employeeId: employees[3].id, amount: 8000, date: new Date('2024-08-01'), settledAmount: 4000, status: 'PARTIALLY_SETTLED', description: 'سلفة شراء مستعجل' } }),
      db.employeeAdvance.create({ data: { employeeId: employees[4].id, amount: 2000, date: new Date('2024-10-01'), settledAmount: 0, status: 'PENDING', description: 'سلفة شخصية' } }),
    ])

    // 23. Inventory Items (updated with itemType, purchasePrice/sellingPrice, plus service items)
    await Promise.all([
      // Product items
      db.inventoryItem.create({ data: { code: 'INV-001', name: 'إسمنت بورتلاندي', nameAr: 'إسمنت بورتلاندي', itemType: 'PRODUCT', unit: 'كيس', purchasePrice: 15, sellingPrice: 18, quantity: 200, minQuantity: 50, warehouseId: warehouse.id, category: 'مواد بناء', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-002', name: 'رمل خشن', nameAr: 'رمل خشن', itemType: 'PRODUCT', unit: 'م³', purchasePrice: 35, sellingPrice: 45, quantity: 500, minQuantity: 100, warehouseId: warehouse.id, category: 'مواد بناء', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-003', name: 'حديد تسليح 12 مم', nameAr: 'حديد تسليح 12 مم', itemType: 'PRODUCT', unit: 'طن', purchasePrice: 3900, sellingPrice: 4200, quantity: 25, minQuantity: 10, warehouseId: warehouse.id, category: 'حديد', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-004', name: 'حديد تسليح 16 مم', nameAr: 'حديد تسليح 16 مم', itemType: 'PRODUCT', unit: 'طن', purchasePrice: 4000, sellingPrice: 4300, quantity: 8, minQuantity: 10, warehouseId: warehouse.id, category: 'حديد', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-005', name: 'بلوك خرساني 20 سم', nameAr: 'بلوك خرساني 20 سم', itemType: 'PRODUCT', unit: 'م²', purchasePrice: 55, sellingPrice: 65, quantity: 3000, minQuantity: 500, warehouseId: warehouse.id, category: 'مواد بناء', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-006', name: 'أنابيب PVC 4 بوصة', nameAr: 'أنابيب PVC 4 بوصة', itemType: 'PRODUCT', unit: 'متر', purchasePrice: 20, sellingPrice: 25, quantity: 15, minQuantity: 50, warehouseId: warehouse.id, category: 'سباكة', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-007', name: 'كابل كهربائي 2.5 مم²', nameAr: 'كابل كهربائي 2.5 مم²', itemType: 'PRODUCT', unit: 'لفة', purchasePrice: 380, sellingPrice: 450, quantity: 5, minQuantity: 10, warehouseId: warehouse.id, category: 'كهرباء', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-008', name: 'ألواح جبس', nameAr: 'ألواح جبس', itemType: 'PRODUCT', unit: 'لوح', purchasePrice: 14, sellingPrice: 18, quantity: 3, minQuantity: 50, warehouseId: warehouse.id, category: 'تشطيب', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-009', name: 'دهان داخلي أبيض', nameAr: 'دهان داخلي أبيض', itemType: 'PRODUCT', unit: 'جالون', purchasePrice: 95, sellingPrice: 120, quantity: 20, minQuantity: 15, warehouseId: warehouse.id, category: 'دهان', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-010', name: 'مادة عزل مائي', nameAr: 'مادة عزل مائي', itemType: 'PRODUCT', unit: 'جالون', purchasePrice: 140, sellingPrice: 180, quantity: 10, minQuantity: 20, warehouseId: warehouse.id, category: 'عزل', isActive: true } }),
      // Service items
      db.inventoryItem.create({ data: { code: 'INV-011', name: 'خدمة النقل', nameAr: 'خدمة النقل', itemType: 'SERVICE', unit: 'رحلة', purchasePrice: 0, sellingPrice: 1500, quantity: 0, minQuantity: 0, warehouseId: warehouse.id, category: 'خدمات', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-012', name: 'خدمة التركيب', nameAr: 'خدمة التركيب', itemType: 'SERVICE', unit: 'م²', purchasePrice: 0, sellingPrice: 45, quantity: 0, minQuantity: 0, warehouseId: warehouse.id, category: 'خدمات', isActive: true } }),
      db.inventoryItem.create({ data: { code: 'INV-013', name: 'خدمة الفحص الهندسي', nameAr: 'خدمة الفحص الهندسي', itemType: 'SERVICE', unit: 'زيارة', purchasePrice: 0, sellingPrice: 2000, quantity: 0, minQuantity: 0, warehouseId: warehouse.id, category: 'خدمات', isActive: true } }),
    ])

    // 24. Chart of Accounts (Accounts)
    const accounts = await Promise.all([
      // Assets
      db.account.create({ data: { code: '1000', name: 'الأصول', nameAr: 'الأصول', type: 'ASSET', isActive: true } }),
      db.account.create({ data: { code: '1100', name: 'الأصول المتداولة', nameAr: 'الأصول المتداولة', type: 'ASSET', isActive: true } }),
      db.account.create({ data: { code: '1110', name: 'البنك', nameAr: 'البنك', type: 'ASSET', isActive: true } }),
      db.account.create({ data: { code: '1120', name: 'الصندوق', nameAr: 'الصندوق', type: 'ASSET', isActive: true } }),
      db.account.create({ data: { code: '1130', name: 'المدينون', nameAr: 'المدينون', type: 'ASSET', isActive: true } }),
      db.account.create({ data: { code: '1140', name: 'مخزون المواد', nameAr: 'مخزون المواد', type: 'ASSET', isActive: true } }),
      db.account.create({ data: { code: '1200', name: 'الأصول الثابتة', nameAr: 'الأصول الثابتة', type: 'ASSET', isActive: true } }),
      db.account.create({ data: { code: '1210', name: 'المعدات والآليات', nameAr: 'المعدات والآليات', type: 'ASSET', isActive: true } }),
      // Liabilities
      db.account.create({ data: { code: '2000', name: 'الخصوم', nameAr: 'الخصوم', type: 'LIABILITY', isActive: true } }),
      db.account.create({ data: { code: '2100', name: 'الدائنون', nameAr: 'الدائنون', type: 'LIABILITY', isActive: true } }),
      db.account.create({ data: { code: '2200', name: 'ضريبة القيمة المضافة المستحقة', nameAr: 'ضريبة القيمة المضافة المستحقة', type: 'LIABILITY', isActive: true } }),
      db.account.create({ data: { code: '2300', name: 'مستحقات مقاولي الباطن', nameAr: 'مستحقات مقاولي الباطن', type: 'LIABILITY', isActive: true } }),
      // Equity
      db.account.create({ data: { code: '3000', name: 'حقوق الملكية', nameAr: 'حقوق الملكية', type: 'EQUITY', isActive: true } }),
      db.account.create({ data: { code: '3100', name: 'رأس المال', nameAr: 'رأس المال', type: 'EQUITY', isActive: true } }),
      db.account.create({ data: { code: '3200', name: 'الأرباح المحتجزة', nameAr: 'الأرباح المحتجزة', type: 'EQUITY', isActive: true } }),
      // Revenue
      db.account.create({ data: { code: '4000', name: 'الإيرادات', nameAr: 'الإيرادات', type: 'REVENUE', isActive: true } }),
      db.account.create({ data: { code: '4100', name: 'إيرادات المشاريع', nameAr: 'إيرادات المشاريع', type: 'REVENUE', isActive: true } }),
      db.account.create({ data: { code: '4200', name: 'إيرادات المستخلصات', nameAr: 'إيرادات المستخلصات', type: 'REVENUE', isActive: true } }),
      // Expenses
      db.account.create({ data: { code: '5000', name: 'المصروفات', nameAr: 'المصروفات', type: 'EXPENSE', isActive: true } }),
      db.account.create({ data: { code: '5100', name: 'تكلفة المواد', nameAr: 'تكلفة المواد', type: 'EXPENSE', isActive: true } }),
      db.account.create({ data: { code: '5200', name: 'تكلفة العمالة', nameAr: 'تكلفة العمالة', type: 'EXPENSE', isActive: true } }),
      db.account.create({ data: { code: '5300', name: 'تكلفة المعدات', nameAr: 'تكلفة المعدات', type: 'EXPENSE', isActive: true } }),
      db.account.create({ data: { code: '5400', name: 'مصروفات مقاولي الباطن', nameAr: 'مصروفات مقاولي الباطن', type: 'EXPENSE', isActive: true } }),
      db.account.create({ data: { code: '5500', name: 'مصروفات إدارية', nameAr: 'مصروفات إدارية', type: 'EXPENSE', isActive: true } }),
      db.account.create({ data: { code: '5600', name: 'ضريبة القيمة المضافة المدفوعة', nameAr: 'ضريبة القيمة المضافة المدفوعة', type: 'EXPENSE', isActive: true } }),
    ])

    // Update account hierarchy
    const accountMap: Record<string, string> = {}
    for (const acc of accounts) {
      accountMap[acc.code] = acc.id
    }
    await db.account.update({ where: { code: '1100' }, data: { parentId: accountMap['1000'] } })
    await db.account.update({ where: { code: '1200' }, data: { parentId: accountMap['1000'] } })

    // 25. Cost Centers
    const costCenters = await Promise.all([
      db.costCenter.create({ data: { code: 'CC-001', name: 'مشروع مجمع الملقا' } }),
      db.costCenter.create({ data: { code: 'CC-002', name: 'مشروع مدرسة النسيم' } }),
      db.costCenter.create({ data: { code: 'CC-003', name: 'مشروع فيلا الورود' } }),
      db.costCenter.create({ data: { code: 'CC-004', name: 'مصروفات إدارية عامة' } }),
    ])

    // 26. Journal Entries with Lines
    // JE 1: Revenue from first claim - Project 1
    const je1 = await db.journalEntry.create({
      data: {
        entryNo: 'JE-2024-001',
        date: new Date('2024-05-15'),
        description: 'إثبات إيراد المستخلص الأول - مشروع الملقا',
        status: 'POSTED',
        lines: {
          create: [
            { accountId: accountMap['1130'], costCenterId: costCenters[0].id, debit: 517500, credit: 0, description: 'مستخلص مستحق من العميل' },
            { accountId: accountMap['4200'], costCenterId: costCenters[0].id, debit: 0, credit: 450000, description: 'إيراد المستخلص الأول' },
            { accountId: accountMap['2200'], costCenterId: costCenters[0].id, debit: 0, credit: 67500, description: 'ضريبة القيمة المضافة' },
          ]
        }
      },
    })

    // JE 2: Purchase of steel
    const je2 = await db.journalEntry.create({
      data: {
        entryNo: 'JE-2024-002',
        date: new Date('2024-04-01'),
        description: 'إثبات شراء حديد تسليح - مشروع الملقا',
        status: 'POSTED',
        lines: {
          create: [
            { accountId: accountMap['5100'], costCenterId: costCenters[0].id, debit: 630000, credit: 0, description: 'تكلفة حديد التسليح' },
            { accountId: accountMap['5600'], costCenterId: costCenters[0].id, debit: 94500, credit: 0, description: 'ضريبة القيمة المضافة على المشتريات' },
            { accountId: accountMap['2100'], costCenterId: costCenters[0].id, debit: 0, credit: 724500, description: 'مستحق للمورد' },
          ]
        }
      },
    })

    // JE 3: Labor cost - Project 1
    await db.journalEntry.create({
      data: {
        entryNo: 'JE-2024-003',
        date: new Date('2024-06-01'),
        description: 'إثبات تكلفة العمالة - مشروع الملقا',
        status: 'POSTED',
        lines: {
          create: [
            { accountId: accountMap['5200'], costCenterId: costCenters[0].id, debit: 135000, credit: 0, description: 'تكلفة عمال البناء' },
            { accountId: accountMap['1110'], costCenterId: costCenters[0].id, debit: 0, credit: 135000, description: 'سداد من البنك' },
          ]
        }
      },
    })

    // JE 4: Revenue from school project
    await db.journalEntry.create({
      data: {
        entryNo: 'JE-2024-004',
        date: new Date('2024-09-01'),
        description: 'إثبات إيراد المستخلص الأول - مدرسة النسيم',
        status: 'POSTED',
        lines: {
          create: [
            { accountId: accountMap['1130'], costCenterId: costCenters[1].id, debit: 483000, credit: 0, description: 'مستخلص مستحق' },
            { accountId: accountMap['4200'], costCenterId: costCenters[1].id, debit: 0, credit: 420000, description: 'إيراد المستخلص' },
            { accountId: accountMap['2200'], costCenterId: costCenters[1].id, debit: 0, credit: 63000, description: 'ضريبة القيمة المضافة' },
          ]
        }
      },
    })

    // 27. VAT Return
    await db.vATReturn.create({
      data: {
        period: 'Q3-2024',
        salesVAT: 472500,
        purchaseVAT: 355650,
        netVAT: 116850,
        status: 'FILED',
        filedDate: new Date('2024-10-31'),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'تم تهيئة البيانات التجريبية بنجاح',
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
        boqItems: 21,
        progressClaims: 12,
        salesInvoices: salesInvoices.length,
        purchaseOrders: purchaseOrders.length,
        purchaseInvoices: 5,
        subcontractorInvoices: 4,
        equipment: equipmentItems.length,
        equipmentRentals: 3,
        equipmentExpenses: 4,
        expenses: 10,
        inventoryItems: 13,
        accounts: accounts.length,
        costCenters: costCenters.length,
        journalEntries: 4,
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

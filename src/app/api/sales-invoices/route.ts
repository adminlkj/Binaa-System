import { db } from '@/lib/db'
import { autoEntrySalesInvoice, autoEntryRentalInvoice, initializeChartOfAccounts, createJournalEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const invoiceType = searchParams.get('invoiceType')
    const sourceType = searchParams.get('sourceType')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (clientId) where.clientId = clientId
    if (projectId) where.projectId = projectId
    if (status) where.status = status
    if (invoiceType) where.invoiceType = invoiceType
    if (sourceType) where.sourceType = sourceType
    if (search) {
      where.OR = [
        { invoiceNo: { contains: search } },
        { notes: { contains: search } },
      ]
    }

    const include = {
      client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
      project: { select: { id: true, name: true, nameAr: true, code: true, projectType: true } },
      contract: { select: { id: true, contractNo: true } },
      timesheet: {
        select: {
          id: true, operatingHours: true, month: true, year: true, status: true,
          project: { select: { id: true, name: true, code: true, projectType: true, client: { select: { id: true, name: true } } } },
          equipment: { select: { id: true, name: true, code: true, nameAr: true } },
          rental: { select: { id: true, hourlyRate: true, deliveryFees: true, deliveryFeesTaxable: true } },
          contract: { select: { id: true, contractNo: true, hourlyRate: true, paymentTerms: true } },
        },
      },
      progressClaim: {
        select: {
          id: true, claimNo: true, date: true, amount: true, vatAmount: true,
          totalAmount: true, status: true, invoiced: true,
          project: { select: { id: true, name: true, code: true, client: { select: { id: true, name: true } } } },
          contract: { select: { id: true, contractNo: true } },
        },
      },
      items: true,
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const invoices = await db.salesInvoice.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
      })
      return NextResponse.json(invoices)
    }

    const [data, total] = await Promise.all([
      db.salesInvoice.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.salesInvoice.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('Error fetching sales invoices:', error)
    return NextResponse.json({ error: 'فشل في تحميل فواتير المبيعات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { sourceType } = body

    // ===== MODE A: Create from ProgressClaim (Extract) =====
    if (sourceType === 'EXTRACT') {
      return await createInvoiceFromExtract(body)
    }

    // ===== MODE B: Create from TimeSheet =====
    if (sourceType === 'TIMESHEET') {
      return await createInvoiceFromTimesheet(body)
    }

    // ===== LEGACY MODE: Manual creation with items array =====
    return await createInvoiceManual(body)
  } catch (error) {
    console.error('Error creating sales invoice:', error)
    return NextResponse.json({ error: 'فشل في إنشاء فاتورة المبيعات' }, { status: 500 })
  }
}

// ============================================================================
// MODE A: Create invoice from ProgressClaim (Extract)
// ============================================================================
async function createInvoiceFromExtract(body: Record<string, unknown>) {
  const { progressClaimId, date, dueDate, notes } = body

  if (!progressClaimId || typeof progressClaimId !== 'string') {
    return NextResponse.json({ error: 'معرف المستخلص مطلوب' }, { status: 400 })
  }

  if (!date || !dueDate) {
    return NextResponse.json({ error: 'التاريخ وتاريخ الاستحقاق مطلوبان' }, { status: 400 })
  }

  // 1. Fetch the ProgressClaim and verify it exists
  const claim = await db.progressClaim.findUnique({
    where: { id: progressClaimId },
    include: {
      project: { select: { id: true, name: true, code: true, clientId: true, client: { select: { id: true, name: true } } } },
      contract: { select: { id: true, contractNo: true } },
    },
  })

  if (!claim) {
    return NextResponse.json({ error: 'المستخلص غير موجود' }, { status: 404 })
  }

  // 2. Verify the claim is APPROVED
  if (claim.status !== 'APPROVED') {
    return NextResponse.json({ error: 'يجب اعتماد المستخلص أولاً قبل إنشاء الفاتورة' }, { status: 400 })
  }

  // 3. DUPLICATE PREVENTION: Check that the claim is NOT already invoiced
  if (claim.invoiced) {
    return NextResponse.json({ error: 'تم إصدار فاتورة لهذا المستخلص بالفعل' }, { status: 400 })
  }

  // Also check via SalesInvoice table
  const existingInvoice = await db.salesInvoice.findFirst({
    where: { progressClaimId: claim.id },
  })
  if (existingInvoice) {
    return NextResponse.json({ error: 'يوجد فاتورة مرتبطة بهذا المستخلص بالفعل' }, { status: 400 })
  }

  // 4. Auto-populate from claim
  const clientId = claim.project.clientId
  if (!clientId) {
    return NextResponse.json({ error: 'العميل غير محدد للمشروع' }, { status: 400 })
  }
  const projectId = claim.projectId
  const contractId = claim.contractId
  const subtotal = claim.amount
  const vatAmount = claim.vatAmount
  const totalAmount = claim.totalAmount

  // 5. Generate invoice number: PCL-YEAR-SEQ
  const prefix = 'PCL'
  const year = new Date().getFullYear()
  const yearStr = String(year)
  const likePattern = `${prefix}-${yearStr}-`

  const lastInvoice = await db.salesInvoice.findFirst({
    where: { invoiceNo: { startsWith: likePattern } },
    orderBy: { invoiceNo: 'desc' },
    select: { invoiceNo: true },
  })

  let seq = 1
  if (lastInvoice) {
    const parts = lastInvoice.invoiceNo.split('-')
    const parsedSeq = parseInt(parts[2])
    if (!isNaN(parsedSeq)) {
      seq = parsedSeq + 1
    }
  }
  const invoiceNo = `${prefix}-${yearStr}-${String(seq).padStart(4, '0')}`

  const invoiceDate = new Date(date as string)
  const invoiceDueDate = new Date(dueDate as string)

  // 6-8. Create invoice + mark claim invoiced + create accounting entry (all in transaction)
  const result = await db.$transaction(async (tx: PrismaTransaction) => {
    // Create the invoice
    const invoice = await tx.salesInvoice.create({
      data: {
        invoiceNo,
        clientId,
        projectId,
        contractId,
        date: invoiceDate,
        dueDate: invoiceDueDate,
        subtotal,
        discountRate: 0,
        discountAmount: 0,
        netAmount: subtotal,
        vatRate: claim.vatRate,
        vatAmount,
        totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        invoiceType: 'PROGRESS_CLAIM',
        sourceType: 'EXTRACT',
        progressClaimId: claim.id,
        contractNo: claim.contract.contractNo,
        notes: (notes as string) || `فاتورة مستخلص رقم ${claim.claimNo}`,
        items: {
          create: [{
            description: `مستخلص رقم ${claim.claimNo} - ${claim.project.name}`,
            descriptionEn: `Progress Claim No. ${claim.claimNo} - ${claim.project.name}`,
            quantity: 1,
            unit: 'مستخلص',
            unitPrice: subtotal,
            totalPrice: subtotal,
            itemType: 'PROGRESS_CLAIM',
          }],
        },
      },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        timesheet: { select: { id: true, month: true, year: true, operatingHours: true, status: true } },
        progressClaim: { select: { id: true, claimNo: true, status: true, invoiced: true } },
        items: true,
      },
    })

    // Mark the ProgressClaim as invoiced
    await tx.progressClaim.update({
      where: { id: claim.id },
      data: { invoiced: true },
    })

    // Create auto accounting entry
    try {
      await initializeChartOfAccounts()
      const journalEntry = await autoEntrySalesInvoice({
        invoiceNo: invoice.invoiceNo,
        clientId: invoice.clientId,
        subtotal: invoice.subtotal,
        vatRate: invoice.vatRate,
        vatAmount: invoice.vatAmount,
        totalAmount: invoice.totalAmount,
        invoiceType: 'PROGRESS_CLAIM',
        date: invoice.date,
        projectId: invoice.projectId || undefined,
      }, tx)

      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { journalEntryId: journalEntry.id },
      })
    } catch (accountingError) {
      console.error('Accounting entry failed for sales invoice from extract:', accountingError)
    }

    // Re-fetch to include journalEntryId
    return await tx.salesInvoice.findUnique({
      where: { id: invoice.id },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        timesheet: { select: { id: true, month: true, year: true, operatingHours: true, status: true } },
        progressClaim: { select: { id: true, claimNo: true, status: true, invoiced: true } },
        items: true,
      },
    })
  })

  return NextResponse.json(result, { status: 201 })
}

// ============================================================================
// MODE B: Create invoice from TimeSheet
// ============================================================================
async function createInvoiceFromTimesheet(body: Record<string, unknown>) {
  const { timesheetId, date, dueDate, notes } = body

  if (!timesheetId || typeof timesheetId !== 'string') {
    return NextResponse.json({ error: 'معرف التايم شيت مطلوب' }, { status: 400 })
  }

  if (!date || !dueDate) {
    return NextResponse.json({ error: 'التاريخ وتاريخ الاستحقاق مطلوبان' }, { status: 400 })
  }

  // 1. Fetch the Timesheet with its rental/contract/equipment relations
  const timesheet = await db.timesheet.findUnique({
    where: { id: timesheetId },
    include: {
      contract: {
        include: {
          rental: {
            select: { id: true, hourlyRate: true, pricingType: true, deliveryFees: true, deliveryFeesTaxable: true, clientId: true, status: true, salesOrderNo: true, paymentDuration: true },
          },
        },
      },
      equipment: { select: { id: true, code: true, name: true, nameAr: true } },
      project: { select: { id: true, name: true, code: true, clientId: true } },
      rental: {
        select: { id: true, hourlyRate: true, pricingType: true, deliveryFees: true, deliveryFeesTaxable: true, clientId: true, status: true, salesOrderNo: true, paymentDuration: true },
      },
    },
  })

  if (!timesheet) {
    return NextResponse.json({ error: 'التايم شيت غير موجود' }, { status: 404 })
  }

  // 2. Verify the Timesheet status is APPROVED (not DRAFT or INVOICED)
  if (timesheet.status !== 'APPROVED') {
    if (timesheet.status === 'INVOICED') {
      return NextResponse.json({ error: 'تم إصدار فاتورة لهذا التايم شيت بالفعل' }, { status: 400 })
    }
    return NextResponse.json({ error: 'يجب اعتماد التايم شيت أولاً قبل إنشاء الفاتورة' }, { status: 400 })
  }

  // Also check if there's already an invoice linked
  const existingInvoice = await db.salesInvoice.findUnique({
    where: { timesheetId: timesheet.id },
  })
  if (existingInvoice) {
    return NextResponse.json({ error: 'تم إصدار فاتورة لهذا التايم شيت بالفعل' }, { status: 400 })
  }

  // 4. Calculate: subtotal = operatingHours × hourlyRate (from contract)
  const rental = timesheet.rental || timesheet.contract.rental
  const hourlyRate = rental?.hourlyRate || timesheet.contract.hourlyRate || 0
  const operatingHours = timesheet.operatingHours
  const subtotal = Math.round(operatingHours * hourlyRate * 100) / 100

  // 5. Add delivery fees if applicable (from rental contract)
  const deliveryFees = rental?.deliveryFees || timesheet.contract.deliveryFees || 0
  const deliveryFeesTaxable = rental?.deliveryFeesTaxable ?? timesheet.contract.deliveryFeesTaxable ?? true
  const includeDelivery = deliveryFees > 0

  const vatRate = 0.15
  let deliveryVat = 0
  if (includeDelivery && deliveryFeesTaxable) {
    deliveryVat = Math.round(deliveryFees * vatRate * 100) / 100
  }
  const rentalVat = Math.round(subtotal * vatRate * 100) / 100
  const vatAmount = Math.round((rentalVat + deliveryVat) * 100) / 100
  const totalAmount = Math.round((subtotal + deliveryFees + vatAmount) * 100) / 100

  // Get clientId from rental or project
  const clientId = rental?.clientId || timesheet.project.clientId

  // Month names for description
  const monthNamesAr = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ]
  const monthLabel = `${monthNamesAr[timesheet.month - 1]} ${timesheet.year}`
  const equipmentName = timesheet.equipment.nameAr || timesheet.equipment.name

  // 6. Generate invoice number: RNT-YEAR-SEQ
  const prefix = 'RNT'
  const year = new Date().getFullYear()
  const yearStr = String(year)
  const likePattern = `${prefix}-${yearStr}-`

  const lastInvoice = await db.salesInvoice.findFirst({
    where: { invoiceNo: { startsWith: likePattern } },
    orderBy: { invoiceNo: 'desc' },
    select: { invoiceNo: true },
  })

  let seq = 1
  if (lastInvoice) {
    const parts = lastInvoice.invoiceNo.split('-')
    const parsedSeq = parseInt(parts[2])
    if (!isNaN(parsedSeq)) {
      seq = parsedSeq + 1
    }
  }
  const invoiceNo = `${prefix}-${yearStr}-${String(seq).padStart(4, '0')}`

  const invoiceDate = new Date(date as string)
  const invoiceDueDate = new Date(dueDate as string)

  // 7. Create the invoice items
  const invoiceItems = [
    {
      description: `تأجير ${equipmentName} - ${monthLabel} - ${operatingHours} ساعة`,
      descriptionEn: `Equipment Rental - ${timesheet.equipment.name} - ${monthLabel} - ${operatingHours} hours`,
      quantity: operatingHours,
      unit: 'ساعة',
      unitPrice: hourlyRate,
      totalPrice: subtotal,
      itemType: 'RENTAL',
    },
  ]

  // Add delivery fee as separate item if applicable
  if (includeDelivery && deliveryFees > 0) {
    invoiceItems.push({
      description: `رسوم نقل وتنزيل - ${equipmentName}`,
      descriptionEn: `Delivery Fees - ${timesheet.equipment.name}`,
      quantity: 1,
      unit: 'خدمة',
      unitPrice: deliveryFees,
      totalPrice: deliveryFees,
      itemType: 'DELIVERY',
    })
  }

  // 8-9. Create invoice + mark timesheet + create accounting entry (all in transaction)
  const result = await db.$transaction(async (tx: PrismaTransaction) => {
    const invoice = await tx.salesInvoice.create({
      data: {
        invoiceNo,
        clientId,
        projectId: timesheet.projectId,
        contractId: timesheet.contractId,
        date: invoiceDate,
        dueDate: invoiceDueDate,
        subtotal,
        discountRate: 0,
        discountAmount: 0,
        netAmount: subtotal,
        vatRate,
        vatAmount,
        totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        invoiceType: 'RENTAL',
        sourceType: 'TIMESHEET',
        timesheetId: timesheet.id,
        contractNo: timesheet.contract.contractNo,
        contractType: timesheet.contract.contractType,
        contractPeriodStart: timesheet.contract.startDate,
        contractPeriodEnd: timesheet.contract.endDate,
        salesOrderNo: rental?.salesOrderNo || null,
        equipmentName: timesheet.equipment.name,
        operatingHours,
        hourlyRate,
        includeDelivery,
        deliveryAmount: deliveryFees,
        deliveryFeesTaxable,
        includeVat: true,
        deliveryMonth: `${timesheet.year}-${String(timesheet.month).padStart(2, '0')}`,
        paymentTerms: rental?.paymentDuration || timesheet.contract.paymentTerms || null,
        notes: (notes as string) || `فاتورة تأجير معدات - عقد ${timesheet.contract.contractNo} - ${monthLabel}`,
        items: {
          create: invoiceItems,
        },
      },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        timesheet: { select: { id: true, month: true, year: true, operatingHours: true, status: true } },
        progressClaim: { select: { id: true, claimNo: true, status: true, invoiced: true } },
        items: true,
      },
    })

    // Mark the Timesheet as INVOICED
    await tx.timesheet.update({
      where: { id: timesheet.id },
      data: { status: 'INVOICED', approvedDate: timesheet.approvedDate || new Date() },
    })

    // Create auto accounting entry
    try {
      await initializeChartOfAccounts()
      const journalEntry = await autoEntryRentalInvoice({
        invoiceNo: invoice.invoiceNo,
        subtotal: invoice.subtotal,
        vatAmount: invoice.vatAmount,
        totalAmount: invoice.totalAmount,
        date: invoice.date,
        costCenterId: invoice.projectId || undefined,
      }, tx)

      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { journalEntryId: journalEntry.id },
      })
    } catch (accountingError) {
      console.error('Accounting entry failed for sales invoice from timesheet:', accountingError)
    }

    // Re-fetch to include journalEntryId
    return await tx.salesInvoice.findUnique({
      where: { id: invoice.id },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        timesheet: { select: { id: true, month: true, year: true, operatingHours: true, status: true } },
        progressClaim: { select: { id: true, claimNo: true, status: true, invoiced: true } },
        items: true,
      },
    })
  })

  return NextResponse.json(result, { status: 201 })
}

// ============================================================================
// LEGACY MODE: Manual creation with items array (backward compatibility)
// ============================================================================
async function createInvoiceManual(body: Record<string, unknown>) {
  const {
    clientId, projectId, contractId, date, dueDate, notes, items,
    vatRate = 0.15, discountRate = 0, discountAmount = 0,
    invoiceType = 'TAX_INVOICE', paymentTerms,
    referenceNo, contractNo, contractType, contractPeriodStart, contractPeriodEnd,
    deliveryMonth, includeDelivery = false, deliveryAmount = 0, includeVat = true,
  } = body as Record<string, unknown>

  const typedItems = items as Array<{ description: string; descriptionEn?: string; quantity: number; unit?: string; unitPrice: number; itemType?: string }> | undefined

  if (!clientId || !date || !dueDate || !typedItems?.length) {
    return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
  }

  // Calculate totals from items
  const subtotal = typedItems.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
    return sum + (item.quantity * item.unitPrice)
  }, 0)

  const finalDiscountAmount = (discountAmount as number) || (subtotal * (discountRate as number))
  const netAmount = subtotal - finalDiscountAmount
  const deliveryTotal = includeDelivery ? (deliveryAmount as number) : 0
  const vatAmount = includeVat ? (netAmount + deliveryTotal) * (vatRate as number) : 0
  const totalAmount = netAmount + deliveryTotal + vatAmount

  // Auto-generate invoice number: TYPE-YEAR-SEQ format
  const typePrefixMap: Record<string, string> = {
    TAX_INVOICE: 'SRV',
    PROGRESS_CLAIM: 'PCL',
    RENTAL: 'RNT',
    SERVICE: 'SVC',
  }
  const prefix = typePrefixMap[invoiceType as string] || 'INV'
  const year = new Date().getFullYear()
  const yearStr = String(year)
  const likePattern = `${prefix}-${yearStr}-`

  const lastInvoice = await db.salesInvoice.findFirst({
    where: { invoiceNo: { startsWith: likePattern } },
    orderBy: { invoiceNo: 'desc' },
    select: { invoiceNo: true },
  })

  let seq = 1
  if (lastInvoice) {
    const parts = lastInvoice.invoiceNo.split('-')
    const parsedSeq = parseInt(parts[2])
    if (!isNaN(parsedSeq)) {
      seq = parsedSeq + 1
    }
  }
  const invoiceNo = `${prefix}-${yearStr}-${String(seq).padStart(4, '0')}`

  // Create invoice + accounting entry in transaction
  const result = await db.$transaction(async (tx: PrismaTransaction) => {
    const invoice = await tx.salesInvoice.create({
      data: {
        invoiceNo,
        clientId: clientId as string,
        projectId: (projectId as string) || null,
        contractId: (contractId as string) || null,
        date: new Date(date as string),
        dueDate: new Date(dueDate as string),
        subtotal,
        discountRate: discountRate as number,
        discountAmount: finalDiscountAmount,
        netAmount,
        vatRate: vatRate as number,
        vatAmount,
        totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        invoiceType: invoiceType as string,
        notes: (notes as string) || null,
        paymentTerms: (paymentTerms as string) || null,
        referenceNo: (referenceNo as string) || null,
        contractNo: (contractNo as string) || null,
        contractType: (contractType as string) || null,
        contractPeriodStart: contractPeriodStart ? new Date(contractPeriodStart as string) : null,
        contractPeriodEnd: contractPeriodEnd ? new Date(contractPeriodEnd as string) : null,
        deliveryMonth: (deliveryMonth as string) || null,
        includeDelivery: includeDelivery as boolean,
        deliveryAmount: includeDelivery ? (deliveryAmount as number) : 0,
        includeVat: includeVat as boolean,
        items: {
          create: typedItems.map((item: { description: string; descriptionEn?: string; quantity: number; unit?: string; unitPrice: number; itemType?: string }) => ({
            description: item.description,
            descriptionEn: item.descriptionEn || null,
            quantity: item.quantity,
            unit: item.unit || null,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            itemType: item.itemType || 'PRODUCT',
          })),
        },
      },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        items: true,
      },
    })

    // Auto-create accounting journal entry and store journalEntryId
    try {
      await initializeChartOfAccounts()

      let journalEntry
      if (invoiceType === 'RENTAL') {
        journalEntry = await autoEntryRentalInvoice({
          invoiceNo: invoice.invoiceNo,
          subtotal: invoice.subtotal,
          vatAmount: invoice.vatAmount,
          totalAmount: invoice.totalAmount,
          date: invoice.date,
          costCenterId: invoice.projectId || undefined,
        }, tx)
      } else {
        journalEntry = await autoEntrySalesInvoice({
          invoiceNo: invoice.invoiceNo,
          clientId: invoice.clientId,
          subtotal: invoice.subtotal,
          vatRate: invoice.vatRate,
          vatAmount: invoice.vatAmount,
          totalAmount: invoice.totalAmount,
          invoiceType: invoice.invoiceType,
          date: invoice.date,
          projectId: invoice.projectId || undefined,
        }, tx)
      }

      // Store the journalEntryId on the invoice
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { journalEntryId: journalEntry.id },
      })
    } catch (accountingError) {
      console.error('Accounting entry failed for sales invoice:', accountingError)
      // Don't fail the invoice creation, just log the error
    }

    // Re-fetch to include journalEntryId
    return await tx.salesInvoice.findUnique({
      where: { id: invoice.id },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        items: true,
      },
    })
  })

  return NextResponse.json(result, { status: 201 })
}

// PUT: Update a sales invoice (with reversal for approved/posted invoices)
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: 'معرف الفاتورة مطلوب' }, { status: 400 })
    }

    const existing = await db.salesInvoice.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
    }

    // Cannot modify CANCELLED invoices
    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'لا يمكن تعديل فاتورة ملغاة' }, { status: 400 })
    }

    // If the invoice has been approved/posted (has a journal entry), create a reversal + new entry
    if (existing.journalEntryId && (updateData.subtotal !== undefined || updateData.totalAmount !== undefined || updateData.vatAmount !== undefined)) {
      // Perform reversal + new entry + update in a transaction
      await db.$transaction(async (tx: PrismaTransaction) => {
        // Create reversal entry for the original
        const originalEntry = await tx.journalEntry.findUnique({
          where: { id: existing.journalEntryId! },
          include: { lines: true },
        })

        if (originalEntry) {
          // Create reversal entry (swap debit/credit)
          const accountIds = originalEntry.lines.map(l => l.accountId)
          const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } })
          const accountMap = new Map(accounts.map(a => [a.id, a.code]))

          const resolvedReversalLines = originalEntry.lines.map(line => ({
            accountCode: accountMap.get(line.accountId) || '',
            debit: line.credit,
            credit: line.debit,
            costCenterId: line.costCenterId || undefined,
            description: `Reversal: ${line.description || ''}`,
          }))

          await createJournalEntry({
            entryNo: `JE-REV-SI-${Date.now()}`,
            date: new Date(),
            description: `Reversal for Sales Invoice ${existing.invoiceNo}`,
            descriptionAr: `قيد عكسي لفاتورة مبيعات ${existing.invoiceNo}`,
            lines: resolvedReversalLines,
            sourceType: 'SALES_INVOICE_REVERSAL',
            sourceId: existing.invoiceNo,
          }, tx)

          // Cancel the original entry
          await tx.journalEntry.update({
            where: { id: existing.journalEntryId! },
            data: { status: 'CANCELLED' },
          })
        }

        // Create new entry with updated values
        const newSubtotal = updateData.subtotal ?? existing.subtotal
        const newVatAmount = updateData.vatAmount ?? existing.vatAmount
        const newTotalAmount = updateData.totalAmount ?? existing.totalAmount
        const newInvoiceType = updateData.invoiceType ?? existing.invoiceType
        const newDate = updateData.date ? new Date(updateData.date) : existing.date

        await initializeChartOfAccounts()

        let newJournalEntry
        if (newInvoiceType === 'RENTAL') {
          newJournalEntry = await autoEntryRentalInvoice({
            invoiceNo: existing.invoiceNo,
            subtotal: newSubtotal,
            vatAmount: newVatAmount,
            totalAmount: newTotalAmount,
            date: newDate,
            costCenterId: existing.projectId || undefined,
          }, tx)
        } else {
          newJournalEntry = await autoEntrySalesInvoice({
            invoiceNo: existing.invoiceNo,
            clientId: existing.clientId,
            subtotal: newSubtotal,
            vatRate: existing.vatRate,
            vatAmount: newVatAmount,
            totalAmount: newTotalAmount,
            invoiceType: newInvoiceType,
            date: newDate,
            projectId: existing.projectId || undefined,
          }, tx)
        }

        updateData.journalEntryId = newJournalEntry.id
      })
    }

    // Update the invoice
    const updated = await db.salesInvoice.update({
      where: { id },
      data: {
        ...updateData,
        ...(updateData.date && { date: new Date(updateData.date) }),
        ...(updateData.dueDate && { dueDate: new Date(updateData.dueDate) }),
      },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        timesheet: {
          select: {
            id: true, operatingHours: true, month: true, year: true, status: true,
            project: { select: { id: true, name: true, code: true, client: { select: { id: true, name: true } } } },
            equipment: { select: { id: true, name: true, code: true, nameAr: true } },
            rental: { select: { id: true, hourlyRate: true, deliveryFees: true, deliveryFeesTaxable: true } },
            contract: { select: { id: true, contractNo: true, hourlyRate: true, paymentTerms: true } },
          },
        },
        progressClaim: {
          select: {
            id: true, claimNo: true, date: true, amount: true, vatAmount: true,
            totalAmount: true, status: true, invoiced: true,
            project: { select: { id: true, name: true, code: true, client: { select: { id: true, name: true } } } },
            contract: { select: { id: true, contractNo: true } },
          },
        },
        items: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating sales invoice:', error)
    return NextResponse.json({ error: 'فشل في تحديث فاتورة المبيعات' }, { status: 500 })
  }
}

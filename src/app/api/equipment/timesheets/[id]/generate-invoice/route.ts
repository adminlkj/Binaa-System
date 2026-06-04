import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// POST: Generate a SalesInvoice from an approved timesheet
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 1. Get timesheet with contract details
    const timesheet = await db.equipmentTimesheet.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            equipment: {
              select: { id: true, code: true, name: true, nameAr: true },
            },
          },
        },
      },
    })

    if (!timesheet) {
      return NextResponse.json({ error: 'التايم شيت غير موجود' }, { status: 404 })
    }

    // 2. Verify timesheet status is APPROVED
    if (timesheet.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'يجب اعتماد التايم شيت أولاً قبل إنشاء الفاتورة' },
        { status: 400 }
      )
    }

    // 3. Check if invoice already generated
    if (timesheet.invoiceId) {
      return NextResponse.json(
        { error: 'تم إنشاء فاتورة لهذا التايم شيت بالفعل' },
        { status: 400 }
      )
    }

    const contract = timesheet.contract
    const equipment = contract.equipment

    // Month names in Arabic for description
    const monthNamesAr = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
    ]

    // 4. Build invoice data
    const equipmentName = equipment.nameAr || equipment.name
    const monthLabel = `${monthNamesAr[timesheet.month - 1]} ${timesheet.year}`
    const itemDescription = `تأجير ${equipmentName} - ${monthLabel} - ${timesheet.workedHours} ساعة`

    // Auto-generate invoice number with RENTAL prefix
    const prefix = 'RNT'
    const lastInvoice = await db.salesInvoice.findFirst({
      where: { invoiceNo: { startsWith: prefix } },
      orderBy: { invoiceNo: 'desc' },
      select: { invoiceNo: true },
    })

    let nextNum = 1
    if (lastInvoice?.invoiceNo) {
      const match = lastInvoice.invoiceNo.match(/RNT-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const invoiceNo = `RNT-${String(nextNum).padStart(4, '0')}`

    // Invoice dates
    const invoiceDate = new Date()
    const dueDate = new Date(invoiceDate)

    // Calculate due date based on payment terms
    const paymentTerms = contract.paymentTerms || 'immediate'
    if (paymentTerms === 'net15') dueDate.setDate(dueDate.getDate() + 15)
    else if (paymentTerms === 'net30') dueDate.setDate(dueDate.getDate() + 30)
    else if (paymentTerms === 'net60') dueDate.setDate(dueDate.getDate() + 60)
    else if (paymentTerms === 'net90') dueDate.setDate(dueDate.getDate() + 90)

    // Create the SalesInvoice
    const invoice = await db.salesInvoice.create({
      data: {
        invoiceNo,
        clientId: contract.clientId,
        projectId: contract.projectId || null,
        contractId: null, // Don't link to project Contract model
        date: invoiceDate,
        dueDate,
        subtotal: timesheet.subtotal,
        discountRate: 0,
        discountAmount: 0,
        netAmount: timesheet.subtotal,
        vatRate: timesheet.vatRate,
        vatAmount: timesheet.vatAmount,
        totalAmount: timesheet.totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        invoiceType: 'RENTAL',
        notes: `فاتورة تأجير معدات - عقد ${contract.contractNo} - ${monthLabel}`,
        paymentTerms: contract.paymentTerms,
        contractNo: contract.contractNo,
        purchaseOrderNo: contract.purchaseOrderNo,
        deliveryExpense: contract.deliveryExpense,
        items: {
          create: [{
            description: itemDescription,
            descriptionEn: `Equipment Rental - ${equipment.name} - ${monthLabel} - ${timesheet.workedHours} hours`,
            quantity: timesheet.workedHours,
            unit: 'ساعة',
            unitPrice: timesheet.hourlyRate,
            totalPrice: timesheet.subtotal,
            itemType: 'RENTAL',
          }],
        },
      },
      include: {
        client: {
          select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true },
        },
        project: {
          select: { id: true, name: true, nameAr: true, code: true },
        },
        items: true,
      },
    })

    // 5. Update timesheet with invoiceId
    await db.equipmentTimesheet.update({
      where: { id: timesheet.id },
      data: { invoiceId: invoice.id },
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('Error generating invoice from timesheet:', error)
    return NextResponse.json({ error: 'فشل في إنشاء الفاتورة' }, { status: 500 })
  }
}

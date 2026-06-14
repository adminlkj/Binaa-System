import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import type { PrismaTransaction } from '@/lib/accounting/engine'

// POST: Generate a SalesInvoice from an approved timesheet
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 1. Get timesheet with contract and rental details
    const timesheet = await db.timesheet.findUnique({
      where: { id },
      include: {
        contract: {
          select: {
            id: true, contractNo: true, clientId: true, projectId: true,
            hourlyRate: true, deliveryFees: true, deliveryFeesTaxable: true,
            paymentTerms: true, salesOrderNo: true, purchaseOrderNo: true,
            contractType: true, vatRate: true,
          },
        },
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: {
            id: true, pricingType: true,
            clientId: true, projectId: true,
            hourlyRate: true, dailyRate: true, monthlyRate: true,
            deliveryFees: true, deliveryFeesTaxable: true,
            salesOrderNo: true, paymentDuration: true,
          },
        },
        invoice: {
          select: { id: true },
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
    if (timesheet.invoice) {
      return NextResponse.json(
        { error: 'تم إنشاء فاتورة لهذا التايم شيت بالفعل' },
        { status: 400 }
      )
    }

    const contract = timesheet.contract
    const equipment = timesheet.equipment

    // Month names in Arabic for description
    const monthNamesAr = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
    ]
    const monthNamesEn = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]

    // 4. Calculate invoice amounts
    const hourlyRate = timesheet.rental?.hourlyRate || contract.hourlyRate || 0
    const operatingHours = timesheet.operatingHours
    const subtotal = operatingHours * hourlyRate
    const vatRate = contract.vatRate || 0.15
    const vatAmount = Math.round(subtotal * vatRate * 100) / 100
    const deliveryFees = timesheet.rental?.deliveryFees || contract.deliveryFees || 0
    const deliveryFeesTaxable = timesheet.rental?.deliveryFeesTaxable ?? contract.deliveryFeesTaxable ?? true
    const deliveryVat = deliveryFeesTaxable ? Math.round(deliveryFees * vatRate * 100) / 100 : 0
    const totalAmount = subtotal + vatAmount + deliveryFees + deliveryVat

    // 5. Build invoice data
    const equipmentName = equipment.nameAr || equipment.name
    const monthLabel = `${monthNamesAr[timesheet.month - 1]} ${timesheet.year}`
    const monthLabelEn = `${monthNamesEn[timesheet.month - 1]} ${timesheet.year}`
    const itemDescription = `تأجير ${equipmentName} - ${monthLabel} - ${operatingHours} ساعة`

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

    // Calculate due date based on payment terms/duration
    const paymentDuration = timesheet.rental?.paymentDuration || contract.paymentTerms || 'net30'
    if (paymentDuration === 'immediate') {
      // due date = today
    } else if (paymentDuration === 'net15') {
      dueDate.setDate(dueDate.getDate() + 15)
    } else if (paymentDuration === 'net30') {
      dueDate.setDate(dueDate.getDate() + 30)
    } else if (paymentDuration === 'net60') {
      dueDate.setDate(dueDate.getDate() + 60)
    } else if (paymentDuration === 'net90') {
      dueDate.setDate(dueDate.getDate() + 90)
    } else {
      // Try to parse as number of days
      const days = parseInt(paymentDuration)
      if (!isNaN(days) && days > 0) {
        dueDate.setDate(dueDate.getDate() + days)
      } else {
        dueDate.setDate(dueDate.getDate() + 30)
      }
    }

    // Get clientId from rental or contract
    const clientId = timesheet.rental?.clientId || contract.clientId
    const projectId = timesheet.rental?.projectId || contract.projectId || timesheet.projectId

    // Create the SalesInvoice + update timesheet in transaction
    const invoice = await db.$transaction(async (tx: PrismaTransaction) => {
      const inv = await tx.salesInvoice.create({
        data: {
          invoiceNo,
          clientId: clientId!,
          projectId: projectId || null,
          date: invoiceDate,
          dueDate,
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
          notes: `فاتورة تأجير معدات - عقد ${contract.contractNo} - ${monthLabel}`,
          paymentTerms: contract.paymentTerms,
          contractNo: contract.contractNo,
          contractType: 'RENTAL',
          salesOrderNo: contract.salesOrderNo,
          equipmentName: equipment.nameAr || equipment.name,
          operatingHours,
          hourlyRate,
        },
        include: {
          client: {
            select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true },
          },
          project: {
            select: { id: true, name: true, nameAr: true, code: true },
          },
        },
      })

      // 6. Update timesheet status to INVOICED
      await tx.timesheet.update({
        where: { id: timesheet.id },
        data: { status: 'INVOICED' },
      })

      return inv
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('Error generating invoice from timesheet:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'فشل في إنشاء الفاتورة', detail: message }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { createSalesInvoiceJournalEntry, type PrismaTransaction } from '@/lib/auto-journal'
import { toNumber } from '@/lib/decimal'
import { NextRequest, NextResponse } from 'next/server'

// POST: Generate a SalesInvoice from an approved timesheet
// ENFORCED WORKFLOW: Contract ACTIVE → Delivery Order exists → Timesheet APPROVED → Not yet invoiced
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
            contractType: true, vatRate: true, status: true,
          },
        },
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: {
            id: true, pricingType: true, status: true,
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

    // ===== RENTAL WORKFLOW ENFORCEMENT =====

    // Step 1: Check rental contract status is ACTIVE
    if (timesheet.contract.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'يجب أن يكون عقد الإيجار نشطاً (ACTIVE) لإنشاء الفاتورة. الحالة الحالية: ' + timesheet.contract.status },
        { status: 400 }
      )
    }

    // Step 2: Check delivery order exists for this rental
    if (timesheet.rentalId) {
      const deliveryOrder = await db.equipmentDeliveryOrder.findFirst({
        where: {
          rentalId: timesheet.rentalId,
          status: { in: ['DELIVERED'] }, // Must be DELIVERED (not just PENDING)
        },
      })
      if (!deliveryOrder) {
        return NextResponse.json(
          { error: 'يجب وجود أمر توصيل مسلّم (DELIVERED) لهذا العقد قبل إنشاء الفاتورة' },
          { status: 400 }
        )
      }
    }

    // Step 3: Check timesheet status is APPROVED
    if (timesheet.status !== 'APPROVED') {
      if (timesheet.status === 'INVOICED') {
        return NextResponse.json(
          { error: 'تم إصدار فاتورة لهذا التايم شيت بالفعل' },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: 'يجب اعتماد التايم شيت أولاً قبل إنشاء الفاتورة' },
        { status: 400 }
      )
    }

    // Step 4: Check timesheet.invoiced === false
    if (timesheet.invoiced) {
      return NextResponse.json(
        { error: 'تم تعليم التايم شيت كمفوتر بالفعل' },
        { status: 400 }
      )
    }

    // Also check if invoice already exists via relation
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
    const hourlyRate = toNumber(timesheet.rental?.hourlyRate || contract.hourlyRate || 0)
    const operatingHours = toNumber(timesheet.operatingHours)
    const subtotal = operatingHours * hourlyRate
    const vatRate = toNumber(contract.vatRate || 0.15)
    const vatAmount = Math.round(subtotal * vatRate * 100) / 100
    const deliveryFees = toNumber(timesheet.rental?.deliveryFees || contract.deliveryFees || 0)
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

    // Create the SalesInvoice + update timesheet + auto journal in transaction
    const invoice = await db.$transaction(async (tx: PrismaTransaction) => {
      // Generate invoice number inside transaction for consistency
      const lastInvoice = await tx.salesInvoice.findFirst({
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

      // Step 5: Create the invoice.
      // P3-HIGH-009: Previously created as 'DRAFT' but the JE is posted
      // immediately (revenue recognized). A DRAFT invoice with a posted JE is
      // inconsistent — if the draft is discarded, the JE must be reversed.
      // Fix: create as 'SENT' since the JE is posted = invoice is issued.
      const inv = await tx.salesInvoice.create({
        data: {
          invoiceNo,
          clientId: clientId!,
          projectId: projectId || null,
          contractId: contract.id,
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
          status: 'SENT',
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
          includeDelivery: deliveryFees > 0,
          deliveryAmount: deliveryFees,
          deliveryFeesTaxable,
          includeVat: true,
          deliveryMonth: `${timesheet.year}-${String(timesheet.month).padStart(2, '0')}`,
          items: {
            create: [
              {
                description: itemDescription,
                descriptionEn: `Equipment Rental - ${equipment.name} - ${monthLabelEn} - ${operatingHours} hours`,
                quantity: operatingHours,
                unit: 'ساعة',
                unitPrice: hourlyRate,
                totalPrice: subtotal,
                itemType: 'RENTAL',
              },
              ...(deliveryFees > 0 ? [{
                description: `رسوم نقل وتنزيل - ${equipmentName}`,
                descriptionEn: `Delivery Fees - ${equipment.name}`,
                quantity: 1,
                unit: 'خدمة',
                unitPrice: deliveryFees,
                totalPrice: deliveryFees,
                itemType: 'DELIVERY',
              }] : []),
            ],
          },
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

      // Step 6: Mark timesheet as INVOICED, set invoiced=true and invoiceId
      await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          status: 'INVOICED',
          invoiced: true,
          invoiceId: inv.id,
        },
      })

      // Create auto journal entry (throws on failure → tx rolls back).
      await createSalesInvoiceJournalEntry(inv.id, tx)

      // Re-fetch the invoice so the response includes journalEntryId (the
      // `inv` object above was captured before createSalesInvoiceJournalEntry
      // updated it).
      const invWithJe = await tx.salesInvoice.findUnique({
        where: { id: inv.id },
        include: {
          client: {
            select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true },
          },
          project: {
            select: { id: true, name: true, nameAr: true, code: true },
          },
        },
      })

      return invWithJe!
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to generate invoice from timesheet:', error)
    return NextResponse.json(
      { error: 'Failed to generate invoice from timesheet' },
      { status: 500 }
    )
  }
}

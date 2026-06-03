import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (clientId) where.clientId = clientId
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const invoices = await db.salesInvoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        items: true,
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(invoices)
  } catch (error) {
    console.error('Error fetching sales invoices:', error)
    return NextResponse.json({ error: 'فشل في تحميل فواتير المبيعات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      clientId, projectId, contractId, date, dueDate, notes, items,
      vatRate = 0.15, discountRate = 0, discountAmount = 0,
      invoiceType = 'TAX_INVOICE', paymentTerms,
      referenceNo, contractNo, contractType, contractPeriodStart, contractPeriodEnd,
      deliveryMonth, includeDelivery = false, deliveryAmount = 0, includeVat = true,
    } = body

    if (!clientId || !date || !dueDate || !items?.length) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Calculate totals from items
    const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity * item.unitPrice)
    }, 0)
    
    const finalDiscountAmount = discountAmount || (subtotal * discountRate)
    const netAmount = subtotal - finalDiscountAmount
    const deliveryTotal = includeDelivery ? deliveryAmount : 0
    const vatAmount = includeVat ? (netAmount + deliveryTotal) * vatRate : 0
    const totalAmount = netAmount + deliveryTotal + vatAmount

    // Auto-generate invoice number based on type
    const prefixMap: Record<string, string> = {
      TAX_INVOICE: 'SRV',
      PROGRESS_CLAIM: 'PCL',
      RENTAL: 'RNT',
    }
    const prefix = prefixMap[invoiceType] || 'INV'
    const year = new Date().getFullYear()

    const lastInvoice = await db.salesInvoice.findFirst({
      where: { invoiceNo: { startsWith: `${prefix}-${year}` } },
      orderBy: { invoiceNo: 'desc' },
      select: { invoiceNo: true },
    })

    let nextNum = 1
    if (lastInvoice?.invoiceNo) {
      const match = lastInvoice.invoiceNo.match(/-(\d+)$/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const invoiceNo = `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`

    const invoice = await db.salesInvoice.create({
      data: {
        invoiceNo,
        clientId,
        projectId: projectId || null,
        contractId: contractId || null,
        date: new Date(date),
        dueDate: new Date(dueDate),
        subtotal,
        discountRate,
        discountAmount: finalDiscountAmount,
        netAmount,
        vatRate,
        vatAmount,
        totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        invoiceType,
        notes: notes || null,
        paymentTerms: paymentTerms || null,
        referenceNo: referenceNo || null,
        contractNo: contractNo || null,
        contractType: contractType || null,
        contractPeriodStart: contractPeriodStart ? new Date(contractPeriodStart) : null,
        contractPeriodEnd: contractPeriodEnd ? new Date(contractPeriodEnd) : null,
        deliveryMonth: deliveryMonth || null,
        includeDelivery,
        deliveryAmount: includeDelivery ? deliveryAmount : 0,
        includeVat,
        items: {
          create: items.map((item: { description: string; descriptionEn?: string; quantity: number; unit?: string; unitPrice: number; itemType?: string }) => ({
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

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('Error creating sales invoice:', error)
    return NextResponse.json({ error: 'فشل في إنشاء فاتورة المبيعات' }, { status: 500 })
  }
}

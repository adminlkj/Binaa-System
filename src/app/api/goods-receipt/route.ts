import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const purchaseOrderId = searchParams.get('purchaseOrderId')
    const supplierId = searchParams.get('supplierId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId
    if (supplierId) where.supplierId = supplierId
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const receipts = await db.goodsReceipt.findMany({
      where,
      include: {
        purchaseOrder: {
          select: { id: true, orderNo: true, status: true, supplierId: true },
        },
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(receipts)
  } catch (error) {
    console.error('Error fetching goods receipts:', error)
    return NextResponse.json({ error: 'فشل في تحميل إيصالات الاستلام' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { purchaseOrderId, supplierId, projectId, date, notes, items } = body

    if (!purchaseOrderId || !supplierId || !date || !items?.length) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Validate: purchaseOrderId must exist and be APPROVED
    const po = await db.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true, goodsReceipts: { include: { items: true } } },
    })

    if (!po) {
      return NextResponse.json({ error: 'أمر الشراء غير موجود' }, { status: 404 })
    }

    if (po.status !== 'APPROVED' && po.status !== 'PARTIALLY_RECEIVED') {
      return NextResponse.json(
        { error: 'لا يمكن إنشاء إيصال استلام لأمر شراء غير معتمد - يجب اعتماد أمر الشراء أولاً' },
        { status: 400 }
      )
    }

    // Auto-generate receipt number GR-XXX
    const lastReceipt = await db.goodsReceipt.findFirst({
      orderBy: { receiptNo: 'desc' },
      select: { receiptNo: true },
    })

    let nextNum = 1
    if (lastReceipt?.receiptNo) {
      const match = lastReceipt.receiptNo.match(/GR-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const receiptNo = `GR-${String(nextNum).padStart(4, '0')}`

    // Create the goods receipt with items
    const receipt = await db.goodsReceipt.create({
      data: {
        receiptNo,
        purchaseOrderId,
        supplierId,
        projectId: projectId || null,
        date: new Date(date),
        status: 'PENDING',
        notes: notes || null,
        items: {
          create: items.map((item: {
            description: string
            quantityOrdered: number
            quantityReceived: number
            quantityRemaining: number
            unitPrice: number
            totalPrice: number
            destination?: string
          }) => ({
            description: item.description,
            quantityOrdered: item.quantityOrdered,
            quantityReceived: item.quantityReceived,
            quantityRemaining: item.quantityRemaining,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice || (item.quantityReceived * item.unitPrice),
            destination: item.destination || 'INVENTORY',
          })),
        },
      },
      include: {
        purchaseOrder: {
          select: { id: true, orderNo: true, status: true },
        },
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    // Update PO status based on received items
    // Calculate total received vs ordered across all goods receipts for this PO
    const allReceipts = await db.goodsReceipt.findMany({
      where: { purchaseOrderId, status: { not: 'CANCELLED' } },
      include: { items: true },
    })

    const totalOrdered = po.items.reduce((sum, item) => sum + item.quantity, 0)
    const totalReceived = allReceipts.reduce((sum, gr) =>
      sum + gr.items.reduce((s, item) => s + item.quantityReceived, 0), 0
    )

    let newPoStatus: string
    if (totalReceived >= totalOrdered) {
      newPoStatus = 'RECEIVED'
    } else if (totalReceived > 0) {
      newPoStatus = 'PARTIALLY_RECEIVED'
    } else {
      newPoStatus = po.status
    }

    await db.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: newPoStatus },
    })

    // Handle inventory and project cost based on item destination
    for (const item of items as Array<{
      description: string
      quantityReceived: number
      unitPrice: number
      destination?: string
    }>) {
      if (item.destination === 'INVENTORY' && item.quantityReceived > 0) {
        // Try to find matching inventory item by description
        const inventoryItem = await db.inventoryItem.findFirst({
          where: { name: item.description },
        })

        if (inventoryItem) {
          // Increase inventory quantity
          await db.inventoryItem.update({
            where: { id: inventoryItem.id },
            data: {
              quantity: { increment: item.quantityReceived },
            },
          })
        }
      } else if (item.destination === 'PROJECT' && projectId && item.quantityReceived > 0) {
        // Create project cost (EquipmentCost used as project cost entry)
        const totalItemCost = item.quantityReceived * item.unitPrice
        await db.equipmentCost.create({
          data: {
            projectId,
            description: `استلام بضاعة: ${item.description} (${receiptNo})`,
            amount: totalItemCost,
            date: new Date(date),
          },
        })
      }
    }

    // Re-fetch to include updated relations
    const updatedReceipt = await db.goodsReceipt.findUnique({
      where: { id: receipt.id },
      include: {
        purchaseOrder: {
          select: { id: true, orderNo: true, status: true },
        },
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(updatedReceipt, { status: 201 })
  } catch (error) {
    console.error('Error creating goods receipt:', error)
    return NextResponse.json({ error: 'فشل في إنشاء إيصال الاستلام' }, { status: 500 })
  }
}

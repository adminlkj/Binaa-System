import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { createJournalEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { requireAccountByRole, AccountRole } from '@/lib/account-roles'

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
        project: { select: { id: true, name: true, code: true, projectType: true } },
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

    // Atomic: receipt + PO status update + inventory/project cost updates + GRNI journal entry
    // in ONE transaction. R1 enforced — every goods receipt creates a posted JE.
    // Accounting model: Dr Inventory (or Project Cost) / Cr GRNI (Goods Received Not Invoiced).
    // The GRNI liability is cleared when the supplier invoice arrives and is matched.
    const receipt = await db.$transaction(async (tx: PrismaTransaction) => {
      // Auto-generate receipt number GR-XXX
      const lastReceipt = await tx.goodsReceipt.findFirst({
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
      const created = await tx.goodsReceipt.create({
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
          purchaseOrder: { select: { id: true, orderNo: true, status: true } },
          supplier: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true, projectType: true } },
          items: true,
        },
      })

      // Update PO status based on received items
      const allReceipts = await tx.goodsReceipt.findMany({
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

      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: newPoStatus as any },
      })

      // Handle inventory and project cost based on item destination.
      // Track totals for the GRNI journal entry.
      let inventoryTotal = 0
      let projectCostTotal = 0

      for (const item of items as Array<{
        description: string
        quantityReceived: number
        unitPrice: number
        destination?: string
      }>) {
        if (item.destination === 'INVENTORY' && item.quantityReceived > 0) {
          const itemCost = item.quantityReceived * item.unitPrice
          inventoryTotal += itemCost
          // Try to find matching inventory item by description
          const inventoryItem = await tx.inventoryItem.findFirst({
            where: { name: item.description },
          })
          if (inventoryItem) {
            await tx.inventoryItem.update({
              where: { id: inventoryItem.id },
              data: { quantity: { increment: item.quantityReceived } },
            })
          }
        } else if (item.destination === 'PROJECT' && projectId && item.quantityReceived > 0) {
          const totalItemCost = item.quantityReceived * item.unitPrice
          projectCostTotal += totalItemCost
          await tx.equipmentCost.create({
            data: {
              projectId,
              description: `استلام بضاعة: ${item.description} (${receiptNo})`,
              amount: totalItemCost,
              date: new Date(date),
            },
          })
        }
      }

      // GRNI journal entry (R1: every financial operation MUST create a posted JE).
      // Dr Inventory (for inventory-destination items)
      // Dr Project Cost (for project-destination items)
      // Cr GRNI (Goods Received Not Invoiced — liability until supplier invoice arrives)
      const totalAmount = inventoryTotal + projectCostTotal
      if (totalAmount > 0) {
        const lines: { accountCode: string; debit: number; credit: number; description?: string }[] = []
        const grniAccount = await requireAccountByRole(AccountRole.GRNI, 'إيصال استلام بضاعة', tx)
        const desc = `إيصال استلام بضاعة ${receiptNo} - ${created.supplier?.name || ''}`

        if (inventoryTotal > 0) {
          const inventoryAccount = await requireAccountByRole(AccountRole.INVENTORY, 'إيصال استلام بضاعة', tx)
          lines.push({
            accountCode: inventoryAccount.code,
            debit: inventoryTotal,
            credit: 0,
            description: `استلام مخزون - ${receiptNo}`,
          })
        }
        if (projectCostTotal > 0) {
          const projectCostAccount = await requireAccountByRole(AccountRole.PROJECT_COST, 'إيصال استلام بضاعة', tx)
          lines.push({
            accountCode: projectCostAccount.code,
            debit: projectCostTotal,
            credit: 0,
            description: `تكلفة مشروع - ${receiptNo}`,
          })
        }
        lines.push({
          accountCode: grniAccount.code,
          debit: 0,
          credit: totalAmount,
          description: desc,
        })

        const je = await createJournalEntry({
          entryNo: `JE-GR-${receiptNo}-${Date.now()}`,
          date: new Date(date),
          description: `Goods Receipt ${receiptNo}`,
          descriptionAr: desc,
          lines,
          sourceType: 'GOODS_RECEIPT',
          sourceId: created.id,
        }, tx)

        await tx.goodsReceipt.update({
          where: { id: created.id },
          data: { journalEntryId: je.id },
        })
      }

      return await tx.goodsReceipt.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          purchaseOrder: { select: { id: true, orderNo: true, status: true } },
          supplier: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true, projectType: true } },
          items: true,
        },
      })
    })

    return NextResponse.json(receipt, { status: 201 })
  } catch (error) {
    console.error('Error creating goods receipt:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء إيصال الاستلام'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

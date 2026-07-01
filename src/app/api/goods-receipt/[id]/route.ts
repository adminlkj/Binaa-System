import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params

    const receipt = await db.goodsReceipt.findUnique({
      where: { id },
      include: {
        purchaseOrder: {
          select: { id: true, orderNo: true, status: true, supplierId: true },
        },
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
        purchaseInvoice: {
          select: { id: true, invoiceNo: true, status: true },
        },
      },
    })

    if (!receipt) {
      return NextResponse.json({ error: 'إيصال الاستلام غير موجود' }, { status: 404 })
    }

    return NextResponse.json(receipt)
  } catch (error) {
    console.error('Error fetching goods receipt:', error)
    return NextResponse.json({ error: 'فشل في تحميل إيصال الاستلام' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.goodsReceipt.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'إيصال الاستلام غير موجود' }, { status: 404 })
    }

    // Cannot modify after completion or if linked to a purchase invoice
    if (existing.status === 'COMPLETED') {
      // Only allow status change to CANCELLED
      if (body.status === 'CANCELLED') {
        // P5-CRIT-005 FIX: when cancelling a COMPLETED receipt, reverse the GRNI JE
        // and decrement inventory. Previously this just flipped the status with no
        // JE reversal or inventory adjustment.
        const result = await db.$transaction(async (tx: PrismaTransaction) => {
          // Reverse the GRNI JE if it exists
          if (existing.journalEntryId) {
            await reverseEntry(existing.journalEntryId, tx)
          }
          // Decrement inventory for each INVENTORY-destination item
          for (const item of existing.items) {
            if (item.destination === 'INVENTORY' && Number(item.quantityReceived) > 0) {
              // Find by name (the GR POST may have created a new item or updated existing)
              const inv = await tx.inventoryItem.findFirst({ where: { name: item.description } })
              if (inv) {
                await tx.inventoryItem.update({
                  where: { id: inv.id },
                  data: { quantity: { decrement: item.quantityReceived } },
                })
              }
              // Delete the corresponding StockMovement record
              await tx.stockMovement.deleteMany({
                where: {
                  reference: existing.receiptNo,
                  inventoryItemId: inv?.id,
                  movementType: 'RECEIPT',
                },
              })
            }
          }
          return await tx.goodsReceipt.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: {
              purchaseOrder: { select: { id: true, orderNo: true, status: true } },
              supplier: { select: { id: true, name: true, code: true } },
              project: { select: { id: true, name: true, code: true } },
              items: true,
            },
          })
        })
        return NextResponse.json(result)
      }
      return NextResponse.json(
        { error: 'لا يمكن تعديل إيصال استلام مكتمل' },
        { status: 400 }
      )
    }

    // Cannot modify cancelled
    if (existing.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'لا يمكن تعديل إيصال استلام ملغي' },
        { status: 400 }
      )
    }

    // Check if linked to a purchase invoice
    const linkedInvoice = await db.purchaseInvoice.findUnique({
      where: { goodsReceiptId: id },
    })
    if (linkedInvoice && body.items) {
      return NextResponse.json(
        { error: 'لا يمكن تعديل إيصال استلام مرتبط بفاتورة مشتريات' },
        { status: 400 }
      )
    }

    // Handle status change
    if (body.status && body.status === 'COMPLETED') {
      const updated = await db.goodsReceipt.update({
        where: { id },
        data: { status: 'COMPLETED' },
        include: {
          purchaseOrder: { select: { id: true, orderNo: true, status: true } },
          supplier: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          items: true,
        },
      })
      return NextResponse.json(updated)
    }

    // P5-CRIT-005 FIX: Forbid item edits after the GRNI JE is posted.
    // Editing items would require: decrement old inventory, reverse old JE,
    // increment new inventory, create new JE. This is complex and error-prone.
    // Instead, require DELETE + recreate.
    if (body.items && existing.journalEntryId) {
      return NextResponse.json(
        { error: 'لا يمكن تعديل بنود إيصال استلام بعد ترحيل القيد — احذف الإيصال وأعد إنشائه' },
        { status: 400 }
      )
    }

    // General update (notes, date, status only — no item edits after JE posted)
    const updateData: Record<string, unknown> = {}
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.date !== undefined) updateData.date = new Date(body.date)
    if (body.status !== undefined) updateData.status = body.status

    const updated = await db.goodsReceipt.update({
      where: { id },
      data: updateData,
      include: {
        purchaseOrder: { select: { id: true, orderNo: true, status: true } },
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating goods receipt:', error)
    return NextResponse.json({ error: 'فشل في تحديث إيصال الاستلام' }, { status: 500 })
  }
}

// P5-CRIT-004 FIX: DELETE must reverse the GRNI JE and decrement inventory.
// Previously the DELETE hard-deleted the receipt but left the JE POSTED in the GL
// and inventory quantities inflated forever.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.goodsReceipt.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'إيصال الاستلام غير موجود' }, { status: 404 })
    }

    // Cannot delete completed receipts
    if (existing.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'لا يمكن حذف إيصال استلام مكتمل — استخدم الإلغاء بدلاً من ذلك' },
        { status: 400 }
      )
    }

    // Cannot delete if linked to a purchase invoice
    const linkedInvoice = await db.purchaseInvoice.findUnique({
      where: { goodsReceiptId: id },
    })
    if (linkedInvoice) {
      return NextResponse.json(
        { error: 'لا يمكن حذف إيصال استلام مرتبط بفاتورة مشتريات' },
        { status: 400 }
      )
    }

    // Reverse the GRNI JE + decrement inventory + delete StockMovements + hard-delete receipt
    await db.$transaction(async (tx: PrismaTransaction) => {
      // 1. Reverse the GRNI journal entry (if any)
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }

      // 2. Decrement inventory for each INVENTORY-destination item + delete StockMovements
      for (const item of existing.items) {
        if (item.destination === 'INVENTORY' && Number(item.quantityReceived) > 0) {
          // Find the inventory item (by explicit link or by name)
          let inv: { id: string } | null = null
          if (item.inventoryItemId) {
            inv = await tx.inventoryItem.findUnique({ where: { id: item.inventoryItemId } })
          }
          if (!inv) {
            inv = await tx.inventoryItem.findFirst({ where: { name: item.description } })
          }
          if (inv) {
            await tx.inventoryItem.update({
              where: { id: inv.id },
              data: { quantity: { decrement: toNumber(item.quantityReceived) } },
            })
          }
          // Delete StockMovement records tied to this receipt
          await tx.stockMovement.deleteMany({
            where: {
              reference: existing.receiptNo,
              movementType: 'RECEIPT',
            },
          })
        }
      }

      // 3. Delete EquipmentCost records created by this GR (PROJECT-destination items)
      // They have journalEntryId pointing to the GRNI JE
      if (existing.journalEntryId) {
        await tx.equipmentCost.deleteMany({
          where: { journalEntryId: existing.journalEntryId },
        })
      }

      // 4. Delete items then the receipt
      await tx.goodsReceiptItem.deleteMany({ where: { goodsReceiptId: id } })
      await tx.goodsReceipt.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف إيصال الاستلام بنجاح' })
  } catch (error) {
    console.error('Error deleting goods receipt:', error)
    return NextResponse.json({ error: 'فشل في حذف إيصال الاستلام' }, { status: 500 })
  }
}

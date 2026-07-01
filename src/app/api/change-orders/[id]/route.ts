import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params
    const changeOrder = await db.changeOrder.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
      },
    })

    if (!changeOrder) {
      return NextResponse.json({ error: 'أمر التغيير غير موجود' }, { status: 404 })
    }

    return NextResponse.json({
      ...changeOrder,
      originalValue: Number(changeOrder.originalValue),
      changeValue: Number(changeOrder.changeValue),
      newValue: Number(changeOrder.newValue),
      vatAmount: Number(changeOrder.vatAmount),
      totalChangeValue: Number(changeOrder.totalChangeValue),
    })
  } catch (error) {
    console.error('Error fetching change order:', error)
    return NextResponse.json({ error: 'فشل في تحميل أمر التغيير' }, { status: 500 })
  }
}

// ============ PUT: Update a change order ============
// P2-CRIT-001 fix: When status transitions to APPROVED, atomically update:
//   - Contract.value += changeValue
//   - Contract.vatAmount += vatAmount
//   - Contract.totalValue += totalChangeValue
//   - Project.contractValue += totalChangeValue
// When status transitions from APPROVED → DRAFT/REJECTED, reverse the propagation.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.changeOrder.findUnique({
      where: { id },
      include: {
        contract: { select: { id: true, value: true, vatAmount: true, totalValue: true } },
      },
    })
    if (!existing) {
      return NextResponse.json({ error: 'أمر التغيير غير موجود' }, { status: 404 })
    }

    // Use Decimal for financial precision (P2-CRIT-008 fix)
    const changeValue = body.changeValue != null
      ? new Prisma.Decimal(body.changeValue)
      : existing.changeValue
    const vatRate = existing.vatRate
    const vatAmount = changeValue.mul(vatRate).toDecimalPlaces(2)
    const totalChangeValue = changeValue.add(vatAmount).toDecimalPlaces(2)
    const originalValue = body.originalValue != null
      ? new Prisma.Decimal(body.originalValue)
      : existing.originalValue
    const newValue = originalValue.add(changeValue)

    const newStatus = body.status || existing.status
    const wasApproved = existing.status === 'APPROVED'
    const willBeApproved = newStatus === 'APPROVED'

    // Atomic: update change order + propagate to contract + project (P2-CRIT-001 fix)
    const changeOrder = await db.$transaction(async (tx) => {
      const updated = await tx.changeOrder.update({
        where: { id },
        data: {
          description: body.description !== undefined ? body.description : existing.description,
          changeType: body.changeType || existing.changeType,
          originalValue,
          changeValue,
          newValue,
          vatAmount,
          totalChangeValue,
          status: newStatus,
          notes: body.notes !== undefined ? (body.notes || null) : existing.notes,
          approvedDate: newStatus === 'APPROVED' ? new Date() : existing.approvedDate,
          approvedBy: body.approvedBy !== undefined ? body.approvedBy : existing.approvedBy,
          date: body.date ? new Date(body.date) : existing.date,
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          contract: { select: { id: true, contractNo: true } },
        },
      })

      // P2-CRIT-001: Propagate change value to contract + project on APPROVED transition
      if (!wasApproved && willBeApproved) {
        // Approving: add the change value
        await tx.contract.update({
          where: { id: existing.contractId },
          data: {
            value: { increment: changeValue },
            vatAmount: { increment: vatAmount },
            totalValue: { increment: totalChangeValue },
          },
        })
        await tx.project.update({
          where: { id: existing.projectId },
          data: { contractValue: { increment: totalChangeValue } },
        })
      } else if (wasApproved && !willBeApproved) {
        // Un-approving (back to DRAFT or REJECTED): reverse the propagation
        await tx.contract.update({
          where: { id: existing.contractId },
          data: {
            value: { decrement: changeValue },
            vatAmount: { decrement: vatAmount },
            totalValue: { decrement: totalChangeValue },
          },
        })
        await tx.project.update({
          where: { id: existing.projectId },
          data: { contractValue: { decrement: totalChangeValue } },
        })
      }
      // If wasApproved && willBeApproved (re-approval with different amount):
      // reverse the OLD value, then apply the NEW value
      else if (wasApproved && willBeApproved && !changeValue.equals(existing.changeValue)) {
        const oldChangeValue = existing.changeValue
        const oldVatAmount = oldChangeValue.mul(vatRate).toDecimalPlaces(2)
        const oldTotalChangeValue = oldChangeValue.add(oldVatAmount).toDecimalPlaces(2)
        // Reverse old
        await tx.contract.update({
          where: { id: existing.contractId },
          data: {
            value: { decrement: oldChangeValue },
            vatAmount: { decrement: oldVatAmount },
            totalValue: { decrement: oldTotalChangeValue },
          },
        })
        await tx.project.update({
          where: { id: existing.projectId },
          data: { contractValue: { decrement: oldTotalChangeValue } },
        })
        // Apply new
        await tx.contract.update({
          where: { id: existing.contractId },
          data: {
            value: { increment: changeValue },
            vatAmount: { increment: vatAmount },
            totalValue: { increment: totalChangeValue },
          },
        })
        await tx.project.update({
          where: { id: existing.projectId },
          data: { contractValue: { increment: totalChangeValue } },
        })
      }

      return updated
    })

    return NextResponse.json({
      ...changeOrder,
      originalValue: Number(changeOrder.originalValue),
      changeValue: Number(changeOrder.changeValue),
      newValue: Number(changeOrder.newValue),
      vatAmount: Number(changeOrder.vatAmount),
      totalChangeValue: Number(changeOrder.totalChangeValue),
    })
  } catch (error) {
    console.error('Error updating change order:', error)
    return NextResponse.json({ error: 'فشل في تحديث أمر التغيير' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.changeOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'أمر التغيير غير موجود' }, { status: 404 })
    }

    if (existing.status !== 'DRAFT') {
      return NextResponse.json({ error: 'لا يمكن حذف أمر التغيير إلا في حالة المسودة' }, { status: 400 })
    }

    await db.changeOrder.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting change order:', error)
    return NextResponse.json({ error: 'فشل في حذف أمر التغيير' }, { status: 500 })
  }
}

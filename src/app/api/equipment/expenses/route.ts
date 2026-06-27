import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryEquipmentCost, type PrismaTransaction } from '@/lib/accounting/engine'

// Map ExpenseCategory to costType for autoEntryEquipmentCost
function mapCategoryToCostType(category: string): 'OPERATION' | 'MAINTENANCE' | 'FUEL' | 'OTHER' {
  switch (category) {
    case 'MAINTENANCE':
      return 'MAINTENANCE'
    case 'FUEL':
      return 'FUEL'
    case 'TRANSPORT':
    case 'DELIVERY':
      return 'OTHER'
    default:
      return 'OTHER'
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')

    const expenses = await db.equipmentExpense.findMany({
      where: equipmentId ? { equipmentId } : {},
      include: {
        equipment: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(expenses)
  } catch (error) {
    console.error('Error fetching equipment expenses:', error)
    return NextResponse.json({ error: 'فشل في تحميل مصروفات المعدات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const amount = parseFloat(body.amount) || 0
    const expenseDate = new Date(body.date)

    // Atomic: expense record + JE + journalEntryId link in one transaction.
    // R1 enforced — if the JE fails, the expense record is rolled back too.
    const expense = await db.$transaction(async (tx: PrismaTransaction) => {
      const created = await tx.equipmentExpense.create({
        data: {
          equipmentId: body.equipmentId,
          category: body.category,
          description: body.description,
          amount,
          date: expenseDate,
          reference: body.reference || null,
        },
        include: {
          equipment: {
            select: { id: true, code: true, name: true },
          },
        },
      })

      const costType = mapCategoryToCostType(body.category)
      const payFrom: 'CASH' | 'AP' = body.payFrom === 'AP' ? 'AP' : 'CASH'

      const journalEntry = await autoEntryEquipmentCost({
        equipmentName: created.equipment.name,
        costType,
        amount,
        date: expenseDate,
        payFrom,
        costCenterId: body.costCenterId || undefined,
      }, tx)

      if (journalEntry?.id) {
        await tx.equipmentExpense.update({
          where: { id: created.id },
          data: { journalEntryId: journalEntry.id },
        })
      }

      return await tx.equipmentExpense.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          equipment: {
            select: { id: true, code: true, name: true },
          },
        },
      })
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment expense:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء مصروف المعدة'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

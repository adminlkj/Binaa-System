import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryEquipmentCost } from '@/lib/accounting/engine'

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

    const expense = await db.equipmentExpense.create({
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

    // Create accounting entry via autoEntryEquipmentCost
    try {
      const costType = mapCategoryToCostType(body.category)
      const payFrom: 'CASH' | 'AP' = body.payFrom === 'AP' ? 'AP' : 'CASH'

      const journalEntry = await autoEntryEquipmentCost({
        equipmentName: expense.equipment.name,
        costType,
        amount,
        date: expenseDate,
        payFrom,
        costCenterId: body.costCenterId || undefined,
      })

      // Store journalEntryId on the expense
      if (journalEntry?.id) {
        await db.equipmentExpense.update({
          where: { id: expense.id },
          data: { journalEntryId: journalEntry.id },
        })
      }
    } catch (accountingError) {
      console.error('Accounting entry failed for equipment expense:', accountingError)
      // Don't fail the expense creation if accounting fails
    }

    // Re-fetch with journalEntryId
    const updatedExpense = await db.equipmentExpense.findUnique({
      where: { id: expense.id },
      include: {
        equipment: {
          select: { id: true, code: true, name: true },
        },
      },
    })

    return NextResponse.json(updatedExpense || expense, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment expense:', error)
    return NextResponse.json({ error: 'فشل في إنشاء مصروف المعدة' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { postJournalEntry, getNextEntryNo } from '@/lib/accounting/guard'

// Type-to-account mapping for provisions
const PROVISION_TYPE_ACCOUNT_MAP: Record<string, { expenseCode: string; provisionCode: string; name: string }> = {
  END_OF_SERVICE: { expenseCode: '8110', provisionCode: '3710', name: 'End of Service Benefits' },
  WARRANTY: { expenseCode: '7400', provisionCode: '3720', name: 'Warranty Provision' },
  MAINTENANCE: { expenseCode: '7220', provisionCode: '3730', name: 'Equipment Maintenance Provision' },
  OTHER: { expenseCode: '8630', provisionCode: '3710', name: 'Other Provision' },
}

export async function GET() {
  try {
    const provisions = await db.provision.findMany({
      include: {
        movements: { orderBy: { date: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ data: provisions })
  } catch (error) {
    console.error('Error fetching provisions:', error)
    return NextResponse.json({ error: 'Failed to fetch provisions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, name, nameAr, type, totalAmount, startDate } = body

    if (!code || !name || !type || !totalAmount || !startDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const amount = Number(totalAmount)

    // Get the account mapping for this provision type
    const accountMap = PROVISION_TYPE_ACCOUNT_MAP[type]
    if (!accountMap) {
      return NextResponse.json({ error: `Invalid provision type: ${type}` }, { status: 400 })
    }

    const expenseAccount = await db.account.findUnique({ where: { code: accountMap.expenseCode } })
    const provisionAccount = await db.account.findUnique({ where: { code: accountMap.provisionCode } })

    // Create the provision
    const provision = await db.provision.create({
      data: {
        code,
        name,
        nameAr: nameAr || null,
        type,
        totalAmount: amount,
        currentBalance: amount,
        startDate: new Date(startDate),
        status: 'ACTIVE',
      },
    })

    // Create a journal entry via the unbreakable guard: Dr Expense Account / Cr Provision Account
    let journalEntryId: string | null = null

    if (expenseAccount && provisionAccount) {
      const entry = await postJournalEntry({
        entryNo: await getNextEntryNo(),
        date: new Date(startDate),
        description: `Provision for ${name} (${type})`,
        sourceType: 'PROVISION',
        sourceId: provision.id,
        lines: [
          { accountId: expenseAccount.id, debit: amount, credit: 0, description: `Provision expense - ${name}` },
          { accountId: provisionAccount.id, debit: 0, credit: amount, description: `Provision liability - ${name}` },
        ],
      })
      journalEntryId = entry.id

      await db.provision.update({
        where: { id: provision.id },
        data: { journalEntryId },
      })
    }

    // Create initial movement
    await db.provisionMovement.create({
      data: {
        provisionId: provision.id,
        amount,
        movementType: 'INCREASE',
        date: new Date(startDate),
        description: `Initial provision for ${name}`,
        journalEntryId,
      },
    })

    return NextResponse.json({
      data: provision,
      journalEntryId,
      message: 'Provision created successfully',
    })
  } catch (error) {
    console.error('Error creating provision:', error)
    return NextResponse.json({ error: 'Failed to create provision' }, { status: 500 })
  }
}

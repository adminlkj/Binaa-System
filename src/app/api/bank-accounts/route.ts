import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const bankAccounts = await db.bankAccount.findMany({
      where: { isActive: true },
      include: {
        transactions: { orderBy: { date: 'desc' } },
        _count: { select: { reconciliations: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Calculate balance from journal lines for each bank account's linked GL account
    const enrichedAccounts = await Promise.all(
      bankAccounts.map(async (account) => {
        let balance = 0

        if (account.accountId) {
          // Calculate from journal lines
          const lines = await db.journalLine.findMany({
            where: {
              accountId: account.accountId,
              deletedAt: null,
              journalEntry: { status: 'POSTED', deletedAt: null },
            },
          })
          // Bank accounts are ASSET (debit normal)
          balance = lines.reduce((s, l) => s + Number(l.debit || 0) - Number(l.credit || 0), 0)
        }

        return {
          ...account,
          calculatedBalance: balance,
        }
      })
    )

    return NextResponse.json({ data: enrichedAccounts })
  } catch (error) {
    console.error('Error fetching bank accounts:', error)
    return NextResponse.json({ error: 'Failed to fetch bank accounts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { bankName, accountName, accountNumber, iban, currency, accountId } = body

    if (!bankName || !accountName || !accountNumber) {
      return NextResponse.json({ error: 'bankName, accountName, and accountNumber are required' }, { status: 400 })
    }

    const bankAccount = await db.bankAccount.create({
      data: {
        bankName,
        accountName,
        accountNumber,
        iban: iban || null,
        currency: currency || 'SAR',
        accountId: accountId || null,
        isActive: true,
      },
    })

    return NextResponse.json({
      data: bankAccount,
      message: 'Bank account created successfully',
    })
  } catch (error) {
    console.error('Error creating bank account:', error)
    return NextResponse.json({ error: 'Failed to create bank account' }, { status: 500 })
  }
}

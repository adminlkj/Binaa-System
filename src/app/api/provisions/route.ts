import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { postJournalEntry, getNextEntryNo } from '@/lib/accounting/guard'
import { requireAccountCodeByRole, AccountRole } from '@/lib/account-roles'
import { type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// Provisions API
// ----------------------------------------------------------------------------
// P1-2 HIGH-2 FIX: previously the POST handler made 4 separate non-tx DB calls
// (create provision, postJournalEntry, update provision.journalEntryId, create
// ProvisionMovement) — if any call failed mid-way the GL would be left
// inconsistent (provision created without JE, or JE posted without movement,
// etc.).
//
// Also previously used hardcoded account codes (PROVISION_TYPE_ACCOUNT_MAP) —
// BA-08 violation. Now uses requireAccountCodeByRole() so the accountant can
// change the actual account mapped to each role from the Chart of Accounts UI
// without touching code.
//
// All 4 operations now run inside db.$transaction. getNextEntryNo(tx) is
// called inside the tx (HARD-REQUIRES tx per P1-0).
// ============================================================================

// Map provision type → { expenseRole, provisionRole }
// The provisionRole is EOS_PROVISION for all types (it's the only provision
// role defined in account-roles.ts); the accountant can map different accounts
// to it per company. The expenseRole is type-specific.
const PROVISION_TYPE_ROLE_MAP: Record<string, { expenseRole: string; provisionRole: string; name: string }> = {
  END_OF_SERVICE: { expenseRole: AccountRole.PAYROLL_EXPENSE, provisionRole: AccountRole.EOS_PROVISION, name: 'End of Service Benefits' },
  WARRANTY:       { expenseRole: AccountRole.ADMIN_EXPENSE,   provisionRole: AccountRole.EOS_PROVISION, name: 'Warranty Provision' },
  MAINTENANCE:    { expenseRole: AccountRole.MAINTENANCE_EXPENSE, provisionRole: AccountRole.EOS_PROVISION, name: 'Equipment Maintenance Provision' },
  OTHER:          { expenseRole: AccountRole.ADMIN_EXPENSE,   provisionRole: AccountRole.EOS_PROVISION, name: 'Other Provision' },
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
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'totalAmount must be a positive number' }, { status: 400 })
    }

    const roleMap = PROVISION_TYPE_ROLE_MAP[type]
    if (!roleMap) {
      return NextResponse.json({ error: `Invalid provision type: ${type}` }, { status: 400 })
    }

    // P1-2 HIGH-2 FIX: all 4 operations (create provision, post JE, link JE,
    // create movement) run inside a single db.$transaction. If any step fails,
    // the entire operation rolls back — no orphan JEs, no orphan provisions.
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // 1. Create the provision record
      const provision = await tx.provision.create({
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

      // 2. Resolve the expense + provision account codes by role (no hardcoding).
      //    BA-08 compliant: the accountant can re-map roles → accounts from the UI.
      const expenseCode = await requireAccountCodeByRole(roleMap.expenseRole, 'Provision POST', tx)
      const provisionCode = await requireAccountCodeByRole(roleMap.provisionRole, 'Provision POST', tx)

      // Look up the account IDs (postJournalEntry accepts either accountId or accountCode on each line;
      // we use accountId for explicitness)
      const [expenseAccount, provisionAccount] = await Promise.all([
        tx.account.findUnique({ where: { code: expenseCode } }),
        tx.account.findUnique({ where: { code: provisionCode } }),
      ])
      if (!expenseAccount) {
        throw new Error(`حساب المصروف برقم ${expenseCode} غير موجود — تحقق من دليل الحسابات`)
      }
      if (!provisionAccount) {
        throw new Error(`حساب المخصص برقم ${provisionCode} غير موجود — تحقق من دليل الحسابات`)
      }

      // 3. Post the JE via the unbreakable guard (R1-R12 enforced).
      //    getNextEntryNo(tx) HARD-REQUIRES tx — uses the Sequence table for race-safe numbering.
      const entry = await postJournalEntry({
        entryNo: await getNextEntryNo(tx),
        date: new Date(startDate),
        description: `Provision for ${name} (${type})`,
        sourceType: 'PROVISION',
        sourceId: provision.id,
        lines: [
          { accountId: expenseAccount.id, debit: amount, credit: 0, description: `Provision expense - ${name}` },
          { accountId: provisionAccount.id, debit: 0, credit: amount, description: `Provision liability - ${name}` },
        ],
      }, tx)

      // 4. Link the JE back to the provision
      await tx.provision.update({
        where: { id: provision.id },
        data: { journalEntryId: entry.id },
      })

      // 5. Create the initial INCREASE movement (audit trail)
      await tx.provisionMovement.create({
        data: {
          provisionId: provision.id,
          amount,
          movementType: 'INCREASE',
          date: new Date(startDate),
          description: `Initial provision for ${name}`,
          journalEntryId: entry.id,
        },
      })

      return { provision, journalEntryId: entry.id }
    })

    return NextResponse.json({
      data: result.provision,
      journalEntryId: result.journalEntryId,
      message: 'Provision created successfully',
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating provision:', error)
    const message = error instanceof Error ? error.message : 'Failed to create provision'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { ACCOUNT_ROLES, AccountRoleKey } from '@/lib/account-roles'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Get the account
    const account = await db.account.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, nameAr: true, type: true },
    })

    if (!account) {
      return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
    }

    // Build date filter
    const dateFilter: Record<string, Date> = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) dateFilter.lte = new Date(endDate)

    // Get journal lines for this account
    const whereClause: Record<string, unknown> = {
      accountId: id,
      deletedAt: null,
    }
    if (startDate || endDate) {
      whereClause.journalEntry = { status: 'POSTED', deletedAt: null, date: dateFilter }
    } else {
      whereClause.journalEntry = { status: 'POSTED', deletedAt: null }
    }

    const lines = await db.journalLine.findMany({
      where: whereClause,
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNo: true,
            date: true,
            description: true,
            status: true,
          },
        },
      },
      orderBy: {
        journalEntry: { date: 'asc' },
      },
    })

    // Calculate running balance
    // For ASSET/EXPENSE: debit increases, credit decreases
    // For LIABILITY/EQUITY/REVENUE: credit increases, debit decreases
    const isDebitNormal = account.type === 'ASSET' || account.type === 'EXPENSE'

    let runningBalance = 0
    const statement = lines.map(line => {
      const debit = toNumber(line.debit)
      const credit = toNumber(line.credit)
      if (isDebitNormal) {
        runningBalance += debit - credit
      } else {
        runningBalance += credit - debit
      }
      return {
        id: line.id,
        entryNo: line.journalEntry.entryNo,
        date: line.journalEntry.date,
        description: line.journalEntry.description,
        lineDescription: line.description,
        debit,
        credit,
        balance: runningBalance,
        status: line.journalEntry.status,
      }
    })

    // Calculate totals
    const totalDebit = lines.reduce((s, l) => s + toNumber(l.debit), 0)
    const totalCredit = lines.reduce((s, l) => s + toNumber(l.credit), 0)

    return NextResponse.json(serializeDecimal({
      account,
      lines: statement,
      totalDebit,
      totalCredit,
      closingBalance: runningBalance,
    }))
  } catch (error) {
    console.error('Error fetching account statement:', error)
    return NextResponse.json({ error: 'فشل في تحميل كشف الحساب' }, { status: 500 })
  }
}

// ============================================================================
// PUT /api/accounts/[id]
// Updates an account, including the accountRole field
// Body: { accountRole?: string, name?: string, nameAr?: string, ... }
// ============================================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Verify the account exists
    const existing = await db.account.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'الحساب غير موجود' },
        { status: 404 }
      )
    }

    // Validate accountRole if provided
    if (body.accountRole !== undefined && body.accountRole !== null) {
      const validRoles = Object.keys(ACCOUNT_ROLES) as AccountRoleKey[]
      if (!validRoles.includes(body.accountRole as AccountRoleKey)) {
        return NextResponse.json(
          { error: `دور الحساب غير صالح: ${body.accountRole}. الأدوار المسموحة: ${validRoles.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Build update data - only include fields that are provided
    const updateData: Record<string, unknown> = {}
    if (body.accountRole !== undefined) updateData.accountRole = body.accountRole || null
    if (body.name !== undefined) updateData.name = body.name
    if (body.nameAr !== undefined) updateData.nameAr = body.nameAr || null
    if (body.isActive !== undefined) updateData.isActive = body.isActive
    if (body.allowPosting !== undefined) updateData.allowPosting = body.allowPosting
    if (body.activityType !== undefined) updateData.activityType = body.activityType || null
    if (body.description !== undefined) updateData.description = body.description || null
    if (body.descriptionAr !== undefined) updateData.descriptionAr = body.descriptionAr || null

    const updated = await db.account.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        type: true,
        parentId: true,
        parentCode: true,
        isActive: true,
        activityType: true,
        accountRole: true,
        isSystem: true,
        allowPosting: true,
        level: true,
        description: true,
        descriptionAr: true,
      },
    })

    return NextResponse.json({
      message: 'تم تحديث الحساب بنجاح',
      account: updated,
    })
  } catch (error) {
    console.error('Error updating account:', error)
    return NextResponse.json(
      { error: 'فشل في تحديث الحساب' },
      { status: 500 }
    )
  }
}

// ============================================================================
// DELETE /api/accounts/[id]
// Rule 3: Prevent deleting accounts with journal lines or children
// ============================================================================
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify the account exists
    const existing = await db.account.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'الحساب غير موجود' },
        { status: 404 }
      )
    }

    // Check if account has children
    const childCount = await db.account.count({ where: { parentId: id } })
    if (childCount > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف حساب لديه حسابات فرعية - قم بتعطيله بدلاً من ذلك' },
        { status: 400 }
      )
    }

    // Check if account has journal lines
    const lineCount = await db.journalLine.count({ where: { accountId: id } })
    if (lineCount > 0) {
      // Instead of deleting, deactivate the account
      await db.account.update({
        where: { id },
        data: { isActive: false },
      })
      return NextResponse.json({
        message: 'تم تعطيل الحساب بدلاً من حذفه لوجود حركات محاسبية مرتبطة',
        deactivated: true,
      })
    }

    // Safe to delete - no children, no journal lines
    await db.account.delete({ where: { id } })
    return NextResponse.json({
      message: 'تم حذف الحساب بنجاح',
      deleted: true,
    })
  } catch (error) {
    console.error('Error deleting account:', error)
    return NextResponse.json(
      { error: 'فشل في حذف الحساب' },
      { status: 500 }
    )
  }
}

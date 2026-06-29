import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { createJournalEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { getDefaultAccountByRole, requireAccountByRole, AccountRole } from '@/lib/account-roles'

// ============================================================================
// سداد الرواتب — Salary Payments
// P4-CRIT-001 FIX: previously the route created/updated `Salary` records, NOT
// `SalaryPayment` records — the entire SalaryPayment subledger was empty.
// P4-CRIT-004 FIX: previously re-paying an already-PAID salary was allowed
// (only the entryNo @unique collision masked the bug). Now explicit idempotency.
// Now:
//   - POST creates a SalaryPayment record (payrollRunId optional, employeeId required)
//   - Idempotency: blocks re-payment if Salary is already PAID
//   - JE: Dr SALARIES_PAYABLE / Cr Cash (settles the liability accrued at salary APPROVE)
//   - Updates Salary.status to PAID if the salary is fully paid
//   - GET queries SalaryPayment records (not Salary)
// ============================================================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const payrollRunId = searchParams.get('payrollRunId')

    const where: Record<string, unknown> = {}
    if (employeeId) where.employeeId = employeeId
    if (payrollRunId) where.payrollRunId = payrollRunId

    const payments = await db.salaryPayment.findMany({
      where,
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true, profession: true } },
        payrollRun: { select: { id: true, code: true, month: true, year: true, status: true } },
      },
      orderBy: { paymentDate: 'desc' },
    })

    return NextResponse.json(payments)
  } catch (error) {
    console.error('Error fetching salary payments:', error)
    return NextResponse.json({ error: 'فشل في تحميل سداد الرواتب' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const paymentMethod = body.paymentMethod || 'BANK'
    // L3B-CRIT-005 FIX: accept BOTH `reference` (API field) and `referenceNumber` (UI field).
    const reference = body.reference || body.referenceNumber || null
    const notes = body.notes || null
    const payingAccountCode = body.payingAccountCode || null
    const payingAccountName = body.payingAccountName || null
    const payrollRunId = body.payrollRunId || null

    // L3B-CRIT-005 FIX: support the "pay full payroll run" model used by the UI.
    // If `payrollRunId` is provided without `employeeId`, iterate over all the run's
    // lines and create a SalaryPayment per employee + a consolidated payment JE.
    if (payrollRunId && !body.employeeId) {
      const run = await db.payrollRun.findUnique({
        where: { id: payrollRunId },
        include: {
          lines: {
            include: { employee: { select: { id: true, code: true, name: true, nameAr: true, profession: true } } },
          },
        },
      })
      if (!run) {
        return NextResponse.json({ error: 'مسير الرواتب غير موجود' }, { status: 404 })
      }
      if (run.status !== 'APPROVED' && run.status !== 'PARTIALLY_PAID') {
        return NextResponse.json({ error: `يجب اعتماد المسير أولاً (الحالة الحالية: ${run.status})` }, { status: 400 })
      }

      // Resolve the credit (cash/bank) account once for the whole run.
      const resolveCreditAccount = async (tx?: PrismaTransaction) => {
        if (payingAccountCode) {
          return { code: payingAccountCode, name: payingAccountName || 'الحساب المحدد' }
        }
        const role = paymentMethod === 'BANK' ? 'BANK' : 'CASH'
        const acc = await getDefaultAccountByRole(role, tx as any)
        if (acc) {
          return { code: acc.code, name: acc.nameAr || acc.name }
        }
        return paymentMethod === 'BANK'
          ? { code: '1120', name: 'البنك' }
          : { code: '1110', name: 'الصندوق (الخزينة)' }
      }

      const totalNet = Number(run.totalNet)
      if (totalNet <= 0) {
        return NextResponse.json({ error: 'صافي الرواتب يجب أن يكون أكبر من صفر' }, { status: 400 })
      }

      const createdPayments: Array<{ id: string; employeeId: string; amount: number }> = []

      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const creditAccount = await resolveCreditAccount(tx)
        const payableAccount = await requireAccountByRole(AccountRole.SALARIES_PAYABLE, 'سداد مسير رواتب', tx)

        // Create one SalaryPayment per line (skip employees already PAID).
        for (const line of run.lines) {
          const lineNet = Number(line.netSalary)
          if (lineNet <= 0) continue

          // Skip if this employee already has a payment for this run.
          const alreadyPaid = await tx.salaryPayment.findFirst({
            where: { payrollRunId, employeeId: line.employeeId },
            select: { id: true },
          })
          if (alreadyPaid) continue

          const salaryPayment = await tx.salaryPayment.create({
            data: {
              payrollRunId,
              employeeId: line.employeeId,
              amount: lineNet,
              paymentDate: new Date(),
              paymentMethod,
              reference,
              notes,
            },
          })

          // Find the matching Salary record to flip it to PAID.
          const salary = await tx.salary.findFirst({
            where: { employeeId: line.employeeId, month: run.month, year: run.year, deletedAt: null },
            select: { id: true, status: true },
          })
          if (salary && salary.status === 'APPROVED') {
            await tx.salary.update({
              where: { id: salary.id },
              data: { status: 'PAID' },
            })
          }

          createdPayments.push({ id: salaryPayment.id, employeeId: line.employeeId, amount: lineNet })
        }

        if (createdPayments.length === 0) {
          throw new Error('جميع رواتب المسير مدفوعة بالفعل')
        }

        // Single consolidated JE for the whole payment batch.
        const entry = await createJournalEntry({
          entryNo: `JE-SAL-PAYRUN-${run.code}-${Date.now()}`,
          date: new Date(),
          description: `سداد مسير رواتب ${run.code} - ${run.month}/${run.year}`,
          descriptionAr: `سداد مسير رواتب ${run.code} - ${run.month}/${run.year}`,
          lines: [
            { accountCode: payableAccount.code, debit: totalNet, credit: 0, description: 'سداد رواتب مستحقة' },
            { accountCode: creditAccount.code, debit: 0, credit: totalNet, description: creditAccount.name },
          ],
          sourceType: 'SALARY_PAYMENT',
          sourceId: run.code,
        }, tx)

        // Link JE to all created SalaryPayment records.
        for (const p of createdPayments) {
          await tx.salaryPayment.update({
            where: { id: p.id },
            data: { journalEntryId: entry.id },
          })
        }

        // Mark the run as PAID.
        await tx.payrollRun.update({
          where: { id: payrollRunId },
          data: {
            status: 'PAID',
            paymentJournalEntryId: entry.id,
            paymentAccountCode: creditAccount.code,
            paymentAccountNameAr: creditAccount.name,
          },
        })

        return { entryId: entry.id, paymentsCreated: createdPayments.length }
      })

      return NextResponse.json({
        message: `تم تسجيل سداد ${createdPayments.length} راتب بنجاح`,
        paymentsCreated: createdPayments.length,
        entryId: result.entryId,
      }, { status: 201 })
    }

    // ===== Single-employee payment flow (original behavior) =====
    const employeeId = body.employeeId
    const month = body.month
    const year = body.year

    if (!employeeId) {
      return NextResponse.json({ error: 'رقم الموظف مطلوب' }, { status: 400 })
    }
    if (!month || !year) {
      return NextResponse.json({ error: 'الشهر والسنة مطلوبان' }, { status: 400 })
    }

    // Find the salary record (must exist + be APPROVED, not PAID)
    const existingSalary = await db.salary.findFirst({
      where: { employeeId, month, year, deletedAt: null },
    })
    if (!existingSalary) {
      return NextResponse.json({ error: 'لا يوجد سجل راتب لهذا الموظف في هذه الفترة. أنشئ واعتمد الراتب أولاً.' }, { status: 404 })
    }

    // P4-CRIT-004 FIX: explicit idempotency — block re-payment of an already-PAID salary.
    if (existingSalary.status === 'PAID') {
      return NextResponse.json({ error: 'الراتب مدفوع بالفعل — لا يمكن السداد مرة أخرى' }, { status: 400 })
    }
    if (existingSalary.status !== 'APPROVED') {
      return NextResponse.json({ error: 'يجب اعتماد الراتب أولاً قبل السداد' }, { status: 400 })
    }

    // Resolve the credit (cash/bank) account code
    const resolveCreditAccount = async (tx?: PrismaTransaction) => {
      if (payingAccountCode) {
        return { code: payingAccountCode, name: payingAccountName || 'الحساب المحدد' }
      }
      const role = paymentMethod === 'BANK' ? 'BANK' : 'CASH'
      const acc = await getDefaultAccountByRole(role, tx as any)
      if (acc) {
        return { code: acc.code, name: acc.nameAr || acc.name }
      }
      return paymentMethod === 'BANK'
        ? { code: '1120', name: 'البنك' }
        : { code: '1110', name: 'الصندوق (الخزينة)' }
    }

    const netSalary = Number(existingSalary.netSalary)

    // Atomic: SalaryPayment record + payment JE + Salary.status update in one transaction.
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      const salaryPayment = await tx.salaryPayment.create({
        data: {
          payrollRunId,
          employeeId,
          amount: netSalary,
          paymentDate: new Date(),
          paymentMethod,
          reference,
          notes,
        },
        include: {
          employee: { select: { id: true, code: true, name: true, nameAr: true, profession: true } },
          payrollRun: { select: { id: true, code: true, status: true } },
        },
      })

      const creditAccount = await resolveCreditAccount(tx)
      const payableAccount = await requireAccountByRole(AccountRole.SALARIES_PAYABLE, 'سداد راتب', tx)

      const entry = await createJournalEntry({
        entryNo: `JE-SAL-PAY-${salaryPayment.id}`,
        date: new Date(),
        description: `سداد راتب ${salaryPayment.employee?.nameAr || salaryPayment.employee?.name || ''} - ${month}/${year}`,
        descriptionAr: `سداد راتب ${salaryPayment.employee?.nameAr || salaryPayment.employee?.name || ''} - ${month}/${year}`,
        lines: [
          { accountCode: payableAccount.code, debit: netSalary, credit: 0, description: 'سداد رواتب مستحقة' },
          { accountCode: creditAccount.code, debit: 0, credit: netSalary, description: creditAccount.name },
        ],
        sourceType: 'SALARY_PAYMENT',
        sourceId: salaryPayment.id,
      }, tx)

      await tx.salaryPayment.update({
        where: { id: salaryPayment.id },
        data: { journalEntryId: entry.id },
      })

      await tx.salary.update({
        where: { id: existingSalary.id },
        data: { status: 'PAID', journalEntryId: entry.id },
      })

      return await tx.salaryPayment.findUniqueOrThrow({
        where: { id: salaryPayment.id },
        include: {
          employee: { select: { id: true, code: true, name: true, nameAr: true, profession: true } },
          payrollRun: { select: { id: true, code: true, status: true } },
        },
      })
    })

    return NextResponse.json({
      ...result,
      amount: Number(result.amount),
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating salary payment:', error)
    const message = error instanceof Error ? error.message : 'فشل في تسجيل سداد الرواتب'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

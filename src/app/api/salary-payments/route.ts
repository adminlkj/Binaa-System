import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { createJournalEntry } from '@/lib/accounting/engine'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const payrollRunId = searchParams.get('payrollRunId')
    const paymentMethod = searchParams.get('paymentMethod')

    const where: Record<string, unknown> = {}
    if (payrollRunId) where.payrollRunId = payrollRunId
    if (paymentMethod) where.paymentMethod = paymentMethod

    const salaryPayments = await db.salaryPayment.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        payrollRun: {
          select: {
            id: true,
            code: true,
            month: true,
            year: true,
            status: true,
            totalNet: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    })

    return NextResponse.json(salaryPayments)
  } catch (error) {
    console.error('Error fetching salary payments:', error)
    return NextResponse.json({ error: 'فشل في تحميل سداد الرواتب' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const payrollRunId = body.payrollRunId
    const paymentMethod = body.paymentMethod || 'BANK'
    const amount = parseFloat(body.amount)
    const referenceNumber = body.referenceNumber || null
    const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date()
    const notes = body.notes || null

    // Validate required fields
    if (!payrollRunId) {
      return NextResponse.json({ error: 'رقم مسير الرواتب مطلوب' }, { status: 400 })
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'المبلغ يجب أن يكون أكبر من صفر' }, { status: 400 })
    }
    if (!['BANK', 'CASH'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'طريقة السداد غير صالحة' }, { status: 400 })
    }

    // Validate payroll run exists and is eligible for payment
    const payrollRun = await db.payrollRun.findUnique({
      where: { id: payrollRunId },
    })

    if (!payrollRun) {
      return NextResponse.json({ error: 'مسير الرواتب غير موجود' }, { status: 404 })
    }

    if (!['APPROVED', 'PARTIALLY_PAID'].includes(payrollRun.status)) {
      return NextResponse.json(
        { error: 'مسير الرواتب يجب أن يكون معتمداً أو مدفوعاً جزئياً لسداد الرواتب' },
        { status: 400 }
      )
    }

    // Calculate total paid so far
    const paidResult = await db.salaryPayment.aggregate({
      where: { payrollRunId },
      _sum: { amount: true },
    })
    const totalPaidSoFar = paidResult._sum.amount || 0
    const remaining = payrollRun.totalNet - totalPaidSoFar

    // Validate amount doesn't exceed remaining
    if (amount > remaining + 0.01) {
      return NextResponse.json(
        { error: `المبلغ يتجاوز المتبقي (${remaining.toFixed(2)})` },
        { status: 400 }
      )
    }

    // Create the salary payment
    const salaryPayment = await db.salaryPayment.create({
      data: {
        payrollRunId,
        paymentMethod,
        amount,
        referenceNumber,
        paymentDate,
        notes,
      },
      include: {
        payrollRun: {
          select: {
            id: true,
            code: true,
            month: true,
            year: true,
            status: true,
            totalNet: true,
          },
        },
      },
    })

    // Create accounting journal entry
    // Debit 3310 (رواتب مستحقة - Accrued Salaries) / Credit 1121 (بنك الراجحي) or 1110 (الصندوق)
    // Note: 1120 is now a parent account; we use 1121 (بنك الراجحي) as default bank
    // TODO: Allow user to select specific bank account (1121-1124)
    const creditAccountCode = paymentMethod === 'BANK' ? '1121' : '1110'
    const creditAccountName = paymentMethod === 'BANK' ? 'بنك الراجحي' : 'الصندوق (الخزينة)'

    try {
      const entry = await createJournalEntry({
        entryNo: `JE-SALPAY-${payrollRun.code}-${salaryPayment.id.slice(-6)}`,
        date: paymentDate,
        description: `سداد رواتب مسير ${payrollRun.code} - ${payrollRun.month}/${payrollRun.year}`,
        descriptionAr: `سداد رواتب مسير ${payrollRun.code} - ${payrollRun.month}/${payrollRun.year}`,
        lines: [
          { accountCode: '3310', debit: amount, credit: 0, description: 'رواتب مستحقة' },
          { accountCode: creditAccountCode, debit: 0, credit: amount, description: creditAccountName },
        ],
        sourceType: 'SALARY_PAYMENT',
        sourceId: salaryPayment.id,
      })

      // Update salary payment with journal entry id
      await db.salaryPayment.update({
        where: { id: salaryPayment.id },
        data: { journalEntryId: entry.id },
      })
    } catch (entryError) {
      console.error('Error creating salary payment journal entry:', entryError)
      // Continue without journal entry - don't block the payment
    }

    // Update payroll run status
    const newTotalPaid = totalPaidSoFar + amount
    const newStatus = newTotalPaid >= payrollRun.totalNet - 0.01 ? 'PAID' : 'PARTIALLY_PAID'

    await db.payrollRun.update({
      where: { id: payrollRunId },
      data: { status: newStatus },
    })

    // Re-fetch with updated payroll run
    const result = await db.salaryPayment.findUnique({
      where: { id: salaryPayment.id },
      include: {
        payrollRun: {
          select: {
            id: true,
            code: true,
            month: true,
            year: true,
            status: true,
            totalNet: true,
          },
        },
      },
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating salary payment:', error)
    return NextResponse.json({ error: 'فشل في تسجيل سداد الرواتب' }, { status: 500 })
  }
}

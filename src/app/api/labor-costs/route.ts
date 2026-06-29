import { db } from '@/lib/db'
import { autoEntryLaborCost, reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    const laborCosts = await db.laborCost.findMany({
      where: {
        projectId: projectId || undefined,
        deletedAt: null,
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(laborCosts)
  } catch (error) {
    console.error('Error fetching labor costs:', error)
    return NextResponse.json({ error: 'فشل في تحميل تكاليف العمالة' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { projectId, description, workers, days, dailyRate, date, employeeId } = body

    if (!projectId || !description || !workers || !days || !dailyRate || !date) {
      return NextResponse.json({ error: 'الحقول المطلوبة: المشروع، الوصف، عدد العمال، الأيام، الأجر اليومي، التاريخ' }, { status: 400 })
    }

    const workersNum = parseInt(workers)
    const daysNum = parseFloat(days)
    const dailyRateNum = parseFloat(dailyRate)

    if (isNaN(workersNum) || isNaN(daysNum) || isNaN(dailyRateNum)) {
      return NextResponse.json({ error: 'قيم الأرقام غير صالحة' }, { status: 400 })
    }

    const totalAmount = workersNum * daysNum * dailyRateNum

    // P4-CRIT-005 FIX: atomic create + JE in $transaction.
    // Resolves costCenterId from Project.costCenter so the Dr line is tagged to the project.
    // USER-EMPOWERING UPDATE: respects paymentSource + paymentAccountCode chosen by the user
    // (المستخدم سيد النظام). Falls back to cash if not provided.
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true, code: true, costCenterId: true },
      })

      const laborCost = await tx.laborCost.create({
        data: {
          projectId,
          employeeId: employeeId || null,
          description,
          workers: workersNum,
          days: daysNum,
          dailyRate: dailyRateNum,
          totalAmount,
          date: new Date(date),
          // خصائص يختارها المستخدم (المستخدم سيد النظام)
          paymentSource: body.paymentSource || null,
          paymentAccountCode: body.paymentAccountCode || null,
        },
        include: {
          project: { select: { id: true, code: true, name: true } },
        },
      })

      // P4-CRIT-005 FIX: create the missing JE (Dr LABOR_COST / Cr CASH-or-BANK) with costCenterId.
      // يحترم اختيار المستخدم لمصدر الدفع
      const journalEntry = await autoEntryLaborCost({
        description: laborCost.description,
        amount: Number(laborCost.totalAmount),
        date: laborCost.date,
        costCenterId: project?.costCenterId || undefined,
        paymentSource: body.paymentSource,
        paymentAccountCode: body.paymentAccountCode,
      }, tx)

      if (journalEntry) {
        await tx.laborCost.update({
          where: { id: laborCost.id },
          data: { journalEntryId: journalEntry.id },
        })
      }

      return await tx.laborCost.findUniqueOrThrow({
        where: { id: laborCost.id },
        include: {
          project: { select: { id: true, code: true, name: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating labor cost:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء تكلفة العمالة'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

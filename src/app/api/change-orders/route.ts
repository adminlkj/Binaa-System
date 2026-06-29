import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const contractId = searchParams.get('contractId')
    const projectId = searchParams.get('projectId')

    const where: Record<string, unknown> = {}
    if (contractId) where.contractId = contractId
    if (projectId) where.projectId = projectId

    const changeOrders = await db.changeOrder.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        project: { select: { id: true, name: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(changeOrders)
  } catch (error) {
    console.error('Error fetching change orders:', error)
    return NextResponse.json({ error: 'فشل في تحميل أوامر التغيير' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { contractId, projectId, description, changeType, originalValue, changeValue, date, notes } = body

    if (!contractId || !projectId || !description || !date) {
      return NextResponse.json({ error: 'الحقول المطلوبة: العقد، المشروع، الوصف، التاريخ' }, { status: 400 })
    }

    // Verify contract exists and get project
    const contract = await db.contract.findUnique({
      where: { id: contractId },
    })
    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    // Auto-generate orderNo.
    // BUG-P2-01 FIX: `orderNo` is GLOBALLY unique in schema (not per-contract).
    // Previously this code only looked at the latest CO within the same contractId,
    // producing `CO-001` for every new contract — causing P2002 unique violation
    // when creating the first CO on a 2nd contract.
    // Now we scan ALL change orders, extract the numeric suffix, and pick the max.
    const allChangeOrders = await db.changeOrder.findMany({
      select: { orderNo: true },
    })
    let maxNum = 0
    for (const co of allChangeOrders) {
      const m = co.orderNo.match(/^CO-(\d+)$/)
      if (m) {
        const n = parseInt(m[1], 10)
        if (!Number.isNaN(n) && n > maxNum) maxNum = n
      }
    }
    const orderNo = `CO-${String(maxNum + 1).padStart(4, '0')}`

    const origVal = parseFloat(originalValue) || 0
    const chgVal = parseFloat(changeValue) || 0
    const newVal = origVal + chgVal
    const vatRate = Number(contract.vatRate) || 0.15
    const vatAmount = Math.round(chgVal * vatRate * 100) / 100
    const totalChangeValue = Math.round((chgVal + vatAmount) * 100) / 100

    const changeOrder = await db.changeOrder.create({
      data: {
        contractId,
        projectId: projectId || contract.projectId,
        orderNo,
        date: new Date(date),
        description,
        changeType: changeType || 'ADDITION',
        originalValue: origVal,
        changeValue: chgVal,
        newValue: newVal,
        vatRate,
        vatAmount,
        totalChangeValue,
        status: 'DRAFT',
        notes: notes || null,
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
      },
    })

    return NextResponse.json(changeOrder, { status: 201 })
  } catch (error) {
    console.error('Error creating change order:', error)
    return NextResponse.json({ error: 'فشل في إنشاء أمر التغيير' }, { status: 500 })
  }
}

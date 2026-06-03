import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')
    const projectId = searchParams.get('projectId')

    const usages = await db.equipmentUsage.findMany({
      where: {
        ...(equipmentId ? { equipmentId } : {}),
        ...(projectId ? { projectId } : {}),
      },
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(usages)
  } catch (error) {
    console.error('Error fetching equipment usages:', error)
    return NextResponse.json({ error: 'فشل في تحميل استخدامات المعدات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const usage = await db.equipmentUsage.create({
      data: {
        equipmentId: body.equipmentId,
        projectId: body.projectId,
        date: new Date(body.date),
        hours: parseFloat(body.hours),
        description: body.description || null,
        cost: parseFloat(body.cost),
      },
      include: {
        equipment: { select: { id: true, code: true, name: true } },
        project: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(usage, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment usage:', error)
    return NextResponse.json({ error: 'فشل في إنشاء سجل الاستخدام' }, { status: 500 })
  }
}

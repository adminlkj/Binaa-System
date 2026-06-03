import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const branches = await db.branch.findMany({
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(branches)
  } catch (error) {
    console.error('Error fetching branches:', error)
    return NextResponse.json({ error: 'فشل في تحميل الفروع' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const lastBranch = await db.branch.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastBranch?.code) {
      const match = lastBranch.code.match(/BR-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const code = `BR-${String(nextNum).padStart(3, '0')}`

    const branch = await db.branch.create({
      data: {
        code,
        name: body.name,
        address: body.address || null,
        isActive: true,
      },
    })

    return NextResponse.json(branch, { status: 201 })
  } catch (error) {
    console.error('Error creating branch:', error)
    return NextResponse.json({ error: 'فشل في إنشاء الفرع' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const activeOnly = searchParams.get('active') === 'true'

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId
    if (activeOnly) where.isActive = true

    const teams = await db.workTeam.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        project: { select: { id: true, code: true, name: true, nameAr: true } },
        members: {
          include: {
            employee: { select: { id: true, code: true, name: true, nameAr: true, profession: true } },
          },
        },
      },
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(teams)
  } catch (error) {
    console.error('Error fetching work teams:', error)
    return NextResponse.json({ error: 'فشل في تحميل فرق العمل' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Auto-generate team code TM-XXX
    const lastTeam = await db.workTeam.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastTeam?.code) {
      const match = lastTeam.code.match(/TM-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }

    const code = `TM-${String(nextNum).padStart(3, '0')}`

    // Create team with optional initial members
    // L3B-CRIT-006 FIX: accept BOTH formats — `string[]` (employeeIds from UI) and
    // `Array<{employeeId, role?, isLeader?}>` (legacy/programmatic callers).
    const membersData = body.members && Array.isArray(body.members)
      ? body.members.map((m: unknown) => {
          if (typeof m === 'string') {
            return { employeeId: m, role: null, isLeader: false }
          }
          const obj = m as { employeeId?: string; role?: string; isLeader?: boolean }
          return {
            employeeId: obj.employeeId as string,
            role: obj.role || null,
            isLeader: obj.isLeader || false,
          }
        })
      : []

    const team = await db.workTeam.create({
      data: {
        code,
        name: body.name,
        nameAr: body.nameAr || null,
        specialty: body.specialty || null,
        projectId: body.projectId || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
        members: {
          create: membersData,
        },
      },
      include: {
        project: { select: { id: true, code: true, name: true, nameAr: true } },
        members: {
          include: {
            employee: { select: { id: true, code: true, name: true, nameAr: true, profession: true } },
          },
        },
      },
    })

    return NextResponse.json(team, { status: 201 })
  } catch (error) {
    console.error('Error creating work team:', error)
    return NextResponse.json({ error: 'فشل في إنشاء فريق العمل' }, { status: 500 })
  }
}

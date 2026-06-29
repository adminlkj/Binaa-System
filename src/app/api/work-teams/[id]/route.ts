import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const team = await db.workTeam.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, code: true, name: true, nameAr: true } },
        members: {
          include: {
            employee: { select: { id: true, code: true, name: true, nameAr: true, profession: true } },
          },
        },
      },
    })
    if (!team) {
      return NextResponse.json({ error: 'فريق العمل غير موجود' }, { status: 404 })
    }
    return NextResponse.json(team)
  } catch (error) {
    console.error('Error fetching work team:', error)
    return NextResponse.json({ error: 'فشل في تحميل بيانات فريق العمل' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    // Update team basic info
    const team = await db.workTeam.update({
      where: { id },
      data: {
        name: body.name,
        nameAr: body.nameAr ?? null,
        specialty: body.specialty ?? null,
        projectId: body.projectId ?? null,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
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

    // Handle member updates if provided
    // L3B-CRIT-006 FIX: accept addMembers as `string[]` (employeeIds) OR
    // `Array<{employeeId, role?, isLeader?}>`.
    if (body.addMembers && Array.isArray(body.addMembers)) {
      for (const member of body.addMembers) {
        const employeeId = typeof member === 'string' ? member : member?.employeeId
        const role = typeof member === 'string' ? null : (member.role || null)
        const isLeader = typeof member === 'string' ? false : (member.isLeader || false)
        if (!employeeId) continue
        // Check if member already exists
        const existing = await db.teamMember.findFirst({
          where: { teamId: id, employeeId },
        })
        if (!existing) {
          await db.teamMember.create({
            data: {
              teamId: id,
              employeeId,
              role,
              isLeader,
            },
          })
        }
      }
    }

    if (body.removeMembers && Array.isArray(body.removeMembers)) {
      for (const entry of body.removeMembers) {
        const employeeId = typeof entry === 'string' ? entry : entry?.employeeId
        if (!employeeId) continue
        await db.teamMember.deleteMany({
          where: { teamId: id, employeeId },
        })
      }
    }

    // Refetch to get updated members
    const updatedTeam = await db.workTeam.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, code: true, name: true, nameAr: true } },
        members: {
          include: {
            employee: { select: { id: true, code: true, name: true, nameAr: true, profession: true } },
          },
        },
      },
    })

    return NextResponse.json(updatedTeam)
  } catch (error) {
    console.error('Error updating work team:', error)
    return NextResponse.json({ error: 'فشل في تحديث فريق العمل' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Cascade delete will remove members automatically
    await db.workTeam.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting work team:', error)
    return NextResponse.json({ error: 'فشل في حذف فريق العمل' }, { status: 500 })
  }
}

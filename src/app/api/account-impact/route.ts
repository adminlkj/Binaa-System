import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountImpact, getAccountImpactSummary, deactivateAccount } from '@/lib/account-impact'

export async function GET(request: NextRequest) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const accountId = searchParams.get('accountId')

    switch (action) {
      case 'summary': {
        const summary = await getAccountImpactSummary()
        return NextResponse.json({ summary })
      }

      case 'detail': {
        if (!accountId) {
          return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
        }
        const impact = await getAccountImpact(accountId)
        if (!impact) {
          return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        }
        return NextResponse.json({ impact })
      }

      default: {
        const summary = await getAccountImpactSummary()
        return NextResponse.json({ summary })
      }
    }
  } catch (error: unknown) {
    console.error('Account impact API error:', error)
    return NextResponse.json({ error: 'فشل في تحليل تأثير الحساب' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const { action, accountId } = body

    switch (action) {
      case 'deactivate': {
        if (!accountId) {
          return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
        }
        const result = await deactivateAccount(accountId)
        return NextResponse.json({ result })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error: unknown) {
    console.error('Account impact API error:', error)
    return NextResponse.json({ error: 'فشل في تحليل تأثير الحساب' }, { status: 500 })
  }
}

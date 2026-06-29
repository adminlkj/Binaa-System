import { NextRequest, NextResponse } from 'next/server'
import { runAccountingHealthCheck, getLatestHealthCheck, getHealthSummary, getHealthCheckHistory } from '@/lib/accounting-health-check'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    switch (action) {
      case 'summary': {
        const summary = await getHealthSummary()
        return NextResponse.json({ summary })
      }

      case 'latest': {
        const report = await getLatestHealthCheck()
        return NextResponse.json({ report })
      }

      case 'history': {
        const limit = parseInt(searchParams.get('limit') || '10')
        const history = await getHealthCheckHistory(limit)
        return NextResponse.json({ history })
      }

      default: {
        const report = await getLatestHealthCheck()
        return NextResponse.json({ report })
      }
    }
  } catch (error: unknown) {
    console.error('Accounting health API error:', error)
    return NextResponse.json({ error: 'فشل في فحص الصحة المحاسبية' }, { status: 500 })
  }
}

export async function POST(_request: NextRequest) {
  try {
    const report = await runAccountingHealthCheck()
    return NextResponse.json({ report })
  } catch (error: unknown) {
    console.error('Accounting health check run error:', error)
    return NextResponse.json({ error: 'فشل في فحص الصحة المحاسبية' }, { status: 500 })
  }
}

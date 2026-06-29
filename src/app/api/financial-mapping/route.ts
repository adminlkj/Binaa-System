import { NextRequest, NextResponse } from 'next/server'
import { getAllFinancialMappings, getFinancialMapping, seedFinancialMappings, resolveOperationAccounts, validateOperationMapping, getRoleMappingOverview } from '@/lib/financial-mapping-engine'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    switch (action) {
      case 'list': {
        const mappings = await getAllFinancialMappings()
        return NextResponse.json({ mappings })
      }

      case 'overview': {
        const overview = await getRoleMappingOverview()
        return NextResponse.json({ overview })
      }

      case 'resolve': {
        const operationType = searchParams.get('operationType')
        if (!operationType) {
          return NextResponse.json({ error: 'operationType is required' }, { status: 400 })
        }
        const resolved = await resolveOperationAccounts(operationType)
        return NextResponse.json({ resolved })
      }

      case 'validate': {
        const operationType = searchParams.get('operationType')
        if (!operationType) {
          return NextResponse.json({ error: 'operationType is required' }, { status: 400 })
        }
        const validation = await validateOperationMapping(operationType)
        return NextResponse.json({ validation })
      }

      case 'single': {
        const operationType = searchParams.get('operationType')
        if (!operationType) {
          return NextResponse.json({ error: 'operationType is required' }, { status: 400 })
        }
        const mapping = await getFinancialMapping(operationType)
        return NextResponse.json({ mapping })
      }

      default: {
        const mappings = await getAllFinancialMappings()
        return NextResponse.json({ mappings })
      }
    }
  } catch (error: any) {
    console.error('Financial mapping API error:', error)
    return NextResponse.json({ error: 'فشل في عملية الربط المحاسبي' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'seed': {
        const result = await seedFinancialMappings()
        return NextResponse.json({ result })
      }

      case 'update': {
        const { operationType, debitRoles, creditRoles, labelAr, labelEn, description } = body
        const { db } = await import('@/lib/db')
        const mapping = await db.financialMapping.upsert({
          where: { operationType },
          update: {
            debitRoles: JSON.stringify(debitRoles),
            creditRoles: JSON.stringify(creditRoles),
            ...(labelAr && { labelAr }),
            ...(labelEn && { labelEn }),
            ...(description && { description }),
          },
          create: {
            operationType,
            labelAr: labelAr || operationType,
            labelEn: labelEn || operationType,
            description: description || '',
            debitRoles: JSON.stringify(debitRoles),
            creditRoles: JSON.stringify(creditRoles),
          },
        })
        return NextResponse.json({ mapping })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Financial mapping API error:', error)
    return NextResponse.json({ error: 'فشل في عملية الربط المحاسبي' }, { status: 500 })
  }
}

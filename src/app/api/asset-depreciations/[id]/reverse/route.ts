import { reverseAssetDepreciation } from '@/lib/accounting/depreciation-engine'
import { NextResponse } from 'next/server'

// ============ POST: Reverse a single depreciation record ============
// يعكس قيد الإهلاك ويُعيد حساب مجمع الإهلاك والقيمة الدفترية للأصل
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await reverseAssetDepreciation(id)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error reversing depreciation:', error)
    return NextResponse.json(
      { error: 'فشل في عكس الإهلاك' },
      { status: 500 }
    )
  }
}

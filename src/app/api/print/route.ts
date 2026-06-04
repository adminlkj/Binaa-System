import { NextRequest, NextResponse } from 'next/server'
import {
  generatePrintHTML,
  fetchPrintPageData,
  type PrintDocumentType,
} from '@/lib/print-service'

/**
 * GET /api/print?type=<type>&id=<id>&format=<html|json>
 *
 * - format=html (default): Returns a complete standalone HTML document for printing
 * - format=json: Returns document data + company settings as JSON (for the React print page)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as PrintDocumentType | null
    const id = searchParams.get('id')
    const format = searchParams.get('format') || 'html'

    // Validate required params
    if (!type || !id) {
      return NextResponse.json(
        { error: 'Missing required parameters: type and id' },
        { status: 400 },
      )
    }

    // Validate document type
    const validTypes: PrintDocumentType[] = [
      'service-invoice',
      'rental-invoice',
      'extract',
      'purchase-order',
      'supplier-invoice',
      'tax-declaration',
    ]
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid document type: ${type}. Valid types: ${validTypes.join(', ')}` },
        { status: 400 },
      )
    }

    if (format === 'json') {
      // Return JSON data for the React print page
      const pageData = await fetchPrintPageData(type, id)
      return NextResponse.json(pageData)
    }

    // Default: Return complete HTML document
    const html = await generatePrintHTML(type, id)

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Print API error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 },
    )
  }
}

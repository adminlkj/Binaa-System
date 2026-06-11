import { NextRequest, NextResponse } from 'next/server'
import {
  generatePrintHTML,
  type PrintDocumentType,
  type PrintOptions,
} from '@/lib/print-service'
import { db } from '@/lib/db'

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

    // Get company settings
    const settings = await db.companySetting.findFirst()
    const printSettings: PrintOptions['settings'] = {
      nameAr: settings?.nameAr || 'بِنَاء',
      nameEn: settings?.nameEn || 'Binaa',
      taxNumber: settings?.taxNumber || null,
      address: settings?.address || null,
      phone: settings?.phone || null,
      email: settings?.email || null,
      logoUrl: settings?.logoUrl || null,
      headerImage: settings?.headerImage || null,
      footerImage: settings?.footerImage || null,
      stamp: settings?.stamp || null,
      currencySymbolImage: settings?.currencySymbolImage || null,
      defaultVatRate: settings?.defaultVatRate || 0.15,
    }

    // Fetch document data based on type
    let data: Record<string, unknown> = {}

    if (type === 'service-invoice' || type === 'rental-invoice') {
      const invoice = await db.salesInvoice.findUnique({
        where: { id },
        include: { client: true, items: true, project: true, contract: true },
      })
      if (invoice) {
        data = {
          invoiceNo: invoice.invoiceNo,
          date: invoice.date,
          clientName: invoice.client.name,
          contractNo: invoice.contractNo,
          subtotal: invoice.subtotal,
          vatAmount: invoice.vatAmount,
          totalAmount: invoice.totalAmount,
          includeDelivery: invoice.includeDelivery,
          deliveryAmount: invoice.deliveryAmount,
          items: invoice.items.map(i => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          })),
          terms: invoice.notes,
        }
      }
    } else if (type === 'extract') {
      const claim = await db.progressClaim.findUnique({
        where: { id },
        include: { project: true, contract: true },
      })
      if (claim) {
        data = {
          claimNo: claim.claimNo,
          date: claim.date,
          projectName: claim.project.name,
          percentage: claim.percentage,
          amount: claim.amount,
          vatAmount: claim.vatAmount,
          totalAmount: claim.totalAmount,
          contractValue: claim.contract.totalValue,
        }
      }
    } else if (type === 'supplier-invoice') {
      const invoice = await db.purchaseInvoice.findUnique({
        where: { id },
        include: { supplier: true, items: true },
      })
      if (invoice) {
        data = {
          invoiceNo: invoice.invoiceNo,
          date: invoice.date,
          supplierName: invoice.supplier.name,
          subtotal: invoice.subtotal,
          vatAmount: invoice.vatAmount,
          totalAmount: invoice.totalAmount,
          items: invoice.items.map(i => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          })),
        }
      }
    } else if (type === 'purchase-order') {
      const po = await db.purchaseOrder.findUnique({
        where: { id },
        include: { supplier: true, items: true },
      })
      if (po) {
        data = {
          orderNo: po.orderNo,
          supplierName: po.supplier.name,
          subtotal: po.subtotal,
          vatAmount: po.vatAmount,
          totalAmount: po.totalAmount,
          items: po.items.map(i => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          })),
        }
      }
    } else if (type === 'tax-declaration') {
      const vatReturn = await db.vATReturn.findUnique({ where: { id } })
      if (vatReturn) {
        data = {
          year: vatReturn.year,
          quarter: vatReturn.quarter,
          totalSales: vatReturn.totalSales,
          outputVat: vatReturn.outputVat,
          totalPurchases: vatReturn.totalPurchases,
          inputVat: vatReturn.inputVat,
          netVat: vatReturn.netVat,
        }
      }
    }

    if (format === 'json') {
      return NextResponse.json({ data, settings: printSettings })
    }

    // Default: Return complete HTML document
    const html = generatePrintHTML({
      type,
      data,
      settings: printSettings,
    })

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

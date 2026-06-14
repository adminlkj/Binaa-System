import { NextRequest, NextResponse } from 'next/server'
import {
  generatePrintHTML,
  type PrintDocumentType,
  type PrintOptions,
} from '@/printing'
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

    // Validate document type against the new printing system's supported types
    const validTypes: PrintDocumentType[] = [
      // فواتير
      'service-invoice',
      'rental-invoice',
      'supplier-invoice',
      // مشاريع
      'progress-claim',
      // مشتريات
      'purchase-order',
      'delivery-order',
      // عمليات
      'timesheet',
      // محاسبة
      'trial-balance',
      'general-ledger',
      'income-statement',
      'balance-sheet',
      // ضريبي
      'vat-return',
      // مالي
      'client-payment',
      'supplier-payment',
      'rental-payment',
      'expense-report',
      'advance-voucher',
      'petty-cash-voucher',
      'salary-slip',
      'rental-contract',
      // تقارير
      'equipment-report',
      'fuel-report',
      'maintenance-report',
      'work-team-report',
      'resource-distribution',
      'attendance-report',
      'purchase-request',
      'goods-receipt',
      'journal-entry',
      'account-statement',
      'generic-table',
    ]
    // Backward compatibility: map old type names to new ones
    const typeAliases: Record<string, PrintDocumentType> = {
      'extract': 'progress-claim',
      'timesheet-report': 'timesheet',
      'tax-declaration': 'vat-return',
    }
    const resolvedType = (typeAliases[type] || type) as PrintDocumentType
    if (!validTypes.includes(resolvedType) && !typeAliases[type]) {
      return NextResponse.json(
        { error: `Invalid document type: ${type}. Valid types: ${validTypes.join(', ')}` },
        { status: 400 },
      )
    }

    // Get company settings
    const settings = await db.companySetting.findFirst()

    // Process currency symbol image to remove background (for print templates)
    let processedCurrencySymbolImage = settings?.currencySymbolImage || null
    if (processedCurrencySymbolImage && !processedCurrencySymbolImage.endsWith('.svg')) {
      try {
        const bgRes = await fetch(new URL('/api/remove-bg', request.url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: processedCurrencySymbolImage }),
        })
        if (bgRes.ok) {
          const bgData = await bgRes.json()
          if (bgData.dataUrl) {
            processedCurrencySymbolImage = bgData.dataUrl
          }
        }
      } catch {
        // Background removal failed, use original image (CSS mix-blend-mode will help)
      }
    }

    const printSettings: PrintOptions['settings'] = {
      nameAr: settings?.nameAr || 'بِنَاء',
      nameEn: settings?.nameEn || 'Binaa',
      taxNumber: settings?.taxNumber || null,
      commercialReg: settings?.commercialReg || null,
      address: settings?.address || null,
      phone: settings?.phone || null,
      email: settings?.email || null,
      website: settings?.website || null,
      logoUrl: settings?.logoUrl || null,
      headerImage: settings?.headerImage || null,
      footerImage: settings?.footerImage || null,
      stamp: settings?.stamp || null,
      currencySymbolImage: processedCurrencySymbolImage,
      currencySymbol: settings?.currencySymbol || null,
      currencySymbolAr: settings?.currencySymbolAr || null,
      currencySymbolEn: settings?.currencySymbolEn || null,
      defaultVatRate: settings?.defaultVatRate || 0.15,
      bankName: settings?.bankName || null,
      bankIban: settings?.bankIban || null,
      bankAccountName: settings?.bankAccountName || null,
      invoiceTerms: settings?.invoiceTerms || null,
    }

    // Fetch document data based on type
    let data: Record<string, unknown> = {}

    // Use resolved type for data fetching (handles backward compat aliases)
    const fetchType = resolvedType

    if (fetchType === 'service-invoice' || fetchType === 'rental-invoice') {
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
    } else if (fetchType === 'progress-claim') {
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
    } else if (fetchType === 'supplier-invoice') {
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
    } else if (fetchType === 'purchase-order') {
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
    } else if (fetchType === 'vat-return') {
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

    // For invoice types, generate QR code server-side (ZATCA compliance)
    if ((fetchType === 'rental-invoice' || fetchType === 'service-invoice' || fetchType === 'supplier-invoice') && printSettings.taxNumber) {
      try {
        const sellerName = printSettings.nameAr || ''
        const vatNumber = printSettings.taxNumber
        const invoiceDate = data.date
          ? new Date(data.date as string).toISOString().split('T')[0]
          : ''
        const totalAmount = Number(data.totalAmount) || 0
        const vatAmount = Number(data.vatAmount) || 0
        const totalStr = totalAmount.toFixed(2)
        const vatTotalStr = vatAmount.toFixed(2)

        const qrRes = await fetch(
          `${request.nextUrl.origin}/api/generate-qr?seller=${encodeURIComponent(sellerName)}&vat=${encodeURIComponent(vatNumber)}&date=${encodeURIComponent(invoiceDate)}&total=${encodeURIComponent(totalStr)}&vatTotal=${encodeURIComponent(vatTotalStr)}`
        )
        if (qrRes.ok) {
          const qrData = await qrRes.json()
          if (qrData.qrDataUrl) {
            data.qrDataUrl = qrData.qrDataUrl
          }
        }
      } catch {
        // QR generation failed, will fall back to client-side approach in template
      }
    }

    if (format === 'json') {
      return NextResponse.json({ data, settings: printSettings })
    }

    // Default: Return complete HTML document using the new modular printing system
    const html = generatePrintHTML({
      type: resolvedType,
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

import { NextRequest, NextResponse } from 'next/server'
import {
  generateDocument,
  type UnifiedDocumentType,
  type PrintSettings,
  requiresZatcaQR,
  getSupportedDocumentTypes,
} from '@/lib/unified-print-engine'
import { generateZatcaQR } from '@/lib/zatca-qr'
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
    const type = searchParams.get('type') as UnifiedDocumentType | null
    const id = searchParams.get('id')
    const format = searchParams.get('format') || 'html'
    const lang = (searchParams.get('lang') as 'ar' | 'en') || 'ar'

    // Validate required params
    if (!type || !id) {
      return NextResponse.json(
        { error: 'Missing required parameters: type and id' },
        { status: 400 },
      )
    }

    // Validate document type
    const supportedTypes = getSupportedDocumentTypes()
    if (!supportedTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid document type: ${type}. Valid types: ${supportedTypes.join(', ')}` },
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

    const printSettings: PrintSettings = {
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
      defaultVatRate: Number(settings?.defaultVatRate) || 0.15,
      bankName: settings?.bankName || null,
      bankIban: settings?.bankIban || null,
      bankAccountName: settings?.bankAccountName || null,
      invoiceTerms: settings?.invoiceTerms || null,
      // Invoice template customization
      invoiceTemplate: settings?.invoiceTemplate || 'classic',
      invoicePrimaryColor: settings?.invoicePrimaryColor || '#0f766e',
      invoiceAccentColor: settings?.invoiceAccentColor || '#34d399',
      invoiceFontFamily: settings?.invoiceFontFamily || 'default',
      invoiceShowBankDetails: settings?.invoiceShowBankDetails ?? true,
      invoiceShowSignature: settings?.invoiceShowSignature ?? true,
      invoiceShowStamp: settings?.invoiceShowStamp ?? false,
      // Stamp placement & size — full control from settings
      stampPosition: settings?.stampPosition || 'after-signatures',
      stampWidth: settings?.stampWidth ?? 140,
      stampHeight: settings?.stampHeight ?? 140,
      stampOffsetX: settings?.stampOffsetX ?? 0,
      stampOffsetY: settings?.stampOffsetY ?? 0,
      stampOpacity: Number(settings?.stampOpacity ?? 0.9),
      stampRotation: settings?.stampRotation ?? 0,
    }

    // Fetch document data based on type
    let data: Record<string, unknown> = {}

    if (type === 'service-invoice' || type === 'sales-invoice' || type === 'rental-invoice') {
      const invoice = await db.salesInvoice.findUnique({
        where: { id },
        include: { client: true, items: true, project: true, contract: true },
      })
      if (invoice) {
        data = {
          id: invoice.id,
          invoiceNo: invoice.invoiceNo,
          date: invoice.date,
          dueDate: invoice.dueDate,
          clientName: invoice.client.name,
          clientTaxNumber: invoice.client.taxNumber,
          clientAddress: invoice.client.address,
          contractNo: invoice.contractNo,
          subtotal: Number(invoice.subtotal),
          netAmount: Number(invoice.netAmount),
          vatRate: Number(invoice.vatRate),
          vatAmount: Number(invoice.vatAmount),
          totalAmount: Number(invoice.totalAmount),
          includeDelivery: invoice.includeDelivery,
          deliveryAmount: Number(invoice.deliveryAmount),
          items: invoice.items.map(i => ({
            description: i.description,
            quantity: Number(i.quantity),
            unit: i.unit,
            unitPrice: Number(i.unitPrice),
            totalPrice: Number(i.totalPrice),
          })),
          terms: invoice.notes,
          // Use stored ZATCA QR if available
          ...(invoice.zatcaQr ? { _zatcaTlvBase64: invoice.zatcaQr } : {}),
        }
      }
    } else if (type === 'supplier-invoice') {
      const invoice = await db.purchaseInvoice.findUnique({
        where: { id },
        include: { supplier: true, items: true },
      })
      if (invoice) {
        data = {
          id: invoice.id,
          invoiceNo: invoice.invoiceNo,
          date: invoice.date,
          supplierName: invoice.supplier.name,
          supplierTaxNumber: invoice.supplier.taxNumber,
          subtotal: Number(invoice.subtotal),
          vatRate: Number(invoice.vatRate),
          vatAmount: Number(invoice.vatAmount),
          totalAmount: Number(invoice.totalAmount),
          items: invoice.items.map(i => ({
            description: i.description,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            totalPrice: Number(i.totalPrice),
          })),
          // Use stored ZATCA QR if available
          ...(invoice.zatcaQr ? { _zatcaTlvBase64: invoice.zatcaQr } : {}),
        }
      }
    } else if (type === 'progress-claim') {
      const claim = await db.progressClaim.findUnique({
        where: { id },
        include: { project: true, contract: true },
      })
      if (claim) {
        data = {
          id: claim.id,
          claimNo: claim.claimNo,
          date: claim.date,
          projectName: claim.project.name,
          contractNo: claim.contract.contractNo,
          percentage: Number(claim.percentage),
          amount: Number(claim.amount),
          vatAmount: Number(claim.vatAmount),
          totalAmount: Number(claim.totalAmount),
          contractValue: Number(claim.contract.totalValue),
        }
      }
    } else if (type === 'purchase-order') {
      const po = await db.purchaseOrder.findUnique({
        where: { id },
        include: { supplier: true, items: true },
      })
      if (po) {
        data = {
          id: po.id,
          orderNo: po.orderNo,
          supplierName: po.supplier.name,
          date: po.date,
          subtotal: Number(po.subtotal),
          vatAmount: Number(po.vatAmount),
          totalAmount: Number(po.totalAmount),
          items: po.items.map(i => ({
            description: i.description,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            totalPrice: Number(i.totalPrice),
          })),
        }
      }
    } else if (type === 'boq') {
      // BOQ data comes from BOQItem model
      const project = await db.project.findUnique({
        where: { id },
        include: { boqItems: true, contracts: true },
      })
      if (project) {
        const firstContract = project.contracts[0]
        const subtotal = project.boqItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)
        const vatRate = 0.15
        const vatAmount = subtotal * vatRate
        data = {
          id: project.id,
          boqNo: `BOQ-${project.code}`,
          projectName: project.name,
          contractNo: firstContract?.contractNo || '',
          date: project.startDate || project.createdAt,
          items: project.boqItems.map(item => ({
            code: item.code,
            description: item.description,
            quantity: Number(item.quantity),
            unit: item.unit,
            unitPrice: Number(item.unitPrice),
            totalPrice: Number(item.totalPrice),
          })),
          subtotal,
          vatAmount,
          totalAmount: subtotal + vatAmount,
        }
      }
    } else if (type === 'change-order') {
      const changeOrder = await db.changeOrder.findUnique({
        where: { id },
        include: { project: true, contract: true },
      })
      if (changeOrder) {
        data = {
          id: changeOrder.id,
          changeOrderNo: changeOrder.orderNo,
          projectName: changeOrder.project.name,
          contractNo: changeOrder.contract?.contractNo || '',
          originalContractValue: Number(changeOrder.originalValue),
          date: changeOrder.date,
          description: changeOrder.description,
          changeType: changeOrder.changeType,
          changeAmount: Number(changeOrder.changeValue),
          newContractValue: Number(changeOrder.newValue),
          subtotal: Number(changeOrder.changeValue),
          vatAmount: Number(changeOrder.vatAmount),
          totalAmount: Number(changeOrder.totalChangeValue),
        }
      }
    } else if (type === 'employee-contract') {
      const employee = await db.employee.findUnique({
        where: { id },
        include: { contracts: true, branch: true },
      })
      if (employee) {
        const activeContract = employee.contracts[0]
        const housingAllowance = Number(activeContract?.housingAllowance || 0)
        const transportAllowance = Number(activeContract?.transportAllowance || 0)
        const otherAllowances = Number(activeContract?.otherAllowances || 0)
        const totalAllowances = housingAllowance + transportAllowance + otherAllowances
        const basicSalary = Number(activeContract?.basicSalary || employee.basicSalary)
        data = {
          id: employee.id,
          employeeName: employee.name,
          nationalId: employee.nationality || '',
          position: employee.profession || '',
          department: employee.branch ? `Branch: ${employee.branch.name || ''}` : '',
          contractNo: `EC-${employee.code}`,
          date: activeContract?.startDate || employee.hireDate,
          contractType: 'Full Time',
          startDate: activeContract?.startDate || employee.hireDate,
          endDate: activeContract?.endDate || '',
          basicSalary,
          allowances: totalAllowances,
          totalSalary: basicSalary + totalAllowances,
        }
      }
    } else if (type === 'salary-slip') {
      const salary = await db.salary.findUnique({
        where: { id },
        include: { employee: true },
      })
      if (salary) {
        data = {
          id: salary.id,
          employeeName: salary.employee?.name || '',
          position: salary.employee?.profession || '',
          department: salary.employee?.branchId || '',
          month: salary.month,
          year: salary.year,
          basicSalary: Number(salary.basicSalary),
          housingAllowance: Number(salary.housingAllowance),
          transportAllowance: Number(salary.transportAllowance),
          otherAllowances: Number(salary.otherAllowances),
          deductions: Number(salary.deductions),
          netSalary: Number(salary.netSalary),
        }
      }
    } else if (type === 'vat-return') {
      const vatReturn = await db.vATReturn.findUnique({ where: { id } })
      if (vatReturn) {
        data = {
          year: vatReturn.year,
          quarter: vatReturn.quarter,
          period: vatReturn.period,
          // الإجماليات
          totalSales: Number(vatReturn.totalSales),
          outputVat: Number(vatReturn.outputVat),
          totalPurchases: Number(vatReturn.totalPurchases),
          inputVat: Number(vatReturn.inputVat),
          netVat: Number(vatReturn.netVat),
          // تصنيف المبيعات (ZATCA)
          standardRatedSales: Number(vatReturn.standardRatedSales),
          zeroRatedSales: Number(vatReturn.zeroRatedSales),
          exemptSales: Number(vatReturn.exemptSales),
          standardRatedSalesVat: Number(vatReturn.standardRatedSalesVat),
          // تصنيف المشتريات (ZATCA)
          standardRatedPurchases: Number(vatReturn.standardRatedPurchases),
          zeroRatedPurchases: Number(vatReturn.zeroRatedPurchases),
          exemptPurchases: Number(vatReturn.exemptPurchases),
          importsSubjectToVAT: Number(vatReturn.importsSubjectToVAT),
          standardRatedPurchasesVat: Number(vatReturn.standardRatedPurchasesVat),
          // التحقق من دفتر اليومية
          glOutputVat: Number(vatReturn.glOutputVat),
          glInputVat: Number(vatReturn.glInputVat),
          glMatch: vatReturn.glMatch,
          // معلومات الحالة
          status: vatReturn.status,
          filedDate: vatReturn.filedDate?.toISOString(),
          paymentDate: vatReturn.paymentDate?.toISOString(),
          paymentReference: vatReturn.paymentReference,
          paymentStatus: vatReturn.status === 'PAID' ? 'PAID'
            : vatReturn.status === 'FILED' ? 'NOT_PAID'
            : undefined,
          paymentRef: vatReturn.paymentReference || undefined,
          isAmendment: vatReturn.isAmendment,
          cancelledAt: vatReturn.cancelledAt?.toISOString(),
          cancelledReason: vatReturn.cancelledReason,
          createdAt: vatReturn.createdAt.toISOString(),
        }
      }
    } else if (type === 'journal-entry') {
      const je = await db.journalEntry.findUnique({
        where: { id },
        include: {
          lines: {
            include: { account: true, costCenter: true },
          },
        },
      })
      if (je) {
        const sourceLabelMap: Record<string, { ar: string; en: string }> = {
          SALES_INVOICE: { ar: 'فاتورة مبيعات', en: 'Sales Invoice' },
          PURCHASE_INVOICE: { ar: 'فاتورة مشتريات', en: 'Purchase Invoice' },
          EXPENSE: { ar: 'مصروف', en: 'Expense' },
          PAYMENT: { ar: 'سند صرف/تحصيل', en: 'Payment Voucher' },
          PAYROLL: { ar: 'رواتب', en: 'Payroll' },
          MANUAL: { ar: 'يدوي', en: 'Manual' },
          PROGRESS_CLAIM: { ar: 'مستخلص', en: 'Progress Claim' },
        }
        const src = sourceLabelMap[je.sourceType || 'MANUAL'] || sourceLabelMap.MANUAL
        const totalDebit = je.lines.reduce((s, l) => s + Number(l.debit), 0)
        const totalCredit = je.lines.reduce((s, l) => s + Number(l.credit), 0)
        data = {
          id: je.id,
          entryNo: je.entryNo,
          date: je.date,
          description: je.description || '',
          source: lang === 'ar' ? src.ar : src.en,
          lines: je.lines.map(l => ({
            accountCode: l.account?.code || '',
            accountName: l.account?.nameAr || l.account?.name || '',
            accountNameEn: l.account?.name || '',
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            description: l.description || '',
            costCenterName: l.costCenter?.name || '',
          })),
          totalDebit,
          totalCredit,
          status: je.status,
        }
      }
    } else if (type === 'expense-report' || type === 'advance-voucher' || type === 'petty-cash-voucher') {
      // For expense-report, the same Expense record is used as a payment voucher.
      const exp = await db.expense.findUnique({
        where: { id },
        include: { project: true, costCenter: true },
      })
      if (exp) {
        const payFromLabelMap: Record<string, { ar: string; en: string }> = {
          PETTY_CASH: { ar: 'نقدية (عربية)', en: 'Petty Cash' },
          TREASURY: { ar: 'الخزينة', en: 'Treasury' },
          BANK_TRANSFER: { ar: 'تحويل بنكي', en: 'Bank Transfer' },
          CHEQUE: { ar: 'شيك', en: 'Cheque' },
        }
        const pf = payFromLabelMap[exp.payFrom || 'BANK_TRANSFER'] || payFromLabelMap.BANK_TRANSFER
        data = {
          id: exp.id,
          documentType: 'expense-report',
          paymentNo: `EXP-${exp.id.slice(-6).toUpperCase()}`,
          date: exp.date,
          amount: Number(exp.totalAmount) || Number(exp.amount) || 0,
          totalAmount: Number(exp.totalAmount) || Number(exp.amount) || 0,
          description: exp.description || '',
          referenceNo: exp.reference || '',
          paymentMethod: lang === 'ar' ? pf.ar : pf.en,
          clientName: '',
          supplierName: lang === 'ar' ? 'مصروف' : 'Expense',
          projectName: exp.project?.name || '',
          costCenterName: exp.costCenter?.name || '',
          category: exp.category || '',
          expenseType: exp.expenseType || '',
        }
      }
    }

    // For invoice types, generate QR code server-side (ZATCA compliance)
    if (requiresZatcaQR(type) && printSettings.taxNumber) {
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

        const { qrDataUrl, tlvBase64 } = await generateZatcaQR({
          sellerName,
          vatNumber,
          invoiceDate,
          totalAmount: totalStr,
          vatAmount: vatTotalStr,
        })

        if (qrDataUrl) {
          data.qrDataUrl = qrDataUrl
        }
        // Always store TLV base64 for client-side fallback
        if (tlvBase64) {
          data._zatcaTlvBase64 = tlvBase64
        }
      } catch {
        // QR generation failed, will fall back to client-side approach in template
      }
    }

    if (format === 'json') {
      return NextResponse.json({ data, settings: printSettings })
    }

    // Default: Return complete HTML document using the unified print engine
    const html = generateDocument(type, data, printSettings, lang)

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

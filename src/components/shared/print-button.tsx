'use client'

import React, { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'
import type { PrintDocumentType } from '@/printing'

// ============ Data Transformation ============
/**
 * Transforms nested API response data into the flat format expected by the print service.
 * Each API endpoint returns nested objects (e.g. client: { name, taxNumber, address }),
 * but print templates expect flat fields (e.g. clientName, clientTaxNumber, clientAddress).
 */
function transformDataForPrint(type: PrintDocumentType, data: Record<string, unknown>): Record<string, unknown> {
  const d = { ...data }

  // Helper: flatten a nested client object
  const flattenClient = (obj: Record<string, unknown>) => {
    const client = obj.client as Record<string, unknown> | undefined
    if (client && typeof client === 'object') {
      obj.clientName = obj.clientName || client.name || client.nameAr || ''
      obj.clientNameAr = obj.clientNameAr || client.nameAr || ''
      obj.clientTaxNumber = obj.clientTaxNumber || client.taxNumber || ''
      obj.clientAddress = obj.clientAddress || client.address || ''
      obj.clientPhone = obj.clientPhone || client.phone || ''
      obj.clientEmail = obj.clientEmail || client.email || ''
    }
  }

  // Helper: flatten a nested equipment object
  const flattenEquipment = (obj: Record<string, unknown>) => {
    const equipment = obj.equipment as Record<string, unknown> | undefined
    if (equipment && typeof equipment === 'object') {
      obj.equipmentName = obj.equipmentName || equipment.name || ''
      obj.equipmentNameAr = obj.equipmentNameAr || equipment.nameAr || ''
      obj.equipmentCode = obj.equipmentCode || equipment.code || ''
    }
  }

  // Helper: flatten a nested project object
  const flattenProject = (obj: Record<string, unknown>) => {
    const project = obj.project as Record<string, unknown> | undefined
    if (project && typeof project === 'object') {
      obj.projectName = obj.projectName || project.name || ''
      obj.projectNameAr = obj.projectNameAr || project.nameAr || ''
      obj.projectCode = obj.projectCode || project.code || ''
    }
  }

  // Helper: flatten a nested contract object
  const flattenContract = (obj: Record<string, unknown>) => {
    const contract = obj.contract as Record<string, unknown> | undefined
    if (contract && typeof contract === 'object') {
      obj.contractNo = obj.contractNo || contract.contractNo || ''
      obj.contractHourlyRate = obj.contractHourlyRate || contract.hourlyRate || 0
      obj.deliveryFees = obj.deliveryFees || contract.deliveryFees || 0
      obj.deliveryFeesTaxable = obj.deliveryFeesTaxable ?? contract.deliveryFeesTaxable
      obj.salesOrderNo = obj.salesOrderNo || contract.salesOrderNo || ''
      obj.purchaseOrderNo = obj.purchaseOrderNo || contract.purchaseOrderNo || ''
    }
  }

  switch (type) {
    case 'service-invoice':
    case 'rental-invoice': {
      flattenClient(d)
      flattenProject(d)
      flattenContract(d)
      // Items should already have the right structure, but ensure fields
      const items = (d.items as Array<Record<string, unknown>>) || []
      d.items = items.map(item => ({
        description: item.description || '',
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || 0,
        totalPrice: item.totalPrice || 0,
      }))
      break
    }

    case 'timesheet-report': {
      flattenEquipment(d)
      flattenProject(d)
      flattenContract(d)
      // Flatten rental info
      const rental = d.rental as Record<string, unknown> | undefined
      if (rental && typeof rental === 'object') {
        d.hourlyRate = d.hourlyRate || rental.hourlyRate || 0
        d.deliveryFees = d.deliveryFees || rental.deliveryFees || 0
        d.deliveryFeesTaxable = d.deliveryFeesTaxable ?? rental.deliveryFeesTaxable
        d.salesOrderNo = d.salesOrderNo || rental.salesOrderNo || ''
      }
      // Flatten invoice info
      const invoice = d.invoice as Record<string, unknown> | undefined
      if (invoice && typeof invoice === 'object') {
        d.invoiceNo = d.invoiceNo || invoice.invoiceNo || ''
        d.invoiceStatus = d.invoiceStatus || invoice.status || ''
      }
      // Compute billing values if not present
      const operatingHours = Number(d.operatingHours) || 0
      const hourlyRate = Number(d.hourlyRate || d.contractHourlyRate) || 0
      const subtotal = operatingHours * hourlyRate
      if (!d.subtotal) d.subtotal = subtotal
      // VAT calculation
      const vatRate = 0.15
      const vatAmount = subtotal * vatRate
      if (!d.vatAmount) d.vatAmount = vatAmount
      // Delivery fees
      const deliveryFees = Number(d.deliveryFees) || 0
      const deliveryVat = (d.deliveryFeesTaxable === true || d.deliveryFeesTaxable === 'true') ? deliveryFees * vatRate : 0
      // Total
      if (!d.totalAmount) d.totalAmount = subtotal + vatAmount + deliveryFees + deliveryVat
      break
    }

    case 'rental-contract': {
      flattenClient(d)
      flattenEquipment(d)
      flattenProject(d)
      flattenContract(d)
      break
    }

    case 'equipment-report': {
      flattenEquipment(d)
      break
    }

    case 'supplier-invoice': {
      const supplier = d.supplier as Record<string, unknown> | undefined
      if (supplier && typeof supplier === 'object') {
        d.supplierName = d.supplierName || supplier.name || ''
        d.supplierTaxNumber = d.supplierTaxNumber || supplier.taxNumber || ''
        d.supplierAddress = d.supplierAddress || supplier.address || ''
      }
      break
    }

    default:
      // For other types, just do generic flattening of client/equipment/project if present
      flattenClient(d)
      flattenEquipment(d)
      flattenProject(d)
      break
  }

  return d
}

interface PrintButtonProps {
  type: PrintDocumentType
  documentId?: string
  data?: Record<string, unknown>
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
  label?: string
  showLabel?: boolean
}

/**
 * PrintButton - Centralized print button that opens documents in a professional print preview
 * NEVER uses window.print() on the current page
 * Fetches company settings automatically and generates professional A4 templates
 */
export function PrintButton({
  type,
  documentId,
  data,
  variant = 'outline',
  size = 'sm',
  className,
  label,
  showLabel = true,
}: PrintButtonProps) {
  const { lang } = useAppStore()
  const [loading, setLoading] = useState(false)

  const handlePrint = async () => {
    setLoading(true)
    try {
      // 1. Fetch company settings
      const settingsRes = await fetch('/api/company-settings')
      const settingsData = await settingsRes.json()
      const settings = settingsData.settings || settingsData

      // 2. If data is not provided, try to fetch it from the API
      let documentData = data
      if (!documentData && documentId) {
        const apiMap: Record<PrintDocumentType, string> = {
          'service-invoice': `/api/sales-invoices/${documentId}`,
          'rental-invoice': `/api/sales-invoices/${documentId}`,
          'extract': `/api/progress-claims?id=${documentId}`,
          'purchase-order': `/api/purchase-orders/${documentId}`,
          'supplier-invoice': `/api/supplier-invoices/${documentId}`,
          'tax-declaration': `/api/vat/${documentId}`,
          'delivery-order': `/api/delivery-orders/${documentId}`,
          'purchase-request': `/api/purchase-requests/${documentId}`,
          'goods-receipt': `/api/goods-receipt/${documentId}`,
          'salary-slip': `/api/salaries/${documentId}`,
          'attendance-report': `/api/attendance/${documentId}`,
          'client-payment': `/api/client-payments/${documentId}`,
          'supplier-payment': `/api/supplier-payments/${documentId}`,
          'rental-payment': `/api/client-payments/${documentId}`,
          'expense-report': `/api/expenses/${documentId}`,
          'advance-voucher': `/api/advances/${documentId}`,
          'petty-cash-voucher': `/api/petty-cash/${documentId}`,
          'rental-contract': `/api/equipment/rental-contracts/${documentId}`,
          'equipment-report': `/api/equipment/${documentId}`,
          'fuel-report': `/api/equipment/fuel/${documentId}`,
          'maintenance-report': `/api/equipment/maintenance/${documentId}`,
          'timesheet-report': `/api/equipment/timesheets/${documentId}`,
          'work-team-report': `/api/work-teams/${documentId}`,
          'resource-distribution': `/api/resource-distribution/${documentId}`,
          'journal-entry': `/api/journal-entries/${documentId}`,
          'trial-balance': `/api/trial-balance`,
          'account-statement': `/api/accounts/${documentId}`,
          'generic-table': '',
        }
        const apiUrl = apiMap[type]
        if (apiUrl) {
          const res = await fetch(apiUrl)
          if (res.ok) {
            documentData = await res.json()
          }
        }
      }

      if (!documentData) {
        alert(lang === 'ar' ? 'فشل في تحميل بيانات المستند' : 'Failed to load document data')
        return
      }

      // 3. Transform data for print service (flatten nested objects)
      const transformedData = transformDataForPrint(type, documentData)

      // 4. For invoice types, generate QR code from server (ZATCA compliance)
      if ((type === 'rental-invoice' || type === 'service-invoice' || type === 'supplier-invoice') && settings.taxNumber) {
        try {
          const sellerName = lang === 'ar' ? (settings.nameAr || '') : (settings.nameEn || '')
          const vatNumber = settings.taxNumber
          const invoiceDate = transformedData.date
            ? new Date(transformedData.date as string).toISOString().split('T')[0]
            : ''
          const totalAmount = Number(transformedData.totalAmount) || 0
          const vatAmount = Number(transformedData.vatAmount) || 0
          const totalStr = totalAmount.toFixed(2)
          const vatTotalStr = vatAmount.toFixed(2)

          const qrRes = await fetch(
            `/api/generate-qr?seller=${encodeURIComponent(sellerName)}&vat=${encodeURIComponent(vatNumber)}&date=${encodeURIComponent(invoiceDate)}&total=${encodeURIComponent(totalStr)}&vatTotal=${encodeURIComponent(vatTotalStr)}`
          )
          if (qrRes.ok) {
            const qrData = await qrRes.json()
            if (qrData.qrDataUrl) {
              transformedData.qrDataUrl = qrData.qrDataUrl
            }
          }
        } catch {
          // QR generation failed, will fall back to CDN approach in template
        }
      }

      // 4.5 Pre-process currency symbol image to remove background (for print templates)
      let processedCurrencySymbolImage = settings.currencySymbolImage || null
      if (processedCurrencySymbolImage && !processedCurrencySymbolImage.endsWith('.svg')) {
        try {
          const bgRes = await fetch('/api/remove-bg', {
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

      // 5. Generate print HTML using the professional print service
      const { generatePrintHTML } = await import('@/printing')
      const html = generatePrintHTML({
        type,
        data: transformedData,
        settings: {
          nameAr: settings.nameAr || '',
          nameEn: settings.nameEn || '',
          taxNumber: settings.taxNumber || null,
          commercialReg: settings.commercialReg || null,
          address: settings.address || null,
          phone: settings.phone || null,
          email: settings.email || null,
          website: settings.website || null,
          logoUrl: settings.logoUrl || settings.logo || null,
          headerImage: settings.headerImage || null,
          footerImage: settings.footerImage || null,
          stamp: settings.stamp || null,
          currencySymbolImage: processedCurrencySymbolImage,
          currencySymbol: settings.currencySymbol || null,
          currencySymbolAr: settings.currencySymbolAr || null,
          currencySymbolEn: settings.currencySymbolEn || null,
          defaultVatRate: settings.defaultVatRate || 0.15,
          bankName: settings.bankName || null,
          bankIban: settings.bankIban || null,
          bankAccountName: settings.bankAccountName || null,
          invoiceTerms: settings.invoiceTerms || null,
        },
        lang,
      })

      // 5. Open in new window for printing
      const printWindow = window.open('', '_blank', 'width=800,height=1000')
      if (printWindow) {
        printWindow.document.write(html)
        printWindow.document.close()
      }
    } catch (error) {
      console.error('Print error:', error)
      alert(lang === 'ar' ? 'فشل في إنشاء معاينة الطباعة' : 'Failed to generate print preview')
    } finally {
      setLoading(false)
    }
  }

  const displayLabel = label || (lang === 'ar' ? 'طباعة' : 'Print')

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handlePrint}
      disabled={loading}
      className={className}
      title={displayLabel}
    >
      <Printer className="size-4" />
      {showLabel && (
        <span className={size === 'icon' ? 'sr-only' : ''}>
          {loading ? (lang === 'ar' ? 'جاري التحميل...' : 'Loading...') : displayLabel}
        </span>
      )}
    </Button>
  )
}

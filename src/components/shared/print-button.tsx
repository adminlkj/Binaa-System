'use client'

import React, { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'
import type { PrintDocumentType } from '@/lib/print-service'

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
          'purchase-order': `/api/purchase-orders?id=${documentId}`,
          'supplier-invoice': `/api/purchase-invoices?id=${documentId}`,
          'tax-declaration': `/api/vat/${documentId}`,
          'delivery-order': `/api/delivery-orders/${documentId}`,
          'purchase-request': `/api/purchase-requests/${documentId}`,
          'goods-receipt': `/api/goods-receipt/${documentId}`,
          'salary-slip': `/api/salaries/${documentId}`,
          'attendance-report': `/api/attendance/${documentId}`,
          'client-payment': `/api/client-payments/${documentId}`,
          'supplier-payment': `/api/supplier-payments/${documentId}`,
          'rental-payment': `/api/rental-payments/${documentId}`,
          'expense-report': `/api/expenses/${documentId}`,
          'advance-voucher': `/api/advances/${documentId}`,
          'petty-cash-voucher': `/api/petty-cash/${documentId}`,
          'rental-contract': `/api/rental-contracts/${documentId}`,
          'equipment-report': `/api/equipment/${documentId}`,
          'fuel-report': `/api/fuel/${documentId}`,
          'maintenance-report': `/api/equipment-maintenance/${documentId}`,
          'timesheet-report': `/api/timesheets/${documentId}`,
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

      // 3. Generate print HTML using the professional print service
      const { generatePrintHTML } = await import('@/lib/print-service')
      const html = generatePrintHTML({
        type,
        data: documentData,
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
          currencySymbolImage: settings.currencySymbolImage || null,
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

      // 4. Open in new window for printing
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

'use client'

import React, { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'
import type { PrintDocumentType } from '@/lib/print-service'

interface PrintButtonProps {
  type: PrintDocumentType
  documentId: string
  data?: Record<string, unknown>
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

/**
 * PrintButton - Centralized print button that opens documents in a print preview
 * NEVER uses window.print() on the current page
 */
export function PrintButton({
  type,
  documentId,
  data,
  variant = 'outline',
  size = 'sm',
  className,
}: PrintButtonProps) {
  const { lang } = useAppStore()
  const [loading, setLoading] = useState(false)

  const handlePrint = async () => {
    setLoading(true)
    try {
      // Fetch company settings
      const settingsRes = await fetch('/api/company-settings')
      const settings = await settingsRes.json()

      // If data is not provided, fetch it from the API
      let documentData = data
      if (!documentData) {
        const apiMap: Record<PrintDocumentType, string> = {
          'service-invoice': `/api/sales-invoices/${documentId}`,
          'rental-invoice': `/api/sales-invoices/${documentId}`,
          'extract': `/api/progress-claims?id=${documentId}`,
          'purchase-order': `/api/purchase-orders?id=${documentId}`,
          'supplier-invoice': `/api/purchase-invoices?id=${documentId}`,
          'tax-declaration': `/api/vat/${documentId}`,
        }
        const res = await fetch(apiMap[type])
        if (res.ok) {
          documentData = await res.json()
        }
      }

      if (!documentData) {
        alert(lang === 'ar' ? 'فشل في تحميل بيانات المستند' : 'Failed to load document data')
        return
      }

      // Generate print HTML
      const { generatePrintHTML } = await import('@/lib/print-service')
      const html = generatePrintHTML({
        type,
        data: documentData,
        settings: {
          nameAr: settings.nameAr || '',
          nameEn: settings.nameEn || '',
          taxNumber: settings.taxNumber,
          address: settings.address,
          phone: settings.phone,
          email: settings.email,
          logoUrl: settings.logoUrl || settings.logo,
          headerImage: settings.headerImage,
          footerImage: settings.footerImage,
          stamp: settings.stamp,
          currencySymbolImage: settings.currencySymbolImage,
          defaultVatRate: settings.defaultVatRate || 0.15,
        },
        lang,
      })

      // Open in new window for printing
      const printWindow = window.open('', '_blank')
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

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handlePrint}
      disabled={loading}
      className={className}
    >
      <Printer className="size-4 mr-1" />
      {loading
        ? (lang === 'ar' ? 'جاري التحميل...' : 'Loading...')
        : (lang === 'ar' ? 'طباعة' : 'Print')
      }
    </Button>
  )
}

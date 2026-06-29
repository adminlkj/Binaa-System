'use client'

import React, { useEffect, useState } from 'react'
import { Printer, Building2, FileText, Stamp, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { numberToArabicWords, numberToEnglishWords } from '@/lib/amount-to-words'
import { generateZatcaQR } from '@/lib/zatca-qr'
import { CurrencySymbol } from '@/components/ui/currency-symbol'

// ============ Types ============
interface CompanySettings {
  id?: string
  nameAr: string
  nameEn: string
  logo?: string | null
  logoUrl?: string | null
  commercialReg?: string | null
  taxNumber?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  bankName?: string | null
  bankIban?: string | null
  bankAccountName?: string | null
  stamp?: string | null
  defaultVatRate: number
  currency: string
  currencySymbol?: string
  currencySymbolEn?: string
  currencySymbolAr?: string
  // CONSTANT RULE: the ONLY approved currency symbol is this image.
  // Background is removed automatically and the symbol is rendered next
  // to every amount in the invoice.
  currencySymbolImage?: string | null
  invoiceTerms?: string | null
  // Header & footer image uploads (full control from settings)
  headerImage?: string | null
  footerImage?: string | null
  // Invoice template customization (applied immediately from settings)
  invoiceTemplate?: string
  invoicePrimaryColor?: string
  invoiceAccentColor?: string
  invoiceFontFamily?: string
  invoiceShowBankDetails?: boolean
  invoiceShowSignature?: boolean
  invoiceShowStamp?: boolean
  // Stamp placement & size — full control via settings
  stampPosition?: string
  stampWidth?: number
  stampHeight?: number
  stampOffsetX?: number
  stampOffsetY?: number
  stampOpacity?: number
  stampRotation?: number
}

interface InvoiceItem {
  id: string
  description: string
  descriptionEn?: string | null
  quantity: number
  unit?: string | null
  unitPrice: number
  totalPrice: number
  itemType?: string
}

interface ClientInfo {
  id: string
  name: string
  nameAr?: string | null
  code: string
  taxNumber?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

interface ProjectInfo {
  id: string
  name: string
  nameAr?: string | null
  code: string
}

interface ContractInfo {
  id: string
  contractNo: string
}

interface InvoiceData {
  id: string
  invoiceNo: string
  projectId?: string | null
  contractId?: string | null
  clientId: string
  date: string
  dueDate: string
  subtotal: number
  discountRate: number
  discountAmount: number
  netAmount: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  paidAmount: number
  status: string
  invoiceType: string
  notes?: string | null
  paymentTerms?: string | null
  amountInWordsAr?: string | null
  amountInWordsEn?: string | null
  referenceNo?: string | null
  contractNo?: string | null
  contractType?: string | null
  contractPeriodStart?: string | null
  contractPeriodEnd?: string | null
  deliveryMonth?: string | null
  includeDelivery?: boolean
  deliveryAmount?: number
  includeVat?: boolean
  salesOrderNo?: string | null
  equipmentName?: string | null
  operatingHours?: number | null
  hourlyRate?: number | null
  client: ClientInfo
  project?: ProjectInfo | null
  contract?: ContractInfo | null
  items: InvoiceItem[]
}

interface InvoicePreviewProps {
  invoice: InvoiceData
  company: CompanySettings
  onClose?: () => void
}

// ============ Status Config ============
const statusConfig: Record<string, { label: string; labelEn: string; color: string; bg: string }> = {
  DRAFT: { label: 'مسودة', labelEn: 'Draft', color: 'text-gray-700', bg: 'bg-gray-400' },
  SENT: { label: 'مرسلة', labelEn: 'Sent', color: 'text-blue-700', bg: 'bg-blue-500' },
  PARTIALLY_PAID: { label: 'مدفوعة جزئياً', labelEn: 'Partially Paid', color: 'text-amber-700', bg: 'bg-amber-500' },
  PAID: { label: 'مدفوعة', labelEn: 'Paid', color: 'text-emerald-700', bg: 'bg-emerald-500' },
  OVERDUE: { label: 'متأخرة', labelEn: 'Overdue', color: 'text-red-700', bg: 'bg-red-500' },
  CANCELLED: { label: 'ملغية', labelEn: 'Cancelled', color: 'text-gray-500', bg: 'bg-gray-400' },
}

const invoiceTypeLabels: Record<string, { ar: string; en: string }> = {
  TAX_INVOICE: { ar: 'فاتورة ضريبية', en: 'Tax Invoice' },
  PROGRESS_CLAIM: { ar: 'مستخلص', en: 'Progress Claim' },
  RENTAL: { ar: 'فاتورة إيجار', en: 'Rental Invoice' },
  SERVICE: { ar: 'فاتورة خدمة', en: 'Service Invoice' },
}

// ============ Helpers ============

/** ZATCA format: NO thousand separators, always 2 decimal places */
function fmt(num: number): string {
  return num.toFixed(2)
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function fmtDateISO(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toISOString().replace('Z', '')
}

/** Format delivery month (e.g., "2026-05" → "مايو-2026") */
function fmtDeliveryMonth(monthStr: string | null | undefined): string | null {
  if (!monthStr) return null
  const arabicMonths = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ]
  try {
    const [year, month] = monthStr.split('-')
    const monthIndex = parseInt(month, 10) - 1
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${arabicMonths[monthIndex]}-${year}`
    }
  } catch {
    // fallback
  }
  return monthStr
}

/** Get the currency symbol for Arabic display */
function getCurrencySymbolAr(company: CompanySettings): string {
  return company.currencySymbolAr || company.currencySymbol || '\uFDFC'
}

// ============ Invoice Currency Symbol (image-aware) ============
/**
 * Renders the approved currency symbol image (with background removed)
 * next to invoice amounts. Falls back to the text <CurrencySymbol> SVG
 * only when no image is configured.
 *
 * CONSTANT RULE: the uploaded image is the ONLY approved currency symbol.
 */
const invoiceSymbolCache = new Map<string, string>()
function InvoiceCurrencySymbol({
  company,
  size = 'xs',
  className = '',
}: {
  company: CompanySettings
  size?: 'xs' | 'sm'
  className?: string
}) {
  const img = company.currencySymbolImage
  const [processed, setProcessed] = useState<string | null>(() =>
    img ? invoiceSymbolCache.get(img) ?? null : null
  )

  useEffect(() => {
    if (!img) return
    // If already processed (from initial cache or a prior fetch), no work to do.
    if (processed) return
    let cancelled = false
    fetch('/api/remove-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: img }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data?.dataUrl) {
          invoiceSymbolCache.set(img, data.dataUrl)
          setProcessed(data.dataUrl)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [img, processed])

  if (img) {
    const px = size === 'xs' ? 12 : 14
    if (processed) {
      return (
        <img
          src={processed}
          alt="currency"
          className={`inline-block ${className}`}
          style={{
            height: `${px}px`,
            width: 'auto',
            verticalAlign: 'middle',
            display: 'inline-block',
            margin: '0 2px',
          }}
        />
      )
    }
    // Placeholder while background-removal is processing
    return (
      <span
        className={`inline-block animate-pulse rounded ${className}`}
        style={{
          height: `${px}px`,
          width: `${px}px`,
          verticalAlign: 'middle',
          backgroundColor: 'rgba(0,0,0,0.06)',
          margin: '0 2px',
        }}
      />
    )
  }
  // Fallback to text/SVG symbol when no image is configured
  return <CurrencySymbol symbol={getCurrencySymbolAr(company)} size={size} className={className} />
}

// ============ Component ============
export function InvoicePreview({ invoice, company, onClose }: InvoicePreviewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [isPrinting, setIsPrinting] = useState(false)

  const status = statusConfig[invoice.status] || statusConfig.DRAFT
  const invType = invoiceTypeLabels[invoice.invoiceType] || invoiceTypeLabels.TAX_INVOICE

  // ===== Template settings (applied immediately from company settings) =====
  // The user controls the entire look via the Settings → Invoice Templates tab.
  // Changes here are saved to company_settings and picked up by every invoice.
  const primaryColor = company.invoicePrimaryColor || '#0f766e'
  const accentColor = company.invoiceAccentColor || '#34d399'
  const fontFamily =
    company.invoiceFontFamily === 'default' || !company.invoiceFontFamily
      ? "'Cairo', 'Amiri', 'Noto Sans Arabic', sans-serif"
      : `'${company.invoiceFontFamily}', 'Cairo', sans-serif`
  const showSignature = company.invoiceShowSignature ?? true
  const showStamp = company.invoiceShowStamp ?? false
  // Stamp placement & size — full control
  const stampPosition = company.stampPosition || 'after-signatures'
  const stampWidth = company.stampWidth ?? 140
  const stampHeight = company.stampHeight ?? 140
  const stampOffsetX = company.stampOffsetX ?? 0
  const stampOffsetY = company.stampOffsetY ?? 0
  const stampOpacity = Number(company.stampOpacity ?? 0.9)
  const stampRotation = company.stampRotation ?? 0

  // Derived values
  const netAmount = invoice.netAmount || (invoice.subtotal - invoice.discountAmount)
  const deliveryAmt = invoice.includeDelivery ? (invoice.deliveryAmount || 0) : 0
  const effectiveVatAmount = invoice.includeVat !== false ? invoice.vatAmount : 0

  // Generate ZATCA QR
  useEffect(() => {
    async function generateQR() {
      try {
        const qr = await generateZatcaQR({
          sellerName: company.nameAr,
          vatNumber: company.taxNumber || '',
          invoiceDate: fmtDateISO(invoice.date),
          totalAmount: fmt(invoice.totalAmount),
          vatAmount: fmt(effectiveVatAmount),
        })
        setQrDataUrl(qr.qrDataUrl || '')
      } catch (err) {
        console.error('QR generation error:', err)
      }
    }
    generateQR()
  }, [company.nameAr, company.taxNumber, invoice.date, invoice.totalAmount, effectiveVatAmount])

  // Amount in words
  const amountAr = invoice.amountInWordsAr || numberToArabicWords(invoice.totalAmount)
  const amountEn = invoice.amountInWordsEn || numberToEnglishWords(invoice.totalAmount)

  // Print handler
  const handlePrint = () => {
    setIsPrinting(true)
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
    }, 300)
  }

  // Determine if contract section should show
  const hasContractData = invoice.contractNo || invoice.contractType || invoice.contractPeriodStart || invoice.contractPeriodEnd

  // Helper: render the stamp in the configured position
  // The wrapper element uses absolute positioning for corner placements.
  const renderPositionedStamp = () => {
    if (!showStamp || !company.stamp) return null
    // For corner positions we use absolute placement; for content-flow positions
    // (after-signatures, after-totals) we render inline.
    if (stampPosition === 'after-signatures' || stampPosition === 'after-totals') {
      return null
    }
    const pos: React.CSSProperties = { position: 'absolute', zIndex: 5, pointerEvents: 'none' }
    if (stampPosition === 'top-right') { pos.top = `${20 + stampOffsetY}px`; pos.right = `${20 - stampOffsetX}px` }
    if (stampPosition === 'top-left') { pos.top = `${20 + stampOffsetY}px`; pos.left = `${20 + stampOffsetX}px` }
    if (stampPosition === 'bottom-right') { pos.bottom = `${20 - stampOffsetY}px`; pos.right = `${20 - stampOffsetX}px` }
    if (stampPosition === 'bottom-left') { pos.bottom = `${20 - stampOffsetY}px`; pos.left = `${20 + stampOffsetX}px` }
    if (stampPosition === 'center') {
      pos.top = '50%'; pos.left = '50%'
      pos.transform = `translate(-50%, -50%) rotate(${stampRotation}deg) translate(${stampOffsetX}px, ${stampOffsetY}px)`
      return (
        <div style={pos}>
          <img
            src={company.stamp}
            alt="Company Stamp"
            style={{
              width: `${stampWidth}px`,
              height: `${stampHeight}px`,
              objectFit: 'contain',
              opacity: stampOpacity,
            }}
          />
        </div>
      )
    }
    return (
      <div style={pos}>
        <img
          src={company.stamp}
          alt="Company Stamp"
          style={{
            width: `${stampWidth}px`,
            height: `${stampHeight}px`,
            objectFit: 'contain',
            opacity: stampOpacity,
            transform: `rotate(${stampRotation}deg)`,
          }}
        />
      </div>
    )
  }

  return (
    <div className="invoice-preview-wrapper" style={{ fontFamily }}>
      {/* Print/Close Buttons */}
      <div className="flex items-center justify-between mb-4 no-print">
        <div className="flex items-center gap-2">
          <Button
            onClick={handlePrint}
            className="gap-2"
            style={{ background: primaryColor, borderColor: primaryColor }}
            disabled={isPrinting}
          >
            <Printer className="size-4" />
            طباعة الفاتورة
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={handlePrint}
                  disabled={isPrinting}
                >
                  <FileDown className="size-4" />
                  تصدير PDF
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>اختر حفظ كـ PDF في نافذة الطباعة</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        )}
      </div>

      {/* ===================== INVOICE DOCUMENT ===================== */}
      <div className="invoice-document bg-white shadow-lg rounded-lg overflow-hidden relative" dir="rtl" style={{ position: 'relative' }}>

        {/* Optional: full-width custom header image (uploaded from Settings) */}
        {company.headerImage && (
          <div className="w-full" style={{ maxHeight: '180px', overflow: 'hidden' }}>
            <img
              src={company.headerImage}
              alt="Invoice Header"
              className="w-full object-cover"
              style={{ maxHeight: '180px' }}
            />
          </div>
        )}

        {/* Positioned stamp (corner/center placements) */}
        {renderPositionedStamp()}

        {/* ===== STATUS BAR (very top) ===== */}
        <div className="py-2 px-6 text-white text-center font-bold text-lg" style={{ background: status.bg }}>
          {status.label} — {status.labelEn}
        </div>

        {/* ===== STEP 1: HEADER (Full-width gradient using primary color from settings) ===== */}
        <div
          className="px-8 py-6"
          style={{ background: `linear-gradient(to left, ${primaryColor}, ${primaryColor}dd, ${primaryColor})` }}
        >
          <div className="flex items-center justify-between">
            {/* Logo + Company Name */}
            <div className="flex items-center gap-4">
              {company.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt={company.nameAr}
                  className="w-16 h-16 rounded-xl object-contain bg-white/90 p-1"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                  <Building2 className="size-8 text-white" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-white">{company.nameAr}</h1>
                <p className="text-base" style={{ color: accentColor }} dir="ltr">{company.nameEn}</p>
              </div>
            </div>
            {/* Invoice Type Badge */}
            <div className="bg-white/15 backdrop-blur-sm border border-white/30 rounded-lg px-5 py-3 text-center">
              <FileText className="size-5 text-white mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{invType.ar}</p>
              <p className="text-xs text-emerald-100" dir="ltr">{invType.en}</p>
            </div>
          </div>
        </div>

        {/* ===== STEP 2: Company Data Bar ===== */}
        <div className="border-b px-8 py-3" style={{ background: `${primaryColor}11`, borderColor: `${primaryColor}33` }}>
          <div className="text-center text-sm space-y-1.5">
            <p className="font-semibold" style={{ color: primaryColor }}>
              {company.nameAr} | <span dir="ltr">{company.nameEn}</span>
            </p>
            <p style={{ color: `${primaryColor}cc` }}>
              السجل التجاري: <span className="font-semibold" dir="ltr">{company.commercialReg}</span>
              <span className="mx-3" style={{ color: `${primaryColor}55` }}>|</span>
              الرقم الضريبي: <span className="font-semibold" dir="ltr">{company.taxNumber}</span>
            </p>
            <p style={{ color: `${primaryColor}cc` }}>
              الهاتف: <span className="font-semibold" dir="ltr">{company.phone}</span>
              <span className="mx-3" style={{ color: `${primaryColor}55` }}>|</span>
              البريد الإلكتروني: <span className="font-semibold" dir="ltr">{company.email}</span>
            </p>
            <p style={{ color: `${primaryColor}cc` }}>{company.address}</p>
          </div>
        </div>

        {/* ===== STEP 3: Invoice Title + Number ===== */}
        <div className="bg-white border-b border-gray-200 px-8 py-5 text-center">
          <h2 className="text-2xl font-bold" style={{ color: primaryColor }}>{invType.ar}</h2>
          <p className="text-lg text-gray-500" dir="ltr">{invType.en}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2 font-mono tracking-wide" dir="ltr">
            {invoice.invoiceNo}
          </p>
          {invoice.referenceNo && (
            <p className="text-sm text-gray-500 mt-1">
              رقم المرجع: <span className="font-mono font-semibold" dir="ltr">{invoice.referenceNo}</span>
            </p>
          )}
        </div>

        {/* ===== STEP 4: Invoice Info + Client Info (2 columns) ===== */}
        <div className="grid grid-cols-2 gap-0 border-b border-gray-200">
          {/* Left Column: Invoice Information */}
          <div className="px-8 py-5 border-l border-gray-200">
            <h3 className="text-sm font-bold mb-3 pb-1 border-b" style={{ color: primaryColor, borderColor: `${primaryColor}33` }}>
              معلومات الفاتورة / Invoice Information
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">رقم الفاتورة</span>
                <span className="font-bold text-gray-900 font-mono" dir="ltr">{invoice.invoiceNo}</span>
              </div>
              {invoice.referenceNo && (
                <div className="flex justify-between">
                  <span className="text-gray-500">رقم المرجع</span>
                  <span className="font-semibold text-gray-800 font-mono" dir="ltr">{invoice.referenceNo}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">تاريخ الإصدار</span>
                <span className="font-semibold text-gray-800" dir="ltr">{fmtDate(invoice.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">تاريخ الاستحقاق</span>
                <span className="font-semibold text-gray-800" dir="ltr">{fmtDate(invoice.dueDate)}</span>
              </div>
              {invoice.paymentTerms && (
                <div className="flex justify-between">
                  <span className="text-gray-500">شروط السداد</span>
                  <span className="font-semibold text-gray-800" dir="ltr">{invoice.paymentTerms}</span>
                </div>
              )}
              {invoice.deliveryMonth && (
                <div className="flex justify-between">
                  <span className="text-gray-500">شهر التسليم</span>
                  <span className="font-semibold text-gray-800">{fmtDeliveryMonth(invoice.deliveryMonth)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">الحالة</span>
                <span className={`font-bold ${status.color}`}>{status.label}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Client Information */}
          <div className="px-8 py-5">
            <h3 className="text-sm font-bold mb-3 pb-1 border-b" style={{ color: primaryColor, borderColor: `${primaryColor}33` }}>
              بيانات العميل / Client Information
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">اسم العميل</span>
                <span className="font-bold text-gray-900">{invoice.client.nameAr || invoice.client.name}</span>
              </div>
              {invoice.client.taxNumber && (
                <div className="flex justify-between">
                  <span className="text-gray-500">الرقم الضريبي</span>
                  <span className="font-semibold text-gray-800 font-mono" dir="ltr">{invoice.client.taxNumber}</span>
                </div>
              )}
              {invoice.client.phone && (
                <div className="flex justify-between">
                  <span className="text-gray-500">الهاتف</span>
                  <span className="font-semibold text-gray-800" dir="ltr">{invoice.client.phone}</span>
                </div>
              )}
              {invoice.client.email && (
                <div className="flex justify-between">
                  <span className="text-gray-500">البريد الإلكتروني</span>
                  <span className="font-semibold text-gray-800" dir="ltr">{invoice.client.email}</span>
                </div>
              )}
              {invoice.client.address && (
                <div className="flex justify-between">
                  <span className="text-gray-500">العنوان</span>
                  <span className="font-semibold text-gray-800">{invoice.client.address}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== STEP 5: Project & Contract Data ===== */}
        {(invoice.project || hasContractData) && (
          <div className="px-8 py-4 border-b border-gray-200">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-5 py-2 border-b border-gray-200">
                <h4 className="font-bold text-gray-700 text-sm">بيانات المشروع والعقد / Project & Contract Data</h4>
              </div>
              <div className="px-5 py-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                {invoice.project && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">المشروع:</span>
                    <span className="font-semibold text-gray-800">{invoice.project.nameAr || invoice.project.name}</span>
                  </div>
                )}
                {invoice.contractNo && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">رقم العقد:</span>
                    <span className="font-semibold text-gray-800 font-mono" dir="ltr">{invoice.contractNo}</span>
                  </div>
                )}
                {invoice.salesOrderNo && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">رقم طلب البيع:</span>
                    <span className="font-semibold text-gray-800 font-mono" dir="ltr">{invoice.salesOrderNo}</span>
                  </div>
                )}
                {invoice.contractType && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">نوع العقد:</span>
                    <span className="font-semibold text-gray-800">{invoice.contractType}</span>
                  </div>
                )}
                {invoice.contractPeriodStart && invoice.contractPeriodEnd && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">فترة العمل:</span>
                    <span className="font-semibold text-gray-800" dir="ltr">
                      {fmtDate(invoice.contractPeriodStart)} إلى {fmtDate(invoice.contractPeriodEnd)}
                    </span>
                  </div>
                )}
                {invoice.deliveryMonth && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">شهر التسليم:</span>
                    <span className="font-semibold text-gray-800">{fmtDeliveryMonth(invoice.deliveryMonth)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP 5B: Rental Equipment Data (for rental invoices) ===== */}
        {invoice.invoiceType === 'RENTAL' && (invoice.equipmentName || invoice.operatingHours || invoice.hourlyRate) && (
          <div className="px-8 py-4 border-b border-gray-200">
            <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50/30">
              <div className="bg-amber-100 px-5 py-2 border-b border-amber-200">
                <h4 className="font-bold text-amber-800 text-sm">بيانات المعدة والإيجار / Equipment & Rental Data</h4>
              </div>
              <div className="px-5 py-3 grid grid-cols-3 gap-x-8 gap-y-3 text-sm">
                {invoice.equipmentName && (
                  <div className="flex gap-2">
                    <span className="text-amber-600">المعدة:</span>
                    <span className="font-semibold text-gray-800">{invoice.equipmentName}</span>
                  </div>
                )}
                {invoice.operatingHours != null && (
                  <div className="flex gap-2">
                    <span className="text-amber-600">ساعات التشغيل:</span>
                    <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                      {invoice.operatingHours % 1 === 0 ? invoice.operatingHours.toFixed(0) : invoice.operatingHours.toFixed(2)} ساعة
                    </span>
                  </div>
                )}
                {invoice.hourlyRate != null && (
                  <div className="flex gap-2">
                    <span className="text-amber-600">سعر الساعة:</span>
                    <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                      <span className="inline-flex items-center gap-1">
                        {fmt(invoice.hourlyRate)} <InvoiceCurrencySymbol company={company} size="xs" />
                      </span>
                    </span>
                  </div>
                )}
                {invoice.deliveryMonth && (
                  <div className="flex gap-2">
                    <span className="text-amber-600">فترة الإيجار:</span>
                    <span className="font-semibold text-gray-800">{fmtDeliveryMonth(invoice.deliveryMonth)}</span>
                  </div>
                )}
                {invoice.contractNo && (
                  <div className="flex gap-2">
                    <span className="text-amber-600">رقم العقد:</span>
                    <span className="font-semibold text-gray-800 font-mono" dir="ltr">{invoice.contractNo}</span>
                  </div>
                )}
                {invoice.salesOrderNo && (
                  <div className="flex gap-2">
                    <span className="text-amber-600">رقم طلب البيع:</span>
                    <span className="font-semibold text-gray-800 font-mono" dir="ltr">{invoice.salesOrderNo}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP 6: Items Table ===== */}
        <div className="px-8 py-5">
          <table className="w-full text-sm border-collapse border border-gray-300">
            <thead>
              <tr className="text-white" style={{ background: primaryColor }}>
                <th className="py-2.5 px-3 text-center font-semibold w-10 border-l" style={{ borderColor: accentColor }}>#</th>
                <th className="py-2.5 px-3 text-right font-semibold border-l" style={{ borderColor: accentColor }}>الوصف / Description</th>
                <th className="py-2.5 px-3 text-center font-semibold w-20 border-l" style={{ borderColor: accentColor }}>الكمية / Qty</th>
                <th className="py-2.5 px-3 text-center font-semibold w-20 border-l" style={{ borderColor: accentColor }}>الوحدة / Unit</th>
                <th className="py-2.5 px-3 text-left font-semibold w-32 border-l" style={{ borderColor: accentColor }} dir="ltr">السعر / Price</th>
                <th className="py-2.5 px-3 text-left font-semibold w-32" dir="ltr">الإجمالي / Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={item.id} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                  <td className="py-2.5 px-3 text-gray-600 font-mono text-center border-l border-gray-200">{idx + 1}</td>
                  <td className="py-2.5 px-3 text-gray-900 font-medium border-l border-gray-200">{item.description}</td>
                  <td className="py-2.5 px-3 text-center text-gray-800 font-mono border-l border-gray-200">
                    {item.quantity % 1 === 0 ? item.quantity.toFixed(0) : item.quantity.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-center text-gray-600 border-l border-gray-200">{item.unit || '—'}</td>
                  <td className="py-2.5 px-3 text-left text-gray-800 font-mono border-l border-gray-200" dir="ltr">
                    <span className="inline-flex items-center gap-1">
                      {fmt(item.unitPrice)} <InvoiceCurrencySymbol company={company} size="xs" />
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-left text-gray-900 font-semibold font-mono" dir="ltr">
                    <span className="inline-flex items-center gap-1">
                      {fmt(item.totalPrice)} <InvoiceCurrencySymbol company={company} size="xs" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-400" style={{ background: `${primaryColor}11` }}>
                <td colSpan={5} className="py-2.5 px-3 text-left font-bold" style={{ color: primaryColor }}>
                  الإجمالي / Subtotal
                </td>
                <td className="py-2.5 px-3 text-left font-bold font-mono" style={{ color: primaryColor }} dir="ltr">
                  <span className="inline-flex items-center gap-1">
                    {fmt(invoice.subtotal)} <InvoiceCurrencySymbol company={company} size="xs" />
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ===== STEP 7: QR Code + Totals (SIDE BY SIDE) ===== */}
        <div className="px-8 pb-5">
          <div className="grid grid-cols-2 gap-6">
            {/* QR Code - LEFT side */}
            <div className="flex items-start justify-center">
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <p className="text-xs text-center text-gray-500 mb-2 font-medium">رمز الاستجابة السريعة / QR Code</p>
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="ZATCA QR Code"
                    className="mx-auto"
                    style={{ width: '120px', height: '120px', minWidth: '120px', minHeight: '120px' }}
                  />
                ) : (
                  <div
                    className="mx-auto bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs"
                    style={{ width: '120px', height: '120px', minWidth: '120px', minHeight: '120px' }}
                  >
                    جاري التحميل...
                  </div>
                )}
                <p className="text-[10px] text-center text-gray-400 mt-1">ZATCA E-Invoice</p>
              </div>
            </div>

            {/* Totals Box - RIGHT side */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-2 border-b" style={{ background: `${primaryColor}11`, borderColor: `${primaryColor}33` }}>
                <h4 className="font-bold text-sm text-center" style={{ color: primaryColor }}>الإجماليات / Totals</h4>
              </div>
              <div className="px-5 py-3 space-y-2 text-sm">
                {/* Subtotal */}
                <div className="flex justify-between">
                  <span className="text-gray-600">الإجمالي قبل الضريبة</span>
                  <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                    <span className="inline-flex items-center gap-1">
                      {fmt(invoice.subtotal)} <InvoiceCurrencySymbol company={company} size="xs" />
                    </span>
                  </span>
                </div>

                {/* Discount */}
                {invoice.discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>الخصم {invoice.discountRate > 0 ? `(${(invoice.discountRate * 100).toFixed(0)}%)` : ''}</span>
                    <span className="font-semibold font-mono" dir="ltr">
                      <span className="inline-flex items-center gap-1">
                        -{fmt(invoice.discountAmount)} <InvoiceCurrencySymbol company={company} size="xs" />
                      </span>
                    </span>
                  </div>
                )}

                {/* Net Amount */}
                {(invoice.discountAmount > 0) && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">صافي المبلغ</span>
                    <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                      <span className="inline-flex items-center gap-1">
                        {fmt(netAmount)} <InvoiceCurrencySymbol company={company} size="xs" />
                      </span>
                    </span>
                  </div>
                )}

                {/* Delivery Charges */}
                {deliveryAmt > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>مصروف التوصيل</span>
                    <span className="font-semibold font-mono" dir="ltr">
                      <span className="inline-flex items-center gap-1">
                        {fmt(deliveryAmt)} <InvoiceCurrencySymbol company={company} size="xs" />
                      </span>
                    </span>
                  </div>
                )}

                {/* VAT */}
                {invoice.includeVat !== false && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">ضريبة القيمة المضافة ({(invoice.vatRate * 100).toFixed(0)}%)</span>
                    <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                      <span className="inline-flex items-center gap-1">
                        {fmt(invoice.vatAmount)} <InvoiceCurrencySymbol company={company} size="xs" />
                      </span>
                    </span>
                  </div>
                )}

                {/* Separator */}
                <div className="border-t-2 my-1" style={{ borderColor: primaryColor }} />

                {/* Grand Total */}
                <div className="flex justify-between items-center -mx-5 px-5 py-3 rounded-b-lg" style={{ background: primaryColor }}>
                  <span className="text-white font-bold text-base">الإجمالي النهائي</span>
                  <span className="text-white font-bold text-lg font-mono" dir="ltr">
                    <span className="inline-flex items-center gap-1">
                      {fmt(invoice.totalAmount)} <InvoiceCurrencySymbol company={company} size="sm" className="text-white" />
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== STEP 8: Amount in Words ===== */}
        <div className="px-8 pb-5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4">
            <p className="text-sm text-amber-800 font-medium mb-1">
              <span className="text-amber-600 font-bold">المبلغ كتابة: </span>
              {amountAr} <span className="text-amber-600">ريال سعودي</span>
            </p>
            <p className="text-sm text-amber-700" dir="ltr">
              <span className="font-bold">The amount in words: </span>
              {amountEn} <span className="text-amber-600">Saudi Riyals</span>
            </p>
          </div>
        </div>

        {/* ===== STEP 9: Signatures + Company Stamp (3 columns) ===== */}
        {/* Signatures section is conditionally rendered based on settings (showSignature) */}
        {/* The stamp is rendered separately based on stampPosition setting */}
        {(showSignature || (showStamp && stampPosition === 'after-signatures')) && (
          <div className="px-8 pb-5">
            <div className={`grid ${showSignature && showStamp && stampPosition === 'after-signatures' ? 'grid-cols-3' : showSignature ? 'grid-cols-2' : 'grid-cols-1'} gap-6 items-start`}>
              {/* Sales Rep Signature */}
              {showSignature && (
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">مسؤول المبيعات</p>
                  <p className="text-xs text-gray-400 mt-0.5">Sales Representative</p>
                  <div className="mt-8 border-t-2 border-gray-300 pt-2">
                    <p className="text-xs text-gray-400">التوقيع / Signature</p>
                  </div>
                </div>
              )}

              {/* Client Signature */}
              {showSignature && (
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">العميل</p>
                  <p className="text-xs text-gray-400 mt-0.5">Client</p>
                  <div className="mt-8 border-t-2 border-gray-300 pt-2">
                    <p className="text-xs text-gray-400">التوقيع / Signature</p>
                  </div>
                </div>
              )}

              {/* Company Stamp — shown here only when stampPosition = 'after-signatures' */}
              {showStamp && stampPosition === 'after-signatures' && (
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">ختم الشركة</p>
                  <p className="text-xs text-gray-400 mt-0.5">Company Stamp</p>
                  <div className="mt-4 flex items-center justify-center">
                    {company.stamp ? (
                      <img
                        src={company.stamp}
                        alt="Company Stamp"
                        style={{
                          width: `${stampWidth}px`,
                          height: `${stampHeight}px`,
                          objectFit: 'contain',
                          opacity: stampOpacity,
                          transform: `rotate(${stampRotation}deg) translate(${stampOffsetX}px, ${stampOffsetY}px)`,
                        }}
                      />
                    ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center" style={{ width: `${stampWidth}px`, height: `${stampHeight}px` }}>
                        <Stamp className="size-8 text-gray-300" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stamp placed after-totals: render it between totals and signatures */}
        {showStamp && stampPosition === 'after-totals' && company.stamp && (
          <div className="px-8 pb-5 flex justify-center">
            <img
              src={company.stamp}
              alt="Company Stamp"
              style={{
                width: `${stampWidth}px`,
                height: `${stampHeight}px`,
                objectFit: 'contain',
                opacity: stampOpacity,
                transform: `rotate(${stampRotation}deg) translate(${stampOffsetX}px, ${stampOffsetY}px)`,
              }}
            />
          </div>
        )}

        {/* ===== STEP 10: FOOTER ===== */}
        {/* Optional: custom footer image (uploaded from Settings) */}
        {company.footerImage ? (
          <div className="w-full" style={{ maxHeight: '120px', overflow: 'hidden' }}>
            <img
              src={company.footerImage}
              alt="Invoice Footer"
              className="w-full object-cover"
              style={{ maxHeight: '120px' }}
            />
          </div>
        ) : (
          <div className="px-8 py-5" style={{ background: `linear-gradient(to left, ${primaryColor}, ${primaryColor}dd, ${primaryColor})` }}>
            <div className="text-center">
              <p className="text-sm font-bold text-white mb-1">
                متوافق مع هيئة الزكاة والضريبة والجمارك
              </p>
              <p className="text-xs mb-3" style={{ color: accentColor }} dir="ltr">
                ZATCA (Zakat, Tax and Customs Authority) Compliant
              </p>
              <div className="h-px mb-3" style={{ background: `${accentColor}55` }} />
              <div className="flex items-center justify-center gap-4 text-xs" style={{ color: accentColor }}>
                <span>{company.nameAr}</span>
                <span style={{ color: `${accentColor}88` }}>|</span>
                <span>الرقم الضريبي: <span dir="ltr">{company.taxNumber}</span></span>
                <span style={{ color: `${accentColor}88` }}>|</span>
                <span>التاريخ: <span dir="ltr">{fmtDate(invoice.date)}</span></span>
              </div>
              <div className="flex items-center justify-center gap-4 text-xs mt-1" style={{ color: accentColor }}>
                <span className="inline-flex items-center gap-1">الإجمالي: <span dir="ltr" className="inline-flex items-center gap-1">{fmt(invoice.totalAmount)} <InvoiceCurrencySymbol company={company} size="xs" /></span></span>
                <span style={{ color: `${accentColor}88` }}>|</span>
                <span className="inline-flex items-center gap-1">إجمالي الضريبة: <span dir="ltr" className="inline-flex items-center gap-1">{fmt(effectiveVatAmount)} <InvoiceCurrencySymbol company={company} size="xs" /></span></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export type { InvoiceData, CompanySettings, InvoiceItem, ClientInfo, ProjectInfo, ContractInfo }

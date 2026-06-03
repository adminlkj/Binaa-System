'use client'

import React, { useEffect, useState } from 'react'
import { Printer, Building2, FileText, Stamp, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { numberToArabicWords, numberToEnglishWords } from '@/lib/amount-to-words'
import { generateZATCAQR } from '@/lib/zatca-qr'
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
  invoiceTerms?: string | null
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

/** Get the currency symbol for English display */
function getCurrencySymbolEn(company: CompanySettings): string {
  return company.currencySymbolEn || 'SAR'
}

/** Format amount with currency symbol for inline display (Arabic side) */
function fmtAr(num: number, company: CompanySettings): string {
  return `${fmt(num)} ${getCurrencySymbolAr(company)}`
}

/** Format amount with currency symbol for inline display (English side) */
function fmtEn(num: number, company: CompanySettings): string {
  return `${getCurrencySymbolEn(company)} ${fmt(num)}`
}

// ============ Component ============
export function InvoicePreview({ invoice, company, onClose }: InvoicePreviewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [isPrinting, setIsPrinting] = useState(false)

  const status = statusConfig[invoice.status] || statusConfig.DRAFT
  const invType = invoiceTypeLabels[invoice.invoiceType] || invoiceTypeLabels.TAX_INVOICE

  // Derived values
  const symbolAr = getCurrencySymbolAr(company)
  const netAmount = invoice.netAmount || (invoice.subtotal - invoice.discountAmount)
  const deliveryAmt = invoice.includeDelivery ? (invoice.deliveryAmount || 0) : 0
  const effectiveVatAmount = invoice.includeVat !== false ? invoice.vatAmount : 0

  // Generate ZATCA QR
  useEffect(() => {
    async function generateQR() {
      try {
        const qr = await generateZATCAQR({
          sellerName: company.nameAr,
          vatNumber: company.taxNumber || '',
          date: fmtDateISO(invoice.date),
          total: fmt(invoice.totalAmount),
          vatTotal: fmt(effectiveVatAmount),
        })
        setQrDataUrl(qr)
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

  return (
    <div className="invoice-preview-wrapper" style={{ fontFamily: "'Cairo', 'Amiri', 'Noto Sans Arabic', sans-serif" }}>
      {/* Print/Close Buttons */}
      <div className="flex items-center justify-between mb-4 no-print">
        <div className="flex items-center gap-2">
          <Button
            onClick={handlePrint}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
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
      <div className="invoice-document bg-white shadow-lg rounded-lg overflow-hidden" dir="rtl">

        {/* ===== STATUS BAR (very top) ===== */}
        <div className={`${status.bg} py-2 px-6 text-white text-center font-bold text-lg`}>
          {status.label} — {status.labelEn}
        </div>

        {/* ===== STEP 1: HEADER (Full-width emerald gradient) ===== */}
        <div className="bg-gradient-to-l from-emerald-700 via-emerald-600 to-emerald-800 px-8 py-6">
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
                <p className="text-base text-emerald-100" dir="ltr">{company.nameEn}</p>
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
        <div className="bg-emerald-50 border-b border-emerald-200 px-8 py-3">
          <div className="text-center text-sm space-y-1.5">
            <p className="font-semibold text-emerald-800">
              {company.nameAr} | <span dir="ltr">{company.nameEn}</span>
            </p>
            <p className="text-emerald-700">
              السجل التجاري: <span className="font-semibold" dir="ltr">{company.commercialReg}</span>
              <span className="mx-3 text-emerald-300">|</span>
              الرقم الضريبي: <span className="font-semibold" dir="ltr">{company.taxNumber}</span>
            </p>
            <p className="text-emerald-700">
              الهاتف: <span className="font-semibold" dir="ltr">{company.phone}</span>
              <span className="mx-3 text-emerald-300">|</span>
              البريد الإلكتروني: <span className="font-semibold" dir="ltr">{company.email}</span>
            </p>
            <p className="text-emerald-700">{company.address}</p>
          </div>
        </div>

        {/* ===== STEP 3: Invoice Title + Number ===== */}
        <div className="bg-white border-b border-gray-200 px-8 py-5 text-center">
          <h2 className="text-2xl font-bold text-emerald-800">{invType.ar}</h2>
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
            <h3 className="text-sm font-bold text-emerald-700 mb-3 pb-1 border-b border-emerald-200">
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
            <h3 className="text-sm font-bold text-emerald-700 mb-3 pb-1 border-b border-emerald-200">
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

        {/* ===== STEP 6: Items Table ===== */}
        <div className="px-8 py-5">
          <table className="w-full text-sm border-collapse border border-gray-300">
            <thead>
              <tr className="bg-emerald-600 text-white">
                <th className="py-2.5 px-3 text-center font-semibold w-10 border-l border-emerald-500">#</th>
                <th className="py-2.5 px-3 text-right font-semibold border-l border-emerald-500">الوصف / Description</th>
                <th className="py-2.5 px-3 text-center font-semibold w-20 border-l border-emerald-500">الكمية / Qty</th>
                <th className="py-2.5 px-3 text-center font-semibold w-20 border-l border-emerald-500">الوحدة / Unit</th>
                <th className="py-2.5 px-3 text-left font-semibold w-32 border-l border-emerald-500" dir="ltr">السعر / Price</th>
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
                    {fmt(item.unitPrice)} <CurrencySymbol symbol={symbolAr} size="xs" />
                  </td>
                  <td className="py-2.5 px-3 text-left text-gray-900 font-semibold font-mono" dir="ltr">
                    {fmt(item.totalPrice)} <CurrencySymbol symbol={symbolAr} size="xs" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-400 bg-emerald-50">
                <td colSpan={5} className="py-2.5 px-3 text-left font-bold text-emerald-800">
                  الإجمالي / Subtotal
                </td>
                <td className="py-2.5 px-3 text-left font-bold text-emerald-800 font-mono" dir="ltr">
                  {fmt(invoice.subtotal)} <CurrencySymbol symbol={symbolAr} size="xs" />
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
              <div className="bg-emerald-50 px-5 py-2 border-b border-emerald-200">
                <h4 className="font-bold text-emerald-700 text-sm text-center">الإجماليات / Totals</h4>
              </div>
              <div className="px-5 py-3 space-y-2 text-sm">
                {/* Subtotal */}
                <div className="flex justify-between">
                  <span className="text-gray-600">الإجمالي قبل الضريبة</span>
                  <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                    {fmtAr(invoice.subtotal, company)}
                  </span>
                </div>

                {/* Discount */}
                {invoice.discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>الخصم {invoice.discountRate > 0 ? `(${(invoice.discountRate * 100).toFixed(0)}%)` : ''}</span>
                    <span className="font-semibold font-mono" dir="ltr">-{fmtAr(invoice.discountAmount, company)}</span>
                  </div>
                )}

                {/* Net Amount */}
                {(invoice.discountAmount > 0) && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">صافي المبلغ</span>
                    <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                      {fmtAr(netAmount, company)}
                    </span>
                  </div>
                )}

                {/* Delivery Charges */}
                {deliveryAmt > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>مصروف التوصيل</span>
                    <span className="font-semibold font-mono" dir="ltr">
                      {fmtAr(deliveryAmt, company)}
                    </span>
                  </div>
                )}

                {/* VAT */}
                {invoice.includeVat !== false && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">ضريبة القيمة المضافة ({(invoice.vatRate * 100).toFixed(0)}%)</span>
                    <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                      {fmtAr(invoice.vatAmount, company)}
                    </span>
                  </div>
                )}

                {/* Separator */}
                <div className="border-t-2 border-emerald-600 my-1" />

                {/* Grand Total */}
                <div className="flex justify-between items-center bg-emerald-600 -mx-5 px-5 py-3 rounded-b-lg">
                  <span className="text-white font-bold text-base">الإجمالي النهائي</span>
                  <span className="text-white font-bold text-lg font-mono flex items-center gap-1" dir="ltr">
                    {fmt(invoice.totalAmount)} <CurrencySymbol symbol={symbolAr} size="sm" className="text-white" />
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
        <div className="px-8 pb-5">
          <div className="grid grid-cols-3 gap-6">
            {/* Sales Rep Signature */}
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">مسؤول المبيعات</p>
              <p className="text-xs text-gray-400 mt-0.5">Sales Representative</p>
              <div className="mt-8 border-t-2 border-gray-300 pt-2">
                <p className="text-xs text-gray-400">التوقيع / Signature</p>
              </div>
            </div>

            {/* Client Signature */}
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">العميل</p>
              <p className="text-xs text-gray-400 mt-0.5">Client</p>
              <div className="mt-8 border-t-2 border-gray-300 pt-2">
                <p className="text-xs text-gray-400">التوقيع / Signature</p>
              </div>
            </div>

            {/* Company Stamp */}
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">ختم الشركة</p>
              <p className="text-xs text-gray-400 mt-0.5">Company Stamp</p>
              <div className="mt-4 flex items-center justify-center">
                {company.stamp ? (
                  <img
                    src={company.stamp}
                    alt="Company Stamp"
                    className="object-contain"
                    style={{ maxWidth: '160px', maxHeight: '160px', minWidth: '120px', minHeight: '120px' }}
                  />
                ) : (
                  <div className="w-[120px] h-[120px] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                    <Stamp className="size-8 text-gray-300" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===== STEP 10: FOOTER (Full-width emerald) ===== */}
        <div className="bg-gradient-to-l from-emerald-700 via-emerald-600 to-emerald-800 px-8 py-5">
          <div className="text-center">
            <p className="text-sm font-bold text-white mb-1">
              متوافق مع هيئة الزكاة والضريبة والجمارك
            </p>
            <p className="text-xs text-emerald-100 mb-3" dir="ltr">
              ZATCA (Zakat, Tax and Customs Authority) Compliant
            </p>
            <div className="h-px bg-emerald-400/30 mb-3" />
            <div className="flex items-center justify-center gap-4 text-xs text-emerald-100">
              <span>{company.nameAr}</span>
              <span className="text-emerald-300">|</span>
              <span>الرقم الضريبي: <span dir="ltr">{company.taxNumber}</span></span>
              <span className="text-emerald-300">|</span>
              <span>التاريخ: <span dir="ltr">{fmtDate(invoice.date)}</span></span>
            </div>
            <div className="flex items-center justify-center gap-4 text-xs text-emerald-200 mt-1">
              <span>الإجمالي: <span dir="ltr">{fmtAr(invoice.totalAmount, company)}</span></span>
              <span className="text-emerald-300">|</span>
              <span>إجمالي الضريبة: <span dir="ltr">{fmtAr(effectiveVatAmount, company)}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export type { InvoiceData, CompanySettings, InvoiceItem, ClientInfo, ProjectInfo, ContractInfo }

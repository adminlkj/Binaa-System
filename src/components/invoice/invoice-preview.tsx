'use client'

import React, { useEffect, useState } from 'react'
import { Printer, Building2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  currencySymbol?: string    // Arabic symbol from settings (default: ﷼)
  currencySymbolEn?: string  // English symbol from settings (default: SAR)
  currencySymbolAr?: string  // Arabic abbreviation from settings (default: ﷼)
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
}

// ============ Helper ============
function fmt(num: number): string {
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

/**
 * Get the currency symbol for Arabic display
 * Uses the symbol from company settings (loaded from font files)
 */
function getCurrencySymbolAr(company: CompanySettings): string {
  return company.currencySymbolAr || company.currencySymbol || '\uFDFC'
}

/**
 * Get the currency symbol for English display
 */
function getCurrencySymbolEn(company: CompanySettings): string {
  return company.currencySymbolEn || 'SAR'
}

/**
 * Format amount with currency symbol for Arabic display
 * Returns a string with number + symbol (symbol comes from settings/font)
 */
function fmtWithCurrency(num: number, company: CompanySettings, lang: 'ar' | 'en' = 'ar'): string {
  const formatted = fmt(num)
  if (lang === 'ar') {
    return `${formatted} ${getCurrencySymbolAr(company)}`
  }
  return `${getCurrencySymbolEn(company)} ${formatted}`
}

// ============ Component ============
export function InvoicePreview({ invoice, company, onClose }: InvoicePreviewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [isPrinting, setIsPrinting] = useState(false)

  const status = statusConfig[invoice.status] || statusConfig.DRAFT
  const invType = invoiceTypeLabels[invoice.invoiceType] || invoiceTypeLabels.TAX_INVOICE

  // Get currency symbols from company settings
  const symbolAr = getCurrencySymbolAr(company)
  const symbolEn = getCurrencySymbolEn(company)

  // Generate ZATCA QR
  useEffect(() => {
    async function generateQR() {
      try {
        const qr = await generateZATCAQR({
          sellerName: company.nameAr,
          vatNumber: company.taxNumber || '',
          date: fmtDateISO(invoice.date),
          total: fmt(invoice.totalAmount),
          vatTotal: fmt(invoice.vatAmount),
        })
        setQrDataUrl(qr)
      } catch (err) {
        console.error('QR generation error:', err)
      }
    }
    generateQR()
  }, [company.nameAr, company.taxNumber, invoice.date, invoice.totalAmount, invoice.vatAmount])

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

  return (
    <div className="invoice-preview-wrapper">
      {/* Print/Close Buttons - hidden in print */}
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
        </div>
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        )}
      </div>

      {/* Invoice Document */}
      <div className="invoice-document bg-white shadow-lg rounded-lg overflow-hidden" dir="rtl">
        {/* Status Bar */}
        <div className={`${status.bg} py-2 px-6 text-white text-center font-bold text-lg`}>
          {status.label} — {status.labelEn}
        </div>

        {/* Company Header */}
        <div className="px-8 py-6 border-b-2 border-emerald-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-emerald-600 flex items-center justify-center">
                <Building2 className="size-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{company.nameAr}</h1>
                <p className="text-base text-gray-600" dir="ltr">{company.nameEn}</p>
              </div>
            </div>
            <div className="text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <FileText className="size-5 text-emerald-600" />
                <span className="text-lg font-bold text-emerald-700">{invType.ar}</span>
                <span className="text-sm text-emerald-600" dir="ltr">({invType.en})</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-gray-500 font-medium">الرقم الضريبي:</span>
              <span className="font-semibold text-gray-800" dir="ltr">{company.taxNumber}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 font-medium">السجل التجاري:</span>
              <span className="font-semibold text-gray-800" dir="ltr">{company.commercialReg}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 font-medium">العنوان:</span>
              <span className="text-gray-800">{company.address}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 font-medium">الهاتف:</span>
              <span className="font-semibold text-gray-800" dir="ltr">{company.phone}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 font-medium">البريد الإلكتروني:</span>
              <span className="font-semibold text-gray-800" dir="ltr">{company.email}</span>
            </div>
          </div>
        </div>

        {/* Invoice Info + Client Info */}
        <div className="grid grid-cols-2 gap-0 border-b border-gray-200">
          {/* Invoice Info */}
          <div className="px-8 py-5 border-l border-gray-200">
            <h3 className="text-sm font-bold text-emerald-700 mb-3 pb-1 border-b border-emerald-200">
              معلومات الفاتورة
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">رقم الفاتورة</span>
                <span className="font-bold text-gray-900 font-mono">{invoice.invoiceNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">تاريخ الإصدار</span>
                <span className="font-semibold text-gray-800" dir="ltr">{fmtDate(invoice.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">تاريخ الاستحقاق</span>
                <span className="font-semibold text-gray-800" dir="ltr">{fmtDate(invoice.dueDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">نوع الفاتورة</span>
                <span className="font-semibold text-gray-800">{invType.ar}</span>
              </div>
              {invoice.project && (
                <div className="flex justify-between">
                  <span className="text-gray-500">المشروع</span>
                  <span className="font-semibold text-gray-800">{invoice.project.name}</span>
                </div>
              )}
              {invoice.contract && (
                <div className="flex justify-between">
                  <span className="text-gray-500">رقم العقد</span>
                  <span className="font-semibold text-gray-800 font-mono">{invoice.contract.contractNo}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">الحالة</span>
                <span className={`font-bold ${status.color}`}>{status.label}</span>
              </div>
            </div>
          </div>

          {/* Client Info */}
          <div className="px-8 py-5">
            <h3 className="text-sm font-bold text-emerald-700 mb-3 pb-1 border-b border-emerald-200">
              بيانات العميل
            </h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">اسم العميل: </span>
                <span className="font-bold text-gray-900">{invoice.client.name}</span>
              </div>
              {invoice.client.taxNumber && (
                <div>
                  <span className="text-gray-500">الرقم الضريبي: </span>
                  <span className="font-semibold text-gray-800" dir="ltr">{invoice.client.taxNumber}</span>
                </div>
              )}
              {invoice.client.phone && (
                <div>
                  <span className="text-gray-500">الهاتف: </span>
                  <span className="font-semibold text-gray-800" dir="ltr">{invoice.client.phone}</span>
                </div>
              )}
              {invoice.client.email && (
                <div>
                  <span className="text-gray-500">البريد الإلكتروني: </span>
                  <span className="font-semibold text-gray-800" dir="ltr">{invoice.client.email}</span>
                </div>
              )}
              {invoice.client.address && (
                <div>
                  <span className="text-gray-500">العنوان: </span>
                  <span className="font-semibold text-gray-800">{invoice.client.address}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="px-8 py-5">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-emerald-600 text-white">
                <th className="py-2.5 px-3 text-right font-semibold w-10">#</th>
                <th className="py-2.5 px-3 text-right font-semibold">الوصف</th>
                <th className="py-2.5 px-3 text-center font-semibold w-20">الكمية</th>
                <th className="py-2.5 px-3 text-center font-semibold w-20">الوحدة</th>
                <th className="py-2.5 px-3 text-left font-semibold w-28" dir="ltr">السعر</th>
                <th className="py-2.5 px-3 text-left font-semibold w-28" dir="ltr">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  <td className="py-2.5 px-3 text-gray-600 font-mono text-center">{idx + 1}</td>
                  <td className="py-2.5 px-3 text-gray-900 font-medium">{item.description}</td>
                  <td className="py-2.5 px-3 text-center text-gray-800 font-mono">{item.quantity.toLocaleString('en-US')}</td>
                  <td className="py-2.5 px-3 text-center text-gray-600">{item.unit || '—'}</td>
                  <td className="py-2.5 px-3 text-left text-gray-800 font-mono" dir="ltr">
                    {fmt(item.unitPrice)} <CurrencySymbol symbol={symbolAr} size="xs" />
                  </td>
                  <td className="py-2.5 px-3 text-left text-gray-900 font-semibold font-mono" dir="ltr">
                    {fmt(item.totalPrice)} <CurrencySymbol symbol={symbolAr} size="xs" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300">
                <td colSpan={5} className="py-2 px-3 text-left font-medium text-gray-600">
                  الإجمالي
                </td>
                <td className="py-2 px-3 text-left font-bold text-gray-900 font-mono" dir="ltr">
                  {fmt(invoice.subtotal)} <CurrencySymbol symbol={symbolAr} size="xs" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Totals Section */}
        <div className="px-8 pb-5">
          <div className="mr-auto w-80 border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-5 py-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">إجمالي قبل الضريبة</span>
                <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                  {fmtWithCurrency(invoice.subtotal, company)}
                </span>
              </div>
              {invoice.discountAmount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>الخصم {invoice.discountRate > 0 ? `(${(invoice.discountRate * 100).toFixed(0)}%)` : ''}</span>
                  <span className="font-semibold font-mono" dir="ltr">-{fmtWithCurrency(invoice.discountAmount, company)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">صافي المبلغ</span>
                <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                  {fmtWithCurrency(invoice.netAmount || (invoice.subtotal - invoice.discountAmount), company)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ضريبة القيمة المضافة ({(invoice.vatRate * 100).toFixed(0)}%)</span>
                <span className="font-semibold text-gray-800 font-mono" dir="ltr">
                  {fmtWithCurrency(invoice.vatAmount, company)}
                </span>
              </div>
            </div>
            <div className="bg-emerald-600 px-5 py-3 flex justify-between items-center">
              <span className="text-white font-bold text-base">الإجمالي المستحق</span>
              <span className="text-white font-bold text-lg font-mono flex items-center gap-1" dir="ltr">
                {fmt(invoice.totalAmount)} <CurrencySymbol symbol={symbolAr} size="sm" className="text-white" />
              </span>
            </div>
          </div>
        </div>

        {/* Amount in Words */}
        <div className="px-8 pb-5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-3">
            <p className="text-sm text-amber-800 font-medium mb-1">
              <span className="text-amber-600 font-bold">المبلغ كتابة: </span>
              {amountAr}
            </p>
            <p className="text-sm text-amber-700" dir="ltr">
              <span className="font-bold">The amount in words: </span>
              {amountEn}
            </p>
          </div>
        </div>

        {/* Payment Info */}
        <div className="px-8 pb-5">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-5 py-2 border-b border-gray-200">
              <h4 className="font-bold text-gray-700 text-sm">معلومات السداد</h4>
            </div>
            <div className="px-5 py-3 space-y-1.5 text-sm">
              <div className="flex gap-3">
                <span className="text-gray-500 min-w-20">البنك:</span>
                <span className="font-semibold text-gray-800">{company.bankName}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-500 min-w-20">IBAN:</span>
                <span className="font-semibold text-gray-800 font-mono tracking-wide" dir="ltr">{company.bankIban}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-500 min-w-20">اسم الحساب:</span>
                <span className="font-semibold text-gray-800">{company.bankAccountName}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {(company.invoiceTerms || invoice.notes) && (
          <div className="px-8 pb-5">
            <div className="text-sm text-gray-600">
              <h4 className="font-bold text-gray-700 mb-2">الملاحظات:</h4>
              {company.invoiceTerms && (
                <div className="whitespace-pre-line text-gray-600 leading-relaxed">
                  {company.invoiceTerms.split('\n').map((line, i) => (
                    <p key={i}>• {line}</p>
                  ))}
                </div>
              )}
              {invoice.notes && (
                <p className="mt-2 text-gray-600">{invoice.notes}</p>
              )}
            </div>
          </div>
        )}

        {/* Signature Lines */}
        <div className="px-8 pb-5">
          <div className="grid grid-cols-2 gap-8">
            <div className="border-t-2 border-gray-300 pt-3 text-center">
              <p className="text-sm font-medium text-gray-600">مسؤول المبيعات</p>
              <p className="text-xs text-gray-400 mt-1">Sales Representative</p>
              <div className="h-12"></div>
            </div>
            <div className="border-t-2 border-gray-300 pt-3 text-center">
              <p className="text-sm font-medium text-gray-600">اعتماد العميل</p>
              <p className="text-xs text-gray-400 mt-1">Client Approval</p>
              <div className="h-12"></div>
            </div>
          </div>
        </div>

        {/* ZATCA Compliance Footer */}
        <div className="bg-gray-50 border-t-2 border-emerald-600 px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {qrDataUrl && (
                <img src={qrDataUrl} alt="ZATCA QR Code" className="w-24 h-24" />
              )}
            </div>
            <div className="text-center flex-1">
              <p className="text-sm font-bold text-emerald-700 mb-1">
                متوافق مع هيئة الزكاة والضريبة والجمارك
              </p>
              <p className="text-xs text-gray-500" dir="ltr">
                ZATCA (Zakat, Tax and Customs Authority) Compliant
              </p>
              <div className="mt-2 text-xs text-gray-400 grid grid-cols-3 gap-x-4 max-w-md mx-auto">
                <span>اسم المنشأة | {company.nameAr}</span>
                <span>الرقم الضريبي | {company.taxNumber}</span>
                <span>التاريخ | {fmtDate(invoice.date)}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                الإجمالي | {fmtWithCurrency(invoice.totalAmount, company)} — إجمالي الضريبة | {fmtWithCurrency(invoice.vatAmount, company)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export type { InvoiceData, CompanySettings, InvoiceItem, ClientInfo, ProjectInfo, ContractInfo }

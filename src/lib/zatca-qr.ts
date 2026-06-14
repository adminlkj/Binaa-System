// ============================================================================
// ZATCA QR Code Generation - هيئة الزكاة والضريبة والجمارك
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Generates ZATCA-compliant QR codes for Saudi e-invoicing using TLV
// (Tag-Length-Value) encoding per ZATCA specification:
//   Tag 1 (0x01): Seller name
//   Tag 2 (0x02): VAT registration number
//   Tag 3 (0x03): Invoice date (ISO 8601 format)
//   Tag 4 (0x04): Total amount (including VAT)
//   Tag 5 (0x05): VAT amount
// ============================================================================

/**
 * Encodes a single TLV field: Tag (1 byte) + Length (1-2 bytes) + Value
 */
function encodeTLV(tag: number, value: string): Buffer {
  const valueBuffer = Buffer.from(value, 'utf-8')
  // For values longer than 255 bytes, use 2-byte length
  if (valueBuffer.length > 255) {
    return Buffer.concat([
      Buffer.from([tag, valueBuffer.length & 0xff, (valueBuffer.length >> 8) & 0xff]),
      valueBuffer,
    ])
  }
  return Buffer.concat([
    Buffer.from([tag, valueBuffer.length]),
    valueBuffer,
  ])
}

/**
 * Generate ZATCA TLV base64 string from invoice data.
 *
 * @param params - Invoice parameters for QR generation
 * @returns Base64-encoded TLV string (to be placed in QR code)
 */
export function generateZatcaTLV(params: {
  sellerName: string
  vatNumber: string
  invoiceDate: string // ISO date string or formatted date
  totalAmount: number | string
  vatAmount: number | string
}): string {
  const { sellerName, vatNumber, invoiceDate, totalAmount, vatAmount } = params

  const tlvBuffers = [
    encodeTLV(0x01, sellerName),
    encodeTLV(0x02, vatNumber),
    encodeTLV(0x03, invoiceDate),
    encodeTLV(0x04, Number(totalAmount).toFixed(2)),
    encodeTLV(0x05, Number(vatAmount).toFixed(2)),
  ]

  return Buffer.concat(tlvBuffers).toString('base64')
}

/**
 * Generate a ZATCA QR code as a data URL.
 * Uses the qrcode npm package if available, otherwise returns the TLV base64
 * string which can be used client-side with a CDN QR library.
 *
 * @param params - Invoice parameters for QR generation
 * @returns Object with tlvBase64 and optionally qrDataUrl
 */
export async function generateZatcaQR(params: {
  sellerName: string
  vatNumber: string
  invoiceDate: string
  totalAmount: number | string
  vatAmount: number | string
}): Promise<{ tlvBase64: string; qrDataUrl?: string }> {
  const tlvBase64 = generateZatcaTLV(params)

  try {
    const QRCode = await import('qrcode')
    const qrDataUrl = await QRCode.toDataURL(tlvBase64, {
      width: 160,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
    return { tlvBase64, qrDataUrl }
  } catch {
    // qrcode package not available or failed - return TLV base64 only
    // The client-side template will use CDN QR library as fallback
    return { tlvBase64 }
  }
}

/**
 * Generate ZATCA QR data for an invoice, using company settings from the database.
 * This is the main function to call from API routes.
 *
 * @param invoiceData - Invoice data with date, totalAmount, vatAmount
 * @param companySettings - Company settings with nameAr/nameEn and taxNumber
 * @returns ZATCA TLV base64 string (to store in zatcaQr field)
 */
export function generateZatcaQRForInvoice(
  invoiceData: {
    date: string | Date
    totalAmount: number
    vatAmount: number
  },
  companySettings: {
    nameAr?: string | null
    nameEn?: string | null
    taxNumber?: string | null
  },
): string | null {
  if (!companySettings.taxNumber) return null

  const sellerName = companySettings.nameAr || companySettings.nameEn || ''
  const vatNumber = companySettings.taxNumber
  const invoiceDate = invoiceData.date
    ? new Date(invoiceData.date).toISOString().split('T')[0]
    : ''

  return generateZatcaTLV({
    sellerName,
    vatNumber,
    invoiceDate,
    totalAmount: invoiceData.totalAmount,
    vatAmount: invoiceData.vatAmount,
  })
}

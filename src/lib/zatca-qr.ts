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
//
// ISOMORPHIC: This module is imported by both server (API routes) AND
// browser (invoice-preview.tsx). It MUST NOT use Node-only APIs like Buffer.
// Uses TextEncoder + Uint8Array (Web Standards) instead.
// ============================================================================

/**
 * Convert a Uint8Array to a base64 string (isomorphic).
 * Uses btoa in browser, Buffer in Node.
 */
function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    const chunkSize = 0x8000 // avoid call stack overflow on large arrays
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode.apply(null, Array.from(chunk) as number[])
    }
    return btoa(binary)
  }
  // Node fallback
  return Buffer.from(bytes).toString('base64')
}

/**
 * Encodes a single TLV field: Tag (1 byte) + Length (1-2 bytes) + Value
 * Returns Uint8Array (Web Standards, works in browser + Node).
 */
function encodeTLV(tag: number, value: string): Uint8Array {
  const encoder = new TextEncoder()
  const valueBytes = encoder.encode(value)
  // For values longer than 255 bytes, use 2-byte length
  if (valueBytes.length > 255) {
    const out = new Uint8Array(3 + valueBytes.length)
    out[0] = tag
    out[1] = valueBytes.length & 0xff
    out[2] = (valueBytes.length >> 8) & 0xff
    out.set(valueBytes, 3)
    return out
  }
  const out = new Uint8Array(2 + valueBytes.length)
  out[0] = tag
  out[1] = valueBytes.length
  out.set(valueBytes, 2)
  return out
}

/**
 * Concatenate multiple Uint8Array into one.
 */
function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(totalLen)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
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

  const tlvBytes = [
    encodeTLV(0x01, sellerName),
    encodeTLV(0x02, vatNumber),
    encodeTLV(0x03, invoiceDate),
    encodeTLV(0x04, Number(totalAmount).toFixed(2)),
    encodeTLV(0x05, Number(vatAmount).toFixed(2)),
  ]

  return uint8ToBase64(concatBytes(tlvBytes))
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

import QRCode from 'qrcode'

/**
 * Generate ZATCA-compliant QR code using TLV (Tag-Length-Value) encoding
 * 
 * Tags:
 * 1 - Seller Name (Arabic)
 * 2 - VAT Registration Number
 * 3 - Invoice Date (ISO format)
 * 4 - Invoice Total (with VAT)
 * 5 - VAT Total
 */
export async function generateZATCAQR(data: {
  sellerName: string
  vatNumber: string
  date: string
  total: string
  vatTotal: string
}): Promise<string> {
  // TLV encoding
  const tlv = [
    Buffer.from([0x01, Buffer.byteLength(data.sellerName, 'utf8'), ...Buffer.from(data.sellerName, 'utf8')]),
    Buffer.from([0x02, Buffer.byteLength(data.vatNumber, 'utf8'), ...Buffer.from(data.vatNumber, 'utf8')]),
    Buffer.from([0x03, Buffer.byteLength(data.date, 'utf8'), ...Buffer.from(data.date, 'utf8')]),
    Buffer.from([0x04, Buffer.byteLength(data.total, 'utf8'), ...Buffer.from(data.total, 'utf8')]),
    Buffer.from([0x05, Buffer.byteLength(data.vatTotal, 'utf8'), ...Buffer.from(data.vatTotal, 'utf8')]),
  ]
  const base64 = Buffer.concat(tlv).toString('base64')
  return QRCode.toDataURL(base64, { 
    width: 120,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' }
  })
}

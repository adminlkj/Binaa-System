import { NextResponse } from 'next/server'

/**
 * Generate ZATCA-compliant QR code for Saudi e-invoicing
 * 
 * TLV (Tag-Length-Value) encoding per ZATCA specification:
 * Tag 1: Seller name
 * Tag 2: VAT registration number
 * Tag 3: Invoice date (ISO 8601 format)
 * Tag 4: Total amount (including VAT)
 * Tag 5: VAT amount
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sellerName = searchParams.get('seller') || ''
    const vatNumber = searchParams.get('vat') || ''
    const date = searchParams.get('date') || ''
    const total = searchParams.get('total') || ''
    const vatTotal = searchParams.get('vatTotal') || ''

    if (!sellerName || !vatNumber) {
      return NextResponse.json({ error: 'Seller name and VAT number are required' }, { status: 400 })
    }

    // Generate ZATCA TLV base64
    const tlvBase64 = encodeZATCATLV(sellerName, vatNumber, date, total, vatTotal)

    // Generate QR code image using qrcode library
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

    return NextResponse.json({
      qrDataUrl,
      tlvBase64,
      sellerName,
      vatNumber,
      date,
      total,
      vatTotal,
    })
  } catch (error) {
    console.error('QR generation error:', error)
    return NextResponse.json({ error: 'Failed to generate QR code' }, { status: 500 })
  }
}

function encodeZATCATLV(sellerName: string, vatNumber: string, date: string, total: string, vatTotal: string): string {
  // TLV encoding: Tag (1 byte) + Length (1 byte) + Value
  const encodeTag = (tag: number, value: string): Buffer => {
    const buf = Buffer.from(value, 'utf8')
    // For values longer than 255 bytes, we need 2-byte length
    if (buf.length > 255) {
      return Buffer.concat([
        Buffer.from([tag, buf.length & 0xff, (buf.length >> 8) & 0xff]),
        buf,
      ])
    }
    return Buffer.concat([Buffer.from([tag, buf.length]), buf])
  }

  const tlv = Buffer.concat([
    encodeTag(0x01, sellerName),
    encodeTag(0x02, vatNumber),
    encodeTag(0x03, date),
    encodeTag(0x04, total),
    encodeTag(0x05, vatTotal),
  ])

  return tlv.toString('base64')
}

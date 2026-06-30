import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireRoleApi } from '@/lib/auth-helpers'

const defaultSettings = {
  nameAr: 'شركة البناء الحديثة للمقاولات',
  nameEn: 'Al Binaa Al Haditha Contracting Co.',
  taxNumber: '300123456700003',
  commercialReg: '1234567890',
  address: 'الدمام - المملكة العربية السعودية',
  phone: '0500000000',
  email: 'info@albinaa.com',
  bankName: 'الراجحي',
  bankIban: 'SA00 8000 0000 6080 1016 7519',
  bankAccountName: 'شركة البناء الحديثة للمقاولات',
  defaultVatRate: 0.15,
  currency: 'SAR',
  currencySymbol: '\uFDFC',     // Saudi Riyal Unicode symbol (legacy fallback)
  currencySymbolEn: 'SAR',     // English currency text (legacy fallback)
  currencySymbolAr: '\uFDFC',  // Arabic currency symbol (legacy fallback)
  // CONSTANT RULE: the ONLY approved currency symbol is the uploaded image.
  // Background is removed automatically by /api/remove-bg before display.
  // This image is rendered next to every amount across the system and in
  // all printed documents and invoices. There are no other currency settings.
  currencySymbolImage: '/currency-symbol.jpeg',
  invoiceTerms: 'مدة السداد 30 يوماً من تاريخ الفاتورة\nهذه الفاتورة صادرة إلكترونياً\nيرجى ذكر رقم الفاتورة عند التحويل',
  useThousandSeparatorsSystem: true,
  useThousandSeparatorsOfficial: false,
  // Invoice template defaults
  invoiceTemplate: 'classic',
  invoicePrimaryColor: '#0f766e',
  invoiceAccentColor: '#34d399',
  invoiceFontFamily: 'default',
  invoiceShowBankDetails: true,
  invoiceShowSignature: true,
  invoiceShowStamp: false,
}

export async function GET() {
  try {
    let settings = await db.companySetting.findFirst()
    if (!settings) {
      settings = await db.companySetting.create({ data: defaultSettings })
    }
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error fetching company settings:', error)
    return NextResponse.json(defaultSettings)
  }
}

export async function PUT(request: Request) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response
  try {
    const body = await request.json()
    const existing = await db.companySetting.findFirst()

    const updateData: Record<string, unknown> = {}
    // Company fields (only update if provided — allows partial updates
    // from the Invoice Templates tab without sending all company data)
    if (body.nameAr !== undefined) updateData.nameAr = body.nameAr
    if (body.nameEn !== undefined) updateData.nameEn = body.nameEn
    if (body.logo !== undefined) updateData.logo = body.logo
    if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl
    if (body.commercialReg !== undefined) updateData.commercialReg = body.commercialReg
    if (body.taxNumber !== undefined) updateData.taxNumber = body.taxNumber
    if (body.address !== undefined) updateData.address = body.address
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.email !== undefined) updateData.email = body.email
    if (body.website !== undefined) updateData.website = body.website
    if (body.bankName !== undefined) updateData.bankName = body.bankName
    if (body.bankIban !== undefined) updateData.bankIban = body.bankIban
    if (body.bankAccountName !== undefined) updateData.bankAccountName = body.bankAccountName
    if (body.stamp !== undefined) updateData.stamp = body.stamp
    if (body.defaultVatRate !== undefined) updateData.defaultVatRate = body.defaultVatRate
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.currencySymbol !== undefined) updateData.currencySymbol = body.currencySymbol
    if (body.currencySymbolEn !== undefined) updateData.currencySymbolEn = body.currencySymbolEn
    if (body.currencySymbolAr !== undefined) updateData.currencySymbolAr = body.currencySymbolAr
    if (body.invoiceTerms !== undefined) updateData.invoiceTerms = body.invoiceTerms
    if (body.useThousandSeparatorsSystem !== undefined) updateData.useThousandSeparatorsSystem = body.useThousandSeparatorsSystem
    if (body.useThousandSeparatorsOfficial !== undefined) updateData.useThousandSeparatorsOfficial = body.useThousandSeparatorsOfficial
    if (body.currencySymbolImage !== undefined) updateData.currencySymbolImage = body.currencySymbolImage
    if (body.headerImage !== undefined) updateData.headerImage = body.headerImage
    if (body.footerImage !== undefined) updateData.footerImage = body.footerImage
    // Invoice template fields
    if (body.invoiceTemplate !== undefined) updateData.invoiceTemplate = body.invoiceTemplate
    if (body.invoicePrimaryColor !== undefined) updateData.invoicePrimaryColor = body.invoicePrimaryColor
    if (body.invoiceAccentColor !== undefined) updateData.invoiceAccentColor = body.invoiceAccentColor
    if (body.invoiceFontFamily !== undefined) updateData.invoiceFontFamily = body.invoiceFontFamily
    if (body.invoiceShowBankDetails !== undefined) updateData.invoiceShowBankDetails = body.invoiceShowBankDetails
    if (body.invoiceShowSignature !== undefined) updateData.invoiceShowSignature = body.invoiceShowSignature
    if (body.invoiceShowStamp !== undefined) updateData.invoiceShowStamp = body.invoiceShowStamp
    // Stamp placement & size controls
    if (body.stampPosition !== undefined) updateData.stampPosition = body.stampPosition
    if (body.stampWidth !== undefined) updateData.stampWidth = Number(body.stampWidth)
    if (body.stampHeight !== undefined) updateData.stampHeight = Number(body.stampHeight)
    if (body.stampOffsetX !== undefined) updateData.stampOffsetX = Number(body.stampOffsetX)
    if (body.stampOffsetY !== undefined) updateData.stampOffsetY = Number(body.stampOffsetY)
    if (body.stampOpacity !== undefined) updateData.stampOpacity = Number(body.stampOpacity)
    if (body.stampRotation !== undefined) updateData.stampRotation = Number(body.stampRotation)

    let settings
    if (existing) {
      settings = await db.companySetting.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      settings = await db.companySetting.create({
        data: {
          nameAr: body.nameAr || defaultSettings.nameAr,
          nameEn: body.nameEn || defaultSettings.nameEn,
          logo: body.logo ?? null,
          logoUrl: body.logoUrl ?? null,
          commercialReg: body.commercialReg ?? defaultSettings.commercialReg,
          taxNumber: body.taxNumber ?? defaultSettings.taxNumber,
          address: body.address ?? defaultSettings.address,
          phone: body.phone ?? defaultSettings.phone,
          email: body.email ?? defaultSettings.email,
          website: body.website ?? null,
          bankName: body.bankName ?? defaultSettings.bankName,
          bankIban: body.bankIban ?? defaultSettings.bankIban,
          bankAccountName: body.bankAccountName ?? defaultSettings.bankAccountName,
          stamp: body.stamp ?? null,
          defaultVatRate: body.defaultVatRate ?? defaultSettings.defaultVatRate,
          currency: body.currency ?? 'SAR',
          currencySymbol: body.currencySymbol ?? defaultSettings.currencySymbol,
          currencySymbolEn: body.currencySymbolEn ?? defaultSettings.currencySymbolEn,
          currencySymbolAr: body.currencySymbolAr ?? defaultSettings.currencySymbolAr,
          invoiceTerms: body.invoiceTerms ?? defaultSettings.invoiceTerms,
          useThousandSeparatorsSystem: body.useThousandSeparatorsSystem ?? true,
          useThousandSeparatorsOfficial: body.useThousandSeparatorsOfficial ?? false,
          currencySymbolImage: body.currencySymbolImage ?? defaultSettings.currencySymbolImage,
          headerImage: body.headerImage ?? null,
          footerImage: body.footerImage ?? null,
          invoiceTemplate: body.invoiceTemplate ?? defaultSettings.invoiceTemplate,
          invoicePrimaryColor: body.invoicePrimaryColor ?? defaultSettings.invoicePrimaryColor,
          invoiceAccentColor: body.invoiceAccentColor ?? defaultSettings.invoiceAccentColor,
          invoiceFontFamily: body.invoiceFontFamily ?? defaultSettings.invoiceFontFamily,
          invoiceShowBankDetails: body.invoiceShowBankDetails ?? defaultSettings.invoiceShowBankDetails,
          invoiceShowSignature: body.invoiceShowSignature ?? defaultSettings.invoiceShowSignature,
          invoiceShowStamp: body.invoiceShowStamp ?? defaultSettings.invoiceShowStamp,
          stampPosition: body.stampPosition ?? 'after-signatures',
          stampWidth: body.stampWidth ? Number(body.stampWidth) : 140,
          stampHeight: body.stampHeight ? Number(body.stampHeight) : 140,
          stampOffsetX: body.stampOffsetX ? Number(body.stampOffsetX) : 0,
          stampOffsetY: body.stampOffsetY ? Number(body.stampOffsetY) : 0,
          stampOpacity: body.stampOpacity ? Number(body.stampOpacity) : 0.9,
          stampRotation: body.stampRotation ? Number(body.stampRotation) : 0,
        },
      })
    }
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating company settings:', error)
    return NextResponse.json({ error: 'فشل في تحديث إعدادات الشركة' }, { status: 500 })
  }
}

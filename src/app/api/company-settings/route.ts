import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

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
  currencySymbol: '\uFDFC',     // Saudi Riyal Unicode symbol (﷼)
  currencySymbolEn: 'SAR',     // English currency text
  currencySymbolAr: '\uFDFC',  // Arabic currency symbol (﷼)
  invoiceTerms: 'مدة السداد 30 يوماً من تاريخ الفاتورة\nهذه الفاتورة صادرة إلكترونياً\nيرجى ذكر رقم الفاتورة عند التحويل',
  useThousandSeparatorsSystem: true,
  useThousandSeparatorsOfficial: false,
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
  try {
    const body = await request.json()
    const existing = await db.companySetting.findFirst()

    const updateData = {
      nameAr: body.nameAr,
      nameEn: body.nameEn,
      logo: body.logo ?? null,
      logoUrl: body.logoUrl ?? null,
      commercialReg: body.commercialReg ?? null,
      taxNumber: body.taxNumber ?? null,
      address: body.address ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      website: body.website ?? null,
      bankName: body.bankName ?? null,
      bankIban: body.bankIban ?? null,
      bankAccountName: body.bankAccountName ?? null,
      stamp: body.stamp ?? null,
      defaultVatRate: body.defaultVatRate ?? 0.15,
      currency: body.currency ?? 'SAR',
      currencySymbol: body.currencySymbol ?? '\uFDFC',
      currencySymbolEn: body.currencySymbolEn ?? 'SAR',
      currencySymbolAr: body.currencySymbolAr ?? '\uFDFC',
      invoiceTerms: body.invoiceTerms ?? null,
      useThousandSeparatorsSystem: body.useThousandSeparatorsSystem ?? true,
      useThousandSeparatorsOfficial: body.useThousandSeparatorsOfficial ?? false,
    }

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
        },
      })
    }
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating company settings:', error)
    return NextResponse.json({ error: 'فشل في تحديث إعدادات الشركة' }, { status: 500 })
  }
}

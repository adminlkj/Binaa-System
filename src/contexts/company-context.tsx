'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

// ============ Types ============
export interface CompanySettingsData {
  id?: string
  nameAr: string
  nameEn: string
  logo?: string | null
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
  currencySymbol?: string | null
  currencySymbolImage?: string | null
  headerImage?: string | null
  footerImage?: string | null
  headerHeight?: number
  footerHeight?: number
  invoiceTerms?: string | null
}

const defaultCompanySettings: CompanySettingsData = {
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
  currencySymbol: '﷼',
  currencySymbolImage: null,
  headerImage: null,
  footerImage: null,
  headerHeight: 30,
  footerHeight: 22,
  invoiceTerms: 'مدة السداد 30 يوماً من تاريخ الفاتورة',
}

// ============ Context ============
interface CompanyContextValue {
  company: CompanySettingsData
  isLoading: boolean
}

const CompanyContext = createContext<CompanyContextValue>({
  company: defaultCompanySettings,
  isLoading: true,
})

export function useCompany() {
  return useContext(CompanyContext)
}

// ============ Provider ============
export function CompanyProvider({ children }: { children: ReactNode }) {
  const { data: companyData, isLoading } = useQuery<CompanySettingsData>({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const res = await fetch('/api/company-settings')
      if (!res.ok) return defaultCompanySettings
      const data = await res.json()
      return data
    },
    placeholderData: defaultCompanySettings,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  })

  const company = companyData || defaultCompanySettings

  return (
    <CompanyContext.Provider value={{ company, isLoading }}>
      {children}
    </CompanyContext.Provider>
  )
}

// ============ Currency Amount Component ============
interface CurrencyAmountProps {
  amount: number
  /** Override: force text-only mode even when image exists */
  textOnly?: boolean
  /** CSS class for the wrapper span */
  className?: string
  /** Size variant for the image symbol */
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const sizeMap = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 18,
}

/**
 * Renders a monetary amount with the currency symbol from company settings.
 * If `currencySymbolImage` is set → renders <img> tag.
 * If `currencySymbol` text is set → renders the text symbol.
 * Falls back to "﷼" / "SAR" based on convention.
 */
export function CurrencyAmount({ amount, textOnly, className, size = 'sm' }: CurrencyAmountProps) {
  const { company } = useCompany()
  const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const imgSize = sizeMap[size]

  // If there's an uploaded currency symbol image and not textOnly mode
  if (company.currencySymbolImage && !textOnly) {
    return (
      <span className={`inline-flex items-center gap-1 ${className || ''}`} dir="ltr">
        <img
          src={company.currencySymbolImage}
          alt={company.currency || 'SAR'}
          className="inline object-contain"
          style={{ width: imgSize, height: imgSize }}
        />
        <span>{formatted}</span>
      </span>
    )
  }

  // Text symbol (from settings or fallback)
  const symbol = company.currencySymbol || '﷼'
  return (
    <span className={`inline-flex items-center gap-1 ${className || ''}`} dir="ltr">
      <span>{formatted}</span>
      <span className="text-[0.85em]">{symbol}</span>
    </span>
  )
}

/**
 * Format amount as a string with currency symbol text.
 * Use this when you need a plain string (e.g., in table cells where JSX is awkward,
 * or in Select items). For most cases, prefer the <CurrencyAmount /> component.
 */
export function formatAmountWithSymbol(amount: number, company?: CompanySettingsData): string {
  const comp = company || defaultCompanySettings
  const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const symbol = comp.currencySymbol || '﷼'
  return `${formatted} ${symbol}`
}

export { defaultCompanySettings }
export type { CompanySettingsData as CompanySettings }

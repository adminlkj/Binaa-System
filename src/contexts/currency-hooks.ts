'use client'

import { useCompany, formatAmountWithSymbol } from '@/contexts/company-context'

/**
 * Hook that provides currency formatting utilities using company settings.
 * - `CurrencyAmount` component for JSX rendering (supports image symbols)
 * - `formatText` for plain string formatting (Select items, computed labels, etc.)
 */
export function useFormatCurrency() {
  const { company } = useCompany()

  return {
    /** Format amount as a plain string with text symbol from settings */
    formatText: (amount: number) => formatAmountWithSymbol(amount, company),
    /** The company settings for direct access */
    company,
  }
}

'use client'

import React from 'react'
import { CurrencySymbol } from '@/components/ui/currency-symbol'

/**
 * MoneyDisplay - The unified financial display component for نظام بِنَاء
 *
 * Handles all financial display needs across the system:
 * - System mode: With thousand separators (42,514.85)
 * - Official mode: No thousand separators for ZATCA compliance (42514.85)
 * - Bilingual support (Arabic with ﷼ / English with SAR)
 * - Multiple size variants
 * - SVG Saudi Riyal symbol rendering via CurrencySymbol
 *
 * Usage:
 * <MoneyDisplay value={42514.85} />                           // Default: Arabic with ﷼
 * <MoneyDisplay value={42514.85} mode="system" />             // With thousand separators
 * <MoneyDisplay value={42514.85} mode="official" />           // No thousand separators (ZATCA)
 * <MoneyDisplay value={42514.85} lang="en" />                 // English with SAR
 * <MoneyDisplay value={42514.85} size="lg" />                 // Larger text
 * <MoneyDisplay value={42514.85} showSymbol={false} />        // No symbol
 * <MoneyDisplay value={42514.85} bold />                      // Bold amount
 * <MoneyDisplay value={42514.85} inline />                    // Inline display
 */

export interface MoneyDisplayProps {
  /** The numeric value to display */
  value: number
  /** Display mode: system = with thousand separators, official = no separators (ZATCA) */
  mode?: 'system' | 'official'
  /** Language for display: ar = Arabic (RTL), en = English (LTR) */
  lang?: 'ar' | 'en'
  /** Arabic currency symbol (default: ﷼ from Unicode U+FDFC) */
  symbolAr?: string
  /** English currency symbol (default: SAR) */
  symbolEn?: string
  /** Text size variant */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Whether to show the currency symbol */
  showSymbol?: boolean
  /** Whether to bold the amount */
  bold?: boolean
  /** Whether to display inline (no wrapping) */
  inline?: boolean
  /** Additional CSS classes */
  className?: string
  /** Text direction override */
  dir?: 'rtl' | 'ltr'
}

// Size mapping for text
const sizeClassMap: Record<string, string> = {
  xs: 'text-xs',       // 0.75rem
  sm: 'text-sm',       // 0.875rem
  md: 'text-base',     // 1rem
  lg: 'text-lg',       // 1.125rem
  xl: 'text-xl',       // 1.25rem
}

// CurrencySymbol size mapping (for SVG rendering)
const symbolSizeMap: Record<string, 'xs' | 'sm' | 'md' | 'lg'> = {
  xs: 'xs',
  sm: 'sm',
  md: 'sm',
  lg: 'md',
  xl: 'lg',
}

/**
 * Format just the number without symbol
 *
 * @param value - The numeric value
 * @param mode - 'system' = with thousand separators, 'official' = no separators (ZATCA)
 * @returns Formatted number string with exactly 2 decimal places
 */
export function formatAmount(value: number, mode: 'system' | 'official' = 'system'): string {
  if (mode === 'official') {
    // ZATCA compliance: no thousand separators
    return value.toFixed(2)
  }
  // System mode: with thousand separators
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format amount as string with currency symbol (for non-React contexts)
 *
 * @param value - The numeric value
 * @param options - Formatting options
 * @returns Formatted currency string
 */
export function formatMoney(
  value: number,
  options?: {
    mode?: 'system' | 'official'
    lang?: 'ar' | 'en'
    symbolAr?: string
    symbolEn?: string
  },
): string {
  const {
    mode = 'system',
    lang = 'ar',
    symbolAr = '\uFDFC',
    symbolEn = 'SAR',
  } = options || {}

  const formatted = formatAmount(value, mode)

  if (lang === 'ar') {
    // Arabic: number followed by symbol (RTL - symbol appears on right)
    return `${formatted} ${symbolAr}`
  }
  // English: symbol followed by number
  return `${symbolEn} ${formatted}`
}

/**
 * MoneyDisplay Component
 *
 * The unified financial display component for the entire نظام بِنَاء system.
 * Renders monetary values with proper formatting, currency symbols, and bilingual support.
 */
export function MoneyDisplay({
  value,
  mode = 'system',
  lang = 'ar',
  symbolAr = '\uFDFC',
  symbolEn = 'SAR',
  size = 'md',
  showSymbol = true,
  bold = false,
  inline = false,
  className = '',
  dir,
}: MoneyDisplayProps) {
  // Format the number based on mode
  const formattedAmount = formatAmount(value, mode)

  // Determine text direction
  const effectiveDir = dir || (lang === 'ar' ? 'rtl' : 'ltr')

  // Size class
  const sizeClass = sizeClassMap[size] || sizeClassMap.md

  // Build container classes
  const containerClasses = [
    inline ? 'inline-flex' : 'flex',
    'items-center',
    'gap-1',
    sizeClass,
    bold ? 'font-bold' : 'font-normal',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  // Determine if the Arabic symbol is the Saudi Riyal (﷼) for SVG rendering
  const isRiyalSymbol = symbolAr === '\uFDFC' || symbolAr === '﷼'

  // Render symbol component
  const renderSymbol = () => {
    if (!showSymbol) return null

    if (lang === 'ar') {
      if (isRiyalSymbol) {
        // Use CurrencySymbol SVG component for Saudi Riyal
        return <CurrencySymbol symbol={symbolAr} size={symbolSizeMap[size] || 'sm'} />
      }
      // Fallback to text for other Arabic symbols
      return (
        <span
          className="opacity-80"
          style={{ fontFamily: "'Cairo', 'Amiri', 'Noto Sans Arabic', sans-serif" }}
        >
          {symbolAr}
        </span>
      )
    }

    // English: plain text symbol
    return <span className="opacity-80">{symbolEn}</span>
  }

  // Arabic layout: number then symbol (RTL)
  // English layout: symbol then number
  if (lang === 'ar') {
    return (
      <span className={containerClasses} dir={effectiveDir}>
        <span dir="ltr" className="tabular-nums">
          {formattedAmount}
        </span>
        {renderSymbol()}
      </span>
    )
  }

  // English: symbol then number
  return (
    <span className={containerClasses} dir={effectiveDir}>
      {renderSymbol()}
      <span dir="ltr" className="tabular-nums">
        {formattedAmount}
      </span>
    </span>
  )
}

export default MoneyDisplay

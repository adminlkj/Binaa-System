'use client'

import React from 'react'

/**
 * CurrencySymbol - Renders currency symbols with proper font support
 *
 * For the Saudi Riyal symbol (﷼), it uses the Cairo/Amiri font to ensure
 * proper rendering from font files rather than plain Unicode text.
 * For other currencies, falls back to plain text rendering.
 */

export interface CurrencySymbolProps {
  /** The symbol string from settings (e.g., "﷼", "$", "SAR", "ر.س") */
  symbol?: string
  /** Rendering type: SVG for Saudi Riyal, text for others */
  type?: 'svg' | 'text'
  /** Size variant */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Additional CSS classes */
  className?: string
}

// Size mapping for inline display
const sizeMap: Record<string, string> = {
  xs: 'text-[0.65em]',
  sm: 'text-[0.8em]',
  md: 'text-[1em]',
  lg: 'text-[1.25em]',
}

/**
 * Saudi Riyal Symbol rendered as SVG
 * Uses the standard Saudi Riyal sign path data loaded from font glyph outlines
 */
function SaudiRiyalSVG({ size = 'sm', className = '' }: { size?: string; className?: string }) {
  const pixelSize = size === 'xs' ? 12 : size === 'sm' ? 16 : size === 'md' ? 20 : 28

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={pixelSize}
      height={pixelSize}
      className={`inline-block align-middle ${className}`}
      aria-label="Saudi Riyal"
      role="img"
    >
      {/* Saudi Riyal Symbol (﷼) - Simplified standard representation */}
      <path
        d="M6.5 3L2 14h2.5l2-5.5L8.5 14H11L6.5 3zm7 0L9 14h2.5l2-5.5L15.5 14H18L13.5 3zM3 15h14v1.5H3V15zm0 3h14v1.5H3V18zm11-10c0 2.2 1.8 4 4 4s4-1.8 4-4h-1.5c0 1.4-1.1 2.5-2.5 2.5S15.5 9.4 15.5 8H14z"
        fill="currentColor"
      />
    </svg>
  )
}

/**
 * CurrencySymbol component
 *
 * Usage:
 * ```tsx
 * // Saudi Riyal (default)
 * <CurrencySymbol />  // Renders ﷼ with Cairo font
 *
 * // Other currencies
 * <CurrencySymbol symbol="$" />
 * <CurrencySymbol symbol="€" />
 *
 * // With size
 * <CurrencySymbol size="lg" />
 * ```
 */
export function CurrencySymbol({
  symbol = '﷼',
  type,
  size = 'sm',
  className = '',
}: CurrencySymbolProps) {
  // Auto-detect: if symbol is the Saudi Riyal Unicode character, use SVG
  const isRiyalSymbol = symbol === '﷼' || symbol === '\uFDFC'

  // If explicitly text type or symbol is not the riyal, render as text
  if (type === 'text' || !isRiyalSymbol) {
    return (
      <span
        className={`inline-block align-middle ${sizeMap[size] || sizeMap.sm} ${className}`}
        style={{ fontFamily: symbol === '﷼' || symbol === 'ر.س' ? "'Cairo', 'Amiri', 'Noto Sans Arabic', sans-serif" : undefined }}
        dir="ltr"
      >
        {symbol}
      </span>
    )
  }

  // Render Saudi Riyal as SVG
  return <SaudiRiyalSVG size={size} className={className} />
}

/**
 * Format a number as currency string with the proper symbol
 * For use in non-React contexts (like formatSAR)
 *
 * @param value - The numeric value
 * @param lang - Language ('ar' or 'en')
 * @param symbolAr - Arabic symbol from settings (default: ﷼)
 * @param symbolEn - English symbol from settings (default: SAR)
 */
export function formatCurrencyString(
  value: number,
  lang: 'ar' | 'en' = 'ar',
  symbolAr: string = '﷼',
  symbolEn: string = 'SAR',
): string {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  if (lang === 'ar') {
    // In Arabic (RTL), the symbol goes after the number
    return `${formatted} ${symbolAr}`
  }
  // In English (LTR), the symbol goes before the number
  return `${symbolEn} ${formatted}`
}

/**
 * CurrencyText - A simple inline component for displaying currency amounts
 * Uses the proper symbol from company settings with Cairo font for ﷼
 */
export function CurrencyText({
  value,
  lang = 'ar',
  symbolAr = '﷼',
  symbolEn = 'SAR',
  className = '',
}: {
  value: number
  lang?: 'ar' | 'en'
  symbolAr?: string
  symbolEn?: string
  className?: string
}) {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  if (lang === 'ar') {
    return (
      <span className={className} dir="ltr">
        {formatted}{' '}
        <span style={{ fontFamily: "'Cairo', 'Amiri', 'Noto Sans Arabic', sans-serif" }}>
          {symbolAr}
        </span>
      </span>
    )
  }

  return (
    <span className={className} dir="ltr">
      {symbolEn} {formatted}
    </span>
  )
}

export default CurrencySymbol

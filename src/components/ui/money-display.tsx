'use client'

import React, { useState, useEffect } from 'react'
import { CurrencySymbol } from '@/components/ui/currency-symbol'

/**
 * MoneyDisplay - The unified financial display component for نظام بِنَاء
 *
 * Handles all financial display needs across the system:
 * - System mode: With thousand separators (42,514.85)
 * - Official mode: No thousand separators for ZATCA compliance (42514.85)
 * - Bilingual support (Arabic with ﷼ / English with SAR)
 * - Multiple size variants
 * - Currency symbol image with transparent background rendering
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
  /** The numeric value to display (undefined/null treated as 0) */
  value: number | undefined | null
  /** Display mode: system = with thousand separators, official = no separators (ZATCA) */
  mode?: 'system' | 'official'
  /** Language for display: ar = Arabic (RTL), en = English (LTR) */
  lang?: 'ar' | 'en'
  /** Arabic currency symbol (default: ﷼ from Unicode U+FDFC) */
  symbolAr?: string
  /** English currency symbol (default: SAR) */
  symbolEn?: string
  /** URL of the currency symbol image (takes priority over text symbols when set) */
  symbolImage?: string | null
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

// Image size mapping for symbol images (in pixels) - proportional to text
const symbolImageSizeMap: Record<string, number> = {
  xs: 12,
  sm: 14,
  md: 18,
  lg: 22,
  xl: 28,
}

// Cache for processed symbol images (transparent background)
const symbolImageCache = new Map<string, string>()

/**
 * Format just the number without symbol
 *
 * @param value - The numeric value
 * @param mode - 'system' = with thousand separators, 'official' = no separators (ZATCA)
 * @returns Formatted number string with exactly 2 decimal places
 */
export function formatAmount(value: number | undefined | null, mode: 'system' | 'official' = 'system'): string {
  // Handle undefined/null/NaN values gracefully
  const safeValue = (value === undefined || value === null || isNaN(value)) ? 0 : value
  if (mode === 'official') {
    // ZATCA compliance: no thousand separators
    return safeValue.toFixed(2)
  }
  // System mode: with thousand separators
  return safeValue.toLocaleString('en-US', {
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
  value: number | undefined | null,
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
 * CurrencySymbolImage - Renders the currency symbol image with transparent background
 * Uses the /api/remove-bg endpoint to process the image and remove the background
 */
function CurrencySymbolImage({
  src,
  alt,
  imgSize,
  textFontSize,
}: {
  src: string
  alt: string
  imgSize: number
  textFontSize: number
}) {
  const [processedSrc, setProcessedSrc] = useState<string | null>(() => {
    // Check cache first (synchronous initial state)
    if (symbolImageCache.has(src)) {
      return symbolImageCache.get(src)!
    }
    // For SVG files, use directly (they already support transparency)
    if (src.endsWith('.svg')) {
      symbolImageCache.set(src, src)
      return src
    }
    return null
  })

  useEffect(() => {
    // If already processed (from cache or SVG), skip
    if (processedSrc) return

    // For raster images, process to remove background
    let cancelled = false
    const processImage = async () => {
      try {
        const res = await fetch('/api/remove-bg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: src }),
        })
        if (res.ok && !cancelled) {
          const data = await res.json()
          if (data.dataUrl) {
            symbolImageCache.set(src, data.dataUrl)
            setProcessedSrc(data.dataUrl)
            return
          }
        }
      } catch {
        // Fallback: use original image
      }
      if (!cancelled) {
        // Fallback to original URL
        symbolImageCache.set(src, src)
        setProcessedSrc(src)
      }
    }
    processImage()

    return () => { cancelled = true }
  }, [src, processedSrc])

  // The image height should match the text line-height for proper alignment
  // We calculate it relative to the font size
  const heightInEm = 1.1 // slightly taller than cap height
  const widthInEm = (imgSize / textFontSize) * heightInEm

  if (!processedSrc) {
    // Show a small placeholder while loading
    return (
      <span
        className="inline-block animate-pulse rounded"
        style={{
          width: `${widthInEm}em`,
          height: `${heightInEm}em`,
          backgroundColor: 'rgba(0,0,0,0.06)',
          verticalAlign: 'middle',
        }}
      />
    )
  }

  return (
    <img
      src={processedSrc}
      alt={alt}
      className="inline-block"
      style={{
        height: `${heightInEm}em`,
        width: 'auto',
        maxWidth: `${widthInEm * 1.5}em`,
        objectFit: 'contain',
        verticalAlign: 'middle',
        // Additional background removal via CSS for fallback
        filter: 'contrast(1) brightness(1)',
        mixBlendMode: 'multiply',
      }}
      onError={(e) => {
        // If processed image fails, try original
        const img = e.target as HTMLImageElement
        if (img.src !== src) {
          img.src = src
        }
      }}
    />
  )
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
  symbolImage,
  size = 'md',
  showSymbol = true,
  bold = false,
  inline = false,
  className = '',
  dir,
}: MoneyDisplayProps) {
  // Format the number based on mode (safe for undefined/null)
  const formattedAmount = formatAmount(value, mode)

  // Determine text direction
  const effectiveDir = dir || (lang === 'ar' ? 'rtl' : 'ltr')

  // Size class
  const sizeClass = sizeClassMap[size] || sizeClassMap.md

  // Font size in pixels for calculations
  const fontSizeMap: Record<string, number> = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
  }
  const textFontSize = fontSizeMap[size] || 16

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

    // If a symbol image is provided, render it with transparent background
    if (symbolImage) {
      const imgSize = symbolImageSizeMap[size] || 16
      return (
        <CurrencySymbolImage
          src={symbolImage}
          alt={lang === 'ar' ? symbolAr : symbolEn}
          imgSize={imgSize}
          textFontSize={textFontSize}
        />
      )
    }

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

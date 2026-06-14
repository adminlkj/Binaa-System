// ============================================================================
// Decimal Conversion Utilities
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Prisma returns Decimal fields as Prisma.Decimal objects, which serialize
// as strings in JSON. These utilities convert them to plain numbers for
// proper JSON serialization and frontend consumption.
// ============================================================================

import { Prisma } from '@prisma/client'

/**
 * Convert a Prisma.Decimal value to a plain number.
 * Returns 0 for null/undefined. Falls back to 0 for non-numeric values.
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (value instanceof Prisma.Decimal) return value.toNumber()
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return isNaN(parsed) ? 0 : parsed
  }
  // Handle objects with .toNumber() method (e.g., Prisma.Decimal)
  if (typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber()
  }
  return 0
}

/**
 * Recursively convert all Prisma.Decimal values in an object to plain numbers.
 * This ensures proper JSON serialization when returning Prisma results via API.
 *
 * Usage:
 *   const result = serializeDecimal(prismaResult)
 *   return NextResponse.json(result)
 */
export function serializeDecimal<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj

  if (obj instanceof Prisma.Decimal) {
    return obj.toNumber() as T
  }

  // Handle objects with .toNumber() method
  if (typeof obj === 'object' && 'toNumber' in obj && typeof (obj as { toNumber: () => number }).toNumber === 'function') {
    return (obj as { toNumber: () => number }).toNumber() as T
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeDecimal(item)) as T
  }

  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeDecimal(value)
    }
    return result as T
  }

  // Date, string, number, boolean - return as-is
  return obj
}

// ============================================================================
// Cached settings helpers — single source of truth for company settings
// reads that are needed by API routes (server-side only).
//
// Currently exposes:
//   • getDefaultVatRate() — reads CompanySetting.defaultVatRate with a
//     60-second in-memory cache (safe for serverless / hot route hits).
//
// Importing this file from a client component will fail because it imports
// `@/lib/db` (Prisma). For client-side preview calculations, fetch the rate
// from `/api/company-settings` instead.
// ============================================================================

import { db } from '@/lib/db'

let cached: { rate: number; ts: number } | null = null

/**
 * Returns the configured default VAT rate as a JS number (e.g. 0.15).
 * Falls back to 0.15 if no CompanySetting row exists yet.
 *
 * The result is cached for 60 seconds to avoid hitting the DB on every
 * invoice-creation request.
 */
export async function getDefaultVatRate(): Promise<number> {
  if (cached && Date.now() - cached.ts < 60_000) return cached.rate

  let rate = 0.15
  try {
    const s = await db.companySetting.findFirst()
    if (s?.defaultVatRate != null) {
      const n = Number(s.defaultVatRate)
      if (!Number.isNaN(n)) rate = n
    }
  } catch {
    // DB not ready / sqlite locked — fall back to the cached or default rate
    if (cached) return cached.rate
  }

  cached = { rate, ts: Date.now() }
  return rate
}

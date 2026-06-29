import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Health Check Endpoint — /api/health
 *
 * Used by Render (and other orchestrators) to determine if the service is healthy.
 * Returns 200 with status info if healthy, 503 if degraded.
 *
 * Checks:
 * 1. Database connectivity (Prisma raw query)
 * 2. Response time measurement
 */
export async function GET() {
  const startTime = Date.now()

  try {
    // Test database connectivity — lightweight query
    await db.$queryRaw`SELECT 1 as ok`

    const responseTime = Date.now() - startTime

    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        responseTimeMs: responseTime,
        database: 'connected',
        uptime: process.uptime ? `${Math.floor(process.uptime())}s` : 'unknown',
      },
      { status: 200 }
    )
  } catch (error) {
    const responseTime = Date.now() - startTime

    console.error('Health check failed:', error)

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTimeMs: responseTime,
        database: 'disconnected',
        error: 'Database connection failed',
      },
      { status: 503 }
    )
  }
}

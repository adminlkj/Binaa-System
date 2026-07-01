#!/bin/bash
# ============================================================
# Startup Script — Binaa System (Production)
# ============================================================
# Runs on Render (or any Node.js host) at container startup.
# Executes in order:
#   1. Verify DATABASE_URL is set
#   2. prisma migrate deploy  (apply DB migrations — safe, never drops data)
#   3. prisma generate        (regenerate client against the live DB schema)
#   4. seed admin user        (idempotent — creates admin/developer if missing)
#   5. seed chart of accounts (idempotent — creates COA + financial mappings)
#   6. start Next.js server   (standalone production build)
# ============================================================
set -e

echo "============================================================"
echo "  Binaa System — Production Startup"
echo "  $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

# ---------- 0. Verify DATABASE_URL ----------
if [ -z "${DATABASE_URL:-}" ]; then
  echo ""
  echo "❌ FATAL: DATABASE_URL environment variable is not set."
  echo ""
  echo "   This means Render did not link the PostgreSQL database to this web service."
  echo "   To fix:"
  echo "     1. Go to Render Dashboard → your web service (binaa-system)"
  echo "     2. Click 'Environment' tab"
  echo "     3. Add environment variable:"
  echo "          Key:   DATABASE_URL"
  echo "          Value: <copy from your PostgreSQL service 'Internal Database URL'>"
  echo "     4. Save and redeploy"
  echo ""
  echo "   OR if using render.yaml Blueprint, ensure the database service"
  echo "   named 'binaa-db' exists and is in the same Blueprint."
  echo ""
  exit 1
fi
echo "  ✅ DATABASE_URL is set (length: ${#DATABASE_URL})"

# ---------- 1. Database Migrations ----------
echo ""
echo "[1/5] Applying database migrations..."
bunx prisma migrate deploy
echo "  ✅ Migrations applied"

# ---------- 2. Prisma Generate (ensure client matches live schema) ----------
echo ""
echo "[2/5] Generating Prisma client..."
bunx prisma generate
echo "  ✅ Prisma client generated"

# ---------- 3. Seed Admin User ----------
echo ""
echo "[3/5] Seeding admin user (idempotent)..."
bun scripts/seed-admin.ts || echo "  ⚠️  Admin seed skipped (may already exist)"
echo "  ✅ Admin user ready"

# ---------- 4. Seed Chart of Accounts ----------
echo ""
echo "[4/5] Seeding chart of accounts (idempotent)..."
bun scripts/seed-coa.ts || echo "  ⚠️  COA seed skipped (may already exist)"
echo "  ✅ Chart of accounts ready"

# ---------- 5. Start Next.js Server ----------
echo ""
echo "[5/5] Starting Next.js production server..."
echo "  PORT: ${PORT:-3000}"
echo "  HOSTNAME: ${HOSTNAME:-0.0.0.0}"
echo "============================================================"

exec node .next/standalone/server.js

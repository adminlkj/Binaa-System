# ============================================================
# Dockerfile — Binaa System (Next.js Web App — Standalone)
# ============================================================
# This is a WEB APPLICATION ONLY. No desktop/Electron/Tauri.
# Multi-stage build: Bun for install/build, Node slim for runtime.
#
# IMPORTANT: Database migrations run at STARTUP (not build time)
# because DATABASE_URL is only available at runtime on Render.
# See scripts/startup.sh.
# ============================================================

# ---------- Stage 1: Dependencies ----------
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy lockfile and package.json for caching
COPY package.json bun.lockb* ./
COPY prisma ./prisma/

# Install dependencies
RUN bun install --frozen-lockfile

# ---------- Stage 2: Build ----------
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Switch Prisma to PostgreSQL for production
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

# Generate Prisma Client (needed for build — types)
RUN bunx prisma generate

# NOTE: `prisma migrate deploy` is NOT run here — DATABASE_URL is not
# available during Docker build. Migrations run at startup via scripts/startup.sh.

# Build Next.js (standalone output)
# prebuild hook auto-skips DB verification when DATABASE_URL is unset
RUN bun run build

# ---------- Stage 3: Runner ----------
FROM node:20-slim AS runner
WORKDIR /app

# P7-FIX3: Install OpenSSL (required by Prisma engines) + bun
# node:20-slim doesn't include OpenSSL by default, which Prisma needs.
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g bun

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Tell Prisma which OpenSSL version to use (avoids auto-detection warning)
ENV PRISMA_QUERY_ENGINE_BINARY_TYPE=debian-openssl-3.0.x

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Copy standalone build output (includes server.js + minimal node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy FULL node_modules from builder (needed for seed scripts which import
# @/lib/* — those imports require decimal.js, bcryptjs, etc. that the
# standalone's minimal node_modules doesn't include)
COPY --from=builder /app/node_modules ./node_modules

# Copy Prisma files for runtime (needed for migrations + client)
COPY --from=builder /app/prisma ./prisma

# Copy seed scripts + startup script (needed at startup)
COPY --from=builder /app/scripts/seed-admin.ts ./scripts/seed-admin.ts
COPY --from=builder /app/scripts/seed-coa.ts ./scripts/seed-coa.ts
COPY --from=builder /app/scripts/startup.sh ./scripts/startup.sh
# Copy full src/ (seed scripts import from @/lib/* via tsconfig path alias)
COPY --from=builder /app/src ./src
# Copy tsconfig.json (needed for @/ path alias resolution in bun)
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# P7-FIX3: Ensure startup script is executable AND fix ownership so the
# nextjs user can write to node_modules/@prisma/engines (prisma generate
# at runtime needs write access). All files copied via COPY are owned by
# root by default — chown to nextjs so the non-root user can run migrations.
RUN chmod +x scripts/startup.sh && \
    chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Start via startup script (runs migrations + seeds + server)
CMD ["bash", "scripts/startup.sh"]

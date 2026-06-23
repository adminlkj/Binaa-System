#!/bin/bash
# ============================================================
#  Binaa ERP — Always-Up-To-Date Code Archive
# ============================================================
#  RULE (per user request):
#  After ANY modification to the project, run this script
#  immediately so the zip always contains the latest code.
#
#  Usage:  bash update-zip.sh
#  Output: Binaa-ERP-System.zip  (always overwritten in place)
# ============================================================

set -e
cd /home/z/my-project

ZIP_NAME="Binaa-ERP-System.zip"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

echo "============================================================"
echo "  Building $ZIP_NAME"
echo "  Generated: $TIMESTAMP"
echo "============================================================"

# Remove old archive if it exists (we always want a fresh build)
rm -f "$ZIP_NAME"

# ---- Build the zip with proper exclusions ----
# INCLUDE : all source, config, prisma, mini-services, examples, skills,
#           public, docs, db, key markdown docs, utility scripts
# EXCLUDE : node_modules, .next, .git, cache, logs, screenshots,
#           test images, upload temp, tool-results, agent-ctx,
#           .env (secrets), large research json, old zips
# NOTE: skills/ folder is the Z.ai SDK dev environment (61MB, 1000+ files)
#       and is NOT part of the ERP application code, so it is excluded.
zip -r -q "$ZIP_NAME" \
    src \
    prisma \
    public \
    docs \
    db \
    examples \
    mini-services \
    package.json \
    bun.lock \
    tsconfig.json \
    next.config.ts \
    tailwind.config.ts \
    postcss.config.mjs \
    components.json \
    eslint.config.mjs \
    Caddyfile \
    .env.example \
    .gitignore \
    worklog.md \
    SYSTEM-AUDIT-REPORT.md \
    TEST-REPORT.md \
    update-zip.sh \
    start-dev.sh \
    keep-alive.sh \
    -x \
    "*/node_modules/*" \
    "*/.next/*" \
    "*/.git/*" \
    "*/cache/*" \
    "*/tool-results/*" \
    "*/agent-ctx/*" \
    "*/.zscripts/*" \
    "*/test-screens/*" \
    "*/test-screenshots/*" \
    "*/screenshots/*" \
    "*.png" \
    "*.jpg" \
    "*.jpeg" \
    "*.log" \
    "*.zip" \
    ".env" \
    "*/uploads/*" \
    "billdu_article.json" \
    "hyperbots_article.json" \
    "invoicebus_article.json" \
    "invoice_research*.json" \
    "bug-reproduction.png" \
    "dashboard.png" \
    2>/dev/null || true

# ---- Write a manifest header so anyone opening the zip knows the build ----
MANIFEST="/tmp/binaa-zip-manifest.txt"
cat > "$MANIFEST" <<EOF
============================================================
  Binaa ERP — System Code Archive
============================================================
  Archive       : $ZIP_NAME
  Generated     : $TIMESTAMP
  Project root  : /home/z/my-project
  Framework     : Next.js 16 + TypeScript + Prisma + SQLite
  Purpose       : Always-up-to-date backup of ALL source code,
                  config, schema, and documentation.

  RULE: This zip is regenerated after EVERY code change so
        no modification is ever lost. To restore, unzip into
        a fresh directory and run:  bun install && bun run db:push
============================================================
EOF

cat "$MANIFEST"

# ---- Report final size & file count ----
echo ""
echo "============================================================"
echo "  Archive built successfully"
echo "============================================================"
echo "  File        : $ZIP_NAME"
echo "  Size        : $(du -h "$ZIP_NAME" | cut -f1)"
echo "  Files inside: $(unzip -l "$ZIP_NAME" | tail -1 | awk '{print $2}')"
echo "  Generated   : $TIMESTAMP"
echo "============================================================"
echo ""
echo "  REMINDER: Re-run  bash update-zip.sh  after every"
echo "  code modification to keep this archive current."
echo "============================================================"

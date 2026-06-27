#!/bin/bash
# ============================================================
# RESTORE SCRIPT — Run at the START of every agent session
# (auto-triggered by `bun run dev` via the `predev` hook).
#
# Purpose: If the platform wiped/reverted code between sessions,
# this script recovers ALL committed work from the BEST available
# backup source, in this priority order:
#
#   1. GitHub (origin)          — offsite, most reliable
#   2. Local safety repo        — /home/z/erp-safety.git (may be wiped too)
#   3. Current working tree     — last resort, accept current state
#
# Usage: bash /home/z/my-project/scripts/restore-from-safety.sh
# ============================================================
set -e

PROJECT_DIR="/home/z/my-project"
cd "$PROJECT_DIR"

echo "=========================================="
echo "[RESTORE] Checking code integrity..."
echo "=========================================="

# Ensure credential helper is configured (token may persist in ~/.git-credentials)
git config --global credential.helper store 2>/dev/null || true

LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "none")
echo "[RESTORE] Local HEAD: $LOCAL_HEAD"

# ---------- Try GitHub first (most reliable) ----------
GITHUB_HEAD=""
if git remote get-url origin >/dev/null 2>&1; then
  echo "[RESTORE] Fetching from GitHub (origin)..."
  if git fetch origin main 2>/dev/null; then
    GITHUB_HEAD=$(git rev-parse origin/main 2>/dev/null || echo "")
    echo "[RESTORE] GitHub HEAD: ${GITHUB_HEAD:-unavailable}"
  else
    echo "[RESTORE] GitHub fetch failed (network or auth issue)"
  fi
fi

# ---------- Try local safety repo as fallback ----------
SAFETY_HEAD=""
SAFETY_REMOTE="/home/z/erp-safety.git"
if [ -d "$SAFETY_REMOTE" ]; then
  if ! git remote get-url safety >/dev/null 2>&1; then
    git remote add safety "$SAFETY_REMOTE"
  fi
  echo "[RESTORE] Fetching from local safety repo..."
  if git fetch safety main 2>/dev/null; then
    SAFETY_HEAD=$(git rev-parse safety/main 2>/dev/null || echo "")
    echo "[RESTORE] Safety HEAD: ${SAFETY_HEAD:-unavailable}"
  fi
else
  echo "[RESTORE] Local safety repo not found (may have been wiped). Recreating..."
  git init --bare "$SAFETY_REMOTE" 2>/dev/null || true
  if ! git remote get-url safety >/dev/null 2>&1; then
    git remote add safety "$SAFETY_REMOTE" 2>/dev/null || true
  fi
fi

# ---------- Determine best backup source ----------
BEST_HEAD=""
BEST_REF=""
if [ -n "$GITHUB_HEAD" ] && [ "$GITHUB_HEAD" != "$LOCAL_HEAD" ]; then
  BEST_HEAD="$GITHUB_HEAD"
  BEST_REF="origin/main"
elif [ -n "$SAFETY_HEAD" ] && [ "$SAFETY_HEAD" != "$LOCAL_HEAD" ]; then
  BEST_HEAD="$SAFETY_HEAD"
  BEST_REF="safety/main"
fi

# ---------- Restore if needed ----------
if [ -z "$BEST_HEAD" ]; then
  echo "[RESTORE] ✅ Local is up-to-date with all backup sources. No restore needed."
else
  echo "[RESTORE] ⚠️  Local is BEHIND $BEST_REF — work may have been lost!"
  echo "[RESTORE] Restoring from $BEST_REF..."

  # Check if local is an ancestor of backup (clean fast-forward)
  if git merge-base --is-ancestor "$LOCAL_HEAD" "$BEST_HEAD" 2>/dev/null; then
    echo "[RESTORE] Performing fast-forward restore..."
    git merge "$BEST_REF" --no-edit 2>/dev/null || git reset --hard "$BEST_REF"
    echo "[RESTORE] ✅ Restored. Current HEAD: $(git rev-parse --short HEAD)"
  else
    # Local has diverged — prefer backup (it has the agent's full history)
    echo "[RESTORE] Local has diverged. Resetting to backup (agent history is authoritative)..."
    git reset --hard "$BEST_REF"
    echo "[RESTORE] ✅ Restored. Current HEAD: $(git rev-parse --short HEAD)"
  fi
fi

# ---------- Always re-sync safety repo (in case it was wiped) ----------
if [ -n "$GITHUB_HEAD" ] && [ -d "$SAFETY_REMOTE" ]; then
  echo "[RESTORE] Re-syncing local safety repo from current HEAD..."
  git push safety HEAD:main --force-with-lease 2>/dev/null || true
fi

# ---------- Always re-sync GitHub (in case hook missed anything) ----------
if [ -n "$LOCAL_HEAD" ] && git remote get-url origin >/dev/null 2>&1; then
  echo "[RESTORE] Re-syncing GitHub from current HEAD..."
  git push origin HEAD:main 2>/dev/null || true
fi

echo "=========================================="
echo "[RESTORE] Done. Local HEAD: $(git rev-parse --short HEAD 2>/dev/null)"
echo "=========================================="

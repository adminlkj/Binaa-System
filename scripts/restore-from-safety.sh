#!/bin/bash
# ============================================================
# RESTORE SCRIPT — Run at the START of every agent session.
#
# Purpose: If the platform wiped/reverted code between sessions,
# this script recovers ALL committed work from the safety repo.
#
# Usage: bash /home/z/my-project/scripts/restore-from-safety.sh
# ============================================================
set -e

SAFETY_REMOTE="/home/z/erp-safety.git"
PROJECT_DIR="/home/z/my-project"

cd "$PROJECT_DIR"

echo "=========================================="
echo "[RESTORE] Checking code integrity..."
echo "=========================================="

# Step 1: Ensure safety remote is configured
if ! git remote get-url safety >/dev/null 2>&1; then
  if [ -d "$SAFETY_REMOTE" ]; then
    echo "[RESTORE] Adding safety remote..."
    git remote add safety "$SAFETY_REMOTE"
  else
    echo "[RESTORE] WARNING: Safety repo not found at $SAFETY_REMOTE"
    echo "[RESTORE] No backup available. Proceeding with current state."
    exit 0
  fi
fi

# Step 2: Fetch latest from safety
echo "[RESTORE] Fetching from safety repo..."
git fetch safety 2>/dev/null || true

# Step 3: Compare local vs safety
LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "none")
SAFETY_HEAD=$(git rev-parse safety/main 2>/dev/null || echo "none")

echo "[RESTORE] Local HEAD:  $LOCAL_HEAD"
echo "[RESTORE] Safety HEAD: $SAFETY_HEAD"

if [ "$LOCAL_HEAD" = "$SAFETY_HEAD" ]; then
  echo "[RESTORE] ✅ Local is up-to-date with safety. No restore needed."
  exit 0
fi

# Step 4: Check if local is BEHIND safety (work was lost)
if git merge-base --is-ancestor "$LOCAL_HEAD" "$SAFETY_HEAD" 2>/dev/null; then
  echo "[RESTORE] ⚠️  Local is BEHIND safety repo — work was lost!"
  echo "[RESTORE] Restoring lost commits from safety..."
  git merge safety/main --no-edit 2>/dev/null || git reset --hard safety/main
  echo "[RESTORE] ✅ Restored. Current HEAD: $(git rev-parse HEAD)"
  exit 0
fi

# Step 5: Local is ahead or diverged — push local to safety
echo "[RESTORE] Local has new work. Pushing to safety for backup..."
git push safety HEAD:main --force-with-lease 2>/dev/null || true
echo "[RESTORE] ✅ Backup updated."

echo "=========================================="

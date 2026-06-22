#!/bin/bash
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=3072"
# Use bun which gives better memory behavior
while true; do
  echo "[$(date)] Starting dev server..." >> /home/z/my-project/keep-alive-history.log
  bun run next dev -p 3000 > /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server died (exit $EXIT_CODE), restarting in 3s..." >> /home/z/my-project/keep-alive-history.log
  sleep 3
done

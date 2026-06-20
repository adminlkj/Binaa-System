#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting dev server..." >> /home/z/my-project/keep-alive-history.log
  bun run dev 2>&1 | tee /home/z/my-project/dev.log
  echo "[$(date)] Server died with exit code $?, restarting in 3 seconds..." >> /home/z/my-project/keep-alive-history.log
  sleep 3
done

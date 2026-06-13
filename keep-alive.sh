#!/bin/bash
while true; do
  cd /home/z/my-project
  npx next dev -p 3000 2>&1 | tee -a /home/z/my-project/next-out.log
  echo "Server died, restarting in 3 seconds..." >> /home/z/my-project/next-out.log
  sleep 3
done

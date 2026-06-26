#!/bin/bash
# Robust dev server daemon - survives parent shell exit
cd /home/z/my-project

# Kill any existing instances
pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "bun run dev" 2>/dev/null
sleep 2

# Start in a fully detached session
# Redirect stdin from /dev/null, stdout/stderr to dev.log
setsid bash -c 'exec bun run dev' </dev/null >dev.log 2>&1 &
echo $! > .dev.pid
echo "Dev server started, PID: $!"
sleep 1
disown 2>/dev/null

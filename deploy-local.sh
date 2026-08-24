#!/bin/bash
# Simple local deploy — frontend + cashout server
set -e
echo "Installing dependencies..."
npm install
echo "Starting frontend (vite) on :8080..."
npm run dev &
FRONTEND_PID=$!
sleep 2
echo "Starting cashout server on :4000..."
chmod +x start-cashout-server.sh 2>/dev/null || true
./start-cashout-server.sh &
CASHOUT_PID=$!
echo ""
echo "Frontend:  http://localhost:8080"
echo "Cashout:   http://localhost:4000"
echo "Stop with: kill $FRONTEND_PID $CASHOUT_PID"
wait

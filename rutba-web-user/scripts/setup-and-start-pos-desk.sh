#!/bin/bash
# This script is kept for backward compatibility.
# pos-desk is legacy — use setup-and-start-all.sh instead.
echo ""
echo "WARNING: pos-desk is no longer actively developed."
echo "Use setup-and-start-all.sh to start all services."
echo ""
cd "$(dirname "$0")/../pos-desk"
npm install
npm run dev
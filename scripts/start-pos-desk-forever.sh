#!/bin/bash
# Legacy script — pos-desk is no longer actively developed.
# Kept for reference. Use rutba_deploy.sh for production deployments.
cd "$(dirname "$0")/../pos-desk"
npm install
forever start -c "npm run dev" .
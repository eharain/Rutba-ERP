#!/bin/bash
cd "$(dirname "$0")/../services/strapi"
npm install
forever start -c "npm run start" .
#!/bin/bash
cd "$(dirname "$0")/../pos-strapi"
npm install
forever start -c "npm run start" .
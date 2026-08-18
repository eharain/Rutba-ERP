@echo off
REM Install dependencies
cd "%~dp0..\services/strapi"
npm install

REM Start Strapi server
npm run start
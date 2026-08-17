@echo off
REM Install dependencies
cd "%~dp0..\pos-strapi"
npm install

REM Start Strapi server
npm run start
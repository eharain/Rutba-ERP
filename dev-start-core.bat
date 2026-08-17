@echo off
REM ============================================================
REM  Rutba ERP - Dev Environment on rutba-core (no Strapi)
REM ============================================================
REM Starts the whole app fleet against rutba-core on :4020 instead of
REM pos-strapi on :4010. Same database, same wire contract - the apps cannot
REM tell the difference, so long as NEXT_PUBLIC_API_URL in .env.development
REM points at 4020 (it does; flip that one line to go back to Strapi).
REM
REM Thin wrapper so this stays one script: dev-start.bat takes the backend as
REM its first argument and everything else is shared.
REM
REM Known gaps while Strapi is down:
REM   - Seeding. `npm run seed` drives the engine inside Strapi.
REM   - The Strapi admin panel, obviously.
REM (Uploads used to be listed here; core now accepts POSTed files itself via
REM  src/platform/upload.js + src/modules/uploads.js - status updated 2026-08-17.)
REM ============================================================
call "%~dp0dev-start.bat" core

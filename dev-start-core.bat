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
REM   - UPLOADS. Reading images works (core 302s /uploads/* to MEDIA_BASE_URL),
REM     but POSTING a new file still needs Strapi's upload plugin. Anything that
REM     uploads - product images, CMS media - has to run on the default backend
REM     until core grows an upload path to the media file server.
REM   - Seeding. `npm run seed` drives the engine inside Strapi.
REM   - The Strapi admin panel, obviously.
REM ============================================================
call "%~dp0dev-start.bat" core

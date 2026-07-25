# PGE Work Order — v0.3.0

This release adds real Supabase authentication while preserving the existing Work Order interface.

## What is real in this release

- Phone-number + 8 digit PIN login form
- Phone input converts internally to `phone-62…@login.pge.internal`
- Supabase Auth session persistence and sign out
- Profile and role are loaded from `public.get_my_profile()`
- The demo user switcher has been removed
- Admin and PPIC accounts can sign in with the accounts already created in Supabase

## What remains demo data

The UI still displays `src/data/mockData.ts` for Work Orders, WIP, quality, artwork, and reports. The next release will replace those demo data reads and writes with real Supabase records.

## Required GitHub Actions build secrets

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The workflow must pass both values into the Vite build step. Do not put a service-role or secret key in GitHub Pages.

## Upload strategy

Replace the complete `src/` folder, `package.json`, and `.github/workflows/deploy.yml` with the contents of this package. Do not mix older patch files into this release...

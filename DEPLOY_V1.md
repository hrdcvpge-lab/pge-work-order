# PGE Work Order Frontend v1.0 — Clean Replacement

This package is a complete frontend replacement. Do **not** apply older v0.2.x patches on top of it.

## Upload to the existing GitHub repository

1. Extract this ZIP.
2. In the existing `pge-work-order` repository, replace the complete contents of:
   - `src/`
   - `.github/workflows/deploy.yml`
   - `index.html`
   - `package.json`
   - `tsconfig.json`
   - `tsconfig.app.json`
   - `tsconfig.node.json`
   - `vite.config.ts`
3. Keep the files at the repository root. Do not create `src/src/`.
4. Commit as: `Deploy PGE Work Order frontend v1.0`
5. Wait for GitHub Actions to finish, then check the Pages URL.

## Authority rule

- **Admin:** create draft, plan route, assign PIC/reporting/location, deploy, and request exceptions.
- **PPIC:** schedule/deploy and final operational authority for short shipment / cancellation of remaining quantity.
- **Manager:** read-only dashboard and reports.
- **Floor users:** can only open and operate their exact assigned process.

## Current limitation

This is still frontend simulation data. Supabase Auth, database constraints, Storage, and server-side permissions are required before live production use.

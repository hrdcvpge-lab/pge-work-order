# PGE Work Order Control — Frontend v0.2

This is a React + TypeScript frontend prototype for PGE's Work Order process.

## Included in this version

- MTO and MTS Work Orders
- Draft → Scheduled → Production → QC → Packing → Done → Closed lifecycle
- Role simulation for Admin, PPIC, Operator, QC, Packing, and Manager
- Station-based task assignment
- Route templates: direct, print-sew, multi-part, and simple custom routes
- WIP visibility between production steps
- Process timers, result logging, HOLD, QC pass/rework, packing, and audit history
- Desktop dashboard plus an Android-friendly **Stasiun Saya** view

## Important limits

This frontend uses mock data in browser memory. Refreshing resets the demo.
It does not yet contain Supabase Auth, database persistence, RLS permissions, real notifications, or inventory posting.

## Run locally

```bash
npm install
npm run dev
```

## Deploy with GitHub Pages

The repository includes `.github/workflows/deploy.yml`.

1. Push the project to the `main` branch.
2. Open **Settings → Pages**.
3. Set Source to **GitHub Actions**.
4. GitHub will build and publish the `dist` directory.

The repository name must stay `pge-work-order`, because `vite.config.ts` uses:

```ts
base: '/pge-work-order/'
```

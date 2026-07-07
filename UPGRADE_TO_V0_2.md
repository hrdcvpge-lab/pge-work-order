# Update GitHub repository to PGE Work Order Frontend v0.2

## Before uploading

- Do **not** upload `node_modules` or `dist`.
- Your GitHub repository must keep the name `pge-work-order`.
- Your existing GitHub Actions workflow already works. You may keep it, or replace it with the included `.github/workflows/deploy.yml`.
- If your repository still contains an accidental nested folder named `src/src`, delete that folder first. It must not exist.

## Upload these folders/files at repository root

```text
.github/workflows/deploy.yml   (optional if existing workflow already works)
src/
index.html
package.json
tsconfig.json
tsconfig.app.json
tsconfig.node.json
vite.config.ts
README.md
```

## Critical final structure

```text
pge-work-order/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   ├── vite-env.d.ts
│   ├── components/
│   ├── data/
│   ├── types/
│   └── utils/
├── index.html
├── package.json
├── vite.config.ts
└── .github/workflows/deploy.yml
```

`App.tsx`, `main.tsx`, and `styles.css` must all be directly inside `src/`.

## After uploading

1. Commit with: `Upgrade Work Order frontend to v0.2`
2. Open **Actions**.
3. Open the latest **Deploy PGE Work Order** run.
4. Wait for a green check mark.
5. Refresh your live GitHub Pages website.

## What has changed

- Production process routes and WIP are now part of each Work Order.
- The system uses official WO stages: Draft → Scheduled → Production → QC → Packing → Done → Closed.
- HOLD and Waiting for WIP are blocker conditions, not final lifecycle statuses.
- The user switcher now simulates Admin, PPIC, Operator, QC, Packing, and Manager roles.
- Added `Stasiun Saya`, a mobile-friendly task view for Android operators.
- Added route templates, custom route selection, station assignment, timers, process result logging, QC rework, packing, and a detailed audit history.

This remains a browser-only frontend demo. Refreshing resets data. Supabase/Auth/notifications are the next implementation stage.

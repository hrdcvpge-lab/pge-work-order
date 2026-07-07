# PGE Work Order Frontend v1.0

A clean React/Vite frontend baseline for PGE's manufacturing Work Order workflow. This package consolidates the earlier frontend features into one source tree; do not mix old v0.2.x patches into it.

## What is included

- Draft → scheduled → production → QC → packing → done → closed lifecycle
- Admin and PPIC planning/deployment with per-process station, PIC, reporting owner, area, machine, and schedule date
- Standard stations: Printing, Cutting, Sewing / Assembly, Finishing, QC, Packing, Warehouse
- Exact PIC task scope for floor users; station membership alone does not unlock another employee's task
- Station-specific colors plus Admin/PPIC live glow for the active process
- Artwork upload/reference with optional approval lock for Printing
- Process timer, WIP, HOLD, QC pass/rework/reject, optional QC evidence, shortfall, replacement, and close protection
- PPIC is the final operational approver for short shipment and cancellation of remaining quantity for both MTO and MTS
- Seven reports: daily production, overdue WO, reject/defect, WIP aging, operator workload, machine workload, and customer order completion
- Admin-only People & Station configuration for assignment eligibility and reporting defaults

## Frontend authority model

| Role | Access |
| --- | --- |
| Admin | Create drafts, plan/deploy routes, assign PIC, request quantity exceptions, manage People & Station |
| PPIC | Schedule/deploy, edit operational planning, create replacements, and give final approval for short shipment/cancel remaining |
| Manager | Read-only dashboard, Work Orders, and reports |
| Operator / QC / Packing | Exact assigned process only |

## Run locally

```bash
npm install
npm run dev
```

## Deploy

Use the included GitHub Actions workflow. Follow `DEPLOY_V1.md` for the safe GitHub replacement process.

## Current limitation

This package is a frontend simulation. Browser refresh resets state. Do not use it as the permanent production record until Supabase Auth, Postgres, Storage, Row Level Security, and server-side transition functions are implemented.

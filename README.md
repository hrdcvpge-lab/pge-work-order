# PGE Work Order Frontend Prototype

Interactive frontend prototype for the Work Order workflow:

`Draft → Scheduled → In Progress → QC Check → Done → Closed`

QC rejection returns the Work Order to **In Progress** and increments `rework_count`.

## Included in this frontend stage

- Role switcher for Admin, PPIC, Operator, QC, and Manager.
- Kanban Work Order board grouped by workflow status.
- Role-specific actions shown on each work order card.
- Forms for Draft creation, PPIC scheduling, Operator output submission, and QC decision.
- Detail drawer with a readable Work Order audit trail.
- Mock local state only. Refreshing the browser resets the data.

## Local setup

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in your terminal.

## Production backend integration later

Replace the mock state in `src/App.tsx` with calls to Supabase RPC/Edge Functions.
Do not write directly from the frontend to `work_orders` for state transitions.

Recommended first backend functions:

- `create_work_order`
- `schedule_work_order`
- `start_work_order`
- `submit_work_order_for_qc`
- `record_qc_result`
- `close_work_order`

Each should validate the caller role, expected previous status, and append `wo_history` in the same transaction.

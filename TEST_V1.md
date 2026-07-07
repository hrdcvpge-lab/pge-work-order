# PGE Work Order Frontend v1.0 — Workflow Test Checklist

Run these scenarios after GitHub Pages deploys. This validates the UI flow before Supabase work begins.

## 1. Draft planning and deployment
- Sign in as Admin or PPIC.
- Create a Draft WO.
- Open `Rencanakan & deploy WO`.
- Every process must receive: station, PIC, report-to, work area, scheduled date, and machine/resource.
- Deploy the WO.
- Confirm that the first process becomes ready and the assigned PIC can see it in `Stasiun Saya`.

## 2. Exact PIC scope
- Assign a Cutting step to one person.
- Switch to a different Cutting user.
- Confirm that the other user cannot see or act on the assigned ticket.

## 3. Artwork optional mode
- Create a Printing WO and keep `Wajibkan approval artwork sebelum Printing` unchecked.
- Confirm that Printing can start without uploaded artwork.

## 4. Artwork approval lock
- Create a Printing WO with the approval checkbox enabled.
- Confirm that Printing cannot start until a primary file is approved.
- Confirm that the Printing PIC must review the file before starting.

## 5. WIP handover
- Record a good quantity at Printing or Cutting.
- Confirm the next process shows the available WIP and can only record up to that amount.

## 6. HOLD
- Raise HOLD from an assigned process.
- Confirm the reason is visible in the WO, queue, and audit history.
- Resume the process and confirm it returns to ready only when inputs are available.

## 7. QC rework and reject
- As QC, send a quantity to rework and record an optional evidence photo or no photo.
- Confirm a rework process and QC recheck are created.
- Record final reject and confirm the shortfall block appears.

## 8. Shortfall authority
- As Admin, choose `Ajukan kirim kurang ke PPIC` or `Ajukan pembatalan sisa`.
- Switch to PPIC and confirm the action appears as `Tinjau & putuskan`.
- Confirm Manager cannot approve it.

## 9. Replacement route
- As Admin or PPIC, create a replacement route from an appropriate restart station.
- Confirm replacement cards show amber / `↻ Penggantian` labels.
- Confirm the WO cannot close until the original target is accounted for through packing, approved short shipment, or cancelled remaining.

## 10. Reports
- Confirm the Reports area displays all seven tabs:
  - Daily Production
  - WO Overdue
  - Reject & Defect
  - WIP Aging
  - Operator Workload
  - Machine Workload
  - Customer Completion

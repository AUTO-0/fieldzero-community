# FIELDZERO V24 — Worker Desk, Stock & Session Operations
Deployed to FIELDZERO GitHub Pages and the connected FIELDZERO Supabase project on 11 November 2026.

## Pages

- Public website: https://auto-0.github.io/fieldzero-community/
- Owner admin: https://auto-0.github.io/fieldzero-community/admin.html
- Restricted worker desk: https://auto-0.github.io/fieldzero-community/staff.html
- Restricted inventory / session usage: https://auto-0.github.io/fieldzero-community/inventory.html

## Worker accounts and permissions

Only an existing FIELDZERO admin (member of `admin_users`) may use the worker-creation API. In the Staff Desk, the owner opens **Worker Accounts**, enters a worker name, email, strong temporary password and assigned field, then creates the account. The owner can disable or reactivate it later. Workers sign in with email/password and can rotate or reset their passwords.

Workers can read bookings at their assigned active field, read operator applications for the main FIELDZERO community, review operator applications, review special bookings, record real payments against approved booking invoices, manually send customer confirmations, download booking invoices, and record field-session equipment issues/returns. A worker's permissions are checked in the database for every operation, not only by hiding website buttons. They cannot create workers, edit stock levels, amend published pricing, or access unrestricted owner accounting and settings.

The current operator-application table is global (not field-specific), so operator request review is limited to workers assigned to the main Imbulgoda field. Extend the application schema with a field ID before delegating community approvals to franchise workers.

## Booking procedure

**Bookings submitted before 10 December 2026 (pre-launch):**
1. The public system creates a no-deposit standard booking reference. Special requests remain pending owner/staff approval.
2. A worker opens the booking, checks the details, and sends the prepared WhatsApp confirmation *manually*. Click **Mark message sent** only after actually sending it.
3. At arrival, create an invoice using the configured session fee. Finalize the bill, record actual payment into the correct field account, then download the invoice PDF.

**After opening (new standard bookings):**
1. A booking can enter `pending_payment`. Check actual cash/bank/card receipt before clicking **Record verified LKR 500 advance**.
2. The transaction creates a booking invoice, records the receipt and confirms the booking. Workers then open WhatsApp and send the confirmation.
3. At checkout, finalize the total bill (owner-set session rates cannot be discounted by workers), record the remaining amount and download the invoice PDF.

The system does **not** automatically send WhatsApp messages or verify bank transfers. Staff perform these steps deliberately. Booking PDFs and invoices remain different artifacts.

## Inventory setup

Only the owner adds or edits items from the separate Inventory page. Suggested catalog:

| SKU example | Item | Type | Unit |
|---|---|---|---|
| FZ-M4 | Rental gel blaster | Reusable | pcs |
| FZ-MASK | Face mask | Reusable | pcs |
| FZ-BATT | Rechargeable battery | Reusable | pcs |
| FZ-GEL | Hydrated gel balls | Consumable | balls |
| FZ-WIPE | Disposable cleaning wipes | Consumable | pcs |

For a session, workers open the confirmed booking's game record, choose the inventory item and issue a quantity. The database uses transactional row locks to prevent concurrent over-issuing.

- **Reusable**: 10 masks in stock, issue 6 = 4 available for other games. Return 6 = 10 available again. Total owned stock remains 10. A game cannot be closed with reusable equipment still checked out.
- **Consumable**: 25,000 gel balls in stock, issue 4,000 = **21,000 remaining** immediately. There is no consumable return action. A staff member cannot use this feature to add stock.
- Owner changes to stock quantity are logged as stock adjustments. Issues and returns have a timestamp, actor and session ID.

Inventory is not automatically deducted merely because a booking was created. It is deducted when the worker actually issues items to a session.

## Session history and forecasting

Each approved booking can have a game/session record. Items issued to that game are stored individually with issue quantities, return quantities, staff members and timestamps. The page shows usage during the last 7 and 30 days and a record of completed sessions.

For consumables, the 30-day forecast is:
`ceil(issued in past 30 days / distinct sessions using that item in past 30 days × confirmed bookings in next 30 days)`.
Only show a numerical forecast after at least three item-usage sessions are recorded. Reorder guidance adds a 20% forecast buffer plus the owner-set low-stock threshold. For reusable stock, show outstanding units and average issues per game rather than treating gear as consumed.

Estimates are not a prediction of walk-ins, wastage, supplier lead time, damage, or demand from unconfirmed bookings. Verify against manual physical stock counts.

## Deployment & disaster recovery

- Supabase migrations: `supabase/migrations/2026111115*_fieldzero_v24_*.sql` (five ordered, **already applied**).
- Worker-creation Edge Function: `supabase/functions/fieldzero-worker-admin/index.ts` (deployed, `verify_jwt = true`).
- Website files: `staff.html`, `staff.js`, `inventory.html`, `inventory.js`, `staff.css`.
- Social image and sharing metadata: `social-preview.png` and `index.html`.
- Automated static/mobile QA: `scripts/fieldzero-staff-smoke.mjs` and existing visual QA workflow.

Do not rerun the original `supabase/schema.sql` against production, or delete existing authentication data. The GitHub Pages frontend is public, but authenticated data is protected by Supabase RLS and permission checks. Do not put any service-role credentials in GitHub files or browser configuration.

## Required owner setup before employees use this

1. Sign in with the existing FIELDZERO owner email at Staff Desk. Create a worker with a real email and a temporary password, then pass the details privately.
2. Add real blaster, mask, gel-ball and other stock quantities in Inventory (no dummy stock has been inserted).
3. Create a controlled **staging** booking, test the advance, confirmation handoff, final payment, invoice and inventory issue/return with one worker account, then verify owner visibility and staff restrictions.
4. Verify receipt numbers, staff assignments, field-specific cash accounts and physical stock before live operations.

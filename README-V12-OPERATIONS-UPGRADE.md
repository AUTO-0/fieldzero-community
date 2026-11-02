# FIELDZERO V12 - Operations Desk Upgrade

## What V12 adds

V12 adds an admin-only operations desk for running FIELDZERO as a real-world recreational venue:

- Digital opening, pre-session, post-session, closing, weekly and monthly checklists.
- Internal session register linked to existing public events and arena fields.
- Player check-in linked to approved player records.
- Equipment asset register and maintenance history.
- An auditable player XP ledger with admin-only point awards and corrections. The database enforces a maximum of 60 net points per player per linked session and requires the player to be checked in to that session before a linked-session award can be posted.
- Private incident and near-miss register.
- Internal LKR cashbook (not a statutory accounting system).
- Social media content planner for Instagram, TikTok, Facebook and WhatsApp. It plans posts; it does not auto-publish to social platforms.
- A public Player Guide page linked from the main website.

Existing public registrations, approval, bookings, events, squads, gallery, seasonal themes, website settings, social profile links and `config.js` are retained.

## Before you install

1. Open the live website and confirm V11 is working.
2. In Supabase, make a current backup (or confirm the project's backup/restore options are available).
3. Confirm the V2 through V11 migrations have already been applied. V12 depends on the existing `admin_users`, `is_fieldzero_admin()`, `players`, `events`, `arena_fields` and `team_members` structures.
4. Do not run `schema.sql` again. Do not delete or recreate existing tables or views.

## Step 1 - Run the V12 database migration once

1. Open Supabase for your FIELDZERO project.
2. Open **SQL Editor**.
3. Choose **New query**.
4. Open `supabase/upgrade-v12-operations-console.sql` from this ZIP.
5. Copy the complete file contents and paste into the SQL Editor.
6. Press **Run** once.
7. Confirm the result says the query completed successfully.

The migration creates new `fz_` operations tables and one admin-only points function. It does not replace the public website views. If SQL returns an error, stop and send the complete error message; do not run random fragments or drop existing views.

## Step 2 - Replace the website files on GitHub

1. Extract this ZIP on your computer.
2. Open the `fieldzero-review` folder.
3. Open your existing GitHub repository: `fieldzero-community`.
4. Upload the files below from inside the extracted folder to the **root** of your existing repository, replacing matching files:
   - `admin.html`
   - `admin.js`
   - `admin-extra.css`
   - `index.html`
   - `field-guide.html` (new file)
5. Upload `README-V12-OPERATIONS-UPGRADE.md` if you want to keep the instructions in GitHub.
6. Commit the changes.
7. Open the GitHub **Actions** tab and confirm the Pages deployment succeeds.

Do not upload the parent `fieldzero-review` folder as a nested directory. The updated files must replace the files at the repository root.

## Critical - preserve this file

**Do not replace, delete, rename or edit your existing `config.js`.** This ZIP intentionally does not contain `config.js`.

Do not run the original `schema.sql`, do not reset Supabase, and do not delete any V2-V11 migration objects.

## Step 3 - Open the V12 Admin operations desk

Open:

`https://auto-0.github.io/fieldzero-community/admin.html`

Sign in with your existing Supabase admin user. At the top of the dashboard, the **FIELDZERO Operations Desk** contains the new tools. If a panel shows a migration error, confirm Step 1 completed successfully.

### Recommended setup sequence

1. **Equipment Register:** enter every rental asset and safety item with an asset code. Set any damaged item to `Out of service` or `Repair required`.
2. **Session Register:** create an internal session sheet for each operating slot. Link it to a public event when appropriate.
3. **Checklists:** complete Opening and Pre-session checks before each session. Save Post-session and Closing checks at the end.
4. **Player Check-in:** check in only approved players who actually arrive.
5. **Player XP:** award verified points only after the referee confirms attendance and performance. The database limits a player's net points to 60 per linked session.
6. **Maintenance:** log inspections, cleaning, repairs and next service dates.
7. **Incident Register:** record injuries, near misses, equipment failures and rule breaches. Keep records private and manage follow-up.
8. **Cashbook:** enter every income and expense with a receipt/reference. Reconcile to bank/card/booking records.
9. **Social Planner:** draft and schedule your content plan. Publish manually on the platform and then record the live post URL/status.

## Important operational limitations

- V12 is an admin system, not a safety certification, legal permit, insurance policy, accounting package or emergency service.
- The cashbook is a basic internal tracker, not a replacement for an accountant or statutory records.
- Social content is not automatically published. Use the official platform apps.
- XP awards are admin-controlled and recorded in a ledger. Corrections should be entered as a new negative correction with a clear reason; do not edit the player's point total directly.
- Player deactivation now preserves their history, ledger and attendance; do not delete historical player data.
- Only authorised admins should access the private incident, cashbook and player-contact records.

## First smoke test

After deployment, sign in and test with one dummy/internal record at a time:

- Add one equipment item named `TEST-ASSET` and then set it to retired or remove it before real operations.
- Add one planned session and confirm it appears in the session register.
- Save one incomplete checklist to confirm it displays as incomplete.
- Use a test/approved player to issue a small XP award only after confirming all rules. Do not award test points to actual public players.
- Add a dummy social post in Draft status.

Clean up test records before opening. Never test incident or cash records using fabricated entries in the live ledger; use a staging project if available.

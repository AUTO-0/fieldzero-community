# FIELDZERO V23 — Referral Program & Hall of Fame

This upgrade adds:
- Field-specific referral codes assigned to active operators.
- Optional referral code capture on arena bookings, including `?ref=CODE` invite links.
- Validation against active codes and prevention of self-referrals or cross-field code use.
- Admin verification before referral XP is issued.
- Referral bookings and referral XP metrics in the operations dashboard.
- Hall of Fame spotlights, using the existing spotlight image workflow.
- The existing Seasons and Season MVP workflow remains in place.

## Database
The V23 SQL has been applied to the connected Supabase project. The SQL file is retained here for project recovery or a fresh environment. On a fresh project, apply this file after V22 and its prerequisite operations migrations.

## Admin use
1. Sign in at `admin.html`.
2. Open **00C / Operator Referral Program**.
3. Select a field and active operator, set the code and reward XP (1–60), then create it.
4. Copy the invite link and share it with the operator.
5. When a referred customer attends and pays, open the referral booking and choose **VERIFY VISIT & AWARD XP**. The reward is recorded once in the existing point ledger.

## Hall of Fame
In **00A / Public Spotlight Pop-up**, choose **Hall of Fame inductee** and upload a photo. Keep the entry active with no end date to retain it in the public Hall of Fame. Use **Season MVP** for the current seasonal MVP spotlight.

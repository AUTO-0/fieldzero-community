# FIELDZERO Operator App · V28
Website: https://auto-0.github.io/fieldzero-community/
App install page: https://auto-0.github.io/fieldzero-community/app.html#install
Customer App: https://auto-0.github.io/fieldzero-community/app.html

## What was delivered

A first-party Progressive Web App (PWA) that customers can install from the FIELDZERO website on Android and iPhone without placing anything in an app store. It opens from its own Home Screen icon in standalone mode. This is **not an Android .apk, Apple .ipa, paid app-store listing or native push-notification service**.

Its mobile navigation includes:
1. Home — Operator identity, next sessions and shortcuts.
2. Book — current game modes, location, live availability, owner-set prices, real-time server-validated booking, and reference.
3. My Games — private upcoming/past reservations, status, reference copying and verified old-booking linking.
4. Squads — public squads, request-to-join, personal team details, captain join-request review.
5. Profile — existing callsign login, new Operator registration, account display, stats, membership/credits, avatar, callsign update and sign-out.

Other views: direct Supply Shop and field guide links, install help.

## How customers install

### Android / Chrome
1. Visit https://auto-0.github.io/fieldzero-community/app.html#install using Chrome.
2. Tap **Install FIELDZERO App** if Chrome offers the button. Otherwise Chrome menu (⋮) → **Install app** or **Add to Home Screen**.
3. Launch the **FIELDZERO** icon on the phone. This web app runs from the browser engine with the current server data.

### iPhone / Safari
1. Visit the same link using Safari (not an embedded Facebook/Instagram browser).
2. Tap the Safari Page Menu / Share icon → **Add to Home Screen**.
3. Enable **Open as Web App**, then **Add**. Launch from the FIELDZERO icon.

A user never needs Play Store or App Store accounts to install it. The device requires internet for fresh bookings, availability, password authentication and private records. The service worker caches only static UI files. There is no cached offline copy of private customer data.

## Source and hosting

- UI and customer login logic: app.html, fieldzero-app.css, fieldzero-app.js.
- App manifest: fieldzero-app.webmanifest.
- Static-shell service worker: fieldzero-sw.js.
- Self-hosted app icons: assets/fieldzero-app-icon.svg and rendered PNG sizes 180, 192, 512.
- Homepage installation card: fieldzero-download-v28.css and modified index.html.
- Original backend: Supabase FIELDZERO project (no duplicate user database).
- Existing secure username login Edge Function: member-login.
- Existing profile membership and squad RPCs are reused without modification.
- Existing booking RPC: fz_submit_arena_booking is reused by a new owner-authenticated wrapper.

## Data protection

The additive Supabase migration supabase/migrations/20261112041328_fieldzero_v28_customer_app_booking_ownership.sql creates:
- fz_app_booking_owners (internal ownership mapping with RLS enabled, no direct public read)
- fz_app_create_booking(p_booking) (requires verified email and authenticated user, invokes the original booking availability/pricing logic, then links the new reservation to the caller)
- fz_app_my_bookings() (returns only reservations linked to auth.uid())
- fz_app_claim_booking(reference,mobile) (requires exact booking reference, registered mobile and signed-in *verified* account email; refuses a reservation linked to another account)

All three customer RPCs deny anonymous execution. Worker/admin records are not exposed. Existing bookings are retained. Old bookings with a different registered email must be manually resolved with the owner; do not loosen account ownership to match just a phone or callsign.

## What is not included

- A downloadable signed Android APK (.apk). If one is required later, build a properly signed Android package with a securely held owner signing key and publish it through an owner-controlled download endpoint, with version/signature continuity.
- An installable native iPhone .ipa. On iPhone this is a Safari-installed web app.
- Online payment collection, push notifications, automatic WhatsApp sending, or native phone permissions beyond ordinary web functionality.
- Real-device testing with a customer account and actual payment; the automated test suite runs mock accounts with no production writes. Owner should test registration, verified email callback, booking, joining squads, and avatar updates using authorized test accounts.

## Testing

- Workflow .github/workflows/fieldzero-app-v28-check.yml validates JS and uses Chromium with simulated Supabase accounts on desktop and mobile. It runs navigation, logged-out booking restriction, signed-in game booking simulation, squad/profile, install screen, and horizontal-overflow checks.
- This browser test uses scripts/fieldzero-app-v28-mock.js and **never touches production user records**.
- SQL access checks verified fz_app_booking_owners has RLS enabled and the three customer RPCs are available to authenticated users only.
- Existing Staff Desk, booking website, supply catalogue and owner admin are unchanged other than the Get the App navigation/marketing entry.

## Release checklist for owner

1. On your own iPhone, use Safari Add to Home Screen from the install page and open FIELDZERO icon.
2. On Android, use Chrome Install app.
3. Test a brand-new account's email verification; it returns to FIELDZERO website, then sign in from app.
4. Test your existing callsign and password through the app.
5. Check a real authorized booking (or staging booking) appears only in that customer account.
6. Test an old reservation using its exact reference, registered email and mobile.
7. Check squad captain actions and profile photos on an account authorized to use them.
8. Tell customers that booking fees are separate from free app installation; do not claim a booking is paid until field staff records payment.

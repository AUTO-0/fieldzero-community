# FIELDZERO V25 — Customer Visits, Supply & Partners

Deployed to FIELDZERO on 11 November 2026. The existing player, booking and owner-admin data is retained.

## Live links

- Public FIELDZERO: https://auto-0.github.io/fieldzero-community/
- Worker desk: https://auto-0.github.io/fieldzero-community/staff.html
- Rental inventory: https://auto-0.github.io/fieldzero-community/inventory.html
- Usage statistics: https://auto-0.github.io/fieldzero-community/stats.html
- FIELDZERO Supply shop: https://auto-0.github.io/fieldzero-community/shop.html
- Owner Supply Control: https://auto-0.github.io/fieldzero-community/shop-admin.html
- Sponsor & partner enquiries: https://auto-0.github.io/fieldzero-community/partners.html
- Existing owner admin: https://auto-0.github.io/fieldzero-community/admin.html

## Worker handoff: customer arrival to invoice

1. Sign in to the Worker Desk with the owner-issued login.
2. Search the customer's booking reference, mobile (077... or +9477...), name or callsign. Open their confirmed booking.
3. Enter actual player count and quantities of blasters, face masks, gel balls and other items issued.
4. Press CHECK IN. One database transaction creates the game record, issues all items and deducts consumables. Insufficient stock rolls back the entire action.
5. Issue additional equipment from the same game when needed. Reusable items are checked out; gel balls and other consumables reduce stock immediately.
6. At the end, physically count and verify all reusable equipment. Tick the return attestation and press COMPLETE GAME. All returns are recorded.
7. Create/open the invoice, add additional itemized charges, then FINALIZE BILL. Owner-set session prices are protected.
8. Once money is received and verified, choose the receiving account/method and press PAID. The recorded receipt closes the invoice when balance is zero.
9. Download PDF or use SHARE INVOICE to choose WhatsApp on compatible mobile devices. Otherwise download and manually attach the PDF; delivery is not automatic.

Workers cannot create retail products, adjust master stock or owner pricing. Existing owner admin remains unchanged.

## Usage statistics

Statistics automatically reflect actual games and issued stock. The Stats page shows 7-day game activity, 30-day totals, individual game issues, returned reusable items, consumed quantities, and per-item demand forecasts based on confirmed future bookings. Prediction displays only after at least three sessions used the item.

## Owner Supply operations

Add actual recreational gel blaster products, accessories, gel balls and safety equipment through Supply Control. Enter SKU, photo (optional JPG/PNG/WEBP upload or HTTPS URL), category, price in LKR, available stock, description and publication status. Unpublished products are invisible.

Public customers can browse a category/searchable catalogue, use the product quick-view popup and send an enquiry bag order request. They receive a FZ-SHOP reference. The owner confirms or cancels requests and only marks them fulfilled after payment and item handover; that action deducts separate RETAIL stock once.

There is no online payment gateway or automated delivery tracking. Enquiries are not paid orders. Do not publish restricted goods until their sale and import status in Sri Lanka has been checked.

## Partner and sponsor outreach

The new Partners page supports field/land partnership, event sponsorship, and community or brand collaboration enquiries. Leads appear privately in Supply Control, including contact details and submitted proposal. No sponsor endorsement, price or collaboration agreement is implied until accepted.

## Owner setup before opening

- Create at least one worker account at the Staff Desk.
- Enter real rental stock quantities and reorder thresholds under Inventory.
- Publish only real, verified retail products with legally permitted status.
- Confirm the field bank/cash accounts and validate an actual payment workflow.
- Test the worker customer flow using staging data: booking search → check-in → issue → physical return → finalize invoice → paid → PDF share → statistics.
- Keep live cashbook clear of fabricated test payments.

## Database and deployment

The five V25 SQL migrations are stored in the GitHub supabase/migrations folder and have been applied to the connected FIELDZERO Supabase project. This is an additive migration; do not rerun the original schema.sql or reset production operator data.

The GitHub Actions workflow FIELDZERO V25 Release Checks validates JavaScript syntax and source integration. Full authenticated checkout and actual WhatsApp PDF delivery require controlled human testing with a worker account.
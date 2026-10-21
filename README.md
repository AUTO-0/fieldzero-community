# FIELDZERO — Outdoor Gel Blaster Community

A mobile-first static website for an outdoor gel blaster field in Imbulgoda, Sri Lanka. Hosted on GitHub Pages with Supabase for private player applications, approvals, callsign-only public roster, eight-player teams, rankings and event announcements.

## What's included

- `index.html`, `styles.css`, `app.js`: public community website and player registration.
- `admin.html`, `admin.js`: admin login, approve/reject player applications and booking requests, create teams, assign players, edit team/player rankings, publish sessions and tournaments.
- `config.js`: public Supabase project URL + anon/publishable key and WhatsApp links.
- `supabase/schema.sql`: database tables, public-safe views, RLS policies, approval RPCs, private event booking requests and a hard eight-active-player team limit.

## 1. Create Supabase project

1. Create a project at https://supabase.com.
2. Open **SQL Editor** in the Supabase dashboard.
3. Run all of `supabase/schema.sql`.
4. Open **Project Settings → API** (or Connect) and copy the Project URL and the public anon/publishable key. Never copy the `service_role` key into the website.
5. Edit `config.js` and replace `YOUR-PROJECT-REF` and `YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY`.
6. Replace the WhatsApp placeholder URLs with your actual Channel and Group invite links. Remove a link by setting its value to an empty string.

The public anon/publishable key is expected to be visible in browser code. Security relies on the SQL policies, not hiding that key.

## 2. Create your administrator login

1. In Supabase, open **Authentication → Users → Add user** and create an admin account using an email you control and a strong unique password.
2. Copy the user's UUID.
3. In SQL Editor, run the following after replacing the UUID:
   ```sql
   insert into public.admin_users (user_id)
   values ('PASTE-THE-ADMIN-USER-UUID-HERE');
   ```
4. Open `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/admin.html` after deployment and sign in.
5. If you ever need to remove admin access, delete that user's row from `public.admin_users` (and disable/delete the Auth user if appropriate).

Do not place service-role keys, database passwords, or administrator credentials in GitHub.

## 3. Preview locally

Because this site uses browser modules from a CDN, serve it over localhost rather than opening the file directly. In the project folder run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. Admin console is at `/admin.html`.

Without Supabase configured, the public site displays a setup notice and registration is disabled.

## 4. Publish with GitHub Pages

1. Create a GitHub repository, e.g. `fieldzero-community`.
2. Upload all files/folders in this project to the repository root, preserving the `supabase/` folder.
3. In GitHub, open **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
5. Wait for the Pages URL to appear. Open it and test registration and the admin page.
6. Optional: add a custom domain under Pages settings.

GitHub Pages is static hosting. Supabase is the backend.

## 5. Player registration, bookings, teams and rankings

- Approving an application creates an active public player with their callsign only.
- Approve a player application from the admin console; only the callsign is copied to the public roster.
- Create teams, then assign approved players using the admin console. The database rejects a ninth active player and prevents a player being active in two teams simultaneously.
- Teams are drafted privately and become public only when exactly eight active players are assigned. If a player becomes inactive or leaves, the team is automatically removed from the public squad list until all eight active slots are filled again.
- Publish sessions and tournaments from the admin console. Visitors can request a booking from the public site. Requests are private and pending until you approve them. This starter does not take payments or guarantee capacity automatically; confirm availability before approving.
- Edit team ranks/points and player ranks/points from the admin console. Rankings are manual; match results do not automatically calculate standings.

## Privacy and security notes

- The public site never queries or displays `real_name` or `mobile`.
- Public roster and team data are served through views containing callsigns and public team fields only.
- Anonymous visitors can insert a pending application, but cannot select or update applications.
- Admin pages require Supabase Auth and an explicit row in `admin_users`; privileged changes are protected by RLS and a server-side approval function.
- Callsigns are unique case-insensitively across applications.
- Only use the applicant information for the stated purpose, limit admin access, and publish a privacy notice suitable for your local legal requirements.
- A submitted website application does **not** automatically add someone to WhatsApp. Review and approve them, then send the group invite or use your preferred onboarding process.
- This starter has no payment processing, automated WhatsApp messaging, automated capacity enforcement, email/SMS confirmations, or automatic league standings. Booking requests are approval-based and should be confirmed manually.

## Quick test checklist

1. With config blank, verify registration is disabled.
2. Configure Supabase and test one application with a test number.
3. Confirm anonymous users cannot read `player_applications` in the Supabase API.
4. Sign in as the allow-listed admin at `/admin.html`.
5. Approve the test application and verify only the callsign appears on the public roster.
6. Create a team and try assigning eight active players. A ninth should be rejected by the database.
7. Verify mobile layout, WhatsApp links and public events before announcing the site.

## Brand

FIELDZERO is a placeholder brand name chosen for this starter. Confirm name availability and replace it in the HTML before public launch if you choose another brand.

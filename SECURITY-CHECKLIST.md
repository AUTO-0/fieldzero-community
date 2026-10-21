# FIELDZERO launch security checklist

- [ ] Use a new Supabase project for production and run `supabase/schema.sql` once in SQL Editor.
- [ ] Create the admin in Supabase Auth, then insert only that Auth UUID into `public.admin_users`.
- [ ] Put only the project URL and anon/publishable key in `config.js`. Never use `service_role` or a database password in browser code.
- [ ] Replace both WhatsApp placeholders with links you control.
- [ ] Enable email confirmation or a strong password policy for admin accounts; disable public sign-ups if you will create admins manually.
- [ ] Test that anonymous requests to `player_applications` and `event_bookings` cannot SELECT records, and that the public roster view returns callsigns only.
- [ ] Test a new application, approve it, and confirm only its callsign appears publicly.
- [ ] Create a draft team and assign eight approved players. Confirm the team appears publicly only at eight active players; attempt a ninth assignment and confirm it fails.
- [ ] Submit a session and tournament booking request; confirm it appears only in the admin console and remains pending until reviewed.
- [ ] Publish only the intended public events. Confirm bookings manually before telling players a place is guaranteed.
- [ ] Add a privacy notice and review local requirements for collecting phone numbers and operating a gel blaster activity business.

GitHub Pages is static hosting. The Supabase anon/publishable key is intentionally public; security comes from database grants, row-level security and restricted RPCs. Do not commit passwords, service-role keys, database connection strings, or private WhatsApp admin links.

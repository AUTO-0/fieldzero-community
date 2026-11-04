import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { username, password } = await req.json();
    const name = String(username ?? "").trim().toLowerCase();
    const pass = String(password ?? "");
    if (!/^[a-z0-9_-]{3,24}$/.test(name) || pass.length < 8 || pass.length > 72) {
      return json({ error: "Invalid credentials" }, 400);
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: row, error: lookupError } = await admin
      .from("fz_member_login_names").select("user_id").eq("username", name).maybeSingle();
    if (lookupError || !row?.user_id) return json({ error: "Invalid credentials" }, 401);
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(row.user_id);
    const email = userData?.user?.email;
    if (userError || !email) return json({ error: "Invalid credentials" }, 401);
    const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await publicClient.auth.signInWithPassword({ email, password: pass });
    if (error || !data.session) return json({ error: "Invalid credentials" }, 401);
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_in: data.session.expires_in, token_type: data.session.token_type });
  } catch (_err) {
    return json({ error: "Unable to sign in. Please try again." }, 400);
  }
});

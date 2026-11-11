import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status=200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {...cors, "Content-Type":"application/json"},
  });
const normalizeEmail = (value: unknown) => String(value??"").trim().toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length<=200;
const message = (error: unknown) => error instanceof Error ? error.message : "Unexpected server error";

Deno.serve(async (req: Request) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if (req.method!=="POST") return reply({error:"POST required",code:"METHOD_NOT_ALLOWED"},405);
  try {
    const url=Deno.env.get("SUPABASE_URL");
    const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!secret) return reply({error:"Staff account service is not configured. Contact the system owner.",code:"SERVICE_UNAVAILABLE"},503);
    // Service role key NEVER reaches the browser. Every action is additionally owner-authorized.
    const admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
    const authHeader=req.headers.get("authorization")||"";
    const token=authHeader.replace(/^Bearer\s+/i,"").trim();
    if(!token || token===authHeader) return reply({error:"Sign in to your FIELDZERO owner account and try again.",code:"SESSION_MISSING"},401);
    const {data:{user},error:authErr}=await admin.auth.getUser(token);
    if(authErr||!user) return reply({error:"Your owner session has expired. Sign in again.",code:"SESSION_EXPIRED"},401);
    const {data:owner,error:ownerErr}=await admin.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
    if(ownerErr) throw ownerErr;
    if(!owner) return reply({error:"Only a FIELDZERO owner account can create or assign workers.",code:"OWNER_ONLY"},403);
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"");
    if(action==="list"){
      const {data,error}=await admin.from("fz_workers")
        .select("id,user_id,field_id,email,display_name,active,created_at")
        .order("created_at",{ascending:false});
      if(error)throw error;
      return reply({workers:data||[]});
    }
    if(action==="set_active"){
      const id=String(body.id||"");
      const active=body.active===true;
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        return reply({error:"Select a valid worker account.",code:"INVALID_WORKER"},400);
      const {data:worker,error}=await admin.from("fz_workers")
        .update({active}).eq("id",id)
        .select("id,email,display_name,field_id,active").maybeSingle();
      if(error)throw error;
      if(!worker)return reply({error:"Worker not found.",code:"WORKER_NOT_FOUND"},404);
      return reply({worker});
    }
    if(action!=="create"&&action!=="attach_existing")
      return reply({error:"Unknown worker management action.",code:"UNKNOWN_ACTION"},400);

    const email=normalizeEmail(body.email);
    const display_name=String(body.display_name||"").trim();
    const field_id=String(body.field_id||"");
    if(!validEmail(email))return reply({error:"Enter a valid worker email address.",code:"INVALID_EMAIL"},400);
    if(display_name.length<2||display_name.length>80)return reply({error:"Worker name must contain 2–80 characters.",code:"INVALID_NAME"},400);
    const {data:field,error:fieldErr}=await admin.from("arena_fields")
      .select("id").eq("id",field_id).eq("active",true).eq("network_status","active").maybeSingle();
    if(fieldErr)throw fieldErr;
    if(!field)return reply({error:"Choose an active FIELDZERO field.",code:"FIELD_UNAVAILABLE"},400);

    // Avoid accidentally overwriting an existing Operator's login.
    // There is no getUserByEmail in the admin JS SDK; listUsers is owner-only here.
    const findExisting=async ()=>{
      for(let page=1;page<=20;page++){
        const {data,error}=await admin.auth.admin.listUsers({page,perPage:200});
        if(error)throw error;
        const matches=(data?.users||[]).filter(a=>normalizeEmail(a.email)===email);
        if(matches.length)return matches[0];
        if((data?.users||[]).length<200)return null;
      }
      throw Error("Unable to check all existing accounts. Contact FIELDZERO support.");
    };
    const existing=await findExisting();
    if(action==="create"&&existing){
      return reply({
        error:"This email already belongs to a FIELDZERO account. Choose 'Assign existing account' to give it worker access without changing its login or player profile.",
        code:"EMAIL_EXISTS",can_attach:!!existing.email_confirmed_at
      },409);
    }
    if(action==="attach_existing"){
      if(!existing) return reply({
        error:"No account exists for this email. Choose 'Create worker account' instead.",
        code:"EMAIL_NOT_FOUND"
      },404);
      if(!existing.email_confirmed_at) return reply({
        error:"The existing account must verify its email address before it can be assigned as a worker.",
        code:"EMAIL_NOT_VERIFIED"
      },409);
      const {data:isAdmin,error:adminCheckErr}=await admin.from("admin_users")
        .select("user_id").eq("user_id",existing.id).maybeSingle();
      if(adminCheckErr)throw adminCheckErr;
      if(isAdmin)return reply({error:"This is an owner administrator account. No worker assignment is needed.",code:"OWNER_ALREADY"},409);
      const {data:assigned,error:assignedErr}=await admin.from("fz_workers")
        .select("id,field_id,active").eq("user_id",existing.id).maybeSingle();
      if(assignedErr)throw assignedErr;
      if(assigned)return reply({error:"This account is already assigned as a FIELDZERO worker. Use the worker list to enable or disable access.",code:"WORKER_ALREADY_ASSIGNED"},409);
      const {data:worker,error:insertErr}=await admin.from("fz_workers").insert({
        user_id:existing.id,field_id,email,display_name,created_by:user.id
      }).select("id,email,display_name,field_id,active").single();
      if(insertErr)return reply({error:insertErr.message,code:"WORKER_ASSIGN_FAILED"},400);
      return reply({worker,existing_account:true,
        message:"Existing account assigned successfully. The worker should sign in using their own existing password."});
    }

    const password=String(body.password||"");
    if(password.length<12||password.length>72)return reply({
      error:"Use a temporary password of 12–72 characters.",code:"INVALID_PASSWORD"
    },400);
    const {data:created,error:createErr}=await admin.auth.admin.createUser({
      email,password,email_confirm:true,app_metadata:{fieldzero_role:"worker"}
    });
    if(createErr||!created.user){
      const emailExists=(createErr?.code==="email_exists"||/already been registered/i.test(createErr?.message||""));
      return reply({
        error:emailExists
          ? "This email is already registered. Select 'Assign existing account' instead of creating another login."
          : createErr?.message||"Worker sign-in could not be created.",
        code:emailExists?"EMAIL_EXISTS":"ACCOUNT_CREATION_FAILED",
        can_attach:emailExists
      },emailExists?409:400);
    }
    const {data:worker,error:insertErr}=await admin.from("fz_workers")
      .insert({user_id:created.user.id,field_id,email,display_name,created_by:user.id})
      .select("id,email,display_name,field_id,active").single();
    if(insertErr){
      // Only delete the new account created in this transaction, never an existing account.
      const {error:cleanupErr}=await admin.auth.admin.deleteUser(created.user.id);
      if(cleanupErr)console.error("Worker create rollback needs attention:",cleanupErr.code||"cleanup_failed");
      return reply({error:insertErr.message,code:"WORKER_ASSIGN_FAILED"},400);
    }
    return reply({worker,existing_account:false,
      message:"Worker account created. Share the temporary password privately and ask the worker to change it after signing in."});
  }catch(error){
    console.error("FIELDZERO worker-account service error:",message(error));
    return reply({error:"The worker service could not complete this request. Check the function logs or try again.",code:"SERVICE_ERROR"},500);
  }
});

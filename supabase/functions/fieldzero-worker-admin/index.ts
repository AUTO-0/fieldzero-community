
import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async (req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"POST required"},405);
 try {
  const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!secret)return reply({error:"Server credentials unavailable"},503);
  const admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return reply({error:"Sign in as FIELDZERO owner"},401);
  const {data:{user},error:userErr}=await admin.auth.getUser(token);
  if(userErr||!user)return reply({error:"Session invalid"},401);
  const {data:allowed,error:permissionErr}=await admin.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(permissionErr||!allowed)return reply({error:"Only the owner can manage worker accounts"},403);
  const body=await req.json().catch(()=>({}));
  const action=String(body.action||"");
  if(action==="list"){
   const {data,error}=await admin.from("fz_workers").select("id,user_id,field_id,email,display_name,active,created_at").order("created_at",{ascending:false});
   if(error)throw error;
   return reply({workers:data});
  }
  if(action==="create"){
   const email=String(body.email||"").trim().toLowerCase();
   const password=String(body.password||"");
   const name=String(body.display_name||"").trim();
   const fieldId=String(body.field_id||"");
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)return reply({error:"Valid worker email required"},400);
   if(password.length<12||password.length>72)return reply({error:"Temporary password must have 12–72 characters"},400);
   if(name.length<2||name.length>80)return reply({error:"Worker name must have 2–80 characters"},400);
   const {data:field}=await admin.from("arena_fields").select("id").eq("id",fieldId).eq("active",true).maybeSingle();
   if(!field)return reply({error:"Select an active field"},400);
   const {data:created,error:createErr}=await admin.auth.admin.createUser({
    email,password,email_confirm:true,app_metadata:{fieldzero_role:"worker"}
   });
   if(createErr||!created.user)return reply({error:createErr?.message||"Could not create staff login"},400);
   const {data:worker,error:insertErr}=await admin.from("fz_workers")
    .insert({user_id:created.user.id,field_id:fieldId,email,display_name:name,created_by:user.id})
    .select("id,email,display_name,field_id,active").single();
   if(insertErr){await admin.auth.admin.deleteUser(created.user.id);return reply({error:insertErr.message},400);}
   return reply({worker});
  }
  if(action==="set_active"){
   const id=String(body.id||"");
   const active=body.active===true;
   const {data:worker,error}=await admin.from("fz_workers").update({active})
    .eq("id",id).select("id,email,display_name,field_id,active").single();
   if(error)return reply({error:error.message},400);
   return reply({worker});
  }
  return reply({error:"Unknown action"},400);
 } catch(e){return reply({error:e instanceof Error?e.message:"Worker service failure"},500);}
});

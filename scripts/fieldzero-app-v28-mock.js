/* Browser-only fake Supabase client for UI testing; never deployed in the real app. */
window.supabase={createClient(){
 const signed=!!window.__FZ_SIGNED;
 const rows={
  public_arena_fields:[{id:"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",name:"Imbulgoda Field",is_main:true,address:"Imbulgoda",booking_deposit_percent:0}],
  public_session_prices:[{package_key:"quick-skirmish",package_name:"Quick Skirmish",price_amount:1500,min_players:5,max_players:10,duration_minutes:60,venue_resource:"arena",mode_details:"Friendly tactical match",requestable:true,active:true}],
  public_site_settings:{launch_date:"2026-12-10",opening_soon_enabled:true},
  public_teams:[{id:"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",name:"Alpha Squad",points:25,team_rank:1,member_count:3}],
  public_arena_bookings:[]
 };
 function chain(table){
  return {
   select(){return this},eq(){return this},order(){return this},limit(){return this},gte(){return this},lte(){return this},
   maybeSingle(){return Promise.resolve({data:rows[table]||null,error:null});},
   then(resolve,reject){return Promise.resolve({data:rows[table]||[],error:null}).then(resolve,reject);}
  };
 }
 return {
  from:chain,
  rpc(name,args){
   const data={
    fz_member_get_context:{state:"active",operator:{real_name:"Test Operator",mobile:"0771234567",callsign:"TESTER"},account:{display_name:"Test Operator",avatar_url:""},player:{callsign:"TESTER",player_rank:"RECRUIT",player_points:20,matches_played:0,wins:0},team:null},
    fz_member_get_membership:{status:"none"},
    fz_app_my_bookings:[],
    fz_app_create_booking:[{id:"cccccccc-cccc-4ccc-cccc-cccccccccccc",booking_reference:"FZ-BK-TEST-123",status:"approved"}]
   };
   if(name==="fz_app_create_booking")window.__FZ_CREATED_BOOKING=args;
   return Promise.resolve({data:data[name]??null,error:null});
  },
  functions:{invoke(){return Promise.resolve({data:{},error:null});}},
  auth:{
   async getUser(){return {data:{user:signed?{id:"dddddddd-dddd-4ddd-dddd-dddddddddddd",email:"tester@example.test"}:null},error:null};},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},
   async resetPasswordForEmail(){return {error:null}},
   async signOut(){return {error:null}},
   async signUp(){return {data:{user:null,session:null},error:null}}
  },
  storage:{from(){return {upload:async()=>({error:null}),getPublicUrl:()=>({data:{publicUrl:"https://example.test/avatar.webp"}})}}}
 };
}};

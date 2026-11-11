
do $$
declare v_def text;
begin
 select pg_get_functiondef('public.fz_staff_record_payment(uuid,numeric,date,text,uuid,text,text,uuid)'::regprocedure) into v_def;
 if position('b.status=''approved''' in v_def)=0 then raise exception 'Staff payment guard not found'; end if;
 v_def:=replace(v_def,'b.status=''approved''','b.status in (''approved'',''pending_payment'')');
 execute v_def;
end;$$;

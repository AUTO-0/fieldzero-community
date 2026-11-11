
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('fz-shop-images','fz-shop-images',true,5242880,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public=true,file_size_limit=5242880,
 allowed_mime_types=excluded.allowed_mime_types;
create policy fz_shop_images_admin_upload on storage.objects for insert to authenticated
with check (bucket_id='fz-shop-images' and public.is_fieldzero_admin());
create policy fz_shop_images_admin_update on storage.objects for update to authenticated
using (bucket_id='fz-shop-images' and public.is_fieldzero_admin())
with check (bucket_id='fz-shop-images' and public.is_fieldzero_admin());
create policy fz_shop_images_owner_delete on storage.objects for delete to authenticated
using (bucket_id='fz-shop-images' and public.is_fieldzero_admin());

create unique index if not exists bank_history_bank_ymd_unique
on public.bank_history (bank_id, ymd);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bank-history',
  'bank-history',
  true,
  104857600,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists bank_history_public_read on storage.objects;
drop policy if exists bank_history_admin_insert on storage.objects;
drop policy if exists bank_history_admin_update on storage.objects;
drop policy if exists bank_history_admin_delete on storage.objects;

create policy bank_history_public_read
on storage.objects
for select
to public
using (bucket_id = 'bank-history');

create policy bank_history_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'bank-history'
  and public.is_admin()
);

create policy bank_history_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'bank-history'
  and public.is_admin()
)
with check (
  bucket_id = 'bank-history'
  and public.is_admin()
);

create policy bank_history_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'bank-history'
  and public.is_admin()
);

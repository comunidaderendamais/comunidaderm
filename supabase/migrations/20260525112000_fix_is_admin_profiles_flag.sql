create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

update public.profiles
set is_admin = true
where lower(email) in (
  'comunidaderendamais@gmail.com',
  'rmadmin@gmail.com',
  'wilson270043@gmail.com',
  'samiroliver.oliver@gmail.com',
  'telexrn@gmail.com',
  'pauloalberto5000@gmail.com'
);

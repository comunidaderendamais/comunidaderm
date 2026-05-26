update public.banks
set status = upper(status)
where status is not null;

alter table public.banks
alter column status set default 'UPCOMING';

create or replace function public.admin_replace_faq(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  idx int := 0;
  q jsonb;
  a jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  delete from public.faq_items;

  for item in
    select value
    from jsonb_array_elements(coalesce(items, '[]'::jsonb))
  loop
    q := coalesce(item->'q', '{}'::jsonb);
    a := coalesce(item->'a', '{}'::jsonb);

    if coalesce(nullif(trim(q->>'pt'), ''), nullif(trim(q->>'en'), ''), nullif(trim(q->>'es'), ''), nullif(trim(a->>'pt'), ''), nullif(trim(a->>'en'), ''), nullif(trim(a->>'es'), '')) is null then
      continue;
    end if;

    insert into public.faq_items (sort, q, a)
    values (
      idx,
      jsonb_build_object(
        'pt', coalesce(q->>'pt', ''),
        'en', coalesce(q->>'en', ''),
        'es', coalesce(q->>'es', '')
      ),
      jsonb_build_object(
        'pt', coalesce(a->>'pt', ''),
        'en', coalesce(a->>'en', ''),
        'es', coalesce(a->>'es', '')
      )
    );

    idx := idx + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'count', idx
  );
end;
$$;

revoke all on function public.admin_replace_faq(jsonb) from public;
grant execute on function public.admin_replace_faq(jsonb) to authenticated;

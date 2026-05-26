create or replace function public.get_my_dashboard(max_transactions int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  prof jsonb;
  w jsonb;
  tx jsonb;
  prefs jsonb;
  cfg jsonb;
  banks jsonb;
  unread int;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select to_jsonb(p) into prof
  from public.profiles p
  where p.id = uid;

  select to_jsonb(wl) into w
  from public.wallets wl
  where wl.profile_id = uid;

  select coalesce(jsonb_agg(tj), '[]'::jsonb) into tx
  from (
    select jsonb_build_object(
      'id', coalesce(t.external_id, t.id::text),
      'at', coalesce(t.at, t.created_at),
      'kind', t.kind,
      'type', t.type,
      'amount', t.amount_usd,
      'payment', t.payment,
      'status', t.status,
      'meta', t.meta
    ) as tj
    from public.transactions t
    where t.profile_id = uid
    order by coalesce(t.at, t.created_at) desc
    limit greatest(1, least(coalesce(max_transactions, 50), 500))
  ) s;

  insert into public.profile_preferences (profile_id)
  values (uid)
  on conflict (profile_id) do nothing;

  select to_jsonb(pp) into prefs
  from public.profile_preferences pp
  where pp.profile_id = uid;

  cfg := public.get_app_config();

  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into banks
  from (
    select id, name, quota_key, status, limit_usd, filled_pct, profit_month_pct, profit_accumulated_pct
    from public.banks
    order by id asc
  ) b;

  select count(*)::int into unread
  from public.notifications n
  where n.profile_id = uid
    and n.read_at is null;

  return jsonb_build_object(
    'ok', true,
    'profile', coalesce(prof, '{}'::jsonb),
    'wallets', coalesce(w, '{}'::jsonb),
    'transactions', tx,
    'preferences', coalesce(prefs, '{}'::jsonb),
    'config', coalesce(cfg, '{}'::jsonb),
    'banks', banks,
    'notificationsUnread', unread
  );
end;
$$;

create or replace function public.get_my_team_summary(max_depth int default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  depth int;
  level_volumes jsonb := '{}'::jsonb;
  legs jsonb := '[]'::jsonb;
  direct_total numeric := 0;
  indirect_total numeric := 0;
  current_key text := 'FERRO';
  current_title text := 'Ferro';
  current_target numeric := 10;
  next_key text := 'BRONZE';
  next_title text := 'Bronze';
  next_target numeric := 200;
  rank_volume numeric := 0;
  cap numeric := 0;
  apply_cap boolean := false;
  rate_l1 numeric := 0.06;
  rate_other numeric := 0.03;
  residual_by_level jsonb := '{}'::jsonb;
  residual_total numeric := 0;
  te_level1 numeric := 0;
  te_level2 numeric := 0;
  te_level3 numeric := 0;
  lvl1 numeric := 0;
  lvl2 numeric := 0;
  lvl3 numeric := 0;
  lvl4 numeric := 0;
  lvl5 numeric := 0;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  depth := greatest(1, least(coalesce(max_depth, 5), 5));

  with recursive downline as (
    select
      tn.profile_id as id,
      tn.referrer_profile_id as parent_id,
      1 as level,
      tn.profile_id as leg_root
    from public.team_nodes tn
    where tn.referrer_profile_id = uid
    union all
    select
      tn.profile_id as id,
      tn.referrer_profile_id as parent_id,
      d.level + 1 as level,
      d.leg_root as leg_root
    from public.team_nodes tn
    join downline d on d.id = tn.referrer_profile_id
    where d.level < depth
  ),
  purchases as (
    select
      t.profile_id,
      round(sum(abs(coalesce(t.amount_usd, 0)))::numeric, 2) as vol
    from public.transactions t
    where t.kind = 'COMPRA'
      and lower(coalesce(t.status, '')) = 'concluído'
    group by t.profile_id
  ),
  node_vol as (
    select d.level, d.leg_root, d.id,
      coalesce(p.vol, 0) as vol
    from downline d
    left join purchases p on p.profile_id = d.id
  ),
  levels as (
    select level, round(sum(vol)::numeric, 2) as total
    from node_vol
    group by level
  ),
  legs_agg as (
    select
      nv.leg_root as leg_root,
      round(sum(case when nv.level = 1 then nv.vol else 0 end)::numeric, 2) as l1,
      round(sum(case when nv.level >= 2 then nv.vol else 0 end)::numeric, 2) as other
    from node_vol nv
    group by nv.leg_root
  ),
  legs_named as (
    select
      la.leg_root,
      coalesce(pr.username, pr.email, la.leg_root::text) as username,
      la.l1,
      la.other,
      round((la.l1 + la.other * 0.5)::numeric, 2) as weighted
    from legs_agg la
    left join public.profiles pr on pr.id = la.leg_root
  )
  select
    (select coalesce(jsonb_object_agg(level::text, total), '{}'::jsonb) from levels),
    (select coalesce(jsonb_agg(jsonb_build_object('id', leg_root::text, 'username', username, 'l1', l1, 'other', other, 'weighted', weighted) order by username asc), '[]'::jsonb) from legs_named),
    (select round(coalesce(sum(l1),0)::numeric,2) from legs_named),
    (select round(coalesce(sum(other),0)::numeric,2) from legs_named),
    (select round(coalesce(sum(case when level=1 then total else 0 end),0)::numeric,2) from levels),
    (select round(coalesce(sum(case when level=2 then total else 0 end),0)::numeric,2) from levels),
    (select round(coalesce(sum(case when level=3 then total else 0 end),0)::numeric,2) from levels),
    (select round(coalesce(sum(case when level=4 then total else 0 end),0)::numeric,2) from levels),
    (select round(coalesce(sum(case when level=5 then total else 0 end),0)::numeric,2) from levels)
  into level_volumes, legs, direct_total, indirect_total, lvl1, lvl2, lvl3, lvl4, lvl5;

  for current_key, current_title, current_target, next_key, next_title, next_target in
    select * from (values
      ('FERRO','Ferro',10::numeric,'BRONZE','Bronze',200::numeric),
      ('BRONZE','Bronze',200::numeric,'SILVER','Silver',2000::numeric),
      ('SILVER','Silver',2000::numeric,'OURO','Ouro',5000::numeric),
      ('OURO','Ouro',5000::numeric,'DIAMOND','Diamond',15000::numeric),
      ('DIAMOND','Diamond',15000::numeric,'RM','Diamond RM',50000::numeric),
      ('RM','Diamond RM',50000::numeric,null,null,null)
    ) as r(key, title, target, next_key, next_title, next_target)
  loop
    cap := coalesce(current_target, 0) * 0.5;
    apply_cap := coalesce(current_target, 0) >= 200;

    select round(coalesce(sum(
      case
        when apply_cap then least(coalesce((leg->>'weighted')::numeric, 0), cap)
        else coalesce((leg->>'weighted')::numeric, 0)
      end
    ),0)::numeric,2)
    into rank_volume
    from jsonb_array_elements(coalesce(legs, '[]'::jsonb)) leg;

    if rank_volume >= current_target then
      continue;
    end if;

    exit;
  end loop;

  if rank_volume >= 50000 then
    current_key := 'RM'; current_title := 'Diamond RM'; current_target := 50000;
    next_key := null; next_title := null; next_target := null;
  elsif rank_volume >= 15000 then
    current_key := 'DIAMOND'; current_title := 'Diamond'; current_target := 15000;
    next_key := 'RM'; next_title := 'Diamond RM'; next_target := 50000;
  elsif rank_volume >= 5000 then
    current_key := 'OURO'; current_title := 'Ouro'; current_target := 5000;
    next_key := 'DIAMOND'; next_title := 'Diamond'; next_target := 15000;
  elsif rank_volume >= 2000 then
    current_key := 'SILVER'; current_title := 'Silver'; current_target := 2000;
    next_key := 'OURO'; next_title := 'Ouro'; next_target := 5000;
  elsif rank_volume >= 200 then
    current_key := 'BRONZE'; current_title := 'Bronze'; current_target := 200;
    next_key := 'SILVER'; next_title := 'Silver'; next_target := 2000;
  else
    current_key := 'FERRO'; current_title := 'Ferro'; current_target := 10;
    next_key := 'BRONZE'; next_title := 'Bronze'; next_target := 200;
  end if;

  if current_key = 'BRONZE' then
    rate_l1 := 0.08; rate_other := 0.04;
  elsif current_key = 'SILVER' then
    rate_l1 := 0.10; rate_other := 0.05;
  elsif current_key = 'OURO' then
    rate_l1 := 0.15; rate_other := 0.075;
  elsif current_key = 'DIAMOND' then
    rate_l1 := 0.20; rate_other := 0.10;
  elsif current_key = 'RM' then
    rate_l1 := 0.25; rate_other := 0.125;
  else
    rate_l1 := 0.06; rate_other := 0.03;
  end if;

  residual_by_level := jsonb_build_object(
    '1', round((lvl1 * rate_l1)::numeric, 2),
    '2', round((lvl2 * rate_other)::numeric, 2),
    '3', round((lvl3 * rate_other)::numeric, 2),
    '4', round((lvl4 * rate_other)::numeric, 2),
    '5', round((lvl5 * rate_other)::numeric, 2)
  );
  residual_total :=
    round(
      (coalesce((residual_by_level->>'1')::numeric,0) +
       coalesce((residual_by_level->>'2')::numeric,0) +
       coalesce((residual_by_level->>'3')::numeric,0) +
       coalesce((residual_by_level->>'4')::numeric,0) +
       coalesce((residual_by_level->>'5')::numeric,0))::numeric, 2
    );

  te_level1 := round((lvl1 * 0.1 * 0.4)::numeric, 2);
  te_level2 := round((lvl2 * 0.1 * 0.2)::numeric, 2);
  te_level3 := round((lvl3 * 0.1 * 0.1)::numeric, 2);

  return jsonb_build_object(
    'ok', true,
    'depth', depth,
    'levels', level_volumes,
    'legs', legs,
    'directVolume', direct_total,
    'indirectVolume', indirect_total,
    'rank', jsonb_build_object(
      'key', current_key,
      'title', current_title,
      'target', current_target,
      'volume', rank_volume,
      'next', case when next_key is null then null else jsonb_build_object('key', next_key, 'title', next_title, 'target', next_target) end
    ),
    'residual', jsonb_build_object(
      'rates', jsonb_build_object('1', rate_l1, 'other', rate_other),
      'byLevel', residual_by_level,
      'total', residual_total
    ),
    'entryFee', jsonb_build_object(
      'level1', te_level1,
      'level2', te_level2,
      'level3', te_level3
    )
  );
end;
$$;

revoke all on function public.get_my_dashboard(int) from public;
revoke all on function public.get_my_team_summary(int) from public;
grant execute on function public.get_my_dashboard(int) to authenticated;
grant execute on function public.get_my_team_summary(int) to authenticated;

update public.app_config
set config =
  coalesce(config, '{}'::jsonb) ||
  jsonb_build_object(
    'cycle',
    coalesce(config->'cycle', jsonb_build_object('months', 6, 'renewWindowHours', 72, 'entryFeePct', 0.1))
  )
where id = 1;

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'daily-payouts-18h-br'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'daily-payouts-18h-br',
    '0 21 * * *',
    $job$select public.process_daily_payouts(now());$job$
  );
end;
$$;

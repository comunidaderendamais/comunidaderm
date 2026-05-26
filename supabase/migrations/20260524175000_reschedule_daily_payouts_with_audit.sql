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
    $job$
    select public.run_daily_payouts_with_audit(
      now(),
      'CRON',
      null,
      null,
      jsonb_build_object('scheduler', 'pg_cron', 'jobName', 'daily-payouts-18h-br')
    );
    $job$
  );
end;
$$;


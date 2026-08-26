-- Durable freshness ledger for Tank's short connecting/preview clips.
--
-- The media worker writes versioned objects first and only then advances this
-- row. That makes publication atomic from a viewer's perspective: Tank either
-- advertises the previous validated clip or the new validated clip, never a
-- partially-uploaded replacement.
create table if not exists public.tank_camera_clips (
  camera_id text primary key,
  storage_path text,
  captured_at timestamptz,
  source_stable_at timestamptz,
  duration_seconds integer,
  size_bytes bigint,
  generation bigint not null default 0,
  last_attempt_at timestamptz not null default now(),
  last_attempt_status text not null default 'pending',
  last_error_code text,
  updated_at timestamptz not null default now(),
  constraint tank_camera_clips_camera_id_format
    check (camera_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'),
  constraint tank_camera_clips_storage_path_scope
    check (
      storage_path is null
      or storage_path ~ '^cameras/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}/[0-9]+[.]mp4$'
    ),
  constraint tank_camera_clips_duration_range
    check (duration_seconds is null or duration_seconds between 1 and 300),
  constraint tank_camera_clips_size_positive
    check (size_bytes is null or size_bytes > 0),
  constraint tank_camera_clips_attempt_status
    check (last_attempt_status in ('pending', 'capturing', 'ready', 'failed', 'skipped_unstable'))
);

create index if not exists tank_camera_clips_captured_at_idx
  on public.tank_camera_clips (captured_at desc)
  where captured_at is not null;

alter table public.tank_camera_clips enable row level security;

-- This table is deliberately not a public Data API. Viewers receive only the
-- safe URL/freshness projection from /api/tank/cameras; the service-role media
-- worker and Tank server are the only writers/readers here.
revoke all on table public.tank_camera_clips from anon, authenticated;
grant all on table public.tank_camera_clips to service_role;

comment on table public.tank_camera_clips is
  'Server-only freshness ledger for validated, versioned Tank preroll clips.';

-- The database restore left pg_cron's sequence behind its retained run
-- history. Advance it without deleting history so every scheduled job can run
-- again. setval(..., true) makes the next generated id max(runid) + 1.
select setval(
  'cron.runid_seq',
  greatest(
    (select coalesce(max(runid), 0) from cron.job_run_details),
    (select last_value from cron.runid_seq)
  ),
  true
);

-- The old job held one HTTP request open while recording every camera in
-- series. MediaMTX now owns per-path concurrent workers, so unschedule it via
-- pg_cron's supported function instead of mutating cron.job directly.
select cron.unschedule(jobid)
from cron.job
where jobname = 'tank-loop-refresh-every-20min';

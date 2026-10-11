-- jordan-planner schema for jordanleis.com/to-do and /schedule.
-- Safe to re-run. Holds structure only; no data lives in the repo.
--
-- Access model: only Google accounts listed in allowed_users may read or write
-- through the public API (RLS). The GitHub Actions sync uses the service-role key, which
-- bypasses RLS, to write calendar mirrors and email results.

-- ---------- membership ----------
-- Who may sign in. Rows are added by SQL only (no API policies), so emails never
-- live in this public repo:  insert into public.allowed_users (email) values ('...');
create table if not exists public.allowed_users (
  email    text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.allowed_users enable row level security;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google'
     and exists (select 1 from public.allowed_users where email = lower(auth.jwt() ->> 'email'))
$$;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- tasks ----------
create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  status         text not null default 'todo' check (status in ('backlog', 'todo', 'in_progress', 'done')),
  recap          text not null default '',
  due_at         timestamptz,
  due_has_time   boolean not null default false,
  tags           text[] not null default '{}',
  sort_order     double precision not null default 0,
  proof_required boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index if not exists tasks_status_idx on public.tasks (status, due_at);
drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create table if not exists public.subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists subtasks_task_idx on public.subtasks (task_id);

-- Timestamped work log: "what I just did", the record of when things happened.
create table if not exists public.task_log (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists task_log_task_idx on public.task_log (task_id, created_at);

-- Proof: a photo in the private "proofs" bucket (storage_path) or a link (url).
create table if not exists public.task_proofs (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  kind         text not null check (kind in ('photo', 'link')),
  url          text,
  storage_path text,
  label        text not null default '',
  created_at   timestamptz not null default now(),
  check ((kind = 'photo' and storage_path is not null) or (kind = 'link' and url is not null))
);
create index if not exists task_proofs_task_idx on public.task_proofs (task_id);

-- A commitment of a task to a Work block. Outcome is set when the block ends.
create table if not exists public.placements (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  block_key  text not null,
  placed_at  timestamptz not null default now(),
  outcome    text not null default 'planned' check (outcome in ('planned', 'done', 'missed', 'moved')),
  resolved_at timestamptz
);
create index if not exists placements_task_idx on public.placements (task_id);
create index if not exists placements_block_idx on public.placements (block_key);
create unique index if not exists placements_one_planned
  on public.placements (task_id, block_key) where outcome = 'planned';

-- ---------- calendar mirror (written by the sync job) ----------
create table if not exists public.blocks (
  key           text primary key,             -- e.g. 2026-10-19:work:2
  date          date not null,
  kind          text not null check (kind in ('work', 'self', 'lunch', 'dinner')),
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  gcal_event_id text,
  active        boolean not null default true,
  updated_at    timestamptz not null default now()
);
create index if not exists blocks_date_idx on public.blocks (date);

create table if not exists public.calendar_events (
  id            text primary key,             -- stable hash of source + identity
  source        text not null,                -- portal | outlook | google
  title         text not null default '',
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  location      text not null default '',
  auto_added    boolean not null default false,
  gcal_event_id text,
  updated_at    timestamptz not null default now()
);
create index if not exists calendar_events_start_idx on public.calendar_events (start_at);
-- Ignored events (e.g. classes the feed still lists during reading week) stay in the
-- mirror for transparency but don't count as busy and are hidden in the planner.
alter table public.calendar_events add column if not exists ignored boolean not null default false;
alter table public.calendar_events add column if not exists ignore_reason text;

-- ---------- email detection (written by the sync job) ----------
create table if not exists public.email_scans (
  gmail_message_id text primary key,
  processed_at     timestamptz not null default now(),
  stage            text not null check (stage in ('ics', 'template', 'review', 'ignored')),
  gcal_event_id    text
);

create table if not exists public.review_items (
  id               uuid primary key default gen_random_uuid(),
  gmail_message_id text unique not null,
  subject          text not null default '',
  sender           text not null default '',
  received_at      timestamptz,
  candidates       jsonb not null default '[]',
  status           text not null default 'open' check (status in ('open', 'accepted', 'dismissed', 'added')),
  chosen_start     timestamptz,
  chosen_end       timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.sync_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- row level security ----------
alter table public.tasks           enable row level security;
alter table public.subtasks        enable row level security;
alter table public.task_log        enable row level security;
alter table public.task_proofs     enable row level security;
alter table public.placements      enable row level security;
alter table public.blocks          enable row level security;
alter table public.calendar_events enable row level security;
alter table public.email_scans     enable row level security;
alter table public.review_items    enable row level security;
alter table public.sync_state      enable row level security;

do $$
declare t text;
begin
  -- Members have full access to task data.
  foreach t in array array['tasks', 'subtasks', 'task_log', 'task_proofs', 'placements'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy owner_all on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;
  -- Calendar mirrors are read-only from the browser.
  foreach t in array array['blocks', 'calendar_events', 'email_scans'] loop
    execute format('drop policy if exists owner_read on public.%I', t);
    execute format('create policy owner_read on public.%I for select to authenticated using (public.is_member())', t);
  end loop;
end $$;

-- Review items: read, and accept/dismiss from the browser.
drop policy if exists owner_read on public.review_items;
create policy owner_read on public.review_items for select to authenticated using (public.is_member());
drop policy if exists owner_update on public.review_items;
create policy owner_update on public.review_items for update to authenticated
  using (public.is_member()) with check (public.is_member());
-- sync_state: no policies, so only the service role can touch it.

-- ---------- storage: private proof photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists proofs_owner_all on storage.objects;
create policy proofs_owner_all on storage.objects for all to authenticated
  using (bucket_id = 'proofs' and public.is_member())
  with check (bucket_id = 'proofs' and public.is_member());

-- Replaced by is_member(); policies above no longer reference it.
drop function if exists public.is_owner();

-- ---------- projects: a task made of parts (one level deep) ----------
alter table public.tasks add column if not exists parent_id uuid references public.tasks (id) on delete cascade;
create index if not exists tasks_parent_idx on public.tasks (parent_id);

-- ---------- event overrides: ignore an event only with approval ----------
-- The sync job may *suggest* ignores (e.g. classes the feed lists during reading
-- week); only rows with status 'approved' stop an event counting as busy. Nothing
-- is ever deleted from a source calendar.
create table if not exists public.event_overrides (
  event_key   text primary key,               -- mirror id: hash of source + title + start + end
  source      text not null,
  title       text not null default '',
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  reason      text not null default '',
  status      text not null default 'suggested' check (status in ('suggested', 'approved', 'dismissed')),
  decided_by  text,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists event_overrides_status_idx on public.event_overrides (status, start_at);
alter table public.event_overrides enable row level security;
drop policy if exists member_all on public.event_overrides;
create policy member_all on public.event_overrides for all to authenticated
  using (public.is_member()) with check (public.is_member());

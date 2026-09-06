-- 0007: Activity logging + bug reports
--
-- activity_logs: append-only record of what happens in the app (navigation,
--   user actions, JS errors, failed fetches) so issues can be reproduced and
--   analyzed afterwards.
-- bug_reports: submissions from the in-app "Report a bug" button, each carrying
--   the user's message plus a snapshot of recent activity as context.

create table if not exists activity_logs (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  who        text,                    -- 'dimitri' | 'theresa' | null (not authed)
  path       text,                    -- e.g. '/memories'
  action     text not null,           -- 'page_view' | 'rsvp' | 'error' | 'bug' | ...
  detail     jsonb,                   -- extra structured info
  user_agent text
);

create index if not exists activity_logs_created_idx on activity_logs (created_at desc);
create index if not exists activity_logs_action_idx  on activity_logs (action);
create index if not exists activity_logs_who_idx     on activity_logs (who);

create table if not exists bug_reports (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  who        text,
  path       text,
  message    text not null,
  context    jsonb,                   -- recent activity snapshot attached by the reporter
  status     text not null default 'open'
              check (status in ('open', 'acknowledged', 'closed'))
);

create index if not exists bug_reports_created_idx on bug_reports (created_at desc);
create index if not exists bug_reports_status_idx   on bug_reports (status);

alter table activity_logs enable row level security;
alter table bug_reports   enable row level security;

create policy "Anyone can read activity_logs"   on activity_logs for select using (true);
create policy "Anyone can insert activity_logs" on activity_logs for insert with check (true);
create policy "Anyone can read bug_reports"     on bug_reports for select using (true);
create policy "Anyone can insert bug_reports"   on bug_reports for insert with check (true);
create policy "Anyone can update bug_reports"   on bug_reports for update using (true);

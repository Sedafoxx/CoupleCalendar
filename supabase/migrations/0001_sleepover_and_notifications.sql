-- Run in Supabase SQL editor.

-- 1. Allow the new 'sleepover' event type.
-- (events.type is a text column with a CHECK constraint in this project.)
alter table events drop constraint if exists events_type_check;
alter table events
  add constraint events_type_check
  check (type in ('single', 'window', 'recurring', 'bucket_list', 'sleepover'));

-- 2. Notifications for Dimitri — written whenever Theresa books/confirms anything.
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  kind       text not null default 'event'
             check (kind in ('event', 'sleepover', 'bucket_list')),
  event_id   uuid references events(id) on delete set null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_unread_idx
  on notifications (read, created_at desc);

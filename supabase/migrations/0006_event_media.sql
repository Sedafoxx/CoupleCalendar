-- 0006: Event media gallery (replaces the BeReal-style dual-camera "memories"
--       model with a flexible per-event gallery of photos / videos / youtube /
--       notes). Each row = ONE media item under an event; an event may have many.

-- 1. New table -----------------------------------------------------------------
create table if not exists event_media (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  kind         text not null default 'photo'
               check (kind in ('photo', 'video', 'youtube', 'note')),
  url          text,              -- storage URL for photo/video
  youtube_url  text,              -- watch URL for kind = 'youtube'
  caption      text,
  added_by     text not null default 'dimitri'
               check (added_by in ('dimitri', 'theresa')),
  created_at   timestamptz not null default now()
);

create index if not exists event_media_event_idx on event_media (event_id, created_at);
create index if not exists event_media_kind_idx  on event_media (kind);

-- Enable RLS (server uses the service-role client, which bypasses RLS, but keep
-- parity with the other tables so future anon/authed access is possible).
alter table event_media enable row level security;

drop policy if exists "Anyone can read event_media" on event_media;
create policy "Anyone can read event_media"
  on event_media for select
  using (true);

drop policy if exists "Authenticated users can insert event_media" on event_media;
create policy "Authenticated users can insert event_media"
  on event_media for insert
  with check (true);

drop policy if exists "Authenticated users can delete event_media" on event_media;
create policy "Authenticated users can delete event_media"
  on event_media for delete
  using (true);

drop policy if exists "Authenticated users can update event_media" on event_media;
create policy "Authenticated users can update event_media"
  on event_media for update
  using (true);

-- 2. Migrate existing memories into event_media --------------------------------
-- Placeholder "💕 Beide zu" rows (system placeholder gifs) are auto-generated and
-- no longer needed — the feed is event-driven now. Delete them.
delete from memories
where photo_back like '%/placeholder-%'
   or photo_back like '%placeholder-%';

-- Note memories (1x1 transparent gif + real caption text) -> kind 'note'
insert into event_media (event_id, kind, caption, added_by, created_at)
select event_id, 'note', caption, captured_by, created_at
from memories
where photo_back like '%note.gif%'
  and caption is not null and caption <> '';

-- Real photo memories (front/back pair) -> two kind 'photo' items.
-- Back = main scene, front = selfie.
insert into event_media (event_id, kind, url, caption, added_by, created_at)
select event_id, 'photo', photo_back, caption, captured_by, created_at
from memories
where photo_back not like '%note.gif%'
  and photo_back is not null;

insert into event_media (event_id, kind, url, caption, added_by, created_at)
select event_id, 'photo', photo_front, caption, captured_by, created_at
from memories
where photo_front not like '%note.gif%'
  and photo_front is not null;

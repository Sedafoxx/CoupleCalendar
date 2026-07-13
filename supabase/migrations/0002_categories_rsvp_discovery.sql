-- Run in Supabase SQL editor.
-- Adds: event categories (personal vs city suggestions), proposal status,
-- per-person RSVP, discovery-ingest provenance, and an archive flag.

-- 1. category: 'personal' = Dimi/Theresa's real plans; 'city' = imported Vienna suggestions.
alter table events add column if not exists category text not null default 'personal';
alter table events drop constraint if exists events_category_check;
alter table events add constraint events_category_check
  check (category in ('personal', 'city'));

-- 2. status: 'confirmed' = a real plan; 'proposed' = someone suggested it, awaiting the other.
alter table events add column if not exists status text not null default 'confirmed';
alter table events drop constraint if exists events_status_check;
alter table events add constraint events_status_check
  check (status in ('confirmed', 'proposed'));

-- 3. Per-person RSVP. null = hasn't responded.
alter table events add column if not exists rsvp_dimitri text;
alter table events add column if not exists rsvp_theresa text;
alter table events drop constraint if exists events_rsvp_dimitri_check;
alter table events drop constraint if exists events_rsvp_theresa_check;
alter table events add constraint events_rsvp_dimitri_check
  check (rsvp_dimitri is null or rsvp_dimitri in ('going', 'interested', 'maybe'));
alter table events add constraint events_rsvp_theresa_check
  check (rsvp_theresa is null or rsvp_theresa in ('going', 'interested', 'maybe'));

-- 4. Discovery-ingest provenance + display.
alter table events add column if not exists source     text;   -- 'gogogo' | 'yesticket' | 'ra' | 'manual'
alter table events add column if not exists source_id  text;   -- stable per-source id for dedup
alter table events add column if not exists image_url  text;
alter table events add column if not exists url        text;   -- ticket / info link
alter table events add column if not exists tags       text[]; -- reuse-friendly category tags

-- 5. Archive flag — cleanup job flips past events instead of hard-deleting.
alter table events add column if not exists archived boolean not null default false;

-- Dedup: never insert the same source event twice.
create unique index if not exists events_source_id_uidx
  on events (source_id) where source_id is not null;

create index if not exists events_category_date_idx on events (category, date);
create index if not exists events_archived_idx on events (archived, date);

-- 6. Allow proposal notifications.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('event', 'sleepover', 'bucket_list', 'proposal', 'rsvp'));

-- 7. Backfill existing rows -------------------------------------------------
-- Reclassify the imported Vienna listings (ViennaImprov shows + Kino am Dach
-- films) as browsable city suggestions, not committed plans.
update events set category = 'city', joinable = false, source = 'yesticket', added_by = 'discovery'
  where title like 'ViennaImprov:%';
update events set category = 'city', joinable = false, source = 'gogogo', added_by = 'discovery'
  where location = 'Kino am Dach';

-- Everything else is a real personal plan Dimi is going to.
update events set rsvp_dimitri = 'going'
  where category = 'personal' and rsvp_dimitri is null and type <> 'bucket_list';
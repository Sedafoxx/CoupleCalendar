-- Memories: photo captures attached to events (BeReal-style dual camera)

-- 1. Create the memories table (idempotent)
create table if not exists memories (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  captured_by  text not null default 'dimitri'
               check (captured_by in ('dimitri', 'theresa')),
  photo_front  text not null,   -- Supabase Storage URL (selfie camera / front)
  photo_back   text not null,   -- Supabase Storage URL (main camera / back)
  caption      text,
  created_at   timestamptz not null default now()
);

create index if not exists memories_event_id_idx on memories (event_id);
create index if not exists memories_created_at_idx on memories (created_at desc);

-- 2. Enable Row-Level Security on the memories table
alter table memories enable row level security;

-- Everyone authenticated can read memories
drop policy if exists "Anyone can read memories" on memories;
create policy "Anyone can read memories"
  on memories for select
  using (true);

-- Authenticated users (both Dimi and Theresa) can insert
drop policy if exists "Authenticated users can insert memories" on memories;
create policy "Authenticated users can insert memories"
  on memories for insert
  with check (true);

-- Owners can delete their own memories
drop policy if exists "Users can delete their own memories" on memories;
create policy "Users can delete their own memories"
  on memories for delete
  using (captured_by = current_setting('app.who', true)::text);

-- 3. Create the storage bucket for memory photos (idempotent)
insert into storage.buckets (id, name, public)
values ('memory-photos', 'memory-photos', true)
on conflict (id) do nothing;

-- Allow public reads of memory photos
drop policy if exists "Public read memory photos" on storage.objects;
create policy "Public read memory photos"
  on storage.objects for select
  using (bucket_id = 'memory-photos');

-- Allow authenticated uploads to memory-photos
drop policy if exists "Authenticated upload to memory-photos" on storage.objects;
create policy "Authenticated upload to memory-photos"
  on storage.objects for insert
  with check (bucket_id = 'memory-photos');

-- Known source links the chat assistant can fetch for availability info.
-- E.g. Improtheater show dates at viennaimprov.org

-- 1. Create the known_links table (idempotent)
create table if not exists known_links (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  url        text not null,
  purpose    text,
  keywords   text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- 2. Enable Row-Level Security
alter table known_links enable row level security;

-- Anyone can read (only public URLs stored here)
drop policy if exists "Anyone can read known_links" on known_links;
create policy "Anyone can read known_links"
  on known_links for select
  using (true);

-- Inserts only via service role (chat API) — no anon insert policy.

-- 3. Seed: Improtheater Vienna show list (checked by the assistant on request)
insert into known_links (title, url, purpose, keywords)
values (
  'Improtheater Vienna Shows',
  'https://viennaimprov.org/vi-event-liste/',
  'Find upcoming improv theatre show dates in Vienna',
  array['impro', 'improtheater', 'improv', 'improvisation']
)
on conflict do nothing;

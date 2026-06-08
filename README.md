# CoupleCalendar

Tool for planning dates together. Dimitri adds events, partner books herself into his free time.

## Concept

Events have fixed public windows (e.g. vintage store: 2pm–8pm). Dimitri may only be free for part of that window (e.g. 7pm–8pm). App computes the intersection and lets partner book within it → auto-creates Google Calendar event.

## User Flow

1. **Dimitri** logs in via Google OAuth, connects Google Calendar
2. **Dimitri** adds events: title + location + date + time window
3. **Dimitri** shares `/plan` link with partner
4. **Partner** opens `/plan` (no login needed)
5. **Partner** sees events where Dimitri has free time overlap, with the available window shown
6. **Partner** picks an event, selects a time within the available window, submits
7. **Google Calendar event created instantly** on Dimitri's calendar

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Auth | NextAuth.js v4 — Google OAuth (Dimitri only) |
| Database | Supabase — stores events + Google tokens |
| Calendar | Google Calendar API — read free/busy, write events |
| Deploy | Vercel (pending) |

## Pages

- `/` — Dimitri's dashboard: connect Google Cal, manage events (CRUD)
- `/plan` — Partner's view: events with available time windows, booking form

## Data Model

### `events` table (Supabase) ✅ done
```
id          uuid PK default gen_random_uuid()
title       text not null
location    text not null
date        date not null
start_time  time not null
end_time    time not null
created_at  timestamptz default now()
```

### `google_tokens` table (Supabase) — CREATE THIS NEXT SESSION
```sql
create table google_tokens (
  id integer primary key default 1,
  access_token text,
  refresh_token text,
  expires_at bigint,
  constraint single_row check (id = 1)
);
insert into google_tokens (id) values (1);
```
Populated automatically when Dimitri logs in. Used for partner booking (no session needed).

## Key Decisions

- No partner account/login — share link is enough
- No approval step — partner's booking goes straight to Google Cal
- No notifications — Dimitri checks his own calendar
- No DB for calendar data — Google Cal is source of truth
- Events are independent of Dimitri's availability; app shows intersection at render time
- `proxy.ts` (not `middleware.ts`) — Next.js 16 renamed middleware to proxy

## Dev Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in all values (already done locally).

## Progress

- [x] Google Cloud project + OAuth credentials (Calendar API scopes)
- [x] Supabase project (`flsgxwhozgdeekgplkep.supabase.co`) + `events` table
- [x] `.env.local` configured
- [x] NextAuth Google OAuth — working locally
- [x] Dashboard `/` — event CRUD working
- [x] `/plan` partner view — UI built
- [ ] `google_tokens` table in Supabase — **DO THIS FIRST next session**
- [ ] End-to-end test: add event → open /plan → book slot → verify Google Cal
- [ ] Vercel deploy
- [ ] Add production URL to Google Cloud OAuth redirect URIs
- [ ] Set `NEXTAUTH_URL` to production URL in Vercel env vars

## Vercel Deploy (next session)

```bash
npx vercel        # first deploy / login
npx vercel --prod # production
```

After deploy:
1. Copy all `.env.local` vars to Vercel project settings → Environment Variables
2. Google Cloud Console → OAuth credentials → add `https://<vercel-url>/api/auth/callback/google` to Authorized redirect URIs

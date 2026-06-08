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
| Framework | Next.js (App Router) |
| Auth | NextAuth.js — Google OAuth (Dimitri only) |
| Database | Supabase — stores events |
| Calendar | Google Calendar API — read free/busy, write events |
| Deploy | Vercel |

## Pages

- `/` — Dimitri's dashboard: connect Google Cal, manage events (CRUD)
- `/plan` — Partner's view: events with available time windows, booking form

## Data Model

### `events` table (Supabase)
```
id          uuid PK
title       text
location    text
date        date
start_time  time
end_time    time
created_at  timestamptz
```

## Key Decisions

- No partner account/login — share link is enough
- No approval step — partner's booking goes straight to Google Cal
- No notifications — Dimitri checks his own calendar
- No DB for calendar data — Google Cal is source of truth
- Events are independent of Dimitri's availability; app shows intersection at render time

## Setup (TODO)

- [ ] `npx create-next-app` scaffold
- [ ] NextAuth + Google provider
- [ ] Supabase project + `events` table
- [ ] Google Calendar API: free/busy read + event write
- [ ] `/` dashboard with event CRUD
- [ ] `/plan` partner view with intersection logic
- [ ] Vercel deploy + env vars

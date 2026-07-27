# Graph Report - CoupleCalendar  (2026-07-27)

## Corpus Check
- 49 files · ~18,897 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 245 nodes · 367 edges · 21 communities (14 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9bdd4ef9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `supabase` - 16 edges
2. `compilerOptions` - 16 edges
3. `POST()` - 15 edges
4. `Event` - 12 edges
5. `Memory` - 10 edges
6. `getCalendarClient()` - 10 edges
7. `CoupleCalendar` - 10 edges
8. `getFreeBusySlots()` - 9 edges
9. `authOptions` - 8 edges
10. `isTheresaAuthed()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `getFreeBusySlots()`  [INFERRED]
  src/app/api/theresa/chat/route.ts → src/lib/freebusy.ts
- `POST()` --calls--> `getCalendarClient()`  [INFERRED]
  src/app/api/theresa/chat/route.ts → src/lib/google-auth.ts
- `POST()` --calls--> `isTheresaAuthed()`  [INFERRED]
  src/app/api/theresa/chat/route.ts → src/lib/theresa-auth.ts
- `GET()` --calls--> `getFreeBusySlots()`  [EXTRACTED]
  src/app/api/freebusy/route.ts → src/lib/freebusy.ts
- `DualCameraProps` --references--> `Memory`  [EXTRACTED]
  src/components/DualCamera.tsx → src/lib/supabase.ts

## Import Cycles
- None detected.

## Communities (21 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (17): CalendarProps, MONTHS, WEEKDAYS, CaptureState, DualCameraProps, EventDetail(), EventDetailProps, fmtDate() (+9 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (26): dependencies, @auth/supabase-adapter, googleapis, next, next-auth, openai, react, react-dom (+18 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (17): POST(), utcToVienna(), GET(), BusyBlock, computeFreeSlots(), DateSlots, FreeSlot, getFreeBusySlots() (+9 more)

### Community 3 - "Community 3"
Cohesion: 0.16
Nodes (13): DELETE(), RouteParams, Who, whoIs(), authOptions, isTheresaAuthed(), GET(), POST() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.21
Nodes (14): authorized(), GET(), decode(), IngestResult, MONTHS, openai, pad(), plusHours() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.30
Nodes (14): fmtDay(), fmtEvents(), fmtSlots(), googleHasMatch(), hhmmss(), nightsBetween(), PlannedEvent, reconcileTheresaEvents() (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (12): Concept, CoupleCalendar, Data Model, Dev Setup, `events` table (Supabase) ✅ done, `google_tokens` table (Supabase) — CREATE THIS NEXT SESSION, Key Decisions, Pages (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (8): DateSlots, DEFAULTS, eventOverlapsSlot(), fmtDate(), FreeSlot, HEARTS, PlanPage(), toViennaHHMM()

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (14): authorized(), GET(), GET(), Ctx, viennaToday(), BucketListItem, EventCategory, EventStatus (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.28
Nodes (5): geist, metadata, Providers(), BottomNav(), NAV_ITEMS

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (6): __dirname, env, envContent, envPath, migrationPath, sql

## Knowledge Gaps
- **97 isolated node(s):** `BusyBlock`, `FreeSlot`, `DateSlots`, `__dirname`, `envPath` (+92 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `Community 2` to `Community 9`, `Community 3`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `Event` connect `Community 0` to `Community 8`, `Community 9`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `getFreeBusySlots()` connect `Community 2` to `Community 6`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `POST()` (e.g. with `getFreeBusySlots()` and `getCalendarClient()`) actually correct?**
  _`POST()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BusyBlock`, `FreeSlot`, `DateSlots` to the rest of the system?**
  _97 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.10967741935483871 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
# Graph Report - CoupleCalendar  (2026-08-01)

## Corpus Check
- 71 files · ~26,880 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 339 nodes · 459 edges · 37 communities (29 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bb2baf9f`
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
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]

## God Nodes (most connected - your core abstractions)
1. `POST()` - 17 edges
2. `supabase` - 16 edges
3. `compilerOptions` - 16 edges
4. `Event` - 14 edges
5. `Memory` - 13 edges
6. `CoupleCalendar` - 10 edges
7. `getFreeBusySlots()` - 9 edges
8. `getCalendarClient()` - 9 edges
9. `authOptions` - 8 edges
10. `reconcileTheresaEvents()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `isTheresaAuthed()`  [INFERRED]
  src/app/api/theresa/chat/route.ts → src/lib/theresa-auth.ts
- `POST()` --calls--> `getViennaWeather()`  [INFERRED]
  src/app/api/theresa/chat/route.ts → src/lib/weather.ts
- `POST()` --calls--> `weatherSummary()`  [INFERRED]
  src/app/api/theresa/chat/route.ts → src/lib/weather.ts
- `POST()` --calls--> `getViennaWeather()`  [INFERRED]
  src/app/api/chat/route.ts → src/lib/weather.ts
- `POST()` --calls--> `weatherSummary()`  [INFERRED]
  src/app/api/chat/route.ts → src/lib/weather.ts

## Import Cycles
- None detected.

## Communities (37 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (30): ChatMessage, NarrowingOpt, Suggestion, SuggestionOpt, CalendarProps, MONTHS, WEEKDAYS, CaptureState (+22 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (26): dependencies, @auth/supabase-adapter, googleapis, next, next-auth, openai, react, react-dom (+18 more)

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (18): categorizeItem(), DayForecast, FeasibilityCategory, feasibilityReason(), getViennaWeather(), seasonalKeywords, socialKeywords, travelKeywords (+10 more)

### Community 3 - "Community 3"
Cohesion: 0.36
Nodes (4): authorized(), GET(), GET(), viennaToday()

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.21
Nodes (14): authorized(), GET(), decode(), IngestResult, MONTHS, openai, pad(), plusHours() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.40
Nodes (4): env, key, sup, url

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (12): Concept, CoupleCalendar, Data Model, Dev Setup, `events` table (Supabase) ✅ done, `google_tokens` table (Supabase) — CREATE THIS NEXT SESSION, Key Decisions, Pages (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (8): DateSlots, DEFAULTS, eventOverlapsSlot(), fmtDate(), FreeSlot, HEARTS, PlanPage(), toViennaHHMM()

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (26): POST(), utcToVienna(), fmtDay(), fmtEvents(), fmtSlots(), googleHasMatch(), hhmmss(), nightsBetween() (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.28
Nodes (5): geist, metadata, Providers(), BottomNav(), NAV_ITEMS

### Community 11 - "Community 11"
Cohesion: 0.40
Nodes (4): env, key, supabase, url

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (6): __dirname, env, envContent, envPath, migrationPath, sql

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (4): env, serviceKey, supabase, supabaseUrl

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (5): env, events, serviceKey, supabase, supabaseUrl

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (5): env, renames, serviceKey, supabase, supabaseUrl

### Community 25 - "Community 25"
Cohesion: 0.14
Nodes (12): DELETE(), PATCH(), RouteParams, Who, whoIs(), authOptions, isTheresaAuthed(), GET() (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.33
Nodes (5): env, fixes, key, supabase, url

### Community 27 - "Community 27"
Cohesion: 0.40
Nodes (4): env, serviceKey, supabase, supabaseUrl

### Community 28 - "Community 28"
Cohesion: 0.40
Nodes (4): env, key, supabase, url

### Community 29 - "Community 29"
Cohesion: 0.33
Nodes (5): env, key, months, sup, url

### Community 32 - "Community 32"
Cohesion: 0.40
Nodes (4): env, key, sup, url

### Community 33 - "Community 33"
Cohesion: 0.40
Nodes (4): env, key, sup, url

### Community 34 - "Community 34"
Cohesion: 0.40
Nodes (4): env, key, sup, url

## Knowledge Gaps
- **161 isolated node(s):** `openai`, `Who`, `openai`, `PlannedEvent`, `NarrowingOpt` (+156 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `Community 9` to `Community 0`, `Community 2`, `Community 3`, `Community 36`, `Community 5`, `Community 35`, `Community 25`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `Event` connect `Community 0` to `Community 8`, `Community 3`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `POST()` (e.g. with `getFreeBusySlots()` and `getCalendarClient()`) actually correct?**
  _`POST()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `openai`, `Who`, `openai` to the rest of the system?**
  _161 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06038961038961039 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
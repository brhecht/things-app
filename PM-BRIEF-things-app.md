# PM Brief — Daily Game Plan (Slice 1)
**App:** things-app
**Status:** IN PROGRESS
**Created:** 2026-06-10
**Builder:** Brian (self-building with Claude tonight)

## What We're Building
A native Game Plan view in B Things — a live rolling scheduler for today's tasks. You load it each morning, set time estimates and brainspace inline, hit Smart Sort as a starting point, then run your day from it. The focus timer, break tracker, projected finish, and "How am I doing?" all port from the working artifact. State persists to Firestore so it survives device switches.

**Slice 1 scope:** Game Plan VIEW only. The separate morning table-input view (bulk-set estimates + brainspace before you start) is Slice 2.

## Acceptance Criteria
- [ ] `/game-plan` route loads today's non-completed tasks from `api/tasks.js`
- [ ] Each row shows inline time estimate (tap to edit) and brainspace badge (tap to cycle Deep → Medium → Admin → ? → Deep)
- [ ] Smart Sort button reorders: Deep first, Admin last, preserves drag order within each tier
- [ ] Drag-to-reorder works; order persists across device refresh via Firestore
- [ ] Start Focus → countdown timer → amber "X min over" when blown; Take a Break → green break timer → Back from break re-projects; all state persists to Firestore
- [ ] Marking a task done in Game Plan also sets `completed: true` on the task doc in B Things
- [ ] "How am I doing?" returns a contextually relevant line (pace, brainspace distribution remaining, projected finish)
- [ ] Open-ended (`?`) tasks render at the bottom with no time block and don't affect projected finish

## Scope Boundaries
**In scope:**
- `/game-plan` route (desktop only, no mobile breakpoint needed)
- `api/game-plan.js` — GET + POST for daily state doc
- Inline time estimate editing per row
- Inline brainspace badge (Deep / Medium / Admin / ?)
- Smart Sort button (one-shot, not auto)
- Focus timer, break timer, projected finish — port of artifact
- "How am I doing?" — brainspace-aware version
- Done in Game Plan → completes task in B Things (POST to existing task update path)
- Sidebar nav entry "Game Plan" (desktop sidebar only)

**Out of scope (Slice 2):**
- Dedicated morning table-input view for bulk brainspace/estimate setup
- Mobile layout
- Brainspace-driven auto-sort on load
- Per-project grouping in the plan view

## Data Model
**New Firestore collection:** `gamePlan/{userId}/{date}` (date = `YYYY-MM-DD`)

```js
{
  order: ['taskId1', 'taskId2'],       // drag order
  done: { taskId1: true },              // tasks marked done in plan
  estimates: { taskId1: 45 },           // minutes, set inline
  brainspace: { taskId1: 'deep' },      // 'deep' | 'medium' | 'admin' | 'unknown'
  focusId: 'taskId1',                   // currently focused task
  focusStart: <timestamp ms>,
  onBreak: false,
  breakStart: null,
  lastBreak: <timestamp ms>
}
```

Single doc per user per day. All writes are field-level merges (no full overwrites).

## New API: api/game-plan.js
- `GET /api/game-plan?date=2026-06-10` → returns the doc (or empty defaults if none exists)
- `POST /api/game-plan` body `{ date, ...fields }` → merges fields into the doc
- Same auth pattern as `api/tasks.js` — `x-api-key: API_SECRET`, firebase-admin init

## Brainspace Logic
- **Deep:** creative, strategic, writing — schedule early
- **Medium:** engaged but not draining
- **Admin:** mechanical, routine — batch at end
- **? (unknown):** scope-uncertain tasks — rendered at bottom of plan, no time block, excluded from projected finish

Smart Sort: stable sort within each tier preserving existing drag order. Order: Deep → Medium → Admin → ?

## "How am I doing?" — brainspace-aware additions
- If ≥2 Deep tasks remain and it's past 2pm: flag it ("You've got deep work left late in the day — consider whether to push or power through")
- If all remaining tasks are Admin: "You're in the home stretch — mechanical from here, just execute"
- Otherwise: pace/done-count logic from the artifact

## Risk Assessment
**Complexity:** Medium
**Cross-app impact:** Writes to `tasks` collection (completes tasks) — same Firestore project `b-things`, same pattern as existing task updates
**Risk areas:** `api/game-plan.js` build in Cowork VM (same FUSE/tmp-clone pattern as all things-app builds)

## Open Questions — RESOLVED
- Data model: daily ephemeral Firestore doc (Option B) ✅
- Multi-device: Yes, Firestore from day 1 ✅
- Mobile: No for Slice 1 ✅
- Done in Game Plan = completes in B Things ✅
- Brainspace in Slice 1: Yes, Deep/Medium/Admin/? ✅
- Smart Sort: one-shot button, not auto-sort on load ✅

## Session Log
### 2026-06-10 — Slice 1 build started
- **What:** PM brief locked, building tonight
- **Known issues:** None yet
- **Next:** api/game-plan.js → GamePlanView.jsx → route + sidebar → deploy

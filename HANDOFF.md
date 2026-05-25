# HANDOFF — B Things
*Last updated: May 25, 2026 ~5:00 PM ET*

## Project Overview
Kanban-style personal task board with time-based columns, project grouping, drag-and-drop. Brian is the owner; Nico is a registered collaborator (`isViewer === true`) who reads/writes Brian's same Firestore dataset. Part of B-Suite ecosystem with app switcher. Supports per-project visibility filtering (cognitive-load only — not access control) so Brian can mark personal projects hidden from Nico's view.

## Tech Stack
React + Vite, Firebase Auth (Google Sign-In), Firestore real-time. Vercel auto-deploy from GitHub main. Firebase project: `b-things` (shared with brain-inbox, content-calendar, b-resources). Tailwind CSS 3.4.

## Folder Structure
- `src/components/KanbanBoard.jsx` — Main board view with time-bucket columns, project groups, drag-and-drop. Contains `ProjectDropGroup` (project section headers with quick-add `+` button) and `Column`.
- `src/components/AgendaView.jsx` — Desktop agenda/list view.
- `src/components/MobileAgendaView.jsx` — Mobile-specific agenda with `SwipeableTaskCard` (swipe-right to complete, swipe-left to bump bucket). Uses scroll-position-based tap detection to avoid scroll-vs-tap conflicts.
- `src/components/TaskCard.jsx` — Individual task card on the kanban board. Shows star, unread indicator, notes indicator, assigned-to-Nico badge (`→N`), hover delete.
- `src/components/TaskModal.jsx` — Full task editor modal. Supports: title, project, bucket, due date, priority, tags, notes, NoteThread messages, Assign to Nico, complete/star toggles. Star now persists immediately on click (not deferred to save). Mobile swipe-down-to-close via drag handle. `completedMode` prop swaps Save for "Move to Incomplete".
- `src/components/NoteThread.jsx` — iMessage-style threaded messaging on tasks. @mention autocomplete, Slack DM notifications via `/api/notify` proxy. Notification toast shows "Notified [Name]" or "Failed to notify [Name]". Error handling: only restores draft if message save fails (metadata/notification failures are non-fatal).
- `src/components/CompletedView.jsx` — Completed task archive. Clicking a task opens TaskModal in `completedMode` for editing + restoring.
- `src/components/MobileBottomNav.jsx` — Mobile tab bar (Inbox, Today, All, Projects, Completed).
- `src/components/MobileQuickAdd.jsx` — Floating quick-add button on mobile.
- `src/components/Sidebar.jsx` — Project list nav + filters. Hover-revealed eye/eye-off toggle on each project row (owner-only) controls `hiddenFromViewers`; hidden projects render italic-gray with a persistent eye-off icon in owner's view.
- `src/store.js` — Zustand store. Firebase CRUD, auth, undo stack. `updateTask` uses optimistic local update. Keeps `_rawProjects`/`_rawTasks` internally; exposed `projects`/`tasks` are filtered when `isViewer === true` (cognitive-load filter for Nico). `toggleProjectHidden(id)` writes the flag to the project doc.
- `src/App.jsx` — Root. Desktop vs mobile layout split via `useIsMobile`. Deep-link support (`?task=docId`).
- `firebase.json` — Empty `{}`. Things-app cannot deploy any Firebase resources.
- `vercel.json` — Empty `{}`. No cron jobs. (The daily Content Calendar → B Things sync was removed May 25, 2026.)

## Current Status
Active, fully functional. All features deployed and verified including: NoteThread bidirectional messaging, two-way Brian↔Nico data sharing, per-project viewer hiding (cosmetic filter), and Substack-canonical content links. No daily content sync from B Content (removed May 25, 2026).

## Recent Changes (May 25, 2026)

1. **Per-project viewer hiding (cognitive-load filter)** — Owner can mark any project hidden from Nico's view. Hover-revealed eye toggle in the sidebar; persistent eye-off + italic name on hidden projects in owner's view. Store filters `projects` and `tasks` when `isViewer === true`. Default false for all projects. UI-only filter — Nico retains Firestore read/write at the DB layer. Brian explicitly accepted this trade-off ("I'm okay with that").

2. **Removed daily Content Calendar → B Things sync** — Deleted Vercel cron from `vercel.json` and removed `api/content-today.js`. Brian doesn't want content cards auto-pushed to B Things anymore — too much cognitive clutter. Previously-auto-synced tasks (those with `sourceCardId`) remain as regular B Things tasks; not retroactively deleted. The `notifyNicoOnContentStatusChange` Firestore trigger in brain-inbox is unrelated and stays.

### Previous session (March 18, 2026):
- Smart title fallback for the (now-removed) content→things sync — fallback chain card title → archiveData title + type label → type label alone.
- Consolidated content→things sync to single Vercel cron path (now also removed).

### Previous session (March 16, 2026):
- NoteThread @mention notifications fixed (Firestore subcollection rules)
- NoteThread error handling fixed (only restore draft on actual send failure)
- Star persistence fixed (optimistic local update in Zustand store)
- Star in TaskModal persists immediately on click
- Firestore rules: viewers upgraded to read-write for Nico

## Known Bugs / Issues
- **Cowork VM build uses /tmp clone** — `vite build` on mounted folder has permission issues with `emptyDir`. Workaround: clone to `/tmp/things-build` (or reuse the bsync clone), copy changed files, build and push from there. Standard dev-deploy pattern now.
- **Mount cosmetic artifact: `api/content-today.js`** — File was `git rm`'d on May 25 but FUSE blocked the unlink, so it lingers as an untracked file on Brian's working tree. Safe to ignore; `rm` it whenever. Doesn't affect deploys (Vercel only ships committed files).
- **Viewer reorder edge case** — When Nico reorders projects, only visible projects get sortOrder assignments, which can shuffle hidden projects' positions in Brian's view. Low-impact; not fixed.
- **iMac now has Node 20 + firebase-tools** — Installed via nvm during March 18 session. Firebase CLI is at `/usr/local/bin/firebase`. Firebase login is authenticated as `brhnyc1970@gmail.com`. However, deploying brain-inbox Cloud Functions requires secrets (SLACK_SIGNING_SECRET etc.) that only Nico's environment has configured.

## Planned Features / Backlog
- Re-send/update assignment to Nico after editing task (small "Resend" link)
- Bidirectional sync: Nico completes in Brain Inbox → auto-complete in Things

## Design Decisions & Constraints
- `firebase.json` and `vercel.json` are both empty `{}`. Things-app deploys no Firebase resources and runs no scheduled crons.
- **Per-project hiding is a UI filter, not access control.** Owner sets `hiddenFromViewers: true` on a project; store filters that project and all its tasks out of `projects`/`tasks` when `isViewer === true`. Viewer (Nico) still has Firestore-level read/write — anyone with devtools could query hidden docs. Explicit design choice per Brian.
- Assign to Nico uses `handoff-notify` API (not Slack syntax) for reliability. No `HANDOFF_SECRET` required — endpoint doesn't enforce it in production.
- Mobile tap detection uses `onClick` + scroll-position guard (not touch events) because `touchAction: pan-y` causes browser to swallow `touchmove` during native scroll.
- Swipe-down-to-close uses manual `addEventListener({ passive: false })` because React attaches touch listeners as passive by default.
- Git push from Cowork goes through `/tmp/` clone to avoid FUSE EPERM issues on mounted folder (standard dev-deploy pattern).
- Star toggle sets `sortWeight: Date.now()` + `priority: 'high'` on star, which causes kanban to re-sort starred items to top of project group. This is intentional — the card movement IS the feature.
- NoteThread notification sends use `/api/notify` (server-side proxy) which forwards to `handoff-notify` with Content-Type header. Content Calendar's NoteThread calls `handoff-notify` directly WITHOUT Content-Type header (CORS avoidance).
- `updateTask` uses optimistic local update pattern: set Zustand store first, then write to Firestore. Firestore snapshot listener will confirm/reconcile on next tick.

## Environment & Config
- Firebase project: `b-things` (shared)
- Env vars: `VITE_FIREBASE_*` pattern
- Live URL: https://things-app-gamma.vercel.app
- GitHub: github.com/brhecht/things-app
- Vercel: auto-deploy from main branch
- Brain Inbox API: `https://brain-inbox-six.vercel.app/api/handoff-notify`

## Open Questions / Decisions Pending
None.

## Session Log

### 2026-04-21 — AppSwitcher: B Eddy → B Projects
- **What shipped:** Renamed B Eddy to B Projects in AppSwitcher (label + icon E→P) to match bhub homepage.
- **Known issues:** None.
- **Next:** None.

### 2026-05-04 — Added "Infra" project for B-Suite ops/maintenance tasks
- **What shipped:** New `infra` project (slate accents). PROJECT_MAP in `api/add-task.js` accepts "infra", "b-suite", "b suite", "bsuite". One-time auto-injection in store.js (matches the `network`/`from-nico` pattern) so it shows up in existing users' Firestore on next app load. Color maps + sort order updated across all 7 components (Sidebar, AgendaView, MobileAgendaView, MobileProjectList, CompletedView, KanbanBoard).
- **Known issues:** Test task `__INFRA_TEST__ delete me` (created during deploy verification) — delete from UI.
- **Next:** None.

### 2026-05-25 — Per-project "Hide from Viewer" (cognitive-load filter)
- **What shipped:** Owner can mark any project hidden from collaborator (Nico). Toggle is the eye/eye-off icon revealed on hover in the Sidebar; persistent eye-off + italic name marks a hidden project in owner's view. Store now keeps `_rawProjects`/`_rawTasks` and filters `projects`/`tasks` when `isViewer === true` (filters out hidden projects + their tasks). New action `toggleProjectHidden(id)` writes `hiddenFromViewers: true/false` to the project doc. Default false — no existing project changes state on deploy.
- **Known issues:** This is a UI filter, not access control. Viewers still have Firestore read/write at the DB level — anyone with devtools can query hidden docs. By design (Brian: "I'm okay with that"). Reorder edge case unchanged: viewer reordering still writes sortOrders for visible projects only, which can shuffle hidden ones in owner's view. Low impact, document only.
- **Next:** None.

### 2026-05-25 — Removed Content Calendar → B Things daily sync
- **What shipped:** Deleted the Vercel cron from `vercel.json` (was `0 12 * * *` calling `/api/content-today`) and removed `api/content-today.js` entirely. Brian doesn't want content cards auto-pushed to B Things anymore — too much cognitive clutter. Previously-auto-synced tasks (those with `sourceCardId`) remain as regular B Things tasks. The Slack/Telegram `notifyNicoOnContentStatusChange` Firestore trigger in brain-inbox is unrelated and stays.
- **Known issues:** Mount cosmetic artifact — `api/content-today.js` will appear as an untracked file in `git status` on Brian's Mac (FUSE can't unlink). Safe to ignore; `rm` it whenever. Does NOT affect the deploy: Vercel only ships committed files.
- **Next:** None.

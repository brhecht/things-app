# HANDOFF — B Things
*Last updated: March 18, 2026 ~12:00 PM ET*

## Project Overview
Kanban-style personal task board with time-based columns, project grouping, drag-and-drop. Full read-write access for both Brian and Nico (viewer mode upgraded to read-write March 16). Part of B-Suite ecosystem with app switcher.

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
- `src/store.js` — Zustand store. Firebase CRUD, auth, undo stack. `updateTask` uses optimistic local update (sets store immediately, then writes to Firestore).
- `src/App.jsx` — Root. Desktop vs mobile layout split via `useIsMobile`. Deep-link support (`?task=docId`).
- `firebase.json` — Empty `{}`. Things-app cannot deploy any Firebase resources.

## Current Status
Active, fully functional. All features deployed and verified including NoteThread bidirectional messaging and star fix.

## Recent Changes (March 18, 2026)

1. **Smart title fallback for content→things sync** — `api/content-today.js` now uses a `cardTitle()` function instead of `card.title || '(untitled content)'`. Fallback chain: card title → archiveData title/subjectLine + type label → type label alone (e.g., "YT Video", "LinkedIn Post", "Beehiiv Newsletter", "YT Short") → "(untitled content)" as last resort. This means task cards created from content calendar items now show useful names instead of "Untitled".

2. **Consolidated content→things sync to single path** — The real-time Firebase Cloud Function `syncContentToThings` in brain-inbox was removed. The daily Vercel cron (`api/content-today.js`, 7am ET) is now the sole sync path. This eliminates a Firebase CLI deploy dependency and keeps all things-app sync logic in one repo.

### Previous session (March 16, 2026):
- NoteThread @mention notifications fixed (Firestore subcollection rules)
- NoteThread error handling fixed (only restore draft on actual send failure)
- Star persistence fixed (optimistic local update in Zustand store)
- Star in TaskModal persists immediately on click
- Firestore rules: viewers upgraded to read-write for Nico

## Known Bugs / Issues
- **Cowork VM build uses /tmp clone** — `vite build` on mounted folder has permission issues with `emptyDir`. Workaround: clone to `/tmp/things-build`, copy changed files, build and push from there. Works reliably.
- **iMac now has Node 20 + firebase-tools** — Installed via nvm during March 18 session. Firebase CLI is at `/usr/local/bin/firebase`. Firebase login is authenticated as `brhnyc1970@gmail.com`. However, deploying brain-inbox Cloud Functions requires secrets (SLACK_SIGNING_SECRET etc.) that only Nico's environment has configured.

## Planned Features / Backlog
- Re-send/update assignment to Nico after editing task (small "Resend" link)
- Bidirectional sync: Nico completes in Brain Inbox → auto-complete in Things

## Design Decisions & Constraints
- `firebase.json` is empty `{}` — things-app must never deploy Firebase resources. Brain-inbox is the sole Firestore rules deployer.
- Assign to Nico uses `handoff-notify` API (not Slack syntax) for reliability. No `HANDOFF_SECRET` required — endpoint doesn't enforce it in production.
- Mobile tap detection uses `onClick` + scroll-position guard (not touch events) because `touchAction: pan-y` causes browser to swallow `touchmove` during native scroll.
- Swipe-down-to-close uses manual `addEventListener({ passive: false })` because React attaches touch listeners as passive by default.
- Git push from Cowork goes through `/tmp/things-build` clone to avoid HEAD.lock issues on mounted folder.
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

# HANDOFF — B Things
*Last updated: March 14, 2026 ~11:00 PM ET*

## Project Overview
Kanban-style personal task board with time-based columns, project grouping, drag-and-drop. Viewer mode for Nico (read-only). Part of B-Suite ecosystem with app switcher.

## Tech Stack
React + Vite, Firebase Auth (Google Sign-In), Firestore real-time. Vercel auto-deploy from GitHub main. Firebase project: `b-things` (shared with brain-inbox, content-calendar, b-resources). Tailwind CSS 3.4.

## Folder Structure
- `src/components/KanbanBoard.jsx` — Main board view with time-bucket columns, project groups, drag-and-drop. Contains `ProjectDropGroup` (project section headers with quick-add `+` button) and `Column`.
- `src/components/AgendaView.jsx` — Desktop agenda/list view.
- `src/components/MobileAgendaView.jsx` — Mobile-specific agenda with `SwipeableTaskCard` (swipe-right to complete, swipe-left to bump bucket). Uses scroll-position-based tap detection to avoid scroll-vs-tap conflicts.
- `src/components/TaskCard.jsx` — Individual task card on the kanban board. Shows star, unread indicator, notes indicator, assigned-to-Nico badge (`→N`), hover delete.
- `src/components/TaskModal.jsx` — Full task editor modal. Supports: title, project, bucket, due date, priority, tags, notes, NoteThread messages, Assign to Nico, complete/star toggles. Mobile swipe-down-to-close via drag handle. `completedMode` prop swaps Save for "Move to Incomplete".
- `src/components/CompletedView.jsx` — Completed task archive. Clicking a task opens TaskModal in `completedMode` for editing + restoring.
- `src/components/MobileBottomNav.jsx` — Mobile tab bar (Inbox, Today, All, Projects, Completed).
- `src/components/MobileQuickAdd.jsx` — Floating quick-add button on mobile.
- `src/store.js` — Zustand store. Firebase CRUD, auth, undo stack.
- `src/App.jsx` — Root. Desktop vs mobile layout split via `useIsMobile`. Deep-link support (`?task=docId`).
- `firebase.json` — Empty `{}`. Things-app cannot deploy any Firebase resources.

## Current Status
Active, fully functional. All features from this session deployed and verified.

## Recent Changes (March 14, 2026 — evening session)

1. **Quick-add `+` on project headers (KanbanBoard)** — Each project section header within a time bucket now has a `+` button. Opens an inline task form with project and bucket pre-filled. No more scrolling to bottom of column to add tasks.

2. **Completed task editing (CompletedView + TaskModal)** — Clicking a completed task opens the full TaskModal with all fields editable. Save button replaced with "Move to Incomplete" which persists edits and restores the task to the active board. Backdrop click and Escape close without saving.

3. **Mobile scroll-vs-tap fix (MobileAgendaView)** — Root cause: `touchAction: pan-y` causes the browser to swallow `touchmove` events during native scroll, making JS-based tap detection impossible. Fix: switched from touch-based tap detection to `onClick` with a scroll-position guard. Captures parent `scrollTop` on `touchstart`, compares on `click`, suppresses if scrolled > 5px. Also tracks horizontal swipe state (`didSwipe` ref) to suppress clicks after swipe gestures.

4. **Swipe-down-to-close on TaskModal (mobile)** — Drag handle (gray pill) at top of modal on mobile. Pull down 120px+ to dismiss. Uses manual `addEventListener` with `{ passive: false }` so `e.preventDefault()` works on mobile Safari/Chrome. `touch-none` CSS on handle area.

5. **Assign to Nico (TaskModal + TaskCard)** — "Assign to Nico →" button in task modal POSTs to `brain-inbox-six.vercel.app/api/handoff-notify`. Message includes project name, task title, deep link (`?task=docId`), and notes if present. Writes to Nico's Brain Inbox Firestore + Slack notification. Task gets `assignedToNico: true` and `assignedAt` timestamp in Firestore. Button flips to "Assigned to Nico ✓" (green, disabled) to prevent double-send. TaskCard shows `→N` badge in lime green for assigned tasks. Hidden in `completedMode`.

## Known Bugs / Issues
- **PostCSS/Tailwind build fails in Cowork VM** — `vite build` fails on the `emptyDir` step because mounted folder has permission issues deleting `dist/` files. Workaround: push via `/tmp/things-app-push` clone. Builds fine on Mac and Vercel CI. Not worth debugging.
- **Git HEAD.lock on mounted folder** — Occasional `HEAD.lock` left after git operations in VM. Workaround: clone to `/tmp/things-app-push`, copy changed files, commit and push from there.

## Planned Features / Backlog
- Re-send/update assignment to Nico after editing task (small "Resend" link)
- Bidirectional sync: Nico completes in Brain Inbox → auto-complete in Things
- Remove Vercel cron fallback (`api/content-today.js`) once Firestore trigger confirmed stable
- Cowork VM build fix (PostCSS/Tailwind) — low priority

## Design Decisions & Constraints
- `firebase.json` is empty `{}` — things-app must never deploy Firebase resources. Brain-inbox is the sole Firestore rules deployer.
- Assign to Nico uses `handoff-notify` API (not Slack syntax) for reliability. No `HANDOFF_SECRET` required — endpoint doesn't enforce it in production.
- Mobile tap detection uses `onClick` + scroll-position guard (not touch events) because `touchAction: pan-y` causes browser to swallow `touchmove` during native scroll.
- Swipe-down-to-close uses manual `addEventListener({ passive: false })` because React attaches touch listeners as passive by default.
- Git push from Cowork goes through `/tmp/things-app-push` clone to avoid HEAD.lock issues on mounted folder.

## Environment & Config
- Firebase project: `b-things` (shared)
- Env vars: `VITE_FIREBASE_*` pattern
- Live URL: https://things-app-gamma.vercel.app
- GitHub: github.com/brhecht/things-app
- Vercel: auto-deploy from main branch
- Brain Inbox API: `https://brain-inbox-six.vercel.app/api/handoff-notify`

## Open Questions / Decisions Pending
None.

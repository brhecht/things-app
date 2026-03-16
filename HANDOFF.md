# HANDOFF — B Things
*Last updated: March 16, 2026 ~3:30 PM ET*

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

## Recent Changes (March 16, 2026)

1. **NoteThread @mention notifications fixed** — Root cause: Firestore rules were missing a `match /messages/{messageId}` subcollection under `users/{userId}/tasks/{taskId}`. Firestore rules don't cascade to subcollections. Added nested match rule in `brain-inbox/firestore.rules` and deployed via Firebase console. Messages now save, render in iMessage-style thread, and trigger Slack DM notifications with "Notified [Name]" / "Failed to notify [Name]" toast feedback.

2. **NoteThread error handling fixed** — The try/catch around message send was restoring draft text to the input whenever ANY step failed (including metadata update and notifications). Refactored: only restores draft if `addMessage` itself fails. `updateTaskMsgMeta` and notification sends are now fire-and-forget — failures are logged but don't affect UX. This fixed Nico's "message goes back to type box" bug.

3. **Star persistence fixed — optimistic local update** — `updateTask` in store.js now immediately updates the local Zustand store before writing to Firestore. Eliminates the perceived "flicker" where starring a task would briefly show the star, then the kanban re-sort would move the card and make it look like the star vanished.

4. **Star in TaskModal persists immediately** — Star toggle in the modal now calls `updateTask` on click (with `sortWeight` and `priority: 'high'`), not deferred to modal save. Previously only set local React state, so closing without explicit save would lose the star.

5. **Firestore rules: viewers upgraded to read-write** — `users/{userId}/tasks/{taskId}` and `users/{userId}/projects/{projectId}` rules changed from `allow read` to `allow read, write` for registered viewers. Nico can now star, edit, and modify tasks directly. Previously viewer was read-only, causing silent Firestore write failures.

## Known Bugs / Issues
- **Cowork VM build uses /tmp clone** — `vite build` on mounted folder has permission issues with `emptyDir`. Workaround: clone to `/tmp/things-build`, copy changed files, build and push from there. Works reliably.
- **iMac has no Node.js installed** — `npx`/`npm` not found. Firebase CLI deploys must be done via Firebase console UI (paste rules and publish). Install Node when convenient: `brew install node`.

## Planned Features / Backlog
- Re-send/update assignment to Nico after editing task (small "Resend" link)
- Bidirectional sync: Nico completes in Brain Inbox → auto-complete in Things
- Remove Vercel cron fallback (`api/content-today.js`) once Firestore trigger confirmed stable

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

# HANDOFF — B Things
*Last updated: March 3, 2026 (morning session)*

## Project Overview
B Things is a personal task/project management web app built for Brian Hecht. It's a kanban-style board with tasks organized into time-based columns (Inbox, Today, Waiting/Delegated, Tomorrow, This Week, Later) and grouped by project. Part of the "BSuite" family of apps (B Eddy, B Things, B People, B Nico) that share a common app switcher bar.

Has a viewer mode so Nico (nico@humbleconviction.com) can see Brian's tasks read-only.

## Tech Stack
- **Frontend:** React 18 + Vite 5, Zustand for state management, Tailwind CSS 3
- **Backend/DB:** Firebase (Firestore for data, Firebase Auth with Google sign-in)
- **API:** Vercel serverless functions (`/api/slack.js` for Slack integration, `/api/add-task.js` for adding tasks via API)
- **Hosting:** Vercel — deployed via `git push` to main
- **Live URL:** https://things-app-gamma.vercel.app

## Folder Structure
```
things-app/
├── src/
│   ├── App.jsx              # Main layout: sidebar + board/agenda toggle + AppSwitcher + ⌘+Z undo listener + undo toast
│   ├── AppSwitcher.jsx      # BSuite nav bar across all apps
│   ├── store.js             # Zustand store: auth, projects, tasks, undo stack, all actions, Firestore sync
│   ├── firebase.js          # Firebase config and Firestore helpers
│   ├── main.jsx             # Entry point
│   ├── index.css            # Tailwind base styles
│   └── components/
│       ├── Sidebar.jsx      # Collapsible sidebar: standard panel icon toggle, project list (draggable reorder), filters
│       ├── KanbanBoard.jsx  # Main board: columns by bucket, project groups, drag-and-drop, resizable columns, quick-add with expand icon
│       ├── AgendaView.jsx   # Alternative list view grouped by bucket
│       ├── TaskCard.jsx     # Individual task card (draggable, star, complete, delete, hover tooltip)
│       ├── TaskModal.jsx    # Edit task: title, notes, priority, project, bucket, due date, tags. Enter/⌘+Enter to save, full tab flow.
│       └── SignInPage.jsx   # Google sign-in page
├── api/
│   ├── slack.js             # Slack bot: add tasks via Slack with --bucket, --project, --notes parsing (dynamic Firestore project lookup)
│   └── add-task.js          # API endpoint for adding tasks programmatically
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## Current Status
Fully functional and deployed. All core features working:
- Kanban board with 5-6 columns (Inbox auto-hides when empty; Today → Waiting/Delegated → Tomorrow → This Week → Later always visible)
- Agenda (list) view as alternative
- Project-based grouping with colored headers
- Drag to column header = change bucket only (preserve project); drag to project group = reassign project
- Drag-to-reorder projects in sidebar (persisted to Firestore via `sortOrder` field)
- Resizable column widths via drag handles (resets on page reload)
- Hover tooltip on task cards showing full task title
- Collapsible sidebar with standard panel icon toggle
- ⌘+Z undo for all task actions (up to 30 levels deep) with toast notification
- Keyboard shortcuts in task modal: Enter saves, ⌘+Enter saves from anywhere, full tab flow, ⌘⌫ deletes
- Quick-add form with expand icon to open full task editor
- Star/priority system, filters, task modal with full editing
- Viewer mode for Nico (read-only)
- Slack bot integration with `--bucket`, `--project`, `--notes` tagging (dynamic Firestore project lookup)
- BSuite app switcher bar

## Recent Changes (This Session — March 3 morning)
All changes pushed and deployed:

1. **Drop on column header preserves project** — Column headers are now dedicated drop zones that call `moveTask(id, bucket.id)` (bucket-only change with `stopPropagation`). Project groups remain project-reassignment drop zones. Two clearly separated behaviors by where you drop.

2. **"When" dropdown labels fixed** — TaskModal bucket dropdown labels changed from "Soon"→"This Week" and "Someday"→"Later" to match column headers.

3. **Keyboard shortcuts in task modal** — Enter saves from title, project, bucket, and date fields. ⌘+Enter saves from anywhere (including notes/tags textarea). Priority buttons have `tabIndex={0}` and focus rings for full tab flow. Save button shows ↵ hint. ⌘⌫ still deletes.

4. **⌘+Z undo for all task actions** — `_undoStack` in store (capped at 30 entries). Every `updateTask`, `deleteTask`, and `moveTask` pushes a snapshot before mutating. `undo()` pops and restores (re-upserts for deletes). Dark toast at bottom shows "Undid: {label}" with "Undo again" button if stack has more. Toast auto-dismisses after 2s. Labels: complete, delete, star, unstar, move, reassign, edit.

5. **Hide empty Inbox column** — `BUCKETS.filter()` before `.map()` skips inbox when `visibleTasks.filter(t => t.bucket === 'inbox').length === 0`. Only applies to inbox. ResizeHandle references updated to use `arr[i-1]` (filtered array) instead of `BUCKETS[i-1]`.

6. **Quick-add "Add & Edit" expand icon** — `addTask` in store now returns the created task object. Quick-add form has a compact expand icon (↗-style SVG) next to the Add button. Clicking it creates the task and immediately calls `onTaskClick(task)` to open the full TaskModal. Enter still just adds (fast path).

7. **Standard sidebar panel icon** — Replaced the subtle chevron toggle with a standard sidebar panel SVG icon (rectangle with left panel + directional arrow). Bigger hit target (h-10), brighter hover state (`hover:text-gray-200`), arrow flips based on open/closed state.

### Prior session changes (still in effect):
8. Collapsible sidebar with color dots when collapsed
9. Waiting / Delegated column (amber, between Today and Tomorrow)
10. Drag-to-project via `ProjectDropGroup` wrapping entire project region
11. Drag-to-reorder projects in sidebar with grip handles
12. Resizable column widths via `ResizeHandle` component
13. Custom hover tooltip on TaskCard
14. Slack bot `--` delimiter, dynamic Firestore project lookup, `--notes` support

## Known Bugs / Issues
- Vite build warning about chunk size >500kB (main JS bundle ~640kB). Not critical but could benefit from code-splitting.
- No mobile-responsive layout beyond the collapsible sidebar. Horizontal scrolling still needed on small screens for the board itself.

## Planned Features / Backlog
- Full mobile optimization for BSuite apps (mentioned by Brian as a bigger project)
- Potential code-splitting to reduce bundle size

## Design Decisions & Constraints
- **Single-owner model:** Brian is the sole owner (brhnyc1970@gmail.com). Nico is an allowed viewer. Auth checks in `store.js` via `OWNER_EMAIL` and `ALLOWED_VIEWERS`.
- **Optimistic UI:** `reorderProjects` updates local state immediately, then persists to Firestore.
- **Project colors are hardcoded** in `PROJECT_COLORS` and `DOT_COLORS` maps in Sidebar.jsx and KanbanBoard.jsx. New projects get generic gray.
- **Bucket = time horizon, Project = category.** Tasks live at the intersection.
- **`sortOrder` migration:** Existing projects without `sortOrder` fall back to `LEGACY_ORDER` index. Once any reorder happens, all projects get explicit `sortOrder` values.
- **Undo architecture:** Snapshot-based. Each mutation pushes a full copy of the task's previous state onto `_undoStack`. Undo just re-upserts that snapshot. For deletes, the snapshot is re-created. Stack capped at 30 entries. No redo.
- **Drop zone separation:** Column header = bucket-only move (preserves project). Project group region = project reassignment. Both use `stopPropagation` to prevent conflicts.
- **Inbox auto-hide:** Only inbox column hides when empty. All other columns always visible.
- **Slack `--` delimiter:** Chosen because `#` triggers Slack channels, `/` triggers slash commands, `@` triggers mentions. `--` is unambiguous and supports multi-word values.
- **`--notes` is greedy:** Everything after `--notes` in the Slack message becomes the notes field. Must be the last tag in the message.
- **Dynamic project lookup:** Bot queries Firestore on each message rather than caching. Slight latency tradeoff for zero-maintenance when projects change.

## Environment & Config
- Firebase config via Vite env vars: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
- Server-side env vars (Vercel): `FIREBASE_SERVICE_ACCOUNT` (JSON string), `OWNER_UID`, `SLACK_BOT_TOKEN`, `BOT_USER_ID`
- Deployed on Vercel, auto-deploys from `main` branch on GitHub: `github.com/brhecht/things-app`
- Firestore structure: `users/{uid}/projects/{projectId}` and `users/{uid}/tasks/{taskId}`

## Open Questions / Decisions Pending
None currently.

# HANDOFF — Things App
*Last updated: March 12, 2026 ~11:35 PM ET*

## Project Overview
B Things is a task management app for Brian (and Nico). Kanban board with 6 bucket columns (Inbox, Today, Wait/Delegate, Tomorrow, This Week, Later), plus Agenda and Completed views. Tasks belong to projects, support starring, priorities, drag-and-drop between buckets/projects, and NoteThread messaging with @mention notifications to Brain Inbox. Part of B-Suite.

## Tech Stack
- **Frontend:** React 18, Zustand (state), Tailwind CSS 3, Vite 5
- **Backend:** Firebase Firestore + Storage + Auth (Google sign-in) on project b-things
- **Hosting:** Vercel (auto-deploys from main)
- **Repo:** github.com/brhecht/things-app
- **Local path:** `~/Developer/B-Suite/things-app`
- **Live URL:** things-app-gamma.vercel.app

## Folder Structure
```
things-app/
├── src/
│   ├── App.jsx                — Root with view routing
│   ├── AppSwitcher.jsx        — B Suite nav
│   ├── store.js               — Zustand store: state, auth, CRUD
│   ├── firebase.js            — Firebase config + Firestore helpers
│   ├── users.js               — User registry (Brian, Nico)
│   ├── main.jsx               — Entry, exposes window.store
│   ├── index.css              — Tailwind imports
│   └── components/
│       ├── KanbanBoard.jsx    — Board view with 6 columns, drag-and-drop, resize handles
│       ├── TaskCard.jsx       — Individual task card (checkbox, title, star, indicators)
│       ├── TaskModal.jsx      — Full task editor with NoteThread
│       ├── NoteThread.jsx     — iMessage-style chat with @mention notifications
│       ├── AgendaView.jsx     — List view grouped by bucket
│       ├── CompletedView.jsx  — Completed tasks
│       ├── Sidebar.jsx        — Project list + filters
│       ├── SignInPage.jsx     — Google Auth
│       ├── MobileAgendaView.jsx
│       ├── MobileBottomNav.jsx
│       ├── MobileProjectList.jsx
│       └── MobileQuickAdd.jsx
├── api/                       — (none currently)
└── package.json
```

## Current Status

### Working
- Kanban board with 6 buckets, drag-and-drop between buckets and projects
- Resizable columns via drag handles (ResizeHandle component)
- Task cards with checkbox, star, priority border, unread/notes indicators, hover tooltip
- Task text now wraps naturally (truncation removed this session)
- Column headers use whitespace-nowrap
- Agenda view, Completed view
- Mobile views
- NoteThread messaging with @mention notifications to Brain Inbox
- Google Auth with allowlist
- Real-time Firestore sync

### Bucket Pipeline
inbox → today → wait/delegate → tomorrow → this week → later

## Recent Changes (March 12, 2026 — This Session)

### 1. Renamed "Waiting / Delegated" → "Wait / Delegate"
- Updated in KanbanBoard.jsx, TaskModal.jsx, AgendaView.jsx, MobileAgendaView.jsx
- MobileQuickAdd.jsx already just said "Waiting" — left as-is

### 2. Removed Text Truncation from TaskCard
- Removed `truncate` CSS class from task title `<p>` in TaskCard.jsx
- Titles now wrap naturally within available column width
- Hover tooltip still works as backup for long titles

### 3. Column Header Nowrap
- Added `whitespace-nowrap` to column header `<h2>` elements

### 4. Column Width Attempts (PARTIALLY WORKING — SEE KNOWN BUGS)
- Added `defaultFlex` and `minW` properties per bucket in BUCKETS config
- Set default `colWidths` state to 260px for all 6 columns (fixed pixel widths)
- Added `w-max` to the flex container to prevent viewport capping
- Changed from flex ratio approach to fixed pixel widths
- **Result:** First 4 columns render correctly at 260px. Last 2 columns (This Week, Later) render narrower despite having the same 260px value. The manual drag resize still works and produces correct widths — the bug is only in the default/initial render.

## Known Bugs / Issues

### CRITICAL: Last 2 Kanban Columns Render Narrower Than Specified
**Status:** Unresolved after multiple attempts.
**Symptom:** All 6 columns are set to `colWidths` of 260px with `flex: 0 0 260px` styling. The first 4 columns (Inbox, Today, Wait/Delegate, Tomorrow) render correctly. The last 2 (This Week, Later) render visibly narrower (~150-160px) despite having identical CSS.
**What was tried:**
1. Flex ratios (1.4:0.7, then 3:1) — no visible effect due to `truncate` class on TaskCard
2. Removed `truncate` — text wraps, but columns still uneven
3. Per-column minWidth (200px vs 100px) — last 2 still narrower
4. Fixed pixel widths for all columns (260px each) — last 2 still narrower
5. `w-max` on flex container — no change
**Root cause unknown.** Manual drag resize produces correct equal widths, so the ResizeHandle + colWidths mechanism works. The issue is specific to the initial render. Likely a CSS/flex interaction that needs browser DevTools inspection to debug. Possibly the `flex` shorthand or the `data-col-wrapper` flex container nesting is causing unexpected behavior on the trailing columns.
**Suggested next step:** Open DevTools, inspect the actual computed styles on the last 2 column wrapper divs vs the first 4. Compare computed width, flex-basis, and any inherited constraints.

### Debug console.log in handleSave
- `console.log('💾 ...')` statements should be removed once save is confirmed stable

## Planned Features / Backlog
- Fix column width bug (see above)
- Remove debug console logs
- Verify Nico edit access end-to-end

## Design Decisions & Constraints
- **Text wrapping over truncation** — Task titles now wrap naturally. Brian preferred the "card" feel over single-line truncated bars.
- **Manual resize persists in state** — colWidths stored in Zustand state (ephemeral per session, not persisted to Firestore)
- **Bucket rename** — "Waiting / Delegated" shortened to "Wait / Delegate" for space
- **Column header nowrap** — Headers use whitespace-nowrap to prevent wrapping on narrower columns
- **node_modules.nosync pattern** — symlink to avoid iCloud sync

## Environment & Config
- **Production URL:** https://things-app-gamma.vercel.app
- **GitHub:** github.com/brhecht/things-app
- **Firebase project:** b-things
- **Firestore collections:** tasks, projects, tasks/{taskId}/messages
- **Notification endpoint:** https://brain-inbox-six.vercel.app/api/handoff-notify
- **Allowed emails:** brhnyc1970@gmail.com, nico@humbleconviction.com, nmejiawork@gmail.com

## Open Questions / Decisions Pending
- Why do the last 2 kanban columns render narrower than specified? Needs DevTools debugging.
- Should colWidths be persisted to Firestore so column sizes survive page refresh?

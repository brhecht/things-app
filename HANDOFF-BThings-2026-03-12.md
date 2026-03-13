# HANDOFF — B Things
*Last updated: March 12, 2026 ~9:30 PM ET*

## Project Overview
B Things is a personal kanban task manager built for Brian as part of the B-Suite family of apps. Tasks live in Firestore, organized by projects and time-based buckets (inbox, today, waiting/delegated, tomorrow, this week, later). Supports priorities, tags, due dates, notes, messages with @mentions, and starring. Nico now has full read-write collaborator access (upgraded from viewer on March 10).

## Tech Stack
- **Frontend:** React 18, Zustand (state), Tailwind CSS 3, Vite 5
- **Backend:** Firebase Firestore (real-time sync), Firebase Auth (Google sign-in)
- **API routes:** Vercel serverless functions (`/api/` directory)
- **PWA:** vite-plugin-pwa with service worker (NetworkFirst for assets, skipWaiting + clientsClaim)
- **Hosting:** Vercel (deploy via deploy hook — auto-deploys may be blocked)
- **Repo:** github.com/brhecht/things-app
- **Local path:** `~/Developer/B-Suite/things-app`

## Folder Structure
```
things-app/
├── src/
│   ├── App.jsx                  — Main app, separate mobile/desktop render paths
│   ├── AppSwitcher.jsx          — BSuite nav bar (HC Funnel removed March 10)
│   ├── store.js                 — Zustand store: auth, projects, tasks, undo, dataUid pattern
│   ├── firebase.js              — Firebase config, Firestore helpers + message helpers
│   ├── users.js                 — User registry (Brian, Nico x2) with handles, Slack IDs, colors
│   ├── main.jsx                 — Entry point
│   ├── index.css                — Tailwind base + animations + touch optimizations
│   ├── hooks/
│   │   └── useIsMobile.js       — Mobile detection hook (768px breakpoint)
│   └── components/
│       ├── KanbanBoard.jsx      — Desktop board: columns by bucket, drag-drop, resizable
│       ├── AgendaView.jsx       — Desktop agenda/list view grouped by bucket
│       ├── CompletedView.jsx    — Shows completed tasks with uncomplete button
│       ├── MobileAgendaView.jsx — Mobile task list with SwipeableTaskCard
│       ├── MobileBottomNav.jsx  — Bottom tab bar: Inbox, Today, All, Projects, Done
│       ├── MobileQuickAdd.jsx   — Sticky quick-add input bar above bottom nav
│       ├── MobileProjectList.jsx— Mobile project browser with task counts
│       ├── TaskCard.jsx         — Task card with star, unread blue dot, green notes dot
│       ├── TaskModal.jsx        — Edit modal: done checkbox, star toggle, notes, messages
│       ├── NoteThread.jsx       — iMessage-style chat with @mention notifications
│       ├── Sidebar.jsx          — Collapsible desktop sidebar: projects, filters
│       └── SignInPage.jsx       — Google sign-in page
├── api/
│   ├── add-task.js              — External task creation API (Eddy integration)
│   ├── projects.js              — List all projects API (for Eddy project selector)
│   ├── notify.js                — Generic notification proxy to brain-inbox
│   ├── notify-nico.js           — Legacy Nico notification proxy
│   ├── content-today.js         — Daily content-to-task sync via Vercel cron
│   └── slack.js                 — Slack bot: add tasks with --bucket, --project, --notes
├── public/                      — PWA manifest + icons
├── firebase.json                — Points to shared ../firestore.rules
├── vercel.json                  — Cron config
└── package.json
```

## Current Status

### Working
- Full kanban board (desktop) with drag-drop between buckets and projects
- Agenda view (desktop + mobile), Completed tasks view
- PWA with service worker and standalone display mode
- Mobile-first layout with bottom nav, swipe gestures, quick-add
- Notes field (auto-expanding textarea, saves on blur)
- Messages (NoteThread) — iMessage-style chat with @mention autocomplete and notifications
- Two-way messaging: @brian and @nico mentions both trigger notifications to correct recipient
- Unread message indicator (blue dot on TaskCard)
- Done checkbox + Star toggle in TaskModal title bar
- Enter saves modal everywhere except notes, messages, and tag input
- Deep-link URLs (?task=docId)
- Real-time Firestore sync
- Nico has full read-write collaborator access (dataUid pattern)
- Undo system (Ctrl+Z / ⌘+Z, 30 levels deep)
- Slack bot task creation
- Content Calendar → B Things daily sync
- Cross-app task creation API (Eddy → B Things via /api/add-task + /api/projects)

## Recent Changes (March 8–10, 2026)

### 1. Nico Upgraded to Full Collaborator (March 10)
- Added nmejiawork@gmail.com to ALLOWED_COLLABORATORS in store.js
- Introduced `dataUid` pattern: collaborators write to owner's Firestore path (users/{ownerUid}/...)
- Removed all isViewer write guards — Nico can create, edit, delete tasks and projects
- UI shows "Brian's workspace" banner for collaborators

### 2. Two-Way Messaging (March 9)
- Created /api/notify (generic notification proxy, replaces hardcoded /api/notify-nico)
- NoteThread now sends notifications for any @mentioned user, not just @nico
- Brain-inbox handoff-notify.js routes per recipient: Nico → channel, Brian → DM

### 3. TaskModal UX Improvements (March 10)
- Added done checkbox and star toggle to modal title bar
- Enter key saves modal everywhere except in notes textarea, messages, and tag input
- Prevented Enter from toggling done/star buttons (routes to save instead)
- Auto-expand notes textarea (removed max height cap)

### 4. Cross-App Task Creation API (March 10)
- Extended /api/add-task with notes, dueDate, projectId fields
- Created /api/projects endpoint — returns all projects with id, name, sortOrder
- Task ID prefix changed to "eddy-{timestamp}-{random}" for Eddy-created tasks
- PROJECT_MAP supports both name lookup and direct projectId

### 5. Shared Firestore Rules (March 9)
- Removed local firestore.rules (37 lines)
- firebase.json now points to ../firestore.rules (shared across B-Suite apps)

## Known Bugs / Issues
- Vercel auto-deploy possibly blocked — use Deploy Hook as workaround
- Vite chunk size warning (~680kB main JS bundle)
- Debug console.logs may still be present in various components
- Old /api/notify-nico.js is redundant now that /api/notify.js exists (cleanup candidate)

## Planned Features / Backlog
- Recurring tasks
- Task ordering / manual sort within buckets
- PWA offline support (currently NetworkFirst, no offline fallback)
- Code-splitting to reduce bundle size
- Clean up /api/notify-nico.js (replaced by /api/notify.js)

## Design Decisions & Constraints
- **dataUid pattern** — Collaborators (Nico) write to owner's (Brian's) Firestore paths. store.js resolves dataUid = ownerUid for collaborators, dataUid = user.uid for owner
- **Notes vs Messages split** — Notes is plain-text scratch pad. Messages is threaded chat with @mention notifications. Prevents "editing re-sends notification" bug
- **Notifications only on handleSend** — Critical: notifications fire ONLY in NoteThread.handleSend (new message creation), NEVER in TaskModal.handleSave
- **Per-recipient notification routing** — /api/notify proxies to brain-inbox handoff-notify, which routes Nico → channel, Brian → DM
- **Shared Firestore rules** — firebase.json points to ../firestore.rules (centralized for B-Suite)
- **addTask store signature:** addTask(title, projectId, bucket) — positional args, NOT an object
- **Separate mobile/desktop render paths** (not CSS-responsive)

## Environment & Config
- **Production URL:** https://things-app-gamma.vercel.app
- **Deploy Hook:** https://api.vercel.com/v1/integrations/deploy/prj_O3xX3xAvKLnQAfuF75dhyAEIG43b/fnvcwncXfs
- **GitHub:** github.com/brhecht/things-app
- **Firebase project:** b-things
- **Firestore structure:** users/{uid}/tasks/{taskId}, users/{uid}/tasks/{taskId}/messages/{msgId}, users/{uid}/projects/{projectId}
- **Brain Inbox endpoint:** https://brain-inbox-six.vercel.app/api/handoff-notify
- **Vercel cron:** api/content-today runs daily at 12:00 UTC (7am ET)
- **Env vars:** VITE_FIREBASE_*, FIREBASE_SERVICE_ACCOUNT, API_SECRET, CRON_SECRET, OWNER_UID, SLACK_BOT_TOKEN, OWNER_SLACK_ID

## Open Questions / Decisions Pending
- Investigate root cause of Vercel auto-deploy blocking
- Should /api/notify-nico.js be removed now that /api/notify.js exists?
- Clean up debug console.logs across components

# HANDOFF — B Things
*Last updated: March 2, 2026*

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
│   ├── App.jsx              # Main layout: sidebar + board/agenda toggle + AppSwitcher
│   ├── AppSwitcher.jsx      # BSuite nav bar across all apps
│   ├── store.js             # Zustand store: auth, projects, tasks, all actions, Firestore sync
│   ├── firebase.js          # Firebase config and Firestore helpers
│   ├── main.jsx             # Entry point
│   ├── index.css            # Tailwind base styles
│   └── components/
│       ├── Sidebar.jsx      # Collapsible sidebar: project list (draggable reorder), filters
│       ├── KanbanBoard.jsx  # Main board: columns by bucket, project groups, drag-and-drop
│       ├── AgendaView.jsx   # Alternative list view grouped by bucket
│       ├── TaskCard.jsx     # Individual task card (draggable, star, complete, delete)
│       ├── TaskModal.jsx    # Edit task: title, notes, priority, project, bucket, due date, tags
│       └── SignInPage.jsx   # Google sign-in page
├── api/
│   ├── slack.js             # Slack bot integration (add tasks via Slack)
│   └── add-task.js          # API endpoint for adding tasks programmatically
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## Current Status
Fully functional and deployed. All core features working:
- Kanban board with 6 columns (Inbox → Today → Waiting/Delegated → Tomorrow → This Week → Later)
- Agenda (list) view as alternative
- Project-based grouping with colored headers
- Drag tasks between columns (changes bucket, retains project)
- Drag tasks onto project groups (changes project + bucket)
- Drag-to-reorder projects in sidebar (persisted to Firestore via `sortOrder` field)
- Collapsible sidebar for mobile
- Star/priority system, filters, task modal with full editing
- Viewer mode for Nico (read-only)
- Slack bot integration for adding tasks
- BSuite app switcher bar

## Recent Changes (This Session)
1. **Collapsible sidebar** — Chevron toggle collapses sidebar to narrow strip showing project color dots. Expands back on click. CSS transition animation.
2. **Waiting / Delegated column** — New amber-colored bucket between Today and Tomorrow. Added to KanbanBoard, AgendaView, and TaskModal bucket dropdown.
3. **Drag-to-project on the board** — `ProjectDropGroup` component wraps entire project region (header + cards) as a drop target. Dropping a task on any part of a project group reassigns it to that project + bucket. No more cluttered "move to project" list during drag.
4. **Drag-to-reorder projects in sidebar** — Projects have grip handles (⠿) and can be dragged to reorder. Uses `sortOrder` field persisted to Firestore. Order reflected everywhere: sidebar, board grouping, TaskModal dropdown, Agenda view.

Key architectural change: replaced hardcoded `PROJECT_ORDER` array with dynamic `sortOrder` field on project docs. `LEGACY_ORDER` array provides fallback for existing projects that don't have `sortOrder` yet.

## Known Bugs / Issues
- Vite build warning about chunk size >500kB (the main JS bundle is ~640kB). Not critical but could benefit from code-splitting.
- No mobile-responsive layout beyond the collapsible sidebar. Horizontal scrolling still needed on small screens for the board itself.

## Planned Features / Backlog
- Full mobile optimization for BSuite apps (mentioned by Brian as a bigger project)
- Potential code-splitting to reduce bundle size

## Design Decisions & Constraints
- **Single-owner model:** Brian is the sole owner (brhnyc1970@gmail.com). Nico is an allowed viewer. Auth checks happen in `store.js` via `OWNER_EMAIL` and `ALLOWED_VIEWERS`.
- **Optimistic UI:** `reorderProjects` updates local state immediately, then persists to Firestore. Firestore listener will re-fire but state is already correct.
- **Project colors are hardcoded** in `PROJECT_COLORS` and `DOT_COLORS` maps in Sidebar.jsx and KanbanBoard.jsx. New projects get generic gray.
- **Bucket = time horizon, Project = category.** Tasks live at the intersection. Dragging between columns changes bucket; dragging onto a project group changes project (and bucket if cross-column).
- **`sortOrder` migration:** Existing projects without `sortOrder` fall back to `LEGACY_ORDER` index. Once any reorder happens, all projects get explicit `sortOrder` values.

## Environment & Config
- Firebase config via Vite env vars: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
- Deployed on Vercel, auto-deploys from `main` branch on GitHub: `github.com/brhecht/things-app`
- Firestore structure: `users/{uid}/projects/{projectId}` and `users/{uid}/tasks/{taskId}`

## Open Questions / Decisions Pending
None currently.

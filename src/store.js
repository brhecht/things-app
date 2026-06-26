import { create } from 'zustand'
import {
  auth,
  signInWithGoogle,
  logOut,
  onAuthStateChanged,
  subscribeTasks,
  subscribeProjects,
  upsertTask,
  removeTask,
  upsertProject,
  removeProject,
  batchUpsertTasks,
  batchUpsertProjects,
  saveOwnerUid,
  getOwnerUid,
  getMigrationsDoc,
  setMigrationFlag,
  registerViewer,
} from './firebase'

// ── Sharing config ──────────────────────────────────────────────
const OWNER_EMAIL = 'brhnyc1970@gmail.com'
const ALLOWED_COLLABORATORS = ['nico@humbleconviction.com', 'nmejiawork@gmail.com']

let counter = 1
const uid = () => `id-${Date.now()}-${counter++}`

// ── One-time TNB reorder (Task 3) ────────────────────────────────
// TNB block pinned on top in current visual order (Admin, Content, Growth,
// Revenue); everything else descending by task frequency (snapshot 2026-06-09).
// Persisted once via appConfig/migrations.tnbReorder2026 so it never overrides
// a later manual drag-reorder. Session guard avoids re-reading every snapshot.
const TNB_ORDER = {
  'hc-admin': 0, 'hc-content': 1, 'id-1779739492055-1': 2, 'hc-revenue': 3,
  'from-nico': 4, 'id-1772142500118-1': 5, 'network': 6, 'life-admin': 7,
  'personal-finance': 8, 'id-1772471089249-4': 9, 'id-1772471094681-5': 10,
  'id-1772480834448-1': 11, 'friends': 12, 'infra': 13, 'id-1780351450507-1': 14,
  'georgetown': 15, 'portfolio': 16, 'id-1772489672103-1': 17, 'id-1772719720553-1': 18,
}
let _tnbReorderChecked = false
async function maybeApplyTnbReorder(userId, projects) {
  if (_tnbReorderChecked) return
  _tnbReorderChecked = true
  try {
    const flags = await getMigrationsDoc()
    if (flags.tnbReorder2026) return
    const updates = projects
      .filter((p) => p.id in TNB_ORDER)
      .map((p) => ({ id: p.id, sortOrder: TNB_ORDER[p.id] }))
    if (updates.length) await batchUpsertProjects(userId, updates)
    await setMigrationFlag('tnbReorder2026')
  } catch (e) {
    _tnbReorderChecked = false // allow retry next session on failure
  }
}

// ── One-time lane-model v2 (June 2026) ────────────────────────
// Tomorrow folds into Today (the date engine handles near-term timing); the old
// "Later" bucket (string 'someday') becomes the new live "Anytime" backlog,
// which frees 'someday' to mean a genuinely parked "Someday". Prod + owner only,
// guarded by appConfig/migrations.laneModelV2 so it runs exactly once.
let _laneModelV2Checked = false
async function maybeApplyLaneModelV2(userId, tasks) {
  if (_laneModelV2Checked) return
  _laneModelV2Checked = true
  try {
    const flags = await getMigrationsDoc()
    if (flags.laneModelV2) return
    const updates = []
    tasks.forEach((t) => {
      if (t.bucket === 'tomorrow') updates.push({ ...t, bucket: 'today' })
      else if (t.bucket === 'someday') updates.push({ ...t, bucket: 'anytime' })
    })
    if (updates.length) await batchUpsertTasks(userId, updates)
    await setMigrationFlag('laneModelV2')
  } catch (e) {
    _laneModelV2Checked = false // allow retry next session on failure
  }
}

// Fallback display order for projects that don't have a sortOrder yet
const LEGACY_ORDER = [
  'hc-admin', 'hc-content', 'hc-revenue', 'portfolio',
  'life-admin', 'personal-finance', 'network', 'georgetown', 'friends',
  'from-nico', 'infra', 'unassigned',
]

// Default projects for brand-new users (first sign-in)
const SEED_PROJECTS = [
  { id: 'hc-admin',         name: 'TNB Admin',         sortOrder: 0 },
  { id: 'hc-content',       name: 'TNB Content',       sortOrder: 1 },
  { id: 'hc-revenue',       name: 'TNB Revenue',       sortOrder: 2 },
  { id: 'portfolio',        name: 'Portfolio',          sortOrder: 3 },
  { id: 'life-admin',       name: 'Life Admin',        sortOrder: 4 },
  { id: 'personal-finance', name: 'Personal Finance',  sortOrder: 5 },
  { id: 'network',          name: 'Network',           sortOrder: 6 },
  { id: 'georgetown',       name: 'Georgetown',        sortOrder: 7 },
  { id: 'friends',          name: 'Friends',            sortOrder: 8 },
  { id: 'infra',            name: 'Infra',             sortOrder: 9 },
  { id: 'misc',             name: 'Misc',              sortOrder: 10 },
]

const SEED_TASKS = [
  { id: 't1', title: 'Send HC invoice',              projectId: 'hc-admin',         bucket: 'today',    priority: 'high',   notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't2', title: 'Draft newsletter',             projectId: 'hc-content',       bucket: 'today',    priority: 'medium', notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't3', title: 'Review revenue dashboard',     projectId: 'hc-revenue',       bucket: 'today',    priority: 'high',   notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't4', title: 'Update portfolio case study',  projectId: 'portfolio',        bucket: 'today',    priority: null,     notes: '', tags: [], starred: true,  completed: false, createdAt: Date.now() },
  { id: 't5', title: 'Review credit card statement', projectId: 'personal-finance', bucket: 'soon',     priority: 'medium', notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't6', title: 'Schedule dentist appointment', projectId: 'life-admin',       bucket: 'anytime',  priority: null,     notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't7', title: 'Georgetown alumni event',      projectId: 'georgetown',       bucket: 'someday',  priority: 'low',    notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't8', title: 'Plan dinner with Sarah',       projectId: 'friends',          bucket: 'soon',     priority: null,     notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
]

const useStore = create((set, get) => ({
  // ── Auth state ────────────────────────────────────────────────
  user: null,
  authLoading: true,
  isViewer: false,   // true when a collaborator is looking at the owner's data
  dataUid: null,     // the UID whose Firestore data we read/write (owner's UID for collaborators)

  // ── Data ──────────────────────────────────────────────────────
  projects: [],
  tasks: [],
  selectedProjectId: null,

  // ── Internal: raw (unfiltered) snapshots from Firestore ───────
  // For owner, raw === projects/tasks. For viewer, raw is the full
  // dataset and projects/tasks are filtered (hiddenFromViewers).
  _rawProjects: [],
  _rawTasks: [],

  // ── Undo stack ───────────────────────────────────────────────
  _undoStack: [],   // [{ type: 'update'|'delete', snapshot: {...} }]
  _undoToast: null, // string message to show, or null

  // ── Internal: Firestore unsubscribers ─────────────────────────
  _unsubTasks: null,
  _unsubProjects: null,

  // ── Auth actions ──────────────────────────────────────────────
  signIn: async () => {
    await signInWithGoogle()
  },

  signOut: async () => {
    // Clean up listeners
    const { _unsubTasks, _unsubProjects } = get()
    if (_unsubTasks) _unsubTasks()
    if (_unsubProjects) _unsubProjects()
    await logOut()
    set({ user: null, isViewer: false, dataUid: null, tasks: [], projects: [], _rawTasks: [], _rawProjects: [], selectedProjectId: null, _unsubTasks: null, _unsubProjects: null })
  },

  /** Call once at app startup to listen to auth changes. */
  initAuth: () => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email?.toLowerCase()

        if (email === OWNER_EMAIL) {
          // Owner: save UID for collaborators to find, then sync own data
          await saveOwnerUid(firebaseUser.uid)
          set({ user: firebaseUser, authLoading: false, isViewer: false, dataUid: firebaseUser.uid })
          get()._startSync(firebaseUser.uid)

        } else if (ALLOWED_COLLABORATORS.includes(email)) {
          // Collaborator: find the owner's UID and subscribe to their data (full read-write)
          const ownerUid = await getOwnerUid()
          if (ownerUid) {
            await registerViewer(ownerUid, firebaseUser.uid)
            set({ user: firebaseUser, authLoading: false, isViewer: true, dataUid: ownerUid })
            get()._startSync(ownerUid)
          } else {
            set({ user: firebaseUser, authLoading: false, isViewer: true, dataUid: null })
          }

        } else {
          // Unknown user: reject access
          await logOut()
          set({ user: null, authLoading: false, isViewer: false, dataUid: null })
        }
      } else {
        set({ user: null, authLoading: false, isViewer: false, dataUid: null, tasks: [], projects: [], _rawTasks: [], _rawProjects: [] })
      }
    })
  },

  /** Internal: wire up Firestore real-time listeners. */
  _startSync: (userId) => {
    // Clean up any previous listeners
    const { _unsubTasks, _unsubProjects } = get()
    if (_unsubTasks) _unsubTasks()
    if (_unsubProjects) _unsubProjects()

    let projectsLoaded = false

    const unsubProjects = subscribeProjects(userId, (projects) => {
      // If first load comes back empty, seed with defaults
      if (!projectsLoaded && projects.length === 0) {
        projectsLoaded = true
        batchUpsertProjects(userId, SEED_PROJECTS)
        batchUpsertTasks(userId, SEED_TASKS)
        return // The snapshot listener will fire again with the seeded data
      }
      projectsLoaded = true

      // One-time: add Network project if it doesn't exist yet
      if (!projects.find((p) => p.id === 'network')) {
        upsertProject(userId, { id: 'network', name: 'Network' })
        return // snapshot will re-fire with the new project
      }

      // One-time: add From Nico project if it doesn't exist yet
      if (!projects.find((p) => p.id === 'from-nico')) {
        upsertProject(userId, { id: 'from-nico', name: 'From Nico' })
        return // snapshot will re-fire with the new project
      }

      // One-time: add Unassigned project if it doesn't exist yet
      if (!projects.find((p) => p.id === 'unassigned')) {
        upsertProject(userId, { id: 'unassigned', name: 'Unassigned' })
        return // snapshot will re-fire with the new project
      }

      // One-time: add Infra project if it doesn't exist yet
      if (!projects.find((p) => p.id === 'infra')) {
        upsertProject(userId, { id: 'infra', name: 'Infra' })
        return // snapshot will re-fire with the new project
      }

      // ── One-time TNB rebrand: rename HC/Humble projects (idempotent) ──
      // Production host + owner only. Renames by stable id and only when the
      // current name still matches the old label, so it never fights a later
      // manual rename and is safe to leave in place permanently.
      const onProdHost = typeof window !== 'undefined' && window.location.hostname === 'things-app-gamma.vercel.app'
      if (onProdHost && !get().isViewer) {
        const TNB_RENAMES = {
          'hc-admin':            { from: 'Humble Admin', to: 'TNB Admin' },
          'hc-content':          { from: 'HC Content',   to: 'TNB Content' },
          'hc-revenue':          { from: 'HC Revenue',   to: 'TNB Revenue' },
          'id-1779739492055-1':  { from: 'HC Growth',    to: 'TNB Growth' },
        }
        let _renamed = false
        projects.forEach((p) => {
          const r = TNB_RENAMES[p.id]
          if (r && p.name === r.from) { upsertProject(userId, { ...p, name: r.to }); _renamed = true }
        })
        if (_renamed) return // snapshot re-fires with renamed data
      }

      // Task 3: one-time frequency reorder (prod + owner only, guarded marker)
      if (onProdHost && !get().isViewer) maybeApplyTnbReorder(userId, projects)

      // Sort projects by sortOrder (falling back to legacy order for projects without one)
      projects.sort((a, b) => {
        const ao = a.sortOrder != null ? a.sortOrder : (LEGACY_ORDER.indexOf(a.id) !== -1 ? LEGACY_ORDER.indexOf(a.id) : 999)
        const bo = b.sortOrder != null ? b.sortOrder : (LEGACY_ORDER.indexOf(b.id) !== -1 ? LEGACY_ORDER.indexOf(b.id) : 999)
        return ao - bo
      })

      // Per-viewer visibility filter (cognitive-load filter, not security).
      // Owner sees everything (raw === visible). Viewer (Nico) sees only
      // projects without hiddenFromViewers === true. Tasks are re-filtered
      // from _rawTasks against the new visible-project set so that toggling
      // a project's hidden flag instantly restores/removes its tasks too.
      const { isViewer, _rawTasks } = get()
      const visibleProjects = isViewer
        ? projects.filter((p) => !p.hiddenFromViewers)
        : projects
      const visibleProjectIds = new Set(visibleProjects.map((p) => p.id))
      const visibleTasks = isViewer
        ? _rawTasks.filter((t) => !t.projectId || visibleProjectIds.has(t.projectId))
        : _rawTasks
      set({ _rawProjects: projects, projects: visibleProjects, tasks: visibleTasks })
    })

    const unsubTasks = subscribeTasks(userId, (tasks) => {
      // Auto-fix tasks with no project — assign to "unassigned"
      tasks.forEach((t) => {
        if (!t.projectId) {
          upsertTask(userId, { ...t, projectId: 'unassigned' })
        }
      })

      // ── One-time: retire the Eddy category (Eddy business killed Apr 2026) ──
      // Prod host + owner only. Reassign Eddy's tasks to Unassigned FIRST; only
      // once none remain do we delete the project doc — guarantees no task is
      // ever orphaned to a deleted project. Idempotent: no Eddy tasks + no Eddy
      // project = no-op.
      {
        const onProdHost = typeof window !== 'undefined' && window.location.hostname === 'things-app-gamma.vercel.app'
        if (onProdHost && !get().isViewer) {
          const EDDY_ID = 'id-1773186280183-1'
          const eddyTasks = tasks.filter((t) => t.projectId === EDDY_ID)
          if (eddyTasks.length > 0) {
            eddyTasks.forEach((t) => upsertTask(userId, { ...t, projectId: 'unassigned' }))
          } else if (get()._rawProjects.find((p) => p.id === EDDY_ID)) {
            removeProject(userId, EDDY_ID)
          }
        }
      }

      // Filter against the current visible-project set (see _startSync notes).
      const { isViewer, projects: currentVisibleProjects } = get()
      const visibleProjectIds = new Set(currentVisibleProjects.map((p) => p.id))
      const visibleTasks = isViewer
        ? tasks.filter((t) => !t.projectId || visibleProjectIds.has(t.projectId))
        : tasks
      // ── One-time lane-model v2 migration (tomorrow→today, Later→Anytime) ──
      {
        const onProdHost = typeof window !== 'undefined' && window.location.hostname === 'things-app-gamma.vercel.app'
        if (onProdHost && !get().isViewer) maybeApplyLaneModelV2(userId, tasks)
      }

      set({ _rawTasks: tasks, tasks: visibleTasks })
    })

    set({ _unsubTasks: unsubTasks, _unsubProjects: unsubProjects })
  },

  // ── Project actions ──────────────────────────────────────────
  addProject: (name) => {
    const { user, dataUid } = get()
    if (!user || !dataUid) return
    const project = { id: uid(), name }
    upsertProject(dataUid, project)
    // Firestore listener will update the store
  },

  renameProject: (id, name) => {
    const { user, dataUid, projects } = get()
    if (!user || !dataUid) return
    const proj = projects.find((p) => p.id === id)
    if (proj) upsertProject(dataUid, { ...proj, name })
  },

  deleteProject: (id) => {
    const { user, dataUid, tasks, selectedProjectId } = get()
    if (!user || !dataUid) return
    removeProject(dataUid, id)
    // Also delete all tasks in that project
    tasks.filter((t) => t.projectId === id).forEach((t) => removeTask(dataUid, t.id))
    if (selectedProjectId === id) set({ selectedProjectId: null })
  },

  /**
   * Toggle hiddenFromViewers on a project. Owner-only action — when true,
   * the project and all its tasks disappear from Nico's view. This is a
   * cognitive-load filter, not access control: viewers still have Firestore
   * read/write at the DB level. Defaults to off for new projects.
   */
  toggleProjectHidden: (id) => {
    const { user, dataUid, isViewer, _rawProjects, projects } = get()
    if (!user || !dataUid || isViewer) return
    // Owner sees full list in `projects`, but _rawProjects is the source of truth.
    const proj = _rawProjects.find((p) => p.id === id) || projects.find((p) => p.id === id)
    if (!proj) return
    upsertProject(dataUid, { ...proj, hiddenFromViewers: !proj.hiddenFromViewers })
  },

  // ── Undo helpers ──────────────────────────────────────────────
  _pushUndo: (type, snapshot, label) => {
    const stack = [...get()._undoStack, { type, snapshot, label }].slice(-30) // cap at 30
    set({ _undoStack: stack })
  },

  undo: () => {
    const { user, dataUid, _undoStack } = get()
    if (!user || !dataUid || _undoStack.length === 0) return
    const stack = [..._undoStack]
    const entry = stack.pop()
    set({ _undoStack: stack })
    if (entry.type === 'delete') {
      upsertTask(dataUid, entry.snapshot)
    } else {
      upsertTask(dataUid, entry.snapshot)
    }
    set({ _undoToast: `Undid: ${entry.label}` })
    setTimeout(() => set({ _undoToast: null }), 2000)
  },

  dismissToast: () => set({ _undoToast: null }),

  // ── Task actions ─────────────────────────────────────────────
  addTask: (title, projectId, bucket = 'today') => {
    const { user, dataUid } = get()
    if (!user || !dataUid) return null
    const task = {
      id: uid(),
      title,
      projectId,
      bucket,
      priority: null,
      notes: '',
      tags: [],
      starred: false,
      completed: false,
      createdAt: Date.now(),
    }
    upsertTask(dataUid, task)
    return task
  },

  updateTask: (id, updates) => {
    const { user, dataUid, tasks } = get()
    if (!user || !dataUid) return
    const existing = tasks.find((t) => t.id === id)
    if (existing) {
      // Determine a human-readable label for the undo toast
      let label = 'edit'
      if ('completed' in updates) label = updates.completed ? 'complete' : 'uncomplete'
      else if ('starred' in updates) label = updates.starred ? 'star' : 'unstar'
      else if ('bucket' in updates && 'projectId' in updates) label = 'move'
      else if ('bucket' in updates) label = 'move'
      else if ('projectId' in updates) label = 'reassign'
      get()._pushUndo('update', { ...existing }, label)
      // Optimistic local update — reflect change immediately before Firestore round-trip
      const updated = { ...existing, ...updates }
      set({ tasks: tasks.map((t) => (t.id === id ? updated : t)) })
      upsertTask(dataUid, updated)
    }
  },

  deleteTask: (id) => {
    const { user, dataUid, tasks } = get()
    if (!user || !dataUid) return
    const existing = tasks.find((t) => t.id === id)
    if (existing) get()._pushUndo('delete', { ...existing }, 'delete')
    removeTask(dataUid, id)
  },

  moveTask: (id, bucket) => {
    const { user, dataUid, tasks } = get()
    if (!user || !dataUid) return
    const existing = tasks.find((t) => t.id === id)
    if (existing) {
      get()._pushUndo('update', { ...existing }, 'move')
      upsertTask(dataUid, { ...existing, bucket })
    }
  },

  reorderProjects: (fromIndex, toIndex) => {
    const { user, dataUid, projects } = get()
    if (!user || !dataUid) return
    const reordered = [...projects]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    // Assign new sortOrder values and persist each
    reordered.forEach((proj, i) => {
      upsertProject(dataUid, { ...proj, sortOrder: i })
    })
    // Optimistically update local state
    set({ projects: reordered })
  },

  // ── UI ────────────────────────────────────────────────────────
  setSelectedProject: (id) => set({ selectedProjectId: id }),
}))

export default useStore

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
  registerViewer,
} from './firebase'

// ── Sharing config ──────────────────────────────────────────────
const OWNER_EMAIL = 'brhnyc1970@gmail.com'
const ALLOWED_VIEWERS = ['nico@humbleconviction.com']

let counter = 1
const uid = () => `id-${Date.now()}-${counter++}`

// Fallback display order for projects that don't have a sortOrder yet
const LEGACY_ORDER = [
  'hc-admin', 'hc-content', 'hc-revenue', 'portfolio',
  'life-admin', 'personal-finance', 'network', 'georgetown', 'friends',
  'from-nico', 'unassigned',
]

// Default projects for brand-new users (first sign-in)
const SEED_PROJECTS = [
  { id: 'hc-admin',         name: 'Humble Admin',      sortOrder: 0 },
  { id: 'hc-content',       name: 'HC Content',        sortOrder: 1 },
  { id: 'hc-revenue',       name: 'HC Revenue',        sortOrder: 2 },
  { id: 'portfolio',        name: 'Portfolio',          sortOrder: 3 },
  { id: 'life-admin',       name: 'Life Admin',        sortOrder: 4 },
  { id: 'personal-finance', name: 'Personal Finance',  sortOrder: 5 },
  { id: 'network',          name: 'Network',           sortOrder: 6 },
  { id: 'georgetown',       name: 'Georgetown',        sortOrder: 7 },
  { id: 'friends',          name: 'Friends',            sortOrder: 8 },
  { id: 'misc',             name: 'Misc',              sortOrder: 9 },
]

const SEED_TASKS = [
  { id: 't1', title: 'Send HC invoice',              projectId: 'hc-admin',         bucket: 'today',    priority: 'high',   notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't2', title: 'Draft newsletter',             projectId: 'hc-content',       bucket: 'today',    priority: 'medium', notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't3', title: 'Review revenue dashboard',     projectId: 'hc-revenue',       bucket: 'tomorrow', priority: 'high',   notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't4', title: 'Update portfolio case study',  projectId: 'portfolio',        bucket: 'tomorrow', priority: null,     notes: '', tags: [], starred: true,  completed: false, createdAt: Date.now() },
  { id: 't5', title: 'Review credit card statement', projectId: 'personal-finance', bucket: 'soon',     priority: 'medium', notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't6', title: 'Schedule dentist appointment', projectId: 'life-admin',       bucket: 'soon',     priority: null,     notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't7', title: 'Georgetown alumni event',      projectId: 'georgetown',       bucket: 'someday',  priority: 'low',    notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
  { id: 't8', title: 'Plan dinner with Sarah',       projectId: 'friends',          bucket: 'soon',     priority: null,     notes: '', tags: [], starred: false, completed: false, createdAt: Date.now() },
]

const useStore = create((set, get) => ({
  // ── Auth state ────────────────────────────────────────────────
  user: null,
  authLoading: true,
  isViewer: false,   // true when a viewer is looking at the owner's data

  // ── Data ──────────────────────────────────────────────────────
  projects: [],
  tasks: [],
  selectedProjectId: null,

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
    set({ user: null, isViewer: false, tasks: [], projects: [], selectedProjectId: null, _unsubTasks: null, _unsubProjects: null })
  },

  /** Call once at app startup to listen to auth changes. */
  initAuth: () => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email?.toLowerCase()

        if (email === OWNER_EMAIL) {
          // Owner: save UID for viewers to find, then sync own data
          await saveOwnerUid(firebaseUser.uid)
          set({ user: firebaseUser, authLoading: false, isViewer: false })
          get()._startSync(firebaseUser.uid)

        } else if (ALLOWED_VIEWERS.includes(email)) {
          // Viewer: find the owner's UID and subscribe to their data (read-only)
          const ownerUid = await getOwnerUid()
          if (ownerUid) {
            await registerViewer(ownerUid, firebaseUser.uid)
            set({ user: firebaseUser, authLoading: false, isViewer: true })
            get()._startSync(ownerUid)
          } else {
            set({ user: firebaseUser, authLoading: false, isViewer: true })
          }

        } else {
          // Unknown user: sign them in to their own empty space
          set({ user: firebaseUser, authLoading: false, isViewer: false })
          get()._startSync(firebaseUser.uid)
        }
      } else {
        set({ user: null, authLoading: false, isViewer: false, tasks: [], projects: [] })
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

      // Sort projects by sortOrder (falling back to legacy order for projects without one)
      projects.sort((a, b) => {
        const ao = a.sortOrder != null ? a.sortOrder : (LEGACY_ORDER.indexOf(a.id) !== -1 ? LEGACY_ORDER.indexOf(a.id) : 999)
        const bo = b.sortOrder != null ? b.sortOrder : (LEGACY_ORDER.indexOf(b.id) !== -1 ? LEGACY_ORDER.indexOf(b.id) : 999)
        return ao - bo
      })
      set({ projects })
    })

    const unsubTasks = subscribeTasks(userId, (tasks) => {
      // Auto-fix tasks with no project — assign to "unassigned"
      const { isViewer } = get()
      if (!isViewer) {
        tasks.forEach((t) => {
          if (!t.projectId) {
            upsertTask(userId, { ...t, projectId: 'unassigned' })
          }
        })
        }
      set({ tasks })
    })

    set({ _unsubTasks: unsubTasks, _unsubProjects: unsubProjects })
  },

  // ── Project actions (disabled for viewers) ─────────────────────
  addProject: (name) => {
    const { user, isViewer } = get()
    if (!user || isViewer) return
    const project = { id: uid(), name }
    upsertProject(user.uid, project)
    // Firestore listener will update the store
  },

  renameProject: (id, name) => {
    const { user, isViewer, projects } = get()
    if (!user || isViewer) return
    const proj = projects.find((p) => p.id === id)
    if (proj) upsertProject(user.uid, { ...proj, name })
  },

  deleteProject: (id) => {
    const { user, isViewer, tasks, selectedProjectId } = get()
    if (!user || isViewer) return
    removeProject(user.uid, id)
    // Also delete all tasks in that project
    tasks.filter((t) => t.projectId === id).forEach((t) => removeTask(user.uid, t.id))
    if (selectedProjectId === id) set({ selectedProjectId: null })
  },

  // ── Undo helpers ──────────────────────────────────────────────
  _pushUndo: (type, snapshot, label) => {
    const stack = [...get()._undoStack, { type, snapshot, label }].slice(-30) // cap at 30
    set({ _undoStack: stack })
  },

  undo: () => {
    const { user, isViewer, _undoStack } = get()
    if (!user || isViewer || _undoStack.length === 0) return
    const stack = [..._undoStack]
    const entry = stack.pop()
    set({ _undoStack: stack })
    if (entry.type === 'delete') {
      // Re-create the deleted task
      upsertTask(user.uid, entry.snapshot)
    } else {
      // Restore previous state
      upsertTask(user.uid, entry.snapshot)
    }
    set({ _undoToast: `Undid: ${entry.label}` })
    setTimeout(() => set({ _undoToast: null }), 2000)
  },

  dismissToast: () => set({ _undoToast: null }),

  // ── Task actions (disabled for viewers) ────────────────────────
  addTask: (title, projectId, bucket = 'today') => {
    const { user, isViewer } = get()
    if (!user || isViewer) return
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
    upsertTask(user.uid, task)
  },

  updateTask: (id, updates) => {
    const { user, isViewer, tasks } = get()
    if (!user || isViewer) return
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
      upsertTask(user.uid, { ...existing, ...updates })
    }
  },

  deleteTask: (id) => {
    const { user, isViewer, tasks } = get()
    if (!user || isViewer) return
    const existing = tasks.find((t) => t.id === id)
    if (existing) get()._pushUndo('delete', { ...existing }, 'delete')
    removeTask(user.uid, id)
  },

  moveTask: (id, bucket) => {
    const { user, isViewer, tasks } = get()
    if (!user || isViewer) return
    const existing = tasks.find((t) => t.id === id)
    if (existing) {
      get()._pushUndo('update', { ...existing }, 'move')
      upsertTask(user.uid, { ...existing, bucket })
    }
  },

  reorderProjects: (fromIndex, toIndex) => {
    const { user, isViewer, projects } = get()
    if (!user || isViewer) return
    const reordered = [...projects]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    // Assign new sortOrder values and persist each
    reordered.forEach((proj, i) => {
      upsertProject(user.uid, { ...proj, sortOrder: i })
    })
    // Optimistically update local state
    set({ projects: reordered })
  },

  // ── UI ────────────────────────────────────────────────────────
  setSelectedProject: (id) => set({ selectedProjectId: id }),
}))

export default useStore

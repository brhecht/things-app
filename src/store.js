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
const ALLOWED_COLLABORATORS = ['nico@humbleconviction.com', 'nmejiawork@gmail.com']

let counter = 1
const uid = () => `id-${Date.now()}-${counter++}`

// Fallback display order for projects that don't have a sortOrder yet
const LEGACY_ORDER = [
  'hc-admin', 'hc-content', 'hc-revenue', 'portfolio',
  'life-admin', 'personal-finance', 'network', 'georgetown', 'friends',
  'from-nico', 'infra', 'unassigned',
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
  { id: 'infra',            name: 'Infra',             sortOrder: 9 },
  { id: 'misc',             name: 'Misc',              sortOrder: 10 },
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
  isViewer: false,   // true when a collaborator is looking at the owner's data
  dataUid: null,     // the UID whose Firestore data we read/write (owner's UID for collaborators)

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
    set({ user: null, isViewer: false, dataUid: null, tasks: [], projects: [], selectedProjectId: null, _unsubTasks: null, _unsubProjects: null })
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
        set({ user: null, authLoading: false, isViewer: false, dataUid: null, tasks: [], projects: [] })
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
      tasks.forEach((t) => {
        if (!t.projectId) {
          upsertTask(userId, { ...t, projectId: 'unassigned' })
        }
      })
      set({ tasks })
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

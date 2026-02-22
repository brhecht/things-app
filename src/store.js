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

// Fixed display order for projects (sidebar + kanban lanes)
const PROJECT_ORDER = [
  'hc-admin', 'hc-content', 'hc-revenue', 'portfolio',
  'life-admin', 'personal-finance', 'network', 'georgetown', 'friends',
]

// Default projects for brand-new users (first sign-in)
const SEED_PROJECTS = [
  { id: 'hc-admin',         name: 'Humble Admin' },
  { id: 'hc-content',       name: 'HC Content' },
  { id: 'hc-revenue',       name: 'HC Revenue' },
  { id: 'portfolio',        name: 'Portfolio' },
  { id: 'life-admin',       name: 'Life Admin' },
  { id: 'personal-finance', name: 'Personal Finance' },
  { id: 'network',          name: 'Network' },
  { id: 'georgetown',       name: 'Georgetown' },
  { id: 'friends',          name: 'Friends' },
  { id: 'misc',             name: 'Misc' },
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

      // Sort projects by fixed display order
      projects.sort((a, b) => {
        const ai = PROJECT_ORDER.indexOf(a.id)
        const bi = PROJECT_ORDER.indexOf(b.id)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
      set({ projects })
    })

    const unsubTasks = subscribeTasks(userId, (tasks) => {
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
    if (existing) upsertTask(user.uid, { ...existing, ...updates })
  },

  deleteTask: (id) => {
    const { user, isViewer } = get()
    if (!user || isViewer) return
    removeTask(user.uid, id)
  },

  moveTask: (id, bucket) => {
    const { user, isViewer, tasks } = get()
    if (!user || isViewer) return
    const existing = tasks.find((t) => t.id === id)
    if (existing) upsertTask(user.uid, { ...existing, bucket })
  },

  // ── UI ────────────────────────────────────────────────────────
  setSelectedProject: (id) => set({ selectedProjectId: id }),
}))

export default useStore

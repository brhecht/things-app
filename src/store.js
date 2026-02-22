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
} from './firebase'

let counter = 1
const uid = () => `id-${Date.now()}-${counter++}`

// Default projects for brand-new users (first sign-in)
const SEED_PROJECTS = [
  { id: 'hc-admin',         name: 'HC Admin' },
  { id: 'hc-content',       name: 'HC Content' },
  { id: 'hc-revenue',       name: 'HC Revenue' },
  { id: 'portfolio',        name: 'Portfolio' },
  { id: 'personal-finance', name: 'Personal Finance' },
  { id: 'life-admin',       name: 'Life Admin' },
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
    set({ user: null, tasks: [], projects: [], selectedProjectId: null, _unsubTasks: null, _unsubProjects: null })
  },

  /** Call once at app startup to listen to auth changes. */
  initAuth: () => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        set({ user: firebaseUser, authLoading: false })
        // Start Firestore listeners
        get()._startSync(firebaseUser.uid)
      } else {
        set({ user: null, authLoading: false, tasks: [], projects: [] })
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
      // Sort projects to keep a stable order
      projects.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      set({ projects })
    })

    const unsubTasks = subscribeTasks(userId, (tasks) => {
      set({ tasks })
    })

    set({ _unsubTasks: unsubTasks, _unsubProjects: unsubProjects })
  },

  // ── Project actions ───────────────────────────────────────────
  addProject: (name) => {
    const { user } = get()
    if (!user) return
    const project = { id: uid(), name }
    upsertProject(user.uid, project)
    // Firestore listener will update the store
  },

  renameProject: (id, name) => {
    const { user, projects } = get()
    if (!user) return
    const proj = projects.find((p) => p.id === id)
    if (proj) upsertProject(user.uid, { ...proj, name })
  },

  deleteProject: (id) => {
    const { user, tasks, selectedProjectId } = get()
    if (!user) return
    removeProject(user.uid, id)
    // Also delete all tasks in that project
    tasks.filter((t) => t.projectId === id).forEach((t) => removeTask(user.uid, t.id))
    if (selectedProjectId === id) set({ selectedProjectId: null })
  },

  // ── Task actions ──────────────────────────────────────────────
  addTask: (title, projectId, bucket = 'today') => {
    const { user } = get()
    if (!user) return
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
    const { user, tasks } = get()
    if (!user) return
    const existing = tasks.find((t) => t.id === id)
    if (existing) upsertTask(user.uid, { ...existing, ...updates })
  },

  deleteTask: (id) => {
    const { user } = get()
    if (!user) return
    removeTask(user.uid, id)
  },

  moveTask: (id, bucket) => {
    const { user, tasks } = get()
    if (!user) return
    const existing = tasks.find((t) => t.id === id)
    if (existing) upsertTask(user.uid, { ...existing, bucket })
  },

  // ── UI ────────────────────────────────────────────────────────
  setSelectedProject: (id) => set({ selectedProjectId: id }),
}))

export default useStore

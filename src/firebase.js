import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'

// Reads from your .env file (see .env.example)
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

// ── Auth ─────────────────────────────────────────────────────────
const provider = new GoogleAuthProvider()

export const signInWithGoogle = () => signInWithPopup(auth, provider)
export const logOut = () => firebaseSignOut(auth)
export { onAuthStateChanged }

// ── Firestore helpers ────────────────────────────────────────────

/** Subscribe to a user's tasks in real time. Returns an unsubscribe fn. */
export function subscribeTasks(uid, callback) {
  return onSnapshot(collection(db, 'users', uid, 'tasks'), (snap) => {
    const tasks = []
    snap.forEach((d) => tasks.push({ id: d.id, ...d.data() }))
    callback(tasks)
  })
}

/** Subscribe to a user's projects in real time. Returns an unsubscribe fn. */
export function subscribeProjects(uid, callback) {
  return onSnapshot(collection(db, 'users', uid, 'projects'), (snap) => {
    const projects = []
    snap.forEach((d) => projects.push({ id: d.id, ...d.data() }))
    callback(projects)
  })
}

/** Create or update a single task. */
export function upsertTask(uid, task) {
  return setDoc(doc(db, 'users', uid, 'tasks', task.id), task, { merge: true })
}

/** Hard-delete a task. */
export function removeTask(uid, taskId) {
  return deleteDoc(doc(db, 'users', uid, 'tasks', taskId))
}

/** Create or update a single project. */
export function upsertProject(uid, project) {
  return setDoc(doc(db, 'users', uid, 'projects', project.id), project, { merge: true })
}

/** Hard-delete a project. */
export function removeProject(uid, projectId) {
  return deleteDoc(doc(db, 'users', uid, 'projects', projectId))
}

/** Batch-write tasks (handy for one-time migration from localStorage). */
export async function batchUpsertTasks(uid, tasks) {
  const batch = writeBatch(db)
  tasks.forEach((t) => batch.set(doc(db, 'users', uid, 'tasks', t.id), t, { merge: true }))
  await batch.commit()
}

/** Batch-write projects. */
export async function batchUpsertProjects(uid, projects) {
  const batch = writeBatch(db)
  projects.forEach((p) => batch.set(doc(db, 'users', uid, 'projects', p.id), p, { merge: true }))
  await batch.commit()
}

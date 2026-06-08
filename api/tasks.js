import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Read-only export of Brian's B Things tasks. Mirrors add-task.js auth + admin
// init exactly so it always uses the live Vercel credentials (immune to local
// service-account key rotations). This is the canonical way Cowork sessions read
// B Things — never hit Firestore directly from the sandbox (gRPC times out the
// 45s bash cap, and on-disk SA keys go stale on rotation).
//
//   GET /api/tasks?bucket=today&starred=1&completed=0
//   header: x-api-key: <API_SECRET>
//
// Query params (all optional):
//   bucket     — filter to a single When-bucket (today/tomorrow/soon/someday/waiting/inbox)
//   starred    — "1"/"true" → only starred; "0"/"false" → only un-starred; omit → both
//   completed  — "1"/"true" → only completed; default "0" → only open tasks
//   project    — filter to a single projectId
//   limit      — cap result count (default 500)

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    })
  }
  return getFirestore()
}

const truthy = (v) => v === '1' || v === 'true' || v === 'yes'
const falsy = (v) => v === '0' || v === 'false' || v === 'no'

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const apiKey = req.headers['x-api-key'] || req.query?.apiKey
    if (apiKey !== process.env.API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const db = getDb()
    const OWNER_UID = process.env.OWNER_UID
    const userRef = db.collection('users').doc(OWNER_UID)

    // Project id → name map for readable output.
    const projSnap = await userRef.collection('projects').get()
    const projects = {}
    projSnap.forEach((p) => { projects[p.id] = p.data().name || p.id })

    const { bucket, starred, completed, project, limit } = req.query

    let q = userRef.collection('tasks')
    if (bucket) q = q.where('bucket', '==', bucket)
    if (project) q = q.where('projectId', '==', project)

    const snap = await q.get()
    let rows = []
    snap.forEach((d) => {
      const t = d.data()
      rows.push({
        id: t.id,
        title: t.title,
        projectId: t.projectId,
        project: projects[t.projectId] || t.projectId,
        bucket: t.bucket,
        priority: t.priority || null,
        starred: !!t.starred,
        completed: !!t.completed,
        tags: Array.isArray(t.tags) ? t.tags : [],
        notes: (t.notes || '').trim(),
        dueDate: t.dueDate || null,
        assignedTo: t.assignedTo || null,
        createdAt: t.createdAt || null,
      })
    })

    // completed filter — default to open tasks only.
    if (truthy(completed)) rows = rows.filter((r) => r.completed)
    else if (!falsy(completed) && completed === undefined) rows = rows.filter((r) => !r.completed)
    else if (falsy(completed)) rows = rows.filter((r) => !r.completed)

    // starred filter — omit = both.
    if (truthy(starred)) rows = rows.filter((r) => r.starred)
    else if (falsy(starred)) rows = rows.filter((r) => !r.starred)

    rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    const max = parseInt(limit, 10) || 500
    rows = rows.slice(0, max)

    return res.status(200).json({ ok: true, count: rows.length, tasks: rows })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

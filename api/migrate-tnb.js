import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// One-shot TNB rebrand migration (Tasks 1-3). POST, x-api-key auth.
// Mirrors tasks.js admin init so it uses live Vercel credentials.
// Idempotent. TEMPORARY — removed right after the 2026-06-09 rebrand cutover.
//   POST /api/migrate-tnb   header: x-api-key: <API_SECRET>

function getDb() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
  }
  return getFirestore()
}

const TNB_RENAMES = {
  'hc-admin': 'TNB Admin',
  'hc-content': 'TNB Content',
  'hc-revenue': 'TNB Revenue',
  'id-1779739492055-1': 'TNB Growth',
}
const EDDY_ID = 'id-1773186280183-1'
const TNB_ORDER = {
  'hc-admin': 0, 'hc-content': 1, 'id-1779739492055-1': 2, 'hc-revenue': 3,
  'from-nico': 4, 'id-1772142500118-1': 5, 'network': 6, 'life-admin': 7,
  'personal-finance': 8, 'id-1772471089249-4': 9, 'id-1772471094681-5': 10,
  'id-1772480834448-1': 11, 'friends': 12, 'infra': 13, 'id-1780351450507-1': 14,
  'georgetown': 15, 'portfolio': 16, 'id-1772489672103-1': 17, 'id-1772719720553-1': 18,
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const apiKey = req.headers['x-api-key'] || req.query?.apiKey
    if (apiKey !== process.env.API_SECRET) return res.status(401).json({ error: 'Unauthorized' })

    const db = getDb()
    const OWNER_UID = process.env.OWNER_UID
    const userRef = db.collection('users').doc(OWNER_UID)
    const report = { renamed: [], eddyReassigned: 0, eddyDeleted: false, reordered: 0 }

    const projSnap = await userRef.collection('projects').get()
    const projects = {}
    projSnap.forEach((p) => { projects[p.id] = p.data() })

    // 1) Rename
    for (const [id, name] of Object.entries(TNB_RENAMES)) {
      if (projects[id] && projects[id].name !== name) {
        await userRef.collection('projects').doc(id).set({ name }, { merge: true })
        report.renamed.push({ id, from: projects[id].name, to: name })
      }
    }

    // 2) Eddy — reassign tasks to unassigned, then delete project
    const eddyTasksSnap = await userRef.collection('tasks').where('projectId', '==', EDDY_ID).get()
    if (!eddyTasksSnap.empty) {
      const batch = db.batch()
      eddyTasksSnap.forEach((d) => batch.set(d.ref, { projectId: 'unassigned' }, { merge: true }))
      await batch.commit()
      report.eddyReassigned = eddyTasksSnap.size
    }
    if (projects[EDDY_ID]) {
      await userRef.collection('projects').doc(EDDY_ID).delete()
      report.eddyDeleted = true
    }

    // 3) Reorder
    const reBatch = db.batch()
    for (const [id, sortOrder] of Object.entries(TNB_ORDER)) {
      if (projects[id]) { reBatch.set(userRef.collection('projects').doc(id), { sortOrder }, { merge: true }); report.reordered++ }
    }
    await reBatch.commit()
    await db.collection('appConfig').doc('migrations').set({ tnbReorder2026: true }, { merge: true })

    const finalSnap = await userRef.collection('projects').get()
    const final = []
    finalSnap.forEach((p) => { const d = p.data(); final.push({ id: p.id, name: d.name, sortOrder: d.sortOrder }) })
    final.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))

    return res.status(200).json({ ok: true, report, finalProjects: final })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

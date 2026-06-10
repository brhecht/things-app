import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// ONE-TIME migration: replace raw 'beehiiv'/'beehiiv-post' slugs in task notes
// with their display names 'Substack'/'Substack Post'.
// DELETE THIS FILE after running once.

function getDb() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
  }
  return getFirestore()
}

function fixNotes(notes) {
  if (!notes) return notes
  return notes
    .replace(/beehiiv-post/gi, 'Substack Post')
    .replace(/\bbeehiiv\b/gi, 'Substack')
}

export default async function handler(req, res) {
  const apiKey = req.headers['x-api-key'] || req.query?.apiKey
  if (apiKey !== process.env.API_SECRET) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const db = getDb()
  const OWNER_UID = process.env.OWNER_UID

  const snap = await db.collection('users').doc(OWNER_UID).collection('tasks').get()
  const updates = []

  snap.forEach(doc => {
    const { notes } = doc.data()
    if (notes && /beehiiv/i.test(notes)) {
      updates.push({ id: doc.id, oldNotes: notes, newNotes: fixNotes(notes) })
    }
  })

  for (const u of updates) {
    await db.collection('users').doc(OWNER_UID).collection('tasks').doc(u.id).update({ notes: u.newNotes })
  }

  return res.status(200).json({ ok: true, updated: updates.length, tasks: updates })
}

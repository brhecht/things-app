import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    })
  }
  return getFirestore()
}

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
    const snap = await db.collection('users').doc(OWNER_UID).collection('projects').orderBy('sortOrder').get()
    const projects = snap.docs.map(d => ({ id: d.id, name: d.data().name, sortOrder: d.data().sortOrder ?? 99 }))

    return res.status(200).json({ ok: true, projects })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

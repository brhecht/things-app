import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Game Plan daily state endpoint.
// One doc per owner per day: users/{OWNER_UID}/gamePlan/{date}
//
// GET  /api/game-plan?date=2026-06-10          → returns the doc (empty defaults if none)
// POST /api/game-plan  body: { date, ...fields } → merges fields into the doc
//
// Both require: x-api-key: API_SECRET
//
// Doc shape:
//   order:      string[]             task IDs in plan order
//   done:       { [id]: boolean }    tasks marked done in the plan
//   estimates:  { [id]: number }     time estimate in minutes per task
//   brainspace: { [id]: string }     'deep' | 'medium' | 'admin' | 'unknown'
//   focusId:    string | null
//   focusStart: number | null        epoch ms
//   onBreak:    boolean
//   breakStart: number | null        epoch ms
//   lastBreak:  number               epoch ms

function getDb() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
  }
  return getFirestore()
}

const DEFAULTS = {
  order: [],
  done: {},
  estimates: {},
  brainspace: {},
  focusId: null,
  focusStart: null,
  onBreak: false,
  breakStart: null,
  lastBreak: null,
}

export default async function handler(req, res) {
  try {
    const apiKey = req.headers['x-api-key'] || req.query?.apiKey
    if (apiKey !== process.env.API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const db = getDb()
    const OWNER_UID = process.env.OWNER_UID

    if (req.method === 'GET') {
      const { date } = req.query
      if (!date) return res.status(400).json({ error: 'date param required (YYYY-MM-DD)' })
      const snap = await db.collection('users').doc(OWNER_UID).collection('gamePlan').doc(date).get()
      const data = snap.exists ? snap.data() : { ...DEFAULTS, lastBreak: Date.now() }
      return res.status(200).json({ ok: true, date, data })
    }

    if (req.method === 'POST') {
      const { date, ...fields } = req.body
      if (!date) return res.status(400).json({ error: 'date field required in body' })
      await db.collection('users').doc(OWNER_UID).collection('gamePlan').doc(date).set(fields, { merge: true })
      return res.status(200).json({ ok: true, date })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

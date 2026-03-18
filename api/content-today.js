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

/** Human-readable label for a content type slug */
const TYPE_LABELS = {
  'yt-video': 'YT Video',
  'yt-short': 'YT Short',
  'linkedin': 'LinkedIn Post',
  'beehiiv': 'Beehiiv Newsletter',
}

/** Build a useful title from whatever the card has */
function cardTitle(card) {
  if (card.title) return card.title
  const label = TYPE_LABELS[card.contentType] || card.contentType || null
  const archTitle = card.archiveData?.title || card.archiveData?.subjectLine || null
  if (archTitle && label) return `${archTitle} — ${label}`
  if (archTitle) return archTitle
  if (label) return label
  return '(untitled content)'
}

/** Return today's date as YYYY-MM-DD in US Eastern time */
function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

export default async function handler(req, res) {
  try {
    // Allow GET (Vercel cron) and POST (manual trigger)
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // Auth: Vercel cron sends this header automatically; manual calls use API_SECRET
    const cronSecret = req.headers['authorization']?.replace('Bearer ', '')
    const apiKey = req.headers['x-api-key'] || req.body?.apiKey
    const validCron = cronSecret === process.env.CRON_SECRET
    const validApi = apiKey === process.env.API_SECRET

    if (!validCron && !validApi) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const db = getDb()
    const OWNER_UID = process.env.OWNER_UID
    const today = todayET()

    // 1. Query content cards with today's dueDate
    const cardsSnap = await db.collection('contentCards')
      .where('dueDate', '==', today)
      .get()

    if (cardsSnap.empty) {
      return res.status(200).json({ ok: true, created: 0, message: `No content cards for ${today}` })
    }

    // 2. Filter out archived / published cards
    const cards = []
    cardsSnap.forEach((doc) => {
      const data = doc.data()
      if (data.status === 'published' || data.archivedAt) return
      cards.push({ firestoreId: doc.id, ...data })
    })

    if (cards.length === 0) {
      return res.status(200).json({ ok: true, created: 0, message: `All cards for ${today} are published/archived` })
    }

    // 3. Check existing tasks for dedup (sourceCardId)
    const tasksRef = db.collection('users').doc(OWNER_UID).collection('tasks')
    const existingSnap = await tasksRef.where('sourceCardId', 'in', cards.map((c) => c.firestoreId)).get()
    const existingSourceIds = new Set()
    existingSnap.forEach((doc) => existingSourceIds.add(doc.data().sourceCardId))

    // 4. Create tasks for new cards only
    const batch = db.batch()
    const created = []

    for (const card of cards) {
      if (existingSourceIds.has(card.firestoreId)) continue

      const taskId = `content-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const noteLines = [
        card.contentType ? `Type: ${card.contentType}` : null,
        card.platforms?.length ? `Platform: ${card.platforms.join(', ')}` : null,
        card.status ? `Status: ${card.status}` : null,
      ].filter(Boolean).join('\n')

      const task = {
        id: taskId,
        title: cardTitle(card),
        projectId: 'hc-content',
        bucket: 'today',
        priority: null,
        notes: noteLines,
        tags: [],
        starred: false,
        completed: false,
        sortWeight: 0,
        createdAt: Date.now(),
        sourceCardId: card.firestoreId,
      }

      batch.set(tasksRef.doc(taskId), task)
      created.push({ taskId, title: task.title, sourceCardId: card.firestoreId })
    }

    await batch.commit()

    return res.status(200).json({ ok: true, created: created.length, tasks: created, date: today })
  } catch (err) {
    console.error('content-today error:', err)
    return res.status(500).json({ error: err.message })
  }
}

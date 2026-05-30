import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Project name → id mapping for Slack shorthand tags
const PROJECT_MAP = {
  'humble admin':      'hc-admin',
  'hc admin':          'hc-admin',
  'hc content':        'hc-content',
  'hc revenue':        'hc-revenue',
  'portfolio':         'portfolio',
  'life admin':        'life-admin',
  'personal finance':  'personal-finance',
  'network':           'network',
  'georgetown':        'georgetown',
  'friends':           'friends',
  'infra':             'infra',
  'b-suite':           'infra',
  'b suite':           'infra',
  'bsuite':            'infra',
  'misc':              'misc',
}

// Timing words → bucket. Checked at the END (preferred) or START of the dictated
// sentence so a word mid-title (e.g. "tomorrow's meeting") isn't misread.
const TIMING = [
  ['this\\s*week', 'soon'],
  ['tomorrow', 'tomorrow'],
  ['today', 'today'],
  ['some\\s*day|later', 'someday'],
  ['waiting|delegate', 'waiting'],
]

// Parse a single dictated sentence from the capture Shortcut into structured
// fields. Pulls a timing word into a bucket and text after a "note" marker into
// notes; the remainder is the title. Conservative on purpose — only strong
// markers (", note", "note:", edge-anchored timing words) trigger a split.
function parseDictation(raw) {
  let text = (raw || '').trim()
  let notes = ''
  let bucket = null

  // 1) Notes — strong markers only: ", note ..." or "note: ..."
  let m = text.match(/,\s*notes?\b:?\s+([\s\S]+)$/i)
  if (!m) m = text.match(/(?:^|\s)notes?:\s+([\s\S]+)$/i)
  if (m) {
    notes = m[1].trim()
    text = text.slice(0, m.index).trim()
  }

  // 2) Timing word at the END (preferred), or at the START only when followed by
  //    a comma ("Tomorrow, call Bob") — avoids eating leading verbs like "Wait".
  for (const [pat, b] of TIMING) {
    const endRe = new RegExp(`[\\s,;:.-]*\\b(?:${pat})\\b[\\s.!]*$`, 'i')
    const startRe = new RegExp(`^(?:${pat})\\b\\s*,\\s*`, 'i')
    if (endRe.test(text)) { bucket = b; text = text.replace(endRe, '').trim(); break }
    if (startRe.test(text)) { bucket = b; text = text.replace(startRe, '').trim(); break }
  }

  // If the sentence was only a note ("note: buy milk"), promote it to the title.
  if (!text && notes) { text = notes; notes = '' }

  return { title: text.trim(), bucket, notes }
}

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
    // Only allow POST
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // Authenticate with API key
    const apiKey = req.headers['x-api-key'] || req.body?.apiKey
    if (apiKey !== process.env.API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { title, project, projectId: directProjectId, bucket, notes, priority, tags, dueDate, idempotencyKey } = req.body

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Missing "title" field' })
    }

    // Parse the raw dictated sentence (timing word → bucket, "note ..." → notes).
    // Explicit fields in the request body always win over parsed values.
    const parsed = parseDictation(title)
    const finalTitle = parsed.title || title.trim()
    const finalNotes = (typeof notes === 'string' && notes.trim()) ? notes : parsed.notes
    const finalBucket = bucket || parsed.bucket || 'inbox'

    const db = getDb()
    const OWNER_UID = process.env.OWNER_UID
    const tasksRef = db.collection('users').doc(OWNER_UID).collection('tasks')

    // Idempotency: if a key is provided, check if a task with that key already exists
    if (idempotencyKey) {
      const existing = await tasksRef.where('idempotencyKey', '==', idempotencyKey).limit(1).get()
      if (!existing.empty) {
        const existingTask = existing.docs[0].data()
        return res.status(200).json({ ok: true, task: existingTask, deduplicated: true })
      }
    }

    // Resolve project: direct projectId takes priority, then name lookup, then "unassigned"
    let projectId = 'unassigned'
    if (directProjectId) {
      projectId = directProjectId
    } else if (project) {
      projectId = PROJECT_MAP[project.toLowerCase()] || 'unassigned'
    }

    // Build the task
    const taskId = `eddy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const task = {
      id: taskId,
      title: finalTitle,
      projectId,
      bucket: finalBucket,
      priority: priority || null,
      notes: finalNotes || '',
      tags: Array.isArray(tags) ? tags : [],
      starred: false,
      completed: false,
      sortWeight: 0,
      createdAt: Date.now(),
      ...(dueDate ? { dueDate } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    }

    // Write to Firestore
    await tasksRef.doc(taskId).set(task)

    return res.status(200).json({ ok: true, task })
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}

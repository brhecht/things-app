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

// Timing words → bucket.
const TIMING = [
  ['this\\s*week', 'soon'],
  ['tomorrow', 'tomorrow'],
  ['today', 'today'],
  ['some\\s*day|later', 'someday'],
  ['waiting|delegate', 'waiting'],
]

// Strip a trailing timing phrase from a string, eating a natural lead-in
// ("do it"/"do this"/"for"/"by") so "do it tomorrow" / "by tomorrow" fully drop
// out, not just the bare word. Returns { text, bucket }.
function stripTrailingTiming(s) {
  for (const [pat, b] of TIMING) {
    const re = new RegExp(`[\\s,;:.-]*\\b(?:do (?:it|this)|for|by)?\\s*(?:${pat})\\b[\\s.!]*$`, 'i')
    if (re.test(s)) return { text: s.replace(re, '').trim(), bucket: b }
  }
  return { text: s, bucket: null }
}

// Parse a single dictated sentence into { title, bucket, notes }. Built for
// spoken input: dictation rarely inserts commas/colons, so the note marker is
// the bare word "note" (singular, so "release notes" won't false-match), and a
// timing phrase may land before the note ("X tomorrow, note Y") or at the very
// end after it ("X note Y do it tomorrow").
function parseDictation(raw) {
  let text = (raw || '').trim()
  let notes = ''
  let bucket = null

  // 1) Notes — split at the first standalone singular "note" marker (handles
  //    typed ", note"/"note:" and dictated "... note. ...").
  const m = text.match(/(?:^|[\s,])note\b[:.]?\s+([\s\S]+)$/i)
  if (m) {
    notes = m[1].trim()
    text = text.slice(0, m.index).replace(/[\s,]+$/, '').trim()
  }

  // 2) Timing — try the end of the head first, then the end of the notes, then a
  //    start-of-sentence form with a comma ("Tomorrow, call Bob").
  let r = stripTrailingTiming(text)
  if (r.bucket) { text = r.text; bucket = r.bucket }
  else if (notes) {
    r = stripTrailingTiming(notes)
    if (r.bucket) { notes = r.text; bucket = r.bucket }
  }
  if (!bucket) {
    for (const [pat, b] of TIMING) {
      const startRe = new RegExp(`^(?:${pat})\\b\\s*,\\s*`, 'i')
      if (startRe.test(text)) { bucket = b; text = text.replace(startRe, '').trim(); break }
    }
  }

  // Note-only utterance ("note: buy milk") → promote to title.
  if (!text && notes) { text = notes; notes = '' }

  // Trim trailing sentence punctuation dictation tends to add.
  text = text.replace(/[\s.,;:]+$/, '').trim()

  return { title: text, bucket, notes }
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

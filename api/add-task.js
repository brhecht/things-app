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
  'misc':              'misc',
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

    const { title, project, projectId: directProjectId, bucket, notes, dueDate, idempotencyKey } = req.body

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Missing "title" field' })
    }

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
      title: title.trim(),
      projectId,
      bucket: bucket || 'inbox',
      priority: null,
      notes: notes || '',
      tags: [],
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

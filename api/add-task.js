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

    const { title, project, bucket } = req.body

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Missing "title" field' })
    }

    // Resolve project name to ID (case-insensitive)
    let projectId = null
    if (project) {
      projectId = PROJECT_MAP[project.toLowerCase()] || null
    }

    // Build the task
    const taskId = `slack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const task = {
      id: taskId,
      title: title.trim(),
      projectId,
      bucket: bucket || 'inbox',
      priority: null,
      notes: '',
      tags: [],
      starred: false,
      completed: false,
      sortWeight: 0,
      createdAt: Date.now(),
    }

    // Write to Firestore
    const db = getDb()
    const OWNER_UID = process.env.OWNER_UID
    await db.collection('users').doc(OWNER_UID).collection('tasks').doc(taskId).set(task)

    return res.status(200).json({ ok: true, task })
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}

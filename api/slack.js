import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN
const OWNER_SLACK_ID = process.env.OWNER_SLACK_ID  // Brian's Slack user ID

// Project name → id mapping
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

// Bucket name → id mapping
const BUCKET_MAP = {
  'inbox':     'inbox',
  'today':     'today',
  'tomorrow':  'tomorrow',
  'this week': 'soon',
  'week':      'soon',
  'soon':      'soon',
  'later':     'someday',
  'someday':   'someday',
}

// Parse a message like "Call accountant #personal finance #today" into { title, projectId, bucket }
function parseMessage(text) {
  let cleaned = text.replace(/<@[A-Z0-9]+>/g, '').trim()

  let projectId = null
  let bucket = 'inbox'

  // Extract all #tags
  const tags = []
  cleaned = cleaned.replace(/#([^#]+?)(?=#|$)/g, (_, tag) => {
    tags.push(tag.trim().toLowerCase())
    return ''
  }).trim()

  // Match tags to projects or buckets
  for (const tag of tags) {
    if (BUCKET_MAP[tag]) {
      bucket = BUCKET_MAP[tag]
    } else if (PROJECT_MAP[tag]) {
      projectId = PROJECT_MAP[tag]
    }
  }

  return { title: cleaned, projectId, bucket }
}

async function slackReply(channel, text) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text }),
  })
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const body = req.body

    // Slack URL verification challenge (one-time setup)
    if (body.type === 'url_verification') {
      return res.status(200).json({ challenge: body.challenge })
    }

    // Handle events
    if (body.type === 'event_callback') {
      const event = body.event

      if (event.type === 'message' && !event.bot_id && !event.subtype) {
        const { title, projectId, bucket } = parseMessage(event.text || '')

        if (!title) {
          await slackReply(event.channel, "I couldn't parse a task from that. Just send me the task title!")
          return res.status(200).json({ ok: true })
        }

        // If sender is not the owner, auto-assign to "From Nico" project
        // If no project specified, default to "unassigned"
        const isOwner = event.user === OWNER_SLACK_ID
        const finalProjectId = (!isOwner && !projectId) ? 'from-nico' : (projectId || 'unassigned')

        const taskId = `slack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const task = {
          id: taskId,
          title,
          projectId: finalProjectId,
          bucket,
          priority: null,
          notes: '',
          tags: [],
          starred: false,
          completed: false,
          sortWeight: 0,
          createdAt: Date.now(),
        }

        const db = getDb()
        const OWNER_UID = process.env.OWNER_UID
        await db.collection('users').doc(OWNER_UID).collection('tasks').doc(taskId).set(task)

        const projectLabel = finalProjectId
          ? ` \u2192 ${finalProjectId === 'from-nico' ? 'From Nico' : (Object.entries(PROJECT_MAP).find(([, v]) => v === finalProjectId)?.[0] || finalProjectId)}`
          : ''
        const bucketLabel = bucket !== 'inbox' ? ` [${Object.entries(BUCKET_MAP).find(([, v]) => v === bucket)?.[0] || bucket}]` : ''
        await slackReply(event.channel, `\u2705 Added${bucketLabel || ' to Inbox'}: "${title}"${projectLabel}`)
      }

      return res.status(200).json({ ok: true })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}

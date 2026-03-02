import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN
const OWNER_SLACK_ID = process.env.OWNER_SLACK_ID  // Brian's Slack user ID

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
  'waiting':   'waiting',
  'delegated': 'waiting',
  'tomorrow':  'tomorrow',
  'this week': 'soon',
  'week':      'soon',
  'soon':      'soon',
  'later':     'someday',
  'someday':   'someday',
}

// Fetch all projects from Firestore and build a name → id lookup
// Matches on lowercase project name (e.g. "ai builds" → the project with name "AI Builds")
async function getProjectMap(db, ownerUid) {
  const snap = await db.collection('users').doc(ownerUid).collection('projects').get()
  const map = {}
  snap.forEach((d) => {
    const proj = d.data()
    const name = (proj.name || '').toLowerCase().trim()
    if (name) map[name] = d.id
  })
  return map
}

// Parse a message like "Call accountant --personal finance --today" into { title, tags }
function parseTags(text) {
  let cleaned = text.replace(/<@[A-Z0-9]+>/g, '').trim()

  const tags = []
  cleaned = cleaned.replace(/--([^-]+?)(?=--|$)/g, (_, tag) => {
    tags.push(tag.trim().toLowerCase())
    return ''
  }).trim()

  // Clean leftover dashes from fast typing
  cleaned = cleaned.replace(/^-+|--+$/g, '').trim()

  return { title: cleaned, tags }
}

// Resolve tags against bucket map and dynamic project map
function resolveTags(tags, projectMap) {
  let projectId = null
  let bucket = 'inbox'

  for (const tag of tags) {
    if (BUCKET_MAP[tag]) {
      bucket = BUCKET_MAP[tag]
    } else if (projectMap[tag]) {
      projectId = projectMap[tag]
    }
  }

  return { projectId, bucket }
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
        const { title, tags } = parseTags(event.text || '')

        if (!title) {
          await slackReply(event.channel, "I couldn't parse a task from that. Just send me the task title!")
          return res.status(200).json({ ok: true })
        }

        const db = getDb()
        const OWNER_UID = process.env.OWNER_UID

        // Dynamically fetch projects from Firestore
        const projectMap = await getProjectMap(db, OWNER_UID)
        const { projectId, bucket } = resolveTags(tags, projectMap)

        // If sender is not the owner, auto-assign to "From Nico" project (find it by name)
        // If no project specified, default to "unassigned" (find it by name)
        const isOwner = event.user === OWNER_SLACK_ID
        const fromNicoId = projectMap['from nico'] || 'from-nico'
        const unassignedId = projectMap['unassigned'] || 'unassigned'
        const finalProjectId = (!isOwner && !projectId) ? fromNicoId : (projectId || unassignedId)

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

        await db.collection('users').doc(OWNER_UID).collection('tasks').doc(taskId).set(task)

        // Reverse-lookup project name for the confirmation message
        const projectName = Object.entries(projectMap).find(([, id]) => id === finalProjectId)?.[0] || finalProjectId
        const bucketLabel = bucket !== 'inbox' ? ` [${Object.entries(BUCKET_MAP).find(([, v]) => v === bucket)?.[0] || bucket}]` : ''
        await slackReply(event.channel, `\u2705 Added${bucketLabel || ' to Inbox'}: "${title}" \u2192 ${projectName}`)
      }

      return res.status(200).json({ ok: true })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}

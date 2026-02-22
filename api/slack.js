import admin from 'firebase-admin'

// Initialize Firebase Admin (once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  })
}
const db = admin.firestore()

const OWNER_UID = process.env.OWNER_UID
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN

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

// Parse a message like "Call accountant #personal finance" into { title, projectId }
function parseMessage(text) {
  // Remove any bot mention like <@U12345>
  let cleaned = text.replace(/<@[A-Z0-9]+>/g, '').trim()

  // Extract #project tag (everything after the last #)
  let projectId = null
  const hashMatch = cleaned.match(/#([^#]+)$/)
  if (hashMatch) {
    const tag = hashMatch[1].trim().toLowerCase()
    projectId = PROJECT_MAP[tag] || null
    cleaned = cleaned.replace(/#([^#]+)$/, '').trim()
  }

  return { title: cleaned, projectId }
}

// Send a reply in Slack
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

    // Only handle messages (not bot messages to avoid loops)
    if (event.type === 'message' && !event.bot_id && !event.subtype) {
      const { title, projectId } = parseMessage(event.text || '')

      if (!title) {
        await slackReply(event.channel, "I couldn't parse a task from that. Just send me the task title!")
        return res.status(200).json({ ok: true })
      }

      // Create the task
      const taskId = `slack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const task = {
        id: taskId,
        title,
        projectId,
        bucket: 'inbox',
        priority: null,
        notes: '',
        tags: [],
        starred: false,
        completed: false,
        sortWeight: 0,
        createdAt: Date.now(),
      }

      await db.collection('users').doc(OWNER_UID).collection('tasks').doc(taskId).set(task)

      const projectLabel = projectId
        ? ` \u2192 ${Object.entries(PROJECT_MAP).find(([, v]) => v === projectId)?.[0] || projectId}`
        : ''
      await slackReply(event.channel, `\u2705 Added to Inbox: "${title}"${projectLabel}`)
    }

    return res.status(200).json({ ok: true })
  }

  return res.status(200).json({ ok: true })
}

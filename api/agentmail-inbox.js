import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { timingSafeEqual } from 'crypto'
import { Webhook } from 'svix'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

// AgentMail email -> B Things task.
// Brian forwards any email to the AgentMail inbox; AgentMail (via Svix) fires a
// webhook here. We interpret the email with Claude and drop a task into his
// Inbox / Unassigned, exactly like the tasks he creates by voice.
//
// Body parsing is disabled so we can verify the raw payload against the Svix signature.
export const config = { api: { bodyParser: false } }

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    })
  }
  return getFirestore()
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// Constant-time string compare that won't throw on length mismatch
function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// Strip HTML to plain-ish text as a fallback when no text body is present
function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// AgentMail message.received event: fields live under payload.message.*
function extractEmail(payload) {
  const m = payload?.message || {}
  const from = typeof m.from === 'string' ? m.from : (m.from?.address || '')
  const subject = m.subject || ''
  let body = m.text || m.extracted_text || ''
  if (!body && (m.html || m.extracted_html)) body = htmlToText(m.html || m.extracted_html)
  return { from, subject, body }
}

const InterpretationSchema = z.object({
  title: z
    .string()
    .describe(
      'A short, actionable task title interpreting what Brian needs to DO about this email. ' +
      'NOT a literal copy of the subject line. Example: an email from Joe covering several ' +
      'points about speaking at Columbia becomes "Reply to email from Joe re: Columbia speaking".'
    ),
  notes: z
    .string()
    .describe(
      'A condensed 2-3 line summary of the core of the email — the gist only, not the full body.'
    ),
})

async function interpretEmail({ from, subject, body }) {
  const client = new Anthropic() // uses ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'

  // Cap very long bodies to keep token cost bounded; the model summarizes anyway.
  const MAX_BODY = 8000
  const truncated = body.length > MAX_BODY
  const bodyForModel = truncated ? body.slice(0, MAX_BODY) + '\n\n[...email truncated...]' : body

  const response = await client.messages.parse({
    model,
    max_tokens: 1024,
    system:
      'You turn a forwarded email into a single task for Brian\'s personal task manager. ' +
      'The title must be an interpretation of the action Brian should take, phrased as a task — ' +
      'not a verbatim subject line. Keep notes to 2-3 lines capturing only the essential point.',
    messages: [
      {
        role: 'user',
        content:
          `From: ${from}\n` +
          `Subject: ${subject}\n\n` +
          `Body:\n${bodyForModel}`,
      },
    ],
    output_config: { format: zodOutputFormat(InterpretationSchema) },
  })

  return response.parsed_output
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // --- Auth gate 1: shared secret token in the webhook URL (?token=) or header ---
    // Hard gate that does not depend on body-parsing behavior. Always enforced.
    const expectedToken = process.env.AGENTMAIL_WEBHOOK_TOKEN
    if (expectedToken) {
      const provided = req.query?.token || req.headers['x-webhook-token']
      if (!provided || !safeEqual(provided, expectedToken)) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
    }

    // Read the raw body FIRST — before touching req.body, which triggers Vercel's
    // lazy body parse and consumes the stream (leaving Svix unable to verify).
    let raw = await readRawBody(req)
    let payload = {}
    if (raw) {
      try { payload = JSON.parse(raw) } catch { payload = {} }
    } else if (req.body && typeof req.body === 'object') {
      // Raw stream unavailable (runtime pre-parsed) — Svix can't verify a
      // re-serialized body, so we rely on the URL token gate in that case.
      payload = req.body
    }

    // --- Auth gate 2: Svix signature (AgentMail delivers webhooks via Svix) ---
    const secret = process.env.AGENTMAIL_WEBHOOK_SECRET
    if (secret && raw) {
      try {
        new Webhook(secret).verify(raw, {
          'svix-id': req.headers['svix-id'],
          'svix-timestamp': req.headers['svix-timestamp'],
          'svix-signature': req.headers['svix-signature'],
        })
      } catch {
        return res.status(401).json({ error: 'Invalid signature' })
      }
    }

    // Only act on genuine inbound messages; ack everything else so Svix stops retrying.
    const eventType = payload?.event_type || ''
    if (eventType && eventType !== 'message.received') {
      return res.status(200).json({ ok: true, skipped: eventType })
    }

    const { from, subject, body } = extractEmail(payload)

    if (!subject && !body) {
      return res.status(200).json({ ok: true, skipped: 'empty email' })
    }

    // Interpret with Claude; fall back to subject-as-title if the model call fails
    // so a forwarded email never silently disappears.
    let title, notes
    try {
      ;({ title, notes } = await interpretEmail({ from, subject, body }))
    } catch (llmErr) {
      title = subject ? `Re: ${subject}` : 'Forwarded email'
      notes = (body || '').slice(0, 240)
      console.error('agentmail-inbox: LLM interpretation failed, using fallback:', llmErr.message)
    }

    // Land in Inbox / Unassigned — same as Brian's voice-entered tasks.
    const taskId = `email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const task = {
      id: taskId,
      title: (title || 'Forwarded email').trim(),
      projectId: 'unassigned',
      bucket: 'inbox',
      priority: null,
      notes: notes || '',
      tags: [],
      starred: false,
      completed: false,
      sortWeight: 0,
      createdAt: Date.now(),
    }

    const db = getDb()
    const OWNER_UID = process.env.OWNER_UID
    await db.collection('users').doc(OWNER_UID).collection('tasks').doc(taskId).set(task)

    return res.status(200).json({ ok: true, task })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

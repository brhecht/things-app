// Fetch today's events from Brian's primary Google Calendar
// Auth: Authorization: Bearer <Firebase ID token>  (verified via firebase-admin)
// Env vars required: FIREBASE_SERVICE_ACCOUNT, OWNER_UID,
//                    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN
// Returns: { ok: true, events: [{ id, title, startMs, endMs }] }

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

function getAdminAuth() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
  }
  return getAuth()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Verify Firebase ID token
  const authHeader = req.headers['authorization'] || ''
  const idToken    = authHeader.replace(/^Bearer\s+/i, '')
  if (!idToken) return res.status(401).json({ error: 'Missing Authorization header' })

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken)
    if (decoded.uid !== process.env.OWNER_UID) return res.status(403).json({ error: 'Forbidden' })
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  try {
    // 1. Exchange refresh token for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
        grant_type:    'refresh_token',
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      return res.status(500).json({ error: 'Failed to refresh access token', details: tokenData })
    }

    // 2. Build today's time range (UTC-aware; calendar API uses ISO 8601 with TZ)
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
    const timeMin = new Date(y, m, d, 0,  0,  0).toISOString()
    const timeMax = new Date(y, m, d, 23, 59, 59).toISOString()

    // 3. Fetch events from primary calendar
    const calRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
      new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy:      'startTime',
        maxResults:   '50',
      }),
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    )
    const calData = await calRes.json()

    if (!calData.items) {
      return res.status(500).json({ error: 'Calendar API error', raw: calData })
    }

    // 4. Filter and normalise
    const events = calData.items
      .filter(e => {
        // Skip all-day events (have `date` not `dateTime`)
        if (!e.start?.dateTime) return false
        // Skip unoccupied appointment slots: events where Brian is the only attendee
        const attendees = e.attendees || []
        const others = attendees.filter(a => !a.self)
        if (attendees.length > 0 && others.length === 0) return false
        // Skip declined events
        const selfAttendee = attendees.find(a => a.self)
        if (selfAttendee?.responseStatus === 'declined') return false
        return true
      })
      .map(e => ({
        id:      e.id,
        title:   e.summary || 'Meeting',
        startMs: new Date(e.start.dateTime).getTime(),
        endMs:   new Date(e.end.dateTime).getTime(),
      }))

    return res.status(200).json({ ok: true, events, fetchedAt: Date.now() })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
// One-time script: get a Google Calendar OAuth refresh token.
// Run ONCE, then add the three printed values to Vercel env vars.
//
// Prerequisites (5 min):
//   1. Go to: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=b-things
//      Click "Enable" (if not already enabled)
//   2. Go to: https://console.cloud.google.com/apis/credentials?project=b-things
//      Click "+ Create Credentials" → "OAuth client ID"
//      Application type: Web application
//      Name: "Things App Calendar"
//      Authorized redirect URIs: http://localhost:3333/callback
//      Click "Create" — note the Client ID and Client Secret
//
// Usage:
//   node scripts/get-calendar-token.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET
// ─────────────────────────────────────────────────────────────────

const http    = require('http')
const { execSync } = require('child_process')

const CLIENT_ID     = process.argv[2] || ''
const CLIENT_SECRET = process.argv[3] || ''

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nUsage: node scripts/get-calendar-token.js CLIENT_ID CLIENT_SECRET\n')
  process.exit(1)
}

const REDIRECT_URI = 'http://localhost:3333/callback'
const SCOPE        = 'https://www.googleapis.com/auth/calendar.readonly'

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id:     CLIENT_ID,
  redirect_uri:  REDIRECT_URI,
  response_type: 'code',
  scope:         SCOPE,
  access_type:   'offline',
  prompt:        'consent',          // force refresh_token to be returned
})

console.log('\n→ Opening browser to authorize Google Calendar access...')
console.log('  If it does not open automatically, paste this URL:\n  ' + authUrl + '\n')
try { execSync(`open "${authUrl}"`, { stdio: 'ignore' }) } catch (_) {}

const server = http.createServer(async (req, res) => {
  const url  = new URL(req.url, 'http://localhost:3333')
  const code = url.searchParams.get('code')

  if (!code) {
    res.writeHead(400).end('No authorization code received. Try again.')
    return
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    })
    const data = await tokenRes.json()

    if (data.refresh_token) {
      console.log('\n✅  Success! Add these three env vars to Vercel:')
      console.log('    https://vercel.com/brhecht/things-app/settings/environment-variables\n')
      console.log('    GOOGLE_CLIENT_ID            =', CLIENT_ID)
      console.log('    GOOGLE_CLIENT_SECRET        =', CLIENT_SECRET)
      console.log('    GOOGLE_CALENDAR_REFRESH_TOKEN=', data.refresh_token)
      console.log('\n    Then redeploy for the vars to take effect.\n')
      res.writeHead(200, { 'Content-Type': 'text/html' })
        .end('<h2 style="font-family:sans-serif;color:green">✅ Done — check your terminal for the values to paste into Vercel.</h2>')
    } else {
      console.error('\n❌  No refresh_token in response:', JSON.stringify(data, null, 2))
      res.writeHead(500).end('Error: ' + JSON.stringify(data))
    }
  } catch (err) {
    console.error('\n❌  Request failed:', err.message)
    res.writeHead(500).end('Error: ' + err.message)
  }

  server.close()
})

server.listen(3333, () => {
  console.log('  Listening on http://localhost:3333 — waiting for Google redirect...\n')
})

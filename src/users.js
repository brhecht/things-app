// ── B Suite User Registry ────────────────────────────────────────
// Central user config for @mention routing, notifications, and display.
// Keyed by email (the identifier Firebase Auth provides on the client).
// Add new users here — no code changes needed elsewhere.

export const USERS = {
  'brhnyc1970@gmail.com': {
    displayName: 'Brian',
    handle: 'brian',           // @brian in notes
    slackUserId: 'U096WPV71KK',
    color: '#2563EB',          // blue - chat bubble accent
  },
  'nico@humbleconviction.com': {
    displayName: 'Nico',
    handle: 'nico',            // @nico in notes
    slackUserId: 'U09GRAMET4H',
    color: '#7C3AED',          // purple - chat bubble accent
  },
  'nmejiawork@gmail.com': {
    displayName: 'Nico',
    handle: 'nico',            // same person, alternate email
    slackUserId: 'U09GRAMET4H',
    color: '#7C3AED',
  },
}

/** Look up user by email */
export function getUserByEmail(email) {
  return USERS[email] || null
}

/** Look up user by @handle (case-insensitive) */
export function getUserByHandle(handle) {
  const h = handle.toLowerCase().replace(/^@/, '')
  const entry = Object.entries(USERS).find(([, u]) => u.handle === h)
  return entry ? { email: entry[0], ...entry[1] } : null
}

/** Get all unique handles for autocomplete */
export function getAllHandles() {
  const seen = new Set()
  return Object.values(USERS)
    .filter((u) => {
      if (seen.has(u.handle)) return false
      seen.add(u.handle)
      return true
    })
    .map((u) => ({ handle: u.handle, displayName: u.displayName, color: u.color }))
}

/** Parse @mentions from a message string. Returns array of handle strings. */
export function parseMentions(text) {
  const matches = text.match(/@(\w+)/g) || []
  return matches
    .map((m) => m.slice(1).toLowerCase())
    .filter((h) => getUserByHandle(h))
}

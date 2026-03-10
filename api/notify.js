// POST /api/notify
// Proxies @mention notifications to Brain Inbox (avoids CORS issues with cross-origin fetch).
// Generic version — routes to any recipient, not just Nico.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { project, summary, recipient, recipientSlackId } = req.body || {}
  if (!project || !summary) {
    return res.status(400).json({ error: 'Missing project or summary' })
  }

  try {
    const response = await fetch('https://brain-inbox-six.vercel.app/api/handoff-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, summary, recipient, recipientSlackId }),
    })
    const data = await response.json()
    return res.status(response.status).json(data)
  } catch (err) {
    console.error('Notify proxy error:', err)
    return res.status(500).json({ error: err.message })
  }
}

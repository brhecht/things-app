import { useState, useEffect, useRef, useCallback } from 'react'
import { subscribeMessages, addMessage, updateTaskMsgMeta, markTaskMsgMetaRead } from '../firebase'
import { getUserByEmail, getUserByHandle, parseMentions, getAllHandles } from '../users'
import useStore from '../store'

const NOTIFY_ENDPOINT = '/api/notify'

/**
 * NoteThread — iMessage/Slack-style chat thread for a task.
 *
 * Props:
 *   ownerUid   — Firebase UID that owns the tasks collection
 *   taskId     — Firestore doc ID of the task
 *   taskTitle  — for notification context
 */
export default function NoteThread({ ownerUid, taskId, taskTitle }) {
  const user = useStore((s) => s.user)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const currentUser = getUserByEmail(user?.email)
  const handles = getAllHandles()

  // ── Subscribe to messages ───────────────────────────────────────
  useEffect(() => {
    if (!ownerUid || !taskId) return
    const unsub = subscribeMessages(ownerUid, taskId, (msgs) => {
      setMessages(msgs)
    })
    return unsub
  }, [ownerUid, taskId])

  // ── Mark as read when thread is opened ──────────────────────────
  useEffect(() => {
    if (!ownerUid || !taskId || !user?.email) return
    markTaskMsgMetaRead(ownerUid, taskId, user.email).catch(() => {})
  }, [ownerUid, taskId, user?.email, messages.length])

  // ── Auto-scroll to bottom on new messages ───────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // ── Send message ────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text || !user?.email) return

    const mentions = parseMentions(text)
    const msg = {
      text,
      authorEmail: user.email,
      authorName: currentUser?.displayName || user.displayName || user.email.split('@')[0],
      mentions,
      timestamp: Date.now(),
      readBy: { [user.email.replace(/\./g, '_')]: true },
    }

    setDraft('')
    setShowMentions(false)

    try {
      await addMessage(ownerUid, taskId, msg)
      await updateTaskMsgMeta(ownerUid, taskId, user.email)

      // Send notifications for each mentioned user (except self)
      for (const handle of mentions) {
        const mentioned = getUserByHandle(handle)
        if (mentioned && mentioned.email !== user.email) {
          const taskUrl = `https://things-app-gamma.vercel.app/?task=${taskId}`
          const preview = text.length > 200 ? text.slice(0, 200) + '…' : text
          const payload = `💬 ${msg.authorName} in B Things: "${taskTitle}"\n${preview}\n→ ${taskUrl}`
          fetch(NOTIFY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project: 'B Things',
              summary: payload,
              recipient: mentioned.email,
              recipientSlackId: mentioned.slackUserId,
            }),
          }).catch((err) => console.error('Notify failed:', err))
        }
      }
    } catch (err) {
      console.error('Send message failed:', err)
      setDraft(text)
    }
  }, [draft, user, currentUser, ownerUid, taskId, taskTitle])

  // ── Handle input changes (detect @ for autocomplete) ────────────
  const handleInputChange = (e) => {
    const val = e.target.value
    setDraft(val)

    const cursor = e.target.selectionStart
    const textBefore = val.slice(0, cursor)
    const atMatch = textBefore.match(/@(\w*)$/)
    if (atMatch) {
      setShowMentions(true)
      setMentionFilter(atMatch[1].toLowerCase())
    } else {
      setShowMentions(false)
    }
  }

  // ── Insert @mention from autocomplete ───────────────────────────
  const insertMention = (handle) => {
    const cursor = inputRef.current?.selectionStart || draft.length
    const textBefore = draft.slice(0, cursor)
    const textAfter = draft.slice(cursor)
    const replaced = textBefore.replace(/@\w*$/, `@${handle} `)
    setDraft(replaced + textAfter)
    setShowMentions(false)
    inputRef.current?.focus()
  }

  // ── Key handler (Enter to send, Shift+Enter for newline) ───────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      handleSend()
    }
  }

  // ── Filter handles for autocomplete ─────────────────────────────
  const filteredHandles = handles.filter(
    (h) => h.handle.startsWith(mentionFilter) && h.handle !== currentUser?.handle
  )

  // ── Format timestamp ────────────────────────────────────────────
  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24))
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    if (diffDays === 0) return time
    if (diffDays === 1) return `Yesterday ${time}`
    if (diffDays < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`
  }

  // ── Render @mentions as styled spans ────────────────────────────
  const renderText = (text) => {
    const parts = text.split(/(@\w+)/g)
    return parts.map((part, i) => {
      if (part.match(/^@\w+$/)) {
        const mentioned = getUserByHandle(part.slice(1))
        return (
          <span
            key={i}
            className="font-semibold"
            style={{ color: mentioned?.color || '#2563EB' }}
          >
            {part}
          </span>
        )
      }
      return part
    })
  }

  const isOwnMessage = (msg) => msg.authorEmail === user?.email

  return (
    <div className="flex flex-col" style={{ maxHeight: '320px' }}>
      {/* Message thread — only render if there are messages */}
      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-2 px-1 pb-2"
          style={{ maxHeight: '240px' }}
        >
        {messages.map((msg) => {
          const own = isOwnMessage(msg)
          const authorUser = getUserByEmail(msg.authorEmail)
          return (
            <div
              key={msg.id}
              className={`flex ${own ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                  own
                    ? 'bg-blue-500 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}
              >
                {!own && (
                  <p
                    className="text-[11px] font-semibold mb-0.5"
                    style={{ color: authorUser?.color || '#7C3AED' }}
                  >
                    {msg.authorName}
                  </p>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {own ? msg.text : renderText(msg.text)}
                </p>
                <p className={`text-[10px] mt-1 ${own ? 'text-blue-200' : 'text-gray-400'}`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          )
        })}
        </div>
      )}

      {/* Input bar */}
      <div className={`relative ${messages.length > 0 ? 'border-t border-gray-100 pt-1' : ''}`}>
        {/* @mention autocomplete dropdown */}
        {showMentions && filteredHandles.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10">
            {filteredHandles.map((h) => (
              <button
                key={h.handle}
                onClick={() => insertMention(h.handle)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 w-full text-left"
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: h.color }}
                >
                  {h.displayName[0]}
                </span>
                <span className="text-gray-700">@{h.handle}</span>
                <span className="text-gray-400 text-xs">{h.displayName}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… use @ to mention"
            rows={1}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white placeholder-gray-400"
            style={{ minHeight: '36px', maxHeight: '80px' }}
            onInput={(e) => {
              e.target.style.height = '36px'
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              draft.trim()
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

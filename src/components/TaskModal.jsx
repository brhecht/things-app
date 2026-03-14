import { useState, useEffect, useRef } from 'react'
import useStore from '../store'
import NoteThread from './NoteThread'

const PRIORITIES = [
  { value: null,     label: 'None' },
  { value: 'high',   label: '🔴 High' },
  { value: 'medium', label: '🟡 Medium' },
  { value: 'low',    label: '🔵 Low' },
]

const BUCKETS = [
  { value: 'inbox',    label: 'Inbox' },
  { value: 'today',    label: 'Today' },
  { value: 'waiting',  label: 'Wait / Delegate' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'soon',     label: 'This Week' },
  { value: 'someday',  label: 'Later' },
]

export default function TaskModal({ task, onClose, completedMode = false }) {
  const { updateTask, deleteTask, projects } = useStore()

  const [title,     setTitle]     = useState(task.title)
  const [notes,     setNotes]     = useState(task.notes)
  const [priority,  setPriority]  = useState(task.priority)
  const [tags,      setTags]      = useState(task.tags)
  const [tagInput,  setTagInput]  = useState('')
  const [projectId, setProjectId] = useState(task.projectId)
  const [bucket,    setBucket]    = useState(task.bucket)
  const [dueDate,   setDueDate]   = useState(task.dueDate || '')
  const [starred,   setStarred]   = useState(task.starred || false)
  const [completed, setCompleted] = useState(task.completed || false)

  const titleRef = useRef(null)
  const notesRef = useRef(null)
  const isMobile = window.innerWidth < 768
  useEffect(() => { if (!isMobile) titleRef.current?.focus() }, [])

  // Auto-expand notes textarea on mount
  useEffect(() => {
    if (notesRef.current) {
      notesRef.current.style.height = '36px'
      notesRef.current.style.height = notesRef.current.scrollHeight + 'px'
    }
  }, [])

  // Resolve data UID for Firebase paths (Brian's UID for collaborators)
  const ownerUid = useStore((s) => s.dataUid)

  const handleSave = () => {
    if (title.trim()) {
      // Auto-set bucket based on due date
      let finalBucket = bucket
      if (dueDate) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const due = new Date(dueDate + 'T00:00:00')
        const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24))

        if (diffDays <= 0) finalBucket = 'today'
        else if (diffDays === 1) finalBucket = 'tomorrow'
        else if (diffDays <= 7) finalBucket = 'soon'
        else finalBucket = 'someday'
      }
      const updates = { title: title.trim(), notes, priority, tags, projectId, bucket: finalBucket, dueDate: dueDate || null, starred, completed }
      // Match TaskCard behavior: starring sets sortWeight for ordering
      if (starred && !task.starred) updates.sortWeight = Date.now()
      updateTask(task.id, updates)
      // @mention notifications are handled by NoteThread on message send — not here
    }
    onClose()
  }

  const handleDelete = () => { deleteTask(task.id); onClose() }

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { completedMode ? onClose() : handleSave() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') handleDelete()
      // ⌘+Enter or Ctrl+Enter saves from anywhere (no-op in completed mode)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (!completedMode) handleSave() }
      // Plain Enter saves unless in notes, messages, or tag input
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        const el = document.activeElement
        const tag = el?.tagName?.toLowerCase()
        // Skip: textareas (notes, messages), inputs inside NoteThread, tag input
        if (tag === 'textarea') return
        if (el?.closest?.('[data-notethread]')) return
        if (el === document.querySelector('[placeholder="Type tag, press Enter"]')) return
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }

  const removeTag = (tag) => setTags(tags.filter((t) => t !== tag))

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-end md:items-center justify-center z-50 md:p-4"
      onClick={completedMode ? onClose : handleSave}
    >
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title + Done + Star */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center gap-3">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 text-xl font-semibold text-gray-800 outline-none placeholder-gray-300"
            placeholder="Task title"
          />
          {/* Done checkbox — Enter handled by global save, prevent native button activation */}
          <button
            onClick={() => setCompleted((c) => !c)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              completed
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
            }`}
            title={completed ? 'Mark incomplete' : 'Mark complete'}
          >
            {completed && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
          {/* Star toggle — Enter handled by global save, prevent native button activation */}
          <button
            onClick={() => {
              const next = !starred
              setStarred(next)
              if (next) setPriority('high')
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
            className={`flex-shrink-0 text-xl leading-none transition-colors ${
              starred ? 'text-yellow-400' : 'text-gray-300 hover:text-gray-400'
            }`}
            title={starred ? 'Unstar' : 'Star'}
          >
            {starred ? '★' : '☆'}
          </button>
        </div>

        {/* Fields */}
        <div className="px-6 py-5 space-y-4">
          {/* Project */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 w-20 flex-shrink-0">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400"
            >
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Bucket */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 w-20 flex-shrink-0">When</label>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400"
            >
              {BUCKETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>

          {/* Due date */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 w-20 flex-shrink-0">Due</label>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400"
              />
              {dueDate && (
                <button
                  onClick={() => setDueDate('')}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 w-20 flex-shrink-0">Priority</label>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setPriority(opt.value)}
                  tabIndex={0}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 ${
                    priority === opt.value
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'text-gray-500 border-gray-200 hover:border-gray-400 bg-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="flex items-start gap-3">
            <label className="text-sm text-gray-400 w-20 flex-shrink-0 mt-2">Tags</label>
            <div className="flex-1">
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-red-500 leading-none font-medium">×</button>
                    </span>
                  ))}
                </div>
              )}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }
                  if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) setTags(tags.slice(0, -1))
                }}
                placeholder="Type tag, press Enter"
                className="w-full text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="flex items-start gap-3">
            <label className="text-sm text-gray-400 w-20 flex-shrink-0 mt-2">Notes</label>
            <div className="flex-1">
              <textarea
                ref={notesRef}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes…"
                rows={1}
                className="w-full text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 resize-none"
                style={{ minHeight: '36px' }}
                onInput={(e) => {
                  e.target.style.height = '36px'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
              />
            </div>
          </div>

          {/* Messages */}
          <div className="flex items-start gap-3">
            <label className="text-sm text-gray-400 w-20 flex-shrink-0 mt-2">Messages</label>
            <div className="flex-1">
              <NoteThread
                ownerUid={ownerUid}
                taskId={task.id}
                taskTitle={title || task.title || 'Untitled'}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-2 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={handleDelete} className="text-sm text-red-400 hover:text-red-600 transition-colors">
              Delete task
            </button>
            <span className="text-xs text-gray-300">⌘⌫</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            {completedMode ? (
              <button
                onClick={() => {
                  if (title.trim()) {
                    let finalBucket = bucket
                    if (dueDate) {
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const due = new Date(dueDate + 'T00:00:00')
                      const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24))
                      if (diffDays <= 0) finalBucket = 'today'
                      else if (diffDays === 1) finalBucket = 'tomorrow'
                      else if (diffDays <= 7) finalBucket = 'soon'
                      else finalBucket = 'someday'
                    }
                    const updates = { title: title.trim(), notes, priority, tags, projectId, bucket: finalBucket, dueDate: dueDate || null, starred, completed: false }
                    if (starred && !task.starred) updates.sortWeight = Date.now()
                    updateTask(task.id, updates)
                  }
                  onClose()
                }}
                className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Move to Incomplete
              </button>
            ) : (
              <button onClick={handleSave} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                Save <span className="text-blue-200 text-xs ml-1">↵</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

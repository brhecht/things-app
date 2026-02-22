import { useState, useEffect, useRef } from 'react'
import useStore from '../store'

const PRIORITIES = [
  { value: null,     label: 'None' },
  { value: 'high',   label: '🔴 High' },
  { value: 'medium', label: '🟡 Medium' },
  { value: 'low',    label: '🔵 Low' },
]

const BUCKETS = [
  { value: 'today',    label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'soon',     label: 'Soon' },
  { value: 'someday',  label: 'Someday' },
]

export default function TaskModal({ task, onClose }) {
  const { updateTask, deleteTask, projects } = useStore()

  const [title,     setTitle]     = useState(task.title)
  const [notes,     setNotes]     = useState(task.notes)
  const [priority,  setPriority]  = useState(task.priority)
  const [tags,      setTags]      = useState(task.tags)
  const [tagInput,  setTagInput]  = useState('')
  const [projectId, setProjectId] = useState(task.projectId)
  const [bucket,    setBucket]    = useState(task.bucket)

  const titleRef = useRef(null)
  useEffect(() => { titleRef.current?.focus() }, [])

  const handleSave = () => {
    if (title.trim()) {
      updateTask(task.id, { title: title.trim(), notes, priority, tags, projectId, bucket })
    }
    onClose()
  }

  const handleDelete = () => { deleteTask(task.id); onClose() }

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') handleSave()
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') handleDelete()
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
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onClick={handleSave}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-xl font-semibold text-gray-800 outline-none placeholder-gray-300"
            placeholder="Task title"
          />
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

          {/* Priority */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 w-20 flex-shrink-0">Priority</label>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setPriority(opt.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
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
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes…"
              rows={4}
              className="flex-1 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-2 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={handleDelete} className="text-sm text-red-400 hover:text-red-600 transition-colors">
              Delete task
            </button>
            <span className="text-xs text-gray-300">⌘⌫ to delete</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

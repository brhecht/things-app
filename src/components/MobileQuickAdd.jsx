import { useState } from 'react'
import useStore from '../store'

export default function MobileQuickAdd({ defaultBucket = 'inbox' }) {
  const { addTask, projects } = useStore()
  const [title, setTitle] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [bucket, setBucket] = useState(defaultBucket)
  const [projectId, setProjectId] = useState('unassigned')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    addTask(title.trim(), projectId, bucket)
    setTitle('')
    setExpanded(false)
    setBucket(defaultBucket)
    setProjectId('unassigned')
  }

  const BUCKETS = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'today', label: 'Today' },
    { id: 'waiting', label: 'Waiting' },
    { id: 'tomorrow', label: 'Tomorrow' },
    { id: 'soon', label: 'This Week' },
    { id: 'someday', label: 'Later' },
  ]

  return (
    <div className="fixed bottom-14 left-0 right-0 z-30 pb-[env(safe-area-inset-bottom)]">
      {/* Expanded options */}
      {expanded && (
        <div className="bg-white border-t border-gray-200 px-4 py-3 space-y-3 animate-slide-up">
          {/* Bucket pills */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">When</label>
            <div className="flex flex-wrap gap-1.5">
              {BUCKETS.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBucket(b.id)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    bucket === b.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project select */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full text-sm bg-gray-100 border-0 rounded-lg px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
        </div>
      )}

      {/* Input bar */}
      <form onSubmit={handleSubmit} className="bg-white border-t border-gray-100 px-3 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            expanded ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 active:bg-gray-200'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 transition-transform ${expanded ? 'rotate-45' : ''}`}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 text-sm bg-gray-50 rounded-lg px-3 py-2.5 border-0 focus:ring-2 focus:ring-blue-500 focus:bg-white placeholder-gray-400"
          style={{ fontSize: '16px' }} // prevent iOS zoom on focus
        />
        {title.trim() && (
          <button
            type="submit"
            className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 active:bg-blue-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        )}
      </form>
    </div>
  )
}

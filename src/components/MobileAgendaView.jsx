import { useState, useRef } from 'react'
import useStore from '../store'
import TaskModal from './TaskModal'

const BUCKETS = [
  { id: 'inbox',    label: 'Inbox',     accent: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  { id: 'today',    label: 'Today',     accent: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  { id: 'waiting',  label: 'Waiting / Delegated', accent: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  { id: 'tomorrow', label: 'Tomorrow',  accent: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  { id: 'soon',     label: 'This Week', accent: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  { id: 'someday',  label: 'Later',     accent: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200' },
]

const PROJECT_COLORS = {
  'hc-admin':         'bg-blue-100 text-blue-700',
  'hc-content':       'bg-emerald-100 text-emerald-700',
  'hc-revenue':       'bg-amber-100 text-amber-700',
  'portfolio':        'bg-purple-100 text-purple-700',
  'personal-finance': 'bg-teal-100 text-teal-700',
  'life-admin':       'bg-orange-100 text-orange-700',
  'network':          'bg-cyan-100 text-cyan-700',
  'georgetown':       'bg-rose-100 text-rose-700',
  'friends':          'bg-pink-100 text-pink-700',
  'from-nico':        'bg-lime-100 text-lime-700',
  'unassigned':       'bg-stone-100 text-stone-600',
}

const PROJECT_ORDER = [
  'hc-admin', 'hc-content', 'hc-revenue', 'portfolio',
  'life-admin', 'personal-finance', 'network', 'georgetown', 'friends',
  'from-nico', 'unassigned',
]

const BUCKET_ORDER = ['inbox', 'today', 'waiting', 'tomorrow', 'soon', 'someday']

function SwipeableTaskCard({ task, onComplete, onBucketChange, onTap, projects }) {
  const ref = useRef(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const currentX = useRef(0)
  const swiping = useRef(false)
  const [offset, setOffset] = useState(0)
  const [committed, setCommitted] = useState(null) // 'left' | 'right' | null

  const THRESHOLD = 80

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    currentX.current = 0
    swiping.current = false
    setCommitted(null)
  }

  const handleTouchMove = (e) => {
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current

    // If vertical motion > horizontal, let the scroll happen
    if (!swiping.current && Math.abs(dy) > Math.abs(dx)) return
    swiping.current = true

    currentX.current = dx
    setOffset(dx)

    if (dx > THRESHOLD) setCommitted('right')
    else if (dx < -THRESHOLD) setCommitted('left')
    else setCommitted(null)
  }

  const handleTouchEnd = () => {
    if (!swiping.current) {
      onTap()
      return
    }

    if (committed === 'right') {
      // Swipe right → complete
      setOffset(400)
      setTimeout(() => onComplete(), 200)
    } else if (committed === 'left') {
      // Swipe left → bump to next bucket
      setOffset(-400)
      const idx = BUCKET_ORDER.indexOf(task.bucket)
      const nextBucket = BUCKET_ORDER[Math.min(idx + 1, BUCKET_ORDER.length - 1)]
      if (nextBucket !== task.bucket) {
        setTimeout(() => onBucketChange(nextBucket), 200)
      }
      setTimeout(() => { setOffset(0); setCommitted(null) }, 300)
    } else {
      setOffset(0)
    }
    swiping.current = false
  }

  const projectName = projects.find(p => p.id === task.projectId)?.name || ''

  const bgColor = committed === 'right'
    ? 'bg-green-500'
    : committed === 'left'
    ? 'bg-blue-500'
    : 'bg-gray-100'

  const nextBucketLabel = () => {
    const idx = BUCKET_ORDER.indexOf(task.bucket)
    const next = BUCKET_ORDER[Math.min(idx + 1, BUCKET_ORDER.length - 1)]
    return BUCKETS.find(b => b.id === next)?.label || ''
  }

  return (
    <div className="relative overflow-hidden rounded-xl mb-1.5">
      {/* Swipe reveal background */}
      <div className={`absolute inset-0 flex items-center justify-between px-5 ${bgColor} transition-colors`}>
        <span className="text-white text-sm font-semibold">
          {committed === 'right' ? '✓ Done' : ''}
        </span>
        <span className="text-white text-sm font-semibold">
          {committed === 'left' ? `→ ${nextBucketLabel()}` : ''}
        </span>
      </div>

      {/* Card */}
      <div
        ref={ref}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative bg-white px-4 py-3.5 flex items-center gap-3 transition-transform ${
          task.priority === 'high' ? 'border-l-[3px] border-l-emerald-500' :
          task.priority === 'medium' ? 'border-l-[3px] border-l-amber-400' :
          task.priority === 'low' ? 'border-l-[3px] border-l-violet-400' : ''
        }`}
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping.current ? 'none' : 'transform 0.2s ease-out',
          touchAction: 'pan-y',
        }}
      >
        {/* Star */}
        <span className={`text-lg leading-none flex-shrink-0 ${task.starred ? 'text-yellow-400' : 'text-gray-200'}`}>
          {task.starred ? '★' : ''}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] text-gray-900 font-medium truncate">{task.title}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {projectName && (
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${PROJECT_COLORS[task.projectId] || 'bg-gray-100 text-gray-600'}`}>
                {projectName}
              </span>
            )}
            {task.notes && task.notes.trim() && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Chevron */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-300 flex-shrink-0">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  )
}

export default function MobileAgendaView({ bucketFilter, projectFilter }) {
  const { tasks, projects, updateTask } = useStore()
  const [selectedTask, setSelectedTask] = useState(null)

  // Filter tasks
  let visibleTasks = tasks.filter(t => !t.completed)

  if (bucketFilter && bucketFilter !== 'all') {
    visibleTasks = visibleTasks.filter(t => t.bucket === bucketFilter)
  }
  if (projectFilter) {
    visibleTasks = visibleTasks.filter(t => t.projectId === projectFilter)
  }

  // Determine which buckets to show
  const bucketsToShow = bucketFilter && bucketFilter !== 'all'
    ? BUCKETS.filter(b => b.id === bucketFilter)
    : BUCKETS

  const getTitle = () => {
    if (projectFilter) {
      const proj = projects.find(p => p.id === projectFilter)
      return proj?.name || 'Project'
    }
    if (bucketFilter === 'inbox') return 'Inbox'
    if (bucketFilter === 'today') return 'Today'
    return 'All Tasks'
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-gray-900">{getTitle()}</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {visibleTasks.length} task{visibleTasks.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-auto px-4 pb-36">
        {bucketsToShow.map(bucket => {
          const bucketTasks = visibleTasks
            .filter(t => t.bucket === bucket.id)
            .sort((a, b) => {
              if (a.starred !== b.starred) return b.starred ? 1 : -1
              const ai = PROJECT_ORDER.indexOf(a.projectId)
              const bi = PROJECT_ORDER.indexOf(b.projectId)
              return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
            })

          if (bucketTasks.length === 0) return null

          return (
            <div key={bucket.id} className="mb-5">
              {/* Only show bucket header if showing multiple buckets */}
              {bucketsToShow.length > 1 && (
                <div className={`flex items-center gap-2 mb-2 pb-1.5 border-b ${bucket.border}`}>
                  <h2 className={`font-semibold text-xs uppercase tracking-widest ${bucket.accent}`}>
                    {bucket.label}
                  </h2>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${bucket.bg} ${bucket.accent}`}>
                    {bucketTasks.length}
                  </span>
                </div>
              )}

              {bucketTasks.map(task => (
                <SwipeableTaskCard
                  key={task.id}
                  task={task}
                  projects={projects}
                  onComplete={() => updateTask(task.id, { completed: true })}
                  onBucketChange={(newBucket) => updateTask(task.id, { bucket: newBucket })}
                  onTap={() => setSelectedTask(task)}
                />
              ))}
            </div>
          )
        })}

        {visibleTasks.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-300 text-lg font-medium">No tasks here</p>
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskModal
          task={tasks.find(t => t.id === selectedTask.id) || selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  )
}

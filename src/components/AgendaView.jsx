import { useState } from 'react'
import useStore from '../store'
import TaskModal from './TaskModal'

const BUCKETS = [
  { id: 'inbox',    label: 'Inbox',     accent: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  { id: 'today',    label: 'Today',     accent: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
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

// Must match PROJECT_ORDER in store.js
const PROJECT_ORDER = [
  'hc-admin', 'hc-content', 'hc-revenue', 'portfolio',
  'life-admin', 'personal-finance', 'network', 'georgetown', 'friends',
  'from-nico', 'unassigned',
]

function formatDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr + 'T00:00:00')
  return due < today
}

export default function AgendaView({ filters }) {
  const { tasks, projects, selectedProjectId, updateTask } = useStore()
  const [selectedTask, setSelectedTask] = useState(null)

  // Filter tasks
  let visibleTasks = selectedProjectId
    ? tasks.filter((t) => t.projectId === selectedProjectId && !t.completed)
    : tasks.filter((t) => !t.completed)

  if (filters.starred) visibleTasks = visibleTasks.filter((t) => t.starred)
  if (filters.priorities.length > 0) visibleTasks = visibleTasks.filter((t) => filters.priorities.includes(t.priority))

  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const hasActiveFilters = filters.starred || filters.priorities.length > 0

  const getProjectName = (projectId) => {
    const p = projects.find((proj) => proj.id === projectId)
    return p ? p.name : ''
  }

  const handleStar = (e, task) => {
    e.stopPropagation()
    if (!task.starred) {
      updateTask(task.id, { starred: true, sortWeight: Date.now(), priority: 'high' })
    } else {
      updateTask(task.id, { starred: false })
    }
  }

  const handleDone = (e, task) => {
    e.stopPropagation()
    updateTask(task.id, { completed: true })
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-8 py-5 border-b border-gray-100 bg-white">
        <h1 className="text-xl font-semibold text-gray-800">
          {selectedProject ? selectedProject.name : 'All Tasks'} — Agenda
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {visibleTasks.length} active task{visibleTasks.length !== 1 ? 's' : ''}
          {hasActiveFilters && <span className="ml-1 text-blue-400">(filtered)</span>}
        </p>
      </div>

      {/* Agenda list */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {BUCKETS.map((bucket) => {
            const bucketTasks = visibleTasks
              .filter((t) => t.bucket === bucket.id)
              .sort((a, b) => {
                // Starred first
                if (a.starred !== b.starred) return b.starred ? 1 : -1
                // Then by project order
                const ai = PROJECT_ORDER.indexOf(a.projectId)
                const bi = PROJECT_ORDER.indexOf(b.projectId)
                return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
              })

            if (bucketTasks.length === 0) return null

            return (
              <div key={bucket.id}>
                {/* Bucket header */}
                <div className={`flex items-center gap-3 mb-3 pb-2 border-b-2 ${bucket.border}`}>
                  <h2 className={`font-semibold text-sm uppercase tracking-widest ${bucket.accent}`}>
                    {bucket.label}
                  </h2>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bucket.bg} ${bucket.accent}`}>
                    {bucketTasks.length}
                  </span>
                </div>

                {/* Tasks */}
                <div className="space-y-1">
                  {bucketTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`group flex items-center gap-3 px-4 py-2.5 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer ${
                        task.priority === 'high' ? 'border-l-[3px] border-l-emerald-500' :
                        task.priority === 'medium' ? 'border-l-[3px] border-l-amber-400' :
                        task.priority === 'low' ? 'border-l-[3px] border-l-violet-400' : ''
                      }`}
                    >
                      {/* Done button */}
                      <button
                        onClick={(e) => handleDone(e, task)}
                        className="mt-0.5 w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                        title="Mark complete"
                      />

                      {/* Star */}
                      <button
                        onClick={(e) => handleStar(e, task)}
                        className={`text-base leading-none flex-shrink-0 transition-colors ${task.starred ? 'text-yellow-400' : 'text-gray-200 hover:text-gray-400'}`}
                        title={task.starred ? 'Unstar' : 'Star'}
                      >
                        {task.starred ? '★' : '☆'}
                      </button>

                      {/* Title */}
                      <span className="flex-1 text-sm text-gray-800 font-medium truncate">
                        {task.title}
                      </span>

                      {/* Project badge */}
                      {task.projectId && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md flex-shrink-0 ${PROJECT_COLORS[task.projectId] || 'bg-gray-100 text-gray-600'}`}>
                          {getProjectName(task.projectId)}
                        </span>
                      )}

                      {/* Due date */}
                      {task.dueDate && (
                        <span className={`text-xs flex-shrink-0 ${isOverdue(task.dueDate) ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selectedTask && (
        <TaskModal
          task={tasks.find((t) => t.id === selectedTask.id) || selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  )
}

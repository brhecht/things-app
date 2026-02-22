import { useState } from 'react'
import useStore from '../store'
import TaskCard from './TaskCard'
import TaskModal from './TaskModal'

const BUCKETS = [
  { id: 'today',    label: 'Today',    accent: 'text-blue-600',   border: 'border-blue-200',   dropBg: 'bg-blue-50',   count: 'bg-blue-100 text-blue-700' },
  { id: 'tomorrow', label: 'Tomorrow', accent: 'text-indigo-600', border: 'border-indigo-200', dropBg: 'bg-indigo-50', count: 'bg-indigo-100 text-indigo-700' },
  { id: 'soon',     label: 'This Week',     accent: 'text-violet-600', border: 'border-violet-200', dropBg: 'bg-violet-50', count: 'bg-violet-100 text-violet-700' },
  { id: 'someday',  label: 'Later',  accent: 'text-gray-500',   border: 'border-gray-200',   dropBg: 'bg-gray-100',  count: 'bg-gray-100 text-gray-500' },
]

const PROJECT_COLORS = {
  'hc-admin':         'bg-blue-100 text-blue-700',
  'hc-content':       'bg-emerald-100 text-emerald-700',
  'hc-revenue':       'bg-amber-100 text-amber-700',
  'portfolio':        'bg-purple-100 text-purple-700',
  'personal-finance': 'bg-teal-100 text-teal-700',
  'life-admin':       'bg-orange-100 text-orange-700',
  'georgetown':       'bg-rose-100 text-rose-700',
  'friends':          'bg-pink-100 text-pink-700',
}

function Column({ bucket, tasks, projects, onTaskClick }) {
  const { addTask, moveTask, selectedProjectId } = useStore()
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newProjectId, setNewProjectId] = useState(selectedProjectId || projects[0]?.id || '')
  const [isOver, setIsOver] = useState(false)

  const handleAdd = (e) => {
    e.preventDefault()
    if (newTitle.trim() && newProjectId) {
      addTask(newTitle.trim(), newProjectId, bucket.id)
      setNewTitle('')
      setAdding(false)
    }
  }

  // Group tasks by project, maintaining project list order
  const grouped = projects
    .map((proj) => ({ proj, tasks: tasks.filter((t) => t.projectId === proj.id) }))
    .filter(({ tasks }) => tasks.length > 0)

  return (
    <div className="flex-1 flex flex-col min-w-[220px]">
      {/* Column header */}
      <div className={`flex items-center justify-between mb-4 pb-3 border-b-2 ${bucket.border}`}>
        <h2 className={`font-semibold text-sm uppercase tracking-widest ${bucket.accent}`}>{bucket.label}</h2>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bucket.count}`}>{tasks.length}</span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsOver(true) }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsOver(false); const id = e.dataTransfer.getData('taskId'); if (id) moveTask(id, bucket.id) }}
        className={`flex-1 min-h-[120px] rounded-2xl p-2 -m-2 transition-colors duration-150 space-y-4 ${isOver ? bucket.dropBg : ''}`}
      >
        {/* Project groups */}
        {grouped.map(({ proj, tasks: projTasks }) => (
          <div key={proj.id}>
            <div className={`text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-md mb-2 ${PROJECT_COLORS[proj.id] || 'bg-gray-100 text-gray-600'}`}>
              {proj.name}
            </div>
            <div className="space-y-2">
              {projTasks.map((task) => (
                <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
              ))}
            </div>
          </div>
        ))}

        {/* Add task */}
        {adding ? (
          <form onSubmit={handleAdd} className="bg-white rounded-xl border border-blue-200 shadow-sm p-3 space-y-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              placeholder="Task name…"
              className="w-full text-sm outline-none text-gray-700 placeholder-gray-300"
            />
            <select
              value={newProjectId}
              onChange={(e) => setNewProjectId(e.target.value)}
              className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-blue-400"
            >
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button type="submit" className="text-xs bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 font-medium">Add</button>
              <button type="button" onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => { setNewProjectId(selectedProjectId || projects[0]?.id || ''); setAdding(true) }}
            className="w-full text-left text-sm text-gray-300 hover:text-gray-500 px-1 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  )
}

export default function KanbanBoard({ filters }) {
  const { tasks, projects, selectedProjectId } = useStore()
  const [selectedTask, setSelectedTask] = useState(null)

  // Base visibility: project filter + not completed
  let visibleTasks = selectedProjectId
    ? tasks.filter((t) => t.projectId === selectedProjectId && !t.completed)
    : tasks.filter((t) => !t.completed)

  // Apply filters
  if (filters.starred) visibleTasks = visibleTasks.filter((t) => t.starred)
  if (filters.priorities.length > 0) visibleTasks = visibleTasks.filter((t) => filters.priorities.includes(t.priority))

  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const hasActiveFilters = filters.starred || filters.priorities.length > 0

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-8 py-5 border-b border-gray-100 bg-white">
        <h1 className="text-xl font-semibold text-gray-800">
          {selectedProject ? selectedProject.name : 'All Tasks'}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {visibleTasks.length} active task{visibleTasks.length !== 1 ? 's' : ''}
          {hasActiveFilters && <span className="ml-1 text-blue-400">(filtered)</span>}
        </p>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto p-8">
        <div className="flex gap-8 min-h-full">
          {BUCKETS.map((bucket) => (
            <Column
              key={bucket.id}
              bucket={bucket}
              tasks={visibleTasks.filter((t) => t.bucket === bucket.id)}
              projects={projects}
              onTaskClick={setSelectedTask}
            />
          ))}
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

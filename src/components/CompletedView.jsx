import { useState } from 'react'
import useStore from '../store'

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

export default function CompletedView({ onBack }) {
  const { tasks, projects, updateTask, isViewer } = useStore()
  const completedTasks = tasks
    .filter(t => t.completed)
    .sort((a, b) => (b.completedAt || b.createdAt || 0) - (a.completedAt || a.createdAt || 0))

  const getProjectName = (projectId) => {
    const p = projects.find(proj => proj.id === projectId)
    return p ? p.name : ''
  }

  const handleUncomplete = (taskId) => {
    updateTask(taskId, { completed: false })
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-5 md:px-8 pt-5 md:pt-6 pb-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="text-blue-600 text-sm font-medium flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
          )}
          <h1 className="text-xl font-semibold text-gray-800">Completed Tasks</h1>
        </div>
        <p className="text-sm text-gray-400 mt-0.5">
          {completedTasks.length} completed task{completedTasks.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-auto px-4 md:px-8 py-4 pb-36">
        <div className="max-w-3xl mx-auto space-y-1">
          {completedTasks.map(task => (
            <div
              key={task.id}
              className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-100"
            >
              {/* Uncomplete button */}
              {!isViewer && (
                <button
                  onClick={() => handleUncomplete(task.id)}
                  className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 active:bg-blue-600"
                  title="Restore task"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              )}

              {/* Title */}
              <span className="flex-1 text-sm text-gray-400 line-through truncate">
                {task.title}
              </span>

              {/* Project badge */}
              {task.projectId && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md flex-shrink-0 opacity-60 ${PROJECT_COLORS[task.projectId] || 'bg-gray-100 text-gray-600'}`}>
                  {getProjectName(task.projectId)}
                </span>
              )}
            </div>
          ))}

          {completedTasks.length === 0 && (
            <div className="text-center py-16">
              <p className="text-gray-300 text-lg font-medium">No completed tasks</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

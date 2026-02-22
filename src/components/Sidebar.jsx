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
}

const DOT_COLORS = {
  'hc-admin':         'bg-blue-400',
  'hc-content':       'bg-emerald-400',
  'hc-revenue':       'bg-amber-400',
  'portfolio':        'bg-purple-400',
  'personal-finance': 'bg-teal-400',
  'life-admin':       'bg-orange-400',
  'network':          'bg-cyan-400',
  'georgetown':       'bg-rose-400',
  'friends':          'bg-pink-400',
}

const PRIORITY_LABELS = { high: '🔴 High', medium: '🟡 Medium', low: '🔵 Low' }

function InlineInput({ placeholder, onSubmit, onCancel }) {
  const [value, setValue] = useState('')
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()) }}
      className="px-2 py-1"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder={placeholder}
        className="w-full bg-gray-700 text-gray-100 text-sm px-2 py-1.5 rounded-md border border-gray-500 outline-none focus:border-blue-400 placeholder-gray-500"
      />
    </form>
  )
}

export default function Sidebar({ filters, setFilters }) {
  const { user, signOut, projects, selectedProjectId, setSelectedProject, addProject } = useStore()
  const [addingProject, setAddingProject] = useState(false)

  const hasActiveFilters = filters.starred || filters.priorities.length > 0

  const togglePriority = (p) =>
    setFilters((prev) => ({
      ...prev,
      priorities: prev.priorities.includes(p)
        ? prev.priorities.filter((x) => x !== p)
        : [...prev.priorities, p],
    }))

  const clearFilters = () => setFilters({ starred: false, priorities: [] })

  return (
    <aside className="w-60 bg-gray-900 flex flex-col h-full border-r border-gray-800 select-none">
      {/* Logo + user */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center text-white text-sm font-bold">T</div>
          <span className="text-white font-semibold text-base tracking-tight">Things</span>
        </div>
        {user && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400 truncate">{user.displayName || user.email}</span>
            <button onClick={signOut} className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-2 flex-shrink-0">
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-0.5">
        {/* All Tasks */}
        <button
          onClick={() => setSelectedProject(null)}
          className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
            selectedProjectId === null ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/60'
          }`}
        >
          <span className="text-base leading-none">▤</span>
          <span>All Tasks</span>
        </button>

        {/* Projects */}
        {projects.map((proj) => (
          <button
            key={proj.id}
            onClick={() => setSelectedProject(proj.id)}
            className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedProjectId === proj.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/60'
            }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[proj.id] || 'bg-gray-400'}`} />
            <span className="truncate">{proj.name}</span>
          </button>
        ))}

        {/* Add project */}
        {addingProject ? (
          <InlineInput
            placeholder="Project name"
            onSubmit={(name) => { addProject(name); setAddingProject(false) }}
            onCancel={() => setAddingProject(false)}
          />
        ) : (
          <button
            onClick={() => setAddingProject(true)}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            + New Project
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* ── Filters ───────────────────────────────────────── */}
        <div className="border-t border-gray-700 pt-3 mt-2 pb-1">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filters</span>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                Clear
              </button>
            )}
          </div>

          {/* Starred toggle */}
          <button
            onClick={() => setFilters((prev) => ({ ...prev, starred: !prev.starred }))}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              filters.starred ? 'bg-yellow-500/20 text-yellow-300' : 'text-gray-400 hover:bg-gray-700/60 hover:text-gray-300'
            }`}
          >
            <span className={`text-base leading-none ${filters.starred ? 'text-yellow-400' : ''}`}>
              {filters.starred ? '★' : '☆'}
            </span>
            <span>Starred only</span>
          </button>

          {/* Priority filters */}
          {['high', 'medium', 'low'].map((p) => {
            const active = filters.priorities.includes(p)
            return (
              <button
                key={p}
                onClick={() => togglePriority(p)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active ? 'bg-gray-700 text-gray-200' : 'text-gray-400 hover:bg-gray-700/60 hover:text-gray-300'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                  active ? 'bg-blue-500 border-blue-500' : 'border-gray-600'
                }`}>
                  {active && <span className="text-white text-[9px] leading-none font-bold">✓</span>}
                </span>
                <span className="capitalize">{PRIORITY_LABELS[p]}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}

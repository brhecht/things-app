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
  'infra':            'bg-slate-100 text-slate-700',
  'unassigned':       'bg-stone-100 text-stone-600',
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
  'from-nico':        'bg-lime-400',
  'infra':            'bg-slate-400',
  'unassigned':       'bg-stone-400',
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

export default function Sidebar({ filters, setFilters, isOpen, onToggle }) {
  const { user, signOut, projects, selectedProjectId, setSelectedProject, addProject, reorderProjects } = useStore()
  const [addingProject, setAddingProject] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)

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
    <aside className={`bg-gray-900 flex flex-col h-full border-r border-gray-800 select-none transition-all duration-200 ${isOpen ? 'w-60' : 'w-10'} flex-shrink-0`}>
      {/* Toggle button — standard sidebar panel icon */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center w-full h-10 text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors flex-shrink-0"
        title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <line x1="9" y1="3" x2="9" y2="21" />
          {isOpen && <polyline points="15 10 13 12 15 14" />}
          {!isOpen && <polyline points="13 10 15 12 13 14" />}
        </svg>
      </button>
      {!isOpen && (
        <div className="flex flex-col items-center gap-1 mt-2 px-1">
          {/* Collapsed: show project dots for quick visual reference */}
          {projects.map((proj) => (
            <button
              key={proj.id}
              onClick={() => setSelectedProject(proj.id)}
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                selectedProjectId === proj.id ? 'bg-blue-600' : 'hover:bg-gray-700/60'
              }`}
              title={proj.name}
            >
              <span className={`w-2 h-2 rounded-full ${DOT_COLORS[proj.id] || 'bg-gray-400'}`} />
            </button>
          ))}
        </div>
      )}
      <div className={`flex-1 flex flex-col overflow-hidden ${isOpen ? '' : 'hidden'}`}>
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

        {/* Projects (draggable to reorder) */}
        {projects.map((proj, idx) => (
          <div
            key={proj.id}
            draggable
            onDragStart={(e) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', '') }}
            onDragEnd={() => { if (dragIdx != null && dropIdx != null && dragIdx !== dropIdx) reorderProjects(dragIdx, dropIdx); setDragIdx(null); setDropIdx(null) }}
            onDragOver={(e) => { e.preventDefault(); setDropIdx(idx) }}
            className="relative"
          >
            {/* Drop indicator line */}
            {dragIdx != null && dropIdx === idx && dropIdx !== dragIdx && (
              <div className={`absolute left-3 right-3 h-0.5 bg-blue-400 rounded-full ${dropIdx < dragIdx ? '-top-0.5' : '-bottom-0.5'}`} />
            )}
            <button
              onClick={() => setSelectedProject(proj.id)}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                dragIdx === idx ? 'opacity-40' : ''
              } ${
                selectedProjectId === proj.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/60'
              }`}
            >
              <span className="text-gray-600 cursor-grab text-[10px] leading-none mr-0.5">⠿</span>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[proj.id] || 'bg-gray-400'}`} />
              <span className="truncate">{proj.name}</span>
            </button>
          </div>
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
      </div>
    </aside>
  )
}

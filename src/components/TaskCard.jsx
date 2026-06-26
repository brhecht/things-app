import { useState, useRef, useEffect } from 'react'
import useStore from '../store'
import { isOverdueHard, fmtDate, presetDate } from '../dateLane'

const MENU_ITEM = 'w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 transition-colors'

export default function TaskCard({ task, onClick }) {
  const { updateTask, deleteTask, snoozeTask } = useStore()
  const user = useStore((s) => s.user)
  const [showTooltip, setShowTooltip] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const menuRef = useRef(null)

  // Unread message indicator
  const meta = task._msgMeta
  const emailKey = user?.email?.replace(/\./g, '_')
  const hasUnread = meta?.lastAt && emailKey && !meta.readBy?.[emailKey]

  // Close the snooze menu on outside click
  useEffect(() => {
    if (!snoozeOpen) return
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) { setSnoozeOpen(false); setPicking(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [snoozeOpen])

  const handleCheck = (e) => { e.stopPropagation(); updateTask(task.id, { completed: true }) }

  const handleStar = (e) => {
    e.stopPropagation()
    if (!task.starred) updateTask(task.id, { starred: true, sortWeight: Date.now() })
    else updateTask(task.id, { starred: false })
  }

  const handleDelete = (e) => { e.stopPropagation(); deleteTask(task.id) }

  // Snooze presets. "Do today" / "Someday" / "Clear date" un-schedule (no date).
  const doSnooze = (e, kind) => {
    e.stopPropagation()
    if (kind === 'today')      { updateTask(task.id, { bucket: 'today',   dueDate: null }); setSnoozeOpen(false); return }
    if (kind === 'someday')    { updateTask(task.id, { bucket: 'someday', dueDate: null }); setSnoozeOpen(false); return }
    if (kind === 'unschedule') { updateTask(task.id, { bucket: 'anytime', dueDate: null }); setSnoozeOpen(false); return }
    const d = presetDate(kind)
    if (d) { snoozeTask(task.id, d); setSnoozeOpen(false) }
  }

  const isUnassigned = !task.projectId || task.projectId === 'unassigned'
  const overdue = isOverdueHard(task)
  const borderClass = overdue
    ? 'border-l-[3px] border-l-red-500'
    : (isUnassigned ? 'border-l-[3px] border-l-amber-400' : '')
  const snoozes = task.snoozeCount || 0

  return (
    <div
      draggable
      onDragStart={(e) => { setShowTooltip(false); e.dataTransfer.setData('taskId', task.id); e.currentTarget.style.opacity = '0.4' }}
      onDragEnd={(e) => { e.currentTarget.style.opacity = '1' }}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      className={`group relative bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:shadow-md hover:border-gray-200 transition-all select-none shadow-sm ${borderClass} ${overdue ? 'bg-red-50/40' : ''}`}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute left-0 right-0 -top-1 -translate-y-full z-50 pointer-events-none px-1">
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg leading-relaxed break-words">
            {task.title}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2.5">
        {/* Complete */}
        <button
          onClick={handleCheck}
          className="mt-0.5 w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0 hover:border-blue-500 hover:bg-blue-50 transition-colors"
        />

        {/* Title */}
        <p className="flex-1 text-sm text-gray-800 font-medium leading-snug">{task.title}</p>

        {/* Due date chip */}
        {task.dueDate && (
          <span className={`flex-shrink-0 text-[11px] font-medium ${overdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
            {overdue ? '⚠ ' : ''}{fmtDate(task.dueDate)}
          </span>
        )}

        {/* Snooze count — the anti-treadmill stare */}
        {snoozes >= 2 && (
          <span className={`flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold ${snoozes >= 4 ? 'text-orange-500' : 'text-gray-400'}`} title={`Snoozed ${snoozes}×`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2 2" />
            </svg>
            {snoozes}
          </span>
        )}

        {/* Snooze */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setSnoozeOpen((o) => !o) }}
            className={`flex-shrink-0 transition-colors ${snoozeOpen ? 'text-gray-600' : 'text-gray-400 hover:text-gray-600'}`}
            title="Snooze"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2 2" />
              <path d="M5 3 2 6" />
              <path d="m22 6-3-3" />
              <path d="M6.38 18.7 4 21" />
              <path d="M17.64 18.67 20 21" />
            </svg>
          </button>
          {snoozeOpen && (
            <div
              className="absolute right-0 top-6 z-50 w-40 bg-white rounded-lg shadow-xl border border-gray-100 py-1 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={(e) => doSnooze(e, 'today')} className={MENU_ITEM}>Do today</button>
              <button onClick={(e) => doSnooze(e, 'tomorrow')} className={MENU_ITEM}>Tomorrow</button>
              <button onClick={(e) => doSnooze(e, 'weekend')} className={MENU_ITEM}>This weekend</button>
              <button onClick={(e) => doSnooze(e, 'nextweek')} className={MENU_ITEM}>Next week</button>
              {picking ? (
                <input
                  type="date"
                  autoFocus
                  onChange={(e) => { if (e.target.value) { snoozeTask(task.id, e.target.value); setSnoozeOpen(false); setPicking(false) } }}
                  className="w-full text-xs text-gray-700 border-t border-gray-100 px-3 py-1.5 outline-none"
                />
              ) : (
                <button onClick={(e) => { e.stopPropagation(); setPicking(true) }} className={MENU_ITEM}>Pick a date…</button>
              )}
              <div className="border-t border-gray-100 my-1" />
              <button onClick={(e) => doSnooze(e, 'someday')} className={`${MENU_ITEM} text-gray-500`}>Someday</button>
              {task.dueDate && (
                <button onClick={(e) => doSnooze(e, 'unschedule')} className={`${MENU_ITEM} text-gray-500`}>Clear date</button>
              )}
            </div>
          )}
        </div>

        {/* Star */}
        <button
          onClick={handleStar}
          className={`flex-shrink-0 text-base leading-none transition-colors ${task.starred ? 'text-yellow-400' : 'text-gray-200 hover:text-gray-400'}`}
        >
          {task.starred ? '★' : '☆'}
        </button>

        {/* Assigned to Nico indicator */}
        {task.assignedToNico && (
          <span className="flex-shrink-0 text-[10px] font-bold text-lime-600 bg-lime-50 px-1 py-0.5 rounded" title="Assigned to Nico">→N</span>
        )}

        {/* Unread message indicator */}
        {hasUnread && (
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" title="Unread messages" />
        )}

        {/* Notes indicator */}
        {!hasUnread && task.notes && task.notes.trim() && (
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-400" title="Has notes" />
        )}

        {/* Delete — hover only */}
        <button
          onClick={handleDelete}
          className="flex-shrink-0 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback, useRef, Component } from 'react'
import { collection, doc, getDoc, getDocs, orderBy, query, limit, setDoc } from 'firebase/firestore'
import { db, auth } from '../firebase'
import useStore from '../store'
import TaskModal from './TaskModal'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  componentDidCatch(e, info) { console.error('GamePlan render error:', e, info) }
  render() {
    if (this.state.error) return (
      <div className="p-4 text-red-600 text-sm bg-red-50 rounded-lg">
        <strong>Render error:</strong> {this.state.error.message}
        <button className="ml-3 underline" onClick={() => this.setState({ error: null })}>retry</button>
      </div>
    )
    return this.props.children
  }
}

// ── Constants ────────────────────────────────────────────────────
const BS = {
  deep:    { label: 'Deep',   cls: 'bg-blue-100 text-blue-700',   next: 'medium'  },
  medium:  { label: 'Medium', cls: 'bg-gray-100 text-gray-600',   next: 'low'     },
  low:     { label: 'Low',    cls: 'bg-green-100 text-green-700', next: 'unknown' },
  unknown: { label: '?',      cls: 'bg-amber-100 text-amber-700', next: 'deep'    },
}
const BS_SORT       = { deep: 0, medium: 1, low: 2, unknown: 3 }
const BREAK_DUE_MIN = 90

// ── Helpers ──────────────────────────────────────────────────────
const SLUG_MAP = { 'beehiiv-post': 'Substack Post', 'beehiiv': 'Substack' }
function humanizeNotes(notes) {
  if (!notes) return ''
  return Object.entries(SLUG_MAP).reduce(
    (s, [slug, label]) => s.replace(new RegExp(slug, 'gi'), label), notes)
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(ms) {
  const d = new Date(ms)
  let h = d.getHours(), m = d.getMinutes()
  const ap = h < 12 ? 'AM' : 'PM'
  h = h % 12; if (h === 0) h = 12
  return `${h}:${m < 10 ? '0' : ''}${m}${ap}`
}

function fmtDur(ms) {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

const DEFAULT_GP = () => ({
  order: [], done: {}, estimates: {}, brainspace: {}, suppressed: [],
  focusId: null, focusStart: null, planStart: null,
  onBreak: false, breakStart: null, lastBreak: Date.now(),
})

// ── Schedule builder ─────────────────────────────────────────────
// Returns an ordered array of render items:
//   { type: 'task',     task, start, end, done }
//   { type: 'task-split', task, part, totalParts, start, end, partMs, estMs, done }
//   { type: 'calblock', event, start, end, ongoing }
//   { type: 'unknown',  task }
function buildRenderPlan(activeTasks, unknownTasks, gp, calEvents, cursorMs) {
  const sortedCal = [...calEvents].sort((a, b) => a.startMs - b.startMs)
  const items = []
  let cursor  = cursorMs
  let calIdx  = 0

  // Insert cal events that have already started (or just started) before cursor
  function drainPastCal() {
    while (calIdx < sortedCal.length) {
      const cal = sortedCal[calIdx]
      if (cal.startMs > cursor) break
      calIdx++
      if (cal.endMs > cursor) {
        items.push({ type: 'calblock', event: cal, start: cal.startMs, end: cal.endMs, ongoing: true })
        cursor = cal.endMs
      }
    }
  }

  drainPastCal()

  for (const task of activeTasks) {
    if (gp.done[task.id]) {
      items.push({ type: 'task', task, start: null, end: null, done: true })
      continue
    }

    const estMs    = (gp.estimates[task.id] || 30) * 60000
    let remaining  = estMs
    let partStart  = cursor
    const splits   = [] // collect split segments first, then annotate with totalParts

    while (remaining > 0) {
      const nextCal = calIdx < sortedCal.length ? sortedCal[calIdx] : null

      if (nextCal && nextCal.startMs < cursor + remaining) {
        if (nextCal.startMs <= cursor) {
          // Cal block starts at or before current cursor — insert it, advance cursor
          items.push({ type: 'calblock', event: nextCal, start: nextCal.startMs, end: nextCal.endMs, ongoing: false })
          cursor = Math.max(cursor, nextCal.endMs)
          calIdx++
          drainPastCal()
        } else {
          // Cal block interrupts this task — create a split segment
          const part1Ms = nextCal.startMs - cursor
          splits.push({ start: cursor, end: nextCal.startMs, partMs: part1Ms })
          remaining -= part1Ms
          cursor     = nextCal.startMs

          items.push({ type: 'calblock', event: nextCal, start: nextCal.startMs, end: nextCal.endMs, ongoing: false })
          cursor = nextCal.endMs
          calIdx++
          drainPastCal()
        }
      } else {
        // No overlap — assign remaining time as one chunk
        splits.push({ start: cursor, end: cursor + remaining, partMs: remaining })
        cursor    += remaining
        remaining  = 0
      }
    }

    if (splits.length === 1) {
      // No actual split — single task row
      items.push({ type: 'task', task, start: splits[0].start, end: splits[0].end, done: false })
    } else {
      // Multi-segment split
      splits.forEach((seg, i) => {
        items.push({
          type: 'task-split', task,
          part: i + 1, totalParts: splits.length,
          start: seg.start, end: seg.end,
          partMs: seg.partMs, estMs,
          done: false,
        })
      })
    }
  }

  // Append any future cal events not yet inserted
  while (calIdx < sortedCal.length) {
    const cal = sortedCal[calIdx++]
    if (cal.endMs > cursorMs) {
      items.push({ type: 'calblock', event: cal, start: cal.startMs, end: cal.endMs, ongoing: false })
    }
  }

  // Unknown tasks always go at the end with no time window
  for (const task of unknownTasks) {
    items.push({ type: 'unknown', task, done: !!gp.done[task.id] })
  }

  return items
}

// ── Component ────────────────────────────────────────────────────
export default function GamePlanView() {
  const { tasks, dataUid, updateTask } = useStore()
  const [gp,          setGp]          = useState(null)
  const [now,         setNow]         = useState(Date.now())
  const [editingId,   setEditingId]   = useState(null)
  const [askMsg,      setAskMsg]      = useState('')
  const [draggingId,  setDraggingId]  = useState(null)
  const [dropTargetId,setDropTargetId]= useState(null)
  const [gpTab,       setGpTab]       = useState(() => localStorage.getItem('btGpTab') || 'setup')
  const setGpTabPersist = (t) => { localStorage.setItem('btGpTab', t); setGpTab(t) }
  const [calEvents,   setCalEvents]   = useState([])
  const [calLoading,  setCalLoading]  = useState(false)
  const [calError,    setCalError]    = useState(null)
  const [inheritedBs, setInheritedBs] = useState({})
  const [inheritedEst,setInheritedEst]= useState({})
  const [selectedTask, setSelectedTask] = useState(null)
  const wasDraggingRef = useRef(false)
  const dateKey = todayKey()

  // 1-second ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load game plan + carryover scan
  useEffect(() => {
    if (!dataUid) return
    getDoc(doc(db, 'users', dataUid, 'gamePlan', dateKey)).then(async snap => {
      const gpData = snap.exists() ? { ...DEFAULT_GP(), ...snap.data() } : DEFAULT_GP()
      setGp(gpData)

      // Carryover: scan last 7 gamePlan docs for inherited values
      try {
        const colRef   = collection(db, 'users', dataUid, 'gamePlan')
        const pastSnap = await getDocs(query(colRef, orderBy('__name__', 'desc'), limit(8)))
        const pastDocs = pastSnap.docs.filter(d => d.id < dateKey).slice(0, 7)
        const bsMap = {}, estMap = {}
        for (const pd of pastDocs) {
          const d = pd.data()
          for (const tid of (d.order || [])) {
            if (!(tid in bsMap)  && d.brainspace?.[tid]) bsMap[tid]  = d.brainspace[tid]
            if (!(tid in estMap) && d.estimates?.[tid])  estMap[tid] = d.estimates[tid]
          }
        }
        setInheritedBs(bsMap)
        setInheritedEst(estMap)
      } catch (_) {} // non-critical
    })
  }, [dataUid, dateKey])

  // Fetch calendar events using Firebase ID token for auth
  const fetchCalendar = useCallback(async () => {
    const user = auth.currentUser
    if (!user) return // not signed in yet — will retry when called again
    setCalLoading(true)
    setCalError(null)
    try {
      const idToken = await user.getIdToken()
      const res     = await fetch('/api/calendar-today', {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      const data = await res.json()
      if (data.ok) {
        setCalEvents(data.events || [])
      } else {
        // If calendar creds not yet configured, fail silently
        if (res.status === 500 && data.error?.includes('refresh')) {
          setCalEvents([]) // creds not set up yet
        } else {
          setCalError(data.error || 'Calendar fetch failed')
        }
      }
    } catch (e) {
      setCalError(e.message)
    } finally {
      setCalLoading(false)
    }
  }, [])

  useEffect(() => { fetchCalendar() }, [fetchCalendar])

  // Persist a partial update to Firestore (merge)
  const persist = useCallback((fields) => {
    if (!dataUid) return
    setDoc(doc(db, 'users', dataUid, 'gamePlan', dateKey), fields, { merge: true })
  }, [dataUid, dateKey])

  const update = useCallback((fields) => {
    setGp(prev => {
      const next = { ...prev, ...fields }
      persist(fields)
      return next
    })
  }, [persist])

  if (!gp) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading game plan…
      </div>
    )
  }

  // ── Derive task list ─────────────────────────────────────────
  const suppressed   = gp.suppressed || []
  const todayTasks   = tasks.filter(t => t.bucket === 'today' && !t.completed && !suppressed.includes(t.id))
  const parkedTasks  = tasks.filter(t => t.bucket === 'today' && !t.completed && suppressed.includes(t.id))
  const savedOrder   = gp.order || []
  const orderedTasks = [
    ...savedOrder.map(id => todayTasks.find(t => t.id === id)).filter(Boolean),
    ...todayTasks.filter(t => !savedOrder.includes(t.id)),
  ]
  const activeTasks  = orderedTasks.filter(t => (gp.brainspace[t.id] || 'medium') !== 'unknown')
  const unknownTasks = orderedTasks.filter(t => (gp.brainspace[t.id] || 'medium') === 'unknown')
  const planTasks    = [...activeTasks, ...unknownTasks]

  function parkTask(taskId) {
    update({ suppressed: [...suppressed, taskId] })
  }
  function unparkTask(taskId) {
    update({ suppressed: suppressed.filter(id => id !== taskId) })
  }

  // ── Build render plan ────────────────────────────────────────
  const planCursor  = gp.planStart || now
  let renderPlan = []
  try {
    renderPlan = buildRenderPlan(activeTasks, unknownTasks, gp, calEvents, planCursor)
  } catch (e) {
    console.error('buildRenderPlan threw:', e)
  }

  // Current active task (first non-done task item)
  const currentTaskItem = renderPlan.find(
    item => (item.type === 'task' || item.type === 'task-split') && !item.done
  ) || null
  const currentTask = currentTaskItem?.task || null

  // Are we currently in a meeting?
  const currentMeeting = calEvents.find(e => e.startMs <= now && e.endMs > now) || null

  // Focus state
  const isFocusing = !gp.onBreak && !!gp.focusId && currentTask?.id === gp.focusId

  // Projected end: last task or calblock end time
  const lastItem      = renderPlan.filter(i => i.type !== 'unknown' && i.end).slice(-1)[0]
  const projectedEnd  = lastItem?.end || now

  // ── Focus display ────────────────────────────────────────────
  let focusLeftMin = 0, focusIsOver = false, focusFrac = 0
  if (isFocusing && currentTask) {
    const estMs   = (gp.estimates[currentTask.id] || 30) * 60000
    const leftMs  = gp.focusStart + estMs - now
    focusIsOver   = leftMs < 0
    focusLeftMin  = Math.ceil(Math.abs(leftMs) / 60000)
    focusFrac     = focusIsOver ? 1 : 1 - leftMs / estMs
  }

  // ── Break / progress ─────────────────────────────────────────
  const breakMin      = gp.onBreak ? Math.floor((now - gp.breakStart) / 60000) : 0
  const sinceBreakMin = Math.round((now - (gp.lastBreak || now)) / 60000)
  const breakDue      = !gp.onBreak && sinceBreakMin >= BREAK_DUE_MIN
  const doneCount     = planTasks.filter(t => gp.done[t.id]).length
  const totalCount    = activeTasks.length
  const pct           = totalCount ? Math.round(doneCount / totalCount * 100) : 0
  const remMin        = activeTasks.filter(t => !gp.done[t.id]).reduce((s, t) => s + (gp.estimates[t.id] || 30), 0)

  // ── Actions ──────────────────────────────────────────────────
  function markDone(taskId) {
    update({ done: { ...gp.done, [taskId]: true } })
    updateTask(taskId, { completed: true })
    if (gp.focusId === taskId) update({ focusId: null, focusStart: null })
  }

  function toggleFocus() {
    if (!currentTask || gp.onBreak) return
    if (isFocusing) {
      update({ focusId: null, focusStart: null })
    } else {
      update({ focusId: currentTask.id, focusStart: Date.now() })
    }
  }

  function startBreak() {
    update({ onBreak: true, breakStart: Date.now(), focusId: null, focusStart: null })
  }

  function endBreak() {
    update({ onBreak: false, breakStart: null, lastBreak: Date.now() })
  }

  function smartSort() {
    const withRank = orderedTasks.map((t, i) => ({
      id: t.id, rank: BS_SORT[gp.brainspace[t.id] || 'medium'], i,
    }))
    withRank.sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : a.i - b.i)
    update({ order: withRank.map(x => x.id) })
  }

  function cycleBrainspace(taskId) {
    const cur = gp.brainspace[taskId] || 'medium'
    update({ brainspace: { ...gp.brainspace, [taskId]: BS[cur].next } })
  }

  function saveEstimate(taskId, val) {
    const v = parseInt(val, 10)
    if (v > 0) update({ estimates: { ...gp.estimates, [taskId]: v } })
    setEditingId(null)
  }

  // ── Drag handlers ────────────────────────────────────────────
  // dragOrderRef tracks the live reordering during a drag — synchronous, no stale closures
  const dragOrderRef = useRef(null)

  function onDragStart(e, id) {
    wasDraggingRef.current = true
    setDraggingId(id)
    dragOrderRef.current = planTasks.map(t => t.id) // snapshot current order
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e, targetId) {
    e.preventDefault()
    if (!dragOrderRef.current || !draggingId || draggingId === targetId) return
    const base = [...dragOrderRef.current] // always read from ref, never stale
    const from = base.indexOf(draggingId), to = base.indexOf(targetId)
    if (from === -1 || to === -1) return
    base.splice(from, 1); base.splice(to, 0, draggingId)
    dragOrderRef.current = base
    setGp(prev => ({ ...prev, order: base })) // visual reorder only
    setDropTargetId(targetId) // set here instead of onDragEnter to avoid child-element flicker
  }

  function onDragEnd() {
    const finalOrder = dragOrderRef.current
    dragOrderRef.current = null
    if (finalOrder) persist({ order: finalOrder }) // one clean persist from ref
    setDraggingId(null)
    setDropTargetId(null)
    setTimeout(() => { wasDraggingRef.current = false }, 0)
  }

  // ── "How am I doing?" ────────────────────────────────────────
  function howAmIDoing() {
    if (gp.onBreak) return `On break (${Math.floor((now - gp.breakStart) / 60000)} min) — step away fully, the plan re-flows when you're back.`
    const pctLocal = totalCount ? Math.round(doneCount / totalCount * 100) : 0
    const deepRemaining = activeTasks.filter(t => !gp.done[t.id] && (gp.brainspace[t.id] || 'medium') === 'deep').length
    const allLowRemaining = activeTasks.filter(t => !gp.done[t.id]).every(t => ['low', 'unknown'].includes(gp.brainspace[t.id] || 'medium'))
    const six = new Date(); six.setHours(18, 0, 0, 0)
    if (!currentTask) return "Board's clear — that's a complete day; close the laptop and let it count."
    if (sinceBreakMin >= 90) return `${sinceBreakMin} min since your last break — you're running on fumes; take 10 and you'll close sharper.`
    if (deepRemaining >= 2 && now > six.getTime() - 2 * 3600000) return `${deepRemaining} deep-focus tasks still ahead late in the day — decide now: power through, or push the non-urgent ones to tomorrow.`
    if (allLowRemaining && doneCount > 0) return "You're in the low-focus home stretch — mechanical from here, just execute and coast."
    if (doneCount === 0) return `Fresh board — start on "${currentTask.title}" and the first checkmark drags the rest into motion.`
    if (pctLocal >= 75) return `${doneCount} of ${totalCount} done — this is already a strong day; protect the win and don't invent new work to fill the gap.`
    if (projectedEnd > six.getTime() + 300000) return `${doneCount} of ${totalCount} done — realistically the tail slips past 6, and that's fine; nail the high-priority ones and the rest is gravy.`
    return `${doneCount} of ${totalCount} done with "${currentTask.title}" on deck — steady progress, clock's on your side.`
  }

  // ── Render helpers ───────────────────────────────────────────
  function TaskRow({ task, start, end, done: isDone, splitLabel }) {
    const rawBs = gp.brainspace[task.id] || 'medium'
    const bs = BS[rawBs] ? rawBs : 'medium'
    const bsCfg      = BS[bs]
    const isNow      = !isDone && !gp.onBreak && currentTask?.id === task.id
    const est        = gp.estimates[task.id] || 30
    const isDragging = draggingId === task.id

    return (
      <div
        draggable
        onDragStart={e => onDragStart(e, task.id)}
        onDragOver={e => onDragOver(e, task.id)}
        onDragEnd={onDragEnd}
        className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg mb-1.5 border select-none transition-opacity ${
          isDragging ? 'opacity-40 border-[#378add]' :
          isDone     ? 'bg-[#f4f2ec] border-transparent' :
          isNow      ? 'bg-[#fbfcfe] border-l-[3px] border-l-[#378add] border-[#e7e5df]' :
          'bg-white border-[#e7e5df]'
        }`}
      >
        {dropTargetId === task.id && (
          <div className="absolute -top-[3px] left-0 right-0 h-[3px] rounded-full bg-[#378add] pointer-events-none z-10" />
        )}
        {/* Grip */}
        <div className="cursor-grab flex-none text-[#bdbbb2] text-lg leading-none">⠿</div>
        {/* Done circle */}
        <button
          onClick={e => { e.stopPropagation(); !isDone && markDone(task.id) }}
          className={`flex-none w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center ${
            isDone ? 'bg-[#1d9e75] border-[#1d9e75]' : 'border-[#c7c5bc] hover:border-[#1d9e75]'
          }`}
        >
          {isDone && (
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-[11px] h-[11px]">
              <path d="M5 12l5 5L20 6" />
            </svg>
          )}
        </button>
        {/* Time window */}
        <div className="text-[11px] text-[#5f5e5a] tabular-nums min-w-[88px] flex-none">
          {isDone ? 'done' : (start && end) ? `${fmt(start)}–${fmt(end)}` : ''}
        </div>
        {/* Title */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedTask(task)}>
          <div className={`text-[14px] flex items-center gap-1.5 flex-wrap ${isDone ? 'line-through text-[#888780]' : 'text-[#2c2c2a]'}`}>
            <span className="truncate">{task.title}</span>
            {splitLabel && <span className="text-[10px] text-[#aaa9a1] flex-none">{splitLabel}</span>}
            {isNow && (
              <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-[#e6f1fb] text-[#185fa5] flex-none">
                {gp.focusId === task.id ? 'focusing' : 'now'}
              </span>
            )}
          </div>
          {task.notes && (
            <div className="text-[11.5px] text-[#888780] mt-0.5 truncate">{humanizeNotes(task.notes)}</div>
          )}
        </div>
        {/* Estimate */}
        <div className="flex-none">
          {editingId === task.id ? (
            <input
              autoFocus type="number" min="1" defaultValue={est}
              className="w-12 text-[12px] text-center border border-[#b5d4f4] rounded px-1 py-0.5 outline-none bg-white"
              onBlur={e => saveEstimate(task.id, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingId(null) }}
            />
          ) : (
            <button
              onClick={e => { e.stopPropagation(); !isDone && setEditingId(task.id) }}
              className={`text-[11px] tabular-nums ${isDone ? 'text-[#aaa9a1]' : 'text-[#888780] hover:text-[#185fa5]'}`}
            >
              {est}m
            </button>
          )}
        </div>
        {/* Brainspace badge */}
        <button
          onClick={e => { e.stopPropagation(); !isDone && cycleBrainspace(task.id) }}
          className={`flex-none text-[10.5px] font-medium px-2 py-0.5 rounded-full transition-opacity ${bsCfg.cls} ${isDone ? 'opacity-40 cursor-default' : 'hover:opacity-80'}`}
        >
          {bsCfg.label}
        </button>
        {!isDone && (
          <button
            onClick={e => { e.stopPropagation(); parkTask(task.id) }}
            className="flex-none opacity-0 group-hover:opacity-100 text-[10.5px] px-2 py-0.5 rounded-full text-[#aaa9a1] hover:bg-[#f0ede6] hover:text-[#888780] transition-opacity"
            title="Park for today"
          >
            Park
          </button>
        )}
      </div>
    )
  }

  function CalBlockRow({ event, ongoing }) {
    const durMin = Math.round((event.endMs - event.startMs) / 60000)
    const isPast = event.endMs <= now
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-1.5 border select-none ${
        ongoing ? 'bg-[#fff7ed] border-[#fed7aa]' :
        isPast  ? 'bg-[#f9f8f5] border-transparent opacity-60' :
        'bg-[#fdf8f2] border-[#f0e0c4]'
      }`}>
        <div className="flex-none text-[#d97706] text-[13px] leading-none">⊘</div>
        <div className="text-[11px] text-[#b45309] tabular-nums min-w-[88px] flex-none">
          {fmt(event.startMs)}–{fmt(event.endMs)}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[13.5px] font-medium truncate ${ongoing ? 'text-[#92400e]' : isPast ? 'text-[#888780]' : 'text-[#78350f]'}`}>
            {event.title}
          </div>
        </div>
        <div className="flex-none text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-[#fed7aa] text-[#b45309]">
          {ongoing ? 'now' : `${durMin}m`}
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto bg-[#faf9f7] px-6 py-5">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-[17px] font-medium text-[#2c2c2a]">Today's game plan</h1>
            <p className="text-[12px] text-[#888780] mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Calendar refresh */}
            <button
              onClick={fetchCalendar}
              disabled={calLoading}
              title={calError ? `Calendar error: ${calError}` : calEvents.length ? `${calEvents.length} event${calEvents.length !== 1 ? 's' : ''} loaded` : 'Refresh calendar'}
              className={`text-[11.5px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                calError   ? 'border-red-200 text-red-500 bg-red-50' :
                calLoading ? 'border-[#e7e5df] text-[#bdbbb2] cursor-wait' :
                calEvents.length ? 'border-[#f0e0c4] text-[#b45309] bg-[#fdf8f2] hover:bg-[#faeeda]' :
                'border-[#e7e5df] text-[#888780] hover:bg-[#f0ede6]'
              }`}
            >
              {calLoading ? '↻' : calError ? '⚠ cal' : calEvents.length ? `⊘ ${calEvents.length}` : '⊘ cal'}
            </button>
            <div className="text-[19px] font-medium tabular-nums text-[#2c2c2a]">{fmt(now)}</div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 mb-5 bg-[#f0ede6] rounded-lg p-1 w-fit">
          {['setup', 'run'].map(tab => (
            <button
              key={tab}
              onClick={() => setGpTabPersist(tab)}
              className={`text-[12.5px] font-medium px-4 py-1.5 rounded-md capitalize transition-colors ${
                gpTab === tab ? 'bg-white text-[#2c2c2a] shadow-sm' : 'text-[#888780] hover:text-[#5f5e5a]'
              }`}
            >
              {tab === 'setup' ? '⊞ Setup' : '▷ Run'}
            </button>
          ))}
        </div>

        {/* ── SETUP TAB ─────────────────────────────────────────── */}
        {gpTab === 'setup' && (
          <SetupTable
            tasks={todayTasks}
            gp={gp}
            update={update}
            inheritedBs={inheritedBs}
            inheritedEst={inheritedEst}
            calEvents={calEvents}
            onTaskClick={setSelectedTask}
            parkedTasks={parkedTasks}
            onPark={parkTask}
            onUnpark={unparkTask}
            onLaunch={() => {
              // Persist inherited values that haven't been manually set
              const bsPatch = {}, estPatch = {}
              todayTasks.forEach(t => {
                if (!gp.brainspace[t.id] && inheritedBs[t.id])  bsPatch[t.id]  = inheritedBs[t.id]
                if (!gp.estimates[t.id]  && inheritedEst[t.id]) estPatch[t.id] = inheritedEst[t.id]
              })
              if (Object.keys(bsPatch).length)  update({ brainspace: { ...gp.brainspace, ...bsPatch } })
              if (Object.keys(estPatch).length)  update({ estimates:  { ...gp.estimates,  ...estPatch } })
              update({ planStart: Date.now() })
              setGpTabPersist('run')
            }}
          />
        )}

        {/* ── RUN TAB ───────────────────────────────────────────── */}
        {gpTab === 'run' && <ErrorBoundary>

        {/* How am I doing */}
        <div className="mb-3">
          <button
            onClick={() => setAskMsg(m => m ? '' : howAmIDoing())}
            className="text-[12.5px] font-medium text-[#185fa5] bg-[#eef5fd] border border-[#b5d4f4] rounded-full px-3 py-1.5 hover:bg-[#e1eefb] active:scale-[.98] transition-transform"
          >
            How am I doing?
          </button>
          {askMsg && (
            <div className="mt-2 text-[13px] text-[#3c3a36] italic bg-white border border-[#e7e5df] border-l-[3px] border-l-[#378add] rounded-r-lg px-3 py-2 leading-relaxed">
              {askMsg}
            </div>
          )}
        </div>

        {/* Break bar */}
        <div className={`text-[12px] rounded-lg px-3 py-1.5 mb-3 border ${
          gp.onBreak ? 'bg-[#e6f1fb] border-[#b5d4f4] text-[#185fa5] font-medium' :
          breakDue   ? 'bg-[#faeeda] border-[#fac775] text-[#854f0b] font-medium' :
          'bg-white border-[#e7e5df] text-[#5f5e5a]'
        }`}>
          {gp.onBreak ? `On break · ${breakMin} min` :
           breakDue   ? `${sinceBreakMin} min since a break — time to step away` :
           `${sinceBreakMin} min since your last break`}
        </div>

        {/* Now card — meeting in progress takes priority */}
        {currentMeeting ? (
          <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-xl px-4 py-3 mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#b45309] mb-1">meeting in progress</div>
            <div className="text-[16px] font-medium text-[#78350f] mb-1">{currentMeeting.title}</div>
            <div className="text-[12px] text-[#b45309]">
              {fmt(currentMeeting.startMs)}–{fmt(currentMeeting.endMs)} · ends in {Math.ceil((currentMeeting.endMs - now) / 60000)} min
            </div>
          </div>
        ) : gp.onBreak ? (
          <div className="bg-[#eaf3ee] border border-[#9fe1cb] rounded-xl px-4 py-3 mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#0f6e56] mb-1">on a break</div>
            <div className="text-[16px] font-medium text-[#04342c] mb-2">Stepped away — back when you're ready</div>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-[30px] font-medium tabular-nums text-[#0f6e56] leading-none">{breakMin}</span>
              <span className="text-[13px] text-[#0f6e56]">min on break</span>
            </div>
            <button onClick={endBreak} className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-[#1d9e75] text-white active:scale-[.98]">
              Back from break
            </button>
          </div>
        ) : currentTask ? (
          <div className={`rounded-xl px-4 py-3 mb-4 border ${
            focusIsOver ? 'bg-[#faeeda] border-[#fac775]' : 'bg-[#e6f1fb] border-[#b5d4f4]'
          }`}>
            <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${focusIsOver ? 'text-[#854f0b]' : 'text-[#185fa5]'}`}>
              {isFocusing
                ? (focusIsOver ? 'over — wrap it or stop the timer' : `focusing · ends ${fmt(gp.focusStart + (gp.estimates[currentTask.id] || 30) * 60000)}`)
                : `up next · ~${gp.estimates[currentTask.id] || 30} min`}
            </div>
            <div className={`text-[16px] font-medium mb-2 ${focusIsOver ? 'text-[#412402]' : 'text-[#042c53]'}`}>
              {currentTask.title}
            </div>
            {isFocusing && (
              <>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className={`text-[30px] font-medium tabular-nums leading-none ${focusIsOver ? 'text-[#854f0b]' : 'text-[#0c447c]'}`}>{focusLeftMin}</span>
                  <span className={`text-[13px] ${focusIsOver ? 'text-[#854f0b]' : 'text-[#185fa5]'}`}>{focusIsOver ? 'min over' : 'min left'}</span>
                </div>
                <div className={`h-[5px] rounded-full overflow-hidden mb-3 ${focusIsOver ? 'bg-[#f4dcae]' : 'bg-[#cfe2f6]'}`}>
                  <div
                    className={`h-full rounded-full transition-all duration-[900ms] linear ${focusIsOver ? 'bg-[#ba7517]' : 'bg-[#378add]'}`}
                    style={{ width: `${Math.min(100, focusFrac * 100)}%` }}
                  />
                </div>
              </>
            )}
            <div className="flex gap-2 flex-wrap mt-1">
              <button onClick={toggleFocus} className={`text-[12px] font-medium px-3 py-1.5 rounded-full border active:scale-[.98] ${isFocusing ? 'bg-white text-[#185fa5] border-[#b5d4f4]' : 'bg-[#378add] text-white border-[#378add]'}`}>
                {isFocusing ? 'Stop focus' : 'Start focus'}
              </button>
              <button onClick={() => markDone(currentTask.id)} className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-white text-[#185fa5] border border-[#b5d4f4] active:scale-[.98]">
                Mark done
              </button>
              <button onClick={startBreak} className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-white text-[#5f5e5a] border border-[#d3d1c7] active:scale-[.98]">
                Take a break
              </button>
            </div>
          </div>
        ) : null}

        {/* Projected finish */}
        <div className="text-[12px] text-[#0f6e56] mb-3">
          {currentTask
            ? gp.onBreak
              ? 'Plan paused — re-flows from the clock when you hit "Back from break."'
              : `If you roll straight through: finish ~${fmt(projectedEnd)} · ${remMin} min of work left`
            : 'All blocks cleared. Go home.'}
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#888780]">
            Today · {planTasks.length} task{planTasks.length !== 1 ? 's' : ''}
            {calEvents.length > 0 && ` · ${calEvents.length} event${calEvents.length !== 1 ? 's' : ''}`}
          </div>
          {planTasks.length > 1 && (
            <button onClick={smartSort} className="text-[11.5px] font-medium text-[#185fa5] bg-[#eef5fd] border border-[#b5d4f4] rounded-full px-2.5 py-1 hover:bg-[#e1eefb] active:scale-[.98] transition-transform">
              ✦ Smart sort
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-[#eceae3] rounded-full overflow-hidden mb-1">
          <div className="h-full bg-[#1d9e75] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[12px] text-[#888780] mb-3">{doneCount} of {totalCount} done · {pct}%</div>

        {/* Render plan rows */}
        <div>
          {renderPlan.map((item, idx) => {
            if (item.type === 'task') {
              return <TaskRow key={item.task.id} task={item.task} start={item.start} end={item.end} done={item.done} />
            }
            if (item.type === 'task-split') {
              return (
                <TaskRow
                  key={`${item.task.id}-p${item.part}`}
                  task={item.task}
                  start={item.start}
                  end={item.end}
                  done={item.done}
                  splitLabel={`(${item.part}/${item.totalParts})`}
                />
              )
            }
            if (item.type === 'calblock') {
              return <CalBlockRow key={`cal-${item.event.id}-${idx}`} event={item.event} ongoing={item.ongoing} />
            }
            if (item.type === 'unknown') {
              const bs = gp.brainspace[item.task.id] || 'unknown'
              return (
                <div key={item.task.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-1.5 border bg-white border-dashed border-[#e7e5df] opacity-75 select-none">
                  <div className="cursor-grab flex-none text-[#bdbbb2] text-lg leading-none">⠿</div>
                  <button
                    onClick={() => markDone(item.task.id)}
                    className="flex-none w-[18px] h-[18px] rounded-full border-[1.5px] border-[#c7c5bc] hover:border-[#1d9e75] flex items-center justify-center"
                  />
                  <div className="text-[11px] text-[#5f5e5a] tabular-nums min-w-[88px] flex-none">— open-ended</div>
                  <div className="flex-1 min-w-0 text-[14px] text-[#2c2c2a] truncate">{item.task.title}</div>
                  <button onClick={() => cycleBrainspace(item.task.id)} className="flex-none text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:opacity-80">?</button>
                </div>
              )
            }
            return null
          })}
        </div>

        {renderPlan.length === 0 && (
          <div className="text-center text-[13px] text-[#888780] py-10">
            No tasks in Today — add some from the board first, then come back here to plan.
          </div>
        )}

        {parkedTasks.length > 0 && (
          <div className="mt-4 border-t border-[#f0ede6] pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#bdbbb2] mb-2">Parked today</div>
            {parkedTasks.map(task => (
              <div key={task.id} className="flex items-center justify-between px-3 py-2 rounded-lg mb-1 bg-[#f9f8f5]">
                <span className="text-[13px] text-[#bdbbb2] truncate flex-1">{task.title}</span>
                <button
                  onClick={() => unparkTask(task.id)}
                  className="flex-none ml-3 text-[11px] font-medium px-2 py-0.5 rounded-full text-[#888780] hover:bg-[#e7e5df] hover:text-[#2c2c2a]"
                >
                  Add back
                </button>
              </div>
            ))}
          </div>
        )}

        </ErrorBoundary>}

      {selectedTask && <TaskModal task={selectedTask} onClose={() => setSelectedTask(null)} />}
      </div>
    </div>
  )
}

// ── SetupTable ────────────────────────────────────────────────────
function SetupTable({ tasks: todayTasks, gp, update, inheritedBs = {}, inheritedEst = {}, calEvents = [], onLaunch, onTaskClick, parkedTasks = [], onPark, onUnpark }) {
  const [estInputs, setEstInputs] = useState({})

  function setBs(taskId, bs) {
    update({ brainspace: { ...gp.brainspace, [taskId]: bs } })
  }

  function commitEst(taskId, val) {
    const v = parseInt(val, 10)
    if (v > 0) update({ estimates: { ...gp.estimates, [taskId]: v } })
    setEstInputs(prev => { const n = { ...prev }; delete n[taskId]; return n })
  }

  if (todayTasks.length === 0) {
    return (
      <div className="text-center text-[13px] text-[#888780] py-10">
        No tasks in Today — add some from the board first, then come back here to plan.
      </div>
    )
  }

  const totalMin = todayTasks.reduce((s, t) => s + (gp.estimates[t.id] || inheritedEst[t.id] || 30), 0)
  const meetingMin = calEvents.reduce((s, e) => s + Math.round((e.endMs - e.startMs) / 60000), 0)

  return (
    <div>
      <p className="text-[12.5px] text-[#5f5e5a] mb-4">
        Set focus level and time for each task, then hit <strong>Launch plan</strong> to run the day.
      </p>

      {/* Calendar events preview */}
      {calEvents.length > 0 && (
        <div className="mb-4 rounded-xl border border-[#f0e0c4] overflow-hidden">
          <div className="px-4 py-2 bg-[#fdf8f2] border-b border-[#f0e0c4]">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#b45309]">⊘ Locked calendar blocks</span>
          </div>
          {calEvents.sort((a, b) => a.startMs - b.startMs).map(e => {
            const durMin = Math.round((e.endMs - e.startMs) / 60000)
            return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2 border-b border-[#f9f1e7] last:border-0">
                <span className="text-[11px] text-[#b45309] tabular-nums min-w-[110px]">
                  {new Date(e.startMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}–
                  {new Date(e.endMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span className="text-[13px] text-[#78350f] flex-1 truncate">{e.title}</span>
                <span className="text-[11px] text-[#b45309]">{durMin}m</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Task table */}
      <div className="rounded-xl border border-[#e7e5df] overflow-hidden bg-white mb-4">
        <div className="grid grid-cols-[1fr_auto_auto] gap-0 border-b border-[#e7e5df] bg-[#f5f3ed]">
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888780]">Task</div>
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888780] text-center min-w-[220px]">Focus level</div>
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888780] text-center min-w-[72px]">Min</div>
        </div>

        {todayTasks.map((task, idx) => {
          const bs             = gp.brainspace[task.id] || inheritedBs[task.id] || null
          const isInheritedBs  = !gp.brainspace[task.id] && !!inheritedBs[task.id]
          const est            = estInputs[task.id] !== undefined ? estInputs[task.id] : (gp.estimates[task.id] || inheritedEst[task.id] || 30)
          const isInheritedEst = !gp.estimates[task.id] && !!inheritedEst[task.id] && estInputs[task.id] === undefined
          const isLast         = idx === todayTasks.length - 1

          return (
            <div key={task.id} className={`group grid grid-cols-[1fr_auto_auto_auto] gap-0 items-center ${!isLast ? 'border-b border-[#f0ede6]' : ''}`}>
              <div className="px-4 py-3 cursor-pointer" onClick={() => onTaskClick && onTaskClick(task)}>
                <div className="text-[13.5px] text-[#2c2c2a] font-medium leading-snug truncate">{task.title}</div>
                {task.notes && <div className="text-[11.5px] text-[#aaa9a1] truncate mt-0.5">{task.notes}</div>}
              </div>

              <div className="px-4 py-3 flex items-center gap-1 min-w-[220px]" title={isInheritedBs ? 'Carried over from a previous day' : undefined}>
                {[
                  { key: 'deep',    label: 'Deep',   active: 'bg-blue-100 text-blue-700 ring-1 ring-blue-300',    inactive: 'text-[#888780] hover:bg-[#f0ede6]' },
                  { key: 'medium',  label: 'Medium', active: 'bg-gray-100 text-gray-700 ring-1 ring-gray-300',    inactive: 'text-[#888780] hover:bg-[#f0ede6]' },
                  { key: 'low',     label: 'Low',    active: 'bg-green-100 text-green-700 ring-1 ring-green-300', inactive: 'text-[#888780] hover:bg-[#f0ede6]' },
                  { key: 'unknown', label: '?',      active: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300', inactive: 'text-[#888780] hover:bg-[#f0ede6]' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setBs(task.id, opt.key)}
                    className={`text-[11.5px] font-medium px-2.5 py-1 rounded-md transition-all ${bs === opt.key ? opt.active : opt.inactive}`}
                  >
                    {opt.label}
                  </button>
                ))}
                {!bs && <span className="text-[11px] text-[#ccc8be] ml-1">← pick one</span>}
                {isInheritedBs && <span className="text-[10px] text-[#aaa9a1] ml-1" title="Carried over">↩</span>}
              </div>

              <div className="px-4 py-3 min-w-[72px] flex items-center justify-center">
                <input
                  type="number" min="1" value={est}
                  onChange={e => setEstInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                  onBlur={e => commitEst(task.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className={`w-14 text-[13px] text-center border rounded-lg px-2 py-1.5 outline-none focus:border-[#b5d4f4] bg-white text-[#2c2c2a] tabular-nums ${isInheritedEst ? 'border-dashed border-[#c7c5bc]' : 'border-[#e7e5df]'}`}
                />
              </div>
              <div className="px-2 py-3 flex items-center">
                <button
                  onClick={() => onPark && onPark(task.id)}
                  className="opacity-0 group-hover:opacity-100 text-[11px] font-medium px-2 py-0.5 rounded-full text-[#aaa9a1] hover:bg-[#f0ede6] hover:text-[#888780] transition-opacity"
                  title="Park for today"
                >
                  Park
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {parkedTasks.length > 0 && (
        <div className="mt-4 border-t border-[#f0ede6] pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#bdbbb2] mb-2">Parked today</div>
          {parkedTasks.map(task => (
            <div key={task.id} className="flex items-center justify-between px-3 py-2 rounded-lg mb-1 bg-[#f9f8f5]">
              <span className="text-[13px] text-[#bdbbb2] truncate flex-1">{task.title}</span>
              <button
                onClick={() => onUnpark && onUnpark(task.id)}
                className="flex-none ml-3 text-[11px] font-medium px-2 py-0.5 rounded-full text-[#888780] hover:bg-[#e7e5df] hover:text-[#2c2c2a]"
              >
                Add back
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Summary + launch */}
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-[#888780]">
          {todayTasks.filter(t => gp.brainspace[t.id] || inheritedBs[t.id]).length} of {todayTasks.length} configured
          {' · '}{totalMin} min work
          {meetingMin > 0 && ` · ${meetingMin} min in meetings`}
        </div>
        <button
          onClick={onLaunch}
          className="text-[13px] font-medium px-4 py-2 rounded-lg bg-[#378add] text-white hover:bg-[#2a6fc7] active:scale-[.98] transition-all"
        >
          Launch plan →
        </button>
      </div>
    </div>
  )
}

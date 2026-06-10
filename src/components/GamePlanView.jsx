import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import useStore from '../store'

// ── Constants ────────────────────────────────────────────────────
const BS = {
  deep:    { label: 'Deep',   cls: 'bg-blue-100 text-blue-700',   next: 'medium'  },
  medium:  { label: 'Medium', cls: 'bg-gray-100 text-gray-600',   next: 'admin'   },
  admin:   { label: 'Admin',  cls: 'bg-green-100 text-green-700', next: 'unknown' },
  unknown: { label: '?',      cls: 'bg-amber-100 text-amber-700', next: 'deep'    },
}
const BS_SORT = { deep: 0, medium: 1, admin: 2, unknown: 3 }
const BREAK_DUE_MIN = 90

// ── Helpers ──────────────────────────────────────────────────────
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

const DEFAULT_GP = () => ({
  order: [],
  done: {},
  estimates: {},
  brainspace: {},
  focusId: null,
  focusStart: null,
  onBreak: false,
  breakStart: null,
  lastBreak: Date.now(),
})

// ── Component ────────────────────────────────────────────────────
export default function GamePlanView() {
  const { tasks, dataUid, updateTask } = useStore()
  const [gp, setGp] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [editingId, setEditingId] = useState(null)
  const [askMsg, setAskMsg] = useState('')
  const [draggingId, setDraggingId] = useState(null)
  const [gpTab, setGpTab] = useState('setup') // 'setup' | 'run'
  const dateKey = todayKey()

  // 1-second ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load game plan from Firestore on mount
  useEffect(() => {
    if (!dataUid) return
    getDoc(doc(db, 'users', dataUid, 'gamePlan', dateKey)).then(snap => {
      setGp(snap.exists() ? { ...DEFAULT_GP(), ...snap.data() } : DEFAULT_GP())
    })
  }, [dataUid, dateKey])

  // Persist a partial update to Firestore (merge)
  const persist = useCallback((fields) => {
    if (!dataUid) return
    setDoc(doc(db, 'users', dataUid, 'gamePlan', dateKey), fields, { merge: true })
  }, [dataUid, dateKey])

  // Update local state + persist
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
  // Today's open tasks (not completed in B Things)
  const todayTasks = tasks.filter(t => t.bucket === 'today' && !t.completed)

  // Canonical order: saved order first, then any new tasks appended
  const savedOrder = gp.order || []
  const orderedTasks = [
    ...savedOrder.map(id => todayTasks.find(t => t.id === id)).filter(Boolean),
    ...todayTasks.filter(t => !savedOrder.includes(t.id)),
  ]

  // Split: unknown-scope tasks go to the bottom with no time block
  const activeTasks  = orderedTasks.filter(t => (gp.brainspace[t.id] || 'medium') !== 'unknown')
  const unknownTasks = orderedTasks.filter(t => (gp.brainspace[t.id] || 'medium') === 'unknown')
  const planTasks    = [...activeTasks, ...unknownTasks]

  // Current (first non-done active task)
  const currentTask = activeTasks.find(t => !gp.done[t.id]) || null
  const isFocusing  = !gp.onBreak && !!gp.focusId && currentTask?.id === gp.focusId

  // ── Schedule projection ──────────────────────────────────────
  let cursor = now
  const schedule = {}
  for (const t of activeTasks) {
    if (gp.done[t.id]) { schedule[t.id] = { done: true }; continue }
    const estMs = (gp.estimates[t.id] || 30) * 60000
    if (!gp.onBreak && isFocusing && gp.focusId === t.id) {
      schedule[t.id] = { start: gp.focusStart, end: gp.focusStart + estMs }
      cursor = Math.max(gp.focusStart + estMs, now)
    } else {
      schedule[t.id] = { start: cursor, end: cursor + estMs }
      cursor += estMs
    }
  }
  unknownTasks.forEach(t => { schedule[t.id] = { unknown: true } })
  const projectedEnd = cursor

  // ── Focus display ────────────────────────────────────────────
  let focusLeftMin = 0, focusIsOver = false, focusFrac = 0
  if (isFocusing && currentTask) {
    const estMs = (gp.estimates[currentTask.id] || 30) * 60000
    const leftMs = gp.focusStart + estMs - now
    focusIsOver  = leftMs < 0
    focusLeftMin = Math.ceil(Math.abs(leftMs) / 60000)
    focusFrac    = focusIsOver ? 1 : 1 - leftMs / estMs
  }

  // ── Break / progress state ───────────────────────────────────
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
    updateTask(taskId, { completed: true })          // sync to B Things
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
      id: t.id,
      rank: BS_SORT[gp.brainspace[t.id] || 'medium'],
      i,
    }))
    // Stable sort within each brainspace tier
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
  function onDragStart(e, id) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e, targetId) {
    e.preventDefault()
    if (!draggingId || draggingId === targetId) return
    // Build current full order
    const base = planTasks.map(t => t.id)
    const from = base.indexOf(draggingId)
    const to   = base.indexOf(targetId)
    if (from === -1 || to === -1) return
    base.splice(from, 1)
    base.splice(to, 0, draggingId)
    setGp(prev => ({ ...prev, order: base }))
  }

  function onDragEnd() {
    persist({ order: gp.order })
    setDraggingId(null)
  }

  // ── "How am I doing?" ────────────────────────────────────────
  function howAmIDoing() {
    if (gp.onBreak) {
      return `You're on a break (${Math.floor((now - gp.breakStart) / 60000)} min) — step away fully, the plan re-flows the moment you're back.`
    }
    const done  = doneCount
    const total = totalCount
    const pctLocal = total ? Math.round(done / total * 100) : 0
    const deepRemaining = activeTasks.filter(t => !gp.done[t.id] && (gp.brainspace[t.id] || 'medium') === 'deep').length
    const allAdminRemaining = activeTasks.filter(t => !gp.done[t.id]).every(t => ['admin', 'unknown'].includes(gp.brainspace[t.id] || 'medium'))
    const six = new Date(); six.setHours(18, 0, 0, 0)

    if (!currentTask) return "Board's clear — that's a complete day; close the laptop and let it count."
    if (sinceBreakMin >= 90) return `${sinceBreakMin} min since your last break — you're running on fumes; take 10 and you'll close sharper.`
    if (deepRemaining >= 2 && now > six.getTime() - 2 * 3600000) {
      return `${deepRemaining} deep-focus tasks still ahead late in the day — decide now: power through, or push the non-urgent ones to tomorrow.`
    }
    if (allAdminRemaining && done > 0) return "You're in the admin home stretch — mechanical from here, just execute and coast."
    if (done === 0) return `Fresh board — start on "${currentTask.title}" and the first checkmark drags the rest into motion.`
    if (pctLocal >= 75) return `${done} of ${total} done — this is already a strong day; protect the win and don't invent new work to fill the gap.`
    if (projectedEnd > six.getTime() + 300000) return `${done} of ${total} done — realistically the tail slips past 6, and that's fine; nail the high-priority ones and the rest is gravy.`
    return `${done} of ${total} done with "${currentTask.title}" on deck — steady progress, clock's on your side.`
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
          <div className="text-right">
            <div className="text-[19px] font-medium tabular-nums text-[#2c2c2a]">{fmt(now)}</div>
          </div>
        </div>

        {/* Sub-tabs: Setup | Run */}
        <div className="flex gap-1 mb-5 bg-[#f0ede6] rounded-lg p-1 w-fit">
          {['setup', 'run'].map(tab => (
            <button
              key={tab}
              onClick={() => setGpTab(tab)}
              className={`text-[12.5px] font-medium px-4 py-1.5 rounded-md capitalize transition-colors ${
                gpTab === tab
                  ? 'bg-white text-[#2c2c2a] shadow-sm'
                  : 'text-[#888780] hover:text-[#5f5e5a]'
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
            onLaunch={() => setGpTab('run')}
          />
        )}

        {/* ── RUN TAB ───────────────────────────────────────────── */}
        {gpTab === 'run' && <>

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
          gp.onBreak  ? 'bg-[#e6f1fb] border-[#b5d4f4] text-[#185fa5] font-medium' :
          breakDue    ? 'bg-[#faeeda] border-[#fac775] text-[#854f0b] font-medium' :
          'bg-white border-[#e7e5df] text-[#5f5e5a]'
        }`}>
          {gp.onBreak ? `On break · ${breakMin} min` :
           breakDue   ? `${sinceBreakMin} min since a break — time to step away` :
           `${sinceBreakMin} min since your last break`}
        </div>

        {/* Now card */}
        {gp.onBreak ? (
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
                ? (focusIsOver
                    ? 'over — wrap it or stop the timer'
                    : `focusing · ends ${fmt(gp.focusStart + (gp.estimates[currentTask.id] || 30) * 60000)}`)
                : `up next · ~${gp.estimates[currentTask.id] || 30} min`}
            </div>
            <div className={`text-[16px] font-medium mb-2 ${focusIsOver ? 'text-[#412402]' : 'text-[#042c53]'}`}>
              {currentTask.title}
            </div>
            {isFocusing && (
              <>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className={`text-[30px] font-medium tabular-nums leading-none ${focusIsOver ? 'text-[#854f0b]' : 'text-[#0c447c]'}`}>
                    {focusLeftMin}
                  </span>
                  <span className={`text-[13px] ${focusIsOver ? 'text-[#854f0b]' : 'text-[#185fa5]'}`}>
                    {focusIsOver ? 'min over' : 'min left'}
                  </span>
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
              <button
                onClick={toggleFocus}
                className={`text-[12px] font-medium px-3 py-1.5 rounded-full border active:scale-[.98] ${
                  isFocusing ? 'bg-white text-[#185fa5] border-[#b5d4f4]' : 'bg-[#378add] text-white border-[#378add]'
                }`}
              >
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

        {/* Projected finish + remaining */}
        <div className="text-[12px] text-[#0f6e56] mb-3">
          {currentTask
            ? gp.onBreak
              ? 'Plan paused — re-flows from the clock when you hit "Back from break."'
              : `If you roll straight through: finish ~${fmt(projectedEnd)} · ${remMin} min of work left`
            : 'All blocks cleared. Go home.'}
        </div>

        {/* Header row: count + smart sort */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#888780]">
            Today · {planTasks.length} task{planTasks.length !== 1 ? 's' : ''}
          </div>
          {planTasks.length > 1 && (
            <button
              onClick={smartSort}
              className="text-[11.5px] font-medium text-[#185fa5] bg-[#eef5fd] border border-[#b5d4f4] rounded-full px-2.5 py-1 hover:bg-[#e1eefb] active:scale-[.98] transition-transform"
            >
              ✦ Smart sort
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-[#eceae3] rounded-full overflow-hidden mb-1">
          <div className="h-full bg-[#1d9e75] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[12px] text-[#888780] mb-3">{doneCount} of {totalCount} done · {pct}%</div>

        {/* Task rows */}
        <div>
          {planTasks.map(task => {
            const bs       = gp.brainspace[task.id] || 'medium'
            const bsCfg    = BS[bs]
            const isDone   = !!gp.done[task.id]
            const isUnknown = bs === 'unknown'
            const isNow    = !isDone && !gp.onBreak && currentTask?.id === task.id
            const sched    = schedule[task.id] || {}
            const est      = gp.estimates[task.id] || 30
            const isDragging = draggingId === task.id

            return (
              <div
                key={task.id}
                draggable
                onDragStart={e => onDragStart(e, task.id)}
                onDragOver={e => onDragOver(e, task.id)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg mb-1.5 border select-none transition-opacity ${
                  isDragging ? 'opacity-40 border-[#378add]' :
                  isDone     ? 'bg-[#f4f2ec] border-transparent' :
                  isNow      ? 'bg-[#fbfcfe] border-l-[3px] border-l-[#378add] border-[#e7e5df]' :
                  isUnknown  ? 'bg-white border-dashed border-[#e7e5df] opacity-75' :
                  'bg-white border-[#e7e5df]'
                }`}
              >
                {/* Grip */}
                <div className="cursor-grab flex-none text-[#bdbbb2] text-lg leading-none">⠿</div>

                {/* Done circle */}
                <button
                  onClick={() => !isDone && markDone(task.id)}
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
                  {isDone     ? 'done' :
                   isUnknown  ? '— open-ended' :
                   sched.start ? `${fmt(sched.start)}–${fmt(sched.end)}` : ''}
                </div>

                {/* Title + now pill */}
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] flex items-center gap-1.5 flex-wrap ${isDone ? 'line-through text-[#888780]' : 'text-[#2c2c2a]'}`}>
                    <span className="truncate">{task.title}</span>
                    {isNow && (
                      <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-[#e6f1fb] text-[#185fa5] flex-none">
                        {gp.focusId === task.id ? 'focusing' : 'now'}
                      </span>
                    )}
                  </div>
                  {task.notes && (
                    <div className="text-[11.5px] text-[#888780] mt-0.5 truncate">{task.notes}</div>
                  )}
                </div>

                {/* Estimate (tap to edit) */}
                <div className="flex-none">
                  {editingId === task.id ? (
                    <input
                      autoFocus
                      type="number"
                      min="1"
                      defaultValue={est}
                      className="w-12 text-[12px] text-center border border-[#b5d4f4] rounded px-1 py-0.5 outline-none bg-white"
                      onBlur={e => saveEstimate(task.id, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => !isDone && setEditingId(task.id)}
                      className={`text-[11px] tabular-nums ${isDone ? 'text-[#aaa9a1]' : 'text-[#888780] hover:text-[#185fa5]'}`}
                    >
                      {est}m
                    </button>
                  )}
                </div>

                {/* Brainspace badge */}
                <button
                  onClick={() => !isDone && cycleBrainspace(task.id)}
                  className={`flex-none text-[10.5px] font-medium px-2 py-0.5 rounded-full transition-opacity ${bsCfg.cls} ${isDone ? 'opacity-40 cursor-default' : 'hover:opacity-80'}`}
                >
                  {bsCfg.label}
                </button>
              </div>
            )
          })}
        </div>

        {/* Empty state */}
        {planTasks.length === 0 && (
          <div className="text-center text-[13px] text-[#888780] py-10">
            No tasks in Today — add some from the board first, then come back here to plan.
          </div>
        )}

        </> /* end run tab */}

      </div>
    </div>
  )
}

// ── SetupTable ────────────────────────────────────────────────────
// Morning setup: configure brainspace + time for every task in one grid.
// `tasks` is already filtered to today's non-completed tasks.
function SetupTable({ tasks: todayTasks, gp, update, onLaunch }) {
  // Local estimate edits tracked by taskId
  const [estInputs, setEstInputs] = useState({})

  function setBs(taskId, bs) {
    update({ brainspace: { ...gp.brainspace, [taskId]: bs } })
  }

  function commitEst(taskId, val) {
    const v = parseInt(val, 10)
    if (v > 0) update({ estimates: { ...gp.estimates, [taskId]: v } })
    setEstInputs(prev => { const n = { ...prev }; delete n[taskId]; return n })
  }

  const allSet = todayTasks.length > 0 && todayTasks.every(t =>
    gp.brainspace[t.id] && gp.brainspace[t.id] !== 'medium'
  )

  if (todayTasks.length === 0) {
    return (
      <div className="text-center text-[13px] text-[#888780] py-10">
        No tasks in Today — add some from the board first, then come back here to plan.
      </div>
    )
  }

  return (
    <div>
      <p className="text-[12.5px] text-[#5f5e5a] mb-4">
        Set brainspace and time for each task, then hit <strong>Launch plan</strong> to run the day.
      </p>

      {/* Table */}
      <div className="rounded-xl border border-[#e7e5df] overflow-hidden bg-white mb-4">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-0 border-b border-[#e7e5df] bg-[#f5f3ed]">
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888780]">Task</div>
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888780] text-center min-w-[220px]">Brainspace</div>
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#888780] text-center min-w-[72px]">Min</div>
        </div>

        {todayTasks.map((task, idx) => {
          const bs  = gp.brainspace[task.id] || null
          const est = estInputs[task.id] !== undefined ? estInputs[task.id] : (gp.estimates[task.id] || 30)
          const isLast = idx === todayTasks.length - 1

          return (
            <div
              key={task.id}
              className={`grid grid-cols-[1fr_auto_auto] gap-0 items-center ${!isLast ? 'border-b border-[#f0ede6]' : ''}`}
            >
              {/* Task title */}
              <div className="px-4 py-3">
                <div className="text-[13.5px] text-[#2c2c2a] font-medium leading-snug truncate">{task.title}</div>
                {task.notes && (
                  <div className="text-[11.5px] text-[#aaa9a1] truncate mt-0.5">{task.notes}</div>
                )}
              </div>

              {/* Brainspace segmented selector */}
              <div className="px-4 py-3 flex items-center gap-1 min-w-[220px]">
                {[
                  { key: 'deep',    label: 'Deep',   active: 'bg-blue-100 text-blue-700 ring-1 ring-blue-300',    inactive: 'text-[#888780] hover:bg-[#f0ede6]' },
                  { key: 'medium',  label: 'Medium', active: 'bg-gray-100 text-gray-700 ring-1 ring-gray-300',    inactive: 'text-[#888780] hover:bg-[#f0ede6]' },
                  { key: 'admin',   label: 'Admin',  active: 'bg-green-100 text-green-700 ring-1 ring-green-300', inactive: 'text-[#888780] hover:bg-[#f0ede6]' },
                  { key: 'unknown', label: '?',      active: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300', inactive: 'text-[#888780] hover:bg-[#f0ede6]' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setBs(task.id, opt.key)}
                    className={`text-[11.5px] font-medium px-2.5 py-1 rounded-md transition-all ${
                      bs === opt.key ? opt.active : opt.inactive
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                {/* Unset hint */}
                {!bs && (
                  <span className="text-[11px] text-[#ccc8be] ml-1">← pick one</span>
                )}
              </div>

              {/* Time estimate */}
              <div className="px-4 py-3 min-w-[72px] flex items-center justify-center">
                <input
                  type="number"
                  min="1"
                  value={est}
                  onChange={e => setEstInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                  onBlur={e => commitEst(task.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className="w-14 text-[13px] text-center border border-[#e7e5df] rounded-lg px-2 py-1.5 outline-none focus:border-[#b5d4f4] bg-white text-[#2c2c2a] tabular-nums"
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary + launch */}
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-[#888780]">
          {todayTasks.filter(t => gp.brainspace[t.id]).length} of {todayTasks.length} tasks configured
          {' · '}
          {todayTasks.reduce((s, t) => s + (gp.estimates[t.id] || 30), 0)} min total
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

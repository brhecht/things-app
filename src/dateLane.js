// Shared date / lane helpers for the snooze + surfacing engine.
// A "soft" date = a snooze / plan: the card sleeps in Scheduled and surfaces in
// Today on its day. A "hard" date = a real deadline: it surfaces with runway and
// goes red + sticks when overdue. Most dates are soft (snoozes).

export function todayMidnight() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function daysFromToday(dateStr, today = todayMidnight()) {
  if (!dateStr) return null
  const due = new Date(dateStr + 'T00:00:00')
  return Math.round((due - today) / 86400000)
}

// A hard deadline that is past and not done — the only thing that goes "red".
export function isOverdueHard(task, today = todayMidnight()) {
  if (!task || !task.dueDate || task.dateType !== 'hard' || task.completed) return false
  return daysFromToday(task.dueDate, today) < 0
}

export function fmtDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function toISO(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// Snooze presets → an ISO date string.
export function presetDate(kind) {
  const t = todayMidnight()
  const d = new Date(t)
  if (kind === 'tomorrow') { d.setDate(d.getDate() + 1); return toISO(d) }
  if (kind === 'weekend') { const add = (6 - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + add); return toISO(d) } // next Sat
  if (kind === 'nextweek') { const add = (1 - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + add); return toISO(d) } // next Mon
  return null
}

// Desired bucket for a dated card given how far off its date is. Soft dates sleep
// in 'scheduled' until the day arrives, then surface in Today. Hard deadlines get
// runway: This Week at <=7 days, Today at <=2 days or overdue.
export function desiredBucket(task, today = todayMidnight()) {
  if (!task || !task.dueDate) return null
  const diff = daysFromToday(task.dueDate, today)
  if (task.dateType === 'hard') {
    if (diff <= 2) return 'today'
    if (diff <= 7) return 'soon'
    return 'scheduled'
  }
  // soft / snoozed
  if (diff <= 0) return 'today'
  return 'scheduled'
}

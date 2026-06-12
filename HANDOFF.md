
## Session Log

### 2026-06-12 — Morning merge + brainspace fix
- **What shipped:** Morning merge (tomorrow→today on first daily launch, localStorage-guarded); fixed stale 'admin' brainspace crashing Run tab; added ErrorBoundary to surface future Run tab errors
- **Known issues:** None
- **Next:** Task card click-through from Game Plan rows

### 2026-06-12 — Fix drag stale closure + calendar showDeleted debug
- **What shipped:** onDragEnd now uses functional setGp(prev=>) to get current order (not stale closure from render); calendar API now passes showDeleted:true to surface status:'cancelled' events; added console.log debug for raw calendar events
- **Known issues:** Calendar Fries Meeting may still show if event has status:'confirmed' — debug log will reveal actual status on next ⊘ cal click
- **Next:** Check Vercel logs after Brian clicks ⊘ cal to see Fries event status; remove debug log once diagnosed

### 2026-06-12 — Fix drag: ref-based order tracking, remove onDragEnter/Leave
- **What shipped:** dragOrderRef (useRef) replaces stale-closure planTasks in onDragOver; onDragEnd reads from ref not React state; removed onDragEnter/onDragLeave (caused child-element flicker = double lines); dropTargetId now set in onDragOver only
- **Known issues:** Fries Meeting calendar event has status:confirmed + selfResponse:needsAction — not cancelled in Google Calendar's view; Brian must decline it in GCal for it to disappear
- **Next:** Confirm drag fix; remove cal-debug log once confirmed

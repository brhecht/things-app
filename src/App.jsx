import { useEffect, useState } from 'react'
import useStore from './store'
import useIsMobile from './hooks/useIsMobile'
import Sidebar from './components/Sidebar'
import KanbanBoard from './components/KanbanBoard'
import AgendaView from './components/AgendaView'
import MobileAgendaView from './components/MobileAgendaView'
import MobileBottomNav from './components/MobileBottomNav'
import MobileQuickAdd from './components/MobileQuickAdd'
import MobileProjectList from './components/MobileProjectList'
import CompletedView from './components/CompletedView'
import TaskModal from './components/TaskModal'
import SignInPage from './components/SignInPage'
import AppSwitcher from './AppSwitcher'

export default function App() {
  const { user, authLoading, isViewer, initAuth, undo, _undoToast, _undoStack, setSelectedProject, selectedProjectId, tasks } = useStore()
  const [filters, setFilters] = useState({ starred: false, priorities: [] })
  const [view, setView] = useState('kanban') // 'kanban' | 'agenda' | 'completed'
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const isMobile = useIsMobile()

  // Mobile tab state: 'inbox' | 'today' | 'all' | 'projects'
  const [mobileTab, setMobileTab] = useState('today')
  // When viewing a specific project on mobile
  const [mobileProjectView, setMobileProjectView] = useState(null)
  // Mobile completed view
  const [showMobileCompleted, setShowMobileCompleted] = useState(false)

  // Deep-link: ?task=docId opens that task's modal
  const [deepLinkTask, setDeepLinkTask] = useState(null)

  // Start listening to auth state once on mount
  useEffect(() => {
    initAuth()
  }, [])

  // Parse ?task= param and open modal once tasks are loaded
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const taskId = params.get('task')
    if (taskId && tasks.length > 0 && !deepLinkTask) {
      const found = tasks.find(t => t.id === taskId)
      if (found) {
        setDeepLinkTask(found)
        // Clean URL without reload
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [tasks])

  // Global ⌘+Z / Ctrl+Z handler
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo])

  // Loading spinner while Firebase checks if you're already signed in
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
          <p className="text-gray-600 font-medium">Loading Things…</p>
        </div>
      </div>
    )
  }

  // Not signed in → show sign-in page
  if (!user) {
    return <SignInPage />
  }

  // ── MOBILE LAYOUT ─────────────────────────────────────────────
  if (isMobile) {
    const handleSelectProject = (projectId) => {
      setMobileProjectView(projectId)
      setSelectedProject(projectId)
    }

    const handleBackFromProject = () => {
      setMobileProjectView(null)
      setSelectedProject(null)
      setMobileTab('projects')
    }

    // Determine bucket filter from tab
    const bucketFilter =
      mobileTab === 'inbox' ? 'inbox' :
      mobileTab === 'today' ? 'today' :
      'all'

    // Default bucket for quick-add based on current tab
    const quickAddBucket = mobileTab === 'today' ? 'today' : 'inbox'

    return (
      <div className="flex flex-col h-screen bg-gray-50 font-sans antialiased" style={{ touchAction: 'manipulation' }}>
        {isViewer && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-700 text-center pt-[env(safe-area-inset-top)]">
            Brian's workspace
          </div>
        )}

        {/* Main content area */}
        <main className="flex-1 overflow-hidden">
          {mobileTab === 'completed' ? (
            <CompletedView />
          ) : mobileProjectView !== null ? (
            // Viewing a specific project
            <div className="h-full flex flex-col">
              <button
                onClick={handleBackFromProject}
                className="flex items-center gap-1.5 px-4 pt-5 pb-1 text-blue-600 text-sm font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Projects
              </button>
              <div className="flex-1 overflow-hidden">
                <MobileAgendaView
                  bucketFilter="all"
                  projectFilter={mobileProjectView}
                />
              </div>
            </div>
          ) : mobileTab === 'projects' ? (
            <MobileProjectList
              onSelectProject={handleSelectProject}
              onShowCompleted={() => setShowMobileCompleted(true)}
            />
          ) : (
            <MobileAgendaView
              bucketFilter={bucketFilter}
              projectFilter={null}
            />
          )}
        </main>

        {/* Quick add + bottom nav */}
        {mobileTab !== 'completed' && <MobileQuickAdd defaultBucket={quickAddBucket} />}
        <MobileBottomNav activeTab={mobileTab} onTabChange={setMobileTab} />

        {/* Deep-link task modal */}
        {deepLinkTask && (
          <TaskModal task={tasks.find(t => t.id === deepLinkTask.id) || deepLinkTask} onClose={() => setDeepLinkTask(null)} />
        )}

        {/* Undo toast — positioned above bottom nav */}
        {_undoToast && (
          <div className="fixed bottom-20 left-4 right-4 z-50 animate-fade-in">
            <div className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2.5 shadow-lg flex items-center gap-3">
              <span className="flex-1">{_undoToast}</span>
              {_undoStack.length > 0 && (
                <button onClick={undo} className="text-blue-300 font-medium text-xs flex-shrink-0">
                  Undo
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── DESKTOP LAYOUT ────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white font-sans antialiased">
      <AppSwitcher current="things" />
      <div className="flex flex-1 overflow-hidden">
      <Sidebar filters={filters} setFilters={setFilters} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
      <main className="flex-1 overflow-hidden flex flex-col">
        {isViewer && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-700 text-center">
            Brian's workspace
          </div>
        )}
        {/* View toggle */}
        <div className="flex items-center gap-1 px-8 pt-4 bg-gray-50">
          <button
            onClick={() => setView('kanban')}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              view === 'kanban' ? 'bg-white text-gray-800 shadow-sm border border-gray-200' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Board
          </button>
          <button
            onClick={() => setView('agenda')}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              view === 'agenda' ? 'bg-white text-gray-800 shadow-sm border border-gray-200' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Agenda
          </button>
          <button
            onClick={() => setView('completed')}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              view === 'completed' ? 'bg-white text-gray-800 shadow-sm border border-gray-200' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Completed
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {view === 'completed' ? (
            <CompletedView />
          ) : view === 'kanban' ? (
            <KanbanBoard filters={filters} />
          ) : (
            <AgendaView filters={filters} />
          )}
        </div>
      </main>
      </div>

      {/* Deep-link task modal */}
      {deepLinkTask && (
        <TaskModal task={tasks.find(t => t.id === deepLinkTask.id) || deepLinkTask} onClose={() => setDeepLinkTask(null)} />
      )}

      {/* Undo toast */}
      {_undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2.5 shadow-lg flex items-center gap-3">
            <span>{_undoToast}</span>
            {_undoStack.length > 0 && (
              <button onClick={undo} className="text-blue-300 hover:text-blue-100 font-medium text-xs">
                Undo again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

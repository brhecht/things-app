import { useEffect, useState } from 'react'
import useStore from './store'
import Sidebar from './components/Sidebar'
import KanbanBoard from './components/KanbanBoard'
import AgendaView from './components/AgendaView'
import SignInPage from './components/SignInPage'
import AppSwitcher from './AppSwitcher'

export default function App() {
  const { user, authLoading, isViewer, initAuth, undo, _undoToast, _undoStack } = useStore()
  const [filters, setFilters] = useState({ starred: false, priorities: [] })
  const [view, setView] = useState('kanban') // 'kanban' or 'agenda'
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Start listening to auth state once on mount
  useEffect(() => {
    initAuth()
  }, [])

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

  // Signed in → show the app
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white font-sans antialiased">
      <AppSwitcher current="things" />
      <div className="flex flex-1 overflow-hidden">
      <Sidebar filters={filters} setFilters={setFilters} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
      <main className="flex-1 overflow-hidden flex flex-col">
        {isViewer && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-700 text-center">
            View only — you're viewing Brian's tasks
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
        </div>
        <div className="flex-1 overflow-hidden">
          {view === 'kanban' ? (
            <KanbanBoard filters={filters} />
          ) : (
            <AgendaView filters={filters} />
          )}
        </div>
      </main>
      </div>

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

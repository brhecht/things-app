import { useEffect, useState } from 'react'
import useStore from './store'
import Sidebar from './components/Sidebar'
import KanbanBoard from './components/KanbanBoard'
import AgendaView from './components/AgendaView'
import SignInPage from './components/SignInPage'

export default function App() {
  const { user, authLoading, isViewer, initAuth } = useStore()
  const [filters, setFilters] = useState({ starred: false, priorities: [] })
  const [view, setView] = useState('kanban') // 'kanban' or 'agenda'

  // Start listening to auth state once on mount
  useEffect(() => {
    initAuth()
  }, [])

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
    <div className="flex h-screen overflow-hidden bg-white font-sans antialiased">
      <Sidebar filters={filters} setFilters={setFilters} />
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
  )
}

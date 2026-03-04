import useStore from '../store'

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
  'unassigned':       'bg-stone-400',
}

export default function MobileProjectList({ onSelectProject }) {
  const { projects, tasks } = useStore()

  const getCount = (projectId) =>
    tasks.filter(t => t.projectId === projectId && !t.completed).length

  const totalActive = tasks.filter(t => !t.completed).length

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-36">
        {/* All Tasks */}
        <button
          onClick={() => onSelectProject(null)}
          className="w-full flex items-center gap-3.5 px-4 py-3.5 bg-white rounded-xl mb-2 active:bg-gray-50 transition-colors"
        >
          <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-sm">▤</span>
          <span className="flex-1 text-left text-[15px] font-medium text-gray-900">All Tasks</span>
          <span className="text-sm text-gray-400 font-medium">{totalActive}</span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-300">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <div className="space-y-1 mt-3">
          {projects.map(proj => {
            const count = getCount(proj.id)
            return (
              <button
                key={proj.id}
                onClick={() => onSelectProject(proj.id)}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 bg-white rounded-xl active:bg-gray-50 transition-colors"
              >
                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${DOT_COLORS[proj.id] || 'bg-gray-400'}`} />
                <span className="flex-1 text-left text-[15px] font-medium text-gray-900">{proj.name}</span>
                {count > 0 && <span className="text-sm text-gray-400 font-medium">{count}</span>}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-300">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

import useStore from '../store'

const PRIORITY_BORDER = {
  high:   'border-l-[3px] border-l-emerald-500',
  medium: 'border-l-[3px] border-l-amber-400',
  low:    'border-l-[3px] border-l-violet-400',
}

export default function TaskCard({ task, onClick }) {
  const { updateTask, deleteTask } = useStore()

  const handleCheck = (e) => {
    e.stopPropagation()
    updateTask(task.id, { completed: true })
  }

  const handleStar = (e) => {
    e.stopPropagation()
    if (!task.starred) {
      // Starring: set sortWeight so it keeps priority even after unstarring
      updateTask(task.id, { starred: true, sortWeight: Date.now(), priority: 'high' })
    } else {
      updateTask(task.id, { starred: false })
    }
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    deleteTask(task.id)
  }

  const borderClass = PRIORITY_BORDER[task.priority] || ''

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('taskId', task.id); e.currentTarget.style.opacity = '0.4' }}
      onDragEnd={(e) => { e.currentTarget.style.opacity = '1' }}
      onClick={onClick}
      className={`group bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:shadow-md hover:border-gray-200 transition-all select-none shadow-sm ${borderClass}`}
    >
      <div className="flex items-center gap-2.5">
        {/* Complete */}
        <button
          onClick={handleCheck}
          className="mt-0.5 w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0 hover:border-blue-500 hover:bg-blue-50 transition-colors"
          title="Mark complete"
        />

        {/* Title */}
        <p className="flex-1 text-sm text-gray-800 font-medium leading-snug truncate">{task.title}</p>

        {/* Star */}
        <button
          onClick={handleStar}
          className={`flex-shrink-0 text-base leading-none transition-colors ${task.starred ? 'text-yellow-400' : 'text-gray-200 hover:text-gray-400'}`}
          title={task.starred ? 'Unstar' : 'Star'}
        >
          {task.starred ? '★' : '☆'}
        </button>

        {/* Delete — hover only */}
        <button
          onClick={handleDelete}
          className="flex-shrink-0 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-base leading-none"
          title="Delete task"
        >
          ×
        </button>
      </div>
    </div>
  )
}

const APPS = [
  { key: 'eddy',   label: 'B Eddy',   icon: 'E', url: 'https://eddy-tracker.vercel.app',    color: '#7C6BCC' },
  { key: 'things', label: 'B Things',  icon: 'T', url: 'https://things-app-gamma.vercel.app', color: '#3ABD82' },
  { key: 'people', label: 'B People',  icon: 'P', url: 'https://b-people.vercel.app',               color: '#E07A5F' },
  { key: 'nico',   label: 'B Nico',    icon: 'N', url: 'https://brain-inbox-six.vercel.app',  color: '#5B9BD5' },
]

const BAR_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  background: '#1E1E1E',
  borderBottom: '1px solid #333',
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: '12px',
  position: 'relative',
  zIndex: 9999,
}

const LOGO_STYLE = {
  width: '22px',
  height: '22px',
  borderRadius: '6px',
  background: '#2D2A26',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: '12px',
  fontWeight: 700,
  marginRight: '6px',
  flexShrink: 0,
}

const pillBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '4px 10px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: '11.5px',
  letterSpacing: '0.2px',
  transition: 'background 0.15s, opacity 0.15s',
  cursor: 'pointer',
  border: 'none',
}

export default function AppSwitcher({ current }) {
  return (
    <nav style={BAR_STYLE}>
      <div style={LOGO_STYLE}>B</div>
      {APPS.map((app) => {
        const isActive = app.key === current
        const style = isActive
          ? { ...pillBase, background: app.color + '22', color: app.color, fontWeight: 600 }
          : { ...pillBase, background: 'transparent', color: '#999' }
        return (
          <a
            key={app.key}
            href={app.url}
            style={style}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#2A2A2A'; e.currentTarget.style.color = '#ccc' }}
            onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999' } }}
          >
            <span style={{
              width: '16px', height: '16px', borderRadius: '4px',
              background: isActive ? app.color : '#444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '9px', fontWeight: 700,
              fontFamily: "'Playfair Display', Georgia, serif",
            }}>
              {app.icon}
            </span>
            {app.label}
          </a>
        )
      })}
    </nav>
  )
}

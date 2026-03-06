import { useState, useEffect, useRef } from 'react'

const APPS = [
  { key: 'eddy',      label: 'B Eddy',      icon: 'E', url: 'https://eddy-tracker.vercel.app',         color: '#7C6BCC' },
  { key: 'things',    label: 'B Things',     icon: 'T', url: 'https://things-app-gamma.vercel.app',     color: '#3ABD82' },
  { key: 'content',   label: 'B Content',    icon: 'C', url: 'https://content-calendar-nine.vercel.app', color: '#E6A817' },
  { key: 'people',    label: 'B People',     icon: 'P', url: 'https://b-people.vercel.app',             color: '#E07A5F' },
  { key: 'marketing', label: 'B Marketing',  icon: 'M', url: 'https://b-marketing.vercel.app',          color: '#D4637A' },
  { key: 'funnel',    label: 'HC Funnel',    icon: 'F', url: 'https://hc-funnel.vercel.app',            color: '#F4845F' },
]

const MOBILE_BP = 768

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

const iconStyle = (color) => ({
  width: '16px', height: '16px', borderRadius: '4px',
  background: color,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#fff', fontSize: '9px', fontWeight: 700,
  fontFamily: "'Playfair Display', Georgia, serif",
})

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BP : false
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`)
    const handler = (e) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    setMobile(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

export default function AppSwitcher({ current }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const dropRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  const currentApp = APPS.find((a) => a.key === current)

  // ── MOBILE: B logo + current app label → dropdown ──
  if (isMobile) {
    return (
      <nav style={BAR_STYLE} ref={dropRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            ...LOGO_STYLE,
            border: 'none',
            cursor: 'pointer',
            marginRight: '6px',
          }}
          aria-label="Open app switcher"
        >
          B
        </button>
        {currentApp && (
          <span style={{ color: currentApp.color, fontWeight: 600, fontSize: '11.5px', letterSpacing: '0.2px' }}>
            {currentApp.label}
          </span>
        )}
        {/* Chevron */}
        <span
          onClick={() => setOpen((o) => !o)}
          style={{
            color: '#666',
            fontSize: '10px',
            marginLeft: '2px',
            cursor: 'pointer',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>

        {/* Dropdown */}
        {open && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#1E1E1E',
            borderBottom: '1px solid #333',
            padding: '4px 0',
            zIndex: 10000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {/* Hub link */}
            <a
              href="https://b-hub-liard.vercel.app/"
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 16px', textDecoration: 'none', color: '#999',
                fontSize: '13px', fontWeight: 500,
                transition: 'background 0.15s',
              }}
            >
              <span style={iconStyle('#2D2A26')}>B</span>
              B Hub
            </a>
            {APPS.map((app) => {
              const isActive = app.key === current
              return (
                <a
                  key={app.key}
                  href={app.url}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 16px', textDecoration: 'none',
                    color: isActive ? app.color : '#999',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: '13px',
                    background: isActive ? app.color + '12' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={iconStyle(app.color)}>{app.icon}</span>
                  {app.label}
                </a>
              )
            })}
          </div>
        )}
      </nav>
    )
  }

  // ── DESKTOP: pill bar (unchanged) ──
  return (
    <nav style={BAR_STYLE}>
      <a href="https://b-hub-liard.vercel.app/" style={{ ...LOGO_STYLE, textDecoration: 'none', marginRight: '6px' }}>B</a>
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
            onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = '#2A2A2A'; e.currentTarget.style.color = '#ccc' } }}
            onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999' } }}
          >
            <span style={iconStyle(app.color)}>
              {app.icon}
            </span>
            {app.label}
          </a>
        )
      })}
    </nav>
  )
}

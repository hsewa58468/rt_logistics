import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const Navbar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, isGuest, exitGuestMode, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const close = () => setMenuOpen(false)

  const handleExitGuest = () => {
    exitGuestMode()
    navigate('/login')
    close()
  }

  return (
    <nav className="navbar">
      <div className="nav-brand">瑞騰倉庫管理系統</div>

      <div className="nav-links">
        <Link to="/warehouse" className={location.pathname === '/warehouse' ? 'active' : ''}>
          路線規劃
        </Link>
        <Link to="/inventory" className={location.pathname === '/inventory' ? 'active' : ''}>
          庫存管理
        </Link>
        <a href="/scan.html">掃描器</a>
        {!isGuest && (
          <Link
            to="/notifications"
            className={location.pathname === '/notifications' ? 'active' : ''}
          >
            推播設定
          </Link>
        )}
      </div>

      {isGuest ? (
        <div className="nav-user">
          <span className="nav-guest-badge">訪客模式</span>
          <button className="nav-logout-btn" onClick={handleExitGuest}>
            離開
          </button>
        </div>
      ) : (
        session && (
          <div className="nav-user">
            <span className="nav-email">{session.user.email}</span>
            <button className="nav-logout-btn" onClick={signOut}>
              登出
            </button>
          </div>
        )
      )}

      <button className="nav-hamburger" onClick={() => setMenuOpen((v) => !v)} aria-label="選單">
        <span className={`hamburger-icon ${menuOpen ? 'open' : ''}`} />
      </button>

      {menuOpen && (
        <div className="nav-mobile-menu">
          <Link
            to="/warehouse"
            className={location.pathname === '/warehouse' ? 'active' : ''}
            onClick={close}
          >
            路線規劃
          </Link>
          <Link
            to="/inventory"
            className={location.pathname === '/inventory' ? 'active' : ''}
            onClick={close}
          >
            庫存管理
          </Link>
          <a href="/scan.html">掃描器</a>
          {!isGuest && (
            <Link
              to="/notifications"
              className={location.pathname === '/notifications' ? 'active' : ''}
              onClick={close}
            >
              推播設定
            </Link>
          )}
          {isGuest ? (
            <div className="nav-mobile-user">
              <span className="nav-guest-badge">訪客模式</span>
              <button className="nav-logout-btn" onClick={handleExitGuest}>
                離開
              </button>
            </div>
          ) : (
            session && (
              <div className="nav-mobile-user">
                <span className="nav-email">{session.user.email}</span>
                <button
                  className="nav-logout-btn"
                  onClick={() => {
                    signOut()
                    close()
                  }}
                >
                  登出
                </button>
              </div>
            )
          )}
        </div>
      )}
    </nav>
  )
}

export default Navbar

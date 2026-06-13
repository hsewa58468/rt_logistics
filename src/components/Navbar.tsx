import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const Navbar = () => {
  const location = useLocation()
  const { session, signOut } = useAuth()

  return (
    <nav className="navbar">
      <div className="nav-brand">RT Logistics</div>
      <div className="nav-links">
        <Link
          to="/"
          className={location.pathname === "/path_plan" ? "active" : ""}
        >
          路線規劃
        </Link>
        <Link
          to="/inventory"
          className={location.pathname === "/inventory" ? "active" : ""}
        >
          庫存管理
        </Link>
      </div>
      {session && (
        <div className="nav-user">
          <span className="nav-email">{session.user.email}</span>
          <button className="nav-logout-btn" onClick={signOut}>登出</button>
        </div>
      )}
    </nav>
  )
}

export default Navbar

import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, isGuest } = useAuth()

  if (loading) {
    return (
      <div className="auth-loading">
        <span className="loading-spinner" />
      </div>
    )
  }

  if (!session && !isGuest) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute

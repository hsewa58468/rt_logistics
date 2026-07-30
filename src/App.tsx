import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Warehouse from './pages/Warehouse'
import InventoryMng from './pages/InventoryMng'
import NotificationSettings from './pages/NotificationSettings'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Navbar />
                <div className="app-container">
                  <Routes>
                    <Route path="/" element={<Navigate to="/inventory" replace />} />
                    <Route path="/inventory" element={<InventoryMng />} />
                    <Route path="/warehouse" element={<Warehouse />} />
                    <Route path="/notifications" element={<NotificationSettings />} />
                  </Routes>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App

import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { api } from '@/lib/api'
import { Sidebar, Header } from '@/components/Layout'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { SkillBoard } from '@/pages/SkillBoard'
import { PilotProfile } from '@/pages/PilotProfile'
import { InstructorTools } from '@/pages/InstructorTools'
import { AdminPanel } from '@/pages/AdminPanel'

const ProtectedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col lg:ml-0 overflow-hidden min-w-0">
        <Header />
        <main className="flex-1 overflow-auto p-6 lg:p-8 mt-12 lg:mt-0">
          <div className="max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

function App() {
  const { user, setUser, setLoading } = useAuthStore()
  const { setSettings } = useDataStore()
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    // Initialize theme from localStorage or system preference
    const savedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    
    if (savedTheme === 'dark' || (savedTheme === null && prefersDark)) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    // Load application settings
    const loadSettings = async () => {
      try {
        const settingsData = await api.admin.getSettings()
        setSettings(settingsData)
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
      document.title = '8th Virtual Fighter Wing'
    }

    // Attempt session recovery from stored JWT token
    const token = localStorage.getItem('token')
    if (token) {
      api.auth
        .me()
        .then((data) => {
          setUser(data.user)
          return loadSettings()
        })
        .catch(() => {
          // Token invalid or expired, clear it
          localStorage.removeItem('token')
        })
        .finally(() => {
          setLoading(false)
          setInitialized(true)
        })
    } else {
      loadSettings().finally(() => {
        setLoading(false)
        setInitialized(true)
      })
    }
  }, [setUser, setLoading, setSettings])

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        {user ? (
          <>
            <Route
              path="/dashboard"
              element={
                <ProtectedLayout>
                  <Dashboard />
                </ProtectedLayout>
              }
            />
            <Route
              path="/skill-board"
              element={
                <ProtectedLayout>
                  <SkillBoard />
                </ProtectedLayout>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedLayout>
                  <PilotProfile />
                </ProtectedLayout>
              }
            />
            <Route
              path="/instructor"
              element={
                <ProtectedLayout>
                  <InstructorTools />
                </ProtectedLayout>
              }
            />
            {user.role === 'admin' && (
              <Route
                path="/admin-panel"
                element={
                  <ProtectedLayout>
                    <AdminPanel />
                  </ProtectedLayout>
                }
              />
            )}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </Router>
  )
}

export default App

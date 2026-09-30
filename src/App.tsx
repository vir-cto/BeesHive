import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { dataMode, isFirebaseConfigured } from './services/firebase/config'
import { AuthProvider, useAuth } from './context/AuthContext'
import { RestaurantProvider } from './context/RestaurantContext'
import { SidebarProvider } from './context/SidebarContext'
import ProtectedRoute from './components/ProtectedRoute'
import Header from './components/Header'
import NotificationToasts from './components/NotificationToasts'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'

// Role dashboards are code-split: the waiter floor only downloads the waiter
// bundle, the counter admin only the admin bundle — faster first paint on the
// phone that is already walking to the table.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const WaiterDashboard = lazy(() => import('./pages/WaiterDashboard'))
const SupervisorDashboard = lazy(() => import('./pages/SupervisorDashboard'))
const NotificationsHistory = lazy(() => import('./pages/NotificationsHistory'))

function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
        <p className="text-slate-600">{label}</p>
      </div>
    </div>
  )
}

function AppLayout() {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-orange-50 to-amber-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-[#fff9f0] via-[#fff4ea] to-[#ffefdf] text-slate-800">
      <Header />
      <NotificationToasts />

      <main className="min-w-0 max-w-full px-3 py-4 sm:px-4 sm:py-6 md:px-6 lg:px-8">
        {/* Top-level guard: a crash anywhere in a dashboard shows a recoverable
            panel instead of a blank page (issue: menus going blank). */}
        <ErrorBoundary label={`${user.role} panel`} resetKey={user.role}>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
            {/* Home - Show appropriate view based on role */}
            <Route
              path="/"
              element={
                user.role === 'admin' ? (
                  <Navigate to="/admin" replace />
                ) : user.role === 'waiter' ? (
                  <Navigate to="/waiter" replace />
                ) : user.role === 'supervisor' ? (
                  <Navigate to="/supervisor" replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />

            <Route path="/login" element={<Navigate to="/" replace />} />

            {/* Admin Dashboard */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            {/* Waiter Dashboard */}
            <Route
              path="/waiter"
              element={
                <ProtectedRoute requiredRole="waiter">
                  <WaiterDashboard />
                </ProtectedRoute>
              }
            />

            {/* Supervisor Dashboard */}
            <Route
              path="/supervisor"
              element={
                <ProtectedRoute requiredRole="supervisor">
                  <SupervisorDashboard />
                </ProtectedRoute>
              }
            />

            {/* Notification History (all roles) */}
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <NotificationsHistory />
                </ProtectedRoute>
              }
            />
          </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}

function App() {
  if (dataMode === 'firebase' && !isFirebaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-red-700">Firebase configuration required</h1>
          <p className="mt-2 text-sm text-slate-600">
            Firebase production storage is not configured. The application is stopped so business data cannot be kept only in temporary browser memory.
          </p>
        </div>
      </div>
    )
  }
  return (
    <BrowserRouter>
      <AuthProvider>
        <RestaurantProvider>
          <SidebarProvider>
            <AppLayout />
          </SidebarProvider>
        </RestaurantProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

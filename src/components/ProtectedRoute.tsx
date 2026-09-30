import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../context/AuthContext'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRole?: UserRole
}

const roleRoutes: Record<UserRole, string> = {
  admin: '/admin',
  waiter: '/waiter',
  supervisor: '/supervisor',
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && user.role !== requiredRole) {
    // Role mismatch — send them to their own dashboard, NOT back to login
    return <Navigate to={roleRoutes[user.role]} replace />
  }

  return <>{children}</>
}

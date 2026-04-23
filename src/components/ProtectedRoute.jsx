import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute() {
  const { user, initializing } = useAuth()

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

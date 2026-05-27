import React from 'react'
import { Navigate } from 'react-router-dom'
import { usePermissions } from '../contexts/PermissionsContext'

export default function PermissionRoute({ module, action = 'view', children }) {
  const { can, loading, isSuperAdmin } = usePermissions()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 dark:border-emerald-400" />
      </div>
    )
  }

  if (!isSuperAdmin && !can(module, action)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

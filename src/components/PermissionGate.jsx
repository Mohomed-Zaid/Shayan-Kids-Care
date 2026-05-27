import React from 'react'
import { usePermissions } from '../contexts/PermissionsContext'

/**
 * Renders children only when the user has the given permission.
 * fallback: optional node when denied (default: null = hidden)
 */
export default function PermissionGate({ module, action, children, fallback = null }) {
  const { can, loading } = usePermissions()
  if (loading) return null
  if (!can(module, action)) return fallback
  return <>{children}</>
}

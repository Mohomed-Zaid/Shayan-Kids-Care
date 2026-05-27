import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabaseClient'
import {
  SUPER_ADMIN_EMAILS,
  canPermission,
  defaultPermissions,
  fullPermissions,
  normalizePermissions,
  moduleForPath,
} from '../lib/permissions'
import { defaultDashboardVisibility, extractDashboardWidgets } from '../lib/dashboardLayout'

const PermissionsContext = createContext(null)

export function PermissionsProvider() {
  const { user } = useAuth()
  const email = user?.email?.toLowerCase() ?? ''
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)

  const reload = useCallback(async () => {
    if (!email) {
      setRecord(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('user_privileges')
      .select('id, email, employee_id, display_name, username, user_type, is_active, is_super_admin, permissions')
      .ilike('email', email)
      .maybeSingle()

    if (error) {
      const missing = error.code === 'PGRST205' || /user_privileges/i.test(error.message ?? '')
      setTableMissing(missing)
      if (!missing) console.warn('Failed to load user privileges:', error.message)
      setRecord(null)
    } else {
      setTableMissing(false)
      setRecord(data)
    }
    setLoading(false)
  }, [email])

  useEffect(() => {
    reload()
  }, [reload])

  const isSuperAdmin = useMemo(() => {
    if (!email) return false
    if (SUPER_ADMIN_EMAILS.has(email)) return true
    return !!record?.is_super_admin && record?.is_active !== false
  }, [email, record])

  const isActive = record?.is_active !== false

  const permissions = useMemo(() => {
    if (!email) return defaultPermissions()
    if (isSuperAdmin) return fullPermissions()
    if (!record) {
      // No DB row: legacy super emails handled above; others get restrictive defaults
      return defaultPermissions()
    }
    if (!isActive) return defaultPermissions()
    return normalizePermissions(record.permissions)
  }, [email, isSuperAdmin, record, isActive])

  const can = useCallback(
    (moduleId, actionId) => canPermission(permissions, moduleId, actionId, { isSuperAdmin }),
    [permissions, isSuperAdmin],
  )

  const canViewRoute = useCallback(
    (pathname) => {
      const mod = moduleForPath(pathname)
      if (!mod) return true
      return can(mod, 'view')
    },
    [can],
  )

  const canManagePrivileges = useMemo(
    () => isSuperAdmin || can('user_privileges', 'view'),
    [isSuperAdmin, can],
  )

  const dashboardWidgets = useMemo(() => {
    if (isSuperAdmin) return defaultDashboardVisibility()
    if (!record?.permissions) return defaultDashboardVisibility()
    return extractDashboardWidgets(record.permissions)
  }, [isSuperAdmin, record])

  const value = useMemo(
    () => ({
      loading,
      record,
      permissions,
      dashboardWidgets,
      isSuperAdmin,
      isActive,
      can,
      canViewRoute,
      canManagePrivileges,
      tableMissing,
      reload,
    }),
    [loading, record, permissions, dashboardWidgets, isSuperAdmin, isActive, can, canViewRoute, canManagePrivileges, tableMissing, reload],
  )

  return (
    <PermissionsContext.Provider value={value}>
      <Outlet />
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider')
  return ctx
}

/** Shorthand: usePermissions().can(module, action) */
export function useCan(moduleId, actionId) {
  const { can, loading, isSuperAdmin } = usePermissions()
  return { allowed: can(moduleId, actionId), loading, isSuperAdmin }
}

import React from 'react'
import { Outlet } from 'react-router-dom'
import { usePermissions } from '../contexts/PermissionsContext'
import { useAuth } from '../contexts/AuthContext'

export default function PermissionActiveGuard() {
  const { signOut } = useAuth()
  const { loading, record, isSuperAdmin, tableMissing } = usePermissions()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 dark:border-emerald-400" />
      </div>
    )
  }

  if (record && record.is_active === false && !isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Account inactive</h2>
        <p className="text-sm text-slate-500">Your user account has been disabled. Contact your administrator.</p>
        <button
          type="button"
          onClick={() => signOut()}
          className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <>
      {tableMissing && isSuperAdmin && (
        <div className="mx-4 md:mx-8 mt-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          User Privilege table is not set up yet. Run <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">supabase/user_privileges.sql</code> in Supabase SQL Editor. Until then, owner emails use full access.
        </div>
      )}
      <Outlet />
    </>
  )
}

import React from 'react'
import { usePermissions } from '../contexts/PermissionsContext'

export default function ControlledDateField({
  value,
  onChange,
  label = 'Date',
  className = '',
  ...props
}) {
  const { isSuperAdmin } = usePermissions()
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <input
        type="date"
        value={value || today}
        onChange={(e) => {
          if (isSuperAdmin) {
            onChange?.(e.target.value)
          }
        }}
        disabled={!isSuperAdmin}
        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
        {...props}
      />
      {!isSuperAdmin && (
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-slate-400"></span>
          Transaction date is controlled by system
        </p>
      )}
    </div>
  )
}

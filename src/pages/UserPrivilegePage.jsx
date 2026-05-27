import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2, UserCog, X, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { usePermissions } from '../contexts/PermissionsContext'
import PrivilegeSwitch from '../components/PrivilegeSwitch'
import {
  PERMISSION_CATALOG,
  catalogByGroup,
  defaultPermissions,
  fullPermissions,
  normalizePermissions,
} from '../lib/permissions'
import { logAction } from '../lib/auditLog'
import {
  DASHBOARD_WIDGETS,
  dashboardWidgetsByGroup,
  defaultDashboardVisibility,
  extractDashboardWidgets,
  packPermissionsForDb,
} from '../lib/dashboardLayout'
import { createAuthLogin, updateAuthPassword, validatePasswordPair } from '../lib/manageAuthUser'

const USER_TYPES = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
]

function emptyForm() {
  return {
    id: null,
    email: '',
    display_name: '',
    username: '',
    user_type: 'user',
    employee_id: '',
    is_active: true,
    is_super_admin: false,
    permissions: defaultPermissions(),
    dashboard_widgets: defaultDashboardVisibility(),
    password: '',
    confirm_password: '',
  }
}

export default function UserPrivilegePage() {
  const toast = useToast()
  const { isSuperAdmin, can, reload: reloadSelf } = usePermissions()
  const [users, setUsers] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(null)
  const [activeTab, setActiveTab] = useState('info')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const canCreate = isSuperAdmin || can('user_privileges', 'create')
  const canEdit = isSuperAdmin || can('user_privileges', 'edit')
  const canDelete = isSuperAdmin || can('user_privileges', 'delete')

  const grouped = useMemo(() => catalogByGroup(), [])
  const dashboardGrouped = useMemo(() => dashboardWidgetsByGroup(), [])

  const load = async () => {
    setLoading(true)
    const [usersRes, empRes] = await Promise.all([
      supabase
        .from('user_privileges')
        .select('id, email, display_name, username, user_type, employee_id, is_active, is_super_admin, permissions, employees(name)')
        .order('email'),
      supabase.from('employees').select('id, name').order('name'),
    ])
    if (usersRes.error) toast.error(usersRes.error.message)
    else setUsers(usersRes.data ?? [])
    if (!empRes.error) setEmployees(empRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    if (!canCreate) {
      toast.error('You do not have permission to create users')
      return
    }
    setForm(emptyForm())
    setActiveTab('info')
  }

  const openEdit = (row) => {
    if (!canEdit) {
      toast.error('You do not have permission to edit users')
      return
    }
    setForm({
      id: row.id,
      email: row.email ?? '',
      display_name: row.display_name ?? '',
      username: row.username ?? '',
      user_type: row.user_type ?? 'user',
      employee_id: row.employee_id ?? '',
      is_active: row.is_active !== false,
      is_super_admin: !!row.is_super_admin,
      permissions: row.is_super_admin ? fullPermissions() : normalizePermissions(row.permissions),
      dashboard_widgets: row.is_super_admin
        ? defaultDashboardVisibility()
        : extractDashboardWidgets(row.permissions),
      password: '',
      confirm_password: '',
    })
    setActiveTab('info')
  }

  const setDashboardWidget = (widgetId, value) => {
    setForm((f) => ({
      ...f,
      dashboard_widgets: { ...f.dashboard_widgets, [widgetId]: value },
    }))
  }

  const setDashboardGroupAll = (value) => {
    setForm((f) => {
      const next = { ...f.dashboard_widgets }
      for (const w of DASHBOARD_WIDGETS) next[w.id] = value
      return { ...f, dashboard_widgets: next }
    })
  }

  const setPerm = (moduleId, actionId, value) => {
    setForm((f) => ({
      ...f,
      permissions: {
        ...f.permissions,
        [moduleId]: { ...f.permissions[moduleId], [actionId]: value },
      },
    }))
  }

  const setModuleAll = (moduleId, value) => {
    const mod = PERMISSION_CATALOG.find((m) => m.id === moduleId)
    if (!mod) return
    setForm((f) => {
      const next = { ...f.permissions[moduleId] }
      for (const a of mod.actions) next[a.id] = value
      return { ...f, permissions: { ...f.permissions, [moduleId]: next } }
    })
  }

  const onSave = async () => {
    if (!form) return
    const email = form.email.trim().toLowerCase()
    if (!email) {
      toast.error('Login email is required')
      return
    }

    const isNew = !form.id
    const pwError = validatePasswordPair(form.password, form.confirm_password, {
      required: isNew,
    })
    if (pwError) {
      toast.error(pwError)
      return
    }

    setSaving(true)

    let authExisting = false
    let passwordUpdated = false

    if (isNew) {
      const authResult = await createAuthLogin(email, form.password)
      if (!authResult.ok) {
        setSaving(false)
        toast.error(authResult.error || 'Failed to create login account')
        return
      }
      authExisting = !!authResult.existing
    } else if (form.password) {
      const upd = await updateAuthPassword(email, form.password)
      if (!upd.ok) {
        setSaving(false)
        toast.error(
          upd.error ||
            'Could not update password. Deploy supabase/functions/admin-manage-user or set password in Supabase Auth.',
        )
        return
      }
      passwordUpdated = true
    }

    const payload = {
      email,
      display_name: form.display_name.trim() || null,
      username: form.username.trim() || null,
      user_type: form.user_type,
      employee_id: form.employee_id || null,
      is_active: form.is_active,
      is_super_admin: form.is_super_admin,
      permissions: form.is_super_admin
        ? {}
        : packPermissionsForDb(form.permissions, form.dashboard_widgets),
      updated_at: new Date().toISOString(),
    }

    let error
    if (form.id) {
      ;({ error } = await supabase.from('user_privileges').update(payload).eq('id', form.id))
    } else {
      ;({ error } = await supabase.from('user_privileges').insert(payload))
    }

    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }

    if (form.id) {
      toast.success(passwordUpdated ? 'User saved (password & privileges updated)' : 'User privileges saved')
    } else if (authExisting) {
      toast.success('Privileges saved (login account already existed)')
    } else {
      toast.success('User created — they can log in with this email and password')
    }
    logAction({
      action: form.id ? 'update_user_privilege' : 'create_user_privilege',
      targetType: 'user_privilege',
      targetLabel: email,
    })
    setForm(null)
    await load()
    await reloadSelf()
  }

  const onDelete = async (row) => {
    if (!canDelete) {
      toast.error('You do not have permission to delete users')
      return
    }
    if (!confirm(`Delete privileges for ${row.email}?`)) return
    const { error } = await supabase.from('user_privileges').delete().eq('id', row.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('User privileges deleted')
    logAction({ action: 'delete_user_privilege', targetType: 'user_privilege', targetLabel: row.email })
    await load()
  }

  if (!isSuperAdmin && !can('user_privileges', 'view')) {
    return (
      <div className="text-center py-16 text-slate-500">
        You do not have permission to manage user privileges.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserCog size={22} />
            User Privilege
          </h2>
          <p className="text-sm text-slate-500 dark:text-emerald-100/60 mt-1">
            Control which pages and actions each login user can access. Email must match their Supabase Auth login.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            Create User
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">User</th>
              <th className="text-left px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">Email</th>
              <th className="text-left px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">Staff</th>
              <th className="text-left px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">Type</th>
              <th className="text-left px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                  No privilege profiles yet. Run <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">supabase/user_privileges.sql</code> in Supabase, then create users.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{u.display_name || u.username || '—'}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{u.email}</td>
                  <td className="px-5 py-3 text-slate-500">{u.employees?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{u.is_super_admin ? 'Super Admin' : u.user_type}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {canEdit && (
                        <button type="button" onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Edit">
                          <UserCog size={15} />
                        </button>
                      )}
                      {canDelete && !u.is_super_admin && (
                        <button type="button" onClick={() => onDelete(u)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-6xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">{form.id ? 'Edit User Privilege' : 'Create User Privilege'}</h3>
              <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="flex border-b border-slate-200 dark:border-slate-700 px-5 gap-6">
              {[
                { id: 'info', label: 'INFO' },
                { id: 'permissions', label: 'PAGE & ACTION RIGHTS' },
                { id: 'dashboard', label: 'DASHBOARD' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 text-sm font-semibold border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === 'info' ? (
                <div className="space-y-6 max-w-3xl">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                      Login credentials
                    </h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Login email *</label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          disabled={!!form.id}
                          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-60"
                          placeholder="user@example.com"
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {form.id ? 'New password' : 'Password *'}
                        </label>
                        <div className="mt-1 relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={form.password}
                            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 px-3 py-2 pr-10 text-sm"
                            placeholder={form.id ? 'Leave blank to keep' : 'Min. 6 characters'}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {form.id ? 'Confirm new password' : 'Confirm password *'}
                        </label>
                        <div className="mt-1 relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={form.confirm_password}
                            onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 px-3 py-2 pr-10 text-sm"
                            placeholder={form.id ? 'Leave blank to keep' : 'Repeat password'}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      {form.id
                        ? 'To change password, fill both fields. Requires admin-manage-user Edge Function, or set password in Supabase Auth.'
                        : 'Creates the Supabase login for this user. Turn off email confirmation in Supabase Auth settings if login fails.'}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                      Profile
                    </h4>
                    <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Staff (optional)</label>
                    <select
                      value={form.employee_id}
                      onChange={(e) => {
                        const emp = employees.find((x) => x.id === e.target.value)
                        setForm((f) => ({
                          ...f,
                          employee_id: e.target.value,
                          display_name: emp?.name ?? f.display_name,
                        }))
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 px-3 py-2 text-sm"
                    >
                      <option value="">— Select staff —</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">User type</label>
                    <select
                      value={form.user_type}
                      onChange={(e) => setForm((f) => ({ ...f, user_type: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 px-3 py-2 text-sm"
                    >
                      {USER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Display name</label>
                    <input
                      value={form.display_name}
                      onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Username (label)</label>
                    <input
                      value={form.username}
                      onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-3 justify-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                      />
                      Active
                    </label>
                    {isSuperAdmin && (
                      <label className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                        <input
                          type="checkbox"
                          checked={form.is_super_admin}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              is_super_admin: e.target.checked,
                              permissions: e.target.checked ? fullPermissions() : defaultPermissions(),
                              dashboard_widgets: e.target.checked
                                ? defaultDashboardVisibility()
                                : f.dashboard_widgets,
                            }))
                          }
                        />
                        Super Admin (full access)
                      </label>
                    )}
                  </div>
                    </div>
                  </div>
                </div>
              ) : activeTab === 'permissions' ? (
                <div className="space-y-8">
                  {form.is_super_admin ? (
                    <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
                      Super Admin has all permissions enabled automatically.
                    </p>
                  ) : (
                    Object.entries(grouped).map(([group, modules]) => (
                      <div key={group}>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-2 py-1.5 bg-slate-900 text-white rounded">
                          {group}
                        </h4>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {modules.map((mod) => (
                            <div
                              key={mod.id}
                              className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
                            >
                              <div className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800">
                                <span className="text-sm font-semibold text-slate-800 dark:text-white">{mod.label}</span>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setModuleAll(mod.id, true)}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white"
                                  >
                                    All ON
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setModuleAll(mod.id, false)}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-400 text-white"
                                  >
                                    All OFF
                                  </button>
                                </div>
                              </div>
                              <div className="px-3">
                                {mod.actions.map((action) => (
                                  <PrivilegeSwitch
                                    key={action.id}
                                    label={action.label}
                                    checked={!!form.permissions[mod.id]?.[action.id]}
                                    onChange={(v) => setPerm(mod.id, action.id, v)}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Choose which dashboard sections this user will see after login.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDashboardGroupAll(true)} className="text-xs font-semibold px-2.5 py-1 rounded bg-blue-600 text-white">
                      Show all
                    </button>
                    <button type="button" onClick={() => setDashboardGroupAll(false)} className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-400 text-white">
                      Hide all
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, dashboard_widgets: defaultDashboardVisibility() }))}
                      className="text-xs font-semibold px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                    >
                      Reset default
                    </button>
                  </div>
                  {form.is_super_admin ? (
                    <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
                      Super Admin always sees the full dashboard.
                    </p>
                  ) : (
                    Object.entries(dashboardGrouped).map(([group, widgets]) => (
                      <div key={group}>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-2 py-1.5 bg-slate-900 text-white rounded">
                          {group}
                        </h4>
                        <div className="grid md:grid-cols-2 gap-4">
                          {widgets.map((w) => (
                            <div key={w.id} className="border border-slate-200 dark:border-slate-700 rounded-lg px-3">
                              <PrivilegeSwitch
                                label={w.label}
                                checked={!!form.dashboard_widgets[w.id]}
                                onChange={(v) => setDashboardWidget(w.id, v)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving || (!canEdit && form.id) || (!canCreate && !form.id)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

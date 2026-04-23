import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Trash2, X, UserCheck, AlertTriangle } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'

function RepForm({ initialValue, onCancel, onSave }) {
  const [name, setName] = useState(initialValue?.name ?? '')
  const [address, setAddress] = useState(initialValue?.address ?? '')
  const [phone1, setPhone1] = useState(initialValue?.phone1 ?? '')
  const [phone2, setPhone2] = useState(initialValue?.phone2 ?? '')
  const [email, setEmail] = useState(initialValue?.email ?? '')
  const [role, setRole] = useState(initialValue?.role ?? '')
  const [isRep, setIsRep] = useState(initialValue?.is_rep ?? false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSave({
        name: name.trim(),
        address: address.trim(),
        phone1: phone1.trim(),
        phone2: phone2.trim(),
        email: email.trim(),
        role: role.trim(),
        is_rep: isRep,
      })
    } catch (err) {
      setError(err?.message ?? 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50">
      <div className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">
            {initialValue ? 'Edit Employee' : 'Add Employee'}
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form className="p-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Phone 1</label>
              <input
                value={phone1}
                onChange={(e) => setPhone1(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Phone 2</label>
              <input
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Role</label>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                placeholder="e.g. Accountant, Driver"
              />
            </div>

            <div className="flex items-end gap-2 pb-1">
              <input
                type="checkbox"
                id="isRep"
                checked={isRep}
                onChange={(e) => setIsRep(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
              />
              <label htmlFor="isRep" className="text-sm font-medium text-slate-700">Is Rep (shows in invoice)</label>
            </div>
          </div>

          {error ? (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertTriangle size={14} />
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function RepsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [rows])

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.from('employees').select('*').order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load().catch((e) => {
      console.error(e)
      setError('Failed to load')
      setLoading(false)
    })
  }, [])

  const onAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const onEdit = (row) => {
    setEditing(row)
    setFormOpen(true)
  }

  const toast = useToast()

  const onDelete = async (row) => {
    if (!confirm('Delete this employee?')) return
    const { error: err } = await supabase.from('employees').delete().eq('id', row.id)
    if (err) {
      if (err.code === '23503') {
        toast.error('Cannot delete this employee because they are used in one or more invoices.')
      } else {
        toast.error(err.message)
      }
      return
    }
    toast.success('Employee deleted')
    await load()
  }

  const onSave = async (values) => {
    if (editing) {
      const { error: err } = await supabase
        .from('employees')
        .update(values)
        .eq('id', editing.id)
      if (err) throw err
    } else {
      const { error: err } = await supabase.from('employees').insert(values)
      if (err) throw err
    }

    setFormOpen(false)
    setEditing(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">Manage your employees and reps.</div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
          <Plus size={16} />
          Add Employee
        </button>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Name</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Address</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Phone</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Email</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Role</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Type</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-8">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-5 py-4 text-red-600 text-center">{error}</td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-slate-400 text-center">
                  <UserCheck size={24} className="mx-auto mb-2 opacity-40" />
                  No employees yet. Add your first employee!
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-slate-900">{row.name}</td>
                  <td className="px-5 py-3.5 text-slate-500">{row.address || '-'}</td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {row.phone1}{row.phone2 ? `, ${row.phone2}` : ''}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{row.email || '-'}</td>
                  <td className="px-5 py-3.5 text-slate-500">{row.role || '-'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${row.is_rep ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {row.is_rep ? 'Rep' : 'Employee'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => onEdit(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => onDelete(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen ? (
        <RepForm
          initialValue={editing}
          onCancel={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSave={onSave}
        />
      ) : null}
    </div>
  )
}

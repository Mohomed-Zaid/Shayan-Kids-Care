import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Trash2, X, Users, AlertTriangle, Search, CheckCircle, Ban } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'

function VendorForm({ initialValue, defaultCode, onCancel, onSave }) {
  const [code, setCode] = useState(initialValue?.code ?? defaultCode ?? '')
  const [name, setName] = useState(initialValue?.name ?? '')
  const [phone, setPhone] = useState(initialValue?.phone ?? '')
  const [address, setAddress] = useState(initialValue?.address ?? '')
  const [status, setStatus] = useState(initialValue?.status ?? 'active')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSave({ code: code.trim(), name: name.trim(), phone: phone.trim(), address: address.trim(), status })
    } catch (err) {
      setError(err?.message ?? 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {initialValue ? 'Edit Vendor' : 'Add Vendor'}
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <form className="p-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              readOnly={!!initialValue}
              className={`mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2.5 text-sm focus:outline-none transition-shadow ${initialValue ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900'}`}
              placeholder="e.g. 046"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {error ? (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertTriangle size={14} />
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
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

export default function VendorsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [nextCode, setNextCode] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const toast = useToast()

  const filteredRows = useMemo(() => {
    let list = [...rows]
    if (statusFilter !== 'all') {
      list = list.filter((r) => (r.status ?? 'active') === statusFilter)
    }
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter((r) =>
      String(r.code ?? '').toLowerCase().includes(q) ||
      (r.name ?? '').toLowerCase().includes(q) ||
      (r.phone ?? '').toLowerCase().includes(q) ||
      (r.address ?? '').toLowerCase().includes(q)
    )
  }, [rows, search, statusFilter])

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.from('vendors').select('*').order('name', { ascending: true })
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
    // Auto-generate next vendor code
    const maxNum = rows.reduce((max, r) => {
      const m = String(r.code ?? '').match(/V-(\d+)/i)
      return m ? Math.max(max, Number(m[1])) : max
    }, 0)
    setNextCode(`V-${String(maxNum + 1).padStart(3, '0')}`)
    setEditing(null)
    setFormOpen(true)
  }

  const onEdit = (row) => {
    setEditing(row)
    setFormOpen(true)
  }

  const onDelete = async (row) => {
    if (!confirm('Delete this vendor?')) return
    const { error: err } = await supabase.from('vendors').delete().eq('id', row.id)
    if (err) {
      if (err.code === '23503') {
        toast.error('Cannot delete this vendor because it is used in one or more purchases.')
      } else {
        toast.error(err.message)
      }
      return
    }
    toast.success('Vendor deleted')
    logAction({ action: 'delete_vendor', targetType: 'vendor', targetId: row.id, targetLabel: row.name })
    await load()
  }

  const onSave = async (values) => {
    if (editing) {
      const { error: err } = await supabase
        .from('vendors')
        .update({ code: values.code || null, name: values.name, phone: values.phone, address: values.address, status: values.status })
        .eq('id', editing.id)
      if (err) throw err
    } else {
      const { error: err } = await supabase
        .from('vendors')
        .insert({ code: values.code || null, name: values.name, phone: values.phone, address: values.address, status: values.status })
      if (err) throw err
    }

    setFormOpen(false)
    setEditing(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">Manage your vendors/suppliers.</div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
          <Plus size={16} />
          Add Vendor
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendor (code/name/phone/address)..."
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
        />
      </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Code</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Vendor</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Contact No</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Address</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-5 py-4 text-red-600 text-center">{error}</td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-slate-400 dark:text-slate-500 text-center">
                  <Users size={24} className="mx-auto mb-2 opacity-40" />
                  No vendors yet. Add your first vendor!
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{row.code || '-'}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{row.name}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{row.phone || '-'}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{row.address || '-'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      (row.status ?? 'active') === 'active'
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                    }`}>
                      {(row.status ?? 'active') === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => onEdit(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={async () => {
                          const next = (row.status ?? 'active') === 'active' ? 'inactive' : 'active'
                          const { error: err } = await supabase.from('vendors').update({ status: next }).eq('id', row.id)
                          if (err) {
                            toast.error(err.message)
                            return
                          }
                          toast.success(next === 'active' ? 'Vendor activated' : 'Vendor deactivated')
                          await load()
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                        title={(row.status ?? 'active') === 'active' ? 'Deactivate' : 'Activate'}
                      >
                        {(row.status ?? 'active') === 'active' ? <Ban size={15} /> : <CheckCircle size={15} />}
                      </button>
                      <button onClick={() => onDelete(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" title="Delete">
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
        <VendorForm
          initialValue={editing}
          defaultCode={editing ? undefined : nextCode}
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

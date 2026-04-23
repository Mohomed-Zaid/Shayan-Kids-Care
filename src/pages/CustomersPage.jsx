import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Trash2, X, Users, AlertTriangle } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'

function CustomerForm({ initialValue, onCancel, onSave }) {
  const [name, setName] = useState(initialValue?.name ?? '')
  const [address, setAddress] = useState(initialValue?.address ?? '')
  const [phone, setPhone] = useState(initialValue?.phone ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSave({ name: name.trim(), address: address.trim(), phone: phone.trim() })
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
            {initialValue ? 'Edit Customer' : 'Add Customer'}
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
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              required
            />
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

export default function CustomersPage() {
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
    const { data, error: err } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
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
    if (!confirm('Delete this customer?')) return
    const { error: err } = await supabase.from('customers').delete().eq('id', row.id)
    if (err) {
      if (err.code === '23503') {
        toast.error('Cannot delete this customer because they are used in one or more invoices.')
      } else {
        toast.error(err.message)
      }
      return
    }
    toast.success('Customer deleted')
    await load()
  }

  const onSave = async (values) => {
    if (editing) {
      const { error: err } = await supabase
        .from('customers')
        .update({ name: values.name, address: values.address, phone: values.phone })
        .eq('id', editing.id)
      if (err) throw err
    } else {
      // Get next customer number
      const { data: lastCust } = await supabase
        .from('customers')
        .select('customer_number')
        .order('customer_number', { ascending: false })
        .limit(1)

      const nextNum = lastCust && lastCust.length > 0 ? (Number(lastCust[0].customer_number ?? 0) + 1) : 1

      const { error: err } = await supabase
        .from('customers')
        .insert({ name: values.name, address: values.address, phone: values.phone, customer_number: nextNum })
      if (err) throw err
    }

    setFormOpen(false)
    setEditing(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">Manage your customer list.</div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
          <Plus size={16} />
          Add Customer
        </button>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">#</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Name</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Address</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Phone</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-8">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-5 py-4 text-red-600 text-center">{error}</td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-slate-400 text-center">
                  <Users size={24} className="mx-auto mb-2 opacity-40" />
                  No customers yet. Add your first customer!
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-slate-900">{row.customer_number ? `C-${String(row.customer_number).padStart(3, '0')}` : '—'}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{row.name}</td>
                  <td className="px-5 py-3.5 text-slate-500">{row.address}</td>
                  <td className="px-5 py-3.5 text-slate-500">{row.phone}</td>
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
        <CustomerForm
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

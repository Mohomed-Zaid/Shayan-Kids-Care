import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Trash2, X, Package, AlertTriangle } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'

function ProductForm({ initialValue, onCancel, onSave }) {
  const [name, setName] = useState(initialValue?.name ?? '')
  const [code, setCode] = useState(initialValue?.code ?? '')
  const [price, setPrice] = useState(initialValue?.price ?? '')
  const [stock, setStock] = useState(initialValue?.stock ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSave({ name: name.trim(), code: code.trim(), price: Number(price), stock: Number(stock) || 0 })
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
            {initialValue ? 'Edit Product' : 'Add Product'}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Price</label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Stock</label>
              <input
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                required
              />
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

export default function ProductsPage() {
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
    const { data, error: err } = await supabase.from('products').select('*').order('created_at', { ascending: false })
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
    if (!confirm('Delete this product?')) return
    const { error: err } = await supabase.from('products').delete().eq('id', row.id)
    if (err) {
      if (err.code === '23503') {
        toast.error('Cannot delete this product because it is used in one or more invoices.')
      } else {
        toast.error(err.message)
      }
      return
    }
    toast.success('Product deleted')
    await load()
  }

  const onSave = async (values) => {
    if (editing) {
      const { error: err } = await supabase
        .from('products')
        .update({ name: values.name, code: values.code, price: values.price, stock: values.stock })
        .eq('id', editing.id)
      if (err) throw err
    } else {
      const { error: err } = await supabase
        .from('products')
        .insert({ name: values.name, code: values.code, price: values.price, stock: values.stock })
      if (err) throw err
    }

    setFormOpen(false)
    setEditing(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">Manage your product catalog.</div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
          <Plus size={16} />
          Add Product
        </button>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Name</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Code</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Price</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Stock</th>
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
                  <Package size={24} className="mx-auto mb-2 opacity-40" />
                  No products yet. Add your first product!
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-slate-900">{row.name}</td>
                  <td className="px-5 py-3.5 text-slate-500">{row.code}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{Number(row.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      (row.stock ?? 0) <= 0 ? 'bg-red-100 text-red-700' : (row.stock ?? 0) <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {(row.stock ?? 0) <= 0 && <AlertTriangle size={10} />}
                      {row.stock ?? 0}
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
        <ProductForm
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

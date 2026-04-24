import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Trash2, X, Package, AlertTriangle, Search, ArrowUpDown, Filter, Printer } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'

function ProductForm({ initialValue, onCancel, onSave }) {
  const [name, setName] = useState(initialValue?.name ?? '')
  const [code, setCode] = useState(initialValue?.code ?? '')
  const [price, setPrice] = useState(initialValue?.price ?? '')
  const [stock, setStock] = useState(initialValue?.stock ?? '')
  const [category, setCategory] = useState(initialValue?.category ?? 'General')
  const [status, setStatus] = useState(initialValue?.status ?? 'active')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSave({ name: name.trim(), code: code.trim(), price: Number(price), stock: Number(stock) || 0, category: category.trim(), status })
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

            <div>
              <label className="block text-sm font-medium text-slate-700">Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                placeholder="e.g. Toys, Clothes, Accessories"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
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

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const categories = useMemo(() => {
    const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))]
    return cats.sort()
  }, [rows])

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredRows = useMemo(() => {
    let list = [...rows]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((r) =>
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.code ?? '').toLowerCase().includes(q) ||
        (r.category ?? '').toLowerCase().includes(q)
      )
    }
    if (categoryFilter !== 'all') {
      list = list.filter((r) => r.category === categoryFilter)
    }
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter)
    }
    list.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey]
      if (sortKey === 'price' || sortKey === 'stock') {
        va = Number(va) || 0
        vb = Number(vb) || 0
      } else if (sortKey === 'created_at') {
        va = new Date(va)
        vb = new Date(vb)
      } else {
        va = (va ?? '').toLowerCase()
        vb = (vb ?? '').toLowerCase()
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [rows, search, categoryFilter, statusFilter, sortKey, sortDir])

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
        .update({ name: values.name, code: values.code, price: values.price, stock: values.stock, category: values.category, status: values.status })
        .eq('id', editing.id)
      if (err) throw err
    } else {
      const { error: err } = await supabase
        .from('products')
        .insert({ name: values.name, code: values.code, price: values.price, stock: values.stock, category: values.category, status: values.status })
      if (err) throw err
    }

    setFormOpen(false)
    setEditing(null)
    await load()
  }

  const SortIcon = ({ field }) => (
    <ArrowUpDown
      size={12}
      className={`inline ml-1 ${sortKey === field ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'}`}
    />
  )

  const statusBadge = (s) => {
    if (s === 'active') return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
    return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">Manage your product catalog.</div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Printer size={16} />
            Print
          </button>
          <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
            <Plus size={16} />
            Add Product
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 no-print">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
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
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm print-area">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('name')}>Name <SortIcon field="name" /></th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('code')}>Code <SortIcon field="code" /></th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('category')}>Category <SortIcon field="category" /></th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('price')}>Price <SortIcon field="price" /></th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('stock')}>Stock <SortIcon field="stock" /></th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Status</th>
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
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-slate-400 dark:text-slate-500 text-center">
                  <Package size={24} className="mx-auto mb-2 opacity-40" />
                  No products found.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{row.name}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{row.code}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">{row.category ?? 'General'}</span>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{Number(row.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      (row.stock ?? 0) <= 0 ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : (row.stock ?? 0) <= 5 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {(row.stock ?? 0) <= 0 && <AlertTriangle size={10} />}
                      {row.stock ?? 0}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(row.status)}`}>
                      {row.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right no-print">
                    <div className="inline-flex gap-1">
                      <button onClick={() => onEdit(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Edit">
                        <Pencil size={15} />
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
        <div className="no-print">
        <ProductForm
          initialValue={editing}
          onCancel={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSave={onSave}
        />
        </div>
      ) : null}
    </div>
  )
}

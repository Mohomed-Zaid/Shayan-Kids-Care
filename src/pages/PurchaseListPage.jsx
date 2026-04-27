import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Search, Eye, Trash2, ArrowUpDown, Pencil, Check, X } from 'lucide-react'

export default function PurchaseListPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState('desc')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('purchase_items')
      .select('id, purchase_id, product_id, quantity, cost, mrp, description, total, exp_date, remarks, products(name, code), purchases(id, date, ref_no, type, created_at, vendors(name))')
      .order('created_at', { referencedTable: 'purchases', ascending: false })
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

  const filteredRows = useMemo(() => {
    let list = [...rows]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((r) =>
        (r.purchases?.vendors?.name ?? '').toLowerCase().includes(q) ||
        (r.products?.name ?? '').toLowerCase().includes(q) ||
        (r.products?.code ?? '').toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.purchases?.ref_no ?? '').toLowerCase().includes(q) ||
        String(r.cost ?? '').includes(q) ||
        String(r.mrp ?? '').includes(q)
      )
    }
    list.sort((a, b) => {
      const da = new Date(a.purchases?.created_at)
      const db = new Date(b.purchases?.created_at)
      return sortDir === 'desc' ? db - da : da - db
    })
    return list
  }, [rows, search, sortDir])

  const toggleSort = () => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))

  const fmt = (val) => `Rs. ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

  const handleDelete = async (purchaseId) => {
    if (!window.confirm('Are you sure you want to delete this purchase and all its items?')) return
    await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId)
    const { error: err } = await supabase.from('purchases').delete().eq('id', purchaseId)
    if (err) { alert(err.message); return }
    setRows((prev) => prev.filter((r) => r.purchase_id !== purchaseId))
  }

  const startEdit = (row) => {
    setEditingId(row.id)
    setEditForm({ quantity: row.quantity, cost: row.cost, mrp: row.mrp ?? '', description: row.description ?? '', remarks: row.remarks ?? '' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const saveEdit = async (row) => {
    const qty = Number(editForm.quantity) || 0
    const cst = Number(editForm.cost) || 0
    const total = qty * cst
    const { error: err } = await supabase
      .from('purchase_items')
      .update({
        quantity: qty,
        cost: cst,
        mrp: editForm.mrp ? Number(editForm.mrp) : null,
        description: editForm.description.trim() || null,
        remarks: editForm.remarks.trim() || null,
        total,
      })
      .eq('id', row.id)
    if (err) { alert(err.message); return }
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, quantity: qty, cost: cst, mrp: editForm.mrp ? Number(editForm.mrp) : null, description: editForm.description.trim() || null, remarks: editForm.remarks.trim() || null, total } : r))
    setEditingId(null)
    setEditForm({})
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">View all past purchases.</div>
        <Link
          to="/inventory/purchase"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
        >
          + New Purchase
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by vendor, product, description..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={toggleSort}>
                  Date <ArrowUpDown size={12} className={`inline ml-1 ${sortDir === 'desc' ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'}`} />
                </th>
                <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Ref No</th>
                <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Vendor</th>
                <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Product</th>
                <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">Qty</th>
                <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">Cost</th>
                <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">MRP</th>
                <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">Profit %</th>
                <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">Total</th>
                <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Description</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} className="px-4 py-4 text-red-600 text-center">{error}</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-slate-400 dark:text-slate-500 text-center">
                    No purchases found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const purchase = row.purchases ?? {}
                  const vendor = purchase.vendors ?? {}
                  const isEditing = editingId === row.id
                  const profitPct = (isEditing ? editForm.mrp : row.mrp) && (isEditing ? editForm.cost : row.cost) && Number(isEditing ? editForm.cost : row.cost) > 0
                    ? ((Number(isEditing ? editForm.mrp : row.mrp) - Number(isEditing ? editForm.cost : row.cost)) / Number(isEditing ? editForm.cost : row.cost) * 100).toFixed(1)
                    : null
                  const editTotal = (Number(editForm.quantity) || 0) * (Number(editForm.cost) || 0)
                  return (
                    <tr key={row.id} className={`border-b border-slate-50 dark:border-slate-800 transition-colors ${isEditing ? 'bg-sky-50/50 dark:bg-sky-900/20' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/50'}`}>
                      <td className="px-4 py-3 text-slate-900 dark:text-white whitespace-nowrap">{new Date(purchase.date ?? purchase.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{purchase.ref_no || '-'}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{vendor.name ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{row.products?.code ? `${row.products.code} - ` : ''}{row.products?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input type="text" inputMode="numeric" value={editForm.quantity} onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value.replace(/[^0-9]/g, '') }))} className="w-16 text-right rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-white" />
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">{row.quantity}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input type="text" inputMode="decimal" value={editForm.cost} onChange={(e) => setEditForm((f) => ({ ...f, cost: e.target.value }))} className="w-24 text-right rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-white" />
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">{fmt(row.cost)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input type="text" inputMode="decimal" value={editForm.mrp} onChange={(e) => setEditForm((f) => ({ ...f, mrp: e.target.value }))} className="w-24 text-right rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-white" />
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">{row.mrp ? fmt(row.mrp) : '-'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-300">{profitPct ? `${profitPct}%` : '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{isEditing ? fmt(editTotal) : fmt(row.total)}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-white" />
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">{row.description ?? '-'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(row)} className="p-1 text-emerald-600 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-100 transition-colors" title="Save">
                              <Check size={15} />
                            </button>
                            <button onClick={cancelEdit} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors" title="Cancel">
                              <X size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <Link
                              to={`/inventory/purchases/${purchase.id}`}
                              className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
                            >
                              <Eye size={14} />
                            </Link>
                            <button
                              onClick={() => startEdit(row)}
                              className="inline-flex items-center p-1 text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-200 transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(purchase.id)}
                              className="inline-flex items-center p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                              title="Delete purchase"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

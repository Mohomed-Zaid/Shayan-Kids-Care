import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Search, Eye, Trash2, ArrowUpDown } from 'lucide-react'

export default function PurchaseListPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState('desc')

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
                  const profitPct = row.mrp && row.cost && Number(row.cost) > 0 ? ((Number(row.mrp) - Number(row.cost)) / Number(row.cost) * 100).toFixed(1) : null
                  return (
                    <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 text-slate-900 dark:text-white whitespace-nowrap">{new Date(purchase.date ?? purchase.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{purchase.ref_no || '-'}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{vendor.name ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{row.products?.code ? `${row.products.code} - ` : ''}{row.products?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{row.quantity}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{fmt(row.cost)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{row.mrp ? fmt(row.mrp) : '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-300">{profitPct ? `${profitPct}%` : '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{fmt(row.total)}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{row.description ?? '-'}</td>
                      <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                        <Link
                          to={`/inventory/purchases/${purchase.id}`}
                          className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
                        >
                          <Eye size={14} />
                        </Link>
                        <button
                          onClick={() => handleDelete(purchase.id)}
                          className="inline-flex items-center p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                          title="Delete purchase"
                        >
                          <Trash2 size={14} />
                        </button>
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

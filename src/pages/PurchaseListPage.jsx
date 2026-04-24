import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Search, Eye, ArrowUpDown } from 'lucide-react'

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
      .from('purchases')
      .select('id, date, ref_no, type, total_amount, created_at, vendors(name)')
      .order('created_at', { ascending: false })
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
        (r.vendors?.name ?? '').toLowerCase().includes(q) ||
        (r.ref_no ?? '').toLowerCase().includes(q) ||
        String(r.total_amount ?? '').includes(q)
      )
    }
    list.sort((a, b) => {
      const da = new Date(a.created_at)
      const db = new Date(b.created_at)
      return sortDir === 'desc' ? db - da : da - db
    })
    return list
  }, [rows, search, sortDir])

  const toggleSort = () => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))

  const fmt = (val) => `Rs. ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

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
            placeholder="Search by vendor, ref no, amount..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={toggleSort}>
                Date <ArrowUpDown size={12} className={`inline ml-1 ${sortDir === 'desc' ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'}`} />
              </th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Vendor</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Ref No</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Type</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Total</th>
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
                  No purchases found.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3.5 text-slate-900 dark:text-white">{new Date(row.date ?? row.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{row.vendors?.name ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{row.ref_no || '-'}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                      {row.type ?? 'purchase'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-slate-900 dark:text-white">{fmt(row.total_amount)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`/inventory/purchases/${row.id}`}
                      className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
                    >
                      <Eye size={14} />
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

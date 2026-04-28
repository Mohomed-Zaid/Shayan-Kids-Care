import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Eye, Trash2, FileText, Search, Plus, RotateCcw } from 'lucide-react'

export default function ReturnsPage() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('returns')
      .select('id, return_number, total_amount, reason, created_at, customers(name, phone), return_items(quantity, products(name, code))')
      .order('created_at', { ascending: false })

    if (err) {
      toast.error(err.message)
      setRows([])
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load().catch((e) => {
      console.error(e)
      toast.error('Failed to load returns')
      setLoading(false)
    })
  }, [])

  const filtered = (() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        String(r.return_number ?? '').includes(q) ||
        String(r.customers?.name ?? '').toLowerCase().includes(q) ||
        String(r.reason ?? '').toLowerCase().includes(q) ||
        (r.return_items ?? []).some((i) => String(i.products?.name ?? '').toLowerCase().includes(q) || String(i.products?.code ?? '').toLowerCase().includes(q))
    )
  })()

  const onDelete = async (ret) => {
    if (!confirm('Delete this return and all its items? Stock will NOT be reduced back.')) return

    // Get items to restore stock
    const { data: items } = await supabase.from('return_items').select('product_id, quantity').eq('return_id', ret.id)

    // Reduce stock back (since return added stock, deleting return should remove it)
    if (items && items.length > 0) {
      const [prodRes] = await Promise.all([
        supabase.from('products').select('id, stock').in('id', items.map((i) => i.product_id).filter(Boolean)),
      ])
      const prodMap = new Map((prodRes.data ?? []).map((p) => [p.id, p.stock ?? 0]))

      await Promise.all(
        items
          .filter((i) => i.product_id)
          .map((i) => {
            const current = prodMap.get(i.product_id) ?? 0
            const newStock = Math.max(0, current - (i.quantity ?? 0))
            return supabase.from('products').update({ stock: newStock }).eq('id', i.product_id)
          })
      )
    }

    await supabase.from('return_items').delete().eq('return_id', ret.id)
    const { error: err } = await supabase.from('returns').delete().eq('id', ret.id)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Return deleted')
    logAction({ action: 'delete_return', targetType: 'return', targetId: row.id })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search returns..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
          />
        </div>
        <Link
          to="/returns/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Return
        </Link>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 dark:bg-emerald-950/35 dark:border-emerald-900/40 dark:text-emerald-100/80">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Return #</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Customer</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Products</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Total</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Reason</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Created</th>
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
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-slate-400 dark:text-emerald-100/60 text-center">
                  <RotateCcw size={24} className="mx-auto mb-2 opacity-40 dark:text-emerald-200/30" />
                  No returns yet.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                  <td className="px-5 py-3.5">
                    <span className="font-semibold text-slate-900 dark:text-emerald-50">RET-{String(r.return_number ?? '').padStart(4, '0')}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{r.customers?.name ?? '-'}</td>
                  <td className="px-5 py-3.5">
                    <div className="text-slate-700 dark:text-emerald-100/80 space-y-0.5">
                      {(r.return_items ?? []).map((i, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="font-medium">{i.products?.name ?? '-'}</span>
                          <span className="text-slate-400 dark:text-emerald-100/50 ml-1">×{i.quantity}</span>
                        </div>
                      ))}
                      {(r.return_items ?? []).length === 0 && <span className="text-xs text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">Rs. {Number(r.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60 max-w-[200px] truncate">{r.reason || '—'}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">
                    {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex gap-1">
                      <Link to={`/returns/${r.id}`} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors dark:text-emerald-100/60 dark:hover:text-emerald-50 dark:hover:bg-emerald-500/10" title="View">
                        <Eye size={15} />
                      </Link>
                      <button onClick={() => onDelete(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors dark:text-emerald-100/60 dark:hover:text-red-400 dark:hover:bg-red-500/10" title="Delete">
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
    </div>
  )
}

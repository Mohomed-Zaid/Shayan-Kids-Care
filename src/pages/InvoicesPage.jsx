import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Plus, Eye, Trash2, FileText } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'

export default function InvoicesPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, created_at, customers(name)')
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

  const toast = useToast()

  const onDelete = async (inv) => {
    if (!confirm('Delete this invoice and all its items?')) return
    await supabase.from('invoice_items').delete().eq('invoice_id', inv.id)
    const { error: err } = await supabase.from('invoices').delete().eq('id', inv.id)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Invoice deleted')
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">Create and view invoices.</div>
        <Link
          to="/invoices/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Create Invoice
        </Link>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Invoice #</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Customer</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Total</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Created</th>
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
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-slate-400 text-center">
                  <FileText size={24} className="mx-auto mb-2 opacity-40" />
                  No invoices yet. Create your first invoice!
                </td>
              </tr>
            ) : (
              rows.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-slate-900">INV-{String(inv.invoice_number ?? '').padStart(4, '0')}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{inv.customers?.name ?? '-'}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{Number(inv.total_amount ?? 0).toFixed(2)}</td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {new Date(inv.created_at).toLocaleDateString()} {new Date(inv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex gap-1">
                      <Link to={`/invoices/${inv.id}`} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors" title="View">
                        <Eye size={15} />
                      </Link>
                      <button onClick={() => onDelete(inv)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
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

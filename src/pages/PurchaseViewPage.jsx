import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ArrowLeft, Printer } from 'lucide-react'

const fmt = (val) => `Rs. ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function PurchaseViewPage() {
  const { id } = useParams()
  const [purchase, setPurchase] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: pData, error: pErr }, { data: iData, error: iErr }] = await Promise.all([
        supabase
          .from('purchases')
          .select('id, date, ref_no, type, total_amount, created_at, vendors(name, code, phone, address)')
          .eq('id', id)
          .single(),
        supabase
          .from('purchase_items')
          .select('id, product_id, quantity, cost, total, exp_date, remarks, products(name, code)')
          .eq('purchase_id', id),
      ])

      if (pErr) {
        setError(pErr.message)
      } else {
        setPurchase(pData)
      }
      if (iErr) {
        setError(iErr.message)
      } else {
        setItems(iData ?? [])
      }
      setLoading(false)
    }

    load().catch((e) => {
      console.error(e)
      setError('Failed to load')
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  if (error || !purchase) {
    return (
      <div className="text-center py-20 text-red-600">{error ?? 'Purchase not found'}</div>
    )
  }

  const vendor = purchase.vendors ?? {}

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link
          to="/inventory/purchases"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Purchases
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <Printer size={16} />
          Print
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl shadow-sm print-area">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Purchase Order</h2>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {purchase.ref_no ? `Ref: ${purchase.ref_no}` : ''} | {new Date(purchase.date ?? purchase.created_at).toLocaleDateString()}
              </div>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
              {purchase.type ?? 'purchase'}
            </span>
          </div>
        </div>

        <div className="p-6 border-b border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Vendor</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{vendor.name ?? '-'}</div>
            {vendor.code ? <div className="text-xs text-slate-500 dark:text-slate-400">Code: {vendor.code}</div> : null}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Contact</div>
            <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">{vendor.phone || '-'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{vendor.address || ''}</div>
          </div>
        </div>

        <div className="p-6">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Product</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Qty</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Cost</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Total</th>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Exp Date</th>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">
                    {it.products?.code ? `${it.products.code} - ` : ''}{it.products?.name ?? '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{it.quantity}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{fmt(it.cost)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900 dark:text-white">{fmt(it.total)}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{it.exp_date ?? '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{it.remarks ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-end">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-6 py-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between gap-8">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Amount</span>
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">{fmt(purchase.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { AlertTriangle, Package, Download } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

export default function BackorderReportPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, code, stock, category, status')
        .order('stock', { ascending: true })

      if (mounted) {
        setProducts(data?.filter(p => Number(p.stock ?? 0) < 0) ?? [])
        setLoading(false)
      }
    }

    load().catch((e) => {
      console.error(e)
      setLoading(false)
    })

    return () => { mounted = false }
  }, [])

  const downloadCsv = () => {
    const header = 'Product Name,Product Code,Category,Current Stock,Needed Quantity'
    const rows = products.map(p => 
      `${p.name},${p.code},${p.category ?? 'General'},${p.stock},${Math.abs(p.stock)}`
    )
    const csv = header + '\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'backorder-report.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-3 rounded-xl">
              <AlertTriangle size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white">Backorder Report</h1>
              <p className="text-red-100 text-sm mt-0.5">Products with negative stock (needed quantities)</p>
            </div>
          </div>
          {products.length > 0 && (
            <button
              onClick={downloadCsv}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/10 text-white hover:bg-white/20 border border-white/20 transition-colors"
            >
              <Download size={16} />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-5 shadow-lg">
          <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Products on Backorder</div>
          <div className="mt-3 text-2xl font-extrabold text-white">{products.length}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 shadow-lg">
          <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Total Needed Units</div>
          <div className="mt-3 text-2xl font-extrabold text-white">
            {products.reduce((sum, p) => sum + Math.abs(p.stock), 0)}
          </div>
        </div>
        <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Status</div>
          <div className="mt-3 text-xl font-extrabold text-white">
            {products.length === 0 ? 'All good!' : 'Action needed'}
          </div>
        </div>
      </div>

      {/* Backorder List */}
      <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-slate-900 dark:border-slate-700">
        <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-white">Backordered Products</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{products.length} products with negative stock</div>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-400 dark:text-slate-500">
            <Package size={32} className="mx-auto text-emerald-400 dark:text-emerald-300 mb-2" />
            Great! No products on backorder. All stock levels are positive.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-red-50 border-b border-slate-200 dark:bg-red-950/20 dark:border-slate-700">
                <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Product</th>
                <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Code</th>
                <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Category</th>
                <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Current Stock</th>
                <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Needed Quantity</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-red-50/30 transition-colors dark:border-slate-700 dark:hover:bg-red-900/10">
                  <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">{p.name}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{p.code}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {p.category ?? 'General'}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-semibold text-red-600 dark:text-red-400">{p.stock}</td>
                  <td className="px-5 py-3 font-bold text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle size={12} />
                    {Math.abs(p.stock)} units needed
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-red-700 text-white">
                <td className="px-5 py-3 font-bold text-sm uppercase tracking-wider" colSpan={3}>Total Needed</td>
                <td className="px-5 py-3"></td>
                <td className="px-5 py-3 font-extrabold">
                  {products.reduce((sum, p) => sum + Math.abs(p.stock), 0)} units
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import { Package, Users, FileText, DollarSign, Plus, Eye } from 'lucide-react'

const statConfig = [
  { key: 'products', label: 'Total Products', icon: Package, color: 'bg-blue-50 text-blue-600', iconBg: 'bg-blue-100' },
  { key: 'customers', label: 'Total Customers', icon: Users, color: 'bg-emerald-50 text-emerald-600', iconBg: 'bg-emerald-100' },
  { key: 'invoices', label: 'Total Invoices', icon: FileText, color: 'bg-violet-50 text-violet-600', iconBg: 'bg-violet-100' },
  { key: 'sales', label: 'Total Sales', icon: DollarSign, color: 'bg-amber-50 text-amber-600', iconBg: 'bg-amber-100', isCurrency: true },
]

function StatCard({ label, value, icon: Icon, color, iconBg, isCurrency }) {
  return (
    <div className={`${color.split(' ')[0]} border border-slate-200/60 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
        <div className={`${iconBg} p-2 rounded-lg`}>
          <Icon size={18} className={color.split(' ')[1]} />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-900">
        {isCurrency ? Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 }) : value}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    products: 0,
    customers: 0,
    invoices: 0,
    sales: 0,
  })
  const [recentInvoices, setRecentInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)

      const [productsRes, customersRes, invoicesRes, salesRes, recentRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('invoices').select('id', { count: 'exact', head: true }),
        supabase.from('invoices').select('total_amount'),
        supabase
          .from('invoices')
          .select('id, invoice_number, total_amount, created_at, customers(name)')
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      if (!mounted) return

      const sales = (salesRes.data ?? []).reduce((sum, row) => sum + (row.total_amount ?? 0), 0)

      setStats({
        products: productsRes.count ?? 0,
        customers: customersRes.count ?? 0,
        invoices: invoicesRes.count ?? 0,
        sales,
      })

      setRecentInvoices(recentRes.data ?? [])
      setLoading(false)
    }

    load().catch((e) => {
      console.error(e)
      setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statConfig.map((cfg) => (
          <StatCard
            key={cfg.key}
            label={cfg.label}
            value={stats[cfg.key]}
            icon={cfg.icon}
            color={cfg.color}
            iconBg={cfg.iconBg}
            isCurrency={cfg.isCurrency}
          />
        ))}
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 flex items-center justify-between border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-900">Recent Invoices</div>
            <div className="text-xs text-slate-400 mt-0.5">Last 10 invoices</div>
          </div>
          <Link
            to="/invoices/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Plus size={16} />
            Create Invoice
          </Link>
        </div>

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
            {recentInvoices.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-slate-400 text-center" colSpan={5}>
                  No invoices yet. Create your first invoice!
                </td>
              </tr>
            ) : (
              recentInvoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-slate-900">INV-{String(inv.invoice_number ?? '').padStart(4, '0')}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{inv.customers?.name ?? '-'}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{Number(inv.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {new Date(inv.created_at).toLocaleDateString()} {new Date(inv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link to={`/invoices/${inv.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors">
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

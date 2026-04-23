import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import { Package, Users, FileText, DollarSign, Plus, Eye, TrendingUp, ArrowUpRight } from 'lucide-react'

const statConfig = [
  { key: 'products', label: 'Total Products', icon: Package, gradient: 'from-blue-500 to-blue-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-blue-100' },
  { key: 'customers', label: 'Total Customers', icon: Users, gradient: 'from-emerald-500 to-emerald-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-emerald-100' },
  { key: 'invoices', label: 'Total Invoices', icon: FileText, gradient: 'from-slate-700 to-slate-800', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-slate-300' },
  { key: 'sales', label: 'Total Sales', icon: DollarSign, gradient: 'from-amber-500 to-orange-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-amber-100', isCurrency: true },
]

function StatCard({ label, value, icon: Icon, gradient, iconBg, textColor, valueColor, subColor, isCurrency }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5`}>
      <div className="flex items-center justify-between">
        <div className={`text-xs font-semibold ${textColor} uppercase tracking-wider opacity-90`}>{label}</div>
        <div className={`${iconBg} p-2.5 rounded-xl`}>
          <Icon size={20} className={textColor} />
        </div>
      </div>
      <div className={`mt-4 text-3xl font-extrabold ${valueColor} tracking-tight`}>
        {isCurrency ? `Rs. ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : value}
      </div>
      <div className={`mt-1 flex items-center gap-1 text-xs ${subColor} font-medium`}>
        <TrendingUp size={12} />
        <span>Shayan Kids Care</span>
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
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">Welcome back to Shayan Kids Care &amp; Toys Store</p>
          </div>
          <Link
            to="/invoices/new"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white text-slate-900 hover:bg-slate-100 transition-colors shadow-md"
          >
            <Plus size={16} />
            Create Invoice
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statConfig.map((cfg) => (
          <StatCard
            key={cfg.key}
            label={cfg.label}
            value={stats[cfg.key]}
            icon={cfg.icon}
            gradient={cfg.gradient}
            iconBg={cfg.iconBg}
            textColor={cfg.textColor}
            valueColor={cfg.valueColor}
            subColor={cfg.subColor}
            isCurrency={cfg.isCurrency}
          />
        ))}
      </div>

      {/* Recent Invoices */}
      <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 flex items-center justify-between border-b border-slate-100">
          <div>
            <div className="text-base font-bold text-slate-900">Recent Invoices</div>
            <div className="text-xs text-slate-400 mt-0.5">Last 10 invoices</div>
          </div>
          <Link
            to="/invoices"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors"
          >
            View All
            <ArrowUpRight size={14} />
          </Link>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Invoice #</th>
              <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
              <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Total</th>
              <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Created</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {recentInvoices.length === 0 ? (
              <tr>
                <td className="px-5 py-12 text-slate-400 text-center" colSpan={5}>
                  <div className="flex flex-col items-center gap-2">
                    <FileText size={32} className="text-slate-300" />
                    <span>No invoices yet. Create your first invoice!</span>
                  </div>
                </td>
              </tr>
            ) : (
              recentInvoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-semibold text-slate-900">INV-{String(inv.invoice_number ?? '').padStart(4, '0')}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{inv.customers?.name ?? '-'}</td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900">Rs. {Number(inv.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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

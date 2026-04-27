import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Package, Users, FileText, DollarSign, Plus, Eye, TrendingUp, ArrowUpRight, Truck, ShoppingCart, BookOpen, Wallet, Calendar } from 'lucide-react'

const statConfig = [
  { key: 'todaySales', label: 'Today Sales', icon: DollarSign, gradient: 'from-amber-500 to-orange-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-amber-100', isCurrency: true },
  { key: 'totalSales', label: 'Total Sales', icon: TrendingUp, gradient: 'from-rose-500 to-pink-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-rose-100', isCurrency: true },
  { key: 'todayPurchases', label: 'Today Purchases', icon: ShoppingCart, gradient: 'from-indigo-500 to-indigo-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-indigo-100', isCurrency: true },
  { key: 'totalPurchases', label: 'Total Purchases', icon: Wallet, gradient: 'from-teal-500 to-cyan-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-teal-100', isCurrency: true },
  { key: 'products', label: 'Products', icon: Package, gradient: 'from-blue-500 to-blue-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-blue-100' },
  { key: 'customers', label: 'Customers', icon: Users, gradient: 'from-emerald-500 to-emerald-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-emerald-100' },
]

function StatCard({ label, value, icon: Icon, gradient, iconBg, textColor, valueColor, subColor, isCurrency }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} dark:from-emerald-950/40 dark:via-slate-950/40 dark:to-emerald-950/40 rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 dark:border dark:border-emerald-400/15`}>
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
  const { user } = useAuth()

  const displayName = (() => {
    const email = user?.email ?? ''
    const USER_MAP = {
      'zaidn2848@gmail.com': 'Zaid',
      'shayankidscare@gmail.com': 'Niflan',
    }
    return USER_MAP[email] ?? email.split('@')[0]
  })()

  const [stats, setStats] = useState({
    products: 0,
    customers: 0,
    vendors: 0,
    todaySales: 0,
    todayPurchases: 0,
    totalSales: 0,
    totalPurchases: 0,
    journals: 0,
    journalEntries: 0,
  })
  const [recentInvoices, setRecentInvoices] = useState([])
  const [recentPurchases, setRecentPurchases] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const [productsRes, customersRes, vendorsRes, todaySalesRes, todayPurchasesRes, totalSalesRes, totalPurchasesRes, journalsRes, journalEntriesRes, recentInvRes, recentPurRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('vendors').select('id', { count: 'exact', head: true }),
        supabase
          .from('invoices')
          .select('total_amount, created_at')
          .gte('created_at', todayStart.toISOString())
          .lte('created_at', todayEnd.toISOString()),
        supabase
          .from('purchases')
          .select('total_amount, created_at')
          .gte('created_at', todayStart.toISOString())
          .lte('created_at', todayEnd.toISOString()),
        supabase.from('invoices').select('total_amount'),
        supabase.from('purchases').select('total_amount'),
        supabase.from('journals').select('id', { count: 'exact', head: true }),
        supabase.from('journal_entries').select('id', { count: 'exact', head: true }),
        supabase
          .from('invoices')
          .select('id, invoice_number, total_amount, created_at, customers(name)')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('purchases')
          .select('id, total_amount, created_at, vendors(name)')
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      if (!mounted) return

      const todaySales = (todaySalesRes.data ?? []).reduce((sum, row) => sum + (row.total_amount ?? 0), 0)
      const todayPurchases = (todayPurchasesRes.data ?? []).reduce((sum, row) => sum + (row.total_amount ?? 0), 0)
      const totalSales = (totalSalesRes.data ?? []).reduce((sum, row) => sum + (row.total_amount ?? 0), 0)
      const totalPurchases = (totalPurchasesRes.data ?? []).reduce((sum, row) => sum + (row.total_amount ?? 0), 0)

      setStats({
        products: productsRes.count ?? 0,
        customers: customersRes.count ?? 0,
        vendors: vendorsRes.count ?? 0,
        todaySales,
        todayPurchases,
        totalSales,
        totalPurchases,
        journals: journalsRes.count ?? 0,
        journalEntries: journalEntriesRes.count ?? 0,
      })

      setRecentInvoices(recentInvRes.data ?? [])
      setRecentPurchases(recentPurRes.data ?? [])
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
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 dark:from-emerald-950/60 dark:via-slate-950/60 dark:to-emerald-950/60 rounded-2xl p-6 shadow-lg dark:border dark:border-emerald-400/15">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Welcome back, {displayName}</h1>
            <p className="text-slate-400 dark:text-emerald-100/60 text-sm mt-1">Shayan Kids Care &amp; Toys Store</p>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400 dark:text-emerald-100/50">
              <Calendar size={12} />
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} &middot; {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <Link
            to="/orders/new"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white dark:bg-emerald-950/40 dark:text-emerald-50 dark:border dark:border-emerald-400/15 text-slate-900 hover:bg-slate-100 dark:hover:bg-emerald-500/10 transition-colors shadow-md"
          >
            <Plus size={16} />
            Create Order
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
          <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-emerald-900/40">
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Recent Invoices</div>
              <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Last 10 invoices</div>
            </div>
            <Link
              to="/orders"
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors dark:text-emerald-100/75 dark:hover:text-emerald-50"
            >
              View All
              <ArrowUpRight size={14} />
            </Link>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Invoice #</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Total</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {recentInvoices.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center" colSpan={4}>
                    <div className="flex flex-col items-center gap-2">
                      <FileText size={32} className="text-slate-300 dark:text-emerald-200/30" />
                      <span>No invoices yet. Create your first invoice!</span>
                    </div>
                  </td>
                </tr>
              ) : (
                recentInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-emerald-50">INV-{String(inv.invoice_number ?? '').padStart(4, '0')}</div>
                      <div className="text-xs text-slate-400 dark:text-emerald-100/50">{new Date(inv.created_at).toLocaleString()}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{inv.customers?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">Rs. {Number(inv.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/invoices/${inv.id}`}
                        className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-emerald-100/75 hover:text-slate-900 dark:hover:text-emerald-50 font-medium transition-colors"
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

        {/* Recent Purchases */}
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
          <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-emerald-900/40">
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Recent Purchases</div>
              <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Last 10 purchases</div>
            </div>
            <Link
              to="/inventory/purchases"
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors dark:text-emerald-100/75 dark:hover:text-emerald-50"
            >
              View All
              <ArrowUpRight size={14} />
            </Link>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Vendor</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Total</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentPurchases.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center" colSpan={3}>
                    <div className="flex flex-col items-center gap-2">
                      <ShoppingCart size={32} className="text-slate-300 dark:text-emerald-200/30" />
                      <span>No purchases yet.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                recentPurchases.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-emerald-50">{p.vendors?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">Rs. {Number(p.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">{new Date(p.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

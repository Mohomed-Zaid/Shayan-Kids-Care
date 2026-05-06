import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Package, Users, FileText, DollarSign, Plus, Eye, TrendingUp, ArrowUpRight, Truck, ShoppingCart, BookOpen, Wallet, Calendar, Landmark } from 'lucide-react'
import Chart from 'react-apexcharts'

const statConfig = [
  { key: 'todaySales', label: 'Today Sales', icon: DollarSign, gradient: 'from-amber-500 to-orange-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-amber-100', isCurrency: true },
  { key: 'totalSales', label: 'Total Sales', icon: TrendingUp, gradient: 'from-rose-500 to-pink-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-rose-100', isCurrency: true },
  { key: 'todayPayments', label: 'Today Payments', icon: ShoppingCart, gradient: 'from-indigo-500 to-indigo-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-indigo-100', isCurrency: true },
  { key: 'totalPayments', label: 'Total Payments', icon: Wallet, gradient: 'from-teal-500 to-cyan-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-teal-100', isCurrency: true },
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

const fmtMoney = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

function monthKeyFromDate(d) {
  const dt = new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function buildLast12Months() {
  const now = new Date()
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = monthKeyFromDate(d)
    const label = d.toLocaleString(undefined, { month: 'short' })
    months.push({ key, label })
  }
  return months
}

// (Charts are rendered with ApexCharts now)

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
    todaySales: 0,
    todayPayments: 0,
    totalSales: 0,
    totalPayments: 0,
  })
  const [receivableCheques, setReceivableCheques] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [payableCheques, setPayableCheques] = useState([])
  const [monthSeries, setMonthSeries] = useState({ labels: [], sales: [], grossProfit: [] })
  const [receivable, setReceivable] = useState({ due: 0, currentMonth: 0, received: 0 })
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailPayment, setDetailPayment] = useState(null)

  const receivableSegments = useMemo(() => {
    return [
      { label: 'Due', value: receivable.due, color: 'rgba(255,255,255,0.95)' },
      { label: 'Current Month', value: receivable.currentMonth, color: 'rgba(148,163,184,0.65)' },
      { label: 'Received', value: receivable.received, color: 'rgba(148,163,184,0.30)' },
    ]
  }, [receivable])

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const months = buildLast12Months()
      const oldestMonthStart = new Date(months[0].key + '-01T00:00:00.000Z')
      const monthStart = new Date(todayStart)
      monthStart.setDate(1)

      const payChequeRes = supabase
        .from('purchase_payments')
        .select('id, amount, paid_at, reference, method, created_at, purchases(vendor_id, vendors(name))')
        .eq('method', 'cheque')
        .order('paid_at', { ascending: false })
        .limit(10)

      const [productsRes, customersRes, todaySalesRes, todayPaymentsRes, totalSalesRes, totalPaymentsRes, recentInvRes, allPayRes, recentPayRes, invForChartsRes, payForChartsRes, invItemsForProfitRes, purchaseItemsRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase
          .from('invoices')
          .select('total_amount, created_at')
          .gte('created_at', todayStart.toISOString())
          .lte('created_at', todayEnd.toISOString()),
        supabase
          .from('invoice_payments')
          .select('amount, paid_at')
          .gte('paid_at', todayStart.toISOString())
          .lte('paid_at', todayEnd.toISOString()),
        supabase.from('invoices').select('total_amount'),
        supabase.from('invoice_payments').select('amount'),
        supabase
          .from('customer_cheques')
          .select('id, cheque_date, cheque_number, amount, bank_name, status, customers(name)')
          .eq('status', 'in_hand')
          .order('cheque_date', { ascending: false })
          .limit(15),
        supabase
          .from('invoice_payments')
          .select('invoice_id, amount'),
        (() => {
          const tenDaysAgo = new Date()
          tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
          tenDaysAgo.setHours(0, 0, 0, 0)
          return supabase
            .from('invoice_payments')
            .select('id, invoice_id, amount, paid_at, method, bank_name, reference, note, created_at, invoices(invoice_number, customer_id, customers(name))')
            .gte('paid_at', tenDaysAgo.toISOString())
            .order('paid_at', { ascending: false })
            .limit(10)
        })(),
        supabase
          .from('invoices')
          .select('id, total_amount, created_at')
          .gte('created_at', oldestMonthStart.toISOString()),
        supabase
          .from('invoice_payments')
          .select('id, amount, paid_at')
          .gte('paid_at', oldestMonthStart.toISOString()),
        supabase
          .from('invoice_items')
          .select('product_id, quantity, price, discount, total, invoices(created_at)')
          .gte('invoices.created_at', oldestMonthStart.toISOString()),
        supabase
          .from('purchase_items')
          .select('product_id, cost')
          .order('id', { ascending: false })
          .limit(5000),
      ])

      if (!mounted) return

      const payChequeData = await payChequeRes

      const todaySales = (todaySalesRes.data ?? []).reduce((sum, row) => sum + (row.total_amount ?? 0), 0)
      const todayPayments = (todayPaymentsRes.data ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0)
      const totalSales = (totalSalesRes.data ?? []).reduce((sum, row) => sum + (row.total_amount ?? 0), 0)
      const totalPayments = (totalPaymentsRes.data ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0)

      setStats({
        products: productsRes.count ?? 0,
        customers: customersRes.count ?? 0,
        todaySales,
        todayPayments,
        totalSales,
        totalPayments,
      })

      setReceivableCheques(recentInvRes.data ?? [])
      setRecentPayments(recentPayRes.data ?? [])
      if (payChequeData.error) console.error('Payable cheques load error:', payChequeData.error)
      setPayableCheques(payChequeData.data ?? [])

      // Monthly series (last 12 months)
      const latestCostByProduct = new Map()
      for (const pi of purchaseItemsRes.data ?? []) {
        const pid = pi.product_id
        if (!pid) continue
        if (latestCostByProduct.has(pid)) continue
        latestCostByProduct.set(pid, Number(pi.cost ?? 0))
      }

      const salesByMonth = new Map(months.map((m) => [m.key, 0]))
      for (const inv of invForChartsRes.data ?? []) {
        const k = monthKeyFromDate(inv.created_at)
        if (!salesByMonth.has(k)) continue
        salesByMonth.set(k, (salesByMonth.get(k) ?? 0) + Number(inv.total_amount ?? 0))
      }

      const grossProfitByMonth = new Map(months.map((m) => [m.key, 0]))
      for (const it of invItemsForProfitRes.data ?? []) {
        const created = it?.invoices?.created_at
        if (!created) continue
        const k = monthKeyFromDate(created)
        if (!grossProfitByMonth.has(k)) continue

        const qty = Number(it.quantity ?? 0)
        const price = Number(it.price ?? 0)
        const discPct = Number(it.discount ?? 0)
        const discAmt = qty * price * (discPct / 100)
        const revenue = Number(it.total ?? (qty * price - discAmt))
        const cost = Number(latestCostByProduct.get(it.product_id) ?? 0)
        const gp = revenue - qty * cost
        grossProfitByMonth.set(k, (grossProfitByMonth.get(k) ?? 0) + gp)
      }

      setMonthSeries({
        labels: months.map((m) => m.label),
        sales: months.map((m) => salesByMonth.get(m.key) ?? 0),
        grossProfit: months.map((m) => grossProfitByMonth.get(m.key) ?? 0),
      })

      // Receivable summary
      const due = Math.max(0, totalSales - totalPayments)
      const currentMonthSales = (invForChartsRes.data ?? [])
        .filter((inv) => new Date(inv.created_at) >= monthStart)
        .reduce((s, inv) => s + Number(inv.total_amount ?? 0), 0)
      setReceivable({
        due,
        currentMonth: currentMonthSales,
        received: totalPayments,
      })
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

  const currentMonthIdx = useMemo(() => {
    const nowLabel = new Date().toLocaleString(undefined, { month: 'short' })
    return monthSeries.labels.findIndex((l) => l === nowLabel)
  }, [monthSeries.labels])

  const currentMonthSales = currentMonthIdx >= 0 ? Number(monthSeries.sales[currentMonthIdx] ?? 0) : 0
  const currentMonthGrossProfit = currentMonthIdx >= 0 ? Number(monthSeries.grossProfit[currentMonthIdx] ?? 0) : 0
  const profitPct = currentMonthSales > 0 ? (currentMonthGrossProfit / currentMonthSales) * 100 : 0

  const areaSeries = useMemo(() => {
    return [
      { name: 'Sales', data: monthSeries.sales },
      { name: 'Gross Profit', data: monthSeries.grossProfit },
    ]
  }, [monthSeries.sales, monthSeries.grossProfit])

  const areaOptions = useMemo(() => {
    return {
      chart: {
        type: 'area',
        toolbar: { show: false },
        background: 'transparent',
        foreColor: 'rgba(226,232,240,0.85)',
      },
      stroke: { curve: 'smooth', width: 2 },
      dataLabels: { enabled: false },
      fill: { type: 'solid', opacity: 0.35 },
      colors: ['#ffffff', '#94a3b8'],
      grid: {
        borderColor: 'rgba(148,163,184,0.16)',
        strokeDashArray: 4,
        xaxis: { lines: { show: true } },
        yaxis: { lines: { show: true } },
      },
      xaxis: {
        categories: monthSeries.labels,
        labels: { style: { colors: 'rgba(148,163,184,0.85)', fontWeight: 700 } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          formatter: (v) => {
            const n = Number(v || 0)
            return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n.toFixed(0)}`
          },
          style: { colors: 'rgba(148,163,184,0.85)', fontWeight: 700 },
        },
      },
      tooltip: {
        theme: 'dark',
        y: {
          formatter: (v) => fmtMoney(v),
        },
      },
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        labels: { colors: 'rgba(226,232,240,0.9)' },
      },
    }
  }, [monthSeries.labels])

  const donutSeries = useMemo(() => receivableSegments.map((s) => Number(s.value ?? 0)), [receivableSegments])
  const donutOptions = useMemo(() => {
    return {
      chart: { type: 'donut', background: 'transparent', foreColor: 'rgba(226,232,240,0.85)' },
      labels: receivableSegments.map((s) => s.label),
      colors: receivableSegments.map((s) => s.color),
      stroke: { width: 0 },
      dataLabels: { enabled: false },
      legend: { show: false },
      tooltip: {
        theme: 'dark',
        y: { formatter: (v) => fmtMoney(v) },
      },
      plotOptions: {
        pie: {
          donut: {
            size: '62%',
            labels: {
              show: true,
              name: { show: true, color: 'rgba(148,163,184,0.9)', fontSize: '11px', fontWeight: 800 },
              value: {
                show: true,
                color: '#fff',
                fontSize: '14px',
                fontWeight: 900,
                formatter: (v) => fmtMoney(v),
              },
              total: {
                show: true,
                label: 'TOTAL',
                color: 'rgba(148,163,184,0.9)',
                fontSize: '11px',
                fontWeight: 900,
                formatter: () => fmtMoney(donutSeries.reduce((s, x) => s + Number(x || 0), 0)),
              },
            },
          },
        },
      },
    }
  }, [receivableSegments, donutSeries])

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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl overflow-hidden shadow-sm border border-slate-200/60 dark:border-emerald-400/15 bg-white dark:bg-emerald-950/25">
          <div className="p-5 flex items-start justify-between border-b border-slate-100 dark:border-emerald-900/40">
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Sales & Profit</div>
              <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Last 12 months</div>
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-emerald-100/60">Amounts are exact (hover on chart)</div>
          </div>
          <div className="p-4">
            <div className="rounded-xl overflow-hidden border border-slate-200/60 dark:border-emerald-900/40 bg-slate-900/90">
              <Chart options={areaOptions} series={areaSeries} type="area" height={260} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div className="rounded-xl border border-slate-200/60 dark:border-emerald-900/40 bg-white/60 dark:bg-emerald-950/15 px-4 py-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">Current Month Sales</div>
                <div className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">{fmtMoney(currentMonthSales)}</div>
              </div>
              <div className="rounded-xl border border-slate-200/60 dark:border-emerald-900/40 bg-white/60 dark:bg-emerald-950/15 px-4 py-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">Current Month Gross Profit</div>
                <div className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">{fmtMoney(currentMonthGrossProfit)}</div>
              </div>
              <div className="rounded-xl border border-slate-200/60 dark:border-emerald-900/40 bg-white/60 dark:bg-emerald-950/15 px-4 py-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">Profit Percentage</div>
                <div className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">{profitPct.toFixed(2)}%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-200/60 dark:border-emerald-400/15 bg-white dark:bg-emerald-950/25">
          <div className="p-5 border-b border-slate-100 dark:border-emerald-900/40">
            <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Customer Receivable</div>
            <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Due / Current Month / Received</div>
          </div>
          <div className="p-5 flex flex-col items-center gap-4">
            <div className="rounded-xl overflow-hidden border border-slate-200/60 dark:border-emerald-900/40 bg-slate-900/90">
              <Chart options={donutOptions} series={donutSeries} type="donut" width={260} />
            </div>
            <div className="w-full space-y-2">
              {receivableSegments.map((s) => (
                <div key={s.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-extrabold text-slate-900 dark:text-white">{fmtMoney(s.value)}</div>
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-300 w-[64px] text-right">
                      {(() => {
                        const total = receivableSegments.reduce((sum, r) => sum + Math.max(0, Number(r.value ?? 0)), 0)
                        const pct = total > 0 ? (Number(s.value ?? 0) / total) * 100 : 0
                        return `${pct.toFixed(2)}%`
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receivable Cheques */}
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
          <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-emerald-900/40">
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Receivable Cheques</div>
              <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Cheques in hand</div>
            </div>
            <Link
              to="/finance/cheques"
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors dark:text-emerald-100/75 dark:hover:text-emerald-50"
            >
              View All
              <ArrowUpRight size={14} />
            </Link>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Cheque #</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Due Date</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {receivableCheques.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center" colSpan={5}>
                    <div className="flex flex-col items-center gap-2">
                      <Landmark size={32} className="text-slate-300 dark:text-emerald-200/30" />
                      <span>No cheques in hand</span>
                    </div>
                  </td>
                </tr>
              ) : (
                receivableCheques.map((ch) => {
                  const dueDate = ch.cheque_date ? new Date(`${String(ch.cheque_date).slice(0, 10)}T00:00:00`) : null
                  const today = new Date()
                  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
                  const diffDays = dueDate ? Math.floor((dueDate.getTime() - startToday.getTime()) / 86400000) : null
                  const daysLabel = diffDays === null ? '-' : diffDays < 0 ? `${Math.abs(diffDays)}d passed` : diffDays === 0 ? 'Today' : `${diffDays}d left`
                  const daysColor = diffDays === null ? 'text-slate-400' : diffDays < 0 ? 'text-rose-500' : diffDays <= 3 ? 'text-amber-500' : 'text-emerald-500'
                  return (
                    <tr key={ch.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-emerald-50">{ch.cheque_number || '-'}</div>
                        <div className="text-xs text-slate-400 dark:text-emerald-100/50">{ch.bank_name || '-'}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{ch.customers?.name ?? '-'}</td>
                      <td className="px-5 py-3.5">
                        <div className="text-slate-700 dark:text-emerald-50">{ch.cheque_date ? String(ch.cheque_date).slice(0, 10) : '-'}</div>
                        <div className={`text-xs font-semibold ${daysColor}`}>{daysLabel}</div>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">Rs. {Number(ch.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          to="/finance/cheques"
                          className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-emerald-100/75 hover:text-slate-900 dark:hover:text-emerald-50 font-medium transition-colors"
                        >
                          <Eye size={14} />
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Customer Payments */}
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
          <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-emerald-900/40">
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Customer Payments</div>
              <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Payments from the last 10 days</div>
            </div>
            <Link
              to="/finance/receivables"
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors dark:text-emerald-100/75 dark:hover:text-emerald-50"
            >
              View All
              <ArrowUpRight size={14} />
            </Link>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Method</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center" colSpan={5}>
                    <div className="flex flex-col items-center gap-2">
                      <Wallet size={32} className="text-slate-300 dark:text-emerald-200/30" />
                      <span>No payments yet.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                recentPayments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer dark:border-emerald-900/30 dark:hover:bg-emerald-500/5" onClick={() => { setDetailPayment(p); setDetailOpen(true) }}>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900 dark:text-emerald-50">{p.invoices?.customers?.name ?? '-'}</div>
                      <div className="text-xs text-slate-400 dark:text-emerald-100/50">INV-{String(p.invoices?.invoice_number ?? '').padStart(4, '0')}</div>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">Rs. {Number(p.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-emerald-500/15 dark:text-emerald-100">{(p.method ?? 'other').toUpperCase()}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">{new Date(p.paid_at ?? p.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDetailPayment(p); setDetailOpen(true) }}
                        className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-emerald-100/75 hover:text-slate-900 dark:hover:text-emerald-50 font-medium transition-colors"
                      >
                        <Eye size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payable Cheques */}
      <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-emerald-900/40">
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Payable Cheques</div>
            <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Vendor cheques deposited</div>
          </div>
          <Link
            to="/finance/cheques"
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
              <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Cheque #</th>
              <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Amount</th>
              <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody>
            {payableCheques.length === 0 ? (
              <tr>
                <td className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center" colSpan={4}>
                  <div className="flex flex-col items-center gap-2">
                    <Landmark size={32} className="text-slate-300 dark:text-emerald-200/30" />
                    <span>No payable cheques</span>
                  </div>
                </td>
              </tr>
            ) : (
              payableCheques.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-slate-900 dark:text-emerald-50">{c.purchases?.vendors?.name ?? '-'}</div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{c.reference ?? '-'}</td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">Rs. {Number(c.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">{new Date(c.paid_at ?? c.created_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Detail Modal */}
      {detailOpen && detailPayment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setDetailOpen(false)}>
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white">Payment Details</div>
              <button
                onClick={() => setDetailOpen(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Customer</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{detailPayment.invoices?.customers?.name ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Invoice</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">INV-{String(detailPayment.invoices?.invoice_number ?? '').padStart(4, '0')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Amount</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">Rs. {Number(detailPayment.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Method</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{(detailPayment.method ?? 'other').toUpperCase()}</span>
              </div>
              {detailPayment.bank_name ? (
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Bank</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{detailPayment.bank_name}</span>
                </div>
              ) : null}
              {detailPayment.reference ? (
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Reference</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{detailPayment.reference}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Paid At</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{new Date(detailPayment.paid_at ?? detailPayment.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Recorded At</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{new Date(detailPayment.created_at).toLocaleString()}</span>
              </div>
              {detailPayment.note ? (
                <div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Note</span>
                  <div className="mt-1 text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">{detailPayment.note}</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

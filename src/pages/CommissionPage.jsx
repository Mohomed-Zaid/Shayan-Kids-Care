import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Calculator, UserCheck, Calendar, DollarSign, FileText, Download, TrendingUp, RotateCcw, TrendingDown } from 'lucide-react'

const COMMISSION_RATES = { munzir: 0.025, default: 0.01 }

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function CommissionPage() {
  const [reps, setReps] = useState([])
  const [selectedRep, setSelectedRep] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [result, setResult] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [returns, setReturns] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingReps, setLoadingReps] = useState(true)

  useEffect(() => {
    let mounted = true

    const fetchReps = async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, name')
        .eq('is_rep', true)
        .order('name')

      if (mounted) {
        setReps(data ?? [])
        setLoadingReps(false)
      }
    }

    fetchReps()
    return () => { mounted = false }
  }, [])

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear()
    const years = []
    for (let y = current; y >= current - 5; y--) years.push(y)
    return years
  }, [])

  const calculate = async () => {
    if (!selectedRep) return

    setLoading(true)
    setResult(null)
    setInvoices([])
    setReturns([])

    const startDate = new Date(selectedYear, selectedMonth, 1).toISOString()
    const endDate = new Date(selectedYear, selectedMonth + 1, 1).toISOString()

    const [invRes, retRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, created_at, customers(name)')
        .eq('rep_id', selectedRep)
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .order('created_at', { ascending: false }),
      supabase
        .from('returns')
        .select('id, return_number, total_amount, reason, created_at, invoice_id, customers(name), invoices(id, invoice_number, rep_id)')
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .order('created_at', { ascending: false }),
    ])

    if (invRes.error) {
      console.error(invRes.error)
      setLoading(false)
      return
    }

    const invoiceList = invRes.data ?? []
    // Filter returns linked to this rep's invoices
    const returnList = (retRes.data ?? []).filter(
      (r) => r.invoices && String(r.invoices.rep_id) === String(selectedRep)
    )

    const totalSales = invoiceList.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0)
    const totalReturns = returnList.reduce((sum, r) => sum + (r.total_amount ?? 0), 0)
    const netSales = totalSales - totalReturns
    const repName = reps.find(r => String(r.id) === String(selectedRep))?.name ?? 'N/A'
    const rate = repName.toLowerCase().includes('munzir') ? COMMISSION_RATES.munzir : COMMISSION_RATES.default
    const grossCommission = totalSales * rate
    const returnDeduction = totalReturns * rate
    const netCommission = netSales * rate

    setResult({
      repName,
      month: months[selectedMonth],
      year: selectedYear,
      invoiceCount: invoiceList.length,
      returnCount: returnList.length,
      totalSales,
      totalReturns,
      netSales,
      grossCommission,
      returnDeduction,
      commission: netCommission,
      rate,
    })

    setInvoices(invoiceList)
    setReturns(returnList)
    setLoading(false)
  }

  const downloadCsv = () => {
    if (!result) return

    const invHeader = 'Invoice #,Customer,Total Amount,Date'
    const invRows = invoices.map(inv =>
      `INV-${String(inv.invoice_number ?? '').padStart(4, '0')},${inv.customers?.name ?? '-'},${inv.total_amount ?? 0},${new Date(inv.created_at).toLocaleDateString()}`
    )

    const retHeader = '\n\nReturn #,Customer,Original Invoice,Total Refund,Reason,Date'
    const retRows = returns.map(r =>
      `RET-${String(r.return_number ?? '').padStart(4, '0')},${r.customers?.name ?? '-'},INV-${String(r.invoices?.invoice_number ?? '').padStart(4, '0')},${r.total_amount ?? 0},${(r.reason ?? '').replace(/,/g, ';')},${new Date(r.created_at).toLocaleDateString()}`
    )

    const summary = `\n\nSummary\nRep,${result.repName}\nMonth,${result.month} ${result.year}\nInvoices,${result.invoiceCount}\nReturns,${result.returnCount}\nTotal Sales,Rs. ${result.totalSales.toFixed(2)}\nTotal Returns,Rs. ${result.totalReturns.toFixed(2)}\nNet Sales,Rs. ${result.netSales.toFixed(2)}\nGross Commission (${(result.rate * 100).toFixed(2)}%),Rs. ${result.grossCommission.toFixed(2)}\nReturn Deduction,Rs. ${result.returnDeduction.toFixed(2)}\nNet Commission,Rs. ${result.commission.toFixed(2)}`

    const csv = invHeader + '\n' + invRows.join('\n') + retHeader + '\n' + retRows.join('\n') + summary
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `commission-${result.repName}-${result.month}-${result.year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fmt = (val) => `Rs. ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

  if (loadingReps) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-3 rounded-xl">
            <Calculator size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Commission Report</h1>
            <p className="text-slate-400 text-sm mt-0.5">Calculate commission for sales representatives (Munzir: 2.5%, Others: 1%)</p>
          </div>
        </div>
      </div>

      {/* Input Card */}
      <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              <UserCheck size={12} className="inline mr-1" />
              Sales Rep
            </label>
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="w-full border border-slate-300 dark:border-emerald-800/60 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white dark:bg-emerald-950/40"
            >
              <option value="">Select Rep</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              <Calendar size={12} className="inline mr-1" />
              Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full border border-slate-300 dark:border-emerald-800/60 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white dark:bg-emerald-950/40"
            >
              {months.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              <Calendar size={12} className="inline mr-1" />
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full border border-slate-300 dark:border-emerald-800/60 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white dark:bg-emerald-950/40"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={calculate}
            disabled={!selectedRep || loading}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Calculator size={16} />
            {loading ? 'Calculating...' : 'Calculate Commission'}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 shadow-lg">
              <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Sales Rep</div>
              <div className="mt-3 text-xl font-extrabold text-white">{result.repName}</div>
              <div className="mt-1 text-xs text-blue-100 font-medium">{result.month} {result.year}</div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 shadow-lg">
              <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Total Sales</div>
              <div className="mt-3 text-2xl font-extrabold text-white">{fmt(result.totalSales)}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-100 font-medium">
                <DollarSign size={12} />
                <span>{result.invoiceCount} invoices</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 shadow-lg">
              <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Returns Deduction</div>
              <div className="mt-3 text-2xl font-extrabold text-white">{fmt(result.totalReturns)}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-red-100 font-medium">
                <RotateCcw size={12} />
                <span>{result.returnCount} returns</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Net Sales</div>
              <div className="mt-3 text-2xl font-extrabold text-white">{fmt(result.netSales)}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-300 font-medium">
                <TrendingDown size={12} />
                <span>Sales − Returns</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 shadow-lg">
              <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Net Commission ({(result.rate * 100).toFixed(2)}%)</div>
              <div className="mt-3 text-2xl font-extrabold text-white">{fmt(result.commission)}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-amber-100 font-medium">
                <TrendingUp size={12} />
                <span>Gross {fmt(result.grossCommission)} − Deduct {fmt(result.returnDeduction)}</span>
              </div>
            </div>
          </div>

          {/* Invoice List */}
          <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
            <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-emerald-900/40">
              <div>
                <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Invoices Breakdown</div>
                <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">{result.invoiceCount} invoices for {result.month} {result.year}</div>
              </div>
              <button
                onClick={downloadCsv}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-300 dark:border-emerald-800/60 text-slate-700 dark:text-emerald-50 hover:bg-slate-50 dark:hover:bg-emerald-500/10 transition-colors"
              >
                <Download size={15} />
                Export CSV
              </button>
            </div>

            {result.invoiceCount === 0 ? (
              <div className="px-5 py-12 text-center text-slate-400 dark:text-emerald-100/60">
                <FileText size={32} className="mx-auto text-slate-300 dark:text-emerald-200/30 mb-2" />
                No invoices found for this period.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
                    <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Invoice #</th>
                    <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                    <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Total</th>
                    <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-emerald-50">INV-{String(inv.invoice_number ?? '').padStart(4, '0')}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-emerald-100/70">{inv.customers?.name ?? '-'}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-emerald-50">{fmt(inv.total_amount ?? 0)}</td>
                      <td className="px-5 py-3 text-slate-500 dark:text-emerald-100/60">{new Date(inv.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800 text-white">
                    <td className="px-5 py-3 font-bold text-sm uppercase tracking-wider" colSpan={2}>Total</td>
                    <td className="px-5 py-3 font-extrabold">{fmt(result.totalSales)}</td>
                    <td className="px-5 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Returns Breakdown */}
          <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
            <div className="p-5 border-b border-slate-100 dark:border-emerald-900/40">
              <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Returns Deduction Breakdown</div>
              <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">{result.returnCount} returns linked to this rep's invoices — commission deducted at {(result.rate * 100).toFixed(2)}%</div>
            </div>

            {result.returnCount === 0 ? (
              <div className="px-5 py-12 text-center text-slate-400 dark:text-emerald-100/60">
                <RotateCcw size={32} className="mx-auto text-slate-300 dark:text-emerald-200/30 mb-2" />
                No returns found for this period.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-red-50 border-b border-slate-200 dark:bg-red-950/20 dark:border-emerald-900/40">
                    <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Return #</th>
                    <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                    <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Original Invoice</th>
                    <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Refund Amount</th>
                    <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Commission Deducted</th>
                    <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Reason</th>
                    <th className="text-left font-semibold text-red-700 dark:text-red-300 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-red-50/30 transition-colors dark:border-emerald-900/30 dark:hover:bg-red-500/5">
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-emerald-50">RET-{String(r.return_number ?? '').padStart(4, '0')}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-emerald-100/70">{r.customers?.name ?? '-'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-emerald-100/70">INV-{String(r.invoices?.invoice_number ?? '').padStart(4, '0')}</td>
                      <td className="px-5 py-3 font-semibold text-red-600 dark:text-red-400">−{fmt(r.total_amount ?? 0)}</td>
                      <td className="px-5 py-3 font-semibold text-red-600 dark:text-red-400">−{fmt((r.total_amount ?? 0) * result.rate)}</td>
                      <td className="px-5 py-3 text-slate-500 dark:text-emerald-100/60 max-w-[200px] truncate">{r.reason || '—'}</td>
                      <td className="px-5 py-3 text-slate-500 dark:text-emerald-100/60">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-red-700 text-white">
                    <td className="px-5 py-3 font-bold text-sm uppercase tracking-wider" colSpan={3}>Total Returns Deduction</td>
                    <td className="px-5 py-3 font-extrabold">−{fmt(result.totalReturns)}</td>
                    <td className="px-5 py-3 font-extrabold">−{fmt(result.returnDeduction)}</td>
                    <td className="px-5 py-3"></td>
                    <td className="px-5 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Commission Calculation Summary */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
            <div className="text-base font-bold text-slate-900 dark:text-emerald-50 mb-4">Commission Calculation</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-emerald-900/40">
                <span className="text-slate-600 dark:text-emerald-100/70">Total Sales (from {result.invoiceCount} invoices)</span>
                <span className="font-semibold text-slate-900 dark:text-emerald-50">{fmt(result.totalSales)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-emerald-900/40">
                <span className="text-slate-600 dark:text-emerald-100/70">Gross Commission ({(result.rate * 100).toFixed(2)}% of sales)</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-300">{fmt(result.grossCommission)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-emerald-900/40">
                <span className="text-slate-600 dark:text-emerald-100/70">Returns Deduction ({(result.rate * 100).toFixed(2)}% of {fmt(result.totalReturns)} returned)</span>
                <span className="font-semibold text-red-600 dark:text-red-400">−{fmt(result.returnDeduction)}</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-4 mt-2">
                <span className="font-bold text-slate-900 dark:text-emerald-50">Net Commission Payable</span>
                <span className="text-xl font-extrabold text-amber-700 dark:text-amber-300">{fmt(result.commission)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

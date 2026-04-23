import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Calculator, UserCheck, Calendar, DollarSign, FileText, Download, TrendingUp } from 'lucide-react'

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

    const startDate = new Date(selectedYear, selectedMonth, 1).toISOString()
    const endDate = new Date(selectedYear, selectedMonth + 1, 1).toISOString()

    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, created_at, customers(name)')
      .eq('rep_id', selectedRep)
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    const invoiceList = data ?? []
    const totalSales = invoiceList.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0)
    const repName = reps.find(r => String(r.id) === String(selectedRep))?.name ?? 'N/A'
    const rate = repName.toLowerCase().includes('munzir') ? COMMISSION_RATES.munzir : COMMISSION_RATES.default
    const commission = totalSales * rate

    setResult({
      repName,
      month: months[selectedMonth],
      year: selectedYear,
      invoiceCount: invoiceList.length,
      totalSales,
      commission,
      rate,
    })

    setInvoices(invoiceList)
    setLoading(false)
  }

  const downloadCsv = () => {
    if (!result) return

    const header = 'Invoice #,Customer,Total Amount,Date'
    const rows = invoices.map(inv =>
      `INV-${String(inv.invoice_number ?? '').padStart(4, '0')},${inv.customers?.name ?? '-'},${inv.total_amount ?? 0},${new Date(inv.created_at).toLocaleDateString()}`
    )

    const summary = `\n\nSummary\nRep,${result.repName}\nMonth,${result.month} ${result.year}\nInvoices,${result.invoiceCount}\nTotal Sales,Rs. ${result.totalSales.toFixed(2)}\nCommission (${(result.rate * 100).toFixed(2)}%),Rs. ${result.commission.toFixed(2)}`

    const csv = header + '\n' + rows.join('\n') + summary
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
      <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              <UserCheck size={12} className="inline mr-1" />
              Sales Rep
            </label>
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
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
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
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
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 shadow-lg">
              <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Sales Rep</div>
              <div className="mt-3 text-xl font-extrabold text-white">{result.repName}</div>
              <div className="mt-1 text-xs text-blue-100 font-medium">{result.month} {result.year}</div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 shadow-lg">
              <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Total Invoices</div>
              <div className="mt-3 text-3xl font-extrabold text-white">{result.invoiceCount}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-100 font-medium">
                <FileText size={12} />
                <span>Invoices found</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Total Sales</div>
              <div className="mt-3 text-2xl font-extrabold text-white">{fmt(result.totalSales)}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-300 font-medium">
                <DollarSign size={12} />
                <span>Revenue</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 shadow-lg">
              <div className="text-xs font-semibold text-white uppercase tracking-wider opacity-90">Commission ({(result.rate * 100).toFixed(2)}%)</div>
              <div className="mt-3 text-2xl font-extrabold text-white">{fmt(result.commission)}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-amber-100 font-medium">
                <TrendingUp size={12} />
                <span>{(result.rate * 100).toFixed(2)}% rate</span>
              </div>
            </div>
          </div>

          {/* Invoice List */}
          <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 flex items-center justify-between border-b border-slate-100">
              <div>
                <div className="text-base font-bold text-slate-900">Invoices Breakdown</div>
                <div className="text-xs text-slate-400 mt-0.5">{result.invoiceCount} invoices for {result.month} {result.year}</div>
              </div>
              <button
                onClick={downloadCsv}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download size={15} />
                Export CSV
              </button>
            </div>

            {result.invoiceCount === 0 ? (
              <div className="px-5 py-12 text-center text-slate-400">
                <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                No invoices found for this period.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Invoice #</th>
                    <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                    <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Total</th>
                    <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-900">INV-{String(inv.invoice_number ?? '').padStart(4, '0')}</td>
                      <td className="px-5 py-3 text-slate-600">{inv.customers?.name ?? '-'}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{fmt(inv.total_amount ?? 0)}</td>
                      <td className="px-5 py-3 text-slate-500">{new Date(inv.created_at).toLocaleDateString()}</td>
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
        </>
      )}
    </div>
  )
}

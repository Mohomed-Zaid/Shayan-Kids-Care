import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Filter, Printer, RefreshCw, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useToast } from '../../contexts/ToastContext'
import { exportToPDF, LoadingSkeleton } from '../../components/reports'
import { buildDayBook, dayBookTotals, filterDayBook } from '../../lib/dayBook'
import logo from '../../pictures/logo.jpeg'

const TABLES = ['invoices', 'invoice_items', 'orders', 'order_items', 'purchases', 'purchase_items', 'invoice_payments', 'purchase_payments', 'returns', 'return_items', 'rep_payments', 'rep_commission_payments', 'commissions', 'customer_cheques', 'bank_reconciliation_items', 'journal_entries', 'journal_entry_lines', 'beginning_stock', 'beginning_stock_items', 'stock_adjustments', 'audit_logs', 'customers', 'vendors', 'employees', 'banks', 'products']
const MONEY = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 })
const money = (value) => MONEY.format(Number(value ?? 0))
const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 dark:border-emerald-400/20 dark:bg-slate-950 dark:text-emerald-50'
const defaultFilters = () => { const today = localDay(); return { preset: 'today', from: today, to: today, transactionType: '', customerId: '', vendorId: '', repId: '', paymentMethod: '', bank: '', user: '', reference: '', search: '', minAmount: '', maxAmount: '' } }

function presetDates(preset) {
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate()), end = new Date(start)
  if (preset === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1) }
  if (preset === 'all') return { from: '', to: '' }
  return { from: localDay(start), to: localDay(end) }
}

function Field({ label, children }) {
  return <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-emerald-100/60">{label}</span>{children}</label>
}

function Cards({ totals }) {
  const cards = [['Total Sales', totals.sales], ['Total Purchases', totals.purchases], ['Money Received', totals.moneyReceived], ['Money Paid', totals.moneyPaid], ['Net Cash Movement', totals.netCashMovement]]
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{cards.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-emerald-100/60">{label}</div><div className={`mt-1 text-lg font-black ${value < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-white'}`}>{money(value)}</div></div>)}</div>
}

function DetailPanel({ transaction }) {
  const details = transaction.details ?? []
  const keys = [...new Set(details.flatMap((item) => Object.keys(item)))]
  return <div className="space-y-3 bg-slate-50 p-4 text-sm dark:bg-emerald-950/40">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><div><b>Party:</b> {transaction.party}</div><div><b>Rep:</b> {transaction.repName || '-'}</div><div><b>Method:</b> {transaction.paymentMethod}</div><div><b>Bank:</b> {transaction.bank}</div><div><b>Status:</b> {transaction.status || '-'}</div></div>
    {details.length > 0 && <div className="overflow-auto"><table className="w-full min-w-max text-xs"><thead><tr>{keys.map((key) => <th key={key} className="border border-slate-200 bg-white p-2 text-left uppercase dark:border-emerald-400/20 dark:bg-slate-900">{key.replaceAll(/([A-Z])/g, ' $1')}</th>)}</tr></thead><tbody>{details.map((item, index) => <tr key={index}>{keys.map((key) => <td key={key} className="border border-slate-200 p-2 dark:border-emerald-400/20">{typeof item[key] === 'number' && /amount|total|value|price|cost|debit|credit/i.test(key) ? money(item[key]) : String(item[key] ?? '-')}</td>)}</tr>)}</tbody></table></div>}
  </div>
}

function PrintDocument({ rows, totals, filters, generatedBy }) {
  return <div id="day-book-print" className="bg-white p-6 text-slate-900">
    <header className="mb-5 flex items-center justify-between border-b-2 border-emerald-700 pb-4"><div className="flex items-center gap-4"><img src={logo} alt="Company logo" className="h-16 w-16 rounded object-cover"/><div><div className="text-2xl font-black">Shayan's Kids & Toys Store</div><div className="text-sm">Wholesale Management System - Sri Lanka</div></div></div><div className="text-right"><div className="text-2xl font-black text-emerald-800">DAY BOOK</div><div className="text-xs">{filters.from || 'Beginning'} to {filters.to || 'Present'}</div></div></header>
    <div className="mb-4 grid grid-cols-2 text-xs"><div><b>Date / Range:</b> {filters.from || 'All'} - {filters.to || 'All'}</div><div className="text-right"><b>Generated by:</b> {generatedBy}<br/><b>Generated:</b> {new Date().toLocaleString()}</div></div>
    <div className="mb-4 grid grid-cols-5 gap-2">{[['Sales', totals.sales], ['Purchases', totals.purchases], ['Money Received', totals.moneyReceived], ['Money Paid', totals.moneyPaid], ['Net Movement', totals.netCashMovement]].map(([label, value]) => <div key={label} className="border border-slate-300 p-2"><div className="text-[9px] uppercase text-slate-500">{label}</div><div className="font-bold">{money(value)}</div></div>)}</div>
    <table className="w-full border-collapse text-[8px]"><thead><tr>{['Date', 'Time', 'Transaction Type', 'Reference Number', 'Customer / Vendor / Rep', 'Description', 'Payment Method', 'Money In', 'Money Out', 'Amount', 'User'].map((heading) => <th key={heading} className="border border-slate-300 bg-slate-100 p-1 text-left">{heading}</th>)}</tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td className="border p-1">{item.date}</td><td className="border p-1">{item.time}</td><td className="border p-1">{item.transactionType}</td><td className="border p-1">{item.reference}</td><td className="border p-1">{item.party}</td><td className="border p-1">{item.description}</td><td className="border p-1">{item.paymentMethod}</td><td className="border p-1 text-right">{item.moneyIn ? money(item.moneyIn) : '-'}</td><td className="border p-1 text-right">{item.moneyOut ? money(item.moneyOut) : '-'}</td><td className="border p-1 text-right">{money(item.amount)}</td><td className="border p-1">{item.user}</td></tr>)}</tbody></table>
    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">{[['Sales Total', totals.sales], ['Purchase Total', totals.purchases], ['Returns Total', totals.returns], ['Money Received', totals.moneyReceived], ['Money Paid', totals.moneyPaid], ['Net Cash Movement', totals.netCashMovement], ['Receivable Payments', totals.receivablePayments], ['Vendor Payments', totals.vendorPayments], ['Rep Payments', totals.repPayments], ['Cheque Receipts', totals.chequeReceipts]].map(([label, value]) => <div key={label} className="flex justify-between border-b p-1"><b>{label}</b><span>{money(value)}</span></div>)}</div>
  </div>
}

export default function DayBookReportPage() {
  const toast = useToast()
  const { user } = useAuth()
  const { can, isSuperAdmin, record } = usePermissions()
  const canPrint = isSuperAdmin || can('reports_day_book', 'print')
  const canExport = isSuperAdmin || can('reports_day_book', 'export')
  const [raw, setRaw] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(defaultFilters)
  const [filters, setFilters] = useState(defaultFilters)
  const [sort, setSort] = useState({ key: 'dateTime', direction: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [expanded, setExpanded] = useState('')

  const loadTable = async (table) => {
    const rows = []
    for (let from = 0; ; from += 1000) {
      const result = await supabase.from(table).select('*').range(from, from + 999)
      if (result.error) return { table, data: [], error: result.error }
      rows.push(...(result.data ?? []))
      if ((result.data ?? []).length < 1000) return { table, data: rows, error: null }
    }
  }
  const load = async () => {
    setLoading(true)
    const results = await Promise.all(TABLES.map(loadTable))
    const next = {}, failed = []
    results.forEach((result) => { next[result.table] = result.data; if (result.error) failed.push(`${result.table}: ${result.error.message}`) })
    setRaw(next); setWarnings(failed); setLoading(false)
  }
  useEffect(() => { load().catch((error) => { toast.error(error.message ?? 'Unable to load Day Book'); setLoading(false) }) }, [])

  const transactions = useMemo(() => raw ? buildDayBook(raw) : [], [raw])
  const filtered = useMemo(() => filterDayBook(transactions, filters), [transactions, filters])
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const left = a[sort.key] ?? '', right = b[sort.key] ?? ''
    const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
    return sort.direction === 'asc' ? comparison : -comparison
  }), [filtered, sort])
  const totals = useMemo(() => dayBookTotals(sorted), [sorted])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)
  const types = [...new Set(transactions.map((item) => item.transactionType))].sort()
  const methods = [...new Set(transactions.map((item) => item.paymentMethod).filter((value) => value && value !== '-'))].sort()
  const bankNames = [...new Set(transactions.map((item) => item.bank).filter((value) => value && value !== '-'))].sort()
  const users = [...new Set(transactions.map((item) => item.user).filter((value) => value && value !== '-'))].sort()
  const generatedBy = record?.display_name || user?.email || 'System User'
  const columns = [['date', 'Date'], ['time', 'Time'], ['transactionType', 'Transaction Type'], ['reference', 'Reference Number'], ['party', 'Customer / Vendor / Rep'], ['description', 'Description'], ['paymentMethod', 'Payment Method'], ['moneyIn', 'Money In'], ['moneyOut', 'Money Out'], ['amount', 'Amount'], ['user', 'User']]

  const exportRows = () => sorted.map((item) => ({ Date: item.date, Time: item.time, 'Transaction Type': item.transactionType, 'Reference Number': item.reference, 'Customer / Vendor / Rep': item.party, Description: item.description, 'Payment Method': item.paymentMethod, Bank: item.bank, 'Money In': item.moneyIn, 'Money Out': item.moneyOut, Amount: item.amount, User: item.user }))
  const exportExcel = () => { const sheet = XLSX.utils.json_to_sheet(exportRows()), book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Day Book'); XLSX.writeFile(book, `day-book-${filters.from || 'all'}-${filters.to || 'all'}.xlsx`) }
  const exportCsv = () => { const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(exportRows())), blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `day-book-${filters.from || 'all'}-${filters.to || 'all'}.csv`; link.click(); URL.revokeObjectURL(link.href) }
  const print = () => { const content = document.getElementById('day-book-print')?.outerHTML; if (!content) return; const win = window.open('', '_blank'); win.document.write(`<html><head><title>Day Book</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial;color:#0f172a}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:4px;font-size:9px}img{width:60px}</style></head><body>${content}</body></html>`); win.document.close(); win.print() }

  if (loading) return <LoadingSkeleton/>
  return <div className="space-y-5 text-slate-800 dark:text-emerald-50">
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><h1 className="text-2xl font-black text-slate-900 dark:text-white">Day Book</h1><p className="mt-1 text-sm text-slate-500 dark:text-emerald-100/70">Every important daily transaction in one chronological report.</p></div><div className="flex flex-wrap gap-2">{canPrint && <><button onClick={print} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-emerald-400/20"><Printer size={16}/> Print</button><button onClick={() => exportToPDF('day-book-print', `day-book-${filters.from}-${filters.to}.pdf`, { orientation: 'landscape', pageNumbers: true })} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-emerald-400/20"><Download size={16}/> PDF</button></>}{canExport && <><button onClick={exportExcel} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><FileSpreadsheet size={16}/> Excel</button><button onClick={exportCsv} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-emerald-400/20">CSV</button></>}</div></div></div>
    {warnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">Some optional transaction sources are unavailable: {warnings.join(' | ')}</div>}
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="mb-3 flex items-center gap-2 text-sm font-bold"><Filter size={16}/> Filters</div><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      <Field label="Date"><select className={inputClass} value={draft.preset} onChange={(event) => { const preset = event.target.value; setDraft((old) => ({ ...old, preset, ...presetDates(preset) })) }}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="specific">Specific Date</option><option value="custom">Custom Range</option><option value="all">All Dates</option></select></Field>
      <Field label="From"><input type="date" className={inputClass} value={draft.from} onChange={(event) => setDraft((old) => ({ ...old, preset: old.preset === 'specific' ? 'specific' : 'custom', from: event.target.value, ...(old.preset === 'specific' ? { to: event.target.value } : {}) }))}/></Field>
      <Field label="To"><input type="date" className={inputClass} value={draft.to} onChange={(event) => setDraft((old) => ({ ...old, preset: 'custom', to: event.target.value }))}/></Field>
      <Field label="Transaction Type"><select className={inputClass} value={draft.transactionType} onChange={(event) => setDraft((old) => ({ ...old, transactionType: event.target.value }))}><option value="">All Types</option>{types.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Customer"><select className={inputClass} value={draft.customerId} onChange={(event) => setDraft((old) => ({ ...old, customerId: event.target.value }))}><option value="">All Customers</option>{(raw?.customers ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Vendor"><select className={inputClass} value={draft.vendorId} onChange={(event) => setDraft((old) => ({ ...old, vendorId: event.target.value }))}><option value="">All Vendors</option>{(raw?.vendors ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Rep"><select className={inputClass} value={draft.repId} onChange={(event) => setDraft((old) => ({ ...old, repId: event.target.value }))}><option value="">All Reps</option>{(raw?.employees ?? []).filter((item) => item.is_rep !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Payment Method"><select className={inputClass} value={draft.paymentMethod} onChange={(event) => setDraft((old) => ({ ...old, paymentMethod: event.target.value }))}><option value="">All Methods</option>{methods.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Bank"><select className={inputClass} value={draft.bank} onChange={(event) => setDraft((old) => ({ ...old, bank: event.target.value }))}><option value="">All Banks</option>{bankNames.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="User"><select className={inputClass} value={draft.user} onChange={(event) => setDraft((old) => ({ ...old, user: event.target.value }))}><option value="">All Users</option>{users.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Reference Number"><input className={inputClass} value={draft.reference} onChange={(event) => setDraft((old) => ({ ...old, reference: event.target.value }))} placeholder="Reference"/></Field>
      <Field label="Search"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className={`${inputClass} pl-9`} value={draft.search} onChange={(event) => setDraft((old) => ({ ...old, search: event.target.value }))} placeholder="Search transactions"/></div></Field>
    </div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => { setFilters(draft); setPage(1); setExpanded('') }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Apply Filters</button><button onClick={() => { const blank = defaultFilters(); setDraft(blank); setFilters(blank); setPage(1); setExpanded('') }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-emerald-400/20">Reset Filters</button><button onClick={load} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-emerald-400/20"><RefreshCw size={15}/> Refresh</button></div></div>
    <Cards totals={totals}/>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="overflow-auto"><table className="w-full min-w-[1500px] text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-emerald-950/60 dark:text-emerald-100/60"><tr><th className="w-10 p-3"></th>{columns.map(([key, heading]) => <th key={key} onClick={() => setSort((old) => ({ key, direction: old.key === key && old.direction === 'asc' ? 'desc' : 'asc' }))} className={`cursor-pointer whitespace-nowrap p-3 text-left ${['moneyIn', 'moneyOut', 'amount'].includes(key) ? 'text-right' : ''}`}>{heading}{sort.key === key ? (sort.direction === 'asc' ? ' ASC' : ' DESC') : ''}</th>)}</tr></thead><tbody>{pageRows.length ? pageRows.map((item) => <React.Fragment key={item.id}><tr onClick={() => setExpanded((value) => value === item.id ? '' : item.id)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-emerald-400/10 dark:hover:bg-emerald-500/5"><td className="p-3">{expanded === item.id ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</td><td className="whitespace-nowrap p-3">{item.date}</td><td className="whitespace-nowrap p-3">{item.time}</td><td className="whitespace-nowrap p-3 font-semibold">{item.transactionType}</td><td className="whitespace-nowrap p-3">{item.reference}</td><td className="p-3">{item.party}</td><td className="p-3">{item.description}</td><td className="whitespace-nowrap p-3">{item.paymentMethod}</td><td className="whitespace-nowrap p-3 text-right font-semibold text-emerald-700 dark:text-emerald-300">{item.moneyIn ? money(item.moneyIn) : '-'}</td><td className="whitespace-nowrap p-3 text-right font-semibold text-rose-700 dark:text-rose-300">{item.moneyOut ? money(item.moneyOut) : '-'}</td><td className="whitespace-nowrap p-3 text-right font-semibold">{money(item.amount)}</td><td className="whitespace-nowrap p-3">{item.user}</td></tr>{expanded === item.id && <tr><td colSpan={12}><DetailPanel transaction={item}/></td></tr>}</React.Fragment>) : <tr><td colSpan={12} className="p-10 text-center text-slate-500 dark:text-emerald-100/60">No transactions match this date and filter selection.</td></tr>}</tbody></table></div></div>
    <div className="grid gap-4 xl:grid-cols-[1fr_auto]"><div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-emerald-400/20 dark:bg-emerald-950/30 md:grid-cols-5">{[['Sales Total', totals.sales], ['Purchase Total', totals.purchases], ['Returns Total', totals.returns], ['Money Received', totals.moneyReceived], ['Money Paid', totals.moneyPaid], ['Net Cash Movement', totals.netCashMovement], ['Receivable Payments', totals.receivablePayments], ['Vendor Payments', totals.vendorPayments], ['Rep Payments', totals.repPayments], ['Cheque Receipts', totals.chequeReceipts]].map(([label, value]) => <div key={label} className="border-b border-slate-100 py-2 dark:border-emerald-400/10"><div className="text-[10px] font-bold uppercase text-slate-500 dark:text-emerald-100/60">{label}</div><div className="font-bold">{money(value)}</div></div>)}</div><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><select className={inputClass} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option value="10">10 rows</option><option value="25">25 rows</option><option value="50">50 rows</option><option value="100">100 rows</option></select><button disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40 dark:border-emerald-400/20">Previous</button><span className="whitespace-nowrap">{safePage} / {totalPages}</span><button disabled={safePage >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40 dark:border-emerald-400/20">Next</button></div></div>
    <div className="text-xs text-slate-500 dark:text-emerald-100/60">Showing {sorted.length ? (safePage - 1) * pageSize + 1 : 0}-{Math.min(safePage * pageSize, sorted.length)} of {sorted.length} transactions. Click any row for details.</div>
    <div className="fixed -left-[10000px] top-0 w-[1400px]"><PrintDocument rows={sorted} totals={totals} filters={filters} generatedBy={generatedBy}/></div>
  </div>
}

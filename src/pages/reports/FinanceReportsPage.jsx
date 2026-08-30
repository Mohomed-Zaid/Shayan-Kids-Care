import React, { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Download, FileSpreadsheet, Filter, Printer, RefreshCw, Search, Settings2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useToast } from '../../contexts/ToastContext'
import logo from '../../pictures/logo.jpeg'
import { exportToPDF, LoadingSkeleton } from '../../components/reports'
import { buildFinanceReports, financeDashboard, FINANCE_REPORTS, REPORT_COLUMNS, reportSummary } from '../../lib/financeReports'

const TABLES = ['invoices', 'invoice_items', 'invoice_payments', 'purchases', 'purchase_items', 'product_variants', 'products', 'purchase_payments', 'customers', 'vendors', 'banks', 'customer_cheques', 'bank_reconciliation_items', 'journals', 'journal_categories', 'journal_entries', 'journal_entry_lines', 'expenses', 'user_privileges', 'rep_commission_payments', 'rep_payments', 'returns', 'return_items', 'employees', 'audit_logs']
const MONEY = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 })
const money = (value) => MONEY.format(Number(value ?? 0))
const formatDate = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString() : '-'
const dateKey = (value) => value ? String(value).slice(0, 10) : ''
const today = () => new Date().toISOString().slice(0, 10)

function presetDates(preset) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  if (preset === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1) }
  if (preset === 'this-week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  if (preset === 'this-month') start.setDate(1)
  if (preset === 'last-month') { start.setMonth(start.getMonth() - 1, 1); end.setDate(0) }
  if (preset === 'this-year') { start.setMonth(0, 1); end.setMonth(11, 31) }
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

const defaultFilters = () => ({ preset: 'this-month', ...presetDates('this-month'), customerId: '', vendorId: '', bank: '', method: '', status: '', repId: '', accountId: '', transactionType: '', minAmount: '', maxAmount: '', createdBy: '' })

function profitLossPeriodRaw(raw, from, to) {
  return { ...raw, profitLossRange: { from, to } }
}

function SummaryGrid({ items, compact = false }) {
  return <div className={`grid gap-3 ${compact ? 'grid-cols-2 md:grid-cols-4 xl:grid-cols-6' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6'}`}>
    {items.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-emerald-100/60">{label}</div>
      <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">{typeof value === 'number' && !label.toLowerCase().includes('count') && !label.toLowerCase().includes('limit') && label !== 'Total Lines' ? money(value) : Number(value ?? 0).toLocaleString()}</div>
    </div>)}
  </div>
}

function FilterField({ label, children }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-emerald-100/60">{label}</span>{children}</label>
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 dark:border-emerald-400/20 dark:bg-slate-950 dark:text-white'

function PrintDocument({ report, columns, rows, summary, filters, generatedBy }) {
  const filterText = [filters.customerId && 'Customer selected', filters.vendorId && 'Vendor selected', filters.bank && `Bank: ${filters.bank}`, filters.method && `Method: ${filters.method}`, filters.status && `Status: ${filters.status}`, filters.repId && 'Rep selected', filters.accountId && 'Account selected'].filter(Boolean).join(' â€¢ ') || 'No additional filters'
  return <div id="finance-report-print" className="bg-white p-6 text-slate-900">
    <header className="mb-5 flex items-center justify-between border-b-2 border-emerald-700 pb-4">
      <div className="flex items-center gap-4"><img src={logo} className="h-16 w-16 rounded object-cover" alt="Company logo"/><div><div className="text-2xl font-black">Shayan's Kids & Toys Store</div><div className="text-sm">Wholesale Management System â€¢ Sri Lanka</div></div></div>
      <div className="text-right"><div className="text-xl font-black text-emerald-800">{report.title}</div><div className="text-xs">{formatDate(filters.from)} â€“ {formatDate(filters.to)}</div></div>
    </header>
    <div className="mb-4 grid grid-cols-2 gap-2 text-xs"><div><b>Applied filters:</b> {filterText}</div><div className="text-right"><b>Generated by:</b> {generatedBy}<br/><b>Generated:</b> {new Date().toLocaleString()}</div></div>
    <div className="mb-4 grid grid-cols-4 gap-2">{summary.map(([label, value]) => <div key={label} className="border border-slate-300 p-2"><div className="text-[10px] uppercase text-slate-500">{label}</div><div className="font-bold">{typeof value === 'number' ? money(value) : value}</div></div>)}</div>
    <table className="w-full border-collapse text-[9px]"><thead><tr>{columns.map(([key, label]) => <th key={key} className="border border-slate-300 bg-slate-100 p-1 text-left">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index}>{columns.map(([key, , type]) => <td key={key} className="border border-slate-200 p-1">{type === 'money' ? money(row[key]) : type === 'date' ? formatDate(row[key]) : String(row[key] ?? '-')}</td>)}</tr>)}</tbody></table>
    <footer className="mt-4 border-t pt-2 text-center text-[10px] text-slate-500">Generated from live financial records â€¢ Shayan's Kids Finance Reports</footer>
  </div>
}

export default function FinanceReportsPage({ initialMode = '' }) {
  const toast = useToast()
  const { user } = useAuth()
  const { can, isSuperAdmin, record } = usePermissions()
  const allowedReports = useMemo(() => FINANCE_REPORTS.filter((report) => isSuperAdmin || can('reports_finance', report.permission)), [can, isSuperAdmin])
  const [active, setActive] = useState(() => allowedReports.some((report) => report.key === initialMode) ? initialMode : allowedReports[0]?.key ?? 'receivables')
  const [raw, setRaw] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [draftFilters, setDraftFilters] = useState(defaultFilters)
  const [filters, setFilters] = useState(defaultFilters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' })
  const [visible, setVisible] = useState({})
  const [showColumns, setShowColumns] = useState(false)

  const load = async () => {
    setLoading(true)
    const results = await Promise.all(TABLES.map(async (table) => ({ table, ...(await supabase.from(table).select('*')) })))
    const next = {}
    const failed = []
    results.forEach(({ table, data, error }) => { next[table] = data ?? []; if (error && !['rep_payments', 'rep_commission_payments', 'expenses', 'user_privileges', 'journal_categories', 'purchase_items', 'product_variants', 'products'].includes(table)) failed.push(`${table}: ${error.message}`) })
    setRaw(next)
    setWarnings(failed)
    setLoading(false)
  }
  useEffect(() => { load().catch((error) => { toast.error(error.message ?? 'Failed to load finance reports'); setLoading(false) }) }, [])
  useEffect(() => { if (!allowedReports.some((r) => r.key === active)) setActive(allowedReports[0]?.key ?? '') }, [allowedReports, active])

  const reports = useMemo(() => raw ? buildFinanceReports(raw) : null, [raw])
  const periodProfitLoss = useMemo(() => raw ? buildFinanceReports(profitLossPeriodRaw(raw, filters.from, filters.to))['profit-loss'] : [], [raw, filters.from, filters.to])
  const report = allowedReports.find((r) => r.key === active) ?? allowedReports[0]
  const allRows = report?.key === 'profit-loss' ? periodProfitLoss : reports?.[report?.key] ?? []
  const options = useMemo(() => ({
    customers: raw?.customers ?? [], vendors: raw?.vendors ?? [], banks: raw?.banks ?? [], reps: (raw?.employees ?? []).filter((r) => r.is_rep !== false), accounts: raw?.journals ?? [],
    methods: [...new Set(allRows.map((r) => r.method).filter((x) => x && x !== '-'))], statuses: [...new Set(allRows.map((r) => r.status ?? r.reconciled).filter(Boolean))],
    transactionTypes: [...new Set(allRows.map((r) => r.transactionType).filter(Boolean))], creators: [...new Set(allRows.map((r) => r.createdBy).filter((x) => x && x !== '-'))],
  }), [raw, allRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = allRows.filter((row) => {
      const date = dateKey(row.date)
      const dated = !date || ((!filters.from || date >= filters.from) && (!filters.to || date <= filters.to))
      const amount = Number(row.amount ?? row.outstanding ?? row.amountPaid ?? 0)
      return dated && (!q || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(q))) &&
        (!filters.customerId || String(row.customerId) === filters.customerId) && (!filters.vendorId || String(row.vendorId) === filters.vendorId) &&
        (!filters.bank || String(row.bankId ?? row.bank) === filters.bank || row.bank === filters.bank) && (!filters.method || row.method === filters.method) &&
        (!filters.status || row.status === filters.status || row.reconciled === filters.status) && (!filters.repId || String(row.repId) === filters.repId) &&
        (!filters.accountId || String(row.accountId) === filters.accountId) && (!filters.transactionType || row.transactionType === filters.transactionType) &&
        (filters.minAmount === '' || amount >= Number(filters.minAmount)) && (filters.maxAmount === '' || amount <= Number(filters.maxAmount)) &&
        (!filters.createdBy || row.createdBy === filters.createdBy)
    })
    const { key, direction } = sort
    rows = [...rows].sort((a, b) => { const av = a[key] ?? ''; const bv = b[key] ?? ''; const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true }); return direction === 'asc' ? result : -result })
    return rows
  }, [allRows, filters, search, sort])

  const columns = REPORT_COLUMNS[report?.key] ?? []
  const shownColumns = columns.filter(([key]) => visible[key] !== false)
  const summary = useMemo(() => report ? reportSummary(report.key, filteredRows) : [], [report, filteredRows])
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)
  const generatedBy = record?.display_name ?? user?.email ?? 'Authenticated user'
  const canExport = isSuperAdmin || can('reports_finance', 'export')
  const canPrint = isSuperAdmin || can('reports_finance', 'print')

  const changeActive = (key) => { setActive(key); setPage(1); setSearch(''); setVisible({}); setSort({ key: 'date', direction: 'desc' }) }
  const applyFilters = () => { setFilters(draftFilters); setPage(1) }
  const resetFilters = () => { const next = defaultFilters(); setDraftFilters(next); setFilters(next); setSearch(''); setPage(1) }
  const setPreset = (preset) => setDraftFilters((old) => ({ ...old, preset, ...(preset === 'custom' ? {} : presetDates(preset)) }))
  const toggleSort = (key) => setSort((old) => ({ key, direction: old.key === key && old.direction === 'asc' ? 'desc' : 'asc' }))
  const exportRows = (kind) => {
    if (!canExport) return toast.error('Export permission is required')
    const data = filteredRows.map((row) => Object.fromEntries(shownColumns.map(([key, label, type]) => [label, type === 'date' ? formatDate(row[key]) : row[key] ?? ''])))
    if (kind === 'csv') { const sheet = XLSX.utils.json_to_sheet(data); const csv = XLSX.utils.sheet_to_csv(sheet); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${report.key}-${today()}.csv`; a.click(); URL.revokeObjectURL(url); return }
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), report.title.slice(0, 31)); XLSX.writeFile(workbook, `${report.key}-${today()}.xlsx`)
  }
  const printReport = () => {
    if (!canPrint) return toast.error('Print permission is required')
    const node = document.getElementById('finance-report-print')
    const popup = window.open('', '_blank', 'width=1200,height=800')
    if (!popup || !node) return toast.error('Allow popups to print reports')
    popup.document.write(`<html><head><title>${report.title}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial;color:#0f172a}table{width:100%;border-collapse:collapse;font-size:8px}th,td{border:1px solid #cbd5e1;padding:3px}img{width:60px;height:60px;object-fit:cover}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.flex{display:flex}.items-center{align-items:center}.justify-between{justify-content:space-between}.gap-4{gap:16px}.text-right{text-align:right}.text-center{text-align:center}.font-bold,.font-black{font-weight:700}.text-2xl{font-size:22px}.text-xl{font-size:18px}.text-xs,.text-\[10px\],.text-\[9px\]{font-size:9px}.mb-4,.mb-5{margin-bottom:12px}.mt-4{margin-top:12px}.p-1{padding:3px}.p-2{padding:6px}.pb-4{padding-bottom:12px}.pt-2{padding-top:6px}.border{border:1px solid #cbd5e1}.border-b-2{border-bottom:2px solid #047857}.border-t{border-top:1px solid #cbd5e1}.bg-slate-100{background:#f1f5f9}</style></head><body>${node.innerHTML}<script>window.onload=()=>{window.print();window.close()}</script></body></html>`)
    popup.document.close()
  }
  const pdfReport = () => { if (!canExport) return toast.error('Export permission is required'); exportToPDF('finance-report-print', `${report.key}-${today()}.pdf`, { orientation: 'landscape', margin: 0.25, scale: 1.5 }) }

  if (loading || !reports) return <LoadingSkeleton />
  if (!report) return <div className="rounded-xl bg-rose-50 p-6 text-rose-700">Finance Reports permission is required.</div>

  const trialDifference = report.key === 'trial-balance' ? Number(summary.find(([label]) => label === 'Difference')?.[1] ?? 0) : 0
  return <div className="space-y-5">
    <header className="rounded-lg border border-slate-200 bg-white p-4 dark:border-emerald-400/20 dark:bg-emerald-950/30">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Finance reports</p><h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">Finance Reports</h1><p className="mt-0.5 text-sm text-slate-500 dark:text-emerald-100/70">Receivables, payables, banking, accounting, profit and cash flow detail.</p></div><button onClick={load} className="inline-flex items-center gap-2 self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-emerald-400/20 dark:text-emerald-100 dark:hover:bg-emerald-900"><RefreshCw size={15}/>Refresh data</button></div>
    </header>

    <SummaryGrid items={financeDashboard(reports).filter(([label]) => ['Total Receivables', 'Total Payables', 'Bank Balance', 'Gross Profit'].includes(label))} compact />
    {warnings.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><summary className="cursor-pointer font-bold">Some optional data sources were unavailable ({warnings.length})</summary><ul className="mt-2 list-disc pl-5">{warnings.map((x) => <li key={x}>{x}</li>)}</ul></details>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="flex min-w-max gap-1">{allowedReports.map((item) => <button key={item.key} onClick={() => changeActive(item.key)} className={`rounded-lg px-3 py-2 text-xs font-bold ${item.key === report.key ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-emerald-100/70 dark:hover:bg-emerald-500/10'}`}>{item.title}</button>)}</div></div>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-900 dark:text-white">{report.title}</h2><p className="text-xs text-slate-500">Filters and exports always apply to the full result set.</p></div><div className="flex flex-wrap gap-2">
        <button disabled={!canPrint} onClick={printReport} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40"><Printer size={15}/>Print</button>
        <button disabled={!canExport} onClick={pdfReport} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40"><Download size={15}/>PDF</button>
        <button disabled={!canExport} onClick={() => exportRows('xlsx')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"><FileSpreadsheet size={15}/>Excel</button>
        <button disabled={!canExport} onClick={() => exportRows('csv')} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40">CSV</button>
      </div></div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <FilterField label="Date preset"><select className={inputClass} value={draftFilters.preset} onChange={(e) => setPreset(e.target.value)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="this-week">This Week</option><option value="this-month">This Month</option><option value="last-month">Last Month</option><option value="this-year">This Year</option><option value="custom">Custom Range</option></select></FilterField>
        <FilterField label="From"><input className={inputClass} type="date" value={draftFilters.from} onChange={(e) => setDraftFilters((f) => ({ ...f, from: e.target.value, preset: 'custom' }))}/></FilterField>
        <FilterField label="To"><input className={inputClass} type="date" value={draftFilters.to} onChange={(e) => setDraftFilters((f) => ({ ...f, to: e.target.value, preset: 'custom' }))}/></FilterField>
        <FilterField label="Customer"><select className={inputClass} value={draftFilters.customerId} onChange={(e) => setDraftFilters((f) => ({ ...f, customerId: e.target.value }))}><option value="">All</option>{options.customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FilterField>
        <FilterField label="Vendor"><select className={inputClass} value={draftFilters.vendorId} onChange={(e) => setDraftFilters((f) => ({ ...f, vendorId: e.target.value }))}><option value="">All</option>{options.vendors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FilterField>
        <FilterField label="Bank"><select className={inputClass} value={draftFilters.bank} onChange={(e) => setDraftFilters((f) => ({ ...f, bank: e.target.value }))}><option value="">All</option>{options.banks.map((x) => <option key={x.id} value={String(x.id)}>{x.code ? `${x.code} - ` : ''}{x.name}</option>)}</select></FilterField>
        <FilterField label="Payment Method"><select className={inputClass} value={draftFilters.method} onChange={(e) => setDraftFilters((f) => ({ ...f, method: e.target.value }))}><option value="">All</option>{options.methods.map((x) => <option key={x}>{x}</option>)}</select></FilterField>
        <FilterField label="Status"><select className={inputClass} value={draftFilters.status} onChange={(e) => setDraftFilters((f) => ({ ...f, status: e.target.value }))}><option value="">All</option>{options.statuses.map((x) => <option key={x}>{x}</option>)}</select></FilterField>
        <FilterField label="Rep"><select className={inputClass} value={draftFilters.repId} onChange={(e) => setDraftFilters((f) => ({ ...f, repId: e.target.value }))}><option value="">All</option>{options.reps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FilterField>
        <FilterField label="Journal Account"><select className={inputClass} value={draftFilters.accountId} onChange={(e) => setDraftFilters((f) => ({ ...f, accountId: e.target.value }))}><option value="">All</option>{options.accounts.map((x) => <option key={x.id} value={x.id}>{x.code} - {x.description ?? x.name}</option>)}</select></FilterField>
        <FilterField label="Transaction Type"><select className={inputClass} value={draftFilters.transactionType} onChange={(e) => setDraftFilters((f) => ({ ...f, transactionType: e.target.value }))}><option value="">All</option>{options.transactionTypes.map((x) => <option key={x}>{x}</option>)}</select></FilterField>
        <FilterField label="Created By"><select className={inputClass} value={draftFilters.createdBy} onChange={(e) => setDraftFilters((f) => ({ ...f, createdBy: e.target.value }))}><option value="">All</option>{options.creators.map((x) => <option key={x}>{x}</option>)}</select></FilterField>
        <FilterField label="Minimum Amount"><input className={inputClass} type="number" min="0" value={draftFilters.minAmount} onChange={(e) => setDraftFilters((f) => ({ ...f, minAmount: e.target.value }))}/></FilterField>
        <FilterField label="Maximum Amount"><input className={inputClass} type="number" min="0" value={draftFilters.maxAmount} onChange={(e) => setDraftFilters((f) => ({ ...f, maxAmount: e.target.value }))}/></FilterField>
        <div className="col-span-2 flex items-end gap-2"><button onClick={applyFilters} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white"><Filter size={15}/>Apply Filters</button><button onClick={resetFilters} className="rounded-lg border px-3 py-2 text-sm font-bold">Reset</button></div>
      </div>

      <SummaryGrid items={summary.slice(0, 5)}/>
      {trialDifference > 0.005 && <div className="mt-3 rounded-lg bg-rose-50 p-3 font-bold text-rose-700">Trial Balance is out of balance.</div>}

      <div className="mt-5 flex flex-wrap items-center gap-3"><div className="relative min-w-[240px] flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className={`${inputClass} pl-9`} placeholder="Search all report columns..."/></div><div className="relative"><button onClick={() => setShowColumns((v) => !v)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><Settings2 size={15}/>Columns <ChevronDown size={14}/></button>{showColumns && <div className="absolute right-0 z-20 mt-2 max-h-80 w-64 overflow-y-auto rounded-xl border bg-white p-2 shadow-xl dark:border-emerald-400/20 dark:bg-slate-950">{columns.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"><input type="checkbox" checked={visible[key] !== false} onChange={(e) => setVisible((v) => ({ ...v, [key]: e.target.checked }))}/>{label}</label>)}</div>}</div></div>

      <div className="mt-4 max-h-[68vh] overflow-auto rounded-lg border border-slate-200 dark:border-emerald-400/20"><table className="min-w-full whitespace-nowrap text-sm"><thead className="sticky top-0 z-20 bg-slate-50 dark:bg-emerald-950"><tr>{shownColumns.map(([key, label, type]) => <th key={key} onClick={() => toggleSort(key)} className={`cursor-pointer px-3 py-3 text-[11px] font-black uppercase tracking-wide text-slate-500 ${type === 'money' ? 'text-right' : 'text-left'}`}>{label}{sort.key === key ? (sort.direction === 'asc' ? ' â†‘' : ' â†“') : ''}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-emerald-400/10">{pageRows.map((row, index) => <tr key={row.id ?? index} className="hover:bg-slate-50 dark:hover:bg-emerald-500/5">{shownColumns.map(([key, , type]) => <td key={key} className={`px-3 py-2.5 tabular-nums text-slate-700 dark:text-emerald-50 ${type === 'money' ? 'text-right font-semibold' : ''}`}>{type === 'money' ? money(row[key]) : type === 'date' ? formatDate(row[key]) : String(row[key] ?? '-')}</td>)}</tr>)}{pageRows.length === 0 && <tr><td colSpan={shownColumns.length} className="p-10 text-center text-slate-500">No rows match the applied filters.</td></tr>}</tbody></table></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-emerald-100/70"><div>Showing {filteredRows.length ? (page - 1) * pageSize + 1 : 0}â€“{Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length}</div><div className="flex items-center gap-2"><select className={inputClass} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}><option>10</option><option>25</option><option>50</option><option>100</option></select><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><span>{page} / {totalPages}</span><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></div></div>
    </section>
    <div className="fixed left-[-10000px] top-0 w-[1500px]"><PrintDocument report={report} columns={shownColumns} rows={filteredRows} summary={summary.slice(0, 5)} filters={filters} generatedBy={generatedBy}/></div>
  </div>
}

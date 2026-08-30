import React, { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Download, FileSpreadsheet, Filter, Printer, RefreshCw, Search, Settings2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useToast } from '../../contexts/ToastContext'
import { exportToPDF, LoadingSkeleton } from '../../components/reports'
import { buildFinanceReports } from '../../lib/financeReports'
import { buildExpenseRows, EXPENSE_COLUMNS, EXPENSE_REPORTS, expenseSummary, expenseVsSales, filterExpenses, groupExpenses, monthlyExpenses } from '../../lib/expenseReports'
import logo from '../../pictures/logo.jpeg'

const TABLES = ['expenses', 'banks', 'user_privileges', 'journals', 'journal_categories', 'journal_entries', 'journal_entry_lines', 'invoices', 'invoice_items', 'returns', 'employees', 'rep_commission_payments', 'rep_payments']
const MONEY = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 })
const money = (value) => MONEY.format(Number(value ?? 0))
const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const displayDate = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString() : '-'
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 dark:border-emerald-400/20 dark:bg-slate-950 dark:text-emerald-50'

function presetDates(preset) {
  if (preset === 'all') return { from: '', to: '' }
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate()), end = new Date(start)
  if (preset === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1) }
  if (preset === 'this-week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  if (preset === 'this-month') start.setDate(1)
  if (preset === 'last-month') { start.setMonth(start.getMonth() - 1, 1); end.setDate(0) }
  if (preset === 'this-year') { start.setMonth(0, 1); end.setMonth(11, 31) }
  return { from: localDay(start), to: localDay(end) }
}
const defaultFilters = () => ({ preset: 'this-month', ...presetDates('this-month'), category: '', paymentMethod: '', bankId: '', createdBy: '', reference: '', minAmount: '', maxAmount: '', search: '' })

function Field({ label, children }) {
  return <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-emerald-100/60">{label}</span>{children}</label>
}

function Cards({ items }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">{items.map(([label, value, plain]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-emerald-100/60">{label}</div><div className="mt-1 text-lg font-black text-slate-900 dark:text-white">{plain ? String(value) : money(value)}</div></div>)}</div>
}

function SmallTable({ title, columns, rows, onRow }) {
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="border-b border-slate-200 px-4 py-3 font-bold dark:border-emerald-400/20">{title}</div><div className="overflow-auto"><table className="w-full min-w-max text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-emerald-950/50 dark:text-emerald-100/60"><tr>{columns.map(([, label]) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((item) => <tr key={item.id} onClick={() => onRow?.(item)} className={`border-t border-slate-100 dark:border-emerald-400/10 ${onRow ? 'cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : ''}`}>{columns.map(([key, , type]) => <td key={key} className={`p-3 ${type === 'money' ? 'text-right font-semibold' : ''}`}>{type === 'money' ? money(item[key]) : type === 'date' ? displayDate(item[key]) : String(item[key] ?? '-')}</td>)}</tr>) : <tr><td colSpan={columns.length} className="p-6 text-center text-slate-500">No expense records</td></tr>}</tbody></table></div></div>
}

function PrintDocument({ report, columns, rows, summary, filters, generatedBy }) {
  const applied = [filters.category && `Category: ${filters.category}`, filters.paymentMethod && `Method: ${filters.paymentMethod}`, filters.bankId && 'Bank selected', filters.createdBy && `User: ${filters.createdBy}`, filters.reference && `Reference: ${filters.reference}`].filter(Boolean).join(' | ') || 'No additional filters'
  return <div id="expense-report-print" className="bg-white p-6 text-slate-900"><header className="mb-5 flex items-center justify-between border-b-2 border-emerald-700 pb-4"><div className="flex items-center gap-4"><img src={logo} alt="Company logo" className="h-16 w-16 rounded object-cover"/><div><div className="text-2xl font-black">Shayan's Kids & Toys Store</div><div className="text-sm">Wholesale Management System - Sri Lanka</div></div></div><div className="text-right"><div className="text-xl font-black text-emerald-800">{report.title}</div><div className="text-xs">{filters.from || 'Beginning'} to {filters.to || 'Present'}</div></div></header><div className="mb-4 grid grid-cols-2 text-xs"><div><b>Applied filters:</b> {applied}</div><div className="text-right"><b>Generated by:</b> {generatedBy}<br/><b>Generated:</b> {new Date().toLocaleString()}</div></div><div className="mb-4 grid grid-cols-5 gap-2">{summary.slice(0, 5).map(([label, value, plain]) => <div key={label} className="border border-slate-300 p-2"><div className="text-[9px] uppercase text-slate-500">{label}</div><div className="font-bold">{plain ? value : money(value)}</div></div>)}</div><table className="w-full border-collapse text-[8px]"><thead><tr>{columns.map(([, label]) => <th key={label} className="border border-slate-300 bg-slate-100 p-1 text-left">{label}</th>)}</tr></thead><tbody>{rows.map((item) => <tr key={item.id}>{columns.map(([key, , type]) => <td key={key} className="border border-slate-200 p-1">{type === 'money' ? money(item[key]) : type === 'date' ? displayDate(item[key]) : type === 'percent' ? `${Number(item[key] ?? 0).toFixed(2)}%` : String(item[key] ?? '-')}</td>)}</tr>)}</tbody></table><footer className="mt-4 border-t pt-2 text-center text-[10px] text-slate-500">Generated from live expense records - Shayan's Kids Expense Reports</footer></div>
}

function periodRaw(raw, from, to) {
  const within = (value) => { const date = String(value ?? '').slice(0, 10); return date && (!from || date >= from) && (!to || date <= to) }
  const invoices = (raw.invoices ?? []).filter((item) => within(item.created_at)), invoiceIds = new Set(invoices.map((item) => String(item.id)))
  const entries = (raw.journal_entries ?? []).filter((item) => within(item.date ?? item.created_at)), entryIds = new Set(entries.map((item) => String(item.id)))
  return { ...raw, invoices, invoice_items: (raw.invoice_items ?? []).filter((item) => invoiceIds.has(String(item.invoice_id))), returns: (raw.returns ?? []).filter((item) => within(item.created_at)), journal_entries: entries, journal_entry_lines: (raw.journal_entry_lines ?? []).filter((item) => entryIds.has(String(item.entry_id))), expenses: (raw.expenses ?? []).filter((item) => within(item.expense_date ?? item.created_at)), rep_commission_payments: (raw.rep_commission_payments ?? []).filter((item) => within(item.paid_at)), rep_payments: (raw.rep_payments ?? []).filter((item) => within(item.paid_at)) }
}

export default function ExpenseReportsPage() {
  const toast = useToast()
  const { user } = useAuth()
  const { can, isSuperAdmin, record } = usePermissions()
  const canPrint = isSuperAdmin || can('reports_expenses', 'print')
  const canExport = isSuperAdmin || can('reports_expenses', 'export')
  const [active, setActive] = useState('summary')
  const [raw, setRaw] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(defaultFilters)
  const [filters, setFilters] = useState(defaultFilters)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [grouping, setGrouping] = useState('month')
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [visible, setVisible] = useState({})
  const [showColumns, setShowColumns] = useState(false)

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
    results.forEach((result) => { next[result.table] = result.data; if (result.error && result.table !== 'expenses') failed.push(`${result.table}: ${result.error.message}`) })
    setRaw(next); setWarnings(failed); setLoading(false)
  }
  useEffect(() => { load().catch((error) => { toast.error(error.message ?? 'Unable to load Expense Reports'); setLoading(false) }) }, [])

  const expenses = useMemo(() => raw ? buildExpenseRows(raw) : [], [raw])
  const filtered = useMemo(() => filterExpenses(expenses, filters), [expenses, filters])
  const financePeriod = useMemo(() => raw ? periodRaw(raw, filters.from, filters.to) : {}, [raw, filters.from, filters.to])
  const profitRows = useMemo(() => raw ? buildFinanceReports(financePeriod)['profit-loss'] : [], [financePeriod, raw])
  const baseRows = useMemo(() => {
    if (active === 'category') return groupExpenses(filtered, 'category')
    if (active === 'payment-method') return groupExpenses(filtered, 'paymentMethod')
    if (active === 'user') return groupExpenses(filtered, 'createdBy')
    if (active === 'vs-sales') return expenseVsSales(filtered, financePeriod, grouping)
    if (active === 'vs-profit') return profitRows
    return filtered
  }, [active, filtered, financePeriod, grouping, profitRows])
  const rows = useMemo(() => [...baseRows].sort((a, b) => {
    const left = a[sort.key] ?? '', right = b[sort.key] ?? ''
    const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
    return sort.direction === 'asc' ? comparison : -comparison
  }), [baseRows, sort])
  const report = EXPENSE_REPORTS.find((item) => item.key === active) ?? EXPENSE_REPORTS[0]
  const columns = EXPENSE_COLUMNS[active] ?? EXPENSE_COLUMNS.detailed
  const shownColumns = columns.filter(([key]) => visible[key] !== false)
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize)), safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const stats = expenseSummary(filtered)
  const fullStats = expenseSummary(expenses)
  const cash = filtered.filter((item) => item.paymentMethod.toLowerCase() === 'cash').reduce((sum, item) => sum + item.amount, 0)
  const bank = filtered.filter((item) => item.paymentMethod.toLowerCase() === 'bank').reduce((sum, item) => sum + item.amount, 0)
  const summary = active === 'summary' ? [['Total Expenses', fullStats.total], ['This Month Expenses', fullStats.thisMonth], ['Last Month Expenses', fullStats.lastMonth], ['Expense Difference', fullStats.difference], ['Highest Expense Category', fullStats.highestCategory, true], ['Highest Single Expense', fullStats.highest], ['Cash Expenses', fullStats.cash], ['Bank Expenses', fullStats.bank]]
    : active === 'daily' || active === 'monthly' ? [[active === 'daily' ? 'Total Daily Expenses' : 'Total Monthly Expenses', stats.total], ['Cash Expenses', cash], ['Bank Expenses', bank], ['Other Expenses', stats.total - cash - bank], ['Number of Expense Entries', stats.count, true]]
      : active === 'vs-profit' ? [['Gross Profit', profitRows.find((item) => item.description === 'Gross Profit')?.amount ?? 0], ['Operating Expenses', -(profitRows.find((item) => item.description === 'Operating Expenses')?.amount ?? 0)], ['Rep Commission', -(profitRows.find((item) => item.description === 'Rep Commissions')?.amount ?? 0)], ['Net Profit', profitRows.find((item) => item.description === 'Net Profit')?.amount ?? 0]]
        : [['Total Expenses', stats.total], ['Expense Count', stats.count, true], ['Average Expense', stats.average], ['Highest Expense', stats.highest], ['Lowest Expense', stats.lowest]]
  const generatedBy = record?.display_name || user?.email || 'System User'
  const sourceIsFallback = (raw?.expenses ?? []).length === 0

  useEffect(() => { setPage(1); setVisible({}); setSort({ key: ['category', 'payment-method', 'user'].includes(active) ? 'totalAmount' : active === 'vs-sales' ? 'period' : active === 'vs-profit' ? 'id' : 'date', direction: 'desc' }) }, [active])

  const exportRows = () => rows.map((item) => Object.fromEntries(shownColumns.map(([key, heading, type]) => [heading, type === 'date' ? displayDate(item[key]) : type === 'percent' ? `${Number(item[key] ?? 0).toFixed(2)}%` : item[key] ?? '-'])))
  const exportExcel = () => { const sheet = XLSX.utils.json_to_sheet(exportRows()), book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Expense Report'); XLSX.writeFile(book, `${active}-expense-report.xlsx`) }
  const exportCsv = () => { const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(exportRows())), blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${active}-expense-report.csv`; link.click(); URL.revokeObjectURL(link.href) }
  const print = () => { const content = document.getElementById('expense-report-print')?.outerHTML; if (!content) return; const win = window.open('', '_blank'); win.document.write(`<html><head><title>${report.title}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial;color:#0f172a}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:4px;font-size:9px}img{width:60px}</style></head><body>${content}</body></html>`); win.document.close(); win.print() }

  if (loading) return <LoadingSkeleton/>
  return <div className="space-y-5 text-slate-800 dark:text-emerald-50">
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><h1 className="text-2xl font-black text-slate-900 dark:text-white">Expense Reports</h1><p className="mt-1 text-sm text-slate-500 dark:text-emerald-100/70">Detailed expense visibility using the same operating-expense logic as Finance Reports.</p></div><div className="flex flex-wrap gap-2">{canPrint && <><button onClick={print} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-emerald-400/20"><Printer size={16}/> Print</button><button onClick={() => exportToPDF('expense-report-print', `${active}-expense-report.pdf`, { orientation: 'landscape', pageNumbers: true })} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-emerald-400/20"><Download size={16}/> PDF</button></>}{canExport && <><button onClick={exportExcel} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><FileSpreadsheet size={16}/> Excel</button><button onClick={exportCsv} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-emerald-400/20">CSV</button></>}</div></div></div>
    {sourceIsFallback && <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-800/40 dark:bg-sky-950/30 dark:text-sky-200">Expense Management is not installed or contains no records. This report is showing actual debit postings to expense journal accounts; no historical expenses were invented.</div>}
    {warnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">Some optional data is unavailable: {warnings.join(' | ')}</div>}
    <div className="flex gap-2 overflow-x-auto pb-1">{EXPENSE_REPORTS.map((item) => <button key={item.key} onClick={() => setActive(item.key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${active === item.key ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white dark:border-emerald-400/20 dark:bg-emerald-950/30'}`}>{item.title}</button>)}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="mb-3 flex items-center gap-2 text-sm font-bold"><Filter size={16}/> Filters</div><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      <Field label="Date Period"><select className={inputClass} value={draft.preset} onChange={(event) => { const preset = event.target.value; setDraft((old) => ({ ...old, preset, ...presetDates(preset) })) }}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="this-week">This Week</option><option value="this-month">This Month</option><option value="last-month">Last Month</option><option value="this-year">This Year</option><option value="custom">Custom Range</option><option value="all">All Dates</option></select></Field>
      <Field label="From"><input type="date" className={inputClass} value={draft.from} onChange={(event) => setDraft((old) => ({ ...old, preset: 'custom', from: event.target.value }))}/></Field>
      <Field label="To"><input type="date" className={inputClass} value={draft.to} onChange={(event) => setDraft((old) => ({ ...old, preset: 'custom', to: event.target.value }))}/></Field>
      {active === 'monthly' && <><Field label="Month"><select className={inputClass} value={month} onChange={(event) => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleString(undefined, { month: 'long' })}</option>)}</select></Field><Field label="Year"><input type="number" className={inputClass} value={year} onChange={(event) => setYear(Number(event.target.value))}/></Field></>}
      {active === 'vs-sales' && <Field label="Group By"><select className={inputClass} value={grouping} onChange={(event) => setGrouping(event.target.value)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></Field>}
      <Field label="Category"><select className={inputClass} value={draft.category} onChange={(event) => setDraft((old) => ({ ...old, category: event.target.value }))}><option value="">All Categories</option>{[...new Set(expenses.map((item) => item.category))].sort().map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Payment Method"><select className={inputClass} value={draft.paymentMethod} onChange={(event) => setDraft((old) => ({ ...old, paymentMethod: event.target.value }))}><option value="">All Methods</option>{[...new Set(expenses.map((item) => item.paymentMethod))].sort().map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Bank"><select className={inputClass} value={draft.bankId} onChange={(event) => setDraft((old) => ({ ...old, bankId: event.target.value }))}><option value="">All Banks</option>{(raw?.banks ?? []).map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} - ` : ''}{item.name}</option>)}</select></Field>
      <Field label="User"><select className={inputClass} value={draft.createdBy} onChange={(event) => setDraft((old) => ({ ...old, createdBy: event.target.value }))}><option value="">All Users</option>{[...new Set(expenses.map((item) => item.createdBy))].sort().map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Minimum Amount"><input type="number" min="0" className={inputClass} value={draft.minAmount} onChange={(event) => setDraft((old) => ({ ...old, minAmount: event.target.value }))}/></Field>
      <Field label="Maximum Amount"><input type="number" min="0" className={inputClass} value={draft.maxAmount} onChange={(event) => setDraft((old) => ({ ...old, maxAmount: event.target.value }))}/></Field>
      <Field label="Reference"><input className={inputClass} value={draft.reference} onChange={(event) => setDraft((old) => ({ ...old, reference: event.target.value }))} placeholder="Reference"/></Field>
      <Field label="Search"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className={`${inputClass} pl-9`} value={draft.search} onChange={(event) => setDraft((old) => ({ ...old, search: event.target.value }))} placeholder="Search expenses"/></div></Field>
    </div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => { let next = { ...draft }; if (active === 'monthly') { const from = `${year}-${String(month).padStart(2, '0')}-01`, end = new Date(year, month, 0); next = { ...next, preset: 'custom', from, to: localDay(end) }; setDraft(next) } setFilters(next); setPage(1) }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Apply Filters</button><button onClick={() => { const blank = defaultFilters(); setDraft(blank); setFilters(blank); setPage(1) }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-emerald-400/20">Reset Filters</button><button onClick={load} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-emerald-400/20"><RefreshCw size={15}/> Refresh</button></div></div>
    <div><div className="text-lg font-black text-slate-900 dark:text-white">{report.title}</div><div className="text-sm text-slate-500 dark:text-emerald-100/70">{report.description}</div></div>
    <Cards items={summary}/>

    {active === 'summary' ? <div className="grid gap-4 xl:grid-cols-2"><SmallTable title="Top Expense Categories" columns={EXPENSE_COLUMNS.category.slice(0, 4)} rows={groupExpenses(expenses, 'category').slice(0, 8)} onRow={(item) => { const next = { ...filters, category: item.category }; setFilters(next); setDraft(next); setActive('detailed') }}/><SmallTable title="Recent Expenses" columns={EXPENSE_COLUMNS.daily.slice(0, 5)} rows={[...expenses].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 10)}/></div> : <>
      <div className="flex justify-end"><div className="relative"><button onClick={() => setShowColumns((value) => !value)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-emerald-400/20 dark:bg-emerald-950/30"><Settings2 size={16}/> Columns <ChevronDown size={14}/></button>{showColumns && <div className="absolute right-0 z-20 mt-2 max-h-80 w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-emerald-400/20 dark:bg-slate-950">{columns.map(([key, heading]) => <label key={key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm"><input type="checkbox" checked={visible[key] !== false} onChange={(event) => setVisible((old) => ({ ...old, [key]: event.target.checked }))}/><Check size={13} className={visible[key] !== false ? 'text-emerald-600' : 'invisible'}/>{heading}</label>)}</div>}</div></div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="overflow-auto"><table className="w-full min-w-max text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-emerald-950/60 dark:text-emerald-100/60"><tr>{shownColumns.map(([key, heading]) => <th key={key} onClick={() => setSort((old) => ({ key, direction: old.key === key && old.direction === 'asc' ? 'desc' : 'asc' }))} className={`cursor-pointer whitespace-nowrap p-3 text-left ${['amount', 'totalAmount', 'averageAmount', 'highestExpense'].includes(key) ? 'text-right' : ''}`}>{heading}{sort.key === key ? (sort.direction === 'asc' ? ' ASC' : ' DESC') : ''}</th>)}</tr></thead><tbody>{pageRows.length ? pageRows.map((item) => <tr key={item.id} onClick={() => { if (active === 'category') { const next = { ...filters, category: item.category }; setFilters(next); setDraft(next); setActive('detailed') } else if (active === 'payment-method') { const next = { ...filters, paymentMethod: item.paymentMethod }; setFilters(next); setDraft(next); setActive('detailed') } else if (active === 'user') { const next = { ...filters, createdBy: item.createdBy }; setFilters(next); setDraft(next); setActive('detailed') } }} className={`border-t border-slate-100 dark:border-emerald-400/10 ${['category', 'payment-method', 'user'].includes(active) ? 'cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : ''}`}>{shownColumns.map(([key, , type]) => <td key={key} className={`whitespace-nowrap p-3 ${type === 'money' ? 'text-right font-semibold' : ''}`}>{type === 'money' ? money(item[key]) : type === 'date' ? displayDate(item[key]) : type === 'datetime' ? (item[key] ? new Date(item[key]).toLocaleString() : '-') : type === 'percent' ? `${Number(item[key] ?? 0).toFixed(2)}%` : String(item[key] ?? '-')}</td>)}</tr>) : <tr><td colSpan={shownColumns.length} className="p-10 text-center text-slate-500 dark:text-emerald-100/60">No expenses match the selected report and filters.</td></tr>}</tbody></table></div></div>
      {active === 'monthly' && <SmallTable title="Grouped Monthly Summary" columns={[['month', 'Month'], ['totalAmount', 'Total Expenses', 'money'], ['count', 'Number of Expenses'], ['averageAmount', 'Average Expense', 'money']]} rows={monthlyExpenses(filterExpenses(expenses, { ...filters, from: '', to: '' }))}/>}
      {active === 'payment-method' && <SmallTable title="Bank Expense Breakdown" columns={[['bank', 'Bank Name'], ['count', 'Transaction Count'], ['totalAmount', 'Amount', 'money']]} rows={groupExpenses(filtered.filter((item) => item.paymentMethod.toLowerCase() === 'bank'), 'bank')}/>}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-emerald-400/20 dark:bg-emerald-950/30 sm:flex-row sm:items-center sm:justify-between"><div className="text-sm text-slate-500 dark:text-emerald-100/60">Showing {rows.length ? (safePage - 1) * pageSize + 1 : 0}-{Math.min(safePage * pageSize, rows.length)} of {rows.length}</div><div className="flex items-center gap-2"><select className={inputClass} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option value="10">10 rows</option><option value="25">25 rows</option><option value="50">50 rows</option><option value="100">100 rows</option></select><button disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40 dark:border-emerald-400/20">Previous</button><span className="whitespace-nowrap text-sm">{safePage} / {totalPages}</span><button disabled={safePage >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40 dark:border-emerald-400/20">Next</button></div></div>
    </>}
    <div className="fixed -left-[10000px] top-0 w-[1400px]"><PrintDocument report={report} columns={shownColumns} rows={rows} summary={summary} filters={filters} generatedBy={generatedBy}/></div>
  </div>
}

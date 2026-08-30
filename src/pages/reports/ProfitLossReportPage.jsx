import React, { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Filter, Printer, RefreshCw, Search } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useToast } from '../../contexts/ToastContext'
import { buildProfitLoss, formatProfitLossCurrency, profitLossPdfData } from '../../lib/profitLoss.js'
import { exportToExcel, exportToPDF, LoadingSkeleton } from '../../components/reports'
import logo from '../../pictures/logo.jpeg'

const TABLES = ['invoices', 'invoice_items', 'returns', 'return_items', 'customers', 'employees', 'products', 'product_variants', 'purchases', 'purchase_items', 'expenses', 'banks', 'user_privileges', 'journals', 'journal_categories', 'journal_entries', 'journal_entry_lines']
const OPTIONAL = new Set(['product_variants', 'purchase_items', 'expenses', 'user_privileges', 'journal_categories'])
const MONEY = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 })
const money = (value) => MONEY.format(Number(value ?? 0))
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateText = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString() : '-'
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 dark:border-emerald-400/20 dark:bg-slate-950 dark:text-emerald-50'

function presetRange(key) {
  const now = new Date(), from = new Date(now.getFullYear(), now.getMonth(), now.getDate()), to = new Date(from)
  if (key === 'yesterday') { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1) }
  if (key === 'week') from.setDate(from.getDate() - ((from.getDay() + 6) % 7))
  if (key === 'month') from.setDate(1)
  if (key === 'last-month') { from.setMonth(from.getMonth() - 1, 1); to.setDate(0) }
  if (key === 'year') from.setMonth(0, 1)
  if (key === 'last-year') { from.setFullYear(from.getFullYear() - 1, 0, 1); to.setFullYear(to.getFullYear() - 1, 11, 31) }
  return { from: iso(from), to: iso(to) }
}
const presets = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This Week'], ['month', 'This Month'], ['last-month', 'Last Month'], ['year', 'This Year'], ['last-year', 'Last Year'], ['custom', 'Custom']]
function previousRange(range) { const start = new Date(`${range.from}T00:00:00`), end = new Date(`${range.to}T00:00:00`), days = Math.max(1, Math.round((end - start) / 86400000) + 1), previousTo = new Date(start); previousTo.setDate(previousTo.getDate() - 1); const previousFrom = new Date(previousTo); previousFrom.setDate(previousFrom.getDate() - days + 1); return { from: iso(previousFrom), to: iso(previousTo) } }

function Row({ label, amount, strong, negative, onClick, indent }) {
  const Tag = onClick ? 'button' : 'div'
  return <Tag onClick={onClick} className={`flex w-full justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left dark:border-emerald-400/10 ${strong ? 'bg-slate-50 text-base font-black dark:bg-emerald-950/50' : 'text-sm font-medium'} ${onClick ? 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : ''}`}><span className={`${indent ? 'pl-5' : ''} text-slate-700 dark:text-emerald-50`}>{label}{onClick ? ' >' : ''}</span><span className={negative ? 'tabular-nums text-rose-600 dark:text-rose-300' : 'tabular-nums text-slate-900 dark:text-white'}>{negative ? `(${money(Math.abs(amount))})` : money(amount)}</span></Tag>
}

function Statement({ model, open }) {
  const t = model.totals
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/25"><div className="bg-emerald-700 px-4 py-3 text-center text-sm font-black uppercase tracking-wider text-white">Profit & Loss Statement</div><div className="px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Revenue</div><Row label="Gross Sales" amount={t.grossSales} onClick={() => open('sales')}/><Row label="Less: Sales Returns" amount={t.salesReturns} onClick={() => open('returns')}/><Row label="Less: Sales Discounts" amount={t.discounts} onClick={() => open('discounts')}/><Row label="Net Sales" amount={t.netSales} strong/><div className="px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Cost of Goods Sold</div><Row label="Historical Cost of Sold Products" amount={t.cogsBeforeReturns} onClick={() => open('cogs')}/><Row label="Less: Cost Reversed by Returns" amount={t.returnedCogs} onClick={() => open('returns')}/><Row label="Net Cost of Goods Sold" amount={t.cogs} strong/><Row label="Gross Profit" amount={t.grossProfit} strong/><div className="px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Operating Expenses</div>{model.expensesByCategory.map((row) => <Row key={row.category} label={row.category} amount={row.amount} indent onClick={() => open(`expense:${row.category}`)}/>)}<Row label="Rep Commission Expense" amount={t.commissions} onClick={() => open('commission')}/><Row label="Total Operating Expenses" amount={t.operatingExpenses + t.commissions} strong onClick={() => open('expenses')}/>{t.otherIncome > 0 && <Row label="Other Income" amount={t.otherIncome} onClick={() => open('income')}/>} {t.otherExpenses > 0 && <Row label="Other Expenses" amount={t.otherExpenses} onClick={() => open('other-expenses')}/>}<div className={`flex justify-between px-4 py-4 text-lg font-black text-white ${t.netProfit < 0 ? 'bg-rose-700' : 'bg-emerald-700'}`}><span>{t.netProfit < 0 ? 'NET LOSS' : 'NET PROFIT'}</span><span>{money(Math.abs(t.netProfit))}</span></div><div className="grid grid-cols-2 border-t border-slate-200 px-4 py-3 text-sm dark:border-emerald-400/20"><span>Gross Margin <b>{t.grossMargin.toFixed(2)}%</b></span><span className="text-right">Net Margin <b>{t.netMargin.toFixed(2)}%</b></span></div></div>
}

const columns = {
  sales: [['date', 'Date'], ['reference', 'Invoice'], ['customer', 'Customer'], ['rep', 'Rep'], ['product', 'Product'], ['quantity', 'Qty'], ['grossSales', 'Gross Sales'], ['discount', 'Discount'], ['netSales', 'Net Sales']],
  returns: [['date', 'Date'], ['reference', 'Return'], ['customer', 'Customer'], ['product', 'Product'], ['quantity', 'Qty'], ['amount', 'Return Amount'], ['cogsReversed', 'Cost Reversed'], ['reason', 'Reason / Note']],
  discounts: [['date', 'Date'], ['reference', 'Invoice'], ['customer', 'Customer'], ['product', 'Product'], ['discount', 'Discount']],
  cogs: [['date', 'Date'], ['reference', 'Reference'], ['product', 'Product'], ['quantity', 'Qty'], ['unitCost', 'Unit Cost'], ['cogs', 'Sale Cost'], ['cogsReversed', 'Return Cost Reversed'], ['costSource', 'Cost Source']],
  expenses: [['date', 'Date'], ['expenseNumber', 'Expense No.'], ['category', 'Category'], ['description', 'Description'], ['paymentMethod', 'Method'], ['amount', 'Amount'], ['createdBy', 'Created By']],
  commission: [['rep', 'Rep'], ['period', 'Period'], ['netSales', 'Net Sales'], ['rate', 'Rate'], ['amount', 'Commission Earned']],
  income: [['date', 'Date'], ['reference', 'Reference'], ['description', 'Description'], ['amount', 'Amount']],
  'other-expenses': [['date', 'Date'], ['reference', 'Reference'], ['description', 'Description'], ['amount', 'Amount']],
}
const moneyFields = new Set(['grossSales', 'discount', 'netSales', 'amount', 'cogs', 'cogsReversed', 'unitCost'])
function Detail({ model, detail, close }) {
  const base = detail.startsWith('expense:') ? 'expenses' : detail
  let rows = ['sales', 'discounts'].includes(base) ? model.salesDetails : base === 'returns' ? model.returnDetails : base === 'cogs' ? [...model.salesDetails, ...model.returnDetails] : base === 'expenses' ? model.expenseDetails : base === 'commission' ? model.commissionDetails : base === 'other-expenses' ? model.otherExpenseDetails : model.otherIncomeDetails
  if (detail.startsWith('expense:')) rows = rows.filter((row) => row.category === detail.slice(8))
  return <div className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="mb-3 flex justify-between"><div><h3 className="font-black text-slate-900 dark:text-white">{detail.startsWith('expense:') ? detail.slice(8) : base.replaceAll('-', ' ')} drilldown</h3><p className="text-xs text-slate-500 dark:text-emerald-100/60">{rows.length} source records</p></div><button onClick={close} className="rounded-lg border px-3 py-1 text-sm font-bold">Close</button></div><div className="max-h-80 overflow-auto"><table className="min-w-full whitespace-nowrap text-sm"><thead className="sticky top-0 bg-slate-50 dark:bg-emerald-950"><tr>{(columns[base] ?? []).map(([key, label]) => <th key={key} className="px-3 py-2 text-left text-[10px] uppercase text-slate-500 dark:text-emerald-100/60">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100 dark:border-emerald-400/10">{(columns[base] ?? []).map(([key]) => <td key={key} className="px-3 py-2 text-slate-700 dark:text-emerald-50">{key === 'date' ? dateText(row[key]) : key === 'rate' ? `${(Number(row[key]) * 100).toFixed(2)}%` : moneyFields.has(key) ? money(row[key]) : String(row[key] ?? '-')}</td>)}</tr>)}</tbody></table></div></div>
}

function Comparison({ current, previous, range, previousDates }) {
  const rows = [['Net Sales', 'netSales'], ['Gross Profit', 'grossProfit'], ['Total Expenses', 'totalExpenses'], ['Net Profit / Loss', 'netProfit']]
  return <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-emerald-400/20 dark:bg-emerald-950/25"><h3 className="font-black text-slate-900 dark:text-white">Current Period vs Previous Period</h3><p className="mb-4 text-xs text-slate-500 dark:text-emerald-100/60">Current: {dateText(range.from)} - {dateText(range.to)} | Previous: {dateText(previousDates.from)} - {dateText(previousDates.to)}</p><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>{['Metric', 'Current', 'Previous', 'Change'].map((label) => <th key={label} className="px-3 py-3 text-right text-[10px] uppercase text-slate-500 first:text-left dark:text-emerald-100/60">{label}</th>)}</tr></thead><tbody>{rows.map(([label, key]) => { const change = current[key] - previous[key]; return <tr key={key} className="border-t border-slate-100 dark:border-emerald-400/10"><td className="px-3 py-3 font-bold text-slate-800 dark:text-white">{label}</td><td className="px-3 py-3 text-right">{money(current[key])}</td><td className="px-3 py-3 text-right">{money(previous[key])}</td><td className={`px-3 py-3 text-right font-bold ${change < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{money(change)}</td></tr> })}</tbody></table></div></div>
}

function CalculationBreakdown({ model }) {
  const d = model.diagnostics
  const rows = [['Gross Sales source', `${d.invoiceCount} invoices`, d.invoiceTotal], ['Sales Returns source', `${d.returnCount} returns`, d.returnTotal], ['COGS source', `${d.soldUnits} sold units`, d.historicalCostTotal], ['Return COGS reversal', `${d.returnedUnits} returned units`, d.returnedCostTotal], ['Expenses', `${d.expenseCount} entries`, d.expenseTotal], ['Commission', `${d.commissionCount} rep calculations`, d.commissionTotal], ['Other Income', 'Journal evidence', d.otherIncomeTotal], ['Other Expenses', 'Journal evidence', d.otherExpenseTotal]]
  return <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-slate-800 dark:border-sky-700/40 dark:bg-sky-950/30 dark:text-sky-50"><h3 className="mb-3 font-black">Calculation Breakdown</h3><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr><th className="p-2 text-left">Source</th><th className="p-2 text-left">Records / Units</th><th className="p-2 text-right">Calculated Amount</th></tr></thead><tbody>{rows.map(([label, count, amount]) => <tr key={label} className="border-t border-sky-200 dark:border-sky-700/30"><td className="p-2 font-bold">{label}</td><td className="p-2">{count}</td><td className="p-2 text-right">{money(amount)}</td></tr>)}</tbody></table></div></div>
}

function PdfRow({ label, value, total = false, final = false }) {
  return <div className={'pdf-avoid-break'} style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box', borderTop: total || final ? '1.5px solid #334155' : '1px solid #e2e8f0', borderBottom: final ? '3px double #065f46' : 'none', background: total ? '#f8fafc' : final ? '#ecfdf5' : '#ffffff', padding: final ? '11px 12px' : '7px 12px', color: '#0f172a', fontSize: final ? '16px' : '12px', fontWeight: total || final ? 800 : 500 }}>
    <span style={{ flex: '1 1 auto', paddingRight: '16px' }}>{label}</span>
    <span data-pdf-value={String(value)} style={{ display: 'block', flex: '0 0 190px', width: '190px', color: value < 0 ? '#be123c' : '#0f172a', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: total || final ? 800 : 600 }}>{formatProfitLossCurrency(value)}</span>
  </div>
}

function PdfSection({ title, children }) {
  return <section className={'pdf-avoid-break'} style={{ marginTop: '12px' }}><div style={{ borderBottom: '2px solid #047857', color: '#065f46', fontSize: '10px', fontWeight: 800, letterSpacing: '1.2px', padding: '0 12px 5px', textTransform: 'uppercase' }}>{title}</div>{children}</section>
}

function PdfBrand() {
  return <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}><img src={logo} alt={'Company logo'} style={{ width: '58px', height: '58px', borderRadius: '7px', objectFit: 'cover' }}/><div><h1 style={{ margin: 0, color: '#0f172a', fontSize: '21px', fontWeight: 800 }}>Shayan's Kids & Toys Store</h1><p style={{ margin: '4px 0 0', color: '#475569', fontSize: '11px' }}>Wholesale Management System - Sri Lanka</p></div></div>
}

function PdfHeader({ range }) {
  return <header className={'pdf-avoid-break'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #047857', paddingBottom: '14px' }}>
    <PdfBrand/>
    <div style={{ textAlign: 'right' }}><h2 style={{ margin: 0, color: '#065f46', fontSize: '18px', fontWeight: 800 }}>Profit &amp; Loss Report</h2><p style={{ margin: '5px 0 0', color: '#334155', fontSize: '10px' }}>{dateText(range.from)} - {dateText(range.to)}</p></div>
  </header>
}

function PrintDocument({ data, range, generatedBy }) {
  return <div id={'profit-loss-print'} style={{ width: '760px', minHeight: '1030px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', background: '#fff', color: '#0f172a', fontFamily: 'Arial, sans-serif', padding: '34px 40px 28px' }}>
    <PdfHeader range={range}/>
    <PdfSection title={'Revenue'}><PdfRow label={'Gross Sales'} value={data.grossSales}/><PdfRow label={'Less: Sales Returns'} value={data.salesReturns}/><PdfRow label={'Less: Sales Discounts'} value={data.salesDiscounts}/><PdfRow label={'Net Sales'} value={data.netSales} total/></PdfSection>
    <PdfSection title={'Cost of Goods Sold'}><PdfRow label={'Historical Cost of Sold Products'} value={data.grossCOGS}/><PdfRow label={'Less: Cost Reversed by Returns'} value={data.returnCOGS}/><PdfRow label={'Net Cost of Goods Sold'} value={data.netCOGS} total/></PdfSection>
    <PdfRow label={'Gross Profit'} value={data.grossProfit} total/>
    <PdfSection title={'Operating Expenses'}>{data.expenseCategories.map((row) => <PdfRow key={row.category} label={row.category} value={row.amount}/>)}<PdfRow label={'Total Operating Expenses'} value={data.operatingExpenses} total/></PdfSection>
    <PdfSection title={'Commission and Other Items'}><PdfRow label={'Rep Commission Expense'} value={data.commissionExpense}/><PdfRow label={'Other Income'} value={data.otherIncome}/><PdfRow label={'Other Expenses'} value={data.otherExpenses}/></PdfSection>
    <div style={{ marginTop: '14px' }}><PdfRow label={data.netProfit < 0 ? 'NET LOSS' : 'NET PROFIT'} value={data.netProfit} final/></div>
    <div className={'pdf-avoid-break'} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 12px', color: '#334155', fontSize: '11px' }}><span><b>Gross margin:</b> {Number(data.grossMargin ?? 0).toFixed(2)}%</span><span><b>Net margin:</b> {Number(data.netMargin ?? 0).toFixed(2)}%</span></div>
    <footer style={{ marginTop: 'auto', borderTop: '1px solid #cbd5e1', paddingTop: '9px', color: '#64748b', textAlign: 'center', fontSize: '9px' }}>Generated by {generatedBy} on {new Date().toLocaleString()} from live transaction records.</footer>
  </div>
}

export default function ProfitLossReportPage() {
  const toast = useToast(), { user } = useAuth(), { can, isSuperAdmin, record } = usePermissions()
  const [raw, setRaw] = useState(null), [loading, setLoading] = useState(true), [warnings, setWarnings] = useState([])
  const [preset, setPreset] = useState('month'), [draft, setDraft] = useState(() => presetRange('month')), [range, setRange] = useState(() => presetRange('month'))
  const [grouping, setGrouping] = useState('month'), [detail, setDetail] = useState(''), [view, setView] = useState('statement'), [search, setSearch] = useState(''), [showBreakdown, setShowBreakdown] = useState(false)
  const canPrint = isSuperAdmin || can('reports_profit_loss', 'print'), canExport = isSuperAdmin || can('reports_profit_loss', 'export')
  const load = async () => {
    setLoading(true)
    const results = await Promise.all(TABLES.map(async (table) => ({ table, ...(await supabase.from(table).select('*')) })))
    const next = {}, failed = []
    results.forEach(({ table, data, error }) => { next[table] = data ?? []; if (error && !OPTIONAL.has(table)) failed.push(`${table}: ${error.message}`) })
    setRaw(next); setWarnings(failed); setLoading(false)
  }
  useEffect(() => { load().catch((error) => { toast.error(error.message ?? 'Failed to load Profit & Loss report'); setLoading(false) }) }, [])
  const model = useMemo(() => raw ? buildProfitLoss(raw, { ...range, grouping }) : null, [raw, range, grouping])
  const pdfData = useMemo(() => profitLossPdfData(model), [model])
  const previousDates = useMemo(() => previousRange(range), [range])
  const previousModel = useMemo(() => raw ? buildProfitLoss(raw, { ...previousDates, grouping }) : null, [raw, previousDates, grouping])
  const generatedBy = record?.display_name ?? user?.user_metadata?.display_name ?? user?.email ?? 'Authenticated user'
  const setDatePreset = (key) => { setPreset(key); if (key !== 'custom') setDraft(presetRange(key)) }
  const breakdown = useMemo(() => { if (!model) return []; const rows = [...model.byProduct.map((x) => ({ ...x, type: 'Product' })), ...model.byCustomer.map((x) => ({ ...x, type: 'Customer' })), ...model.byRep.map((x) => ({ ...x, type: 'Sales Rep' }))]; const q = search.trim().toLowerCase(); return q ? rows.filter((row) => row.name.toLowerCase().includes(q)) : rows }, [model, search])
  const exportRows = () => model.comparison.map((row) => ({ Period: row.period, 'Gross Sales': row.grossSales, Returns: row.returns, Discounts: row.discounts, 'Net Sales': row.netSales, COGS: row.cogs, 'Gross Profit': row.grossProfit, Expenses: row.expenses, 'Commission Earned': row.commissions, 'Other Income': row.otherIncome, 'Other Expenses': row.otherExpenses, 'Net Profit / Loss': row.netProfit }))
  const csv = () => { const rows = exportRows(), heads = Object.keys(rows[0] ?? { Period: '' }), text = [heads, ...rows.map((row) => heads.map((key) => row[key]))].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = `profit-loss-${range.from}-${range.to}.csv`; a.click(); URL.revokeObjectURL(a.href) }
  const print = () => { if (!canPrint) return; const node = document.getElementById('profit-loss-print'), popup = window.open('', '_blank', 'width=900,height=800'); if (!node || !popup) return toast.error('Allow popups to print this report'); popup.document.write(`<html><head><title>Profit & Loss Report</title><style>@page{size:A4 portrait;margin:12mm}body{font-family:Arial;color:#0f172a}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #e2e8f0;padding:9px}.flex{display:flex}.items-center{align-items:center}.justify-between{justify-content:space-between}.gap-4{gap:16px}.text-right{text-align:right}.font-black{font-weight:800}.text-2xl{font-size:22px}.text-xl{font-size:18px}.text-sm{font-size:12px}.text-xs,.text-\\[10px\\]{font-size:10px}.h-16,.w-16{width:64px;height:64px}.rounded{border-radius:6px}.object-cover{object-fit:cover}.border-b-2{border-bottom:2px solid #047857}.border-t{border-top:1px solid #cbd5e1}.pb-4{padding-bottom:14px}.pt-3{padding-top:10px}.mb-6{margin-bottom:20px}.mt-5,.mt-8{margin-top:20px}.p-3{padding:9px}.bg-slate-100{background:#f1f5f9}.text-rose-700{color:#be123c}.text-emerald-800{color:#065f46}</style></head><body>${node.innerHTML}<script>window.onload=()=>{window.print();window.close()}</script></body></html>`); popup.document.close() }
  const downloadPdf = () => {
    if (loading || !pdfData) return toast.error('Profit & Loss data is still loading.')
    const numericValues = Object.entries(pdfData).filter(([key]) => key !== 'expenseCategories')
    if (numericValues.some(([, value]) => !Number.isFinite(Number(value)))) return toast.error('Profit & Loss PDF data is invalid.')
    console.log('P&L PDF DATA:', pdfData)
    exportToPDF('profit-loss-print', `profit-loss-${range.from}-${range.to}.pdf`, { orientation: 'portrait', margin: 0.48, scale: 2, pageNumbers: true })
  }
  if (loading || !model) return <LoadingSkeleton />
  const t = model.totals
  return <div className="space-y-5 text-slate-800 dark:text-emerald-50">
    <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Shayan's Kids & Toys Store</p><h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">Profit & Loss Statement</h1><p className="mt-1 text-sm text-slate-500 dark:text-emerald-100/70">Accrual basis | {dateText(range.from)} - {dateText(range.to)}</p></div><div className="flex flex-wrap gap-2"><button onClick={load} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><RefreshCw size={15}/> Refresh</button>{isSuperAdmin && <button onClick={() => setShowBreakdown((value) => !value)} className="rounded-lg border border-sky-300 px-3 py-2 text-sm font-bold text-sky-800 dark:border-sky-700 dark:text-sky-200">{showBreakdown ? 'Hide' : 'View'} Calculation Breakdown</button>}{canPrint && <button onClick={print} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><Printer size={15}/> Print</button>}{canExport && <><button onClick={downloadPdf} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><Download size={15}/> PDF</button><button onClick={() => exportToExcel(exportRows(), `profit-loss-${range.from}-${range.to}.xlsx`, 'Profit and Loss')} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white"><FileSpreadsheet size={15}/> Excel</button><button onClick={csv} className="rounded-lg border px-3 py-2 text-sm font-bold">CSV</button></>}</div></div></header>
    {warnings.length > 0 && <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><summary className="cursor-pointer font-bold">Some data sources were unavailable ({warnings.length})</summary><ul className="mt-2 list-disc pl-5">{warnings.map((x) => <li key={x}>{x}</li>)}</ul></details>}
    {model.reconciliationWarnings.length > 0 && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-200"><b>Financial report reconciliation mismatch detected.</b><ul className="mt-1 list-disc pl-5">{model.reconciliationWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
    {isSuperAdmin && showBreakdown && <CalculationBreakdown model={model}/>} 
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="mb-4 flex gap-2 overflow-x-auto">{presets.map(([key, label]) => <button key={key} onClick={() => setDatePreset(key)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${preset === key ? 'bg-emerald-600 text-white' : 'border border-slate-200 text-slate-700 dark:border-emerald-400/20 dark:text-emerald-50'}`}>{label}</button>)}</div><div className="grid gap-3 md:grid-cols-4"><label className="text-xs font-bold text-slate-600 dark:text-emerald-100">From<input className={`${inputClass} mt-1`} type="date" value={draft.from} onChange={(e) => { setPreset('custom'); setDraft((x) => ({ ...x, from: e.target.value })) }}/></label><label className="text-xs font-bold text-slate-600 dark:text-emerald-100">To<input className={`${inputClass} mt-1`} type="date" value={draft.to} onChange={(e) => { setPreset('custom'); setDraft((x) => ({ ...x, to: e.target.value })) }}/></label><label className="text-xs font-bold text-slate-600 dark:text-emerald-100">Comparison<select className={`${inputClass} mt-1`} value={grouping} onChange={(e) => setGrouping(e.target.value)}><option value="month">Monthly</option><option value="year">Yearly</option></select></label><button onClick={() => { setRange(draft); setDetail('') }} className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white dark:bg-emerald-600"><Filter size={15}/> Apply Period</button></div></section>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Net Sales', t.netSales], ['Gross Profit', t.grossProfit], ['Total Expenses', t.totalExpenses], ['Net Profit / Loss', t.netProfit]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/25"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">{label}</div><div className={`mt-1 text-lg font-black ${label === 'Net Profit / Loss' && value < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-white'}`}>{money(value)}</div></div>)}</div>
    {t.missingCostLines > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><b>Historical cost warning:</b> {t.missingCostLines} sale or return lines could not be costed. Profit may be overstated.</div>}
    <div className="flex gap-2 overflow-x-auto">{[['statement', 'Income Statement'], ['comparison', 'Period Comparison'], ['breakdown', 'Profit Breakdown']].map(([key, label]) => <button key={key} onClick={() => setView(key)} className={`rounded-lg px-4 py-2 text-sm font-bold ${view === key ? 'bg-emerald-600 text-white' : 'border bg-white text-slate-700 dark:border-emerald-400/20 dark:bg-emerald-950/25 dark:text-emerald-50'}`}>{label}</button>)}</div>
    {view === 'statement' && <Statement model={model} open={(key) => setDetail(detail === key ? '' : key)}/>} {view === 'statement' && detail && <Detail model={model} detail={detail} close={() => setDetail('')}/>} {view === 'comparison' && <Comparison current={model.totals} previous={previousModel.totals} range={range} previousDates={previousDates}/>} {view === 'breakdown' && <Breakdown rows={breakdown} search={search} setSearch={setSearch}/>} 
    <div aria-hidden="true" style={{ position: 'fixed', left: '-12000px', top: 0, width: '760px', background: '#ffffff' }}><PrintDocument data={pdfData} range={range} generatedBy={generatedBy}/></div>
  </div>
}

function Breakdown({ rows, search, setSearch }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-emerald-400/20 dark:bg-emerald-950/25"><div className="mb-3 flex items-center gap-2"><Search size={16} className="text-slate-400"/><input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, customer or sales rep..."/></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>{['Type', 'Name', 'Sales', 'Returns', 'Net Sales', 'COGS', 'Profit'].map((x) => <th key={x} className="px-3 py-2 text-right text-[10px] uppercase text-slate-500 first:text-left dark:text-emerald-100/60">{x}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={`${row.type}-${row.id}`} className="border-t border-slate-100 dark:border-emerald-400/10"><td className="px-3 py-2 text-slate-500 dark:text-emerald-100/60">{row.type}</td><td className="px-3 py-2 font-bold text-slate-800 dark:text-white">{row.name}</td>{['sales', 'returns', 'netSales', 'cogs', 'profit'].map((key) => <td key={key} className={`px-3 py-2 text-right ${key === 'profit' && row[key] < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-emerald-50'}`}>{money(row[key])}</td>)}</tr>)}</tbody></table></div></div>
}

import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Eye, FileText, Filter, Printer, RefreshCw, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { LoadingSkeleton, exportToPDF } from '../../components/reports'
import { amount, buildActivityRows, buildStatement, buildVendorReportData } from '../../lib/vendorReports'
import { COLUMNS, REPORTS, rowsForReport } from './vendorReportConfig'
import logo from '../../pictures/logo.jpeg'

const money = (value) => `Rs. ${amount(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const number = (value) => amount(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
const iso = (date) => date.toISOString().slice(0, 10)
const dateText = (value) => value ? new Date(value).toLocaleDateString() : '-'
const dateTime = (value) => value ? new Date(value).toLocaleString() : '-'
const emptyFilters = { vendor: '', product: '', purchase: '', method: '', paymentStatus: '', chequeStatus: '', bucket: '', min: '', max: '', search: '' }

function presetRange(key) {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), to = new Date(today); let from = new Date(today)
  if (key === 'yesterday') { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1) }
  if (key === 'week') from.setDate(from.getDate() - ((from.getDay() + 6) % 7))
  if (key === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1)
  if (key === 'last') { from = new Date(today.getFullYear(), today.getMonth() - 1, 1); to.setDate(0) }
  if (key === 'year') from = new Date(today.getFullYear(), 0, 1)
  return { from: iso(from), to: iso(to) }
}
const reportName = (mode) => REPORTS.find(([key]) => key === mode)?.[1] || 'Vendor Report'
const rawValue = (row, key) => key.split('.').reduce((value, part) => value?.[part], row)
function showValue(row, column) {
  const value = rawValue(row, column.key)
  if (column.type === 'money') return value == null ? '-' : money(value)
  if (column.type === 'number') return number(value)
  if (column.type === 'date') return dateText(value)
  if (column.type === 'datetime') return dateTime(value)
  if (column.type === 'percent') return `${amount(value).toFixed(2)}%`
  if (column.type === 'days') return `${number(value)} days`
  return value === '' || value == null ? '-' : String(value)
}

function Filters({ data, range, setRange, draft, setDraft, apply, reset }) {
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  return <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-emerald-800 dark:bg-emerald-950/20 print:hidden">
    <div className="mb-3 flex flex-wrap gap-2">{[['today','Today'],['yesterday','Yesterday'],['week','This Week'],['month','This Month'],['last','Last Month'],['year','This Year']].map(([key, label]) => <button key={key} className="action" onClick={() => setRange(presetRange(key))}>{label}</button>)}</div>
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <input className="field" type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}/><input className="field" type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}/>
      <select className="field" value={draft.vendor} onChange={(event) => set('vendor', event.target.value)}><option value="">All vendors</option>{data.vendors.map((row) => <option key={row.id} value={row.id}>{row.code || '-'} · {row.name}</option>)}</select>
      <select className="field" value={draft.product} onChange={(event) => set('product', event.target.value)}><option value="">All products</option>{data.products.map((row) => <option key={row.id} value={row.id}>{row.code || '-'} · {row.name}</option>)}</select>
      <input className="field" placeholder="Purchase number" value={draft.purchase} onChange={(event) => set('purchase', event.target.value)}/>
      <select className="field" value={draft.method} onChange={(event) => set('method', event.target.value)}><option value="">All payment methods</option>{['cash','bank','cheque','other'].map((value) => <option key={value}>{value}</option>)}</select>
      <select className="field" value={draft.paymentStatus} onChange={(event) => set('paymentStatus', event.target.value)}><option value="">All payment statuses</option>{['Paid','Partial','Unpaid'].map((value) => <option key={value}>{value}</option>)}</select>
      <select className="field" value={draft.chequeStatus} onChange={(event) => set('chequeStatus', event.target.value)}><option value="">All cheque statuses</option><option value="deposited">Deposited</option></select>
      <select className="field" value={draft.bucket} onChange={(event) => set('bucket', event.target.value)}><option value="">All aging buckets</option>{['0-30','31-60','61-90','91-120','120+'].map((value) => <option key={value}>{value}</option>)}</select>
      <input className="field" type="number" placeholder="Minimum amount" value={draft.min} onChange={(event) => set('min', event.target.value)}/><input className="field" type="number" placeholder="Maximum amount" value={draft.max} onChange={(event) => set('max', event.target.value)}/>
      <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400"/><input className="field w-full pl-9" placeholder="Search report" value={draft.search} onChange={(event) => set('search', event.target.value)}/></div>
    </div>
    <div className="mt-3 flex justify-end gap-2"><button className="action" onClick={reset}><RefreshCw size={14}/>Reset</button><button className="action border-emerald-600 bg-emerald-600 !text-white" onClick={apply}><Filter size={14}/>Apply Filters</button></div>
  </section>
}

function Summary({ cards }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-5 print:grid-cols-5">{cards.map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-emerald-800 dark:bg-emerald-950/20"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-bold tabular-nums text-slate-900 dark:text-white">{value}</p></div>)}</div>
}

function ReportTable({ columns, rows, sort, setSort, onVendor }) {
  return <div className="max-h-[68vh] overflow-auto rounded-lg border border-slate-200 bg-white dark:border-emerald-800 dark:bg-emerald-950/20">
    <table className="min-w-full text-xs"><thead className="sticky top-0 z-10 bg-slate-50 dark:bg-emerald-900"><tr>{columns.map((column) => <th key={column.key} onClick={() => setSort({ key: column.key, dir: sort.key === column.key && sort.dir === 'asc' ? 'desc' : 'asc' })} className={`cursor-pointer whitespace-nowrap p-3 font-semibold ${['money','number','percent','days'].includes(column.type) ? 'text-right' : 'text-left'}`}>{column.label}</th>)}{onVendor ? <th className="p-3 text-left print:hidden">Account</th> : null}</tr></thead>
    <tbody>{rows.length ? rows.map((row, index) => <tr key={row.id || row.vendorId || `${index}`} onDoubleClick={() => onVendor?.(row)} className="border-t border-slate-100 hover:bg-emerald-50/60 dark:border-emerald-900/40 dark:hover:bg-emerald-900/20">{columns.map((column) => <td key={column.key} className={`whitespace-nowrap p-3 tabular-nums text-slate-700 dark:text-emerald-50/80 ${['money','number','percent','days'].includes(column.type) ? 'text-right' : ''}`}>{showValue(row, column)}</td>)}{onVendor ? <td className="p-2 print:hidden"><button className="action !px-2 !py-1 text-xs" onClick={() => onVendor(row)}><Eye size={13}/>View</button></td> : null}</tr>) : <tr><td colSpan={columns.length + (onVendor ? 1 : 0)} className="p-12 text-center text-slate-500">No records match the selected report filters.</td></tr>}</tbody></table>
  </div>
}

function AccountDetail({ vendor, activity, close }) {
  if (!vendor) return null
  const cards = [['Total Purchases',money(vendor.purchaseValue)],['Quantity',number(vendor.totalQuantity)],['Total Paid',money(vendor.paymentsMade)],['Outstanding',money(vendor.outstanding)],['Purchases',number(vendor.purchaseCount)],['Products',number(vendor.productsSupplied)],['Oldest Outstanding',vendor.oldestOutstandingPurchase || '-'],['Maximum Aging',`${number(vendor.maximumAgingDays)} days`],['Last Purchase',dateText(vendor.lastPurchaseDate)],['Last Payment',dateText(vendor.lastPaymentDate)]]
  return <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-700 dark:bg-emerald-950/40 print:break-before-page">
    <div className="mb-4 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Vendor account</p><h2 className="text-xl font-bold text-slate-900 dark:text-white">{vendor.vendorCode} · {vendor.name}</h2><p className="text-sm text-slate-600 dark:text-emerald-100/70">{vendor.address || '-'} · {vendor.phone || '-'} · {vendor.status || 'active'} · Created {dateText(vendor.created_at)}</p></div><button className="action print:hidden" onClick={close}><X size={15}/>Close</button></div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{cards.map(([label,value]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-emerald-800 dark:bg-emerald-950/50"><p className="text-[10px] font-bold uppercase text-slate-500">{label}</p><b className="text-sm text-slate-900 dark:text-white">{value}</b></div>)}</div>
    <div className="mt-4"><h3 className="mb-2 font-bold">Account timeline</h3><div className="space-y-2">{activity.slice(0, 12).map((row) => <div key={row.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/40"><div><b>{dateText(row.date)}</b><span className="mx-2 text-slate-400">·</span>{row.activity}<span className="mx-2 text-slate-400">·</span>{row.reference || '-'}</div><b>{row.amount ? money(row.amount) : ''}</b></div>)}{activity.length === 0 ? <p className="text-sm text-slate-500">No account activity recorded.</p> : null}</div></div>
  </section>
}

function ExportDocument({ mode, range, filters, user, vendor, columns, rows, cards, statement }) {
  return <div id="vendor-report-export" className="vendor-export-document fixed left-[-99999px] top-0 w-[1100px] bg-white p-6 text-black print:static print:w-auto print:p-0">
    <div className="flex items-start justify-between border-b-2 border-black pb-3"><div className="flex gap-3"><img src={logo} alt="Logo" className="h-14 w-14 object-contain"/><div><h1 className="text-xl font-bold">Shayan's Kids & Toys</h1><p>Wholesale Management System</p><b>{reportName(mode)}</b>{vendor ? <p>{vendor.code || '-'} · {vendor.name}<br/>{vendor.address || '-'} · {vendor.phone || '-'}</p> : null}</div></div><div className="max-w-[45%] text-right text-xs"><p>Period: {range.from} to {range.to}</p><p>Generated: {new Date().toLocaleString()}</p><p>Generated by: {user || '-'}</p><p>Filters: {Object.entries(filters).filter(([,value]) => value).map(([key,value]) => `${key}: ${value}`).join(', ') || 'None'}</p></div></div>
    {statement ? <div className="my-3 grid grid-cols-5 gap-2 text-xs"><b>Opening: {money(statement.opening)}</b><b>Purchases: {money(statement.totals.purchases)}</b><b>Payments: {money(statement.totals.payments)}</b><b>Returns: {money(statement.totals.returns)}</b><b>Closing: {money(statement.totals.closing)}</b></div> : <div className="my-3 grid grid-cols-5 gap-2 text-xs">{cards.map(([label,value]) => <div key={label}><b>{label}</b><br/>{value}</div>)}</div>}
    <table className="w-full border-collapse text-[8px]"><thead><tr>{columns.map((column) => <th key={column.key} className="border border-slate-400 bg-slate-100 p-1 text-left">{column.label}</th>)}</tr></thead><tbody>{rows.map((row,index) => <tr key={row.id || index}>{columns.map((column) => <td key={column.key} className="border border-slate-300 p-1 align-top">{showValue(row,column)}</td>)}</tr>)}</tbody></table>
    <div className="vendor-print-footer mt-3 border-t border-slate-400 pt-1 text-center text-[8px]">Shayan's Kids & Toys · {reportName(mode)} · Page <span className="vendor-page-number"/></div>
  </div>
}

export default function VendorReportsPage({ initialMode = 'overview' }) {
  const { user } = useAuth(), { can, isSuperAdmin } = usePermissions()
  const [mode,setMode] = useState(initialMode), [range,setRange] = useState(() => presetRange('year'))
  const [draft,setDraft] = useState(emptyFilters), [filters,setFilters] = useState(emptyFilters)
  const [raw,setRaw] = useState(null), [loading,setLoading] = useState(true), [error,setError] = useState('')
  const [page,setPage] = useState(1), [pageSize,setPageSize] = useState(25), [sort,setSort] = useState({key:'date',dir:'desc'})
  const [grouping,setGrouping] = useState('line'), [agingGrouped,setAgingGrouped] = useState(false), [selectedVendor,setSelectedVendor] = useState(null)

  const load = async () => {
    setLoading(true); setError('')
    const [vendors,purchases,items,payments,products,banks] = await Promise.all([
      supabase.from('vendors').select('*').order('name'), supabase.from('purchases').select('*').order('date',{ascending:false}),
      supabase.from('purchase_items').select('*'), supabase.from('purchase_payments').select('*').order('paid_at',{ascending:false}),
      supabase.from('products').select('*').order('name'), supabase.from('banks').select('*').order('name'),
    ])
    const failed = [vendors,purchases,items,payments,products].find((result) => result.error)
    if (failed) { setError(failed.error.message); setRaw(null); setLoading(false); return }
    const [returns,returnItems,audit] = await Promise.all([
      supabase.from('purchase_returns').select('*'), supabase.from('purchase_return_items').select('*'), supabase.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(5000),
    ])
    setRaw({ vendors:vendors.data || [], purchases:purchases.data || [], purchaseItems:items.data || [], purchasePayments:payments.data || [], products:products.data || [], banks:banks.data || [], purchaseReturns:returns.error ? [] : returns.data || [], purchaseReturnItems:returnItems.error ? [] : returnItems.data || [], auditLogs:audit.error ? [] : audit.data || [] })
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  const model = useMemo(() => raw ? buildVendorReportData(raw) : null, [raw])
  useEffect(() => { if (model && ['statement','ledger'].includes(mode) && !filters.vendor && model.vendors[0]) { const vendor = model.vendors[0].id; setDraft((current) => ({...current,vendor})); setFilters((current) => ({...current,vendor})) } }, [mode,model,filters.vendor])
  useEffect(() => { setPage(1); setSelectedVendor(null) }, [mode,filters,range,grouping,agingGrouped,pageSize])

  const baseRows = useMemo(() => model ? rowsForReport(mode,model,range,filters.vendor,grouping,agingGrouped) : [], [mode,model,range,filters.vendor,grouping,agingGrouped])
  const columns = COLUMNS[mode === 'aging' && agingGrouped ? 'agingGroup' : mode] || COLUMNS.overview
  const filteredRows = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return baseRows.filter((row) => {
      const vendorId = row.vendorId || row.vendor_id || (mode === 'overview' ? row.id : '')
      if (filters.vendor && String(vendorId) !== String(filters.vendor)) return false
      const productId = row.productId || row.product_id
      if (filters.product && String(productId) !== String(filters.product) && !(row.items || []).some((item) => String(item.product_id) === String(filters.product))) return false
      if (filters.purchase && !String(row.purchaseNumber || row.reference || '').toLowerCase().includes(filters.purchase.toLowerCase())) return false
      const rowMethod = row.method || row.paymentType
      if (filters.method && rowMethod != null && String(rowMethod).toLowerCase() !== filters.method) return false
      if (filters.paymentStatus && row.paymentStatus != null && String(row.paymentStatus).toLowerCase() !== filters.paymentStatus.toLowerCase()) return false
      if (filters.chequeStatus && row.chequeStatus != null && String(row.chequeStatus).toLowerCase() !== filters.chequeStatus) return false
      const ageKey = {'0-30':'age0','31-60':'age31','61-90':'age61','91-120':'age91','120+':'age120'}[filters.bucket]
      if (filters.bucket && row.bucket != null && row.bucket !== filters.bucket) return false
      if (filters.bucket && row.bucket == null && ageKey && row[ageKey] != null && amount(row[ageKey]) <= 0) return false
      const reportAmount = amount(row.outstanding ?? row.balance ?? row.paymentAmount ?? row.purchaseValue ?? row.lineTotal ?? row.unitCost ?? row.amount)
      if (filters.min && reportAmount < Number(filters.min)) return false
      if (filters.max && reportAmount > Number(filters.max)) return false
      if (q && !columns.some((column) => String(rawValue(row,column.key) ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [baseRows,filters,columns,mode])
  const sorted = useMemo(() => [...filteredRows].sort((a,b) => { const x=rawValue(a,sort.key), y=rawValue(b,sort.key); return (x>y?1:x<y?-1:0)*(sort.dir==='asc'?1:-1) }), [filteredRows,sort])
  const pages = Math.max(1,Math.ceil(sorted.length/pageSize)), visible = sorted.slice((page-1)*pageSize,page*pageSize)
  const statement = useMemo(() => model ? buildStatement(model,filters.vendor,range.from,range.to) : null, [model,filters.vendor,range])
  const activity = useMemo(() => selectedVendor && model ? buildActivityRows(model).filter((row) => row.vendorId === selectedVendor.id) : [], [model,selectedVendor])

  const cards = useMemo(() => {
    const sum = (key) => filteredRows.reduce((total,row) => total + amount(row[key]),0)
    if (mode === 'overview') return [['Total Vendors',number(filteredRows.length)],['Total Purchases',money(sum('purchaseValue'))],['Total Paid',money(sum('paymentsMade'))],['Total Outstanding',money(sum('outstanding'))],['Vendors With Outstanding',number(filteredRows.filter((row) => row.outstanding > 0.005).length)]]
    if (mode === 'statement' || mode === 'ledger') return [['Opening Balance',money(statement?.opening)],['Total Purchases',money(statement?.totals.purchases)],['Total Payments',money(statement?.totals.payments)],['Total Returns',money(statement?.totals.returns)],['Closing Balance',money(statement?.totals.closing)]]
    if (mode === 'outstanding') return [['Total Outstanding',money(sum('balance'))],['Vendors With Due',number(new Set(filteredRows.map((row) => row.vendorId)).size)],['Outstanding Purchases',number(filteredRows.length)],['Oldest Outstanding',filteredRows.length ? `${Math.max(...filteredRows.map((row) => row.days))} days` : '-']]
    if (mode === 'aging') return [['0-30 Days',money(sum('age0'))],['31-60 Days',money(sum('age31'))],['61-90 Days',money(sum('age61'))],['91-120 Days',money(sum('age91'))],['120+ Days',money(sum('age120'))]]
    if (mode === 'payments') { const paid=(method) => filteredRows.filter((row) => method.includes(row.method)).reduce((s,row) => s+row.paymentAmount,0); return [['Total Payments',money(sum('paymentAmount'))],['Cash Payments',money(paid(['cash']))],['Bank Payments',money(paid(['bank']))],['Cheque Payments',money(paid(['cheque']))],['Other Payments',money(paid(['other','card','transfer']))]] }
    if (mode === 'purchases') return [['Rows',number(filteredRows.length)],['Quantity',number(sum('quantity'))],['Purchase Value',money(sum('lineTotal'))],['Paid',money(sum('paid'))],['Outstanding',money(sum('outstanding'))]]
    if (mode === 'cheques') return [['Cheques',number(filteredRows.length)],['Cheque Value',money(sum('paymentAmount'))],['Vendors',number(new Set(filteredRows.map((row) => row.vendorId)).size)],['Deposited',money(filteredRows.filter((row) => row.chequeStatus === 'deposited').reduce((s,row) => s+row.paymentAmount,0))]]
    if (mode === 'products') return [['Vendor / Product Pairs',number(filteredRows.length)],['Quantity',number(sum('quantity'))],['Purchase Value',money(sum('purchaseValue'))],['Vendors',number(new Set(filteredRows.map((row) => row.vendorId)).size)],['Products',number(new Set(filteredRows.map((row) => row.productId)).size)]]
    if (mode === 'costs') return [['Cost Records',number(filteredRows.length)],['Latest Cost',money(filteredRows.at(-1)?.unitCost)],['Average Cost',money(filteredRows.length ? sum('unitCost')/filteredRows.length : 0)],['Lowest Cost',money(filteredRows.length ? Math.min(...filteredRows.map((row) => row.unitCost)) : 0)],['Highest Cost',money(filteredRows.length ? Math.max(...filteredRows.map((row) => row.unitCost)) : 0)]]
    return [['Activities',number(filteredRows.length)],['Vendors',number(new Set(filteredRows.map((row) => row.vendorId)).size)],['Purchases',number(filteredRows.filter((row) => row.activity.includes('Purchase')).length)],['Payments',number(filteredRows.filter((row) => /Payment|Cheque/.test(row.activity)).length)],['Activity Value',money(sum('amount'))]]
  }, [mode,filteredRows,statement])
  const vendor = model?.vendorMap.get(filters.vendor)
  const exportRows = () => sorted.map((row) => Object.fromEntries(columns.map((column) => [column.label,rawValue(row,column.key) ?? ''])))
  const excel = () => { const book=XLSX.utils.book_new(),sheet=XLSX.utils.json_to_sheet(exportRows());XLSX.utils.book_append_sheet(book,sheet,reportName(mode).slice(0,31));XLSX.writeFile(book,`${mode}-vendor-report.xlsx`) }
  const csv = () => { const sheet=XLSX.utils.json_to_sheet(exportRows()),blob=new Blob(['\ufeff'+XLSX.utils.sheet_to_csv(sheet)],{type:'text/csv;charset=utf-8'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${mode}-vendor-report.csv`;link.click();URL.revokeObjectURL(link.href) }
  if (loading) return <LoadingSkeleton/>
  if (!isSuperAdmin && !can('reports_vendors','view')) return <div className="rounded-xl bg-rose-50 p-6 text-rose-700">Vendor Reports permission is required.</div>
  if (!model) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">Could not load Vendor Reports: {error || 'Unknown data error'} <button className="ml-2 underline" onClick={load}>Retry</button></div>

  return <div className="space-y-5">
    <div className="vendor-screen-only space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-4 dark:border-emerald-800 dark:bg-emerald-950/20"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Vendor reports</p><h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{reportName(mode)}</h1><p className="text-sm text-slate-500 dark:text-emerald-100/70">Purchases, products, payments, balances, aging, cheques, costs and account activity.</p></div><div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/40"><b>{range.from}</b> to <b>{range.to}</b></div></div></header>
      <div className="flex gap-2 overflow-x-auto pb-1">{REPORTS.map(([key,label]) => <button key={key} onClick={() => setMode(key)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${mode===key?'bg-emerald-600 text-white':'border border-slate-200 bg-white text-slate-600 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'}`}>{label}</button>)}</div>
      <Filters data={raw} range={range} setRange={setRange} draft={draft} setDraft={setDraft} apply={() => setFilters(draft)} reset={() => {setDraft(emptyFilters);setFilters(emptyFilters)}}/>
      <Summary cards={cards}/>
      {['statement','ledger'].includes(mode) && vendor ? <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/20"><b>Shayan's Kids & Toys · {reportName(mode)}</b><div className="mt-2 grid gap-1 md:grid-cols-2"><p><b>Vendor:</b> {vendor.code || '-'} · {vendor.name}</p><p><b>Period:</b> {range.from} to {range.to}</p><p><b>Address:</b> {vendor.address || '-'}</p><p><b>Phone:</b> {vendor.phone || '-'}</p><p><b>Opening Balance:</b> {money(statement?.opening)}</p><p><b>Closing Balance:</b> {money(statement?.totals.closing)}</p></div></div> : null}
      {(mode === 'statement' || mode === 'ledger') && !filters.vendor ? <div className="rounded-lg bg-amber-50 p-4 text-amber-700">Select a vendor to generate the account statement or ledger.</div> : null}
      <AccountDetail vendor={selectedVendor} activity={activity} close={() => setSelectedVendor(null)}/>
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'purchases' ? <select className="field" value={grouping} onChange={(event) => setGrouping(event.target.value)}><option value="line">Group: Purchase lines</option><option value="purchase">Group: Purchase</option><option value="product">Group: Product</option><option value="month">Group: Month</option></select> : null}
        {mode === 'aging' ? <button className="action" onClick={() => setAgingGrouped((value) => !value)}>{agingGrouped ? 'Show purchase aging' : 'Group aging by vendor'}</button> : null}
        <select className="field" value={sort.key} onChange={(event) => setSort({key:event.target.value,dir:sort.dir})}><option value="date">Sort: Date</option>{columns.map((column) => <option key={column.key} value={column.key}>Sort: {column.label}</option>)}</select><button className="action" onClick={() => setSort((current) => ({...current,dir:current.dir==='asc'?'desc':'asc'}))}>{sort.dir === 'asc' ? 'Ascending' : 'Descending'}</button><span className="ml-auto text-sm text-slate-500">{number(sorted.length)} filtered records</span>
        {(isSuperAdmin || can('reports_vendors','print')) ? <button className="action" onClick={() => window.print()}><Printer size={15}/>Print</button> : null}
        {(isSuperAdmin || can('reports_vendors','export')) ? <><button className="action" onClick={() => exportToPDF('vendor-report-export',`${mode}-vendor-report.pdf`,{orientation:mode==='statement'?'portrait':'landscape',scale:1.5,pageNumbers:true})}><FileText size={15}/>PDF</button><button className="action" onClick={excel}><Download size={15}/>Excel</button><button className="action" onClick={csv}><Download size={15}/>CSV</button></> : null}
      </div>
      <ReportTable columns={columns} rows={visible} sort={sort} setSort={setSort} onVendor={mode==='overview' ? setSelectedVendor : null}/>
      <div className="flex items-center justify-between rounded-lg border bg-white p-3 dark:border-emerald-800 dark:bg-emerald-950/20"><span className="text-sm text-slate-500">Page {page} of {pages} · {sorted.length} records</span><div className="flex gap-2"><select className="field" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{[10,25,50,100].map((value) => <option key={value}>{value}</option>)}</select><button className="action" disabled={page===1} onClick={() => setPage((value) => value-1)}>Previous</button><button className="action" disabled={page===pages} onClick={() => setPage((value) => value+1)}>Next</button></div></div>
    </div>
    <ExportDocument mode={mode} range={range} filters={filters} user={user?.email} vendor={vendor} columns={columns} rows={sorted} cards={cards} statement={['statement','ledger'].includes(mode)?statement:null}/>
  </div>
}

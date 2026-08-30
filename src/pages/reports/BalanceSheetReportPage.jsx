import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, FileSpreadsheet, Printer, RefreshCw, Scale } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useToast } from '../../contexts/ToastContext'
import { balanceSheetRows, buildBalanceSheet } from '../../lib/balanceSheet.js'
import { exportToPDF, LoadingSkeleton } from '../../components/reports'
import logo from '../../pictures/logo.jpeg'

const TABLES = ['products', 'beginning_stock', 'beginning_stock_items', 'purchases', 'purchase_items', 'purchase_returns', 'purchase_return_items', 'stock_adjustments', 'invoices', 'invoice_items', 'invoice_payments', 'returns', 'return_items', 'purchase_payments', 'customers', 'vendors', 'banks', 'customer_cheques', 'bank_reconciliation_items', 'employees', 'rep_commission_payments', 'journals', 'journal_entries', 'journal_entry_lines', 'expenses']
const OPTIONAL = new Set(['beginning_stock', 'beginning_stock_items', 'purchase_returns', 'purchase_return_items', 'stock_adjustments', 'bank_reconciliation_items', 'rep_commission_payments', 'expenses'])
const money = (value) => `Rs. ${Number(value ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const iso = (value) => value.toISOString().slice(0, 10)
const displayDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-LK', { day: '2-digit', month: 'long', year: 'numeric' })
const today = () => iso(new Date())
const lastMonthEnd = () => { const value = new Date(); return iso(new Date(value.getFullYear(), value.getMonth(), 0)) }
const lastYearEnd = () => iso(new Date(new Date().getFullYear() - 1, 11, 31))
const previousMonthEnd = (value) => { const dateValue = new Date(`${value}T00:00:00`); return iso(new Date(dateValue.getFullYear(), dateValue.getMonth(), 0)) }

function AmountRow({ label, amount, level = 0, total = false, grand = false, onClick }) {
  return <button type="button" onClick={onClick} disabled={!onClick} className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-2 text-left text-sm dark:border-emerald-400/10 ${onClick ? 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : ''} ${total ? 'bg-slate-50 font-black dark:bg-emerald-950/50' : ''} ${grand ? 'border-y-2 border-slate-700 bg-emerald-50 py-3 text-base font-black dark:border-emerald-300 dark:bg-emerald-900/30' : ''}`}>
    <span style={{ paddingLeft: level * 18 }}>{label}</span><span className="whitespace-nowrap tabular-nums">{money(amount)}</span>
  </button>
}

function SectionTitle({ children }) {
  return <div className="border-b-2 border-emerald-700 px-4 pb-1 pt-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-800 dark:border-emerald-400 dark:text-emerald-300">{children}</div>
}

function Statement({ model, open }) {
  const t = model.totals
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/25 dark:text-white">
    <div className="bg-emerald-700 px-4 py-3 text-center text-sm font-black uppercase tracking-widest text-white">Balance Sheet</div>
    <SectionTitle>Assets</SectionTitle><div className="px-4 py-2 text-xs font-black uppercase text-slate-500 dark:text-emerald-100/60">Current Assets</div>
    <AmountRow label="Cash in Hand" amount={t.cash} onClick={() => open('cash')}/><AmountRow label="Bank Balances" amount={t.banks} onClick={() => open('banks')}/><AmountRow label="Accounts Receivable" amount={t.receivables} onClick={() => open('receivables')}/><AmountRow label="Cheques in Hand" amount={t.cheques} onClick={() => open('cheques')}/><AmountRow label="Inventory" amount={t.inventory} onClick={() => open('inventory')}/><AmountRow label="Rep Advances" amount={t.repAdvances} onClick={() => open('repPositions')}/><AmountRow label="Other Current Assets" amount={t.otherCurrentAssets} onClick={() => open('otherAssets')}/><AmountRow label="Total Current Assets" amount={t.currentAssets} total/>
    <div className="px-4 py-2 text-xs font-black uppercase text-slate-500 dark:text-emerald-100/60">Non-Current Assets</div><AmountRow label="Fixed Assets" amount={t.fixedAssets} onClick={() => open('fixedAssets')}/><AmountRow label="Total Non-Current Assets" amount={t.fixedAssets} total/><AmountRow label="TOTAL ASSETS" amount={t.totalAssets} grand/>
    <SectionTitle>Liabilities</SectionTitle><div className="px-4 py-2 text-xs font-black uppercase text-slate-500 dark:text-emerald-100/60">Current Liabilities</div>
    <AmountRow label="Accounts Payable" amount={t.payables} onClick={() => open('payables')}/><AmountRow label="Rep Commission Payable" amount={t.commissionPayable} onClick={() => open('repPositions')}/><AmountRow label="Other Payables / Liabilities" amount={t.otherCurrentLiabilities} onClick={() => open('currentLiabilities')}/><AmountRow label="Total Current Liabilities" amount={t.currentLiabilities} total/><AmountRow label="Non-Current Liabilities" amount={t.nonCurrentLiabilities} onClick={() => open('nonCurrentLiabilities')}/><AmountRow label="TOTAL LIABILITIES" amount={t.totalLiabilities} grand/>
    <SectionTitle>Equity</SectionTitle><AmountRow label="Opening Capital / Owner's Equity" amount={t.openingCapital} onClick={() => open('capital')}/><AmountRow label="Retained Earnings / Accumulated Profit" amount={t.retainedEarnings} onClick={() => open('retained')}/><AmountRow label={t.currentProfit < 0 ? 'Current Period Loss' : 'Current Period Profit'} amount={t.currentProfit}/><AmountRow label="Other Equity Accounts" amount={t.otherEquity} onClick={() => open('otherEquity')}/><AmountRow label="TOTAL EQUITY" amount={t.totalEquity} grand/><AmountRow label="TOTAL LIABILITIES + EQUITY" amount={t.liabilitiesAndEquity} grand/>
    <SectionTitle>Balance Check</SectionTitle><AmountRow label="Assets" amount={t.totalAssets}/><AmountRow label="Liabilities + Equity" amount={t.liabilitiesAndEquity}/><AmountRow label="Difference" amount={t.difference} total/><div className={`px-4 py-3 text-center font-black ${t.balanced ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{t.balanced ? 'BALANCED �w^~)�w' : 'BALANCE SHEET OUT OF BALANCE'}</div>
  </div>
}

const DETAIL_COLUMNS = {
  cash: [['date', 'Date'], ['source', 'Transaction Type'], ['reference', 'Reference'], ['cashIn', 'Cash In', 'money'], ['cashOut', 'Cash Out', 'money'], ['balance', 'Ledger Balance', 'money']],
  receivables: [['customer', 'Customer'], ['invoice', 'Invoice'], ['date', 'Invoice Date'], ['invoiceTotal', 'Invoice Total', 'money'], ['payments', 'Payments', 'money'], ['returns', 'Returns', 'money'], ['returnedCheque', 'Returned Cheque', 'money'], ['outstanding', 'Outstanding', 'money']],
  payables: [['vendor', 'Vendor'], ['purchase', 'Purchase'], ['date', 'Purchase Date'], ['purchaseTotal', 'Purchase Total', 'money'], ['payments', 'Payments', 'money'], ['outstanding', 'Outstanding', 'money']],
  inventory: [['code', 'Product Code'], ['product', 'Product'], ['quantity', 'Qty'], ['backorder', 'Backorder'], ['unitCost', 'Unit Cost', 'money'], ['value', 'Inventory Value', 'money']],
  banks: [['code', 'Code'], ['bank', 'Bank'], ['account', 'Account'], ['balance', 'Balance', 'money']],
  cheques: [['customer', 'Customer'], ['chequeNumber', 'Cheque Number'], ['bank', 'Bank'], ['chequeDate', 'Cheque Date'], ['amount', 'Amount', 'money'], ['status', 'Status']],
  repPositions: [['rep', 'Rep'], ['earned', 'Earned', 'money'], ['paid', 'Paid', 'money'], ['payable', 'Payable', 'money'], ['advance', 'Advance', 'money']],
}
const ACCOUNT_COLUMNS = [['code', 'Code'], ['name', 'Account'], ['balance', 'Balance', 'money']]

function Detail({ name, rows, close }) {
  const columns = DETAIL_COLUMNS[name] ?? ACCOUNT_COLUMNS
  return <div className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-black capitalize text-slate-900 dark:text-white">{name.replaceAll(/([A-Z])/g, ' $1')} Breakdown</h3><p className="text-xs text-slate-500">{rows.length} source records</p></div><button onClick={close} className="rounded-lg border px-3 py-1 text-sm font-bold">Close</button></div><div className="max-h-96 overflow-auto"><table className="min-w-full whitespace-nowrap text-sm"><thead className="sticky top-0 bg-slate-50 dark:bg-emerald-950"><tr>{columns.map(([, label, type]) => <th key={label} className={`px-3 py-2 text-[10px] uppercase text-slate-500 ${type === 'money' ? 'text-right' : 'text-left'}`}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index} className="border-t border-slate-100 dark:border-emerald-400/10">{columns.map(([key, , type]) => <td key={key} className={`px-3 py-2 text-slate-700 dark:text-emerald-50 ${type === 'money' ? 'text-right font-semibold tabular-nums' : ''}`}>{type === 'money' ? money(row[key]) : String(row[key] ?? '-')}</td>)}</tr>)}{!rows.length && <tr><td colSpan={columns.length} className="p-8 text-center text-slate-500">No source records for this balance.</td></tr>}</tbody></table></div></div>
}

function Comparison({ current, previous, asAt, previousAsAt }) {
  const metrics = [['Cash', 'cash'], ['Banks', 'banks'], ['Receivables', 'receivables'], ['Cheques', 'cheques'], ['Inventory', 'inventory'], ['Total Assets', 'totalAssets'], ['Payables', 'payables'], ['Commission Payable', 'commissionPayable'], ['Total Liabilities', 'totalLiabilities'], ['Total Equity', 'totalEquity']]
  return <div className="overflow-hidden rounded-xl border bg-white dark:border-emerald-400/20 dark:bg-emerald-950/25"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="bg-slate-50 dark:bg-emerald-950"><th className="p-3 text-left">Account</th><th className="p-3 text-right">{displayDate(asAt)}</th><th className="p-3 text-right">{displayDate(previousAsAt)}</th><th className="p-3 text-right">Change</th></tr></thead><tbody>{metrics.map(([label, key]) => <tr key={key} className="border-t"><td className="p-3 font-bold">{label}</td><td className="p-3 text-right">{money(current[key])}</td><td className="p-3 text-right">{money(previous[key])}</td><td className={`p-3 text-right font-bold ${current[key] - previous[key] < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(current[key] - previous[key])}</td></tr>)}</tbody></table></div></div>
}

function PdfRow({ label, value, strong = false }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: strong ? '8px 10px' : '6px 10px', background: strong ? '#f8fafc' : '#fff', color: '#0f172a', fontSize: strong ? '12px' : '11px', fontWeight: strong ? 800 : 500 }}><span>{label}</span><span style={{ flex: '0 0 180px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: strong ? 800 : 600 }}>{money(value)}</span></div>
}
function PdfSection({ title, children }) {
  return <section style={{ marginTop: '11px', breakInside: 'avoid' }}><div style={{ borderBottom: '2px solid #047857', padding: '0 10px 4px', color: '#065f46', fontSize: '10px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>{title}</div>{children}</section>
}
function PrintDocument({ model, generatedBy }) {
  const t = model.totals
  return <div id="balance-sheet-print" style={{ width: '760px', minHeight: '1030px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', background: '#fff', color: '#0f172a', fontFamily: 'Arial, sans-serif', padding: '34px 40px 28px' }}><header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #047857', paddingBottom: '13px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}><img src={logo} alt="Company logo" style={{ width: '56px', height: '56px', borderRadius: '7px', objectFit: 'cover' }}/><div><h1 style={{ margin: 0, fontSize: '20px' }}>Shayan's Kids & Toys Store</h1><p style={{ margin: '4px 0 0', color: '#475569', fontSize: '10px' }}>Wholesale Management System - Sri Lanka</p></div></div><div style={{ textAlign: 'right' }}><h2 style={{ margin: 0, color: '#065f46', fontSize: '18px' }}>BALANCE SHEET</h2><p style={{ margin: '5px 0 0', fontSize: '10px' }}>As at {displayDate(model.asAt)}</p></div></header>
    <PdfSection title="Assets"><PdfRow label="Cash in Hand" value={t.cash}/><PdfRow label="Bank Balances" value={t.banks}/><PdfRow label="Accounts Receivable" value={t.receivables}/><PdfRow label="Cheques in Hand" value={t.cheques}/><PdfRow label="Inventory" value={t.inventory}/><PdfRow label="Rep Advances" value={t.repAdvances}/><PdfRow label="Other Current Assets" value={t.otherCurrentAssets}/><PdfRow label="Total Current Assets" value={t.currentAssets} strong/><PdfRow label="Fixed Assets" value={t.fixedAssets}/><PdfRow label="TOTAL ASSETS" value={t.totalAssets} strong/></PdfSection>
    <PdfSection title="Liabilities"><PdfRow label="Accounts Payable" value={t.payables}/><PdfRow label="Rep Commission Payable" value={t.commissionPayable}/><PdfRow label="Other Current Liabilities" value={t.otherCurrentLiabilities}/><PdfRow label="Non-Current Liabilities" value={t.nonCurrentLiabilities}/><PdfRow label="TOTAL LIABILITIES" value={t.totalLiabilities} strong/></PdfSection>
    <PdfSection title="Equity"><PdfRow label="Opening Capital / Owner's Equity" value={t.openingCapital}/><PdfRow label="Retained Earnings" value={t.retainedEarnings}/><PdfRow label={t.currentProfit < 0 ? 'Current Period Loss' : 'Current Period Profit'} value={t.currentProfit}/><PdfRow label="Other Equity" value={t.otherEquity}/><PdfRow label="TOTAL EQUITY" value={t.totalEquity} strong/><PdfRow label="TOTAL LIABILITIES + EQUITY" value={t.liabilitiesAndEquity} strong/></PdfSection>
    <PdfSection title="Balance Check"><PdfRow label="Total Assets" value={t.totalAssets}/><PdfRow label="Liabilities + Equity" value={t.liabilitiesAndEquity}/><PdfRow label="Difference" value={t.difference} strong/><div style={{ padding: '8px', background: t.balanced ? '#ecfdf5' : '#fff1f2', color: t.balanced ? '#065f46' : '#9f1239', textAlign: 'center', fontSize: '12px', fontWeight: 800 }}>{t.balanced ? 'BALANCED' : 'BALANCE SHEET OUT OF BALANCE'}</div></PdfSection>
    <footer style={{ marginTop: 'auto', borderTop: '1px solid #cbd5e1', paddingTop: '8px', color: '#64748b', textAlign: 'center', fontSize: '9px' }}>Generated by {generatedBy} on {new Date().toLocaleString()}</footer>
  </div>
}

export default function BalanceSheetReportPage() {
  const toast = useToast()
  const { user } = useAuth()
  const { can, isSuperAdmin, record } = usePermissions()
  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [warnings, setWarnings] = useState([])
  const [preset, setPreset] = useState('today')
  const [draftAsAt, setDraftAsAt] = useState(today)
  const [asAt, setAsAt] = useState(today)
  const [detail, setDetail] = useState('')
  const [compare, setCompare] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const canPrint = isSuperAdmin || can('reports_balance_sheet', 'print')
  const canExport = isSuperAdmin || can('reports_balance_sheet', 'export')
  const generatedBy = record?.display_name ?? user?.user_metadata?.display_name ?? user?.email ?? 'Authenticated user'

  const load = async () => {
    setLoading(true)
    const results = await Promise.all(TABLES.map(async (table) => ({ table, ...(await supabase.from(table).select('*')) })))
    const next = {}
    const failed = []
    results.forEach(({ table, data, error }) => {
      next[table] = data ?? []
      if (error && !OPTIONAL.has(table)) failed.push(`${table}: ${error.message}`)
    })
    setRaw(next)
    setWarnings(failed)
    setLoading(false)
  }
  useEffect(() => { load().catch((error) => { toast.error(error.message ?? 'Failed to load Balance Sheet'); setLoading(false) }) }, [])
  const model = useMemo(() => raw ? buildBalanceSheet(raw, { asAt }) : null, [raw, asAt])
  const previousAsAt = useMemo(() => previousMonthEnd(asAt), [asAt])
  const previousModel = useMemo(() => raw ? buildBalanceSheet(raw, { asAt: previousAsAt }) : null, [raw, previousAsAt])
  const choosePreset = (key) => {
    const value = key === 'last-month' ? lastMonthEnd() : key === 'last-year' ? lastYearEnd() : today()
    setPreset(key)
    setDraftAsAt(value)
    setAsAt(value)
    setDetail('')
  }
  const exportRows = () => balanceSheetRows(model).map((row) => ({ Section: row.section, Category: row.category, Account: row.account, Amount: row.amount, 'As At': model.asAt }))
  const exportExcel = () => {
    if (!model) return
    const workbook = XLSX.utils.book_new()
    const sheets = [
      ['Balance Sheet', exportRows()],
      ['Receivable Breakdown', model.details.receivables],
      ['Payable Breakdown', model.details.payables],
      ['Inventory Breakdown', model.details.inventory],
      ['Bank Breakdown', model.details.banks],
      ['Cheque Breakdown', model.details.cheques],
    ]
    sheets.forEach(([name, data]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.length ? data : [{ Message: 'No records' }]), name))
    XLSX.writeFile(workbook, `balance-sheet-${asAt}.xlsx`)
  }
  const exportCsv = () => {
    const text = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(exportRows()))
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    link.download = `balance-sheet-${asAt}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const downloadPdf = () => {
    if (loading || !model) return toast.error('Balance Sheet data is still loading.')
    console.log('BALANCE SHEET PDF DATA:', model)
    exportToPDF('balance-sheet-print', `balance-sheet-${asAt}.pdf`, { orientation: 'portrait', margin: 0.48, scale: 2, pageNumbers: true })
  }
  const printReport = () => {
    const node = document.getElementById('balance-sheet-print')
    const popup = window.open('', '_blank', 'width=900,height=800')
    if (!node || !popup) return toast.error('Allow popups to print this report.')
    popup.document.write(`<html><head><title>Balance Sheet</title><style>@page{size:A4 portrait;margin:12mm}body{margin:0;background:#fff}</style></head><body>${node.outerHTML}<script>window.onload=()=>{window.print();window.close()}</script></body></html>`)
    popup.document.close()
  }
  if (loading || !model) return <LoadingSkeleton />
  const t = model.totals
  const detailRows = detail ? model.details[detail] ?? [] : []
  return <div className="space-y-5 text-slate-800 dark:text-emerald-50">
    <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Shayan's Kids & Toys Store</p><h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">Balance Sheet</h1><p className="mt-1 text-sm text-slate-500 dark:text-emerald-100/70">Financial position as at {displayDate(asAt)}</p></div><div className="flex flex-wrap gap-2"><button onClick={load} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><RefreshCw size={15}/> Refresh</button>{canPrint && <button onClick={printReport} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><Printer size={15}/> Print</button>}{canExport && <><button onClick={downloadPdf} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><Download size={15}/> PDF</button><button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white"><FileSpreadsheet size={15}/> Excel</button><button onClick={exportCsv} className="rounded-lg border px-3 py-2 text-sm font-bold">CSV</button></>}</div></div></header>
    {warnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><b>Some required sources could not be loaded.</b><ul className="mt-1 list-disc pl-5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-emerald-400/20 dark:bg-emerald-950/30"><div className="flex flex-wrap gap-2">{[['today', 'Today'], ['last-month', 'End of Last Month'], ['last-year', 'End of Last Year']].map(([key, label]) => <button key={key} onClick={() => choosePreset(key)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${preset === key ? 'bg-emerald-600 text-white' : 'border text-slate-700 dark:text-emerald-50'}`}>{label}</button>)}<button onClick={() => setPreset('custom')} className={`rounded-full px-3 py-1.5 text-xs font-bold ${preset === 'custom' ? 'bg-emerald-600 text-white' : 'border'}`}>Custom As At</button></div><div className="mt-3 flex max-w-md gap-2"><input type="date" value={draftAsAt} onChange={(event) => { setPreset('custom'); setDraftAsAt(event.target.value) }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-white"/><button onClick={() => { setAsAt(draftAsAt); setDetail('') }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white dark:bg-emerald-600">Apply</button></div></section>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Total Assets', t.totalAssets], ['Total Liabilities', t.totalLiabilities], ['Total Equity', t.totalEquity]].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/25"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-lg font-black text-slate-900 dark:text-white">{money(value)}</div></div>)}<div className={`rounded-xl border p-4 shadow-sm ${t.balanced ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-rose-300 bg-rose-50 text-rose-800'}`}><div className="text-[10px] font-black uppercase tracking-wider">Balance Status</div><div className="mt-1 text-lg font-black">{t.balanced ? 'BALANCED �w^~)�w' : money(t.difference)}</div></div></div>
    {model.diagnostics.length > 0 && <div className={`rounded-lg border p-3 text-sm ${t.balanced ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}><b>{t.balanced ? 'Accounting diagnostics' : 'Balance Sheet requires review'}</b><ul className="mt-1 list-disc pl-5">{model.diagnostics.map((warning) => <li key={warning}>{warning}</li>)}</ul>{isSuperAdmin && <button onClick={() => setShowDiagnostics((value) => !value)} className="mt-2 font-black underline">{showDiagnostics ? 'Hide' : 'View'} Balance Difference</button>}</div>}
    {isSuperAdmin && showDiagnostics && <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-800"><h3 className="font-black">Balance Difference Diagnostics</h3><div className="mt-3 grid gap-3 md:grid-cols-3"><div><b>Assets</b><p>Total: {money(t.totalAssets)}</p><p>Cash {money(t.cash)} � Banks {money(t.banks)} � Receivables {money(t.receivables)} � Inventory {money(t.inventory)}</p></div><div><b>Liabilities</b><p>Total: {money(t.totalLiabilities)}</p><p>Payables {money(t.payables)} � Commission {money(t.commissionPayable)} � Other {money(t.otherCurrentLiabilities + t.nonCurrentLiabilities)}</p></div><div><b>Equity</b><p>Total: {money(t.totalEquity)}</p><p>Capital {money(t.openingCapital)} � Retained {money(t.retainedEarnings)} � Current P/L {money(t.currentProfit)}</p></div></div><div className="mt-3 border-t border-sky-200 pt-2 font-black">Exact difference: {money(t.difference)}</div></div>}
    <div className="flex gap-2"><button onClick={() => setCompare(false)} className={`rounded-lg px-4 py-2 text-sm font-bold ${!compare ? 'bg-emerald-600 text-white' : 'border bg-white'}`}>Balance Sheet</button><button onClick={() => setCompare(true)} className={`rounded-lg px-4 py-2 text-sm font-bold ${compare ? 'bg-emerald-600 text-white' : 'border bg-white'}`}>Compare Previous Period</button></div>
    {compare ? <Comparison current={t} previous={previousModel.totals} asAt={asAt} previousAsAt={previousAsAt}/> : <Statement model={model} open={(key) => setDetail(detail === key ? '' : key)}/>}
    {!compare && detail && <Detail name={detail} rows={detailRows} close={() => setDetail('')}/>}
    <div aria-hidden="true" style={{ position: 'fixed', left: '-12000px', top: 0, width: '760px', background: '#fff' }}><PrintDocument model={model} generatedBy={generatedBy}/></div>
  </div>
}

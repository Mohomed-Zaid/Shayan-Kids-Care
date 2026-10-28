import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  Landmark,
  Layers,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useToast } from '../../contexts/ToastContext'
import { buildFinanceReports, formatReconReference } from '../../lib/financeReports'
import { exportToExcel, exportToPDF, LoadingSkeleton } from '../../components/reports'
import logo from '../../pictures/logo.jpeg'

const TABLES = [
  'invoices',
  'invoice_payments',
  'purchases',
  'purchase_payments',
  'customers',
  'vendors',
  'banks',
  'customer_cheques',
  'bank_reconciliation_items',
  'returns',
]

const MONEY = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const money = (value) => MONEY.format(Number(value ?? 0))
const iso = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const formatDate = (value) =>
  value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString() : '-'

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 dark:border-emerald-400/20 dark:bg-slate-950 dark:text-emerald-50'

function presetRange(key) {
  if (key === 'all') return { from: '', to: '' }
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const to = new Date(from)
  if (key === 'yesterday') {
    from.setDate(from.getDate() - 1)
    to.setDate(to.getDate() - 1)
  } else if (key === 'week') {
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7))
  } else if (key === 'month') {
    from.setDate(1)
  } else if (key === 'last-month') {
    from.setMonth(from.getMonth() - 1, 1)
    to.setDate(0)
  } else if (key === 'year') {
    from.setMonth(0, 1)
  }
  return { from: iso(from), to: iso(to) }
}

const DATE_PRESETS = [
  ['all', 'All Dates'],
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'This Week'],
  ['month', 'This Month'],
  ['last-month', 'Last Month'],
  ['year', 'This Year'],
  ['custom', 'Custom Range'],
]

const TYPE_BUTTONS = [
  ['', 'All Types'],
  ['Customer Cheque Deposit', 'Customer Cheques'],
  ['Customer Bank Transfer', 'Customer Transfers'],
  ['Vendor Bank Transfer', 'Vendor Transfers'],
  ['Vendor Cheque Payment', 'Vendor Cheques'],
]

const STATUS_BUTTONS = [
  ['', 'All Status'],
  ['Yes', 'Reconciled (YES)'],
  ['No', 'Pending / Unreconciled (NO)'],
]

const FLOW_BUTTONS = [
  ['', 'All Cash Flow'],
  ['in', 'Money In (+)'],
  ['out', 'Money Out (-)'],
]

function getTypeBadgeClass(type) {
  const t = String(type || '').toLowerCase()
  if (t.includes('customer cheque')) {
    return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700'
  }
  if (t.includes('customer bank')) {
    return 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-700'
  }
  if (t.includes('vendor bank')) {
    return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700'
  }
  if (t.includes('vendor cheque')) {
    return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
  }
  return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
}

function StatementRow({ label, count, amount, strong, negative, highlight, onClick, indent }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left transition dark:border-emerald-400/10 ${
        highlight
          ? 'bg-emerald-700 text-base font-black text-white'
          : strong
          ? 'bg-slate-50 text-sm font-black dark:bg-emerald-950/50 text-slate-900 dark:text-white'
          : 'text-sm font-medium text-slate-700 dark:text-emerald-50'
      } ${onClick && !highlight ? 'hover:bg-emerald-50/70 dark:hover:bg-emerald-500/10 cursor-pointer' : ''}`}
    >
      <div className={`flex items-center gap-2 ${indent ? 'pl-5' : ''}`}>
        <span>{label}</span>
        {typeof count === 'number' && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              highlight
                ? 'bg-white/20 text-white'
                : 'bg-slate-200/70 text-slate-700 dark:bg-emerald-900/60 dark:text-emerald-200'
            }`}
          >
            {count}
          </span>
        )}
      </div>
      <span
        className={`tabular-nums ${
          highlight
            ? 'text-white'
            : negative
            ? 'text-rose-600 dark:text-rose-300 font-bold'
            : 'text-slate-900 dark:text-white font-semibold'
        }`}
      >
        {negative ? `- ${money(Math.abs(amount))}` : money(amount)}
      </span>
    </Tag>
  )
}

export default function BankReconciliationReportPage() {
  const toast = useToast()
  const { user } = useAuth()
  const { can, isSuperAdmin, record } = usePermissions()

  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('transactions') // 'transactions' | 'statement' | 'bank-summary'
  const [preset, setPreset] = useState('all')
  const [range, setRange] = useState(() => presetRange('all'))
  const [selectedBankId, setSelectedBankId] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedFlow, setSelectedFlow] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const canPrint = isSuperAdmin || can('reports_finance', 'print')
  const canExport = isSuperAdmin || can('reports_finance', 'export')
  const generatedBy = record?.display_name ?? user?.email ?? 'Authenticated user'

  const load = async () => {
    setLoading(true)
    try {
      const results = await Promise.all(
        TABLES.map(async (table) => ({ table, ...(await supabase.from(table).select('*')) }))
      )
      const next = {}
      results.forEach(({ table, data }) => {
        next[table] = data ?? []
      })

      // Automatically clean up any duplicate ref_no rows in bank_reconciliation_items
      const reconItems = next.bank_reconciliation_items ?? []
      if (reconItems.length > 1) {
        const chequesMap = new Map((next.customer_cheques ?? []).map((c) => [String(c.id), c]))
        const seenByRef = new Map()
        const duplicateIds = []

        const scoreItem = (r) => {
          let s = r.reconciled ? 100 : 0
          const refU = String(r.ref_no || '').trim().toUpperCase()
          if (refU.startsWith('RCV-CHQ-')) {
            const chq = chequesMap.get(String(r.ref_no || '').trim().slice(8))
            if (chq?.deposit_bank_id && String(r.bank_id) === String(chq.deposit_bank_id)) s += 50
          }
          return s
        }

        reconItems.forEach((item) => {
          const refKey = String(item.ref_no || '').trim().toLowerCase()
          if (!refKey) return
          const existing = seenByRef.get(refKey)
          if (!existing) {
            seenByRef.set(refKey, item)
          } else {
            if (scoreItem(item) > scoreItem(existing)) {
              duplicateIds.push(existing.id)
              seenByRef.set(refKey, item)
            } else {
              duplicateIds.push(item.id)
            }
          }
        })

        if (duplicateIds.length > 0) {
          supabase
            .from('bank_reconciliation_items')
            .delete()
            .in('id', duplicateIds)
            .then(() => {})
            .catch(() => {})
          const dupSet = new Set(duplicateIds)
          next.bank_reconciliation_items = reconItems.filter((r) => !dupSet.has(r.id))
        }
      }

      setRaw(next)
    } catch (err) {
      toast.error(err?.message ?? 'Failed to load Bank Reconciliation Report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const banks = useMemo(() => raw?.banks ?? [], [raw])
  const allReconRows = useMemo(() => (raw ? buildFinanceReports(raw)['bank-reconciliation'] ?? [] : []), [raw])

  const selectedBankObj = useMemo(
    () => banks.find((b) => String(b.id) === String(selectedBankId)),
    [banks, selectedBankId]
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allReconRows.filter((row) => {
      const d = row.date ? String(row.date).slice(0, 10) : ''
      if (range.from && d && d < range.from) return false
      if (range.to && d && d > range.to) return false

      if (selectedBankId) {
        const matchId = String(row.bankId) === String(selectedBankId)
        const matchName =
          selectedBankObj?.name &&
          String(row.bank || '').toLowerCase() === String(selectedBankObj.name).toLowerCase()
        if (!matchId && !matchName) return false
      }

      if (selectedType && row.transactionType !== selectedType) return false
      if (selectedStatus && row.reconciled !== selectedStatus) return false
      if (selectedFlow === 'in' && !(Number(row.deposit) > 0)) return false
      if (selectedFlow === 'out' && !(Number(row.withdrawal) > 0)) return false

      if (q) {
        const hay = `${row.bank} ${row.transactionType} ${row.party} ${row.reference} ${row.description} ${row.chequeNumber}`.toLowerCase()
        if (!hay.includes(q)) return false
      }

      return true
    })
  }, [allReconRows, range, selectedBankId, selectedBankObj, selectedType, selectedStatus, selectedFlow, search])

  const metrics = useMemo(() => {
    let totalIn = 0
    let totalOut = 0
    let reconciledIn = 0
    let reconciledOut = 0
    let unreconciledIn = 0
    let unreconciledOut = 0
    let reconciledCount = 0
    let unreconciledCount = 0

    let rcvChequeAmt = 0
    let rcvChequeCount = 0
    let rcvTransferAmt = 0
    let rcvTransferCount = 0
    let payTransferAmt = 0
    let payTransferCount = 0
    let payChequeAmt = 0
    let payChequeCount = 0

    filteredRows.forEach((r) => {
      const dep = Number(r.deposit ?? 0)
      const wth = Number(r.withdrawal ?? 0)
      const isRec = r.reconciled === 'Yes'

      totalIn += dep
      totalOut += wth

      if (isRec) {
        reconciledCount++
        reconciledIn += dep
        reconciledOut += wth
      } else {
        unreconciledCount++
        unreconciledIn += dep
        unreconciledOut += wth
      }

      if (r.transactionType === 'Customer Cheque Deposit') {
        rcvChequeAmt += dep
        rcvChequeCount++
      } else if (r.transactionType === 'Customer Bank Transfer') {
        rcvTransferAmt += dep
        rcvTransferCount++
      } else if (r.transactionType === 'Vendor Bank Transfer') {
        payTransferAmt += wth
        payTransferCount++
      } else if (r.transactionType === 'Vendor Cheque Payment') {
        payChequeAmt += wth
        payChequeCount++
      }
    })

    return {
      totalCount: filteredRows.length,
      totalIn,
      totalOut,
      netBookMovement: totalIn - totalOut,
      reconciledCount,
      unreconciledCount,
      reconciledIn,
      reconciledOut,
      reconciledNet: reconciledIn - reconciledOut,
      unreconciledIn,
      unreconciledOut,
      unreconciledNet: unreconciledIn - unreconciledOut,
      reconciledTotalAmount: reconciledIn + reconciledOut,
      unreconciledTotalAmount: unreconciledIn + unreconciledOut,
      rcvChequeAmt,
      rcvChequeCount,
      rcvTransferAmt,
      rcvTransferCount,
      payTransferAmt,
      payTransferCount,
      payChequeAmt,
      payChequeCount,
    }
  }, [filteredRows])

  const bankSummaryRows = useMemo(() => {
    const groups = new Map()
    banks.forEach((b) => {
      groups.set(String(b.id), {
        bankId: String(b.id),
        bankCode: b.code || '-',
        bankName: b.name || 'Unknown Bank',
        branch: b.branch || '-',
        totalCount: 0,
        reconciledCount: 0,
        unreconciledCount: 0,
        moneyIn: 0,
        moneyOut: 0,
        reconciledAmount: 0,
        unreconciledAmount: 0,
      })
    })

    filteredRows.forEach((r) => {
      const key = String(r.bankId || r.bank || 'unassigned')
      if (!groups.has(key)) {
        groups.set(key, {
          bankId: key,
          bankCode: '-',
          bankName: r.bank || 'Unassigned Bank',
          branch: '-',
          totalCount: 0,
          reconciledCount: 0,
          unreconciledCount: 0,
          moneyIn: 0,
          moneyOut: 0,
          reconciledAmount: 0,
          unreconciledAmount: 0,
        })
      }
      const g = groups.get(key)
      const dep = Number(r.deposit ?? 0)
      const wth = Number(r.withdrawal ?? 0)
      const amt = Number(r.amount ?? 0)
      g.totalCount++
      g.moneyIn += dep
      g.moneyOut += wth
      if (r.reconciled === 'Yes') {
        g.reconciledCount++
        g.reconciledAmount += amt
      } else {
        g.unreconciledCount++
        g.unreconciledAmount += amt
      }
    })

    return [...groups.values()].filter((g) => g.totalCount > 0 || banks.some((b) => String(b.id) === g.bankId))
  }, [banks, filteredRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

  const handlePreset = (key) => {
    setPreset(key)
    if (key !== 'custom') {
      setRange(presetRange(key))
      setPage(1)
    }
  }

  const resetAllFilters = () => {
    setPreset('all')
    setRange({ from: '', to: '' })
    setSelectedBankId('')
    setSelectedType('')
    setSelectedStatus('')
    setSelectedFlow('')
    setSearch('')
    setPage(1)
  }

  const getExportData = () =>
    filteredRows.map((r) => ({
      Bank: r.bank,
      'Transaction Type': r.transactionType,
      'Customer / Vendor': r.party,
      'Transaction Date': r.date,
      'Post Date': r.postDate,
      Reference: r.displayReference || formatReconReference(r.reference),
      Description: r.description,
      'Cheque / Ref #': r.chequeNumber,
      'Money In (Deposit)': r.deposit,
      'Money Out (Payment)': r.withdrawal,
      Amount: r.amount,
      Reconciled: r.reconciled,
      'Reconciliation Date': r.reconciliationDate,
    }))

  const pdfPages = useMemo(() => {
    const firstPageMax = 14
    const nextPageMax = 17
    if (filteredRows.length === 0) return [[]]
    const pages = []
    pages.push(filteredRows.slice(0, firstPageMax))
    let offset = firstPageMax
    while (offset < filteredRows.length) {
      pages.push(filteredRows.slice(offset, offset + nextPageMax))
      offset += nextPageMax
    }
    return pages
  }, [filteredRows])

  const handleExcel = () => {
    if (!canExport) return toast.error('Export permission is required')
    exportToExcel(getExportData(), `bank-reconciliation-report-${iso(new Date())}.xlsx`, 'Bank Reconciliation')
  }

  const handleCsv = () => {
    if (!canExport) return toast.error('Export permission is required')
    const rows = getExportData()
    const heads = Object.keys(
      rows[0] ?? {
        Bank: '',
        'Transaction Type': '',
        'Customer / Vendor': '',
        'Transaction Date': '',
        Reference: '',
        Description: '',
        'Cheque / Ref #': '',
        'Money In (Deposit)': '',
        'Money Out (Payment)': '',
        Reconciled: '',
      }
    )
    const text = [heads, ...rows.map((row) => heads.map((k) => row[k]))]
      .map((line) => line.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    a.download = `bank-reconciliation-report-${iso(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handlePrint = () => {
    if (!canPrint) return toast.error('Print permission is required')
    const node = document.getElementById('bank-reconciliation-report-print')
    const popup = window.open('', '_blank', 'width=1200,height=800')
    if (!node || !popup) return toast.error('Allow popups to print this report')
    popup.document.write(
      `<html><head><title>Bank Reconciliation Report</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#0f172a}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #cbd5e1;padding:4px 6px}th{background:#f1f5f9;text-align:left}img{width:56px;height:56px;object-fit:cover}.grid-5{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}.card{border:1px solid #cbd5e1;padding:6px;border-radius:4px}.flex-between{display:flex;align-items:center;justify-content:space-between}.text-right{text-align:right}.text-center{text-align:center}.font-bold{font-weight:700}</style></head><body>${node.innerHTML}<script>window.onload=()=>{window.print();window.close()}</script></body></html>`
    )
    popup.document.close()
  }

  const handlePdf = () => {
    if (!canExport) return toast.error('Export permission is required')
    exportToPDF(
      'bank-reconciliation-report-print',
      `bank-reconciliation-report-${iso(new Date())}.pdf`,
      { orientation: 'landscape', margin: 0.25, scale: 1.5 }
    )
  }

  if (loading || !raw) return <LoadingSkeleton />

  const selectedBankLabel = selectedBankObj
    ? `${selectedBankObj.code ? `${selectedBankObj.code} - ` : ''}${selectedBankObj.name}`
    : 'All Banks'

  return (
    <div className="space-y-5 text-slate-800 dark:text-emerald-50">
      {/* Page Header & Action Buttons */}
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              Finance &amp; Banking Reports
            </p>
            <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
              Bank Reconciliation Report
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-emerald-100/70">
              Complete bank statement reconciliation across customer cheques, vendor cheques, and bank transfers •{' '}
              <b>{selectedBankLabel}</b>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/finance/bank-reconciliation"
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-50/70 px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-900/40 dark:text-emerald-200"
            >
              <Landmark size={15} />
              Reconcile (YES/NO)
            </Link>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-100"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
            {canPrint && (
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-100"
              >
                <Printer size={15} />
                Print
              </button>
            )}
            {canExport && (
              <>
                <button
                  type="button"
                  onClick={handlePdf}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-100"
                >
                  <Download size={15} />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={handleExcel}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  <FileSpreadsheet size={15} />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={handleCsv}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-100"
                >
                  CSV
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Bank Quick-Selector Buttons */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30 space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">
              Select Bank Account
            </span>
            {(selectedBankId || selectedType || selectedStatus || selectedFlow || search || range.from || range.to) && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:underline dark:text-rose-400"
              >
                <RotateCcw size={13} />
                Reset All Filters
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedBankId('')
                setPage(1)
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                !selectedBankId
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                  : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-100'
              }`}
            >
              <Building2 size={14} />
              All Banks ({allReconRows.length})
            </button>
            {banks.map((b) => {
              const active = String(selectedBankId) === String(b.id)
              const count = allReconRows.filter(
                (r) =>
                  String(r.bankId) === String(b.id) ||
                  String(r.bank || '').toLowerCase() === String(b.name || '').toLowerCase()
              ).length
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setSelectedBankId(String(b.id))
                    setPage(1)
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                    active
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-100'
                  }`}
                >
                  <Landmark size={14} />
                  <span>
                    {b.code ? `${b.code} - ` : ''}
                    {b.name}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-emerald-900/60 dark:text-emerald-200'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Date Presets + Date Inputs */}
        <div className="border-t border-slate-100 pt-3 dark:border-emerald-400/10">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-bold text-slate-500 dark:text-emerald-100/60">Period:</span>
            {DATE_PRESETS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => handlePreset(key)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  preset === key
                    ? 'bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-emerald-400/20 dark:text-emerald-100/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold text-slate-600 dark:text-emerald-100/80">
              From Date
              <input
                type="date"
                value={range.from}
                onChange={(e) => {
                  setPreset('custom')
                  setRange((prev) => ({ ...prev, from: e.target.value }))
                  setPage(1)
                }}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-xs font-bold text-slate-600 dark:text-emerald-100/80">
              To Date
              <input
                type="date"
                value={range.to}
                onChange={(e) => {
                  setPreset('custom')
                  setRange((prev) => ({ ...prev, to: e.target.value }))
                  setPage(1)
                }}
                className={`${inputClass} mt-1`}
              />
            </label>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-slate-600 dark:text-emerald-100/80">
                Search Transactions
                <div className="relative mt-1">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPage(1)
                    }}
                    placeholder="Search reference, cheque number, customer, vendor, description..."
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Transaction Type, Status & Cash Flow Filter Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-emerald-400/10">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-bold text-slate-500 dark:text-emerald-100/60">Type:</span>
            {TYPE_BUTTONS.map(([val, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setSelectedType(val)
                  setPage(1)
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                  selectedType === val
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-emerald-400/20 dark:bg-slate-900 dark:text-emerald-100/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-bold text-slate-500 dark:text-emerald-100/60">Status:</span>
            {STATUS_BUTTONS.map(([val, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setSelectedStatus(val)
                  setPage(1)
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                  selectedStatus === val
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-emerald-400/20 dark:bg-slate-900 dark:text-emerald-100/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-bold text-slate-500 dark:text-emerald-100/60">Flow:</span>
            {FLOW_BUTTONS.map(([val, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setSelectedFlow(val)
                  setPage(1)
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                  selectedFlow === val
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-emerald-400/20 dark:bg-slate-900 dark:text-emerald-100/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <span>Money In (Deposits)</span>
            <ArrowDownLeft size={15} />
          </div>
          <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
            {money(metrics.totalIn)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-emerald-100/60">
            Cheques &amp; customer transfers
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
            <span>Money Out (Payments)</span>
            <ArrowUpRight size={15} />
          </div>
          <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
            {money(metrics.totalOut)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-emerald-100/60">
            Vendor transfers &amp; cheques
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-emerald-100/60">
            Net Book Movement
          </div>
          <div
            className={`mt-1 text-lg font-extrabold ${
              metrics.netBookMovement >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {money(metrics.netBookMovement)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-emerald-100/60">
            {metrics.totalCount} total transactions
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <span>Reconciled (YES)</span>
            <CheckCircle2 size={15} />
          </div>
          <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
            {money(metrics.reconciledTotalAmount)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-emerald-100/60">
            {metrics.reconciledCount} verified lines
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            <span>Unreconciled (NO)</span>
            <Clock size={15} />
          </div>
          <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
            {money(metrics.unreconciledTotalAmount)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-emerald-100/60">
            {metrics.unreconciledCount} pending lines
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-emerald-100/60">
            Reconciled Net Flow
          </div>
          <div
            className={`mt-1 text-lg font-extrabold ${
              metrics.reconciledNet >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {money(metrics.reconciledNet)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-emerald-100/60">
            Cleared In minus Cleared Out
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          ['transactions', 'Detailed Transactions'],
          ['statement', 'Reconciliation Statement'],
          ['bank-summary', 'Bank-wise Summary'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition ${
              view === key
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-50'
            }`}
          >
            <Layers size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* View 1: Detailed Transactions Table */}
      {view === 'transactions' && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
          <div className="overflow-auto rounded-lg border border-slate-200 dark:border-emerald-400/20">
            <table className="min-w-[1150px] w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:bg-emerald-950 dark:text-emerald-100/70">
                <tr>
                  <th className="p-3 text-left">Bank</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Customer / Vendor</th>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Ref No</th>
                  <th className="p-3 text-left">Description</th>
                  <th className="p-3 text-left">Cheque / Ref #</th>
                  <th className="p-3 text-right">Money In</th>
                  <th className="p-3 text-right">Money Out</th>
                  <th className="p-3 text-center">Reconciled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-emerald-400/10">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-slate-500">
                      No bank reconciliation records match the selected filters.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row, idx) => {
                    const isRec = row.reconciled === 'Yes'
                    return (
                      <tr key={row.id ?? idx} className="hover:bg-slate-50 dark:hover:bg-emerald-500/5">
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">{row.bank}</td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getTypeBadgeClass(
                              row.transactionType
                            )}`}
                          >
                            {row.transactionType}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 dark:text-emerald-50">{row.party || '-'}</td>
                        <td className="p-3 text-slate-700 dark:text-emerald-50">{formatDate(row.date)}</td>
                        <td className="p-3 font-mono text-xs text-slate-600 dark:text-emerald-100/70">
                          {row.displayReference || formatReconReference(row.reference)}
                        </td>
                        <td className="p-3 text-xs text-slate-700 dark:text-emerald-50">{row.description}</td>
                        <td className="p-3 font-mono text-xs text-slate-700 dark:text-emerald-50">
                          {row.chequeNumber}
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {row.deposit > 0 ? `+ ${money(row.deposit)}` : '-'}
                        </td>
                        <td className="p-3 text-right font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                          {row.withdrawal > 0 ? `- ${money(row.withdrawal)}` : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              isRec
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200'
                            }`}
                          >
                            {isRec ? 'YES' : 'NO'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-emerald-100/70">
            <div>
              Showing {filteredRows.length ? (page - 1) * pageSize + 1 : 0}–
              {Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length} transactions
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm dark:border-emerald-400/20 dark:bg-slate-900"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="font-semibold">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}

      {/* View 2: Formal Reconciliation Statement */}
      {view === 'statement' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/25">
          <div className="bg-emerald-700 px-4 py-3 text-center text-sm font-black uppercase tracking-wider text-white">
            Bank Reconciliation Statement — {selectedBankLabel}
          </div>

          <div className="px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
            1. Transactions by Category (Book Activity)
          </div>
          <StatementRow
            label="Deposited Customer Cheques (RCV-CHQ)"
            count={metrics.rcvChequeCount}
            amount={metrics.rcvChequeAmt}
            indent
            onClick={() => {
              setSelectedType('Customer Cheque Deposit')
              setView('transactions')
            }}
          />
          <StatementRow
            label="Customer Bank Transfers Received (RCV-TRF)"
            count={metrics.rcvTransferCount}
            amount={metrics.rcvTransferAmt}
            indent
            onClick={() => {
              setSelectedType('Customer Bank Transfer')
              setView('transactions')
            }}
          />
          <StatementRow label="Total Money In (Deposits & Transfers)" amount={metrics.totalIn} strong />
          <StatementRow
            label="Less: Vendor Bank Transfers Paid (PAY-TRF)"
            count={metrics.payTransferCount}
            amount={metrics.payTransferAmt}
            negative
            indent
            onClick={() => {
              setSelectedType('Vendor Bank Transfer')
              setView('transactions')
            }}
          />
          <StatementRow
            label="Less: Vendor Cheques Issued (PAY-CHQ)"
            count={metrics.payChequeCount}
            amount={metrics.payChequeAmt}
            negative
            indent
            onClick={() => {
              setSelectedType('Vendor Cheque Payment')
              setView('transactions')
            }}
          />
          <StatementRow label="Total Money Out (Payments & Cheques)" amount={metrics.totalOut} negative strong />
          <StatementRow
            label="Net Book Movement (Per System)"
            count={metrics.totalCount}
            amount={metrics.netBookMovement}
            strong
          />

          <div className="px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
            2. Reconciled vs Unreconciled Breakdown
          </div>
          <StatementRow
            label="Reconciled Money In (Cleared Deposits & Customer Transfers)"
            amount={metrics.reconciledIn}
            indent
            onClick={() => {
              setSelectedStatus('Yes')
              setSelectedFlow('in')
              setView('transactions')
            }}
          />
          <StatementRow
            label="Less: Reconciled Money Out (Cleared Vendor Payments & Cheques)"
            amount={metrics.reconciledOut}
            negative
            indent
            onClick={() => {
              setSelectedStatus('Yes')
              setSelectedFlow('out')
              setView('transactions')
            }}
          />
          <StatementRow
            label="Net Reconciled Bank Movement (Verified YES)"
            count={metrics.reconciledCount}
            amount={metrics.reconciledNet}
            strong
          />
          <StatementRow
            label="Plus: Uncleared Deposits & Customer Transfers (Pending NO)"
            amount={metrics.unreconciledIn}
            indent
            onClick={() => {
              setSelectedStatus('No')
              setSelectedFlow('in')
              setView('transactions')
            }}
          />
          <StatementRow
            label="Less: Unpresented Vendor Cheques & Transfers (Pending NO)"
            amount={metrics.unreconciledOut}
            negative
            indent
            onClick={() => {
              setSelectedStatus('No')
              setSelectedFlow('out')
              setView('transactions')
            }}
          />
          <StatementRow
            label="FINAL NET BOOK MOVEMENT"
            count={metrics.totalCount}
            amount={metrics.netBookMovement}
            highlight
          />
        </div>
      )}

      {/* View 3: Bank-wise Summary */}
      {view === 'bank-summary' && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-950/30">
          <div className="overflow-auto rounded-lg border border-slate-200 dark:border-emerald-400/20">
            <table className="min-w-[1000px] w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:bg-emerald-950 dark:text-emerald-100/70">
                <tr>
                  <th className="p-3 text-left">Bank</th>
                  <th className="p-3 text-right">Transactions</th>
                  <th className="p-3 text-right">Money In</th>
                  <th className="p-3 text-right">Money Out</th>
                  <th className="p-3 text-right">Net Movement</th>
                  <th className="p-3 text-right">Reconciled (YES)</th>
                  <th className="p-3 text-right">Pending (NO)</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-emerald-400/10">
                {bankSummaryRows.map((b) => {
                  const net = b.moneyIn - b.moneyOut
                  return (
                    <tr key={b.bankId} className="hover:bg-slate-50 dark:hover:bg-emerald-500/5">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        {b.bankCode !== '-' ? `${b.bankCode} - ` : ''}
                        {b.bankName}
                      </td>
                      <td className="p-3 text-right font-semibold">{b.totalCount}</td>
                      <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {money(b.moneyIn)}
                      </td>
                      <td className="p-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                        {money(b.moneyOut)}
                      </td>
                      <td
                        className={`p-3 text-right font-bold ${
                          net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {money(net)}
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-bold text-emerald-700 dark:text-emerald-300">
                          {b.reconciledCount}
                        </span>{' '}
                        <span className="text-xs text-slate-500">({money(b.reconciledAmount)})</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          {b.unreconciledCount}
                        </span>{' '}
                        <span className="text-xs text-slate-500">({money(b.unreconciledAmount)})</span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBankId(b.bankId)
                            setView('transactions')
                          }}
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          View Transactions
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Hidden Print / PDF Document (Explicitly Paginated to fit A4 Landscape with zero clipping or row splitting) */}
      <div className="fixed left-[-12000px] top-0 w-[1040px]">
        <div
          id="bank-reconciliation-report-print"
          style={{ width: '1020px', boxSizing: 'border-box', background: '#ffffff', color: '#0f172a', fontFamily: 'Arial, sans-serif' }}
        >
          {pdfPages.map((chunk, pageIdx) => {
            const isFirstPage = pageIdx === 0
            const isLastPage = pageIdx === pdfPages.length - 1
            return (
              <div
                key={pageIdx}
                className={pageIdx > 0 ? 'pdf-page-break' : ''}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '6px 8px',
                  pageBreakAfter: isLastPage ? 'auto' : 'always',
                  breakAfter: isLastPage ? 'auto' : 'page',
                }}
              >
                {isFirstPage ? (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '2px solid #047857',
                        paddingBottom: '10px',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img
                          src={logo}
                          alt="Company logo"
                          style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover' }}
                        />
                        <div>
                          <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
                            Tiny Bloom
                          </div>
                          <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                            Wholesale Management System • Sri Lanka
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '17px', fontWeight: 900, color: '#065f46' }}>
                          Bank Reconciliation Report
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                          Bank: {selectedBankLabel}
                        </div>
                        <div style={{ fontSize: '10px', color: '#475569', marginTop: '1px' }}>
                          Period: {range.from || 'All Dates'} – {range.to || 'Present'} • Page {pageIdx + 1} of{' '}
                          {pdfPages.length}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: '8px',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                          Money In (Deposits)
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#047857', marginTop: '2px' }}>
                          {money(metrics.totalIn)}
                        </div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                          Money Out (Payments)
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#be123c', marginTop: '2px' }}>
                          {money(metrics.totalOut)}
                        </div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                          Net Book Movement
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                          {money(metrics.netBookMovement)}
                        </div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                          Reconciled (YES)
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                          {metrics.reconciledCount} ({money(metrics.reconciledTotalAmount)})
                        </div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                          Pending (NO)
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                          {metrics.unreconciledCount} ({money(metrics.unreconciledTotalAmount)})
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1.5px solid #047857',
                      paddingBottom: '6px',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#065f46' }}>
                      Tiny Bloom • Bank Reconciliation Report (Continued)
                    </div>
                    <div style={{ fontSize: '10px', color: '#334155', fontWeight: 600 }}>
                      Bank: {selectedBankLabel} • Period: {range.from || 'All Dates'} – {range.to || 'Present'} • Page{' '}
                      {pageIdx + 1} of {pdfPages.length}
                    </div>
                  </div>
                )}

                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    tableLayout: 'fixed',
                    fontSize: '8.5px',
                  }}
                >
                  <colgroup>
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '4%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: '#ecfdf5' }}>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Bank
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Type
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Customer / Vendor
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Date
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Reference
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Description
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Cheque / Ref #
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'right', color: '#065f46' }}>
                        Money In
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'right', color: '#065f46' }}>
                        Money Out
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'center', color: '#065f46' }}>
                        Rec.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.map((row, idx) => (
                      <tr key={row.id ?? idx} className="pdf-avoid-break">
                        <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', wordBreak: 'break-word' }}>
                          {row.bank}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', wordBreak: 'break-word' }}>
                          {row.transactionType}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', wordBreak: 'break-word' }}>
                          {row.party}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', whiteSpace: 'nowrap' }}>
                          {formatDate(row.date)}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', wordBreak: 'break-all' }}>
                          {row.displayReference || formatReconReference(row.reference)}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', wordBreak: 'break-word' }}>
                          {row.description}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', wordBreak: 'break-word' }}>
                          {row.chequeNumber}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {row.deposit > 0 ? money(row.deposit) : '-'}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {row.withdrawal > 0 ? money(row.withdrawal) : '-'}
                        </td>
                        <td
                          style={{
                            border: '1px solid #cbd5e1',
                            padding: '4px 5px',
                            textAlign: 'center',
                            fontWeight: 700,
                          }}
                        >
                          {row.reconciled}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {isLastPage && (
                    <tfoot>
                      <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                        <td colSpan={7} style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right' }}>
                          GRAND TOTAL ({filteredRows.length} transactions):
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {money(metrics.totalIn)}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {money(metrics.totalOut)}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'center' }}>-</td>
                      </tr>
                    </tfoot>
                  )}
                </table>

                <div
                  style={{
                    marginTop: '8px',
                    borderTop: '1px solid #e2e8f0',
                    paddingTop: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '8.5px',
                    color: '#64748b',
                  }}
                >
                  <span>Generated by {generatedBy} on {new Date().toLocaleString()}</span>
                  <span>
                    Tiny Bloom Bank Reconciliation Report • Page {pageIdx + 1} of {pdfPages.length}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


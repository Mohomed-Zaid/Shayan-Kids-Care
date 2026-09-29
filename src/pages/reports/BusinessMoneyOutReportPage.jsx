import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpDown,
  Banknote,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Filter,
  Landmark,
  Layers,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react'
import html2pdf from 'html2pdf.js'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useToast } from '../../contexts/ToastContext'
import logo from '../../pictures/logo.jpeg'
import { exportToExcel, LoadingSkeleton } from '../../components/reports'

const MONEY = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const money = (val) => MONEY.format(Number(val || 0))
const number = (val) => Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const isoDate = (d) => d.toISOString().slice(0, 10)
const dateKey = (val) => (val ? String(val).slice(0, 10) : '')

const formatDateDisplay = (val) => {
  if (!val) return '—'
  const d = new Date(`${String(val).slice(0, 10)}T00:00:00`)
  if (isNaN(d.getTime())) return String(val).slice(0, 10)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function presetRange(preset) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let start = new Date(today)
  let end = new Date(today)

  if (preset === 'today') {
    // start & end are today
  } else if (preset === 'this-week') {
    const day = (start.getDay() + 6) % 7 // Monday as start
    start.setDate(start.getDate() - day)
  } else if (preset === 'this-month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1)
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  } else if (preset === 'last-month') {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    end = new Date(today.getFullYear(), today.getMonth(), 0)
  } else if (preset === 'this-year') {
    start = new Date(today.getFullYear(), 0, 1)
    end = new Date(today.getFullYear(), 11, 31)
  }

  return { from: isoDate(start), to: isoDate(end) }
}

function normalizePaymentMethod(methodStr) {
  const m = String(methodStr || '').trim().toLowerCase()
  if (!m || m === 'credit') return null // Credit is never money out
  if (m === 'cash') return 'Cash'
  if (m === 'cheque' || m === 'check') return 'Cheque'
  if (
    m === 'bank' ||
    m === 'bank transfer' ||
    m === 'transfer' ||
    m === 'deposit' ||
    m === 'online' ||
    m === 'neft' ||
    m === 'rtgs' ||
    m === 'card'
  ) {
    return 'Bank'
  }
  return 'Other'
}

const CATEGORIES = [
  'Purchases',
  'Vendor Payments',
  'Expenses',
  'Rep/Employee Payments',
  'Refunds',
  'Other Outflows',
]

const METHODS = ['Cash', 'Bank', 'Cheque', 'Other']

const emptyFilters = {
  category: '',
  method: '',
  bank: '',
  vendor: '',
  employee: '',
  search: '',
}

export default function BusinessMoneyOutReportPage() {
  const toast = useToast()
  const { user } = useAuth()
  const { isSuperAdmin, can } = usePermissions()

  const [preset, setPreset] = useState('this-month')
  const [range, setRange] = useState(() => presetRange('this-month'))
  const [filters, setFilters] = useState(emptyFilters)

  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' })

  const generatedBy =
    user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'System User'

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const tables = [
        'purchases',
        'purchase_payments',
        'vendors',
        'expenses',
        'banks',
        'employees',
        'rep_commission_payments',
        'rep_payments',
        'bank_reconciliation_items',
        'returns',
        'customers',
        'journals',
        'journal_entries',
        'journal_entry_lines',
      ]

      const results = await Promise.all(
        tables.map(async (table) => {
          try {
            const res = await supabase.from(table).select('*')
            return { table, data: res.data || [], error: res.error }
          } catch (e) {
            return { table, data: [], error: e }
          }
        })
      )

      const next = {}
      results.forEach(({ table, data }) => {
        next[table] = data || []
      })
      setRaw(next)
    } catch (err) {
      console.error('Error loading money out report:', err)
      setError(err?.message || 'Failed to load report data')
      toast.error('Failed to load money out data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // NORMALIZED TRANSACTION GENERATION WITH ANTI-DUPLICATION
  const allTransactions = useMemo(() => {
    if (!raw) return []

    const vendorsMap = new Map((raw.vendors || []).map((v) => [String(v.id), v]))
    const employeesMap = new Map((raw.employees || []).map((e) => [String(e.id), e]))
    const customersMap = new Map((raw.customers || []).map((c) => [String(c.id), c]))
    const banksMap = new Map((raw.banks || []).map((b) => [String(b.id), b]))
    const purchasesMap = new Map((raw.purchases || []).map((p) => [String(p.id), p]))

    const transactions = []
    const trackedPaidPurchases = new Set()
    const trackedReferences = new Set()
    const recordedRepPaymentIds = new Set()

    // 1 & 2. PURCHASE PAYMENTS / VENDOR PAYMENTS
    // Only actual payments made from purchase_payments
    ;(raw.purchase_payments || []).forEach((p) => {
      const amt = Number(p.amount || 0)
      if (amt <= 0) return

      const method = normalizePaymentMethod(p.method)
      if (!method) return // skip credit

      const purchase = purchasesMap.get(String(p.purchase_id))
      const vendor = vendorsMap.get(String(purchase?.vendor_id))

      const isDirectCashPurchase = purchase?.payment_type === 'cash'
      const category = isDirectCashPurchase ? 'Purchases' : 'Vendor Payments'
      const type = isDirectCashPurchase ? 'Purchase Payment' : 'Vendor Payment'

      const purchaseRef = purchase?.ref_no
        ? String(purchase.ref_no)
        : purchase?.id
        ? `PUR-${String(purchase.id).slice(0, 8)}`
        : 'Purchase'

      const bank =
        p.bank_name ||
        banksMap.get(String(p.bank_id))?.name ||
        (method === 'Cash' ? '—' : 'Bank')

      const ref =
        p.reference ||
        (purchase?.ref_no ? `PUR-${purchase.ref_no}` : `PAY-${String(p.id).slice(0, 8)}`)

      if (p.reference) {
        trackedReferences.add(String(p.reference).trim().toLowerCase())
      }
      if (p.purchase_id) {
        trackedPaidPurchases.add(String(p.purchase_id))
      }

      transactions.push({
        id: `pp-${p.id}`,
        source: 'purchase_payments',
        sourceId: p.id,
        date: dateKey(p.paid_at || p.created_at),
        reference: ref,
        type,
        paidTo: vendor?.name || 'Vendor',
        vendorId: purchase?.vendor_id ? String(purchase.vendor_id) : '',
        employeeId: '',
        description: `Payment for purchase ${purchaseRef}`,
        method,
        bank,
        category,
        amount: amt,
        note: p.note || '',
        createdAt: p.created_at || '',
      })
    })

    // 1b. DIRECT CASH PURCHASES (where no separate purchase_payments was created)
    ;(raw.purchases || []).forEach((pur) => {
      const status = String(pur.status ?? '').toLowerCase()
      if (['reversed', 'cancelled', 'canceled', 'deleted', 'void'].includes(status)) return

      if (
        pur.payment_type === 'cash' &&
        Number(pur.total_amount || 0) > 0 &&
        !trackedPaidPurchases.has(String(pur.id))
      ) {
        const vendor = vendorsMap.get(String(pur.vendor_id))
        const ref = pur.ref_no ? pur.ref_no : `PUR-${String(pur.id).slice(0, 8)}`
        if (pur.ref_no) {
          trackedReferences.add(String(pur.ref_no).trim().toLowerCase())
        }

        transactions.push({
          id: `pur-cash-${pur.id}`,
          source: 'purchases',
          sourceId: pur.id,
          date: dateKey(pur.date || pur.created_at),
          reference: ref,
          type: 'Direct Cash Purchase',
          paidTo: vendor?.name || 'Vendor',
          vendorId: pur.vendor_id ? String(pur.vendor_id) : '',
          employeeId: '',
          description: `Direct cash purchase ${pur.ref_no || ''}`.trim(),
          method: 'Cash',
          bank: '—',
          category: 'Purchases',
          amount: Number(pur.total_amount || 0),
          note: '',
          createdAt: pur.created_at || '',
        })
      }
    })

    // 3. EXPENSES
    const explicitExpenses = (raw.expenses || []).filter((e) => {
      const amt = Number(e.amount || 0)
      const st = String(e.status ?? 'active').toLowerCase()
      return (
        amt > 0 &&
        !['deleted', 'reversed', 'cancelled', 'canceled', 'void', 'inactive'].includes(st)
      )
    })

    if (explicitExpenses.length > 0) {
      explicitExpenses.forEach((e) => {
        const method = normalizePaymentMethod(e.payment_method)
        if (!method) return

        const bank =
          e.bank_name ||
          banksMap.get(String(e.bank_id))?.name ||
          (method === 'Cash' ? '—' : 'Bank')

        const ref = e.expense_no || e.reference || `EXP-${String(e.id).slice(0, 8)}`
        if (e.reference) {
          trackedReferences.add(String(e.reference).trim().toLowerCase())
        }

        transactions.push({
          id: `exp-${e.id}`,
          source: 'expenses',
          sourceId: e.id,
          date: dateKey(e.expense_date || e.created_at),
          reference: ref,
          type: e.category ? `Expense (${e.category})` : 'Business Expense',
          paidTo: e.payee || e.vendor_name || e.category || 'Operating Expense',
          vendorId: '',
          employeeId: '',
          description: e.description || e.note || `${e.category || 'Operating'} expense`,
          method,
          bank,
          category: 'Expenses',
          amount: Number(e.amount || 0),
          note: e.note || '',
          createdBy: e.created_by || '',
          createdAt: e.created_at || '',
        })
      })
    } else {
      // Fallback to journal entry lines for expenses if no explicit expenses table
      const journalsMap = new Map((raw.journals || []).map((j) => [String(j.id), j]))
      const entriesMap = new Map((raw.journal_entries || []).map((je) => [String(je.id), je]))
      const expenseAccountIds = new Set(
        (raw.journals || [])
          .filter((j) => String(j.account_type || '').toLowerCase().includes('expense'))
          .map((j) => String(j.id))
      )

      ;(raw.journal_entry_lines || []).forEach((line) => {
        if (!expenseAccountIds.has(String(line.journal_id))) return
        const netExpense = Number(line.debit || 0) - Number(line.credit || 0)
        if (netExpense <= 0) return

        const entry = entriesMap.get(String(line.entry_id))
        const account = journalsMap.get(String(line.journal_id))
        const method = normalizePaymentMethod(line.payment_method || entry?.payment_method || 'Bank')
        if (!method) return

        const ref = line.reference || entry?.entry_number || `JE-${String(line.id).slice(0, 8)}`

        transactions.push({
          id: `jel-exp-${line.id}`,
          source: 'journal_entry_lines',
          sourceId: line.id,
          date: dateKey(entry?.date || entry?.created_at || line.created_at),
          reference: ref,
          type: `Journal Expense (${account?.description || account?.name || 'General'})`,
          paidTo: account?.name || account?.description || 'Operating Expense',
          vendorId: '',
          employeeId: '',
          description: line.description || entry?.description || 'Operating expense',
          method,
          bank: line.bank_name || entry?.bank_name || (method === 'Cash' ? '—' : 'Bank'),
          category: 'Expenses',
          amount: netExpense,
          note: line.note || entry?.note || '',
          createdAt: entry?.created_at || line.created_at || '',
        })
      })
    }

    // 4. REP / EMPLOYEE PAYMENTS (Commission, Advances, Payments)
    ;(raw.rep_commission_payments || []).forEach((p) => {
      const amt = Number(p.amount || 0)
      if (amt <= 0) return

      const method = normalizePaymentMethod(p.method)
      if (!method) return

      const rep = employeesMap.get(String(p.rep_id))
      const isAdvance = Number(p.advance_amount || 0) > 0
      const ref = p.reference || `RP-${String(p.id).slice(0, 8)}`
      if (p.reference) {
        trackedReferences.add(String(p.reference).trim().toLowerCase())
      }
      recordedRepPaymentIds.add(String(p.id))

      const period =
        p.period_month && p.period_year ? ` ${p.period_month}/${p.period_year}` : ''

      transactions.push({
        id: `rep-comm-${p.id}`,
        source: 'rep_commission_payments',
        sourceId: p.id,
        date: dateKey(p.paid_at || p.created_at),
        reference: ref,
        type: isAdvance ? 'Rep Advance Payment' : 'Rep Commission Payment',
        paidTo: rep?.name || 'Sales Rep',
        vendorId: '',
        employeeId: p.rep_id ? String(p.rep_id) : '',
        description: isAdvance
          ? `Rep advance payment to ${rep?.name || 'rep'}`
          : `Commission payment${period} to ${rep?.name || 'rep'}`,
        method,
        bank: p.bank_name || (method === 'Cash' ? '—' : 'Bank'),
        category: 'Rep/Employee Payments',
        amount: amt,
        note: p.note || '',
        createdAt: p.created_at || '',
      })
    })

    // Legacy rep_payments (if not already recorded)
    ;(raw.rep_payments || []).forEach((p) => {
      if (recordedRepPaymentIds.has(String(p.id))) return
      const amt = Number(p.amount || 0)
      if (amt <= 0) return

      const method = normalizePaymentMethod(p.method)
      if (!method) return

      const rep = employeesMap.get(String(p.rep_id))
      const ref = p.reference || `RP-${String(p.id).slice(0, 8)}`

      transactions.push({
        id: `rep-pay-${p.id}`,
        source: 'rep_payments',
        sourceId: p.id,
        date: dateKey(p.paid_at || p.created_at),
        reference: ref,
        type: 'Rep Payment',
        paidTo: rep?.name || 'Sales Rep',
        vendorId: '',
        employeeId: p.rep_id ? String(p.rep_id) : '',
        description: `Rep payment to ${rep?.name || 'rep'}`,
        method,
        bank: p.bank_name || (method === 'Cash' ? '—' : 'Bank'),
        category: 'Rep/Employee Payments',
        amount: amt,
        note: p.note || '',
        createdAt: p.created_at || '',
      })
    })

    // 5. CUSTOMER REFUNDS / RETURNS (Only where actual money left the business)
    // In Tiny Bloom, returns create credit notes. If an explicit cash/bank refund transaction exists:
    ;(raw.customer_credit_transactions || []).forEach((t) => {
      const type = String(t.transaction_type || '').toLowerCase()
      const isRefund =
        type === 'refund' ||
        type === 'payout' ||
        String(t.note || '').toLowerCase().includes('refund payment') ||
        Number(t.amount || 0) < 0

      if (isRefund) {
        const amt = Math.abs(Number(t.amount || 0))
        if (amt <= 0) return

        const customer = customersMap.get(String(t.customer_id))
        const method = normalizePaymentMethod(t.payment_method || 'Cash') || 'Cash'

        transactions.push({
          id: `refund-${t.id}`,
          source: 'customer_credit_transactions',
          sourceId: t.id,
          date: dateKey(t.created_at),
          reference: `REF-${String(t.id).slice(0, 8)}`,
          type: 'Customer Refund',
          paidTo: customer?.name || 'Customer',
          vendorId: '',
          employeeId: '',
          description: t.note || `Customer refund to ${customer?.name || 'customer'}`,
          method,
          bank: '—',
          category: 'Refunds',
          amount: amt,
          note: t.note || '',
          createdAt: t.created_at || '',
        })
      }
    })

    // 6. BANK OUTGOING & OTHER OUTFLOWS (Bank charges, direct bank withdrawals)
    // De-duplicated against already tracked references & purchase payments
    ;(raw.bank_reconciliation_items || []).forEach((item) => {
      const amt = Number(item.amount || 0)
      if (amt <= 0) return

      const desc = String(item.description || '').toLowerCase()
      const ref = String(item.ref_no || item.cheque_number || '').trim().toLowerCase()

      // Skip if this bank reconciliation item matches an already counted payment or cheque
      if (ref && trackedReferences.has(ref)) return
      if (ref.startsWith('rcv-chq-')) return // customer cheque deposit (money in)

      const isOutgoing =
        desc.includes('charge') ||
        desc.includes('fee') ||
        desc.includes('withdrawal') ||
        desc.includes('debit') ||
        desc.includes('tax') ||
        desc.includes('vat') ||
        desc.includes('interest') ||
        desc.includes('loan') ||
        desc.includes('payment') ||
        desc.includes('transfer out')

      if (isOutgoing) {
        const bank = banksMap.get(String(item.bank_id))
        transactions.push({
          id: `bank-rec-${item.id}`,
          source: 'bank_reconciliation_items',
          sourceId: item.id,
          date: dateKey(item.trx_date || item.post_date || item.created_at),
          reference: item.ref_no || item.cheque_number || `BNK-${String(item.id).slice(0, 8)}`,
          type: 'Bank Withdrawal / Charge',
          paidTo: bank?.name || item.bank_name || 'Bank',
          vendorId: '',
          employeeId: '',
          description: item.description || 'Bank service charge / withdrawal',
          method: 'Bank',
          bank: bank?.name || item.bank_name || 'Bank',
          category: 'Other Outflows',
          amount: amt,
          note: item.reconciled ? 'Reconciled' : 'Unreconciled',
          createdAt: item.created_at || '',
        })
      }
    })

    return transactions
  }, [raw])

  // FILTERING LOGIC
  const filteredTransactions = useMemo(() => {
    const q = filters.search.trim().toLowerCase()

    return allTransactions.filter((tx) => {
      // Date filter
      if (range.from && tx.date < range.from) return false
      if (range.to && tx.date > range.to) return false

      // Category filter
      if (filters.category && tx.category !== filters.category) return false

      // Method filter
      if (filters.method && tx.method !== filters.method) return false

      // Bank filter
      if (filters.bank && tx.bank !== filters.bank) return false

      // Vendor filter
      if (filters.vendor && tx.vendorId !== filters.vendor) return false

      // Employee filter
      if (filters.employee && tx.employeeId !== filters.employee) return false

      // Search text
      if (q) {
        const match =
          tx.reference?.toLowerCase().includes(q) ||
          tx.paidTo?.toLowerCase().includes(q) ||
          tx.description?.toLowerCase().includes(q) ||
          tx.type?.toLowerCase().includes(q) ||
          tx.category?.toLowerCase().includes(q) ||
          tx.bank?.toLowerCase().includes(q) ||
          tx.note?.toLowerCase().includes(q)
        if (!match) return false
      }

      return true
    })
  }, [allTransactions, range, filters])

  // SORTING
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let left = a[sort.key] ?? ''
      let right = b[sort.key] ?? ''

      if (sort.key === 'amount') {
        left = Number(left || 0)
        right = Number(right || 0)
        return sort.direction === 'asc' ? left - right : right - left
      }

      const cmp = String(left).localeCompare(String(right))
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [filteredTransactions, sort])

  // PAGINATION
  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedTransactions = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return sortedTransactions.slice(start, start + pageSize)
  }, [sortedTransactions, safePage, pageSize])

  // RECONCILED SUMMARY METRICS
  const metrics = useMemo(() => {
    let totalMoneyOut = 0
    let cashOut = 0
    let bankOut = 0
    let chequeOut = 0
    let otherOut = 0

    const categoryMap = {
      Purchases: { count: 0, amount: 0 },
      'Vendor Payments': { count: 0, amount: 0 },
      Expenses: { count: 0, amount: 0 },
      'Rep/Employee Payments': { count: 0, amount: 0 },
      Refunds: { count: 0, amount: 0 },
      'Other Outflows': { count: 0, amount: 0 },
    }

    const methodMap = {
      Cash: { count: 0, amount: 0 },
      Bank: { count: 0, amount: 0 },
      Cheque: { count: 0, amount: 0 },
      Other: { count: 0, amount: 0 },
    }

    filteredTransactions.forEach((tx) => {
      const amt = Number(tx.amount || 0)
      totalMoneyOut += amt

      if (tx.method === 'Cash') cashOut += amt
      else if (tx.method === 'Bank') bankOut += amt
      else if (tx.method === 'Cheque') chequeOut += amt
      else otherOut += amt

      if (methodMap[tx.method]) {
        methodMap[tx.method].count += 1
        methodMap[tx.method].amount += amt
      }

      if (categoryMap[tx.category]) {
        categoryMap[tx.category].count += 1
        categoryMap[tx.category].amount += amt
      }
    })

    return {
      totalMoneyOut,
      cashOut,
      bankOut,
      chequeOut,
      otherOut,
      totalCount: filteredTransactions.length,
      categoryMap,
      methodMap,
    }
  }, [filteredTransactions])

  // FILTER OPTIONS
  const options = useMemo(() => {
    const vendors = [...new Map((raw?.vendors || []).map((v) => [v.id, v])).values()].sort(
      (a, b) => a.name.localeCompare(b.name)
    )
    const employees = [
      ...new Map((raw?.employees || []).map((e) => [e.id, e])).values(),
    ].sort((a, b) => a.name.localeCompare(b.name))
    const banks = [...new Set(allTransactions.map((tx) => tx.bank).filter((b) => b && b !== '—'))].sort()

    return { vendors, employees, banks }
  }, [raw, allTransactions])

  const toggleSort = (key) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  // EXPORT TO EXCEL
  const handleExportExcel = () => {
    const data = sortedTransactions.map((tx) => ({
      Date: formatDateDisplay(tx.date),
      Reference: tx.reference,
      Type: tx.type,
      'Paid To': tx.paidTo,
      Description: tx.description,
      Method: tx.method,
      Bank: tx.bank,
      Category: tx.category,
      Amount: tx.amount,
      Note: tx.note || '',
    }))

    exportToExcel(
      data,
      `business-money-out-${range.from}-to-${range.to}.xlsx`,
      'Money Out'
    )
  }

  // EXPORT TO CSV
  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Reference',
      'Type',
      'Paid To',
      'Description',
      'Method',
      'Bank',
      'Category',
      'Amount',
      'Note',
    ]

    const rows = sortedTransactions.map((tx) => [
      formatDateDisplay(tx.date),
      `"${String(tx.reference || '').replace(/"/g, '""')}"`,
      `"${String(tx.type || '').replace(/"/g, '""')}"`,
      `"${String(tx.paidTo || '').replace(/"/g, '""')}"`,
      `"${String(tx.description || '').replace(/"/g, '""')}"`,
      tx.method,
      `"${String(tx.bank || '').replace(/"/g, '""')}"`,
      `"${String(tx.category || '').replace(/"/g, '""')}"`,
      tx.amount.toFixed(2),
      `"${String(tx.note || '').replace(/"/g, '""')}"`,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `business-money-out-${range.from}-to-${range.to}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // EXPORT TO PDF
  const handleExportPDF = () => {
    const escapeHtml = (val) =>
      String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')

    const tableRows = sortedTransactions
      .map(
        (tx) => `
        <tr>
          <td>${escapeHtml(formatDateDisplay(tx.date))}</td>
          <td><b>${escapeHtml(tx.reference)}</b></td>
          <td>${escapeHtml(tx.type)}</td>
          <td>${escapeHtml(tx.paidTo)}</td>
          <td>${escapeHtml(tx.description)}</td>
          <td><span class="badge">${escapeHtml(tx.method)}</span></td>
          <td>${escapeHtml(tx.bank)}</td>
          <td>${escapeHtml(tx.category)}</td>
          <td class="amount">${escapeHtml(money(tx.amount))}</td>
        </tr>
      `
      )
      .join('')

    const categorySummaryRows = CATEGORIES.map((cat) => {
      const data = metrics.categoryMap[cat] || { count: 0, amount: 0 }
      const pct = metrics.totalMoneyOut > 0 ? (data.amount / metrics.totalMoneyOut) * 100 : 0
      return `
        <tr>
          <td><b>${escapeHtml(cat)}</b></td>
          <td style="text-align:center;">${escapeHtml(data.count)}</td>
          <td style="text-align:right;">${escapeHtml(money(data.amount))}</td>
          <td style="text-align:right;">${escapeHtml(pct.toFixed(1))}%</td>
        </tr>
      `
    }).join('')

    const methodSummaryRows = METHODS.map((m) => {
      const data = metrics.methodMap[m] || { count: 0, amount: 0 }
      const pct = metrics.totalMoneyOut > 0 ? (data.amount / metrics.totalMoneyOut) * 100 : 0
      return `
        <tr>
          <td><b>${escapeHtml(m)} Out</b></td>
          <td style="text-align:center;">${escapeHtml(data.count)}</td>
          <td style="text-align:right;">${escapeHtml(money(data.amount))}</td>
          <td style="text-align:right;">${escapeHtml(pct.toFixed(1))}%</td>
        </tr>
      `
    }).join('')

    const docHtml = `
      <div class="money-out-pdf" style="font-family: Inter, system-ui, sans-serif; color: #0f172a; padding: 20px; font-size: 11px;">
        <style>
          .money-out-pdf table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 16px; font-size: 10px; }
          .money-out-pdf th { background: #064e3b; color: white; padding: 6px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; }
          .money-out-pdf td { border-bottom: 1px solid #e2e8f0; padding: 5px 8px; }
          .money-out-pdf tr:nth-child(even) td { background: #f8fafc; }
          .money-out-pdf .amount { text-align: right; font-weight: 700; }
          .money-out-pdf .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; background: #ecfdf5; color: #047857; }
          .money-out-pdf .summary-box { display: flex; gap: 10px; margin-bottom: 16px; }
          .money-out-pdf .summary-card { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #ffffff; }
          .money-out-pdf .summary-card.highlight { background: #ecfdf5; border-color: #6ee7b7; }
          .money-out-pdf .summary-title { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 2px; }
          .money-out-pdf .summary-val { font-size: 13px; font-weight: 800; color: #0f172a; }
        </style>

        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #064e3b; padding-bottom: 12px; margin-bottom: 14px;">
          <div>
            <h1 style="font-size: 18px; font-weight: 900; margin: 0; color: #064e3b;">Shayan's Kids &amp; Toys Store</h1>
            <h2 style="font-size: 14px; font-weight: 800; margin: 3px 0 0 0; color: #0f172a;">Business Money Out Report</h2>
            <p style="font-size: 10px; color: #64748b; margin: 2px 0 0 0;">Complete traceable record of all cash &amp; bank business outflows</p>
          </div>
          <div style="text-align: right; font-size: 10px; color: #475569;">
            <p style="margin: 0;"><b>Selected Date Range:</b> ${escapeHtml(formatDateDisplay(range.from))} to ${escapeHtml(formatDateDisplay(range.to))}</p>
            <p style="margin: 3px 0 0 0;"><b>Generated on:</b> ${escapeHtml(new Date().toLocaleString())}</p>
            <p style="margin: 3px 0 0 0;"><b>Generated by:</b> ${escapeHtml(generatedBy)}</p>
          </div>
        </div>

        <!-- TOP SUMMARY CARDS -->
        <div class="summary-box">
          <div class="summary-card highlight">
            <div class="summary-title" style="color: #047857;">TOTAL MONEY OUT</div>
            <div class="summary-val" style="color: #064e3b; font-size: 15px;">${escapeHtml(money(metrics.totalMoneyOut))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-title">Cash Out</div>
            <div class="summary-val">${escapeHtml(money(metrics.cashOut))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-title">Bank Out</div>
            <div class="summary-val">${escapeHtml(money(metrics.bankOut))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-title">Cheque Out</div>
            <div class="summary-val">${escapeHtml(money(metrics.chequeOut))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-title">Other Out</div>
            <div class="summary-val">${escapeHtml(money(metrics.otherOut))}</div>
          </div>
        </div>

        <!-- TWO SIDE-BY-SIDE RECONCILIATION TABLES -->
        <div style="display: flex; gap: 14px; margin-bottom: 12px;">
          <div style="flex: 1;">
            <h3 style="font-size: 11px; font-weight: 800; margin: 0 0 4px 0; color: #064e3b;">Category Summary</h3>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th style="text-align:center;">Count</th>
                  <th style="text-align:right;">Amount</th>
                  <th style="text-align:right;">Share</th>
                </tr>
              </thead>
              <tbody>
                ${categorySummaryRows}
                <tr style="background: #f1f5f9; font-weight: 800;">
                  <td>Total</td>
                  <td style="text-align:center;">${escapeHtml(metrics.totalCount)}</td>
                  <td style="text-align:right;">${escapeHtml(money(metrics.totalMoneyOut))}</td>
                  <td style="text-align:right;">100.0%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="flex: 1;">
            <h3 style="font-size: 11px; font-weight: 800; margin: 0 0 4px 0; color: #064e3b;">Payment Method Summary</h3>
            <table>
              <thead>
                <tr>
                  <th>Payment Method</th>
                  <th style="text-align:center;">Count</th>
                  <th style="text-align:right;">Amount</th>
                  <th style="text-align:right;">Share</th>
                </tr>
              </thead>
              <tbody>
                ${methodSummaryRows}
                <tr style="background: #f1f5f9; font-weight: 800;">
                  <td>Total</td>
                  <td style="text-align:center;">${escapeHtml(metrics.totalCount)}</td>
                  <td style="text-align:right;">${escapeHtml(money(metrics.totalMoneyOut))}</td>
                  <td style="text-align:right;">100.0%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- DETAILED TRANSACTION TABLE -->
        <h3 style="font-size: 12px; font-weight: 800; margin: 10px 0 4px 0; color: #064e3b;">
          Detailed Outflow Transactions (${escapeHtml(sortedTransactions.length)} Records)
        </h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Type</th>
              <th>Paid To</th>
              <th>Description</th>
              <th>Method</th>
              <th>Bank</th>
              <th>Category</th>
              <th style="text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="9" style="text-align:center; padding: 12px;">No money out records match the selected filters.</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="background: #064e3b; color: white; font-weight: 800; font-size: 11px;">
              <td colspan="8" style="padding: 8px; text-align: right;">GRAND TOTAL MONEY OUT:</td>
              <td style="padding: 8px; text-align: right;">${escapeHtml(money(metrics.totalMoneyOut))}</td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-top: 14px; border-top: 1px solid #cbd5e1; padding-top: 8px; text-align: center; color: #94a3b8; font-size: 9px;">
          Shayan's Kids &amp; Toys Store • Business Money Out Report • Generated from live financial ledger
        </div>
      </div>
    `

    const stage = document.createElement('div')
    stage.style.position = 'fixed'
    stage.style.left = '-9999px'
    stage.innerHTML = docHtml
    document.body.appendChild(stage)

    html2pdf()
      .set({
        margin: 0.2,
        filename: `business-money-out-${range.from}-to-${range.to}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] },
      })
      .from(stage.firstElementChild)
      .save()
      .finally(() => {
        document.body.removeChild(stage)
      })
  }

  if (loading) return <LoadingSkeleton />

  return (
    <div id="money-out-report-container" className="space-y-5 print:text-black">
      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:flex items-start justify-between border-b-2 border-emerald-800 pb-4 mb-4">
        <div className="flex gap-4 items-center">
          <img src={logo} className="h-16 w-16 object-contain rounded" alt="Logo" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Shayan's Kids &amp; Toys Store</h1>
            <p className="text-xs text-slate-500">Business Money Out Report</p>
            <p className="text-xs text-emerald-800 font-semibold mt-1">
              Date range: {formatDateDisplay(range.from)} — {formatDateDisplay(range.to)}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Generated by: {generatedBy}</p>
          <p>Generated: {new Date().toLocaleString()}</p>
        </div>
      </div>

      {/* PAGE HEADER */}
      <header className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-emerald-400/15 dark:bg-emerald-950/25 shadow-sm print:hidden">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                <Wallet size={18} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                  Finance &amp; Outflow Reports
                </p>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                  Business Money Out Report
                </h1>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/60">
              Traceable record of all actual cash and bank disbursements that left the business.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-emerald-400/20 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-emerald-400/20 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-emerald-400/20 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              <Download size={14} /> PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition-colors shadow-sm"
            >
              <FileSpreadsheet size={14} /> Excel
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-emerald-400/20 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              <Download size={14} /> CSV
            </button>
          </div>
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-400">
          <b>Error loading report:</b> {error}
        </div>
      )}

      {/* TOP SUMMARY CARDS (MAIN RECONCILIATION) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {/* TOTAL MONEY OUT (HIGHLIGHT) */}
        <div className="col-span-2 sm:col-span-1 rounded-xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 dark:border-emerald-400/30 dark:from-emerald-950/40 dark:to-emerald-900/20 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Total Money Out
            </p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <CircleDollarSign size={18} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
            {money(metrics.totalMoneyOut)}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <span>{number(metrics.totalCount)} transactions</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={13} /> Reconciled
            </span>
          </div>
        </div>

        {/* CASH OUT */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-emerald-400/15 dark:bg-emerald-950/25 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">
              Cash Out
            </p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
              <Banknote size={16} />
            </span>
          </div>
          <p className="mt-2 text-xl font-black tabular-nums text-slate-900 dark:text-white">
            {money(metrics.cashOut)}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-emerald-100/60">
            <span>{metrics.methodMap.Cash?.count || 0} items</span>
            <span className="font-bold">
              {metrics.totalMoneyOut > 0
                ? ((metrics.cashOut / metrics.totalMoneyOut) * 100).toFixed(1)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* BANK OUT */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-emerald-400/15 dark:bg-emerald-950/25 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">
              Bank Out
            </p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
              <Landmark size={16} />
            </span>
          </div>
          <p className="mt-2 text-xl font-black tabular-nums text-slate-900 dark:text-white">
            {money(metrics.bankOut)}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-emerald-100/60">
            <span>{metrics.methodMap.Bank?.count || 0} items</span>
            <span className="font-bold">
              {metrics.totalMoneyOut > 0
                ? ((metrics.bankOut / metrics.totalMoneyOut) * 100).toFixed(1)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* CHEQUE OUT */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-emerald-400/15 dark:bg-emerald-950/25 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">
              Cheque Out
            </p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300">
              <Receipt size={16} />
            </span>
          </div>
          <p className="mt-2 text-xl font-black tabular-nums text-slate-900 dark:text-white">
            {money(metrics.chequeOut)}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-emerald-100/60">
            <span>{metrics.methodMap.Cheque?.count || 0} items</span>
            <span className="font-bold">
              {metrics.totalMoneyOut > 0
                ? ((metrics.chequeOut / metrics.totalMoneyOut) * 100).toFixed(1)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* OTHER OUT */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-emerald-400/15 dark:bg-emerald-950/25 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">
              Other Out
            </p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Layers size={16} />
            </span>
          </div>
          <p className="mt-2 text-xl font-black tabular-nums text-slate-900 dark:text-white">
            {money(metrics.otherOut)}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-emerald-100/60">
            <span>{metrics.methodMap.Other?.count || 0} items</span>
            <span className="font-bold">
              {metrics.totalMoneyOut > 0
                ? ((metrics.otherOut / metrics.totalMoneyOut) * 100).toFixed(1)
                : 0}
              %
            </span>
          </div>
        </div>
      </div>

      {/* CATEGORY SUMMARY GRID */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-emerald-400/15 dark:bg-emerald-950/25 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded-full bg-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Category Summary Breakdown
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-emerald-100/60">
            Reconciles exactly to {money(metrics.totalMoneyOut)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {CATEGORIES.map((cat) => {
            const data = metrics.categoryMap[cat] || { count: 0, amount: 0 }
            const share =
              metrics.totalMoneyOut > 0 ? (data.amount / metrics.totalMoneyOut) * 100 : 0
            const active = filters.category === cat

            return (
              <div
                key={cat}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    category: prev.category === cat ? '' : cat,
                  }))
                }
                className={`cursor-pointer rounded-lg border p-3 transition-all ${
                  active
                    ? 'border-emerald-500 bg-emerald-50/70 dark:border-emerald-400 dark:bg-emerald-500/10'
                    : 'border-slate-200 dark:border-emerald-400/10 hover:border-emerald-300 dark:hover:border-emerald-400/30'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  <span className="truncate">{cat}</span>
                  <span className="text-[10px] text-slate-400">({data.count})</span>
                </div>
                <p className="mt-1 text-sm font-black tabular-nums text-slate-900 dark:text-white">
                  {money(data.amount)}
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-[10px] font-medium text-slate-400">
                  {share.toFixed(1)}% of total
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-emerald-400/15 dark:bg-emerald-950/25 shadow-sm print:hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-emerald-400/10">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Filter size={15} />
            </span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Filters &amp; Date Select
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              ['today', 'Today'],
              ['this-week', 'This Week'],
              ['this-month', 'This Month'],
              ['last-month', 'Last Month'],
              ['this-year', 'This Year'],
              ['custom', 'Custom Range'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setPreset(key)
                  if (key !== 'custom') setRange(presetRange(key))
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  preset === key
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-emerald-950/50 dark:text-emerald-100/70 dark:hover:bg-emerald-900/50'
                }`}
              >
                {label}
              </button>
            ))}

            <button
              onClick={() => {
                setFilters(emptyFilters)
                setPreset('this-month')
                setRange(presetRange('this-month'))
              }}
              className="ml-2 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              Reset All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {/* FROM DATE */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={range.from}
              onChange={(e) => {
                setPreset('custom')
                setRange((r) => ({ ...r, from: e.target.value }))
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-white outline-none focus:border-emerald-500"
            />
          </div>

          {/* TO DATE */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={range.to}
              onChange={(e) => {
                setPreset('custom')
                setRange((r) => ({ ...r, to: e.target.value }))
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-white outline-none focus:border-emerald-500"
            />
          </div>

          {/* CATEGORY */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
              Category
            </label>
            <select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-white outline-none focus:border-emerald-500"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* METHOD */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
              Payment Method
            </label>
            <select
              value={filters.method}
              onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-white outline-none focus:border-emerald-500"
            >
              <option value="">All Methods</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* BANK */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
              Bank
            </label>
            <select
              value={filters.bank}
              onChange={(e) => setFilters((f) => ({ ...f, bank: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-white outline-none focus:border-emerald-500"
            >
              <option value="">All Banks</option>
              {options.banks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* VENDOR */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
              Vendor
            </label>
            <select
              value={filters.vendor}
              onChange={(e) => setFilters((f) => ({ ...f, vendor: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-white outline-none focus:border-emerald-500"
            >
              <option value="">All Vendors</option>
              {options.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* SEARCH TEXT */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
              Search
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ref, payee, note..."
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 pl-8 pr-2.5 py-1.5 text-xs text-slate-800 dark:text-white outline-none focus:border-emerald-500"
              />
              <Search
                size={14}
                className="absolute left-2.5 top-2 text-slate-400 pointer-events-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* TRANSACTIONS TABLE */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-emerald-400/15 dark:bg-emerald-950/25 shadow-sm print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 p-4 dark:border-emerald-400/10">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              Money Out Transaction Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-emerald-100/60">
              Showing {sortedTransactions.length} recorded payments between{' '}
              {formatDateDisplay(range.from)} and {formatDateDisplay(range.to)}
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <span className="text-xs text-slate-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              className="rounded-lg border border-slate-300 dark:border-emerald-400/20 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-white outline-none"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/90 dark:border-emerald-400/10 dark:bg-emerald-950/50 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-emerald-100/70">
                <th
                  onClick={() => toggleSort('date')}
                  className="cursor-pointer px-3.5 py-3 hover:text-emerald-600"
                >
                  <div className="flex items-center gap-1">
                    DATE <ArrowUpDown size={12} />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('reference')}
                  className="cursor-pointer px-3.5 py-3 hover:text-emerald-600"
                >
                  <div className="flex items-center gap-1">
                    REFERENCE <ArrowUpDown size={12} />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('type')}
                  className="cursor-pointer px-3.5 py-3 hover:text-emerald-600"
                >
                  <div className="flex items-center gap-1">
                    TYPE <ArrowUpDown size={12} />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('paidTo')}
                  className="cursor-pointer px-3.5 py-3 hover:text-emerald-600"
                >
                  <div className="flex items-center gap-1">
                    PAID TO <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="px-3.5 py-3">DESCRIPTION</th>
                <th
                  onClick={() => toggleSort('method')}
                  className="cursor-pointer px-3.5 py-3 hover:text-emerald-600"
                >
                  <div className="flex items-center gap-1">
                    METHOD <ArrowUpDown size={12} />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('bank')}
                  className="cursor-pointer px-3.5 py-3 hover:text-emerald-600"
                >
                  <div className="flex items-center gap-1">
                    BANK <ArrowUpDown size={12} />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('category')}
                  className="cursor-pointer px-3.5 py-3 hover:text-emerald-600"
                >
                  <div className="flex items-center gap-1">
                    CATEGORY <ArrowUpDown size={12} />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('amount')}
                  className="cursor-pointer px-3.5 py-3 text-right hover:text-emerald-600"
                >
                  <div className="flex items-center justify-end gap-1">
                    AMOUNT <ArrowUpDown size={12} />
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-emerald-400/10">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <p className="font-semibold">No money out transactions found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try adjusting the date range or clearing your filter criteria.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-emerald-500/5 transition-colors"
                  >
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-medium text-slate-900 dark:text-white">
                      {formatDateDisplay(tx.date)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-xs font-bold text-slate-800 dark:text-emerald-300">
                      {tx.reference}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-slate-700 dark:text-emerald-100/80 font-medium">
                      {tx.type}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-bold text-slate-900 dark:text-white">
                      {tx.paidTo}
                    </td>
                    <td
                      className="px-3.5 py-2.5 text-slate-600 dark:text-emerald-100/70 max-w-xs truncate"
                      title={tx.description}
                    >
                      {tx.description}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          tx.method === 'Cash'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                            : tx.method === 'Bank'
                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                            : tx.method === 'Cheque'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {tx.method}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-slate-600 dark:text-emerald-100/70">
                      {tx.bank}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      <span className="inline-block rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-emerald-400/20 dark:text-emerald-200">
                        {tx.category}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                      {money(tx.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* TABLE FOOTER SUMMARY */}
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold dark:border-emerald-400/20 dark:bg-emerald-950/60">
              <tr>
                <td colSpan={5} className="px-3.5 py-3 text-xs text-slate-600 dark:text-slate-300">
                  Total Filtered Transactions: <b>{number(filteredTransactions.length)}</b>
                </td>
                <td colSpan={3} className="px-3.5 py-3 text-right text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  TOTAL MONEY OUT:
                </td>
                <td className="px-3.5 py-3 text-right text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-400">
                  {money(metrics.totalMoneyOut)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* PAGINATION BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 p-3 text-xs text-slate-500 dark:border-emerald-400/10 dark:text-emerald-100/60 print:hidden">
          <p>
            Showing {(safePage - 1) * pageSize + 1} to{' '}
            {Math.min(safePage * pageSize, sortedTransactions.length)} of{' '}
            {sortedTransactions.length} records
          </p>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 dark:border-emerald-400/20 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2">
              Page {safePage} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 dark:border-emerald-400/20 disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

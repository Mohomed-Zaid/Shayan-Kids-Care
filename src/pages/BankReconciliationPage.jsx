import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Search, RefreshCw, ArrowDownLeft, ArrowUpRight, CheckCircle2, Printer, Download, FileSpreadsheet, FileText, Landmark, Layers, CheckCheck, RotateCcw } from 'lucide-react'
import { extractBankCodeFromCheque, APPROVED_BANK_CODES } from '../lib/chequeValidation'
import { formatReconReference } from '../lib/financeReports'
import { exportToPDF } from '../components/reports'
import logo from '../pictures/logo.jpeg'

const fmtMoney = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

const formatDocRef = (val, prefix) => {
  if (!val) return ''
  const str = String(val).trim()
  if (!str) return ''
  const regex = new RegExp(`^(${prefix}-)+`, 'i')
  return `${prefix}-${str.replace(regex, '')}`
}

const cleanReconDescription = (desc) => {
  if (!desc) return '-'
  return String(desc)
    .replace(/\bPUR-PUR-/gi, 'PUR-')
    .replace(/\bINV-INV-/gi, 'INV-')
}

function getBankCodeForBank(bank) {
  if (!bank) return ''
  if (bank.bank_code) return String(bank.bank_code).trim()
  const normName = String(bank.name || '').toLowerCase()
  for (const [code, name] of Object.entries(APPROVED_BANK_CODES)) {
    if (name.toLowerCase().includes(normName) || normName.includes(name.toLowerCase())) {
      return code
    }
  }
  return ''
}

function matchesPaymentToBank(bankNameStr, refStr, targetBank) {
  if (!targetBank) return false
  const targetId = String(targetBank.id || '').trim().toLowerCase()
  const targetCode = String(targetBank.code || '').trim().toLowerCase()
  const targetBankCode = getBankCodeForBank(targetBank).toLowerCase()
  const targetBankName = String(targetBank.name || '').trim().toLowerCase()

  // 1. Cheque number bank code match (format: XXXXXX-BBBB-BBB)
  if (refStr) {
    const codeInRef = extractBankCodeFromCheque(refStr)
    if (targetBankCode && codeInRef && codeInRef === targetBankCode) return true
  }

  const bStr = String(bankNameStr || '').trim().toLowerCase()
  if (!bStr) return false

  // 2. Direct ID match
  if (targetId && bStr === targetId) return true

  // 3. Bank code prefix / exact match (e.g., '001', '001 - DFCC Bank')
  if (targetCode && (bStr === targetCode || bStr.startsWith(`${targetCode} -`) || bStr.startsWith(`${targetCode}-`) || bStr.startsWith(`${targetCode} `))) return true

  // 4. Central Bank code match (e.g., 7056 for DFCC)
  if (targetBankCode && (bStr === targetBankCode || bStr.includes(targetBankCode))) return true

  // 5. Name match (e.g. 'DFCC Bank', 'DFCC')
  if (targetBankName) {
    if (bStr.includes(targetBankName) || targetBankName.includes(bStr)) return true
    const keywords = targetBankName.split(/[\s-]+/).filter((w) => w.length >= 3 && !['bank', 'plc', 'ltd'].includes(w))
    for (const kw of keywords) {
      if (bStr.includes(kw)) return true
    }
  }

  // 6. Generic code match in string if length >= 3
  if (targetCode && targetCode.length >= 3 && bStr.includes(targetCode)) return true

  return false
}

function getItemTypeInfo(row) {
  const ref = String(row.ref_no || '').toUpperCase()
  const desc = String(row.description || '').toLowerCase()

  if (ref.startsWith('RCV-CHQ') || desc.includes('customer cheque deposit') || desc.includes('receivable cheque')) {
    return {
      label: 'Customer Cheque',
      flow: 'in',
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
    }
  }
  if (ref.startsWith('RCV-TRF') || desc.includes('customer bank transfer') || desc.includes('customer bank receipt')) {
    return {
      label: 'Customer Transfer',
      flow: 'in',
      badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border-teal-300 dark:border-teal-700',
    }
  }
  if (ref.startsWith('PAY-TRF') || desc.includes('vendor bank transfer')) {
    return {
      label: 'Vendor Transfer',
      flow: 'out',
      badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-700',
    }
  }
  if (ref.startsWith('PAY-CHQ') || desc.includes('vendor cheque')) {
    return {
      label: 'Vendor Cheque',
      flow: 'out',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    }
  }
  if (desc.includes('payment') || desc.includes('outflow') || desc.includes('withdrawal')) {
    return {
      label: 'Payment Out',
      flow: 'out',
      badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300 dark:border-rose-700',
    }
  }
  return {
    label: 'Bank Entry',
    flow: 'in',
    badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
  }
}

export default function BankReconciliationPage() {
  const toast = useToast()

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const firstOfMonthStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])

  const [banks, setBanks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    bank_id: '',
    from_date: firstOfMonthStr,
    to_date: todayStr,
  })

  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'unreconciled' | 'reconciled' | 'inflow' | 'outflow'
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'Customer Cheque' | 'Customer Transfer' | 'Vendor Transfer' | 'Vendor Cheque'
  const [activeTab, setActiveTab] = useState('table') // 'table' | 'statement'
  const [savingId, setSavingId] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  const load = async (bankIdToUse = form.bank_id, fromDate = form.from_date, toDate = form.to_date, bankList = banks) => {
    const activeBankId = bankIdToUse || form.bank_id
    if (!activeBankId) {
      setRows([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const from = fromDate
      const to = toDate

      const targetBank = bankList.find((b) => String(b.id) === String(activeBankId))
      const targetBankCode = getBankCodeForBank(targetBank)
      const targetBankName = String(targetBank?.name || '').toLowerCase().trim()
      const targetCode = String(targetBank?.code || '').toLowerCase().trim()

      // 1. Fetch ALL bank reconciliation items (do not filter by date in SQL so existingRefNos covers all dates)
      const reconQuery = supabase
        .from('bank_reconciliation_items')
        .select('id, bank_id, trx_date, ref_no, post_date, description, due_date, cheque_number, amount, reconciled, created_at')
        .order('trx_date', { ascending: false })
        .limit(5000)

      // 2. Fetch deposited customer cheques
      const chequeQuery = supabase
        .from('customer_cheques')
        .select('id, cheque_date, cheque_number, amount, bank_name, bank_code, deposit_bank_id, deposited_at, status, customers(name)')
        .eq('status', 'deposited')
        .limit(2000)

      // 3. Fetch customer bank transfers (invoice_payments where method = 'bank')
      const rcvTransferQuery = supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, paid_at, method, reference, bank_name, note, invoices(invoice_number, customer_id, customers(name))')
        .eq('method', 'bank')
        .limit(2000)

      // 4. Fetch vendor payments (purchase_payments where method in ('bank', 'cheque'))
      const payQuery = supabase
        .from('purchase_payments')
        .select('id, purchase_id, amount, paid_at, method, reference, bank_name, note, purchases(ref_no, vendor_id, vendors(name))')
        .in('method', ['bank', 'cheque'])
        .limit(2000)

      const [reconRes, chequeRes, rcvRes, payRes] = await Promise.all([
        reconQuery,
        chequeQuery,
        rcvTransferQuery,
        payQuery,
      ])

      if (reconRes.error) throw reconRes.error

      const allFetchedItems = reconRes.data ?? []
      const depositedCheques = chequeRes.data ?? []
      const rcvTransfers = rcvRes.data ?? []
      const payPayments = payRes.data ?? []

      // Deduplicate bank_reconciliation_items by ref_no and clean up duplicate database rows
      const chequesByIdMap = new Map(depositedCheques.map((c) => [String(c.id), c]))
      const seenByRef = new Map()
      const duplicateIds = []

      const scoreItem = (r) => {
        let s = r.reconciled ? 100 : 0
        const refU = String(r.ref_no || '').trim().toUpperCase()
        if (refU.startsWith('RCV-CHQ-')) {
          const chq = chequesByIdMap.get(String(r.ref_no || '').trim().slice(8))
          if (chq?.deposit_bank_id && String(r.bank_id) === String(chq.deposit_bank_id)) s += 50
        }
        return s
      }

      allFetchedItems.forEach((item) => {
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
      }

      const dupSet = new Set(duplicateIds)
      const rawItems = allFetchedItems.filter((r) => !dupSet.has(r.id))

      // Create lookup of existing recon items by ref_no and cheque_number across ALL dates
      const existingRefNos = new Set(rawItems.map((r) => String(r.ref_no || '').trim().toLowerCase()))
      const existingChequeNos = new Set(rawItems.map((r) => String(r.cheque_number || '').trim().toLowerCase()))

      // Helper to check if a row in bank_reconciliation_items matches the target bank
      const matchesTargetBank = (row) => {
        // If it's a customer cheque deposit with an explicit deposit_bank_id, strictly respect deposit_bank_id
        const refU = String(row.ref_no || '').trim().toUpperCase()
        if (refU.startsWith('RCV-CHQ-')) {
          const chq = chequesByIdMap.get(String(row.ref_no || '').trim().slice(8))
          if (chq?.deposit_bank_id) {
            return String(chq.deposit_bank_id) === String(activeBankId)
          }
        }

        if (String(row.bank_id) === String(activeBankId)) return true
        if (targetCode && String(row.bank_id).toLowerCase() === targetCode) return true
        if (targetBankCode && String(row.bank_id) === targetBankCode) return true
        if (targetBankName && String(row.bank_id || '').toLowerCase() === targetBankName) return true
        if (targetBankName && String(row.bank_name || '').toLowerCase() === targetBankName) return true

        const rowChequeNo = row.cheque_number || ''
        const codeInCheque = extractBankCodeFromCheque(rowChequeNo)
        if (targetBankCode && codeInCheque && codeInCheque === targetBankCode) return true

        if (targetBankName && String(row.description || '').toLowerCase().includes(targetBankName)) return true

        return false
      }

      // Filter recon items that match this bank
      const matchedReconItems = rawItems.filter(matchesTargetBank)

      // 1. Identify missing customer cheques for this bank
      const missingCheques = depositedCheques.filter((c) => {
        const matchesBank = c.deposit_bank_id
          ? String(c.deposit_bank_id) === String(activeBankId)
          : (targetBankCode && String(c.bank_code) === targetBankCode) ||
            matchesPaymentToBank(c.bank_name, c.cheque_number, targetBank)

        if (!matchesBank) return false

        const refNo = `rcv-chq-${c.id}`.toLowerCase()
        const chqNo = String(c.cheque_number || '').trim().toLowerCase()
        return !existingRefNos.has(refNo) && (!chqNo || !existingChequeNos.has(chqNo))
      })

      // 2. Identify missing customer bank transfers for this bank
      const missingRcvTransfers = rcvTransfers.filter((p) => {
        if (!matchesPaymentToBank(p.bank_name, p.reference, targetBank)) return false
        const refNo = `rcv-trf-${p.id}`.toLowerCase()
        return !existingRefNos.has(refNo)
      })

      // 3. Identify missing vendor bank transfers for this bank
      const missingPayTransfers = payPayments.filter((p) => {
        if (p.method !== 'bank') return false
        if (!matchesPaymentToBank(p.bank_name, p.reference, targetBank)) return false
        const refNo = `pay-trf-${p.id}`.toLowerCase()
        return !existingRefNos.has(refNo)
      })

      // 4. Identify missing vendor cheques for this bank
      const missingPayCheques = payPayments.filter((p) => {
        if (p.method !== 'cheque') return false
        if (!matchesPaymentToBank(p.bank_name, p.reference, targetBank)) return false
        const refNo = `pay-chq-${p.id}`.toLowerCase()
        const chqNo = String(p.reference || '').trim().toLowerCase()
        return !existingRefNos.has(refNo) && (!chqNo || !existingChequeNos.has(chqNo))
      })

      // Assemble all new rows to auto-insert
      const newReconRows = []

      missingCheques.forEach((c) => {
        const cName = c.customers?.name ?? ''
        const day = c.deposited_at
          ? String(c.deposited_at).slice(0, 10)
          : (c.cheque_date ? String(c.cheque_date).slice(0, 10) : todayStr)
        newReconRows.push({
          bank_id: activeBankId,
          trx_date: day,
          ref_no: `RCV-CHQ-${c.id}`,
          post_date: day,
          description: cleanReconDescription(`Customer Cheque Deposit${cName ? ` - ${cName}` : ''}${c.bank_name ? ` (${c.bank_name})` : ''}`),
          due_date: c.cheque_date ? String(c.cheque_date).slice(0, 10) : null,
          cheque_number: c.cheque_number || null,
          amount: Number(c.amount ?? 0),
          reconciled: false,
        })
      })

      missingRcvTransfers.forEach((p) => {
        const cName = p.invoices?.customers?.name ?? ''
        const invNo = formatDocRef(p.invoices?.invoice_number, 'INV')
        const day = p.paid_at ? String(p.paid_at).slice(0, 10) : todayStr
        newReconRows.push({
          bank_id: activeBankId,
          trx_date: day,
          ref_no: `RCV-TRF-${p.id}`,
          post_date: day,
          description: cleanReconDescription(`Customer Bank Transfer${cName ? ` - ${cName}` : ''}${invNo ? ` (${invNo})` : ''}`),
          due_date: null,
          cheque_number: p.reference || null,
          amount: Number(p.amount ?? 0),
          reconciled: false,
        })
      })

      missingPayTransfers.forEach((p) => {
        const vName = p.purchases?.vendors?.name ?? ''
        const purRef = formatDocRef(p.purchases?.ref_no, 'PUR')
        const day = p.paid_at ? String(p.paid_at).slice(0, 10) : todayStr
        newReconRows.push({
          bank_id: activeBankId,
          trx_date: day,
          ref_no: `PAY-TRF-${p.id}`,
          post_date: day,
          description: cleanReconDescription(`Vendor Bank Transfer${vName ? ` - ${vName}` : ''}${purRef ? ` (${purRef})` : ''}`),
          due_date: null,
          cheque_number: p.reference || null,
          amount: Number(p.amount ?? 0),
          reconciled: false,
        })
      })

      missingPayCheques.forEach((p) => {
        const vName = p.purchases?.vendors?.name ?? ''
        const purRef = formatDocRef(p.purchases?.ref_no, 'PUR')
        const day = p.paid_at ? String(p.paid_at).slice(0, 10) : todayStr
        newReconRows.push({
          bank_id: activeBankId,
          trx_date: day,
          ref_no: `PAY-CHQ-${p.id}`,
          post_date: day,
          description: cleanReconDescription(`Vendor Cheque Payment${vName ? ` - ${vName}` : ''}${purRef ? ` (${purRef})` : ''}`),
          due_date: day,
          cheque_number: p.reference || null,
          amount: Number(p.amount ?? 0),
          reconciled: false,
        })
      })

      // If any items are missing, insert them into bank_reconciliation_items
      if (newReconRows.length > 0) {
        const { data: inserted, error: insErr } = await supabase
          .from('bank_reconciliation_items')
          .insert(newReconRows)
          .select('id, bank_id, trx_date, ref_no, post_date, description, due_date, cheque_number, amount, reconciled, created_at')

        if (!insErr && inserted) {
          inserted.forEach((item) => {
            matchedReconItems.push(item)
          })
        }
      }

      // Filter by date range in memory and clean descriptions
      const dateFilteredItems = matchedReconItems
        .filter((item) => {
          const itemDate = item.trx_date ? String(item.trx_date).slice(0, 10) : ''
          return (!from || itemDate >= from) && (!to || itemDate <= to)
        })
        .map((item) => ({
          ...item,
          description: cleanReconDescription(item.description),
        }))

      // Sort by transaction date newest first
      dateFilteredItems.sort((a, b) => {
        const da = String(a.trx_date || '')
        const db = String(b.trx_date || '')
        return db.localeCompare(da)
      })

      setRows(dateFilteredItems)
    } catch (e) {
      console.error(e)
      setRows([])
      setError(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const loadBanks = async () => {
    const { data, error: err } = await supabase.from('banks').select('id, code, name, bank_code, branch').order('code')
    if (err) {
      setBanks([])
      return
    }
    const bankList = data ?? []
    setBanks(bankList)
    if (!form.bank_id && bankList.length > 0) {
      setForm((p) => ({ ...p, bank_id: bankList[0].id }))
      load(bankList[0].id, form.from_date, form.to_date, bankList)
    }
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await loadBanks()
      setLoading(false)
    })().catch((e) => {
      console.error(e)
      toast.error('Failed to load')
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBankChange = (newBankId) => {
    setForm((p) => ({ ...p, bank_id: newBankId }))
    load(newBankId, form.from_date, form.to_date)
  }

  const applyDatePreset = (preset) => {
    let nextFrom = ''
    let nextTo = ''
    if (preset === 'today') {
      nextFrom = todayStr
      nextTo = todayStr
    } else if (preset === 'this-month') {
      nextFrom = firstOfMonthStr
      nextTo = todayStr
    } else if (preset === 'all') {
      nextFrom = ''
      nextTo = ''
    }
    setForm((p) => ({ ...p, from_date: nextFrom, to_date: nextTo }))
    load(form.bank_id, nextFrom, nextTo)
  }

  const filteredRows = useMemo(() => {
    let list = rows
    if (statusFilter === 'reconciled') {
      list = list.filter((r) => !!r.reconciled)
    } else if (statusFilter === 'unreconciled') {
      list = list.filter((r) => !r.reconciled)
    } else if (statusFilter === 'inflow') {
      list = list.filter((r) => getItemTypeInfo(r).flow === 'in')
    } else if (statusFilter === 'outflow') {
      list = list.filter((r) => getItemTypeInfo(r).flow === 'out')
    }

    if (typeFilter !== 'all') {
      list = list.filter((r) => getItemTypeInfo(r).label === typeFilter)
    }

    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) =>
      String(r.ref_no ?? '').toLowerCase().includes(q) ||
      String(r.description ?? '').toLowerCase().includes(q) ||
      String(r.cheque_number ?? '').toLowerCase().includes(q)
    )
  }, [rows, search, statusFilter, typeFilter])

  const selectedBank = useMemo(() => banks.find((b) => String(b.id) === String(form.bank_id)), [banks, form.bank_id])
  const selectedBankLabel = selectedBank
    ? (selectedBank.code ? `${selectedBank.code} - ` : '') + (selectedBank.name ?? '') + (selectedBank.branch ? ` (${selectedBank.branch})` : '')
    : 'All Banks'

  const totals = useMemo(() => {
    let totalInflow = 0
    let totalOutflow = 0
    let reconciledCount = 0
    let unreconciledCount = 0
    let reconciledAmount = 0
    let unreconciledAmount = 0
    let reconciledInflow = 0
    let reconciledOutflow = 0
    let unreconciledInflow = 0
    let unreconciledOutflow = 0

    let custChequeAmt = 0
    let custChequeCount = 0
    let custTrfAmt = 0
    let custTrfCount = 0
    let vendTrfAmt = 0
    let vendTrfCount = 0
    let vendChequeAmt = 0
    let vendChequeCount = 0

    rows.forEach((r) => {
      const amt = Number(r.amount ?? 0)
      const info = getItemTypeInfo(r)
      if (info.flow === 'in') {
        totalInflow += amt
      } else {
        totalOutflow += amt
      }

      if (r.reconciled) {
        reconciledCount++
        reconciledAmount += amt
        if (info.flow === 'in') reconciledInflow += amt
        else reconciledOutflow += amt
      } else {
        unreconciledCount++
        unreconciledAmount += amt
        if (info.flow === 'in') unreconciledInflow += amt
        else unreconciledOutflow += amt
      }

      if (info.label === 'Customer Cheque') {
        custChequeAmt += amt
        custChequeCount++
      } else if (info.label === 'Customer Transfer') {
        custTrfAmt += amt
        custTrfCount++
      } else if (info.label === 'Vendor Transfer') {
        vendTrfAmt += amt
        vendTrfCount++
      } else if (info.label === 'Vendor Cheque') {
        vendChequeAmt += amt
        vendChequeCount++
      }
    })

    return {
      totalInflow,
      totalOutflow,
      netImpact: totalInflow - totalOutflow,
      totalCount: rows.length,
      reconciledCount,
      unreconciledCount,
      reconciledAmount,
      unreconciledAmount,
      reconciledInflow,
      reconciledOutflow,
      reconciledNet: reconciledInflow - reconciledOutflow,
      unreconciledInflow,
      unreconciledOutflow,
      custChequeAmt,
      custChequeCount,
      custTrfAmt,
      custTrfCount,
      vendTrfAmt,
      vendTrfCount,
      vendChequeAmt,
      vendChequeCount,
    }
  }, [rows])

  const getExportData = () =>
    filteredRows.map((r) => {
      const typeInfo = getItemTypeInfo(r)
      const amt = Number(r.amount ?? 0)
      return {
        Bank: selectedBankLabel,
        Type: typeInfo.label,
        'RC Date': r.trx_date ? String(r.trx_date).slice(0, 10) : '',
        'Ref No': formatReconReference(r.ref_no || ''),
        'Post Date': r.post_date ? String(r.post_date).slice(0, 10) : '',
        Description: r.description || '',
        'Due Date': r.due_date ? String(r.due_date).slice(0, 10) : '',
        'Cheque / Ref #': r.cheque_number || '',
        'Money In (Deposit)': typeInfo.flow === 'in' ? amt : 0,
        'Money Out (Payment)': typeInfo.flow === 'out' ? amt : 0,
        Amount: amt,
        Reconciled: r.reconciled ? 'Yes' : 'No',
      }
    })

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

  const exportExcel = () => {
    const data = getExportData()
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), 'Bank Reconciliation')
    XLSX.writeFile(workbook, `bank-reconciliation-${todayStr}.xlsx`)
  }

  const exportCsv = () => {
    const data = getExportData()
    const sheet = XLSX.utils.json_to_sheet(data)
    const csv = XLSX.utils.sheet_to_csv(sheet)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bank-reconciliation-${todayStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const setBulkReconciled = async (value) => {
    const targetIds = filteredRows.filter((r) => !!r.reconciled !== value).map((r) => r.id)
    if (targetIds.length === 0) return
    setBulkSaving(true)
    const { error: err } = await supabase
      .from('bank_reconciliation_items')
      .update({ reconciled: value })
      .in('id', targetIds)
    if (err) {
      toast.error(err.message)
      setBulkSaving(false)
      return
    }
    const idSet = new Set(targetIds)
    setRows((prev) => prev.map((r) => (idSet.has(r.id) ? { ...r, reconciled: value } : r)))
    toast.success(`Marked ${targetIds.length} transaction(s) as ${value ? 'Reconciled (YES)' : 'Pending (NO)'}`)
    setBulkSaving(false)
  }

  const printReport = () => {
    const node = document.getElementById('bank-recon-report-print')
    const popup = window.open('', '_blank', 'width=1200,height=800')
    if (!popup || !node) {
      toast.error('Allow popups to print reports')
      return
    }
    popup.document.write(
      `<html><head><title>Bank Reconciliation Report - ${selectedBankLabel}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#0f172a}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #cbd5e1;padding:4px 6px}th{background:#f1f5f9;text-align:left}img{width:56px;height:56px;object-fit:cover}.summary-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}.summary-card{border:1px solid #cbd5e1;padding:6px;border-radius:4px}.flex-between{display:flex;align-items:center;justify-content:space-between}.border-header{border-bottom:2px solid #047857;padding-bottom:10px;margin-bottom:12px}.text-right{text-align:right}.text-center{text-align:center}.font-bold{font-weight:700}</style></head><body>${node.innerHTML}<script>window.onload=()=>{window.print();window.close()}</script></body></html>`
    )
    popup.document.close()
  }

  const exportPdf = () => {
    exportToPDF('bank-recon-report-print', `bank-reconciliation-${todayStr}.pdf`, {
      orientation: 'landscape',
      margin: 0.25,
      scale: 1.5,
    })
  }

  const setReconciled = async (id, value) => {
    setSavingId(id)
    const { error: err } = await supabase.from('bank_reconciliation_items').update({ reconciled: value }).eq('id', id)
    if (err) {
      toast.error(err.message)
      setSavingId('')
      return
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, reconciled: value } : r)))
    logAction({ action: value ? 'bank_recon_yes' : 'bank_recon_no', targetType: 'bank_reconciliation_item', targetId: id })
    setSavingId('')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="text-lg font-semibold text-slate-900 dark:text-white">Bank Reconciliation</div>
          <div className="text-sm text-slate-500 dark:text-emerald-100/70">
            Reconcile all customer/vendor cheques and bank transfers against your bank statement.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab((prev) => (prev === 'statement' ? 'table' : 'statement'))}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition ${
              activeTab === 'statement'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'border-slate-200 dark:border-emerald-800/60 bg-white dark:bg-emerald-950/50 text-slate-700 dark:text-emerald-100 hover:bg-slate-50 dark:hover:bg-emerald-900/40'
            }`}
          >
            <Layers size={14} />
            {activeTab === 'statement' ? 'Back to YES/NO Table' : 'View Statement Summary'}
          </button>
          <Link
            to="/reports/finance/bank-reconciliation"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600/30 dark:border-emerald-700 bg-emerald-50/80 dark:bg-emerald-900/40 text-xs font-bold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100"
          >
            <FileText size={14} />
            Full Reconciliation Report
          </Link>
          <button
            type="button"
            onClick={printReport}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-emerald-800/60 bg-white dark:bg-emerald-950/50 text-xs font-semibold text-slate-700 dark:text-emerald-100 hover:bg-slate-50 dark:hover:bg-emerald-900/40"
          >
            <Printer size={14} />
            Print
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-emerald-800/60 bg-white dark:bg-emerald-950/50 text-xs font-semibold text-slate-700 dark:text-emerald-100 hover:bg-slate-50 dark:hover:bg-emerald-900/40"
          >
            <Download size={14} />
            PDF
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-sm"
          >
            <FileSpreadsheet size={14} />
            Excel
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-emerald-800/60 bg-white dark:bg-emerald-950/50 text-xs font-semibold text-slate-700 dark:text-emerald-100 hover:bg-slate-50 dark:hover:bg-emerald-900/40"
          >
            CSV
          </button>
        </div>
      </div>

      {/* Bank Quick-Selector Buttons */}
      {banks.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60 mb-2">
            Quick Select Bank
          </div>
          <div className="flex flex-wrap gap-2">
            {banks.map((b) => {
              const isSelected = String(form.bank_id) === String(b.id)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleBankChange(b.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'border-slate-200 dark:border-emerald-900/40 bg-slate-50/70 dark:bg-emerald-950/40 text-slate-700 dark:text-emerald-100 hover:bg-slate-100 dark:hover:bg-emerald-900/40'
                  }`}
                >
                  <Landmark size={14} />
                  <span>{(b.code ? `${b.code} - ` : '') + (b.name ?? '')}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span>Money In (Deposits/Transfers)</span>
            <ArrowDownLeft size={16} />
          </div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {fmtMoney(totals.totalInflow)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 mt-0.5">
            Customer cheques & transfers
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30">
          <div className="flex items-center justify-between text-xs font-semibold text-rose-600 dark:text-rose-400">
            <span>Money Out (Payments/Cheques)</span>
            <ArrowUpRight size={16} />
          </div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {fmtMoney(totals.totalOutflow)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 mt-0.5">
            Vendor transfers & cheques
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30">
          <div className="text-xs font-semibold text-slate-600 dark:text-emerald-100/70">Net Cash Impact</div>
          <div className={`mt-1 text-lg font-bold ${totals.netImpact >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {fmtMoney(totals.netImpact)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 mt-0.5">
            Inflow minus Outflow
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-emerald-100/70">
            <span>Reconciliation Status</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {totals.reconciledCount} <span className="text-xs font-normal text-slate-400">/ {totals.totalCount} done</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 mt-0.5">
            {totals.unreconciledCount} pending verification
          </div>
        </div>
      </div>

      {/* Filter and Bank Selector Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-emerald-100/70 mb-1">Select Bank</div>
            <select
              value={form.bank_id}
              onChange={(e) => handleBankChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 text-sm text-slate-900 dark:text-white font-medium"
            >
              <option value="">Select Bank</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {(b.code ? `${b.code} - ` : '') + (b.name ?? '') + (b.branch ? ` (${b.branch})` : '')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-emerald-100/70 mb-1">From Date</div>
            <input
              type="date"
              value={form.from_date}
              onChange={(e) => setForm((p) => ({ ...p, from_date: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-emerald-100/70 mb-1">To Date</div>
            <input
              type="date"
              value={form.to_date}
              onChange={(e) => setForm((p) => ({ ...p, to_date: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => load()}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm inline-flex items-center gap-1.5"
            >
              <RefreshCw size={15} />
              Load
            </button>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ref, desc, cheque..."
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Quick Date Presets & Status Filter Pills */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-emerald-900/20 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 dark:text-emerald-100/60 font-semibold">Date Range:</span>
            <button
              type="button"
              onClick={() => applyDatePreset('this-month')}
              className={`px-2.5 py-1 rounded-md border font-medium transition ${
                form.from_date === firstOfMonthStr && form.to_date === todayStr
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-emerald-900/40 dark:text-emerald-100/70 dark:hover:bg-emerald-950/50'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('today')}
              className={`px-2.5 py-1 rounded-md border font-medium transition ${
                form.from_date === todayStr && form.to_date === todayStr
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-emerald-900/40 dark:text-emerald-100/70 dark:hover:bg-emerald-950/50'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('all')}
              className={`px-2.5 py-1 rounded-md border font-medium transition ${
                !form.from_date && !form.to_date
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-emerald-900/40 dark:text-emerald-100/70 dark:hover:bg-emerald-950/50'
              }`}
            >
              All Dates
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 dark:text-emerald-100/60 font-semibold mr-1">Status:</span>
            {[
              { id: 'all', label: 'All' },
              { id: 'unreconciled', label: 'Pending (NO)' },
              { id: 'reconciled', label: 'Reconciled (YES)' },
              { id: 'inflow', label: 'Money In' },
              { id: 'outflow', label: 'Money Out' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-medium transition ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-400 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-emerald-900/40 dark:text-emerald-100/70 dark:hover:bg-emerald-950/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Transaction Type Buttons & Bulk Reconciliation Buttons */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-emerald-900/20 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 dark:text-emerald-100/60 font-semibold mr-1">Transaction Type:</span>
            {[
              { id: 'all', label: 'All Types' },
              { id: 'Customer Cheque', label: 'Customer Cheques' },
              { id: 'Customer Transfer', label: 'Customer Transfers' },
              { id: 'Vendor Transfer', label: 'Vendor Transfers' },
              { id: 'Vendor Cheque', label: 'Vendor Cheques' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition ${
                  typeFilter === t.id
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-emerald-900/40 dark:text-emerald-100/70 dark:hover:bg-emerald-950/50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkSaving || filteredRows.length === 0}
              onClick={() => setBulkReconciled(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 font-semibold disabled:opacity-40"
            >
              <CheckCheck size={13} />
              Mark Shown YES
            </button>
            <button
              type="button"
              disabled={bulkSaving || filteredRows.length === 0}
              onClick={() => setBulkReconciled(false)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200 font-semibold disabled:opacity-40"
            >
              <RotateCcw size={13} />
              Mark Shown NO
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Bank Reconciliation Report Statement View */}
      {activeTab === 'statement' && (
        <div className="rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 overflow-hidden shadow-sm">
          <div className="bg-emerald-700 px-4 py-3 text-white flex items-center justify-between">
            <span className="text-sm font-black uppercase tracking-wider">
              Bank Reconciliation Statement — {selectedBankLabel}
            </span>
            <span className="text-xs font-semibold opacity-90">
              {form.from_date || 'Start'} to {form.to_date || 'Present'}
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-emerald-900/30 text-sm">
            <div className="px-4 py-2 bg-slate-50 dark:bg-emerald-950/50 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              1. Category Breakdown (Book Activity)
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="pl-4 text-slate-700 dark:text-emerald-100">
                Customer Cheque Deposits ({totals.custChequeCount})
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                + {fmtMoney(totals.custChequeAmt)}
              </span>
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="pl-4 text-slate-700 dark:text-emerald-100">
                Customer Bank Transfers ({totals.custTrfCount})
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                + {fmtMoney(totals.custTrfAmt)}
              </span>
            </div>
            <div className="px-4 py-2.5 flex justify-between bg-slate-50/70 dark:bg-emerald-950/40 font-bold">
              <span>Total Money In (Deposits &amp; Transfers)</span>
              <span className="text-emerald-700 dark:text-emerald-300">{fmtMoney(totals.totalInflow)}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="pl-4 text-slate-700 dark:text-emerald-100">
                Less: Vendor Bank Transfers ({totals.vendTrfCount})
              </span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                - {fmtMoney(totals.vendTrfAmt)}
              </span>
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="pl-4 text-slate-700 dark:text-emerald-100">
                Less: Vendor Cheques Issued ({totals.vendChequeCount})
              </span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                - {fmtMoney(totals.vendChequeAmt)}
              </span>
            </div>
            <div className="px-4 py-2.5 flex justify-between bg-slate-50/70 dark:bg-emerald-950/40 font-bold">
              <span>Total Money Out (Payments &amp; Cheques)</span>
              <span className="text-rose-600 dark:text-rose-400">- {fmtMoney(totals.totalOutflow)}</span>
            </div>

            <div className="px-4 py-2 bg-slate-50 dark:bg-emerald-950/50 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              2. Reconciliation Summary (Reconciled YES vs Pending NO)
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="pl-4 text-slate-700 dark:text-emerald-100">
                Reconciled Money In (Verified YES)
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                + {fmtMoney(totals.reconciledInflow)}
              </span>
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="pl-4 text-slate-700 dark:text-emerald-100">
                Less: Reconciled Money Out (Verified YES)
              </span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                - {fmtMoney(totals.reconciledOutflow)}
              </span>
            </div>
            <div className="px-4 py-2.5 flex justify-between bg-slate-50/70 dark:bg-emerald-950/40 font-bold">
              <span>Net Reconciled Movement ({totals.reconciledCount} items)</span>
              <span>{fmtMoney(totals.reconciledNet)}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="pl-4 text-slate-700 dark:text-emerald-100">
                Plus: Uncleared Deposits &amp; Transfers In (Pending NO)
              </span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                + {fmtMoney(totals.unreconciledInflow)}
              </span>
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="pl-4 text-slate-700 dark:text-emerald-100">
                Less: Unpresented Cheques &amp; Transfers Out (Pending NO)
              </span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                - {fmtMoney(totals.unreconciledOutflow)}
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between bg-emerald-700 text-white font-black text-base">
              <span>NET BOOK CASH IMPACT ({totals.totalCount} items)</span>
              <span>{fmtMoney(totals.netImpact)}</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Main Table */}
      <div className="rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 overflow-hidden shadow-sm">
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50 dark:bg-emerald-950/60 text-slate-600 dark:text-emerald-100/70 border-b border-slate-200 dark:border-emerald-900/40">
              <tr>
                <th className="p-3 text-center w-14 font-bold text-emerald-700 dark:text-emerald-400">YES</th>
                <th className="p-3 text-center w-14 font-bold text-rose-700 dark:text-rose-400">NO</th>
                <th className="p-3 text-left w-36">Type</th>
                <th className="p-3 text-left">RC Date</th>
                <th className="p-3 text-left">Ref No</th>
                <th className="p-3 text-left">Post Date</th>
                <th className="p-3 text-left min-w-[200px]">Description</th>
                <th className="p-3 text-left">Due Date</th>
                <th className="p-3 text-left">Cheque / Ref #</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-emerald-900/30">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500 dark:text-emerald-100/60">
                    <RefreshCw className="animate-spin inline-block mr-2" size={16} />
                    Loading bank transactions...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500 dark:text-emerald-100/60">
                    No transactions found for this bank matching the criteria.
                    {form.from_date && (
                      <span className="block mt-1 text-xs text-slate-400">
                        Try selecting{' '}
                        <button
                          type="button"
                          onClick={() => applyDatePreset('all')}
                          className="text-emerald-600 dark:text-emerald-400 underline font-semibold"
                        >
                          All Dates
                        </button>{' '}
                        to see all transactions.
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const isYes = !!r.reconciled
                  const busy = savingId === r.id
                  const typeInfo = getItemTypeInfo(r)
                  const isInflow = typeInfo.flow === 'in'

                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors ${
                        isYes
                          ? 'bg-emerald-50/20 dark:bg-emerald-950/20 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/40'
                          : 'hover:bg-slate-50 dark:hover:bg-emerald-500/5'
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isYes}
                          disabled={busy}
                          onChange={(e) => setReconciled(r.id, e.target.checked)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={!isYes}
                          disabled={busy}
                          onChange={(e) => setReconciled(r.id, !e.target.checked)}
                          className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${typeInfo.badgeClass}`}
                        >
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-slate-900 dark:text-white">
                        {r.trx_date ? String(r.trx_date).slice(0, 10) : '-'}
                      </td>
                      <td className="p-3 text-xs font-mono text-slate-600 dark:text-emerald-100/70">
                        {formatReconReference(r.ref_no || '-')}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-emerald-100/70">
                        {r.post_date ? String(r.post_date).slice(0, 10) : '-'}
                      </td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50 text-xs">
                        {r.description || '-'}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-emerald-100/70">
                        {r.due_date ? String(r.due_date).slice(0, 10) : '-'}
                      </td>
                      <td className="p-3 font-mono text-xs text-slate-700 dark:text-emerald-50">
                        {r.cheque_number || '-'}
                      </td>
                      <td className="p-3 text-right">
                        <div
                          className={`font-semibold inline-flex items-center gap-1 ${
                            isInflow
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isInflow ? (
                            <ArrowDownLeft size={13} className="inline opacity-80" />
                          ) : (
                            <ArrowUpRight size={13} className="inline opacity-80" />
                          )}
                          <span>
                            {isInflow ? '+' : '-'} {fmtMoney(r.amount)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-emerald-900/30 bg-slate-50/50 dark:bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-xs text-slate-500 dark:text-emerald-100/60">
            Showing <span className="font-semibold text-slate-800 dark:text-white">{filteredRows.length}</span> of{' '}
            <span className="font-semibold text-slate-800 dark:text-white">{rows.length}</span> transaction(s)
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="text-emerald-600 dark:text-emerald-400">
              Inflow: <span className="font-bold">{fmtMoney(totals.totalInflow)}</span>
            </span>
            <span className="text-rose-600 dark:text-rose-400">
              Outflow: <span className="font-bold">{fmtMoney(totals.totalOutflow)}</span>
            </span>
            <span className="text-slate-700 dark:text-emerald-100/80">
              Net Impact:{' '}
              <span
                className={`font-bold ${
                  totals.netImpact >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {fmtMoney(totals.netImpact)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Printable / PDF Bank Reconciliation Report (Explicitly Paginated to fit A4 Landscape with zero clipping or row splitting) */}
      <div className="fixed left-[-10000px] top-0 w-[1040px]">
        <div
          id="bank-recon-report-print"
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
                          Period: {form.from_date || 'Start'} – {form.to_date || 'Present'} • Page {pageIdx + 1} of{' '}
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
                          {fmtMoney(totals.totalInflow)}
                        </div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                          Money Out (Payments)
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#be123c', marginTop: '2px' }}>
                          {fmtMoney(totals.totalOutflow)}
                        </div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                          Net Cash Impact
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                          {fmtMoney(totals.netImpact)}
                        </div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                          Reconciled (YES)
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                          {totals.reconciledCount} ({fmtMoney(totals.reconciledAmount)})
                        </div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                          Pending (NO)
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                          {totals.unreconciledCount} ({fmtMoney(totals.unreconciledAmount)})
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
                      Bank: {selectedBankLabel} • Period: {form.from_date || 'Start'} – {form.to_date || 'Present'} •
                      Page {pageIdx + 1} of {pdfPages.length}
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
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '11.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '4%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: '#ecfdf5' }}>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Type
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        RC Date
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Ref No
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Post Date
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Description
                      </th>
                      <th style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'left', color: '#065f46' }}>
                        Due Date
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
                    {chunk.map((r) => {
                      const typeInfo = getItemTypeInfo(r)
                      const isInflow = typeInfo.flow === 'in'
                      return (
                        <tr key={r.id} className="pdf-avoid-break">
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', wordBreak: 'break-word' }}>
                            {typeInfo.label}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', whiteSpace: 'nowrap' }}>
                            {r.trx_date ? String(r.trx_date).slice(0, 10) : '-'}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', wordBreak: 'break-all' }}>
                            {formatReconReference(r.ref_no || '-')}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', whiteSpace: 'nowrap' }}>
                            {r.post_date ? String(r.post_date).slice(0, 10) : '-'}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', wordBreak: 'break-word' }}>
                            {r.description || '-'}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', whiteSpace: 'nowrap' }}>
                            {r.due_date ? String(r.due_date).slice(0, 10) : '-'}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', wordBreak: 'break-word' }}>
                            {r.cheque_number || '-'}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {isInflow ? fmtMoney(r.amount) : '-'}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 5px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {!isInflow ? fmtMoney(r.amount) : '-'}
                          </td>
                          <td
                            style={{
                              border: '1px solid #cbd5e1',
                              padding: '4px 5px',
                              textAlign: 'center',
                              fontWeight: 700,
                            }}
                          >
                            {r.reconciled ? 'YES' : 'NO'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {isLastPage && (
                    <tfoot>
                      <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                        <td colSpan={7} style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right' }}>
                          GRAND TOTAL ({filteredRows.length} transactions):
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {fmtMoney(totals.totalInflow)}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {fmtMoney(totals.totalOutflow)}
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
                  <span>Generated on {new Date().toLocaleString()}</span>
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

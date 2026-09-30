import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Search, Landmark, ArrowRightCircle, HandHelping, AlertCircle, CheckCircle, RotateCcw, RefreshCw } from 'lucide-react'
import {
  STATUS_IN_HAND,
  STATUS_DEPOSITED,
  STATUS_HANDED_OVER,
  STATUS_RETURNED,
  reverseChequePayments,
  matchesChequePayment,
  getChequeNumberVariants,
} from '../lib/receivableChequeWorkflow'

const fmtMoney = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function ChequeAdministrationPage() {
  const toast = useToast()

  const [tab, setTab] = useState('in_hand') // 'in_hand' | 'deposited' | 'handed_over'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const [chequesInHand, setChequesInHand] = useState([])
  const [chequesDeposited, setChequesDeposited] = useState([])
  const [chequesHandedOver, setChequesHandedOver] = useState([])
  const [payableCheques, setPayableCheques] = useState([])
  const [banks, setBanks] = useState([])

  // Maps chequeId -> Array of active invoice_payments matching this cheque
  const [unreversedPaymentsMap, setUnreversedPaymentsMap] = useState(new Map())

  const [selectedIds, setSelectedIds] = useState(new Set())

  const [depositFrom, setDepositFrom] = useState('')
  const [depositTo, setDepositTo] = useState('')

  const [depositBankOpen, setDepositBankOpen] = useState(false)
  const [depositBankSaving, setDepositBankSaving] = useState(false)
  const [depositBankId, setDepositBankId] = useState('')
  const [processingHandover, setProcessingHandover] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)

    try {
      const [handRes, depRes, handedRes, payChequeRes, bankRes] = await Promise.all([
        supabase
          .from('customer_cheques')
          .select('id, cheque_date, cheque_number, amount, bank_name, customer_id, status, deposited_at, created_at, customers(name)')
          .eq('status', STATUS_IN_HAND)
          .order('cheque_date', { ascending: true }),
        supabase
          .from('customer_cheques')
          .select('id, cheque_date, cheque_number, amount, bank_name, customer_id, status, deposited_at, created_at, customers(name)')
          .eq('status', STATUS_DEPOSITED)
          .order('deposited_at', { ascending: false }),
        supabase
          .from('customer_cheques')
          .select('id, cheque_date, cheque_number, amount, bank_name, customer_id, status, deposited_at, created_at, customers(name)')
          .in('status', [STATUS_HANDED_OVER, STATUS_RETURNED])
          .order('created_at', { ascending: false }),
        supabase
          .from('purchase_payments')
          .select('id, amount, paid_at, reference, method, bank_name, created_at, purchases(vendor_id, vendors(name))')
          .eq('method', 'cheque')
          .order('paid_at', { ascending: false }),
        supabase.from('banks').select('id, code, name, branch').order('code'),
      ])

      if (handRes.error) throw handRes.error
      if (depRes.error) throw depRes.error
      if (handedRes.error) throw handedRes.error

      const inHandData = handRes.data ?? []
      const depData = depRes.data ?? []
      const handedData = handedRes.data ?? []

      setChequesInHand(inHandData)
      setChequesDeposited(depData)
      setChequesHandedOver(handedData)
      setBanks(bankRes?.data ?? [])
      if (!depositBankId && (bankRes?.data ?? []).length > 0) {
        setDepositBankId(bankRes.data[0].id)
      }

      // Map payable cheques to same shape as customer cheques
      const payables = (payChequeRes.data ?? []).map((p) => ({
        id: `payable-${p.id}`,
        cheque_date: p.paid_at,
        cheque_number: p.reference,
        amount: p.amount,
        bank_name: p.bank_name ?? null,
        customer_id: null,
        status: STATUS_DEPOSITED,
        deposited_at: p.paid_at,
        created_at: p.created_at,
        cheque_type: 'payable',
        vendors: p.purchases?.vendors ?? null,
        customers: null,
      }))
      setPayableCheques(payables)

      // Detect unreversed payments for handed-over or returned cheques
      if (handedData.length > 0) {
        await checkUnreversedPayments(handedData)
      } else {
        setUnreversedPaymentsMap(new Map())
      }
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'Failed to load')
      setChequesInHand([])
      setChequesDeposited([])
      setChequesHandedOver([])
    } finally {
      setLoading(false)
    }
  }

  const checkUnreversedPayments = async (handedCheques) => {
    try {
      const custIds = Array.from(new Set(handedCheques.map((c) => c.customer_id).filter(Boolean)))
      let candidatePayments = []

      if (custIds.length > 0) {
        const { data: custInvoices } = await supabase
          .from('invoices')
          .select('id, customer_id')
          .in('customer_id', custIds)

        if (custInvoices && custInvoices.length > 0) {
          const invIds = custInvoices.map((i) => i.id)
          const { data: invPayments } = await supabase
            .from('invoice_payments')
            .select('id, invoice_id, amount, paid_at, method, reference, bank_name')
            .in('invoice_id', invIds)

          if (invPayments) candidatePayments = invPayments
        }
      }

      const allVariants = Array.from(
        new Set(handedCheques.flatMap((c) => getChequeNumberVariants(c.cheque_number)))
      )
      if (allVariants.length > 0) {
        const { data: refPayments } = await supabase
          .from('invoice_payments')
          .select('id, invoice_id, amount, paid_at, method, reference, bank_name')
          .in('reference', allVariants)

        if (refPayments) {
          const seen = new Set(candidatePayments.map((p) => p.id))
          for (const p of refPayments) {
            if (!seen.has(p.id)) {
              candidatePayments.push(p)
              seen.add(p.id)
            }
          }
        }
      }

      const map = new Map()
      for (const cheque of handedCheques) {
        const matches = candidatePayments.filter((p) => matchesChequePayment(p, cheque))
        if (matches.length > 0) {
          map.set(cheque.id, matches)
        }
      }
      setUnreversedPaymentsMap(map)
    } catch (err) {
      console.error('Failed to check unreversed payments:', err)
    }
  }

  useEffect(() => {
    load().catch((e) => {
      console.error(e)
      toast.error('Failed to load cheques')
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredInHand = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = chequesInHand.slice()
    if (!q) return rows

    return rows.filter((r) =>
      String(r.cheque_number ?? '').toLowerCase().includes(q) ||
      String(r.bank_name ?? '').toLowerCase().includes(q) ||
      String(r.customers?.name ?? '').toLowerCase().includes(q)
    )
  }, [chequesInHand, search])

  const utcDayKey = (isoOrDate) => {
    if (!isoOrDate) return ''
    const d = new Date(isoOrDate)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  }

  const depositedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const allDeposited = [...chequesDeposited, ...payableCheques]

    return allDeposited.filter((r) => {
      if (depositFrom || depositTo) {
        const day =
          utcDayKey(r.deposited_at) ||
          utcDayKey(r.cheque_date) ||
          utcDayKey(r.created_at)
        if (!day) return false
        if (depositFrom && day < depositFrom) return false
        if (depositTo && day > depositTo) return false
      }

      if (!q) return true
      const name = r.cheque_type === 'payable' ? r.vendors?.name : r.customers?.name
      return (
        String(r.cheque_number ?? '').toLowerCase().includes(q) ||
        String(r.bank_name ?? '').toLowerCase().includes(q) ||
        String(name ?? '').toLowerCase().includes(q)
      )
    })
  }, [chequesDeposited, payableCheques, depositFrom, depositTo, search])

  const handedOverFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = chequesHandedOver.slice()
    if (!q) return rows

    return rows.filter((r) =>
      String(r.cheque_number ?? '').toLowerCase().includes(q) ||
      String(r.bank_name ?? '').toLowerCase().includes(q) ||
      String(r.customers?.name ?? '').toLowerCase().includes(q)
    )
  }, [chequesHandedOver, search])

  const inHandTotals = useMemo(() => {
    const ids = selectedIds
    const selectedRows = filteredInHand.filter((r) => ids.has(r.id))
    const total = selectedRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
    return { count: selectedRows.length, total }
  }, [filteredInHand, selectedIds])

  const handedOverTotals = useMemo(() => {
    const ids = selectedIds
    const selectedRows = handedOverFiltered.filter((r) => ids.has(r.id))
    const total = selectedRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
    return { count: selectedRows.length, total }
  }, [handedOverFiltered, selectedIds])

  const selectedTotals = useMemo(() => {
    const source =
      tab === 'in_hand'
        ? filteredInHand
        : tab === 'deposited'
          ? depositedFiltered
          : handedOverFiltered
    const rows = source.filter((r) => selectedIds.has(r.id))
    const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
    return { count: rows.length, total }
  }, [tab, filteredInHand, depositedFiltered, handedOverFiltered, selectedIds])

  const showRows =
    tab === 'in_hand'
      ? filteredInHand
      : tab === 'deposited'
        ? depositedFiltered
        : handedOverFiltered

  const toggleAll = (checked) => {
    if (!checked) {
      setSelectedIds(new Set())
      return
    }

    const source =
      tab === 'in_hand'
        ? filteredInHand
        : tab === 'deposited'
          ? depositedFiltered.filter((r) => r.cheque_type !== 'payable')
          : handedOverFiltered
    const next = new Set(source.map((r) => r.id))
    setSelectedIds(next)
  }

  const toggleOne = (id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const depositSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('Select at least one cheque')
      return
    }

    if (banks.length === 0) {
      toast.error('No banks found. Add a bank first.')
      return
    }

    setDepositBankOpen(true)
  }

  const confirmDepositToBank = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('Select at least one cheque')
      return
    }
    if (!depositBankId) {
      toast.error('Select a bank')
      return
    }

    const selectedRows = chequesInHand.filter((r) =>
      ids.some((id) => String(id) === String(r.id))
    )
    if (selectedRows.length === 0) {
      toast.error('No cheques to deposit')
      return
    }

    setDepositBankSaving(true)
    const nowIso = new Date().toISOString()
    const trxDate = nowIso.slice(0, 10)

    try {
      const { error: err } = await supabase
        .from('customer_cheques')
        .update({ status: STATUS_DEPOSITED, deposited_at: nowIso })
        .in('id', ids)
      if (err) throw err

      const reconPayload = selectedRows.map((r) => {
        const customerName = r.customers?.name ?? ''
        const chequeNo = r.cheque_number ?? ''
        return {
          bank_id: depositBankId,
          trx_date: trxDate,
          ref_no: `RCV-CHQ-${r.id}`,
          post_date: trxDate,
          description: `Receivable cheque deposit${customerName ? ` - ${customerName}` : ''}`,
          due_date: r.cheque_date ? String(r.cheque_date).slice(0, 10) : null,
          cheque_number: chequeNo || null,
          amount: Number(r.amount ?? 0),
          reconciled: false,
        }
      })

      const { error: reconErr } = await supabase.from('bank_reconciliation_items').insert(reconPayload)
      if (reconErr) {
        console.error(reconErr)
        toast.error(
          `Cheques deposited, but bank reconciliation could not be saved: ${reconErr.message}.`
        )
      } else {
        toast.success('Cheque(s) deposited to bank')
      }
      logAction({ action: 'deposit_cheques', targetType: 'customer_cheque' })
      setSelectedIds(new Set())
      setDepositBankOpen(false)
      setDepositFrom('')
      setDepositTo('')
      await load()
      setTab('deposited')
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to deposit cheques')
    } finally {
      setDepositBankSaving(false)
    }
  }

  // Handover selected cheques to customer
  const handoverSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('Select at least one cheque')
      return
    }

    const allCheques = [...chequesInHand, ...chequesDeposited, ...chequesHandedOver]
    const selectedRows = allCheques.filter((r) =>
      ids.some((id) => String(id) === String(r.id))
    )

    if (selectedRows.length === 0) {
      toast.error('No cheques found for selection')
      return
    }

    const totalVal = selectedRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)

    const confirmMsg =
      selectedRows.length === 1
        ? `Hand over cheque "${selectedRows[0].cheque_number}" back to customer? The cheque value (${fmtMoney(selectedRows[0].amount)}) will be removed from payments and returned back to the customer's balance in Receivables.`
        : `Hand over ${selectedRows.length} cheques back to customers? Total ${fmtMoney(totalVal)} will be removed from payments and returned back to customers' balances in Receivables.`

    if (!window.confirm(confirmMsg)) return

    setProcessingHandover(true)
    try {
      const result = await reverseChequePayments(supabase, selectedRows, STATUS_HANDED_OVER)

      if (!result.ok) {
        throw result.error || new Error('Failed to reverse cheque payments')
      }

      for (const r of selectedRows) {
        logAction({
          action: 'handover_cheques',
          targetType: 'customer_cheque',
          targetId: r.id,
          targetLabel: r.cheque_number,
          details: `Handed over cheque ${r.cheque_number} (${fmtMoney(r.amount)}) back to customer ${r.customers?.name || r.customer_id || ''}. Value of ${fmtMoney(result.reversedTotal)} added back to Receivable balance.`,
        })
      }

      if (result.reversedTotal > 0) {
        toast.success(
          selectedRows.length === 1
            ? `Cheque ${selectedRows[0].cheque_number} handed over. ${fmtMoney(result.reversedTotal)} removed from payments and returned to customer's Receivable balance!`
            : `${selectedRows.length} cheques handed over. ${fmtMoney(result.reversedTotal)} removed from payments and returned to Receivable balances!`
        )
      } else {
        toast.success(
          `Cheque(s) marked as handed over. (Payment was already reversed or not found in receivables.)`
        )
      }

      setSelectedIds(new Set())
      await load()
      setTab('handed_over')
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to handover cheque(s)')
    } finally {
      setProcessingHandover(false)
    }
  }

  // Move / Restore selected cheques back to In Hand
  const moveToInHandSelected = async (targetIds = null) => {
    const ids = targetIds ? Array.from(targetIds) : Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('Select at least one cheque')
      return
    }

    const allCheques = [...chequesInHand, ...chequesDeposited, ...chequesHandedOver]
    const targetCheques = allCheques.filter((c) => ids.some((id) => String(id) === String(c.id)))

    const { error: err } = await supabase
      .from('customer_cheques')
      .update({ status: STATUS_IN_HAND, deposited_at: null })
      .in('id', ids)

    if (err) {
      toast.error(err.message)
      return
    }

    // If restoring from handed_over / returned, check if invoice_payments should be restored
    for (const cheque of targetCheques) {
      if (cheque.status === STATUS_HANDED_OVER || cheque.status === STATUS_RETURNED) {
        const existingPayments = unreversedPaymentsMap.get(cheque.id) || []
        if (existingPayments.length === 0 && cheque.customer_id) {
          try {
            const { data: invs } = await supabase
              .from('invoices')
              .select('id, invoice_number, total_amount, created_at')
              .eq('customer_id', cheque.customer_id)
              .eq('payment_type', 'credit')
              .order('created_at', { ascending: true })

            if (invs && invs.length > 0) {
              await supabase.from('invoice_payments').insert({
                invoice_id: invs[0].id,
                amount: cheque.amount,
                paid_at: cheque.cheque_date || new Date().toISOString().slice(0, 10),
                method: 'cheque',
                reference: cheque.cheque_number,
                bank_name: cheque.bank_name || null,
                note: 'Restored from handed-over cheques',
              })
            }
          } catch (restoreErr) {
            console.warn('Could not auto-restore invoice payment for cheque:', restoreErr)
          }
        }
      }
    }

    toast.success(
      ids.length === 1
        ? 'Cheque restored to Cheques In Hand'
        : `${ids.length} cheques restored to Cheques In Hand`
    )
    logAction({
      action: 'restore_cheques_to_in_hand',
      targetType: 'customer_cheque',
      details: `Restored ${ids.length} cheque(s) to Cheques In Hand.`,
    })
    setSelectedIds(new Set())
    await load()
    setTab('in_hand')
  }

  // Return selected cheques (e.g. bounced / returned by bank)
  const returnSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('Select at least one cheque')
      return
    }

    const allCheques = [...chequesInHand, ...chequesDeposited]
    const selectedRows = allCheques.filter((r) =>
      ids.some((id) => String(id) === String(r.id))
    )

    if (selectedRows.length === 0) {
      toast.error('No cheques found for selection')
      return
    }

    const totalVal = selectedRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)

    const confirmMsg =
      `Mark ${selectedRows.length} cheque(s) as RETURNED? Their value (${fmtMoney(totalVal)}) will be removed from payments and returned back to the customer's balance in Receivables.`

    if (!window.confirm(confirmMsg)) return

    setProcessingHandover(true)
    try {
      const result = await reverseChequePayments(supabase, selectedRows, STATUS_RETURNED)

      if (!result.ok) {
        throw result.error || new Error('Failed to return cheque(s)')
      }

      for (const r of selectedRows) {
        logAction({
          action: 'return_cheques',
          targetType: 'customer_cheque',
          targetId: r.id,
          targetLabel: r.cheque_number,
          details: `Returned cheque ${r.cheque_number} (${fmtMoney(r.amount)}). Value returned back to customer's Receivable balance.`,
        })
      }

      toast.success(
        `Cheque(s) returned. ${fmtMoney(result.reversedTotal)} added back to Receivable balance.`
      )

      setSelectedIds(new Set())
      await load()
      setTab('handed_over')
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to return cheque(s)')
    } finally {
      setProcessingHandover(false)
    }
  }

  // Reverse lingering payments for a single handed over cheque
  const reverseLingeringPaymentForCheque = async (cheque) => {
    const payments = unreversedPaymentsMap.get(cheque.id) || []
    const totalAmount = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0) || cheque.amount

    if (
      !window.confirm(
        `Reverse payment for cheque "${cheque.cheque_number}" (${fmtMoney(totalAmount)}) and add it back to ${cheque.customers?.name || 'customer'}'s balance in Receivables?`
      )
    ) {
      return
    }

    setProcessingHandover(true)
    try {
      const result = await reverseChequePayments(supabase, [cheque], cheque.status || STATUS_HANDED_OVER)
      if (!result.ok) throw result.error

      toast.success(
        `Payment of ${fmtMoney(result.reversedTotal || totalAmount)} reversed! Added back to ${cheque.customers?.name || 'customer'}'s balance in Receivables.`
      )
      await load()
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to reverse payment')
    } finally {
      setProcessingHandover(false)
    }
  }

  // Reverse all lingering payments for all handed-over/returned cheques
  const reverseAllLingeringPayments = async () => {
    const unreversedCheques = chequesHandedOver.filter(
      (c) => (unreversedPaymentsMap.get(c.id) || []).length > 0
    )
    if (unreversedCheques.length === 0) return

    const totalAmt = unreversedCheques.reduce((s, c) => {
      const pays = unreversedPaymentsMap.get(c.id) || []
      return s + (pays.reduce((ps, p) => ps + Number(p.amount ?? 0), 0) || Number(c.amount ?? 0))
    }, 0)

    if (
      !window.confirm(
        `Reverse payments for ${unreversedCheques.length} handed-over/returned cheque(s) totaling ${fmtMoney(totalAmt)} and return all values back to customers' balances in Receivables?`
      )
    ) {
      return
    }

    setProcessingHandover(true)
    try {
      const result = await reverseChequePayments(supabase, unreversedCheques, STATUS_HANDED_OVER)
      if (!result.ok) throw result.error

      toast.success(
        `Reversed payments for ${unreversedCheques.length} cheque(s) (${fmtMoney(result.reversedTotal)}). Customer receivable balances restored!`
      )
      await load()
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to reverse payments')
    } finally {
      setProcessingHandover(false)
    }
  }

  const daysLabel = (chequeDate, status) => {
    if (status === STATUS_DEPOSITED) {
      return { label: 'Deposited', className: 'text-sky-600 dark:text-sky-300' }
    }
    if (status === STATUS_HANDED_OVER) {
      return { label: 'Handed Over', className: 'text-amber-600 dark:text-amber-300' }
    }
    if (status === STATUS_RETURNED) {
      return { label: 'Returned', className: 'text-rose-600 dark:text-rose-300' }
    }
    const dt = chequeDate ? new Date(`${String(chequeDate).slice(0, 10)}T00:00:00`) : null
    if (!dt) return { label: '-', className: 'text-slate-400' }
    const today = new Date()
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const diffDays = Math.floor((dt.getTime() - startToday.getTime()) / 86400000)
    if (diffDays < 0) {
      const v = Math.abs(diffDays)
      return { label: `${v} day${v === 1 ? '' : 's'} Passed`, className: 'text-rose-500 dark:text-rose-300' }
    }
    return { label: `${diffDays} day${diffDays === 1 ? '' : 's'} Remaining`, className: 'text-emerald-600 dark:text-emerald-300' }
  }

  // Count unreversed cheques
  const unreversedChequesCount = unreversedPaymentsMap.size
  const totalUnreversedAmount = useMemo(() => {
    let sum = 0
    for (const payments of unreversedPaymentsMap.values()) {
      sum += payments.reduce((s, p) => s + Number(p.amount ?? 0), 0)
    }
    return sum
  }, [unreversedPaymentsMap])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold text-slate-900 dark:text-white">Cheque Administration</div>
          <div className="text-sm text-slate-500 dark:text-emerald-100/70 max-w-3xl">
            Manage receivable and payable cheques. Deposit customer cheques into your bank accounts, or{' '}
            <span className="font-semibold text-slate-700 dark:text-emerald-50">Handover To Customer</span> to reverse
            the payment and return the cheque value back to the customer's balance in Receivables.
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading || processingHandover}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-emerald-900/40 text-xs font-semibold text-slate-700 dark:text-emerald-100 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors self-start sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Alert banner if any handed over cheques still have active payments in receivables */}
      {unreversedChequesCount > 0 && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-bold text-sm">
                {unreversedChequesCount} Handed-over / Returned Cheque(s) have payments still active in Receivables!
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Total value: <span className="font-extrabold">{fmtMoney(totalUnreversedAmount)}</span>.
                These cheques were handed over or returned, but their payments are still reducing customer balances.
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={processingHandover}
            onClick={reverseAllLingeringPayments}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm whitespace-nowrap self-start sm:self-auto"
          >
            <RotateCcw size={14} />
            {processingHandover ? 'Reversing...' : 'Reverse All to Receivables Balance'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setTab('in_hand')
              setSelectedIds(new Set())
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors flex items-center gap-2 ${
              tab === 'in_hand'
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:border-emerald-400/20 dark:text-emerald-50'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-100/80 dark:hover:bg-emerald-500/10'
            }`}
          >
            Cheques In Hand
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-emerald-900/50 text-slate-700 dark:text-emerald-200">
              {filteredInHand.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('deposited')
              setSelectedIds(new Set())
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors flex items-center gap-2 ${
              tab === 'deposited'
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:border-emerald-400/20 dark:text-emerald-50'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-100/80 dark:hover:bg-emerald-500/10'
            }`}
          >
            Deposited Cheques
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-emerald-900/50 text-slate-700 dark:text-emerald-200">
              {depositedFiltered.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('handed_over')
              setSelectedIds(new Set())
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors flex items-center gap-2 ${
              tab === 'handed_over'
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:border-emerald-400/20 dark:text-emerald-50'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-100/80 dark:hover:bg-emerald-500/10'
            }`}
          >
            Handed Over / Returned
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              unreversedChequesCount > 0
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 font-bold'
                : 'bg-slate-200 dark:bg-emerald-900/50 text-slate-700 dark:text-emerald-200'
            }`}>
              {handedOverFiltered.length}
              {unreversedChequesCount > 0 ? ` (${unreversedChequesCount} alert)` : ''}
            </span>
          </button>
        </div>

        {/* Top Actions and Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'deposited' && (
            <>
              <div className="text-xs font-semibold text-slate-500 dark:text-emerald-100/60">Deposited Date</div>
              <input
                type="date"
                value={depositFrom}
                onChange={(e) => setDepositFrom(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 text-sm text-slate-900 dark:text-white"
              />
              <div className="text-xs text-slate-400 dark:text-emerald-100/40">to</div>
              <input
                type="date"
                value={depositTo}
                onChange={(e) => setDepositTo(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 text-sm text-slate-900 dark:text-white"
              />
            </>
          )}

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cheques, customer, bank..."
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {/* Quick Action in top bar for tab === 'in_hand' */}
          {tab === 'in_hand' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={processingHandover || selectedIds.size === 0}
                onClick={handoverSelected}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm transition-opacity"
              >
                <HandHelping size={16} />
                {processingHandover ? 'Processing...' : 'Handover To Customer'}
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={depositSelected}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm transition-opacity"
              >
                <Landmark size={16} />
                Deposit
                <ArrowRightCircle size={16} />
              </button>
            </div>
          )}

          {/* Quick Action in top bar for tab === 'deposited' */}
          {tab === 'deposited' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={processingHandover || selectedIds.size === 0}
                onClick={handoverSelected}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm transition-opacity"
              >
                <HandHelping size={16} />
                {processingHandover ? 'Processing...' : 'Handover To Customer'}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Main Table */}
      <div className="rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 overflow-hidden shadow-sm">
        <div className="overflow-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-slate-50 dark:bg-emerald-950/40 text-slate-600 dark:text-emerald-100/70">
              <tr>
                <th className="p-3 text-left w-16">
                  <input
                    type="checkbox"
                    checked={
                      tab === 'in_hand'
                        ? filteredInHand.length > 0 && filteredInHand.every((r) => selectedIds.has(r.id))
                        : tab === 'deposited'
                          ? depositedFiltered.length > 0 && depositedFiltered.filter((r) => r.cheque_type !== 'payable').every((r) => selectedIds.has(r.id))
                          : handedOverFiltered.length > 0 && handedOverFiltered.every((r) => selectedIds.has(r.id))
                    }
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th className="p-3 text-left">Due Date</th>
                <th className="p-3 text-left">Cheque Number</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Bank</th>
                <th className="p-3 text-left">
                  {tab === 'handed_over' ? 'Status' : 'Days Remaining'}
                </th>
                <th className="p-3 text-right">Amount</th>
                {tab === 'handed_over' && (
                  <th className="p-3 text-center">Receivables Status</th>
                )}
                {tab === 'handed_over' && (
                  <th className="p-3 text-right">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-emerald-900/30">
              {loading ? (
                <tr>
                  <td colSpan={tab === 'handed_over' ? 10 : 8} className="p-6 text-center text-slate-500 dark:text-emerald-100/60">
                    Loading cheques...
                  </td>
                </tr>
              ) : showRows.length === 0 ? (
                <tr>
                  <td colSpan={tab === 'handed_over' ? 10 : 8} className="p-6 text-center text-slate-500 dark:text-emerald-100/60">
                    {tab === 'handed_over' ? 'No handed over or returned cheques found' : 'No cheques found'}
                  </td>
                </tr>
              ) : (
                showRows.map((r) => {
                  const days = daysLabel(r.cheque_date, r.status)
                  const isPayable = r.cheque_type === 'payable'
                  const checked = !isPayable && selectedIds.has(r.id)
                  const name = isPayable ? r.vendors?.name : r.customers?.name
                  const lingering = unreversedPaymentsMap.get(r.id) || []
                  const hasLingering = lingering.length > 0
                  const lingeringAmt = lingering.reduce((s, p) => s + Number(p.amount ?? 0), 0)

                  return (
                    <tr
                      key={r.id}
                      className={
                        checked
                          ? 'bg-slate-100/70 dark:bg-emerald-500/10'
                          : isPayable
                            ? 'bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50/60 dark:hover:bg-amber-900/15'
                            : hasLingering
                              ? 'bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/50'
                              : 'hover:bg-slate-50 dark:hover:bg-emerald-500/5'
                      }
                    >
                      <td className="p-3">
                        {isPayable ? (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 text-[10px] font-bold">
                            P
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleOne(r.id, e.target.checked)}
                          />
                        )}
                      </td>
                      <td className="p-3 text-slate-900 dark:text-white">
                        {r.cheque_date ? String(r.cheque_date).slice(0, 10) : '-'}
                      </td>
                      <td className="p-3 font-semibold text-slate-800 dark:text-emerald-50">
                        {r.cheque_number || '-'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            isPayable
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                              : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200'
                          }`}
                        >
                          {isPayable ? 'Payable' : 'Receivable'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50">{name ?? '-'}</td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50">{r.bank_name || '-'}</td>
                      <td className={`p-3 font-semibold ${days.className}`}>{days.label}</td>
                      <td className="p-3 text-right font-semibold text-slate-900 dark:text-white">
                        {fmtMoney(r.amount)}
                      </td>

                      {/* Extra columns for Handed Over & Returned tab */}
                      {tab === 'handed_over' && (
                        <td className="p-3 text-center">
                          {hasLingering ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              <AlertCircle size={12} />
                              Payment in Receivables: {fmtMoney(lingeringAmt)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                              <CheckCircle size={12} />
                              Balance Restored
                            </span>
                          )}
                        </td>
                      )}

                      {tab === 'handed_over' && (
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-2 justify-end">
                            {hasLingering && (
                              <button
                                type="button"
                                disabled={processingHandover}
                                onClick={() => reverseLingeringPaymentForCheque(r)}
                                className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm"
                              >
                                Reverse to Receivables
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => moveToInHandSelected([r.id])}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-colors whitespace-nowrap"
                              title="Restore this cheque back to Cheques In Hand"
                            >
                              <RotateCcw size={13} />
                              Restore to In Hand
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Bar: Tab in_hand */}
        {tab === 'in_hand' && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-slate-100 dark:border-emerald-900/30 bg-slate-50/50 dark:bg-emerald-950/20">
            <div className="text-sm text-slate-600 dark:text-emerald-100/70">
              Selected cheques: <span className="font-bold text-slate-900 dark:text-white">{inHandTotals.count}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-600 dark:text-emerald-100/70">
                Total: <span className="font-extrabold text-slate-900 dark:text-white">{fmtMoney(inHandTotals.total)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={processingHandover || inHandTotals.count === 0}
                  onClick={handoverSelected}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
                >
                  <HandHelping size={15} />
                  {processingHandover ? 'Processing...' : 'Handover To Customer'}
                </button>
                <button
                  type="button"
                  disabled={inHandTotals.count === 0}
                  onClick={depositSelected}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
                >
                  <Landmark size={15} />
                  Deposit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Bar: Tab deposited */}
        {tab === 'deposited' && (() => {
          const receivableTotal = depositedFiltered
            .filter((r) => r.cheque_type !== 'payable')
            .reduce((s, r) => s + Number(r.amount ?? 0), 0)
          const payableTotal = depositedFiltered
            .filter((r) => r.cheque_type === 'payable')
            .reduce((s, r) => s + Number(r.amount ?? 0), 0)
          const grandTotal = receivableTotal + payableTotal
          return (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-slate-100 dark:border-emerald-900/30 bg-slate-50/50 dark:bg-emerald-950/20">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-sm text-slate-600 dark:text-emerald-100/70">
                  Selected: <span className="font-bold text-slate-900 dark:text-white">{selectedTotals.count}</span>
                </div>
                <div className="text-sm text-slate-600 dark:text-emerald-100/70">
                  Receivable: <span className="font-extrabold text-sky-700 dark:text-sky-200">{fmtMoney(receivableTotal)}</span>
                </div>
                <div className="text-sm text-slate-600 dark:text-emerald-100/70">
                  Payable: <span className="font-extrabold text-amber-700 dark:text-amber-200">{fmtMoney(payableTotal)}</span>
                </div>
                <div className="text-sm text-slate-600 dark:text-emerald-100/70">
                  Total: <span className="font-extrabold text-slate-900 dark:text-white">{fmtMoney(grandTotal)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={processingHandover || selectedTotals.count === 0}
                  onClick={handoverSelected}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
                >
                  <HandHelping size={15} />
                  {processingHandover ? 'Processing...' : 'Handover To Customer'}
                </button>
                <button
                  type="button"
                  disabled={selectedTotals.count === 0}
                  onClick={() => moveToInHandSelected()}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
                >
                  Move To Cheques In Hand
                </button>
                <button
                  type="button"
                  disabled={processingHandover || selectedTotals.count === 0}
                  onClick={returnSelected}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
                >
                  Return
                </button>
              </div>
            </div>
          )
        })()}

        {/* Bottom Bar: Tab handed_over */}
        {tab === 'handed_over' && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-slate-100 dark:border-emerald-900/30 bg-slate-50/50 dark:bg-emerald-950/20">
            <div className="text-sm text-slate-600 dark:text-emerald-100/70">
              Selected cheques:{' '}
              <span className="font-bold text-slate-900 dark:text-white">{handedOverTotals.count}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-600 dark:text-emerald-100/70">
                Total:{' '}
                <span className="font-extrabold text-slate-900 dark:text-white">
                  {fmtMoney(handedOverTotals.total)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={handedOverTotals.count === 0}
                  onClick={() => moveToInHandSelected()}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm transition-colors"
                >
                  <RotateCcw size={15} />
                  Restore To Cheques In Hand
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Deposit Cheques to Bank */}
      {depositBankOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white">Deposit Cheques</div>
              <button
                onClick={() => !depositBankSaving && setDepositBankOpen(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
                <p>
                  Choose the <span className="font-semibold">bank account</span> you are depositing these receivable cheques into.
                </p>
                <p>
                  Confirming updates them to <span className="font-semibold">Deposited</span> and writes matching rows to{' '}
                  <span className="font-semibold">Bank Reconciliation</span> for that bank.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Receiving Bank Account
                </label>
                <select
                  value={depositBankId}
                  onChange={(e) => setDepositBankId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                >
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} - {b.name}
                      {b.branch ? ` (${b.branch})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400">
                Selected: <span className="font-bold text-slate-900 dark:text-white">{inHandTotals.count}</span> cheques (
                <span className="font-bold text-slate-900 dark:text-white">{fmtMoney(inHandTotals.total)}</span>)
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  disabled={depositBankSaving}
                  onClick={() => setDepositBankOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={depositBankSaving}
                  onClick={confirmDepositToBank}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
                >
                  <Landmark size={16} />
                  {depositBankSaving ? 'Saving...' : 'Confirm Deposit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

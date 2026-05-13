import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Search, Landmark, ArrowRightCircle, HandHelping } from 'lucide-react'

const fmtMoney = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

const STATUS_IN_HAND = 'in_hand'
const STATUS_DEPOSITED = 'deposited'
const STATUS_HANDED_OVER = 'handed_over'
const STATUS_RETURNED = 'returned'

export default function ChequeAdministrationPage() {
  const toast = useToast()

  const [tab, setTab] = useState('in_hand')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const [chequesInHand, setChequesInHand] = useState([])
  const [chequesDeposited, setChequesDeposited] = useState([])
  const [payableCheques, setPayableCheques] = useState([])
  const [banks, setBanks] = useState([])

  const [selectedIds, setSelectedIds] = useState(new Set())

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [depositFrom, setDepositFrom] = useState('')
  const [depositTo, setDepositTo] = useState('')

  const [depositBankOpen, setDepositBankOpen] = useState(false)
  const [depositBankSaving, setDepositBankSaving] = useState(false)
  const [depositBankId, setDepositBankId] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)

    try {
      const [handRes, depRes, payChequeRes, bankRes] = await Promise.all([
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
          .from('purchase_payments')
          .select('id, amount, paid_at, reference, method, created_at, purchases(vendor_id, vendors(name))')
          .eq('method', 'cheque')
          .order('paid_at', { ascending: false }),
        supabase.from('banks').select('id, code, name, branch').order('code'),
      ])

      if (handRes.error) throw handRes.error
      if (depRes.error) throw depRes.error

      setChequesInHand(handRes.data ?? [])
      setChequesDeposited(depRes.data ?? [])
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
        bank_name: null,
        customer_id: null,
        status: STATUS_DEPOSITED,
        deposited_at: p.paid_at,
        created_at: p.created_at,
        cheque_type: 'payable',
        vendors: p.purchases?.vendors ?? null,
        customers: null,
      }))
      setPayableCheques(payables)
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'Failed to load')
      setChequesInHand([])
      setChequesDeposited([])
    } finally {
      setLoading(false)
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

  const depositedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()

    const from = depositFrom ? new Date(`${depositFrom}T00:00:00`) : null
    const to = depositTo ? new Date(`${depositTo}T23:59:59`) : null

    // Merge customer deposited + payable cheques
    const allDeposited = [...chequesDeposited, ...payableCheques]

    return allDeposited.filter((r) => {
      if (from || to) {
        const dt = r.deposited_at ? new Date(r.deposited_at) : null
        if (!dt) return false
        if (from && dt < from) return false
        if (to && dt > to) return false
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

  const inHandTotals = useMemo(() => {
    const ids = selectedIds
    const selectedRows = filteredInHand.filter((r) => ids.has(r.id))
    const total = selectedRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
    return { count: selectedRows.length, total }
  }, [filteredInHand, selectedIds])

  const toggleAll = (checked) => {
    if (!checked) {
      setSelectedIds(new Set())
      return
    }

    const source = tab === 'in_hand' ? filteredInHand : depositedFiltered.filter((r) => r.cheque_type !== 'payable')
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

    const selectedRows = filteredInHand.filter((r) => ids.includes(r.id))
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
      if (reconErr) throw reconErr

      toast.success('Cheque(s) deposited to bank')
      logAction({ action: 'deposit_cheques', targetType: 'customer_cheque' })
      setSelectedIds(new Set())
      setDepositBankOpen(false)
      await load()
      setTab('deposited')
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to deposit cheques')
    } finally {
      setDepositBankSaving(false)
    }
  }

  const handoverSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('Select at least one cheque')
      return
    }

    const { error: err } = await supabase
      .from('customer_cheques')
      .update({ status: STATUS_HANDED_OVER })
      .in('id', ids)

    if (err) {
      toast.error(err.message)
      return
    }

    toast.success('Cheque(s) handed over')
    logAction({ action: 'handover_cheques', targetType: 'customer_cheque' })
    setSelectedIds(new Set())
    await load()
    setTab('in_hand')
  }

  const moveToInHandSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('Select at least one cheque')
      return
    }

    const { error: err } = await supabase
      .from('customer_cheques')
      .update({ status: STATUS_IN_HAND, deposited_at: null })
      .in('id', ids)

    if (err) {
      toast.error(err.message)
      return
    }

    toast.success('Moved to cheques in hand')
    logAction({ action: 'move_cheques_to_in_hand', targetType: 'customer_cheque' })
    setSelectedIds(new Set())
    await load()
    setTab('in_hand')
  }

  const returnSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('Select at least one cheque')
      return
    }

    const { error: err } = await supabase
      .from('customer_cheques')
      .update({ status: STATUS_RETURNED })
      .in('id', ids)

    if (err) {
      toast.error(err.message)
      return
    }

    toast.success('Cheque(s) returned')
    logAction({ action: 'return_cheques', targetType: 'customer_cheque' })
    setSelectedIds(new Set())
    await load()
    setTab('deposited')
  }

  const daysLabel = (chequeDate, status) => {
    if (status === STATUS_DEPOSITED) {
      return { label: '0 days', className: 'text-slate-500 dark:text-emerald-100/70' }
    }
    const dt = chequeDate ? new Date(`${String(chequeDate).slice(0, 10)}T00:00:00`) : null
    if (!dt) return { label: '-', className: 'text-slate-400' }
    const today = new Date()
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const diffDays = Math.floor((dt.getTime() - startToday.getTime()) / 86400000)
    if (diffDays < 0) {
      const v = Math.abs(diffDays)
      return { label: `${v} day${v === 1 ? '' : 's'} Passed`, className: 'text-rose-300' }
    }
    return { label: `${diffDays} day${diffDays === 1 ? '' : 's'} Remaining`, className: 'text-emerald-300' }
  }

  const showRows = tab === 'in_hand' ? filteredInHand : depositedFiltered

  const selectedTotals = useMemo(() => {
    const source = tab === 'in_hand' ? filteredInHand : depositedFiltered
    const rows = source.filter((r) => selectedIds.has(r.id))
    const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
    return { count: rows.length, total }
  }, [tab, filteredInHand, depositedFiltered, selectedIds])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold text-slate-900 dark:text-white">Cheque Administration</div>
          <div className="text-sm text-slate-500 dark:text-emerald-100/70">Manage customer cheques in hand and deposited cheques.</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('in_hand')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              tab === 'in_hand'
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:border-emerald-400/20 dark:text-emerald-50'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-100/80 dark:hover:bg-emerald-500/10'
            }`}
          >
            Cheques In Hand
          </button>
          <button
            type="button"
            onClick={() => setTab('deposited')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              tab === 'deposited'
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:border-emerald-400/20 dark:text-emerald-50'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-100/80 dark:hover:bg-emerald-500/10'
            }`}
          >
            Deposited Cheques
          </button>
        </div>

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
              placeholder="Search cheques"
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {tab === 'in_hand' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handoverSelected}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm"
              >
                <HandHelping size={16} />
                Handover To Customer
              </button>
              <button
                type="button"
                onClick={depositSelected}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold shadow-sm"
              >
                <Landmark size={16} />
                Deposit
                <ArrowRightCircle size={16} />
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

      <div className="rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 overflow-hidden">
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
                        : depositedFiltered.length > 0 && depositedFiltered.every((r) => selectedIds.has(r.id))
                    }
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th className="p-3 text-left">Due Date</th>
                <th className="p-3 text-left">Cheque Number</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Bank</th>
                <th className="p-3 text-left">Days Remaining</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-emerald-900/30">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-500 dark:text-emerald-100/60">Loading...</td>
                </tr>
              ) : showRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-500 dark:text-emerald-100/60">No cheques found</td>
                </tr>
              ) : (
                showRows.map((r, idx) => {
                  const days = daysLabel(r.cheque_date, r.status)
                  const isPayable = r.cheque_type === 'payable'
                  const checked = !isPayable && selectedIds.has(r.id)
                  const name = isPayable ? r.vendors?.name : r.customers?.name
                  return (
                    <tr
                      key={r.id}
                      className={
                        checked
                          ? 'bg-slate-100/70 dark:bg-emerald-500/10'
                          : isPayable
                            ? 'bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50/60 dark:hover:bg-amber-900/15'
                            : 'hover:bg-slate-50 dark:hover:bg-emerald-500/5'
                      }
                    >
                      <td className="p-3">
                        {isPayable ? (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 text-[10px] font-bold">P</span>
                        ) : (
                          <input type="checkbox" checked={checked} onChange={(e) => toggleOne(r.id, e.target.checked)} />
                        )}
                      </td>
                      <td className="p-3 text-slate-900 dark:text-white">{r.cheque_date ? String(r.cheque_date).slice(0, 10) : '-'}</td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50">{r.cheque_number || '-'}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          isPayable
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200'
                        }`}>
                          {isPayable ? 'Payable' : 'Receivable'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50">{name ?? '-'}</td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50">{r.bank_name || '-'}</td>
                      <td className={`p-3 font-semibold ${days.className}`}>{days.label}</td>
                      <td className="p-3 text-right font-semibold text-slate-900 dark:text-white">{fmtMoney(r.amount)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {tab === 'in_hand' && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-slate-100 dark:border-emerald-900/30 bg-slate-50/50 dark:bg-emerald-950/20">
            <div className="text-sm text-slate-600 dark:text-emerald-100/70">
              Selected cheques: <span className="font-bold text-slate-900 dark:text-white">{inHandTotals.count}</span>
            </div>
            <div className="text-sm text-slate-600 dark:text-emerald-100/70">
              Total: <span className="font-extrabold text-slate-900 dark:text-white">{fmtMoney(inHandTotals.total)}</span>
            </div>
          </div>
        )}

        {tab === 'deposited' && (() => {
          const receivableRows = depositedFiltered.filter((r) => r.cheque_type !== 'payable')
          const payableRows = depositedFiltered.filter((r) => r.cheque_type === 'payable')
          const receivableTotal = receivableRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
          const payableTotal = payableRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
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
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={moveToInHandSelected}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm"
              >
                Move To Cheques In Hand
              </button>
              <button
                type="button"
                onClick={returnSelected}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-sm"
              >
                Return
              </button>
            </div>
          </div>
          )
        })()}
      </div>

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
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Select the bank account you are depositing into. These cheques will be saved in Bank Reconciliation automatically.
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Bank</div>
                <select
                  value={depositBankId}
                  onChange={(e) => setDepositBankId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                >
                  <option value="">Select bank</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {(b.code ? `${b.code} - ` : '') + (b.name ?? '') + (b.branch ? ` (${b.branch})` : '')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDepositBankOpen(false)}
                  disabled={depositBankSaving}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDepositToBank}
                  disabled={depositBankSaving || !depositBankId}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  {depositBankSaving ? 'Depositing...' : 'Deposit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

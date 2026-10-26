import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Search, RefreshCw } from 'lucide-react'
import { extractBankCodeFromCheque, APPROVED_BANK_CODES } from '../lib/chequeValidation'

const fmtMoney = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

function getBankCodeForBank(bank) {
  if (!bank) return ''
  if (bank.bank_code) return String(bank.bank_code)
  const normName = String(bank.name || '').toLowerCase()
  for (const [code, name] of Object.entries(APPROVED_BANK_CODES)) {
    if (name.toLowerCase().includes(normName) || normName.includes(name.toLowerCase())) {
      return code
    }
  }
  return ''
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
  const [savingId, setSavingId] = useState('')

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

      // Fetch bank reconciliation items
      let reconQuery = supabase
        .from('bank_reconciliation_items')
        .select('id, bank_id, trx_date, ref_no, post_date, description, due_date, cheque_number, amount, reconciled, created_at')
        .order('trx_date', { ascending: true })

      if (from) reconQuery = reconQuery.gte('trx_date', from)
      if (to) reconQuery = reconQuery.lte('trx_date', to)

      // Fetch customer cheques marked as deposited to ensure none are missing
      const chequeQuery = supabase
        .from('customer_cheques')
        .select('id, cheque_date, cheque_number, amount, bank_name, bank_code, deposit_bank_id, deposited_at, status, customers(name)')
        .eq('status', 'deposited')

      const [reconRes, chequeRes] = await Promise.all([reconQuery, chequeQuery])
      if (reconRes.error) throw reconRes.error

      const rawItems = reconRes.data ?? []
      const depositedCheques = chequeRes.data ?? []

      // Create lookup of existing recon items by ref_no and cheque_number
      const existingRefNos = new Set(rawItems.map((r) => String(r.ref_no || '').trim().toLowerCase()))
      const existingChequeNos = new Set(rawItems.map((r) => String(r.cheque_number || '').trim().toLowerCase()))

      // Helper to check if a row matches the selected bank
      const matchesTargetBank = (row) => {
        // Direct bank_id match with UUID, code, or bank_code
        if (String(row.bank_id) === String(activeBankId)) return true
        if (targetCode && String(row.bank_id).toLowerCase() === targetCode) return true
        if (targetBankCode && String(row.bank_id) === targetBankCode) return true
        if (targetBankName && String(row.bank_id || '').toLowerCase() === targetBankName) return true
        if (targetBankName && String(row.bank_name || '').toLowerCase() === targetBankName) return true

        // Cheque number bank code match (Sri Lankan cheque format XXXXXX-XXXX-XXX)
        const rowChequeNo = row.cheque_number || ''
        const codeInCheque = extractBankCodeFromCheque(rowChequeNo)
        if (targetBankCode && codeInCheque && codeInCheque === targetBankCode) return true

        // Description contains bank name
        if (targetBankName && String(row.description || '').toLowerCase().includes(targetBankName)) return true

        return false
      }

      // Filter recon items that match this bank
      const matchedReconItems = rawItems.filter(matchesTargetBank)

      // Check if there are deposited customer cheques for this bank not yet in bank_reconciliation_items
      const missingCheques = depositedCheques.filter((c) => {
        const matchesBank =
          String(c.deposit_bank_id) === String(activeBankId) ||
          (targetBankCode && String(c.bank_code) === targetBankCode) ||
          (targetBankName && String(c.bank_name || '').toLowerCase().includes(targetBankName)) ||
          (targetBankCode && extractBankCodeFromCheque(c.cheque_number) === targetBankCode)

        if (!matchesBank) return false

        const refNo = `rcv-chq-${c.id}`.toLowerCase()
        const chqNo = String(c.cheque_number || '').trim().toLowerCase()
        return !existingRefNos.has(refNo) && (!chqNo || !existingChequeNos.has(chqNo))
      })

      // If any deposited cheques are missing from bank_reconciliation_items, insert them automatically
      if (missingCheques.length > 0) {
        const newReconRows = missingCheques.map((c) => {
          const cName = c.customers?.name ?? ''
          const day = c.deposited_at ? String(c.deposited_at).slice(0, 10) : (c.cheque_date ? String(c.cheque_date).slice(0, 10) : todayStr)
          return {
            bank_id: activeBankId,
            trx_date: day,
            ref_no: `RCV-CHQ-${c.id}`,
            post_date: day,
            description: `Receivable cheque deposit${cName ? ` - ${cName}` : ''}${c.bank_name ? ` (${c.bank_name})` : ''}`,
            due_date: c.cheque_date ? String(c.cheque_date).slice(0, 10) : null,
            cheque_number: c.cheque_number || null,
            amount: Number(c.amount ?? 0),
            reconciled: false,
          }
        })

        const { data: inserted, error: insErr } = await supabase
          .from('bank_reconciliation_items')
          .insert(newReconRows)
          .select('id, bank_id, trx_date, ref_no, post_date, description, due_date, cheque_number, amount, reconciled, created_at')

        if (!insErr && inserted) {
          inserted.forEach((item) => {
            const itemDate = item.trx_date ? String(item.trx_date).slice(0, 10) : ''
            const withinDate = (!from || itemDate >= from) && (!to || itemDate <= to)
            if (withinDate) {
              matchedReconItems.push(item)
            }
          })
        }
      }

      setRows(matchedReconItems)
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
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      String(r.ref_no ?? '').toLowerCase().includes(q) ||
      String(r.description ?? '').toLowerCase().includes(q) ||
      String(r.cheque_number ?? '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const totals = useMemo(() => {
    const total = filteredRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
    return { total }
  }, [filteredRows])

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
          <div className="text-sm text-slate-500 dark:text-emerald-100/70">Mark bank transactions as reconciled (Yes/No).</div>
        </div>
      </div>

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

        {/* Quick Date Presets */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-emerald-900/20 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-emerald-100/60 font-semibold">Quick range:</span>
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
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50 dark:bg-emerald-950/40 text-slate-600 dark:text-emerald-100/70">
              <tr>
                <th className="p-3 text-left w-16">YES</th>
                <th className="p-3 text-left w-16">NO</th>
                <th className="p-3 text-left">RC Date</th>
                <th className="p-3 text-left">Ref No</th>
                <th className="p-3 text-left">Post Date</th>
                <th className="p-3 text-left">Description</th>
                <th className="p-3 text-left">Due Date</th>
                <th className="p-3 text-left">Cheque Number</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-emerald-900/30">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-500 dark:text-emerald-100/60">Loading transactions...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-500 dark:text-emerald-100/60">
                    No transactions found for this bank in the selected date range.
                    {form.from_date && (
                      <span className="block mt-1 text-xs text-slate-400">
                        Try selecting <button type="button" onClick={() => applyDatePreset('all')} className="text-emerald-600 dark:text-emerald-400 underline font-semibold">All Dates</button> to see all transactions.
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const isYes = !!r.reconciled
                  const busy = savingId === r.id
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-emerald-500/5">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isYes}
                          disabled={busy}
                          onChange={(e) => setReconciled(r.id, e.target.checked)}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={!isYes}
                          disabled={busy}
                          onChange={(e) => setReconciled(r.id, !e.target.checked)}
                        />
                      </td>
                      <td className="p-3 text-slate-900 dark:text-white">{r.trx_date ? String(r.trx_date).slice(0, 10) : '-'}</td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50">{r.ref_no || '-'}</td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50">{r.post_date ? String(r.post_date).slice(0, 10) : '-'}</td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50">{r.description || '-'}</td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50">{r.due_date ? String(r.due_date).slice(0, 10) : '-'}</td>
                      <td className="p-3 text-slate-700 dark:text-emerald-50">{r.cheque_number || '-'}</td>
                      <td className="p-3 text-right font-semibold text-slate-900 dark:text-white">{fmtMoney(r.amount)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-emerald-900/30 bg-slate-50/50 dark:bg-emerald-950/20 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-emerald-100/60">
            Showing {filteredRows.length} transaction{filteredRows.length === 1 ? '' : 's'}
          </div>
          <div className="text-sm text-slate-600 dark:text-emerald-100/70">
            Total: <span className="font-extrabold text-slate-900 dark:text-white">{fmtMoney(totals.total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}


import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Search } from 'lucide-react'

const fmtMoney = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function BankReconciliationPage() {
  const toast = useToast()

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [banks, setBanks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    bank_id: '',
    from_date: todayStr,
    to_date: todayStr,
  })

  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState('')

  const loadBanks = async () => {
    const { data, error: err } = await supabase.from('banks').select('id, code, name, branch').order('code')
    if (err) {
      setBanks([])
      return
    }
    setBanks(data ?? [])
    if (!form.bank_id && (data ?? []).length > 0) {
      setForm((p) => ({ ...p, bank_id: data[0].id }))
    }
  }

  const load = async () => {
    if (!form.bank_id) {
      toast.error('Select a bank')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const from = form.from_date
      const to = form.to_date

      const q = supabase
        .from('bank_reconciliation_items')
        .select(
          'id, bank_id, trx_date, ref_no, post_date, description, due_date, cheque_number, amount, reconciled, created_at'
        )
        .eq('bank_id', form.bank_id)
        .order('trx_date', { ascending: true })

      if (from) q.gte('trx_date', from)
      if (to) q.lte('trx_date', to)

      const { data, error: err } = await q
      if (err) throw err

      setRows(data ?? [])
    } catch (e) {
      console.error(e)
      setRows([])
      setError(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
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
      <div>
        <div className="text-lg font-semibold text-slate-900 dark:text-white">Bank Reconciliation</div>
        <div className="text-sm text-slate-500 dark:text-emerald-100/70">Mark bank transactions as reconciled (Yes/No).</div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-emerald-100/70 mb-1">Select Bank</div>
            <select
              value={form.bank_id}
              onChange={(e) => setForm((p) => ({ ...p, bank_id: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 text-sm text-slate-900 dark:text-white"
            >
              <option value="">Select</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {(b.code ? `${b.code} - ` : '') + (b.name ?? '')}
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
              onClick={load}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm"
            >
              Load
            </button>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-emerald-950/30 text-sm text-slate-900 dark:text-white"
            />
          </div>
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
                  <td colSpan={9} className="p-6 text-center text-slate-500 dark:text-emerald-100/60">Loading...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-500 dark:text-emerald-100/60">No transactions</td>
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

        <div className="px-4 py-3 border-t border-slate-100 dark:border-emerald-900/30 bg-slate-50/50 dark:bg-emerald-950/20">
          <div className="text-sm text-slate-600 dark:text-emerald-100/70">
            Total: <span className="font-extrabold text-slate-900 dark:text-white">{fmtMoney(totals.total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

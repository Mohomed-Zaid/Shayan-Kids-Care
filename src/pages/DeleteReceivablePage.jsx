import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Eye, FileText, Landmark, Search, Trash2 } from 'lucide-react'

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function DeleteReceivablePage() {
  const toast = useToast()

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(null)

  const loadRows = async () => {
    setLoading(true)
    try {
      const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null
      const to = toDate ? new Date(`${toDate}T23:59:59`) : null

      const query = supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, paid_at, method, bank_name, reference, note, created_at, invoices(invoice_number, customer_id, customers(name))')
        .order('paid_at', { ascending: false })
        .limit(5000)

      if (from) query.gte('paid_at', from.toISOString())
      if (to) query.lte('paid_at', to.toISOString())

      const { data, error } = await query
      if (error) throw error
      setRows(data ?? [])
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to load')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate])

  const filteredRows = useMemo(() => {
    const q = String(search || '').trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const cust = r.invoices?.customers?.name ?? ''
      const invNo = r.invoices?.invoice_number ?? ''
      const ref = r.reference ?? ''
      return (
        String(r.id).toLowerCase().includes(q) ||
        String(cust).toLowerCase().includes(q) ||
        String(invNo).toLowerCase().includes(q) ||
        String(ref).toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  const syncCustomerChequeAfterDelete = async ({ customerId, chequeNumber }) => {
    if (!customerId || !chequeNumber) return

    const { data: remaining, error: remErr } = await supabase
      .from('invoice_payments')
      .select('id, amount, invoices!inner(customer_id)')
      .eq('method', 'cheque')
      .eq('reference', chequeNumber)
      .eq('invoices.customer_id', customerId)

    if (remErr) { console.error(remErr); return }

    const total = (remaining ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)

    if (!remaining || remaining.length === 0) {
      await supabase.from('customer_cheques').delete().eq('customer_id', customerId).eq('cheque_number', chequeNumber)
      return
    }

    await supabase.from('customer_cheques').upsert({
      customer_id: customerId,
      cheque_date: null,
      cheque_number: chequeNumber,
      bank_name: null,
      amount: total,
      status: 'in_hand',
    }, { onConflict: 'customer_id,cheque_number' })
  }

  const deletePayment = async () => {
    if (!selected?.id) return
    if (!confirm(`Delete payment ${selected.id}?`)) return

    setDeleting(true)
    try {
      const deletingPayment = selected
      const { error: delErr } = await supabase.from('invoice_payments').delete().eq('id', deletingPayment.id)
      if (delErr) {
        toast.error(delErr.message)
        return
      }

      if (deletingPayment.method === 'cheque') {
        const customerId = deletingPayment.invoices?.customer_id
        const chequeNumber = deletingPayment.reference
        await syncCustomerChequeAfterDelete({ customerId, chequeNumber })
      }

      toast.success('Payment deleted')
      logAction({ action: 'delete_receivable_payment', targetType: 'payment', targetId: deletingPayment.id })
      setSelected(null)
      await loadRows()
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
          <div className="p-5 border-b border-slate-100 dark:border-emerald-900/40">
            <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Receivables</div>
            <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Payments list</div>
          </div>

          <div className="p-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] font-semibold text-slate-500 dark:text-emerald-100/60 mb-1">FROM</div>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500 dark:text-emerald-100/60 mb-1">TO</div>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-emerald-900/40 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-emerald-950/35 text-slate-600 dark:text-emerald-100/80">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider">Ref No</th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider">Customer</th>
                    <th className="text-right px-4 py-3 text-xs uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-emerald-900/30">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-400 dark:text-emerald-100/60">Loading...</td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-400 dark:text-emerald-100/60">No receivables found</td>
                    </tr>
                  ) : (
                    filteredRows.map((r) => (
                      <tr
                        key={r.id}
                        className={`hover:bg-slate-50/60 dark:hover:bg-emerald-500/5 cursor-pointer ${selected?.id === r.id ? 'bg-slate-100/60 dark:bg-emerald-500/10' : ''}`}
                        onClick={() => setSelected(r)}
                      >
                        <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">{r.id}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-emerald-100/70">{r.paid_at ? String(r.paid_at).slice(0, 10) : '-'}</td>
                        <td className="px-4 py-3.5 text-slate-700 dark:text-emerald-50">{r.invoices?.customers?.name ?? '-'}</td>
                        <td className="px-4 py-3.5 text-right font-semibold text-slate-900 dark:text-emerald-50">{fmt(r.amount)}</td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelected(r) }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                          >
                            <Eye size={14} />
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
          <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-emerald-900/40">
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Discard Receivable</div>
              <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Selected payment details</div>
            </div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-emerald-50">{selected ? fmt(selected.amount) : ''}</div>
          </div>

          <div className="p-5">
            {!selected ? (
              <div className="py-10 text-center text-slate-400 dark:text-emerald-100/60">
                <Landmark size={34} className="mx-auto opacity-40" />
                <div className="mt-2 text-sm">Select a receivable from the left</div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="text-slate-500 dark:text-emerald-100/60">Customer</div>
                  <div className="text-slate-900 dark:text-emerald-50 font-semibold text-right">{selected.invoices?.customers?.name ?? '-'}</div>

                  <div className="text-slate-500 dark:text-emerald-100/60">Reference</div>
                  <div className="text-slate-900 dark:text-emerald-50 font-semibold text-right">{selected.id}</div>

                  <div className="text-slate-500 dark:text-emerald-100/60">Date</div>
                  <div className="text-slate-900 dark:text-emerald-50 font-semibold text-right">{selected.paid_at ? String(selected.paid_at).slice(0, 10) : '-'}</div>

                  <div className="text-slate-500 dark:text-emerald-100/60">Time</div>
                  <div className="text-slate-900 dark:text-emerald-50 font-semibold text-right">{new Date(selected.paid_at ?? selected.created_at).toLocaleTimeString()}</div>

                  <div className="text-slate-500 dark:text-emerald-100/60">Method</div>
                  <div className="text-slate-900 dark:text-emerald-50 font-semibold text-right">{String(selected.method ?? '').toUpperCase()}</div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-emerald-900/40 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-emerald-950/35 text-slate-600 dark:text-emerald-100/80">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider">Invoice No</th>
                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider">Invoice Date</th>
                        <th className="text-right px-4 py-3 text-xs uppercase tracking-wider">Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-emerald-900/30">
                      <tr>
                        <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">{selected.invoices?.invoice_number ?? '-'}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-emerald-100/70">—</td>
                        <td className="px-4 py-3.5 text-right font-semibold text-slate-900 dark:text-emerald-50">{fmt(selected.amount)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {selected.note ? (
                  <div className="text-xs text-slate-600 dark:text-emerald-100/70">{selected.note}</div>
                ) : null}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={deletePayment}
                    disabled={deleting}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold"
                  >
                    <Trash2 size={16} />
                    {deleting ? 'Deleting...' : 'Delete Payment'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

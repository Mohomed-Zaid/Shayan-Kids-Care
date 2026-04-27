import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { ArrowLeft, Plus, FileText } from 'lucide-react'

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function ReceivableCustomerPage() {
  const { customerId } = useParams()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [customer, setCustomer] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])

  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState({
    invoice_id: '',
    paid_at: new Date().toISOString().slice(0, 10),
    amount: '',
    method: 'cash',
    reference: '',
    note: '',
  })

  const referencePlaceholder = useMemo(() => {
    if (payForm.method === 'cheque') return 'Cheque number'
    if (payForm.method === 'card') return 'Card reference'
    if (payForm.method === 'other') return 'Reference'
    return 'Reference'
  }, [payForm.method])

  const load = async () => {
    setLoading(true)
    setError(null)

    const [custRes, invRes, payRes] = await Promise.all([
      supabase.from('customers').select('id, name, phone, address').eq('id', customerId).single(),
      supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, created_at, payment_type')
        .eq('customer_id', customerId)
        .eq('payment_type', 'credit')
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, paid_at, method, reference, note, created_at')
        .order('paid_at', { ascending: false }),
    ])

    if (custRes.error) {
      setError(custRes.error.message)
      setCustomer(null)
    } else {
      setCustomer(custRes.data)
    }

    if (invRes.error) {
      setError((prev) => prev ?? invRes.error.message)
      setInvoices([])
    } else {
      setInvoices(invRes.data ?? [])
    }

    if (payRes.error) {
      setError((prev) => prev ?? payRes.error.message)
      setPayments([])
    } else {
      setPayments((payRes.data ?? []).filter((p) => !!p.invoice_id))
    }

    setLoading(false)
  }

  useEffect(() => {
    load().catch((e) => {
      console.error(e)
      toast.error('Failed to load')
      setError('Failed to load')
      setLoading(false)
    })
  }, [customerId])

  const paymentsForCustomer = useMemo(() => {
    const invoiceIds = new Set(invoices.map((i) => i.id))
    return payments.filter((p) => invoiceIds.has(p.invoice_id))
  }, [payments, invoices])

  const paymentSumByInvoice = useMemo(() => {
    const map = new Map()
    for (const p of paymentsForCustomer) {
      const prev = map.get(p.invoice_id) ?? 0
      map.set(p.invoice_id, prev + Number(p.amount ?? 0))
    }
    return map
  }, [paymentsForCustomer])

  const invRows = useMemo(() => {
    return invoices.map((inv) => {
      const paid = paymentSumByInvoice.get(inv.id) ?? 0
      const total = Number(inv.total_amount ?? 0)
      const balance = total - paid
      const status = paid === 0 ? 'unpaid' : balance > 0 ? 'partial' : 'paid'
      const daysOutstanding = Math.floor((Date.now() - new Date(inv.created_at).getTime()) / 86400000)
      const agingBucket = daysOutstanding <= 30 ? '0-30' : daysOutstanding <= 60 ? '31-60' : '60+'
      return { ...inv, paid, balance, status, daysOutstanding, agingBucket }
    })
  }, [invoices, paymentSumByInvoice])

  const totals = useMemo(() => {
    const invoiced = invRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const paid = invRows.reduce((s, r) => s + Number(r.paid ?? 0), 0)
    const balance = invRows.reduce((s, r) => s + Number(r.balance ?? 0), 0)
    return { invoiced, paid, balance }
  }, [invRows])

  const openPay = () => {
    const firstInv = invRows.find((x) => (x.balance ?? 0) > 0)
    setPayForm((p) => ({
      ...p,
      invoice_id: firstInv?.id ?? (invRows[0]?.id ?? ''),
      amount: firstInv?.balance ? String(firstInv.balance) : '',
      method: 'cash',
      reference: '',
      note: '',
    }))
    setPayOpen(true)
  }

  const savePayment = async () => {
    if (!payForm.invoice_id) {
      toast.error('Select an invoice')
      return
    }

    const amount = Number(String(payForm.amount || '').replace(/,/g, ''))
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }

    setSaving(true)

    const { error: err } = await supabase.from('invoice_payments').insert({
      invoice_id: payForm.invoice_id,
      amount,
      paid_at: payForm.paid_at,
      method: payForm.method,
      reference: payForm.reference.trim() || null,
      note: payForm.note.trim() || null,
    })

    if (err) {
      toast.error(err.message)
      setSaving(false)
      return
    }

    toast.success('Payment saved')
    setPayOpen(false)
    setSaving(false)
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/finance/receivables" className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors">
          <ArrowLeft size={16} />
          Back to Receivables
        </Link>

        <button
          onClick={openPay}
          disabled={invRows.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Payment
        </button>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        <div className="p-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Customer</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white">{customer?.name ?? '-'}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{customer?.phone ?? '—'}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{customer?.address ?? '—'}</div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-right">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Invoiced</div>
              <div className="text-base font-bold text-slate-900 dark:text-white">{fmt(totals.invoiced)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Paid</div>
              <div className="text-base font-bold text-slate-900 dark:text-white">{fmt(totals.paid)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Balance</div>
              <div className="text-base font-extrabold text-slate-900 dark:text-white">{fmt(totals.balance)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 dark:bg-emerald-950/35 dark:border-emerald-900/40 dark:text-emerald-100/80">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Invoice</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Date</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Total</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Paid</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Balance</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Status</th>
              <th className="text-center font-medium px-5 py-3 text-xs uppercase tracking-wide">Aging</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={8} className="px-5 py-4 text-red-600 text-center">{error}</td>
              </tr>
            ) : invRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-slate-400 dark:text-emerald-100/60 text-center">
                  <FileText size={24} className="mx-auto mb-2 opacity-40 dark:text-emerald-200/30" />
                  No credit invoices for this customer.
                </td>
              </tr>
            ) : (
              invRows.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-900 dark:text-emerald-50">INV-{String(inv.invoice_number ?? '').padStart(4, '0')}</div>
                    <div className="text-xs text-slate-400 dark:text-emerald-100/60">{inv.payment_type ?? 'credit'}</div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{new Date(inv.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-slate-900 dark:text-emerald-50">{fmt(inv.total_amount)}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-slate-900 dark:text-emerald-50">{fmt(inv.paid)}</td>
                  <td className={`px-5 py-3.5 text-right font-extrabold ${inv.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-emerald-50'}`}>{fmt(inv.balance)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                      inv.status === 'unpaid' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                      inv.status === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    }`}>
                      {inv.status === 'unpaid' ? 'Unpaid' : inv.status === 'partial' ? 'Partial' : 'Paid'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{inv.daysOutstanding}d</div>
                    <div className={`text-[10px] font-semibold ${
                      inv.agingBucket === '0-30' ? 'text-emerald-600 dark:text-emerald-400' :
                      inv.agingBucket === '31-60' ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>{inv.agingBucket} days</div>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`/invoices/${inv.id}`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      View Invoice
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {payOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white">Add Payment</div>
              <button
                onClick={() => setPayOpen(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Payment Date</div>
                  <input
                    type="date"
                    value={payForm.paid_at}
                    onChange={(e) => setPayForm((p) => ({ ...p, paid_at: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Method</div>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setPayForm((p) => ({ ...p, method: 'cash' }))}
                      className={`px-3 py-2 rounded-md text-xs font-bold border transition-colors ${
                        payForm.method === 'cash'
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:text-emerald-50 dark:border-emerald-400/20'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800'
                      }`}
                    >
                      CASH
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayForm((p) => ({ ...p, method: 'cheque' }))}
                      className={`px-3 py-2 rounded-md text-xs font-bold border transition-colors ${
                        payForm.method === 'cheque'
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:text-emerald-50 dark:border-emerald-400/20'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800'
                      }`}
                    >
                      CHEQUE
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayForm((p) => ({ ...p, method: 'card' }))}
                      className={`px-3 py-2 rounded-md text-xs font-bold border transition-colors ${
                        payForm.method === 'card'
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:text-emerald-50 dark:border-emerald-400/20'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800'
                      }`}
                    >
                      CARD
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayForm((p) => ({ ...p, method: 'other' }))}
                      className={`px-3 py-2 rounded-md text-xs font-bold border transition-colors ${
                        payForm.method === 'other'
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:text-emerald-50 dark:border-emerald-400/20'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800'
                      }`}
                    >
                      OTHER
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Invoice</div>
                  <select
                    value={payForm.invoice_id}
                    onChange={(e) => setPayForm((p) => ({ ...p, invoice_id: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {invRows.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        INV-{String(inv.invoice_number ?? '').padStart(4, '0')} — Balance {fmt(inv.balance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Amount</div>
                  <input
                    value={payForm.amount}
                    onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Reference</div>
                  <input
                    value={payForm.reference}
                    onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))}
                    placeholder={referencePlaceholder}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Note</div>
                  <input
                    value={payForm.note}
                    onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
                    placeholder="Optional"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setPayOpen(false)}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={savePayment}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {saving ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

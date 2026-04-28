import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { Search, Eye, FileText, Filter, Plus } from 'lucide-react'

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function ReceivablesPage() {
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [returns, setReturns] = useState([])
  const [banks, setBanks] = useState([])

  const [payOpen, setPayOpen] = useState(false)
  const [paySaving, setPaySaving] = useState(false)
  const [payForm, setPayForm] = useState({
    customer_id: '',
    invoice_id: '',
    paid_at: new Date().toISOString().slice(0, 10),
    amount: '',
    method: 'cash',
    bank_name: '',
    sub_method: 'other',
    reference: '',
    note: '',
  })

  const [cheques, setCheques] = useState([
    {
      cheque_date: new Date().toISOString().slice(0, 10),
      cheque_number: '',
      amount: '',
    },
  ])

  const load = async () => {
    setLoading(true)
    setError(null)

    const [invRes, payRes, retRes, bankRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, customer_id, total_amount, created_at, payment_type, customers(name, phone)')
        .in('payment_type', ['credit', 'cash'])
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, paid_at, method')
        .order('paid_at', { ascending: false }),
      supabase
        .from('returns')
        .select('id, customer_id, total_amount')
        .order('created_at', { ascending: false }),
      supabase.from('banks').select('id, code, name, branch').order('code'),
    ])

    if (invRes.error) {
      setError(invRes.error.message)
      setInvoices([])
    } else {
      setInvoices(invRes.data ?? [])
    }

    if (payRes.error) {
      setError((prev) => prev ?? payRes.error.message)
      setPayments([])
    } else {
      setPayments(payRes.data ?? [])
    }

    if (retRes.error) {
      setReturns([])
    } else {
      setReturns(retRes.data ?? [])
    }

    if (bankRes.error) {
      setBanks([])
    } else {
      setBanks(bankRes.data ?? [])
    }

    setLoading(false)
  }

  useEffect(() => {
    load().catch((e) => {
      console.error(e)
      toast.error('Failed to load receivables')
      setError('Failed to load')
      setLoading(false)
    })
  }, [])

  const paymentSumByInvoice = useMemo(() => {
    const map = new Map()
    for (const p of payments) {
      const prev = map.get(p.invoice_id) ?? 0
      map.set(p.invoice_id, prev + Number(p.amount ?? 0))
    }
    return map
  }, [payments])

  const returnsByCustomer = useMemo(() => {
    const map = new Map()
    for (const r of returns) {
      const cid = r.customer_id
      if (!cid) continue
      const prev = map.get(cid) ?? 0
      map.set(cid, prev + Number(r.total_amount ?? 0))
    }
    return map
  }, [returns])

  const customersRows = useMemo(() => {
    const byCustomer = new Map()

    for (const inv of invoices) {
      const cid = inv.customer_id
      if (!cid) continue

      const paid = paymentSumByInvoice.get(inv.id) ?? 0
      const total = Number(inv.total_amount ?? 0)
      const retAmount = returnsByCustomer.get(cid) ?? 0
      const balance = total - paid - retAmount

      const payStatus = paid === 0 && retAmount === 0 ? 'unpaid' : balance > 0 ? 'partial' : 'paid'
      const daysOutstanding = Math.floor((Date.now() - new Date(inv.created_at).getTime()) / 86400000)
      const agingBucket = daysOutstanding <= 30 ? '0-30' : daysOutstanding <= 60 ? '31-60' : '60+'

      const existing = byCustomer.get(cid)
      if (!existing) {
        byCustomer.set(cid, {
          customer_id: cid,
          name: inv.customers?.name ?? '-',
          phone: inv.customers?.phone ?? '',
          invoiced: total,
          returned: retAmount,
          paid,
          balance,
          invoicesCount: 1,
          status: payStatus,
          maxDaysOutstanding: daysOutstanding,
          agingBucket,
        })
      } else {
        existing.invoiced += total
        existing.returned = retAmount
        existing.paid += paid
        existing.balance = existing.invoiced - existing.paid - existing.returned
        existing.invoicesCount += 1
        // roll up: if any invoice is unpaid/partial, customer is worst status
        if (payStatus === 'unpaid') existing.status = 'unpaid'
        else if (payStatus === 'partial' && existing.status !== 'unpaid') existing.status = 'partial'
        else if (existing.status !== 'unpaid' && existing.status !== 'partial') existing.status = 'paid'
        // track oldest outstanding invoice
        if (daysOutstanding > existing.maxDaysOutstanding) {
          existing.maxDaysOutstanding = daysOutstanding
          existing.agingBucket = agingBucket
        }
      }
    }

    const q = search.trim().toLowerCase()
    let rows = Array.from(byCustomer.values())

    if (q) {
      rows = rows.filter((r) =>
        String(r.name ?? '').toLowerCase().includes(q) ||
        String(r.phone ?? '').toLowerCase().includes(q) ||
        String(r.customer_id ?? '').toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter)
    }

    rows.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))
    return rows
  }, [invoices, paymentSumByInvoice, returnsByCustomer, search, statusFilter])

  const totals = useMemo(() => {
    const invoiced = customersRows.reduce((s, r) => s + Number(r.invoiced ?? 0), 0)
    const returned = customersRows.reduce((s, r) => s + Number(r.returned ?? 0), 0)
    const paid = customersRows.reduce((s, r) => s + Number(r.paid ?? 0), 0)
    const balance = customersRows.reduce((s, r) => s + Number(r.balance ?? 0), 0)
    return { invoiced, returned, paid, balance }
  }, [customersRows])

  const referencePlaceholder = useMemo(() => {
    if (payForm.method === 'cheque') return 'Cheque number'
    if (payForm.method === 'bank') return 'Bank reference'
    if (payForm.method === 'other') return 'Reference'
    return 'Reference'
  }, [payForm.method])

  const invoicesForPayCustomer = useMemo(() => {
    if (!payForm.customer_id) return []
    return invoices
      .filter((inv) => inv.customer_id === payForm.customer_id)
      .map((inv) => {
        const paid = paymentSumByInvoice.get(inv.id) ?? 0
        const total = Number(inv.total_amount ?? 0)
        const balance = total - paid
        return { ...inv, paid, balance }
      })
  }, [invoices, paymentSumByInvoice, payForm.customer_id])

  const selectedInvoiceForPay = useMemo(() => {
    if (!payForm.invoice_id) return null
    return invoicesForPayCustomer.find((i) => i.id === payForm.invoice_id) ?? null
  }, [invoicesForPayCustomer, payForm.invoice_id])

  const chequeTotals = useMemo(() => {
    const total = cheques.reduce((s, c) => s + Number(String(c.amount || '').replace(/,/g, '') || 0), 0)
    const balance = Number(selectedInvoiceForPay?.balance ?? 0)
    const remaining = balance - total
    return { total, remaining }
  }, [cheques, selectedInvoiceForPay])

  const openPay = (customerId) => {
    const custInvs = invoices.filter((inv) => inv.customer_id === customerId)
    const firstInv = custInvs.find((inv) => {
      const paid = paymentSumByInvoice.get(inv.id) ?? 0
      return Number(inv.total_amount ?? 0) - paid > 0
    })
    const balance = firstInv ? Number(firstInv.total_amount ?? 0) - (paymentSumByInvoice.get(firstInv.id) ?? 0) : 0
    setPayForm({
      customer_id: customerId,
      invoice_id: firstInv?.id ?? (custInvs[0]?.id ?? ''),
      paid_at: new Date().toISOString().slice(0, 10),
      amount: balance ? balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '',
      method: 'cash',
      bank_name: '',
      sub_method: 'other',
      reference: '',
      note: '',
    })
    setCheques([
      {
        cheque_date: new Date().toISOString().slice(0, 10),
        cheque_number: '',
        amount: balance ? balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '',
      },
    ])
    setPayOpen(true)
  }

  const savePayment = async () => {
    if (!payForm.invoice_id) {
      toast.error('Select an invoice')
      return
    }

    const resolvedMethod = payForm.method === 'other' ? (payForm.sub_method || 'other') : payForm.method

    if (resolvedMethod === 'cheque') {
      const rows = cheques
        .map((c) => {
          const amount = Number(String(c.amount || '').replace(/,/g, ''))
          return {
            cheque_date: c.cheque_date,
            cheque_number: String(c.cheque_number || '').trim(),
            amount,
          }
        })
        .filter((c) => c.cheque_date || c.cheque_number || c.amount)

      if (rows.length === 0) {
        toast.error('Add at least one cheque')
        return
      }

      for (const c of rows) {
        if (!c.cheque_date) {
          toast.error('Cheque date is required')
          return
        }
        if (!c.cheque_number) {
          toast.error('Cheque number is required')
          return
        }
        if (!c.amount || c.amount <= 0) {
          toast.error('Cheque amount must be greater than 0')
          return
        }
      }

      setPaySaving(true)

      const payload = rows.map((c) => ({
        invoice_id: payForm.invoice_id,
        amount: c.amount,
        paid_at: c.cheque_date,
        method: 'cheque',
        bank_name: null,
        reference: c.cheque_number,
        note: payForm.note.trim() || null,
      }))

      const { error: err } = await supabase.from('invoice_payments').insert(payload)

      if (err) {
        toast.error(err.message)
        setPaySaving(false)
        return
      }
    } else {
      const amount = Number(String(payForm.amount || '').replace(/,/g, ''))
      if (!amount || amount <= 0) {
        toast.error('Enter a valid amount')
        return
      }

      setPaySaving(true)
      const { error: err } = await supabase.from('invoice_payments').insert({
        invoice_id: payForm.invoice_id,
        amount,
        paid_at: payForm.paid_at,
        method: resolvedMethod,
        bank_name: resolvedMethod === 'bank' ? (payForm.bank_name || null) : null,
        reference: payForm.reference.trim() || null,
        note: payForm.note.trim() || null,
      })
      if (err) {
        toast.error(err.message)
        setPaySaving(false)
        return
      }
    }
    toast.success('Payment saved')
    setPayOpen(false)
    setPaySaving(false)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Invoice receivables by customer.</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">Outstanding = Invoiced − Returns − Payments received.</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Outstanding</div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{fmt(totals.balance)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { key: 'all', label: 'All' },
            { key: 'unpaid', label: 'Unpaid' },
            { key: 'partial', label: 'Partial' },
            { key: 'paid', label: 'Paid' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                statusFilter === tab.key
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:text-emerald-50 dark:border-emerald-400/20'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 dark:bg-emerald-950/35 dark:border-emerald-900/40 dark:text-emerald-100/80">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Customer</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Invoices</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Invoiced</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Returns</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Paid</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Balance</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Status</th>
              <th className="text-center font-medium px-5 py-3 text-xs uppercase tracking-wide">Aging</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-5 py-8">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={9} className="px-5 py-4 text-red-600 text-center">{error}</td>
              </tr>
            ) : customersRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-slate-400 dark:text-emerald-100/60 text-center">
                  <FileText size={24} className="mx-auto mb-2 opacity-40 dark:text-emerald-200/30" />
                  No receivables found.
                </td>
              </tr>
            ) : (
              customersRows.map((r) => (
                <tr key={r.customer_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-900 dark:text-emerald-50">{r.name}</div>
                    <div className="text-xs text-slate-400 dark:text-emerald-100/60">{r.phone || '—'}</div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{r.invoicesCount}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-slate-900 dark:text-emerald-50">{fmt(r.invoiced)}</td>
                  <td className={`px-5 py-3.5 text-right font-medium ${r.returned > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-emerald-100/40'}`}>{r.returned > 0 ? `−${fmt(r.returned)}` : '—'}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-slate-900 dark:text-emerald-50">{fmt(r.paid)}</td>
                  <td className={`px-5 py-3.5 text-right font-extrabold ${r.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-emerald-50'}`}>{fmt(r.balance)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                      r.status === 'unpaid' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                      r.status === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    }`}>
                      {r.status === 'unpaid' ? 'Unpaid' : r.status === 'partial' ? 'Partial' : 'Paid'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{r.maxDaysOutstanding}d</div>
                    <div className={`text-[10px] font-semibold ${
                      r.agingBucket === '0-30' ? 'text-emerald-600 dark:text-emerald-400' :
                      r.agingBucket === '31-60' ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>{r.agingBucket} days</div>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openPay(r.customer_id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Plus size={14} />
                        Pay
                      </button>
                      <Link
                        to={`/finance/receivables/${r.customer_id}`}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
                      >
                        <Eye size={14} />
                        View
                      </Link>
                    </div>
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
                    {['cash', 'cheque', 'bank', 'other'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayForm((p) => ({ ...p, method: m }))}
                        className={`px-3 py-2 rounded-md text-xs font-bold border transition-colors ${
                          payForm.method === m
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:text-emerald-50 dark:border-emerald-400/20'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800'
                        }`}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {payForm.method === 'other' && (
                  <div className="sm:col-span-2">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Type</div>
                    <select
                      value={payForm.sub_method || 'other'}
                      onChange={(e) => setPayForm((p) => ({ ...p, sub_method: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="other">Other</option>
                      <option value="card">Card</option>
                    </select>
                  </div>
                )}

                {payForm.method === 'cheque' && (
                  <div className="sm:col-span-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Cheques</div>
                      <button
                        type="button"
                        onClick={() =>
                          setCheques((prev) => [
                            ...prev,
                            {
                              cheque_date: new Date().toISOString().slice(0, 10),
                              cheque_number: '',
                              amount: '',
                            },
                          ])
                        }
                        className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        Add Cheque
                      </button>
                    </div>

                    <div className="space-y-2">
                      {cheques.map((c, idx) => (
                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                          <div className="sm:col-span-2">
                            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Cheque Date</div>
                            <input
                              type="date"
                              value={c.cheque_date}
                              onChange={(e) =>
                                setCheques((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, cheque_date: e.target.value } : x))
                                )
                              }
                              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Cheque Number</div>
                            <input
                              value={c.cheque_number}
                              onChange={(e) => {
                                const digits = String(e.target.value || '').replace(/[^0-9]/g, '').slice(0, 13)
                                let formatted = digits
                                if (digits.length > 10) formatted = digits.slice(0, 6) + '-' + digits.slice(6, 10) + '-' + digits.slice(10)
                                else if (digits.length > 6) formatted = digits.slice(0, 6) + '-' + digits.slice(6)
                                setCheques((prev) => prev.map((x, i) => (i === idx ? { ...x, cheque_number: formatted } : x)))
                              }}
                              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Cheque Amount</div>
                            <input
                              value={c.amount}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9.]/g, '')
                                const parts = raw.split('.')
                                const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                const formatted = parts.length > 1 ? intPart + '.' + parts[1].slice(0, 2) : intPart
                                setCheques((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: formatted } : x)))
                              }}
                              placeholder="0.00"
                              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="sm:col-span-7 flex justify-end">
                            {cheques.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => setCheques((prev) => prev.filter((_, i) => i !== idx))}
                                className="px-3 py-2 rounded-lg text-xs font-bold border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Total Cheque Payment: <span className="font-extrabold text-slate-900 dark:text-white">{fmt(chequeTotals.total)}</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 sm:text-right">
                        Remaining: <span className="font-extrabold text-slate-900 dark:text-white">{fmt(chequeTotals.remaining)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {payForm.method === 'bank' && (
                  <div className="sm:col-span-2">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Bank</div>
                    <select
                      value={payForm.bank_name || ''}
                      onChange={(e) => setPayForm((p) => ({ ...p, bank_name: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="">Select bank</option>
                      {banks.map((b) => (
                        <option key={b.id} value={`${b.code} - ${b.name}`}>{b.code} - {b.name}{b.branch ? ` (${b.branch})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Invoice</div>
                  <select
                    value={payForm.invoice_id}
                    onChange={(e) => {
                      const invId = e.target.value
                      const inv = invoicesForPayCustomer.find((i) => i.id === invId)
                      const bal = inv ? inv.balance : 0
                      setPayForm((p) => ({
                        ...p,
                        invoice_id: invId,
                        amount: bal > 0 ? bal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '',
                      }))
                      setCheques([
                        {
                          cheque_date: new Date().toISOString().slice(0, 10),
                          cheque_number: '',
                          amount: bal > 0 ? bal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '',
                        },
                      ])
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {invoicesForPayCustomer.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        INV-{String(inv.invoice_number ?? '').padStart(4, '0')} — Balance {fmt(inv.balance)}
                      </option>
                    ))}
                  </select>
                </div>

                {payForm.method !== 'cheque' ? (
                  <>
                    <div>
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Amount</div>
                      <input
                        value={payForm.amount}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9.]/g, '')
                          const parts = raw.split('.')
                          const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                          const formatted = parts.length > 1 ? intPart + '.' + parts[1].slice(0, 2) : intPart
                          setPayForm((p) => ({ ...p, amount: formatted }))
                        }}
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
                  </>
                ) : null}

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
                  disabled={paySaving}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {paySaving ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

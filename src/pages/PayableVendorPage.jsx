import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { ArrowLeft, Plus, FileText } from 'lucide-react'

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function PayableVendorPage() {
  const { vendorId } = useParams()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [vendor, setVendor] = useState(null)
  const [purchases, setPurchases] = useState([])
  const [payments, setPayments] = useState([])
  const [banks, setBanks] = useState([])

  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState({
    purchase_id: '',
    paid_at: new Date().toISOString().slice(0, 10),
    amount: '',
    method: 'cash',
    bank_name: '',
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

  const [payHistOpen, setPayHistOpen] = useState(false)
  const [payHistPurchaseId, setPayHistPurchaseId] = useState('')
  const [editingPaymentId, setEditingPaymentId] = useState('')
  const [editPayForm, setEditPayForm] = useState({ paid_at: '', amount: '' })

  const load = async () => {
    setLoading(true)
    setError(null)

    const [venRes, purRes, payRes, bankRes] = await Promise.all([
      supabase.from('vendors').select('id, name, phone, address').eq('id', vendorId).single(),
      supabase
        .from('purchases')
        .select('id, date, ref_no, payment_type, total_amount')
        .eq('vendor_id', vendorId)
        .order('date', { ascending: false }),
      supabase
        .from('purchase_payments')
        .select('id, purchase_id, amount, paid_at, method, bank_name, reference, note, created_at')
        .order('paid_at', { ascending: false }),
      supabase.from('banks').select('id, code, name, branch').order('code'),
    ])

    if (venRes.error) {
      setError(venRes.error.message)
      setVendor(null)
    } else {
      setVendor(venRes.data)
    }

    if (purRes.error) {
      setError((prev) => prev ?? purRes.error.message)
      setPurchases([])
    } else {
      setPurchases(purRes.data ?? [])
    }

    if (payRes.error) {
      setError((prev) => prev ?? payRes.error.message)
      setPayments([])
    } else {
      setPayments((payRes.data ?? []).filter((p) => !!p.purchase_id))
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
      toast.error('Failed to load')
      setError('Failed to load')
      setLoading(false)
    })
  }, [vendorId])

  const paymentsForVendor = useMemo(() => {
    const purchaseIds = new Set(purchases.map((p) => p.id))
    return payments.filter((p) => purchaseIds.has(p.purchase_id))
  }, [payments, purchases])

  const paymentSumByPurchase = useMemo(() => {
    const map = new Map()
    for (const p of paymentsForVendor) {
      const prev = map.get(p.purchase_id) ?? 0
      map.set(p.purchase_id, prev + Number(p.amount ?? 0))
    }
    return map
  }, [paymentsForVendor])

  const purRows = useMemo(() => {
    return purchases.map((pur) => {
      const paid = paymentSumByPurchase.get(pur.id) ?? 0
      const total = Number(pur.total_amount ?? 0)
      const balance = total - paid
      const status = paid === 0 ? 'unpaid' : balance > 0 ? 'partial' : 'paid'
      const daysOutstanding = Math.floor((Date.now() - new Date(pur.date ?? Date.now()).getTime()) / 86400000)
      const agingBucket = daysOutstanding <= 30 ? '0-30' : daysOutstanding <= 60 ? '31-60' : '60+'
      return { ...pur, paid, balance, status, daysOutstanding, agingBucket }
    })
  }, [purchases, paymentSumByPurchase])

  const paymentDetailsByPurchase = useMemo(() => {
    const byPur = new Map()
    for (const p of paymentsForVendor) {
      if (!p.purchase_id) continue
      const list = byPur.get(p.purchase_id) ?? []
      list.push(p)
      byPur.set(p.purchase_id, list)
    }

    const result = new Map()
    for (const [purchaseId, list] of byPur.entries()) {
      list.sort((a, b) => new Date(b.paid_at ?? b.created_at ?? 0).getTime() - new Date(a.paid_at ?? a.created_at ?? 0).getTime())
      const last = list[0]
      const method = String(last?.method ?? '').toLowerCase()
      result.set(purchaseId, {
        count: list.length,
        lastPaidAt: last?.paid_at ?? null,
        lastAmount: Number(last?.amount ?? 0),
        method,
        bankName: last?.bank_name ?? null,
        reference: last?.reference ?? null,
      })
    }
    return result
  }, [paymentsForVendor])

  const paymentsForPurchase = useMemo(() => {
    if (!payHistPurchaseId) return []
    return paymentsForVendor
      .filter((p) => p.purchase_id === payHistPurchaseId)
      .slice()
      .sort((a, b) => new Date(b.paid_at ?? b.created_at ?? 0).getTime() - new Date(a.paid_at ?? a.created_at ?? 0).getTime())
  }, [paymentsForVendor, payHistPurchaseId])

  const deletePayment = async (paymentId) => {
    if (!confirm('Delete this payment?')) return
    const { error: err } = await supabase.from('purchase_payments').delete().eq('id', paymentId)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Payment deleted')
    logAction({ action: 'delete_purchase_payment', targetType: 'purchase_payment', targetId: paymentId })
    await load()
  }

  const startEditPayment = (p) => {
    setEditingPaymentId(p.id)
    setEditPayForm({
      paid_at: p.paid_at ? String(p.paid_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
      amount: Number(p.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    })
  }

  const cancelEditPayment = () => {
    setEditingPaymentId('')
    setEditPayForm({ paid_at: '', amount: '' })
  }

  const saveEditPayment = async () => {
    if (!editingPaymentId) return
    const amount = Number(String(editPayForm.amount || '').replace(/,/g, ''))
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (!editPayForm.paid_at) {
      toast.error('Select a date')
      return
    }

    const { error: err } = await supabase
      .from('purchase_payments')
      .update({ amount, paid_at: editPayForm.paid_at })
      .eq('id', editingPaymentId)

    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Payment updated')
    logAction({ action: 'edit_purchase_payment', targetType: 'purchase_payment', targetId: editingPaymentId })
    cancelEditPayment()
    await load()
  }

  const totals = useMemo(() => {
    const purchased = purRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const paid = purRows.reduce((s, r) => s + Number(r.paid ?? 0), 0)
    const balance = purRows.reduce((s, r) => s + Number(r.balance ?? 0), 0)
    return { purchased, paid, balance }
  }, [purRows])

  const openPay = () => {
    const firstPur = purRows.find((x) => (x.balance ?? 0) > 0)
    const balance = firstPur?.balance ?? 0
    setPayForm((p) => ({
      ...p,
      purchase_id: firstPur?.id ?? (purRows[0]?.id ?? ''),
      amount: balance ? balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '',
      method: 'cash',
      bank_name: '',
      reference: '',
      note: '',
    }))
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
    if (!payForm.purchase_id) {
      toast.error('Select a purchase')
      return
    }

    if (payForm.method === 'cheque') {
      const rows = cheques
        .map((c) => ({
          cheque_date: c.cheque_date,
          cheque_number: String(c.cheque_number || '').trim(),
          amount: Number(String(c.amount || '').replace(/,/g, '')),
        }))
        .filter((c) => c.cheque_date || c.cheque_number || c.amount)

      if (rows.length === 0) {
        toast.error('Add at least one cheque')
        return
      }
      for (const c of rows) {
        if (!c.cheque_date) { toast.error('Cheque date is required'); return }
        if (!c.cheque_number) { toast.error('Cheque number is required'); return }
        if (!c.amount || c.amount <= 0) { toast.error('Cheque amount must be greater than 0'); return }
      }

      setSaving(true)
      const payload = rows.map((c) => ({
        purchase_id: payForm.purchase_id,
        amount: c.amount,
        paid_at: c.cheque_date,
        method: 'cheque',
        bank_name: null,
        reference: c.cheque_number,
        note: payForm.note.trim() || null,
      }))

      const { error: err } = await supabase.from('purchase_payments').insert(payload)
      if (err) {
        toast.error(err.message)
        setSaving(false)
        return
      }

      toast.success('Payment saved')
      logAction({ action: 'save_purchase_payment', targetType: 'purchase_payment' })
      setSaving(false)
      setPayOpen(false)
      await load()
      return
    }

    const amount = Number(String(payForm.amount || '').replace(/,/g, ''))
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }

    setSaving(true)
    const { error: err } = await supabase.from('purchase_payments').insert({
      purchase_id: payForm.purchase_id,
      amount,
      paid_at: payForm.paid_at,
      method: payForm.method,
      bank_name: payForm.method === 'bank' ? 'Bank' : null,
      reference: payForm.reference.trim() || null,
      note: payForm.note.trim() || null,
    })

    if (err) {
      toast.error(err.message)
      setSaving(false)
      return
    }

    toast.success('Payment saved')
    logAction({ action: 'save_purchase_payment', targetType: 'purchase_payment' })
    setSaving(false)
    setPayOpen(false)
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
        <Link to="/finance/payables" className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors">
          <ArrowLeft size={16} />
          Back to Payables
        </Link>

        <button
          onClick={openPay}
          disabled={purRows.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Make Payment
        </button>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        <div className="p-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Vendor</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white">{vendor?.name ?? '-'}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{vendor?.phone ?? '—'}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{vendor?.address ?? '—'}</div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-right">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Purchased</div>
              <div className="text-base font-bold text-slate-900 dark:text-white">{fmt(totals.purchased)}</div>
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
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 dark:bg-emerald-950/35 dark:border-emerald-900/40 dark:text-emerald-101/80">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Purchase</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Date</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Payment Type</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Total</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Paid</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Balance</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Status</th>
              <th className="text-center font-medium px-5 py-3 text-xs uppercase tracking-wide">Aging</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Payment Details</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={10} className="px-5 py-4 text-red-600 text-center">{error}</td>
              </tr>
            ) : purRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-10 text-slate-400 dark:text-emerald-101/60 text-center">
                  <FileText size={24} className="mx-auto mb-2 opacity-40 dark:text-emerald-200/30" />
                  No purchases for this vendor.
                </td>
              </tr>
            ) : (
              purRows.map((pur) => (
                <tr key={pur.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-900 dark:text-emerald-50">PUR-{String(pur.id).slice(0, 8)}</div>
                    <div className="text-xs text-slate-400 dark:text-emerald-101/60">{pur.ref_no || '—'}</div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-101/70">{pur.date ? new Date(pur.date).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 capitalize">
                      {pur.payment_type || 'cash'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-medium text-slate-900 dark:text-emerald-50">{fmt(pur.total_amount)}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-slate-900 dark:text-emerald-50">{fmt(pur.paid)}</td>
                  <td className={`px-5 py-3.5 text-right font-extrabold ${pur.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-emerald-50'}`}>{fmt(pur.balance)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                      pur.status === 'unpaid' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                      pur.status === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    }`}>
                      {pur.status === 'unpaid' ? 'Unpaid' : pur.status === 'partial' ? 'Partial' : 'Paid'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{pur.daysOutstanding}d</div>
                    <div className={`text-[10px] font-semibold ${
                      pur.agingBucket === '0-30' ? 'text-emerald-600 dark:text-emerald-400' :
                      pur.agingBucket === '31-60' ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>{pur.agingBucket} days</div>
                  </td>
                  <td className="px-5 py-3.5">
                    {(() => {
                      const d = paymentDetailsByPurchase.get(pur.id)
                      if (!d) return <div className="text-xs text-slate-400 dark:text-emerald-101/60">—</div>
                      const methodLabel = d.method ? d.method.toUpperCase() : '-'
                      const extra = d.method === 'bank' ? d.bankName : d.reference
                      return (
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{methodLabel} • {fmt(d.lastAmount)}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-300">
                            {d.lastPaidAt ? new Date(d.lastPaidAt).toLocaleDateString() : '—'}
                            {extra ? ` • ${extra}` : ''}
                          </div>
                          {d.count > 1 ? (
                            <div className="text-[10px] font-semibold text-slate-400 dark:text-emerald-101/60">{d.count} payments</div>
                          ) : null}
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setPayHistPurchaseId(pur.id)
                                setPayHistOpen(true)
                              }}
                              className="mt-1 inline-flex items-center px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                              Edit / Delete
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`/inventory/purchases/${pur.id}`}
                      state={{ from: `/finance/payables/${vendorId}` }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      View Purchase
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
              <div className="font-bold text-slate-900 dark:text-white">Make Payment</div>
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
                        onClick={() =>
                          setPayForm((p) => ({
                            ...p,
                            method: m,
                            bank_name: m === 'bank' ? 'Bank' : '',
                          }))
                        }
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
                          <div className="sm:col-span-2">
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
                              placeholder="111111-1111-111"
                              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Amount</div>
                            <input
                              value={c.amount}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9.]/g, '')
                                const parts = raw.split('.')
                                const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                const formatted = parts.length > 1 ? intPart + '.' + parts[1].slice(0, 2) : intPart
                                setCheques((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, amount: formatted } : x))
                                )
                              }}
                              placeholder="0.00"
                              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                            />
                          </div>
                          <div className="flex items-end">
                            {cheques.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setCheques((prev) => prev.filter((_, i) => i !== idx))}
                                className="px-3 py-2.5 rounded-lg text-xs font-bold border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Purchase</div>
                  <select
                    value={payForm.purchase_id}
                    onChange={(e) => {
                      const purId = e.target.value
                      const pur = purRows.find((p) => p.id === purId)
                      const bal = pur ? pur.balance : 0
                      setPayForm((p) => ({
                        ...p,
                        purchase_id: purId,
                        amount: bal > 0 ? bal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '',
                      }))
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {purRows.map((pur) => (
                      <option key={pur.id} value={pur.id}>
                        PUR-{String(pur.id).slice(0, 8)} — {pur.ref_no || pur.date} — Balance {fmt(pur.balance)}
                      </option>
                    ))}
                  </select>
                </div>

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
                    placeholder="Reference"
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

      {payHistOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white">Payment Details</div>
              <button
                onClick={() => setPayHistOpen(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-5">
              {paymentsForPurchase.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">No payments found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-auto">
                    <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 dark:bg-emerald-950/35 dark:border-emerald-900/40 dark:text-emerald-101/80">
                      <tr>
                        <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Date</th>
                        <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Method</th>
                        <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Details</th>
                        <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">Amount</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsForPurchase.map((p) => (
                        <tr key={p.id} className="border-b border-slate-50 dark:border-emerald-900/30 align-middle">
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-200 align-middle">
                            {editingPaymentId === p.id ? (
                              <input
                                type="date"
                                value={editPayForm.paid_at}
                                onChange={(e) => setEditPayForm((x) => ({ ...x, paid_at: e.target.value }))}
                                className="w-full max-w-[170px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                              />
                            ) : (
                              p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white align-middle">{String(p.method ?? '').toUpperCase()}</td>
                          <td className="px-4 py-3.5 align-middle">
                            <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-normal break-words">
                              <div className="font-semibold text-slate-800 dark:text-slate-100">
                                {p.method === 'bank' ? (p.bank_name || '—') : (p.reference || '—')}
                              </div>
                              {p.note ? (
                                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">{p.note}</div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-slate-900 dark:text-white align-middle">
                            {editingPaymentId === p.id ? (
                              <input
                                value={editPayForm.amount}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9.]/g, '')
                                  const parts = raw.split('.')
                                  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                  const formatted = parts.length > 1 ? intPart + '.' + parts[1].slice(0, 2) : intPart
                                  setEditPayForm((x) => ({ ...x, amount: formatted }))
                                }}
                                className="w-full max-w-[130px] ml-auto text-right px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                              />
                            ) : (
                              fmt(p.amount)
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right align-middle">
                            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                              {editingPaymentId === p.id ? (
                                <>
                                  <button
                                    onClick={saveEditPayment}
                                    className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditPayment}
                                    className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => startEditPayment(p)}
                                  className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                onClick={() => deletePayment(p.id)}
                                className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

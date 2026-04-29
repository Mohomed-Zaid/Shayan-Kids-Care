import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Search, Eye, FileText, Plus } from 'lucide-react'

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function PayablesPage() {
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [purchases, setPurchases] = useState([])
  const [payments, setPayments] = useState([])
  const [banks, setBanks] = useState([])

  const [payOpen, setPayOpen] = useState(false)
  const [paySaving, setPaySaving] = useState(false)
  const [payForm, setPayForm] = useState({
    vendor_id: '',
    purchase_id: '',
    paid_at: new Date().toISOString().slice(0, 10),
    amount: '',
    method: 'cash',
    bank_name: '',
    reference: '',
    note: '',
  })

  const load = async () => {
    setLoading(true)
    setError(null)

    const [purRes, payRes, bankRes] = await Promise.all([
      supabase
        .from('purchases')
        .select('id, date, ref_no, payment_type, total_amount, vendor_id, vendors(name, phone)')
        .order('date', { ascending: false }),
      supabase
        .from('purchase_payments')
        .select('id, purchase_id, amount, paid_at, method')
        .order('paid_at', { ascending: false }),
      supabase.from('banks').select('id, code, name, branch').order('code'),
    ])

    if (purRes.error) {
      setError(purRes.error.message)
      setPurchases([])
    } else {
      setPurchases(purRes.data ?? [])
    }

    if (payRes.error) {
      setError((prev) => prev ?? payRes.error.message)
      setPayments([])
    } else {
      setPayments(payRes.data ?? [])
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
      toast.error('Failed to load payables')
      setError('Failed to load')
      setLoading(false)
    })
  }, [])

  const paymentSumByPurchase = useMemo(() => {
    const map = new Map()
    for (const p of payments) {
      const prev = map.get(p.purchase_id) ?? 0
      map.set(p.purchase_id, prev + Number(p.amount ?? 0))
    }
    return map
  }, [payments])

  const vendorRows = useMemo(() => {
    const byVendor = new Map()

    for (const pur of purchases) {
      const vid = pur.vendor_id
      if (!vid) continue

      const paid = paymentSumByPurchase.get(pur.id) ?? 0
      const total = Number(pur.total_amount ?? 0)
      const balance = total - paid

      const payStatus = paid === 0 ? 'unpaid' : balance > 0 ? 'partial' : 'paid'
      const daysOutstanding = Math.floor((Date.now() - new Date(pur.date ?? pur.created_at ?? Date.now()).getTime()) / 86400000)
      const agingBucket = daysOutstanding <= 30 ? '0-30' : daysOutstanding <= 60 ? '31-60' : '60+'

      const existing = byVendor.get(vid)
      if (!existing) {
        byVendor.set(vid, {
          vendor_id: vid,
          name: pur.vendors?.name ?? '-',
          phone: pur.vendors?.phone ?? '',
          purchased: total,
          paid,
          balance,
          purchasesCount: 1,
          status: payStatus,
          maxDaysOutstanding: daysOutstanding,
          agingBucket,
        })
      } else {
        existing.purchased += total
        existing.paid += paid
        existing.balance = existing.purchased - existing.paid
        existing.purchasesCount += 1
        if (payStatus === 'unpaid') existing.status = 'unpaid'
        else if (payStatus === 'partial' && existing.status !== 'unpaid') existing.status = 'partial'
        else if (existing.status !== 'unpaid' && existing.status !== 'partial') existing.status = 'paid'
        if (daysOutstanding > existing.maxDaysOutstanding) {
          existing.maxDaysOutstanding = daysOutstanding
          existing.agingBucket = agingBucket
        }
      }
    }

    const q = search.trim().toLowerCase()
    let rows = Array.from(byVendor.values())

    if (q) {
      rows = rows.filter((r) =>
        String(r.name ?? '').toLowerCase().includes(q) ||
        String(r.phone ?? '').toLowerCase().includes(q) ||
        String(r.vendor_id ?? '').toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter)
    }

    rows.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))
    return rows
  }, [purchases, paymentSumByPurchase, search, statusFilter])

  const totals = useMemo(() => {
    const purchased = vendorRows.reduce((s, r) => s + Number(r.purchased ?? 0), 0)
    const paid = vendorRows.reduce((s, r) => s + Number(r.paid ?? 0), 0)
    const balance = vendorRows.reduce((s, r) => s + Number(r.balance ?? 0), 0)
    return { purchased, paid, balance }
  }, [vendorRows])

  const purchasesForPayVendor = useMemo(() => {
    if (!payForm.vendor_id) return []
    return purchases
      .filter((pur) => pur.vendor_id === payForm.vendor_id)
      .map((pur) => {
        const paid = paymentSumByPurchase.get(pur.id) ?? 0
        const total = Number(pur.total_amount ?? 0)
        const balance = total - paid
        return { ...pur, paid, balance }
      })
  }, [purchases, paymentSumByPurchase, payForm.vendor_id])

  const openPay = (vendorId) => {
    const vendorPurs = purchases.filter((pur) => pur.vendor_id === vendorId)
    const firstPur = vendorPurs.find((pur) => {
      const paid = paymentSumByPurchase.get(pur.id) ?? 0
      return Number(pur.total_amount ?? 0) - paid > 0
    })
    const balance = firstPur ? Number(firstPur.total_amount ?? 0) - (paymentSumByPurchase.get(firstPur.id) ?? 0) : 0
    setPayForm({
      vendor_id: vendorId,
      purchase_id: firstPur?.id ?? (vendorPurs[0]?.id ?? ''),
      paid_at: new Date().toISOString().slice(0, 10),
      amount: balance ? balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '',
      method: 'cash',
      bank_name: '',
      reference: '',
      note: '',
    })
    setPayOpen(true)
  }

  const savePayment = async () => {
    if (!payForm.purchase_id) {
      toast.error('Select a purchase')
      return
    }

    const amount = Number(String(payForm.amount || '').replace(/,/g, ''))
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }

    setPaySaving(true)
    const { error: err } = await supabase.from('purchase_payments').insert({
      purchase_id: payForm.purchase_id,
      amount,
      paid_at: payForm.paid_at,
      method: payForm.method,
      bank_name: payForm.method === 'bank' ? (payForm.bank_name || null) : null,
      reference: payForm.reference.trim() || null,
      note: payForm.note.trim() || null,
    })

    if (err) {
      toast.error(err.message)
      setPaySaving(false)
      return
    }

    toast.success('Payment saved')
    logAction({ action: 'save_purchase_payment', targetType: 'purchase_payment' })
    setPaySaving(false)
    setPayOpen(false)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Purchase payables by vendor.</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">Outstanding = Purchased − Payments made.</div>
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
            placeholder="Search vendor"
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
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Vendor</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Purchases</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Purchased</th>
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
                <td colSpan={8} className="px-5 py-8">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="px-5 py-4 text-red-600 text-center">{error}</td>
              </tr>
            ) : vendorRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-slate-400 dark:text-emerald-101/60 text-center">
                  <FileText size={24} className="mx-auto mb-2 opacity-40 dark:text-emerald-200/30" />
                  No payables found.
                </td>
              </tr>
            ) : (
              vendorRows.map((r) => (
                <tr key={r.vendor_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-900 dark:text-emerald-50">{r.name}</div>
                    <div className="text-xs text-slate-400 dark:text-emerald-101/60">{r.phone || '—'}</div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-101/70">{r.purchasesCount}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-slate-900 dark:text-emerald-50">{fmt(r.purchased)}</td>
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
                        onClick={() => openPay(r.vendor_id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Plus size={14} />
                        Pay
                      </button>
                      <Link
                        to={`/finance/payables/${r.vendor_id}`}
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
                  <div className="grid grid-cols-3 gap-2">
                    {['cash', 'bank', 'other'].map((m) => (
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
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Purchase</div>
                  <select
                    value={payForm.purchase_id}
                    onChange={(e) => {
                      const purId = e.target.value
                      const pur = purchasesForPayVendor.find((p) => p.id === purId)
                      const bal = pur ? pur.balance : 0
                      setPayForm((p) => ({
                        ...p,
                        purchase_id: purId,
                        amount: bal > 0 ? bal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '',
                      }))
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {purchasesForPayVendor.map((pur) => (
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

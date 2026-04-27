import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { Search, Eye, FileText, Filter } from 'lucide-react'

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function ReceivablesPage() {
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])

  const load = async () => {
    setLoading(true)
    setError(null)

    const [invRes, payRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, customer_id, total_amount, created_at, payment_type, customers(name, phone)')
        .eq('payment_type', 'credit')
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, paid_at, method')
        .order('paid_at', { ascending: false }),
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

  const customersRows = useMemo(() => {
    const byCustomer = new Map()

    for (const inv of invoices) {
      const cid = inv.customer_id
      if (!cid) continue

      const paid = paymentSumByInvoice.get(inv.id) ?? 0
      const total = Number(inv.total_amount ?? 0)
      const balance = total - paid

      const payStatus = paid === 0 ? 'unpaid' : balance > 0 ? 'partial' : 'paid'
      const daysOutstanding = Math.floor((Date.now() - new Date(inv.created_at).getTime()) / 86400000)
      const agingBucket = daysOutstanding <= 30 ? '0-30' : daysOutstanding <= 60 ? '31-60' : '60+'

      const existing = byCustomer.get(cid)
      if (!existing) {
        byCustomer.set(cid, {
          customer_id: cid,
          name: inv.customers?.name ?? '-',
          phone: inv.customers?.phone ?? '',
          invoiced: total,
          paid,
          balance,
          invoicesCount: 1,
          status: payStatus,
          maxDaysOutstanding: daysOutstanding,
          agingBucket,
        })
      } else {
        existing.invoiced += total
        existing.paid += paid
        existing.balance += balance
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
  }, [invoices, paymentSumByInvoice, search, statusFilter])

  const totals = useMemo(() => {
    const invoiced = customersRows.reduce((s, r) => s + Number(r.invoiced ?? 0), 0)
    const paid = customersRows.reduce((s, r) => s + Number(r.paid ?? 0), 0)
    const balance = customersRows.reduce((s, r) => s + Number(r.balance ?? 0), 0)
    return { invoiced, paid, balance }
  }, [customersRows])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Credit invoice receivables by customer.</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">Outstanding = total credit invoices − payments received.</div>
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
            ) : customersRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-slate-400 dark:text-emerald-100/60 text-center">
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
                    <Link
                      to={`/finance/receivables/${r.customer_id}`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
                    >
                      <Eye size={14} />
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

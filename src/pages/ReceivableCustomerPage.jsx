import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { logAction } from '../lib/auditLog'
import { registerReceivableChequesInHand } from '../lib/receivableChequeWorkflow'
import {
  areChequeRowsValid,
  extractBankCodeFromCheque,
  getApprovedBankName,
  isApprovedBankCode,
  isChequeFormatValid,
} from '../lib/chequeValidation'
import ChequeNumberField, { ChequeBankNameDisplay } from '../components/ChequeNumberField'
import CompanyPhoneLines from '../components/CompanyPhoneLines'
import { ArrowLeft, Plus, FileText } from 'lucide-react'
import html2pdf from 'html2pdf.js'
import ControlledDateField from '../components/ControlledDateField'

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function ReceivableCustomerPage() {
  const { customerId } = useParams()
  const toast = useToast()
  const { isSuperAdmin } = usePermissions()

  const receiptRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [customer, setCustomer] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [returns, setReturns] = useState([])
  const [banks, setBanks] = useState([])

  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState({
    invoice_id: '',
    paid_at: new Date().toISOString().slice(0, 10),
    amount: '',
    method: 'cash',
    bank_name: '',
    sub_method: 'other',
    reference: '',
    note: '',
  })

  const [payHistOpen, setPayHistOpen] = useState(false)
  const [payHistInvoiceId, setPayHistInvoiceId] = useState('')
  const [editingPaymentId, setEditingPaymentId] = useState('')
  const [editPayForm, setEditPayForm] = useState({ paid_at: '', amount: '' })

  const [cheques, setCheques] = useState([
    {
      cheque_date: new Date().toISOString().slice(0, 10),
      cheque_number: '',
      bank_code: '',
      bank_name: '',
      amount: '',
    },
  ])

  const [receiptData, setReceiptData] = useState(null)

  const referencePlaceholder = useMemo(() => {
    if (payForm.method === 'cheque') return 'Cheque number'
    if (payForm.method === 'bank') return 'Bank reference'
    if (payForm.method === 'other') return 'Reference'
    return 'Reference'
  }, [payForm.method])

  const downloadReceiptPdf = async (filename) => {
    if (!receiptRef.current) return

    const wrapper = document.createElement('div')
    wrapper.className = 'pdf-export-wrapper'
    const cloned = receiptRef.current.cloneNode(true)
    wrapper.appendChild(cloned)
    document.body.appendChild(wrapper)

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    cloned.style.backgroundColor = '#ffffff'
    cloned.style.color = '#000000'
    cloned.querySelectorAll('*').forEach((el) => {
      const cs = window.getComputedStyle(el)
      const bg = cs.backgroundColor
      const isTransparentBg = bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent'
      const isWhiteBg = bg === 'rgb(255, 255, 255)'

      if (!isTransparentBg && !isWhiteBg) {
        el.style.backgroundColor = '#ffffff'
      }
      el.style.color = '#000000'
    })

    const opt = {
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: [80, 297], orientation: 'portrait' },
    }

    try {
      await html2pdf().set(opt).from(cloned).save()
    } finally {
      wrapper.remove()
    }
  }

  const load = async () => {
    setLoading(true)
    setError(null)

    const [custRes, invRes, payRes, retRes, bankRes] = await Promise.all([
      supabase.from('customers').select('id, name, phone, address').eq('id', customerId).single(),
      supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, created_at, payment_type')
        .eq('customer_id', customerId)
        .in('payment_type', ['credit', 'cash'])
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, paid_at, method, bank_name, reference, note, created_at')
        .order('paid_at', { ascending: false }),
      supabase
        .from('returns')
        .select('id, invoice_id, total_amount, reason, return_number, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
      supabase.from('banks').select('id, code, name, bank_code, branch').order('code'),
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

  const returnsByInvoice = useMemo(() => {
    const map = new Map()
    for (const r of returns) {
      const iid = r.invoice_id
      if (!iid) continue
      const prev = map.get(iid) ?? { total: 0, items: [] }
      prev.total += Number(r.total_amount ?? 0)
      prev.items.push(r)
      map.set(iid, prev)
    }
    return map
  }, [returns])

  const invRows = useMemo(() => {
    return invoices.map((inv) => {
      const paid = paymentSumByInvoice.get(inv.id) ?? 0
      const total = Number(inv.total_amount ?? 0)
      const retAmount = returnsByInvoice.get(inv.id)?.total ?? 0
      const balance = total - paid - retAmount
      const status = (paid === 0 && retAmount === 0) ? 'unpaid' : balance > 0 ? 'partial' : 'paid'
      const daysOutstanding = Math.floor((Date.now() - new Date(inv.created_at).getTime()) / 86400000)
      const agingBucket = daysOutstanding <= 30 ? '0-30' : daysOutstanding <= 60 ? '31-60' : '60+'
      return { ...inv, paid, returned: retAmount, balance, status, daysOutstanding, agingBucket }
    })
  }, [invoices, paymentSumByInvoice, returnsByInvoice])

  const paymentDetailsByInvoice = useMemo(() => {
    const byInv = new Map()

    for (const p of paymentsForCustomer) {
      if (!p.invoice_id) continue
      const list = byInv.get(p.invoice_id) ?? []
      list.push(p)
      byInv.set(p.invoice_id, list)
    }

    const result = new Map()

    for (const [invoiceId, list] of byInv.entries()) {
      list.sort((a, b) => {
        const da = new Date(a.paid_at ?? a.created_at ?? 0).getTime()
        const db = new Date(b.paid_at ?? b.created_at ?? 0).getTime()
        return db - da
      })

      const last = list[0]
      const method = String(last?.method ?? '').toLowerCase()
      result.set(invoiceId, {
        count: list.length,
        lastPaidAt: last?.paid_at ?? null,
        lastAmount: Number(last?.amount ?? 0),
        method,
        bankName: last?.bank_name ?? null,
        reference: last?.reference ?? null,
      })
    }

    return result
  }, [paymentsForCustomer])

  const paymentsForInvoice = useMemo(() => {
    if (!payHistInvoiceId) return []
    return paymentsForCustomer
      .filter((p) => p.invoice_id === payHistInvoiceId)
      .slice()
      .sort((a, b) => new Date(b.paid_at ?? b.created_at ?? 0).getTime() - new Date(a.paid_at ?? a.created_at ?? 0).getTime())
  }, [paymentsForCustomer, payHistInvoiceId])

  const deletePayment = async (paymentId) => {
    if (!confirm('Delete this payment?')) return
    const { error: err } = await supabase.from('invoice_payments').delete().eq('id', paymentId)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Payment deleted')
    logAction({ action: 'delete_payment', targetType: 'payment', targetId: pay.id })
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

    const today = new Date().toISOString().split('T')[0]
    const effectivePaidAt = isSuperAdmin ? editPayForm.paid_at : today

    const { error: err } = await supabase
      .from('invoice_payments')
      .update({ amount, paid_at: effectivePaidAt })
      .eq('id', editingPaymentId)

    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Payment updated')
    logAction({ action: 'edit_payment', targetType: 'payment', targetId: pay.id })
    cancelEditPayment()
    await load()
  }

  const totals = useMemo(() => {
    const invoiced = invRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const returned = invRows.reduce((s, r) => s + Number(r.returned ?? 0), 0)
    const paid = invRows.reduce((s, r) => s + Number(r.paid ?? 0), 0)
    const balance = invRows.reduce((s, r) => s + Number(r.balance ?? 0), 0)
    return { invoiced, returned, paid, balance }
  }, [invRows])

  const openPay = () => {
    const firstInv = invRows.find((x) => (x.balance ?? 0) > 0)
    setPayForm((p) => ({
      ...p,
      invoice_id: firstInv?.id ?? (invRows[0]?.id ?? ''),
      amount: firstInv?.balance ? firstInv.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '',
      method: 'cash',
      reference: '',
      note: '',
    }))
    setCheques([
      {
        cheque_date: new Date().toISOString().slice(0, 10),
        cheque_number: '',
        bank_code: '',
        bank_name: '',
        amount: firstInv?.balance ? firstInv.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '',
      },
    ])
    setPayOpen(true)
  }

  const isAllChequesValid = useMemo(() => {
    if (payForm.method !== 'cheque') return true
    return areChequeRowsValid(cheques)
  }, [payForm.method, cheques])

  const savePayment = async () => {
    if (!payForm.invoice_id) {
      toast.error('Select an invoice')
      return
    }

    const resolvedMethod = payForm.method === 'other' ? (payForm.sub_method || 'other') : payForm.method
    const inv = invRows.find((x) => x.id === payForm.invoice_id) ?? null
    const invNo = inv?.invoice_number ?? ''
    const invoiceLabel = invNo ? `INV-${String(invNo).padStart(4, '0')}` : `INV-${String(payForm.invoice_id).slice(0, 8)}`

    if (resolvedMethod === 'cheque') {
      const rows = cheques
        .map((c) => {
          const amount = Number(String(c.amount || '').replace(/,/g, ''))
          return {
            cheque_date: c.cheque_date,
            cheque_number: String(c.cheque_number || '').trim(),
            bank_code: String(c.bank_code || '').trim(),
            bank_name: String(c.bank_name || '').trim(),
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
        if (!isChequeFormatValid(c.cheque_number)) {
          toast.error('Invalid cheque number format — expected XXXXXX-XXXX-XXX')
          return
        }
        const code = extractBankCodeFromCheque(c.cheque_number)
        if (!isApprovedBankCode(code)) {
          toast.error('Invalid bank code in cheque number')
          return
        }
        if (!c.amount || c.amount <= 0) {
          toast.error('Cheque amount must be greater than 0')
          return
        }
      }

      // Check for duplicate cheque numbers
      const chequeNumbers = rows.map((c) => c.cheque_number)
      const { data: existing } = await supabase
        .from('invoice_payments')
        .select('reference')
        .eq('method', 'cheque')
        .in('reference', chequeNumbers)
      if (existing && existing.length > 0) {
        const dupes = existing.map((e) => e.reference).join(', ')
        toast.error(`Cheque number already used: ${dupes}`)
        return
      }

      const today = new Date().toISOString().split('T')[0]
      const effectivePaidAt = isSuperAdmin ? payForm.paid_at : today

      setSaving(true)

      const payload = rows.map((c) => ({
        invoice_id: payForm.invoice_id,
        amount: c.amount,
        paid_at: effectivePaidAt,
        method: 'cheque',
        bank_name: c.bank_name || null,
        reference: c.cheque_number,
        note: payForm.note.trim() || null,
      }))

      const reg = await registerReceivableChequesInHand(supabase, { customerId, chequeRows: rows })
      if (!reg.ok) {
        toast.error(reg.error?.message ?? 'Could not register cheque')
        setSaving(false)
        return
      }

      const { data: inserted, error: err } = await supabase
        .from('invoice_payments')
        .insert(payload)
        .select('id, invoice_id, amount, paid_at, method, bank_name, reference, note, created_at')

      if (err) {
        toast.error(err.message)
        setSaving(false)
        return
      }

      const totalPaid = (inserted ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
      const balanceAfter = (inv ? Number(inv.balance ?? 0) : 0) - totalPaid
      const firstId = (inserted ?? [])[0]?.id
      setReceiptData({
        customerName: customer?.name ?? '',
        settlement: [invoiceLabel],
        paidAt: rows[0]?.cheque_date || payForm.paid_at,
        method: 'cheque',
        receiptNo: firstId ? `REC-${String(firstId).slice(0, 8)}` : 'REC',
        amount: totalPaid,
        balanceAfter,
        cheques: rows,
      })
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await downloadReceiptPdf(`Receipt-${customer?.name || 'Customer'}-${invoiceLabel}.pdf`)
    } else {
      const amount = Number(String(payForm.amount || '').replace(/,/g, ''))
      if (!amount || amount <= 0) {
        toast.error('Enter a valid amount')
        return
      }

      const today = new Date().toISOString().split('T')[0]
      const effectivePaidAt = isSuperAdmin ? payForm.paid_at : today

      setSaving(true)

      const { data: inserted, error: err } = await supabase.from('invoice_payments').insert({
        invoice_id: payForm.invoice_id,
        amount,
        paid_at: effectivePaidAt,
        method: resolvedMethod,
        bank_name: resolvedMethod === 'bank' ? (payForm.bank_name || null) : null,
        reference: payForm.reference.trim() || null,
        note: payForm.note.trim() || null,
      }).select('id, invoice_id, amount, paid_at, method, bank_name, reference, note, created_at')

      if (err) {
        toast.error(err.message)
        setSaving(false)
        return
      }

      const paymentRow = Array.isArray(inserted) ? inserted[0] : null
      const balanceAfter = (inv ? Number(inv.balance ?? 0) : 0) - amount
      setReceiptData({
        customerName: customer?.name ?? '',
        settlement: [invoiceLabel],
        paidAt: payForm.paid_at,
        method: resolvedMethod,
        receiptNo: paymentRow?.id ? `REC-${String(paymentRow.id).slice(0, 8)}` : 'REC',
        amount,
        balanceAfter,
        bankName: resolvedMethod === 'bank' ? (payForm.bank_name || null) : null,
        reference: payForm.reference.trim() || null,
      })
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await downloadReceiptPdf(`Receipt-${customer?.name || 'Customer'}-${invoiceLabel}.pdf`)
    }
    toast.success('Payment saved')
    logAction({ action: 'save_payment', targetType: 'payment' })
    await load()
    setSaving(false)
    setPayOpen(false)
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
      <div className="fixed left-[-99999px] top-0">
        {receiptData ? (
          <div ref={receiptRef} className="bg-white text-black" style={{ width: '80mm' }}>
            <div className="p-3 text-[11px] leading-tight">
              <div className="text-center">
                <div className="text-[16px] font-extrabold">SHAYAN'S KIDS</div>
                <div className="text-[10px] font-semibold">10/3 B, Attidiya Road, Kawdana, Dehiwala</div>
                <CompanyPhoneLines compact />
                <div className="mt-2 text-[12px] font-extrabold tracking-wide">RECEIPT</div>
              </div>

              <div className="mt-2 border-t border-b border-black py-2 space-y-1">
                <div className="flex justify-between"><span className="font-bold">Receipt No</span><span>{receiptData.receiptNo}</span></div>
                <div className="flex justify-between"><span className="font-bold">Date/Time</span><span>{new Date(receiptData.paidAt || Date.now()).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="font-bold">Received From</span><span className="text-right max-w-[45mm]">{receiptData.customerName || '-'}</span></div>
                <div className="flex justify-between"><span className="font-bold">Settlement</span><span className="text-right max-w-[45mm]">{(receiptData.settlement ?? []).join(', ')}</span></div>
              </div>

              <div className="mt-2 space-y-1">
                <div className="flex justify-between"><span className="font-bold">Method</span><span>{String(receiptData.method || '').toUpperCase()}</span></div>
                <div className="flex justify-between"><span className="font-bold">Amount</span><span>{fmt(receiptData.amount)}</span></div>
                <div className="flex justify-between"><span className="font-bold">Balance</span><span>{fmt(receiptData.balanceAfter)}</span></div>
              </div>

              {receiptData.method === 'cheque' ? (
                <div className="mt-2 border border-black">
                  <div className="bg-black text-white px-2 py-1 text-center font-bold">Cheque Details</div>
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-black">
                        <th className="text-left px-2 py-1">Date</th>
                        <th className="text-left px-2 py-1">No</th>
                        <th className="text-right px-2 py-1">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(receiptData.cheques ?? []).map((c, idx) => (
                        <tr key={idx} className="border-b border-black/20">
                          <td className="px-2 py-1">{c.cheque_date}</td>
                          <td className="px-2 py-1">{c.cheque_number}</td>
                          <td className="px-2 py-1 text-right">{fmt(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {(receiptData.reference || receiptData.bankName) ? (
                <div className="mt-2 border-t border-black pt-2 text-[10px]">
                  {receiptData.bankName ? <div><span className="font-bold">Bank</span>: {receiptData.bankName}</div> : null}
                  {receiptData.reference ? <div><span className="font-bold">Reference</span>: {receiptData.reference}</div> : null}
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="border-t border-black pt-6">Prepared</div>
                <div className="border-t border-black pt-6">Approved</div>
                <div className="border-t border-black pt-6">Received</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

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

          <div className="grid grid-cols-4 gap-4 text-right">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Invoiced</div>
              <div className="text-base font-bold text-slate-900 dark:text-white">{fmt(totals.invoiced)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Returns</div>
              <div className="text-base font-bold text-red-600 dark:text-red-400">{totals.returned > 0 ? `−${fmt(totals.returned)}` : '—'}</div>
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
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Returns</th>
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
            ) : invRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-10 text-slate-400 dark:text-emerald-100/60 text-center">
                  <FileText size={24} className="mx-auto mb-2 opacity-40 dark:text-emerald-200/30" />
                  No invoices for this customer.
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
                  <td className={`px-5 py-3.5 text-right font-medium ${inv.returned > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-emerald-100/40'}`}>
                    {inv.returned > 0 ? (
                      <div>
                        <div>−{fmt(inv.returned)}</div>
                        <div className="text-[10px] text-slate-400 dark:text-emerald-100/50">{(returnsByInvoice.get(inv.id)?.items ?? []).map((r) => `RET-${String(r.return_number ?? '').padStart(4, '0')}`).join(', ')}</div>
                      </div>
                    ) : '—'}
                  </td>
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
                  <td className="px-5 py-3.5">
                    {(() => {
                      const d = paymentDetailsByInvoice.get(inv.id)
                      if (!d) return <div className="text-xs text-slate-400 dark:text-emerald-100/60">—</div>
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
                            <div className="text-[10px] font-semibold text-slate-400 dark:text-emerald-100/60">{d.count} payments</div>
                          ) : null}
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setPayHistInvoiceId(inv.id)
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
                      to={`/invoices/${inv.id}`}
                      state={{ from: `/finance/receivables/${customerId}` }}
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
                  <ControlledDateField
                    label="Payment Date"
                    value={payForm.paid_at}
                    onChange={(newDate) => setPayForm((p) => ({ ...p, paid_at: newDate }))}
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
                      onClick={() => setPayForm((p) => ({ ...p, method: 'bank' }))}
                      className={`px-3 py-2 rounded-md text-xs font-bold border transition-colors ${
                        payForm.method === 'bank'
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500/15 dark:text-emerald-50 dark:border-emerald-400/20'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800'
                      }`}
                    >
                      BANK
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
                              bank_code: '',
                              bank_name: '',
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
                        <div key={idx} className="space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
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
                              <ChequeNumberField
                                value={c.cheque_number}
                                onChange={({ cheque_number, bank_code, bank_name }) =>
                                  setCheques((prev) =>
                                    prev.map((x, i) =>
                                      i === idx
                                        ? { ...x, cheque_number, bank_code, bank_name: bank_name || '' }
                                        : x
                                    )
                                  )
                                }
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
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                            <div className="sm:col-span-2">
                              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Bank Code</div>
                              <input
                                readOnly
                                value={c.bank_code || extractBankCodeFromCheque(c.cheque_number)}
                                placeholder="From cheque number"
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-sm text-slate-700 dark:text-slate-300"
                              />
                            </div>

                            <div className="sm:col-span-5">
                              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Bank Name</div>
                              <ChequeBankNameDisplay
                                chequeNumber={c.cheque_number}
                                bankCode={c.bank_code}
                                bankName={c.bank_name || getApprovedBankName(c.bank_code)}
                              />
                            </div>
                          </div>

                          <div className="flex justify-end">
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
                  disabled={saving || (payForm.method === 'cheque' && !isAllChequesValid)}
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
              {paymentsForInvoice.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">No payments found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-auto">
                    <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 dark:bg-emerald-950/35 dark:border-emerald-900/40 dark:text-emerald-100/80">
                      <tr>
                        <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Date</th>
                        <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Method</th>
                        <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Details</th>
                        <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">Amount</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsForInvoice.map((p) => (
                        <tr key={p.id} className="border-b border-slate-50 dark:border-emerald-900/30 align-middle">
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-200 align-middle">
                            {editingPaymentId === p.id ? (
                              <ControlledDateField
                                label=""
                                value={editPayForm.paid_at}
                                onChange={(newDate) => setEditPayForm((x) => ({ ...x, paid_at: newDate }))}
                                className="w-full max-w-[170px]"
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

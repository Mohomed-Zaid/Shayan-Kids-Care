import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { ArrowLeft, Plus, FileText, Trash2, Eye } from 'lucide-react'
import html2pdf from 'html2pdf.js'

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function PayableVendorPage() {
  const { vendorId } = useParams()
  const toast = useToast()

  const receiptRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [purchaseDeletingId, setPurchaseDeletingId] = useState('')
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

  const [viewOpen, setViewOpen] = useState(false)
  const [viewPurchase, setViewPurchase] = useState(null)
  const [viewItems, setViewItems] = useState([])
  const [viewLoading, setViewLoading] = useState(false)

  const [receiptData, setReceiptData] = useState(null)

  const openViewPurchase = async (pur) => {
    setViewOpen(true)
    setViewLoading(true)
    setViewPurchase(pur)
    setViewItems([])
    const { data, error } = await supabase
      .from('purchase_items')
      .select('id, product_id, quantity, cost, mrp, description, total, exp_date, remarks, products(name, code)')
      .eq('purchase_id', pur.id)
    if (!error) setViewItems(data ?? [])
    setViewLoading(false)
  }

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

  const deletePurchase = async (purchaseId) => {
    if (!confirm('Delete this purchase and all its items/payments?')) return
    setPurchaseDeletingId(purchaseId)

    try {
      const { data: items, error: itemsErr } = await supabase
        .from('purchase_items')
        .select('id, product_id, quantity')
        .eq('purchase_id', purchaseId)

      if (itemsErr) throw itemsErr

      const ids = Array.from(new Set((items ?? []).map((x) => x.product_id).filter(Boolean)))
      if (ids.length > 0) {
        const { data: prods, error: prodErr } = await supabase.from('products').select('id, stock').in('id', ids)
        if (prodErr) throw prodErr

        const stockById = new Map((prods ?? []).map((p) => [p.id, Number(p.stock ?? 0)]))
        for (const it of items ?? []) {
          const current = stockById.get(it.product_id) ?? 0
          const next = Math.max(0, current - Number(it.quantity ?? 0))
          stockById.set(it.product_id, next)
        }

        for (const [pid, next] of stockById.entries()) {
          const { error: updErr } = await supabase.from('products').update({ stock: next }).eq('id', pid)
          if (updErr) throw updErr
        }
      }

      const { error: payErr } = await supabase.from('purchase_payments').delete().eq('purchase_id', purchaseId)
      if (payErr) throw payErr

      const { error: delItemsErr } = await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId)
      if (delItemsErr) throw delItemsErr

      const { error: purErr } = await supabase.from('purchases').delete().eq('id', purchaseId)
      if (purErr) throw purErr

      toast.success('Purchase deleted')
      logAction({ action: 'delete_purchase', targetType: 'purchase', targetId: purchaseId })
      await load()
    } catch (e) {
      toast.error(e?.message ?? 'Failed to delete purchase')
    } finally {
      setPurchaseDeletingId('')
    }
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
    const firstPur = purRows.find((x) => (x.balance ?? 0) > 0) ?? purRows[0]
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

  const savePayment = async () => {
    if (!payForm.purchase_id) {
      toast.error('Select a purchase')
      return
    }

    const selectedPurchase = purRows.find((p) => p.id === payForm.purchase_id) ?? null
    const purchaseLabel = selectedPurchase?.ref_no || (selectedPurchase ? `PUR-${String(selectedPurchase.id).slice(0, 8)}` : '')
    const vendorName = vendor?.name ?? ''

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

      const { data: inserted, error: err } = await supabase.from('purchase_payments').insert(payload).select('id, amount, paid_at, method, reference, created_at')
      if (err) {
        toast.error(err.message)
        setSaving(false)
        return
      }

      toast.success('Payment saved')
      logAction({ action: 'save_purchase_payment', targetType: 'purchase_payment' })

      const totalPaid = (inserted ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
      const balanceAfter = selectedPurchase ? Number(selectedPurchase.balance ?? 0) - totalPaid : 0
      const firstId = (inserted ?? [])[0]?.id
      setReceiptData({
        vendorName,
        purchaseLabel,
        paidAt: rows[0]?.cheque_date || payForm.paid_at,
        method: 'cheque',
        paymentNo: firstId ? `PAY-${String(firstId).slice(0, 8)}` : 'PAY',
        amount: totalPaid,
        balanceAfter,
        cheques: rows,
      })
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await downloadReceiptPdf(`Payment-Receipt-${purchaseLabel || 'Purchase'}.pdf`)

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
    const { data: inserted, error: err } = await supabase.from('purchase_payments').insert({
      purchase_id: payForm.purchase_id,
      amount,
      paid_at: payForm.paid_at,
      method: payForm.method,
      bank_name: payForm.method === 'bank' ? 'Bank' : null,
      reference: payForm.reference.trim() || null,
      note: payForm.note.trim() || null,
    }).select('id, amount, paid_at, method, bank_name, reference, created_at')

    if (err) {
      toast.error(err.message)
      setSaving(false)
      return
    }

    toast.success('Payment saved')
    logAction({ action: 'save_purchase_payment', targetType: 'purchase_payment' })

    const paymentRow = Array.isArray(inserted) ? inserted[0] : null
    const balanceAfter = selectedPurchase ? Number(selectedPurchase.balance ?? 0) - amount : 0
    setReceiptData({
      vendorName,
      purchaseLabel,
      paidAt: payForm.paid_at,
      method: payForm.method,
      paymentNo: paymentRow?.id ? `PAY-${String(paymentRow.id).slice(0, 8)}` : 'PAY',
      amount,
      balanceAfter,
      bankName: payForm.method === 'bank' ? 'Bank' : null,
      reference: payForm.reference.trim() || null,
    })
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await downloadReceiptPdf(`Payment-Receipt-${purchaseLabel || 'Purchase'}.pdf`)

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
      <div className="fixed left-[-99999px] top-0">
        {receiptData ? (
          <div ref={receiptRef} className="bg-white text-black" style={{ width: '80mm' }}>
            <div className="p-3 text-[11px] leading-tight">
              <div className="text-center">
                <div className="text-[16px] font-extrabold">SHAYAN KIDS CARE</div>
                <div className="text-[10px] font-semibold">10/3 B, Attidiya Road, Kawdana, Dehiwala</div>
                <div className="text-[10px] font-semibold">+94 75 384 1599</div>
                <div className="mt-2 text-[12px] font-extrabold tracking-wide">PAYMENT RECEIPT</div>
              </div>

              <div className="mt-2 border-t border-b border-black py-2 space-y-1">
                <div className="flex justify-between"><span className="font-bold">Payment No</span><span>{receiptData.paymentNo}</span></div>
                <div className="flex justify-between"><span className="font-bold">Date/Time</span><span>{new Date(receiptData.paidAt || Date.now()).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="font-bold">Paid For</span><span className="text-right max-w-[45mm]">{receiptData.vendorName || '-'}</span></div>
                <div className="flex justify-between"><span className="font-bold">Settlement</span><span className="text-right max-w-[45mm]">{receiptData.purchaseLabel || '-'}</span></div>
              </div>

              <div className="mt-2 space-y-1">
                <div className="flex justify-between"><span className="font-bold">Paid By</span><span>{String(receiptData.method || '').toUpperCase()}</span></div>
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
                    <button
                      type="button"
                      onClick={() => openViewPurchase(pur)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Eye size={14} />
                      View Purchase
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePurchase(pur.id)}
                      disabled={purchaseDeletingId === pur.id}
                      className="ml-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 size={14} />
                      {purchaseDeletingId === pur.id ? 'Deleting...' : 'Delete'}
                    </button>
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

      {viewOpen && viewPurchase ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-3xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">Purchase Details</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {viewPurchase.ref_no ? `Ref: ${viewPurchase.ref_no}` : `ID: ${viewPurchase.id}`} &middot; {new Date(viewPurchase.date ?? viewPurchase.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => setViewOpen(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Purchase Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Vendor</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{vendor?.name ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Payment Type</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{viewPurchase.payment_type === 'cash' ? 'Cash' : 'Credit'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Total Amount</div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmt(viewPurchase.total_amount)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Balance</div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmt(viewPurchase.balance ?? viewPurchase.total_amount - (viewPurchase.paid ?? 0))}</div>
                </div>
              </div>

              {/* Items Table */}
              {viewLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wide">#</th>
                        <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Product</th>
                        <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Qty</th>
                        <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Cost</th>
                        <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wide">MRP</th>
                        <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Profit %</th>
                        <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Total</th>
                        <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wide">Exp Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">No items</td>
                        </tr>
                      ) : (
                        viewItems.map((it, idx) => (
                          <tr key={it.id} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">
                              {it.products?.code ? `${it.products.code} - ` : ''}{it.products?.name ?? '-'}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{it.quantity}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{fmt(it.cost)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{it.mrp ? fmt(it.mrp) : '-'}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-300">{it.mrp && it.cost && Number(it.cost) > 0 ? `${((Number(it.mrp) - Number(it.cost)) / Number(it.cost) * 100).toFixed(1)}%` : '-'}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-slate-900 dark:text-white">{fmt(it.total)}</td>
                            <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{it.exp_date ?? '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Total */}
              <div className="flex items-center justify-end">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-6 py-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-8">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Amount</span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white">{fmt(viewPurchase.total_amount)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

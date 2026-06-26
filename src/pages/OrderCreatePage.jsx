import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Plus, Trash2, ArrowLeft, AlertTriangle, X } from 'lucide-react'

function emptyLine() {
  return { product_id: '', quantity: 1, price: 0, discount: 0 }
}

export default function OrderCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [reps, setReps] = useState([])

  const [customerId, setCustomerId] = useState('')
  const [repId, setRepId] = useState('')
  const [paymentType, setPaymentType] = useState('credit')
  const [vatEnabled, setVatEnabled] = useState(true)
  const [lines, setLines] = useState([emptyLine()])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Customer summary state
  const [customerSummary, setCustomerSummary] = useState(null)
  const [loadingCustomerSummary, setLoadingCustomerSummary] = useState(false)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      const [custRes, prodRes, repsRes] = await Promise.all([
        supabase.from('customers').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('employees').select('*').order('created_at', { ascending: false }),
      ])

      if (!mounted) return

      setCustomers(custRes.data ?? [])
      setProducts(prodRes.data ?? [])
      setReps(repsRes.data ?? [])
      setLoading(false)

      if (!custRes.error && !prodRes.error && !repsRes.error) return
      setError(custRes.error?.message || prodRes.error?.message || repsRes.error?.message || 'Failed to load')
    }

    load().catch((e) => {
      console.error(e)
      setError('Failed to load')
      setLoading(false)
    })

    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!customerId) {
      setCustomerSummary(null)
      return
    }

    const loadCustomerSummary = async () => {
      setLoadingCustomerSummary(true)
      try {
        const customer = customers.find(c => c.id === customerId)
        
        const [invoicesRes, paymentsRes, returnsRes, chequesRes] = await Promise.all([
          supabase.from('invoices').select('id, invoice_number, total_amount, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }),
          supabase.from('invoice_payments').select('invoice_id, amount'),
          supabase.from('returns').select('invoice_id, total_amount').eq('customer_id', customerId),
          supabase.from('customer_cheques').select('amount, status').eq('customer_id', customerId),
        ])

        // Calculate outstanding due
        const invoices = invoicesRes.data ?? []
        const payments = paymentsRes.data ?? []
        const returns = returnsRes.data ?? []
        const cheques = chequesRes.data ?? []

        let totalOutstanding = 0

        const paymentSumByInvoice = new Map()
        for (const p of payments) {
          paymentSumByInvoice.set(p.invoice_id, (paymentSumByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0))
        }

        const returnsSumByInvoice = new Map()
        for (const r of returns) {
          returnsSumByInvoice.set(r.invoice_id, (returnsSumByInvoice.get(r.invoice_id) ?? 0) + Number(r.total_amount ?? 0))
        }

        for (const inv of invoices) {
          const paid = paymentSumByInvoice.get(inv.id) ?? 0
          const returned = returnsSumByInvoice.get(inv.id) ?? 0
          const balance = Number(inv.total_amount ?? 0) - paid - returned
          if (balance > 0) {
            totalOutstanding += balance
          }
        }

        // Calculate cheques
        const chequeInHand = cheques.filter(c => c.status === 'in_hand').reduce((sum, c) => sum + Number(c.amount ?? 0), 0)
        const returnCheque = cheques.filter(c => c.status === 'returned').reduce((sum, c) => sum + Number(c.amount ?? 0), 0)

        // Last invoice
        const lastInvoice = invoices[0] || null

        setCustomerSummary({
          customer,
          outstandingDue: totalOutstanding,
          chequeInHand,
          returnCheque,
          lastInvoice
        })
      } catch (e) {
        console.error('Failed to load customer summary:', e)
      } finally {
        setLoadingCustomerSummary(false)
      }
    }

    loadCustomerSummary()
  }, [customerId, customers])

  const linesWithTotals = useMemo(() => {
    return lines.map((l) => {
      const qty = Number(l.quantity || 0)
      const price = Number(l.price || 0)
      const discPct = Number(l.discount || 0)
      const discAmt = qty * price * (discPct / 100)
      return { ...l, total: qty * price - discAmt }
    })
  }, [lines])

  const grandTotal = useMemo(() => {
    return linesWithTotals.reduce((sum, l) => sum + (l.total ?? 0), 0)
  }, [linesWithTotals])

  const VAT_RATE = 0.18
  const vatAmount = useMemo(() => {
    return vatEnabled ? grandTotal * VAT_RATE : 0
  }, [grandTotal, vatEnabled])

  const totalWithVat = useMemo(() => {
    return grandTotal + vatAmount
  }, [grandTotal, vatAmount])

  const productById = useMemo(() => {
    const map = new Map()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  const updateLine = (idx, patch) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const onSelectProduct = (idx, product_id) => {
    const p = productById.get(product_id)
    updateLine(idx, { product_id, price: p ? Number(p.price ?? 0) : 0 })
  }

  const addLine = () => setLines((prev) => [...prev, emptyLine()])

  const removeLine = (idx) => {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const onSave = async () => {
    setError(null)

    const cleanedLines = linesWithTotals
      .filter((l) => l.product_id)
      .map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity || 0),
        price: Number(l.price || 0),
        discount: Number(l.discount || 0),
        total: Number(l.total || 0),
      }))
      .filter((l) => l.quantity > 0)

    if (!customerId) {
      setError('Select a customer')
      return
    }

    if (cleanedLines.length === 0) {
      setError('Add at least one product line')
      return
    }

    // Credit limit validation
    const creditLimit = customerSummary?.customer?.credit_limit ?? 20000
    const isOverLimit = customerSummary && customerSummary.outstandingDue > creditLimit

    if (isOverLimit) {
      // Log blocked order
      logAction({
        action: 'block_order_credit_limit',
        targetType: 'customer',
        targetId: customerId,
        targetLabel: customerSummary?.customer?.name,
        metadata: {
          customer_name: customerSummary?.customer?.name,
          current_due: customerSummary.outstandingDue,
          credit_limit: creditLimit,
          date: new Date().toISOString()
        }
      })

      setError('Order cannot be created. Customer outstanding balance is Rs. ' + 
        customerSummary.outstandingDue.toLocaleString(undefined, { minimumFractionDigits: 2 }) + 
        '. Please collect payment before creating a new order.')
      return
    }

    setSaving(true)
    try {
      const { data: order, error: ordErr } = await supabase
        .from('orders')
        .insert({ customer_id: customerId, rep_id: repId || null, total: totalWithVat, vat_rate: vatEnabled ? VAT_RATE : 0, vat_amount: vatAmount, status: 'pending', payment_type: paymentType })
        .select('id, order_number')
        .single()

      if (ordErr) throw ordErr

      const itemsPayload = cleanedLines.map((l) => ({
        order_id: order.id,
        product_id: l.product_id,
        quantity: l.quantity,
        price: l.price,
        discount: l.discount,
        total: l.total,
      }))

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsPayload)
      if (itemsErr) throw itemsErr

      toast.success('Order created successfully')
      logAction({ action: 'create_order', targetType: 'order', targetId: order.id, targetLabel: `ORD-${String(order.order_number ?? '').padStart(4, '0')}` })
      navigate(`/orders/${order.id}`, { replace: true })
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'Failed to save order')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Customer</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Rep</label>
              <select
                value={repId}
                onChange={(e) => setRepId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              >
                <option value="">Select rep...</option>
                {reps.filter((r) => r.is_rep).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Payment Type</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              >
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        ) : null}
      </div>

      {/* Customer Account Summary */}
      {customerId && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          {loadingCustomerSummary ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900 dark:border-white"></div>
            </div>
          ) : customerSummary ? (
            <div className="space-y-4">
              {/* Customer Details */}
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {customerSummary.customer?.code && `${customerSummary.customer.code} — `}
                  {customerSummary.customer?.name}
                </div>
                {customerSummary.customer?.address && (
                  <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    Address: {customerSummary.customer.address}
                  </div>
                )}
                {customerSummary.customer?.phone && (
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Phone: {customerSummary.customer.phone}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-slate-200 dark:border-slate-700"></div>

              {/* Account Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Outstanding</span>
                    <span className="text-lg font-bold text-red-600 dark:text-red-400">
                      Rs. {customerSummary.outstandingDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Credit Limit</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      Rs. {Number(customerSummary.customer?.credit_limit ?? 20000).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cheque In Hand</span>
                    <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                      Rs. {customerSummary.chequeInHand.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Return Cheque</span>
                    <span className="text-lg font-bold text-red-600 dark:text-red-400">
                      Rs. {customerSummary.returnCheque.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {customerSummary.lastInvoice && (
                    <div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 block mb-1">Last Bill</span>
                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        INV-{String(customerSummary.lastInvoice.invoice_number || '').padStart(4, '0')}
                        <span className="ml-2 text-slate-500">
                          ({new Date(customerSummary.lastInvoice.created_at).toLocaleDateString()})
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        Rs. {Number(customerSummary.lastInvoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Credit Status */}
              <div className={`p-3 rounded-lg border ${
                customerSummary.outstandingDue <= (customerSummary.customer?.credit_limit ?? 20000)
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700'
                  : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${
                    customerSummary.outstandingDue <= (customerSummary.customer?.credit_limit ?? 20000)
                      ? 'bg-emerald-500'
                      : 'bg-red-500'
                  }`}></span>
                  <span className={`text-sm font-semibold ${
                    customerSummary.outstandingDue <= (customerSummary.customer?.credit_limit ?? 20000)
                      ? 'text-emerald-800 dark:text-emerald-200'
                      : 'text-red-800 dark:text-red-200'
                  }`}>
                    {customerSummary.outstandingDue <= (customerSummary.customer?.credit_limit ?? 20000)
                      ? 'Customer credit available. Order can be created.'
                      : 'Credit limit exceeded!'}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">Items</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Add products and quantities (no stock deduction)</div>
          </div>
          <button onClick={addLine} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Plus size={16} />
            Add Line
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Product</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Qty</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Price</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Disc %</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Total</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {linesWithTotals.map((l, idx) => (
              <tr key={idx} className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50/30 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-5 py-3">
                  <select
                    value={l.product_id}
                    onChange={(e) => onSelectProduct(idx, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                  >
                    <option value="">Select product...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code}) — Stock: {p.stock ?? 0}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3">
                  <input
                    type="number"
                    value={l.quantity}
                    onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLine() } }}
                    className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                    min={1}
                  />
                </td>
                <td className="px-5 py-3">
                  <input
                    type="number"
                    step="0.01"
                    value={l.price}
                    onChange={(e) => updateLine(idx, { price: e.target.value })}
                    className="w-32 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                  />
                </td>
                <td className="px-5 py-3">
                  <input
                    type="number"
                    step="0.01"
                    value={l.discount}
                    onChange={(e) => updateLine(idx, { discount: e.target.value })}
                    className="w-20 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                    min={0}
                    max={100}
                  />
                  <span className="text-xs text-slate-400 ml-1">%</span>
                </td>
                <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">Rs. {Number(l.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-30 transition-colors"
                    title="Remove line"
                  >
                    <X size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg px-5 py-3 border border-slate-200/60 dark:border-slate-700 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">Subtotal</span>
            <span className="text-sm text-slate-700 dark:text-slate-300">Rs. {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between items-center">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={vatEnabled}
                onChange={(e) => setVatEnabled(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-slate-900/20"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">VAT (18%)</span>
            </label>
            <span className="text-sm text-slate-700 dark:text-slate-300">Rs. {vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-1 flex justify-between items-center">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">Total</span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">Rs. {totalWithVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/orders')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={16} />
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || (customerSummary && customerSummary.outstandingDue > (customerSummary.customer?.credit_limit ?? 20000))}
          className="px-5 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
        >
          {saving ? 'Saving...' : 'Create Order'}
        </button>
        </div>
      </div>
    </div>
  )
}

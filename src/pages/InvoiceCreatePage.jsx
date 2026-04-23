import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { Plus, Trash2, ArrowLeft, AlertTriangle, X } from 'lucide-react'

function emptyLine() {
  return { product_id: '', quantity: 1, price: 0 }
}

export default function InvoiceCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [reps, setReps] = useState([])

  const [customerId, setCustomerId] = useState('')
  const [repId, setRepId] = useState('')
  const [paymentType, setPaymentType] = useState('credit')
  const [lines, setLines] = useState([emptyLine()])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

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

    return () => {
      mounted = false
    }
  }, [])

  const linesWithTotals = useMemo(() => {
    return lines.map((l) => {
      const qty = Number(l.quantity || 0)
      const price = Number(l.price || 0)
      return { ...l, total: qty * price }
    })
  }, [lines])

  const grandTotal = useMemo(() => {
    return linesWithTotals.reduce((sum, l) => sum + (l.total ?? 0), 0)
  }, [linesWithTotals])

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

  const onSaveInvoice = async () => {
    setError(null)

    const cleanedLines = linesWithTotals
      .filter((l) => l.product_id)
      .map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity || 0),
        price: Number(l.price || 0),
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

    // Check stock availability
    const stockErrors = []
    for (const l of cleanedLines) {
      const product = productById.get(l.product_id)
      const available = product?.stock ?? 0
      if (l.quantity > available) {
        stockErrors.push(`${product?.name ?? 'Product'}: requested ${l.quantity}, only ${available} in stock`)
      }
    }
    if (stockErrors.length > 0) {
      setError('Insufficient stock: ' + stockErrors.join('; '))
      return
    }

    setSaving(true)
    try {
      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({ customer_id: customerId, rep_id: repId || null, total_amount: grandTotal, payment_type: paymentType })
        .select('id, invoice_number')
        .single()

      if (invErr) throw invErr

      const itemsPayload = cleanedLines.map((l) => ({
        invoice_id: invoice.id,
        product_id: l.product_id,
        quantity: l.quantity,
        price: l.price,
        total: l.total,
      }))

      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsPayload)
      if (itemsErr) throw itemsErr

      // Decrease stock for each product
      const stockUpdates = cleanedLines.map((l) => {
        const product = productById.get(l.product_id)
        const currentStock = product?.stock ?? 0
        const newStock = Math.max(0, currentStock - l.quantity)
        return supabase.from('products').update({ stock: newStock }).eq('id', l.product_id)
      })
      await Promise.all(stockUpdates)

      toast.success('Invoice created successfully')
      navigate(`/invoices/${invoice.id}`, { replace: true })
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'Failed to save invoice')
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
      <div className="bg-white border border-slate-200/60 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Customer</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Rep</label>
              <select
                value={repId}
                onChange={(e) => setRepId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              >
                <option value="">Select rep...</option>
                {reps.filter((r) => r.is_rep).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Payment Type</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              >
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>

          <div className="flex items-end justify-end">
            <div className="text-right bg-slate-50 rounded-lg px-5 py-3 border border-slate-200/60">
              <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">Grand Total</div>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
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

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 flex items-center justify-between border-b border-slate-100">
          <div>
            <div className="text-sm font-semibold text-slate-900">Items</div>
            <div className="text-xs text-slate-400 mt-0.5">Add products and quantities</div>
          </div>
          <button onClick={addLine} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
            <Plus size={16} />
            Add Line
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Product</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Qty</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Price</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Total</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {linesWithTotals.map((l, idx) => (
              <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                <td className="px-5 py-3">
                  <select
                    value={l.product_id}
                    onChange={(e) => onSelectProduct(idx, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
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
                    className="w-24 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                    min={1}
                  />
                </td>
                <td className="px-5 py-3">
                  <input
                    type="number"
                    step="0.01"
                    value={l.price}
                    onChange={(e) => updateLine(idx, { price: e.target.value })}
                    className="w-32 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                  />
                </td>
                <td className="px-5 py-3 font-medium text-slate-900">{Number(l.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors"
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

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => navigate('/invoices')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft size={16} />
          Cancel
        </button>
        <button
          onClick={onSaveInvoice}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
        >
          {saving ? 'Saving...' : 'Save Invoice'}
        </button>
      </div>
    </div>
  )
}

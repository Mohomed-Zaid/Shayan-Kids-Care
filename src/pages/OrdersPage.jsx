import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { Plus, Eye, ShoppingCart, CheckCircle, XCircle, ArrowRightLeft } from 'lucide-react'

const statusConfig = {
  pending: { label: 'Pending', bg: 'bg-slate-100', text: 'text-slate-700' },
  confirmed: { label: 'Confirmed', bg: 'bg-blue-100', text: 'text-blue-700' },
  converted: { label: 'Converted', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100', text: 'text-red-700' },
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, total, status, created_at, customers(name), employees(name)')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Failed to load orders')
      setOrders([])
    } else {
      setOrders(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => setLoading(false))
  }, [])

  const onConfirm = async (order) => {
    const { error } = await supabase.from('orders').update({ status: 'confirmed' }).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    toast.success('Order confirmed')
    await load()
  }

  const onCancel = async (order) => {
    if (!confirm('Cancel this order?')) return
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    toast.success('Order cancelled')
    await load()
  }

  const onConvert = async (order) => {
    if (order.status !== 'confirmed') {
      toast.error('Only confirmed orders can be converted')
      return
    }

    // Fetch order items
    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('product_id, quantity, price, total')
      .eq('order_id', order.id)

    if (itemsErr || !items || items.length === 0) {
      toast.error('No items found in this order')
      return
    }

    // Check stock availability
    const { data: products } = await supabase.from('products').select('id, name, stock')
    const productMap = new Map((products ?? []).map(p => [p.id, p]))

    const stockErrors = []
    for (const it of items) {
      const p = productMap.get(it.product_id)
      if (!p || it.quantity > (p.stock ?? 0)) {
        stockErrors.push(`${p?.name ?? 'Product'}: requested ${it.quantity}, only ${p?.stock ?? 0} in stock`)
      }
    }

    if (stockErrors.length > 0) {
      toast.error('Insufficient stock: ' + stockErrors.join('; '))
      return
    }

    // Create invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({ customer_id: order.customer_id, rep_id: order.rep_id || null, total_amount: order.total })
      .select('id')
      .single()

    if (invErr) { toast.error(invErr.message); return }

    // Copy items to invoice_items
    const invoiceItems = items.map(it => ({
      invoice_id: invoice.id,
      product_id: it.product_id,
      quantity: it.quantity,
      price: it.price,
      total: it.total,
    }))

    const { error: iiErr } = await supabase.from('invoice_items').insert(invoiceItems)
    if (iiErr) { toast.error(iiErr.message); return }

    // Deduct stock
    const stockUpdates = items.map(it => {
      const p = productMap.get(it.product_id)
      const newStock = Math.max(0, (p?.stock ?? 0) - it.quantity)
      return supabase.from('products').update({ stock: newStock }).eq('id', it.product_id)
    })
    await Promise.all(stockUpdates)

    // Mark order as converted
    const { error: updErr } = await supabase.from('orders').update({ status: 'converted' }).eq('id', order.id)
    if (updErr) { toast.error(updErr.message); return }

    toast.success('Order converted to invoice successfully')
    navigate(`/invoices/${invoice.id}`)
  }

  const fmt = (val) => `Rs. ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">Manage your sales orders.</div>
        <Link to="/orders/new" className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
          <Plus size={16} />
          Create Order
        </Link>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Order #</th>
              <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
              <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Rep</th>
              <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Total</th>
              <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Status</th>
              <th className="text-left font-semibold text-slate-600 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-slate-400 text-center">
                  <ShoppingCart size={32} className="mx-auto text-slate-300 mb-2" />
                  No orders yet. Create your first order!
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const st = statusConfig[o.status] ?? statusConfig.pending
                return (
                  <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">ORD-{String(o.order_number ?? '').padStart(4, '0')}</td>
                    <td className="px-5 py-3.5 text-slate-600">{o.customers?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 text-slate-600">{o.employees?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{fmt(o.total ?? 0)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link to={`/orders/${o.id}`} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors" title="View">
                          <Eye size={15} />
                        </Link>
                        {o.status === 'pending' && (
                          <button onClick={() => onConfirm(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Confirm">
                            <CheckCircle size={15} />
                          </button>
                        )}
                        {o.status === 'confirmed' && (
                          <button onClick={() => onConvert(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Convert to Invoice">
                            <ArrowRightLeft size={15} />
                          </button>
                        )}
                        {(o.status === 'pending' || o.status === 'confirmed') && (
                          <button onClick={() => onCancel(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Cancel">
                            <XCircle size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

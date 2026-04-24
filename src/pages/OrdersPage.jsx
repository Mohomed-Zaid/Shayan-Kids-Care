import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { Plus, Eye, ShoppingCart, CheckCircle, XCircle, ArrowRightLeft, Trash2, FileText, Filter, Pencil } from 'lucide-react'

const statusConfig = {
  pending: { label: 'Pending', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300' },
  confirmed: { label: 'Confirmed', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  invoiced: { label: 'Invoiced', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  converted: { label: 'Invoiced', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
}

const statusTabs = [
  { key: 'all', label: 'All Orders' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'invoices', label: 'All Invoices' },
]

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const navigate = useNavigate()
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    const [ordRes, invRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, total, status, created_at, customer_id, rep_id, payment_type, invoice_id, customers(name), employees(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, created_at, customers(name), employees(name)')
        .order('created_at', { ascending: false }),
    ])

    if (ordRes.error) {
      toast.error('Failed to load orders')
      setOrders([])
    } else {
      setOrders(ordRes.data ?? [])
    }

    if (invRes.error) {
      toast.error('Failed to load invoices')
      setInvoices([])
    } else {
      setInvoices(invRes.data ?? [])
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

  const onDelete = async (order) => {
    if (!confirm('Delete this order and all its items?')) return
    await supabase.from('order_items').delete().eq('order_id', order.id)
    const { error: err } = await supabase.from('orders').delete().eq('id', order.id)
    if (err) { toast.error(err.message); return }
    toast.success('Order deleted')
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
      .insert({ customer_id: order.customer_id, rep_id: order.rep_id || null, total_amount: order.total, payment_type: order.payment_type ?? 'credit' })
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

    // Mark order as invoiced and link to invoice
    const { error: updErr } = await supabase.from('orders').update({ status: 'invoiced', invoice_id: invoice.id }).eq('id', order.id)
    if (updErr) { toast.error(updErr.message); return }

    toast.success('Order invoiced successfully')
    await load()
  }

  const onDeleteInvoice = async (inv) => {
    if (!confirm('Delete this invoice and all its items?')) return
    // Clear invoice_id on any orders that reference this invoice
    await supabase.from('orders').update({ invoice_id: null }).eq('invoice_id', inv.id)
    await supabase.from('invoice_items').delete().eq('invoice_id', inv.id)
    const { error: err } = await supabase.from('invoices').delete().eq('id', inv.id)
    if (err) { toast.error(err.message); return }
    toast.success('Invoice deleted')
    await load()
  }

  const fmt = (val) => `Rs. ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

  const filteredOrders = activeTab === 'all' ? orders : orders.filter((o) => {
    if (activeTab === 'invoiced') return o.status === 'invoiced' || o.status === 'converted'
    return o.status === activeTab
  })
  const showInvoices = activeTab === 'invoices'

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
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Orders & Invoices</h2>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/invoices/new" className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <FileText size={16} />
            Direct Invoice
          </Link>
          <Link to="/orders/new" className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
            <Plus size={16} />
            Create Order
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        {showInvoices ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Invoice #</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Rep</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Total</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center">
                    <FileText size={32} className="mx-auto text-slate-300 dark:text-emerald-200/30 mb-2" />
                    No invoices yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">INV-{String(inv.invoice_number ?? '').padStart(4, '0')}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{inv.customers?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{inv.employees?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">{fmt(inv.total_amount ?? 0)}</td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link to={`/invoices/${inv.id}`} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-emerald-50 dark:hover:bg-emerald-500/10 transition-colors" title="View">
                          <Eye size={15} />
                        </Link>
                        <button onClick={() => onDeleteInvoice(inv)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Order #</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Rep</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Total</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center">
                    <ShoppingCart size={32} className="mx-auto text-slate-300 dark:text-emerald-200/30 mb-2" />
                    {activeTab === 'all' ? 'No orders yet. Create your first order!' : `No ${activeTab} orders.`}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const st = statusConfig[o.status] ?? statusConfig.pending
                  return (
                    <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                      <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">ORD-{String(o.order_number ?? '').padStart(4, '0')}</td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{o.customers?.name ?? '-'}</td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{o.employees?.name ?? '-'}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">{fmt(o.total ?? 0)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Link to={`/orders/${o.id}`} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors" title="View">
                            <Eye size={15} />
                          </Link>
                          {(o.status === 'pending' || o.status === 'confirmed') && (
                            <Link to={`/orders/${o.id}/edit`} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                              <Pencil size={15} />
                            </Link>
                          )}
                          {o.status === 'pending' && (
                            <button onClick={() => onConfirm(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Confirm">
                              <CheckCircle size={15} />
                            </button>
                          )}
                          {o.status === 'confirmed' && (
                            <button onClick={() => onConvert(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors" title="Convert to Invoice">
                              <ArrowRightLeft size={15} />
                            </button>
                          )}
                          {((o.status === 'invoiced' || o.status === 'converted') && o.invoice_id) && (
                            <Link to={`/invoices/${o.invoice_id}`} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors" title="View Invoice">
                              <FileText size={15} />
                            </Link>
                          )}
                          {(o.status === 'pending' || o.status === 'confirmed') && (
                            <button onClick={() => onCancel(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Cancel">
                              <XCircle size={15} />
                            </button>
                          )}
                          <button onClick={() => onDelete(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

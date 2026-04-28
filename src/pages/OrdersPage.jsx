import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Plus, Eye, ShoppingCart, CheckCircle, XCircle, ArrowRightLeft, Trash2, FileText, Filter, Pencil, Search, ArrowUpDown, Truck } from 'lucide-react'

const statusConfig = {
  pending: { label: 'Pending', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300' },
  confirmed: { label: 'Confirmed', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  invoiced: { label: 'Invoiced', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  converted: { label: 'Invoiced', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
  delivered: { label: 'Delivered', bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
}

const statusTabs = [
  { key: 'all', label: 'All Orders' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'invoices', label: 'All Invoices' },
]

export default function OrdersPage() {
  const VAT_RATE = 0.18

  const [orders, setOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [invSearch, setInvSearch] = useState('')
  const [invPayFilter, setInvPayFilter] = useState('all')
  const [invDateFrom, setInvDateFrom] = useState('')
  const [invDateTo, setInvDateTo] = useState('')
  const [invSort, setInvSort] = useState('newest')
  const navigate = useNavigate()
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    const [ordRes, invRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, total, status, created_at, customer_id, rep_id, payment_type, invoice_id, delivered_at, customers(name), employees(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, created_at, payment_type, customers(name), employees(name)')
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
    logAction({ action: 'confirm_order', targetType: 'order', targetId: order.id, targetLabel: `ORD-${String(order.order_number ?? '').padStart(4, '0')}` })
    await load()
  }

  const onCancel = async (order) => {
    if (!confirm('Cancel this order?')) return
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    toast.success('Order cancelled')
    logAction({ action: 'cancel_order', targetType: 'order', targetId: order.id, targetLabel: `ORD-${String(order.order_number ?? '').padStart(4, '0')}` })
    await load()
  }

  const onDelete = async (order) => {
    if (!confirm('Delete this order and all its items?')) return
    await supabase.from('order_items').delete().eq('order_id', order.id)
    const { error: err } = await supabase.from('orders').delete().eq('id', order.id)
    if (err) { toast.error(err.message); return }
    toast.success('Order deleted')
    logAction({ action: 'delete_order', targetType: 'order', targetId: order.id, targetLabel: `ORD-${String(order.order_number ?? '').padStart(4, '0')}` })
    await load()
  }

  const onDeliver = async (order) => {
    if (!confirm('Mark this order as delivered?')) return
    const now = new Date().toISOString()
    const { error } = await supabase.from('orders').update({ status: 'delivered', delivered_at: now }).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    toast.success('Order marked as delivered')
    logAction({ action: 'deliver_order', targetType: 'order', targetId: order.id, targetLabel: `ORD-${String(order.order_number ?? '').padStart(4, '0')}` })
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

    // Create invoice — carry VAT from order
    const orderVatRate = Number(order.vat_rate ?? 0)
    const orderVatAmount = Number(order.vat_amount ?? 0)
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        customer_id: order.customer_id,
        rep_id: order.rep_id || null,
        total_amount: order.total,
        vat_rate: orderVatRate,
        vat_amount: orderVatAmount,
        payment_type: order.payment_type ?? 'credit',
      })
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
    logAction({ action: 'invoice_order', targetType: 'order', targetId: order.id, targetLabel: `ORD-${String(order.order_number ?? '').padStart(4, '0')}`, details: `Invoice INV-${String(invoice.id ?? '').padStart(4, '0')}` })
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
    logAction({ action: 'delete_invoice', targetType: 'invoice', targetId: inv.id, targetLabel: `INV-${String(inv.id ?? '').padStart(4, '0')}` })
    await load()
  }

  const fmt = (val) => `Rs. ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

  const filteredOrders = activeTab === 'all' ? orders.filter((o) => o.status !== 'delivered') : orders.filter((o) => {
    if (activeTab === 'invoiced') return o.status === 'invoiced' || o.status === 'converted'
    return o.status === activeTab
  })
  const showInvoices = activeTab === 'invoices'

  const filteredInvoices = useMemo(() => {
    let list = [...invoices]
    if (invSearch.trim()) {
      const q = invSearch.toLowerCase()
      list = list.filter((r) =>
        (r.customers?.name ?? '').toLowerCase().includes(q) ||
        String(r.invoice_number ?? '').includes(q) ||
        String(r.total_amount ?? '').includes(q)
      )
    }
    if (invPayFilter !== 'all') {
      list = list.filter((r) => (r.payment_type ?? 'credit') === invPayFilter)
    }
    if (invDateFrom) {
      list = list.filter((r) => new Date(r.created_at) >= new Date(invDateFrom))
    }
    if (invDateTo) {
      const to = new Date(invDateTo); to.setHours(23, 59, 59, 999)
      list = list.filter((r) => new Date(r.created_at) <= to)
    }
    list.sort((a, b) => {
      const da = new Date(a.created_at), db = new Date(b.created_at)
      return invSort === 'newest' ? db - da : da - db
    })
    return list
  }, [invoices, invSearch, invPayFilter, invDateFrom, invDateTo, invSort])

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
          <Link to="/orders/new" className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
            <Plus size={16} />
            Create Order
          </Link>
        </div>
      </div>

      {showInvoices && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={invSearch}
              onChange={(e) => setInvSearch(e.target.value)}
              placeholder="Search invoices..."
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <select
              value={invPayFilter}
              onChange={(e) => setInvPayFilter(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            >
              <option value="all" className="text-slate-900">All Payment</option>
              <option value="cash" className="text-slate-900">Cash</option>
              <option value="credit" className="text-slate-900">Credit</option>
            </select>
            <input
              type="date"
              value={invDateFrom}
              onChange={(e) => setInvDateFrom(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={invDateTo}
              onChange={(e) => setInvDateTo(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            />
            <button
              onClick={() => setInvSort((s) => s === 'newest' ? 'oldest' : 'newest')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title={invSort === 'newest' ? 'Newest first' : 'Oldest first'}
            >
              <ArrowUpDown size={14} />
              {invSort === 'newest' ? 'Newest' : 'Oldest'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        {showInvoices ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Invoice #</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Rep</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Total</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Payment</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center">
                    <FileText size={32} className="mx-auto text-slate-300 dark:text-emerald-200/30 mb-2" />
                    {invoices.length === 0 ? 'No invoices yet.' : 'No invoices match your filters.'}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">INV-{String(inv.invoice_number ?? '').padStart(4, '0')}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{inv.customers?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{inv.employees?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">{fmt(inv.total_amount ?? 0)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${(inv.payment_type ?? 'credit') === 'cash' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'}`}>
                        {(inv.payment_type ?? 'credit') === 'cash' ? 'Cash' : 'Credit'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-101/60">{new Date(inv.created_at).toLocaleDateString()}</td>
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
                {activeTab === 'delivered' && (
                  <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Delivered On</th>
                )}
                {(activeTab === 'invoiced' || activeTab === 'all') && (
                  <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Delivered</th>
                )}
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'delivered' || activeTab === 'invoiced' || activeTab === 'all' ? 8 : 7} className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center">
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
                      {activeTab === 'delivered' && (
                        <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">{o.delivered_at ? new Date(o.delivered_at).toLocaleDateString() : '-'}</td>
                      )}
                      {(activeTab === 'invoiced' || activeTab === 'all') && (
                        <td className="px-5 py-3.5">
                          {(o.status === 'invoiced' || o.status === 'converted') ? (
                            <button onClick={() => onDeliver(o)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors border border-green-200 dark:border-green-800" title="Mark as Delivered">
                              <Truck size={13} />
                              Deliver
                            </button>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                      )}
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
                          {((o.status === 'invoiced' || o.status === 'converted' || o.status === 'delivered') && o.invoice_id) && (
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

import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import PermissionGate from '../components/PermissionGate'
import { usePermissions } from '../contexts/PermissionsContext'
import { buildConsistencyRows } from '../lib/orderConsistency'
import { pressDateISO, formatLocalDate } from '../lib/localDate'
import { convertOrderToInvoice } from '../lib/orderConversion'
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

  useEffect(() => {
    document.title = "Orders | Shayan's Kids"
  }, [])

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
  const { isSuperAdmin } = usePermissions()
  const [consistencyOpen, setConsistencyOpen] = useState(false)
  const [checkingConsistency, setCheckingConsistency] = useState(false)
  const [consistencyRows, setConsistencyRows] = useState([])
  const [syncingOrderId, setSyncingOrderId] = useState('')

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
      const invoiceById = new Map((invRes.data ?? []).map((invoice) => [String(invoice.id), invoice]))
      setOrders((ordRes.data ?? []).map((order) => ({
        ...order,
        invoices: invoiceById.get(String(order.invoice_id)) ?? null,
      })))
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
    const deliveredAt = pressDateISO()
    const { error } = await supabase.from('orders').update({ status: 'delivered', delivered_at: deliveredAt }).eq('id', order.id)
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

    try {
      const invoice = await convertOrderToInvoice(supabase, order.id)
      toast.success('Order invoiced successfully')
      logAction({ action: 'invoice_order', targetType: 'order', targetId: order.id, targetLabel: `ORD-${String(order.order_number ?? '').padStart(4, '0')}`, details: `Invoice INV-${String(invoice.invoice_number ?? invoice.invoice_id).padStart(4, '0')}` })
      await load()
    } catch (error) {
      toast.error(error?.message || 'Order conversion failed')
    }
  }

  const onDeleteInvoice = async (inv) => {
    if (!confirm('Delete this invoice and all its items?')) return
    
    try {
      console.log('Deleting invoice from Orders page:', inv.id)
      
      // First get the invoice items to restore stock
      const { data: items, error: itemsErr } = await supabase
        .from('invoice_items')
        .select('product_id, quantity')
        .eq('invoice_id', inv.id)
      
      if (itemsErr) {
        console.error('Error getting invoice items:', itemsErr)
        toast.error(itemsErr.message)
        return
      }
      
      console.log('Invoice items to restore:', items)
      
      // Restore stock for each product
      if (items && items.length > 0) {
        const stockUpdates = items.map(async (item) => {
          console.log('Restoring stock for product:', item.product_id, 'quantity:', item.quantity)
          // Get current product stock
          const { data: product, error: prodErr } = await supabase
            .from('products')
            .select('stock')
            .eq('id', item.product_id)
            .single()
          
          if (prodErr) {
            console.error('Error getting product:', prodErr)
            return
          }
          
          if (product) {
            const newStock = (product.stock || 0) + item.quantity
            console.log('Current stock:', product.stock, 'new stock:', newStock)
            const { error: updateErr } = await supabase
              .from('products')
              .update({ stock: newStock })
              .eq('id', item.product_id)
            
            if (updateErr) {
              console.error('Error updating product stock:', updateErr)
            }
          }
        })
        await Promise.all(stockUpdates)
      }
      
      // Clear invoice_id on any orders that reference this invoice
      console.log('Unlinking orders...')
      await supabase.from('orders').update({ invoice_id: null }).eq('invoice_id', inv.id)
      
      console.log('Deleting invoice items...')
      await supabase.from('invoice_items').delete().eq('invoice_id', inv.id)
      
      console.log('Deleting invoice...')
      const { error: err } = await supabase.from('invoices').delete().eq('id', inv.id)
      
      if (err) {
        console.error('Error deleting invoice:', err)
        toast.error(err.message)
        return
      }
      
      toast.success('Invoice deleted and stock restored')
      logAction({ action: 'delete_invoice', targetType: 'invoice', targetId: inv.id, targetLabel: `INV-${String(inv.id ?? '').padStart(4, '0')}` })
      await load()
    } catch (e) {
      console.error('Unexpected error deleting invoice:', e)
      toast.error(e?.message || 'Failed to delete invoice')
    }
  }

  const checkConsistency = async () => {
    setConsistencyOpen(true)
    setCheckingConsistency(true)
    try {
      const { data: linkedOrders, error: orderError } = await supabase
        .from('orders')
        .select('id, order_number, total, invoice_id, status')
        .in('status', ['invoiced', 'converted', 'delivered'])
        .not('invoice_id', 'is', null)
      if (orderError) throw orderError

      const orderIds = (linkedOrders ?? []).map((row) => row.id)
      const invoiceIds = (linkedOrders ?? []).map((row) => row.invoice_id)
      if (orderIds.length === 0) {
        setConsistencyRows([])
        return
      }

      const [orderItemsRes, invoicesRes, invoiceItemsRes, productsRes] = await Promise.all([
        supabase.from('order_items').select('order_id, product_id, quantity, price, discount, total').in('order_id', orderIds),
        supabase.from('invoices').select('id, invoice_number, total_amount').in('id', invoiceIds),
        supabase.from('invoice_items').select('invoice_id, product_id, quantity, price, discount, total').in('invoice_id', invoiceIds),
        supabase.from('products').select('id, code, name'),
      ])
      const failure = [orderItemsRes, invoicesRes, invoiceItemsRes, productsRes].find((result) => result.error)
      if (failure) throw failure.error

      setConsistencyRows(buildConsistencyRows({
        orders: linkedOrders ?? [],
        invoices: invoicesRes.data ?? [],
        orderItems: orderItemsRes.data ?? [],
        invoiceItems: invoiceItemsRes.data ?? [],
        products: productsRes.data ?? [],
      }))
    } catch (error) {
      toast.error(error?.message || 'Failed to check order/invoice consistency')
    } finally {
      setCheckingConsistency(false)
    }
  }

  const syncOrderFromInvoice = async (row) => {
    const orderLabel = `ORD-${String(row.order_number ?? '').padStart(4, '0')}`
    const invoiceLabel = `INV-${String(row.invoice_number ?? '').padStart(4, '0')}`
    if (!confirm(`Sync ${orderLabel} from ${invoiceLabel}? This will replace the historical order items and total with the invoice snapshot. An audit log will be saved.`)) return

    setSyncingOrderId(row.order_id)
    try {
      const { error } = await supabase.rpc('sync_order_from_invoice', { p_order_id: row.order_id })
      if (error) throw error
      toast.success(`${orderLabel} synced from ${invoiceLabel}`)
      await Promise.all([checkConsistency(), load()])
    } catch (error) {
      toast.error(error?.message || 'Failed to sync order from invoice')
    } finally {
      setSyncingOrderId('')
    }
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
          {isSuperAdmin && (
            <button onClick={checkConsistency} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200">
              Check Order/Invoice Consistency
            </button>
          )}
          <PermissionGate module="orders" action="create">
            <Link to="/orders/new" className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
              <Plus size={16} />
              Create Order
            </Link>
          </PermissionGate>
        </div>
      </div>

      {isSuperAdmin && consistencyOpen && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-700 dark:bg-amber-950/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Order / Invoice Consistency</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Super Admin utility. No records are changed until you choose Sync Order From Invoice.</p>
            </div>
            <button onClick={() => setConsistencyOpen(false)} className="text-sm text-slate-500 hover:text-slate-900">Close</button>
          </div>
          {checkingConsistency ? (
            <div className="py-8 text-center text-sm text-slate-500">Checking converted orders...</div>
          ) : consistencyRows.length === 0 ? (
            <div className="mt-4 rounded-lg bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">All linked orders and invoices match.</div>
          ) : (
            <div className="mt-4 space-y-3">
              {consistencyRows.map((row) => (
                <div key={row.order_id} className="rounded-lg border border-red-200 bg-white p-4 dark:border-red-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-red-700 dark:text-red-300">DATA MISMATCH</div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">ORD-{String(row.order_number ?? '').padStart(4, '0')} / INV-{String(row.invoice_number ?? '').padStart(4, '0')}</div>
                      <div className="text-xs text-slate-500">Items: {row.order_item_count} vs {row.invoice_item_count} � Totals: {fmt(row.order_total)} vs {fmt(row.invoice_total)}</div>
                    </div>
                    <button
                      onClick={() => syncOrderFromInvoice(row)}
                      disabled={syncingOrderId === row.order_id}
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {syncingOrderId === row.order_id ? 'Syncing...' : 'Sync Order From Invoice'}
                    </button>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-slate-500"><th className="py-1">Product</th><th>Change</th><th>Order Qty</th><th>Invoice Qty</th><th>Order Price</th><th>Invoice Price</th></tr></thead>
                      <tbody>{row.differences.map((difference) => (
                        <tr key={difference.product_id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-1.5 font-semibold">{difference.product_code} {difference.product_name}</td>
                          <td>{difference.type}</td>
                          <td>{difference.order_quantity ?? 'Missing'}</td>
                          <td>{difference.invoice_quantity ?? 'Missing'}</td>
                          <td>{difference.order_price == null ? 'Missing' : fmt(difference.order_price)}</td>
                          <td>{difference.invoice_price == null ? 'Missing' : fmt(difference.invoice_price)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Order Date</th>
                {(activeTab === 'invoiced' || activeTab === 'delivered' || activeTab === 'all') && (
                  <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Invoiced On</th>
                )}
                {(activeTab === 'invoiced' || activeTab === 'delivered' || activeTab === 'all') && (
                  <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Delivered On</th>
                )}
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'delivered' || activeTab === 'invoiced' || activeTab === 'all' ? 9 : 7} className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center">
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
                      <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">{formatLocalDate(o.created_at)}</td>
                      {(activeTab === 'invoiced' || activeTab === 'delivered' || activeTab === 'all') && (
                        <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">
                          {o.invoices?.created_at ? formatLocalDate(o.invoices.created_at) : '—'}
                        </td>
                      )}
                      {(activeTab === 'invoiced' || activeTab === 'delivered' || activeTab === 'all') && (
                        <td className="px-5 py-3.5">
                          {o.status === 'delivered' ? (
                            <span className="text-slate-600 dark:text-emerald-100/70 font-medium">{formatLocalDate(o.delivered_at)}</span>
                          ) : (o.status === 'invoiced' || o.status === 'converted') ? (
                            <PermissionGate module="orders" action="deliver">
                              <button onClick={() => onDeliver(o)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors border border-green-200 dark:border-green-800" title="Mark as Delivered">
                                <Truck size={13} />
                                Deliver
                              </button>
                            </PermissionGate>
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
                            <PermissionGate module="orders" action="edit">
                              <Link to={`/orders/${o.id}/edit`} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                                <Pencil size={15} />
                              </Link>
                            </PermissionGate>
                          )}
                          {o.status === 'pending' && (
                            <PermissionGate module="orders" action="approve">
                              <button onClick={() => onConfirm(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Confirm">
                                <CheckCircle size={15} />
                              </button>
                            </PermissionGate>
                          )}
                          {o.status === 'confirmed' && (
                            <PermissionGate module="orders" action="convert_to_invoice">
                              <button onClick={() => onConvert(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors" title="Convert to Invoice">
                                <ArrowRightLeft size={15} />
                              </button>
                            </PermissionGate>
                          )}
                          {((o.status === 'invoiced' || o.status === 'converted' || o.status === 'delivered') && o.invoice_id) && (
                            <PermissionGate module="invoices" action="view">
                              <Link to={`/invoices/${o.invoice_id}`} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors" title="View Invoice">
                                <FileText size={15} />
                              </Link>
                            </PermissionGate>
                          )}
                          {(o.status === 'pending' || o.status === 'confirmed') && (
                            <PermissionGate module="orders" action="delete">
                              <button onClick={() => onCancel(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Cancel">
                                <XCircle size={15} />
                              </button>
                            </PermissionGate>
                          )}
                          <PermissionGate module="orders" action="delete">
                            <button onClick={() => onDelete(o)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                              <Trash2 size={15} />
                            </button>
                          </PermissionGate>
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

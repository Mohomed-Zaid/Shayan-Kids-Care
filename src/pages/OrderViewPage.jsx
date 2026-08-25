import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import html2pdf from 'html2pdf.js'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { pressDateISO, formatLocalDate } from '../lib/localDate'
import { ArrowLeft, CheckCircle, XCircle, ArrowRightLeft, ShoppingCart, Printer, Download, Trash2, FileText, Pencil, Truck } from 'lucide-react'
import logo from '../pictures/logo.jpeg'
import CompanyPhoneLines from '../components/CompanyPhoneLines'
import { COMPANY_EMAIL } from '../lib/companyContact'
import PermissionGate from '../components/PermissionGate'
import { convertOrderToInvoice } from '../lib/orderConversion'
import { useMeasuredInvoicePagination } from '../hooks/useMeasuredInvoicePagination'

const statusConfig = {
  pending: { label: 'Pending', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700' },
  confirmed: { label: 'Confirmed', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  invoiced: { label: 'Invoiced', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  converted: { label: 'Invoiced', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
  delivered: { label: 'Delivered', bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' },
}

export default function OrderViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const VAT_RATE = 0.18

  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const printRef = useRef(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)

      const [ordRes, itemsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, total, status, created_at, customer_id, rep_id, payment_type, invoice_id, delivered_at, customers(name, address, phone), employees(name, is_rep)')
          .eq('id', id)
          .single(),
        supabase
          .from('order_items')
          .select('id, product_id, quantity, price, discount, total, products(name, code)')
          .eq('order_id', id)
          .order('id', { ascending: true }),
      ])

      if (!mounted) return

      if (ordRes.error || !ordRes.data) {
        toast.error('Order not found')
        navigate('/orders', { replace: true })
        return
      }

      let linkedInvoice = null
      if (ordRes.data.invoice_id) {
        const { data } = await supabase
          .from('invoices')
          .select('created_at')
          .eq('id', ordRes.data.invoice_id)
          .maybeSingle()
        linkedInvoice = data ?? null
      }

      if (!mounted) return
      setOrder({ ...ordRes.data, invoices: linkedInvoice })
      setItems(itemsRes.data ?? [])
      setLoading(false)
    }

    load().catch(() => {
      navigate('/orders', { replace: true })
    })

    return () => { mounted = false }
  }, [id])

  const customer = order?.customers
  const rep = order?.employees
  const orderNumber = `ORD-${String(order?.order_number ?? '').padStart(4, '0')}`
  const st = statusConfig[order?.status] ?? statusConfig.pending

  const createdAtLabel = useMemo(() => {
    if (!order?.created_at) return ''
    return new Date(order.created_at).toLocaleDateString() + ' ' + new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, [order])

  const totalDiscount = useMemo(() => {
    return items.reduce((s, it) => {
      const discAmt = Number(it.quantity ?? 0) * Number(it.price ?? 0) * (Number(it.discount ?? 0) / 100)
      return s + discAmt
    }, 0)
  }, [items])

  const subtotal = useMemo(() => {
    return items.reduce((s, it) => s + Number(it.total ?? 0), 0)
  }, [items])
  const orderPages = useMeasuredInvoicePagination(items, printRef)

  const fmt = (val) => `Rs. ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

  const onConfirm = async () => {
    const { error } = await supabase.from('orders').update({ status: 'confirmed' }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Order confirmed')
    logAction({ action: 'confirm_order', targetType: 'order', targetId: id })
  }

  const onCancel = async () => {
    if (!confirm('Cancel this order?')) return
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Order cancelled')
    logAction({ action: 'cancel_order', targetType: 'order', targetId: id })
    setOrder({ ...order, status: 'cancelled' })
  }

  const onDelete = async () => {
    if (!confirm('Delete this order and all its items?')) return
    await supabase.from('order_items').delete().eq('order_id', id)
    const { error: err } = await supabase.from('orders').delete().eq('id', id)
    if (err) { toast.error(err.message); return }
    toast.success('Order deleted')
    logAction({ action: 'delete_order', targetType: 'order', targetId: id })
    navigate('/orders', { replace: true })
  }

  const onDeliver = async () => {
    if (!confirm('Mark this order as delivered?')) return
    const deliveredAt = pressDateISO()
    const { error } = await supabase.from('orders').update({ status: 'delivered', delivered_at: deliveredAt }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Order marked as delivered')
    logAction({ action: 'deliver_order', targetType: 'order', targetId: id, targetLabel: orderNumber })
    setOrder({ ...order, status: 'delivered', delivered_at: deliveredAt })
  }

  const onConvert = async () => {
    if (order.status !== 'confirmed') {
      toast.error('Only confirmed orders can be invoiced')
      return
    }

    setConverting(true)

    try {
      const invoice = await convertOrderToInvoice(supabase, id)
      toast.success('Order invoiced successfully')
      logAction({ action: 'invoice_order', targetType: 'order', targetId: id, details: `Invoice INV-${String(invoice.invoice_number ?? invoice.invoice_id).padStart(4, '0')}` })
      setOrder({ ...order, status: 'invoiced', invoice_id: invoice.invoice_id, delivered_at: null })
    } catch (e) {
      toast.error(e?.message ?? 'Order conversion failed')
    } finally {
      setConverting(false)
    }
  }

  const downloadPdf = async () => {
    if (!printRef.current) return

    const wrapper = document.createElement('div')
    wrapper.className = 'pdf-export-wrapper invoice-pdf-export-wrapper'
    const cloned = printRef.current.cloneNode(true)
    wrapper.appendChild(cloned)
    document.body.appendChild(wrapper)

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    // Force white background + black text AFTER it's in the DOM (so computed styles are correct)
    cloned.style.backgroundColor = '#ffffff'
    cloned.style.color = '#000000'
    cloned.querySelectorAll('*').forEach((el) => {
      const cs = window.getComputedStyle(el)
      const bg = cs.backgroundColor
      const isTransparentBg = bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent'
      const isWhiteBg = bg === 'rgb(255, 255, 255)'
      const isDarkHeader = el.classList.contains('bg-slate-800') || el.classList.contains('bg-slate-900') || el.closest('.bg-slate-800') || el.closest('.bg-slate-900')

      // Skip dark header rows — keep them dark
      if (!isDarkHeader && !isTransparentBg && !isWhiteBg) {
        el.style.backgroundColor = '#ffffff'
      }

      // Force black text everywhere except inside dark headers
      if (!isDarkHeader) {
        el.style.color = '#000000'
      } else {
        el.style.color = '#ffffff'
      }
    })

    const opt = {
      margin: 0,
      filename: `${orderNumber}-${customer?.name ?? 'Customer'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], before: '.invoice-continuation-page', avoid: ['.invoice-item-row', '.invoice-closing-section', '.document-settlement-section', '.signature-section'] },
    }

    try {
      await html2pdf().set(opt).from(cloned).save()
    } finally {
      wrapper.remove()
    }
  }

  if (loading || !order) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to="/orders" className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors">
          <ArrowLeft size={16} />
          Back to Orders
        </Link>
        <div className="flex items-center gap-2">
          {(order.status === 'pending' || order.status === 'confirmed') && (
            <PermissionGate module="orders" action="edit">
              <Link to={`/orders/${id}/edit`} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <Pencil size={15} />
                Edit
              </Link>
            </PermissionGate>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Printer size={15} />
            Print
          </button>
          <button onClick={downloadPdf} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
            <Download size={15} />
            Download PDF
          </button>
          {order.status === 'pending' && (
            <PermissionGate module="orders" action="approve">
              <button onClick={onConfirm} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm">
                <CheckCircle size={15} />
                Confirm
              </button>
            </PermissionGate>
          )}
          {order.status === 'confirmed' && (
            <PermissionGate module="orders" action="convert_to_invoice">
              <button onClick={onConvert} disabled={converting} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm">
                <ArrowRightLeft size={15} />
                {converting ? 'Invoicing...' : 'Convert to Invoice'}
              </button>
            </PermissionGate>
          )}
          {(order.status === 'invoiced' || order.status === 'converted') && order.invoice_id && (
            <>
              <PermissionGate module="orders" action="deliver">
                <button onClick={onDeliver} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm">
                  <Truck size={15} />
                  Mark Delivered
                </button>
              </PermissionGate>
              <PermissionGate module="invoices" action="view">
                <Link to={`/invoices/${order.invoice_id}`} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm">
                  <FileText size={15} />
                  View Invoice
                </Link>
              </PermissionGate>
              <PermissionGate module="invoices" action="edit">
                <Link to={`/invoices/${order.invoice_id}/edit`} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm">
                  <Pencil size={15} />
                  Edit Invoice
                </Link>
              </PermissionGate>
            </>
          )}
          {(order.status === 'pending' || order.status === 'confirmed') && (
            <PermissionGate module="orders" action="delete">
              <button onClick={onCancel} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm">
                <XCircle size={15} />
                Cancel
              </button>
            </PermissionGate>
          )}
          <PermissionGate module="orders" action="delete">
            <button onClick={onDelete} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm">
              <Trash2 size={15} />
              Delete
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div
          ref={printRef}
          className="bg-white dark:bg-slate-900 print-area invoice-print-document order-print-document"
        >
          {/* Header */}
          <div className="px-8 pt-3 pb-2 flex items-start justify-between border-b-2 border-slate-800 dark:border-slate-600">
            <div className="flex items-center gap-4">
              <img src={logo} alt="Logo" className="h-20 w-20 rounded-lg object-contain" />
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">Shayan's Kids</div>
                <div className="text-base font-semibold text-slate-600 dark:text-slate-400">&amp; Toys Store</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-slate-900 dark:text-white tracking-wide">SALES ORDER</div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">{orderNumber}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${st.bg} ${st.text} border ${st.border} mt-1`}>
                {st.label}
              </span>
              {order.invoices?.created_at && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Invoiced: {formatLocalDate(order.invoices.created_at)}</div>
              )}
              {order.delivered_at && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Delivered: {formatLocalDate(order.delivered_at)}</div>
              )}
            </div>
          </div>

          {/* From / Bill To */}
          <div className="px-8 py-2 flex justify-between border-b border-slate-200 dark:border-slate-700">
            <div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">From</div>
              <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">REP — {rep?.name ?? 'N/A'}</div>
                <div>10/3 B, Attidiya Road</div>
                <div>Kawdana, Dehiwala</div>
                <CompanyPhoneLines />
                <div className="text-slate-500 dark:text-slate-400">{COMPANY_EMAIL}</div>
              </div>
            </div>

            <div className="text-left">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Bill To</div>
              <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">{customer?.name ?? '-'}</div>
                <div>{customer?.address ?? '-'}</div>
                <div>{customer?.phone ?? '-'}</div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                <div><span className="font-medium text-slate-600 dark:text-slate-300">Job:</span> Baby Items &amp; Toys</div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="invoice-items-pages">
            {orderPages.map((page,pageIndex)=><div key={pageIndex} className={`invoice-items-page px-8 py-2 ${pageIndex>0?'invoice-continuation-page':''}`}><table className="w-full text-sm invoice-items-table sales-line-table"><colgroup><col/><col/><col/><col/><col/><col/><col/><col/></colgroup><thead><tr className="bg-slate-800 text-white"><th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider">No.</th><th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider">Item Code</th><th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">Description</th><th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider">Qty</th><th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider">Unit Price</th><th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider">Disc %</th><th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider">Disc. Amount</th><th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider">Amount</th></tr></thead><tbody>{page.items.map((it,idx)=><tr key={it.id} className={`invoice-item-row border-b border-slate-100 dark:border-slate-700 ${(page.startIndex+idx)%2!==0?'bg-slate-50 dark:bg-slate-800/50':''}`}><td className="px-2 py-1.5 text-center text-slate-600 dark:text-slate-300">{page.startIndex+idx+1}</td><td className="px-2 py-1.5 text-slate-600 dark:text-slate-400">{it.products?.code??'-'}</td><td className="px-3 py-1.5 font-medium text-slate-900 dark:text-white">{it.products?.name??'-'}</td><td className="px-2 py-1.5 text-center text-slate-700 dark:text-slate-300">{it.quantity}</td><td className="money-cell px-2 py-1.5 text-right text-slate-700 dark:text-slate-300">Rs. {Number(it.price??0).toLocaleString(undefined,{minimumFractionDigits:2})}</td><td className="px-2 py-1.5 text-center text-slate-700 dark:text-slate-300">{Number(it.discount??0)>0?`${Number(it.discount).toLocaleString(undefined,{minimumFractionDigits:2})}%`:'-'}</td><td className="money-cell px-2 py-1.5 text-right text-slate-700 dark:text-slate-300">{Number(it.discount??0)>0?`Rs. ${(Number(it.quantity??0)*Number(it.price??0)*Number(it.discount??0)/100).toLocaleString(undefined,{minimumFractionDigits:2})}`:'-'}</td><td className="money-cell px-2 py-1.5 text-right font-semibold text-slate-900 dark:text-white">Rs. {Number(it.total??0).toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>)}</tbody></table></div>)}
          </div>

          {/* Totals + Signature + Footer pushed to bottom */}
          <div className="invoice-closing-section mt-auto" style={{ '--writing-space-height': `${orderPages.at(-1)?.writingSpaceHeightMm ?? 18.52}mm` }}>
            <div className="document-settlement-section px-8 pb-2 flex justify-between items-start">
              {/* Bank Details */}
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <div className="font-semibold text-slate-700 dark:text-slate-200">Bank Details</div>
                <div className="mt-1 space-y-2">
                  <div>
                    <div className="font-semibold">ANM NIFLAN</div>
                    <div>010-0272070-001</div>
                    <div>Amana Bank Gampola</div>
                  </div>
                  <div>
                    <div className="font-semibold">ANM NIFLAN</div>
                    <div>223020144356</div>
                    <div>HNB Bank</div>
                  </div>
                </div>
              </div>
              <div className="w-full max-w-xs border border-slate-200 dark:border-slate-700 rounded">
                <div className="px-4 py-1.5 flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                  <span className="text-slate-800 dark:text-slate-200">Rs. {Number(subtotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="px-4 py-2 flex justify-between text-sm border-t border-slate-100 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Discount</span>
                  <span className="text-slate-800 dark:text-slate-200">Rs. {Number(totalDiscount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="px-4 py-2 bg-slate-800 flex justify-between items-center border-t-2 border-slate-800">
                  <span className="text-white font-bold text-sm uppercase tracking-wider">Total</span>
                  <span className="text-white font-extrabold text-lg">Rs. {Number(order.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
            <div className="signature-section px-8 py-3 grid grid-cols-3 gap-8 border-t border-slate-200 dark:border-slate-700">
              {['Checking','Received','Customer Signature'].map(label=><div key={label} className="signature-block text-center"><div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{label}</div><div className="signature-space"/><div className="signature-line border-t border-slate-500 dark:border-slate-500"/><div className="pt-1 text-[10px] text-slate-500 dark:text-slate-400">Signature</div></div>)}
            </div>

            <div className="px-8 py-2 border-t-2 border-slate-800 dark:border-slate-600 text-center text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="font-bold text-slate-900 dark:text-slate-100">Shayan's Kids &amp; Toys Store</span>
                <span className="text-slate-600 dark:text-slate-400">|</span>
                <span className="text-slate-700 dark:text-slate-300">{COMPANY_EMAIL}</span>
              </div>
              <div>{order?.payment_type === 'cash' ? 'Cash Order — Payment received.' : 'Credit Order — Total due in 30 days only.'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

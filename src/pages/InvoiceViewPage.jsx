import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import html2pdf from 'html2pdf.js'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { ArrowLeft, Printer, Download, Trash2, Pencil } from 'lucide-react'
import logo from '../pictures/logo.jpeg'

export default function InvoiceViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const printRef = useRef(null)

  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      setError(null)

      const invRes = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, vat_rate, vat_amount, created_at, payment_type, customers(name, address, phone), employees(id, name, is_rep)')
        .eq('id', id)
        .single()

      const itemsRes = await supabase
        .from('invoice_items')
        .select('id, product_id, quantity, price, total, products(name, code)')
        .eq('invoice_id', id)
        .order('id', { ascending: true })

      if (!mounted) return

      if (invRes.error) {
        setError(invRes.error.message)
        setInvoice(null)
        setItems([])
      } else {
        setInvoice(invRes.data)
        setItems(itemsRes.data ?? [])
      }

      if (itemsRes.error) {
        setError(itemsRes.error.message)
      }

      setLoading(false)
    }

    load().catch((e) => {
      console.error(e)
      setError('Failed to load')
      setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [id])

  const customer = invoice?.customers
  const rep = invoice?.employees

  const subtotal = useMemo(() => {
    return items.reduce((s, it) => s + Number(it.total ?? 0), 0)
  }, [items])

  const vatRate = Number(invoice?.vat_rate ?? 0.18)
  const vatAmount = Number(invoice?.vat_amount ?? subtotal * vatRate)
  const totalAmount = Number(invoice?.total_amount ?? subtotal + vatAmount)

  const onDelete = async () => {
    if (!confirm('Delete this invoice and all its items?')) return
    await supabase.from('orders').update({ invoice_id: null }).eq('invoice_id', id)
    await supabase.from('invoice_items').delete().eq('invoice_id', id)
    const { error: err } = await supabase.from('invoices').delete().eq('id', id)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Invoice deleted')
    logAction({ action: 'delete_invoice', targetType: 'invoice', targetId: id })
  }

  const downloadPdf = async () => {
    if (!printRef.current) return

    const wrapper = document.createElement('div')
    wrapper.className = 'pdf-export-wrapper'
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

      if (!isTransparentBg && !isWhiteBg) {
        el.style.backgroundColor = '#ffffff'
      }

      const shouldForceBlack = (isTransparentBg || isWhiteBg || el.style.backgroundColor === '#ffffff')
      const isWhiteText = cs.color === 'rgb(255, 255, 255)' || cs.color === 'rgba(255, 255, 255, 1)'
      if (shouldForceBlack && !isWhiteText) {
        el.style.color = '#000000'
      }
    })

    const opt = {
      margin: 0,
      filename: `${invoiceNumber}-${customer?.name ?? 'Customer'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }

    try {
      await html2pdf().set(opt).from(cloned).save()
    } finally {
      wrapper.remove()
    }
  }

  const createdAtLabel = useMemo(() => {
    if (!invoice?.created_at) return ''
    return new Date(invoice.created_at).toLocaleString()
  }, [invoice?.created_at])

  const invoiceNumber = useMemo(() => {
    if (!invoice?.invoice_number) return ''
    return `INV-${String(invoice.invoice_number).padStart(4, '0')}`
  }, [invoice?.invoice_number])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          {error}
        </div>
        <Link to={location.state?.from || '/orders'} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 font-medium">
          <ArrowLeft size={16} />
          {location.state?.from ? 'Back to Receivables' : 'Back to Orders & Invoices'}
        </Link>
      </div>
    )
  }

  if (!invoice) {
    return <div className="text-sm text-slate-500">Invoice not found.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link to={location.state?.from || '/orders'} className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors">
          <ArrowLeft size={16} />
          {location.state?.from ? 'Back to Receivables' : 'Back to Orders & Invoices'}
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Printer size={15} />
            Print
          </button>
          <button onClick={downloadPdf} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
            <Download size={15} />
            Download PDF
          </button>
          <Link to={`/invoices/${id}/edit`} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Pencil size={15} />
            Edit
          </Link>
          <button onClick={onDelete} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm">
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div
          ref={printRef}
          className="bg-white dark:bg-slate-900 print-area min-h-[297mm] flex flex-col"
        >
          {/* Header */}
          <div className="px-8 pt-3 pb-2 flex items-start justify-between border-b-2 border-slate-800 dark:border-slate-600">
            <div className="flex items-center gap-4">
              <img src={logo} alt="Logo" className="h-24 w-24 rounded-lg object-contain" />
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">Shayan Kids Care</div>
                <div className="text-base font-semibold text-slate-600 dark:text-slate-400">&amp; Toys Store</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-slate-900 dark:text-white tracking-wide">INVOICE</div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">{invoiceNumber}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{new Date(invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
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
                <div>+94 75 384 1599</div>
                <div>+94 75 38 41 599</div>
                <div className="text-slate-500 dark:text-slate-400">shayankidscare@gmail.com</div>
              </div>
            </div>

            <div className="text-left">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Bill To</div>
              <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">{customer?.name ?? '-'}</div>
                <div>{customer?.address ?? '-'}</div>
                <div>{customer?.phone ?? '-'}</div>
                <div className="text-sm"><span className="font-medium text-slate-600 dark:text-slate-300">Type:</span> <span className="font-semibold text-slate-900 dark:text-white">{invoice?.payment_type === 'cash' ? 'Cash Customer' : 'Credit Customer'}</span></div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                <div><span className="font-medium text-slate-600 dark:text-slate-300">Job:</span> Baby Items &amp; Toys</div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="px-8 py-2 flex-1 flex flex-col">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="text-left font-semibold px-3 py-2 text-xs uppercase tracking-wider">Item #</th>
                  <th className="text-left font-semibold px-3 py-2 text-xs uppercase tracking-wider">Description</th>
                  <th className="text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">Qty</th>
                  <th className="text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">Unit Price</th>
                  <th className="text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} className={`border-b border-slate-100 dark:border-slate-700 ${idx % 2 !== 0 ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{it.products?.code ?? '-'}</td>
                    <td className="px-3 py-1.5 text-slate-900 dark:text-white font-medium">{it.products?.name ?? '-'}</td>
                    <td className="px-3 py-1.5 text-right text-slate-700 dark:text-slate-300">{it.quantity}</td>
                    <td className="px-3 py-1.5 text-right text-slate-700 dark:text-slate-300">Rs. {Number(it.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-1.5 text-right text-slate-900 dark:text-white font-semibold">Rs. {Number(it.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, 14 - items.length) }).map((_, i) => (
                  <tr key={`empty-${i}`} className="border-b border-slate-100 dark:border-slate-700">
                    <td className="px-3 py-1">&nbsp;</td>
                    <td className="px-3 py-1"></td>
                    <td className="px-3 py-1"></td>
                    <td className="px-3 py-1"></td>
                    <td className="px-3 py-1"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals + Signature + Footer pushed to bottom */}
          <div className="mt-auto">
            <div className="px-8 pb-2 flex justify-end">
              <div className="w-full max-w-xs border border-slate-200 dark:border-slate-700 rounded">
                <div className="px-4 py-1.5 flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                  <span className="text-slate-800 dark:text-slate-200">Rs. {Number(subtotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="px-4 py-2 flex justify-between text-sm border-t border-slate-100 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">VAT ({Math.round(vatRate * 100)}%)</span>
                  <span className="text-slate-800 dark:text-slate-200">Rs. {Number(vatAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="px-4 py-2 flex justify-between text-sm border-t border-slate-100 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Discount</span>
                  <span className="text-slate-800 dark:text-slate-200">0.00%</span>
                </div>
                <div className="px-4 py-2 flex justify-between text-sm border-t border-slate-100 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Disc. Amount</span>
                  <span className="text-slate-800 dark:text-slate-200">Rs. 0.00</span>
                </div>
                <div className="px-4 py-2 bg-slate-800 flex justify-between items-center border-t-2 border-slate-800">
                  <span className="text-white font-bold text-sm uppercase tracking-wider">Total</span>
                  <span className="text-white font-extrabold text-lg">Rs. {Number(totalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
            <div className="px-8 py-2 grid grid-cols-3 gap-8 border-t border-slate-200 dark:border-slate-700">
              <div>
                <div className="border-b border-slate-300 dark:border-slate-600 pb-2 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">Checking</div>
              </div>
              <div>
                <div className="border-b border-slate-300 dark:border-slate-600 pb-2 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">Received</div>
              </div>
              <div>
                <div className="border-b border-slate-300 dark:border-slate-600 pb-2 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">Customer Signature</div>
              </div>
            </div>

            <div className="px-8 py-1 border-t-2 border-slate-800 dark:border-slate-600 text-center text-xs text-slate-500 dark:text-slate-400">
              <div className="font-semibold text-slate-700 dark:text-slate-300">Shayan Kids Care &amp; Toys Store</div>
              <div>shayankidscare@gmail.com</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

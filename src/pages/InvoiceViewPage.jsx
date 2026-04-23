import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import html2pdf from 'html2pdf.js'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { ArrowLeft, Printer, Download, Trash2 } from 'lucide-react'
import logo from '../pictures/logo.jpeg'

export default function InvoiceViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
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
        .select('id, invoice_number, total_amount, created_at, customers(name, address, phone), employees(id, name, is_rep)')
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

  const onDelete = async () => {
    if (!confirm('Delete this invoice and all its items?')) return
    await supabase.from('invoice_items').delete().eq('invoice_id', id)
    const { error: err } = await supabase.from('invoices').delete().eq('id', id)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Invoice deleted')
    navigate('/invoices', { replace: true })
  }

  const downloadPdf = async () => {
    if (!printRef.current) return

    const opt = {
      margin: 10,
      filename: `invoice-${id}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }

    await html2pdf().set(opt).from(printRef.current).save()
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
        <Link to="/invoices" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 font-medium">
          <ArrowLeft size={16} />
          Back to invoices
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
        <Link to="/invoices" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors">
          <ArrowLeft size={16} />
          Back to Invoices
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
            <Printer size={15} />
            Print
          </button>
          <button onClick={downloadPdf} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
            <Download size={15} />
            Download PDF
          </button>
          <button onClick={onDelete} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm">
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm">
        <div
          ref={printRef}
          className="bg-white relative print-area"
        >
          {/* Left accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-sky-500 via-blue-500 to-cyan-400"></div>

          {/* Header */}
          <div className="pl-10 pr-8 pt-6 pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-5">
                <div className="bg-sky-50 border-2 border-sky-100 rounded-2xl p-3">
                  <img src={logo} alt="Logo" className="h-16 w-16 rounded-xl object-contain" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-slate-900 leading-tight tracking-tight">Shayan Kids Care</div>
                  <div className="text-base font-semibold text-sky-500 mt-0.5">&amp; Toys Store</div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                    <span>Baby Items &amp; Toys</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span>Wholesale</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="inline-block bg-sky-600 text-white text-xs font-bold px-3 py-1 rounded-full tracking-widest uppercase mb-2">Invoice</div>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight">{invoiceNumber}</div>
                <div className="text-sm text-slate-500 mt-1">{new Date(invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>
          </div>

          {/* From / Bill To */}
          <div className="pl-10 pr-8 pb-4 grid grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <div className="text-[11px] font-bold text-sky-500 uppercase tracking-[0.15em] mb-3">From</div>
              <div className="text-sm text-slate-700 space-y-1.5">
                <div className="font-bold text-slate-900 text-base">REP — {rep?.name ?? 'N/A'}</div>
                <div>10/3 B, Attidiya Road</div>
                <div>Kawdana, Dehiwala</div>
                <div className="pt-1 text-slate-500 text-xs space-y-0.5">
                  <div>+94 77 11 93 121</div>
                  <div>+94 75 38 41 599</div>
                </div>
                <div className="text-sky-500 font-medium pt-1">shayankidscare@gmail.com</div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <div className="text-[11px] font-bold text-sky-500 uppercase tracking-[0.15em] mb-3">Bill To</div>
              <div className="text-sm text-slate-700 space-y-1.5">
                <div className="font-bold text-slate-900 text-base">{customer?.name ?? '-'}</div>
                <div>{customer?.address ?? '-'}</div>
                <div>{customer?.phone ?? '-'}</div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="pl-10 pr-8 pb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left font-bold text-white bg-sky-600 px-4 py-3 text-xs uppercase tracking-wider rounded-tl-lg">Item #</th>
                  <th className="text-left font-bold text-white bg-sky-600 px-4 py-3 text-xs uppercase tracking-wider">Description</th>
                  <th className="text-right font-bold text-white bg-sky-600 px-4 py-3 text-xs uppercase tracking-wider">Qty</th>
                  <th className="text-right font-bold text-white bg-sky-600 px-4 py-3 text-xs uppercase tracking-wider">Unit Price</th>
                  <th className="text-right font-bold text-white bg-sky-600 px-4 py-3 text-xs uppercase tracking-wider rounded-tr-lg">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-sky-50/30'}>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{it.products?.code ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-900 font-semibold">{it.products?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-medium">{it.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-600">Rs. {Number(it.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-bold">Rs. {Number(it.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="pl-10 pr-8 pb-4 flex justify-end">
            <div className="w-full max-w-sm">
              <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-3 flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="text-slate-800 font-medium">Rs. {Number(invoice.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="px-5 py-3 flex justify-between text-sm border-t border-slate-100">
                  <span className="text-slate-500">Discount</span>
                  <span className="text-slate-800 font-medium">0.00%</span>
                </div>
                <div className="px-5 py-3 flex justify-between text-sm border-t border-slate-100">
                  <span className="text-slate-500">Disc. Amount</span>
                  <span className="text-slate-800 font-medium">Rs. 0.00</span>
                </div>
                <div className="px-5 py-4 bg-sky-600 flex justify-between items-center">
                  <span className="text-white font-bold text-sm uppercase tracking-wider">Total Due</span>
                  <span className="text-white font-extrabold text-xl">Rs. {Number(invoice.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Signature Section */}
          <div className="pl-10 pr-8 py-6 grid grid-cols-3 gap-10">
            <div>
              <div className="border-b-2 border-slate-200 pb-2 text-xs text-slate-400 uppercase tracking-wider font-semibold">Checking</div>
            </div>
            <div>
              <div className="border-b-2 border-slate-200 pb-2 text-xs text-slate-400 uppercase tracking-wider font-semibold">Received</div>
            </div>
            <div>
              <div className="border-b-2 border-slate-200 pb-2 text-xs text-slate-400 uppercase tracking-wider font-semibold">Customer Signature</div>
            </div>
          </div>

          {/* Footer */}
          <div className="ml-10 bg-gradient-to-r from-sky-600 via-blue-500 to-cyan-400 px-8 py-4 text-center">
            <div className="text-white font-bold text-sm">Shayan Kids Care &amp; Toys Store</div>
            <div className="text-white/70 text-xs mt-1">Credit Bill — Total due in 30 days only.</div>
            <div className="text-white/80 text-xs mt-1 font-medium">shayankidscare@gmail.com</div>
          </div>
        </div>
      </div>
    </div>
  )
}

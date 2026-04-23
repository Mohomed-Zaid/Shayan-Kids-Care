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
      <div className="flex items-center justify-between">
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
          className="bg-white"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-8 py-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 rounded-xl p-2">
                  <img src={logo} alt="Logo" className="h-14 w-14 rounded-lg object-contain" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white leading-tight">Shayan Kids Care</div>
                  <div className="text-lg font-medium text-sky-100">&amp; Toys Store</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold text-white tracking-wider">INVOICE</div>
                <div className="mt-1 text-sky-100 text-sm font-medium">{invoiceNumber}</div>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="px-8 py-6 grid grid-cols-2 gap-8">
            {/* From */}
            <div>
              <div className="text-xs font-semibold text-sky-600 uppercase tracking-wider mb-2">From</div>
              <div className="text-sm text-slate-800 space-y-1">
                <div className="font-semibold text-slate-900">REP — {rep?.name ?? 'N/A'}</div>
                <div>10/3 B, Attidiya Road</div>
                <div>Kawdana — Dehiwala</div>
                <div>P: +94 77 11 93 121</div>
                <div>P: +94 75 38 41 599</div>
                <div className="text-sky-600">shayankidscare@gmail.com</div>
              </div>
            </div>

            {/* To + Meta */}
            <div>
              <div className="text-xs font-semibold text-sky-600 uppercase tracking-wider mb-2">Bill To</div>
              <div className="text-sm text-slate-800 space-y-1">
                <div className="font-semibold text-slate-900">{customer?.name ?? '-'}</div>
                <div>{customer?.address ?? '-'}</div>
                <div>{customer?.phone ?? '-'}</div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-slate-500">Date</div>
                <div className="text-slate-900 font-medium text-right">{new Date(invoice.created_at).toLocaleDateString()}</div>
                <div className="text-slate-500">Job</div>
                <div className="text-slate-900 font-medium text-right">Baby Items &amp; Toys</div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-8 border-t border-slate-200"></div>

          {/* Items Table */}
          <div className="px-8 py-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-sky-500">
                  <th className="text-left font-semibold text-sky-700 px-4 py-3 text-xs uppercase tracking-wider">Item #</th>
                  <th className="text-left font-semibold text-sky-700 px-4 py-3 text-xs uppercase tracking-wider">Description</th>
                  <th className="text-right font-semibold text-sky-700 px-4 py-3 text-xs uppercase tracking-wider">Qty</th>
                  <th className="text-right font-semibold text-sky-700 px-4 py-3 text-xs uppercase tracking-wider">Unit Price</th>
                  <th className="text-right font-semibold text-sky-700 px-4 py-3 text-xs uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className="px-4 py-3 text-slate-600">{it.products?.code ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{it.products?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{it.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-700">Rs. {Number(it.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-semibold">Rs. {Number(it.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-8 pb-6 flex justify-end">
            <div className="w-full max-w-xs">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="text-slate-900">Rs. {Number(invoice.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Discount</span>
                  <span className="text-slate-900">0.00%</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Disc. Amount</span>
                  <span className="text-slate-900">Rs. 0.00</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t-2 border-sky-500 flex justify-between items-center">
                <span className="text-base font-bold text-slate-900">TOTAL</span>
                <span className="text-xl font-extrabold text-sky-600">Rs. {Number(invoice.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Signature Section */}
          <div className="mx-8 border-t border-slate-200"></div>
          <div className="px-8 py-8 grid grid-cols-3 gap-8 text-center text-sm">
            <div>
              <div className="border-t-2 border-slate-300 pt-2 text-slate-500">Checking</div>
            </div>
            <div>
              <div className="border-t-2 border-slate-300 pt-2 text-slate-500">Received</div>
            </div>
            <div>
              <div className="border-t-2 border-slate-300 pt-2 text-slate-500">Customer Signature</div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 px-8 py-4 text-center text-xs text-slate-500 border-t border-slate-200">
            <div className="font-semibold text-slate-700">Shayan Kids Care &amp; Toys Store</div>
            <div className="mt-0.5">Credit Bill — Total due in 30 days only.</div>
            <div className="mt-0.5 text-sky-600">shayankidscare@gmail.com</div>
          </div>
        </div>
      </div>
    </div>
  )
}

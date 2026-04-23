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
          className="p-6"
          style={{ backgroundColor: '#d9f1f4' }}
        >
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <img src={logo} alt="Logo" className="h-16 w-16 object-contain" />
              <div>
                <div className="text-2xl font-semibold text-slate-900 leading-tight">Shayan kids &amp;</div>
                <div className="text-2xl font-semibold text-slate-900 leading-tight">Toys Store</div>

                <div className="mt-4 text-sm text-slate-900">
                  <div className="font-semibold">REP - {rep?.name ?? 'N/A'}</div>
                  <div className="mt-1">10/3 B, ATTIDIYA ROAD</div>
                  <div className="mt-1">KAWDANA - DEHIWALA</div>
                  <div className="mt-1">P: +94 77 11 93 121</div>
                  <div className="mt-1">P: +94 75 38 41 599</div>
                  <div className="mt-1">shayankidscare@gmail.com</div>
                </div>
              </div>
            </div>

            <div className="text-right min-w-[280px]">
              <div className="text-4xl font-bold text-slate-900 tracking-wide">INVOICE</div>
              <div className="mt-3 text-sm text-slate-900">
                <div className="flex justify-end gap-2">
                  <div className="font-semibold">Invoice #:</div>
                  <div>{invoiceNumber}</div>
                </div>
                <div className="flex justify-end gap-2">
                  <div className="font-semibold">Invoice:</div>
                  <div>{new Date(invoice.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex justify-end gap-2">
                  <div className="font-semibold">Job:</div>
                  <div>Baby Items &amp; Toys</div>
                </div>
              </div>

              <div className="mt-8 text-sm text-slate-900">
                <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 justify-end">
                  <div className="text-right font-semibold">Bill to:</div>
                  <div className="text-right font-semibold">{customer?.name ?? '-'}</div>

                  <div className="text-right font-semibold">Address:</div>
                  <div className="text-right">{customer?.address ?? '-'}</div>

                  <div className="text-right font-semibold">Phone:</div>
                  <div className="text-right">{customer?.phone ?? '-'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border border-slate-900/60">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/40 text-slate-900 border-b border-slate-900/60">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Item #</th>
                  <th className="text-left font-semibold px-3 py-2">Description</th>
                  <th className="text-right font-semibold px-3 py-2">Qty</th>
                  <th className="text-right font-semibold px-3 py-2">Unit price</th>
                  <th className="text-right font-semibold px-3 py-2">Price</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-900/30">
                    <td className="px-3 py-2">{it.products?.code ?? '-'}</td>
                    <td className="px-3 py-2">{it.products?.name ?? '-'}</td>
                    <td className="px-3 py-2 text-right">{it.quantity}</td>
                    <td className="px-3 py-2 text-right">Rs. {Number(it.price ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">Rs. {Number(it.total ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-start justify-end">
            <div className="w-full max-w-sm border border-slate-900/60">
              <div className="grid grid-cols-2 text-sm">
                <div className="px-3 py-2 border-b border-r border-slate-900/60">Invoice Subtotal</div>
                <div className="px-3 py-2 border-b border-slate-900/60 text-right">Rs. {Number(invoice.total_amount ?? 0).toFixed(2)}</div>

                <div className="px-3 py-2 border-b border-r border-slate-900/60">Discount</div>
                <div className="px-3 py-2 border-b border-slate-900/60 text-right">0.00%</div>

                <div className="px-3 py-2 border-b border-r border-slate-900/60">Disc Amount</div>
                <div className="px-3 py-2 border-b border-slate-900/60 text-right">Rs. 0.00</div>

                <div className="px-3 py-2 border-r border-slate-900/60 font-semibold">TOTAL</div>
                <div className="px-3 py-2 text-right font-semibold">Rs. {Number(invoice.total_amount ?? 0).toFixed(2)}</div>
              </div>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-3 gap-8 text-center text-sm text-slate-900">
            <div>
              <div className="border-t border-slate-900/60 pt-2">Checking</div>
            </div>
            <div>
              <div className="border-t border-slate-900/60 pt-2">Received</div>
            </div>
            <div>
              <div className="border-t border-slate-900/60 pt-2">Customer Signature</div>
            </div>
          </div>

          <div className="mt-14 text-center text-xs text-slate-900">
            <div>Shayan Kids care &amp; Toys Store</div>
            <div>Credit Bill Total due in 30 days Only.</div>
            <div>shayankidscare@gmail.com</div>
          </div>
        </div>
      </div>
    </div>
  )
}

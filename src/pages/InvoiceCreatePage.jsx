import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Plus, Trash2, ArrowLeft, AlertTriangle, X } from 'lucide-react'
import html2pdf from 'html2pdf.js'
import { companyPhonesHtml, COMPANY_EMAIL } from '../lib/companyInfo'
import { INVOICE_PAGINATION, paginateInvoiceItems } from '../lib/invoicePagination'
import { customerOutstanding } from '../lib/receivables'

const fmt = (val) => `Rs. ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

const safeFilename = (name) => String(name || '').replace(/[\\/:*?"<>|]+/g, '-').trim()

const buildInvoiceHtml = ({ invoiceNumber, customer, rep, lines, productById, grandTotal, vatAmount, totalWithVat, vatEnabled, vatRate, paymentType, rowHeightsMm = [] }) => {
  const companyEmail = COMPANY_EMAIL
  const c = customer ?? {}
  const r = rep ?? {}
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const payLabel = paymentType === 'cash' ? 'Cash Customer' : 'Credit Customer'

  const invoicePages = paginateInvoiceItems(lines ?? [], { ...INVOICE_PAGINATION, rowHeightsMm })
  const writingSpaceHeightMm = invoicePages.at(-1)?.writingSpaceHeightMm ?? 18.52
  const itemPages = invoicePages.map((page, pageIndex) => {
    const itemRows = page.items.map((l, idx) => {
      const prod = productById.get(l.product_id) ?? {}
      const discAmt = l.quantity * l.price * (l.discount / 100)
      return `<tr class="invoice-item-row" style="background:${(page.startIndex + idx) % 2 !== 0 ? '#f8fafc' : '#ffffff'}">
        <td style="border-bottom:1px solid #f1f5f9;padding:6px 4px;text-align:center;color:#475569">${page.startIndex + idx + 1}</td>
        <td style="border-bottom:1px solid #f1f5f9;padding:6px 6px;color:#475569">${prod.code ?? '-'}</td>
        <td style="border-bottom:1px solid #f1f5f9;padding:6px 12px;color:#0f172a;font-weight:500">${prod.name ?? '-'}</td>
        <td style="border-bottom:1px solid #f1f5f9;padding:6px 4px;text-align:center;color:#334155">${l.quantity}</td>
        <td style="border-bottom:1px solid #f1f5f9;padding:6px;text-align:right;white-space:nowrap;color:#334155">${fmt(l.price)}</td>
        <td style="border-bottom:1px solid #f1f5f9;padding:6px 4px;text-align:center;color:#334155">${Number(l.discount) > 0 ? Number(l.discount).toLocaleString(undefined, { minimumFractionDigits: 2 }) + '%' : '-'}</td>
        <td style="border-bottom:1px solid #f1f5f9;padding:6px;text-align:right;white-space:nowrap;color:#334155">${Number(l.discount) > 0 ? fmt(discAmt) : '-'}</td>
        <td style="border-bottom:1px solid #f1f5f9;padding:6px;text-align:right;white-space:nowrap;color:#0f172a;font-weight:600">${fmt(l.total)}</td>
      </tr>`
    }).join('')
    return `<div class="invoice-items-page ${pageIndex > 0 ? 'invoice-continuation-page' : ''}" style="padding:8px 32px">
      <table class="sales-line-table" style="width:100%;font-size:14px;border-collapse:collapse;table-layout:fixed"><colgroup><col style="width:4%"><col style="width:8%"><col style="width:27%"><col style="width:7%"><col style="width:13%"><col style="width:7%"><col style="width:15%"><col style="width:19%"></colgroup>
        <thead><tr style="background:#fff;color:#000;border-bottom:2px solid #000">
          <th style="text-align:center;padding:8px 4px;font-size:11px;text-transform:uppercase">No.</th>
          <th style="text-align:left;padding:8px 6px;font-size:11px;text-transform:uppercase">Item Code</th>
          <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase">Description</th>
          <th style="text-align:center;padding:8px 4px;font-size:11px;text-transform:uppercase">Qty</th>
          <th style="text-align:right;padding:8px 12px;font-size:11px;text-transform:uppercase">Unit Price</th>
          <th style="text-align:right;padding:8px 12px;font-size:11px;text-transform:uppercase">Disc %</th>
          <th style="text-align:right;padding:8px 12px;font-size:11px;text-transform:uppercase">Disc. Amount</th>
          <th style="text-align:right;padding:8px 12px;font-size:11px;text-transform:uppercase">Amount</th>
        </tr></thead><tbody>${itemRows}</tbody>
      </table>
    </div>`
  }).join('')

  return `<div class="invoice-print-document" style="background:#fff;color:#000;font-family:Helvetica,Arial,sans-serif;width:210mm;min-height:297mm;display:flex;flex-direction:column">
  <div style="padding:12px 32px 8px;display:flex;justify-content:space-between;border-bottom:3px solid #1e293b">
    <div style="display:flex;align-items:center;gap:16px">
      <div>
        <div style="font-size:24px;font-weight:700;line-height:1.2">Shayan's Kids</div>
        <div style="font-size:16px;font-weight:600;color:#475569">&amp; Toys Store</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:28px;font-weight:700;letter-spacing:2px">INVOICE</div>
      <div style="font-size:14px;color:#475569;margin-top:4px;font-weight:500">${invoiceNumber || ''}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px">${dateStr}</div>
    </div>
  </div>

  <div style="padding:8px 32px;display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0">
    <div>
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">From</div>
      <div style="font-size:14px;color:#334155;line-height:1.6">
        <div style="font-weight:700;color:#0f172a">REP — ${r.name ?? 'N/A'}</div>
        <div>10/3 B, Attidiya Road</div>
        <div>Kawdana, Dehiwala</div>
        ${companyPhonesHtml()}
        <div style="color:#64748b">${companyEmail}</div>
      </div>
    </div>
    <div style="text-align:left">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Bill To</div>
      <div style="font-size:14px;color:#334155;line-height:1.6">
        <div style="font-weight:700;color:#0f172a">${c.name ?? '-'}</div>
        <div>${c.address ?? '-'}</div>
        <div>${c.phone ?? '-'}</div>
        <div><span style="font-weight:500;color:#475569">Type:</span> <span style="font-weight:600;color:#0f172a">${payLabel}</span></div>
      </div>
      <div style="margin-top:12px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b">
        <div><span style="font-weight:500;color:#475569">Job:</span> Baby Items &amp; Toys</div>
      </div>
    </div>
  </div>

  ${itemPages}

  <div class="invoice-closing-section" style="--writing-space-height:${writingSpaceHeightMm}mm">
    <div class="document-settlement-section" style="padding:0 32px 8px;display:flex;justify-content:space-between;align-items:start">
      <div style="font-size:12px;color:#334155">
        <div style="font-weight:600;color:#334155">Bank Details</div>
        <div style="margin-top:4px;line-height:1.6">
          <div><span style="font-weight:600">ANM NIFLAN</span><br>010-0272070-001<br>Amana Bank Gampola</div>
          <div style="margin-top:4px"><span style="font-weight:600">ANM NIFLAN</span><br>223020144356<br>HNB Bank</div>
        </div>
      </div>
      <div style="width:100%;max-width:320px;border:1px solid #e2e8f0;border-radius:4px">
        <div style="padding:6px 16px;display:flex;justify-content:space-between;font-size:14px">
          <span style="color:#64748b">Subtotal</span>
          <span style="color:#1e293b">${fmt(grandTotal)}</span>
        </div>
        ${vatEnabled ? `<div style="padding:8px 16px;display:flex;justify-content:space-between;font-size:14px;border-top:1px solid #f1f5f9">
          <span style="color:#64748b">VAT (${Math.round(vatRate * 100)}%)</span>
          <span style="color:#1e293b">${fmt(vatAmount)}</span>
        </div>` : ''}
        <div style="padding:8px 16px;background:#ffffff;display:flex;justify-content:space-between;align-items:center;border-top:3px solid #000">
          <span style="color:#000;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:1px">Total</span>
          <span style="color:#000;font-weight:800;font-size:18px">${fmt(totalWithVat)}</span>
        </div>
      </div>
    </div>
    <div class="signature-section" style="padding:10px 32px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;border-top:1px solid #e2e8f0;break-inside:avoid;page-break-inside:avoid">
      ${['Checking','Received','Customer Signature'].map(label=>`<div style="text-align:center"><div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:1px;font-weight:700">${label}</div><div style="height:60px"></div><div style="border-top:1px solid #64748b"></div><div style="padding-top:4px;font-size:10px;color:#64748b">Signature</div></div>`).join('')}
    </div>
    <div style="padding:4px 32px;border-top:3px solid #1e293b;text-align:center;font-size:12px;color:#64748b">
      <div style="font-weight:600;color:#334155">Shayan's Kids &amp; Toys Store</div>
      <div>${companyEmail}</div>
    </div>
  </div>
</div>`
}

const exportInvoicePdf = async (html, filename, rebuildHtml) => {
  const wrapper = document.createElement('div')
  wrapper.className = 'pdf-export-wrapper invoice-pdf-export-wrapper'
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

  const rowHeightsMm = Array.from(wrapper.querySelectorAll('.invoice-item-row'))
    .map((row) => row.getBoundingClientRect().height * 25.4 / 96)
  if (typeof rebuildHtml === 'function' && rowHeightsMm.length > 0) {
    wrapper.innerHTML = rebuildHtml(rowHeightsMm)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }

  const opt = {
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], before: '.invoice-continuation-page', avoid: ['.invoice-item-row', '.invoice-closing-section', '.document-settlement-section', '.signature-section'] },
  }

  try {
    await html2pdf().set(opt).from(wrapper.firstElementChild).save()
  } finally {
    wrapper.remove()
  }
}

function emptyLine() {
  return { product_id: '', quantity: 1, price: 0, discount: 0 }
}

export default function InvoiceCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()

  const VAT_RATE = 0.18

  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [reps, setReps] = useState([])

  const [customerId, setCustomerId] = useState('')
  const [repId, setRepId] = useState('')
  const [paymentType, setPaymentType] = useState('credit')
  const [vatEnabled, setVatEnabled] = useState(true)
  const [lines, setLines] = useState([emptyLine()])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [previousOutstanding, setPreviousOutstanding] = useState(0)

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

  useEffect(() => {
    let active = true
    const loadOutstanding = async () => {
      if (!customerId) {
        setPreviousOutstanding(0)
        return
      }
      const [invoiceRes, returnRes] = await Promise.all([
        supabase.from('invoices').select('id, customer_id, total_amount, created_at, payment_type').eq('customer_id', customerId).eq('payment_type', 'credit'),
        supabase.from('returns').select('invoice_id, customer_id, total_amount, created_at').eq('customer_id', customerId),
      ])
      if (!active || invoiceRes.error || returnRes.error) return
      const invoiceIds = (invoiceRes.data ?? []).map((row) => row.id)
      const paymentRes = invoiceIds.length
        ? await supabase.from('invoice_payments').select('invoice_id, amount').in('invoice_id', invoiceIds)
        : { data: [], error: null }
      if (active && !paymentRes.error) {
        setPreviousOutstanding(customerOutstanding(invoiceRes.data ?? [], paymentRes.data ?? [], returnRes.data ?? []))
      }
    }
    loadOutstanding().catch(() => { if (active) setPreviousOutstanding(0) })
    return () => { active = false }
  }, [customerId])

  const linesWithTotals = useMemo(() => {
    return lines.map((l) => {
      const qty = Number(l.quantity || 0)
      const price = Number(l.price || 0)
      const discPct = Number(l.discount || 0)
      const discAmt = qty * price * (discPct / 100)
      return { ...l, total: qty * price - discAmt }
    })
  }, [lines])

  const grandTotal = useMemo(() => {
    return linesWithTotals.reduce((sum, l) => sum + (l.total ?? 0), 0)
  }, [linesWithTotals])

  const vatAmount = useMemo(() => {
    return vatEnabled ? grandTotal * VAT_RATE : 0
  }, [grandTotal, vatEnabled])

  const totalWithVat = useMemo(() => {
    return grandTotal + vatAmount
  }, [grandTotal, vatAmount])

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
        discount: Number(l.discount || 0),
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
        .insert({
          customer_id: customerId,
          rep_id: repId || null,
          total_amount: totalWithVat,
          vat_rate: vatEnabled ? VAT_RATE : 0,
          vat_amount: vatAmount,
          payment_type: paymentType,
        })
        .select('id, invoice_number')
        .single()

      if (invErr) throw invErr

      const itemsPayload = cleanedLines.map((l) => ({
        invoice_id: invoice.id,
        product_id: l.product_id,
        quantity: l.quantity,
        price: l.price,
        discount: l.discount,
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
      logAction({ action: 'create_invoice', targetType: 'invoice', targetId: invoice?.id })

      const customerObj = customers.find((c) => c.id === customerId)
      const repObj = reps.find((r) => r.id === repId)
      const invoiceDocument = {
        invoiceNumber: invoice.invoice_number,
        customer: customerObj,
        rep: repObj,
        lines: cleanedLines,
        productById,
        grandTotal,
        vatAmount,
        totalWithVat,
        vatEnabled,
        vatRate: VAT_RATE,
        paymentType,
      }
      const renderInvoiceHtml = (rowHeightsMm = []) => buildInvoiceHtml({ ...invoiceDocument, rowHeightsMm })
      const invoiceHtml = renderInvoiceHtml()
      const fname = safeFilename(`${invoice.invoice_number || 'INV'}-${customerObj?.name || 'Customer'}`)
      await exportInvoicePdf(invoiceHtml, `${fname}.pdf`, renderInvoiceHtml)

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
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Customer</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Rep</label>
              <select
                value={repId}
                onChange={(e) => setRepId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Payment Type</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              >
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>
        </div>

        {customerId ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-200">Customer Account Summary</div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div><span className="text-slate-600 dark:text-slate-300">Previous Outstanding</span><div className="font-bold">Rs. {previousOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
              <div><span className="text-slate-600 dark:text-slate-300">Current Invoice Total</span><div className="font-bold">Rs. {totalWithVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
              <div><span className="text-amber-800 dark:text-amber-200">Total Amount Due</span><div className="text-lg font-extrabold">Rs. {(previousOutstanding + totalWithVat).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        ) : null}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">Items</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Add products and quantities</div>
          </div>
          <button onClick={addLine} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Plus size={16} />
            Add Line
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Product</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Qty</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Price</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Disc %</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Total</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {linesWithTotals.map((l, idx) => (
              <tr key={idx} className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50/30 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-5 py-3">
                  <select
                    value={l.product_id}
                    onChange={(e) => onSelectProduct(idx, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
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
                    className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                    min={1}
                  />
                </td>
                <td className="px-5 py-3">
                  <input
                    type="number"
                    step="0.01"
                    value={l.price}
                    onChange={(e) => updateLine(idx, { price: e.target.value })}
                    className="w-32 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                  />
                </td>
                <td className="px-5 py-3">
                  <input
                    type="number"
                    step="0.01"
                    value={l.discount}
                    onChange={(e) => updateLine(idx, { discount: e.target.value })}
                    className="w-20 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                    min={0}
                    max={100}
                  />
                  <span className="text-xs text-slate-400 ml-1">%</span>
                </td>
                <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">Rs. {Number(l.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-30 transition-colors"
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

      <div className="flex items-center justify-between">
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg px-5 py-3 border border-slate-200/60 dark:border-slate-700 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">Subtotal</span>
            <span className="text-sm text-slate-700 dark:text-slate-300">Rs. {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between items-center">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={vatEnabled}
                onChange={(e) => setVatEnabled(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-slate-900/20"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">VAT (18%)</span>
            </label>
            <span className="text-sm text-slate-700 dark:text-slate-300">Rs. {vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-1 flex justify-between items-center">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">Total</span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">Rs. {totalWithVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/invoices')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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
    </div>
  )
}

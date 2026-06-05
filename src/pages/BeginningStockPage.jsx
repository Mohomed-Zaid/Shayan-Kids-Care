import React, { useEffect, useMemo, useRef, useState } from 'react'
import html2pdf from 'html2pdf.js'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { logAction } from '../lib/auditLog'
import { Plus, Search, Trash2, Save, AlertTriangle, X, Package } from 'lucide-react'
import logo from '../pictures/logo.jpeg'
import { companyPhonesHtml } from '../lib/companyInfo'
import CompanyPhoneLines from '../components/CompanyPhoneLines'
import ControlledDateField from '../components/ControlledDateField'

const fmt = (val) => `Rs. ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

const safeFilename = (name) => String(name || '').replace(/[\\/:*?"<>|]+/g, '-').trim()

const withCommas = (val) => {
  if (val === '' || val === undefined || val === null) return ''
  const str = String(val).replace(/,/g, '')
  if (!str) return ''
  const parts = str.split('.')
  parts[0] = Number(parts[0] || 0).toLocaleString()
  return parts.join('.')
}

const stripCommas = (val) => String(val).replace(/,/g, '')

const buildBeginningStockHtml = ({ items, totals, date, refNo }) => {
  const dateStr = new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const refLabel = refNo || `BS-${new Date().getTime()}`

  const itemRows = (items ?? []).map((it, idx) => `
    <tr style="background:${idx % 2 !== 0 ? '#f8fafc' : '#ffffff'}">
      <td style="border:1px solid #000;padding:6px 12px;color:#475569">${it.code ?? '-'}</td>
      <td style="border:1px solid #000;padding:6px 12px;color:#0f172a;font-weight:500">${it.name ?? '-'}</td>
      <td style="border:1px solid #000;padding:6px 12px;text-align:right;color:#334155">${it.quantity}</td>
      <td style="border:1px solid #000;padding:6px 12px;text-align:right;color:#334155">Rs. ${Number(it.cost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      <td style="border:1px solid #000;padding:6px 12px;text-align:right;color:#334155">${it.mrp ? 'Rs. ' + Number(it.mrp).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
      <td style="border:1px solid #000;padding:6px 12px;text-align:right;color:#0f172a;font-weight:600">Rs. ${Number(it.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
    </tr>`).join('')

  const emptyRows = Array.from({ length: Math.max(0, 14 - (items ?? []).length) }).map(() => `
    <tr>
      <td style="border:1px solid #000;padding:6px 12px">&nbsp;</td>
      <td style="border:1px solid #000;padding:6px 12px"></td>
      <td style="border:1px solid #000;padding:6px 12px"></td>
      <td style="border:1px solid #000;padding:6px 12px"></td>
      <td style="border:1px solid #000;padding:6px 12px"></td>
      <td style="border:1px solid #000;padding:6px 12px"></td>
    </tr>`).join('')

  return `<div style="background:#fff;color:#000;font-family:Helvetica,Arial,sans-serif;width:210mm;min-height:297mm;display:flex;flex-direction:column">
  <div style="padding:12px 32px 8px;display:flex;justify-content:space-between;border-bottom:3px solid #1e293b">
    <div style="display:flex;align-items:center;gap:16px">
      <div>
        <div style="font-size:24px;font-weight:700;line-height:1.2">Shayan's Kids</div>
        <div style="font-size:16px;font-weight:600;color:#475569">&amp; Toys Store</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:28px;font-weight:700;letter-spacing:2px">BEGINNING STOCK</div>
      <div style="font-size:14px;color:#475569;margin-top:4px;font-weight:500">${refLabel}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px">${dateStr}</div>
    </div>
  </div>

  <div style="padding:8px 32px;display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0">
    <div>
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Location</div>
      <div style="font-size:14px;color:#334155;line-height:1.6">
        <div style="font-weight:700;color:#0f172a">Shayan's Kids</div>
        <div>10/3 B, Attidiya Road</div>
        <div>Kawdana, Dehiwala</div>
        ${companyPhonesHtml()}
        <div style="color:#64748b">shayankidscare@gmail.com</div>
      </div>
    </div>
    <div style="text-align:left">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Type</div>
      <div style="font-size:14px;color:#334155;line-height:1.6">
        <div style="font-weight:700;color:#0f172a">Initial Stock Entry</div>
        <div>Opening Balance Adjustment</div>
      </div>
    </div>
  </div>

  <div style="padding:4px 32px;flex:1;display:flex;flex-direction:column">
    <table style="width:100%;font-size:14px;border-collapse:collapse;border:1px solid #000">
      <thead>
        <tr style="background:#ffffff;color:#000000">
          <th style="border:1px solid #000;text-align:left;font-weight:600;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:1px">Item #</th>
          <th style="border:1px solid #000;text-align:left;font-weight:600;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:1px">Description</th>
          <th style="border:1px solid #000;text-align:right;font-weight:600;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:1px">Qty</th>
          <th style="border:1px solid #000;text-align:right;font-weight:600;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:1px">Unit Cost</th>
          <th style="border:1px solid #000;text-align:right;font-weight:600;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:1px">MRP</th>
          <th style="border:1px solid #000;text-align:right;font-weight:600;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:1px">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}${emptyRows}</tbody>
    </table>
  </div>

  <div style="margin-top:auto">
    <div style="padding:0 32px 8px;display:flex;justify-content:flex-end">
      <div style="width:100%;max-width:320px;border:1px solid #e2e8f0;border-radius:4px">
        <div style="padding:6px 16px;display:flex;justify-content:space-between;font-size:14px">
          <span style="color:#64748b">Amount</span>
          <span style="color:#1e293b">${fmt(totals?.totalAmount ?? 0)}</span>
        </div>
        <div style="padding:8px 16px;background:#ffffff;display:flex;justify-content:space-between;align-items:center;border-top:3px solid #000">
          <span style="color:#000;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:1px">Total</span>
          <span style="color:#000;font-weight:800;font-size:18px">${fmt(totals?.totalAmount ?? 0)}</span>
        </div>
      </div>
    </div>
    <div style="padding:8px 32px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;border-top:1px solid #e2e8f0">
      <div style="border-bottom:1px solid #cbd5e1;padding-bottom:8px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:500">Prepared by</div>
      <div style="border-bottom:1px solid #cbd5e1;padding-bottom:8px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:500">Checked By</div>
      <div style="border-bottom:1px solid #cbd5e1;padding-bottom:8px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:500">Authorized by</div>
    </div>
    <div style="padding:4px 32px;border-top:3px solid #1e293b;text-align:center;font-size:12px;color:#64748b">
      <div style="font-weight:600;color:#334155">Shayan's Kids &amp; Toys Store</div>
      <div>shayankidscare@gmail.com</div>
    </div>
  </div>
</div>`
}

const exportBeginningStockPdf = async (html, filename) => {
  const wrapper = document.createElement('div')
  wrapper.className = 'pdf-export-wrapper'
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

  const opt = {
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }

  try {
    await html2pdf().set(opt).from(wrapper.firstElementChild).save()
  } finally {
    wrapper.remove()
  }
}

export default function BeginningStockPage() {
  const toast = useToast()
  const { isSuperAdmin } = usePermissions()
  const productSearchRef = React.useRef(null)
  const printRef = useRef(null)

  const [products, setProducts] = useState([])

  const [printData, setPrintData] = useState(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [refNo, setRefNo] = useState('')

  const [productSearch, setProductSearch] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')

  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [mrp, setMrp] = useState('')
  const [description, setDescription] = useState('')
  const [remarks, setRemarks] = useState('')
  const [expDate, setExpDate] = useState('')

  const [items, setItems] = useState([])

  const [newProdOpen, setNewProdOpen] = useState(false)
  const [prodDropdownOpen, setProdDropdownOpen] = useState(false)
  const prodDropdownRef = React.useRef(null)
  const [newProdName, setNewProdName] = useState('')
  const [newProdCode, setNewProdCode] = useState('')
  const [newProdPrice, setNewProdPrice] = useState('')
  const [newProdCategory, setNewProdCategory] = useState('General')
  const [newProdSaving, setNewProdSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    let count = 0
    try {
      const [{ data: pData, error: pErr }, { count: bsCount }] = await Promise.all([
        supabase.from('products').select('*').order('name', { ascending: true }),
        supabase.from('beginning_stock').select('*', { count: 'exact', head: true }),
      ])
      if (pErr) toast.error(pErr.message)
      setProducts(pData ?? [])
      count = bsCount ?? 0
    } catch (e) {
      // Table doesn't exist yet, that's ok
      const { data: pData, error: pErr } = await supabase.from('products').select('*').order('name', { ascending: true })
      if (pErr) toast.error(pErr.message)
      setProducts(pData ?? [])
      count = 0
    }

    setRefNo(`BS-${String((count ?? 0) + 1).padStart(4, '0')}`)
    setLoading(false)
  }

  useEffect(() => {
    load().catch((e) => {
      console.error(e)
      toast.error('Failed to load data')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!prodDropdownOpen) return
    const handler = (e) => {
      if (prodDropdownRef.current && !prodDropdownRef.current.contains(e.target)) {
        setProdDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [prodDropdownOpen])

  const saveNewProduct = async () => {
    if (!newProdName.trim()) { toast.error('Product name is required'); return }
    if (!newProdCode.trim()) { toast.error('Product code is required'); return }
    setNewProdSaving(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .insert({ name: newProdName.trim(), code: newProdCode.trim(), price: Number(newProdPrice) || 0, stock: 0, category: newProdCategory.trim() || 'General', status: 'active' })
        .select('*')
        .single()
      if (error) throw error
      toast.success('Product added')
      logAction({ action: 'create_product', targetType: 'product', targetId: data.id, targetLabel: data.name })
      setProducts((prev) => [...prev, data])
      setSelectedProductId(data.id)
      setNewProdOpen(false)
      setNewProdName('')
      setNewProdCode('')
      setNewProdPrice('')
      setNewProdCategory('General')
    } catch (e) {
      toast.error(e?.message ?? 'Failed to add product')
    } finally {
      setNewProdSaving(false)
    }
  }

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return products.slice(0, 20)
    return products
      .filter((p) => (p.name ?? '').toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q))
      .slice(0, 20)
  }, [products, productSearch])

  const selectedProduct = useMemo(() => products.find((p) => p.id === selectedProductId) ?? null, [products, selectedProductId])

  const totals = useMemo(() => {
    const totalAmount = items.reduce((sum, it) => sum + Number(it.total || 0), 0)
    const totalItems = items.length
    const totalQty = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0)
    return { totalAmount, totalItems, totalQty }
  }, [items])

  const addItem = () => {
    if (!selectedProduct) {
      toast.error('Select a product')
      return
    }
    const q = Number(qty)
    const c = Number(cost)
    if (!q || q <= 0) {
      toast.error('Quantity must be greater than 0')
      return
    }
    if (!c || c < 0) {
      toast.error('Cost must be valid')
      return
    }

    const total = q * c
    const m = Number(mrp)
    const profitPct = c > 0 && m > 0 ? ((m - c) / c * 100).toFixed(1) : null

    setItems((prev) => [
      ...prev,
      {
        id: `${selectedProduct.id}-${Date.now()}`,
        product_id: selectedProduct.id,
        code: selectedProduct.code,
        name: selectedProduct.name,
        quantity: q,
        cost: c,
        mrp: m || null,
        profit_pct: profitPct,
        description: description.trim() || null,
        total,
        exp_date: expDate || null,
        remarks: remarks.trim() || null,
      },
    ])

    setSelectedProductId('')
    setQty('')
    setCost('')
    setMrp('')
    setDescription('')
    setRemarks('')
    setExpDate('')
    setProductSearch('')
    setTimeout(() => productSearchRef.current?.focus(), 0)
  }

  const removeItem = (id) => setItems((prev) => prev.filter((x) => x.id !== id))

  const downloadPdf = async (filename) => {
    if (!printRef.current) return

    const wrapper = document.createElement('div')
    wrapper.className = 'pdf-export-wrapper'
    const cloned = printRef.current.cloneNode(true)
    wrapper.appendChild(cloned)
    document.body.appendChild(wrapper)

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

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
      el.style.color = '#000000'
    })

    const opt = {
      margin: 0,
      filename,
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

  const onSave = async () => {
    if (items.length === 0) {
      toast.error('Add at least one item')
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const effectiveDate = isSuperAdmin ? date : today

    setSaving(true)
    try {
      // Save to beginning_stock table
      const { data: stockEntry, error: bsErr } = await supabase
        .from('beginning_stock')
        .insert({ date: effectiveDate, ref_no: refNo.trim() || null, total_amount: totals.totalAmount })
        .select('*')
        .single()

      if (bsErr) throw bsErr

      // Save items to beginning_stock_items table
      const payloadItems = items.map((it) => ({
        beginning_stock_id: stockEntry.id,
        product_id: it.product_id,
        quantity: it.quantity,
        cost: it.cost,
        mrp: it.mrp,
        description: it.description,
        total: it.total,
        exp_date: it.exp_date,
        remarks: it.remarks,
      }))

      const { error: bsiErr } = await supabase.from('beginning_stock_items').insert(payloadItems)
      if (bsiErr) throw bsiErr

      // Update product stock
      for (const it of items) {
        const prod = products.find((p) => p.id === it.product_id)
        const current = Number(prod?.stock || 0)
        const next = current + Number(it.quantity || 0)
        const { error: sErr } = await supabase.from('products').update({ stock: next }).eq('id', it.product_id)
        if (sErr) throw sErr
      }

      toast.success('Beginning stock saved')
      logAction({ action: 'create_beginning_stock', targetType: 'beginning_stock', targetId: stockEntry?.id, targetLabel: `BS-${(stockEntry?.ref_no || stockEntry?.id) ?? ''}` })

      // Generate PDF
      const stockHtml = buildBeginningStockHtml({ items, totals, date, refNo })
      const base = `Beginning-Stock-${refNo || 'Stock'}`
      await exportBeginningStockPdf(stockHtml, `${safeFilename(base)}.pdf`)

      setPrintData({
        items,
        totals,
        date,
        refNo,
      })

      setRefNo('')
      setItems([])
      await load()
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to save beginning stock')
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
    <div className="space-y-4">
      <div className="fixed left-[-99999px] top-0">
        {printData ? (
          <div ref={printRef} className="bg-white text-black print-area">
            <div className="min-h-[297mm] flex flex-col" style={{ width: '210mm' }}>
              <div className="px-8 pt-3 pb-2 flex items-start justify-between border-b-2 border-slate-800">
                <div className="flex items-center gap-4">
                  <img src={logo} alt="Logo" className="h-24 w-24 rounded-lg object-contain" />
                  <div>
                    <div className="text-2xl font-bold leading-tight">Shayan's Kids</div>
                    <div className="text-base font-semibold text-slate-600">&amp; Toys Store</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold tracking-wide">BEGINNING STOCK</div>
                  <div className="text-sm text-slate-600 mt-1 font-medium">{printData.refNo || `BS-${new Date().getTime()}`}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{new Date(printData.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                </div>
              </div>

              <div className="px-8 py-2 flex justify-between border-b border-slate-200">
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Location</div>
                  <div className="text-sm text-slate-700 space-y-1">
                    <div className="font-bold text-slate-900">Shayan's Kids</div>
                    <div>10/3 B, Attidiya Road</div>
                    <div>Kawdana, Dehiwala</div>
                    <CompanyPhoneLines />
                    <div className="text-slate-500">shayankidscare@gmail.com</div>
                  </div>
                </div>

                <div className="text-left">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Type</div>
                  <div className="text-sm text-slate-700 space-y-1">
                    <div className="font-bold text-slate-900">Initial Stock Entry</div>
                    <div>Opening Balance Adjustment</div>
                  </div>
                </div>
              </div>

              <div className="px-8 py-1 flex-1 flex flex-col">
                <table className="w-full text-sm border border-black">
                  <thead>
                    <tr className="bg-white text-black">
                      <th className="border border-black text-left font-semibold px-3 py-2 text-xs uppercase tracking-wider">Item #</th>
                      <th className="border border-black text-left font-semibold px-3 py-2 text-xs uppercase tracking-wider">Description</th>
                      <th className="border border-black text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">Qty</th>
                      <th className="border border-black text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">Unit Cost</th>
                      <th className="border border-black text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">MRP</th>
                      <th className="border border-black text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(printData.items ?? []).map((it, idx) => (
                      <tr key={it.id} className={idx % 2 !== 0 ? 'bg-slate-50' : ''}>
                        <td className="border border-black px-3 py-1.5 text-slate-600">{it.code ?? '-'}</td>
                        <td className="border border-black px-3 py-1.5 text-slate-900 font-medium">{it.name ?? '-'}</td>
                        <td className="border border-black px-3 py-1.5 text-right text-slate-700">{it.quantity}</td>
                        <td className="border border-black px-3 py-1.5 text-right text-slate-700">Rs. {Number(it.cost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="border border-black px-3 py-1.5 text-right text-slate-700">{it.mrp ? `Rs. ${Number(it.mrp).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}</td>
                        <td className="border border-black px-3 py-1.5 text-right text-slate-900 font-semibold">Rs. {Number(it.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    {Array.from({ length: Math.max(0, 14 - (printData.items ?? []).length) }).map((_, i) => (
                      <tr key={`empty-${i}`}>
                        <td className="border border-black px-3 py-1">&nbsp;</td>
                        <td className="border border-black px-3 py-1"></td>
                        <td className="border border-black px-3 py-1"></td>
                        <td className="border border-black px-3 py-1"></td>
                        <td className="border border-black px-3 py-1"></td>
                        <td className="border border-black px-3 py-1"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-auto">
                <div className="px-8 pb-2 flex justify-end items-start">
                  <div className="w-full max-w-xs border border-slate-200 rounded">
                    <div className="px-4 py-1.5 flex justify-between text-sm">
                      <span className="text-slate-500">Amount</span>
                      <span className="text-slate-800">Rs. {Number(printData.totals?.totalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="px-4 py-2 bg-white flex justify-between items-center border-t-2 border-black">
                      <span className="text-black font-bold text-sm uppercase tracking-wider">Total</span>
                      <span className="text-black font-extrabold text-lg">Rs. {Number(printData.totals?.totalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
                <div className="px-8 py-2 grid grid-cols-3 gap-8 border-t border-slate-200">
                  <div>
                    <div className="border-b border-slate-300 pb-2 text-xs text-slate-500 uppercase tracking-wider font-medium">Prepared by</div>
                  </div>
                  <div>
                    <div className="border-b border-slate-300 pb-2 text-xs text-slate-500 uppercase tracking-wider font-medium">Checked By</div>
                  </div>
                  <div>
                    <div className="border-b border-slate-300 pb-2 text-xs text-slate-500 uppercase tracking-wider font-medium">Authorized by</div>
                  </div>
                </div>

                <div className="px-8 py-1 border-t-2 border-slate-800 text-center text-xs text-slate-500">
                  <div className="font-semibold text-slate-700">Shayan's Kids &amp; Toys Store</div>
                  <div>shayankidscare@gmail.com</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-9 bg-white dark:bg-emerald-950/35 border border-slate-200/60 dark:border-emerald-900/40 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200/60 dark:border-emerald-900/40 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-4">
              <ControlledDateField
                label="Date"
                value={date}
                onChange={setDate}
              />
            </div>

            <div className="md:col-span-4">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Ref No</div>
              <input
                value={refNo}
                readOnly
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-slate-100 dark:bg-slate-700 px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="p-4 border-b border-slate-200/60 dark:border-emerald-900/40">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Product Search</div>
                <div className="relative mt-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={productSearchRef}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search by code or name"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-emerald-50"
                  />
                </div>
                <div ref={prodDropdownRef} className="mt-2 relative">
                  <div
                    onClick={() => setProdDropdownOpen((v) => !v)}
                    className="w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50 cursor-pointer flex items-center justify-between"
                  >
                    <span className={selectedProductId ? '' : 'text-slate-400'}>
                      {selectedProductId ? (products.find((p) => p.id === selectedProductId)?.code ?? 'Select product') : 'Select product'}
                    </span>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${prodDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  {prodDropdownOpen ? (
                    <div className="absolute z-40 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredProducts.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-400">No products found</div>
                      ) : (
                        filteredProducts.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedProductId(p.id)
                              setDescription(p.name ?? '')
                              setProdDropdownOpen(false)
                              setProductSearch('')
                            }}
                            className={`px-3 py-2 text-sm cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-900/30 ${selectedProductId === p.id ? 'bg-emerald-50 dark:bg-emerald-900/20 font-medium' : ''}`}
                          >
                            <span className="text-slate-900 dark:text-emerald-50">{p.code}</span>
                            <span className="text-slate-400 dark:text-slate-500 ml-2">- {p.name}</span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setNewProdOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 transition-colors"
                >
                  <Plus size={13} />
                  New Product
                </button>
              </div>

              <div className="md:col-span-2">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Qty</div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={withCommas(qty)}
                  onChange={(e) => setQty(stripCommas(e.target.value))}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Cost</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={withCommas(cost)}
                  onChange={(e) => setCost(stripCommas(e.target.value))}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">MRP</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={withCommas(mrp)}
                  onChange={(e) => setMrp(stripCommas(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Description</div>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Exp Date</div>
                <input
                  type="month"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Remarks</div>
                <input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
                />
              </div>
            </div>

            {cost && mrp && Number(cost) > 0 && Number(mrp) > 0 ? (
              <div className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                Profit: {((Number(mrp) - Number(cost)) / Number(cost) * 100).toFixed(1)}% (Rs. {(Number(mrp) - Number(cost)).toFixed(2)} per unit)
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-slate-500 dark:text-emerald-100/60">
                {selectedProduct ? (
                  <span>
                    <span className="font-semibold text-slate-700 dark:text-emerald-50">Item Details:</span>
                    {' '}Stock: {selectedProduct.stock ?? 0} | Category: {selectedProduct.category ?? 'General'}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          </div>

          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-emerald-950/35 border border-slate-200/60 dark:border-emerald-900/40 text-slate-500 dark:text-emerald-100/70">
                  <tr>
                    <th className="text-left font-medium px-3 py-2 text-xs uppercase tracking-wide">Product</th>
                    <th className="text-right font-medium px-3 py-2 text-xs uppercase tracking-wide">Qty</th>
                    <th className="text-right font-medium px-3 py-2 text-xs uppercase tracking-wide">Cost</th>
                    <th className="text-right font-medium px-3 py-2 text-xs uppercase tracking-wide">MRP</th>
                    <th className="text-right font-medium px-3 py-2 text-xs uppercase tracking-wide">Profit %</th>
                    <th className="text-right font-medium px-3 py-2 text-xs uppercase tracking-wide">Total</th>
                    <th className="text-left font-medium px-3 py-2 text-xs uppercase tracking-wide">Description</th>
                    <th className="text-left font-medium px-3 py-2 text-xs uppercase tracking-wide">Exp</th>
                    <th className="text-left font-medium px-3 py-2 text-xs uppercase tracking-wide">Remarks</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-slate-400 dark:text-emerald-100/60">
                        Add items to beginning stock.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr key={it.id} className="border-b border-slate-100 dark:border-emerald-900/30">
                        <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-emerald-50">{it.code} - {it.name}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700 dark:text-emerald-100/80">{it.quantity}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700 dark:text-emerald-100/80">{fmt(it.cost)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700 dark:text-emerald-100/80">{it.mrp ? fmt(it.mrp) : '-'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-300">{it.profit_pct ? `${it.profit_pct}%` : '-'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-emerald-50">{fmt(it.total)}</td>
                        <td className="px-3 py-2.5 text-slate-500 dark:text-emerald-100/60">{it.description ?? '-'}</td>
                        <td className="px-3 py-2.5 text-slate-500 dark:text-emerald-100/60">{it.exp_date ?? '-'}</td>
                        <td className="px-3 py-2.5 text-slate-500 dark:text-emerald-100/60">{it.remarks ?? '-'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => removeItem(it.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" title="Remove">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Beginning Stock'}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-emerald-950/35 border border-slate-200/60 dark:border-emerald-900/40 rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900 dark:text-emerald-50">Summary</div>
            <Package size={16} className="text-slate-400" />
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-emerald-100/60">Total</span>
              <span className="font-bold text-slate-900 dark:text-white">{fmt(totals.totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-emerald-100/60">Items</span>
              <span className="text-slate-700 dark:text-emerald-50">{totals.totalItems}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-emerald-100/60">Quantity</span>
              <span className="text-slate-700 dark:text-emerald-50">{totals.totalQty}</span>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-200 flex gap-2">
            <AlertTriangle size={14} className="mt-0.5" />
            <div>
              Saving beginning stock will increase product stock. This is for initial inventory setup.
            </div>
          </div>
        </div>
      </div>

      {newProdOpen ? (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Add New Product</div>
              <button onClick={() => setNewProdOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
                <input
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-shadow"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Code</label>
                  <input
                    value={newProdCode}
                    onChange={(e) => setNewProdCode(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-shadow"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-shadow"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
                <input
                  value={newProdCategory}
                  onChange={(e) => setNewProdCategory(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-shadow"
                  placeholder="e.g. Toys, Clothes, Accessories"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewProdOpen(false)}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNewProduct}
                  disabled={newProdSaving}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {newProdSaving ? 'Saving...' : 'Add Product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

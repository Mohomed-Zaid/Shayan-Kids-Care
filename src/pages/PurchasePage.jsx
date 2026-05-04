import React, { useEffect, useMemo, useRef, useState } from 'react'
import html2pdf from 'html2pdf.js'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Plus, Search, Trash2, Save, AlertTriangle, X } from 'lucide-react'
import logo from '../pictures/logo.jpeg'

const fmt = (val) => `Rs. ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

const safeFilename = (name) => String(name || '').replace(/[\\/:*?"<>|]+/g, '-').trim()

const waitFor = async (predicate, { timeoutMs = 2000, intervalMs = 50 } = {}) => {
  const start = Date.now()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate()) return true
    if (Date.now() - start > timeoutMs) return false
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

const withCommas = (val) => {
  if (val === '' || val === undefined || val === null) return ''
  const str = String(val).replace(/,/g, '')
  if (!str) return ''
  const parts = str.split('.')
  parts[0] = Number(parts[0] || 0).toLocaleString()
  return parts.join('.')
}

const stripCommas = (val) => String(val).replace(/,/g, '')

export default function PurchasePage() {
  const toast = useToast()
  const productSearchRef = React.useRef(null)
  const grnRef = useRef(null)

  const [vendors, setVendors] = useState([])
  const [products, setProducts] = useState([])
  const [prevCosts, setPrevCosts] = useState([])

  const [grnData, setGrnData] = useState(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [vendorId, setVendorId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [refNo, setRefNo] = useState('')
  const [type, setType] = useState('purchase')
  const [paymentType, setPaymentType] = useState('cash')

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
    const [{ data: vData, error: vErr }, { data: pData, error: pErr }, { count, error: cErr }, { data: piData, error: piErr }] = await Promise.all([
      supabase.from('vendors').select('*').eq('status', 'active').order('name', { ascending: true }),
      supabase.from('products').select('*').order('name', { ascending: true }),
      supabase.from('purchases').select('*', { count: 'exact', head: true }),
      supabase
        .from('purchase_items')
        .select('id, product_id, cost, mrp, quantity, purchases(id, date, vendor_id, vendors(name))')
        .order('id', { ascending: false }),
    ])

    if (vErr) toast.error(vErr.message)
    if (pErr) toast.error(pErr.message)

    setVendors(vData ?? [])
    setProducts(pData ?? [])
    setPrevCosts(piData ?? [])
    setRefNo(`PUR-${String((count ?? 0) + 1).padStart(4, '0')}`)
    setLoading(false)
  }

  useEffect(() => {
    load().catch((e) => {
      console.error(e)
      toast.error('Failed to load purchase data')
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

  const vendor = useMemo(() => vendors.find((v) => v.id === vendorId) ?? null, [vendors, vendorId])

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return products.slice(0, 20)
    return products
      .filter((p) => (p.name ?? '').toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q))
      .slice(0, 20)
  }, [products, productSearch])

  const selectedProduct = useMemo(() => products.find((p) => p.id === selectedProductId) ?? null, [products, selectedProductId])

  const prevCostForProduct = useMemo(() => {
    if (!selectedProductId) return []
    const seen = new Set()
    const results = []
    for (const pi of prevCosts) {
      if (pi.product_id !== selectedProductId) continue
      const key = `${pi.cost}-${pi.purchases?.vendor_id ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        cost: pi.cost,
        mrp: pi.mrp,
        qty: pi.quantity,
        date: pi.purchases?.date ?? null,
        vendor: pi.purchases?.vendors?.name ?? 'Unknown',
      })
      if (results.length >= 3) break
    }
    return results
  }, [prevCosts, selectedProductId])

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

  const downloadGrnPdf = async (filename) => {
    if (!grnRef.current) return

    const wrapper = document.createElement('div')
    wrapper.className = 'pdf-export-wrapper'
    const cloned = grnRef.current.cloneNode(true)
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
      const isDarkHeader = el.classList.contains('bg-slate-800') || el.classList.contains('bg-slate-900') || el.closest('.bg-slate-800') || el.closest('.bg-slate-900')

      if (!isDarkHeader && !isTransparentBg && !isWhiteBg) {
        el.style.backgroundColor = '#ffffff'
      }

      if (!isDarkHeader) {
        el.style.color = '#000000'
      } else {
        el.style.color = '#ffffff'
      }
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
    if (!vendorId) {
      toast.error('Please select vendor')
      return
    }
    if (items.length === 0) {
      toast.error('Add at least one item')
      return
    }

    setSaving(true)
    try {
      const { data: purchase, error: pErr } = await supabase
        .from('purchases')
        .insert({ vendor_id: vendorId, date, ref_no: refNo.trim() || null, type, payment_type: paymentType, total_amount: totals.totalAmount })
        .select('*')
        .single()

      if (pErr) throw pErr

      const payloadItems = items.map((it) => ({
        purchase_id: purchase.id,
        product_id: it.product_id,
        quantity: it.quantity,
        cost: it.cost,
        mrp: it.mrp,
        description: it.description,
        total: it.total,
        exp_date: it.exp_date,
        remarks: it.remarks,
      }))

      const { error: piErr } = await supabase.from('purchase_items').insert(payloadItems)
      if (piErr) throw piErr

      // Update stock (best-effort)
      for (const it of items) {
        const prod = products.find((p) => p.id === it.product_id)
        const current = Number(prod?.stock || 0)
        const next = current + Number(it.quantity || 0)
        const { error: sErr } = await supabase.from('products').update({ stock: next }).eq('id', it.product_id)
        if (sErr) throw sErr
      }

      toast.success('Purchase saved')
      logAction({ action: 'create_purchase', targetType: 'purchase', targetId: purchase?.id, targetLabel: `PUR-${purchase?.id ?? ''}` })

      const vendorName = vendor?.name ?? ''
      setGrnData({
        purchase,
        vendor,
        items,
        totals,
        createdAt: new Date().toISOString(),
      })

      const ready = await waitFor(() => !!grnRef.current)
      if (!ready) {
        throw new Error('GRN preview not ready')
      }
      const base = `GRN-${purchase?.ref_no || purchase?.id || 'purchase'}-${vendorName || 'Vendor'}`
      await downloadGrnPdf(`${safeFilename(base)}.pdf`)

      setVendorId('')
      setRefNo('')
      setType('purchase')
      setPaymentType('cash')
      setItems([])
      await load()
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to save purchase')
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
        {grnData ? (
          <div ref={grnRef} className="bg-white text-black">
            <div className="min-h-[297mm] flex flex-col" style={{ width: '210mm' }}>
              {/* Header — same as invoice */}
              <div className="px-8 pt-3 pb-2 flex items-start justify-between border-b-2 border-slate-800">
                <div className="flex items-center gap-4">
                  <img src={logo} alt="Logo" className="h-24 w-24 rounded-lg object-contain" />
                  <div>
                    <div className="text-2xl font-bold leading-tight">Shayan Kids Care</div>
                    <div className="text-base font-semibold text-slate-600">&amp; Toys Store</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold tracking-wide">GOODS RECEIVED NOTE</div>
                  <div className="text-sm text-slate-600 mt-1 font-medium">{grnData.purchase?.ref_no || `P-${grnData.purchase?.id ?? ''}`}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{new Date(grnData.purchase?.date || grnData.purchase?.created_at || grnData.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                </div>
              </div>

              {/* From / Vendor — normal like invoice */}
              <div className="px-8 py-2 flex justify-between border-b border-slate-200">
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">From</div>
                  <div className="text-sm text-slate-700 space-y-1">
                    <div className="font-bold text-slate-900">Shayan Kids Care</div>
                    <div>10/3 B, Attidiya Road</div>
                    <div>Kawdana, Dehiwala</div>
                    <div>+94 75 384 1599</div>
                    <div className="text-slate-500">shayankidscare@gmail.com</div>
                  </div>
                </div>

                <div className="text-left">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Vendor</div>
                  <div className="text-sm text-slate-700 space-y-1">
                    <div className="font-bold text-slate-900">{grnData.vendor?.name ?? '-'}</div>
                    <div>{grnData.vendor?.address ?? '-'}</div>
                    <div>{grnData.vendor?.phone ?? '-'}</div>
                    <div className="text-sm"><span className="font-medium text-slate-600">Payment:</span> <span className="font-semibold text-slate-900">{grnData.purchase?.payment_type === 'cash' ? 'Cash' : 'Credit'}</span></div>
                  </div>
                </div>
              </div>

              {/* Items Table — bordered table */}
              <div className="px-8 py-1 flex-1 flex flex-col">
                <table className="w-full text-sm border border-black">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="border border-black text-left font-semibold px-3 py-2 text-xs uppercase tracking-wider">Item #</th>
                      <th className="border border-black text-left font-semibold px-3 py-2 text-xs uppercase tracking-wider">Description</th>
                      <th className="border border-black text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">Qty</th>
                      <th className="border border-black text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">Unit Cost</th>
                      <th className="border border-black text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">MRP</th>
                      <th className="border border-black text-right font-semibold px-3 py-2 text-xs uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(grnData.items ?? []).map((it, idx) => (
                      <tr key={it.id} className={idx % 2 !== 0 ? 'bg-slate-50' : ''}>
                        <td className="border border-black px-3 py-1.5 text-slate-600">{it.code ?? '-'}</td>
                        <td className="border border-black px-3 py-1.5 text-slate-900 font-medium">{it.name ?? '-'}</td>
                        <td className="border border-black px-3 py-1.5 text-right text-slate-700">{it.quantity}</td>
                        <td className="border border-black px-3 py-1.5 text-right text-slate-700">Rs. {Number(it.cost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="border border-black px-3 py-1.5 text-right text-slate-700">{it.mrp ? `Rs. ${Number(it.mrp).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}</td>
                        <td className="border border-black px-3 py-1.5 text-right text-slate-900 font-semibold">Rs. {Number(it.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    {Array.from({ length: Math.max(0, 14 - (grnData.items ?? []).length) }).map((_, i) => (
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

              {/* Totals + Signature — normal like invoice */}
              <div className="mt-auto">
                <div className="px-8 pb-2 flex justify-end items-start">
                  <div className="w-full max-w-xs border border-slate-200 rounded">
                    <div className="px-4 py-1.5 flex justify-between text-sm">
                      <span className="text-slate-500">Amount</span>
                      <span className="text-slate-800">Rs. {Number(grnData.totals?.totalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="px-4 py-2 bg-slate-800 flex justify-between items-center border-t-2 border-slate-800">
                      <span className="text-white font-bold text-sm uppercase tracking-wider">Total</span>
                      <span className="text-white font-extrabold text-lg">Rs. {Number(grnData.totals?.totalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
                <div className="px-8 py-2 grid grid-cols-3 gap-8 border-t border-slate-200">
                  <div>
                    <div className="border-b border-slate-300 pb-2 text-xs text-slate-500 uppercase tracking-wider font-medium">Purchased by</div>
                  </div>
                  <div>
                    <div className="border-b border-slate-300 pb-2 text-xs text-slate-500 uppercase tracking-wider font-medium">Checked By</div>
                  </div>
                  <div>
                    <div className="border-b border-slate-300 pb-2 text-xs text-slate-500 uppercase tracking-wider font-medium">Authorized by</div>
                  </div>
                </div>

                <div className="px-8 py-1 border-t-2 border-slate-800 text-center text-xs text-slate-500">
                  <div className="font-semibold text-slate-700">Shayan Kids Care &amp; Toys Store</div>
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
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Select Vendor</div>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
              >
                <option value="" className="text-slate-900">Please select vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id} className="text-slate-900">{v.name}</option>
                ))}
              </select>
              {!vendorId ? (
                <div className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-300">PLEASE SELECT VENDOR</div>
              ) : null}
            </div>

            <div className="md:col-span-3">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Date</div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
              />
            </div>

            <div className="md:col-span-3">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Ref No</div>
              <input
                value={refNo}
                readOnly
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-slate-100 dark:bg-slate-700 px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed"
              />
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Type</div>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
              >
                <option value="purchase" className="text-slate-900">Purchase</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Payment Type</div>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
              >
                <option value="cash" className="text-slate-900">Cash</option>
                <option value="credit" className="text-slate-900">Credit</option>
                <option value="bank" className="text-slate-900">Bank</option>
              </select>
            </div>
          </div>

          {/* Add item */}
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
              {prevCostForProduct.length > 0 && (
                <div className="mt-2 rounded-lg border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-500/10 p-2.5 text-xs text-blue-700 dark:text-blue-200 space-y-1">
                  <div className="font-bold text-blue-800 dark:text-blue-100 mb-1">Previous Purchase Cost</div>
                  {prevCostForProduct.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="font-semibold">{fmt(h.cost)}</span>
                      {h.mrp ? <span className="text-blue-500 dark:text-blue-300">MRP: {fmt(h.mrp)}</span> : null}
                      <span className="text-blue-400 dark:text-blue-300">•</span>
                      <span>{h.vendor}</span>
                      {h.date ? <span className="text-blue-400 dark:text-blue-300">• {new Date(h.date).toLocaleDateString()}</span> : null}
                    </div>
                  ))}
                </div>
              )}
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

          {/* Items table */}
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
                        Add items to this purchase.
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

            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-slate-500 dark:text-emerald-100/60">
                {vendor ? (
                  <span>
                    <span className="font-semibold text-slate-700 dark:text-emerald-50">Vendor:</span> {vendor.name}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Purchase'}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-emerald-950/35 border border-slate-200/60 dark:border-emerald-900/40 rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900 dark:text-emerald-50">Summary</div>
            <div className="text-xs text-slate-500 dark:text-emerald-100/60">{type === 'purchase' ? 'Purchase' : '-'}</div>
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
              Saving a purchase will increase product stock.
            </div>
          </div>
        </div>
      </div>

      {/* New Product Modal */}
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

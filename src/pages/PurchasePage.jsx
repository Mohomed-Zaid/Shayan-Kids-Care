import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import { Plus, Search, Trash2, Save, AlertTriangle } from 'lucide-react'

const fmt = (val) => `Rs. ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

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

  const [vendors, setVendors] = useState([])
  const [products, setProducts] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [vendorId, setVendorId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [refNo, setRefNo] = useState('')
  const [type, setType] = useState('purchase')

  const [productSearch, setProductSearch] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')

  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [mrp, setMrp] = useState('')
  const [description, setDescription] = useState('')
  const [remarks, setRemarks] = useState('')
  const [expDate, setExpDate] = useState('')

  const [items, setItems] = useState([])

  const load = async () => {
    setLoading(true)
    const [{ data: vData, error: vErr }, { data: pData, error: pErr }] = await Promise.all([
      supabase.from('vendors').select('*').eq('status', 'active').order('name', { ascending: true }),
      supabase.from('products').select('*').order('name', { ascending: true }),
    ])

    if (vErr) toast.error(vErr.message)
    if (pErr) toast.error(pErr.message)

    setVendors(vData ?? [])
    setProducts(pData ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load().catch((e) => {
      console.error(e)
      toast.error('Failed to load purchase data')
      setLoading(false)
    })
  }, [])

  const vendor = useMemo(() => vendors.find((v) => v.id === vendorId) ?? null, [vendors, vendorId])

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
  }

  const removeItem = (id) => setItems((prev) => prev.filter((x) => x.id !== id))

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
        .insert({ vendor_id: vendorId, date, ref_no: refNo.trim() || null, type, total_amount: totals.totalAmount })
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
      setVendorId('')
      setRefNo('')
      setType('purchase')
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
                onChange={(e) => setRefNo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
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
          </div>

          {/* Add item */}
          <div className="p-4 border-b border-slate-200/60 dark:border-emerald-900/40">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Product Search</div>
                <div className="relative mt-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search by code or name"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-emerald-50"
                  />
                </div>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
                >
                  <option value="" className="text-slate-900">Select product</option>
                  {filteredProducts.map((p) => (
                    <option key={p.id} value={p.id} className="text-slate-900">{p.code} - {p.name}</option>
                  ))}
                </select>
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
    </div>
  )
}

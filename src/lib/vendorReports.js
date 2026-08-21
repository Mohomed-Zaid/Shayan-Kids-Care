const INVALID = new Set(['cancelled', 'canceled', 'deleted', 'void', 'reversed'])
const VALID_RETURNS = new Set(['posted', 'completed'])

export const amount = (value) => Number(value || 0)
export const dayKey = (value) => value ? String(value).slice(0, 10) : ''
export const purchaseNumber = (row) => row?.purchase_number || `PUR-${String(row?.id || '').slice(0, 8).toUpperCase()}`
export const agingBucket = (days) => days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : days <= 120 ? '91-120' : '120+'
export const paymentStatus = (paid, balance) => balance <= 0.005 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'
export const inRange = (value, from, to) => { const day = dayKey(value); return !!day && (!from || day >= from) && (!to || day <= to) }
const valid = (row) => !INVALID.has(String(row?.status || '').toLowerCase())
const createdBy = (row) => row?.created_by || row?.updated_by || row?.user_name || row?.user_email || 'System'

function returnCredit(purchase, purchaseItems, row, returnItems) {
  if (row.total_amount != null) return amount(row.total_amount)
  const costs = new Map(purchaseItems.filter((item) => item.purchase_id === purchase.id).map((item) => [item.product_id, amount(item.cost)]))
  return returnItems.filter((item) => item.purchase_return_id === row.id).reduce((sum, item) => sum + amount(item.quantity) * amount(item.cost ?? costs.get(item.product_id)), 0)
}

export function buildVendorReportData(raw, today = new Date()) {
  const vendors = raw.vendors || [], products = raw.products || []
  const purchases = (raw.purchases || []).filter(valid), items = raw.purchaseItems || []
  const payments = (raw.purchasePayments || []).filter(valid)
  const purchaseReturns = (raw.purchaseReturns || []).filter((row) => VALID_RETURNS.has(String(row.status || 'posted').toLowerCase()))
  const purchaseReturnItems = raw.purchaseReturnItems || []
  const vendorMap = new Map(vendors.map((row) => [row.id, row])), productMap = new Map(products.map((row) => [row.id, row]))
  const paymentsByPurchase = new Map(), itemsByPurchase = new Map(), returnsByPurchase = new Map()
  payments.forEach((row) => paymentsByPurchase.set(row.purchase_id, [...(paymentsByPurchase.get(row.purchase_id) || []), row]))
  items.forEach((row) => itemsByPurchase.set(row.purchase_id, [...(itemsByPurchase.get(row.purchase_id) || []), row]))
  purchaseReturns.forEach((row) => returnsByPurchase.set(row.purchase_id, [...(returnsByPurchase.get(row.purchase_id) || []), row]))
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const purchaseRecords = purchases.map((purchase) => {
    const vendor = vendorMap.get(purchase.vendor_id) || {}, purchaseItems = itemsByPurchase.get(purchase.id) || []
    const purchasePayments = (paymentsByPurchase.get(purchase.id) || []).sort((a, b) => new Date(a.paid_at || a.created_at) - new Date(b.paid_at || b.created_at))
    const returns = returnsByPurchase.get(purchase.id) || []
    const returnTotal = returns.reduce((sum, row) => sum + returnCredit(purchase, purchaseItems, row, purchaseReturnItems), 0)
    const total = amount(purchase.total_amount), paid = purchasePayments.reduce((sum, row) => sum + amount(row.amount), 0)
    const balance = Math.max(0, total - paid - returnTotal), date = purchase.date || purchase.purchase_date || purchase.created_at
    const dateValue = date ? new Date(`${dayKey(date)}T00:00:00`) : startToday
    const days = Math.max(0, Math.floor((startToday - dateValue) / 86400000))
    return { ...purchase, vendor, date, purchaseNumber: purchaseNumber(purchase), payments: purchasePayments, items: purchaseItems, returns, total, paid, returnTotal, balance, days, bucket: agingBucket(days), paymentStatus: paymentStatus(paid + returnTotal, balance), lastPaymentDate: purchasePayments.at(-1)?.paid_at || purchasePayments.at(-1)?.created_at || '', recordedBy: createdBy(purchase) }
  })
  const purchaseRecordMap = new Map(purchaseRecords.map((row) => [row.id, row]))

  const paymentRows = payments.map((payment) => {
    const purchase = purchaseRecordMap.get(payment.purchase_id)
    if (!purchase) return null
    const index = purchase.payments.findIndex((row) => row.id === payment.id)
    const prior = purchase.payments.slice(0, Math.max(0, index)).reduce((sum, row) => sum + amount(row.amount), 0)
    const paymentDay = dayKey(payment.paid_at || payment.created_at)
    const creditsBefore = purchase.returns.filter((row) => dayKey(row.return_date || row.created_at) <= paymentDay).reduce((sum, row) => sum + returnCredit(purchase, purchase.items, row, purchaseReturnItems), 0)
    const previousBalance = Math.max(0, purchase.total - creditsBefore - prior), method = String(payment.method || 'other').toLowerCase()
    return { ...payment, vendorId: purchase.vendor_id, vendor: purchase.vendor, purchaseNumber: purchase.purchaseNumber, purchaseTotal: purchase.total, previousBalance, remainingBalance: Math.max(0, previousBalance - amount(payment.amount)), method, chequeNumber: method === 'cheque' ? payment.reference || '' : '', chequeDate: method === 'cheque' ? payment.paid_at : '', chequeStatus: method === 'cheque' ? String(payment.status || 'deposited').toLowerCase() : '', recordedBy: createdBy(payment) }
  }).filter(Boolean)

  const itemRows = items.map((item) => {
    const purchase = purchaseRecordMap.get(item.purchase_id)
    if (!purchase) return null
    const product = productMap.get(item.product_id) || {}
    return { ...item, vendorId: purchase.vendor_id, vendor: purchase.vendor, purchase, product, date: purchase.date, purchaseNumber: purchase.purchaseNumber, lineTotal: amount(item.total ?? amount(item.quantity) * amount(item.cost)), recordedBy: purchase.recordedBy }
  }).filter(Boolean)

  const returnRows = purchaseReturns.map((row) => {
    const purchase = purchaseRecordMap.get(row.purchase_id)
    return purchase ? { ...row, vendorId: purchase.vendor_id, vendor: purchase.vendor, purchaseNumber: purchase.purchaseNumber, amount: returnCredit(purchase, purchase.items, row, purchaseReturnItems), recordedBy: createdBy(row) } : null
  }).filter(Boolean)

  const vendorRows = vendors.map((vendor) => {
    const vendorPurchases = purchaseRecords.filter((row) => row.vendor_id === vendor.id), vendorItems = itemRows.filter((row) => row.vendorId === vendor.id), vendorPayments = paymentRows.filter((row) => row.vendorId === vendor.id)
    const outstanding = vendorPurchases.reduce((sum, row) => sum + row.balance, 0), totalValue = vendorPurchases.reduce((sum, row) => sum + row.total, 0)
    const purchaseDates = vendorPurchases.map((row) => row.date).filter(Boolean).sort(), paymentDates = vendorPayments.map((row) => row.paid_at || row.created_at).filter(Boolean).sort()
    const open = vendorPurchases.filter((row) => row.balance > 0.005).sort((a, b) => new Date(a.date) - new Date(b.date))
    const lastItem = [...vendorItems].sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    const methodValue = (method) => vendorPurchases.filter((row) => String(row.payment_type || row.type || '').toLowerCase() === method).reduce((sum, row) => sum + row.total, 0)
    const cheques = vendorPayments.filter((row) => row.method === 'cheque')
    return {
      ...vendor,
      vendorCode: vendor.code || `VEN-${String(vendor.id || '').slice(0, 6).toUpperCase()}`,
      purchaseCount: vendorPurchases.length,
      totalQuantity: vendorItems.reduce((sum, row) => sum + amount(row.quantity), 0),
      purchaseValue: totalValue,
      paymentsMade: vendorPayments.reduce((sum, row) => sum + amount(row.amount), 0),
      returns: vendorPurchases.reduce((sum, row) => sum + row.returnTotal, 0),
      outstanding,
      cashPurchases: methodValue('cash'),
      creditPurchases: methodValue('credit'),
      bankPurchases: vendorPurchases.filter((row) => ['bank', 'cheque'].includes(String(row.payment_type || row.type || '').toLowerCase())).reduce((sum, row) => sum + row.total, 0),
      chequePayments: cheques.reduce((sum, row) => sum + amount(row.amount), 0),
      outstandingCheques: cheques.filter((row) => row.chequeStatus !== 'deposited').reduce((sum, row) => sum + amount(row.amount), 0),
      firstPurchaseDate: purchaseDates[0] || '', lastPurchaseDate: purchaseDates.at(-1) || '', lastPaymentDate: paymentDates.at(-1) || '',
      oldestOutstandingPurchase: open[0]?.purchaseNumber || '', maximumAgingDays: Math.max(0, ...open.map((row) => row.days)),
      averagePurchaseValue: vendorPurchases.length ? totalValue / vendorPurchases.length : 0,
      productsSupplied: new Set(vendorItems.map((row) => row.product_id)).size,
      lastProductPurchased: lastItem?.product?.name || '',
      accountStatus: outstanding > 0.005 ? 'Outstanding' : vendorPurchases.length ? 'Clear' : 'No Activity',
      purchases: vendorPurchases, payments: vendorPayments, items: vendorItems,
    }
  })
  return { vendors, products, purchaseRecords, paymentRows, itemRows, returnRows, vendorRows, purchaseRecordMap, vendorMap, productMap, auditLogs: raw.auditLogs || [] }
}

export function buildStatement(model, vendorId, from, to) {
  if (!vendorId) return { opening: 0, rows: [], totals: { purchases: 0, payments: 0, returns: 0, closing: 0 } }
  const transactions = []
  model.purchaseRecords.filter((row) => row.vendor_id === vendorId).forEach((row) => transactions.push({ id: `purchase-${row.id}`, date: row.date, reference: row.purchaseNumber, transactionType: 'Purchase', description: `Purchase ${row.purchaseNumber}`, debit: row.total, credit: 0, method: row.payment_type || row.type || '', status: row.paymentStatus, recordedBy: row.recordedBy }))
  model.paymentRows.filter((row) => row.vendorId === vendorId).forEach((row) => transactions.push({ id: `payment-${row.id}`, date: row.paid_at || row.created_at, reference: row.reference || `PAY-${String(row.id).slice(0, 8).toUpperCase()}`, transactionType: row.method === 'cheque' ? 'Cheque Payment' : 'Vendor Payment', description: `${row.method.toUpperCase()} payment for ${row.purchaseNumber}`, debit: 0, credit: amount(row.amount), method: row.method, status: row.chequeStatus || 'Recorded', recordedBy: row.recordedBy }))
  model.returnRows.filter((row) => row.vendorId === vendorId).forEach((row) => transactions.push({ id: `return-${row.id}`, date: row.return_date || row.created_at, reference: row.return_number || String(row.id).slice(0, 8), transactionType: 'Purchase Return', description: `Return against ${row.purchaseNumber}`, debit: 0, credit: row.amount, method: '', status: row.status || 'Posted', recordedBy: row.recordedBy }))
  transactions.sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.id).localeCompare(String(b.id)))
  const opening = transactions.filter((row) => dayKey(row.date) < from).reduce((sum, row) => sum + row.debit - row.credit, 0)
  let running = opening
  const rows = transactions.filter((row) => inRange(row.date, from, to)).map((row) => ({ ...row, runningBalance: (running += row.debit - row.credit) }))
  const totals = rows.reduce((out, row) => { if (row.transactionType === 'Purchase') out.purchases += row.debit; else if (row.transactionType === 'Purchase Return') out.returns += row.credit; else out.payments += row.credit; return out }, { purchases: 0, payments: 0, returns: 0 })
  totals.closing = running
  return { opening, rows, totals }
}

export function buildProductRows(model) {
  const groups = new Map()
  model.itemRows.forEach((row) => {
    const key = `${row.vendorId}|${row.product_id}`
    const entry = groups.get(key) || { id: key, vendorId: row.vendorId, vendor: row.vendor?.name || '-', productId: row.product_id, productCode: row.product?.code || '-', productName: row.product?.name || '-', purchaseIds: new Set(), quantity: 0, dates: [], costs: [], latestCost: 0, latestMrp: 0, purchaseValue: 0, currentStock: amount(row.product?.stock) }
    entry.purchaseIds.add(row.purchase_id); entry.quantity += amount(row.quantity); entry.dates.push(row.date); entry.costs.push(amount(row.cost)); entry.purchaseValue += row.lineTotal
    if (!entry.latestDate || new Date(row.date) > new Date(entry.latestDate)) { entry.latestDate = row.date; entry.latestCost = amount(row.cost); entry.latestMrp = amount(row.mrp ?? row.product?.price) }
    groups.set(key, entry)
  })
  return [...groups.values()].map((row) => ({ ...row, purchaseCount: row.purchaseIds.size, firstPurchaseDate: [...row.dates].sort()[0], lastPurchaseDate: [...row.dates].sort().at(-1), lowestCost: Math.min(...row.costs), highestCost: Math.max(...row.costs), averageCost: row.costs.reduce((sum, cost) => sum + cost, 0) / row.costs.length }))
}

export function buildCostRows(model) {
  const byProduct = new Map(), rows = []
  model.itemRows.forEach((row) => byProduct.set(row.product_id, [...(byProduct.get(row.product_id) || []), row]))
  byProduct.forEach((items) => {
    const ordered = [...items].sort((a, b) => new Date(a.date) - new Date(b.date))
    ordered.forEach((row, index) => {
      const previousCost = index ? amount(ordered[index - 1].cost) : 0, cost = amount(row.cost), mrp = amount(row.mrp ?? row.product?.price), difference = index ? cost - previousCost : 0
      rows.push({ id: row.id, date: row.date, vendorId: row.vendorId, vendor: row.vendor?.name || '-', productId: row.product_id, productCode: row.product?.code || '-', productName: row.product?.name || '-', purchaseNumber: row.purchaseNumber, quantity: amount(row.quantity), unitCost: cost, previousCost: index ? previousCost : null, costDifference: difference, costChange: index && previousCost ? difference / previousCost * 100 : 0, mrp, expectedMargin: mrp ? (mrp - cost) / mrp * 100 : 0 })
    })
  })
  return rows
}

export function buildActivityRows(model) {
  const rows = []
  model.vendors.forEach((vendor) => { if (vendor.created_at) rows.push({ id: `vendor-${vendor.id}`, date: vendor.created_at, vendorId: vendor.id, vendor: vendor.name, activity: 'Vendor Created', reference: vendor.code || '', amount: 0, user: createdBy(vendor), description: 'Vendor account created' }) })
  model.purchaseRecords.forEach((row) => rows.push({ id: `purchase-${row.id}`, date: row.created_at || row.date, vendorId: row.vendor_id, vendor: row.vendor?.name || '-', activity: 'Purchase Created', reference: row.purchaseNumber, amount: row.total, user: row.recordedBy, description: row.ref_no ? `Reference ${row.ref_no}` : 'Purchase recorded' }))
  model.paymentRows.forEach((row) => rows.push({ id: `payment-${row.id}`, date: row.created_at || row.paid_at, vendorId: row.vendorId, vendor: row.vendor?.name || '-', activity: row.method === 'cheque' ? 'Cheque Issued' : 'Payment Made', reference: row.reference || row.purchaseNumber, amount: amount(row.amount), user: row.recordedBy, description: `${row.method.toUpperCase()} payment for ${row.purchaseNumber}` }))
  model.returnRows.forEach((row) => rows.push({ id: `return-${row.id}`, date: row.created_at || row.return_date, vendorId: row.vendorId, vendor: row.vendor?.name || '-', activity: 'Purchase Return', reference: row.return_number || row.purchaseNumber, amount: row.amount, user: row.recordedBy, description: row.reason || `Return against ${row.purchaseNumber}` }))
  const purchaseIds = new Map(model.purchaseRecords.map((row) => [String(row.id), row.vendor_id])), paymentIds = new Map(model.paymentRows.map((row) => [String(row.id), row.vendorId]))
  model.auditLogs.forEach((log) => {
    let vendorId = log.details?.vendor_id || (String(log.target_type || '').includes('vendor') ? log.target_id : null)
    if (String(log.target_type || '').includes('purchase_payment')) vendorId = paymentIds.get(String(log.target_id)) || vendorId
    else if (String(log.target_type || '').includes('purchase')) vendorId = purchaseIds.get(String(log.target_id)) || vendorId
    const vendor = model.vendorMap.get(String(vendorId))
    if (!vendor && !log.details?.vendor_name) return
    rows.push({ id: `audit-${log.id}`, date: log.created_at, vendorId, vendor: vendor?.name || log.details?.vendor_name || '-', activity: log.action === 'reverse_purchase' ? 'Purchase Reversed' : String(log.action || 'Activity').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()), reference: log.target_label || '', amount: amount(log.details?.purchase_total ?? log.details?.amount), user: log.user_name || log.user_email || createdBy(log), description: log.details?.reason || (typeof log.details === 'string' ? log.details : log.details ? JSON.stringify(log.details) : log.target_label || '') })
  })
  return rows.filter((row) => row.date).sort((a, b) => new Date(b.date) - new Date(a.date))
}

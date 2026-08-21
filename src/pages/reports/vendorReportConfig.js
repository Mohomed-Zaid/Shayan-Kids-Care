import { amount, buildActivityRows, buildCostRows, buildProductRows, buildStatement, inRange } from '../../lib/vendorReports'

export const REPORTS = [
  ['overview','Detailed Vendor Report'],['statement','Vendor Statement'],['ledger','Vendor Ledger'],
  ['purchases','Purchase History'],['outstanding','Outstanding'],['aging','Aging'],
  ['payments','Payment History'],['cheques','Cheque Report'],['products','Product Report'],
  ['costs','Cost History'],['activity','Activity Report'],
]
const c = (label,key,type='text') => ({label,key,type})
export const COLUMNS = {
  overview: [c('Vendor Code','vendorCode'),c('Vendor Name','name'),c('Address','address'),c('Phone','phone'),c('Status','status'),c('Total Purchases','purchaseCount','number'),c('Number of Purchases','purchaseCount','number'),c('Total Quantity','totalQuantity','number'),c('Purchase Value','purchaseValue','money'),c('Payments Made','paymentsMade','money'),c('Outstanding','outstanding','money'),c('Cash Purchases','cashPurchases','money'),c('Credit Purchases','creditPurchases','money'),c('Bank Purchases','bankPurchases','money'),c('Cheque Payments','chequePayments','money'),c('Outstanding Cheques','outstandingCheques','money'),c('First Purchase','firstPurchaseDate','date'),c('Last Purchase','lastPurchaseDate','date'),c('Last Payment','lastPaymentDate','date'),c('Oldest Outstanding','oldestOutstandingPurchase'),c('Maximum Aging','maximumAgingDays','days'),c('Average Purchase','averagePurchaseValue','money'),c('Products Supplied','productsSupplied','number'),c('Last Product','lastProductPurchased'),c('Account Status','accountStatus')],
  statement: [c('Date','date','date'),c('Reference','reference'),c('Transaction Type','transactionType'),c('Description','description'),c('Debit','debit','money'),c('Credit','credit','money'),c('Running Balance','runningBalance','money')],
  ledger: [c('Date','date','date'),c('Reference','reference'),c('Transaction Type','transactionType'),c('Description','description'),c('Purchase / Debit','debit','money'),c('Payment / Credit','credit','money'),c('Running Balance','runningBalance','money'),c('Payment Method','method'),c('Status','status'),c('Recorded By','recordedBy')],
  purchases: [c('Purchase No','purchaseNumber'),c('Purchase Date','date','date'),c('Reference No','reference'),c('Product Code','productCode'),c('Product Name','productName'),c('Quantity','quantity','number'),c('Unit Cost','unitCost','money'),c('MRP','mrp','money'),c('Line Total','lineTotal','money'),c('Purchase Total','purchaseTotal','money'),c('Payment Type','paymentType'),c('Amount Paid','paid','money'),c('Outstanding','outstanding','money'),c('Payment Status','paymentStatus'),c('Created By','recordedBy')],
  outstanding: [c('Vendor','vendorName'),c('Purchase Number','purchaseNumber'),c('Purchase Date','date','date'),c('Original Amount','total','money'),c('Amount Paid','paid','money'),c('Returns / Credits','returnTotal','money'),c('Outstanding Balance','balance','money'),c('Last Payment','lastPaymentDate','date'),c('Days Outstanding','days','number'),c('Aging Bucket','bucket'),c('Payment Status','paymentStatus')],
  aging: [c('Vendor','vendorName'),c('Purchase No','purchaseNumber'),c('Purchase Date','date','date'),c('Purchase Amount','total','money'),c('Paid','paid','money'),c('Balance','balance','money'),c('0-30','age0','money'),c('31-60','age31','money'),c('61-90','age61','money'),c('91-120','age91','money'),c('120+','age120','money'),c('Total Outstanding','balance','money')],
  agingGroup: [c('Vendor','vendorName'),c('0-30','age0','money'),c('31-60','age31','money'),c('61-90','age61','money'),c('91-120','age91','money'),c('120+','age120','money'),c('Total','balance','money')],
  payments: [c('Payment Date','date','date'),c('Vendor','vendorName'),c('Purchase Number','purchaseNumber'),c('Original Amount','purchaseTotal','money'),c('Payment Amount','paymentAmount','money'),c('Payment Method','method'),c('Bank','bankName'),c('Reference','reference'),c('Cheque Number','chequeNumber'),c('Cheque Date','chequeDate','date'),c('Previous Balance','previousBalance','money'),c('Remaining Balance','remainingBalance','money'),c('Note','note'),c('Recorded By','recordedBy'),c('Created Date / Time','created_at','datetime')],
  cheques: [c('Vendor','vendorName'),c('Purchase Number','purchaseNumber'),c('Cheque Number','chequeNumber'),c('Bank','bankName'),c('Cheque Date','chequeDate','date'),c('Amount','paymentAmount','money'),c('Status','chequeStatus'),c('Reference','reference'),c('Payment Date','date','date'),c('Days Until Due','daysUntilDue','days'),c('Recorded By','recordedBy')],
  products: [c('Vendor','vendor'),c('Product Code','productCode'),c('Product Name','productName'),c('Number of Purchases','purchaseCount','number'),c('Total Quantity','quantity','number'),c('First Purchase','firstPurchaseDate','date'),c('Last Purchase','lastPurchaseDate','date'),c('Lowest Cost','lowestCost','money'),c('Highest Cost','highestCost','money'),c('Average Cost','averageCost','money'),c('Latest Cost','latestCost','money'),c('Latest MRP','latestMrp','money'),c('Purchase Value','purchaseValue','money'),c('Current Stock','currentStock','number')],
  costs: [c('Date','date','date'),c('Vendor','vendor'),c('Product Code','productCode'),c('Product Name','productName'),c('Purchase Number','purchaseNumber'),c('Quantity','quantity','number'),c('Unit Cost','unitCost','money'),c('Previous Cost','previousCost','money'),c('Cost Difference','costDifference','money'),c('Cost Change %','costChange','percent'),c('MRP','mrp','money'),c('Expected Margin','expectedMargin','percent')],
  activity: [c('Date & Time','date','datetime'),c('Vendor','vendor'),c('Activity','activity'),c('Reference','reference'),c('Amount','amount','money'),c('User','user'),c('Description','description')],
}

function purchaseRows(model, grouping) {
  const lines = model.itemRows.map((row) => ({ id: row.id, vendorId: row.vendorId, productId: row.product_id, vendorName: row.vendor?.name || '-', purchaseNumber: row.purchaseNumber, date: row.date, reference: row.purchase.ref_no || '', productCode: row.product?.code || '-', productName: row.product?.name || '-', quantity: amount(row.quantity), unitCost: amount(row.cost), mrp: amount(row.mrp ?? row.product?.price), lineTotal: row.lineTotal, purchaseTotal: row.purchase.total, paymentType: row.purchase.payment_type || row.purchase.type || '', paid: row.purchase.paid, outstanding: row.purchase.balance, paymentStatus: row.purchase.paymentStatus, recordedBy: row.recordedBy }))
  if (grouping === 'line') return lines
  const groups = new Map()
  lines.forEach((row) => {
    const key = grouping === 'purchase' ? row.purchaseNumber : grouping === 'product' ? `${row.vendorId}|${row.productId}` : `${row.vendorId}|${String(row.date).slice(0, 7)}`
    let out = groups.get(key)
    if (!out) out = { ...row, id: key, quantity: 0, lineTotal: 0, purchaseTotal: grouping === 'purchase' ? row.purchaseTotal : 0, paid: grouping === 'purchase' ? row.paid : 0, outstanding: grouping === 'purchase' ? row.outstanding : 0 }
    out.quantity += row.quantity; out.lineTotal += row.lineTotal
    if (grouping !== 'purchase') { out.purchaseTotal += row.lineTotal; out.paid += row.purchaseTotal ? row.paid * row.lineTotal / row.purchaseTotal : 0; out.outstanding += row.purchaseTotal ? row.outstanding * row.lineTotal / row.purchaseTotal : 0; out.paymentStatus = 'Grouped' }
    if (grouping === 'purchase') { out.productCode = 'Multiple'; out.productName = 'All purchase products'; out.unitCost = 0; out.mrp = 0 }
    if (grouping === 'product') { out.purchaseNumber = 'Multiple'; out.reference = '' }
    if (grouping === 'month') { out.purchaseNumber = String(row.date).slice(0, 7); out.reference = ''; out.productCode = 'Multiple'; out.productName = 'Monthly purchases'; out.unitCost = 0; out.mrp = 0 }
    groups.set(key, out)
  })
  return [...groups.values()]
}

export function rowsForReport(mode, model, range, vendorId, grouping = 'line', agingGrouped = false) {
  if (mode === 'overview') return model.vendorRows
  if (mode === 'statement' || mode === 'ledger') return buildStatement(model, vendorId, range.from, range.to).rows
  if (mode === 'purchases') return purchaseRows(model, grouping).filter((row) => inRange(row.date, range.from, range.to))
  if (mode === 'outstanding') return model.purchaseRecords.filter((row) => row.balance > 0.005).map((row) => ({ ...row, vendorId: row.vendor_id, vendorName: row.vendor?.name || '-' }))
  if (mode === 'aging') {
    const rows = model.purchaseRecords.filter((row) => row.balance > 0.005).map((row) => ({ ...row, vendorId: row.vendor_id, vendorName: row.vendor?.name || '-', age0: row.bucket === '0-30' ? row.balance : 0, age31: row.bucket === '31-60' ? row.balance : 0, age61: row.bucket === '61-90' ? row.balance : 0, age91: row.bucket === '91-120' ? row.balance : 0, age120: row.bucket === '120+' ? row.balance : 0 }))
    if (!agingGrouped) return rows
    const groups = new Map()
    rows.forEach((row) => { const out = groups.get(row.vendorId) || { id: row.vendorId, vendorId: row.vendorId, vendorName: row.vendorName, age0: 0, age31: 0, age61: 0, age91: 0, age120: 0, balance: 0 }; ['age0','age31','age61','age91','age120','balance'].forEach((key) => { out[key] += amount(row[key]) }); groups.set(row.vendorId, out) })
    return [...groups.values()]
  }
  if (mode === 'payments' || mode === 'cheques') return model.paymentRows.filter((row) => (mode !== 'cheques' || row.method === 'cheque') && inRange(row.paid_at || row.created_at, range.from, range.to)).map((row) => ({ ...row, date: row.paid_at || row.created_at, vendorName: row.vendor?.name || '-', paymentAmount: amount(row.amount), bankName: row.bank_name || '-', daysUntilDue: row.chequeDate ? Math.floor((new Date(`${String(row.chequeDate).slice(0, 10)}T00:00:00`) - new Date(new Date().toDateString())) / 86400000) : 0 }))
  if (mode === 'products') return buildProductRows({ ...model, itemRows: model.itemRows.filter((row) => inRange(row.date, range.from, range.to)) })
  if (mode === 'costs') return buildCostRows(model).filter((row) => inRange(row.date, range.from, range.to))
  if (mode === 'activity') return buildActivityRows(model).filter((row) => inRange(row.date, range.from, range.to))
  return []
}

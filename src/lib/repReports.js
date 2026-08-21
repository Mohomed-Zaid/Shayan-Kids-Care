import { COMMISSION_MONTHS, getCommissionRate } from './repCommission.js'

export const num = (value) => Number(value ?? 0) || 0
export const day = (value) => value ? String(value).slice(0, 10) : ''
export const monthKey = (value) => day(value).slice(0, 7)
const invalid = (row) => ['cancelled', 'canceled', 'deleted', 'void', 'draft'].includes(String(row?.status ?? '').toLowerCase())
const mapBy = (rows) => new Map(rows.map((row) => [String(row.id), row]))
const groupBy = (rows, key) => { const out = new Map(); rows.forEach((row) => { const id = String(typeof key === 'function' ? key(row) : row[key] ?? ''); out.set(id, [...(out.get(id) || []), row]) }); return out }
const sum = (rows, key) => rows.reduce((total, row) => total + num(typeof key === 'function' ? key(row) : row[key]), 0)
const latest = (rows, key) => rows.reduce((out, row) => !out || new Date(row[key]) > new Date(out[key]) ? row : out, null)
const invoiceNo = (row) => row?.invoice_number != null ? `INV-${String(row.invoice_number).padStart(4, '0')}` : `INV-${String(row?.id ?? '').slice(0, 8)}`
const orderNo = (row) => row?.order_number != null ? `ORD-${String(row.order_number).padStart(4, '0')}` : row ? `ORD-${String(row.id).slice(0, 8)}` : '-'
const periodLabel = (key) => { const [year, month] = key.split('-').map(Number); return `${COMMISSION_MONTHS[month - 1]} ${year}` }
const actor = (row) => row?.created_by_name || row?.recorded_by || row?.user_name || row?.created_by || row?.user_email || '-'

export function buildRepReportModel(raw) {
  const reps = (raw.employees || []).filter((row) => row.is_rep === true)
  const repMap = mapBy(reps), customerMap = mapBy(raw.customers || []), productMap = mapBy(raw.products || [])
  const invoices = (raw.invoices || []).filter((row) => row.rep_id && !invalid(row))
  const invoiceMap = mapBy(invoices), invoiceItems = raw.invoice_items || [], orders = (raw.orders || []).filter((row) => row.rep_id && !invalid(row))
  const orderItems = raw.order_items || [], payments = raw.invoice_payments || [], returns = raw.returns || [], repPayments = raw.rep_commission_payments?.length ? raw.rep_commission_payments : (raw.rep_payments || [])
  const itemsByInvoice = groupBy(invoiceItems, 'invoice_id'), paymentsByInvoice = groupBy(payments, 'invoice_id'), ordersByInvoice = groupBy(orders.filter((row) => row.invoice_id), 'invoice_id')
  const returnsByInvoice = groupBy(returns.filter((row) => row.invoice_id), 'invoice_id'), ordersByRep = groupBy(orders, 'rep_id'), invoicesByRep = groupBy(invoices, 'rep_id')
  const repPaymentsByPeriod = groupBy(repPayments, (row) => `${row.rep_id}|${row.period_year}-${String(num(row.period_month) + 1).padStart(2, '0')}`)

  const invoiceRecords = invoices.map((invoice) => {
    const rep = repMap.get(String(invoice.rep_id)) || {}, customer = customerMap.get(String(invoice.customer_id)) || {}
    const items = itemsByInvoice.get(String(invoice.id)) || [], invoicePayments = paymentsByInvoice.get(String(invoice.id)) || [], invoiceReturns = returnsByInvoice.get(String(invoice.id)) || []
    const total = num(invoice.total_amount), returned = sum(invoiceReturns, 'total_amount'), paid = sum(invoicePayments, 'amount')
    const hasMissingCost = items.some((item) => item.cost_price == null), cost = sum(items, (item) => item.cost_price == null ? 0 : num(item.cost_price) * num(item.quantity))
    return { ...invoice, rep, customer, items, payments: invoicePayments, returns: invoiceReturns, order: (ordersByInvoice.get(String(invoice.id)) || [])[0], total, returned, netSales: total - returned, paid, outstanding: Math.max(0, total - paid - returned), cost: hasMissingCost ? null : cost, grossProfit: hasMissingCost ? null : total - cost, rate: getCommissionRate(rep.name), displayNumber: invoiceNo(invoice) }
  })
  const invoiceRecordMap = mapBy(invoiceRecords)

  const salesRows = invoiceRecords.flatMap((invoice) => invoice.items.map((item) => {
    const product = productMap.get(String(item.product_id)) || {}, sales = num(item.total || num(item.quantity) * num(item.price)), share = invoice.total ? sales / invoice.total : 0
    const returnShare = invoice.returned * share, cost = item.cost_price == null ? null : num(item.cost_price) * num(item.quantity)
    return { id: item.id, date: invoice.created_at, repId: invoice.rep_id, rep: invoice.rep.name || '-', orderNumber: orderNo(invoice.order), invoiceNumber: invoice.displayNumber, invoiceId: invoice.id, customerId: invoice.customer_id, customer: invoice.customer.name || '-', productId: item.product_id, product: product.name || '-', productCode: product.code || '-', quantity: num(item.quantity), sellingPrice: num(item.price), salesValue: sales, cost, grossProfit: cost == null ? null : sales - cost, commissionRate: invoice.rate * 100, commissionEarned: Math.max(0, sales - returnShare) * invoice.rate, paymentStatus: invoice.outstanding <= 0.005 ? 'paid' : invoice.paid > 0 ? 'partial' : 'unpaid' }
  }))

  const periodKeys = new Set()
  invoiceRecords.forEach((row) => periodKeys.add(`${row.rep_id}|${monthKey(row.created_at)}`))
  returns.forEach((row) => { const inv = invoiceMap.get(String(row.invoice_id)); if (inv?.rep_id) periodKeys.add(`${inv.rep_id}|${monthKey(row.created_at)}`) })
  repPayments.forEach((row) => periodKeys.add(`${row.rep_id}|${row.period_year}-${String(num(row.period_month) + 1).padStart(2, '0')}`))
  const periodRows = [...periodKeys].filter((key) => !key.endsWith('|')).sort().map((compound) => {
    const split = compound.indexOf('|'), repId = compound.slice(0, split), period = compound.slice(split + 1), rep = repMap.get(repId) || {}
    const periodInvoices = invoiceRecords.filter((row) => String(row.rep_id) === repId && monthKey(row.created_at) === period)
    const periodReturns = returns.filter((row) => { const inv = invoiceMap.get(String(row.invoice_id)); return String(inv?.rep_id) === repId && monthKey(row.created_at) === period })
    const sales = sum(periodInvoices, 'total'), returnValue = sum(periodReturns, 'total_amount'), netSales = sales - returnValue, rate = getCommissionRate(rep.name), earned = netSales * rate
    const rows = repPaymentsByPeriod.get(compound) || [], amountPaid = sum(rows, 'amount'), advanceCreated = sum(rows, 'advance_amount'), storedAdvanceApplied = sum(rows, 'advance_applied'), commissionSettled = Math.max(0, amountPaid - advanceCreated)
    const orderCount = orders.filter((row) => String(row.rep_id) === repId && monthKey(row.created_at) === period).length
    return { id: compound, repId, rep: rep.name || '-', period, month: periodLabel(period), year: Number(period.slice(0, 4)), monthIndex: Number(period.slice(5, 7)) - 1, invoiceCount: periodInvoices.length, orderCount, totalSales: sales, totalReturns: returnValue, netSales, commissionRate: rate * 100, commissionEarned: earned, paymentRows: rows, amountPaid, commissionSettled, advanceCreated, storedAdvanceApplied, advanceApplied: 0, previousAdvance: 0, remainingDue: 0, finalAdvance: 0, status: 'Unpaid' }
  })

  const periodsByRep = groupBy(periodRows, 'repId')
  periodsByRep.forEach((rows, repId) => {
    let advance = 0
    rows.sort((a, b) => a.period.localeCompare(b.period)).forEach((row) => {
      row.previousAdvance = advance
      row.advanceApplied = row.storedAdvanceApplied > 0 ? row.storedAdvanceApplied : Math.min(advance, Math.max(0, row.commissionEarned))
      const commissionPayable = Math.max(0, row.commissionEarned - row.advanceApplied)
      row.remainingDue = Math.max(0, commissionPayable - row.commissionSettled)
      advance = Math.max(0, advance - row.advanceApplied + row.advanceCreated)
      row.finalAdvance = advance
      row.commissionPayable = commissionPayable
      row.finalBalance = row.remainingDue - row.finalAdvance
      row.status = row.finalAdvance > 0.005 && row.remainingDue <= 0.005 ? 'Advance Available' : row.remainingDue <= 0.005 ? 'Paid' : row.commissionSettled > 0 || row.advanceApplied > 0 ? 'Partial' : 'Unpaid'
    })
  })

  const paymentRows = repPayments.map((payment) => {
    const rep = repMap.get(String(payment.rep_id)) || {}, period = `${payment.period_year}-${String(num(payment.period_month) + 1).padStart(2, '0')}`
    const commission = periodRows.find((row) => String(row.repId) === String(payment.rep_id) && row.period === period) || {}
    const siblings = [...(repPaymentsByPeriod.get(`${payment.rep_id}|${period}`) || [])].sort((a, b) => new Date(a.paid_at || a.created_at) - new Date(b.paid_at || b.created_at))
    const priorPaid = siblings.filter((row) => new Date(row.paid_at || row.created_at) <= new Date(payment.paid_at || payment.created_at)).reduce((total, row) => total + Math.max(0, num(row.amount) - num(row.advance_amount)), 0)
    return { id: payment.id, date: payment.paid_at, repId: payment.rep_id, rep: rep.name || '-', period, commissionPeriod: periodLabel(period), commissionDue: num(commission.commissionEarned), amountPaid: num(payment.amount), commissionSettled: Math.max(0, num(payment.amount) - num(payment.advance_amount)), advanceCreated: num(payment.advance_amount), advanceApplied: num(payment.advance_applied) || (siblings[0]?.id === payment.id ? num(commission.advanceApplied) : 0), remainingDue: Math.max(0, num(commission.commissionPayable) - priorPaid), method: payment.method || '-', note: payment.note || '-', smsStatus: payment.sms_sent ? 'Sent' : 'Not Sent', recordedBy: actor(payment), createdAt: payment.created_at }
  })

  const collectionRows = invoiceRecords.flatMap((invoice) => {
    let collected = 0
    return [...invoice.payments].sort((a, b) => new Date(a.paid_at || a.created_at) - new Date(b.paid_at || b.created_at)).map((payment) => {
      collected += num(payment.amount)
      const beforeDays = Math.max(0, Math.floor((new Date(payment.paid_at || payment.created_at) - new Date(invoice.created_at)) / 86400000))
      return { id: payment.id, date: payment.paid_at || payment.created_at, repId: invoice.rep_id, rep: invoice.rep.name || '-', customerId: invoice.customer_id, customer: invoice.customer.name || '-', invoiceNumber: invoice.displayNumber, invoiceDate: invoice.created_at, invoiceTotal: invoice.total, amountCollected: num(payment.amount), method: payment.method || '-', remainingBalance: Math.max(0, invoice.total - collected - invoice.returned), daysOutstanding: beforeDays, recordedBy: actor(payment) }
    })
  })

  const customerPairs = new Map()
  reps.forEach((rep) => {
    const repInvoices = invoicesByRep.get(String(rep.id)) || [], repOrders = ordersByRep.get(String(rep.id)) || []
    new Set([...repInvoices.map((row) => String(row.customer_id)), ...repOrders.map((row) => String(row.customer_id))].filter(Boolean)).forEach((customerId) => {
      const customer = customerMap.get(customerId) || {}, invs = invoiceRecords.filter((row) => String(row.rep_id) === String(rep.id) && String(row.customer_id) === customerId), ords = repOrders.filter((row) => String(row.customer_id) === customerId)
      const sales = sum(invs, 'total'), received = sum(invs, 'paid'), outstanding = sum(invs, 'outstanding'), limit = num(customer.credit_limit)
      customerPairs.set(`${rep.id}|${customerId}`, { id: `${rep.id}|${customerId}`, repId: rep.id, rep: rep.name || '-', customerId, customer: customer.name || '-', phone: customer.phone || customer.phone1 || '-', totalOrders: ords.length, totalInvoices: invs.length, totalSales: sales, paymentsReceived: received, outstanding, creditLimit: limit, lastOrder: latest(ords, 'created_at')?.created_at, lastInvoice: latest(invs, 'created_at')?.created_at, creditStatus: limit > 0 && outstanding > limit ? 'Over Limit' : 'Within Limit' })
    })
  })

  const performanceRows = reps.map((rep) => {
    const invs = invoiceRecords.filter((row) => String(row.rep_id) === String(rep.id)), ords = orders.filter((row) => String(row.rep_id) === String(rep.id)), sales = sum(invs, 'total'), outstanding = sum(invs, 'outstanding')
    const period = periodRows.filter((row) => String(row.repId) === String(rep.id)), paid = sum(paymentRows.filter((row) => String(row.repId) === String(rep.id)), 'commissionSettled')
    return { id: rep.id, repId: rep.id, rep: rep.name || '-', customers: new Set(invs.map((row) => row.customer_id)).size, orders: ords.length, confirmedOrders: ords.filter((row) => ['confirmed','delivered','invoiced'].includes(String(row.status).toLowerCase())).length, invoices: invs.length, quantitySold: sum(invs, (row) => sum(row.items, 'quantity')), sales, grossProfit: sum(invs, 'grossProfit'), averageInvoice: invs.length ? sales / invs.length : 0, collections: sum(invs, 'paid'), outstanding, commissionEarned: sum(period, 'commissionEarned'), commissionPaid: paid, conversionRate: ords.length ? invs.length / ords.length * 100 : 0, returns: sum(returns.filter((row) => String(invoiceMap.get(String(row.invoice_id))?.rep_id) === String(rep.id)), 'total_amount'), lastSaleDate: latest(invs, 'created_at')?.created_at, status: sales <= 0 ? 'No Sales' : 'Active' }
  })

  const advanceRows = reps.map((rep) => { const periods = periodRows.filter((row) => String(row.repId) === String(rep.id)), pays = paymentRows.filter((row) => String(row.repId) === String(rep.id)), due = sum(periods, 'remainingDue'), balance = num(rep.advance_balance); return { id: rep.id, repId: rep.id, rep: rep.name || '-', currentCommissionDue: due, currentAdvanceBalance: balance, advanceCreated: sum(pays, 'advanceCreated'), advanceApplied: sum(periods, 'advanceApplied'), remainingAdvance: balance, netAmountPayable: Math.max(0, due - balance), lastPaymentDate: latest(pays, 'date')?.date, status: balance > 0.005 ? 'Advance Available' : due > 0.005 ? 'Commission Due' : 'Settled' } })

  return { reps, repMap, customers: raw.customers || [], products: raw.products || [], invoices: invoiceRecords, orders, returns, repPayments, salesRows, periodRows, paymentRows, collectionRows, customerRows: [...customerPairs.values()], performanceRows, advanceRows, auditLogs: raw.audit_logs || [], invoiceMap: invoiceRecordMap }
}

export function buildRepTransactions(model) {
  const rows = []
  model.orders.forEach((row) => rows.push({ id: `order-${row.id}`, date: row.created_at, repId: row.rep_id, rep: model.repMap.get(String(row.rep_id))?.name || '-', type: 'Order Created', reference: orderNo(row), customer: model.customers.find((x) => String(x.id) === String(row.customer_id))?.name || '-', amount: num(row.total), user: actor(row), description: `Order recorded with status ${row.status || 'pending'}` }))
  model.invoices.forEach((row) => rows.push({ id: `invoice-${row.id}`, date: row.created_at, repId: row.rep_id, rep: row.rep.name || '-', type: 'Invoice Generated', reference: row.displayNumber, customer: row.customer.name || '-', amount: row.total, user: actor(row), description: 'Invoice generated from rep sale' }))
  model.collectionRows.forEach((row) => rows.push({ ...row, id: `collection-${row.id}`, type: 'Customer Payment Received', reference: row.invoiceNumber, amount: row.amountCollected, user: row.recordedBy, description: `${row.method} collection` }))
  model.periodRows.forEach((row) => { if (row.commissionEarned) rows.push({ id: `commission-${row.id}`, date: `${row.period}-28`, repId: row.repId, rep: row.rep, type: 'Commission Generated', reference: row.month, customer: '-', amount: row.commissionEarned, user: 'System', description: `Net sales commission at ${row.commissionRate.toFixed(2)}%` }); if (row.advanceApplied) rows.push({ id: `advance-applied-${row.id}`, date: `${row.period}-01`, repId: row.repId, rep: row.rep, type: 'Advance Applied', reference: row.month, customer: '-', amount: row.advanceApplied, user: 'System', description: 'Previous advance applied to commission' }) })
  model.paymentRows.forEach((row) => { rows.push({ id: `rep-payment-${row.id}`, date: row.createdAt || row.date, repId: row.repId, rep: row.rep, type: 'Rep Payment Made', reference: row.commissionPeriod, customer: '-', amount: row.amountPaid, user: row.recordedBy, description: `${row.method} commission payment` }); if (row.advanceCreated) rows.push({ id: `advance-${row.id}`, date: row.createdAt || row.date, repId: row.repId, rep: row.rep, type: 'Advance Created', reference: row.commissionPeriod, customer: '-', amount: row.advanceCreated, user: row.recordedBy, description: 'Excess rep payment recorded as advance' }) })
  model.returns.forEach((row) => { const inv = model.invoiceMap.get(String(row.invoice_id)); if (inv) rows.push({ id: `return-${row.id}`, date: row.created_at, repId: inv.rep_id, rep: inv.rep.name || '-', type: 'Return Processed', reference: row.return_number || `RET-${String(row.id).slice(0, 8)}`, customer: inv.customer.name || '-', amount: num(row.total_amount), user: actor(row), description: row.reason || `Return against ${inv.displayNumber}` }) })
  const orderIds = new Map(model.orders.map((row) => [String(row.id), row]))
  model.auditLogs.filter((log) => log.action === 'confirm_order').forEach((log) => { const order = orderIds.get(String(log.target_id)); if (order) rows.push({ id: `audit-${log.id}`, date: log.created_at, repId: order.rep_id, rep: model.repMap.get(String(order.rep_id))?.name || '-', type: 'Order Confirmed', reference: log.target_label || orderNo(order), customer: model.customers.find((x) => String(x.id) === String(order.customer_id))?.name || '-', amount: num(order.total), user: actor(log), description: 'Order confirmed' }) })
  return rows.filter((row) => row.date).sort((a, b) => new Date(b.date) - new Date(a.date))
}

export const inDateRange = (value, from, to) => { const valueDay = day(value); return (!from || valueDay >= from) && (!to || valueDay <= to) }

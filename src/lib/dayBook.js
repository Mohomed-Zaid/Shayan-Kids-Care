const n = (value) => Number(value ?? 0) || 0
const id = (value) => String(value ?? '')
export const dayKey = (value) => value ? String(value).slice(0, 10) : ''
const mapById = (rows = []) => new Map(rows.map((row) => [id(row.id), row]))
const creator = (row) => row?.created_by ?? row?.user_name ?? row?.user_email ?? row?.recorded_by ?? '-'
const title = (value) => String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

function stamp(dateValue, fallback) {
  const date = dayKey(dateValue ?? fallback)
  const fallbackText = String(fallback ?? '')
  if (fallbackText.includes('T') && dayKey(fallbackText) === date) return fallbackText
  const primaryText = String(dateValue ?? '')
  if (primaryText.includes('T')) return primaryText
  return date ? `${date}T00:00:00` : ''
}

function row(type, source, values = {}) {
  const dateTime = stamp(values.date, values.createdAt ?? source?.created_at)
  return {
    id: `${type.toLowerCase().replaceAll(' ', '-')}-${source?.id ?? values.id ?? Math.random()}`,
    sourceId: source?.id ?? values.id,
    transactionType: type,
    dateTime,
    date: dayKey(dateTime),
    time: dateTime && dateTime.includes('T') ? new Date(dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
    reference: values.reference ?? '-',
    party: values.party ?? '-',
    description: values.description ?? type,
    paymentMethod: title(values.paymentMethod) || '-',
    bank: values.bank ?? '-',
    moneyIn: n(values.moneyIn),
    moneyOut: n(values.moneyOut),
    amount: n(values.amount),
    user: values.user ?? creator(source),
    customerId: values.customerId ?? '',
    vendorId: values.vendorId ?? '',
    repId: values.repId ?? '',
    repName: values.repName ?? '',
    details: values.details ?? [],
    status: values.status ?? source?.status ?? '',
  }
}

export function buildDayBook(raw) {
  const customers = mapById(raw.customers), vendors = mapById(raw.vendors), employees = mapById(raw.employees), banks = mapById(raw.banks), products = mapById(raw.products)
  const invoices = mapById(raw.invoices), purchases = mapById(raw.purchases), orders = mapById(raw.orders)
  const group = (rows, field) => {
    const result = new Map()
    ;(rows ?? []).forEach((item) => { const value = id(item[field]); if (!result.has(value)) result.set(value, []); result.get(value).push(item) })
    return result
  }
  const invoiceItems = group(raw.invoice_items, 'invoice_id'), purchaseItems = group(raw.purchase_items, 'purchase_id'), orderItems = group(raw.order_items, 'order_id')
  const beginningItems = group(raw.beginning_stock_items, 'beginning_stock_id'), journalLines = group(raw.journal_entry_lines, 'entry_id')
  const chequeByPartyRef = new Map((raw.customer_cheques ?? []).map((cheque) => [`${id(cheque.customer_id)}|${id(cheque.cheque_number)}`, cheque]))
  const rows = []
  const detailItems = (items, kind) => items.map((item) => ({
    product: products.get(id(item.product_id))?.name ?? item.description ?? '-',
    quantity: n(item.quantity),
    unitValue: n(kind === 'purchase' ? item.cost : item.price),
    total: n(item.total),
  }))

  ;(raw.invoices ?? []).forEach((invoice) => {
    const cash = String(invoice.payment_type).toLowerCase() === 'cash'
    rows.push(row('Invoice', invoice, {
      date: invoice.created_at, reference: invoice.invoice_number ?? `INV-${id(invoice.id).slice(0, 8)}`,
      party: customers.get(id(invoice.customer_id))?.name, customerId: invoice.customer_id, repId: invoice.rep_id, repName: employees.get(id(invoice.rep_id))?.name,
      description: cash ? 'Cash Sale' : 'Credit Sale', paymentMethod: invoice.payment_type,
      moneyIn: cash ? invoice.total_amount : 0, amount: invoice.total_amount,
      details: detailItems(invoiceItems.get(id(invoice.id)) ?? [], 'sale'),
    }))
  })

  ;(raw.orders ?? []).forEach((order) => rows.push(row('Order', order, {
    date: order.created_at, reference: order.order_number ?? `ORD-${id(order.id).slice(0, 8)}`,
    party: customers.get(id(order.customer_id))?.name, customerId: order.customer_id, repId: order.rep_id, repName: employees.get(id(order.rep_id))?.name,
    description: `Order ${title(order.status || 'created')}`, paymentMethod: order.payment_type,
    amount: order.total, status: order.status, details: detailItems(orderItems.get(id(order.id)) ?? [], 'sale'),
  })))

  ;(raw.purchases ?? []).forEach((purchase) => {
    const reversed = ['reversed', 'cancelled', 'canceled', 'void'].includes(String(purchase.status).toLowerCase())
    const cash = String(purchase.payment_type).toLowerCase() === 'cash'
    if (!reversed) rows.push(row('Purchase', purchase, {
      date: purchase.date, createdAt: purchase.created_at, reference: purchase.ref_no ?? `PUR-${id(purchase.id).slice(0, 8)}`,
      party: vendors.get(id(purchase.vendor_id))?.name, vendorId: purchase.vendor_id,
      description: cash ? 'Cash Product Purchase' : 'Credit Product Purchase', paymentMethod: purchase.payment_type,
      moneyOut: cash ? purchase.total_amount : 0, amount: purchase.total_amount,
      details: detailItems(purchaseItems.get(id(purchase.id)) ?? [], 'purchase'),
    }))
    if (reversed) rows.push(row('Purchase Reversal', purchase, {
      date: purchase.reversed_at ?? purchase.updated_at ?? purchase.created_at, reference: purchase.ref_no ?? `PUR-${id(purchase.id).slice(0, 8)}`,
      party: vendors.get(id(purchase.vendor_id))?.name, vendorId: purchase.vendor_id,
      description: purchase.reversal_reason ?? 'Purchase reversed', amount: purchase.total_amount, user: purchase.reversed_by ?? creator(purchase),
      details: detailItems(purchaseItems.get(id(purchase.id)) ?? [], 'purchase'),
    }))
  })

  ;(raw.invoice_payments ?? []).forEach((payment) => {
    const invoice = invoices.get(id(payment.invoice_id)) ?? {}, customerId = invoice.customer_id
    const method = String(payment.method ?? '').toLowerCase()
    const cheque = method === 'cheque' ? chequeByPartyRef.get(`${id(customerId)}|${id(payment.reference)}`) : null
    rows.push(row(method === 'cheque' ? 'Customer Cheque' : 'Receivable Payment', payment, {
      date: payment.paid_at, createdAt: payment.created_at, reference: payment.reference ?? `REC-${id(payment.id).slice(0, 8)}`,
      party: customers.get(id(customerId))?.name, customerId, description: method === 'cheque' ? 'Customer Cheque Received' : 'Customer Payment',
      paymentMethod: method, bank: payment.bank_name ?? cheque?.bank_name, moneyIn: method === 'cheque' ? 0 : payment.amount, amount: payment.amount,
      details: [{ invoice: invoice.invoice_number ?? '-', method: title(method), bank: payment.bank_name ?? cheque?.bank_name ?? '-', reference: payment.reference ?? '-', amount: n(payment.amount), chequeDate: dayKey(cheque?.cheque_date), chequeStatus: cheque?.status }],
    }))
  })

  ;(raw.purchase_payments ?? []).forEach((payment) => {
    const purchase = purchases.get(id(payment.purchase_id)) ?? {}, method = String(payment.method ?? '').toLowerCase()
    rows.push(row(method === 'cheque' ? 'Vendor Cheque' : 'Payable Payment', payment, {
      date: payment.paid_at, createdAt: payment.created_at, reference: payment.reference ?? `PAY-${id(payment.id).slice(0, 8)}`,
      party: vendors.get(id(purchase.vendor_id))?.name, vendorId: purchase.vendor_id,
      description: method === 'cheque' ? 'Vendor Cheque Issued' : 'Payable Payment', paymentMethod: method, bank: payment.bank_name,
      moneyOut: payment.amount, amount: payment.amount,
      details: [{ purchase: purchase.ref_no ?? '-', method: title(method), bank: payment.bank_name ?? '-', reference: payment.reference ?? '-', amount: n(payment.amount) }],
    }))
  })

  ;(raw.returns ?? []).forEach((item) => {
    const invoice = invoices.get(id(item.invoice_id)) ?? {}, customerId = item.customer_id ?? invoice.customer_id
    rows.push(row('Return', item, {
      date: item.created_at, reference: item.return_number ?? `RET-${id(item.id).slice(0, 8)}`, party: customers.get(id(customerId))?.name,
      customerId, description: item.reason ?? 'Sales Return', amount: item.total_amount,
      details: detailItems((raw.return_items ?? []).filter((line) => id(line.return_id) === id(item.id)), 'sale'),
    }))
  })

  const commissionPayments = raw.rep_commission_payments ?? []
  ;(commissionPayments).forEach((payment) => rows.push(row('Commission Payment', payment, {
    date: payment.paid_at, createdAt: payment.created_at, reference: payment.reference ?? `RP-${id(payment.id).slice(0, 8)}`,
    party: employees.get(id(payment.rep_id))?.name, repId: payment.rep_id, description: 'Rep Commission Payment',
    paymentMethod: payment.method, bank: payment.bank_name, moneyOut: payment.amount, amount: payment.amount,
    details: [{ period: payment.period_month && payment.period_year ? `${payment.period_month}/${payment.period_year}` : '-', method: title(payment.method), bank: payment.bank_name ?? '-', amount: n(payment.amount) }],
  })))
  ;(raw.rep_payments ?? []).forEach((payment) => rows.push(row('Rep Payment', payment, {
    date: payment.paid_at, createdAt: payment.created_at, reference: payment.reference ?? `RP-${id(payment.id).slice(0, 8)}`,
    party: employees.get(id(payment.rep_id))?.name, repId: payment.rep_id, description: 'Rep Payment',
    paymentMethod: payment.method, bank: payment.bank_name, moneyOut: payment.amount, amount: payment.amount,
  })))

  const paymentChequeKeys = new Set((raw.invoice_payments ?? []).filter((payment) => String(payment.method).toLowerCase() === 'cheque').map((payment) => {
    const invoice = invoices.get(id(payment.invoice_id)) ?? {}
    return `${id(invoice.customer_id)}|${id(payment.reference)}`
  }))
  ;(raw.customer_cheques ?? []).forEach((cheque) => {
    const chequeKey = `${id(cheque.customer_id)}|${id(cheque.cheque_number)}`
    if (!paymentChequeKeys.has(chequeKey)) rows.push(row('Customer Cheque', cheque, {
      date: cheque.received_at ?? cheque.created_at, reference: cheque.cheque_number, party: customers.get(id(cheque.customer_id))?.name,
      customerId: cheque.customer_id, description: 'Customer Cheque Received', paymentMethod: 'cheque', bank: cheque.bank_name, amount: cheque.amount,
      details: [{ chequeNumber: cheque.cheque_number, bank: cheque.bank_name ?? '-', chequeDate: dayKey(cheque.cheque_date), status: title(cheque.status), amount: n(cheque.amount) }],
    }))
    if (String(cheque.status).toLowerCase() === 'returned') rows.push(row('Cheque Return', cheque, {
      id: `return-${cheque.id}`, date: cheque.returned_at ?? cheque.updated_at ?? cheque.created_at, reference: cheque.cheque_number,
      party: customers.get(id(cheque.customer_id))?.name, customerId: cheque.customer_id, description: cheque.return_reason ?? 'Customer Cheque Returned',
      paymentMethod: 'cheque', bank: cheque.bank_name, amount: cheque.amount, status: cheque.status,
      details: [{ chequeNumber: cheque.cheque_number, bank: cheque.bank_name ?? '-', chequeDate: dayKey(cheque.cheque_date), status: title(cheque.status), reason: cheque.return_reason ?? '-', amount: n(cheque.amount) }],
    }))
  })

  const cheques = mapById(raw.customer_cheques)
  ;(raw.bank_reconciliation_items ?? []).forEach((item) => {
    const match = String(item.ref_no ?? '').match(/^RCV-CHQ-(.+)$/)
    const cheque = match ? cheques.get(id(match[1])) : null
    const bank = banks.get(id(item.bank_id)) ?? {}
    if (cheque) rows.push(row('Cheque Deposit', item, {
      date: item.trx_date, createdAt: item.created_at, reference: item.ref_no ?? cheque.cheque_number,
      party: customers.get(id(cheque.customer_id))?.name, customerId: cheque.customer_id, description: 'Customer Cheque Deposited',
      paymentMethod: 'cheque', bank: bank.name ?? item.bank_name, moneyIn: item.amount, amount: item.amount,
      details: [{ chequeNumber: cheque.cheque_number, originalBank: cheque.bank_name ?? '-', depositBank: bank.name ?? '-', chequeDate: dayKey(cheque.cheque_date), reconciled: item.reconciled ? 'Yes' : 'No', amount: n(item.amount) }],
    }))
    else rows.push(row('Bank Transaction', item, {
      date: item.trx_date, createdAt: item.created_at, reference: item.ref_no, description: item.description ?? 'Bank Transaction',
      paymentMethod: 'bank', bank: bank.name ?? item.bank_name, amount: item.amount,
      details: [{ bank: bank.name ?? '-', chequeNumber: item.cheque_number ?? '-', reconciled: item.reconciled ? 'Yes' : 'No', amount: n(item.amount) }],
    }))
  })

  ;(raw.journal_entries ?? []).forEach((entry) => {
    const lines = journalLines.get(id(entry.id)) ?? []
    const debit = lines.reduce((sum, line) => sum + n(line.debit), 0)
    rows.push(row('Journal Entry', entry, {
      date: entry.date, createdAt: entry.created_at, reference: entry.entry_number ?? `JE-${id(entry.id).slice(0, 8)}`,
      description: entry.description ?? lines[0]?.description ?? 'Journal Entry', amount: debit,
      details: lines.map((line) => ({ account: line.account_name ?? line.journals?.description ?? line.journal_id, description: line.description ?? '-', debit: n(line.debit), credit: n(line.credit) })),
    }))
  })

  ;(raw.beginning_stock ?? []).forEach((entry) => rows.push(row('Beginning Stock', entry, {
    date: entry.date, createdAt: entry.created_at, reference: entry.ref_no ?? `BS-${id(entry.id).slice(0, 8)}`,
    description: 'Opening Stock Entry', amount: entry.total_amount,
    details: detailItems(beginningItems.get(id(entry.id)) ?? [], 'purchase'),
  })))

  ;(raw.stock_adjustments ?? []).forEach((adjustment) => rows.push(row('Stock Adjustment', adjustment, {
    date: adjustment.adjusted_at ?? adjustment.date ?? adjustment.created_at,
    reference: adjustment.reference ?? adjustment.ref_no ?? `ADJ-${id(adjustment.id).slice(0, 8)}`,
    description: adjustment.reason ?? adjustment.description ?? 'Stock Adjustment',
    amount: adjustment.total_amount ?? adjustment.value ?? 0,
    details: [{ product: products.get(id(adjustment.product_id))?.name ?? '-', quantity: n(adjustment.quantity ?? adjustment.adjustment), reason: adjustment.reason ?? '-' }],
  })))

  ;(raw.audit_logs ?? []).filter((log) => {
    const action = String(log.action ?? '').toLowerCase()
    return (action.includes('delete') || action.includes('revers')) && (action.includes('payment') || String(log.target_type ?? '').includes('payment'))
  }).forEach((log) => {
    const details = log.details && typeof log.details === 'object' ? log.details : {}
    rows.push(row('Payment Deletion / Reversal', log, {
      date: log.created_at, reference: details.reference_no ?? log.target_label ?? id(log.target_id).slice(0, 8),
      description: details.reason ?? details.description ?? title(log.action), amount: details.amount ?? 0,
      user: log.user_name ?? log.user_email ?? creator(log), details: [details],
    }))
  })

  return rows.filter((item) => item.date).sort((a, b) => String(a.dateTime).localeCompare(String(b.dateTime)))
}

export function filterDayBook(rows, filters) {
  const query = String(filters.search ?? '').trim().toLowerCase()
  return rows.filter((item) => {
    const amount = n(item.amount)
    return (!filters.from || item.date >= filters.from) && (!filters.to || item.date <= filters.to) &&
      (!filters.transactionType || item.transactionType === filters.transactionType) &&
      (!filters.customerId || id(item.customerId) === id(filters.customerId)) &&
      (!filters.vendorId || id(item.vendorId) === id(filters.vendorId)) &&
      (!filters.repId || id(item.repId) === id(filters.repId)) &&
      (!filters.paymentMethod || String(item.paymentMethod).toLowerCase() === String(filters.paymentMethod).toLowerCase()) &&
      (!filters.bank || item.bank === filters.bank) && (!filters.user || item.user === filters.user) &&
      (!filters.reference || String(item.reference).toLowerCase().includes(String(filters.reference).toLowerCase())) &&
      (!query || Object.values(item).some((value) => typeof value !== 'object' && String(value ?? '').toLowerCase().includes(query))) &&
      (filters.minAmount === '' || filters.minAmount == null || amount >= n(filters.minAmount)) &&
      (filters.maxAmount === '' || filters.maxAmount == null || amount <= n(filters.maxAmount))
  })
}

const total = (rows, predicate, field = 'amount') => rows.filter(predicate).reduce((sum, item) => sum + n(item[field]), 0)
export function dayBookTotals(rows) {
  const sales = total(rows, (item) => item.transactionType === 'Invoice')
  const purchases = total(rows, (item) => item.transactionType === 'Purchase')
  const returns = total(rows, (item) => item.transactionType === 'Return')
  const moneyReceived = rows.reduce((sum, item) => sum + n(item.moneyIn), 0)
  const moneyPaid = rows.reduce((sum, item) => sum + n(item.moneyOut), 0)
  return {
    sales, purchases, returns, moneyReceived, moneyPaid, netCashMovement: moneyReceived - moneyPaid,
    receivablePayments: total(rows, (item) => ['Receivable Payment', 'Customer Cheque'].includes(item.transactionType)),
    vendorPayments: total(rows, (item) => ['Payable Payment', 'Vendor Cheque'].includes(item.transactionType)),
    repPayments: total(rows, (item) => ['Rep Payment', 'Commission Payment'].includes(item.transactionType)),
    chequeReceipts: total(rows, (item) => item.transactionType === 'Customer Cheque'),
  }
}

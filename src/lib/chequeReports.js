const DAY_MS = 86_400_000
const n = (value) => Number(value ?? 0) || 0
const key = (value) => String(value ?? '')
export const dateKey = (value) => value ? String(value).slice(0, 10) : ''
const label = (value) => String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '-'
const mapById = (rows = []) => new Map(rows.map((row) => [key(row.id), row]))

export const CHEQUE_REPORTS = [
  ['summary', 'Cheque Summary Report', 'A compact view of cheque exposure and latest activity.'],
  ['in-hand', 'Cheques In Hand Report', 'Customer cheques currently held by the business.'],
  ['deposited', 'Deposited Cheques Report', 'Deposited customer cheques matched to Bank Reconciliation.'],
  ['cleared', 'Cleared Cheques Report', 'Cheques whose live cheque status is cleared.'],
  ['returned', 'Returned Cheques Report', 'Returned cheques and their receivable or payable exposure.'],
  ['due', 'Upcoming / Due Cheques Report', 'Pending cheques grouped dynamically by cheque date.'],
  ['customer-history', 'Customer Cheque History', 'Every cheque received from a selected customer.'],
  ['vendor-history', 'Vendor Cheque History', 'Every cheque issued to a selected vendor.'],
  ['bank-wise', 'Bank-wise Cheque Report', 'Cheque activity grouped by originating bank.'],
  ['register', 'Cheque Register', 'A complete chronological register of customer and vendor cheques.'],
].map(([key, title, description]) => ({ key, title, description }))

export const REPORT_COLUMNS = {
  'in-hand': [['type', 'Cheque Type'], ['party', 'Customer / Vendor'], ['documentNumber', 'Invoice / Purchase Number'], ['chequeNumber', 'Cheque Number'], ['bankCode', 'Bank Code'], ['bankName', 'Bank Name'], ['chequeDate', 'Cheque Date', 'date'], ['transactionDate', 'Received / Payment Date', 'date'], ['amount', 'Amount', 'money'], ['daysUntilDue', 'Days Until Due'], ['statusLabel', 'Status'], ['reference', 'Reference'], ['recordedBy', 'Recorded By']],
  deposited: [['party', 'Customer'], ['documentNumber', 'Invoice Number'], ['chequeNumber', 'Cheque Number'], ['bankName', 'Original Bank'], ['chequeDate', 'Cheque Date', 'date'], ['amount', 'Amount', 'money'], ['depositBank', 'Deposited Bank'], ['depositDate', 'Deposit Date', 'date'], ['reconciliationReference', 'Bank Reconciliation Reference'], ['reconciledLabel', 'Reconciled'], ['statusLabel', 'Status'], ['recordedBy', 'Recorded By']],
  cleared: [['party', 'Customer / Vendor'], ['chequeNumber', 'Cheque Number'], ['bankName', 'Bank Name'], ['chequeDate', 'Cheque Date', 'date'], ['depositDate', 'Deposit Date', 'date'], ['clearedDate', 'Clearance Date', 'date'], ['amount', 'Amount', 'money'], ['reference', 'Reference'], ['depositBank', 'Deposit Bank'], ['recordedBy', 'Recorded By']],
  returned: [['party', 'Customer / Vendor'], ['documentNumber', 'Invoice / Purchase'], ['chequeNumber', 'Cheque Number'], ['bankCode', 'Bank Code'], ['bankName', 'Bank Name'], ['chequeDate', 'Cheque Date', 'date'], ['amount', 'Amount', 'money'], ['returnedDate', 'Returned Date', 'date'], ['returnReason', 'Return Reason'], ['previousStatus', 'Previous Status'], ['statusLabel', 'Current Status'], ['outstandingAfterReturn', 'Outstanding After Return', 'money'], ['recordedBy', 'Recorded By']],
  due: [['dueSection', 'Due Section'], ['party', 'Customer / Vendor'], ['chequeNumber', 'Cheque Number'], ['bankName', 'Bank'], ['chequeDate', 'Cheque Date', 'date'], ['amount', 'Amount', 'money'], ['daysUntilDue', 'Days Remaining'], ['statusLabel', 'Status']],
  'customer-history': [['transactionDate', 'Date Received', 'date'], ['documentNumber', 'Invoice'], ['chequeNumber', 'Cheque Number'], ['bankName', 'Bank'], ['chequeDate', 'Cheque Date', 'date'], ['amount', 'Amount', 'money'], ['statusLabel', 'Status'], ['depositBank', 'Deposit Bank'], ['depositDate', 'Deposit Date', 'date'], ['clearedDate', 'Cleared Date', 'date'], ['returnedDate', 'Returned Date', 'date'], ['reference', 'Reference']],
  'vendor-history': [['transactionDate', 'Payment Date', 'date'], ['documentNumber', 'Purchase Number'], ['chequeNumber', 'Cheque Number'], ['bankName', 'Bank'], ['chequeDate', 'Cheque Date', 'date'], ['amount', 'Amount', 'money'], ['statusLabel', 'Status'], ['reference', 'Reference'], ['recordedBy', 'Recorded By']],
  'bank-wise': [['bankName', 'Bank'], ['count', 'Cheques Count'], ['inHand', 'In Hand'], ['deposited', 'Deposited'], ['cleared', 'Cleared'], ['returned', 'Returned'], ['totalAmount', 'Total Amount', 'money'], ['clearedAmount', 'Cleared Amount', 'money'], ['returnedAmount', 'Returned Amount', 'money']],
  register: [['transactionDate', 'Date', 'date'], ['type', 'Cheque Type'], ['party', 'Customer / Vendor'], ['reference', 'Reference'], ['chequeNumber', 'Cheque Number'], ['bankName', 'Bank'], ['chequeDate', 'Cheque Date', 'date'], ['amount', 'Amount', 'money'], ['statusLabel', 'Status'], ['depositBank', 'Deposit Bank'], ['reconciledLabel', 'Reconciled'], ['recordedBy', 'User']],
}

export function calendarDays(fromDate, toDate = new Date()) {
  const value = dateKey(fromDate)
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate())) / DAY_MS)
}

export function dueSection(days) {
  if (days == null) return 'No Cheque Date'
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Due Today'
  if (days === 1) return 'Due Tomorrow'
  if (days <= 7) return 'Due Within 7 Days'
  if (days <= 30) return 'Due Within 30 Days'
  return 'Later'
}

function outstandingByCustomer(raw, returnedChequeIds) {
  const chequeMap = new Map((raw.customer_cheques ?? []).map((row) => [`${key(row.customer_id)}|${key(row.cheque_number)}`, row]))
  const totals = new Map()
  for (const invoice of raw.invoices ?? []) {
    const invoiceId = key(invoice.id)
    const customerId = key(invoice.customer_id)
    const paid = (raw.invoice_payments ?? []).filter((row) => key(row.invoice_id) === invoiceId).reduce((sum, payment) => {
      if (String(payment.method ?? '').toLowerCase() !== 'cheque') return sum + n(payment.amount)
      const cheque = chequeMap.get(`${customerId}|${key(payment.reference)}`)
      return cheque && returnedChequeIds.has(key(cheque.id)) ? sum : sum + n(payment.amount)
    }, 0)
    const credits = (raw.returns ?? []).filter((row) => key(row.invoice_id) === invoiceId).reduce((sum, row) => sum + n(row.total_amount), 0)
    totals.set(customerId, n(totals.get(customerId)) + Math.max(0, n(invoice.total_amount) - paid - credits))
  }
  return totals
}

export function buildChequeRegister(raw, now = new Date()) {
  const customers = mapById(raw.customers), vendors = mapById(raw.vendors), invoices = mapById(raw.invoices), purchases = mapById(raw.purchases), banks = mapById(raw.banks)
  const payments = (raw.invoice_payments ?? []).filter((row) => String(row.method ?? '').toLowerCase() === 'cheque')
  const paymentMap = new Map()
  payments.forEach((payment) => {
    const invoice = invoices.get(key(payment.invoice_id)) ?? {}
    paymentMap.set(`${key(invoice.customer_id)}|${key(payment.reference)}`, { payment, invoice })
  })
  const reconByRef = new Map(), reconByNumber = new Map()
  ;(raw.bank_reconciliation_items ?? []).forEach((row) => {
    reconByRef.set(key(row.ref_no), row)
    const number = key(row.cheque_number)
    if (!reconByNumber.has(number)) reconByNumber.set(number, [])
    reconByNumber.get(number).push(row)
  })
  const returnedIds = new Set((raw.customer_cheques ?? []).filter((row) => String(row.status).toLowerCase() === 'returned').map((row) => key(row.id)))
  const outstanding = outstandingByCustomer(raw, returnedIds)
  const customerRows = (raw.customer_cheques ?? []).map((cheque) => {
    const status = String(cheque.status ?? '').toLowerCase()
    const { payment = {}, invoice = {} } = paymentMap.get(`${key(cheque.customer_id)}|${key(cheque.cheque_number)}`) ?? {}
    const recon = reconByRef.get(`RCV-CHQ-${cheque.id}`) ?? (reconByNumber.get(key(cheque.cheque_number)) ?? []).find((row) => n(row.amount) === n(cheque.amount)) ?? null
    const depositBank = recon ? banks.get(key(recon.bank_id)) ?? {} : {}
    const days = calendarDays(cheque.cheque_date, now)
    return {
      id: `customer-${cheque.id}`, sourceId: cheque.id, type: 'Customer', customerId: cheque.customer_id ?? invoice.customer_id ?? '', vendorId: '',
      party: customers.get(key(cheque.customer_id))?.name ?? cheque.customers?.name ?? '-', documentNumber: invoice.invoice_number ?? '-', reference: payment.reference ?? cheque.reference ?? cheque.cheque_number ?? '-',
      chequeNumber: cheque.cheque_number ?? payment.reference ?? '-', bankCode: cheque.bank_code ?? '', bankName: cheque.bank_name ?? payment.bank_name ?? '-', chequeDate: dateKey(cheque.cheque_date),
      transactionDate: dateKey(payment.paid_at ?? cheque.received_at ?? cheque.created_at), amount: n(cheque.amount), status, statusLabel: label(status), daysUntilDue: days, dueSection: dueSection(days),
      depositBankId: recon?.bank_id ?? '', depositBank: depositBank.name ?? recon?.bank_name ?? '-', depositDate: dateKey(cheque.deposited_at ?? recon?.trx_date), reconciliationReference: recon?.ref_no ?? '-',
      reconciled: !!recon?.reconciled, reconciledLabel: recon ? (recon.reconciled ? 'Yes' : 'No') : 'No', clearedDate: dateKey(cheque.cleared_at ?? (status === 'cleared' ? recon?.updated_at ?? recon?.post_date : '')),
      returnedDate: dateKey(cheque.returned_at ?? (status === 'returned' ? cheque.updated_at : '')), returnReason: cheque.return_reason ?? cheque.reason ?? '-', previousStatus: label(cheque.previous_status ?? (status === 'returned' ? 'deposited' : '')),
      outstandingAfterReturn: status === 'returned' ? n(outstanding.get(key(cheque.customer_id))) : 0, recordedBy: cheque.created_by ?? payment.created_by ?? cheque.recorded_by ?? '-',
    }
  })
  const vendorRows = (raw.purchase_payments ?? []).filter((row) => String(row.method ?? '').toLowerCase() === 'cheque').map((payment) => {
    const purchase = purchases.get(key(payment.purchase_id)) ?? {}
    const status = String(payment.cheque_status ?? payment.status ?? 'deposited').toLowerCase()
    const days = calendarDays(payment.cheque_date ?? payment.paid_at, now)
    return {
      id: `vendor-${payment.id}`, sourceId: payment.id, type: 'Vendor', customerId: '', vendorId: purchase.vendor_id ?? '', party: vendors.get(key(purchase.vendor_id))?.name ?? purchase.vendors?.name ?? '-',
      documentNumber: purchase.ref_no ?? purchase.purchase_number ?? '-', reference: payment.reference ?? '-', chequeNumber: payment.cheque_number ?? payment.reference ?? '-', bankCode: payment.bank_code ?? '', bankName: payment.bank_name ?? '-',
      chequeDate: dateKey(payment.cheque_date ?? payment.paid_at), transactionDate: dateKey(payment.paid_at ?? payment.created_at), amount: n(payment.amount), status, statusLabel: label(status), daysUntilDue: days, dueSection: dueSection(days),
      depositBankId: payment.bank_id ?? '', depositBank: payment.deposit_bank_name ?? payment.bank_name ?? '-', depositDate: dateKey(payment.deposited_at ?? payment.paid_at), reconciliationReference: payment.reconciliation_reference ?? '-',
      reconciled: !!payment.reconciled, reconciledLabel: payment.reconciled ? 'Yes' : 'No', clearedDate: dateKey(payment.cleared_at), returnedDate: dateKey(payment.returned_at), returnReason: payment.return_reason ?? '-',
      previousStatus: label(payment.previous_status), outstandingAfterReturn: 0, recordedBy: payment.created_by ?? payment.recorded_by ?? '-',
    }
  })
  return [...customerRows, ...vendorRows]
}

export function rowsForReport(register, reportKey, filters = {}) {
  if (reportKey === 'in-hand') return register.filter((row) => row.status === 'in_hand')
  if (reportKey === 'deposited') return register.filter((row) => row.type === 'Customer' && row.status === 'deposited')
  if (reportKey === 'cleared') return register.filter((row) => row.status === 'cleared')
  if (reportKey === 'returned') return register.filter((row) => row.status === 'returned')
  if (reportKey === 'due') return register.filter((row) => ['in_hand', 'pending', 'issued'].includes(row.status) && row.daysUntilDue != null && row.daysUntilDue <= 30)
  if (reportKey === 'customer-history') return register.filter((row) => row.type === 'Customer' && (!filters.customerId || key(row.customerId) === key(filters.customerId)))
  if (reportKey === 'vendor-history') return register.filter((row) => row.type === 'Vendor' && (!filters.vendorId || key(row.vendorId) === key(filters.vendorId)))
  return register
}

export function bankWiseRows(register) {
  const groups = new Map()
  register.forEach((row) => {
    const bankName = row.bankName || 'Unknown Bank'
    if (!groups.has(bankName)) groups.set(bankName, { id: bankName, bankName, count: 0, inHand: 0, deposited: 0, cleared: 0, returned: 0, totalAmount: 0, clearedAmount: 0, returnedAmount: 0 })
    const group = groups.get(bankName)
    group.count += 1; group.totalAmount += n(row.amount)
    if (row.status === 'in_hand') group.inHand += 1
    if (row.status === 'deposited') group.deposited += 1
    if (row.status === 'cleared') { group.cleared += 1; group.clearedAmount += n(row.amount) }
    if (row.status === 'returned') { group.returned += 1; group.returnedAmount += n(row.amount) }
  })
  return [...groups.values()].sort((a, b) => b.totalAmount - a.totalAmount)
}

const sum = (rows, predicate = () => true) => rows.filter(predicate).reduce((total, row) => total + n(row.amount), 0)
export function summaryForReport(register, reportKey) {
  const rows = rowsForReport(register, reportKey)
  if (reportKey === 'in-hand') return [['Number of Cheques In Hand', rows.length], ['Total Value', sum(rows)], ['Due Today', rows.filter((row) => row.daysUntilDue === 0).length], ['Due Within 7 Days', rows.filter((row) => row.daysUntilDue >= 0 && row.daysUntilDue <= 7).length], ['Overdue Cheques', rows.filter((row) => row.daysUntilDue < 0).length]]
  if (reportKey === 'deposited') return [['Total Deposited', sum(rows)], ['Reconciled Amount', sum(rows, (row) => row.reconciled)], ['Unreconciled Amount', sum(rows, (row) => !row.reconciled)], ['Number of Deposited Cheques', rows.length]]
  if (reportKey === 'cleared') {
    const clearDays = rows.map((row) => row.depositDate && row.clearedDate ? Math.max(0, -calendarDays(row.depositDate, new Date(`${row.clearedDate}T00:00:00`))) : 0)
    return [['Total Cleared Value', sum(rows)], ['Number of Cleared Cheques', rows.length], ['Average Days to Clear', rows.length ? Number((clearDays.reduce((a, b) => a + b, 0) / rows.length).toFixed(1)) : 0]]
  }
  if (reportKey === 'returned') return [['Total Returned Cheques', rows.length], ['Total Returned Value', sum(rows)], ['Customers with Returned Cheques', new Set(rows.filter((row) => row.customerId).map((row) => key(row.customerId))).size], ['Largest Returned Cheque', Math.max(0, ...rows.map((row) => n(row.amount)))]]
  if (reportKey === 'customer-history') return [['Total Cheques Received', rows.length], ['Total Value', sum(rows)], ['In Hand', sum(rows, (row) => row.status === 'in_hand')], ['Deposited', sum(rows, (row) => row.status === 'deposited')], ['Cleared', sum(rows, (row) => row.status === 'cleared')], ['Returned', sum(rows, (row) => row.status === 'returned')]]
  if (reportKey === 'vendor-history') return [['Total Vendor Cheques', rows.length], ['Total Value', sum(rows)], ['Pending', sum(rows, (row) => ['in_hand', 'pending', 'issued', 'deposited'].includes(row.status))], ['Cleared', sum(rows, (row) => row.status === 'cleared')], ['Returned', sum(rows, (row) => row.status === 'returned')]]
  return [['Total Cheques', rows.length], ['Total Value', sum(rows)]]
}

export function chequeDashboard(register) {
  const inHand = register.filter((row) => row.status === 'in_hand')
  return [['Total Cheques In Hand', inHand.length], ['Total In Hand Value', sum(inHand)], ['Deposited Value', sum(register, (row) => row.status === 'deposited')], ['Cleared Value', sum(register, (row) => row.status === 'cleared')], ['Returned Value', sum(register, (row) => row.status === 'returned')], ['Due Today', inHand.filter((row) => row.daysUntilDue === 0).length], ['Upcoming 7 Days', inHand.filter((row) => row.daysUntilDue > 0 && row.daysUntilDue <= 7).length], ['Overdue', inHand.filter((row) => row.daysUntilDue < 0).length]]
}

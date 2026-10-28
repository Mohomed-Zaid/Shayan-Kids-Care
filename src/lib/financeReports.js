import { getCommissionRate } from './repCommission.js'
import { buildProfitLoss, profitLossStatement } from './profitLoss.js'
import { buildInvoiceBalanceRows } from './receivables.js'
import { extractBankCodeFromCheque, APPROVED_BANK_CODES } from './chequeValidation.js'

const n = (value) => Number(value ?? 0) || 0
const dateOnly = (value) => value ? String(value).slice(0, 10) : ''
const daysSince = (value) => {
  if (!value) return 0
  const start = new Date(`${dateOnly(value)}T00:00:00`)
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((end - start) / 86400000))
}
const aging = (days) => days <= 30 ? 'Current' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : days <= 120 ? '91-120' : '120+'
const sum = (rows, field) => rows.reduce((total, row) => total + n(typeof field === 'function' ? field(row) : row[field]), 0)
const keyBy = (rows = [], field = 'id') => new Map(rows.map((row) => [String(row[field]), row]))
const groupBy = (rows = [], field) => {
  const result = new Map()
  rows.forEach((row) => {
    const key = String(typeof field === 'function' ? field(row) : row[field] ?? '')
    if (!result.has(key)) result.set(key, [])
    result.get(key).push(row)
  })
  return result
}
const creator = (row) => row.created_by_name ?? row.recorded_by ?? row.created_by ?? row.user_email ?? '-'

function getBankCodeForBank(bank) {
  if (!bank) return ''
  if (bank.bank_code) return String(bank.bank_code).trim()
  const normName = String(bank.name || '').toLowerCase()
  for (const [code, name] of Object.entries(APPROVED_BANK_CODES)) {
    if (name.toLowerCase().includes(normName) || normName.includes(name.toLowerCase())) {
      return code
    }
  }
  return ''
}

export const FINANCE_REPORTS = [
  ['receivables', 'Receivables Report', 'view_receivables'],
  ['payables', 'Payables Report', 'view_payables'],
  ['cash-book', 'Cash Book', 'view'],
  ['bank-book', 'Bank Book', 'view_bank_data'],
  ['bank-reconciliation', 'Bank Reconciliation Report', 'view_bank_data'],
  ['cheques', 'Cheque Report', 'view_bank_data'],
  ['journals', 'Journal Report', 'view'],
  ['general-ledger', 'General Ledger', 'view'],
  ['trial-balance', 'Trial Balance', 'view'],
  ['rep-payments', 'Rep Payments Report', 'view_commission'],
  ['commissions', 'Commission Report', 'view_commission'],
  ['profit-loss', 'Profit & Loss Summary', 'view_profit_loss'],
  ['cash-flow', 'Cash Flow Summary', 'view_bank_data'],
].map(([key, title, permission]) => ({ key, title, permission }))

export const REPORT_COLUMNS = {
  receivables: [
    ['customerCode', 'Customer Code'], ['customerName', 'Customer Name'], ['phone', 'Phone'], ['invoiceNumber', 'Invoice Number'],
    ['date', 'Invoice Date', 'date'], ['invoiceTotal', 'Invoice Total', 'money'], ['amountPaid', 'Amount Paid', 'money'],
    ['outstanding', 'Outstanding Balance', 'money'], ['creditLimit', 'Credit Limit', 'money'], ['availableCredit', 'Available Credit', 'money'],
    ['lastPaymentDate', 'Last Payment Date', 'date'], ['method', 'Payment Method'], ['daysOutstanding', 'Days Outstanding'],
    ['agingBucket', 'Aging Bucket'], ['chequesInHand', 'Cheques In Hand', 'money'], ['returnedCheques', 'Returned Cheques', 'money'],
    ['status', 'Payment Status'], ['rep', 'Sales Rep'],
  ],
  payables: [
    ['vendorCode', 'Vendor Code'], ['vendorName', 'Vendor Name'], ['purchaseNumber', 'Purchase Number'], ['date', 'Purchase Date', 'date'],
    ['purchaseTotal', 'Purchase Total', 'money'], ['amountPaid', 'Amount Paid', 'money'], ['outstanding', 'Outstanding Balance', 'money'],
    ['lastPaymentDate', 'Last Payment Date', 'date'], ['method', 'Payment Method'], ['bank', 'Bank'], ['chequeNumber', 'Cheque Number'],
    ['daysOutstanding', 'Days Outstanding'], ['agingBucket', 'Aging Bucket'], ['status', 'Payment Status'],
  ],
  'cash-book': [['date', 'Date', 'date'], ['reference', 'Reference'], ['transactionType', 'Transaction Type'], ['description', 'Description'], ['cashIn', 'Cash In', 'money'], ['cashOut', 'Cash Out', 'money'], ['runningBalance', 'Running Balance', 'money'], ['createdBy', 'Recorded By']],
  'bank-book': [['date', 'Date', 'date'], ['bank', 'Bank'], ['reference', 'Reference'], ['transactionType', 'Transaction Type'], ['description', 'Description'], ['deposit', 'Deposit', 'money'], ['withdrawal', 'Withdrawal', 'money'], ['runningBalance', 'Running Balance', 'money'], ['reconciled', 'Reconciled'], ['createdBy', 'Created By']],
  'bank-reconciliation': [['bank', 'Bank'], ['transactionType', 'Transaction Type'], ['party', 'Customer / Vendor'], ['date', 'Transaction Date', 'date'], ['postDate', 'Post Date', 'date'], ['reference', 'Reference Number'], ['description', 'Description'], ['chequeNumber', 'Cheque / Ref #'], ['deposit', 'Money In (Deposit)', 'money'], ['withdrawal', 'Money Out (Payment)', 'money'], ['amount', 'Amount', 'money'], ['reconciled', 'Reconciled'], ['reconciliationDate', 'Reconciliation Date', 'date']],
  cheques: [['chequeType', 'Cheque Type'], ['party', 'Customer / Vendor'], ['chequeNumber', 'Cheque Number'], ['bankCode', 'Bank Code'], ['bank', 'Bank Name'], ['date', 'Cheque Date', 'date'], ['amount', 'Amount', 'money'], ['status', 'Status'], ['depositBank', 'Deposit Bank'], ['depositDate', 'Deposit Date', 'date'], ['dueDate', 'Due Date', 'date'], ['days', 'Days'], ['reference', 'Reference'], ['createdBy', 'Recorded By']],
  journals: [['entryNumber', 'Entry Number'], ['date', 'Date', 'date'], ['description', 'Description'], ['accountCode', 'Account Code'], ['accountName', 'Account Name'], ['debit', 'Debit', 'money'], ['credit', 'Credit', 'money'], ['status', 'Status'], ['createdBy', 'Created By']],
  'general-ledger': [['date', 'Date', 'date'], ['reference', 'Reference'], ['description', 'Description'], ['debit', 'Debit', 'money'], ['credit', 'Credit', 'money'], ['runningBalance', 'Running Balance', 'money']],
  'trial-balance': [['accountCode', 'Account Code'], ['accountName', 'Account Name'], ['accountType', 'Account Type'], ['debitBalance', 'Debit Balance', 'money'], ['creditBalance', 'Credit Balance', 'money']],
  'rep-payments': [['rep', 'Rep'], ['date', 'Payment Date', 'date'], ['commissionDue', 'Commission Due', 'money'], ['amountPaid', 'Amount Paid', 'money'], ['advanceAmount', 'Advance Amount', 'money'], ['advanceApplied', 'Advance Applied', 'money'], ['remainingDue', 'Remaining Due', 'money'], ['method', 'Payment Method'], ['notes', 'Notes'], ['smsStatus', 'SMS Status'], ['createdBy', 'Recorded By']],
  commissions: [['rep', 'Rep'], ['month', 'Month'], ['totalSales', 'Total Sales', 'money'], ['commissionRate', 'Commission Rate'], ['commissionEarned', 'Commission Earned', 'money'], ['advanceApplied', 'Advance Applied', 'money'], ['amountPaid', 'Amount Paid', 'money'], ['remainingCommission', 'Remaining Commission', 'money'], ['status', 'Status']],
  'profit-loss': [['section', 'Section'], ['description', 'Description'], ['amount', 'Amount', 'money']],
  'cash-flow': [['section', 'Cash Flow'], ['description', 'Description'], ['amount', 'Amount', 'money']],
}

export function formatReconReference(ref) {
  if (!ref || ref === '-') return '-'
  const str = String(ref).trim()
  return str.replace(
    /^([A-Za-z]+-[A-Za-z]+-)([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    (_, prefix, shortHex) => `${prefix.toUpperCase()}${shortHex.toUpperCase()}`
  )
}

const formatDocRef = (val, prefix) => {
  if (!val) return ''
  const str = String(val).trim()
  if (!str) return ''
  const regex = new RegExp(`^(${prefix}-)+`, 'i')
  return `${prefix}-${str.replace(regex, '')}`
}

const cleanReconDescription = (desc) => {
  if (!desc) return '-'
  return String(desc)
    .replace(/\bPUR-PUR-/gi, 'PUR-')
    .replace(/\bINV-INV-/gi, 'INV-')
}

export function buildFinanceReports(raw) {
  const customers = keyBy(raw.customers)
  const vendors = keyBy(raw.vendors)
  const employees = keyBy(raw.employees)
  const banks = keyBy(raw.banks)
  const invoices = raw.invoices ?? []
  const invoicePayments = raw.invoice_payments ?? []
  const purchases = (raw.purchases ?? []).filter((row) => !['reversed', 'cancelled', 'canceled', 'deleted', 'void'].includes(String(row.status ?? '').toLowerCase()))
  const activePurchaseIds = new Set(purchases.map((row) => String(row.id)))
  const purchasePayments = (raw.purchase_payments ?? []).filter((row) => activePurchaseIds.has(String(row.purchase_id)))
  const returns = raw.returns ?? []
  const cheques = raw.customer_cheques ?? []
  const repPayments = raw.rep_commission_payments ?? raw.rep_payments ?? []
  const paymentsByInvoice = groupBy(invoicePayments, 'invoice_id')
  const paymentsByPurchase = groupBy(purchasePayments, 'purchase_id')
  const chequesByCustomer = groupBy(cheques, 'customer_id')
  const receivableBalanceRows = buildInvoiceBalanceRows(invoices, invoicePayments, returns)

  const invoicesById = keyBy(invoices)
  const purchasesById = keyBy(purchases)
  const chequesById = keyBy(cheques)
  const rcvPaymentsById = keyBy(invoicePayments)
  const payPaymentsById = keyBy(purchasePayments)

  const receivables = receivableBalanceRows.filter((inv) => inv.payment_type === 'credit').map((inv) => {
    const customer = customers.get(String(inv.customer_id)) ?? {}
    const rep = employees.get(String(inv.rep_id)) ?? {}
    const payments = paymentsByInvoice.get(String(inv.id)) ?? []
    const paid = sum(payments, 'amount')
    const outstanding = inv.balance
    const last = [...payments].sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at))[0]
    const customerCheques = chequesByCustomer.get(String(inv.customer_id)) ?? []
    const days = daysSince(inv.created_at)
    const limit = n(customer.credit_limit)
    return {
      id: inv.id, customerId: inv.customer_id, customerCode: customer.code ?? customer.customer_code ?? '-', customerName: customer.name ?? '-',
      phone: customer.phone ?? customer.phone1 ?? '-', invoiceNumber: inv.invoice_number ? `INV-${String(inv.invoice_number).padStart(4, '0')}` : String(inv.id).slice(0, 8),
      date: dateOnly(inv.created_at), invoiceTotal: n(inv.total_amount), amountPaid: paid, outstanding, creditLimit: limit,
      availableCredit: Math.max(0, limit - outstanding), lastPaymentDate: dateOnly(last?.paid_at), method: last?.method ?? '-', daysOutstanding: days,
      agingBucket: aging(days), chequesInHand: sum(customerCheques.filter((c) => c.status === 'in_hand'), 'amount'),
      returnedCheques: sum(customerCheques.filter((c) => c.status === 'returned'), 'amount'), status: outstanding <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid',
      rep: rep.name ?? '-', amount: outstanding, createdBy: creator(inv),
    }
  })

  const payables = purchases.map((purchase) => {
    const vendor = vendors.get(String(purchase.vendor_id)) ?? {}
    const payments = paymentsByPurchase.get(String(purchase.id)) ?? []
    const paid = sum(payments, 'amount')
    const last = [...payments].sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at))[0]
    const outstanding = Math.max(0, n(purchase.total_amount) - paid)
    const date = purchase.date ?? purchase.purchase_date ?? purchase.created_at
    const days = daysSince(date)
    return { id: purchase.id, vendorId: purchase.vendor_id, vendorCode: vendor.code ?? vendor.vendor_code ?? '-', vendorName: vendor.name ?? '-',
      purchaseNumber: purchase.ref_no ?? purchase.purchase_number ?? String(purchase.id).slice(0, 8), date: dateOnly(date), purchaseTotal: n(purchase.total_amount),
      amountPaid: paid, outstanding, lastPaymentDate: dateOnly(last?.paid_at), method: last?.method ?? '-', bank: last?.bank_name ?? '-',
      chequeNumber: last?.method === 'cheque' ? last.reference ?? '-' : '-', daysOutstanding: days, agingBucket: aging(days),
      status: outstanding <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid', amount: outstanding, createdBy: creator(purchase) }
  })

  const cashTransactions = [
    ...invoices.filter((row) => row.payment_type === 'cash').map((row) => ({ id: `sale-${row.id}`, date: dateOnly(row.created_at), reference: row.invoice_number ? `INV-${row.invoice_number}` : row.id, transactionType: 'Cash Sale', description: `Cash sale to ${customers.get(String(row.customer_id))?.name ?? 'customer'}`, cashIn: n(row.total_amount), cashOut: 0, createdBy: creator(row) })),
    ...invoicePayments.filter((row) => row.method === 'cash').map((row) => ({ id: `receipt-${row.id}`, date: dateOnly(row.paid_at), reference: row.reference ?? String(row.id).slice(0, 8), transactionType: 'Customer Payment', description: 'Receivable cash payment', cashIn: n(row.amount), cashOut: 0, createdBy: creator(row) })),
    ...purchasePayments.filter((row) => row.method === 'cash').map((row) => ({ id: `vendor-${row.id}`, date: dateOnly(row.paid_at), reference: row.reference ?? String(row.id).slice(0, 8), transactionType: 'Vendor Payment', description: 'Vendor cash payment', cashIn: 0, cashOut: n(row.amount), createdBy: creator(row) })),
    ...repPayments.filter((row) => row.method === 'cash').map((row) => ({ id: `rep-${row.id}`, date: dateOnly(row.paid_at), reference: row.reference ?? String(row.id).slice(0, 8), transactionType: 'Rep Payment', description: `Commission payment to ${employees.get(String(row.rep_id))?.name ?? 'rep'}`, cashIn: 0, cashOut: n(row.amount), createdBy: creator(row) })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date)).map((row, index, all) => ({ ...row, amount: row.cashIn || row.cashOut, runningBalance: sum(all.slice(0, index + 1), (x) => x.cashIn - x.cashOut) }))

  const bankList = [...banks.values()]
  const findBank = (idOrName, refOrChequeNo = '') => {
    if (idOrName) {
      const direct = banks.get(String(idOrName))
      if (direct) return direct
      const keyStr = String(idOrName).trim().toLowerCase()
      const matched = bankList.find((b) => {
        const bId = String(b.id || '').trim().toLowerCase()
        const bCode = String(b.code || '').trim().toLowerCase()
        const bBankCode = getBankCodeForBank(b).toLowerCase()
        const bName = String(b.name || '').trim().toLowerCase()
        if (bId && bId === keyStr) return true
        if (bCode && (keyStr === bCode || keyStr.startsWith(`${bCode} -`) || keyStr.startsWith(`${bCode}-`) || keyStr.startsWith(`${bCode} `))) return true
        if (bBankCode && (keyStr === bBankCode || keyStr.includes(bBankCode))) return true
        if (bName) {
          if (keyStr.includes(bName) || bName.includes(keyStr)) return true
          const keywords = bName.split(/[\s-]+/).filter((w) => w.length >= 3 && !['bank', 'plc', 'ltd'].includes(w))
          if (keywords.some((kw) => keyStr.includes(kw))) return true
        }
        if (bCode && bCode.length >= 3 && keyStr.includes(bCode)) return true
        return false
      })
      if (matched) return matched
    }
    if (refOrChequeNo) {
      const codeInRef = extractBankCodeFromCheque(refOrChequeNo)
      if (codeInRef) {
        const byChequeCode = bankList.find((b) => getBankCodeForBank(b) === codeInRef)
        if (byChequeCode) return byChequeCode
      }
    }
    return null
  }

  const rawReconItems = raw.bank_reconciliation_items ?? []

  // Deduplicate rawReconItems by ref_no (or cheque_number + amount for cheque rows)
  // so duplicate database entries never appear multiple times in reports.
  const scoreReconItem = (r) => {
    let score = 0
    if (r.reconciled) score += 100
    const refU = String(r.ref_no || '').trim().toUpperCase()
    if (refU.startsWith('RCV-CHQ-')) {
      const chq = chequesById.get(String(r.ref_no || '').trim().slice(8))
      if (chq?.deposit_bank_id && String(r.bank_id) === String(chq.deposit_bank_id)) score += 50
    }
    if (r.bank_id && banks.has(String(r.bank_id))) score += 10
    return score
  }

  const dedupedByKey = new Map()
  rawReconItems.forEach((r) => {
    const refKey = String(r.ref_no || '').trim().toLowerCase()
    const chqKey = String(r.cheque_number || '').trim().toLowerCase()
    const key = refKey || (chqKey ? `chq:${chqKey}:${n(r.amount)}` : `id:${r.id}`)
    const prev = dedupedByKey.get(key)
    if (!prev) {
      dedupedByKey.set(key, { ...r })
    } else {
      const anyReconciled = Boolean(prev.reconciled || r.reconciled)
      const winner = scoreReconItem(r) > scoreReconItem(prev) ? { ...r } : { ...prev }
      winner.reconciled = anyReconciled
      dedupedByKey.set(key, winner)
    }
  })
  const uniqueReconItems = [...dedupedByKey.values()]

  const existingRefNos = new Set(uniqueReconItems.map((r) => String(r.ref_no || '').trim().toLowerCase()).filter(Boolean))
  const existingChequeNos = new Set(uniqueReconItems.map((r) => String(r.cheque_number || '').trim().toLowerCase()).filter(Boolean))
  const reconByRef = new Map()
  const reconByCheque = new Map()
  uniqueReconItems.forEach((r) => {
    if (r.ref_no) reconByRef.set(String(r.ref_no).trim().toLowerCase(), r)
    if (r.cheque_number) reconByCheque.set(String(r.cheque_number).trim().toLowerCase(), r)
  })

  const reconciliationsBase = uniqueReconItems.map((row) => {
    const refUpper = String(row.ref_no || '').trim().toUpperCase()
    const descLower = String(row.description || '').toLowerCase()
    let bank = findBank(row.bank_id || row.bank_name, row.cheque_number) || {}

    let transactionType = 'Bank Entry'
    let flow = 'in'
    let method = 'bank'
    let party = '-'
    let customerId = ''
    let vendorId = ''

    if (refUpper.startsWith('RCV-CHQ-')) {
      const chqId = String(row.ref_no || '').slice(8)
      const chq = chequesById.get(chqId)
      if (chq?.deposit_bank_id) {
        const depBank = findBank(chq.deposit_bank_id)
        if (depBank) bank = depBank
      }
      const cust = customers.get(String(chq?.customer_id))
      transactionType = 'Customer Cheque Deposit'
      flow = 'in'
      method = 'cheque'
      customerId = chq?.customer_id ?? ''
      party = cust?.name ?? '-'
    } else if (refUpper.startsWith('RCV-TRF-')) {
      const payId = String(row.ref_no || '').slice(8)
      const pay = rcvPaymentsById.get(payId)
      const inv = invoicesById.get(String(pay?.invoice_id))
      const cust = customers.get(String(inv?.customer_id))
      transactionType = 'Customer Bank Transfer'
      flow = 'in'
      method = 'bank'
      customerId = inv?.customer_id ?? ''
      party = cust?.name ?? '-'
    } else if (refUpper.startsWith('PAY-TRF-')) {
      const payId = String(row.ref_no || '').slice(8)
      const pay = payPaymentsById.get(payId)
      const pur = purchasesById.get(String(pay?.purchase_id))
      const vend = vendors.get(String(pur?.vendor_id))
      transactionType = 'Vendor Bank Transfer'
      flow = 'out'
      method = 'bank'
      vendorId = pur?.vendor_id ?? ''
      party = vend?.name ?? '-'
    } else if (refUpper.startsWith('PAY-CHQ-')) {
      const payId = String(row.ref_no || '').slice(8)
      const pay = payPaymentsById.get(payId)
      const pur = purchasesById.get(String(pay?.purchase_id))
      const vend = vendors.get(String(pur?.vendor_id))
      transactionType = 'Vendor Cheque Payment'
      flow = 'out'
      method = 'cheque'
      vendorId = pur?.vendor_id ?? ''
      party = vend?.name ?? '-'
    } else if (descLower.includes('cheque deposit') || descLower.includes('receivable cheque')) {
      transactionType = 'Customer Cheque Deposit'
      flow = 'in'
      method = 'cheque'
    } else if (descLower.includes('customer bank')) {
      transactionType = 'Customer Bank Transfer'
      flow = 'in'
      method = 'bank'
    } else if (descLower.includes('vendor bank')) {
      transactionType = 'Vendor Bank Transfer'
      flow = 'out'
      method = 'bank'
    } else if (descLower.includes('vendor cheque')) {
      transactionType = 'Vendor Cheque Payment'
      flow = 'out'
      method = 'cheque'
    } else if (descLower.includes('payment') || descLower.includes('outflow') || descLower.includes('withdrawal')) {
      transactionType = 'Bank Payment'
      flow = 'out'
      method = 'bank'
    }

    const amt = n(row.amount)
    return {
      id: row.id,
      bankId: bank.id ?? row.bank_id,
      bank: bank.name ?? row.bank_name ?? '-',
      transactionType,
      party,
      customerId,
      vendorId,
      method,
      date: dateOnly(row.trx_date),
      postDate: dateOnly(row.post_date ?? row.trx_date),
      dueDate: dateOnly(row.due_date),
      reference: row.ref_no ?? '-',
      displayReference: formatReconReference(row.ref_no ?? '-'),
      description: cleanReconDescription(row.description),
      chequeNumber: row.cheque_number ?? '-',
      deposit: flow === 'in' ? amt : 0,
      withdrawal: flow === 'out' ? amt : 0,
      amount: amt,
      reconciled: row.reconciled ? 'Yes' : 'No',
      status: row.reconciled ? 'Yes' : 'No',
      reconciliationDate: row.reconciled ? dateOnly(row.reconciled_at ?? row.updated_at ?? row.post_date ?? row.trx_date) : '',
      createdBy: creator(row),
    }
  })

  // Include any deposited customer cheques not yet in bank_reconciliation_items
  cheques.filter((c) => c.status === 'deposited').forEach((c) => {
    const refNo = `rcv-chq-${c.id}`.toLowerCase()
    const chqNo = String(c.cheque_number || '').trim().toLowerCase()
    if (existingRefNos.has(refNo) || (chqNo && existingChequeNos.has(chqNo))) return
    const bank = (c.deposit_bank_id ? findBank(c.deposit_bank_id) : null) || findBank(c.deposit_bank_name || c.bank_code || c.bank_name, c.cheque_number) || {}
    const cust = customers.get(String(c.customer_id))
    const cName = cust?.name ?? ''
    const day = dateOnly(c.deposited_at ?? c.cheque_date)
    const amt = n(c.amount)
    const rawRef = `RCV-CHQ-${c.id}`
    reconciliationsBase.push({
      id: `unsynced-chq-${c.id}`,
      bankId: bank.id ?? c.deposit_bank_id ?? '',
      bank: bank.name ?? c.deposit_bank_name ?? c.bank_name ?? '-',
      transactionType: 'Customer Cheque Deposit',
      party: cName || '-',
      customerId: c.customer_id ?? '',
      vendorId: '',
      method: 'cheque',
      date: day,
      postDate: day,
      dueDate: dateOnly(c.cheque_date),
      reference: rawRef,
      displayReference: formatReconReference(rawRef),
      description: cleanReconDescription(`Customer Cheque Deposit${cName ? ` - ${cName}` : ''}${c.bank_name ? ` (${c.bank_name})` : ''}`),
      chequeNumber: c.cheque_number ?? '-',
      deposit: amt,
      withdrawal: 0,
      amount: amt,
      reconciled: c.reconciled ? 'Yes' : 'No',
      status: c.reconciled ? 'Yes' : 'No',
      reconciliationDate: c.reconciled ? day : '',
      createdBy: creator(c),
    })
  })

  // Include any customer bank transfers not yet in bank_reconciliation_items
  invoicePayments.filter((p) => p.method === 'bank').forEach((p) => {
    const refNo = `rcv-trf-${p.id}`.toLowerCase()
    if (existingRefNos.has(refNo)) return
    const bank = findBank(p.bank_id || p.bank_name, p.reference) || {}
    const inv = invoicesById.get(String(p.invoice_id))
    const cust = customers.get(String(inv?.customer_id))
    const cName = cust?.name ?? ''
    const invNo = formatDocRef(inv?.invoice_number, 'INV')
    const day = dateOnly(p.paid_at)
    const amt = n(p.amount)
    const rawRef = `RCV-TRF-${p.id}`
    reconciliationsBase.push({
      id: `unsynced-rcv-trf-${p.id}`,
      bankId: bank.id ?? p.bank_id ?? '',
      bank: bank.name ?? p.bank_name ?? '-',
      transactionType: 'Customer Bank Transfer',
      party: cName || '-',
      customerId: inv?.customer_id ?? '',
      vendorId: '',
      method: 'bank',
      date: day,
      postDate: day,
      dueDate: '',
      reference: rawRef,
      displayReference: formatReconReference(rawRef),
      description: cleanReconDescription(`Customer Bank Transfer${cName ? ` - ${cName}` : ''}${invNo ? ` (${invNo})` : ''}`),
      chequeNumber: p.reference ?? '-',
      deposit: amt,
      withdrawal: 0,
      amount: amt,
      reconciled: p.reconciled ? 'Yes' : 'No',
      status: p.reconciled ? 'Yes' : 'No',
      reconciliationDate: p.reconciled ? day : '',
      createdBy: creator(p),
    })
  })

  // Include any vendor bank transfers and vendor cheques not yet in bank_reconciliation_items
  purchasePayments.filter((p) => p.method === 'bank' || p.method === 'cheque').forEach((p) => {
    const isCheque = p.method === 'cheque'
    const refNo = `${isCheque ? 'pay-chq' : 'pay-trf'}-${p.id}`.toLowerCase()
    const chqNo = String(p.reference || '').trim().toLowerCase()
    if (existingRefNos.has(refNo) || (isCheque && chqNo && existingChequeNos.has(chqNo))) return
    const bank = findBank(p.bank_id || p.bank_name, p.reference) || {}
    const pur = purchasesById.get(String(p.purchase_id))
    const vend = vendors.get(String(pur?.vendor_id))
    const vName = vend?.name ?? ''
    const purRef = formatDocRef(pur?.ref_no, 'PUR')
    const day = dateOnly(p.paid_at)
    const amt = n(p.amount)
    const rawRef = `${isCheque ? 'PAY-CHQ' : 'PAY-TRF'}-${p.id}`
    reconciliationsBase.push({
      id: `unsynced-pay-${p.id}`,
      bankId: bank.id ?? p.bank_id ?? '',
      bank: bank.name ?? p.bank_name ?? '-',
      transactionType: isCheque ? 'Vendor Cheque Payment' : 'Vendor Bank Transfer',
      party: vName || '-',
      customerId: '',
      vendorId: pur?.vendor_id ?? '',
      method: p.method,
      date: day,
      postDate: day,
      dueDate: isCheque ? day : '',
      reference: rawRef,
      displayReference: formatReconReference(rawRef),
      description: cleanReconDescription(`${isCheque ? 'Vendor Cheque Payment' : 'Vendor Bank Transfer'}${vName ? ` - ${vName}` : ''}${purRef ? ` (${purRef})` : ''}`),
      chequeNumber: p.reference ?? '-',
      deposit: 0,
      withdrawal: amt,
      amount: amt,
      reconciled: p.reconciled ? 'Yes' : 'No',
      status: p.reconciled ? 'Yes' : 'No',
      reconciliationDate: p.reconciled ? day : '',
      createdBy: creator(p),
    })
  })

  const reconciliations = reconciliationsBase.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  const bankTransactionsBase = [
    ...invoicePayments.filter((row) => row.method === 'bank').map((row) => {
      const bank = findBank(row.bank_id || row.bank_name, row.reference)
      const recon = reconByRef.get(`rcv-trf-${row.id}`.toLowerCase())
      const isRec = recon ? !!recon.reconciled : !!row.reconciled
      const inv = invoicesById.get(String(row.invoice_id))
      const custName = customers.get(String(inv?.customer_id))?.name
      return { id: `receipt-${row.id}`, date: dateOnly(row.paid_at), bank: bank?.name ?? row.bank_name ?? '-', bankId: bank?.id ?? row.bank_id, customerId: inv?.customer_id ?? '', reference: row.reference ?? `RCV-TRF-${row.id}`, transactionType: 'Customer Bank Transfer', description: `Customer bank transfer${custName ? ` - ${custName}` : ''}`, deposit: n(row.amount), withdrawal: 0, reconciled: isRec ? 'Yes' : 'No', createdBy: creator(row) }
    }),
    ...purchasePayments.filter((row) => row.method === 'bank' || row.method === 'cheque').map((row) => {
      const isCheque = row.method === 'cheque'
      const bank = findBank(row.bank_id || row.bank_name, row.reference)
      const recon = reconByRef.get(`${isCheque ? 'pay-chq' : 'pay-trf'}-${row.id}`.toLowerCase()) ?? (isCheque ? reconByCheque.get(String(row.reference || '').trim().toLowerCase()) : null)
      const isRec = recon ? !!recon.reconciled : !!row.reconciled
      const pur = purchasesById.get(String(row.purchase_id))
      const vendName = vendors.get(String(pur?.vendor_id))?.name
      return { id: `payment-${row.id}`, date: dateOnly(row.paid_at), bank: bank?.name ?? row.bank_name ?? '-', bankId: bank?.id ?? row.bank_id, vendorId: pur?.vendor_id ?? '', reference: row.reference ?? `${isCheque ? 'PAY-CHQ' : 'PAY-TRF'}-${row.id}`, transactionType: isCheque ? 'Vendor Cheque Payment' : 'Vendor Bank Transfer', description: `${isCheque ? 'Vendor cheque payment' : 'Vendor bank payment'}${vendName ? ` - ${vendName}` : ''}`, deposit: 0, withdrawal: n(row.amount), reconciled: isRec ? 'Yes' : 'No', createdBy: creator(row) }
    }),
    ...cheques.filter((row) => row.status === 'deposited').map((row) => {
      const bank = findBank(row.deposit_bank_id || row.deposit_bank_name || row.bank_code || row.bank_name, row.cheque_number)
      const recon = reconByRef.get(`rcv-chq-${row.id}`.toLowerCase()) ?? reconByCheque.get(String(row.cheque_number || '').trim().toLowerCase())
      const isRec = recon ? !!recon.reconciled : !!row.reconciled
      return { id: `cheque-${row.id}`, date: dateOnly(row.deposited_at ?? row.cheque_date), bank: bank?.name ?? row.deposit_bank_name ?? row.bank_name ?? '-', bankId: bank?.id ?? row.deposit_bank_id, customerId: row.customer_id ?? '', reference: row.cheque_number ?? `RCV-CHQ-${row.id}`, transactionType: 'Deposited Customer Cheque', description: `Cheque from ${customers.get(String(row.customer_id))?.name ?? 'customer'}`, deposit: n(row.amount), withdrawal: 0, reconciled: isRec ? 'Yes' : 'No', createdBy: creator(row) }
    }),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))
  const bankRunning = new Map()
  const bankTransactions = bankTransactionsBase.map((row) => {
    const key = String(row.bankId ?? row.bank)
    const bank = findBank(row.bankId) || {}
    const previous = bankRunning.has(key) ? bankRunning.get(key) : n(bank.opening_balance)
    const runningBalance = previous + n(row.deposit) - n(row.withdrawal)
    bankRunning.set(key, runningBalance)
    return { ...row, amount: row.deposit || row.withdrawal, runningBalance }
  })

  const chequeRows = [
    ...cheques.map((row) => ({ id: `customer-${row.id}`, chequeType: 'Customer', party: customers.get(String(row.customer_id))?.name ?? '-', chequeNumber: row.cheque_number ?? '-', bankCode: row.bank_code ?? String(row.cheque_number ?? '').split('-')[1] ?? '-', bank: row.bank_name ?? '-', date: dateOnly(row.cheque_date), amount: n(row.amount), status: String(row.status ?? 'in_hand').replaceAll('_', ' '), depositBank: banks.get(String(row.deposit_bank_id))?.name ?? row.deposit_bank_name ?? '-', depositDate: dateOnly(row.deposited_at), dueDate: dateOnly(row.due_date ?? row.cheque_date), days: daysSince(row.due_date ?? row.cheque_date), reference: row.reference ?? row.cheque_number ?? '-', createdBy: creator(row) })),
    ...purchasePayments.filter((row) => row.method === 'cheque').map((row) => { const purchase = purchases.find((p) => String(p.id) === String(row.purchase_id)); return { id: `vendor-${row.id}`, chequeType: 'Vendor', party: vendors.get(String(purchase?.vendor_id))?.name ?? '-', chequeNumber: row.reference ?? '-', bankCode: row.bank_code ?? String(row.reference ?? '').split('-')[1] ?? '-', bank: row.bank_name ?? '-', date: dateOnly(row.paid_at), amount: n(row.amount), status: row.status ?? 'deposited', depositBank: row.bank_name ?? '-', depositDate: dateOnly(row.paid_at), dueDate: dateOnly(row.due_date ?? row.paid_at), days: daysSince(row.due_date ?? row.paid_at), reference: row.reference ?? '-', createdBy: creator(row) } }),
  ]

  const entries = keyBy(raw.journal_entries)
  const journals = keyBy(raw.journals)
  const journalRows = (raw.journal_entry_lines ?? []).map((line) => {
    const entry = entries.get(String(line.entry_id)) ?? {}
    const account = journals.get(String(line.journal_id)) ?? {}
    return { id: line.id, accountId: line.journal_id, entryNumber: entry.entry_number ?? `JE-${String(entry.id ?? line.entry_id).slice(0, 8)}`, date: dateOnly(entry.date ?? entry.created_at ?? line.created_at), description: line.description ?? entry.description ?? '-', accountCode: account.code ?? '-', accountName: account.description ?? account.name ?? '-', accountType: account.account_type ?? '-', debit: n(line.debit), credit: n(line.credit), status: line.status ?? entry.status ?? 'Active', createdBy: creator(entry), amount: Math.max(n(line.debit), n(line.credit)) }
  })

  const ledgerRunning = new Map()
  const ledger = [...journalRows].sort((a, b) => new Date(a.date) - new Date(b.date)).map((row) => {
    const account = journals.get(String(row.accountId)) ?? {}
    const opening = n(account.s_balance) + n(account.h_balance)
    const previous = ledgerRunning.has(String(row.accountId)) ? ledgerRunning.get(String(row.accountId)) : opening
    const runningBalance = previous + row.debit - row.credit
    ledgerRunning.set(String(row.accountId), runningBalance)
    return { ...row, reference: row.entryNumber, runningBalance }
  })
  const trial = (raw.journals ?? []).map((account) => {
    const lines = journalRows.filter((row) => String(row.accountId) === String(account.id))
    const balance = n(account.s_balance) + n(account.h_balance) + sum(lines, (row) => row.debit - row.credit)
    return { id: account.id, accountId: account.id, accountCode: account.code ?? '-', accountName: account.description ?? account.name ?? '-', accountType: account.account_type ?? '-', debitBalance: Math.max(0, balance), creditBalance: Math.max(0, -balance), amount: Math.abs(balance) }
  })

  const salesByRepPeriod = new Map()
  invoices.forEach((inv) => {
    if (!inv.rep_id) return
    const d = new Date(inv.created_at)
    const key = `${inv.rep_id}|${d.getFullYear()}|${d.getMonth()}`
    salesByRepPeriod.set(key, (salesByRepPeriod.get(key) ?? 0) + n(inv.total_amount))
  })
  returns.forEach((ret) => {
    const inv = invoices.find((row) => String(row.id) === String(ret.invoice_id))
    if (!inv?.rep_id) return
    const d = new Date(ret.created_at)
    const key = `${inv.rep_id}|${d.getFullYear()}|${d.getMonth()}`
    salesByRepPeriod.set(key, (salesByRepPeriod.get(key) ?? 0) - n(ret.total_amount))
  })
  const paidByRepPeriod = groupBy(repPayments, (row) => `${row.rep_id}|${row.period_year}|${row.period_month}`)
  const commissions = [...salesByRepPeriod.entries()].map(([key, totalSales]) => {
    const [repId, year, monthIndex] = key.split('|')
    const rep = employees.get(String(repId)) ?? {}
    const rate = getCommissionRate(rep.name)
    const earned = Math.max(0, totalSales) * rate
    const payments = paidByRepPeriod.get(key) ?? []
    const paid = sum(payments, 'amount')
    const advance = sum(payments, 'advance_amount')
    const remaining = Math.max(0, earned - paid - advance)
    return { id: key, repId, rep: rep.name ?? '-', month: new Date(Number(year), Number(monthIndex), 1).toLocaleString(undefined, { month: 'long', year: 'numeric' }), date: `${year}-${String(Number(monthIndex) + 1).padStart(2, '0')}-01`, totalSales, commissionRate: `${(rate * 100).toFixed(2)}%`, commissionEarned: earned, advanceApplied: advance, amountPaid: paid, remainingCommission: remaining, status: remaining <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Due', amount: remaining }
  })
  const commissionByKey = keyBy(commissions)
  const repPaymentRows = repPayments.map((row) => {
    const key = `${row.rep_id}|${row.period_year}|${row.period_month}`
    const commission = commissionByKey.get(key) ?? {}
    return { id: row.id, repId: row.rep_id, rep: employees.get(String(row.rep_id))?.name ?? '-', date: dateOnly(row.paid_at), commissionDue: n(commission.commissionEarned), amountPaid: n(row.amount), advanceAmount: n(row.advance_amount), advanceApplied: n(row.advance_applied), remainingDue: Math.max(0, n(commission.commissionEarned) - n(commission.amountPaid) - n(commission.advanceApplied)), method: row.method ?? '-', notes: row.note ?? '-', smsStatus: row.sms_sent ? 'Sent' : 'Not sent', createdBy: creator(row), amount: n(row.amount) }
  })

  const profitLoss = profitLossStatement(buildProfitLoss(raw, raw.profitLossRange ?? {}))

  const totalCashIn = sum(cashTransactions, 'cashIn')
  const totalCashOut = sum(cashTransactions, 'cashOut')
  const totalBankIn = sum(bankTransactions, 'deposit')
  const totalBankOut = sum(bankTransactions, 'withdrawal')
  const cashFlow = [
    ['Opening', 'Opening Cash', 0], ['Inflows', 'Cash receipts and sales', totalCashIn], ['Inflows', 'Bank receipts and cheque deposits', totalBankIn],
    ['Outflows', 'Cash payments', -totalCashOut], ['Outflows', 'Bank payments', -totalBankOut], ['Net Movement', 'Net Cash Movement', totalCashIn + totalBankIn - totalCashOut - totalBankOut],
    ['Closing', 'Closing Cash and Bank Movement', totalCashIn + totalBankIn - totalCashOut - totalBankOut],
  ].map(([section, description, amount], id) => ({ id, section, description, amount, date: '' }))

  return { receivables, payables, 'cash-book': cashTransactions, 'bank-book': bankTransactions, 'bank-reconciliation': reconciliations,
    cheques: chequeRows, journals: journalRows, 'general-ledger': ledger, 'trial-balance': trial, 'rep-payments': repPaymentRows,
    commissions, 'profit-loss': profitLoss, 'cash-flow': cashFlow }
}

export function reportSummary(key, rows) {
  const agingTotals = (bucket) => sum(rows.filter((r) => r.agingBucket === bucket), 'outstanding')
  if (key === 'receivables') return [['Total Receivables', sum(rows, 'invoiceTotal')], ['Total Paid', sum(rows, 'amountPaid')], ['Total Outstanding', sum(rows, 'outstanding')], ['Current', agingTotals('Current')], ['31-60', agingTotals('31-60')], ['61-90', agingTotals('61-90')], ['91-120', agingTotals('91-120')], ['120+', agingTotals('120+')], ['Over Credit Limit', rows.filter((r) => r.outstanding > r.creditLimit && r.creditLimit > 0).length]]
  if (key === 'payables') return [['Total Payables', sum(rows, 'purchaseTotal')], ['Total Paid', sum(rows, 'amountPaid')], ['Outstanding', sum(rows, 'outstanding')], ['Current', agingTotals('Current')], ['31-60', agingTotals('31-60')], ['61-90', agingTotals('61-90')], ['91-120', agingTotals('91-120')], ['120+', agingTotals('120+')]]
  if (key === 'cash-book') { const opening = rows.length ? n(rows[0].runningBalance) - n(rows[0].cashIn) + n(rows[0].cashOut) : 0; return [['Opening Cash', opening], ['Total Cash In', sum(rows, 'cashIn')], ['Total Cash Out', sum(rows, 'cashOut')], ['Closing Cash', opening + sum(rows, (r) => r.cashIn - r.cashOut)]] }
  if (key === 'bank-book') { const firstByBank = new Map(); rows.forEach((r) => { const bankKey = String(r.bankId ?? r.bank); if (!firstByBank.has(bankKey)) firstByBank.set(bankKey, r) }); const opening = sum([...firstByBank.values()], (r) => n(r.runningBalance) - n(r.deposit) + n(r.withdrawal)); return [['Opening Balance', opening], ['Deposits', sum(rows, 'deposit')], ['Withdrawals', sum(rows, 'withdrawal')], ['Closing Balance', opening + sum(rows, (r) => r.deposit - r.withdrawal)], ['Unreconciled Amount', sum(rows.filter((r) => r.reconciled !== 'Yes'), 'amount')]] }
  if (key === 'bank-reconciliation') return [['Total Lines', rows.length], ['Money In (Deposits)', sum(rows, 'deposit')], ['Money Out (Payments)', sum(rows, 'withdrawal')], ['Reconciled Amount', sum(rows.filter((r) => r.reconciled === 'Yes'), 'amount')], ['Unreconciled Amount', sum(rows.filter((r) => r.reconciled !== 'Yes'), 'amount')], ['Reconciled Count', rows.filter((r) => r.reconciled === 'Yes').length], ['Unreconciled Count', rows.filter((r) => r.reconciled !== 'Yes').length]]
  if (key === 'cheques') return [['Total Cheque Value', sum(rows, 'amount')], ['In Hand', sum(rows.filter((r) => r.status === 'in hand'), 'amount')], ['Deposited', sum(rows.filter((r) => r.status === 'deposited'), 'amount')], ['Cleared', sum(rows.filter((r) => r.status === 'cleared'), 'amount')], ['Returned', sum(rows.filter((r) => r.status === 'returned'), 'amount')], ['Due Today', sum(rows.filter((r) => r.dueDate === dateOnly(new Date())), 'amount')], ['Upcoming', sum(rows.filter((r) => r.dueDate > dateOnly(new Date())), 'amount')]]
  if (key === 'journals') return [['Total Debit', sum(rows, 'debit')], ['Total Credit', sum(rows, 'credit')], ['Difference', Math.abs(sum(rows, 'debit') - sum(rows, 'credit'))]]
  if (key === 'general-ledger') { const opening = rows.length ? n(rows[0].runningBalance) - n(rows[0].debit) + n(rows[0].credit) : 0; return [['Opening Balance', opening], ['Total Debit', sum(rows, 'debit')], ['Total Credit', sum(rows, 'credit')], ['Closing Balance', opening + sum(rows, (r) => r.debit - r.credit)]] }
  if (key === 'trial-balance') return [['Total Debit', sum(rows, 'debitBalance')], ['Total Credit', sum(rows, 'creditBalance')], ['Difference', Math.abs(sum(rows, 'debitBalance') - sum(rows, 'creditBalance'))]]
  if (key === 'rep-payments') return [['Total Rep Payments', sum(rows, 'amountPaid')], ['Commission Settled', sum(rows, (r) => r.amountPaid - r.advanceAmount)], ['Advance Paid', sum(rows, 'advanceAmount')], ['Outstanding Commission', sum(rows, 'remainingDue')]]
  if (key === 'commissions') return [['Commission Earned', sum(rows, 'commissionEarned')], ['Total Paid', sum(rows, 'amountPaid')], ['Total Advance', sum(rows, 'advanceApplied')], ['Total Outstanding', sum(rows, 'remainingCommission')]]
  return rows.map((row) => [row.description, row.amount])
}

export function financeDashboard(reports) {
  return [
    ['Total Receivables', sum(reports.receivables, 'outstanding')], ['Total Payables', sum(reports.payables, 'outstanding')],
    ['Cash In', sum(reports['cash-book'], 'cashIn')], ['Cash Out', sum(reports['cash-book'], 'cashOut')],
    ['Bank Balance', sum(reports['bank-book'], (r) => r.deposit - r.withdrawal)], ['Cheques In Hand', sum(reports.cheques.filter((r) => r.status === 'in hand'), 'amount')],
    ['Returned Cheques', sum(reports.cheques.filter((r) => r.status === 'returned'), 'amount')], ['Rep Payments', sum(reports['rep-payments'], 'amountPaid')],
    ['Commission Due', sum(reports.commissions, 'remainingCommission')], ['Gross Profit', reports['profit-loss'].find((r) => r.description === 'Gross Profit')?.amount ?? 0],
    ['Net Cash Movement', reports['cash-flow'].find((r) => r.section === 'Net Movement')?.amount ?? 0],
  ]
}

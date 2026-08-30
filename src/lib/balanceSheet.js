import { buildInvoiceBalanceRows } from './receivables.js'
import { buildProfitLoss } from './profitLoss.js'
import { getCommissionRate } from './repCommission.js'
import { buildExpenseRows } from './expenseReports.js'

const invalidStatuses = new Set(['cancelled', 'canceled', 'deleted', 'draft', 'reversed', 'void'])
const n = (value) => Number(value ?? 0) || 0
const id = (value) => String(value ?? '')
const date = (value) => value ? String(value).slice(0, 10) : ''
const money2 = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100
const active = (row) => !invalidStatuses.has(String(row?.status ?? 'completed').toLowerCase())
const onOrBefore = (value, asAt) => {
  const valueDate = date(value)
  return !!valueDate && (!asAt || valueDate <= asAt)
}
const sum = (rows, field) => rows.reduce((total, row) => total + n(typeof field === 'function' ? field(row) : row[field]), 0)
const mapById = (rows = []) => new Map(rows.map((row) => [id(row.id), row]))
const rowDate = (row) => row.date ?? row.created_at ?? row.paid_at ?? row.purchase_date ?? row.return_date ?? row.adjustment_date
const dated = (rows, asAt) => (rows ?? []).filter((row) => active(row) && onOrBefore(rowDate(row), asAt))

function restoreReturnedChequeReceivables(rows, cheques) {
  const restored = []
  for (const cheque of cheques.filter((row) => String(row.status).toLowerCase() === 'returned')) {
    let remaining = n(cheque.amount)
    const candidates = rows
      .filter((row) => id(row.customer_id) === id(cheque.customer_id))
      .sort((a, b) => date(a.created_at).localeCompare(date(b.created_at)))
    for (const invoice of candidates) {
      if (remaining <= 0) break
      const ceiling = Math.max(0, n(invoice.total_amount) - n(invoice.returned))
      const available = Math.max(0, ceiling - n(invoice.balance))
      const applied = Math.min(available, remaining)
      if (!applied) continue
      invoice.balance = money2(invoice.balance + applied)
      invoice.returnedCheque = money2(n(invoice.returnedCheque) + applied)
      remaining -= applied
      restored.push({ chequeId: cheque.id, invoiceId: invoice.id, amount: applied })
    }
  }
  return restored
}

function receivablesAsAt(raw, asAt) {
  const customers = mapById(raw.customers)
  const invoices = dated(raw.invoices, asAt).filter((row) => String(row.payment_type ?? 'credit').toLowerCase() === 'credit')
  const invoiceIds = new Set(invoices.map((row) => id(row.id)))
  const payments = dated(raw.invoice_payments, asAt).filter((row) => invoiceIds.has(id(row.invoice_id)))
  const returns = dated(raw.returns, asAt)
  const cheques = (raw.customer_cheques ?? []).filter((row) => onOrBefore(row.cheque_date ?? row.created_at, asAt))
  const rows = buildInvoiceBalanceRows(invoices, payments, returns)
  const restoredCheques = restoreReturnedChequeReceivables(rows, cheques)
  const details = rows.filter((row) => row.balance > 0.005).map((row) => ({
    id: row.id,
    customer: customers.get(id(row.customer_id))?.name ?? 'Unknown customer',
    invoice: row.invoice_number ?? row.id,
    date: date(row.created_at),
    invoiceTotal: n(row.total_amount),
    payments: n(row.paid),
    returns: n(row.returned),
    returnedCheque: n(row.returnedCheque),
    outstanding: money2(row.balance),
  }))
  return { total: money2(sum(details, 'outstanding')), details, restoredCheques }
}

function payablesAsAt(raw, asAt) {
  const vendors = mapById(raw.vendors)
  const purchases = dated(raw.purchases, asAt).filter((row) => String(row.payment_type ?? 'credit').toLowerCase() === 'credit')
  const purchaseIds = new Set(purchases.map((row) => id(row.id)))
  const payments = dated(raw.purchase_payments, asAt).filter((row) => purchaseIds.has(id(row.purchase_id)))
  const paidByPurchase = new Map()
  payments.forEach((row) => paidByPurchase.set(id(row.purchase_id), n(paidByPurchase.get(id(row.purchase_id))) + n(row.amount)))
  const details = purchases.map((row) => {
    const paid = n(paidByPurchase.get(id(row.id)))
    const outstanding = Math.max(0, n(row.total_amount) - paid - n(row.credit_amount ?? row.return_credit))
    return { id: row.id, vendor: vendors.get(id(row.vendor_id))?.name ?? 'Unknown vendor', purchase: row.ref_no ?? row.purchase_number ?? row.id, date: date(row.purchase_date ?? row.date ?? row.created_at), purchaseTotal: n(row.total_amount), payments: paid, outstanding: money2(outstanding) }
  }).filter((row) => row.outstanding > 0.005)
  return { total: money2(sum(details, 'outstanding')), details }
}

function inventoryAsAt(raw, asAt) {
  const products = mapById(raw.products)
  const quantities = new Map()
  const costQty = new Map()
  const costValue = new Map()
  const addQuantity = (productId, amount) => quantities.set(id(productId), n(quantities.get(id(productId))) + n(amount))
  const addCost = (productId, quantity, cost) => {
    const key = id(productId)
    costQty.set(key, n(costQty.get(key)) + n(quantity))
    costValue.set(key, n(costValue.get(key)) + n(quantity) * n(cost))
  }
  const beginningHeaders = dated(raw.beginning_stock, asAt)
  const beginningIds = new Set(beginningHeaders.map((row) => id(row.id)))
  const beginningItems = [...beginningHeaders.flatMap((header) => header.beginning_stock_items ?? []), ...(raw.beginning_stock_items ?? []).filter((item) => beginningIds.has(id(item.beginning_stock_id)))]
  beginningItems.forEach((item) => {
    addQuantity(item.product_id, item.quantity)
    addCost(item.product_id, item.quantity, item.cost ?? item.cost_price)
  })
  const purchases = dated(raw.purchases, asAt)
  const purchaseIds = new Set(purchases.map((row) => id(row.id)))
  ;(raw.purchase_items ?? []).filter((item) => purchaseIds.has(id(item.purchase_id))).forEach((item) => {
    addQuantity(item.product_id, item.quantity)
    addCost(item.product_id, item.quantity, item.cost ?? item.cost_price)
  })
  const invoices = dated(raw.invoices, asAt)
  const invoiceIds = new Set(invoices.map((row) => id(row.id)))
  ;(raw.invoice_items ?? []).filter((item) => invoiceIds.has(id(item.invoice_id)) && active(item)).forEach((item) => addQuantity(item.product_id, -n(item.quantity)))
  const returns = dated(raw.returns, asAt)
  const returnIds = new Set(returns.map((row) => id(row.id)))
  ;(raw.return_items ?? []).filter((item) => returnIds.has(id(item.return_id)) && active(item)).forEach((item) => addQuantity(item.product_id, item.quantity))
  const purchaseReturns = dated(raw.purchase_returns, asAt)
  const purchaseReturnIds = new Set(purchaseReturns.map((row) => id(row.id)))
  const purchaseReturnItems = [...purchaseReturns.flatMap((header) => header.purchase_return_items ?? []), ...(raw.purchase_return_items ?? []).filter((item) => purchaseReturnIds.has(id(item.purchase_return_id ?? item.return_id)))]
  purchaseReturnItems.forEach((item) => addQuantity(item.product_id, -n(item.quantity)))
  dated(raw.stock_adjustments, asAt).forEach((row) => addQuantity(row.product_id, ['positive', 'increase'].includes(String(row.adjustment_type).toLowerCase()) ? n(row.quantity) : -n(row.quantity)))
  const details = [...products.values()].map((product) => {
    const rawQuantity = n(quantities.get(id(product.id)))
    const quantity = Math.max(0, rawQuantity)
    const averageCost = n(costQty.get(id(product.id))) > 0 ? n(costValue.get(id(product.id))) / n(costQty.get(id(product.id))) : n(product.cost_price ?? product.cost ?? product.purchase_price)
    return { id: product.id, code: product.code ?? product.product_code ?? '-', product: product.name ?? '-', quantity, backorder: Math.max(0, -rawQuantity), unitCost: money2(averageCost), value: money2(quantity * averageCost) }
  }).filter((row) => row.quantity > 0 || row.backorder > 0)
  return { total: money2(sum(details, 'value')), details, backorderUnits: sum(details, 'backorder') }
}

function chequeAssetsAsAt(raw, asAt) {
  const customers = mapById(raw.customers)
  const details = (raw.customer_cheques ?? []).flatMap((row) => {
    const received = date(row.cheque_date ?? row.created_at)
    const deposited = date(row.deposited_at)
    if (!received || received > asAt || (deposited && deposited <= asAt) || String(row.status).toLowerCase() === 'returned') return []
    return [{ id: row.id, customer: customers.get(id(row.customer_id))?.name ?? 'Unknown customer', chequeNumber: row.cheque_number ?? '-', bank: row.bank_name ?? '-', chequeDate: received, amount: n(row.amount), status: 'In hand' }]
  })
  return { total: money2(sum(details, 'amount')), details }
}

function bankBalancesAsAt(raw, asAt) {
  const banks = raw.banks ?? []
  const movements = new Map(banks.map((bank) => [id(bank.id), n(bank.opening_balance)]))
  const resolveBankId = (row) => {
    if (row.bank_id) return row.bank_id
    const name = String(row.bank_name ?? row.bank ?? '').toLowerCase()
    return banks.find((bank) => name === String(bank.name ?? '').toLowerCase() || name === `${bank.code} - ${bank.name}`.toLowerCase() || name.includes(String(bank.name ?? '').toLowerCase()))?.id
  }
  const add = (bankId, amount) => {
    if (!bankId) return
    movements.set(id(bankId), n(movements.get(id(bankId))) + n(amount))
  }
  dated(raw.invoice_payments, asAt).filter((row) => String(row.method).toLowerCase() === 'bank').forEach((row) => add(resolveBankId(row), row.amount))
  dated(raw.purchase_payments, asAt).filter((row) => String(row.method).toLowerCase() === 'bank').forEach((row) => add(resolveBankId(row), -n(row.amount)))
  const repPayments = raw.rep_commission_payments ?? raw.rep_payments ?? []
  dated(repPayments, asAt).filter((row) => String(row.method).toLowerCase() === 'bank').forEach((row) => add(resolveBankId(row), -n(row.amount)))
  buildExpenseRows(raw).filter((row) => onOrBefore(row.date, asAt) && String(row.paymentMethod).toLowerCase() === 'bank').forEach((row) => add(resolveBankId(row), -n(row.amount)))
  ;(raw.customer_cheques ?? []).filter((row) => row.deposit_bank_id && onOrBefore(row.deposited_at, asAt) && String(row.status).toLowerCase() !== 'returned').forEach((row) => add(row.deposit_bank_id, row.amount))
  const details = banks.map((bank) => ({ id: bank.id, code: bank.code ?? '-', bank: bank.name ?? '-', account: bank.account_no ?? '-', balance: money2(movements.get(id(bank.id))) }))
  return { total: money2(sum(details, 'balance')), details }
}

function cashPositionAsAt(raw, asAt, ledgerAccounts) {
  if (ledgerAccounts.length) return { total: money2(sum(ledgerAccounts, 'balance')), details: ledgerAccounts, source: 'Cash ledger' }
  const rows = []
  const add = (source, reference, transactionDate, cashIn, cashOut) => rows.push({ id: `${source}-${reference}`, source, reference, date: date(transactionDate), cashIn: n(cashIn), cashOut: n(cashOut) })
  dated(raw.invoices, asAt).filter((row) => String(row.payment_type).toLowerCase() === 'cash').forEach((row) => add('Cash Sale', row.invoice_number ?? row.id, row.created_at ?? row.date, row.total_amount, 0))
  dated(raw.invoice_payments, asAt).filter((row) => String(row.method).toLowerCase() === 'cash').forEach((row) => add('Customer Cash Receipt', row.reference ?? row.id, row.paid_at, row.amount, 0))
  const purchases = dated(raw.purchases, asAt)
  const purchaseMap = mapById(purchases)
  purchases.filter((row) => String(row.payment_type).toLowerCase() === 'cash').forEach((row) => add('Cash Purchase', row.ref_no ?? row.id, row.purchase_date ?? row.date ?? row.created_at, 0, row.total_amount))
  dated(raw.purchase_payments, asAt).filter((row) => String(row.method).toLowerCase() === 'cash' && String(purchaseMap.get(id(row.purchase_id))?.payment_type).toLowerCase() !== 'cash').forEach((row) => add('Vendor Cash Payment', row.reference ?? row.id, row.paid_at, 0, row.amount))
  dated(raw.rep_commission_payments ?? raw.rep_payments, asAt).filter((row) => String(row.method).toLowerCase() === 'cash').forEach((row) => add('Rep Cash Payment', row.reference ?? row.id, row.paid_at, 0, row.amount))
  buildExpenseRows(raw).filter((row) => onOrBefore(row.date, asAt) && String(row.paymentMethod).toLowerCase() === 'cash').forEach((row) => add('Cash Expense', row.reference ?? row.id, row.date, 0, row.amount))
  return { total: money2(sum(rows, (row) => row.cashIn - row.cashOut)), details: rows, source: 'System cash book' }
}

function journalBalancesAsAt(raw, asAt) {
  const entries = mapById(dated(raw.journal_entries, asAt))
  const linesByAccount = new Map()
  ;(raw.journal_entry_lines ?? []).forEach((line) => {
    const entry = entries.get(id(line.entry_id))
    if (!entry || !active(line)) return
    const current = linesByAccount.get(id(line.journal_id)) ?? { debit: 0, credit: 0 }
    current.debit += n(line.debit)
    current.credit += n(line.credit)
    linesByAccount.set(id(line.journal_id), current)
  })
  return (raw.journals ?? []).map((account) => {
    const lines = linesByAccount.get(id(account.id)) ?? { debit: 0, credit: 0 }
    const opening = n(account.s_balance) + n(account.h_balance)
    const text = `${account.account_type ?? ''} ${account.description ?? account.name ?? ''}`.toLowerCase()
    const creditNature = /liabilit|payable|equity|capital|retained|drawing/.test(text)
    const movement = creditNature ? lines.credit - lines.debit : lines.debit - lines.credit
    return { id: account.id, code: account.code ?? '-', name: account.description ?? account.name ?? '-', text, balance: money2(opening + movement) }
  })
}

function journalSections(raw, asAt) {
  const accounts = journalBalancesAsAt(raw, asAt)
  const select = (pattern, exclude = /$a/) => accounts.filter((row) => pattern.test(row.text) && !exclude.test(row.text) && Math.abs(row.balance) > 0.005)
  const cash = select(/cash|petty/, /bank|cheque|expense|flow/)
  const fixedAssets = select(/fixed asset|equipment|furniture|vehicle|computer|machinery|property/)
  const otherAssets = select(/asset|advance|prepaid|deposit/, /cash|bank|cheque|inventory|receivable|fixed asset|equipment|furniture|vehicle|computer/)
  const nonCurrentLiabilities = select(/long.?term|non.?current liabilit|loan payable|mortgage/)
  const currentLiabilities = select(/liabilit|payable|accrual/, /long.?term|non.?current|accounts payable|commission/)
  const capital = select(/capital|owner.?s equity|owner equity|contribution/)
  const retained = select(/retained|accumulated profit|accumulated loss/)
  const otherEquity = select(/equity|drawing/, /capital|owner.?s equity|retained|accumulated/)
  return { cash, fixedAssets, otherAssets, nonCurrentLiabilities, currentLiabilities, capital, retained, otherEquity }
}

function commissionPositionAsAt(raw, asAt) {
  const start = '1900-01-01'
  const model = buildProfitLoss(raw, { from: start, to: asAt, grouping: 'year' })
  const earned = n(model.totals.commissions)
  const payments = dated(raw.rep_commission_payments ?? raw.rep_payments, asAt)
  const paid = sum(payments, 'amount')
  const payable = money2(Math.max(0, earned - paid))
  const advances = money2(Math.max(0, paid - earned))
  const employees = mapById(raw.employees)
  const byRep = new Map()
  model.commissionDetails.forEach((row) => byRep.set(id(row.repId), { repId: row.repId, rep: row.rep, earned: n(row.amount), paid: 0 }))
  payments.forEach((row) => {
    const key = id(row.rep_id)
    const current = byRep.get(key) ?? { repId: row.rep_id, rep: employees.get(key)?.name ?? 'Unknown rep', earned: 0, paid: 0 }
    current.paid += n(row.amount)
    byRep.set(key, current)
  })
  const details = [...byRep.values()].map((row) => ({ ...row, payable: money2(Math.max(0, row.earned - row.paid)), advance: money2(Math.max(0, row.paid - row.earned)) }))
  return { earned: money2(earned), paid: money2(paid), payable, advances, details }
}

export function buildBalanceSheet(raw, { asAt } = {}) {
  if (!asAt) throw new Error('An as-at date is required')
  const receivables = receivablesAsAt(raw, asAt)
  const payables = payablesAsAt(raw, asAt)
  const inventory = inventoryAsAt(raw, asAt)
  const cheques = chequeAssetsAsAt(raw, asAt)
  const banks = bankBalancesAsAt(raw, asAt)
  const journals = journalSections(raw, asAt)
  const commission = commissionPositionAsAt(raw, asAt)
  const currentYear = asAt.slice(0, 4)
  const profitLoss = buildProfitLoss(raw, { from: `${currentYear}-01-01`, to: asAt, grouping: 'month' })
  const priorProfitLoss = buildProfitLoss(raw, { from: '1900-01-01', to: `${Number(currentYear) - 1}-12-31`, grouping: 'year' })
  const cashPosition = cashPositionAsAt(raw, asAt, journals.cash)
  const cash = cashPosition.total
  const otherCurrentAssets = money2(sum(journals.otherAssets, 'balance'))
  const fixedAssets = money2(sum(journals.fixedAssets, 'balance'))
  const otherCurrentLiabilities = money2(sum(journals.currentLiabilities, 'balance'))
  const nonCurrentLiabilities = money2(sum(journals.nonCurrentLiabilities, 'balance'))
  const openingCapital = money2(sum(journals.capital, 'balance'))
  const retainedEarnings = journals.retained.length ? money2(sum(journals.retained, 'balance')) : money2(priorProfitLoss.totals.netProfit)
  const otherEquity = money2(sum(journals.otherEquity, 'balance'))
  const currentProfit = money2(profitLoss.totals.netProfit)
  const currentAssets = money2(cash + banks.total + receivables.total + cheques.total + inventory.total + commission.advances + otherCurrentAssets)
  const totalAssets = money2(currentAssets + fixedAssets)
  const currentLiabilities = money2(payables.total + commission.payable + otherCurrentLiabilities)
  const totalLiabilities = money2(currentLiabilities + nonCurrentLiabilities)
  const totalEquity = money2(openingCapital + retainedEarnings + currentProfit + otherEquity)
  const liabilitiesAndEquity = money2(totalLiabilities + totalEquity)
  const difference = money2(totalAssets - liabilitiesAndEquity)
  const diagnostics = [
    !journals.cash.length && 'Cash in Hand is derived from the system cash book because no dedicated cash ledger account exists.',
    !journals.retained.length && Math.abs(retainedEarnings) > 0.005 && 'Retained earnings are derived from shared prior-year Profit & Loss because no retained earnings ledger account exists.',
    cash < -0.005 && 'System cash activity produces a negative cash balance; an opening cash balance or missing cash receipt may need to be recorded.',
    inventory.backorderUnits > 0 && `${inventory.backorderUnits} backordered units were excluded from the inventory asset.`,
    Math.abs(difference) >= 0.01 && 'Assets do not equal liabilities plus equity. Missing or inconsistent accounting entries require review.',
    profitLoss.totals.missingCostLines > 0 && `${profitLoss.totals.missingCostLines} profit-and-loss lines have no historical cost.`,
  ].filter(Boolean)
  return {
    asAt,
    totals: { cash, banks: banks.total, receivables: receivables.total, cheques: cheques.total, inventory: inventory.total, repAdvances: commission.advances, otherCurrentAssets, currentAssets, fixedAssets, totalAssets, payables: payables.total, commissionPayable: commission.payable, otherCurrentLiabilities, currentLiabilities, nonCurrentLiabilities, totalLiabilities, openingCapital, retainedEarnings, currentProfit, otherEquity, totalEquity, liabilitiesAndEquity, difference, balanced: Math.abs(difference) < 0.01 },
    details: { receivables: receivables.details, payables: payables.details, inventory: inventory.details, banks: banks.details, cheques: cheques.details, repPositions: commission.details, cash: cashPosition.details, fixedAssets: journals.fixedAssets, otherAssets: journals.otherAssets, currentLiabilities: journals.currentLiabilities, nonCurrentLiabilities: journals.nonCurrentLiabilities, capital: journals.capital, retained: journals.retained.length ? journals.retained : [{ id: 'derived-retained', code: '-', name: 'Prior-year profit/loss derived from system transactions', balance: retainedEarnings }], otherEquity: journals.otherEquity },
    diagnostics,
    reconciliation: { returnedChequeAllocations: receivables.restoredCheques, profitLossWarnings: profitLoss.reconciliationWarnings },
  }
}

export function balanceSheetRows(model) {
  const t = model.totals
  return [
    ['Assets', 'Current Assets', 'Cash in Hand', t.cash],
    ['Assets', 'Current Assets', 'Bank Balances', t.banks],
    ['Assets', 'Current Assets', 'Accounts Receivable', t.receivables],
    ['Assets', 'Current Assets', 'Cheques in Hand', t.cheques],
    ['Assets', 'Current Assets', 'Inventory', t.inventory],
    ['Assets', 'Current Assets', 'Rep Advances', t.repAdvances],
    ['Assets', 'Current Assets', 'Other Current Assets', t.otherCurrentAssets],
    ['Assets', 'Non-Current Assets', 'Fixed Assets', t.fixedAssets],
    ['Liabilities', 'Current Liabilities', 'Accounts Payable', t.payables],
    ['Liabilities', 'Current Liabilities', 'Rep Commission Payable', t.commissionPayable],
    ['Liabilities', 'Current Liabilities', 'Other Current Liabilities', t.otherCurrentLiabilities],
    ['Liabilities', 'Non-Current Liabilities', 'Non-Current Liabilities', t.nonCurrentLiabilities],
    ['Equity', 'Equity', 'Opening Capital / Owner Equity', t.openingCapital],
    ['Equity', 'Equity', 'Retained Earnings', t.retainedEarnings],
    ['Equity', 'Equity', t.currentProfit < 0 ? 'Current Period Loss' : 'Current Period Profit', t.currentProfit],
    ['Equity', 'Equity', 'Other Equity', t.otherEquity],
  ].map(([section, category, account, amount], index) => ({ id: index + 1, section, category, account, amount }))
}

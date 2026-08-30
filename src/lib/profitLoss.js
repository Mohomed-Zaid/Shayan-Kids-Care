import { buildExpenseRows } from './expenseReports.js'
import { getCommissionRate } from './repCommission.js'

const n = (value) => Number(value ?? 0) || 0
const sid = (value) => String(value ?? '')
export const plDate = (value) => value ? String(value).slice(0, 10) : ''
const inactive = new Set(['cancelled', 'canceled', 'deleted', 'draft', 'reversed', 'void'])
const active = (row) => !inactive.has(String(row?.status ?? 'completed').toLowerCase())
const within = (value, from, to) => { const date = plDate(value); return !!date && (!from || date >= from) && (!to || date <= to) }
const money2 = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100
const byId = (rows = []) => new Map(rows.map((row) => [sid(row.id), row]))

function historicalCosts(raw) {
  const products = byId(raw.products)
  const variants = byId(raw.product_variants ?? raw.variants)
  const purchases = byId((raw.purchases ?? []).filter(active))
  const history = new Map()
  ;(raw.purchase_items ?? []).forEach((item) => {
    const purchase = purchases.get(sid(item.purchase_id))
    if (!purchase) return
    const productId = item.product_id ?? variants.get(sid(item.variant_id))?.product_id
    if (!productId) return
    const entry = { date: plDate(purchase.purchase_date ?? purchase.date ?? purchase.created_at), cost: n(item.cost_price ?? item.cost), reference: purchase.ref_no ?? purchase.purchase_number ?? purchase.id }
    if (!history.has(sid(productId))) history.set(sid(productId), [])
    history.get(sid(productId)).push(entry)
  })
  for (const values of history.values()) values.sort((a, b) => a.date.localeCompare(b.date))
  const costAt = (item, saleDate) => {
    if (item.cost_price != null) return { cost: n(item.cost_price), source: 'Stored historical cost' }
    const productId = item.product_id ?? variants.get(sid(item.variant_id))?.product_id
    const values = history.get(sid(productId)) ?? []
    const eligible = values.filter((entry) => !saleDate || entry.date <= plDate(saleDate))
    const found = eligible.at(-1)
    return found ? { cost: found.cost, source: `Purchase ${found.reference}` } : { cost: null, source: 'Cost not available' }
  }
  return { products, variants, costAt }
}

function periodLabel(key, grouping) {
  const date = new Date(`${grouping === 'year' ? `${key}-01-02` : `${key}-02`}T00:00:00`)
  return grouping === 'year' ? key : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function buildProfitLoss(raw, { from = '', to = '', grouping = 'month' } = {}) {
  const unique = (rows) => [...new Map(rows.map((row, index) => [sid(row.id) || `row-${index}`, row])).values()]
  const allInvoices = unique(raw.invoices ?? []).filter(active)
  const invoices = allInvoices.filter((row) => within(row.created_at ?? row.date, from, to))
  const allReturns = unique(raw.returns ?? []).filter(active).sort((a, b) => new Date(a.created_at ?? a.date) - new Date(b.created_at ?? b.date))
  const returns = allReturns.filter((row) => within(row.created_at ?? row.date, from, to))
  const invoiceMap = byId(allInvoices)
  const customers = byId(raw.customers)
  const employees = byId(raw.employees)
  const itemGroups = new Map()
  ;(unique(raw.invoice_items ?? []).filter(active)).forEach((item) => {
    if (!itemGroups.has(sid(item.invoice_id))) itemGroups.set(sid(item.invoice_id), [])
    itemGroups.get(sid(item.invoice_id)).push(item)
  })
  const returnGroups = new Map()
  ;(unique(raw.return_items ?? []).filter(active)).forEach((item) => {
    if (!returnGroups.has(sid(item.return_id))) returnGroups.set(sid(item.return_id), [])
    returnGroups.get(sid(item.return_id)).push(item)
  })
  const { products, variants, costAt } = historicalCosts(raw)
  const salesDetails = []
  invoices.forEach((invoice) => {
    const items = itemGroups.get(sid(invoice.id)) ?? []
    const lineDiscount = items.reduce((sum, item) => {
      const gross = n(item.quantity) * n(item.price ?? item.selling_price)
      return sum + Math.max(0, gross - n(item.total ?? gross * (1 - n(item.discount) / 100)))
    }, 0)
    const invoiceNet = n(invoice.total_amount)
    const invoiceGross = invoiceNet + lineDiscount
    if (!items.length) salesDetails.push({ id: `sale-${invoice.id}`, type: 'sale', date: plDate(invoice.created_at ?? invoice.date), reference: invoice.invoice_number ?? invoice.id, customer: customers.get(sid(invoice.customer_id))?.name ?? 'Walk-in', rep: employees.get(sid(invoice.rep_id))?.name ?? 'Unassigned', grossSales: invoiceGross, discount: lineDiscount, netSales: invoiceNet, cogs: 0, missingCost: true })
    items.forEach((item, index) => {
      const quantity = n(item.quantity)
      const gross = quantity * n(item.price ?? item.selling_price)
      const lineNet = n(item.total ?? gross * (1 - n(item.discount) / 100))
      const share = items.reduce((sum, row) => sum + n(row.total), 0) ? lineNet / items.reduce((sum, row) => sum + n(row.total), 0) : 1 / items.length
      const netSales = invoiceNet ? invoiceNet * share : lineNet
      const discount = lineDiscount * share
      const productId = item.product_id ?? variants.get(sid(item.variant_id))?.product_id
      const product = products.get(sid(productId))
      const cost = costAt(item, invoice.created_at ?? invoice.date)
      salesDetails.push({ id: `sale-${invoice.id}-${item.id ?? index}`, type: 'sale', invoiceId: invoice.id, productId, customerId: invoice.customer_id, repId: invoice.rep_id, date: plDate(invoice.created_at ?? invoice.date), reference: invoice.invoice_number ?? invoice.id, customer: customers.get(sid(invoice.customer_id))?.name ?? 'Walk-in', rep: employees.get(sid(invoice.rep_id))?.name ?? 'Unassigned', product: product?.name ?? item.product_name ?? 'Unknown product', quantity, grossSales: netSales + discount, discount, netSales, cogs: cost.cost == null ? 0 : cost.cost * quantity, unitCost: cost.cost, costSource: cost.source, missingCost: cost.cost == null })
    })
  })

  const returnDetails = []
  const returnedQuantityBySaleLine = new Map()
  let excessReturnQuantity = 0
  allReturns.forEach((ret) => {
    const invoice = invoiceMap.get(sid(ret.invoice_id ?? ret.sale_id))
    const items = returnGroups.get(sid(ret.id)) ?? []
    const subtotal = items.reduce((sum, item) => sum + n(item.total ?? n(item.quantity) * n(item.price)), 0)
    const inPeriod = within(ret.created_at ?? ret.date, from, to)
    if (!items.length && inPeriod) returnDetails.push({ id: `return-${ret.id}`, type: 'return', date: plDate(ret.created_at ?? ret.date), reference: ret.return_number ?? ret.id, invoiceId: invoice?.id, customer: customers.get(sid(ret.customer_id ?? invoice?.customer_id))?.name ?? 'Unknown', rep: employees.get(sid(invoice?.rep_id))?.name ?? 'Unassigned', amount: n(ret.total_amount), cogsReversed: 0, missingCost: true, reason: ret.reason ?? ret.note ?? '-' })
    items.forEach((item, index) => {
      const original = (itemGroups.get(sid(invoice?.id)) ?? []).find((row) => sid(row.id) === sid(item.invoice_item_id) || (sid(row.product_id) === sid(item.product_id) && (!item.variant_id || sid(row.variant_id) === sid(item.variant_id)))) ?? item
      const saleLineKey = `${sid(invoice?.id)}|${sid(original.id) || `${sid(original.product_id)}|${sid(original.variant_id)}`}`
      const requestedQuantity = Math.max(0, n(item.quantity))
      const alreadyReturned = returnedQuantityBySaleLine.get(saleLineKey) ?? 0
      const soldQuantity = Math.max(0, n(original.quantity))
      const quantity = Math.min(requestedQuantity, Math.max(0, soldQuantity - alreadyReturned))
      returnedQuantityBySaleLine.set(saleLineKey, alreadyReturned + quantity)
      excessReturnQuantity += Math.max(0, requestedQuantity - quantity)
      if (!inPeriod || quantity <= 0) return
      const cost = costAt(original, invoice?.created_at ?? invoice?.date)
      const line = n(item.total ?? n(item.quantity) * n(item.price))
      const allocated = subtotal && ret.total_amount != null ? line / subtotal * n(ret.total_amount) : line
      const amount = requestedQuantity ? allocated * quantity / requestedQuantity : 0
      const productId = item.product_id ?? original.product_id ?? variants.get(sid(item.variant_id ?? original.variant_id))?.product_id
      returnDetails.push({ id: `return-${ret.id}-${item.id ?? index}`, type: 'return', returnId: ret.id, invoiceId: invoice?.id, productId, customerId: ret.customer_id ?? invoice?.customer_id, repId: invoice?.rep_id, date: plDate(ret.created_at ?? ret.date), reference: ret.return_number ?? ret.id, customer: customers.get(sid(ret.customer_id ?? invoice?.customer_id))?.name ?? 'Unknown', rep: employees.get(sid(invoice?.rep_id))?.name ?? 'Unassigned', product: products.get(sid(productId))?.name ?? item.product_name ?? 'Unknown product', quantity, amount, cogsReversed: cost.cost == null ? 0 : cost.cost * quantity, unitCost: cost.cost, costSource: cost.source, missingCost: cost.cost == null, reason: ret.reason ?? ret.note ?? '-' })
    })
  })

  const entries = byId(raw.journal_entries)
  const accounts = byId(raw.journals)
  const otherExpenseLineIds = new Set((raw.journal_entry_lines ?? []).filter((line) => {
    const account = accounts.get(sid(line.journal_id)) ?? {}
    return /non.?operating\s*expense|interest\s*expense|loss\s+on/i.test(`${account.account_type ?? ''} ${account.description ?? account.name ?? ''}`)
  }).map((line) => sid(line.id)))
  const expenseDetails = buildExpenseRows(raw).filter((row) => within(row.date, from, to) && !/commission/i.test(`${row.category} ${row.description}`) && !otherExpenseLineIds.has(sid(row.sourceId)))
  const expensesByCategory = new Map()
  expenseDetails.forEach((row) => expensesByCategory.set(row.category, (expensesByCategory.get(row.category) ?? 0) + n(row.amount)))
  const commissionByRep = new Map()
  salesDetails.forEach((row) => { if (row.repId) commissionByRep.set(sid(row.repId), (commissionByRep.get(sid(row.repId)) ?? 0) + n(row.netSales)) })
  returnDetails.forEach((row) => { if (row.repId) commissionByRep.set(sid(row.repId), (commissionByRep.get(sid(row.repId)) ?? 0) - n(row.amount)) })
  const commissionDetails = [...commissionByRep.entries()].map(([repId, netSales]) => { const rep = employees.get(repId) ?? {}; const rate = getCommissionRate(rep.name); return { id: `commission-${repId}`, repId, rep: rep.name ?? 'Unknown rep', period: `${from || 'Beginning'} to ${to || 'Present'}`, netSales, rate, amount: Math.max(0, netSales) * rate } })

  const otherIncomeDetails = (raw.journal_entry_lines ?? []).flatMap((line) => {
    const entry = entries.get(sid(line.entry_id)) ?? {}
    const account = accounts.get(sid(line.journal_id)) ?? {}
    const name = account.description ?? account.name ?? ''
    const isOther = /other\s*income|miscellaneous\s*income|non.?operating\s*income/i.test(`${account.account_type ?? ''} ${name}`)
    const amount = n(line.credit) - n(line.debit)
    return isOther && amount > 0 && active(entry) && within(entry.date ?? entry.created_at ?? line.created_at, from, to) ? [{ id: `income-${line.id}`, date: plDate(entry.date ?? entry.created_at ?? line.created_at), reference: entry.entry_number ?? entry.id, description: line.description ?? entry.description ?? name, amount }] : []
  })
  const otherExpenseDetails = (raw.journal_entry_lines ?? []).flatMap((line) => {
    const entry = entries.get(sid(line.entry_id)) ?? {}
    const account = accounts.get(sid(line.journal_id)) ?? {}
    const name = account.description ?? account.name ?? ''
    const amount = n(line.debit) - n(line.credit)
    return otherExpenseLineIds.has(sid(line.id)) && amount > 0 && active(entry) && within(entry.date ?? entry.created_at ?? line.created_at, from, to) ? [{ id: `other-expense-${line.id}`, date: plDate(entry.date ?? entry.created_at ?? line.created_at), reference: entry.entry_number ?? entry.id, description: line.description ?? entry.description ?? name, amount }] : []
  })

  const sum = (rows, field) => rows.reduce((total, row) => total + n(row[field]), 0)
  const grossSales = money2(sum(salesDetails, 'grossSales'))
  const discounts = money2(sum(salesDetails, 'discount'))
  const salesReturns = money2(sum(returnDetails, 'amount'))
  const netSales = money2(grossSales - discounts - salesReturns)
  const cogsBeforeReturns = money2(sum(salesDetails, 'cogs'))
  const returnedCogs = money2(sum(returnDetails, 'cogsReversed'))
  const cogs = money2(cogsBeforeReturns - returnedCogs)
  const grossProfit = money2(netSales - cogs)
  const operatingExpenses = money2(sum(expenseDetails, 'amount'))
  const commissions = money2(sum(commissionDetails, 'amount'))
  const otherIncome = money2(sum(otherIncomeDetails, 'amount'))
  const otherExpenses = money2(sum(otherExpenseDetails, 'amount'))
  const totalExpenses = money2(operatingExpenses + commissions + otherExpenses)
  const netProfit = money2(grossProfit + otherIncome - totalExpenses)
  const diagnostics = {
    invoiceCount: invoices.length, invoiceTotal: money2(sum(invoices, 'total_amount')), soldUnits: sum(salesDetails, 'quantity'), historicalCostTotal: cogsBeforeReturns,
    returnCount: returns.length, returnTotal: salesReturns, returnedUnits: sum(returnDetails, 'quantity'), returnedCostTotal: returnedCogs,
    expenseCount: expenseDetails.length, expenseTotal: operatingExpenses, commissionCount: commissionDetails.length, commissionTotal: commissions,
    otherIncomeTotal: otherIncome, otherExpenseTotal: otherExpenses, excessReturnQuantity,
  }
  const duplicateCounts = { invoices: (raw.invoices ?? []).length - unique(raw.invoices ?? []).length, invoiceItems: (raw.invoice_items ?? []).length - unique(raw.invoice_items ?? []).length, returns: (raw.returns ?? []).length - unique(raw.returns ?? []).length, returnItems: (raw.return_items ?? []).length - unique(raw.return_items ?? []).length }
  const reconciliationWarnings = [
    Object.values(duplicateCounts).some((value) => value > 0) && 'Duplicate financial source IDs were detected and counted once.',
    excessReturnQuantity > 0 && `${excessReturnQuantity} returned units exceed the original sold quantity and were excluded.`,
    salesDetails.some((row) => row.missingCost) && 'Some sold lines have no historical cost snapshot.',
    returnDetails.some((row) => row.missingCost) && 'Some returned lines could not be matched to historical cost.',
    Math.abs(money2(grossSales - discounts) - diagnostics.invoiceTotal) > 0.01 && 'Invoice revenue does not reconcile to gross sales less discounts.',
  ].filter(Boolean)
  const totals = { grossSales, discounts, salesReturns, netSales, cogsBeforeReturns, returnedCogs, cogs, grossProfit, grossMargin: netSales ? grossProfit / netSales * 100 : 0, operatingExpenses, commissions, otherIncome, otherExpenses, totalExpenses, netProfit, netMargin: netSales ? netProfit / netSales * 100 : 0, missingCostLines: salesDetails.filter((row) => row.missingCost).length + returnDetails.filter((row) => row.missingCost).length }

  const periods = new Map()
  const periodKey = (date) => grouping === 'year' ? date.slice(0, 4) : date.slice(0, 7)
  const ensure = (date) => { const key = periodKey(date); if (!periods.has(key)) periods.set(key, { id: key, period: periodLabel(key, grouping), grossSales: 0, discounts: 0, returns: 0, netSales: 0, cogs: 0, grossProfit: 0, expenses: 0, commissions: 0, otherIncome: 0, otherExpenses: 0, netProfit: 0 }); return periods.get(key) }
  salesDetails.forEach((row) => { const p = ensure(row.date); p.grossSales += row.grossSales; p.discounts += row.discount; p.netSales += row.netSales; p.cogs += row.cogs })
  returnDetails.forEach((row) => { const p = ensure(row.date); p.returns += row.amount; p.netSales -= row.amount; p.cogs -= row.cogsReversed })
  expenseDetails.forEach((row) => ensure(row.date).expenses += row.amount)
  otherIncomeDetails.forEach((row) => ensure(row.date).otherIncome += row.amount)
  otherExpenseDetails.forEach((row) => ensure(row.date).otherExpenses += row.amount)
  commissionDetails.forEach((row) => { const amount = row.amount; const repSales = salesDetails.filter((x) => sid(x.repId) === row.repId); const repReturns = returnDetails.filter((x) => sid(x.repId) === row.repId); const denom = sum(repSales, 'netSales') - sum(repReturns, 'amount'); [...repSales, ...repReturns].forEach((x) => { const signed = x.type === 'return' ? -x.amount : x.netSales; ensure(x.date).commissions += denom ? amount * signed / denom : 0 }) })
  const comparison = [...periods.values()].map((row) => ({ ...row, grossProfit: row.netSales - row.cogs, netProfit: row.netSales - row.cogs + row.otherIncome - row.expenses - row.commissions - row.otherExpenses })).sort((a, b) => a.id.localeCompare(b.id))
  const breakdown = (field, labelField) => { const map = new Map(); salesDetails.forEach((row) => { const key = sid(row[field] ?? 'unassigned'); const current = map.get(key) ?? { id: key, name: row[labelField] ?? 'Unassigned', sales: 0, returns: 0, cogs: 0 }; current.sales += row.netSales; current.cogs += row.cogs; map.set(key, current) }); returnDetails.forEach((row) => { const key = sid(row[field] ?? 'unassigned'); const current = map.get(key) ?? { id: key, name: row[labelField] ?? 'Unassigned', sales: 0, returns: 0, cogs: 0 }; current.returns += row.amount; current.cogs -= row.cogsReversed; map.set(key, current) }); return [...map.values()].map((row) => ({ ...row, netSales: row.sales - row.returns, profit: row.sales - row.returns - row.cogs })).sort((a, b) => b.profit - a.profit) }
  return { totals, diagnostics, duplicateCounts, reconciliationWarnings, salesDetails, returnDetails, expenseDetails, expensesByCategory: [...expensesByCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount), commissionDetails, otherIncomeDetails, otherExpenseDetails, comparison, byProduct: breakdown('productId', 'product'), byCustomer: breakdown('customerId', 'customer'), byRep: breakdown('repId', 'rep') }
}

export function profitLossStatement(model) {
  const t = model.totals
  return [
    ['Revenue', 'Gross Sales', t.grossSales], ['Revenue', 'Sales Returns', -t.salesReturns], ['Revenue', 'Sales Discounts', -t.discounts], ['Revenue', 'Net Sales', t.netSales],
    ['Cost', 'Cost of Goods Sold (historical, net of returns)', -t.cogs], ['Gross Profit', 'Gross Profit', t.grossProfit], ['Other Income', 'Other Income', t.otherIncome],
    ['Other Expenses', 'Operating Expenses', -t.operatingExpenses], ['Other Expenses', 'Rep Commissions Earned', -t.commissions], ['Other Expenses', 'Other Expenses', -t.otherExpenses], ['Net Profit', t.netProfit < 0 ? 'Net Loss' : 'Net Profit', t.netProfit],
  ].filter((row) => (row[1] !== 'Other Income' || t.otherIncome) && (row[1] !== 'Other Expenses' || t.otherExpenses)).map(([section, description, amount], id) => ({ id, section, description, amount, date: '' }))
}

export function profitLossPdfData(model) {
  if (!model?.totals) return null
  const t = model.totals
  return {
    grossSales: t.grossSales,
    salesReturns: t.salesReturns,
    salesDiscounts: t.discounts,
    netSales: t.netSales,
    grossCOGS: t.cogsBeforeReturns,
    returnCOGS: t.returnedCogs,
    netCOGS: t.cogs,
    grossProfit: t.grossProfit,
    operatingExpenses: t.operatingExpenses,
    commissionExpense: t.commissions,
    otherIncome: t.otherIncome,
    otherExpenses: t.otherExpenses,
    netProfit: t.netProfit,
    grossMargin: t.grossMargin,
    netMargin: t.netMargin,
    expenseCategories: model.expensesByCategory ?? [],
  }
}

export function formatProfitLossCurrency(value) {
  const amount = Number(value ?? 0)
  const safe = Number.isFinite(amount) ? amount : 0
  return `Rs. ${safe.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

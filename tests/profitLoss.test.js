import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfitLoss, formatProfitLossCurrency, profitLossPdfData, profitLossStatement } from '../src/lib/profitLoss.js'
import { buildFinanceReports } from '../src/lib/financeReports.js'

const raw = {
  invoices: [{ id: 'i1', invoice_number: '1001', customer_id: 'c1', rep_id: 'r1', total_amount: 180, created_at: '2026-08-01T10:00:00', status: 'completed' }],
  invoice_items: [{ id: 'ii1', invoice_id: 'i1', product_id: 'p1', quantity: 2, price: 100, discount: 10, total: 180, cost_price: 60 }],
  returns: [{ id: 'ret1', return_number: 'R-1', invoice_id: 'i1', customer_id: 'c1', total_amount: 90, created_at: '2026-08-10T10:00:00', status: 'completed' }],
  return_items: [{ id: 'ri1', return_id: 'ret1', invoice_item_id: 'ii1', product_id: 'p1', quantity: 1, price: 90, total: 90 }],
  customers: [{ id: 'c1', name: 'Main Customer' }],
  employees: [{ id: 'r1', name: 'Other Rep', commission_rate: 2.5 }],
  products: [{ id: 'p1', name: 'Toy Car' }],
  expenses: [
    { id: 'e1', expense_date: '2026-08-05', category: 'Rent', description: 'Store rent', amount: 20, status: 'active' },
    { id: 'e2', expense_date: '2026-08-05', category: 'Rep Commission', description: 'Commission payment', amount: 5, status: 'active' },
  ],
  journals: [{ id: 'j1', account_type: 'OTHER INCOME', description: 'Other Income' }],
  journal_entries: [{ id: 'je1', date: '2026-08-06', status: 'active' }],
  journal_entry_lines: [{ id: 'jl1', entry_id: 'je1', journal_id: 'j1', debit: 0, credit: 10 }],
}

test('profit and loss reconciles discounts, return revenue, historical return cost, expenses and earned commission', () => {
  const model = buildProfitLoss(raw, { from: '2026-08-01', to: '2026-08-31' })
  assert.deepEqual({ ...model.totals, grossMargin: Number(model.totals.grossMargin.toFixed(6)), netMargin: Number(model.totals.netMargin.toFixed(6)) }, {
    grossSales: 200, discounts: 20, salesReturns: 90, netSales: 90,
    cogsBeforeReturns: 120, returnedCogs: 60, cogs: 60, grossProfit: 30,
    grossMargin: 33.333333, operatingExpenses: 20, commissions: 0.9,
    otherIncome: 10, otherExpenses: 0, totalExpenses: 20.9, netProfit: 19.1, netMargin: 21.222222,
    missingCostLines: 0,
  })
  assert.equal(model.expenseDetails.length, 1)
  assert.equal(model.commissionDetails[0].amount, 0.9)
  assert.equal(model.commissionDetails[0].rate, 0.01)
  assert.equal(model.byProduct[0].profit, 30)
})

test('historical cost never falls forward to a purchase made after the sale', () => {
  const model = buildProfitLoss({
    invoices: [{ id: 'i1', total_amount: 100, created_at: '2026-08-01' }],
    invoice_items: [{ id: 'ii1', invoice_id: 'i1', product_id: 'p1', quantity: 1, price: 100, total: 100 }],
    purchases: [{ id: 'pu1', date: '2026-08-02', status: 'completed' }],
    purchase_items: [{ id: 'pi1', purchase_id: 'pu1', product_id: 'p1', cost_price: 70 }],
  }, { from: '2026-08-01', to: '2026-08-01' })
  assert.equal(model.totals.cogs, 0)
  assert.equal(model.totals.missingCostLines, 1)
  assert.match(model.reconciliationWarnings.join(' '), /historical cost/i)
})

test('return quantities are capped at the original quantity sold', () => {
  const overReturn = {
    ...raw,
    returns: [{ ...raw.returns[0], total_amount: 270 }],
    return_items: [{ ...raw.return_items[0], quantity: 3, total: 270 }],
    expenses: [], journal_entries: [], journal_entry_lines: [], journals: [],
  }
  const model = buildProfitLoss(overReturn, { from: '2026-08-01', to: '2026-08-31' })
  assert.equal(model.totals.salesReturns, 180)
  assert.equal(model.totals.returnedCogs, 120)
  assert.equal(model.diagnostics.excessReturnQuantity, 1)
  assert.match(model.reconciliationWarnings.join(' '), /exceed/i)
})

test('a return in a later period reverses the original invoice historical cost', () => {
  const model = buildProfitLoss(raw, { from: '2026-08-10', to: '2026-08-10' })
  assert.equal(model.totals.netSales, -90)
  assert.equal(model.totals.returnedCogs, 60)
  assert.equal(model.totals.cogs, -60)
  assert.equal(model.totals.grossProfit, -30)
})

test('Finance Profit and Loss uses the same shared statement figures', () => {
  const model = buildProfitLoss(raw, { from: '2026-08-01', to: '2026-08-31' })
  const expected = profitLossStatement(model)
  const actual = buildFinanceReports({ ...raw, profitLossRange: { from: '2026-08-01', to: '2026-08-31' } })['profit-loss']
  assert.deepEqual(actual, expected)
})

test('PDF export is a direct projection and never renders blank currency values', () => {
  const model = buildProfitLoss(raw, { from: '2026-08-01', to: '2026-08-31' })
  const pdf = profitLossPdfData(model)
  assert.equal(pdf.grossSales, model.totals.grossSales)
  assert.equal(pdf.netSales, model.totals.netSales)
  assert.equal(pdf.netCOGS, model.totals.cogs)
  assert.equal(pdf.grossProfit, model.totals.grossProfit)
  assert.equal(pdf.operatingExpenses, model.totals.operatingExpenses)
  assert.equal(pdf.commissionExpense, model.totals.commissions)
  assert.equal(pdf.netProfit, model.totals.netProfit)
  assert.equal(formatProfitLossCurrency(0), 'Rs. 0.00')
  assert.equal(formatProfitLossCurrency(undefined), 'Rs. 0.00')
  assert.notEqual(formatProfitLossCurrency(pdf.grossSales), '')
})

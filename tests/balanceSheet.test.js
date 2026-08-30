import test from 'node:test'
import assert from 'node:assert/strict'
import { balanceSheetRows, buildBalanceSheet } from '../src/lib/balanceSheet.js'

const raw = {
  customers: [{ id: 'c1', name: 'Customer One' }],
  vendors: [{ id: 'v1', name: 'Vendor One' }],
  employees: [],
  products: [{ id: 'p1', code: 'P1', name: 'Toy', cost: 5 }, { id: 'p2', code: 'P2', name: 'Backorder', cost: 10 }],
  beginning_stock: [{ id: 'b1', date: '2026-01-01', beginning_stock_items: [{ product_id: 'p1', quantity: 10, cost: 5 }] }],
  purchases: [
    { id: 'pu1', vendor_id: 'v1', date: '2026-07-01', total_amount: 80, payment_type: 'credit', status: 'completed' },
    { id: 'pu2', vendor_id: 'v1', date: '2026-07-01', total_amount: 30, payment_type: 'cash', status: 'completed' },
  ],
  purchase_items: [{ id: 'pi1', purchase_id: 'pu1', product_id: 'p1', quantity: 2, cost: 6 }],
  purchase_payments: [{ id: 'pp1', purchase_id: 'pu1', amount: 30, paid_at: '2026-07-20', method: 'bank', bank_id: 'bk1' }],
  invoices: [
    { id: 'i1', customer_id: 'c1', invoice_number: '1', total_amount: 100, payment_type: 'credit', created_at: '2026-07-10', status: 'completed' },
    { id: 'i2', customer_id: 'c1', invoice_number: '2', total_amount: 20, payment_type: 'cash', created_at: '2026-07-12', status: 'completed' },
  ],
  invoice_items: [
    { id: 'ii1', invoice_id: 'i1', product_id: 'p1', quantity: 3, price: 100 / 3, total: 100, cost_price: 5 },
    { id: 'ii2', invoice_id: 'i2', product_id: 'p2', quantity: 5, price: 4, total: 20, cost_price: 10 },
  ],
  invoice_payments: [{ id: 'ip1', invoice_id: 'i1', amount: 40, paid_at: '2026-08-10', method: 'cheque' }],
  returns: [],
  return_items: [],
  banks: [{ id: 'bk1', code: '001', name: 'Main Bank', opening_balance: 200 }],
  customer_cheques: [{ id: 'ch1', customer_id: 'c1', cheque_number: '123', bank_name: 'Other Bank', cheque_date: '2026-08-10', amount: 40, status: 'in_hand' }],
  rep_commission_payments: [],
  journals: [{ id: 'j1', code: '100', account_type: 'ASSET', description: 'Cash in Hand', s_balance: 25 }],
  journal_entries: [],
  journal_entry_lines: [],
  stock_adjustments: [],
  purchase_returns: [],
  purchase_return_items: [],
  expenses: [],
}

test('historical Balance Sheet excludes later receipts and cash purchases from payable', () => {
  const july = buildBalanceSheet(raw, { asAt: '2026-07-31' })
  assert.equal(july.totals.receivables, 100)
  assert.equal(july.totals.payables, 50)
  assert.equal(july.totals.cheques, 0)
  assert.equal(july.totals.banks, 170)
  assert.equal(july.totals.cash, 25)
})

test('cheque receipt moves value from receivable to cheques in hand without duplication', () => {
  const august = buildBalanceSheet(raw, { asAt: '2026-08-31' })
  assert.equal(august.totals.receivables, 60)
  assert.equal(august.totals.cheques, 40)
  assert.equal(august.totals.receivables + august.totals.cheques, 100)
})

test('historical inventory uses movements, cost, and never creates a negative asset', () => {
  const model = buildBalanceSheet(raw, { asAt: '2026-07-31' })
  const toy = model.details.inventory.find((row) => row.id === 'p1')
  const backorder = model.details.inventory.find((row) => row.id === 'p2')
  assert.equal(toy.quantity, 9)
  assert.equal(toy.unitCost, 5.17)
  assert.equal(backorder.quantity, 0)
  assert.equal(backorder.backorder, 5)
  assert.ok(model.totals.inventory > 0)
  assert.match(model.diagnostics.join(' '), /backordered units/)
})

test('Balance Sheet exposes the real difference instead of forcing equity', () => {
  const model = buildBalanceSheet(raw, { asAt: '2026-07-31' })
  assert.equal(model.totals.difference, model.totals.totalAssets - model.totals.liabilitiesAndEquity)
  assert.equal(model.totals.balanced, Math.abs(model.totals.difference) < 0.01)
  assert.equal(balanceSheetRows(model).find((row) => row.account === 'Accounts Receivable').amount, 100)
})

test('Cash in Hand falls back to actual system cash-book movements when no ledger exists', () => {
  const model = buildBalanceSheet({ ...raw, journals: [] }, { asAt: '2026-07-31' })
  assert.equal(model.totals.cash, -10)
  assert.match(model.diagnostics.join(' '), /derived from the system cash book/i)
  assert.match(model.diagnostics.join(' '), /negative cash balance/i)
})

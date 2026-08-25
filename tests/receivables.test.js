import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInvoiceBalanceRows, customerOutstanding, groupInvoiceBalancesByCustomer, invoiceBalance } from '../src/lib/receivables.js'
import { calculateAgingSummary } from '../src/lib/agingCalculations.js'

const invoices = [
  { id: 'i1', customer_id: 'c1', payment_type: 'credit', total_amount: 30000, created_at: new Date().toISOString() },
  { id: 'i2', customer_id: 'c1', payment_type: 'credit', total_amount: 2850, created_at: new Date().toISOString() },
]

test('payments and return credits reduce only their original invoice', () => {
  const rows = buildInvoiceBalanceRows(invoices, [{ invoice_id: 'i1', amount: 10000 }], [
    { invoice_id: 'i1', total_amount: 5000 },
    { invoice_id: 'i2', total_amount: 2850 },
  ])
  assert.deepEqual(rows.map(({ balance }) => balance), [15000, 0])
  assert.equal(customerOutstanding(invoices, [{ invoice_id: 'i1', amount: 10000 }], [
    { invoice_id: 'i1', total_amount: 5000 },
    { invoice_id: 'i2', total_amount: 2850 },
  ]), 15000)
})

test('return excess never creates negative receivables or reduces another invoice', () => {
  assert.equal(invoiceBalance(10000, 8000, 5000), 0)
  const grouped = groupInvoiceBalancesByCustomer(invoices, [], [{ invoice_id: 'i2', total_amount: 5000 }])
  assert.equal(grouped.get('c1').balance, 30000)
})

test('aging uses the remaining balance after payments and returns', () => {
  const payments = new Map([['i1', 10000]])
  const returns = new Map([['i1', 5000]])
  const aging = calculateAgingSummary([invoices[0]], payments, returns)
  assert.equal(aging.total, 15000)
  assert.equal(aging.current, 15000)
})

test('legacy unlinked return clears prior outstanding without reducing a later invoice', () => {
  const datedInvoices = [
    { id: 'old', customer_id: 'c1', payment_type: 'credit', total_amount: 2850, created_at: '2026-07-01T00:00:00Z' },
    { id: 'new', customer_id: 'c1', payment_type: 'credit', total_amount: 91800, created_at: '2026-08-24T00:00:00Z' },
  ]
  const legacyReturn = [{ id: 'r7', invoice_id: null, customer_id: 'c1', total_amount: 2850, created_at: '2026-07-28T00:00:00Z' }]
  const rows = buildInvoiceBalanceRows(datedInvoices, [], legacyReturn)
  assert.equal(rows.find((row) => row.id === 'old').balance, 0)
  assert.equal(rows.find((row) => row.id === 'new').balance, 91800)
  assert.equal(rows.filter((row) => row.id !== 'new').reduce((sum, row) => sum + row.balance, 0), 0)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayBook, dayBookTotals, filterDayBook } from '../src/lib/dayBook.js'

const raw = {
  customers: [{ id: 'c1', name: 'Kids Corner' }],
  vendors: [{ id: 'v1', name: 'ABC Supplier' }],
  employees: [{ id: 'e1', name: 'Sales Rep', is_rep: true }],
  banks: [{ id: 'b1', name: 'Business Bank' }],
  products: [{ id: 'pr1', name: 'Toy Car' }],
  invoices: [
    { id: 'i1', invoice_number: 'INV-1', customer_id: 'c1', rep_id: 'e1', payment_type: 'credit', total_amount: 1000, created_at: '2026-08-24T09:15:00' },
    { id: 'i2', invoice_number: 'INV-2', customer_id: 'c1', payment_type: 'cash', total_amount: 500, created_at: '2026-08-24T10:00:00' },
  ],
  invoice_items: [{ id: 'ii1', invoice_id: 'i1', product_id: 'pr1', quantity: 2, price: 500, total: 1000 }],
  purchases: [
    { id: 'p1', ref_no: 'PUR-1', vendor_id: 'v1', payment_type: 'credit', total_amount: 700, date: '2026-08-24', created_at: '2026-08-24T11:00:00' },
    { id: 'p2', ref_no: 'PUR-2', vendor_id: 'v1', payment_type: 'cash', total_amount: 200, date: '2026-08-24', created_at: '2026-08-24T12:00:00' },
  ],
  purchase_items: [], orders: [], order_items: [], returns: [], return_items: [],
  invoice_payments: [{ id: 'ip1', invoice_id: 'i1', method: 'cheque', amount: 400, reference: '111111-2222-333', paid_at: '2026-08-24', created_at: '2026-08-24T13:00:00' }],
  purchase_payments: [],
  customer_cheques: [{ id: 'ch1', customer_id: 'c1', cheque_number: '111111-2222-333', cheque_date: '2026-08-26', bank_name: 'Origin Bank', amount: 400, status: 'deposited', created_at: '2026-08-24T13:00:00' }],
  bank_reconciliation_items: [{ id: 'br1', bank_id: 'b1', ref_no: 'RCV-CHQ-ch1', trx_date: '2026-08-26', amount: 400, reconciled: false, created_at: '2026-08-26T09:00:00' }],
  rep_payments: [], rep_commission_payments: [], journal_entries: [], journal_entry_lines: [],
  beginning_stock: [], beginning_stock_items: [], stock_adjustments: [], audit_logs: [],
}

test('credit documents carry value without creating cash movement', () => {
  const rows = buildDayBook(raw)
  const creditSale = rows.find((item) => item.reference === 'INV-1')
  const cashSale = rows.find((item) => item.reference === 'INV-2')
  const creditPurchase = rows.find((item) => item.reference === 'PUR-1')
  const cashPurchase = rows.find((item) => item.reference === 'PUR-2')
  assert.equal(creditSale.amount, 1000)
  assert.equal(creditSale.moneyIn, 0)
  assert.equal(cashSale.moneyIn, 500)
  assert.equal(creditPurchase.moneyOut, 0)
  assert.equal(cashPurchase.moneyOut, 200)
})

test('a cheque receipt is not duplicated and only its deposit moves money in', () => {
  const rows = buildDayBook(raw)
  assert.equal(rows.filter((item) => item.transactionType === 'Customer Cheque').length, 1)
  assert.equal(rows.find((item) => item.transactionType === 'Customer Cheque').moneyIn, 0)
  assert.equal(rows.find((item) => item.transactionType === 'Cheque Deposit').moneyIn, 400)
})

test('daily totals keep business values separate from cash movement', () => {
  const totals = dayBookTotals(buildDayBook(raw))
  assert.equal(totals.sales, 1500)
  assert.equal(totals.purchases, 900)
  assert.equal(totals.moneyReceived, 900)
  assert.equal(totals.moneyPaid, 200)
  assert.equal(totals.netCashMovement, 700)
})

test('date and transaction filters select the requested activity', () => {
  const rows = filterDayBook(buildDayBook(raw), { from: '2026-08-26', to: '2026-08-26', transactionType: 'Cheque Deposit' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].reference, 'RCV-CHQ-ch1')
})

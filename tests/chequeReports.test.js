import test from 'node:test'
import assert from 'node:assert/strict'
import { bankWiseRows, buildChequeRegister, calendarDays, dueSection, rowsForReport } from '../src/lib/chequeReports.js'

const raw = {
  customers: [{ id: 'c1', name: 'Ayesha Stores' }],
  vendors: [{ id: 'v1', name: 'Toy Supplier' }],
  invoices: [{ id: 'i1', customer_id: 'c1', invoice_number: 'INV-1', total_amount: 1000 }],
  purchases: [{ id: 'p1', vendor_id: 'v1', ref_no: 'PUR-1' }],
  invoice_payments: [{ id: 'ip1', invoice_id: 'i1', method: 'cheque', reference: '111111-2222-333', paid_at: '2026-08-20', amount: 400 }],
  purchase_payments: [{ id: 'pp1', purchase_id: 'p1', method: 'cheque', reference: '999999-8888-777', paid_at: '2026-08-21', amount: 250, bank_name: 'Vendor Bank' }],
  customer_cheques: [{ id: 'ch1', customer_id: 'c1', cheque_number: '111111-2222-333', cheque_date: '2026-08-27', amount: 400, bank_name: 'Origin Bank', status: 'deposited', deposited_at: '2026-08-25' }],
  banks: [{ id: 'b1', name: 'Business Bank' }],
  bank_reconciliation_items: [{ id: 'r1', bank_id: 'b1', ref_no: 'RCV-CHQ-ch1', cheque_number: '111111-2222-333', trx_date: '2026-08-25', amount: 400, reconciled: true }],
  returns: [],
}

test('calendar due buckets use dates dynamically', () => {
  const today = new Date('2026-08-27T12:00:00')
  assert.equal(calendarDays('2026-08-27', today), 0)
  assert.equal(calendarDays('2026-08-28', today), 1)
  assert.equal(dueSection(-1), 'Overdue')
  assert.equal(dueSection(7), 'Due Within 7 Days')
  assert.equal(dueSection(30), 'Due Within 30 Days')
})

test('customer deposits use the matching reconciliation bank and flag', () => {
  const rows = buildChequeRegister(raw, new Date('2026-08-27T12:00:00'))
  const customer = rows.find((row) => row.type === 'Customer')
  assert.equal(customer.documentNumber, 'INV-1')
  assert.equal(customer.depositBank, 'Business Bank')
  assert.equal(customer.reconciledLabel, 'Yes')
  assert.equal(rowsForReport(rows, 'deposited').length, 1)
})

test('returned cheques are excluded from successful payments in outstanding exposure', () => {
  const returnedRaw = { ...raw, customer_cheques: [{ ...raw.customer_cheques[0], status: 'returned', returned_at: '2026-08-26' }] }
  const row = buildChequeRegister(returnedRaw, new Date('2026-08-27T12:00:00')).find((item) => item.type === 'Customer')
  assert.equal(row.outstandingAfterReturn, 1000)
  assert.equal(rowsForReport([row], 'returned').length, 1)
})

test('bank-wise report groups live statuses and amounts', () => {
  const rows = buildChequeRegister(raw, new Date('2026-08-27T12:00:00'))
  const grouped = bankWiseRows(rows)
  assert.equal(grouped.find((row) => row.bankName === 'Origin Bank').deposited, 1)
  assert.equal(grouped.reduce((sum, row) => sum + row.totalAmount, 0), 650)
})

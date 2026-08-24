import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReturnsDeliveryReports } from '../src/lib/returnsDeliveryReports.js'

const raw = {
  customers: [{ id: 'c1', name: 'Alice', phone: '077', address: 'Colombo' }],
  employees: [{ id: 'e1', name: 'Rep One' }],
  products: [{ id: 'p1', code: 'P-1', name: 'Dress' }],
  invoices: [{ id: 'i1', invoice_number: 7, customer_id: 'c1', rep_id: 'e1', total_amount: 500, created_at: '2026-08-02T10:00:00Z' }],
  invoiceItems: [{ id: 'ii1', invoice_id: 'i1', product_id: 'p1', quantity: 5, price: 100, total: 500 }],
  invoicePayments: [{ id: 'pay1', invoice_id: 'i1', amount: 100 }],
  returns: [{ id: 'r1', return_number: 3, invoice_id: 'i1', customer_id: 'c1', total_amount: 110, vat_amount: 10, reason: 'Damaged', created_at: '2026-08-05T10:00:00Z' }],
  returnItems: [{ id: 'ri1', return_id: 'r1', product_id: 'p1', quantity: 1, price: 100, total: 100 }],
  orders: [
    { id: 'o1', order_number: 9, invoice_id: 'i1', customer_id: 'c1', rep_id: 'e1', total: 500, status: 'delivered', created_at: '2026-08-01T10:00:00Z', delivered_at: '2026-08-04T10:00:00Z' },
    { id: 'o2', order_number: 10, customer_id: 'c1', rep_id: 'e1', total: 250, status: 'pending', created_at: '2026-08-06T10:00:00Z' },
  ],
  auditLogs: [],
}

const model = buildReturnsDeliveryReports(raw, { from: '2026-08-01', to: '2026-08-31' }, {})

test('uses stored historical return totals, including header VAT', () => {
  assert.equal(model.detailedReturns[0].unitPrice, 100)
  assert.equal(model.detailedReturns[0].returnAmount, 110)
  assert.equal(model.returnsByProduct[0].returnValue, 110)
  assert.equal(model.returnValue[0].netSaleAfterReturn, 390)
})

test('reconciles customer outstanding to invoice payments and return credits', () => {
  assert.equal(model.returnsByCustomer[0].totalSales, 500)
  assert.equal(model.returnsByCustomer[0].outstandingBalance, 290)
  assert.equal(model.returnsByCustomer[0].returnPercentage, 22)
})

test('derives delivery status and elapsed days from live order fields', () => {
  assert.equal(model.deliveredOrders.length, 1)
  assert.equal(model.deliveredOrders[0].daysToDeliver, 3)
  assert.equal(model.pendingDelivery.length, 1)
  const performance = model.deliveryPerformance('month')[0]
  assert.deepEqual({ created: performance.ordersCreated, delivered: performance.delivered, pending: performance.pending }, { created: 2, delivered: 1, pending: 1 })
})

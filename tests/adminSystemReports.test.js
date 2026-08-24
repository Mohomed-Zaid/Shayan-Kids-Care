import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAdminSystemReports, normalizeAuditLogs } from '../src/lib/adminSystemReports.js'

test('normalizes legacy and structured audit details without inventing values', () => {
  const rows = normalizeAuditLogs([
    { id: 'a1', action: 'edit_product', target_type: 'product', target_label: 'P-1', user_email: 'admin@test.com', user_name: 'Admin', created_at: '2026-08-01T10:00:00Z', details: { before: { stock: 80 }, after: { stock: -20 }, reason: 'Purchase reversed' } },
    { id: 'a2', action: 'delete_payment', target_type: 'payment', user_name: 'Admin', created_at: '2026-08-02T10:00:00Z', details: 'Legacy description' },
  ], [{ email: 'admin@test.com', user_type: 'admin' }])
  assert.deepEqual(rows[0].oldValue, { stock: 80 })
  assert.deepEqual(rows[0].newValue, { stock: -20 })
  assert.equal(rows[0].reason, 'Purchase reversed')
  assert.equal(rows[0].userRole, 'Admin')
  assert.equal(rows[1].description, 'Legacy description')
  assert.equal(rows[1].oldValue, null)
})

test('reconstructs stock before and after from current stock and stored movements', () => {
  const raw = {
    auditLogs: [], userPrivileges: [], customers: [], vendors: [], employees: [],
    products: [{ id: 'p1', code: 'P-1', name: 'Blanket', stock: -20 }],
    purchases: [{ id: 'pu1', ref_no: 'PUR-0054', status: 'reversed', created_at: '2026-08-01', reversed_at: '2026-08-03', reversal_reason: 'Supplier issue' }],
    purchaseItems: [{ id: 'pi1', purchase_id: 'pu1', product_id: 'p1', quantity: 100 }],
    invoices: [{ id: 'i1', invoice_number: 94, created_at: '2026-08-02' }],
    invoiceItems: [{ id: 'ii1', invoice_id: 'i1', product_id: 'p1', quantity: 20 }],
    returns: [], returnItems: [], beginningStock: [], beginningItems: [], stockAdjustments: [], bulkSms: [], repSms: [], orders: [], invoicePayments: [], purchasePayments: [],
  }
  const model = buildAdminSystemReports(raw)
  const reversal = model.inventory.find(row => row.transactionType === 'Purchase Reversal')
  assert.equal(reversal.stockAfter, -20)
  assert.equal(reversal.stockBefore, 80)
  const invoice = model.inventory.find(row => row.transactionType === 'Invoice / Sale')
  assert.equal(invoice.stockAfter, 80)
  assert.equal(invoice.stockBefore, 100)
})

test('privilege rows expose only actions supported by each permission module', () => {
  const raw = { auditLogs: [], userPrivileges: [{ id: 'u1', email: 'user@test.com', permissions: {}, is_active: true }], customers: [], vendors: [], employees: [], products: [], purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], returns: [], returnItems: [], beginningStock: [], beginningItems: [], stockAdjustments: [], bulkSms: [], repSms: [], orders: [], invoicePayments: [], purchasePayments: [] }
  const model = buildAdminSystemReports(raw)
  const dashboard = model.privileges.find(row => row.module === 'Dashboard')
  assert.equal(dashboard.supported.has('view'), true)
  assert.equal(dashboard.supported.has('delete'), false)
})

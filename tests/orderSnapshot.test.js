import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildOrderSnapshot, createOrderSnapshot } from '../src/lib/orderSnapshot.js'
import { buildConsistencyRows } from '../src/lib/orderConsistency.js'

test('order snapshot preserves the final cart quantity and selling price', () => {
  const snapshot = buildOrderSnapshot([
    { product_id: '2055', quantity: '8', price: '680', discount: '0' },
    { product_id: '2044', quantity: '6', price: '1690', discount: '0' },
    { product_id: '2057', quantity: '10', price: '1290', discount: '0' },
  ], false)

  assert.deepEqual(snapshot.items, [
    { product_id: '2055', quantity: 8, price: 680, discount: 0, discount_amount: 0, total: 5440 },
    { product_id: '2044', quantity: 6, price: 1690, discount: 0, discount_amount: 0, total: 10140 },
    { product_id: '2057', quantity: 10, price: 1290, discount: 0, discount_amount: 0, total: 12900 },
  ])
  assert.equal(snapshot.total, 28480)
})

test('create sends one immutable snapshot RPC without product lookups', async () => {
  const calls = []
  const supabase = {
    rpc: async (...args) => {
      calls.push(args)
      return { data: [{ created_order_id: 'order-1', created_order_number: 27 }], error: null }
    },
  }
  const snapshot = buildOrderSnapshot([
    { product_id: 'product-1', quantity: 8, price: 680, discount: 5 },
  ], false)

  await createOrderSnapshot(supabase, {
    customerId: 'customer-1',
    repId: 'rep-1',
    paymentType: 'credit',
  }, snapshot)

  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'create_order_from_snapshot')
  assert.deepEqual(calls[0][1].p_items, snapshot.items)
})

test('order relation errors explain the required database repair migration', async () => {
  const client = { rpc: async () => ({ data: null, error: { message: 'relation "orders" does not exist' } }) }
  await assert.rejects(
    () => createOrderSnapshot(client, { customerId: 'customer-1' }, { items: [{ product_id: 'p1', quantity: 1, price: 10, discount: 0, discount_amount: 0, total: 10 }], vat_rate: 0, vat_amount: 0, total: 10 }),
    /20260824010000_order_rpc_search_path_fix\.sql/,
  )
})

test('order RPC migrations preserve a trigger-compatible public search path', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260824010000_order_rpc_search_path_fix.sql', import.meta.url), 'utf8')
  assert.match(sql, /create_order_from_snapshot[\s\S]*set search_path = public, pg_temp/i)
  assert.match(sql, /convert_order_to_invoice[\s\S]*set search_path = public, pg_temp/i)
})

test('consistency check reports missing products, quantity changes, and price changes', () => {
  const result = buildConsistencyRows({
    orders: [{ id: 'order-26', order_number: 26, invoice_id: 'invoice-92', total: 40900 }],
    invoices: [{ id: 'invoice-92', invoice_number: 92, total_amount: 56360 }],
    products: [
      { id: '2055', code: '2055', name: 'BABY LUNCH BOX' },
      { id: '2044', code: '2044', name: 'BABY CLOTH 11 IN 1 SET' },
      { id: '2057', code: '2057', name: 'BABY CLOTH 5 IN 1 SET' },
    ],
    orderItems: [
      { order_id: 'order-26', product_id: '2055', quantity: 6, price: 680, discount: 0, total: 4080 },
      { order_id: 'order-26', product_id: '2044', quantity: 6, price: 1490, discount: 0, total: 8940 },
    ],
    invoiceItems: [
      { invoice_id: 'invoice-92', product_id: '2055', quantity: 8, price: 680, discount: 0, total: 5440 },
      { invoice_id: 'invoice-92', product_id: '2044', quantity: 6, price: 1690, discount: 0, total: 10140 },
      { invoice_id: 'invoice-92', product_id: '2057', quantity: 10, price: 1290, discount: 0, total: 12900 },
    ],
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].order_number, 26)
  assert.equal(result[0].invoice_number, 92)
  assert.equal(result[0].differences.length, 3)
  assert.deepEqual(
    result[0].differences.map((row) => [row.product_code, row.type]),
    [['2055', 'Product changed'], ['2044', 'Product changed'], ['2057', 'Product added']],
  )
})

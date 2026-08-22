import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  convertOrderToInvoice,
  ORDER_CONVERSION_MISMATCH_MESSAGE,
} from '../src/lib/orderConversion.js'

test('conversion sends only the selected order ID to the atomic RPC', async () => {
  const calls = []
  const supabase = {
    rpc: async (...args) => {
      calls.push(args)
      return {
        data: [{
          invoice_id: 'invoice-1',
          invoice_number: 93,
          order_id: 'order-1',
          total_amount: 40900,
        }],
        error: null,
      }
    },
  }

  const result = await convertOrderToInvoice(supabase, 'order-1')

  assert.deepEqual(calls, [[
    'convert_order_to_invoice',
    { p_order_id: 'order-1' },
  ]])
  assert.equal(result.invoice_id, 'invoice-1')
})

test('conversion surfaces database validation failures without fallback writes', async () => {
  const supabase = {
    rpc: async () => ({
      data: null,
      error: { message: ORDER_CONVERSION_MISMATCH_MESSAGE },
    }),
  }

  await assert.rejects(
    () => convertOrderToInvoice(supabase, 'order-1'),
    { message: ORDER_CONVERSION_MISMATCH_MESSAGE },
  )
})

test('conversion rejects an empty RPC response', async () => {
  const supabase = {
    rpc: async () => ({ data: [], error: null }),
  }

  await assert.rejects(
    () => convertOrderToInvoice(supabase, 'order-1'),
    { message: ORDER_CONVERSION_MISMATCH_MESSAGE },
  )
})

test('migration contains snapshot, validation, linking, and duplicate safeguards', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260822000000_order_to_invoice_atomic.sql', import.meta.url),
    'utf8',
  )

  assert.match(sql, /create unique index if not exists invoices_order_id_unique_idx/i)
  assert.match(sql, /from public\.order_items oi[\s\S]*where oi\.order_id = p_order_id/i)
  assert.match(sql, /insert into public\.invoice_items[\s\S]*select[\s\S]*oi\.quantity[\s\S]*oi\.price[\s\S]*oi\.total/i)
  assert.match(sql, /except all/i)
  assert.match(sql, /update public\.products p[\s\S]*coalesce\(p\.stock, 0\) - ordered\.quantity/i)
  assert.match(sql, /update public\.orders[\s\S]*invoice_id = v_invoice\.id/i)
  assert.doesNotMatch(sql, /products\.price/i)
})

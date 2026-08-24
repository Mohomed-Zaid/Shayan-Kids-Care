import test from 'node:test'
import assert from 'node:assert/strict'
import { paginateInvoiceItems } from '../src/lib/invoicePagination.js'

test('final sales document page always owns exactly three writing rows', () => {
  const items = Array.from({ length: 11 }, (_, id) => ({ id }))
  const pages = paginateInvoiceItems(items)
  assert.equal(pages.at(-1).blankRows, 3)
  assert.equal(pages.slice(0, -1).every(page => page.blankRows === 0), true)
  assert.deepEqual(pages.flatMap(page => page.items), items)
})

test('pagination reserves closing space and continues serial indexes', () => {
  const items = Array.from({ length: 20 }, (_, id) => ({ id }))
  const pages = paginateInvoiceItems(items)
  const final = pages.at(-1)
  assert.equal(final.startIndex + final.items.length, items.length)
  assert.deepEqual(
    Array.from({ length: final.blankRows }, (_, index) => items.length + index + 1),
    [21, 22, 23],
  )
})

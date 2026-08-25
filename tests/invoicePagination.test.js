import test from 'node:test'
import assert from 'node:assert/strict'
import { getInvoicePageHeights, paginateInvoiceItems } from '../src/lib/invoicePagination.js'

test('sales-document pages contain real products only', () => {
  const items = Array.from({ length: 11 }, (_, id) => ({ id }))
  const pages = paginateInvoiceItems(items)

  assert.deepEqual(pages.flatMap(page => page.items), items)
  assert.equal(pages.every(page => !Object.hasOwn(page, 'blankRows')), true)
})

test('reserves a fixed clean writing area in the final-page height budget', () => {
  const heights = getInvoicePageHeights()

  assert.ok(heights.minimumWritingSpaceHeight >= 18.5)
  assert.ok(heights.finalReservedHeight >= 106.5)
})

test('keeps every product that fits on page one instead of holding one back', () => {
  const items = Array.from({ length: 11 }, (_, id) => ({ id }))
  const pages = paginateInvoiceItems(items)

  assert.equal(pages.length, 2)
  assert.equal(pages[0].items.length, 11)
  assert.equal(pages[1].items.length, 0)
  assert.equal(pages[1].isFinalPage, true)
  assert.equal(pages[1].writingSpaceHeightMm, 0)
})

test('keeps writing space when the final page contains real products', () => {
  const pages = paginateInvoiceItems(Array.from({ length: 4 }, (_, id) => ({ id })))

  assert.equal(pages.length, 1)
  assert.ok(pages[0].writingSpaceHeightMm > 0)
})

test('derives capacity from actual rendered row and closing-section heights', () => {
  const items = Array.from({ length: 6 }, (_, id) => ({ id }))
  const compactMetrics = {
    pageHeightMm: 100,
    itemRowHeightMm: 10,
    firstPageFixedContentHeightMm: 20,
    continuationTopMarginMm: 5,
    tableHeaderHeightMm: 10,
    tableVerticalPaddingMm: 0,
    pageBottomMarginMm: 10,
    writingSpacePreferredPx: 80,
    writingSpaceMinPx: 70,
    writingSpaceMaxPx: 100,
    bankTotalsHeightMm: 20,
    signatureHeightMm: 10,
    footerHeightMm: 5,
    closingSafeMarginMm: 5,
  }
  const pages = paginateInvoiceItems(items, {
    ...compactMetrics,
    rowHeightsMm: [10, 10, 30, 10, 10, 5],
  })

  assert.equal(pages[0].items.length, 4)
  assert.equal(pages.at(-1).items.length, 2)
})

test('keeps dynamic writing space between 70px and 140px', () => {
  const pages = paginateInvoiceItems(Array.from({ length: 4 }, (_, id) => ({ id })))
  const writingPixels = pages.at(-1).writingSpaceHeightMm * (96 / 25.4)

  assert.ok(writingPixels >= 70)
  assert.ok(writingPixels <= 140)
})

test('pagination preserves continuous real-product serial indexes', () => {
  const items = Array.from({ length: 20 }, (_, id) => ({ id }))
  const pages = paginateInvoiceItems(items)
  const final = pages.at(-1)

  assert.equal(final.startIndex + final.items.length, items.length)
  assert.deepEqual(pages.flatMap(page => page.items), items)
  assert.equal(final.isFinalPage, true)
})

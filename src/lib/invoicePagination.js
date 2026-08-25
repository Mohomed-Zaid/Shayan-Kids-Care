const PX_PER_MM = 96 / 25.4

export const INVOICE_PAGINATION = Object.freeze({
  pageHeightMm: 297,
  itemRowHeightMm: 9,
  firstPageFixedContentHeightMm: 95,
  continuationTopMarginMm: 8,
  tableHeaderHeightMm: 10,
  tableVerticalPaddingMm: 4,
  pageBottomMarginMm: 8,

  writingSpacePreferredPx: 100,
  writingSpaceMinPx: 70,
  writingSpaceMaxPx: 140,
  bankTotalsHeightMm: 38,
  signatureHeightMm: 30,
  footerHeightMm: 12,
  closingSafeMarginMm: 8,
})

const positive = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

const pxToMm = (pixels) => positive(pixels) / PX_PER_MM

const closingHeightWithoutWriting = (metrics) =>
  positive(metrics.bankTotalsHeightMm)
  + positive(metrics.signatureHeightMm)
  + positive(metrics.footerHeightMm)
  + positive(metrics.closingSafeMarginMm)

export function getInvoicePageHeights(metrics = INVOICE_PAGINATION) {
  const pageHeight = positive(metrics.pageHeightMm, 297)
  const tableChrome = positive(metrics.tableHeaderHeightMm)
    + positive(metrics.tableVerticalPaddingMm)
    + positive(metrics.pageBottomMarginMm)
  const firstPageRowsHeight = Math.max(
    0,
    pageHeight - positive(metrics.firstPageFixedContentHeightMm) - tableChrome,
  )
  const continuedPageRowsHeight = Math.max(
    0,
    pageHeight - positive(metrics.continuationTopMarginMm) - tableChrome,
  )
  const fixedClosingHeight = closingHeightWithoutWriting(metrics)
  const minimumWritingSpaceHeight = pxToMm(metrics.writingSpaceMinPx)
  const finalReservedHeight = fixedClosingHeight + minimumWritingSpaceHeight

  return {
    firstPageRowsHeight,
    continuedPageRowsHeight,
    fixedClosingHeight,
    minimumWritingSpaceHeight,
    finalReservedHeight,
  }
}

const sumRowHeights = (start, count, rowHeightAt) => {
  let height = 0
  for (let index = start; index < start + count; index += 1) height += rowHeightAt(index)
  return height
}

const rowsThatFit = (start, count, availableHeight, rowHeightAt) => {
  let used = 0
  let fitted = 0
  while (fitted < count) {
    const nextHeight = rowHeightAt(start + fitted)
    if (used + nextHeight > availableHeight) break
    used += nextHeight
    fitted += 1
  }
  return fitted
}

const writingSpaceFor = (availableHeight, itemHeight, heights, metrics) => {
  const minimum = heights.minimumWritingSpaceHeight
  const preferred = pxToMm(metrics.writingSpacePreferredPx)
  const maximum = Math.max(minimum, pxToMm(metrics.writingSpaceMaxPx))
  const possible = availableHeight - itemHeight - heights.fixedClosingHeight

  if (possible <= preferred) return Math.max(minimum, possible)
  const flexibleTarget = preferred + ((possible - preferred) * 0.35)
  return Math.min(maximum, flexibleTarget)
}

/**
 * Paginate by rendered row height when rowHeightsMm is supplied. The estimate
 * is used only for the first render; document views measure their real rows
 * and immediately run this function again before print/PDF export.
 */
export function paginateInvoiceItems(items, metrics = INVOICE_PAGINATION) {
  const source = Array.isArray(items) ? items : []
  const measuredHeights = Array.isArray(metrics.rowHeightsMm) ? metrics.rowHeightsMm : []
  const fallbackRowHeight = Math.max(1, positive(metrics.itemRowHeightMm, 9))
  const rowHeightAt = (index) => Math.max(1, positive(measuredHeights[index], fallbackRowHeight))
  const heights = getInvoicePageHeights(metrics)
  const pages = []
  let offset = 0
  let isFirstPage = true

  do {
    const availableHeight = isFirstPage
      ? heights.firstPageRowsHeight
      : heights.continuedPageRowsHeight
    const remaining = source.length - offset
    const remainingHeight = sumRowHeights(offset, remaining, rowHeightAt)
    const finalItemsHeight = availableHeight - heights.finalReservedHeight

    if (remainingHeight <= finalItemsHeight) {
      pages.push({
        items: source.slice(offset),
        startIndex: offset,
        isFirstPage,
        isFinalPage: true,
        writingSpaceHeightMm: remaining === 0
          ? 0
          : writingSpaceFor(availableHeight, remainingHeight, heights, metrics),
      })
      break
    }

    const fitted = rowsThatFit(offset, remaining, availableHeight, rowHeightAt)
    const take = Math.min(Math.max(1, fitted), remaining)
    pages.push({
      items: source.slice(offset, offset + take),
      startIndex: offset,
      isFirstPage,
      isFinalPage: false,
      writingSpaceHeightMm: 0,
    })
    offset += take
    isFirstPage = false
  } while (offset < source.length || !pages.at(-1)?.isFinalPage)

  return pages
}

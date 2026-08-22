export const INVOICE_PAGINATION = Object.freeze({
  itemRowHeightMm: 9,
  closingSectionHeightMm: 88,
  firstPageRowsHeightMm: 180,
  continuedPageRowsHeightMm: 268,
})

const capacity = (availableHeight, reservedHeight, rowHeight) =>
  Math.max(1, Math.floor((availableHeight - reservedHeight) / rowHeight))

/**
 * Split invoice items into explicit A4 pages. Non-final pages may use all of
 * their row area, but at least one item is kept for the final page so the
 * closing section is never stranded on a page by itself.
 */
export function paginateInvoiceItems(items, metrics = INVOICE_PAGINATION) {
  const source = Array.isArray(items) ? items : []
  const pages = []
  let offset = 0
  let isFirstPage = true

  do {
    const availableHeight = isFirstPage
      ? metrics.firstPageRowsHeightMm
      : metrics.continuedPageRowsHeightMm
    const regularCapacity = capacity(availableHeight, 0, metrics.itemRowHeightMm)
    const finalCapacity = capacity(
      availableHeight,
      metrics.closingSectionHeightMm,
      metrics.itemRowHeightMm,
    )
    const remaining = source.length - offset
    const isFinalPage = remaining <= finalCapacity
    const take = isFinalPage
      ? Math.max(0, remaining)
      : Math.min(regularCapacity, Math.max(1, remaining - 1))

    pages.push({
      items: source.slice(offset, offset + take),
      isFirstPage,
      isFinalPage,
    })
    offset += take
    isFirstPage = false
  } while (offset < source.length)

  return pages
}

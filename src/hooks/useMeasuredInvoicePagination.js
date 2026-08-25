import { useLayoutEffect, useMemo, useState } from 'react'
import { INVOICE_PAGINATION, paginateInvoiceItems } from '../lib/invoicePagination'

const PX_PER_MM = 96 / 25.4

const sameMeasurements = (left, right) => (
  left.length === right.length
  && left.every((height, index) => Math.abs(height - right[index]) < 0.15)
)

/**
 * Render once with safe estimates, measure every real table row at its final
 * document width, then repaginate with those actual heights.
 */
export function useMeasuredInvoicePagination(items, documentRef) {
  const [rowHeightsMm, setRowHeightsMm] = useState([])
  const itemIdentity = useMemo(
    () => items.map((item) => item?.id ?? item?.product_id ?? '').join('|'),
    [items],
  )

  const pages = useMemo(
    () => paginateInvoiceItems(items, { ...INVOICE_PAGINATION, rowHeightsMm }),
    [items, rowHeightsMm],
  )

  useLayoutEffect(() => {
    const root = documentRef.current
    if (!root || items.length === 0) return

    const rows = Array.from(root.querySelectorAll('.invoice-item-row'))
    if (rows.length !== items.length) return

    const measured = rows.map((row) => row.getBoundingClientRect().height / PX_PER_MM)
    if (measured.some((height) => !Number.isFinite(height) || height <= 0)) return

    setRowHeightsMm((current) => sameMeasurements(current, measured) ? current : measured)
  }, [documentRef, itemIdentity, items.length, pages.length])

  return pages
}

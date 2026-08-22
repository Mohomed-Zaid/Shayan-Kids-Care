const number = (value) => Number(value || 0)
const money = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100
const id = (value) => String(value ?? '')

function signature(item) {
  return [
    id(item.product_id),
    number(item.quantity),
    money(item.price),
    number(item.discount),
    money(item.total),
  ].join('|')
}

function aggregate(items) {
  const map = new Map()
  for (const item of items) {
    const key = id(item.product_id)
    const row = map.get(key) || { quantity: 0, prices: new Set(), discounts: new Set(), total: 0 }
    row.quantity += number(item.quantity)
    row.prices.add(money(item.price))
    row.discounts.add(number(item.discount))
    row.total = money(row.total + number(item.total))
    map.set(key, row)
  }
  return map
}

export function compareOrderInvoice(order, invoice, orderItems, invoiceItems, productMap = new Map()) {
  const left = [...orderItems].map(signature).sort()
  const right = [...invoiceItems].map(signature).sort()
  const itemMatch = left.length === right.length && left.every((value, index) => value === right[index])
  const totalMatch = money(order.total) === money(invoice.total_amount)
  if (itemMatch && totalMatch) return null

  const orderByProduct = aggregate(orderItems)
  const invoiceByProduct = aggregate(invoiceItems)
  const productIds = new Set([...orderByProduct.keys(), ...invoiceByProduct.keys()])
  const differences = []

  for (const productId of productIds) {
    const orderLine = orderByProduct.get(productId)
    const invoiceLine = invoiceByProduct.get(productId)
    const same = orderLine && invoiceLine &&
      orderLine.quantity === invoiceLine.quantity &&
      JSON.stringify([...orderLine.prices]) === JSON.stringify([...invoiceLine.prices]) &&
      JSON.stringify([...orderLine.discounts]) === JSON.stringify([...invoiceLine.discounts]) &&
      orderLine.total === invoiceLine.total
    if (same) continue
    const product = productMap.get(productId) || {}
    differences.push({
      product_id: productId,
      product_code: product.code || '',
      product_name: product.name || 'Unknown product',
      type: !orderLine ? 'Product added' : !invoiceLine ? 'Product removed' : 'Product changed',
      order_quantity: orderLine?.quantity ?? null,
      invoice_quantity: invoiceLine?.quantity ?? null,
      order_price: orderLine ? [...orderLine.prices].join(', ') : null,
      invoice_price: invoiceLine ? [...invoiceLine.prices].join(', ') : null,
      order_total: orderLine?.total ?? null,
      invoice_total: invoiceLine?.total ?? null,
    })
  }

  return {
    order_id: order.id,
    order_number: order.order_number,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    order_total: money(order.total),
    invoice_total: money(invoice.total_amount),
    order_item_count: orderItems.length,
    invoice_item_count: invoiceItems.length,
    differences,
  }
}

export function buildConsistencyRows({ orders, invoices, orderItems, invoiceItems, products }) {
  const invoiceMap = new Map(invoices.map((row) => [id(row.id), row]))
  const productMap = new Map(products.map((row) => [id(row.id), row]))
  const orderItemsById = new Map()
  const invoiceItemsById = new Map()

  for (const item of orderItems) {
    const key = id(item.order_id)
    orderItemsById.set(key, [...(orderItemsById.get(key) || []), item])
  }
  for (const item of invoiceItems) {
    const key = id(item.invoice_id)
    invoiceItemsById.set(key, [...(invoiceItemsById.get(key) || []), item])
  }

  return orders.flatMap((order) => {
    const invoice = invoiceMap.get(id(order.invoice_id))
    if (!invoice) return []
    const mismatch = compareOrderInvoice(
      order,
      invoice,
      orderItemsById.get(id(order.id)) || [],
      invoiceItemsById.get(id(invoice.id)) || [],
      productMap,
    )
    return mismatch ? [mismatch] : []
  })
}

export const ORDER_DATA_VALIDATION_MESSAGE =
  'Order data validation failed. Please refresh and try again.'

export function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export function calculateOrderLine(line) {
  const quantity = Number(line.quantity || 0)
  const price = Number(line.price || 0)
  const discount = Number(line.discount || 0)
  const discount_amount = roundMoney(quantity * price * discount / 100)
  const total = roundMoney(quantity * price - discount_amount)
  return { ...line, quantity, price, discount, discount_amount, total }
}

export function normalizeOrderLines(lines) {
  return (lines || [])
    .filter((line) => line.product_id)
    .map(calculateOrderLine)
    .filter((line) => line.quantity > 0)
    .map(({ product_id, quantity, price, discount, discount_amount, total }) => ({
      product_id,
      quantity,
      price,
      discount,
      discount_amount,
      total,
    }))
}

export function buildOrderSnapshot(lines, vatEnabled, vatRate = 0.18) {
  const items = normalizeOrderLines(lines)
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0))
  const vat_rate = vatEnabled ? Number(vatRate) : 0
  const vat_amount = roundMoney(subtotal * vat_rate)
  const total = roundMoney(subtotal + vat_amount)
  return { items, subtotal, vat_rate, vat_amount, total }
}

function rpcRow(data) {
  return Array.isArray(data) ? data[0] : data
}

export async function createOrderSnapshot(supabase, header, snapshot) {
  const { data, error } = await supabase.rpc('create_order_from_snapshot', {
    p_customer_id: header.customerId,
    p_rep_id: header.repId || null,
    p_payment_type: header.paymentType || 'credit',
    p_vat_rate: snapshot.vat_rate,
    p_vat_amount: snapshot.vat_amount,
    p_total: snapshot.total,
    p_items: snapshot.items,
  })
  if (error) throw new Error(error.message || ORDER_DATA_VALIDATION_MESSAGE)
  const row = rpcRow(data)
  if (!row?.created_order_id) throw new Error(ORDER_DATA_VALIDATION_MESSAGE)
  return row
}

export async function updateOrderSnapshot(supabase, orderId, header, snapshot) {
  const { error } = await supabase.rpc('update_order_from_snapshot', {
    p_order_id: orderId,
    p_customer_id: header.customerId,
    p_rep_id: header.repId || null,
    p_payment_type: header.paymentType || 'credit',
    p_vat_rate: snapshot.vat_rate,
    p_vat_amount: snapshot.vat_amount,
    p_total: snapshot.total,
    p_items: snapshot.items,
  })
  if (error) throw new Error(error.message || ORDER_DATA_VALIDATION_MESSAGE)
}

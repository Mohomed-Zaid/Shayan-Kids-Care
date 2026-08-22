export const ORDER_CONVERSION_MISMATCH_MESSAGE =
  'Order conversion failed: invoice data does not match the original order.'

export async function convertOrderToInvoice(supabase, orderId) {
  const { data, error } = await supabase.rpc('convert_order_to_invoice', {
    p_order_id: orderId,
  })

  if (error) {
    throw new Error(error.message || ORDER_CONVERSION_MISMATCH_MESSAGE)
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result?.invoice_id) {
    throw new Error(ORDER_CONVERSION_MISMATCH_MESSAGE)
  }

  return result
}

import { supabase } from './supabaseClient'

const REVERSED = new Set(['reversed', 'cancelled', 'canceled', 'deleted', 'void'])

export const isPurchaseReversed = (purchase) => REVERSED.has(String(purchase?.status ?? '').toLowerCase())

export async function reversePurchase(purchaseId, reason) {
  const cleanReason = String(reason ?? '').trim()
  if (cleanReason.length < 3) throw new Error('A reversal reason of at least 3 characters is required.')
  const { data, error } = await supabase.rpc('reverse_purchase', {
    p_purchase_id: purchaseId,
    p_reason: cleanReason,
  })
  if (error) throw error
  return data
}

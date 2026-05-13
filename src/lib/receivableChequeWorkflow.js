/**
 * Receivable cheque workflow (single source of truth for behaviour):
 *
 * 1) **Add receivable cheque** (Receivables / customer receivable payment, method = cheque)
 *    - Persist `invoice_payments` as today.
 *    - **Before** inserting payments, upsert `customer_cheques` with `status: 'in_hand'`
 *      so Finance → Cheque Administration → **Cheques In Hand** always has a row.
 *
 * 2) **Deposit** (Cheque Administration → select rows → Deposit)
 *    - Modal: user must pick the **receiving bank** (where the cheque is deposited).
 *    - Update `customer_cheques` → `status: 'deposited'`, set `deposited_at`.
 *    - Insert `bank_reconciliation_items` for that `bank_id` so Bank Reconciliation shows the line.
 *
 * Tables: `invoice_payments`, `customer_cheques`, `banks`, `bank_reconciliation_items`
 */

export const RECEIVABLE_CHEQUE_IN_HAND = 'in_hand'
export const RECEIVABLE_CHEQUE_DEPOSITED = 'deposited'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ customerId: string, chequeRows: Array<{ cheque_date: string, cheque_number: string, bank_name?: string|null, bank_code?: string|null, amount: number }> }} params
 * @returns {Promise<{ ok: true } | { ok: false, error: Error }>}
 */
export async function registerReceivableChequesInHand(supabase, { customerId, chequeRows }) {
  for (const c of chequeRows) {
    const { error } = await supabase.from('customer_cheques').upsert(
      {
        customer_id: customerId,
        cheque_date: c.cheque_date,
        cheque_number: c.cheque_number,
        bank_name: c.bank_name || null,
        bank_code: c.bank_code || null,
        amount: c.amount,
        status: RECEIVABLE_CHEQUE_IN_HAND,
      },
      { onConflict: 'customer_id,cheque_number' }
    )
    if (error) {
      return {
        ok: false,
        error: new Error(`Cheque register failed (${c.cheque_number ?? '?'}): ${error.message}`),
      }
    }
  }
  return { ok: true }
}

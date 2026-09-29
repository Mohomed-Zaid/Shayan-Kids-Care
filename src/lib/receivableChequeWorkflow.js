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
 * 3) **Handover To Customer / Return** (Cheque Administration / Customer Receivables)
 *    - Remove / delete matching `invoice_payments` (reverses payment, adds amount back to balance in receivables).
 *    - Remove any matching `bank_reconciliation_items` (if previously deposited).
 *    - Update `customer_cheques` → `status: 'handed_over'` (or `'returned'`).
 *
 * Tables: `invoice_payments`, `customer_cheques`, `banks`, `bank_reconciliation_items`
 */

export const RECEIVABLE_CHEQUE_IN_HAND = 'in_hand'
export const RECEIVABLE_CHEQUE_DEPOSITED = 'deposited'
export const RECEIVABLE_CHEQUE_HANDED_OVER = 'handed_over'
export const RECEIVABLE_CHEQUE_RETURNED = 'returned'

export const STATUS_IN_HAND = RECEIVABLE_CHEQUE_IN_HAND
export const STATUS_DEPOSITED = RECEIVABLE_CHEQUE_DEPOSITED
export const STATUS_HANDED_OVER = RECEIVABLE_CHEQUE_HANDED_OVER
export const STATUS_RETURNED = RECEIVABLE_CHEQUE_RETURNED

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

/**
 * Generate variations of a cheque number for flexible matching
 * (e.g. "123456-7010-001", "1234567010001", "123456", trimmed, etc.)
 */
export function getChequeNumberVariants(numStr) {
  if (!numStr) return []
  const raw = String(numStr).trim()
  if (!raw) return []

  const digitsOnly = raw.replace(/\D/g, '')
  const noDashes = raw.replace(/-/g, '').trim()
  const firstPart = raw.split(/[^0-9a-zA-Z]/)[0]?.trim() || ''

  const variants = new Set([
    raw,
    raw.toLowerCase(),
    raw.toUpperCase(),
    noDashes,
    digitsOnly,
    firstPart,
  ])

  // If 13 digits, format with dashes XXXXXX-XXXX-XXX
  if (digitsOnly.length === 13) {
    variants.add(`${digitsOnly.slice(0, 6)}-${digitsOnly.slice(6, 10)}-${digitsOnly.slice(10)}`)
  }
  // First 6 digits
  if (digitsOnly.length >= 6) {
    variants.add(digitsOnly.slice(0, 6))
  }

  return Array.from(variants).filter((v) => v.length > 0)
}

/**
 * Checks whether an invoice_payment matches a customer cheque.
 */
export function matchesChequePayment(payment, cheque) {
  if (!payment || !cheque) return false

  const pRef = String(payment.reference || '').trim().toLowerCase()
  const cRef = String(cheque.cheque_number || '').trim().toLowerCase()

  if (!pRef || !cRef) return false

  // 1. Exact string match (case-insensitive)
  if (pRef === cRef) return true

  // 2. Digits-only match
  const pDigits = pRef.replace(/\D/g, '')
  const cDigits = cRef.replace(/\D/g, '')
  if (pDigits && cDigits && pDigits === cDigits) return true

  // 3. First segment (6-digit cheque number) match
  const cFirst = cRef.split(/[^0-9a-z]/i)[0].trim()
  const pFirst = pRef.split(/[^0-9a-z]/i)[0].trim()
  if (cFirst.length >= 4 && pFirst.length >= 4 && cFirst === pFirst) return true

  // 4. Substring containment if length >= 6
  if (cDigits.length >= 6 && pDigits.length >= 6) {
    if (pDigits.includes(cDigits) || cDigits.includes(pDigits)) return true
  }

  // 5. String containment
  if (cRef.length >= 4 && pRef.includes(cRef)) return true
  if (pRef.length >= 4 && cRef.includes(pRef)) return true

  return false
}

/**
 * Reverses receivable cheque payments when a cheque is handed over or returned.
 * Deletes corresponding `invoice_payments` rows so that the customer's balance
 * in Receivables is automatically restored, cleans up bank reconciliation items,
 * and updates `customer_cheques` status.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<object>} chequeRows - Array of customer_cheques rows
 * @param {string} targetStatus - Status to set on customer_cheques ('handed_over' or 'returned')
 * @returns {Promise<{ ok: boolean, deletedPaymentsCount: number, reversedTotal: number, paymentsDeleted: Array<object>, error?: Error }>}
 */
export async function reverseChequePayments(supabase, chequeRows, targetStatus = RECEIVABLE_CHEQUE_HANDED_OVER) {
  if (!chequeRows || chequeRows.length === 0) {
    return { ok: true, deletedPaymentsCount: 0, reversedTotal: 0, paymentsDeleted: [] }
  }

  try {
    const customerIds = Array.from(new Set(chequeRows.map((c) => c.customer_id).filter(Boolean)))
    const chequeIds = chequeRows.map((c) => c.id).filter(Boolean)

    let candidatePayments = []

    // 1. Fetch payments linked to the customer's invoices
    if (customerIds.length > 0) {
      const { data: custInvoices, error: invErr } = await supabase
        .from('invoices')
        .select('id, customer_id')
        .in('customer_id', customerIds)

      if (!invErr && custInvoices && custInvoices.length > 0) {
        const invIds = custInvoices.map((i) => i.id)
        const { data: invPayments, error: payErr } = await supabase
          .from('invoice_payments')
          .select('id, invoice_id, amount, paid_at, method, reference, bank_name, note')
          .in('invoice_id', invIds)

        if (!payErr && invPayments) {
          candidatePayments = invPayments
        }
      }
    }

    // 2. Also search directly by reference variants
    const allVariants = Array.from(
      new Set(
        chequeRows.flatMap((c) => getChequeNumberVariants(c.cheque_number))
      )
    )

    if (allVariants.length > 0) {
      const { data: refPayments, error: refPayErr } = await supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, paid_at, method, reference, bank_name, note')
        .in('reference', allVariants)

      if (!refPayErr && refPayments) {
        const seenIds = new Set(candidatePayments.map((p) => p.id))
        for (const p of refPayments) {
          if (!seenIds.has(p.id)) {
            candidatePayments.push(p)
            seenIds.add(p.id)
          }
        }
      }
    }

    // 3. Match candidate payments to the selected cheques
    const paymentsToDelete = new Map()
    for (const cheque of chequeRows) {
      for (const payment of candidatePayments) {
        if (matchesChequePayment(payment, cheque)) {
          paymentsToDelete.set(payment.id, payment)
        }
      }
    }

    const paymentsArray = Array.from(paymentsToDelete.values())
    const payIds = paymentsArray.map((p) => p.id)

    // 4. Delete matching invoice_payments to return paid amount back to balance in receivables
    if (payIds.length > 0) {
      const { error: delErr } = await supabase
        .from('invoice_payments')
        .delete()
        .in('id', payIds)

      if (delErr) {
        throw new Error(`Failed to delete invoice payments: ${delErr.message}`)
      }
    }

    // 5. Clean up bank reconciliation items if any
    const reconRefs = chequeIds.map((id) => `RCV-CHQ-${id}`)
    if (reconRefs.length > 0) {
      await supabase
        .from('bank_reconciliation_items')
        .delete()
        .in('ref_no', reconRefs)
    }

    // 6. Update customer_cheques status
    if (chequeIds.length > 0) {
      const { error: statusErr } = await supabase
        .from('customer_cheques')
        .update({
          status: targetStatus,
          deposited_at: null,
        })
        .in('id', chequeIds)

      if (statusErr) {
        throw statusErr
      }
    }

    const reversedTotal = paymentsArray.reduce((sum, p) => sum + Number(p.amount ?? 0), 0)

    return {
      ok: true,
      deletedPaymentsCount: payIds.length,
      reversedTotal,
      paymentsDeleted: paymentsArray,
    }
  } catch (err) {
    console.error('reverseChequePayments error:', err)
    return {
      ok: false,
      error: err,
      deletedPaymentsCount: 0,
      reversedTotal: 0,
      paymentsDeleted: [],
    }
  }
}

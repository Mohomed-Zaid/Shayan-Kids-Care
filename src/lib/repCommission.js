export const COMMISSION_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const COMMISSION_RATES = { munzir: 0.025, default: 0.01 }

export function getCommissionRate(repName) {
  return repName?.toLowerCase().includes('munzir') ? COMMISSION_RATES.munzir : COMMISSION_RATES.default
}

export function periodBounds(month, year) {
  return {
    startDate: new Date(year, month, 1).toISOString(),
    endDate: new Date(year, month + 1, 1).toISOString(),
  }
}

/** Net commission for rep in calendar month (matches Commission report). */
export async function calculateRepCommission(supabase, { repId, month, year, repName }) {
  const { startDate, endDate } = periodBounds(month, year)

  const [invRes, retRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, total_amount')
      .eq('rep_id', repId)
      .gte('created_at', startDate)
      .lt('created_at', endDate),
    supabase
      .from('returns')
      .select('id, total_amount, invoices(rep_id)')
      .gte('created_at', startDate)
      .lt('created_at', endDate),
  ])

  if (invRes.error) throw invRes.error
  if (retRes.error) throw retRes.error

  const invoiceList = invRes.data ?? []
  const returnList = (retRes.data ?? []).filter(
    (r) => r.invoices && String(r.invoices.rep_id) === String(repId)
  )

  const totalSales = invoiceList.reduce((sum, inv) => sum + Number(inv.total_amount ?? 0), 0)
  const totalReturns = returnList.reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0)
  const netSales = totalSales - totalReturns
  const rate = getCommissionRate(repName)
  const grossCommission = totalSales * rate
  const returnDeduction = totalReturns * rate
  const commission = netSales * rate

  return {
    repName: repName ?? '—',
    month: COMMISSION_MONTHS[month],
    monthIndex: month,
    year,
    invoiceCount: invoiceList.length,
    returnCount: returnList.length,
    totalSales,
    totalReturns,
    netSales,
    grossCommission,
    returnDeduction,
    commission,
    rate,
  }
}

export function getCommissionPaymentStatus(commissionDue, totalPaid) {
  const due = Math.max(0, Number(commissionDue ?? 0))
  const paid = Math.max(0, Number(totalPaid ?? 0))
  const remaining = Math.max(0, due - paid)

  if (due <= 0.005) {
    return { status: 'paid', label: 'Paid', remaining: 0, paid, due }
  }
  if (paid <= 0.005) {
    return { status: 'unpaid', label: 'Unpaid', remaining: due, paid, due }
  }
  if (remaining <= 0.005) {
    return { status: 'paid', label: 'Paid', remaining: 0, paid, due }
  }
  return { status: 'partial', label: 'Partial', remaining, paid, due }
}

export function statusBadgeClass(status) {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (status === 'partial') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
}

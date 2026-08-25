const number = (value) => Number(value ?? 0) || 0

export function sumByInvoice(rows = [], amountField = 'amount') {
  const totals = new Map()
  for (const row of rows) {
    if (!row?.invoice_id) continue
    totals.set(row.invoice_id, (totals.get(row.invoice_id) ?? 0) + number(row[amountField]))
  }
  return totals
}

export function invoiceBalance(total, paid = 0, returned = 0) {
  return Math.max(0, number(total) - number(paid) - number(returned))
}

export function buildInvoiceBalanceRows(invoices = [], payments = [], returns = []) {
  const paymentsByInvoice = sumByInvoice(payments, 'amount')
  const returnsByInvoice = sumByInvoice(returns, 'total_amount')
  const rows = invoices.map((invoice) => {
    const paid = paymentsByInvoice.get(invoice.id) ?? 0
    const returned = returnsByInvoice.get(invoice.id) ?? 0
    const balance = invoiceBalance(invoice.total_amount, paid, returned)
    return { ...invoice, paid, returned, balance, status: balance <= 0.005 ? 'paid' : paid > 0 || returned > 0 ? 'partial' : 'unpaid' }
  })

  // Historical returns were allowed without invoice_id. Preserve their real
  // receivable effect by allocating them to the customer's oldest outstanding
  // credit invoices that existed when the return occurred. New returns are
  // always linked by the transactional RPC above and never use this fallback.
  const unlinked = returns
    .filter((row) => !row?.invoice_id && row?.customer_id && number(row.total_amount) > 0)
    .sort((a, b) => new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0))

  for (const credit of unlinked) {
    let remaining = number(credit.total_amount)
    const creditDate = credit.created_at ? new Date(credit.created_at).getTime() : Infinity
    const candidates = rows
      .filter((row) => row.customer_id === credit.customer_id
        && String(row.payment_type ?? 'credit').toLowerCase() === 'credit'
        && (!row.created_at || new Date(row.created_at).getTime() <= creditDate)
        && row.balance > 0)
      .sort((a, b) => new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0))

    for (const row of candidates) {
      if (remaining <= 0) break
      const applied = Math.min(row.balance, remaining)
      row.returned += applied
      row.unlinked_return_credit = (row.unlinked_return_credit ?? 0) + applied
      row.balance -= applied
      row.status = row.balance <= 0.005 ? 'paid' : 'partial'
      remaining -= applied
    }
  }

  return rows
}

export function customerOutstanding(invoices = [], payments = [], returns = []) {
  return buildInvoiceBalanceRows(invoices, payments, returns)
    .filter((invoice) => String(invoice.payment_type ?? 'credit').toLowerCase() === 'credit')
    .reduce((sum, invoice) => sum + invoice.balance, 0)
}

export function groupInvoiceBalancesByCustomer(invoices = [], payments = [], returns = []) {
  const grouped = new Map()
  for (const invoice of buildInvoiceBalanceRows(invoices, payments, returns)) {
    if (!invoice.customer_id || String(invoice.payment_type ?? 'credit').toLowerCase() !== 'credit') continue
    const current = grouped.get(invoice.customer_id) ?? { customer_id: invoice.customer_id, invoiced: 0, paid: 0, returned: 0, balance: 0, invoices: [] }
    current.invoiced += number(invoice.total_amount)
    current.paid += invoice.paid
    current.returned += invoice.returned
    current.balance += invoice.balance
    current.invoices.push(invoice)
    grouped.set(invoice.customer_id, current)
  }
  return grouped
}

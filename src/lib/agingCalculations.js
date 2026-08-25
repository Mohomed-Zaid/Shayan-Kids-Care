// Calculate aging days from invoice date
export const calculateAgingDays = (invoiceDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const invDate = new Date(invoiceDate);
  invDate.setHours(0, 0, 0, 0);
  const diffTime = today - invDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

// Get aging bucket from days
export const getAgingBucket = (days) => {
  if (days <= 30) return 'Current';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  if (days <= 120) return '91-120';
  return 'Over 120';
};

// Get color class for aging bucket (for Tailwind)
export const getAgingColorClasses = (bucket) => {
  switch (bucket) {
    case 'Current':
      return 'text-emerald-600 dark:text-emerald-400';
    case '31-60':
      return 'text-amber-600 dark:text-amber-400';
    case '61-90':
      return 'text-orange-600 dark:text-orange-400';
    case '91-120':
      return 'text-red-600 dark:text-red-400';
    case 'Over 120':
      return 'text-red-800 dark:text-red-600';
    default:
      return 'text-slate-600 dark:text-slate-400';
  }
};

// Calculate aging summary for a list of invoices
export const calculateAgingSummary = (invoices, paymentSumByInvoice, returnSumByInvoice = new Map()) => {
  const summary = {
    total: 0,
    current: 0,
    '31-60': 0,
    '61-90': 0,
    '91-120': 0,
    'over-120': 0,
  }

  for (const inv of invoices) {
    const paid = paymentSumByInvoice?.get?.(inv.id) ?? 0
    const returned = returnSumByInvoice?.get?.(inv.id) ?? 0
    const total = Number(inv.total_amount ?? 0)
    const invoiceBalance = Math.max(0, total - paid - returned)
    if (invoiceBalance <= 0) continue

    const days = calculateAgingDays(inv.created_at)
    const bucket = getAgingBucket(days)

    summary.total += invoiceBalance

    if (bucket === 'Current') summary.current += invoiceBalance
    else if (bucket === '31-60') summary['31-60'] += invoiceBalance
    else if (bucket === '61-90') summary['61-90'] += invoiceBalance
    else if (bucket === '91-120') summary['91-120'] += invoiceBalance
    else summary['over-120'] += invoiceBalance
  }

  return summary
};

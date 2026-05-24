export const fmtMoney = (val) =>
  `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export function parseMoneyInput(val) {
  const n = Number(String(val ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

export function formatMoneyInput(val) {
  const n = parseMoneyInput(val)
  if (!n) return ''
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function totalMonthlyCompensation(row) {
  return (
    Number(row?.salary ?? 0) +
    Number(row?.allowance ?? 0) +
    Number(row?.other_allowance ?? 0)
  )
}

export function isCompensationColumnError(err) {
  const msg = String(err?.message ?? '').toLowerCase()
  return (
    err?.code === 'PGRST204' ||
    msg.includes('salary') ||
    msg.includes('allowance') ||
    msg.includes('schema cache')
  )
}

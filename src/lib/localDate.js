/** ISO timestamp for the user's local calendar date (noon local) — stable for date-only display. */
export function pressDateISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).toISOString()
}

/** Format a stored timestamp as a local calendar date. */
export function formatLocalDate(value, locale = undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(locale)
}

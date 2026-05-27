/** Key inside user_privileges.permissions JSON for dashboard widget toggles. */
export const DASHBOARD_WIDGETS_KEY = 'dashboard_widgets'

/** All dashboard blocks an admin can show or hide per user. */
export const DASHBOARD_WIDGETS = [
  { id: 'welcome', label: 'Welcome header', group: 'General' },
  { id: 'quick_create_order', label: 'Create Order button', group: 'General' },
  { id: 'stat_todaySales', label: 'Today Sales', group: 'Summary cards' },
  { id: 'stat_totalSales', label: 'Total Sales', group: 'Summary cards' },
  { id: 'stat_todayPayments', label: 'Today Payments', group: 'Summary cards' },
  { id: 'stat_totalPayments', label: 'Total Payments', group: 'Summary cards' },
  { id: 'stat_chequeInHand', label: 'Cheque In Hand', group: 'Summary cards' },
  { id: 'stat_returnCheque', label: 'Return Cheque', group: 'Summary cards' },
  { id: 'stat_payable', label: 'Payable', group: 'Summary cards' },
  { id: 'stat_products', label: 'Products count', group: 'Summary cards' },
  { id: 'stat_customers', label: 'Customers count', group: 'Summary cards' },
  { id: 'chart_sales_profit', label: 'Sales & Profit chart', group: 'Charts' },
  { id: 'chart_month_summary', label: 'Current month summary (under chart)', group: 'Charts' },
  { id: 'chart_receivable', label: 'Customer Receivable chart', group: 'Charts' },
  { id: 'table_receivable_cheques', label: 'Receivable Cheques table', group: 'Tables' },
  { id: 'table_customer_payments', label: 'Customer Payments table', group: 'Tables' },
  { id: 'table_payable_cheques', label: 'Payable Cheques table', group: 'Tables' },
]

export function defaultDashboardVisibility() {
  const vis = {}
  for (const w of DASHBOARD_WIDGETS) vis[w.id] = true
  return vis
}

export function normalizeDashboardVisibility(raw) {
  const base = defaultDashboardVisibility()
  if (!raw || typeof raw !== 'object') return base
  for (const w of DASHBOARD_WIDGETS) {
    if (typeof raw[w.id] === 'boolean') base[w.id] = raw[w.id]
  }
  return base
}

export function extractDashboardWidgets(permissionsRaw) {
  if (!permissionsRaw || typeof permissionsRaw !== 'object') return defaultDashboardVisibility()
  return normalizeDashboardVisibility(permissionsRaw[DASHBOARD_WIDGETS_KEY])
}

/** Merge module permissions + dashboard widgets for DB storage. */
export function packPermissionsForDb(modulePermissions, dashboardWidgets) {
  return {
    ...modulePermissions,
    [DASHBOARD_WIDGETS_KEY]: normalizeDashboardVisibility(dashboardWidgets),
  }
}

export function dashboardWidgetsByGroup() {
  const groups = {}
  for (const w of DASHBOARD_WIDGETS) {
    if (!groups[w.group]) groups[w.group] = []
    groups[w.group].push(w)
  }
  return groups
}

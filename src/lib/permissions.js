/** Super-admin emails always have full access (bootstrap). */
export const SUPER_ADMIN_EMAILS = new Set([
  'shayankidscare@gmail.com',
  'zaidn2848@gmail.com',
])

/** Permission catalog: module id → label, nav route, actions. */
export const PERMISSION_CATALOG = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    group: 'General',
    route: '/dashboard',
    actions: [{ id: 'view', label: 'View' }],
  },
  {
    id: 'customers',
    label: 'Customer',
    group: 'Master Data',
    route: '/customers',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'employees',
    label: 'Employees',
    group: 'Master Data',
    route: '/reps',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'products',
    label: 'Products',
    group: 'Master Data',
    route: '/products',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'vendors',
    label: 'Vendor',
    group: 'Master Data',
    route: '/vendors',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'journals',
    label: 'Journal (Chart of Accounts)',
    group: 'Master Data',
    route: '/journals',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'user_privileges',
    label: 'User Privilege',
    group: 'Master Data',
    route: '/master-data/user-privileges',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create User' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'inventory_purchase',
    label: 'New Purchase',
    group: 'Inventory',
    route: '/inventory/purchase',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'inventory_beginning_stock',
    label: 'Beginning Stock',
    group: 'Inventory',
    route: '/inventory/beginning-stock',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create / Adjust' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'orders',
    label: 'Orders',
    group: 'Orders & Invoices',
    route: '/orders',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'approve', label: 'Approve / Confirm' },
      { id: 'convert_to_invoice', label: 'Convert To Invoice' },
      { id: 'deliver', label: 'Mark Delivered' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'invoices',
    label: 'Invoice',
    group: 'Orders & Invoices',
    route: '/invoices',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
      { id: 'print', label: 'Print' },
      { id: 'download_pdf', label: 'Download PDF' },
    ],
  },
  {
    id: 'returns',
    label: 'Returns',
    group: 'Returns',
    route: '/returns',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'commission',
    label: 'Commission',
    group: 'Finance',
    route: '/commission',
    actions: [{ id: 'view', label: 'View' }],
  },
  {
    id: 'finance_journal_entry',
    label: 'Journal Entry',
    group: 'Finance',
    route: '/finance/journal-entry',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'finance_rep_payments',
    label: 'Rep Payments',
    group: 'Finance',
    route: '/finance/rep-payments',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Pay' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'finance_receivables',
    label: 'Receivables',
    group: 'Finance',
    route: '/finance/receivables',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Record Payment' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'finance_payables',
    label: 'Payables',
    group: 'Finance',
    route: '/finance/payables',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Record Payment' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'finance_banks',
    label: 'Banks',
    group: 'Finance',
    route: '/finance/banks',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'finance_cheques',
    label: 'Cheque Administration',
    group: 'Finance',
    route: '/finance/cheques',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'finance_bank_reconciliation',
    label: 'Bank Reconciliation',
    group: 'Finance',
    route: '/finance/bank-reconciliation',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'finance_bank_letters',
    label: 'Bank Letters',
    group: 'Finance',
    route: '/finance/bank-letters/salary-transfer',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'print', label: 'Print' },
      { id: 'export', label: 'Export PDF' },
    ],
  },
  {
    id: 'finance_delete_receivable',
    label: 'Delete Receivable',
    group: 'Finance',
    route: '/finance/delete-receivable',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'finance_delete_payable',
    label: 'Delete Payable',
    group: 'Finance',
    route: '/finance/delete-payable',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    id: 'reports_admin_system',
    label: 'Admin, Audit & System Reports',
    group: 'Reports',
    route: '/reports/admin-system',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'print', label: 'Print' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    id: 'reports_returns_delivery',
    label: 'Returns & Delivery Reports',
    group: 'Reports',
    route: '/reports/returns-delivery',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'print', label: 'Print' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    id: 'reports_profit_loss',
    label: 'Profit & Loss Report',
    group: 'Reports',
    route: '/reports/profit-loss',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'print', label: 'Print' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    id: 'reports_balance_sheet',
    label: 'Balance Sheet Report',
    group: 'Reports',
    route: '/reports/balance-sheet',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'print', label: 'Print' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    id: 'reports_expenses',
    label: 'Expense Reports',
    group: 'Reports',
    route: '/reports/expenses',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'print', label: 'Print' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    id: 'reports_day_book',
    label: 'Day Book',
    group: 'Reports',
    route: '/reports/day-book',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'print', label: 'Print' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    id: 'reports_cheques',
    label: 'Cheque Reports',
    group: 'Reports',
    route: '/reports/cheques',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'print', label: 'Print' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    id: 'reports_finance',
    label: 'Finance Reports',
    group: 'Reports',
    route: '/reports/finance',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
      { id: 'export', label: 'Export' },
      { id: 'print', label: 'Print' },
      { id: 'view_receivables', label: 'View Receivables' },
      { id: 'view_payables', label: 'View Payables' },
      { id: 'view_bank_data', label: 'View Bank Data' },
      { id: 'view_commission', label: 'View Commission' },
      { id: 'view_profit_loss', label: 'View Profit & Loss' },
    ],
  },
  {
    id: 'reports_customers',
    label: 'Customer Reports',
    group: 'Reports',
    route: '/reports/customers',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
      { id: 'export', label: 'Export' },
      { id: 'print', label: 'Print' },
      { id: 'view_financial_data', label: 'View Financial Data' },
      { id: 'view_cheques', label: 'View Cheques' },
      { id: 'view_credit_limits', label: 'View Credit Limits' },
    ],
  },
  {
    id: 'reports_inventory',
    label: 'Inventory Reports',
    group: 'Reports',
    route: '/reports/inventory/detailed',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'export_cost', label: 'Export Cost & Profit' },
      { id: 'adjust', label: 'Create Stock Adjustment' },
      { id: 'correct', label: 'Correct Stock Mismatch' },
    ],
  },
  {
    id: 'reports_vendors',
    label: 'Vendor Reports',
    group: 'Reports',
    route: '/reports/vendors',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'print', label: 'Print' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    id: 'reports_reps',
    label: 'Rep & Commission Reports',
    group: 'Reports',
    route: '/reports/reps',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'print', label: 'Print' },
      { id: 'export', label: 'Export' },
    ],
  },
  {
    id: 'reports_purchase',
    label: 'Purchase Reports',
    group: 'Reports',
    route: '/reports/purchases',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Create' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
      { id: 'export', label: 'Export / Print' },
    ],
  },
  {
    id: 'admin_backup',
    label: 'Backup & Safety',
    group: 'Admin',
    route: '/backup',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'create', label: 'Export / Restore' },
    ],
  },
  {
    id: 'admin_audit_log',
    label: 'Audit Log',
    group: 'Admin',
    route: '/audit-log',
    actions: [{ id: 'view', label: 'View' }],
  },
  {
    id: 'sms',
    label: 'SMS Service',
    group: 'General',
    route: '/sms-service',
    actions: [
      { id: 'view', label: 'View' },
      { id: 'send_single', label: 'Send Single SMS' },
      { id: 'send_bulk', label: 'Send Bulk SMS' },
    ],
  },
]

export const MODULE_BY_ID = Object.fromEntries(PERMISSION_CATALOG.map((m) => [m.id, m]))

/** Default permissions for a new user (view-only on safe modules). */
export function defaultPermissions() {
  const perms = {}
  for (const mod of PERMISSION_CATALOG) {
    perms[mod.id] = {}
    for (const action of mod.actions) {
      perms[mod.id][action.id] = action.id === 'view' && !['reports_finance', 'finance_bank_letters'].includes(mod.id)
    }
  }
  return perms
}

/** Full access template for super admins / owner role. */
export function fullPermissions() {
  const perms = {}
  for (const mod of PERMISSION_CATALOG) {
    perms[mod.id] = {}
    for (const action of mod.actions) {
      perms[mod.id][action.id] = true
    }
  }
  return perms
}

export function normalizePermissions(raw) {
  const base = defaultPermissions()
  if (!raw || typeof raw !== 'object') return base
  for (const mod of PERMISSION_CATALOG) {
    const src = raw[mod.id]
    if (!src || typeof src !== 'object') continue
    for (const action of mod.actions) {
      if (typeof src[action.id] === 'boolean') {
        base[mod.id][action.id] = src[action.id]
      }
    }
  }
  return base
}

export function canPermission(permissions, moduleId, actionId, { isSuperAdmin = false } = {}) {
  if (isSuperAdmin) return true
  if (!permissions || !moduleId || !actionId) return false
  return !!permissions[moduleId]?.[actionId]
}

/** Nav item → permission module for view access. */
export const NAV_PERMISSION_MAP = {
  '/dashboard': 'dashboard',
  '/customers': 'customers',
  '/reps': 'employees',
  '/products': 'products',
  '/vendors': 'vendors',
  '/journals': 'journals',
  '/master-data/user-privileges': 'user_privileges',
  '/inventory/purchase': 'inventory_purchase',
  '/inventory/beginning-stock': 'inventory_beginning_stock',
  '/orders': 'orders',
  '/returns': 'returns',
  '/commission': 'commission',
  '/finance/journal-entry': 'finance_journal_entry',
  '/finance/rep-payments': 'finance_rep_payments',
  '/finance/receivables': 'finance_receivables',
  '/finance/payables': 'finance_payables',
  '/finance/banks': 'finance_banks',
  '/finance/cheques': 'finance_cheques',
  '/finance/bank-reconciliation': 'finance_bank_reconciliation',
  '/finance/bank-letters/salary-transfer': 'finance_bank_letters',
  '/finance/delete-receivable': 'finance_delete_receivable',
  '/finance/delete-payable': 'finance_delete_payable',
  '/backup': 'admin_backup',
  '/audit-log': 'admin_audit_log',
  '/sms-service': 'sms',
  '/reports/purchases': 'reports_purchase',
  '/reports/vendors': 'reports_vendors',
  '/reports/reps': 'reports_reps',
  '/reports/returns-delivery': 'reports_returns_delivery',
  '/reports/admin-system': 'reports_admin_system',
  '/reports/inventory/detailed': 'reports_inventory',
  '/reports/finance': 'reports_finance',
  '/reports/cheques': 'reports_cheques',
  '/reports/day-book': 'reports_day_book',
  '/reports/expenses': 'reports_expenses',
  '/reports/profit-loss': 'reports_profit_loss',
  '/reports/balance-sheet': 'reports_balance_sheet',
}

export function moduleForPath(pathname) {
  const path = pathname.split('?')[0]
  if (path.startsWith('/reports/vendors')) return 'reports_vendors'
  if (path.startsWith('/reports/reps')) return 'reports_reps'
  if (path.startsWith('/reports/returns-delivery')) return 'reports_returns_delivery'
  if (path.startsWith('/reports/admin-system')) return 'reports_admin_system'
  if (path.startsWith('/reports/purchases')) return 'reports_purchase'
  if (path.startsWith('/reports/inventory/detailed')) return 'reports_inventory'
  if (path.startsWith('/reports/finance')) return 'reports_finance'
  if (path.startsWith('/reports/cheques')) return 'reports_cheques'
  if (path.startsWith('/reports/day-book')) return 'reports_day_book'
  if (path.startsWith('/reports/expenses')) return 'reports_expenses'
  if (path.startsWith('/reports/profit-loss')) return 'reports_profit_loss'
  if (path.startsWith('/reports/balance-sheet')) return 'reports_balance_sheet'
  if (path.startsWith('/sms-service')) return 'sms'
  if (path.startsWith('/finance/receivables')) return 'finance_receivables'
  if (path.startsWith('/finance/payables')) return 'finance_payables'
  if (path.startsWith('/finance/')) {
    const hit = Object.entries(NAV_PERMISSION_MAP).find(([route]) => path.startsWith(route))
    return hit?.[1] ?? null
  }
  if (path.startsWith('/orders')) return 'orders'
  if (path.startsWith('/invoices')) return 'invoices'
  if (path.startsWith('/returns')) return 'returns'
  if (path.startsWith('/inventory/')) {
    const hit = Object.entries(NAV_PERMISSION_MAP).find(([route]) => path.startsWith(route))
    return hit?.[1] ?? null
  }
  const exact = NAV_PERMISSION_MAP[path]
  if (exact) return exact
  const prefix = Object.entries(NAV_PERMISSION_MAP)
    .filter(([route]) => route !== '/dashboard')
    .sort((a, b) => b[0].length - a[0].length)
    .find(([route]) => path.startsWith(route))
  return prefix?.[1] ?? null
}

export function catalogByGroup() {
  const groups = {}
  for (const mod of PERMISSION_CATALOG) {
    if (!groups[mod.group]) groups[mod.group] = []
    groups[mod.group].push(mod)
  }
  return groups
}

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
      perms[mod.id][action.id] = action.id === 'view'
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
  '/finance/delete-receivable': 'finance_delete_receivable',
  '/finance/delete-payable': 'finance_delete_payable',
  '/backup': 'admin_backup',
  '/audit-log': 'admin_audit_log',
  '/sms-service': 'sms',
}

export function moduleForPath(pathname) {
  const path = pathname.split('?')[0]
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

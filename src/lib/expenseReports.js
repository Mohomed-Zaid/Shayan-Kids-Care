const n = (value) => Number(value ?? 0) || 0
const id = (value) => String(value ?? '')
export const expenseDate = (value) => value ? String(value).slice(0, 10) : ''
const mapById = (rows = []) => new Map(rows.map((row) => [id(row.id), row]))
const label = (value) => String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || '-'
const inactive = new Set(['deleted', 'reversed', 'cancelled', 'canceled', 'void', 'inactive'])

export const EXPENSE_REPORTS = [
  ['summary', 'Expense Summary', 'A compact view of current expense exposure.'],
  ['detailed', 'Detailed Expense Report', 'Every active expense transaction.'],
  ['daily', 'Daily Expense Report', 'Expenses for the selected day or date range.'],
  ['monthly', 'Monthly Expense Report', 'Monthly expense activity and totals.'],
  ['category', 'Expense by Category', 'Expense totals grouped by category.'],
  ['payment-method', 'Expense by Payment Method', 'Cash, bank, cheque, card and other usage.'],
  ['user', 'Expense by User', 'Audit visibility into who recorded each expense.'],
  ['vs-sales', 'Expense vs Sales Summary', 'Expenses compared with net sales by period.'],
  ['vs-profit', 'Expense vs Profit Summary', 'Operating expenses and commission impact on profit.'],
].map(([key, title, description]) => ({ key, title, description }))

export const EXPENSE_COLUMNS = {
  detailed: [['expenseNumber', 'Expense Number'], ['date', 'Expense Date', 'date'], ['category', 'Category'], ['description', 'Description'], ['amount', 'Amount', 'money'], ['paymentMethod', 'Payment Method'], ['bank', 'Bank'], ['reference', 'Reference'], ['note', 'Note'], ['createdBy', 'Created By'], ['createdAt', 'Created Date / Time', 'datetime'], ['statusLabel', 'Status']],
  daily: [['date', 'Date', 'date'], ['expenseNumber', 'Expense No.'], ['category', 'Category'], ['description', 'Description'], ['amount', 'Amount', 'money'], ['paymentMethod', 'Payment Method'], ['bank', 'Bank'], ['reference', 'Reference'], ['createdBy', 'User']],
  monthly: [['date', 'Date', 'date'], ['category', 'Category'], ['description', 'Description'], ['amount', 'Amount', 'money'], ['paymentMethod', 'Payment Method'], ['createdBy', 'User']],
  category: [['category', 'Category'], ['count', 'Number of Transactions'], ['totalAmount', 'Total Amount', 'money'], ['averageAmount', 'Average Amount', 'money'], ['highestExpense', 'Highest Expense', 'money'], ['lastExpenseDate', 'Last Expense Date', 'date']],
  'payment-method': [['paymentMethod', 'Payment Method'], ['count', 'Transaction Count'], ['totalAmount', 'Total Amount', 'money'], ['percentage', 'Percentage of Total Expenses', 'percent']],
  user: [['createdBy', 'User'], ['role', 'Role'], ['count', 'Number of Expenses'], ['totalAmount', 'Total Expense Amount', 'money'], ['lastExpenseDate', 'Last Expense Date', 'date']],
  'vs-sales': [['period', 'Period'], ['sales', 'Sales', 'money'], ['expenses', 'Expenses', 'money'], ['expenseRatio', 'Expense as % of Sales', 'percent'], ['difference', 'Difference', 'money']],
  'vs-profit': [['section', 'Section'], ['description', 'Description'], ['amount', 'Amount', 'money']],
}

function usersByIdentity(raw) {
  const users = new Map()
  ;(raw.user_privileges ?? []).forEach((item) => {
    const value = { name: item.display_name ?? item.username ?? item.email ?? '-', role: item.user_type ?? (item.is_super_admin ? 'Super Admin' : 'User') }
    ;[item.id, item.email, item.username, item.display_name].filter(Boolean).forEach((key) => users.set(String(key).toLowerCase(), value))
  })
  return users
}

export function buildExpenseRows(raw) {
  const banks = mapById(raw.banks)
  const identities = usersByIdentity(raw)
  const explicit = (raw.expenses ?? []).filter((item) => !inactive.has(String(item.status ?? 'active').toLowerCase()))
  if (explicit.length > 0) return explicit.map((item) => {
    const identity = identities.get(String(item.created_by ?? '').toLowerCase())
    const bank = banks.get(id(item.bank_id)) ?? {}
    const status = String(item.status ?? 'active').toLowerCase()
    return {
      id: `expense-${item.id}`, source: 'expenses', sourceId: item.id,
      expenseNumber: item.expense_no ?? `EXP-${id(item.id).slice(0, 8).toUpperCase()}`,
      date: expenseDate(item.expense_date ?? item.created_at), category: item.category ?? 'Miscellaneous',
      description: item.description ?? '-', amount: n(item.amount), paymentMethod: label(item.payment_method ?? 'other'),
      bankId: item.bank_id ?? '', bank: bank.name ?? item.bank_name ?? '-', reference: item.reference ?? '-',
      note: item.note ?? '-', createdBy: identity?.name ?? item.created_by ?? '-', role: identity?.role ?? item.created_by_role ?? 'User',
      createdAt: item.created_at ?? item.expense_date ?? '', status, statusLabel: label(status), branch: item.branch ?? item.branch_name ?? '-',
    }
  })

  const journals = mapById(raw.journals)
  const entries = mapById(raw.journal_entries)
  const categories = mapById(raw.journal_categories)
  const expenseAccounts = new Set((raw.journals ?? []).filter((item) => String(item.account_type ?? '').toLowerCase().includes('expense')).map((item) => id(item.id)))
  return (raw.journal_entry_lines ?? []).filter((line) => {
    const status = String(line.status ?? 'active').toLowerCase()
    return expenseAccounts.has(id(line.journal_id)) && !inactive.has(status) && n(line.debit) - n(line.credit) > 0
  }).map((line) => {
    const entry = entries.get(id(line.entry_id)) ?? {}
    const account = journals.get(id(line.journal_id)) ?? {}
    const identity = identities.get(String(entry.created_by ?? line.created_by ?? '').toLowerCase())
    const status = String(line.status ?? entry.status ?? 'active').toLowerCase()
    return {
      id: `journal-expense-${line.id}`, source: 'journal', sourceId: line.id,
      expenseNumber: entry.entry_number ?? `JE-${id(entry.id ?? line.entry_id).slice(0, 8).toUpperCase()}`,
      date: expenseDate(entry.date ?? entry.created_at ?? line.created_at),
      category: categories.get(id(account.category_id))?.name ?? account.category ?? account.description ?? account.name ?? 'Operating Expense',
      description: line.description ?? entry.description ?? account.description ?? 'Journal Expense',
      amount: n(line.debit) - n(line.credit), paymentMethod: label(line.payment_method ?? entry.payment_method ?? 'other'),
      bankId: line.bank_id ?? entry.bank_id ?? '', bank: banks.get(id(line.bank_id ?? entry.bank_id))?.name ?? line.bank_name ?? entry.bank_name ?? account.bank_name ?? '-',
      reference: line.reference ?? entry.reference ?? entry.entry_number ?? '-', note: line.note ?? entry.note ?? '-',
      createdBy: identity?.name ?? entry.created_by ?? line.created_by ?? '-', role: identity?.role ?? 'User',
      createdAt: entry.created_at ?? line.created_at ?? entry.date ?? '', status, statusLabel: label(status), branch: entry.branch ?? '-',
    }
  })
}

export function groupExpenses(rows, field) {
  const groups = new Map()
  rows.forEach((item) => {
    const value = item[field] || (field === 'category' ? 'Miscellaneous' : 'Other')
    if (!groups.has(value)) groups.set(value, [])
    groups.get(value).push(item)
  })
  const grandTotal = rows.reduce((sum, item) => sum + n(item.amount), 0)
  return [...groups.entries()].map(([value, items]) => {
    const totalAmount = items.reduce((sum, item) => sum + n(item.amount), 0)
    const latest = [...items].sort((a, b) => b.date.localeCompare(a.date))[0]
    return {
      id: value, [field]: value, category: field === 'category' ? value : undefined, paymentMethod: field === 'paymentMethod' ? value : undefined, createdBy: field === 'createdBy' ? value : undefined,
      role: latest?.role ?? 'User', count: items.length, totalAmount, averageAmount: items.length ? totalAmount / items.length : 0,
      highestExpense: Math.max(0, ...items.map((item) => n(item.amount))), lastExpenseDate: latest?.date ?? '',
      percentage: grandTotal ? totalAmount / grandTotal * 100 : 0,
    }
  }).sort((a, b) => b.totalAmount - a.totalAmount)
}

export function expenseSummary(rows, now = new Date()) {
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
  const total = rows.reduce((sum, item) => sum + n(item.amount), 0)
  const thisMonthTotal = rows.filter((item) => item.date.startsWith(thisMonth)).reduce((sum, item) => sum + item.amount, 0)
  const lastMonthTotal = rows.filter((item) => item.date.startsWith(lastMonth)).reduce((sum, item) => sum + item.amount, 0)
  const categories = groupExpenses(rows, 'category')
  return {
    total, count: rows.length, average: rows.length ? total / rows.length : 0,
    highest: Math.max(0, ...rows.map((item) => item.amount)), lowest: rows.length ? Math.min(...rows.map((item) => item.amount)) : 0,
    thisMonth: thisMonthTotal, lastMonth: lastMonthTotal, difference: thisMonthTotal - lastMonthTotal,
    highestCategory: categories[0]?.category ?? '-', cash: rows.filter((item) => String(item.paymentMethod ?? '').toLowerCase() === 'cash').reduce((sum, item) => sum + item.amount, 0),
    bank: rows.filter((item) => String(item.paymentMethod ?? '').toLowerCase() === 'bank').reduce((sum, item) => sum + item.amount, 0),
  }
}

export function filterExpenses(rows, filters) {
  const query = String(filters.search ?? '').trim().toLowerCase()
  return rows.filter((item) => {
    const amount = n(item.amount)
    return (!filters.from || item.date >= filters.from) && (!filters.to || item.date <= filters.to) &&
      (!filters.category || item.category === filters.category) &&
      (!filters.paymentMethod || String(item.paymentMethod ?? '').toLowerCase() === filters.paymentMethod.toLowerCase()) &&
      (!filters.bankId || id(item.bankId) === id(filters.bankId)) &&
      (!filters.createdBy || item.createdBy === filters.createdBy) &&
      (!filters.reference || item.reference.toLowerCase().includes(filters.reference.toLowerCase())) &&
      (filters.minAmount === '' || amount >= n(filters.minAmount)) && (filters.maxAmount === '' || amount <= n(filters.maxAmount)) &&
      (!query || Object.values(item).some((value) => String(value ?? '').toLowerCase().includes(query)))
  })
}

export function monthlyExpenses(rows) {
  const groups = new Map()
  rows.forEach((item) => {
    const month = item.date.slice(0, 7)
    if (!groups.has(month)) groups.set(month, [])
    groups.get(month).push(item)
  })
  return [...groups.entries()].map(([month, items]) => {
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)
    return { id: month, month, date: `${month}-01`, count: items.length, totalAmount, averageAmount: items.length ? totalAmount / items.length : 0 }
  }).sort((a, b) => b.month.localeCompare(a.month))
}

function mondayKey(value) {
  const date = new Date(`${expenseDate(value)}T00:00:00`)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const periodKey = (date, grouping) => grouping === 'month' ? date.slice(0, 7) : grouping === 'week' ? mondayKey(date) : date
export function expenseVsSales(expenses, raw, grouping = 'month') {
  const periods = new Map()
  const ensure = (period) => {
    if (!periods.has(period)) periods.set(period, { id: period, period, sales: 0, expenses: 0 })
    return periods.get(period)
  }
  expenses.forEach((item) => ensure(periodKey(item.date, grouping)).expenses += n(item.amount))
  ;(raw.invoices ?? []).forEach((invoice) => {
    const date = expenseDate(invoice.created_at)
    if (date) ensure(periodKey(date, grouping)).sales += n(invoice.total_amount)
  })
  ;(raw.returns ?? []).forEach((item) => {
    const date = expenseDate(item.created_at)
    if (date) ensure(periodKey(date, grouping)).sales -= n(item.total_amount)
  })
  return [...periods.values()].map((item) => ({ ...item, expenseRatio: item.sales ? item.expenses / item.sales * 100 : 0, difference: item.sales - item.expenses })).sort((a, b) => b.period.localeCompare(a.period))
}

export function operatingExpenseTotal(raw, { excludeCommission = false } = {}) {
  return buildExpenseRows(raw)
    .filter((item) => !excludeCommission || !/commission/i.test(`${item.category} ${item.description}`))
    .reduce((sum, item) => sum + n(item.amount), 0)
}

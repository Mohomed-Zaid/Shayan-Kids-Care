import test from 'node:test'
import assert from 'node:assert/strict'
import { buildExpenseRows, expenseSummary, expenseVsSales, operatingExpenseTotal } from '../src/lib/expenseReports.js'
import { buildFinanceReports } from '../src/lib/financeReports.js'

test('explicit expense records are authoritative and reversed records are excluded', () => {
  const raw = {
    expenses: [
      { id: 'e1', expense_no: 'EXP-1', expense_date: '2026-08-01', category: 'Rent', amount: 1000, payment_method: 'bank', bank_id: 'b1', created_by: 'owner@test.com', status: 'active' },
      { id: 'e2', expense_no: 'EXP-2', expense_date: '2026-08-02', category: 'Fuel', amount: 200, status: 'reversed' },
    ],
    banks: [{ id: 'b1', name: 'Main Bank' }],
    user_privileges: [{ email: 'owner@test.com', display_name: 'Owner', user_type: 'Owner' }],
    journals: [{ id: 'j1', account_type: 'EXPENSES', description: 'Legacy Expense' }],
    journal_entries: [{ id: 'je1', date: '2026-08-01' }],
    journal_entry_lines: [{ id: 'jl1', entry_id: 'je1', journal_id: 'j1', debit: 999 }],
  }
  const rows = buildExpenseRows(raw)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].expenseNumber, 'EXP-1')
  assert.equal(rows[0].bank, 'Main Bank')
  assert.equal(rows[0].createdBy, 'Owner')
})

test('expense journal debits are used when Expense Management has no records', () => {
  const raw = {
    expenses: [],
    journals: [{ id: 'j1', account_type: 'EXPENSES', description: 'Office Expenses' }, { id: 'j2', account_type: 'ASSET', description: 'Cash' }],
    journal_entries: [{ id: 'je1', date: '2026-08-03', created_at: '2026-08-03T09:00:00' }],
    journal_entry_lines: [
      { id: 'jl1', entry_id: 'je1', journal_id: 'j1', description: 'Printer paper', debit: 300, credit: 0 },
      { id: 'jl2', entry_id: 'je1', journal_id: 'j2', debit: 0, credit: 300 },
    ],
  }
  const rows = buildExpenseRows(raw)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].category, 'Office Expenses')
  assert.equal(rows[0].amount, 300)
})

test('commission categories are excluded when commission is calculated separately', () => {
  const raw = {
    expenses: [
      { id: 'e1', category: 'Rent', description: 'Monthly rent', amount: 1000, expense_date: '2026-08-01', status: 'active' },
      { id: 'e2', category: 'Rep Commission', description: 'Commission expense', amount: 150, expense_date: '2026-08-01', status: 'active' },
    ],
  }
  assert.equal(operatingExpenseTotal(raw), 1150)
  assert.equal(operatingExpenseTotal(raw, { excludeCommission: true }), 1000)
})

test('Finance Profit and Loss uses the shared operating expense total', () => {
  const raw = {
    expenses: [{ id: 'e1', category: 'Rent', amount: 1000, expense_date: '2026-08-01', status: 'active' }],
    invoices: [{ id: 'i1', rep_id: null, total_amount: 5000, created_at: '2026-08-01' }],
    invoice_items: [{ id: 'ii1', invoice_id: 'i1', quantity: 1, cost_price: 2000 }],
    returns: [], employees: [], rep_commission_payments: [],
  }
  const profit = buildFinanceReports(raw)['profit-loss']
  assert.equal(profit.find((item) => item.description === 'Operating Expenses').amount, -1000)
  assert.equal(profit.find((item) => item.description === 'Net Profit').amount, 2000)
})

test('expense versus sales uses net sales after returns', () => {
  const expenses = [{ id: 'e1', date: '2026-08-01', amount: 100 }]
  const rows = expenseVsSales(expenses, { invoices: [{ total_amount: 1000, created_at: '2026-08-01' }], returns: [{ total_amount: 200, created_at: '2026-08-01' }] }, 'day')
  assert.equal(rows[0].sales, 800)
  assert.equal(rows[0].expenseRatio, 12.5)
  assert.equal(expenseSummary(expenses, new Date('2026-08-15')).total, 100)
})

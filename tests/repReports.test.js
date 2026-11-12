import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRepMonthlyPaymentStatus, buildRepReportModel } from '../src/lib/repReports.js'

test('monthly rep payment status lists all reps and distinguishes Paid, Partial, Unpaid, Advance Available, and No Commission', () => {
  const raw = {
    employees: [
      { id: 'r1', name: 'Mohamed Munzir', is_rep: true },
      { id: 'r2', name: 'Nusky Ahmed', is_rep: true },
      { id: 'r3', name: 'Amal Silva', is_rep: true },
      { id: 'r4', name: 'Kamal Perera', is_rep: true },
      { id: 'r5', name: 'Inactive Staff', is_rep: false },
    ],
    customers: [{ id: 'c1', name: 'Test Store' }],
    products: [{ id: 'p1', name: 'Toy A', code: 'T1' }],
    invoices: [
      { id: 'i1', rep_id: 'r1', customer_id: 'c1', created_at: '2026-11-05', total_amount: 10000 }, // Munzir 2.5% = 250
      { id: 'i2', rep_id: 'r2', customer_id: 'c1', created_at: '2026-11-06', total_amount: 20000 }, // Nusky 1% = 200
      { id: 'i3', rep_id: 'r3', customer_id: 'c1', created_at: '2026-11-07', total_amount: 10000 }, // Amal 1% = 100
    ],
    invoice_items: [],
    invoice_payments: [],
    orders: [],
    order_items: [],
    returns: [],
    rep_commission_payments: [
      { id: 'pay1', rep_id: 'r1', period_year: 2026, period_month: 10, amount: 250, advance_amount: 0, paid_at: '2026-11-10', method: 'cash' }, // Paid full 250
      { id: 'pay2', rep_id: 'r3', period_year: 2026, period_month: 10, amount: 40, advance_amount: 0, paid_at: '2026-11-11', method: 'bank' },  // Partial 40 of 100
    ],
  }

  const model = buildRepReportModel(raw)
  const rows = buildRepMonthlyPaymentStatus(model, 2026, 10) // November 2026 (0-indexed month = 10)

  assert.equal(rows.length, 4) // All 4 reps, excluding non-rep r5

  const munzir = rows.find((r) => r.repId === 'r1')
  assert.equal(munzir.status, 'Paid')
  assert.equal(munzir.paidThisMonth, 'Paid')
  assert.equal(munzir.remainingDue, 0)
  assert.equal(munzir.paymentMethod, 'cash')

  const nusky = rows.find((r) => r.repId === 'r2')
  assert.equal(nusky.status, 'Unpaid')
  assert.equal(nusky.paidThisMonth, 'Unpaid')
  assert.equal(nusky.commissionEarned, 200)
  assert.equal(nusky.remainingDue, 200)

  const amal = rows.find((r) => r.repId === 'r3')
  assert.equal(amal.status, 'Partial')
  assert.equal(amal.paidThisMonth, 'Partial')
  assert.equal(amal.amountPaid, 40)
  assert.equal(amal.remainingDue, 60)

  const kamal = rows.find((r) => r.repId === 'r4')
  assert.equal(kamal.status, 'No Commission')
  assert.equal(kamal.paidThisMonth, 'No Commission')
  assert.equal(kamal.commissionEarned, 0)
  assert.equal(kamal.remainingDue, 0)

  const yearRows = buildRepMonthlyPaymentStatus(model, 2026, 'all', new Date('2026-11-12T12:00:00'))
  assert.equal(yearRows.length, 44) // 4 reps * 11 months (Jan..Nov)
  const munzirNov = yearRows.find((r) => r.repId === 'r1' && r.monthIndex === 10)
  assert.equal(munzirNov.monthName, 'November')
  assert.equal(munzirNov.status, 'Paid')
  const munzirJan = yearRows.find((r) => r.repId === 'r1' && r.monthIndex === 0)
  assert.equal(munzirJan.monthName, 'January')
  assert.equal(munzirJan.status, 'No Commission')
  const nuskyNov = yearRows.find((r) => r.repId === 'r2' && r.monthIndex === 10)
  assert.equal(nuskyNov.status, 'Unpaid')
  const amalNov = yearRows.find((r) => r.repId === 'r3' && r.monthIndex === 10)
  assert.equal(amalNov.status, 'Partial')
  const kamalNov = yearRows.find((r) => r.repId === 'r4' && r.monthIndex === 10)
  assert.equal(kamalNov.status, 'No Commission')
})

test('monthly commission report labels advance-covered months as Paid (Advance) and minuses applied advance from advance balance', () => {
  const raw = {
    employees: [{ id: 'r1', name: 'Mohamed Munzir', is_rep: true, advance_balance: 414.25 }],
    customers: [{ id: 'c1', name: 'Test Store' }],
    products: [{ id: 'p1', name: 'Toy A', code: 'T1' }],
    invoices: [
      { id: 'i1', rep_id: 'r1', customer_id: 'c1', created_at: '2026-05-10', total_amount: 81190 },  // 2.5% = 2029.75
      { id: 'i2', rep_id: 'r1', customer_id: 'c1', created_at: '2026-06-10', total_amount: 25880 },  // 2.5% = 647.00
      { id: 'i3', rep_id: 'r1', customer_id: 'c1', created_at: '2026-08-10', total_amount: 15620 },  // 2.5% = 390.50
    ],
    invoice_items: [],
    invoice_payments: [],
    orders: [],
    order_items: [],
    returns: [],
    rep_commission_payments: [
      { id: 'p1', rep_id: 'r1', period_year: 2026, period_month: 4, amount: 2050, advance_amount: 20.25, paid_at: '2026-05-31' }, // May +20.25 advance
      { id: 'p2', rep_id: 'r1', period_year: 2026, period_month: 5, amount: 1050, advance_amount: 43.50, paid_at: '2026-06-30' }, // June +423.25 advance
    ],
  }

  const model = buildRepReportModel(raw)
  const may = model.periodRows.find((r) => r.period === '2026-05')
  const june = model.periodRows.find((r) => r.period === '2026-06')
  const aug = model.periodRows.find((r) => r.period === '2026-08')

  assert.equal(may.status, 'Paid (Advance)')
  assert.equal(may.remainingDue, 0)
  assert.equal(june.status, 'Paid (Advance)')
  assert.equal(june.remainingDue, 0)
  assert.equal(aug.status, 'Paid (Advance)')
  assert.equal(aug.advanceApplied, 390.50)
  assert.equal(aug.remainingDue, 0)

  // Live advance balance minuses the 390.50 applied in August (423.25 - 390.50 = 32.75)
  const adv = model.advanceRows.find((r) => r.repId === 'r1')
  assert.equal(Math.round(adv.currentAdvanceBalance * 100) / 100, 32.75)
})


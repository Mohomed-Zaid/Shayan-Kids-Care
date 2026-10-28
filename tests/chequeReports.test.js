import test from 'node:test'
import assert from 'node:assert/strict'
import { bankWiseRows, buildChequeRegister, calendarDays, dueSection, rowsForReport } from '../src/lib/chequeReports.js'
import { buildFinanceReports, formatReconReference, reportSummary } from '../src/lib/financeReports.js'

const raw = {
  customers: [{ id: 'c1', name: 'Ayesha Stores' }],
  vendors: [{ id: 'v1', name: 'Toy Supplier' }],
  invoices: [{ id: 'i1', customer_id: 'c1', invoice_number: 'INV-1', total_amount: 1000 }],
  purchases: [{ id: 'p1', vendor_id: 'v1', ref_no: 'PUR-1' }],
  invoice_payments: [{ id: 'ip1', invoice_id: 'i1', method: 'cheque', reference: '111111-2222-333', paid_at: '2026-08-20', amount: 400 }],
  purchase_payments: [{ id: 'pp1', purchase_id: 'p1', method: 'cheque', reference: '999999-8888-777', paid_at: '2026-08-21', amount: 250, bank_name: 'Vendor Bank' }],
  customer_cheques: [{ id: 'ch1', customer_id: 'c1', cheque_number: '111111-2222-333', cheque_date: '2026-08-27', amount: 400, bank_name: 'Origin Bank', status: 'deposited', deposited_at: '2026-08-25' }],
  banks: [{ id: 'b1', name: 'Business Bank' }],
  bank_reconciliation_items: [{ id: 'r1', bank_id: 'b1', ref_no: 'RCV-CHQ-ch1', cheque_number: '111111-2222-333', trx_date: '2026-08-25', amount: 400, reconciled: true }],
  returns: [],
}

test('calendar due buckets use dates dynamically', () => {
  const today = new Date('2026-08-27T12:00:00')
  assert.equal(calendarDays('2026-08-27', today), 0)
  assert.equal(calendarDays('2026-08-28', today), 1)
  assert.equal(dueSection(-1), 'Overdue')
  assert.equal(dueSection(7), 'Due Within 7 Days')
  assert.equal(dueSection(30), 'Due Within 30 Days')
})

test('customer deposits use the matching reconciliation bank and flag', () => {
  const rows = buildChequeRegister(raw, new Date('2026-08-27T12:00:00'))
  const customer = rows.find((row) => row.type === 'Customer')
  assert.equal(customer.documentNumber, 'INV-1')
  assert.equal(customer.depositBank, 'Business Bank')
  assert.equal(customer.reconciledLabel, 'Yes')
  assert.equal(rowsForReport(rows, 'deposited').length, 1)
})

test('returned cheques are excluded from successful payments in outstanding exposure', () => {
  const returnedRaw = { ...raw, customer_cheques: [{ ...raw.customer_cheques[0], status: 'returned', returned_at: '2026-08-26' }] }
  const row = buildChequeRegister(returnedRaw, new Date('2026-08-27T12:00:00')).find((item) => item.type === 'Customer')
  assert.equal(row.outstandingAfterReturn, 1000)
  assert.equal(rowsForReport([row], 'returned').length, 1)
})

test('bank-wise report groups live statuses and amounts', () => {
  const rows = buildChequeRegister(raw, new Date('2026-08-27T12:00:00'))
  const grouped = bankWiseRows(rows)
  assert.equal(grouped.find((row) => row.bankName === 'Origin Bank').deposited, 1)
  assert.equal(grouped.reduce((sum, row) => sum + row.totalAmount, 0), 650)
})

test('bank reconciliation report includes all bank transfers and cheques mapped to their relevant banks', () => {
  const multiBankRaw = {
    ...raw,
    banks: [
      { id: 'b1', code: '001', name: 'DFCC Bank', bank_code: '7454' },
      { id: 'b2', code: '002', name: 'Commercial Bank', bank_code: '7056' },
    ],
    invoice_payments: [
      ...raw.invoice_payments,
      { id: 'ip2', invoice_id: 'i1', method: 'bank', bank_name: '002 - Commercial Bank', reference: 'TRF-IN-100', paid_at: '2026-08-26', amount: 600 },
    ],
    purchase_payments: [
      { id: 'pp1', purchase_id: 'p1', method: 'cheque', reference: '999999-7056-777', paid_at: '2026-08-21', amount: 250, bank_name: 'Commercial Bank' },
      { id: 'pp2', purchase_id: 'p1', method: 'bank', reference: 'TRF-OUT-200', paid_at: '2026-08-22', amount: 300, bank_name: '001 - DFCC Bank' },
    ],
  }
  const reports = buildFinanceReports(multiBankRaw)
  const reconRows = reports['bank-reconciliation']
  assert.equal(reconRows.length, 4)

  const rcvTrf = reconRows.find((r) => r.reference === 'RCV-TRF-ip2')
  assert.equal(rcvTrf.bank, 'Commercial Bank')
  assert.equal(rcvTrf.transactionType, 'Customer Bank Transfer')
  assert.equal(rcvTrf.deposit, 600)
  assert.equal(rcvTrf.withdrawal, 0)

  const payTrf = reconRows.find((r) => r.reference === 'PAY-TRF-pp2')
  assert.equal(payTrf.bank, 'DFCC Bank')
  assert.equal(payTrf.transactionType, 'Vendor Bank Transfer')
  assert.equal(payTrf.deposit, 0)
  assert.equal(payTrf.withdrawal, 300)

  const payChq = reconRows.find((r) => r.reference === 'PAY-CHQ-pp1')
  assert.equal(payChq.bank, 'Commercial Bank')
  assert.equal(payChq.transactionType, 'Vendor Cheque Payment')
  assert.equal(payChq.withdrawal, 250)

  const summary = Object.fromEntries(reportSummary('bank-reconciliation', reconRows))
  assert.equal(summary['Total Lines'], 4)
  assert.equal(summary['Money In (Deposits)'], 1000)
  assert.equal(summary['Money Out (Payments)'], 550)
  assert.equal(summary['Reconciled Amount'], 400)
  assert.equal(summary['Unreconciled Amount'], 1150)
})

test('bank reconciliation deduplicates duplicate ref_no entries, cleans PUR-PUR prefixes, and shortens UUID references', () => {
  const dupRaw = {
    ...raw,
    banks: [
      { id: 'b1', code: '001', name: 'DFCC Bank', bank_code: '7454' },
      { id: 'b2', code: '002', name: 'Amana Bank PLC', bank_code: '7463' },
    ],
    customer_cheques: [
      { id: '9684e01d-d79e-4c14-8597-4485472dcbf1', customer_id: 'c1', cheque_number: '000625-7463-011', cheque_date: '2026-09-30', amount: 95970, bank_name: 'Amana Bank PLC', deposit_bank_id: 'b1', status: 'deposited', deposited_at: '2026-09-30' },
    ],
    bank_reconciliation_items: [
      { id: 'dup1', bank_id: 'b2', ref_no: 'RCV-CHQ-9684e01d-d79e-4c14-8597-4485472dcbf1', cheque_number: '000625-7463-011', trx_date: '2026-09-30', description: 'Receivable cheque deposit - MUM & ME', amount: 95970, reconciled: false },
      { id: 'dup2', bank_id: 'b1', ref_no: 'RCV-CHQ-9684e01d-d79e-4c14-8597-4485472dcbf1', cheque_number: '000625-7463-011', trx_date: '2026-09-30', description: 'Receivable cheque deposit - MUM & ME', amount: 95970, reconciled: true },
      { id: 'dup3', bank_id: 'b2', ref_no: 'PAY-TRF-5cbaa543-c5c6-4f98-abb4-6b794f83f4f1', trx_date: '2026-05-04', description: 'Vendor Bank Transfer - CEYLON EXIM (PUR-PUR-0012)', amount: 45398.75, reconciled: false },
      { id: 'dup4', bank_id: 'b2', ref_no: 'PAY-TRF-5cbaa543-c5c6-4f98-abb4-6b794f83f4f1', trx_date: '2026-05-04', description: 'Vendor Bank Transfer - CEYLON EXIM (PUR-PUR-0012)', amount: 45398.75, reconciled: false },
      { id: 'dup5', bank_id: 'b2', ref_no: 'PAY-TRF-5cbaa543-c5c6-4f98-abb4-6b794f83f4f1', trx_date: '2026-05-04', description: 'Vendor Bank Transfer - CEYLON EXIM (PUR-PUR-0012)', amount: 45398.75, reconciled: false },
    ],
  }
  const reconRows = buildFinanceReports(dupRaw)['bank-reconciliation']
  const chqMatches = reconRows.filter((r) => r.reference === 'RCV-CHQ-9684e01d-d79e-4c14-8597-4485472dcbf1')
  assert.equal(chqMatches.length, 1)
  assert.equal(chqMatches[0].bank, 'DFCC Bank')
  assert.equal(chqMatches[0].reconciled, 'Yes')
  assert.equal(chqMatches[0].displayReference, 'RCV-CHQ-9684E01D')

  const trfMatches = reconRows.filter((r) => r.reference === 'PAY-TRF-5cbaa543-c5c6-4f98-abb4-6b794f83f4f1')
  assert.equal(trfMatches.length, 1)
  assert.equal(trfMatches[0].description, 'Vendor Bank Transfer - CEYLON EXIM (PUR-0012)')
  assert.equal(formatReconReference('PAY-CHQ-a029156a-d9ff-4eb9-85ad-5ed54ccf9b17'), 'PAY-CHQ-A029156A')
})

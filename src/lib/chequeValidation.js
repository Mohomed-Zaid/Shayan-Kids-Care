/** Sri Lankan cheque number format: XXXXXX-XXXX-XXX (13 digits, dashes auto-inserted). */

export const APPROVED_BANK_CODES = {
  '7852': 'Alliance Finance Company PLC',
  '7463': 'Amana Bank PLC',
  '7472': 'Axis Bank',
  '7010': 'Bank of Ceylon',
  '7481': 'Cargills Bank Limited',
  '8004': 'Central Bank of Sri Lanka',
  '7825': 'Central Finance PLC',
  '7047': 'Citi Bank',
  '7746': 'Citizen Development Business Finance PLC',
  '7056': 'Commercial Bank PLC',
  '7870': 'Commercial Credit & Finance PLC',
  '7807': 'Commercial Leasing and Finance',
  '7205': 'Deutsche Bank',
  '7454': 'DFCC Bank PLC',
  '7074': 'Habib Bank Ltd',
  '7083': 'Hatton National Bank PLC',
  '7737': 'HDFC Bank',
  '7092': 'Hongkong Shanghai Bank',
  '7384': 'ICICI Bank Ltd',
  '7108': 'Indian Bank',
  '7117': 'Indian Overseas Bank',
  '7834': 'Kanrich Finance Limited',
  '7861': 'Lanka Orix Finance PLC',
  '7773': 'LB Finance PLC',
  '7269': 'MCB Bank Ltd',
  '7913': 'Mercantile Investment and Finance PLC',
  '7898': 'Merchant Bank of Sri Lanka & Finance PLC',
  '7214': 'National Development Bank PLC',
  '7719': 'National Savings Bank',
  '7162': 'Nations Trust Bank PLC',
  '7311': 'Pan Asia Banking Corporation PLC',
  '7135': 'Peoples Bank',
  '7922': "People's Leasing & Finance PLC",
  '7296': 'Public Bank',
  '7755': 'Regional Development Bank',
  '7278': 'Sampath Bank PLC',
  '7728': 'Sanasa Development Bank',
  '7782': 'Senkadagala Finance PLC',
  '7287': 'Seylan Bank PLC',
  '7038': 'Standard Chartered Bank',
  '7144': 'State Bank of India',
  '7764': 'State Mortgage & Investment Bank',
  '7302': 'Union Bank of Colombo PLC',
  '7816': 'Vallibel Finance PLC',
}

const CHEQUE_FORMAT_RE = /^\d{6}-\d{4}-\d{3}$/

export function isChequeFormatValid(val) {
  return CHEQUE_FORMAT_RE.test(String(val || ''))
}

export function extractBankCodeFromCheque(val) {
  if (!val) return ''
  const parts = String(val).split('-')
  if (parts.length !== 3) return ''
  return parts[1]
}

export function getApprovedBankName(code) {
  if (!code) return ''
  return APPROVED_BANK_CODES[String(code)] ?? ''
}

export function isApprovedBankCode(code) {
  return !!code && Object.prototype.hasOwnProperty.call(APPROVED_BANK_CODES, String(code))
}

/** Strip non-digits, cap at 13, and insert dashes for display. */
export function parseChequeNumberInput(rawValue) {
  const digits = String(rawValue || '')
    .replace(/[^0-9]/g, '')
    .slice(0, 13)

  let formatted = digits
  if (digits.length > 10) {
    formatted = `${digits.slice(0, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`
  } else if (digits.length > 6) {
    formatted = `${digits.slice(0, 6)}-${digits.slice(6)}`
  }

  const bankCode = digits.length >= 10 ? digits.slice(6, 10) : ''
  const bankName = bankCode ? getApprovedBankName(bankCode) : ''

  return { formatted, digits, bankCode, bankName }
}

/**
 * UI validation state for cheque number input (border, inline messages).
 */
export function getChequeNumberValidation(chequeNumber) {
  const str = String(chequeNumber || '')
  const digits = str.replace(/[^0-9]/g, '')
  const complete = isChequeFormatValid(str)
  const bankCode = digits.length >= 10 ? digits.slice(6, 10) : ''

  let borderClass = 'border-slate-300 dark:border-slate-600'
  let formatMessage = null
  let bankFeedback = null

  if (digits.length > 0 && !complete) {
    formatMessage = 'Format: XXXXXX-XXXX-XXX (13 digits)'
  }

  if (bankCode.length === 4) {
    const name = getApprovedBankName(bankCode)
    if (name) {
      bankFeedback = { type: 'success', text: `✓ ${name}` }
      borderClass = 'border-emerald-500 dark:border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/30'
    } else {
      bankFeedback = { type: 'error', text: '❌ Invalid Bank Code' }
      borderClass = 'border-red-500 dark:border-red-500 focus:border-red-500 focus:ring-red-500/30'
    }
  } else if (complete) {
    bankFeedback = { type: 'error', text: '❌ Invalid Bank Code' }
    borderClass = 'border-red-500 dark:border-red-500 focus:border-red-500 focus:ring-red-500/30'
  }

  const isValid = complete && isApprovedBankCode(bankCode)

  return {
    complete,
    isValid,
    bankCode,
    bankName: getApprovedBankName(bankCode),
    borderClass,
    formatMessage,
    bankFeedback,
  }
}

export function isChequePaymentRowValid(row) {
  if (!row?.cheque_date) return false
  if (!isChequeFormatValid(row.cheque_number)) return false
  const code = extractBankCodeFromCheque(row.cheque_number)
  if (!isApprovedBankCode(code)) return false
  const amount = Number(String(row.amount || '').replace(/,/g, ''))
  return amount > 0
}

export function areChequeRowsValid(rows) {
  if (!rows?.length) return false
  return rows.every(isChequePaymentRowValid)
}

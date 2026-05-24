import React, { useMemo } from 'react'
import { getChequeNumberValidation, parseChequeNumberInput } from '../lib/chequeValidation'

const BASE_INPUT =
  'w-full px-3 py-2.5 rounded-lg border bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2'

/**
 * Auto-formatted cheque number input (XXXXXX-XXXX-XXX) with inline validation.
 * onChange receives { cheque_number, bank_code, bank_name }.
 */
export default function ChequeNumberField({ value, onChange, label = 'Cheque Number', className = '' }) {
  const validation = useMemo(() => getChequeNumberValidation(value), [value])

  const handleChange = (e) => {
    const { formatted, bankCode, bankName } = parseChequeNumberInput(e.target.value)
    onChange({ cheque_number: formatted, bank_code: bankCode, bank_name: bankName })
  }

  return (
    <div className={className}>
      {label ? (
        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      ) : null}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={handleChange}
        placeholder="XXXXXX-XXXX-XXX"
        className={`${BASE_INPUT} ${validation.borderClass}`}
        aria-invalid={validation.bankFeedback?.type === 'error' || (validation.formatMessage && !validation.complete)}
      />
      {validation.formatMessage && !validation.complete ? (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{validation.formatMessage}</p>
      ) : null}
      {validation.bankFeedback ? (
        <p
          className={`mt-1 text-[11px] font-semibold ${
            validation.bankFeedback.type === 'success'
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {validation.bankFeedback.text}
        </p>
      ) : null}
    </div>
  )
}

/** Read-only bank name panel synced from cheque number (receivable forms). */
export function ChequeBankNameDisplay({ chequeNumber, bankCode, bankName }) {
  const validation = useMemo(() => getChequeNumberValidation(chequeNumber), [chequeNumber])
  const code = bankCode || validation.bankCode

  return (
    <div className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-sm text-slate-700 dark:text-slate-300 min-h-[42px] flex items-center">
      {validation.bankFeedback ? (
        <span
          className={`font-semibold ${
            validation.bankFeedback.type === 'success'
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {validation.bankFeedback.text}
        </span>
      ) : code ? (
        <span className="font-semibold">{bankName || validation.bankName || '—'}</span>
      ) : (
        <span className="text-slate-400 dark:text-slate-500">Auto-filled when bank code is entered</span>
      )}
    </div>
  )
}

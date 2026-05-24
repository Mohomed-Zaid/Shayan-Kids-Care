import React from 'react'
import { COMPANY_PHONES } from '../lib/companyContact'

/**
 * Renders all company phone lines.
 * @param {boolean} [compact] — smaller text for thermal receipts (80mm)
 */
export default function CompanyPhoneLines({ className = '', compact = false }) {
  if (compact) {
    return (
      <>
        {COMPANY_PHONES.map((num) => (
          <div key={num} className={`text-[10px] font-semibold ${className}`.trim()}>
            {num}
          </div>
        ))}
      </>
    )
  }

  return (
    <div className={className}>
      {COMPANY_PHONES.map((num) => (
        <div key={num}>{num}</div>
      ))}
    </div>
  )
}

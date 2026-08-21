import React from 'react'

export default function PaidStamp({ ariaLabel = 'Paid' }) {
  return (
    <div data-payment-status className="receipt-status-wrap">
      <div className="paid-stamp" aria-label={ariaLabel}>
        <span>PAID</span>
      </div>
    </div>
  )
}

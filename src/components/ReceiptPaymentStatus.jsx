import React from 'react'

const fmt = (value) => 'Rs. ' + Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export default function ReceiptPaymentStatus({ remainingBalance }) {
  const balance = Number(remainingBalance || 0)

  if (balance <= 0) {
    return (
      <div data-payment-status className="receipt-status-wrap">
        <div className="paid-stamp" aria-label="Paid in full">
          <span>PAID</span>
        </div>
      </div>
    )
  }

  return (
    <div data-payment-status className="receipt-status-wrap receipt-partial-wrap">
      <div className="partial-payment-stamp">PARTIAL PAYMENT</div>
      <div className="partial-payment-balance">Balance Due: {fmt(balance)}</div>
    </div>
  )
}

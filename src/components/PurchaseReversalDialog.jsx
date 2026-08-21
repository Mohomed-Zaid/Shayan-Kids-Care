import React, { useEffect, useState } from 'react'
import { AlertTriangle, RotateCcw, X } from 'lucide-react'

export default function PurchaseReversalDialog({ purchase, busy = false, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  useEffect(() => setReason(''), [purchase?.id])
  if (!purchase) return null

  const label = purchase.ref_no || `PUR-${String(purchase.id).slice(0, 8)}`
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 no-print" role="dialog" aria-modal="true" aria-labelledby="reverse-purchase-title">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-100 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-300"><AlertTriangle size={22} /></div>
          <div className="min-w-0 flex-1"><h2 id="reverse-purchase-title" className="text-lg font-bold text-slate-900 dark:text-white">Reverse original purchase?</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{label}</p></div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="mt-5 space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          <p>This will remove the purchase from vendor payables and reverse all stock quantities received through this purchase.</p>
          <p>Stock may become negative if some of these items have already been sold.</p>
          <p className="font-bold">This action will not reverse existing sales. The purchase will remain in history as REVERSED.</p>
        </div>
        <label className="mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Reversal reason <span className="text-red-600">*</span>
          <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this purchase is being reversed" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">Cancel</button>
          <button type="button" onClick={() => onConfirm(reason.trim())} disabled={busy || reason.trim().length < 3} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"><RotateCcw size={16} />{busy ? 'Reversing…' : 'Reverse Purchase'}</button>
        </div>
      </div>
    </div>
  )
}

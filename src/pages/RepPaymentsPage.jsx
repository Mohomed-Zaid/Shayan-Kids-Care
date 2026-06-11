import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { logAction } from '../lib/auditLog'
import { sendSingleSMS } from '../lib/sms'
import {
  calculateRepCommission,
  COMMISSION_MONTHS,
  getCommissionPaymentStatus,
  statusBadgeClass,
} from '../lib/repCommission'
import CompanyPhoneLines from '../components/CompanyPhoneLines'
import ChequeNumberField from '../components/ChequeNumberField'
import ControlledDateField from '../components/ControlledDateField'
import { isChequeFormatValid, isApprovedBankCode, extractBankCodeFromCheque } from '../lib/chequeValidation'
import {
  UserCheck,
  Calendar,
  Wallet,
  History,
  Printer,
  Save,
  TrendingUp,
  Banknote,
  Trash2,
  MessageSquare,
  Settings,
} from 'lucide-react'
import html2pdf from 'html2pdf.js'

const fmt = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
]

// Format date as dd/mm/yyyy
const formatDate = (dateStr) => {
  const date = new Date(dateStr)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

// Generate SMS message
const generateSMSTemplate = (repName, amount, paymentDate, paymentMethod, commissionSettled, advanceBalance) => {
  const methodLabel = paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)
  let message = `Dear ${repName},

A payment of ${fmt(amount)} has been recorded.

Commission Settled: ${fmt(commissionSettled)}`

  if (advanceBalance > 0) {
    message += `

Advance Balance: ${fmt(advanceBalance)}`
  }

  message += `

Thank you for your valuable contribution to Shayan Kids & Toys Store.

- Shayan Kids & Toys Store`

  return message
}

export default function RepPaymentsPage() {
  const toast = useToast()
  const { isSuperAdmin } = usePermissions()
  const receiptRef = useRef(null)

  const [reps, setReps] = useState([])
  const [banks, setBanks] = useState([])
  const [selectedRep, setSelectedRep] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const [summary, setSummary] = useState(null)
  const [payments, setPayments] = useState([])
  const [loadingReps, setLoadingReps] = useState(true)
  const [loadingPeriod, setLoadingPeriod] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)
  const [smsEnabledGlobally, setSmsEnabledGlobally] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [savingSetting, setSavingSetting] = useState(false)

  const [payForm, setPayForm] = useState({
    amount: '',
    paid_at: new Date().toISOString().slice(0, 10),
    method: 'cash',
    bank_name: '',
    reference: '',
    note: '',
    cheque_number: '',
    bank_code: '',
    bank_name_cheque: '',
    sendSms: true,
  })

  const [receiptData, setReceiptData] = useState(null)
  const [histOpen, setHistOpen] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [repPhone, setRepPhone] = useState('')

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear()
    return Array.from({ length: 6 }, (_, i) => current - i)
  }, [])

  const repName = useMemo(
    () => reps.find((r) => String(r.id) === String(selectedRep))?.name ?? '',
    [reps, selectedRep]
  )

  const repAdvanceBalance = useMemo(
    () => Number(reps.find((r) => String(r.id) === String(selectedRep))?.advance_balance ?? 0),
    [reps, selectedRep]
  )

  // Auto-fetch phone number when rep is selected with hard-coded numbers for specific reps
  useEffect(() => {
    if (selectedRep) {
      const rep = reps.find((r) => String(r.id) === String(selectedRep))
      if (rep) {
        // Hard-coded phone numbers for specific reps
        const phoneNumbers = {
          'Mohomed': '0777531318',
          'Manjula': '0775401354',
          'Mohamed Munzir': '0771193121'
        }
        // Check if rep name matches any hard-coded entry, otherwise use database phone1
        const hardcodedPhone = phoneNumbers[rep.name]
        setRepPhone(hardcodedPhone || rep.phone1 || '')
      }
    } else {
      setRepPhone('')
    }
  }, [selectedRep, reps])

  const paymentStatus = useMemo(() => {
    if (!summary) return null
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0)
    return getCommissionPaymentStatus(summary.commission, totalPaid)
  }, [summary, payments])

  const netCommissionDue = useMemo(() => {
    if (!summary) return 0
    return Math.max(0, summary.commission - repAdvanceBalance)
  }, [summary, repAdvanceBalance])

  const remainingBalance = useMemo(() => {
    if (!paymentStatus) return netCommissionDue
    return Math.max(0, paymentStatus.remaining - repAdvanceBalance)
  }, [paymentStatus, netCommissionDue, repAdvanceBalance])

  const payAmountNum = useMemo(
    () => Number(String(payForm.amount || '').replace(/,/g, '')),
    [payForm.amount]
  )

  const canSavePayment = useMemo(() => {
    if (!selectedRep || !summary) return false
    if (!payAmountNum || payAmountNum <= 0) return false
    if (!payForm.paid_at) return false
    if (payForm.method === 'cheque') {
      if (!isChequeFormatValid(payForm.cheque_number)) return false
      if (!isApprovedBankCode(extractBankCodeFromCheque(payForm.cheque_number))) return false
    }
    if (payForm.method === 'bank' && !payForm.bank_name.trim()) return false
    return true
  }, [selectedRep, summary, payAmountNum, payForm])

  // Load reps with phone numbers and system settings
  const loadReps = async () => {
    try {
      const [repRes, bankRes, settingRes] = await Promise.all([
        supabase.from('employees').select('id, name, phone, phone1, advance_balance').eq('is_rep', true).order('name'),
        supabase.from('banks').select('id, code, name, branch').order('code'),
        supabase.from('system_settings').select('*').eq('key', 'rep_payment_sms_enabled').single(),
      ])
      setReps(repRes.data ?? [])
      setBanks(bankRes.data ?? [])
      setSmsEnabledGlobally(settingRes.data ? settingRes.data.value === 'true' : true)
    } catch (e) {
      console.error('Load error:', e)
      // Fallback to basic loading if system_settings table doesn't exist
      const [repRes, bankRes] = await Promise.all([
        supabase.from('employees').select('id, name, phone, phone1, advance_balance').eq('is_rep', true).order('name'),
        supabase.from('banks').select('id, code, name, branch').order('code'),
      ])
      setReps(repRes.data ?? [])
      setBanks(bankRes.data ?? [])
    }
    setLoadingReps(false)
  }

  useEffect(() => {
    loadReps().catch(() => {
      toast.error('Failed to load reps')
      setLoadingReps(false)
    })
  }, [toast])

  const loadPeriod = useCallback(async () => {
    if (!selectedRep) {
      setSummary(null)
      setPayments([])
      return
    }

    setLoadingPeriod(true)
    setTableMissing(false)

    try {
      const commission = await calculateRepCommission(supabase, {
        repId: selectedRep,
        month: selectedMonth,
        year: selectedYear,
        repName,
      })
      setSummary(commission)

      const { data: payRows, error: payErr } = await supabase
      .from('rep_commission_payments')
      .select('id, amount, paid_at, method, reference, bank_name, note, created_at, sms_sent, sms_sent_at, advance_amount')
      .eq('rep_id', selectedRep)
      .eq('period_month', selectedMonth)
      .eq('period_year', selectedYear)
      .order('paid_at', { ascending: false })

      if (payErr) {
        if (payErr.code === '42P01' || payErr.message?.includes('does not exist')) {
          setTableMissing(true)
          setPayments([])
        } else {
          throw payErr
        }
      } else {
        setPayments(payRows ?? [])
      }
    } catch (e) {
      console.error(e)
      toast.error(e?.message ?? 'Failed to load period data')
      setSummary(null)
      setPayments([])
    } finally {
      setLoadingPeriod(false)
    }
  }, [selectedRep, selectedMonth, selectedYear, repName, toast])

  useEffect(() => {
    loadPeriod()
  }, [loadPeriod])

  const downloadReceiptPdf = async (filename) => {
    if (!receiptRef.current) return

    const wrapper = document.createElement('div')
    wrapper.className = 'pdf-export-wrapper'
    const cloned = receiptRef.current.cloneNode(true)
    wrapper.appendChild(cloned)
    document.body.appendChild(wrapper)

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    cloned.style.backgroundColor = '#ffffff'
    cloned.style.color = '#000000'

    const opt = {
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: [80, 297], orientation: 'portrait' },
    }

    try {
      await html2pdf().set(opt).from(cloned).save()
    } finally {
      wrapper.remove()
    }
  }

  const buildReceipt = (paymentRow, balanceAfterPay) => ({
    receiptNo: `RP-${String(paymentRow.id).slice(0, 8).toUpperCase()}`,
    repName: summary?.repName ?? repName,
    period: `${COMMISSION_MONTHS[selectedMonth]} ${selectedYear}`,
    paidAt: paymentRow.paid_at,
    method: paymentRow.method,
    amount: Number(paymentRow.amount),
    commissionDue: summary?.commission ?? 0,
    totalPaidAfter: (paymentStatus?.paid ?? 0) + Number(paymentRow.amount),
    balanceAfter: balanceAfterPay,
    reference: paymentRow.reference,
    bankName: paymentRow.bank_name,
    note: paymentRow.note,
  })

  const printReceipt = (data) => {
    setReceiptData(data)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        downloadReceiptPdf(
          `Rep-Payment-${data.repName}-${data.period}.pdf`.replace(/[^\w\-]+/g, '_')
        )
      })
    })
  }

  // Helper to log SMS
  const logRepSms = async (repId, paymentId, repName, phoneNumber, message, status, errorMessage = null) => {
    try {
      await supabase.from('rep_sms_log').insert({
        rep_id: repId,
        payment_id: paymentId,
        rep_name: repName,
        phone_number: phoneNumber,
        message,
        status,
        error_message: errorMessage,
      })
    } catch (e) {
      console.error('Failed to log SMS:', e)
    }
  }

  // Save setting function
  const saveSmsSetting = async (enabled) => {
    setSavingSetting(true)
    try {
      await supabase.from('system_settings').upsert({
        key: 'rep_payment_sms_enabled',
        value: enabled ? 'true' : 'false',
        description: 'Enable/disable automatic SMS notifications for rep commission payments',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      setSmsEnabledGlobally(enabled)
      toast.success('Setting saved')
    } catch (e) {
      toast.error('Failed to save setting')
    }
    setSavingSetting(false)
  }

  const savePayment = async () => {
    if (!selectedRep || !summary) return
    if (payForm.method === 'cheque' && !isChequeFormatValid(payForm.cheque_number)) {
      toast.error('Enter a valid cheque number (XXXXXX-XXXX-XXX)')
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const effectivePaidAt = isSuperAdmin ? payForm.paid_at : today

    // Calculate commission settled and advance for this payment
    const currentRemaining = Math.max(0, (summary.commission - (paymentStatus?.paid ?? 0)) - repAdvanceBalance)
    let commissionSettled = Math.min(payAmountNum, currentRemaining)
    let advanceAmount = payAmountNum - commissionSettled
    let newAdvanceBalance = repAdvanceBalance + advanceAmount
    // If there was an advance balance, use it first to settle commission
    if (repAdvanceBalance > 0 && currentRemaining > 0) {
      const advanceUsed = Math.min(repAdvanceBalance, currentRemaining)
      commissionSettled = payAmountNum
      if (commissionSettled > currentRemaining - advanceUsed) {
        advanceAmount = commissionSettled - (currentRemaining - advanceUsed)
        newAdvanceBalance = advanceAmount
      } else {
        advanceAmount = 0
        newAdvanceBalance = repAdvanceBalance - (currentRemaining - commissionSettled)
      }
    }

    setSaving(true)

    const reference =
      payForm.method === 'cheque'
        ? payForm.cheque_number.trim()
        : payForm.reference.trim() || null

    const { data: inserted, error } = await supabase
      .from('rep_commission_payments')
      .insert({
        rep_id: selectedRep,
        period_month: selectedMonth,
        period_year: selectedYear,
        amount: payAmountNum,
        advance_amount: advanceAmount,
        paid_at: effectivePaidAt,
        method: payForm.method,
        bank_name:
          payForm.method === 'bank'
            ? payForm.bank_name.trim()
            : payForm.method === 'cheque'
              ? payForm.bank_name_cheque || null
              : null,
        reference,
        note: payForm.note.trim() || null,
        sms_sent: false,
      })
      .select('id, amount, paid_at, method, reference, bank_name, note, advance_amount')
      .single()

    // Update the rep's advance balance
    await supabase
      .from('employees')
      .update({ advance_balance: newAdvanceBalance })
      .eq('id', selectedRep)

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        setTableMissing(true)
        toast.error('Run supabase/rep_commission_payments.sql and rep_payment_sms.sql in Supabase first')
      } else {
        toast.error(error.message)
      }
      setSaving(false)
      return
    }

    let smsSentSuccessfully = false
    let smsFailed = false
    let smsErrorMessage = null

    // Check if we should send SMS
    const shouldSendSms = 
      smsEnabledGlobally && 
      payForm.sendSms && 
      repPhone && 
      repPhone.trim().length > 0

    if (shouldSendSms) {
      try {
        const message = generateSMSTemplate(
          repName,
          payAmountNum,
          effectivePaidAt,
          payForm.method,
          commissionSettled,
          newAdvanceBalance
        )
        
        await sendSingleSMS(repPhone, message)
        
        // Mark as sent in payment record
        await supabase
          .from('rep_commission_payments')
          .update({ 
            sms_sent: true, 
            sms_sent_at: new Date().toISOString() 
          })
          .eq('id', inserted.id)
        
        await logRepSms(
          selectedRep,
          inserted.id,
          repName,
          repPhone,
          message,
          'sent'
        )

        logAction({
          action: 'Rep Payment SMS Sent',
          targetType: 'rep_payment',
          targetId: inserted.id,
          targetLabel: `${repName} - ${fmt(payAmountNum)}`,
          details: `Phone: ${repPhone}, Amount: ${fmt(payAmountNum)}`,
        })

        smsSentSuccessfully = true
      } catch (e) {
        console.error('SMS send failed:', e)
        smsFailed = true
        smsErrorMessage = e?.message || 'Unknown error'
        
        await logRepSms(
          selectedRep,
          inserted.id,
          repName,
          repPhone,
          '',
          'failed',
          smsErrorMessage
        )
      }
    }

    // Show appropriate toast
    if (smsSentSuccessfully) {
      toast.success('Rep payment saved and SMS sent successfully')
    } else if (smsFailed) {
      toast.warning('Rep payment saved successfully. SMS delivery failed.')
    } else {
      toast.success('Rep payment saved')
    }

    logAction({
      action: 'save_rep_commission_payment',
      targetType: 'rep_payment',
      targetId: inserted.id,
      targetLabel: `${repName} ${COMMISSION_MONTHS[selectedMonth]} ${selectedYear}`,
    })

    const balanceAfterPay = Math.max(0, remainingBalance - payAmountNum)
    printReceipt(buildReceipt(inserted, balanceAfterPay))

    setPayForm((p) => ({
      ...p,
      amount: balanceAfterPay > 0
        ? balanceAfterPay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
        : '',
      reference: '',
      cheque_number: '',
      bank_code: '',
      bank_name_cheque: '',
      note: '',
      sendSms: true,
    }))

    await loadPeriod()
    await loadReps()
    setSaving(false)
  }

  const deletePayment = async (row) => {
    const amount = Number(row.amount ?? 0)
    const advanceAmount = Number(row.advance_amount ?? 0)
    const label = `${fmt(amount)} on ${row.paid_at}`
    if (
      !confirm(
        `Delete this payment (${label})?\n\nThe amount will be restored to the remaining commission balance for this period.`
      )
    ) {
      return
    }

    setDeletingId(row.id)

    // First, adjust the rep's advance balance if needed
    if (advanceAmount > 0) {
      // Get the current rep's advance balance
      const { data: repData } = await supabase
        .from('employees')
        .select('advance_balance')
        .eq('id', selectedRep)
        .single()
      
      if (repData) {
        const newAdvanceBalance = Number(repData.advance_balance ?? 0) - advanceAmount
        await supabase
          .from('employees')
          .update({ advance_balance: newAdvanceBalance })
          .eq('id', selectedRep)
      }
    }

    // Then delete the payment
    const { error } = await supabase.from('rep_commission_payments').delete().eq('id', row.id)

    if (error) {
      toast.error(error.message)
      setDeletingId('')
      return
    }

    toast.success(`${fmt(amount)} restored to remaining balance`)
    logAction({
      action: 'delete_rep_commission_payment',
      targetType: 'rep_payment',
      targetId: row.id,
      targetLabel: `${repName} ${COMMISSION_MONTHS[selectedMonth]} ${selectedYear} — ${fmt(amount)}`,
    })

    await loadPeriod()
    await loadReps()
    setDeletingId('')
  }

  const reprintPayment = (row) => {
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0)
    const balanceAfter = Math.max(0, (summary?.commission ?? 0) - totalPaid)
    printReceipt({
      receiptNo: `RP-${String(row.id).slice(0, 8).toUpperCase()}`,
      repName: summary?.repName ?? repName,
      period: `${COMMISSION_MONTHS[selectedMonth]} ${selectedYear}`,
      paidAt: row.paid_at,
      method: row.method,
      amount: Number(row.amount),
      commissionDue: summary?.commission ?? 0,
      totalPaidAfter: totalPaid,
      balanceAfter,
      reference: row.reference,
      bankName: row.bank_name,
      note: row.note,
    })
  }

  if (loadingReps) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="fixed left-[-99999px] top-0">
        {receiptData ? (
          <div ref={receiptRef} className="bg-white text-black" style={{ width: '80mm' }}>
            <div className="p-3 text-[11px] leading-tight">
              <div className="text-center">
                <div className="text-[16px] font-extrabold">SHAYAN&apos;S KIDS</div>
                <div className="text-[10px] font-semibold">10/3 B, Attidiya Road, Kawdana, Dehiwala</div>
                <CompanyPhoneLines compact />
                <div className="mt-2 text-[12px] font-extrabold tracking-wide">REP PAYMENT RECEIPT</div>
              </div>

              <div className="mt-2 border-t border-b border-black py-2 space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold">Receipt</span>
                  <span>{receiptData.receiptNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Date</span>
                  <span>{receiptData.paidAt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Rep</span>
                  <span className="text-right max-w-[45mm]">{receiptData.repName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Period</span>
                  <span>{receiptData.period}</span>
                </div>
              </div>

              <div className="mt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold">Method</span>
                  <span>{String(receiptData.method || '').toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Paid</span>
                  <span>{fmt(receiptData.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Commission</span>
                  <span>{fmt(receiptData.commissionDue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Balance After</span>
                  <span>{fmt(receiptData.balanceAfter)}</span>
                </div>
              </div>

              {(receiptData.bankName || receiptData.reference) ? (
                <div className="mt-2 border-t border-black pt-2 text-[10px]">
                  {receiptData.bankName ? (
                    <div>
                      <span className="font-bold">Bank</span>: {receiptData.bankName}
                    </div>
                  ) : null}
                  {receiptData.reference ? (
                    <div>
                      <span className="font-bold">Ref</span>: {receiptData.reference}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {receiptData.balanceAfter <= 0.005 ? (
                <div className="mt-4 flex justify-center">
                  <div
                    className="rounded-full border-[3px] border-double border-red-600 px-5 py-3 text-center"
                    style={{ transform: 'rotate(-15deg)', opacity: 0.75, color: '#dc2626', borderColor: '#dc2626' }}
                  >
                    <div className="text-xl font-black tracking-widest">PAID</div>
                  </div>
                </div>
              ) : null}

              {receiptData.note ? (
                <div className="mt-2 text-[10px]">
                  <span className="font-bold">Note:</span> {receiptData.note}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-3 rounded-xl">
            <Wallet size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Rep Payments</h1>
            <p className="text-slate-400 text-sm mt-0.5">Pay commission to sales representatives by month</p>
          </div>
        </div>
      </div>

      {tableMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          Database table missing. Run <code className="font-mono text-xs">supabase/rep_commission_payments.sql</code> in
          the Supabase SQL Editor, then refresh this page.
        </div>
      ) : null}

      <div className="bg-white dark:bg-emerald-950/25 border border-slate-200/60 dark:border-emerald-400/15 rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
              <UserCheck size={12} className="inline mr-1" />
              Sales Rep
            </label>
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="">Select rep</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
              <Calendar size={12} className="inline mr-1" />
              Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {COMMISSION_MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!selectedRep ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
          Select a rep and period to load commission and payments.
        </div>
      ) : loadingPeriod ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
        </div>
      ) : summary ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${statusBadgeClass(paymentStatus?.status)}`}
            >
              {paymentStatus?.label}
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {COMMISSION_MONTHS[selectedMonth]} {selectedYear} · {summary.repName}
            </span>
            <button
              type="button"
              onClick={() => setHistOpen(true)}
              className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <History size={16} />
              Payment History ({payments.length})
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="text-xs font-semibold text-slate-500 uppercase">Total Sales</div>
              <div className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">{fmt(summary.totalSales)}</div>
              <div className="text-xs text-slate-500 mt-1">{summary.invoiceCount} invoices</div>
            </div>
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-5">
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase">Commission Due</div>
              <div className="mt-2 text-xl font-extrabold text-amber-900 dark:text-amber-200">
                {fmt(summary.commission)}
              </div>
              <div className="text-xs text-amber-700/80 mt-1">{(summary.rate * 100).toFixed(2)}% net rate</div>
            </div>
            <div className={`rounded-2xl border p-5 ${
              repAdvanceBalance > 0 
                ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
            }`}>
              <div className={`text-xs font-semibold uppercase ${
                repAdvanceBalance > 0 
                  ? 'text-blue-800 dark:text-blue-300' 
                  : 'text-green-800 dark:text-green-300'
              }`}>Advance Balance</div>
              <div className={`mt-2 text-xl font-extrabold ${
                repAdvanceBalance > 0 
                  ? 'text-blue-900 dark:text-blue-200' 
                  : 'text-green-900 dark:text-green-200'
              }`}>
                {fmt(repAdvanceBalance)}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5">
              <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase">Already Paid</div>
              <div className="mt-2 text-xl font-extrabold text-emerald-900 dark:text-emerald-200">
                {fmt(paymentStatus?.paid)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">Net Due</div>
              <div className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">{fmt(remainingBalance)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-emerald-950/25 border border-slate-200/60 dark:border-emerald-400/15 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Banknote size={18} className="text-slate-600 dark:text-slate-300" />
                <h2 className="font-bold text-slate-900 dark:text-white">Record Payment</h2>
              </div>

              {remainingBalance <= 0.005 ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                  Commission for this period is fully paid.
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                      Payment amount
                    </label>
                    <input
                      value={payForm.amount}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.]/g, '')
                        const parts = raw.split('.')
                        const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                        const formatted =
                          parts.length > 1 ? `${intPart}.${parts[1].slice(0, 2)}` : intPart
                        setPayForm((p) => ({ ...p, amount: formatted }))
                      }}
                      placeholder="Enter payment amount"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                    />
                    {payAmountNum > remainingBalance + 0.005 ? (
                      <p className="mt-1 text-xs text-blue-600 font-semibold">
                        Advance created: {fmt(payAmountNum - remainingBalance)}
                      </p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPayForm((p) => ({
                            ...p,
                            amount: remainingBalance.toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            }),
                          }))
                        }
                        className="text-xs font-semibold px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Full payment
                      </button>
                    </div>
                  </div>

                  <div>
                    <ControlledDateField
                      label="Payment date"
                      value={payForm.paid_at}
                      onChange={(newDate) => setPayForm((p) => ({ ...p, paid_at: newDate }))}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                      Payment method
                    </label>
                    <select
                      value={payForm.method}
                      onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                    >
                      {METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {payForm.method === 'bank' ? (
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                        Bank
                      </label>
                      <select
                        value={payForm.bank_name}
                        onChange={(e) => setPayForm((p) => ({ ...p, bank_name: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                      >
                        <option value="">Select bank</option>
                        {banks.map((b) => (
                          <option key={b.id} value={`${b.code} - ${b.name}`}>
                            {b.code} - {b.name}
                            {b.branch ? ` (${b.branch})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {payForm.method === 'cheque' ? (
                    <ChequeNumberField
                      label="Cheque number"
                      value={payForm.cheque_number}
                      onChange={({ cheque_number, bank_name }) =>
                        setPayForm((p) => ({
                          ...p,
                          cheque_number,
                          bank_name_cheque: bank_name || '',
                        }))
                      }
                    />
                  ) : null}

                  {payForm.method !== 'cheque' ? (
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                        Reference (optional)
                      </label>
                      <input
                        value={payForm.reference}
                        onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                      Notes (optional)
                    </label>
                    <input
                      value={payForm.note}
                      onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>

                  {/* Phone Number Field */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                      <MessageSquare size={12} className="inline mr-1" />
                      Rep Phone Number (for SMS)
                    </label>
                    <input
                      value={repPhone}
                      onChange={(e) => setRepPhone(e.target.value)}
                      placeholder="e.g. 0771234567"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                    />
                    {!repPhone && smsEnabledGlobally && payForm.sendSms && (
                      <p className="mt-1 text-xs text-amber-600 font-semibold">
                        No phone number - SMS won&apos;t be sent
                      </p>
                    )}
                  </div>

                  {/* SMS Notification Checkbox */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="sendSms"
                      checked={payForm.sendSms}
                      onChange={(e) => setPayForm((p) => ({ ...p, sendSms: e.target.checked }))}
                      disabled={!smsEnabledGlobally}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="sendSms" className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <MessageSquare size={14} />
                      Send SMS Notification
                      {!smsEnabledGlobally && <span className="text-xs text-slate-400">(Disabled globally)</span>}
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={savePayment}
                      disabled={!canSavePayment || saving || tableMissing}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Save size={16} />
                      {saving ? 'Saving...' : 'Save & Print Receipt'}
                    </button>
                    
                    {/* Settings Button */}
                    <button
                      type="button"
                      onClick={() => setShowSettings(true)}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Settings size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-emerald-950/25 border border-slate-200/60 dark:border-emerald-400/15 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-slate-600 dark:text-slate-300" />
                <h2 className="font-bold text-slate-900 dark:text-white">Commission Summary</h2>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">Gross sales</dt>
                  <dd className="font-semibold">{fmt(summary.totalSales)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">Returns</dt>
                  <dd className="font-semibold text-red-600">−{fmt(summary.totalReturns)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                  <dt className="text-slate-600 dark:text-slate-400">Net sales</dt>
                  <dd className="font-semibold">{fmt(summary.netSales)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">Commission rate</dt>
                  <dd className="font-semibold">{(summary.rate * 100).toFixed(2)}%</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                  <dt className="font-bold text-slate-900 dark:text-white">Net commission</dt>
                  <dd className="font-extrabold text-amber-700 dark:text-amber-300">{fmt(summary.commission)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </>
      ) : null}

      {/* SMS Settings Modal */}
      {showSettings ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Settings size={18} />
                SMS Notification Settings
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <MessageSquare size={20} className="text-slate-600 dark:text-slate-300" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Enable SMS Notifications</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Send automatic SMS to reps when payment is recorded</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsEnabledGlobally}
                    onChange={(e) => saveSmsSetting(e.target.checked)}
                    disabled={savingSetting}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-500 peer-checked:bg-emerald-600"></div>
                </label>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <strong>Note:</strong> Ensure reps have valid phone numbers in their employee records.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {histOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white">Payment History</div>
              <button
                type="button"
                onClick={() => setHistOpen(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="overflow-auto flex-1">
              {payments.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No payments recorded for this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-slate-500">Date</th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-500">Method</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-500">Amount</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-500">Advance</th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-500">SMS</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700">
                        <td className="px-4 py-2">{p.paid_at}</td>
                        <td className="px-4 py-2 capitalize">{p.method}</td>
                        <td className="px-4 py-2 text-right font-semibold">{fmt(p.amount)}</td>
                        <td className="px-4 py-2 text-right">
                          {p.advance_amount > 0 ? (
                            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{fmt(p.advance_amount)}</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {p.sms_sent ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              <MessageSquare size={12} />
                              Sent
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Not sent</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => reprintPayment(p)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300"
                            >
                              <Printer size={14} />
                              Print
                            </button>
                            <button
                              type="button"
                              onClick={() => deletePayment(p)}
                              disabled={deletingId === p.id}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 disabled:opacity-50"
                            >
                              <Trash2 size={14} />
                              {deletingId === p.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

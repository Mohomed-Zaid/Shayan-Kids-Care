import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import html2pdf from 'html2pdf.js'
import logo from '../pictures/logo.jpeg'
import { Package, Users, DollarSign, Plus, Eye, TrendingUp, TrendingDown, ArrowUpRight, ShoppingCart, ShoppingBag, Wallet, Calendar, Landmark, RotateCcw, CreditCard, CheckCircle2 } from 'lucide-react'
import { usePermissions } from '../contexts/PermissionsContext'
import PermissionGate from '../components/PermissionGate'
import Chart from 'react-apexcharts'
import { buildInvoiceBalanceRows } from '../lib/receivables'

const statConfig = [
  { key: 'totalPurchase', label: 'Total Purchase', icon: ShoppingBag, gradient: 'from-amber-500 to-orange-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-amber-100', isCurrency: true },
  { key: 'totalSales', label: 'Total Sales', icon: TrendingUp, gradient: 'from-rose-500 to-pink-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-rose-100', isCurrency: true },
  { key: 'totalExpenses', label: 'Total Expenses', icon: ShoppingCart, gradient: 'from-indigo-500 to-indigo-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-indigo-100', isCurrency: true },
  { key: 'totalPayments', label: 'Total Cash & Bank Payments', icon: Wallet, gradient: 'from-teal-500 to-cyan-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-teal-100', isCurrency: true },
  { key: 'chequeInHand', label: 'Cheque In Hand', icon: Landmark, gradient: 'from-violet-500 to-purple-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-violet-100', isCurrency: true },
  { key: 'returnCheque', label: 'Return Cheque', icon: RotateCcw, gradient: 'from-orange-500 to-red-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-orange-100', isCurrency: true },
  { key: 'depositedCheques', label: 'Deposited Cheques', icon: CheckCircle2, gradient: 'from-sky-500 to-blue-500', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-sky-100', isCurrency: true },
  { key: 'returnAmount', label: 'Return Amount', icon: RotateCcw, gradient: 'from-red-500 to-rose-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-red-100', isCurrency: true },
  { key: 'payable', label: 'Payable', icon: CreditCard, gradient: 'from-pink-500 to-rose-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-pink-100', isCurrency: true },
  { key: 'products', label: 'Products', icon: Package, gradient: 'from-blue-500 to-blue-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-blue-100' },
  { key: 'customers', label: 'Customers', icon: Users, gradient: 'from-emerald-500 to-emerald-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-emerald-100' },
  { key: 'monthlyProfitLoss', label: 'Monthly Profit / Loss', icon: TrendingUp, gradient: 'from-emerald-500 to-teal-600', iconBg: 'bg-white/20', textColor: 'text-white', valueColor: 'text-white', subColor: 'text-emerald-100', isCurrency: true },
]

function StatCard({ label, value, icon: Icon, gradient, iconBg, textColor, valueColor, subColor, isCurrency, extraSub, onDownload, isDownloading }) {
  const isLoss = isCurrency && typeof value === 'number' && value < 0
  const isProfitLossCard = label.toLowerCase().includes('profit') || label.toLowerCase().includes('loss')
  const isMonthlyCard = label.toLowerCase().includes('monthly')
  const displayLabel = isProfitLossCard
    ? (isMonthlyCard ? (isLoss ? 'Monthly Loss' : 'Monthly Profit') : (isLoss ? 'Net Loss' : 'Net Profit'))
    : label
  const CardIcon = isProfitLossCard ? (isLoss ? TrendingDown : TrendingUp) : Icon
  const cardGradient = isProfitLossCard
    ? (isLoss ? 'from-rose-500 to-red-600' : 'from-emerald-500 to-teal-600')
    : gradient
  const cardSubColor = isProfitLossCard
    ? (isLoss ? 'text-rose-100' : 'text-emerald-100')
    : subColor
  const darkClasses = isProfitLossCard && isLoss
    ? 'dark:from-rose-950/40 dark:via-slate-950/40 dark:to-rose-950/40 dark:border-rose-400/20'
    : 'dark:from-emerald-950/40 dark:via-slate-950/40 dark:to-emerald-950/40 dark:border-emerald-400/15'

  return (
    <div className={`bg-gradient-to-br ${cardGradient} ${darkClasses} rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 dark:border`}>
      <div className="flex items-center justify-between">
        <div className={`text-xs font-semibold ${textColor} uppercase tracking-wider opacity-90`}>{displayLabel}</div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (onDownload) onDownload()
          }}
          disabled={isDownloading}
          title={`Download ${displayLabel} PDF Report`}
          className={`${iconBg} p-2.5 rounded-xl transition-all duration-200 hover:scale-110 hover:brightness-125 active:scale-95 cursor-pointer shadow-sm relative group focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-50`}
        >
          {isDownloading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <CardIcon size={20} className={textColor} />
              <span className="absolute -bottom-8 right-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950/95 text-white text-[10px] font-semibold px-2 py-1 rounded shadow-lg whitespace-nowrap z-30 border border-slate-700/80">
                Download PDF
              </span>
            </>
          )}
        </button>
      </div>
      <div className={`mt-4 text-3xl font-extrabold ${valueColor} tracking-tight`}>
        {isCurrency ? (
          Number(value) < 0
            ? `-Rs. ${Math.abs(Number(value)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            : `Rs. ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
        ) : value}
      </div>
      <div className={`mt-1 flex items-center gap-1 text-xs ${cardSubColor} font-medium`}>
        <CardIcon size={12} />
        <span>
          {extraSub
            ? `Tiny Bloom • ${extraSub}`
            : isProfitLossCard
              ? `Tiny Bloom • ${isLoss ? 'Loss' : 'Profit'}`
              : 'Tiny Bloom'}
        </span>
      </div>
    </div>
  )
}

const fmtMoney = (val) => `Rs. ${Number(val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

function monthKeyFromDate(d) {
  const dt = new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function buildLast12Months() {
  const now = new Date()
  const months = []
  const startYear = now.getFullYear()
  for (let m = 0; m < 12; m++) {
    const d = new Date(startYear, m, 1)
    const key = monthKeyFromDate(d)
    const label = d.toLocaleString(undefined, { month: 'short' })
    months.push({ key, label })
  }
  return months
}

// (Charts are rendered with ApexCharts now)

export default function DashboardPage() {
  const { user } = useAuth()
  const { dashboardWidgets } = usePermissions()
  const toast = useToast()
  const [downloadingKey, setDownloadingKey] = useState(null)

  useEffect(() => {
    document.title = "Dashboard | Tiny Bloom"
  }, [])

  const displayName = (() => {
    const email = user?.email ?? ''
    const USER_MAP = {
      'zaidn2848@gmail.com': 'Zaid',
      'shayankidscare@gmail.com': 'Niflan',
    }
    return USER_MAP[email] ?? email.split('@')[0]
  })()

  const [stats, setStats] = useState({
    products: 0,
    customers: 0,
    totalPurchase: 0,
    totalExpenses: 0,
    totalSales: 0,
    totalPayments: 0,
    chequeInHand: 0,
    returnCheque: 0,
    depositedCheques: 0,
    returnAmount: 0,
    payable: 0,
    monthlyProfitLoss: 0,
  })
  const [receivableCheques, setReceivableCheques] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [payableCheques, setPayableCheques] = useState([])
  const [monthSeries, setMonthSeries] = useState({ labels: [], sales: [], purchase: [] })
  const [receivable, setReceivable] = useState({ due: 0, currentMonth: 0, received: 0 })
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailPayment, setDetailPayment] = useState(null)
  const show = (id) => {
    if (id === 'stat_totalPurchase' && dashboardWidgets[id] === undefined) {
      return dashboardWidgets['stat_todaySales'] !== false
    }
    if ((id === 'stat_monthlyProfitLoss' || id === 'stat_profitLoss') && dashboardWidgets[id] === undefined) {
      return (dashboardWidgets['stat_monthlyProfitLoss'] ?? dashboardWidgets['stat_profitLoss']) !== false
    }
    return dashboardWidgets[id] !== false
  }

  const generateAndDownloadPdf = async ({
    title,
    filename,
    columns,
    rows,
    summaryTotal,
  }) => {
    const escapeHtml = (val) => String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

    const fmtCurrency = (val) => `Rs. ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const isLandscape = columns.length > 5

    const htmlContent = `
      <div style="font-family: Arial, -apple-system, BlinkMacSystemFont, sans-serif; color: #0f172a; padding: 24px; background: #ffffff; min-width: ${isLandscape ? '980px' : '720px'}; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid #059669; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${logo}" alt="Tiny Bloom Logo" style="height: 48px; width: 48px; object-fit: contain; border-radius: 6px;" />
            <div>
              <div style="font-size: 19px; font-weight: 900; color: #064e3b; letter-spacing: -0.01em;">Tiny Bloom</div>
              <div style="font-size: 10.5px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Wholesale Management System</div>
              <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 3px;">${escapeHtml(title)}</div>
            </div>
          </div>
          <div style="text-align: right; font-size: 9.5px; color: #475569; line-height: 1.45;">
            <div><b>Generated By:</b> ${escapeHtml(displayName || 'Admin')}</div>
            <div><b>Generated Date:</b> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div><b>Total Records:</b> ${rows.length}</div>
            ${summaryTotal ? `<div style="font-size: 11.5px; font-weight: 800; color: #064e3b; margin-top: 3px;">${escapeHtml(summaryTotal)}</div>` : ''}
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 8px;">
          <thead>
            <tr style="background: #064e3b; color: #ffffff;">
              <th style="padding: 6px 7px; text-align: center; width: 30px; font-weight: 800; border-top-left-radius: 4px;">#</th>
              ${columns.map((c, i) => `
                <th style="padding: 6px 8px; text-align: ${c.align || (c.isMoney ? 'right' : 'left')}; font-weight: 800; text-transform: uppercase; font-size: 9px; letter-spacing: 0.03em; ${i === columns.length - 1 ? 'border-top-right-radius: 4px;' : ''}">
                  ${escapeHtml(c.header)}
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `
              <tr>
                <td colspan="${columns.length + 1}" style="padding: 20px; text-align: center; color: #64748b; font-style: italic; border-bottom: 1px solid #e2e8f0;">
                  No records found for this report.
                </td>
              </tr>
            ` : rows.map((r, rIdx) => `
              <tr style="background: ${rIdx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5.5px 7px; text-align: center; color: #94a3b8; font-weight: 600; font-size: 9.5px;">${rIdx + 1}</td>
                ${columns.map((c) => {
                  const rawVal = r[c.key]
                  const val = c.isMoney ? fmtCurrency(rawVal) : escapeHtml(rawVal ?? '-')
                  return `
                    <td style="padding: 5.5px 8px; text-align: ${c.align || (c.isMoney ? 'right' : 'left')}; font-weight: ${c.isMoney ? '700' : '500'}; color: #1e293b; font-variant-numeric: tabular-nums;">
                      ${val}
                    </td>
                  `
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="margin-top: 18px; padding-top: 8px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8;">
          <div>Tiny Bloom Wholesale Management System &middot; Official PDF Report</div>
          <div>Confidential &middot; Auto-generated via Dashboard</div>
        </div>
      </div>
    `

    const stage = document.createElement('div')
    stage.style.position = 'fixed'
    stage.style.left = '-9999px'
    stage.style.top = '0'
    stage.style.zIndex = '-9999'
    stage.innerHTML = htmlContent
    document.body.appendChild(stage)

    try {
      await html2pdf().set({
        margin: [0.25, 0.25, 0.25, 0.25],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'in', format: 'a4', orientation: isLandscape ? 'landscape' : 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] },
      }).from(stage.firstElementChild).save()
    } finally {
      document.body.removeChild(stage)
    }
  }

  const handleDownloadReport = async (key, label) => {
    if (downloadingKey) return
    setDownloadingKey(key)
    const todayStr = new Date().toISOString().slice(0, 10)
    try {
      toast.info(`Generating ${label} PDF report...`)
      let rows = []
      let columns = []
      let filename = `${key}_report_${todayStr}.pdf`
      let title = `${label} Report`
      let summaryTotal = ''

      if (key === 'totalPurchase') {
        title = 'Total Purchases Report'
        filename = `Purchases_Report_${todayStr}.pdf`
        columns = [
          { header: 'Date', key: 'date' },
          { header: 'Reference No', key: 'ref_no' },
          { header: 'Vendor', key: 'vendor' },
          { header: 'Payment Type', key: 'payment_type' },
          { header: 'Status', key: 'status' },
          { header: 'Total Amount', key: 'total_amount', isMoney: true },
        ]
        const { data, error } = await supabase
          .from('purchases')
          .select('id, date, ref_no, payment_type, total_amount, status, vendors(name)')
          .order('date', { ascending: false })
        if (error) throw error
        rows = (data || []).map((p) => ({
          date: p.date ? new Date(p.date).toLocaleDateString() : '-',
          ref_no: p.ref_no || `PUR-${p.id}`,
          vendor: p.vendors?.name || 'Walk-in Vendor',
          payment_type: p.payment_type || '-',
          total_amount: Number(p.total_amount || 0),
          status: p.status || 'completed',
        }))
        const total = rows.reduce((s, r) => s + r.total_amount, 0)
        summaryTotal = `Total Purchases: Rs. ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      } else if (key === 'totalSales') {
        title = 'Total Sales Invoices Report'
        filename = `Sales_Report_${todayStr}.pdf`
        columns = [
          { header: 'Date', key: 'date' },
          { header: 'Invoice No', key: 'invoice_number' },
          { header: 'Customer', key: 'customer' },
          { header: 'Payment Type', key: 'payment_type' },
          { header: 'Status', key: 'status' },
          { header: 'Total Amount', key: 'total_amount', isMoney: true },
        ]
        const { data, error } = await supabase
          .from('invoices')
          .select('id, invoice_number, total_amount, created_at, payment_type, status, customers(name)')
          .order('created_at', { ascending: false })
        if (error) throw error
        rows = (data || []).map((inv) => ({
          date: inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '-',
          invoice_number: inv.invoice_number || `INV-${inv.id}`,
          customer: inv.customers?.name || 'Walk-in Customer',
          payment_type: inv.payment_type || '-',
          total_amount: Number(inv.total_amount || 0),
          status: inv.status || 'completed',
        }))
        const total = rows.reduce((s, r) => s + r.total_amount, 0)
        summaryTotal = `Total Sales: Rs. ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      } else if (key === 'totalExpenses') {
        title = 'Total Expenses Report'
        filename = `Expenses_Report_${todayStr}.pdf`
        columns = [
          { header: 'Type', key: 'type' },
          { header: 'Date / Ref', key: 'date_ref' },
          { header: 'Description', key: 'description' },
          { header: 'Debit / Budget', key: 'amount', isMoney: true },
          { header: 'Balance', key: 'balance', isMoney: true },
        ]
        const [jRes, lRes] = await Promise.all([
          supabase.from('journals').select('id, code, description, budget, s_balance, h_balance'),
          supabase.from('journal_entry_lines').select('id, debit, credit, description, created_at, journal_entries(entry_number, date, description)'),
        ])
        rows = [
          ...(jRes.data || []).map((j) => ({
            type: 'Journal Account',
            date_ref: j.code || `JNL-${j.id}`,
            description: j.description || '-',
            amount: Number(j.budget || 0),
            balance: Number(j.s_balance || 0) + Number(j.h_balance || 0),
          })),
          ...(lRes.data || []).map((l) => ({
            type: 'Journal Entry Line',
            date_ref: l.journal_entries?.date || (l.created_at ? new Date(l.created_at).toLocaleDateString() : '-'),
            description: l.description || l.journal_entries?.description || '-',
            amount: Number(l.debit || 0),
            balance: Number(l.credit || 0),
          })),
        ]
        summaryTotal = `Total Expenses: Rs. ${Number(stats.totalExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      } else if (key === 'totalPayments') {
        title = 'Cash & Bank Payments Report'
        filename = `Cash_Bank_Payments_${todayStr}.pdf`
        columns = [
          { header: 'Date', key: 'date' },
          { header: 'Invoice No', key: 'invoice_number' },
          { header: 'Customer', key: 'customer' },
          { header: 'Method', key: 'method' },
          { header: 'Bank', key: 'bank' },
          { header: 'Reference', key: 'reference' },
          { header: 'Amount', key: 'amount', isMoney: true },
        ]
        const { data, error } = await supabase
          .from('invoice_payments')
          .select('id, amount, paid_at, method, bank_name, reference, note, invoices(invoice_number, customers(name))')
          .order('paid_at', { ascending: false })
        if (error) throw error
        rows = (data || []).filter((p) => p.method !== 'cheque').map((p) => ({
          date: p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '-',
          invoice_number: p.invoices?.invoice_number || '-',
          customer: p.invoices?.customers?.name || '-',
          method: p.method || 'cash',
          bank: p.bank_name || '-',
          reference: p.reference || '-',
          amount: Number(p.amount || 0),
        }))
        const total = rows.reduce((s, r) => s + r.amount, 0)
        summaryTotal = `Total Payments: Rs. ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      } else if (key === 'chequeInHand') {
        title = 'Cheques In Hand Report'
        filename = `Cheques_In_Hand_${todayStr}.pdf`
        columns = [
          { header: 'Cheque Date', key: 'date' },
          { header: 'Cheque No', key: 'cheque_number' },
          { header: 'Customer', key: 'customer' },
          { header: 'Bank Name', key: 'bank' },
          { header: 'Status', key: 'status' },
          { header: 'Amount', key: 'amount', isMoney: true },
        ]
        const { data, error } = await supabase
          .from('customer_cheques')
          .select('id, cheque_number, cheque_date, amount, bank_name, status, customers(name)')
          .eq('status', 'in_hand')
          .order('cheque_date', { ascending: false })
        if (error) throw error
        rows = (data || []).map((c) => ({
          date: c.cheque_date ? new Date(c.cheque_date).toLocaleDateString() : '-',
          cheque_number: c.cheque_number || '-',
          customer: c.customers?.name || '-',
          bank: c.bank_name || '-',
          status: 'In Hand',
          amount: Number(c.amount || 0),
        }))
        const total = rows.reduce((s, r) => s + r.amount, 0)
        summaryTotal = `In Hand Total: Rs. ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      } else if (key === 'returnCheque') {
        title = 'Returned Cheques Report'
        filename = `Returned_Cheques_${todayStr}.pdf`
        columns = [
          { header: 'Cheque Date', key: 'date' },
          { header: 'Cheque No', key: 'cheque_number' },
          { header: 'Customer', key: 'customer' },
          { header: 'Bank Name', key: 'bank' },
          { header: 'Status', key: 'status' },
          { header: 'Amount', key: 'amount', isMoney: true },
        ]
        const { data, error } = await supabase
          .from('customer_cheques')
          .select('id, cheque_number, cheque_date, amount, bank_name, status, customers(name)')
          .eq('status', 'returned')
          .order('cheque_date', { ascending: false })
        if (error) throw error
        rows = (data || []).map((c) => ({
          date: c.cheque_date ? new Date(c.cheque_date).toLocaleDateString() : '-',
          cheque_number: c.cheque_number || '-',
          customer: c.customers?.name || '-',
          bank: c.bank_name || '-',
          status: 'Returned',
          amount: Number(c.amount || 0),
        }))
        const total = rows.reduce((s, r) => s + r.amount, 0)
        summaryTotal = `Returned Total: Rs. ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      } else if (key === 'depositedCheques') {
        title = 'Deposited Cheques Report'
        filename = `Deposited_Cheques_${todayStr}.pdf`
        columns = [
          { header: 'Cheque Date', key: 'date' },
          { header: 'Cheque No', key: 'cheque_number' },
          { header: 'Customer', key: 'customer' },
          { header: 'Bank Name', key: 'bank' },
          { header: 'Status', key: 'status' },
          { header: 'Amount', key: 'amount', isMoney: true },
        ]
        const { data, error } = await supabase
          .from('customer_cheques')
          .select('id, cheque_number, cheque_date, amount, bank_name, status, customers(name)')
          .eq('status', 'deposited')
          .order('cheque_date', { ascending: false })
        if (error) throw error
        rows = (data || []).map((c) => ({
          date: c.cheque_date ? new Date(c.cheque_date).toLocaleDateString() : '-',
          cheque_number: c.cheque_number || '-',
          customer: c.customers?.name || '-',
          bank: c.bank_name || '-',
          status: 'Deposited',
          amount: Number(c.amount || 0),
        }))
        const total = rows.reduce((s, r) => s + r.amount, 0)
        summaryTotal = `Deposited Total: Rs. ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      } else if (key === 'returnAmount') {
        title = 'Sales Returns Report'
        filename = `Sales_Returns_${todayStr}.pdf`
        columns = [
          { header: 'Return Date', key: 'date' },
          { header: 'Return No', key: 'return_number' },
          { header: 'Invoice No', key: 'invoice_number' },
          { header: 'Customer', key: 'customer' },
          { header: 'Reason', key: 'reason' },
          { header: 'Return Amount', key: 'amount', isMoney: true },
        ]
        const { data, error } = await supabase
          .from('returns')
          .select('id, return_number, total_amount, created_at, reason, customers(name), invoices(invoice_number)')
          .order('created_at', { ascending: false })
        if (error) throw error
        rows = (data || []).map((r) => ({
          date: r.created_at ? new Date(r.created_at).toLocaleDateString() : '-',
          return_number: r.return_number || `RET-${r.id}`,
          invoice_number: r.invoices?.invoice_number || '-',
          customer: r.customers?.name || '-',
          reason: r.reason || '-',
          amount: Number(r.total_amount || 0),
        }))
        const total = rows.reduce((s, r) => s + r.amount, 0)
        summaryTotal = `Total Returns: Rs. ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      } else if (key === 'payable') {
        title = 'Vendor Payables Report'
        filename = `Vendor_Payables_${todayStr}.pdf`
        columns = [
          { header: 'Vendor Name', key: 'vendor' },
          { header: 'Phone', key: 'phone' },
          { header: 'Total Purchases', key: 'total_purchases', isMoney: true },
          { header: 'Total Paid', key: 'total_paid', isMoney: true },
          { header: 'Outstanding Balance', key: 'balance', isMoney: true },
        ]
        const [pRes, payRes, vRes] = await Promise.all([
          supabase.from('purchases').select('id, vendor_id, total_amount, status'),
          supabase.from('purchase_payments').select('id, purchase_id, amount'),
          supabase.from('vendors').select('id, name, phone, email'),
        ])
        const activePurchases = (pRes.data || []).filter((p) => !['reversed','cancelled','canceled','deleted','void'].includes(String(p.status || '').toLowerCase()))
        const vendorMap = new Map()
        for (const v of vRes.data || []) {
          vendorMap.set(v.id, { vendor: v.name, phone: v.phone || '-', total_purchases: 0, total_paid: 0 })
        }
        const purchaseVendorMap = new Map()
        for (const p of activePurchases) {
          if (p.vendor_id) {
            purchaseVendorMap.set(p.id, p.vendor_id)
            if (!vendorMap.has(p.vendor_id)) {
              vendorMap.set(p.vendor_id, { vendor: 'Vendor #' + p.vendor_id, phone: '-', total_purchases: 0, total_paid: 0 })
            }
            vendorMap.get(p.vendor_id).total_purchases += Number(p.total_amount || 0)
          }
        }
        for (const pay of payRes.data || []) {
          const vid = purchaseVendorMap.get(pay.purchase_id)
          if (vid && vendorMap.has(vid)) {
            vendorMap.get(vid).total_paid += Number(pay.amount || 0)
          }
        }
        rows = [...vendorMap.values()]
          .map((v) => ({
            ...v,
            balance: Math.max(0, v.total_purchases - v.total_paid),
          }))
          .filter((v) => v.balance > 0 || v.total_purchases > 0)
        summaryTotal = `Total Outstanding Payable: Rs. ${Number(stats.payable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      } else if (key === 'products') {
        title = 'Products Inventory Report'
        filename = `Products_Inventory_${todayStr}.pdf`
        columns = [
          { header: 'Code', key: 'code' },
          { header: 'Product Name', key: 'name' },
          { header: 'Category', key: 'category' },
          { header: 'Stock Qty', key: 'stock', align: 'right' },
          { header: 'Cost Price', key: 'cost_price', isMoney: true },
          { header: 'Selling Price', key: 'price', isMoney: true },
          { header: 'Active', key: 'status' },
        ]
        const { data, error } = await supabase
          .from('products')
          .select('id, code, name, category, stock_quantity, cost_price, price, is_active')
          .order('name', { ascending: true })
        if (error) throw error
        rows = (data || []).map((pr) => ({
          code: pr.code || '-',
          name: pr.name,
          category: pr.category || '-',
          stock: Number(pr.stock_quantity ?? 0),
          cost_price: Number(pr.cost_price ?? 0),
          price: Number(pr.price ?? 0),
          status: pr.is_active ? 'Yes' : 'No',
        }))
        summaryTotal = `Total Products: ${rows.length}`
      } else if (key === 'customers') {
        title = 'Customers Directory Report'
        filename = `Customers_Report_${todayStr}.pdf`
        columns = [
          { header: 'Customer Name', key: 'name' },
          { header: 'Phone', key: 'phone' },
          { header: 'Email', key: 'email' },
          { header: 'City', key: 'city' },
          { header: 'Credit Limit', key: 'credit_limit', isMoney: true },
          { header: 'Active', key: 'status' },
        ]
        const { data, error } = await supabase
          .from('customers')
          .select('id, name, phone, email, city, credit_limit, is_active')
          .order('name', { ascending: true })
        if (error) throw error
        rows = (data || []).map((c) => ({
          name: c.name,
          phone: c.phone || '-',
          email: c.email || '-',
          city: c.city || '-',
          credit_limit: c.credit_limit ? Number(c.credit_limit) : 0,
          status: c.is_active ? 'Yes' : 'No',
        }))
        summaryTotal = `Total Customers: ${rows.length}`
      } else if (key === 'monthlyProfitLoss') {
        title = 'Monthly Profit & Loss Report'
        filename = `Monthly_Profit_Loss_${todayStr}.pdf`
        columns = [
          { header: 'Month', key: 'month' },
          { header: 'Sales Amount', key: 'sales', isMoney: true },
          { header: 'Purchase / COGS', key: 'purchase', isMoney: true },
          { header: 'Gross Profit', key: 'profit', isMoney: true },
          { header: 'Profit Margin', key: 'margin', align: 'right' },
        ]
        rows = (monthSeries.labels || []).map((lbl, idx) => {
          const s = Number(monthSeries.sales[idx] || 0)
          const c = Number(monthSeries.purchase[idx] || 0)
          const p = Number(monthSeries.profit[idx] || 0)
          const margin = s > 0 ? ((p / s) * 100).toFixed(2) + '%' : '0%'
          return {
            month: lbl,
            sales: s,
            purchase: c,
            profit: p,
            margin,
          }
        })
        summaryTotal = `Current Month Profit: Rs. ${Number(stats.monthlyProfitLoss || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      }

      await generateAndDownloadPdf({
        title,
        filename,
        columns,
        rows,
        summaryTotal,
        displayName,
      })
      toast.success(`${label} PDF report downloaded successfully!`)
    } catch (err) {
      console.error(`Failed to download report for ${key}:`, err)
      toast.error(`Failed to download ${label} report: ${err.message || 'Error generating PDF'}`)
    } finally {
      setDownloadingKey(null)
    }
  }

  const receivableSegments = useMemo(() => {
    return [
      { label: 'Due', value: receivable.due, color: 'rgba(255,255,255,0.95)' },
      { label: 'Current Month', value: receivable.currentMonth, color: 'rgba(148,163,184,0.65)' },
      { label: 'Received', value: receivable.received, color: 'rgba(148,163,184,0.30)' },
    ]
  }, [receivable])

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const months = buildLast12Months()
      const oldestMonthStart = new Date(months[0].key + '-01T00:00:00.000Z')
      const monthStart = new Date(todayStart)
      monthStart.setDate(1)

      const payChequeRes = supabase
        .from('purchase_payments')
        .select('id, amount, paid_at, reference, method, created_at, purchases(vendor_id, vendors(name))')
        .eq('method', 'cheque')
        .order('paid_at', { ascending: false })
        .limit(10)

      const [productsRes, customersRes, todayPaymentsRes, totalExpensesRes, totalSalesRes, totalPaymentsRes, recentInvRes, allPayRes, recentPayRes, invForChartsRes, payForChartsRes, invItemsForProfitRes, purchaseItemsRes, chequeInHandRes, returnChequeRes, depositedChequeRes, returnsRes, payableRes, purchasePaymentsRes, journalEntryLinesRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase
          .from('invoice_payments')
          .select('amount, paid_at, method')
          .gte('paid_at', todayStart.toISOString())
          .lte('paid_at', todayEnd.toISOString()),
        supabase
          .from('journals')
          .select('budget, s_balance, h_balance'),
        supabase.from('invoices').select('id, customer_id, total_amount, created_at, payment_type'),
        supabase.from('invoice_payments').select('invoice_id, amount, method'),
        supabase
          .from('customer_cheques')
          .select('id, customer_id, cheque_date, cheque_number, amount, bank_name, status, customers(name)')
          .eq('status', 'in_hand')
          .order('cheque_date', { ascending: false })
          .limit(15),
        supabase
          .from('invoice_payments')
          .select('invoice_id, amount, method, reference, invoices(customer_id)'),
        (() => {
          const tenDaysAgo = new Date()
          tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
          tenDaysAgo.setHours(0, 0, 0, 0)
          return supabase
            .from('invoice_payments')
            .select('id, invoice_id, amount, paid_at, method, bank_name, reference, note, created_at, invoices(invoice_number, customer_id, customers(name))')
            .gte('paid_at', tenDaysAgo.toISOString())
            .order('paid_at', { ascending: false })
            .limit(10)
        })(),
        supabase
          .from('invoices')
          .select('id, total_amount, created_at')
          .gte('created_at', oldestMonthStart.toISOString()),
        supabase
          .from('invoice_payments')
          .select('id, amount, paid_at')
          .gte('paid_at', oldestMonthStart.toISOString()),
        supabase
          .from('invoice_items')
          .select('product_id, quantity, price, discount, total, invoices(created_at)')
          .gte('invoices.created_at', oldestMonthStart.toISOString()),
        supabase
          .from('purchase_items')
          .select('product_id, cost, purchases(created_at, status)')
          .order('id', { ascending: false })
          .limit(5000),
        supabase
          .from('customer_cheques')
          .select('id, customer_id, cheque_number, amount')
          .eq('status', 'in_hand'),
        supabase
          .from('customer_cheques')
          .select('id, customer_id, cheque_number, amount')
          .eq('status', 'returned'),
        supabase
          .from('customer_cheques')
          .select('id, customer_id, cheque_number, amount')
          .eq('status', 'deposited'),
        supabase
          .from('returns')
          .select('invoice_id, customer_id, total_amount, created_at'),
        supabase
          .from('purchases')
          .select('total_amount, status'),
        supabase
          .from('purchase_payments')
          .select('amount'),
        supabase.from('journal_entry_lines').select('debit, credit'),
      ])

      if (!mounted) return

      const payChequeData = await payChequeRes

      const todayPayments = (todayPaymentsRes.data ?? []).filter(row => row.method !== 'cheque').reduce((sum, row) => sum + (row.amount ?? 0), 0)
      const journalsExpenses = (totalExpensesRes.data ?? []).reduce((sum, row) => sum + (Number(row.budget ?? 0) + Number(row.s_balance ?? 0) + Number(row.h_balance ?? 0)), 0)
      const journalEntriesExpenses = (journalEntryLinesRes.data ?? []).reduce((sum, row) => sum + (Number(row.debit ?? 0)), 0)
      const totalExpenses = journalsExpenses + journalEntriesExpenses
      const totalSales = (totalSalesRes.data ?? []).reduce((sum, row) => sum + (row.total_amount ?? 0), 0)
      const totalPayments = (totalPaymentsRes.data ?? []).filter(row => row.method !== 'cheque').reduce((sum, row) => sum + (row.amount ?? 0), 0)
      const allReceivablePayments = (totalPaymentsRes.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)

      const chequePaymentAmounts = new Map()
      for (const payment of allPayRes.data ?? []) {
        if (payment.method !== 'cheque' || !payment.reference) continue
        const customerId = payment.invoices?.customer_id
        if (!customerId) continue
        const key = `${customerId}|${payment.reference}`
        chequePaymentAmounts.set(key, (chequePaymentAmounts.get(key) ?? 0) + Number(payment.amount ?? 0))
      }

      const resolvedChequeAmount = (cheque) => {
        const key = `${cheque.customer_id}|${cheque.cheque_number}`
        return chequePaymentAmounts.has(key)
          ? chequePaymentAmounts.get(key)
          : Number(cheque.amount ?? 0)
      }
      const chequeInHand = (chequeInHandRes.data ?? []).reduce((sum, row) => sum + resolvedChequeAmount(row), 0)
      const returnCheque = (returnChequeRes.data ?? []).reduce((sum, row) => sum + resolvedChequeAmount(row), 0)
      const depositedCheques = (depositedChequeRes.data ?? []).reduce((sum, row) => sum + resolvedChequeAmount(row), 0)
      const receivedPayments = Math.max(0, allReceivablePayments - returnCheque)
      const returnAmount = (returnsRes.data ?? []).reduce((sum, row) => sum + (row.total_amount ?? 0), 0)
      const totalPurchases = (payableRes.data ?? []).filter((row) => !['reversed','cancelled','canceled','deleted','void'].includes(String(row.status ?? '').toLowerCase())).reduce((sum, row) => sum + (row.total_amount ?? 0), 0)
      const totalPurchasePayments = (purchasePaymentsRes.data ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0)
      const payable = Math.max(0, totalPurchases - totalPurchasePayments)

      setReceivableCheques((recentInvRes.data ?? []).map((cheque) => ({
        ...cheque,
        amount: resolvedChequeAmount(cheque),
      })))
      setRecentPayments(recentPayRes.data ?? [])
      if (payChequeData.error) console.error('Payable cheques load error:', payChequeData.error)
      setPayableCheques(payChequeData.data ?? [])

      // Monthly series (last 12 months)
      // Build cost timeline per product: [{date, cost}] sorted oldest-first
      const costTimelineByProduct = new Map()
      for (const pi of [...(purchaseItemsRes.data ?? [])].reverse()) {
        if (['reversed','cancelled','canceled','deleted','void'].includes(String(pi.purchases?.status ?? '').toLowerCase())) continue
        const pid = pi.product_id
        if (!pid) continue
        const date = pi.purchases?.created_at
        if (!date) continue
        if (!costTimelineByProduct.has(pid)) costTimelineByProduct.set(pid, [])
        costTimelineByProduct.get(pid).push({ date: new Date(date), cost: Number(pi.cost ?? 0) })
      }

      // For a given product and sale date, find the cost that was active at that time
      const getCostAtDate = (productId, saleDate) => {
        const timeline = costTimelineByProduct.get(productId)
        if (!timeline || timeline.length === 0) return 0
        const sale = new Date(saleDate)
        let cost = timeline[0].cost // default to earliest cost
        for (const entry of timeline) {
          if (entry.date <= sale) cost = entry.cost
          else break
        }
        return cost
      }

      const salesByMonth = new Map(months.map((m) => [m.key, 0]))
      for (const inv of invForChartsRes.data ?? []) {
        const created = inv?.created_at
        if (!created) continue
        const k = monthKeyFromDate(created)
        if (!salesByMonth.has(k)) continue
        salesByMonth.set(k, (salesByMonth.get(k) ?? 0) + Number(inv.total_amount ?? 0))
      }

      const purchaseByMonth = new Map(months.map((m) => [m.key, 0]))
      for (const it of invItemsForProfitRes.data ?? []) {
        const created = it?.invoices?.created_at
        if (!created) continue
        const k = monthKeyFromDate(created)
        if (!purchaseByMonth.has(k)) continue

        const qty = Number(it.quantity ?? 0)
        const price = Number(it.price ?? 0)
        const discPct = Number(it.discount ?? 0)
        const discAmt = qty * price * (discPct / 100)
        const cost = getCostAtDate(it.product_id, created)
        const purchase = qty * cost
        purchaseByMonth.set(k, (purchaseByMonth.get(k) ?? 0) + purchase)
      }

      const labels = months.map((m) => m.label)
      const sales = months.map((m) => salesByMonth.get(m.key) ?? 0)
      const purchase = months.map((m) => purchaseByMonth.get(m.key) ?? 0)
      const profit = sales.map((s, i) => Number(s ?? 0) - Number(purchase[i] ?? 0))

      setMonthSeries({ labels, sales, purchase, profit })

      const nowLabel = new Date().toLocaleString(undefined, { month: 'short' })
      const currentMonthIdx = labels.findIndex((l) => l === nowLabel)
      const curMonthSales = currentMonthIdx >= 0 ? Number(sales[currentMonthIdx] ?? 0) : 0
      const curMonthPurchase = currentMonthIdx >= 0 ? Number(purchase[currentMonthIdx] ?? 0) : 0
      const monthlyProfitLoss = curMonthSales - curMonthPurchase

      setStats({
        products: productsRes.count ?? 0,
        customers: customersRes.count ?? 0,
        totalPurchase: totalPurchases,
        totalExpenses,
        totalSales,
        totalPayments,
        chequeInHand,
        returnCheque,
        depositedCheques,
        returnAmount,
        payable,
        monthlyProfitLoss,
      })

      // Receivable summary
      const due = buildInvoiceBalanceRows(totalSalesRes.data ?? [], totalPaymentsRes.data ?? [], returnsRes.data ?? [])
        .filter((invoice) => String(invoice.payment_type).toLowerCase() === 'credit')
        .reduce((sum, invoice) => sum + invoice.balance, 0) + returnCheque
      const currentMonthSales = (invForChartsRes.data ?? [])
        .filter((inv) => new Date(inv.created_at) >= monthStart)
        .reduce((s, inv) => s + Number(inv.total_amount ?? 0), 0)
      setReceivable({
        due,
        currentMonth: currentMonthSales,
        received: receivedPayments,
      })
      setLoading(false)
    }

    load().catch((e) => {
      console.error(e)
      setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [])

  const currentMonthIdx = useMemo(() => {
    const nowLabel = new Date().toLocaleString(undefined, { month: 'short' })
    return monthSeries.labels.findIndex((l) => l === nowLabel)
  }, [monthSeries.labels])

  const currentMonthSales = currentMonthIdx >= 0 ? Number(monthSeries.sales[currentMonthIdx] ?? 0) : 0
  const currentMonthPurchase = currentMonthIdx >= 0 ? Number(monthSeries.purchase[currentMonthIdx] ?? 0) : 0
  const currentMonthProfit = currentMonthSales - currentMonthPurchase
  const profitPct = currentMonthSales > 0 ? (currentMonthProfit / currentMonthSales) * 100 : 0

  const areaSeries = useMemo(() => {
    return [
      { name: 'Sales', data: monthSeries.sales },
      { name: 'Profit', data: monthSeries.profit },
    ]
  }, [monthSeries.sales, monthSeries.profit])

  const areaOptions = useMemo(() => {
    return {
      chart: {
        type: 'area',
        toolbar: { show: false },
        background: 'transparent',
        foreColor: 'rgba(226,232,240,0.85)',
      },
      stroke: { curve: 'smooth', width: 2 },
      dataLabels: { enabled: false },
      fill: { type: 'solid', opacity: 0.35 },
      colors: ['#ffffff', '#94a3b8'],
      grid: {
        borderColor: 'rgba(148,163,184,0.16)',
        strokeDashArray: 4,
        xaxis: { lines: { show: true } },
        yaxis: { lines: { show: true } },
      },
      xaxis: {
        categories: monthSeries.labels,
        labels: { style: { colors: 'rgba(148,163,184,0.85)', fontWeight: 700 } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          formatter: (v) => {
            const n = Number(v || 0)
            return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n.toFixed(0)}`
          },
          style: { colors: 'rgba(148,163,184,0.85)', fontWeight: 700 },
        },
      },
      tooltip: {
        theme: 'dark',
        y: {
          formatter: (v) => fmtMoney(v),
        },
      },
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        labels: { colors: 'rgba(226,232,240,0.9)' },
      },
    }
  }, [monthSeries.labels])

  const donutSeries = useMemo(() => receivableSegments.map((s) => Number(s.value ?? 0)), [receivableSegments])
  const donutOptions = useMemo(() => {
    return {
      chart: { type: 'donut', background: 'transparent', foreColor: 'rgba(226,232,240,0.85)' },
      labels: receivableSegments.map((s) => s.label),
      colors: receivableSegments.map((s) => s.color),
      stroke: { width: 0 },
      dataLabels: { enabled: false },
      legend: { show: false },
      tooltip: {
        theme: 'dark',
        y: { formatter: (v) => fmtMoney(v) },
        custom: ({ series, seriesIndex, w }) => {
          const label = w?.globals?.labels?.[seriesIndex] ?? ''
          const value = series?.[seriesIndex]
          return `
            <div style="background:#0b1220;color:#ffffff;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,0.25);box-shadow:0 10px 25px rgba(0,0,0,0.35);">
              <div style="font-size:11px;font-weight:800;letter-spacing:0.03em;color:rgba(226,232,240,0.9);text-transform:uppercase;">${label}</div>
              <div style="margin-top:2px;font-size:13px;font-weight:900;color:#ffffff;">${fmtMoney(value)}</div>
            </div>
          `.trim()
        },
      },
      plotOptions: {
        pie: {
          donut: {
            size: '62%',
            labels: {
              show: true,
              name: { show: true, color: 'rgba(148,163,184,0.9)', fontSize: '11px', fontWeight: 800 },
              value: {
                show: true,
                color: '#fff',
                fontSize: '14px',
                fontWeight: 900,
                formatter: (v) => fmtMoney(v),
              },
              total: {
                show: true,
                label: 'TOTAL',
                color: 'rgba(148,163,184,0.9)',
                fontSize: '11px',
                fontWeight: 900,
                formatter: () => fmtMoney(donutSeries.reduce((s, x) => s + Number(x || 0), 0)),
              },
            },
          },
        },
      },
    }
  }, [receivableSegments, donutSeries])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  const visibleStatCards = statConfig.filter((cfg) => show(`stat_${cfg.key}`))

  return (
    <div className="space-y-6">
      {show('welcome') && (
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 dark:from-emerald-950/60 dark:via-slate-950/60 dark:to-emerald-950/60 rounded-2xl p-6 shadow-lg dark:border dark:border-emerald-400/15">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-white">Welcome back, {displayName}</h1>
              <p className="text-slate-400 dark:text-emerald-100/60 text-sm mt-1">Tiny Bloom</p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400 dark:text-emerald-100/50">
                <Calendar size={12} />
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} &middot; {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            {show('quick_create_order') && (
              <PermissionGate module="orders" action="create">
                <Link
                  to="/orders/new"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white dark:bg-emerald-950/40 dark:text-emerald-50 dark:border dark:border-emerald-400/15 text-slate-900 hover:bg-slate-100 dark:hover:bg-emerald-500/10 transition-colors shadow-md"
                >
                  <Plus size={16} />
                  Create Order
                </Link>
              </PermissionGate>
            )}
          </div>
        </div>
      )}

      {visibleStatCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleStatCards.map((cfg) => (
            <StatCard
              key={cfg.key}
              label={cfg.label}
              value={stats[cfg.key]}
              icon={cfg.icon}
              gradient={cfg.gradient}
              iconBg={cfg.iconBg}
              textColor={cfg.textColor}
              valueColor={cfg.valueColor}
              subColor={cfg.subColor}
              isCurrency={cfg.isCurrency}
              extraSub={cfg.key === 'monthlyProfitLoss' && currentMonthSales > 0 ? `${profitPct.toFixed(1)}% margin` : null}
              onDownload={() => handleDownloadReport(cfg.key, cfg.label)}
              isDownloading={downloadingKey === cfg.key}
            />
          ))}
        </div>
      )}

      {(show('chart_sales_profit') || show('chart_receivable')) && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {show('chart_sales_profit') && (
        <div className={`${show('chart_receivable') ? 'lg:col-span-2' : 'lg:col-span-3'} rounded-2xl overflow-hidden shadow-sm border border-slate-200/60 dark:border-emerald-400/15 bg-white dark:bg-emerald-950/25`}>
          <div className="p-5 flex items-start justify-between border-b border-slate-100 dark:border-emerald-900/40">
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Sales & Profit</div>
              <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Last 12 months</div>
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-emerald-100/60">Amounts are exact (hover on chart)</div>
          </div>
          <div className="p-4">
            <div className="rounded-xl overflow-hidden border border-slate-200/60 dark:border-emerald-900/40 bg-slate-900/90">
              <Chart options={areaOptions} series={areaSeries} type="area" height={260} />
            </div>
            {show('chart_month_summary') && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div className="rounded-xl border border-slate-200/60 dark:border-emerald-900/40 bg-white/60 dark:bg-emerald-950/15 px-4 py-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">Current Month Sales</div>
                <div className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">{fmtMoney(currentMonthSales)}</div>
              </div>
              <div className="rounded-xl border border-slate-200/60 dark:border-emerald-900/40 bg-white/60 dark:bg-emerald-950/15 px-4 py-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">Current Month Purchase</div>
                <div className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">{fmtMoney(currentMonthPurchase)}</div>
              </div>
              <div className="rounded-xl border border-slate-200/60 dark:border-emerald-900/40 bg-white/60 dark:bg-emerald-950/15 px-4 py-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">Profit Percentage</div>
                <div className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">{profitPct.toFixed(2)}%</div>
              </div>
            </div>
            )}
          </div>
        </div>
        )}

        {show('chart_receivable') && (
        <div className={`rounded-2xl overflow-hidden shadow-sm border border-slate-200/60 dark:border-emerald-400/15 bg-white dark:bg-emerald-950/25 ${show('chart_sales_profit') ? '' : 'lg:col-span-3'}`}>
          <div className="p-5 border-b border-slate-100 dark:border-emerald-900/40">
            <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Customer Receivable</div>
            <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Due / Current Month / Received</div>
          </div>
          <div className="p-5 flex flex-col items-center gap-4">
            <div className="rounded-xl overflow-hidden border border-slate-200/60 dark:border-emerald-900/40 bg-slate-900/90">
              <Chart options={donutOptions} series={donutSeries} type="donut" width={260} />
            </div>
            <div className="w-full space-y-2">
              {receivableSegments.map((s) => (
                <div key={s.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-extrabold text-slate-900 dark:text-white">{fmtMoney(s.value)}</div>
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-300 w-[64px] text-right">
                      {(() => {
                        const total = receivableSegments.reduce((sum, r) => sum + Math.max(0, Number(r.value ?? 0)), 0)
                        const pct = total > 0 ? (Number(s.value ?? 0) / total) * 100 : 0
                        return `${pct.toFixed(2)}%`
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>
      )}

      {(show('table_receivable_cheques') || show('table_customer_payments')) && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {show('table_receivable_cheques') && (
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
          <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-emerald-900/40">
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Receivable Cheques</div>
              <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Cheques in hand</div>
            </div>
            <Link
              to="/finance/cheques"
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors dark:text-emerald-100/75 dark:hover:text-emerald-50"
            >
              View All
              <ArrowUpRight size={14} />
            </Link>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Cheque #</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Due Date</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {receivableCheques.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center" colSpan={5}>
                    <div className="flex flex-col items-center gap-2">
                      <Landmark size={32} className="text-slate-300 dark:text-emerald-200/30" />
                      <span>No cheques in hand</span>
                    </div>
                  </td>
                </tr>
              ) : (
                receivableCheques.map((ch) => {
                  const dueDate = ch.cheque_date ? new Date(`${String(ch.cheque_date).slice(0, 10)}T00:00:00`) : null
                  const today = new Date()
                  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
                  const diffDays = dueDate ? Math.floor((dueDate.getTime() - startToday.getTime()) / 86400000) : null
                  const daysLabel = diffDays === null ? '-' : diffDays < 0 ? `${Math.abs(diffDays)}d passed` : diffDays === 0 ? 'Today' : `${diffDays}d left`
                  const daysColor = diffDays === null ? 'text-slate-400' : diffDays < 0 ? 'text-rose-500' : diffDays <= 3 ? 'text-amber-500' : 'text-emerald-500'
                  return (
                    <tr key={ch.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-emerald-50">{ch.cheque_number || '-'}</div>
                        <div className="text-xs text-slate-400 dark:text-emerald-100/50">{ch.bank_name || '-'}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{ch.customers?.name ?? '-'}</td>
                      <td className="px-5 py-3.5">
                        <div className="text-slate-700 dark:text-emerald-50">{ch.cheque_date ? String(ch.cheque_date).slice(0, 10) : '-'}</div>
                        <div className={`text-xs font-semibold ${daysColor}`}>{daysLabel}</div>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">Rs. {Number(ch.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          to="/finance/cheques"
                          className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-emerald-100/75 hover:text-slate-900 dark:hover:text-emerald-50 font-medium transition-colors"
                        >
                          <Eye size={14} />
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        {show('table_customer_payments') && (
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
          <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-emerald-900/40">
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Customer Payments</div>
              <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Payments from the last 10 days</div>
            </div>
            <Link
              to="/finance/receivables"
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors dark:text-emerald-100/75 dark:hover:text-emerald-50"
            >
              View All
              <ArrowUpRight size={14} />
            </Link>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Customer</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Method</th>
                <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center" colSpan={5}>
                    <div className="flex flex-col items-center gap-2">
                      <Wallet size={32} className="text-slate-300 dark:text-emerald-200/30" />
                      <span>No payments yet.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                recentPayments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer dark:border-emerald-900/30 dark:hover:bg-emerald-500/5" onClick={() => { setDetailPayment(p); setDetailOpen(true) }}>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900 dark:text-emerald-50">{p.invoices?.customers?.name ?? '-'}</div>
                      <div className="text-xs text-slate-400 dark:text-emerald-100/50">INV-{String(p.invoices?.invoice_number ?? '').padStart(4, '0')}</div>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">Rs. {Number(p.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-emerald-500/15 dark:text-emerald-100">{(p.method ?? 'other').toUpperCase()}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">{new Date(p.paid_at ?? p.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDetailPayment(p); setDetailOpen(true) }}
                        className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-emerald-100/75 hover:text-slate-900 dark:hover:text-emerald-50 font-medium transition-colors"
                      >
                        <Eye size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>
      )}

      {show('table_payable_cheques') && (
      <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-emerald-900/40">
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-emerald-50">Payable Cheques</div>
            <div className="text-xs text-slate-400 dark:text-emerald-100/60 mt-0.5">Vendor cheques deposited</div>
          </div>
          <Link
            to="/finance/cheques"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors dark:text-emerald-100/75 dark:hover:text-emerald-50"
          >
            View All
            <ArrowUpRight size={14} />
          </Link>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 dark:bg-emerald-950/35 dark:border-emerald-900/40">
              <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Vendor</th>
              <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Cheque #</th>
              <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Amount</th>
              <th className="text-left font-semibold text-slate-600 dark:text-emerald-100/80 px-5 py-3 text-xs uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody>
            {payableCheques.length === 0 ? (
              <tr>
                <td className="px-5 py-12 text-slate-400 dark:text-emerald-100/60 text-center" colSpan={4}>
                  <div className="flex flex-col items-center gap-2">
                    <Landmark size={32} className="text-slate-300 dark:text-emerald-200/30" />
                    <span>No payable cheques</span>
                  </div>
                </td>
              </tr>
            ) : (
              payableCheques.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-slate-900 dark:text-emerald-50">{c.purchases?.vendors?.name ?? '-'}</div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/70">{c.reference ?? '-'}</td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">Rs. {Number(c.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-emerald-100/60">{new Date(c.paid_at ?? c.created_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Payment Detail Modal */}
      {detailOpen && detailPayment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setDetailOpen(false)}>
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white">Payment Details</div>
              <button
                onClick={() => setDetailOpen(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Customer</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{detailPayment.invoices?.customers?.name ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Invoice</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">INV-{String(detailPayment.invoices?.invoice_number ?? '').padStart(4, '0')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Amount</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">Rs. {Number(detailPayment.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Method</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{(detailPayment.method ?? 'other').toUpperCase()}</span>
              </div>
              {detailPayment.bank_name ? (
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Bank</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{detailPayment.bank_name}</span>
                </div>
              ) : null}
              {detailPayment.reference ? (
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Reference</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{detailPayment.reference}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Paid At</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{new Date(detailPayment.paid_at ?? detailPayment.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Recorded At</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{new Date(detailPayment.created_at).toLocaleString()}</span>
              </div>
              {detailPayment.note ? (
                <div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Note</span>
                  <div className="mt-1 text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">{detailPayment.note}</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

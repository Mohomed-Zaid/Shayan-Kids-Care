import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { ScrollText, Search, Filter, Loader2, User, FileText, Trash2, Edit3, PlusCircle, LogIn, LogOut, Truck, ArrowRightLeft, XCircle, CheckCircle, ShoppingCart, Package, Users, Building2, BookOpen, Wallet, RotateCcw, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

const ACTION_ICONS = {
  login: LogIn, logout: LogOut,
  create_order: ShoppingCart, confirm_order: CheckCircle, cancel_order: XCircle, delete_order: Trash2, edit_order: Edit3, deliver_order: Truck, invoice_order: ArrowRightLeft,
  create_invoice: FileText, delete_invoice: Trash2, edit_invoice: Edit3,
  create_product: PlusCircle, delete_product: Trash2, edit_product: Edit3,
  create_customer: PlusCircle, delete_customer: Trash2, edit_customer: Edit3,
  create_vendor: PlusCircle, delete_vendor: Trash2, edit_vendor: Edit3,
  create_employee: PlusCircle, delete_employee: Trash2, edit_employee: Edit3,
  create_purchase: Package, delete_purchase: Trash2,
  create_return: RotateCcw, delete_return: Trash2,
  create_journal: BookOpen, delete_journal: Trash2, edit_journal: Edit3,
  create_journal_entry: BookOpen, delete_journal_entry: Trash2,
  save_payment: Wallet, delete_payment: Trash2, edit_payment: Edit3,
  save_purchase_payment: Wallet, delete_purchase_payment: Trash2, edit_purchase_payment: Edit3,
  backup_export: FileText, backup_restore: FileText,
}

const ACTION_COLORS = {
  login: 'text-green-600 bg-green-50 dark:text-green-300 dark:bg-green-900/30',
  logout: 'text-slate-600 bg-slate-50 dark:text-slate-300 dark:bg-slate-800',
  create_order: 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30',
  confirm_order: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30',
  cancel_order: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  delete_order: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  edit_order: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
  deliver_order: 'text-green-600 bg-green-50 dark:text-green-300 dark:bg-green-900/30',
  invoice_order: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30',
  create_invoice: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30',
  delete_invoice: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  edit_invoice: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
  create_product: 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30',
  delete_product: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  edit_product: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
  create_customer: 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30',
  delete_customer: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  edit_customer: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
  create_vendor: 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30',
  delete_vendor: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  edit_vendor: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
  create_employee: 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30',
  delete_employee: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  edit_employee: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
  create_purchase: 'text-purple-600 bg-purple-50 dark:text-purple-300 dark:bg-purple-900/30',
  delete_purchase: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  create_return: 'text-orange-600 bg-orange-50 dark:text-orange-300 dark:bg-orange-900/30',
  delete_return: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  create_journal: 'text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-900/30',
  delete_journal: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  edit_journal: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
  create_journal_entry: 'text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-900/30',
  delete_journal_entry: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  save_payment: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30',
  delete_payment: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  edit_payment: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
  save_purchase_payment: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30',
  delete_purchase_payment: 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
  edit_purchase_payment: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
  backup_export: 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30',
  backup_restore: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
}

const ACTION_LABELS = {
  login: 'Login', logout: 'Logout',
  create_order: 'Created Order', confirm_order: 'Confirmed Order', cancel_order: 'Cancelled Order', delete_order: 'Deleted Order', edit_order: 'Edited Order', deliver_order: 'Delivered Order', invoice_order: 'Invoiced Order',
  create_invoice: 'Created Invoice', delete_invoice: 'Deleted Invoice', edit_invoice: 'Edited Invoice',
  create_product: 'Created Product', delete_product: 'Deleted Product', edit_product: 'Edited Product',
  create_customer: 'Created Customer', delete_customer: 'Deleted Customer', edit_customer: 'Edited Customer',
  create_vendor: 'Created Vendor', delete_vendor: 'Deleted Vendor', edit_vendor: 'Edited Vendor',
  create_employee: 'Created Employee', delete_employee: 'Deleted Employee', edit_employee: 'Edited Employee',
  create_purchase: 'Created Purchase', delete_purchase: 'Deleted Purchase',
  create_return: 'Created Return', delete_return: 'Deleted Return',
  create_journal: 'Created Journal', delete_journal: 'Deleted Journal', edit_journal: 'Edited Journal',
  create_journal_entry: 'Created Journal Entry', delete_journal_entry: 'Deleted Journal Entry',
  save_payment: 'Saved Payment', delete_payment: 'Deleted Payment', edit_payment: 'Edited Payment',
  save_purchase_payment: 'Saved Vendor Payment', delete_purchase_payment: 'Deleted Vendor Payment', edit_purchase_payment: 'Edited Vendor Payment',
  backup_export: 'Exported Backup', backup_restore: 'Restored Backup',
}

const CATEGORY_COLORS = {
  auth: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  order: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  invoice: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  product: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  customer: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  vendor: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  employee: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  purchase: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  return: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  journal: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  payment: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  backup: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const FILTER_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login / Logout' },
  { value: 'order', label: 'Orders' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'product', label: 'Products' },
  { value: 'customer', label: 'Customers' },
  { value: 'vendor', label: 'Vendors' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'payment', label: 'Payments' },
  { value: 'return', label: 'Returns' },
  { value: 'journal', label: 'Journals' },
  { value: 'delete', label: 'Deletions' },
]

function getCategory(action) {
  if (action === 'login' || action === 'logout') return 'auth'
  if (action.includes('order')) return 'order'
  if (action.includes('invoice')) return 'invoice'
  if (action.includes('product')) return 'product'
  if (action.includes('customer')) return 'customer'
  if (action.includes('vendor')) return 'vendor'
  if (action.includes('employee')) return 'employee'
  if (action.includes('purchase')) return 'purchase'
  if (action.includes('return')) return 'return'
  if (action.includes('journal')) return 'journal'
  if (action.includes('payment')) return 'payment'
  if (action.includes('backup')) return 'backup'
  return 'order'
}

function getCategoryLabel(cat) {
  const labels = { auth: 'Auth', order: 'Order', invoice: 'Invoice', product: 'Product', customer: 'Customer', vendor: 'Vendor', employee: 'Employee', purchase: 'Purchase', return: 'Return', journal: 'Journal', payment: 'Payment', backup: 'Backup' }
  return labels[cat] ?? cat
}

function getDateLabel(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const logDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (logDay.getTime() === today.getTime()) return 'Today'
  if (logDay.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AuditLogPage() {
  const toast = useToast()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const RETENTION_DAYS = 90

  const cleanupOldLogs = async () => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString()
    await supabase.from('audit_logs').delete().lt('created_at', cutoff)
  }

  const load = async () => {
    setLoading(true)
    await cleanupOldLogs()
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    const { data, error } = await query
    if (error) { toast.error(error.message); setLogs([]) }
    else setLogs(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  const users = useMemo(() => [...new Set(logs.map((l) => l.user_name))].sort(), [logs])

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (search && !l.action.toLowerCase().includes(search.toLowerCase()) && !(l.target_label ?? '').toLowerCase().includes(search.toLowerCase()) && !(l.details ?? '').toLowerCase().includes(search.toLowerCase()) && !l.user_name.toLowerCase().includes(search.toLowerCase())) return false
      if (actionFilter) {
        if (actionFilter === 'login') return l.action === 'login' || l.action === 'logout'
        if (actionFilter === 'delete') return l.action.includes('delete')
        return l.action.includes(actionFilter)
      }
      if (userFilter && l.user_name !== userFilter) return false
      return true
    })
  }, [logs, search, actionFilter, userFilter])

  const grouped = useMemo(() => {
    const groups = new Map()
    for (const log of filtered) {
      const label = getDateLabel(log.created_at)
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push(log)
    }
    return groups
  }, [filtered])

  const formatAction = (action) => ACTION_LABELS[action] ?? action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">Audit Log</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Track every action — who did what and when</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} entries</span>
          <ScrollText size={20} className="text-slate-400" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search actions, users, targets..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow" />
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20">
          {FILTER_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        {users.length > 0 && (
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20">
            <option value="">All Users</option>
            {users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        <button onClick={load} disabled={loading} className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Filter size={14} />} Refresh
        </button>
      </div>

      {/* Log List - Grouped by Date */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400 dark:text-slate-500"><ScrollText size={32} className="mx-auto mb-2 opacity-40" />No audit logs found</div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([dateLabel, dateLogs]) => (
            <div key={dateLabel}>
              {/* Date Header */}
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={14} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{dateLabel}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{dateLogs.length} actions</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
              </div>

              {/* Log Cards */}
              <div className="space-y-1">
                {dateLogs.map((log) => {
                  const Icon = ACTION_ICONS[log.action] ?? FileText
                  const color = ACTION_COLORS[log.action] ?? 'text-slate-600 bg-slate-50 dark:text-slate-300 dark:bg-slate-800'
                  const cat = getCategory(log.action)
                  const catColor = CATEGORY_COLORS[cat] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  const time = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

                  return (
                    <div key={log.id} className="group flex items-start gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      {/* Icon */}
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5 ${color}`}>
                        <Icon size={14} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatAction(log.action)}</span>
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${catColor}`}>{getCategoryLabel(cat)}</span>
                          {log.target_label && <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{log.target_label}</span>}
                        </div>
                        {log.details && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{log.details}</div>}
                      </div>

                      {/* Meta */}
                      <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <User size={11} />{log.user_name}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">{time}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-slate-500 dark:text-slate-400">Page {page + 1}</div>
        <div className="flex gap-1.5">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
            <ChevronLeft size={14} /> Previous
          </button>
          <button onClick={() => setPage(page + 1)} disabled={filtered.length < PAGE_SIZE} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

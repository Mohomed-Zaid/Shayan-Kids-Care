import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { Download, Upload, Database, Clock, Shield, FileJson, Table2, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { logAction } from '../lib/auditLog'

const TABLES = [
  { name: 'products', label: 'Products', icon: '📦' },
  { name: 'customers', label: 'Customers', icon: '👥' },
  { name: 'employees', label: 'Employees', icon: '👤' },
  { name: 'vendors', label: 'Vendors', icon: '🚚' },
  { name: 'orders', label: 'Orders', icon: '🛒' },
  { name: 'order_items', label: 'Order Items', icon: '📋' },
  { name: 'invoices', label: 'Invoices', icon: '🧾' },
  { name: 'invoice_items', label: 'Invoice Items', icon: '📝' },
  { name: 'invoice_payments', label: 'Payments', icon: '💳' },
  { name: 'purchases', label: 'Purchases', icon: '📥' },
  { name: 'purchase_items', label: 'Purchase Items', icon: '📊' },
  { name: 'journals', label: 'Journals', icon: '📒' },
  { name: 'journal_categories', label: 'Journal Categories', icon: '🏷️' },
  { name: 'journal_entries', label: 'Journal Entries', icon: '📖' },
  { name: 'journal_entry_lines', label: 'Entry Lines', icon: '✏️' },
  { name: 'returns', label: 'Returns', icon: '↩️' },
  { name: 'return_items', label: 'Return Items', icon: '📦' },
  { name: 'banks', label: 'Banks', icon: '🏦' },
]

const LOG_TABLES = [
  { name: 'orders', dateField: 'created_at', label: 'Order', prefix: 'ORD' },
  { name: 'invoices', dateField: 'created_at', label: 'Invoice', prefix: 'INV' },
  { name: 'purchases', dateField: 'created_at', label: 'Purchase', prefix: 'PUR' },
  { name: 'invoice_payments', dateField: 'paid_at', label: 'Payment', prefix: 'PAY' },
  { name: 'returns', dateField: 'created_at', label: 'Return', prefix: 'RET' },
  { name: 'journal_entries', dateField: 'created_at', label: 'Journal Entry', prefix: 'JE' },
]

const typeColors = {
  Order: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  Invoice: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  Purchase: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  Payment: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  Return: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  'Journal Entry': 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
}

function TablePreview({ tableName }) {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const load = async () => {
    if (rows) { setRows(null); return }
    setLoading(true)
    const { data, error } = await supabase.from(tableName).select('*').order('id', { ascending: true }).limit(10)
    setRows(error ? [] : (data ?? []))
    setLoading(false)
  }
  return (
    <div className="px-5 pb-3">
      <button onClick={load} disabled={loading} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-2 flex items-center gap-1">
        {loading && <Loader2 size={10} className="animate-spin" />}
        {rows ? 'Hide preview' : 'Show first 10 rows'}
      </button>
      {rows?.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-slate-50 dark:bg-slate-800">
              {Object.keys(rows[0]).map((k) => <th key={k} className="px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{k}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                {Object.values(r).map((v, j) => <td key={j} className="px-2 py-1 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[150px] truncate">{v === null ? <span className="text-slate-300">null</span> : String(v)}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function BackupPage() {
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [tableCounts, setTableCounts] = useState(null)
  const [loadingCounts, setLoadingCounts] = useState(false)
  const [activityLogs, setActivityLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [expandedTable, setExpandedTable] = useState(null)

  const loadCounts = async () => {
    setLoadingCounts(true)
    const counts = {}
    for (const t of TABLES) {
      const { count, error } = await supabase.from(t.name).select('*', { count: 'exact', head: true })
      counts[t.name] = error ? '?' : count ?? 0
    }
    setTableCounts(counts)
    setLoadingCounts(false)
  }

  const onFullExport = async () => {
    setExporting(true)
    try {
      const data = {}
      for (const t of TABLES) {
        const { data: rows } = await supabase.from(t.name).select('*').order('id', { ascending: true })
        data[t.name] = rows ?? []
      }
      const backup = { _meta: { exported_at: new Date().toISOString(), version: '1.0', tables: Object.keys(data), total_records: Object.values(data).reduce((s, a) => s + a.length, 0) }, data }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `shayan-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click()
      URL.revokeObjectURL(url)
      toast.success(`Backup exported (${backup._meta.total_records} records)`)
      logAction({ action: 'backup_export', targetType: 'backup', details: `${backup._meta.total_records} records` })
    } catch (e) { toast.error(e?.message ?? 'Export failed') }
    finally { setExporting(false) }
  }

  const onTableExport = async (table) => {
    try {
      const { data: rows, error } = await supabase.from(table.name).select('*').order('id', { ascending: true })
      if (error || !rows?.length) { toast.error(error?.message ?? 'No data'); return }
      const headers = Object.keys(rows[0])
      const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => { const v = String(r[h] ?? ''); return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v }).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${table.name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
      URL.revokeObjectURL(url)
      toast.success(`${table.label} exported (${rows.length} rows)`)
    } catch (e) { toast.error(e?.message ?? 'Export failed') }
  }

  const onFileSelect = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try { const b = JSON.parse(ev.target.result); if (!b._meta || !b.data) { toast.error('Invalid backup file'); return }; setImportPreview(b) }
      catch { toast.error('Failed to parse backup file') }
    }
    reader.readAsText(file)
  }

  const onImport = async () => {
    if (!importPreview) return
    if (!confirm('DELETE existing data and replace with backup?')) return
    if (!confirm('FINAL WARNING: All current data will be overwritten!')) return
    setImporting(true)
    try {
      const data = importPreview.data
      for (const t of [...TABLES].reverse()) { if (data[t.name]) await supabase.from(t.name).delete().neq('id', 0) }
      const results = []
      for (const t of TABLES) {
        if (data[t.name]?.length > 0) {
          const clean = data[t.name].map(({ created_at, ...rest }) => rest)
          const { error } = await supabase.from(t.name).insert(clean)
          results.push(error ? `${t.label}: ${error.message}` : `${t.label}: ${data[t.name].length} restored`)
        }
      }
      const failed = results.filter((r) => r.includes('error') || r.includes('failed'))
      failed.length > 0 ? toast.error(`Restore with ${failed.length} errors`) : toast.success('Data restored successfully')
      logAction({ action: 'backup_restore', targetType: 'backup', details: `Restored from ${importPreview._meta.exported_at}` })
      setImportPreview(null)
    } catch (e) { toast.error(e?.message ?? 'Import failed') }
    finally { setImporting(false) }
  }

  const loadActivityLogs = async () => {
    setLoadingLogs(true)
    try {
      const allLogs = []
      for (const lt of LOG_TABLES) {
        const { data } = await supabase.from(lt.name).select(`id, ${lt.dateField}, customers(name)`).order(lt.dateField, { ascending: false }).limit(20)
        if (data) for (const row of data) allLogs.push({ id: row.id, type: lt.label, prefix: lt.prefix, date: row[lt.dateField], customer: row.customers?.name ?? null })
      }
      allLogs.sort((a, b) => new Date(b.date) - new Date(a.date))
      setActivityLogs(allLogs.slice(0, 50))
    } catch (e) { toast.error('Failed to load activity logs') }
    setLoadingLogs(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Backup & Safety</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Export data, restore from backups, and monitor activity</p>
        </div>
        <Shield size={24} className="text-slate-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40"><Download size={20} className="text-blue-600 dark:text-blue-300" /></div>
            <div><div className="font-semibold text-slate-900 dark:text-white">Full Backup</div><div className="text-xs text-slate-500 dark:text-slate-400">Export all tables as JSON</div></div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Downloads a complete backup. Use to restore if anything goes wrong.</p>
          <button onClick={onFullExport} disabled={exporting} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileJson size={16} />}
            {exporting ? 'Exporting...' : 'Export Full Backup'}
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40"><Upload size={20} className="text-amber-600 dark:text-amber-300" /></div>
            <div><div className="font-semibold text-slate-900 dark:text-white">Restore from Backup</div><div className="text-xs text-slate-500 dark:text-slate-400">Import a previously exported JSON</div></div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Upload a backup to restore. <span className="font-semibold text-red-600 dark:text-red-400">This will overwrite existing data.</span></p>
          {!importPreview ? (
            <label className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600 cursor-pointer transition-colors">
              <Upload size={16} /> Select Backup File
              <input type="file" accept=".json" onChange={onFileSelect} className="hidden" />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2"><AlertTriangle size={14} /> Backup Preview</div>
                <div className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
                  <div>Exported: {new Date(importPreview._meta.exported_at).toLocaleString()}</div>
                  <div>Total records: {importPreview._meta.total_records}</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {importPreview._meta.tables.map((t) => <span key={t} className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">{t} ({importPreview.data[t]?.length ?? 0})</span>)}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={onImport} disabled={importing} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm">
                  {importing ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
                  {importing ? 'Restoring...' : 'Overwrite & Restore'}
                </button>
                <button onClick={() => setImportPreview(null)} className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3"><Database size={18} className="text-slate-500" /><div><div className="font-semibold text-slate-900 dark:text-white">Database Overview</div><div className="text-xs text-slate-500 dark:text-slate-400">Record counts and individual CSV export</div></div></div>
          <button onClick={loadCounts} disabled={loadingCounts} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {loadingCounts ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}{tableCounts ? 'Refresh' : 'Load Counts'}
          </button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {TABLES.map((t) => (
            <div key={t.name}>
              <div className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3"><span className="text-lg">{t.icon}</span><div><div className="text-sm font-medium text-slate-900 dark:text-white">{t.label}</div><div className="text-[11px] text-slate-400 font-mono">{t.name}</div></div></div>
                <div className="flex items-center gap-3">
                  {tableCounts && <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{tableCounts[t.name]} records</span>}
                  <button onClick={() => onTableExport(t)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" title={`Export ${t.label} as CSV`}><Table2 size={12} /> CSV</button>
                  <button onClick={() => setExpandedTable(expandedTable === t.name ? null : t.name)} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    {expandedTable === t.name ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>
              {expandedTable === t.name && <TablePreview tableName={t.name} />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3"><Clock size={18} className="text-slate-500" /><div><div className="font-semibold text-slate-900 dark:text-white">Activity Log</div><div className="text-xs text-slate-500 dark:text-slate-400">Recent orders, invoices, purchases, payments, returns & entries</div></div></div>
          <button onClick={loadActivityLogs} disabled={loadingLogs} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {loadingLogs ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}{activityLogs.length > 0 ? 'Refresh' : 'Load Activity'}
          </button>
        </div>
        {activityLogs.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-400 dark:text-slate-500"><Clock size={32} className="mx-auto mb-2 opacity-40" />Click "Load Activity" to view recent records</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[500px] overflow-y-auto">
            {activityLogs.map((log, idx) => (
              <div key={`${log.type}-${log.id}-${idx}`} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${typeColors[log.type] ?? 'bg-slate-100 text-slate-600'}`}>{log.type}</span>
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{log.prefix}-{String(log.id).padStart(4, '0')}</div>
                    {log.customer && <div className="text-xs text-slate-500 dark:text-slate-400">{log.customer}</div>}
                  </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(log.date).toLocaleDateString()} {new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

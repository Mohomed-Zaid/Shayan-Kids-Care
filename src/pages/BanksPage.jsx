import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { Plus, Pencil, Trash2, X, Search, Building2 } from 'lucide-react'

const BRANCH_OPTIONS = [
  'Colombo', 'Kandy', 'Galle', 'Gampola', 'Jaffna', 'Negombo',
  'Trincomalee', 'Anuradhapura', 'Polonnaruwa', 'Nuwara Eliya',
  'Kurunegala', 'Matara', 'Batticaloa', 'Ratnapura', 'Badulla',
  'Kalutara', 'Gampaha', 'Hambantota', 'Vavuniya', 'Kilinochchi',
  'Mannar',
]

const emptyForm = () => ({
  code: '',
  name: '',
  branch: '',
  account_no: '',
  swift_no: '',
  currency: 'LKR',
  iban_no: '',
})

export default function BanksPage() {
  const toast = useToast()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('banks')
      .select('*')
      .order('code', { ascending: true })

    if (error) {
      toast.error(error.message)
      setRows([])
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      toast.error('Failed to load banks')
      setLoading(false)
    })
  }, [])

  const filtered = (() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        String(r.code ?? '').toLowerCase() === q ||
        String(r.name ?? '').toLowerCase().includes(q) ||
        String(r.branch ?? '').toLowerCase().includes(q) ||
        String(r.account_no ?? '').toLowerCase().startsWith(q)
    )
  })()

  const nextCode = (() => {
    const maxNum = rows.reduce((max, r) => {
      const n = parseInt(r.code, 10)
      return !isNaN(n) && n > max ? n : max
    }, 0)
    return String(maxNum + 1).padStart(3, '0')
  })()

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm(), code: nextCode })
    setFormOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row.id)
    setForm({
      code: row.code ?? '',
      name: row.name ?? '',
      branch: row.branch ?? '',
      account_no: row.account_no ?? '',
      swift_no: row.swift_no ?? '',
      currency: row.currency ?? 'LKR',
      iban_no: row.iban_no ?? '',
    })
    setFormOpen(true)
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Code and Name are required')
      return
    }
    setSaving(true)

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      branch: form.branch.trim() || null,
      account_no: form.account_no.trim() || null,
      swift_no: form.swift_no.trim() || null,
      currency: form.currency.trim() || 'LKR',
      iban_no: form.iban_no.trim() || null,
    }

    let error
    if (editing) {
      ;({ error } = await supabase.from('banks').update(payload).eq('id', editing))
    } else {
      ;({ error } = await supabase.from('banks').insert(payload))
    }

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    toast.success(editing ? 'Bank updated' : 'Bank added')
    setFormOpen(false)
    setSaving(false)
    await load()
  }

  const remove = async (id) => {
    if (!confirm('Delete this bank?')) return
    const { error } = await supabase.from('banks').delete().eq('id', id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Bank deleted')
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search banks"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
          />
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Bank
        </button>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 dark:bg-emerald-950/35 dark:border-emerald-900/40 dark:text-emerald-100/80">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Code</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Bank Name</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Branch</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Account No</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Currency</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-slate-400 dark:text-emerald-100/60 text-center">
                  <Building2 size={24} className="mx-auto mb-2 opacity-40 dark:text-emerald-200/30" />
                  No banks found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-emerald-50">{r.code}</td>
                  <td className="px-5 py-3.5 text-slate-700 dark:text-emerald-100/70">{r.name}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/60">{r.branch || '—'}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/60">{r.account_no || '—'}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-emerald-100/60">{r.currency || 'LKR'}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white">{editing ? 'Edit Bank' : 'Add Bank'}</div>
              <button
                onClick={() => setFormOpen(false)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Code *</div>
                  <input
                    value={form.code}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                    readOnly={!editing}
                    placeholder="e.g. 001"
                    className={`w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-900 dark:text-white ${!editing ? 'bg-slate-100 dark:bg-slate-700 cursor-not-allowed' : 'bg-white dark:bg-slate-800'}`}
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Bank Name *</div>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Amana Bank PLC"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Branch</div>
                  <select
                    value={form.branch}
                    onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="">Select branch</option>
                    {BRANCH_OPTIONS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Account No</div>
                  <input
                    value={form.account_no}
                    onChange={(e) => setForm((p) => ({ ...p, account_no: e.target.value }))}
                    placeholder="e.g. 0012345678"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">SWIFT Code</div>
                  <input
                    value={form.swift_no}
                    onChange={(e) => setForm((p) => ({ ...p, swift_no: e.target.value }))}
                    placeholder="e.g. AMANLKCL"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Currency</div>
                  <input
                    value={form.currency}
                    onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                    placeholder="LKR"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">IBAN</div>
                  <input
                    value={form.iban_no}
                    onChange={(e) => setForm((p) => ({ ...p, iban_no: e.target.value }))}
                    placeholder="Optional"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {saving ? 'Saving...' : editing ? 'Update Bank' : 'Add Bank'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

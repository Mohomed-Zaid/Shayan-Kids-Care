import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { Plus, Save, Trash2, Search, ChevronDown, ChevronRight } from 'lucide-react'

const fmt = (val) => `Rs. ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

const withCommas = (val) => {
  if (val === '' || val === undefined || val === null) return ''
  const str = String(val).replace(/,/g, '')
  if (!str) return ''
  const parts = str.split('.')
  parts[0] = Number(parts[0] || 0).toLocaleString()
  return parts.join('.')
}

const stripCommas = (val) => String(val).replace(/,/g, '')

const emptyLine = () => ({
  id: `${Date.now()}-${Math.random()}`,
  journal_id: '',
  description: '',
  debit: '',
  credit: '',
  status: 'ACTIVE',
})

export default function JournalEntryPage() {
  const toast = useToast()

  const [journals, setJournals] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState([emptyLine(), emptyLine()])

  const [pastEntries, setPastEntries] = useState([])
  const [expandedEntry, setExpandedEntry] = useState(null)
  const [entryLines, setEntryLines] = useState([])
  const [entriesLoading, setEntriesLoading] = useState(false)

  const loadJournals = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('journals')
      .select('id, code, description')
      .order('code', { ascending: true })

    if (err) {
      setError(err.message)
      setJournals([])
    } else {
      setJournals(data ?? [])
    }
    setLoading(false)
  }

  const loadPastEntries = async () => {
    setEntriesLoading(true)
    const { data, error: err } = await supabase
      .from('journal_entries')
      .select('id, date, created_at')
      .order('created_at', { ascending: false })

    if (err) {
      console.error(err)
    } else {
      setPastEntries(data ?? [])
    }
    setEntriesLoading(false)
  }

  useEffect(() => {
    loadJournals().catch((e) => {
      console.error(e)
      setError('Failed to load')
      setLoading(false)
    })
    loadPastEntries()
  }, [])

  const filteredJournals = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return journals
    return journals.filter((j) =>
      String(j.code ?? '').toLowerCase().includes(q) ||
      String(j.description ?? '').toLowerCase().includes(q)
    )
  }, [journals, search])

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0)
    const credit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0)
    return { debit, credit }
  }, [lines])

  const balanced = useMemo(() => {
    return Math.abs(totals.debit - totals.credit) < 0.0001
  }, [totals.debit, totals.credit])

  const addLine = () => setLines((p) => [...p, emptyLine()])
  const removeLine = (id) => setLines((p) => p.filter((x) => x.id !== id))

  const updateLine = (id, patch) => {
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l
      const updated = { ...l, ...patch }
      if (patch.journal_id && !l.description) {
        const j = journals.find((j) => j.id === patch.journal_id)
        if (j) updated.description = j.description
      }
      return updated
    }))
  }

  const onSave = async () => {
    setError(null)

    const cleaned = lines
      .map((l) => ({
        ...l,
        journal_id: l.journal_id || null,
        description: (l.description ?? '').trim() || null,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
      }))
      .filter((l) => l.journal_id && (l.debit > 0 || l.credit > 0 || l.description))

    if (!date) {
      toast.error('Please select date')
      return
    }

    if (cleaned.length === 0) {
      toast.error('Add at least one valid row')
      return
    }

    const hasInvalid = cleaned.some((l) => l.debit > 0 && l.credit > 0)
    if (hasInvalid) {
      toast.error('A row cannot have both debit and credit')
      return
    }

    if (!balanced) {
      toast.error('Total debit and credit must be equal')
      return
    }

    setSaving(true)
    try {
      const { data: entry, error: eErr } = await supabase
        .from('journal_entries')
        .insert({ date })
        .select('id')
        .single()

      if (eErr) throw eErr

      const payloadLines = cleaned.map((l) => ({
        entry_id: entry.id,
        journal_id: l.journal_id,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        status: l.status ?? 'ACTIVE',
      }))

      const { error: lErr } = await supabase.from('journal_entry_lines').insert(payloadLines)
      if (lErr) throw lErr

      toast.success('Journal entry saved')
      setLines([emptyLine(), emptyLine()])
      setSearch('')
      setDate(new Date().toISOString().slice(0, 10))
      await loadPastEntries()
    } catch (e) {
      console.error(e)
      const msg = e?.message ?? 'Failed to save'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const toggleExpand = async (entryId) => {
    if (expandedEntry === entryId) {
      setExpandedEntry(null)
      setEntryLines([])
      return
    }
    setExpandedEntry(entryId)
    const { data, error: err } = await supabase
      .from('journal_entry_lines')
      .select('id, journal_id, description, debit, credit, status, journals(code, description)')
      .eq('entry_id', entryId)
    if (err) {
      setEntryLines([])
    } else {
      setEntryLines(data ?? [])
    }
  }

  const onDeleteEntry = async (entryId) => {
    if (!window.confirm('Delete this journal entry and all its lines?')) return
    await supabase.from('journal_entry_lines').delete().eq('entry_id', entryId)
    const { error: err } = await supabase.from('journal_entries').delete().eq('id', entryId)
    if (err) { toast.error(err.message); return }
    toast.success('Journal entry deleted')
    setPastEntries((prev) => prev.filter((e) => e.id !== entryId))
    if (expandedEntry === entryId) { setExpandedEntry(null); setEntryLines([]) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Journal Entry</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Create journal entries connected to journals.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Plus size={16} />
            Add Row
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-9 bg-white dark:bg-emerald-950/35 border border-slate-200/60 dark:border-emerald-900/40 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200/60 dark:border-emerald-900/40 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Date</div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-emerald-50"
              />
            </div>

            <div className="md:col-span-9">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-emerald-100/70">Search</div>
              <div className="relative mt-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search journal code or name..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-emerald-50"
                />
              </div>
              {search.trim() ? (
                <div className="mt-1 text-xs text-slate-500 dark:text-emerald-100/60">{filteredJournals.length} journals found</div>
              ) : null}
            </div>
          </div>

          <div className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-emerald-950/35 border border-slate-200/60 dark:border-emerald-900/40 text-slate-500 dark:text-emerald-100/70">
                <tr>
                  <th className="text-left font-medium px-3 py-2 text-xs uppercase tracking-wide">Journal</th>
                  <th className="text-left font-medium px-3 py-2 text-xs uppercase tracking-wide">Description</th>
                  <th className="text-right font-medium px-3 py-2 text-xs uppercase tracking-wide">Debit</th>
                  <th className="text-right font-medium px-3 py-2 text-xs uppercase tracking-wide">Credit</th>
                  <th className="text-left font-medium px-3 py-2 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 dark:border-emerald-900/30">
                    <td className="px-3 py-2.5">
                      <select
                        value={l.journal_id}
                        onChange={(e) => updateLine(l.id, { journal_id: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-emerald-50"
                      >
                        <option value="">Select journal</option>
                        {filteredJournals.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.code} - {j.description}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        value={l.description}
                        onChange={(e) => updateLine(l.id, { description: e.target.value })}
                        placeholder="Journal description"
                        className="w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-emerald-50"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={withCommas(l.debit)}
                        onChange={(e) => updateLine(l.id, { debit: stripCommas(e.target.value) })}
                        placeholder="0"
                        className="w-full text-right rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-emerald-50"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={withCommas(l.credit)}
                        onChange={(e) => updateLine(l.id, { credit: stripCommas(e.target.value) })}
                        placeholder="0"
                        className="w-full text-right rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-emerald-50"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={l.status}
                        onChange={(e) => updateLine(l.id, { status: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-emerald-50"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="HOLD">HOLD</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(l.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error ? (
            <div className="px-4 pb-4 text-sm text-red-600">{error}</div>
          ) : null}
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-emerald-950/35 border border-slate-200/60 dark:border-emerald-900/40 rounded-xl shadow-sm p-4">
          <div className="text-sm font-semibold text-slate-900 dark:text-emerald-50">Details</div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-emerald-100/60">Total Debit</span>
              <span className="font-bold text-slate-900 dark:text-white">{fmt(totals.debit)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-emerald-100/60">Total Credit</span>
              <span className="font-bold text-slate-900 dark:text-white">{fmt(totals.credit)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-emerald-100/60">Status</span>
              <span className={`font-bold ${balanced ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                {balanced ? 'Balanced' : 'Not Balanced'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Past Entries */}
      <div className="bg-white dark:bg-emerald-950/35 border border-slate-200/60 dark:border-emerald-900/40 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200/60 dark:border-emerald-900/40">
          <div className="text-sm font-semibold text-slate-900 dark:text-emerald-50">Past Journal Entries</div>
          <div className="text-xs text-slate-500 dark:text-emerald-100/60">Click a row to view its lines.</div>
        </div>

        {entriesLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
          </div>
        ) : pastEntries.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-400 dark:text-emerald-100/60 text-center">No journal entries yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/50 dark:bg-emerald-950/35 border-b border-slate-200 dark:border-emerald-900/40 text-slate-500 dark:text-emerald-100/70">
              <tr>
                <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Date</th>
                <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Created</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {pastEntries.map((entry) => (
                <React.Fragment key={entry.id}>
                  <tr className="border-b border-slate-50 dark:border-emerald-900/30 hover:bg-slate-50/50 dark:hover:bg-emerald-950/20 transition-colors">
                    <td className="px-5 py-3 text-slate-900 dark:text-white">
                      <button onClick={() => toggleExpand(entry.id)} className="inline-flex items-center gap-1.5 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        {expandedEntry === entry.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {new Date(entry.date).toLocaleDateString()}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-emerald-100/60">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => onDeleteEntry(entry.id)}
                        className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expandedEntry === entry.id && (
                    <tr>
                      <td colSpan={3} className="px-5 py-3 bg-slate-50 dark:bg-emerald-950/20">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 dark:text-emerald-100/70 border-b border-slate-200 dark:border-emerald-900/40">
                              <th className="text-left font-medium px-3 py-2 uppercase tracking-wide">Journal</th>
                              <th className="text-left font-medium px-3 py-2 uppercase tracking-wide">Description</th>
                              <th className="text-right font-medium px-3 py-2 uppercase tracking-wide">Debit</th>
                              <th className="text-right font-medium px-3 py-2 uppercase tracking-wide">Credit</th>
                              <th className="text-left font-medium px-3 py-2 uppercase tracking-wide">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entryLines.length === 0 ? (
                              <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">No lines found.</td></tr>
                            ) : entryLines.map((l) => (
                              <tr key={l.id} className="border-b border-slate-100 dark:border-emerald-900/20">
                                <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{l.journals?.code ? `${l.journals.code} - ` : ''}{l.journals?.description ?? '-'}</td>
                                <td className="px-3 py-2 text-slate-700 dark:text-emerald-100/80">{l.description ?? '-'}</td>
                                <td className="px-3 py-2 text-right text-slate-700 dark:text-emerald-100/80">{l.debit > 0 ? fmt(l.debit) : '-'}</td>
                                <td className="px-3 py-2 text-right text-slate-700 dark:text-emerald-100/80">{l.credit > 0 ? fmt(l.credit) : '-'}</td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${l.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                                    {l.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

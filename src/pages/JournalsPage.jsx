import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Trash2, X, Search, AlertTriangle } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'

const BANK_OPTIONS = [
  { value: '7463 - Amana Bank PLC', label: '7463 - Amana Bank PLC' },
]

const BRANCH_OPTIONS = [
  { value: 'Head Office', label: 'Head Office' },
]

function JournalForm({ initialValue, onCancel, onSave }) {
  const toast = useToast()

  const [code, setCode] = useState(initialValue?.code ?? '')
  const [accountType, setAccountType] = useState(initialValue?.account_type ?? 'EXPENSES')
  const [categoryId, setCategoryId] = useState(initialValue?.category_id ?? '')
  const [description, setDescription] = useState(initialValue?.description ?? '')
  const [budget, setBudget] = useState(initialValue?.budget ?? 0)
  const [showOnDashboard, setShowOnDashboard] = useState(!!initialValue?.show_on_dashboard)

  const [categories, setCategories] = useState([])

  const [sBalance, setSBalance] = useState(initialValue?.s_balance ?? 0)
  const [hBalance, setHBalance] = useState(initialValue?.h_balance ?? 0)

  const [chequeDate, setChequeDate] = useState(() => {
    if (initialValue?.cheque_date) return String(initialValue.cheque_date).slice(0, 10)
    return new Date().toISOString().slice(0, 10)
  })
  const [chequeNumber, setChequeNumber] = useState(initialValue?.cheque_number ?? '')
  const [chequeSBalance, setChequeSBalance] = useState(initialValue?.cheque_s_balance ?? 0)
  const [chequeAdvance, setChequeAdvance] = useState(!!initialValue?.cheque_advance)

  const [bankName, setBankName] = useState(initialValue?.bank_name ?? '')
  const [bankBranch, setBankBranch] = useState(initialValue?.bank_branch ?? '')
  const [bankAccountNo, setBankAccountNo] = useState(initialValue?.bank_account_no ?? '')
  const [bankSwiftNo, setBankSwiftNo] = useState(initialValue?.bank_swift_no ?? '')
  const [bankCurrency, setBankCurrency] = useState(initialValue?.bank_currency ?? '')
  const [bankIbanNo, setBankIbanNo] = useState(initialValue?.bank_iban_no ?? '')

  const [activeTab, setActiveTab] = useState('account')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadCats = async () => {
      const { data, error: err } = await supabase
        .from('journal_categories')
        .select('id, name')
        .order('name', { ascending: true })
      if (err) throw err
      setCategories(data ?? [])
    }

    loadCats().catch((e) => {
      console.error(e)
      toast.error(e?.message ?? 'Failed to load categories')
    })
  }, [toast])

  const selectedCategoryName = useMemo(() => {
    return categories.find((c) => c.id === categoryId)?.name ?? ''
  }, [categories, categoryId])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSave({
        code: code.trim(),
        account_type: accountType,
        category_id: categoryId || null,
        description: description.trim(),
        budget: Number(budget) || 0,
        show_on_dashboard: showOnDashboard,
        s_balance: Number(sBalance) || 0,
        h_balance: Number(hBalance) || 0,
        cheque_date: chequeDate || null,
        cheque_number: chequeNumber.trim() || null,
        cheque_s_balance: Number(chequeSBalance) || 0,
        cheque_advance: !!chequeAdvance,
        bank_name: selectedCategoryName === 'BANK' ? bankName.trim() : null,
        bank_branch: selectedCategoryName === 'BANK' ? bankBranch.trim() : null,
        bank_account_no: selectedCategoryName === 'BANK' ? bankAccountNo.trim() : null,
        bank_swift_no: selectedCategoryName === 'BANK' ? bankSwiftNo.trim() : null,
        bank_currency: selectedCategoryName === 'BANK' ? bankCurrency.trim() : null,
        bank_iban_no: selectedCategoryName === 'BANK' ? bankIbanNo.trim() : null,
      })
    } catch (err) {
      console.error(err)
      const msg = err?.message ?? 'Failed to save'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200/60 dark:border-slate-700 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {initialValue ? 'Edit Journal' : 'New Journal'}
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-4">
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm"
            >
              Cancel
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-7 rounded-xl border border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="p-3 border-b border-slate-200/60 dark:border-slate-700 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('account')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                    activeTab === 'account'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Journal Account
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('balance')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                    activeTab === 'balance'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Journal Balance
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('cheque')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                    activeTab === 'cheque'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Journal Direct Cheque
                </button>
              </div>

              <div className="p-4 space-y-4">
                {activeTab === 'account' ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Journal Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Account Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={accountType}
                        onChange={(e) => setAccountType(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                      >
                        <option value="EXPENSES">Expenses</option>
                        <option value="ASSETS">Assets</option>
                        <option value="LIABILITIES">Liabilities</option>
                        <option value="INCOME">Income</option>
                        <option value="CURRENT_ACCOUNT">Current Account</option>
                        <option value="SAVING_ACCOUNT">Saving Account</option>
                        <option value="SALARY">Salary</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                        required
                      >
                        <option value="" className="text-slate-900">Select category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Journal Description <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Budget</label>
                      <input
                        type="number"
                        min="0"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Do you want this balance to appear on the dashboard?
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowOnDashboard((v) => !v)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          showOnDashboard ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                        aria-pressed={showOnDashboard}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                            showOnDashboard ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </>
                ) : activeTab === 'balance' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">S Balance</label>
                      <input
                        type="number"
                        step="0.01"
                        value={sBalance}
                        onChange={(e) => setSBalance(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">H Balance</label>
                      <input
                        type="number"
                        step="0.01"
                        value={hBalance}
                        onChange={(e) => setHBalance(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</label>
                      <input
                        type="date"
                        value={chequeDate}
                        onChange={(e) => setChequeDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cheque Number</label>
                      <input
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">S Balance</label>
                      <div className="mt-1 flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600">
                        <input
                          type="number"
                          step="0.01"
                          value={chequeSBalance}
                          onChange={(e) => setChequeSBalance(e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none"
                        />
                        <div className="px-3 flex items-center text-xs font-bold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border-l border-slate-300 dark:border-slate-600">RS</div>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Advance</label>
                      <button
                        type="button"
                        onClick={() => setChequeAdvance((v) => !v)}
                        className={`mt-1 w-full px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${chequeAdvance ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
                      >
                        {chequeAdvance ? 'Y' : 'N'}
                      </button>
                    </div>
                  </div>
                )}

                {error ? (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-200 px-3 py-2 rounded-lg">
                    <AlertTriangle size={14} />
                    {error}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-5 rounded-xl border border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-900">
              {selectedCategoryName === 'BANK' ? (
                <div className="p-4 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bank</div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bank</label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="" className="text-slate-900">Select bank</option>
                      {BANK_OPTIONS.map((b) => (
                        <option key={b.value} value={b.value} className="text-slate-900">{b.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Branch</label>
                    <select
                      value={bankBranch}
                      onChange={(e) => setBankBranch(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="" className="text-slate-900">Select branch</option>
                      {BRANCH_OPTIONS.map((b) => (
                        <option key={b.value} value={b.value} className="text-slate-900">{b.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Account No</label>
                      <input
                        value={bankAccountNo}
                        onChange={(e) => setBankAccountNo(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bank Swift No</label>
                      <input
                        value={bankSwiftNo}
                        onChange={(e) => setBankSwiftNo(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bank Currency</label>
                      <input
                        value={bankCurrency}
                        onChange={(e) => setBankCurrency(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">IBAN No</label>
                      <input
                        value={bankIbanNo}
                        onChange={(e) => setBankIbanNo(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[280px]" />
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function JournalsPage() {
  const toast = useToast()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('journals')
      .select('id, code, account_type, category_id, description, budget, show_on_dashboard, s_balance, h_balance, cheque_date, cheque_number, cheque_s_balance, cheque_advance, bank_name, bank_branch, bank_account_no, bank_swift_no, bank_currency, bank_iban_no, created_at, journal_categories(name)')
      .order('code', { ascending: true })

    if (err) {
      setError(err.message)
      setRows([])
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load().catch((e) => {
      console.error(e)
      setError('Failed to load')
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      String(r.code ?? '').toLowerCase().includes(q) ||
      String(r.description ?? '').toLowerCase().includes(q) ||
      String(r.account_type ?? '').toLowerCase().includes(q) ||
      String(r.journal_categories?.name ?? '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const onCreate = () => {
    setEditing(null)
    setOpenForm(true)
  }

  const onEdit = (row) => {
    setEditing(row)
    setOpenForm(true)
  }

  const onSave = async (payload) => {
    if (editing) {
      const { error: err } = await supabase.from('journals').update(payload).eq('id', editing.id)
      if (err) throw err
      toast.success('Journal updated')
    } else {
      const { error: err } = await supabase.from('journals').insert(payload)
      if (err) throw err
      toast.success('Journal created')
    }
    setOpenForm(false)
    setEditing(null)
    await load()
  }

  const onDelete = async (row) => {
    if (!window.confirm('Are you sure you want to delete this journal?')) return
    const { error: err } = await supabase.from('journals').delete().eq('id', row.id)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Journal deleted')
    setRows((prev) => prev.filter((x) => x.id !== row.id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">Manage journal accounts.</div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Journal
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Journal"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Code</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Name</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Type</th>
              <th className="text-left font-medium px-5 py-3 text-xs uppercase tracking-wide">Category</th>
              <th className="text-right font-medium px-5 py-3 text-xs uppercase tracking-wide">Budget</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-8">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-5 py-4 text-red-600 text-center">{error}</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-slate-400 dark:text-slate-500 text-center">
                  No journals found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3.5 text-slate-900 dark:text-white">{row.code ?? '-'}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{row.description ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300">{row.account_type ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300">{row.journal_categories?.name ?? '-'}</td>
                  <td className="px-5 py-3.5 text-right font-semibold text-slate-900 dark:text-white">{row.budget ? `Rs. ${Number(row.budget).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => onEdit(row)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 transition-colors mr-2"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(row)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openForm ? (
        <JournalForm
          initialValue={editing}
          onCancel={() => {
            setOpenForm(false)
            setEditing(null)
          }}
          onSave={onSave}
        />
      ) : null}
    </div>
  )
}

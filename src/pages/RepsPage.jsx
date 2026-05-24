import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Trash2, X, UserCheck, AlertTriangle, Banknote } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'
import {
  fmtMoney,
  formatMoneyInput,
  parseMoneyInput,
  totalMonthlyCompensation,
} from '../lib/employeeCompensation'

function MoneyField({ label, value, onChange, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
      <input
        value={value}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, '')
          const parts = raw.split('.')
          const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
          const formatted = parts.length > 1 ? `${intPart}.${parts[1].slice(0, 2)}` : intPart
          onChange(formatted)
        }}
        placeholder="0.00"
        className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
      />
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  )
}

function RepForm({ initialValue, onCancel, onSave }) {
  const [name, setName] = useState(initialValue?.name ?? '')
  const [address, setAddress] = useState(initialValue?.address ?? '')
  const [phone1, setPhone1] = useState(initialValue?.phone1 ?? '')
  const [phone2, setPhone2] = useState(initialValue?.phone2 ?? '')
  const [email, setEmail] = useState(initialValue?.email ?? '')
  const [role, setRole] = useState(initialValue?.role ?? '')
  const [isRep, setIsRep] = useState(initialValue?.is_rep ?? false)
  const [salary, setSalary] = useState(() => formatMoneyInput(initialValue?.salary))
  const [allowance, setAllowance] = useState(() => formatMoneyInput(initialValue?.allowance))
  const [otherAllowance, setOtherAllowance] = useState(() => formatMoneyInput(initialValue?.other_allowance))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const monthlyTotal = useMemo(
    () =>
      parseMoneyInput(salary) + parseMoneyInput(allowance) + parseMoneyInput(otherAllowance),
    [salary, allowance, otherAllowance]
  )

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSave({
        name: name.trim(),
        address: address.trim(),
        phone1: phone1.trim(),
        phone2: phone2.trim(),
        email: email.trim(),
        role: role.trim(),
        is_rep: isRep,
        salary: parseMoneyInput(salary),
        allowance: parseMoneyInput(allowance),
        other_allowance: parseMoneyInput(otherAllowance),
      })
    } catch (err) {
      setError(err?.message ?? 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 overflow-y-auto py-6">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl my-auto">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {initialValue ? 'Edit Employee' : 'Add Employee'}
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <form className="p-5 space-y-4 max-h-[75vh] overflow-y-auto" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Phone 1</label>
              <input
                value={phone1}
                onChange={(e) => setPhone1(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Phone 2</label>
              <input
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Role</label>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                placeholder="e.g. Accountant, Driver"
              />
            </div>

            <div className="flex items-end gap-2 pb-1">
              <input
                type="checkbox"
                id="isRep"
                checked={isRep}
                onChange={(e) => setIsRep(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
              />
              <label htmlFor="isRep" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Is Rep (shows in invoice)
              </label>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Banknote size={16} className="text-slate-600 dark:text-slate-300" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Monthly compensation (LKR)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MoneyField label="Basic salary" value={salary} onChange={setSalary} />
              <MoneyField label="Allowance" value={allowance} onChange={setAllowance} />
              <MoneyField
                label="Other allowance"
                value={otherAllowance}
                onChange={setOtherAllowance}
                hint="e.g. transport, meals"
              />
              <div className="sm:col-span-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2.5 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Total monthly</span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">{fmtMoney(monthlyTotal)}</span>
              </div>
            </div>
          </div>

          {error ? (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertTriangle size={14} />
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function RepsPage() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [compensationColumnsMissing, setCompensationColumnsMissing] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [rows])

  const payrollTotals = useMemo(() => {
    return sortedRows.reduce(
      (acc, row) => {
        acc.salary += Number(row.salary ?? 0)
        acc.allowance += Number(row.allowance ?? 0)
        acc.other += Number(row.other_allowance ?? 0)
        acc.total += totalMonthlyCompensation(row)
        return acc
      },
      { salary: 0, allowance: 0, other: 0, total: 0 }
    )
  }, [sortedRows])

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.from('employees').select('*').order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
      setRows([])
      setCompensationColumnsMissing(false)
    } else {
      setRows(data ?? [])
      setCompensationColumnsMissing(false)
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

  const onAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const onEdit = (row) => {
    setEditing(row)
    setFormOpen(true)
  }

  const onDelete = async (row) => {
    if (!confirm('Delete this employee?')) return
    const { error: err } = await supabase.from('employees').delete().eq('id', row.id)
    if (err) {
      if (err.code === '23503') {
        toast.error('Cannot delete this employee because they are used in one or more invoices.')
      } else {
        toast.error(err.message)
      }
      return
    }
    toast.success('Employee deleted')
    logAction({ action: 'delete_employee', targetType: 'employee', targetId: row.id, targetLabel: row.name })
    await load()
  }

  const onSave = async (values) => {
    const payload = {
      name: values.name,
      address: values.address,
      phone1: values.phone1,
      phone2: values.phone2,
      email: values.email,
      role: values.role,
      is_rep: values.is_rep,
      salary: values.salary,
      allowance: values.allowance,
      other_allowance: values.other_allowance,
    }

    if (editing) {
      const { error: err } = await supabase.from('employees').update(payload).eq('id', editing.id)
      if (err) {
        if (String(err.message).includes('salary') || String(err.message).includes('allowance')) {
          setCompensationColumnsMissing(true)
          toast.error('Run supabase/employees_compensation.sql in Supabase first')
        }
        throw err
      }
      logAction({ action: 'edit_employee', targetType: 'employee', targetId: editing.id, targetLabel: values.name })
    } else {
      const { error: err } = await supabase.from('employees').insert(payload)
      if (err) {
        if (String(err.message).includes('salary') || String(err.message).includes('allowance')) {
          setCompensationColumnsMissing(true)
          toast.error('Run supabase/employees_compensation.sql in Supabase first')
        }
        throw err
      }
      logAction({ action: 'create_employee', targetType: 'employee', targetLabel: values.name })
    }

    toast.success(editing ? 'Employee updated' : 'Employee added')
    setFormOpen(false)
    setEditing(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">Manage employees, reps, and monthly salary &amp; allowances.</div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm">
          <Plus size={16} />
          Add Employee
        </button>
      </div>

      {compensationColumnsMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          Salary columns are missing. Run <code className="font-mono text-xs">supabase/employees_compensation.sql</code> in
          the Supabase SQL Editor, then refresh.
        </div>
      ) : null}

      {!loading && sortedRows.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200/60 dark:border-emerald-400/15 bg-white dark:bg-emerald-950/25 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Total salary</div>
            <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">{fmtMoney(payrollTotals.salary)}</div>
          </div>
          <div className="rounded-xl border border-slate-200/60 dark:border-emerald-400/15 bg-white dark:bg-emerald-950/25 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Total allowance</div>
            <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">{fmtMoney(payrollTotals.allowance)}</div>
          </div>
          <div className="rounded-xl border border-slate-200/60 dark:border-emerald-400/15 bg-white dark:bg-emerald-950/25 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Other allowance</div>
            <div className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">{fmtMoney(payrollTotals.other)}</div>
          </div>
          <div className="rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 uppercase">Monthly payroll</div>
            <div className="mt-1 text-lg font-extrabold text-amber-900 dark:text-amber-200">{fmtMoney(payrollTotals.total)}</div>
          </div>
        </div>
      ) : null}

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-x-auto shadow-sm dark:bg-emerald-950/25 dark:border-emerald-400/15">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 dark:bg-emerald-950/35 dark:border-emerald-900/40 dark:text-emerald-100/80">
            <tr>
              <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Name</th>
              <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Role</th>
              <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Type</th>
              <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">Salary</th>
              <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">Allowance</th>
              <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">Other</th>
              <th className="text-right font-medium px-4 py-3 text-xs uppercase tracking-wide">Total / mo</th>
              <th className="text-left font-medium px-4 py-3 text-xs uppercase tracking-wide">Phone</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-5 py-8">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={9} className="px-5 py-4 text-red-600 text-center">{error}</td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-slate-400 dark:text-emerald-100/60 text-center">
                  <UserCheck size={24} className="mx-auto mb-2 opacity-40 dark:text-emerald-200/30" />
                  No employees yet. Add your first employee!
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors dark:border-emerald-900/30 dark:hover:bg-emerald-500/5">
                  <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-emerald-50">{row.name}</td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-emerald-100/60">{row.role || '-'}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${row.is_rep ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {row.is_rep ? 'Rep' : 'Employee'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-700 dark:text-emerald-100/80 tabular-nums">
                    {fmtMoney(row.salary ?? 0)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-700 dark:text-emerald-100/80 tabular-nums">
                    {fmtMoney(row.allowance ?? 0)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-700 dark:text-emerald-100/80 tabular-nums">
                    {fmtMoney(row.other_allowance ?? 0)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                    {fmtMoney(totalMonthlyCompensation(row))}
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-emerald-100/60 text-xs">
                    {row.phone1 || '-'}
                    {row.phone2 ? ` · ${row.phone2}` : ''}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => onEdit(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => onDelete(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                        <Trash2 size={15} />
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
        <RepForm
          initialValue={editing}
          onCancel={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSave={onSave}
        />
      ) : null}
    </div>
  )
}

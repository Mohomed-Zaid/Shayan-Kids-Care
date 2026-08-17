import React, { useEffect, useMemo, useState } from 'react'
import html2pdf from 'html2pdf.js'
import { Check, Download, Eye, FileClock, FileText, Loader2, Printer, Save, Settings, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { useToast } from '../contexts/ToastContext'
import { logAction } from '../lib/auditLog'

const DEFAULT_SETTINGS = {
  salary_account_holder_name: 'M.A.N.M. NISHLAN',
  salary_personal_bank_account_no: '101001362128',
  director_name: 'M.N.M. Niflan',
  director_designation: 'Director',
  director_company: 'Shayan Kids & Toys',
  director_nic: '953630354V',
  director_mobile: '+94 75 3841599',
}

const todayISO = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

const money = (value) => Number(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function displayDate(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-')
}

function makePages(employees) {
  if (employees.length <= 5) return [{ type: 'complete', employees, start: 0 }]
  const pages = [{ type: 'first', employees: employees.slice(0, 10), start: 0 }]
  let cursor = 10
  while (employees.length - cursor > 15) {
    const take = Math.min(22, employees.length - cursor - 15)
    pages.push({ type: 'middle', employees: employees.slice(cursor, cursor + take), start: cursor })
    cursor += take
  }
  pages.push({ type: 'last', employees: employees.slice(cursor), start: cursor })
  return pages
}

function EmployeeTable({ employees, start, total, showTotal }) {
  return (
    <table className="letter-table">
      <thead>
        <tr>
          <th className="number-cell">No.</th>
          <th>Employee Name</th>
          <th>Employee Bank</th>
          <th>Account No.</th>
          <th className="amount-cell">Salary Amount (LKR)</th>
        </tr>
      </thead>
      <tbody>
        {employees.map((employee, index) => (
          <tr key={`${employee.id || employee.name}-${start + index}`}>
            <td className="number-cell">{start + index + 1}</td>
            <td>{employee.name}</td>
            <td>{employee.bank_name}</td>
            <td>{employee.bank_account_number}</td>
            <td className="amount-cell">{money(employee.salary_amount)}</td>
          </tr>
        ))}
        {showTotal ? (
          <tr className="total-row">
            <td colSpan={4}>Total</td>
            <td className="amount-cell">{money(total)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}

function LetterIntro({ data }) {
  return (
    <>
      <div className="letter-meta">
        <div className="recipient">
          <div className="meta-label">To:</div>
          <div>The Branch Manager</div>
          <div>DFCC Bank</div>
          <div>MOUNT LAVINIA Branch</div>
        </div>
        <div className="letter-date"><span className="meta-label">Date:</span> {displayDate(data.letter_date)}</div>
      </div>
      <div className="subject">REQUEST FOR SALARY TRANSFER TO EMPLOYEES&apos; BANK ACCOUNTS</div>
      <p className="salutation">Dear Sir/Madam,</p>
      <p>I hereby request you to process the salary payments for the employees of SHAYAN KIDS &amp; TOYS from my personal bank account maintained with your branch.</p>
      <p>As the company is a small business, the total salary amount will be provided through one cheque drawn from my personal account. I kindly request the bank to transfer the respective salary amounts to the individual bank accounts of the employees as per the details provided below.</p>
      <div className="account-grid">
        <div><span>Account Holder Name</span><strong>{data.settings.salary_account_holder_name}</strong></div>
        <div><span>Personal Bank Account No.</span><strong>{data.settings.salary_personal_bank_account_no}</strong></div>
        <div><span>Cheque No.</span><strong>{data.cheque_number}</strong></div>
        <div className="total-detail"><span>Total Salary Amount</span><strong>LKR {money(data.total_salary)}</strong></div>
      </div>
      <div className="table-title">Employee Salary Details</div>
    </>
  )
}

function LetterEnding({ settings }) {
  return (
    <div className="letter-ending">
      <p>I confirm that the above-mentioned funds are intended for the payment of employee salaries. I kindly request you to process the transfers according to the details provided above.</p>
      <p>Please let me know if any additional documents or information are required to process this request.</p>
      <p>Thank you for your assistance and cooperation.</p>
      <div className="faithfully">Yours faithfully,</div>
      <div className="signature-space" />
      <div className="signature-line">Signature</div>
      <div className="director-grid">
        <span>Name</span><strong>{settings.director_name}</strong>
        <span>Designation</span><strong>{settings.director_designation}</strong>
        <span>Company</span><strong>{settings.director_company}</strong>
        <span>NIC No.</span><strong>{settings.director_nic}</strong>
        <span>Mobile No.</span><strong>{settings.director_mobile}</strong>
      </div>
    </div>
  )
}

function LetterDocument({ data, id }) {
  const pages = makePages(data.employees)
  return (
    <div id={id} className="salary-letter-document">
      {pages.map((page, pageIndex) => (
        <section className="salary-letter-page" key={pageIndex}>
          <img className="letterhead-background" src="/assets/salary-transfer-letterhead.png" alt="" />
          <div className={`letter-content ${data.employees.length > 8 ? 'letter-content-compact' : ''}`}>
            {page.type === 'complete' || page.type === 'first' ? <LetterIntro data={data} /> : (
              <>
                <div className="continuation-heading">SALARY TRANSFER REQUEST — CONTINUED</div>
                <div className="continuation-meta">Date: {displayDate(data.letter_date)} &nbsp; | &nbsp; Cheque No.: {data.cheque_number}</div>
                <div className="table-title">Employee Salary Details</div>
              </>
            )}
            <EmployeeTable employees={page.employees} start={page.start} total={data.total_salary} showTotal={page.type === 'complete' || page.type === 'last'} />
            {page.type === 'complete' || page.type === 'last' ? <LetterEnding settings={data.settings} /> : null}
            <div className="page-number">Page {pageIndex + 1} of {pages.length}</div>
          </div>
        </section>
      ))}
    </div>
  )
}

function SettingsForm({ value, onSave, saving }) {
  const [form, setForm] = useState(value)
  useEffect(() => setForm(value), [value])
  const fields = [
    ['salary_account_holder_name', 'Account Holder Name'],
    ['salary_personal_bank_account_no', 'Personal Bank Account No.'],
    ['director_name', 'Director Name'],
    ['director_designation', 'Designation'],
    ['director_company', 'Company'],
    ['director_nic', 'NIC No.'],
    ['director_mobile', 'Mobile No.'],
  ]
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form) }} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-emerald-400/15 dark:bg-emerald-950/25">
      <div className="mb-4">
        <h2 className="font-bold text-slate-900 dark:text-white">Company Settings</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">These details are snapshotted into every generated letter.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(([key, label]) => (
          <label className="block" key={key}>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
            <input required value={form[key] || ''} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
          </label>
        ))}
      </div>
      <button disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Company Settings
      </button>
    </form>
  )
}

export default function SalaryTransferRequestPage() {
  const { user } = useAuth()
  const { can, isSuperAdmin } = usePermissions()
  const toast = useToast()
  const [tab, setTab] = useState('request')
  const [employees, setEmployees] = useState([])
  const [included, setIncluded] = useState({})
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [history, setHistory] = useState([])
  const [letterDate, setLetterDate] = useState(todayISO())
  const [chequeNumber, setChequeNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [schemaMissing, setSchemaMissing] = useState(false)

  const canCreate = isSuperAdmin || can('finance_bank_letters', 'create')
  const canPrint = isSuperAdmin || can('finance_bank_letters', 'print')
  const canExport = isSuperAdmin || can('finance_bank_letters', 'export')

  const load = async () => {
    setLoading(true)
    const [employeeResult, settingsResult, historyResult] = await Promise.all([
      supabase.from('employees').select('id,name,bank_name,bank_account_number,salary_amount,is_rep,is_active').eq('is_rep', false).eq('is_active', true).order('name'),
      supabase.from('company_settings').select('*').eq('id', 'main').maybeSingle(),
      supabase.from('salary_transfer_letters').select('*').order('generated_at', { ascending: false }).limit(100),
    ])
    const missing = [employeeResult.error, settingsResult.error, historyResult.error].some((error) => error && (/salary_amount|company_settings|salary_transfer_letters|is_active/i.test(error.message || '') || error.code === 'PGRST205'))
    setSchemaMissing(missing)
    if (employeeResult.error) {
      toast.error('Could not load salary employees. Run the salary transfer migration first.')
      setEmployees([])
    } else {
      const rows = employeeResult.data || []
      setEmployees(rows)
      setIncluded(Object.fromEntries(rows.map((row) => [row.id, true])))
    }
    if (!settingsResult.error && settingsResult.data) setSettings({ ...DEFAULT_SETTINGS, ...settingsResult.data })
    if (!historyResult.error) setHistory(historyResult.data || [])
    setLoading(false)
  }

  useEffect(() => { load().catch((error) => { console.error(error); setLoading(false) }) }, [])

  const selectedEmployees = useMemo(() => employees.filter((employee) => included[employee.id]), [employees, included])
  const totalSalary = useMemo(() => selectedEmployees.reduce((sum, employee) => sum + Number(employee.salary_amount || 0), 0), [selectedEmployees])

  const currentData = useMemo(() => ({
    letter_date: letterDate,
    cheque_number: chequeNumber.trim(),
    employees: selectedEmployees.map(({ id, name, bank_name, bank_account_number, salary_amount }) => ({ id, name, bank_name, bank_account_number, salary_amount: Number(salary_amount) })),
    total_salary: totalSalary,
    settings,
  }), [letterDate, chequeNumber, selectedEmployees, totalSalary, settings])

  const validate = (data = currentData) => {
    if (!data.cheque_number) return 'Cheque Number is required.'
    if (!data.employees.length) return 'Include at least one employee.'
    for (const employee of data.employees) {
      if (!employee.name || !employee.bank_name || !employee.bank_account_number || Number(employee.salary_amount) <= 0) {
        return `Bank details or salary information is incomplete for ${employee.name || 'employee'}.`
      }
    }
    return null
  }

  const openPreview = () => {
    const error = validate()
    if (error) return toast.error(error)
    setPreviewData(currentData)
  }

  const exportPdf = async (data, { saveHistory = false } = {}) => {
    const validationError = validate(data)
    if (validationError) return toast.error(validationError)
    if (!canExport) return toast.error('Export permission is required.')
    setExporting(true)
    try {
      if (saveHistory) {
        if (!canCreate) throw new Error('Create permission is required.')
        const { data: saved, error } = await supabase.from('salary_transfer_letters').insert({
          letter_date: data.letter_date,
          cheque_number: data.cheque_number,
          employee_count: data.employees.length,
          total_salary: data.total_salary,
          employee_snapshot: data.employees,
          settings_snapshot: data.settings,
          generated_by: user?.id,
          generated_by_email: user?.email,
        }).select('*').single()
        if (error) throw error
        setHistory((rows) => [saved, ...rows])
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      const node = document.getElementById('salary-letter-export')
      await html2pdf().set({
        margin: 0,
        filename: `salary-transfer-${data.letter_date}-${data.cheque_number.replace(/[^a-z0-9-]/gi, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.99 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], before: '.salary-letter-page + .salary-letter-page', avoid: ['tr'] },
      }).from(node).save()
      toast.success('Salary transfer letter downloaded')
      logAction({ action: saveHistory ? 'generate_salary_transfer_letter' : 'redownload_salary_transfer_letter', targetType: 'salary_transfer_letter', targetLabel: data.cheque_number })
    } catch (error) {
      toast.error(error.message || 'Could not generate PDF')
    } finally {
      setExporting(false)
    }
  }

  const printLetter = (data) => {
    if (!canPrint) return toast.error('Print permission is required.')
    setPreviewData(data)
    setTimeout(() => window.print(), 150)
  }

  const historyData = (row) => ({
    letter_date: row.letter_date,
    cheque_number: row.cheque_number,
    employees: row.employee_snapshot || [],
    total_salary: Number(row.total_salary),
    settings: { ...DEFAULT_SETTINGS, ...(row.settings_snapshot || {}) },
  })

  const saveSettings = async (next) => {
    setSavingSettings(true)
    const payload = { ...DEFAULT_SETTINGS, ...next, id: 'main', updated_at: new Date().toISOString(), updated_by: user?.id }
    const { data, error } = await supabase.from('company_settings').upsert(payload).select('*').single()
    setSavingSettings(false)
    if (error) return toast.error(error.message)
    setSettings(data)
    toast.success('Company settings saved')
  }

  return (
    <div className="space-y-4">
      <style>{`
        .salary-letter-document{width:210mm;background:#fff;color:#111;font-family:Arial,sans-serif}
        .salary-letter-page{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;page-break-after:always}
        .salary-letter-page:last-child{page-break-after:auto}
        .letterhead-background{position:absolute;inset:0;width:210mm;height:297mm;object-fit:cover;z-index:0}
        .letter-content{position:absolute;z-index:1;top:53mm;left:25mm;right:14mm;bottom:24mm;font-size:11.5px;line-height:1.48;letter-spacing:.01px}
        .letter-content-compact{font-size:10.5px;line-height:1.4}
        .letter-content p{margin:8px 0;text-align:justify}
        .letter-meta{display:grid;grid-template-columns:1fr auto;align-items:start;column-gap:18mm;margin-bottom:12px}
        .recipient{line-height:1.42}.letter-date{align-self:start;padding-top:0;text-align:right;white-space:nowrap;line-height:1.42}.meta-label{font-weight:700}
        .subject{margin:12px 0 11px;border-top:1px solid #173f70;border-bottom:1px solid #173f70;padding:6px 8px;text-align:center;font-size:12px;font-weight:700;letter-spacing:.22px}
        .salutation{font-weight:600}
        .account-grid{margin:12px 0 13px;border:1px solid #9aa8b5;border-radius:3px;background:rgba(255,255,255,.68);overflow:hidden}
        .account-grid>div{display:grid;grid-template-columns:49mm 1fr;align-items:center;min-height:22px;border-bottom:1px solid #d7dee5}
        .account-grid>div:last-child{border-bottom:0}.account-grid span{padding:4px 8px;color:#334155;font-weight:600}.account-grid strong{border-left:1px solid #d7dee5;padding:4px 9px}
        .account-grid .total-detail{background:rgba(229,240,249,.78)}.account-grid .total-detail strong{color:#123f70;font-size:12px}
        .table-title{margin:12px 0 6px;text-align:left;color:#173f70;font-size:12px;font-weight:700;letter-spacing:.15px}
        .letter-table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.7);font-size:10.5px}
        .letter-table th,.letter-table td{border:1px solid #64748b;padding:6px 7px;vertical-align:middle;page-break-inside:avoid}
        .letter-table th{background:#e7eff6;font-weight:700;text-align:left;color:#172b3d}.letter-table .number-cell{width:9mm;text-align:center}
        .letter-table .amount-cell{text-align:right;width:35mm;font-variant-numeric:tabular-nums}.letter-table .total-row{background:#edf3f7;font-weight:700}.letter-table .total-row td:first-child{text-align:right}
        .letter-ending{margin-top:12px}.letter-ending p{margin:7px 0}.faithfully{margin-top:12px;font-weight:600}.signature-space{height:24px}
        .signature-line{width:45mm;border-top:1px solid #111;padding-top:3px;color:#475569;font-size:9px}
        .director-grid{display:grid;grid-template-columns:26mm 1fr;gap:2px 7px;margin-top:7px;line-height:1.35}.director-grid span{color:#475569}.director-grid strong{font-weight:600}
        .continuation-heading{text-align:center;font-size:13px;font-weight:700;margin-bottom:5px;color:#173f70}.continuation-meta{text-align:center;color:#475569;margin-bottom:12px}
        .page-number{position:absolute;right:0;bottom:-15mm;color:#64748b;font-size:8px}
        .letter-content-compact .letter-table{font-size:9.5px}.letter-content-compact .letter-table th,.letter-content-compact .letter-table td{padding:4px 6px}
        @media print{body *{visibility:hidden!important}.salary-preview-print,.salary-preview-print *{visibility:visible!important}.salary-preview-print{position:absolute!important;left:0!important;top:0!important;width:210mm!important}.print-hide{display:none!important}}
      `}</style>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-emerald-400/15 dark:bg-emerald-950/25">
        {[
          ['request', FileText, 'New Request'],
          ['history', FileClock, 'History'],
          ...(isSuperAdmin ? [['settings', Settings, 'Company Settings']] : []),
        ].map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${tab === key ? 'bg-slate-900 text-white dark:bg-emerald-600' : 'text-slate-600 hover:bg-slate-100 dark:text-emerald-100 dark:hover:bg-emerald-900/50'}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {schemaMissing ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          Salary transfer database objects are missing. Run <code className="font-mono text-xs">supabase/salary_transfer_letters.sql</code> in the Supabase SQL Editor, then refresh.
        </div>
      ) : null}

      {tab === 'request' ? (
        <>
          <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3 dark:border-emerald-400/15 dark:bg-emerald-950/25">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cheque Number <span className="text-red-500">*</span></span>
              <input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="Enter cheque number" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Letter Date</span>
              <input type="date" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} disabled={!isSuperAdmin} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900" />
            </label>
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Salary Amount</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">LKR {money(totalSalary)}</div>
              <div className="text-xs text-slate-500">{selectedEmployees.length} employee{selectedEmployees.length === 1 ? '' : 's'} included</div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-emerald-400/15 dark:bg-emerald-950/25">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-emerald-900/40">
              <h2 className="font-bold text-slate-900 dark:text-white">Employee Salary Details</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">All active, non-rep employees are included automatically. Exclusions apply only to this letter.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-emerald-950/40 dark:text-emerald-100/70">
                  <tr><th className="px-4 py-3 text-center">Include</th><th className="px-4 py-3 text-left">No.</th><th className="px-4 py-3 text-left">Employee Name</th><th className="px-4 py-3 text-left">Bank Name</th><th className="px-4 py-3 text-left">Bank Account Number</th><th className="px-4 py-3 text-right">Salary Amount (LKR)</th></tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={6} className="py-10 text-center text-slate-500"><Loader2 className="mx-auto animate-spin" /></td></tr> : employees.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No active non-rep employees found.</td></tr> : employees.map((employee, index) => {
                    const complete = employee.name && employee.bank_name && employee.bank_account_number && Number(employee.salary_amount) > 0
                    return (
                      <tr key={employee.id} className="border-t border-slate-100 dark:border-emerald-900/30">
                        <td className="px-4 py-3 text-center"><input type="checkbox" checked={!!included[employee.id]} onChange={(e) => setIncluded((current) => ({ ...current, [employee.id]: e.target.checked }))} className="h-4 w-4 accent-emerald-600" /></td>
                        <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{employee.name}</td>
                        <td className={`px-4 py-3 ${employee.bank_name ? 'text-slate-600 dark:text-emerald-100/80' : 'font-medium text-red-600'}`}>{employee.bank_name || 'Missing'}</td>
                        <td className={`px-4 py-3 font-mono text-xs ${employee.bank_account_number ? 'text-slate-600 dark:text-emerald-100/80' : 'font-medium text-red-600'}`}>{employee.bank_account_number || 'Missing'}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${Number(employee.salary_amount) > 0 ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-red-600'}`}>{money(employee.salary_amount)} {!complete && included[employee.id] ? <span title="Incomplete details">!</span> : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={openPreview} disabled={!canCreate || loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"><Eye size={16} /> Letter Preview</button>
            <button onClick={() => exportPdf(currentData, { saveHistory: true })} disabled={!canCreate || !canExport || exporting || loading} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download Salary Transfer Letter
            </button>
          </div>
        </>
      ) : null}

      {tab === 'history' ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-emerald-400/15 dark:bg-emerald-950/25">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-emerald-900/40"><h2 className="font-bold text-slate-900 dark:text-white">Salary Transfer Letter History</h2><p className="text-sm text-slate-500">Historical letters use their original employee and settings snapshots.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-emerald-950/40"><tr><th className="px-4 py-3 text-left">Letter Date</th><th className="px-4 py-3 text-left">Cheque No.</th><th className="px-4 py-3 text-right">Employees</th><th className="px-4 py-3 text-right">Total Salary</th><th className="px-4 py-3 text-left">Generated By</th><th className="px-4 py-3 text-left">Generated At</th><th className="px-4 py-3" /></tr></thead>
            <tbody>{history.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No generated letters yet.</td></tr> : history.map((row) => <tr key={row.id} className="border-t border-slate-100 dark:border-emerald-900/30"><td className="px-4 py-3">{displayDate(row.letter_date)}</td><td className="px-4 py-3 font-mono">{row.cheque_number}</td><td className="px-4 py-3 text-right">{row.employee_count}</td><td className="px-4 py-3 text-right font-semibold">LKR {money(row.total_salary)}</td><td className="px-4 py-3 text-slate-500">{row.generated_by_email || '—'}</td><td className="px-4 py-3 text-slate-500">{new Date(row.generated_at).toLocaleString()}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => setPreviewData(historyData(row))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="View"><Eye size={16} /></button>{canExport ? <button onClick={() => exportPdf(historyData(row))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Re-download PDF"><Download size={16} /></button> : null}</div></td></tr>)}</tbody>
          </table></div>
        </section>
      ) : null}

      {tab === 'settings' && isSuperAdmin ? <SettingsForm value={settings} onSave={saveSettings} saving={savingSettings} /> : null}

      {previewData ? (
        <div className="fixed inset-0 z-50 overflow-auto bg-slate-950/70 p-4 print:bg-white print:p-0">
          <div className="print-hide sticky top-0 z-10 mx-auto mb-4 flex max-w-[210mm] items-center justify-between rounded-xl bg-white p-3 shadow-lg">
            <div><div className="font-bold text-slate-900">Letter Preview</div><div className="text-xs text-slate-500">A4 preview using the official Shayan Kids &amp; Toys letterhead</div></div>
            <div className="flex gap-2">{canPrint ? <button onClick={() => printLetter(previewData)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"><Printer size={16} /> Print</button> : null}{canExport ? <button onClick={() => exportPdf(previewData, { saveHistory: previewData === currentData })} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Download size={16} /> Download PDF</button> : null}<button onClick={() => setPreviewData(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
          </div>
          <div className="salary-preview-print mx-auto w-[210mm] shadow-2xl"><LetterDocument data={previewData} /></div>
        </div>
      ) : null}

      <div aria-hidden="true" className="fixed left-[-10000px] top-0"><LetterDocument id="salary-letter-export" data={previewData || currentData} /></div>
    </div>
  )
}

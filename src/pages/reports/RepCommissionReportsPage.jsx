import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Download, FileText, Filter, Printer, RefreshCw, Search, SlidersHorizontal, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { LoadingSkeleton, exportToPDF } from '../../components/reports'
import { buildRepMonthlyPaymentStatus, buildRepReportModel, buildRepTransactions, day, inDateRange, num } from '../../lib/repReports'
import { COMMISSION_MONTHS } from '../../lib/repCommission'
import { REP_COLUMNS, REP_REPORTS, reportTitle } from './repReportConfig'
import logo from '../../pictures/logo.jpeg'

const money = (value) => `Rs. ${num(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const number = (value) => num(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
const iso = (value) => value.toISOString().slice(0, 10)
const empty = { rep:'', customer:'', product:'', method:'', commissionStatus:'', paymentStatus:'', invoice:'', month:'', year:'', search:'' }
const valueAt = (row, key) => key.split('.').reduce((value, part) => value?.[part], row)
const display = (row, column) => { const value=valueAt(row,column.key); if(value==null||value==='')return '-'; if(column.type==='money')return money(value); if(column.type==='number')return number(value); if(column.type==='percent')return `${num(value).toFixed(2)}%`; if(column.type==='date')return new Date(value).toLocaleDateString(); if(column.type==='datetime')return new Date(value).toLocaleString(); return String(value) }
const rowDate = (mode, row) => ['monthly','settlement'].includes(mode) ? `${row.period}-01` : ['advances','performance','customers','payment-status'].includes(mode) ? null : row.date

function statusPillClass(val) {
  const s = String(val || '').toLowerCase()
  if (s.includes('paid (advance)') || s === 'advance available') {
    return 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/50 dark:text-teal-200 dark:border-teal-700'
  }
  if (s === 'paid') {
    return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700'
  }
  if (s === 'partial') {
    return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-700'
  }
  if (s === 'unpaid') {
    return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/50 dark:text-rose-200 dark:border-rose-700'
  }
  return 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
}

function preset(key) {
  const now=new Date(), today=new Date(now.getFullYear(),now.getMonth(),now.getDate()), to=new Date(today); let from=new Date(today)
  if(key==='yesterday'){from.setDate(from.getDate()-1);to.setDate(to.getDate()-1)}
  if(key==='week')from.setDate(from.getDate()-((from.getDay()+6)%7))
  if(key==='month')from=new Date(today.getFullYear(),today.getMonth(),1)
  if(key==='last'){from=new Date(today.getFullYear(),today.getMonth()-1,1);to.setDate(0)}
  if(key==='year')from=new Date(today.getFullYear(),0,1)
  return {from:iso(from),to:iso(to)}
}

function baseRows(mode, model, statusYear, statusMonth) {
  if(mode==='sales')return model.salesRows
  if(mode==='monthly'||mode==='settlement')return model.periodRows
  if(mode==='payment-status')return buildRepMonthlyPaymentStatus(model, statusYear, statusMonth)
  if(mode==='payments')return model.paymentRows
  if(mode==='advances')return model.advanceRows
  if(mode==='customers')return model.customerRows
  if(mode==='collections')return model.collectionRows
  if(mode==='performance')return model.performanceRows
  return buildRepTransactions(model)
}

function summary(mode, rows, model, statusMonth) {
  const sum=(key)=>rows.reduce((total,row)=>total+num(row[key]),0)
  if(mode==='sales')return [['Total Orders',new Set(rows.map(x=>x.orderNumber).filter(x=>x&&x!=='-')).size],['Total Invoices',new Set(rows.map(x=>x.invoiceId)).size],['Quantity Sold',sum('quantity')],['Total Sales',money(sum('salesValue'))],['Gross Profit',money(sum('grossProfit'))],['Commission Earned',money(sum('commissionEarned'))]]
  if(mode==='payment-status'){const paidCount=rows.filter(x=>x.status==='Paid'||x.status==='Paid (Advance)').length,unpaidCount=rows.filter(x=>x.status==='Unpaid'||x.status==='Partial').length,repCount=new Set(rows.map(x=>x.repId)).size;return statusMonth==='all'?[['Reps Shown',number(repCount)],['Paid Months',number(paidCount)],['Unpaid / Partial Months',number(unpaidCount)],['Commission Earned',money(sum('commissionEarned'))],['Unpaid Balance',money(sum('remainingDue'))]]:[['Total Reps',number(rows.length)],['Paid Reps',number(paidCount)],['Unpaid / Partial Reps',number(unpaidCount)],['Commission Earned',money(sum('commissionEarned'))],['Unpaid Balance',money(sum('remainingDue'))]]}
  if(mode==='monthly'||mode==='settlement'){const repIds=new Set(rows.map(x=>String(x.repId))),liveAdvance=(model?.advanceRows||[]).filter(x=>!repIds.size||repIds.has(String(x.repId))).reduce((s,x)=>s+num(x.currentAdvanceBalance),0);return [['Total Sales',money(sum('totalSales'))],['Commission Earned',money(sum('commissionEarned'))],['Amount Paid',money(sum('amountPaid'))],['Outstanding',money(sum('remainingDue'))],['Advance Balance',money(liveAdvance)]]}
  if(mode==='payments'){const periodDue=[...new Map(rows.map(x=>[String(x.repId)+'|'+x.period,x])).values()].reduce((s,x)=>s+num(x.remainingDue),0),repIds=new Set(rows.map(x=>String(x.repId))),advance=(model?.advanceRows||[]).filter(x=>!repIds.size||repIds.has(String(x.repId))).reduce((s,x)=>s+num(x.currentAdvanceBalance),0);return [['Total Payments',money(sum('amountPaid'))],['Commission Settled',money(sum('commissionSettled'))],['Advance Paid',money(sum('advanceCreated'))],['Outstanding',money(periodDue)],['Advance Balance',money(advance)]]}
  if(mode==='advances')return [['Commission Due',money(sum('currentCommissionDue'))],['Advance Balance',money(sum('currentAdvanceBalance'))],['Advance Created',money(sum('advanceCreated'))],['Advance Applied',money(sum('advanceApplied'))],['Net Payable',money(sum('netAmountPayable'))]]
  if(mode==='customers')return [['Rep / Customer Accounts',number(rows.length)],['Total Sales',money(sum('totalSales'))],['Payments Received',money(sum('paymentsReceived'))],['Outstanding',money(sum('outstanding'))],['Over Credit Limit',number(rows.filter(x=>x.creditStatus==='Over Limit').length)]]
  if(mode==='collections'){const by=(method)=>rows.filter(x=>String(x.method).toLowerCase()===method).reduce((s,x)=>s+num(x.amountCollected),0),remaining=[...new Map(rows.map(x=>[x.invoiceNumber,x.remainingBalance])).values()].reduce((s,x)=>s+num(x),0);return [['Total Collections',money(sum('amountCollected'))],['Cash',money(by('cash'))],['Bank',money(by('bank'))],['Cheque',money(by('cheque'))],['Remaining',money(remaining)]]}
  if(mode==='performance')return [['Active Reps',number(rows.filter(x=>x.status==='Active').length)],['Total Sales',money(sum('sales'))],['Gross Profit',money(sum('grossProfit'))],['Collections',money(sum('collections'))],['Outstanding',money(sum('outstanding'))]]
  return [['Transactions',number(rows.length)],['Orders',number(rows.filter(x=>x.type.includes('Order')).length)],['Invoices',number(rows.filter(x=>x.type.includes('Invoice')).length)],['Collections',money(rows.filter(x=>x.type.includes('Payment Received')).reduce((s,x)=>s+num(x.amount),0))],['Rep Payments',money(rows.filter(x=>x.type==='Rep Payment Made').reduce((s,x)=>s+num(x.amount),0))]]
}

function FilterPanel({raw,range,setRange,draft,setDraft,apply,reset}) {
  const set=(key,value)=>setDraft(current=>({...current,[key]:value})); const years=[...new Set((raw.invoices||[]).map(x=>day(x.created_at).slice(0,4)).filter(Boolean))].sort().reverse()
  return <section className="rounded-xl border border-slate-200 bg-white p-4 text-slate-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-50 print:hidden">
    <div className="mb-3 flex flex-wrap gap-2">{[['today','Today'],['yesterday','Yesterday'],['week','This Week'],['month','This Month'],['last','Last Month'],['year','This Year']].map(([key,label])=><button key={key} className="action" onClick={()=>setRange(preset(key))}>{label}</button>)}</div>
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <input className="field" type="date" value={range.from} onChange={e=>setRange(x=>({...x,from:e.target.value}))}/><input className="field" type="date" value={range.to} onChange={e=>setRange(x=>({...x,to:e.target.value}))}/>
      <select className="field" value={draft.rep} onChange={e=>set('rep',e.target.value)}><option value="">All reps</option>{raw.employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select className="field" value={draft.customer} onChange={e=>set('customer',e.target.value)}><option value="">All customers</option>{raw.customers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select className="field" value={draft.product} onChange={e=>set('product',e.target.value)}><option value="">All products</option>{raw.products.map(x=><option key={x.id} value={x.id}>{x.code || '-'} · {x.name}</option>)}</select>
      <input className="field" placeholder="Invoice number" value={draft.invoice} onChange={e=>set('invoice',e.target.value)}/>
      <select className="field" value={draft.month} onChange={e=>set('month',e.target.value)}><option value="">All months</option>{Array.from({length:12},(_,i)=><option key={i} value={i}>{new Date(2020,i,1).toLocaleString(undefined,{month:'long'})}</option>)}</select>
      <select className="field" value={draft.year} onChange={e=>set('year',e.target.value)}><option value="">All years</option>{years.map(x=><option key={x}>{x}</option>)}</select>
      <select className="field" value={draft.method} onChange={e=>set('method',e.target.value)}><option value="">All payment methods</option>{['cash','bank','cheque','other'].map(x=><option key={x}>{x}</option>)}</select>
      <select className="field" value={draft.commissionStatus} onChange={e=>set('commissionStatus',e.target.value)}><option value="">All commission statuses</option>{['Unpaid','Partial','Paid','Paid (Advance)','Commission Due','Settled'].map(x=><option key={x}>{x}</option>)}</select>
      <select className="field" value={draft.paymentStatus} onChange={e=>set('paymentStatus',e.target.value)}><option value="">All payment statuses</option>{['paid','partial','unpaid'].map(x=><option key={x}>{x}</option>)}</select>
      <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400"/><input className="field w-full pl-9" placeholder="Search report" value={draft.search} onChange={e=>set('search',e.target.value)}/></div>
    </div>
    <div className="mt-3 flex justify-end gap-2"><button className="action" onClick={reset}><RefreshCw size={14}/>Reset</button><button className="action border-emerald-600 bg-emerald-600 !text-white" onClick={apply}><Filter size={14}/>Apply Filters</button></div>
  </section>
}

function ExportDocument({mode,range,filters,user,columns,rows,cards,repName,statusLabel}) {
  const isSingleSettlement = mode==='settlement'&&rows.length===1
  const firstPageSize = 22
  const nextPageSize = 30
  const chunks = []
  if (!isSingleSettlement) {
    if (rows.length === 0) {
      chunks.push([])
    } else {
      chunks.push(rows.slice(0, firstPageSize))
      for (let i = firstPageSize; i < rows.length; i += nextPageSize) {
        chunks.push(rows.slice(i, i + nextPageSize))
      }
    }
  }
  const alignClass = (col) => ['money','number','percent'].includes(col.type) ? 'text-right tabular-nums' : 'text-left'
  return <div className="fixed left-[-99999px] top-0 print:static"><div id="rep-report-export" style={{ width: isSingleSettlement ? '700px' : '1260px', maxWidth: '100%' }} className="bg-white p-4 text-black print:w-auto print:p-0">
    <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-3"><div className="flex items-center gap-3"><img src={logo} alt="Company logo" className="rounded" style={{ width: '56px', height: '56px', objectFit: 'cover', flexShrink: 0 }}/><div><h1 className="text-xl font-bold">Tiny Bloom</h1><p>Wholesale Management System</p><b>{reportTitle(mode)}</b>{repName?<p>Rep: {repName}</p>:null}</div></div><div className="shrink-0 text-right text-xs"><p>{mode==='payment-status' ? `Period: ${statusLabel}` : `Date Range: ${range.from} to ${range.to}`}</p><p>Generated By: {user||'-'}</p><p>Generated: {new Date().toLocaleString()}</p></div></header>
    {cards.length > 0 ? <div className="my-3 grid gap-2 text-xs" style={{ gridTemplateColumns: `repeat(${Math.min(cards.length, 6)}, minmax(0, 1fr))` }}>{cards.map(([label,value])=><div key={label} className="rounded border border-slate-200 p-2"><b>{label}</b><br/>{value}</div>)}</div> : null}
    {isSingleSettlement?<section className="mx-auto mt-6 max-w-2xl rounded-xl border-2 border-slate-800 p-6"><h2 className="border-b pb-3 text-center text-lg font-bold">Monthly Commission Settlement</h2><div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">{columns.map(column=><React.Fragment key={column.key}><b className="border-b border-slate-200 py-1">{column.label}</b><span className="border-b border-slate-200 py-1 text-right">{display(rows[0],column)}</span></React.Fragment>)}</div><div className="mt-12 grid grid-cols-2 gap-16 text-center text-xs"><div className="border-t border-black pt-2">Rep Signature</div><div className="border-t border-black pt-2">Authorized Signature</div></div></section>:chunks.map((chunk,chunkIdx)=><div key={chunkIdx} className={chunkIdx>0?'pdf-page-break pt-2':''}><table className="rep-export-table w-full border-collapse"><thead><tr>{columns.map(column=><th key={column.key} className={`border border-slate-400 bg-slate-100 p-1 font-bold ${alignClass(column)}`}>{column.label}</th>)}</tr></thead><tbody>{chunk.length?chunk.map((row,index)=><tr key={row.id||`${chunkIdx}-${index}`}>{columns.map(column=><td key={column.key} className={`border border-slate-300 p-1 ${alignClass(column)}`}>{display(row,column)}</td>)}</tr>):<tr><td colSpan={columns.length} className="border border-slate-300 p-4 text-center">No records match the selected filters.</td></tr>}</tbody>{chunkIdx===chunks.length-1?<tfoot><tr><td colSpan={columns.length} className="border border-slate-400 p-2 font-bold">Records: {rows.length} · {cards.map(([k,v])=>`${k}: ${v}`).join(' · ')}</td></tr></tfoot>:null}</table></div>)}
    <footer className="mt-3 border-t border-slate-400 pt-1 text-center text-[8px]">Tiny Bloom · {reportTitle(mode)}</footer>
  </div></div>
}

export default function RepCommissionReportsPage({initialMode='sales'}) {
  const {user}=useAuth(), {can,isSuperAdmin}=usePermissions(); const [mode,setMode]=useState(initialMode),[range,setRange]=useState(()=>preset('year'))
  const [raw,setRaw]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[draft,setDraft]=useState(empty),[filters,setFilters]=useState(empty)
  const [sort,setSort]=useState({key:'date',dir:'desc'}),[page,setPage]=useState(1),[size,setSize]=useState(25),[visibleColumns,setVisibleColumns]=useState(null),[columnsOpen,setColumnsOpen]=useState(false)
  const [statusYear,setStatusYear]=useState(()=>new Date().getFullYear()),[statusMonth,setStatusMonth]=useState(()=>new Date().getMonth()),[statusQuickFilter,setStatusQuickFilter]=useState(''),[customYearMode,setCustomYearMode]=useState(false)
  useEffect(()=>{setMode(initialMode)},[initialMode])
  const load=async()=>{setLoading(true);setError('');const tables=['employees','orders','order_items','invoices','invoice_items','invoice_payments','customers','products','returns','return_items','rep_commission_payments','rep_payments','commissions','audit_logs'];const results=await Promise.all(tables.map(async table=>({table,...await supabase.from(table).select('*')})));const next={};let failure='';results.forEach(({table,data,error:e})=>{next[table]=data||[];if(e&&!['rep_commission_payments','rep_payments','commissions','return_items','audit_logs'].includes(table))failure=`${table}: ${e.message}`});next.employees=(next.employees||[]).filter(x=>x.is_rep===true);setRaw(next);setError(failure);setLoading(false)}
  useEffect(()=>{load()},[]); const model=useMemo(()=>raw?buildRepReportModel(raw):null,[raw]); useEffect(()=>{setPage(1);setVisibleColumns(null);if(mode==='payment-status')setSort(statusMonth==='all'?{key:'rep',dir:'asc'}:{key:'remainingDue',dir:'desc'})},[mode,filters,range,size,statusYear,statusMonth,statusQuickFilter])
  const columns=REP_COLUMNS[mode], enabled=visibleColumns||columns.map(x=>x.key), shownColumns=columns.filter(x=>enabled.includes(x.key))
  const reportModel=useMemo(()=>{if(!raw||!['customers','performance'].includes(mode))return model;const within=x=>inDateRange(x,range.from,range.to),invoices=raw.invoices.filter(x=>within(x.created_at)),invoiceIds=new Set(invoices.map(x=>String(x.id))),orders=raw.orders.filter(x=>within(x.created_at)),orderIds=new Set(orders.map(x=>String(x.id)));return buildRepReportModel({...raw,invoices,invoice_items:raw.invoice_items.filter(x=>invoiceIds.has(String(x.invoice_id))),invoice_payments:raw.invoice_payments.filter(x=>invoiceIds.has(String(x.invoice_id))),returns:raw.returns.filter(x=>invoiceIds.has(String(x.invoice_id))&&within(x.created_at)),orders,order_items:raw.order_items.filter(x=>orderIds.has(String(x.order_id))),rep_commission_payments:raw.rep_commission_payments.filter(x=>within(x.paid_at||x.created_at)),rep_payments:raw.rep_payments.filter(x=>within(x.paid_at||x.created_at))})},[raw,model,mode,range])
  const statusBaseRows=useMemo(()=>mode==='payment-status'&&reportModel?buildRepMonthlyPaymentStatus(reportModel,statusYear,statusMonth):[],[mode,reportModel,statusYear,statusMonth])
  const statusCounts=useMemo(()=>{
    const counts={all:statusBaseRows.length,Paid:0,Partial:0,Unpaid:0,'No Commission':0}
    statusBaseRows.forEach(r=>{if(r.status==='Paid'||r.status==='Paid (Advance)')counts.Paid++;else if(r.status==='Partial')counts.Partial++;else if(r.status==='Unpaid')counts.Unpaid++;else counts['No Commission']++})
    return counts
  },[statusBaseRows])
  const filtered=useMemo(()=>{if(!reportModel)return[];let rows=baseRows(mode,reportModel,statusYear,statusMonth).filter(row=>{const date=rowDate(mode,row);if(date&&!inDateRange(date,range.from,range.to))return false;if(filters.rep&&String(row.repId)!==String(filters.rep))return false;if(filters.customer&&String(row.customerId)!==String(filters.customer))return false;if(filters.product&&String(row.productId)!==String(filters.product))return false;if(filters.method&&String(row.method).toLowerCase()!==filters.method)return false;if(filters.commissionStatus&&row.status!==filters.commissionStatus)return false;if(mode==='payment-status'&&statusQuickFilter){if(statusQuickFilter==='Paid'){if(row.status!=='Paid'&&row.status!=='Paid (Advance)')return false}else if(row.status!==statusQuickFilter)return false}if(filters.paymentStatus&&String(row.paymentStatus||'').toLowerCase()!==filters.paymentStatus)return false;if(filters.invoice&&!String(row.invoiceNumber||'').toLowerCase().includes(filters.invoice.toLowerCase()))return false;if(mode!=='payment-status'&&filters.month!==''&&date&&Number(row.monthIndex??new Date(date).getMonth())!==Number(filters.month))return false;if(mode!=='payment-status'&&filters.year&&date&&String(row.year??new Date(date).getFullYear())!==String(filters.year))return false;const q=filters.search.toLowerCase();return !q||Object.values(row).some(value=>['string','number'].includes(typeof value)&&String(value).toLowerCase().includes(q))});return rows},[reportModel,mode,filters,range,statusYear,statusMonth,statusQuickFilter])
  const sorted=useMemo(()=>[...filtered].sort((a,b)=>{
    if(mode==='payment-status'&&statusMonth==='all'&&sort.key==='rep'&&a.rep===b.rep){
      return num(a.monthIndex)-num(b.monthIndex)
    }
    const av=valueAt(a,sort.key),bv=valueAt(b,sort.key);if(av==null)return 1;if(bv==null)return-1;const result=typeof av==='number'?av-num(bv):String(av).localeCompare(String(bv),undefined,{numeric:true});return sort.dir==='asc'?result:-result
  }),[filtered,sort,mode,statusMonth]);const pages=Math.max(1,Math.ceil(sorted.length/size)),visible=sorted.slice((page-1)*size,page*size),cards=summary(mode,filtered,reportModel,statusMonth)
  const repYearlyGroups=useMemo(()=>{
    if(mode!=='payment-status'||statusMonth!=='all')return []
    const map=new Map()
    filtered.forEach(r=>{
      const key=String(r.repId)
      if(!map.has(key))map.set(key,{repId:r.repId,rep:r.rep,rows:[],paid:0,partial:0,unpaid:0,nil:0,earned:0,paidAmt:0,due:0})
      const g=map.get(key)
      g.rows.push(r)
      g.earned+=num(r.commissionEarned)
      g.paidAmt+=num(r.amountPaid)
      g.due+=num(r.remainingDue)
      if(r.status==='Paid'||r.status==='Paid (Advance)')g.paid++
      else if(r.status==='Partial')g.partial++
      else if(r.status==='Unpaid')g.unpaid++
      else g.nil++
    })
    return [...map.values()].map(g=>({...g,rows:[...g.rows].sort((a,b)=>num(a.monthIndex)-num(b.monthIndex))}))
  },[filtered,mode,statusMonth])
  const exportRows=()=>sorted.map(row=>Object.fromEntries(shownColumns.map(column=>[column.label,valueAt(row,column.key)??''])))
  const excel=()=>{const book=XLSX.utils.book_new(),sheet=XLSX.utils.json_to_sheet(exportRows());XLSX.utils.book_append_sheet(book,sheet,reportTitle(mode).slice(0,31));XLSX.writeFile(book,`${mode}-rep-report.xlsx`)}
  const csv=()=>{const sheet=XLSX.utils.json_to_sheet(exportRows()),link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff'+XLSX.utils.sheet_to_csv(sheet)],{type:'text/csv'}));link.download=`${mode}-rep-report.csv`;link.click();URL.revokeObjectURL(link.href)}
  if(loading)return <LoadingSkeleton/>;if(!isSuperAdmin&&!can('reports_reps','view'))return <div className="rounded-xl bg-rose-50 p-6 text-rose-700">Rep Reports permission is required.</div>;if(!model)return <div className="rounded-xl bg-rose-50 p-6 text-rose-700">Unable to load Rep Reports. {error}</div>
  const selectedRep=raw.employees.find(x=>String(x.id)===String(filters.rep)), missingCostCount=raw.invoice_items.filter(x=>x.cost_price==null).length
  const statusLabel=statusMonth==='all'?`Full Year ${statusYear}`:`${COMMISSION_MONTHS[statusMonth]} ${statusYear}`
  const statusYears=Array.from({length:6},(_,i)=>new Date().getFullYear()-i)
  const isThisMonth=statusMonth!=='all'&&statusYear===new Date().getFullYear()&&statusMonth===new Date().getMonth()
  const isLastMonth=(()=>{const d=new Date();d.setMonth(d.getMonth()-1);return statusMonth!=='all'&&statusYear===d.getFullYear()&&statusMonth===d.getMonth()})()
  const isThisYear=statusMonth==='all'&&statusYear===new Date().getFullYear()&&!customYearMode
  const setStatusToCurrentMonth=()=>{const d=new Date();setStatusYear(d.getFullYear());setStatusMonth(d.getMonth());setCustomYearMode(false)}
  const setStatusToLastMonth=()=>{const d=new Date();d.setMonth(d.getMonth()-1);setStatusYear(d.getFullYear());setStatusMonth(d.getMonth());setCustomYearMode(false)}
  const setStatusToThisYear=()=>{setStatusYear(new Date().getFullYear());setStatusMonth('all');setCustomYearMode(false)}
  const setStatusToCustomYear=()=>{setStatusMonth('all');setCustomYearMode(true)}
  return <div className="space-y-5 text-slate-800 dark:text-emerald-50"><div className="space-y-5 print:hidden">
    <header className="rounded-lg border border-slate-200 bg-white p-4 text-slate-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-50"><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Rep & Commission Reports</p><h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{reportTitle(mode)}</h1><p className="text-sm text-slate-500 dark:text-emerald-100/70">Sales, commissions, payments, advances, settlements, collections and factual rep performance.</p>{error?<p className="mt-2 text-sm text-amber-600 dark:text-amber-300">Report data warning: {error}</p>:null}{missingCostCount?<p className="mt-2 text-sm text-amber-600 dark:text-amber-300">{missingCostCount} invoice line{missingCostCount===1?'':'s'} have no historical cost snapshot. Their cost and gross profit are shown as unavailable, never replaced with current product cost.</p>:null}</header>
    <div className="flex gap-2 overflow-x-auto pb-1">{REP_REPORTS.map(([key,label])=><button key={key} onClick={()=>setMode(key)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${mode===key?'bg-emerald-600 text-white':'border border-slate-200 bg-white text-slate-600 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'}`}>{label}</button>)}</div>
    {mode==='payment-status' ? (
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-slate-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-50 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">Period:</span>
            <button type="button" onClick={setStatusToCurrentMonth} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${isThisMonth?'bg-emerald-600 text-white':'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'}`}>This Month</button>
            <button type="button" onClick={setStatusToLastMonth} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${isLastMonth?'bg-emerald-600 text-white':'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'}`}>Last Month</button>
            <button type="button" onClick={setStatusToThisYear} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${isThisYear?'bg-emerald-600 text-white':'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'}`}>This Year</button>
            <button type="button" onClick={setStatusToCustomYear} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${customYearMode?'bg-emerald-600 text-white':'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'}`}>Custom Year</button>
            <select className="field" value={statusMonth} onChange={e=>{const val=e.target.value;setStatusMonth(val==='all'?'all':Number(val))}}><option value="all">Full Year (All Months)</option>{COMMISSION_MONTHS.map((m,idx)=><option key={m} value={idx}>{m}</option>)}</select>
            {customYearMode || !statusYears.includes(Number(statusYear)) ? (
              <input type="number" min="2000" max="2100" className="field w-28" placeholder="Year" value={statusYear} onChange={e=>{const v=Number(e.target.value);if(v>=1900&&v<=2100)setStatusYear(v);else setStatusYear(e.target.value)}}/>
            ) : (
              <select className="field" value={statusYear} onChange={e=>{if(e.target.value==='custom'){setCustomYearMode(true)}else{setStatusYear(Number(e.target.value))}}}>{statusYears.map(y=><option key={y} value={y}>{y}</option>)}<option value="custom">Custom Year...</option></select>
            )}
            <select className="field" value={filters.rep} onChange={e=>{const val=e.target.value;setDraft(d=>({...d,rep:val}));setFilters(f=>({...f,rep:val}))}}><option value="">All reps</option>{raw.employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <input className="field" placeholder="Search rep..." value={filters.search} onChange={e=>{setDraft(d=>({...d,search:e.target.value}));setFilters(f=>({...f,search:e.target.value}))}}/>
          </div>
          <Link to="/finance/rep-payments" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"><Wallet size={14}/> Record Rep Payment</Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-emerald-800/40">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-100/60">Payment Status:</span>
          {[
            ['', `All Reps (${statusCounts.all})`, 'bg-slate-900 text-white dark:bg-emerald-600'],
            ['Paid', `Paid (${statusCounts.Paid})`, 'bg-emerald-600 text-white'],
            ['Partial', `Partial (${statusCounts.Partial})`, 'bg-amber-600 text-white'],
            ['Unpaid', `Unpaid (${statusCounts.Unpaid})`, 'bg-rose-600 text-white'],
            ['No Commission', `No Commission (${statusCounts['No Commission']})`, 'bg-slate-600 text-white'],
          ].map(([val, lbl, activeCls])=>(
            <button key={lbl} type="button" onClick={()=>setStatusQuickFilter(val)} className={`rounded-full px-3 py-1 text-xs font-bold transition ${statusQuickFilter===val ? activeCls : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'}`}>{lbl}</button>
          ))}
        </div>
      </section>
    ) : (
      <FilterPanel raw={raw} range={range} setRange={setRange} draft={draft} setDraft={setDraft} apply={()=>setFilters(draft)} reset={()=>{setDraft(empty);setFilters(empty);setRange(preset('year'))}}/>
    )}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{cards.map(([label,value])=><div key={label} className="rounded-lg border border-slate-200 bg-white p-3 text-slate-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-50"><p className="text-[10px] font-bold uppercase text-slate-500 dark:text-emerald-100/60">{label}</p><p className={`mt-1 font-bold ${label==='Paid Reps'||label==='Paid Months'?'text-emerald-600 dark:text-emerald-400':label.includes('Unpaid')?'text-rose-600 dark:text-rose-400':'text-slate-900 dark:text-white'}`}>{value}</p></div>)}</div>
    {mode==='payment-status'&&statusMonth==='all'&&(
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-emerald-200">
            Rep Month-by-Month Payment Status ({statusYear})
          </h2>
          <span className="text-xs text-slate-500 dark:text-emerald-100/60">{repYearlyGroups.length} rep(s)</span>
        </div>
        {repYearlyGroups.length===0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100/60">
            No rep records match the selected filters for {statusYear}.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {repYearlyGroups.map(g=>(
              <div key={g.repId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/20">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-emerald-800/40">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{g.rep}</h3>
                    <p className="text-[11px] text-slate-500 dark:text-emerald-100/60">
                      Earned: {money(g.earned)} · Paid: {money(g.paidAmt)} · Due: <span className={g.due>0.005?'font-bold text-rose-600 dark:text-rose-400':''}>{money(g.due)}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                    {g.paid>0&&<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">{g.paid} Paid</span>}
                    {g.partial>0&&<span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">{g.partial} Partial</span>}
                    {g.unpaid>0&&<span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200">{g.unpaid} Unpaid</span>}
                  </div>
                </div>
                <div className="mt-3 divide-y divide-slate-100 dark:divide-emerald-900/30">
                  {g.rows.map(r=>(
                    <div key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                      <span className="font-medium text-slate-700 dark:text-emerald-50">{r.monthName}</span>
                      <div className="flex items-center gap-2">
                        {r.remainingDue>0.005 ? (
                          <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums">Due {money(r.remainingDue)}</span>
                        ) : r.commissionEarned>0.005 || r.amountPaid>0.005 ? (
                          <span className="text-[11px] text-slate-500 dark:text-emerald-100/60 tabular-nums">{money(r.amountPaid>0?r.amountPaid:r.commissionEarned)}</span>
                        ) : null}
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusPillClass(r.paidThisMonth)}`}>
                          {r.paidThisMonth}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    )}
    <div className="flex flex-wrap items-center gap-2"><select className="field" value={sort.key} onChange={e=>setSort({key:e.target.value,dir:sort.dir})}>{columns.map(x=><option key={x.key} value={x.key}>Sort: {x.label}</option>)}</select><button className="action" onClick={()=>setSort(x=>({...x,dir:x.dir==='asc'?'desc':'asc'}))}>{sort.dir==='asc'?'Ascending':'Descending'}</button><div className="relative"><button className="action" onClick={()=>setColumnsOpen(x=>!x)}><SlidersHorizontal size={14}/>Columns</button>{columnsOpen?<div className="absolute right-0 z-30 mt-2 max-h-80 w-64 overflow-auto rounded-xl border bg-white p-3 text-slate-800 shadow-xl dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50">{columns.map(column=><label key={column.key} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={enabled.includes(column.key)} onChange={()=>setVisibleColumns(current=>{const list=current||columns.map(x=>x.key);return list.includes(column.key)?list.filter(x=>x!==column.key):[...list,column.key]})}/>{column.label}</label>)}</div>:null}</div><span className="ml-auto text-sm text-slate-500 dark:text-emerald-100/70">{sorted.length} filtered records</span>
      {(isSuperAdmin||can('reports_reps','print'))?<button className="action" onClick={()=>window.print()}><Printer size={14}/>Print</button>:null}{(isSuperAdmin||can('reports_reps','export'))?<><button className="action" onClick={()=>exportToPDF('rep-report-export',`${mode}-rep-report.pdf`,{orientation:mode==='settlement'&&sorted.length===1?'portrait':'landscape',pageNumbers:true,scale:2,margin:[0.28,0.25,0.42,0.25]})}><FileText size={14}/>PDF</button><button className="action" onClick={excel}><Download size={14}/>Excel</button><button className="action" onClick={csv}><Download size={14}/>CSV</button></>:null}
    </div>
    <div className="max-h-[68vh] overflow-auto rounded-lg border border-slate-200 bg-white text-slate-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-50"><table className="min-w-full text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-emerald-900 dark:text-emerald-50"><tr>{shownColumns.map(column=><th key={column.key} className={`whitespace-nowrap p-3 font-semibold ${['money','number','percent'].includes(column.type)?'text-right':'text-left'}`}>{column.label}</th>)}</tr></thead><tbody>{visible.length?visible.map((row,index)=><tr key={row.id||index} className="border-t border-slate-100 text-slate-700 dark:border-emerald-900/40 dark:text-emerald-50">{shownColumns.map(column=><td key={column.key} className={`whitespace-nowrap p-3 ${['money','number','percent'].includes(column.type)?'text-right tabular-nums':''}`}>{mode==='payment-status'&&(column.key==='paidThisMonth'||column.key==='status')?<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusPillClass(valueAt(row,column.key))}`}>{display(row,column)}</span>:display(row,column)}</td>)}</tr>):<tr><td colSpan={shownColumns.length} className="p-12 text-center text-slate-500 dark:text-emerald-100/60">No records match the selected filters.</td></tr>}</tbody></table></div>
    <div className="flex items-center justify-between rounded-lg border bg-white p-3 text-slate-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-50"><span className="text-sm text-slate-500 dark:text-emerald-100/70">Page {page} of {pages}</span><div className="flex gap-2"><select className="field" value={size} onChange={e=>setSize(Number(e.target.value))}>{[10,25,50,100].map(x=><option key={x}>{x}</option>)}</select><button className="action" disabled={page===1} onClick={()=>setPage(x=>x-1)}>Previous</button><button className="action" disabled={page===pages} onClick={()=>setPage(x=>x+1)}>Next</button></div></div>
  </div><ExportDocument mode={mode} range={range} filters={filters} user={user?.email} columns={shownColumns} rows={sorted} cards={cards} repName={selectedRep?.name} statusLabel={statusLabel}/></div>
}

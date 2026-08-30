import React,{useMemo,useState}from'react'
import{ArrowRight,BarChart3,Clock,FileText,Search,Star}from'lucide-react'
import{Link}from'react-router-dom'
import{useAuth}from'../../contexts/AuthContext';import{usePermissions}from'../../contexts/PermissionsContext'
import{REPORT_CATEGORIES,categoryPath,reportAction,reportPath,userStorageKey}from'./reportCatalog'

export default function ReportsLandingPage(){const{user}=useAuth(),{can,isSuperAdmin}=usePermissions(),[query,setQuery]=useState('')
 const read=kind=>{try{return JSON.parse(localStorage.getItem(userStorageKey(user,kind))||'[]')}catch{return[]}}
 const[favorites,setFavorites]=useState(()=>read('favorites')),recent=read('recent')
 const categories=useMemo(()=>REPORT_CATEGORIES.map(category=>({...category,reports:category.reports.filter(item=>isSuperAdmin||can(item.module,reportAction(item)))})).filter(category=>category.reports.length),[can,isSuperAdmin])
 const all=categories.flatMap(category=>category.reports.map(report=>({category,report,path:reportPath(category,report)})))
 const byPath=new Map(all.map(item=>[item.path,item])),favoriteItems=favorites.map(path=>byPath.get(path)).filter(Boolean),recentItems=recent.map(path=>byPath.get(path)).filter(Boolean).slice(0,5)
 const results=query.trim()?all.filter(({category,report})=>`${category.title} ${report.name} ${report.keywords}`.toLowerCase().includes(query.trim().toLowerCase())):[]
 const toggle=path=>{const next=favorites.includes(path)?favorites.filter(x=>x!==path):[...favorites,path];setFavorites(next);localStorage.setItem(userStorageKey(user,'favorites'),JSON.stringify(next))}
 const ReportLink=({item})=><div className="report-home-link"><Link to={item.path}><FileText size={15}/>{item.report.name}</Link><button onClick={()=>toggle(item.path)} aria-label="Toggle favorite"><Star size={15} fill={favorites.includes(item.path)?'currentColor':'none'}/></button></div>
 return <div className="space-y-5">
  <header className="report-home-header"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-500/10 p-3"><BarChart3 size={30} className="text-emerald-600"/></div><div><h1 className="text-2xl font-bold">Reports</h1><p className="text-sm text-slate-500">Find any business report in two or three clicks.</p></div></div><div className="relative mt-5"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} className="field w-full pl-10" placeholder="Search Reports..." aria-label="Search reports"/></div></header>
  {query.trim()&&<section className="report-directory-card"><div className="report-directory-label">Search results</div><div className="grid md:grid-cols-2">{results.length?results.map(item=><ReportLink key={item.path} item={item}/>):<p className="p-5 text-sm text-slate-500">No accessible reports match “{query}”.</p>}</div></section>}
  {!query.trim()&&favoriteItems.length>0&&<section className="report-compact-section"><div className="report-directory-label"><Star size={14}/> Favorite reports</div><div className="grid md:grid-cols-2">{favoriteItems.map(item=><ReportLink key={item.path} item={item}/>)}</div></section>}
  {!query.trim()&&recentItems.length>0&&<section className="report-compact-section"><div className="report-directory-label"><Clock size={14}/> Recently viewed</div><div className="flex flex-wrap gap-2 p-3">{recentItems.map(item=><Link key={item.path} to={item.path} className="recent-report-link">{item.report.name}</Link>)}</div></section>}
  {!query.trim()&&<div className="grid grid-cols-1 gap-4 md:grid-cols-2">{categories.map(category=><article key={category.key} className="report-category-card"><div className="flex items-start gap-3"><div className="rounded-lg bg-emerald-500/10 p-2.5"><category.icon size={22} className="text-emerald-600"/></div><div><h2 className="font-bold">{category.title}</h2><p className="mt-1 text-sm text-slate-500">{category.description}</p></div></div><div className="mt-4 space-y-1">{category.reports.slice(0,5).map(report=><ReportLink key={report.slug} item={{category,report,path:reportPath(category,report)}}/>)}</div><Link to={categoryPath(category)} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-emerald-700">View All {category.title.replace(' Reports','')} Reports <ArrowRight size={15}/></Link></article>)}</div>}
 </div>
}

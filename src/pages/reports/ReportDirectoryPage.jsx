import React,{useMemo}from'react'
import{ChevronRight,FileText,Star}from'lucide-react'
import{Link,Navigate,useParams}from'react-router-dom'
import{useAuth}from'../../contexts/AuthContext'
import{usePermissions}from'../../contexts/PermissionsContext'
import{findCategory,reportAction,reportPath,userStorageKey}from'./reportCatalog'

export default function ReportDirectoryPage(){
 const{categoryKey}=useParams(),category=findCategory(categoryKey),{user}=useAuth(),{can,isSuperAdmin}=usePermissions()
 const[favorites,setFavorites]=React.useState(()=>{try{return JSON.parse(localStorage.getItem(userStorageKey(user,'favorites'))||'[]')}catch{return[]}})
 const visible=useMemo(()=>category?.reports.filter(x=>isSuperAdmin||can(x.module,reportAction(x)))??[],[category,can,isSuperAdmin])
 if(!category||!visible.length)return <Navigate to="/reports" replace/>
 const toggle=path=>{const next=favorites.includes(path)?favorites.filter(x=>x!==path):[...favorites,path];setFavorites(next);localStorage.setItem(userStorageKey(user,'favorites'),JSON.stringify(next))}
 return <div className="space-y-5">
  <nav className="flex items-center gap-1 text-sm text-slate-500 dark:text-emerald-100/60"><Link to="/reports">Reports</Link><ChevronRight size={15}/><b>{category.title}</b></nav>
  <header className="report-directory-header"><div className="flex items-center gap-3"><div className="rounded-lg bg-emerald-500/10 p-3"><category.icon className="text-emerald-600"/></div><div><h1 className="text-2xl font-bold">{category.title}</h1><p className="mt-1 text-sm text-slate-500">{category.description}</p></div></div></header>
  <section className="report-directory-card"><div className="report-directory-label">All reports</div><div className="grid md:grid-cols-2">{visible.map(item=>{const path=reportPath(category,item),favorite=favorites.includes(path);return <div key={item.slug} className="report-directory-row"><Link to={path} className="report-directory-link"><FileText size={17}/><span>{item.name}</span><ChevronRight size={15} className="ml-auto"/></Link><button onClick={()=>toggle(path)} className={`report-star ${favorite?'text-amber-500':''}`} aria-label="Toggle favorite"><Star size={17} fill={favorite?'currentColor':'none'}/></button></div>})}</div></section>
 </div>
}

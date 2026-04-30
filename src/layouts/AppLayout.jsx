import React, { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LayoutDashboard, Package, Users, UserCheck, LogOut, Menu, X, Calculator, ShoppingCart, Moon, Sun, Boxes, ChevronDown, FolderTree, Truck, FileText, BookOpen, Wallet, User, Building2, RotateCcw, Shield, ScrollText, HandCoins } from 'lucide-react'
import logo from '../pictures/logo.jpeg'
import { useTheme } from '../contexts/ThemeContext'

// ── User mapping: add new users here ──────────────────────────
// email → { name, role }
const USER_MAP = {
  'zaidn2848@gmail.com':       { name: 'Zaid',   role: 'IT Developer' },
  'shayankidscare@gmail.com':  { name: 'Niflan', role: 'Owner' },
  // Add more users below:
  // 'someone@example.com':     { name: 'Name',   role: 'Admin' },
  // 'rep@example.com':         { name: 'RepName', role: 'Rep' },
}
// ─────────────────────────────────────────────────────────────

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    key: 'originate',
    label: 'Master Data',
    icon: FolderTree,
    children: [
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/reps', label: 'Employees', icon: UserCheck },
      { to: '/products', label: 'Products', icon: Package },
      { to: '/vendors', label: 'Vendors', icon: Truck },
      { to: '/journals', label: 'Journal', icon: BookOpen },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: Boxes,
    children: [
      { to: '/inventory/purchase', label: 'New Purchase', icon: ShoppingCart },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: Wallet,
    children: [
      { to: '/finance/journal-entry', label: 'Journal Entry', icon: BookOpen },
      { to: '/finance/receivables', label: 'Receivables', icon: FileText },
      { to: '/finance/payables', label: 'Payables', icon: HandCoins },
      { to: '/finance/banks', label: 'Banks', icon: Building2 },
    ],
  },
  { to: '/orders', label: 'Orders & Invoices', icon: ShoppingCart },
  { to: '/returns', label: 'Returns', icon: RotateCcw },
  { to: '/commission', label: 'Commission', icon: Calculator },
  {
    key: 'admin',
    label: 'Admin',
    icon: Shield,
    children: [
      { to: '/backup', label: 'Backup & Safety', icon: Shield },
      { to: '/audit-log', label: 'Audit Log', icon: ScrollText },
    ],
  },
]

function usePageTitle() {
  const location = useLocation()

  return useMemo(() => {
    const path = location.pathname
    if (path.startsWith('/products')) return 'Products'
    if (path.startsWith('/customers')) return 'Customers'

    if (path.endsWith('/edit')) return 'Edit Invoice'
    if (path.startsWith('/invoices/')) return 'Invoice'
    if (path.startsWith('/invoices')) return 'Orders & Invoices'
    if (path.startsWith('/vendors')) return 'Vendors'
    if (path.startsWith('/journals')) return 'Journal'
    if (path.startsWith('/finance/journal-entry')) return 'Journal Entry'
    if (path.startsWith('/finance/receivables')) return 'Receivables'
    if (path.startsWith('/finance/payables')) return 'Payables'
    if (path.startsWith('/finance')) return 'Finance'
    if (path.startsWith('/reps')) return 'Employees'
    if (path === '/returns/new') return 'New Return'
    if (path.startsWith('/returns/') && path.endsWith('/edit')) return 'Edit Return'
    if (path.startsWith('/returns/')) return 'Return Note'
    if (path.startsWith('/returns')) return 'Returns'
    if (path.startsWith('/commission')) return 'Commission'
    if (path.startsWith('/backup')) return 'Backup & Safety'
    if (path.startsWith('/audit-log')) return 'Audit Log'
    if (path.startsWith('/admin')) return 'Admin'
    if (path.startsWith('/inventory/purchase')) return 'New Purchase'
    if (path.startsWith('/inventory')) return 'Inventory'
    if (path === '/orders/new') return 'Create Order'
    if (path.endsWith('/edit') && path.startsWith('/orders/')) return 'Edit Order'
    if (path.startsWith('/orders/')) return 'Order'
    if (path.startsWith('/orders')) return 'Orders & Invoices'
    return 'Dashboard'
  }, [location.pathname])
}

export default function AppLayout() {
  const title = usePageTitle()
  const navigate = useNavigate()
  const { signOut, user } = useAuth()

  const displayName = (() => {
    const email = user?.email ?? ''
    const mapped = USER_MAP[email]
    return mapped ?? { name: email.split('@')[0], role: 'User' }
  })()

  const isOwner = user?.email === 'shayankidscare@gmail.com'
  const { theme, toggleTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState({})

  const onLogout = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  const closeMobile = () => setMobileOpen(false)

  return (
    <div className="min-h-screen flex bg-transparent">
      {/* Sidebar drawer - slides in from left, pushes content */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-emerald-950/60 shadow-xl flex flex-col border-r border-slate-200 dark:border-emerald-900/40 transition-transform duration-200 ease-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-5 border-b border-slate-100 dark:border-emerald-900/40 flex items-center justify-between">
          <NavLink to="/dashboard" onClick={closeMobile} className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="h-10 w-10 rounded-lg object-cover shadow-sm" />
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-white">Shayan Kids Care</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Management System</div>
            </div>
          </NavLink>
          <button onClick={closeMobile} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            if (item.children) {
              const Icon = item.icon
              const isOpen = !!openGroups[item.key]
              return (
                <div key={item.key}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups((p) => ({ ...p, [item.key]: !p[item.key] }))}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-emerald-100/80 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-50 transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={18} />
                      {item.label}
                    </span>
                    <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen ? (
                    <div className="mt-1 ml-3 pl-3 border-l border-slate-200 dark:border-emerald-900/40 space-y-1">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon
                        return (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            onClick={closeMobile}
                            className={({ isActive }) =>
                              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                isActive
                                  ? 'bg-slate-900 text-white shadow-sm dark:bg-emerald-500/15 dark:border dark:border-emerald-400/20 dark:text-emerald-50'
                                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-emerald-100/80 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-50'
                              }`
                            }
                          >
                            <ChildIcon size={18} />
                            {child.label}
                          </NavLink>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            }

            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeMobile}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-emerald-500/15 dark:border dark:border-emerald-400/20 dark:text-emerald-50'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-emerald-100/80 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-50'
                  }`
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="p-3 border-t border-slate-100 dark:border-emerald-900/40 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 dark:bg-emerald-600 text-white text-xs font-bold">{displayName.name.charAt(0).toUpperCase()}</div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{displayName.name}</div>
              <div className="text-[10px] text-slate-400 dark:text-emerald-100/60">{displayName.role}</div>
            </div>
          </div>
          <button
            onClick={() => { closeMobile(); onLogout() }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors dark:text-emerald-100/70 dark:hover:bg-red-500/10 dark:hover:text-red-200"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Backdrop when sidebar is open */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm" onClick={closeMobile} />
      )}

      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ease-out ${
        mobileOpen ? 'ml-64' : 'ml-0'
      }`}>
        <header className="bg-white dark:bg-emerald-950/35 border-b border-slate-200 dark:border-emerald-900/40 shadow-sm sticky top-0 z-30 backdrop-blur">
          <div className="px-4 md:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="text-slate-600 hover:text-slate-900 dark:text-emerald-100/80 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-emerald-500/10 transition-colors"
              >
                <Menu size={22} />
              </button>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-emerald-800/60 bg-white dark:bg-emerald-950/40 px-3 py-2 text-sm font-medium text-slate-700 dark:text-emerald-50 hover:bg-slate-50 dark:hover:bg-emerald-500/10 transition-colors"
                title="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 dark:bg-emerald-600 text-white text-xs font-bold">{displayName.name.charAt(0).toUpperCase()}</div>
                <div className="hidden sm:block">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{displayName.name}</div>
                  <div className="text-[10px] text-slate-400 dark:text-emerald-100/60">{displayName.role}</div>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-rose-600 dark:bg-slate-900 text-white hover:bg-rose-700 dark:hover:bg-slate-800 transition-colors shadow-sm"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

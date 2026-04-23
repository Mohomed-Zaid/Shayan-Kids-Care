import React, { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LayoutDashboard, Package, Users, UserCheck, FileText, LogOut, Menu, X, Calculator } from 'lucide-react'
import logo from '../pictures/logo.jpeg'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/reps', label: 'Employees', icon: UserCheck },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/commission', label: 'Commission', icon: Calculator },
]

function usePageTitle() {
  const location = useLocation()

  return useMemo(() => {
    const path = location.pathname
    if (path.startsWith('/products')) return 'Products'
    if (path.startsWith('/customers')) return 'Customers'
    if (path === '/invoices/new') return 'Create Invoice'
    if (path.endsWith('/edit')) return 'Edit Invoice'
    if (path.startsWith('/invoices/')) return 'Invoice'
    if (path.startsWith('/invoices')) return 'Invoices'
    if (path.startsWith('/reps')) return 'Employees'
    if (path.startsWith('/commission')) return 'Commission'
    return 'Dashboard'
  }, [location.pathname])
}

export default function AppLayout() {
  const title = usePageTitle()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const onLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const closeMobile = () => setMobileOpen(false)

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex md:flex-col shadow-sm">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="h-10 w-10 rounded-lg object-cover shadow-sm" />
            <div>
              <div className="text-base font-bold text-slate-900">Shayan Kids Care</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Management System</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={closeMobile} />
          <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl z-50 flex flex-col">
            <div className="px-5 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={logo} alt="Logo" className="h-10 w-10 rounded-lg object-cover shadow-sm" />
                <div>
                  <div className="text-base font-bold text-slate-900">Shayan Kids Care</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Management System</div>
                </div>
              </div>
              <button onClick={closeMobile} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={closeMobile}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    }
                  >
                    <Icon size={18} />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>

            <div className="p-3 border-t border-slate-100">
              <button
                onClick={() => { closeMobile(); onLogout() }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
          <div className="px-4 md:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden text-slate-600 hover:text-slate-900"
              >
                <Menu size={22} />
              </button>
              <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            </div>
            <button
              onClick={onLogout}
              className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import logo from '../pictures/logo.jpeg'

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, signInWithPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signInWithPassword({ email, password })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err?.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  if (user) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logo} alt="Logo" className="h-16 w-16 rounded-xl object-cover shadow-md mx-auto" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Shayan Kids Care</h1>
          <p className="text-sm text-slate-500 mt-1">Management System</p>
        </div>

        <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm p-8">
          <h2 className="text-lg font-semibold text-slate-900">Admin Login</h2>
          <p className="text-sm text-slate-500 mt-1">Sign in to manage products, customers, and invoices.</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <div className="mt-1.5 relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-shadow"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error ? (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2.5 rounded-lg">
                <AlertTriangle size={14} />
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-slate-900 text-white py-2.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

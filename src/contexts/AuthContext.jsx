import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { logAction } from '../lib/auditLog'

const AuthContext = createContext(null)

const TABS_KEY = 'skc_active_tabs'

function registerTab() {
  const tabId = crypto.randomUUID()
  const now = Date.now()
  // Clean up stale entries (older than 24h — crashed tabs)
  const existing = JSON.parse(localStorage.getItem(TABS_KEY) || '[]').filter(
    (t) => now - t.ts < 24 * 60 * 60 * 1000
  )
  existing.push({ id: tabId, ts: now })
  localStorage.setItem(TABS_KEY, JSON.stringify(existing))
  return tabId
}

function unregisterTab(tabId) {
  const current = JSON.parse(localStorage.getItem(TABS_KEY) || '[]')
  const remaining = current.filter((t) => t.id !== tabId)
  if (remaining.length === 0) {
    // Last tab closing — clear auth session and tab list
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-') || key === TABS_KEY) {
        localStorage.removeItem(key)
      }
    })
  } else {
    localStorage.setItem(TABS_KEY, JSON.stringify(remaining))
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let mounted = true
    const tabId = registerTab()

    const handleUnload = () => unregisterTab(tabId)
    window.addEventListener('beforeunload', handleUnload)

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error(error)
      }
      if (mounted) {
        setSession(data?.session ?? null)
        setInitializing(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (_event === 'SIGNED_IN' && newSession) {
        logAction({ action: 'login' })
      } else if (_event === 'SIGNED_OUT') {
        logAction({ action: 'logout' })
      }
      setSession(newSession)
      setInitializing(false)
    })

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
      window.removeEventListener('beforeunload', handleUnload)
      unregisterTab(tabId)
    }
  }, [])

  const value = useMemo(() => {
    return {
      session,
      user: session?.user ?? null,
      initializing,
      signInWithPassword: async ({ email, password }) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        return data
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }
  }, [session, initializing])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

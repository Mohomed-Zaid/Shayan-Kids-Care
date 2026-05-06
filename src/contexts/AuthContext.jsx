import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { logAction } from '../lib/auditLog'

const AuthContext = createContext(null)

const TABS_KEY = 'skc_active_tabs'
const PENDING_LOGOUT_KEY = 'skc_pending_logout'
const PENDING_LOGOUT_GRACE_MS = 2000

function clearSupabaseLocalStorageSession() {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('sb-') || key === TABS_KEY || key === PENDING_LOGOUT_KEY) {
      localStorage.removeItem(key)
    }
  })
}

function processPendingLogoutIfNeeded() {
  const raw = localStorage.getItem(PENDING_LOGOUT_KEY)
  if (!raw) return
  let pending
  try {
    pending = JSON.parse(raw)
  } catch {
    localStorage.removeItem(PENDING_LOGOUT_KEY)
    return
  }

  const now = Date.now()
  const ts = Number(pending?.ts || 0)
  if (!ts) {
    localStorage.removeItem(PENDING_LOGOUT_KEY)
    return
  }

  const tabs = JSON.parse(localStorage.getItem(TABS_KEY) || '[]')
  if (Array.isArray(tabs) && tabs.length > 0) {
    // App is open again; cancel pending logout.
    localStorage.removeItem(PENDING_LOGOUT_KEY)
    return
  }

  // If the app was fully closed and remains closed long enough, clear auth.
  if (now - ts >= PENDING_LOGOUT_GRACE_MS) {
    clearSupabaseLocalStorageSession()
  }
}

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
    // Last tab unloading — mark pending logout.
    // We do NOT clear auth here, because refresh triggers unload too.
    localStorage.setItem(TABS_KEY, '[]')
    localStorage.setItem(PENDING_LOGOUT_KEY, JSON.stringify({ ts: Date.now() }))
  } else {
    localStorage.setItem(TABS_KEY, JSON.stringify(remaining))
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let mounted = true

    // If the app was fully closed previously, enforce logout on next start.
    processPendingLogoutIfNeeded()

    const tabId = registerTab()

    // App is open again; cancel any pending logout.
    localStorage.removeItem(PENDING_LOGOUT_KEY)

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

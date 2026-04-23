import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let mounted = true

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
      setSession(newSession)
      setInitializing(false)
    })

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
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

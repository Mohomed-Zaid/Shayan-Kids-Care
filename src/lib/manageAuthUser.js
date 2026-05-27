import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Separate client so signUp does not replace the admin's session. */
function ephemeralAuthClient() {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

/**
 * Create Supabase Auth login (email + password).
 * Returns ok:true if user was created or already exists.
 */
export async function createAuthLogin(email, password) {
  const client = ephemeralAuthClient()
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) {
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return { ok: true, existing: true }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true, existing: false, user: data?.user }
}

/**
 * Update another user's password (requires deployed Edge Function + service role).
 */
export async function updateAuthPassword(email, password) {
  const { data: session } = await supabase.auth.getSession()
  if (!session?.session?.access_token) return { ok: false, error: 'Not authenticated' }

  const { data, error } = await supabase.functions.invoke('admin-manage-user', {
    body: { action: 'update_password', email: email.trim().toLowerCase(), password },
  })

  if (error) {
    return { ok: false, error: error.message }
  }
  if (data?.error) return { ok: false, error: data.error }
  return { ok: true }
}

export function validatePasswordPair(password, confirmPassword, { required = false } = {}) {
  if (!required && !password && !confirmPassword) return null
  if (required && !password) return 'Password is required'
  if (password && password.length < 6) return 'Password must be at least 6 characters'
  if (password !== confirmPassword) return 'Passwords do not match'
  return null
}

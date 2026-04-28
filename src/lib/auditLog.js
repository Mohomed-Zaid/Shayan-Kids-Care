import { supabase } from './supabaseClient'

const USER_MAP = {
  'zaidn2848@gmail.com':       'Zaid',
  'shayankidscare@gmail.com':  'Niflan',
}

export async function logAction({ action, targetType = null, targetId = null, targetLabel = null, details = null }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const email = session?.user?.email ?? 'unknown'
    const userName = USER_MAP[email] ?? email.split('@')[0]

    await supabase.from('audit_logs').insert({
      user_email: email,
      user_name: userName,
      action,
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel,
      details,
    })
  } catch (e) {
    console.error('Audit log failed:', e?.message)
  }
}

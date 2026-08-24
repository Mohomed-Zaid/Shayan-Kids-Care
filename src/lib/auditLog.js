import { supabase } from './supabaseClient'

const USER_MAP = {
  'zaidn2848@gmail.com':       'Zaid',
  'shayankidscare@gmail.com':  'Niflan',
}

export async function logAction({ action, targetType = null, targetId = null, targetLabel = null, details = null, module = null, referenceNo = null, oldValues = null, newValues = null, amount = null, reason = null, status = null, metadata = null }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const email = session?.user?.email ?? 'unknown'
    const userName = USER_MAP[email] ?? email.split('@')[0]

    const structured = module || referenceNo || oldValues || newValues || amount != null || reason || status || metadata
    const auditDetails = structured ? {
      ...(details && typeof details === 'object' ? details : details ? { description: details } : {}),
      module, reference_no: referenceNo, old_values: oldValues, new_values: newValues,
      amount, reason, status, ...(metadata || {}),
    } : details
    await supabase.from('audit_logs').insert({
      user_email: email,
      user_name: userName,
      action,
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel,
      details: auditDetails,
      created_by: email,
      updated_by: email,
    })
  } catch (e) {
    console.error('Audit log failed:', e?.message)
  }
}

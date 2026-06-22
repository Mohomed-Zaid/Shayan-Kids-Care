// Deploy: supabase functions deploy admin-manage-user
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set in Supabase dashboard)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: callerData, error: callerErr } = await caller.auth.getUser()
    if (callerErr || !callerData?.user?.email) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: privilege } = await admin
      .from('user_privileges')
      .select('is_super_admin')
      .ilike('email', callerData.user.email)
      .maybeSingle()

    const bootstrapSuper = ['shayankidscare@gmail.com', 'zaidn2848@gmail.com'].includes(
      callerData.user.email.toLowerCase(),
    )
    if (!bootstrapSuper && !privilege?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Super admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const action = String(body?.action ?? '')

    if (!email || !password || password.length < 6) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update_password') {
      const { data: list } = await admin.auth.admin.listUsers()
      const target = list?.users?.find((u) => u.email?.toLowerCase() === email)
      if (!target) {
        return new Response(JSON.stringify({ error: 'Auth user not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await admin.auth.admin.updateUserById(target.id, { password })
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

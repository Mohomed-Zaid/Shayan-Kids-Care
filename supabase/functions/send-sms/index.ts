// supabase/functions/send-sms/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BSMS_BASE = 'https://bsms.hutch.lk/api';
const supabase = createClient(
    Deno.env.get('PROJECT_URL')!,
    Deno.env.get('PROJECT_SERVICE_KEY')!
);

// ─── Token Helpers ───────────────────────────────────────────────────────
async function getCachedToken() {
    const { data, error } = await supabase
        .from('bsms_token_cache')
        .select('*')
        .eq('id', 1)
        .single();
    if (error || !data) return null;
    return data;
}

async function saveToken(
    accessToken: string,
    refreshToken: string | null,
    expiresInSeconds = 3600
) {
    const expires_at = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    await supabase
        .from('bsms_token_cache')
        .upsert({
            id: 1,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
}

async function renewToken(refreshToken: string) {
    try {
        const res = await fetch(`${BSMS_BASE}/token/accessToken`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${refreshToken}`,
                'X-API-VERSION': 'v1'
            }
        });
        
        if (!res.ok) return null;
        
        const json = await res.json();
        const newToken = json.accessToken || json.token || json.access_token || 
            json.data?.token || json.data?.access_token || json.data?.accessToken;
            
        if (!newToken) return null;
        
        return newToken;
    } catch (e) {
        console.error("Renew token failed:", e);
        return null;
    }
}

async function fetchNewToken() {
    const res = await fetch(`${BSMS_BASE}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-VERSION': 'v1'
        },
        body: JSON.stringify({
            username: Deno.env.get('BSMS_USERNAME'),
            password: Deno.env.get('BSMS_PASSWORD')
        })
    });
    
    const json = await res.json();
    const token = json.accessToken || json.token || json.access_token ||
        json.data?.token || json.data?.access_token || json.data?.accessToken;
    const refreshToken = json.refreshToken || json.refresh_token ||
        json.data?.refreshToken || json.data?.refresh_token;
        
    if (!token) throw new Error("Login failed: " + JSON.stringify(json));
    
    await saveToken(token, refreshToken || null, 3600);
    return token;
}

async function getToken(): Promise<string> {
    const cached = await getCachedToken();
    
    if (cached) {
        const isExpired = new Date(cached.expires_at) <= new Date();
        if (!isExpired) {
            return cached.access_token;
        }
        
        if (cached.refresh_token) {
            const newToken = await renewToken(cached.refresh_token);
            if (newToken) {
                await saveToken(newToken, cached.refresh_token, 3600);
                return newToken;
            }
        }
    }
    
    return await fetchNewToken();
}

// ─── SMS Senders ────────────────────────────────────────────────────────
async function sendSingle(token: string, number: string, message: string) {
    const res = await fetch(`${BSMS_BASE}/sendsms`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-API-VERSION': 'v1'
        },
        body: JSON.stringify({
            campaignName: 'Shayan Kids Single SMS',
            mask: 'SHAYAN_KIDS',
            numbers: number,
            content: message,
            deliveryReportRequest: true
        })
    });

    if (res.status === 401) {
        await supabase.from('bsms_token_cache').delete().neq('id', '');
        throw new Error('Token expired (401). Cache cleared. Retry.');
    }

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`BSMS API error ${res.status}: ${errText}`);
    }

    return await res.json();
}

async function sendBulk(token: string, recipients: { number: string; message: string }[], campaignName?: string) {
    const body = recipients.map(r => ({
        campaignName: campaignName || 'Shayan Kids Bulk Campaign',
        mask: 'SHAYAN_KIDS',
        numbers: r.number,
        content: r.message,
        deliveryReportRequest: true
    }));

    const res = await fetch(`${BSMS_BASE}/sendsms/bulk`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-API-VERSION': 'v1'
        },
        body: JSON.stringify(body)
    });

    if (res.status === 401) {
        await supabase.from('bsms_token_cache').delete().neq('id', '');
        throw new Error('Token expired (401). Cache cleared. Retry.');
    }

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`BSMS API error ${res.status}: ${errText}`);
    }

    return await res.json();
}

// ─── Edge Function Handler ───────────────────────────────────────────────
Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
            },
        });
    }

    try {
        const { type, number, message, recipients, campaignName } = await req.json();
        
        if (type === 'bulk') {
            if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
                return new Response(JSON.stringify({ error: 'recipients array is required' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                });
            }

            const token = await getToken();
            const result = await sendBulk(token, recipients, campaignName);
            
            const numbers = recipients.map(r => r.number);
            const content = recipients.map(r => r.message).join(' | ');
            
            await supabase.from('bsms_bulk_log').insert({
                campaign_name: campaignName || 'Shayan Kids Bulk Campaign',
                mask: 'SHAYAN_KIDS',
                numbers,
                content,
                delivery_report_request: true,
                server_refs: result,
                status: 'sent'
            });

            return new Response(JSON.stringify({ success: true, serverRefs: result }), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        } else {
            const token = await getToken();
            const result = await sendSingle(token, number, message);
            
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
});

-- supabase/bsms_bulk_log.sql
-- Table to log bulk SMS campaigns

create table bsms_bulk_log (
    id uuid primary key default gen_random_uuid(),
    campaign_name text not null,
    mask text not null default 'SHAYAN_KIDS',
    numbers text[] not null,
    content text not null,
    delivery_report_request boolean default true,
    server_refs jsonb,
    status text default 'pending',
    created_at timestamptz default now()
);

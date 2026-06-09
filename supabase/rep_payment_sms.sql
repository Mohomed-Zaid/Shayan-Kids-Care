-- Run in Supabase SQL Editor to enable rep payment SMS notifications
-- Part 1: Add sms_sent flag to rep_commission_payments
alter table public.rep_commission_payments add column if not exists sms_sent boolean default false;
alter table public.rep_commission_payments add column if not exists sms_sent_at timestamptz;

-- Part 2: Create rep_sms_log table for detailed SMS logging
create table if not exists public.rep_sms_log (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.employees(id) on delete restrict,
  payment_id uuid references public.rep_commission_payments(id) on delete set null,
  rep_name text not null,
  phone_number text not null,
  message text not null,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rep_sms_log_rep_id on public.rep_sms_log(rep_id);
create index if not exists idx_rep_sms_log_payment_id on public.rep_sms_log(payment_id);
create index if not exists idx_rep_sms_log_created_at on public.rep_sms_log(created_at);

-- Part 3: Create system_settings table for global settings
create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insert default setting for rep payment SMS
insert into public.system_settings (key, value, description)
values ('rep_payment_sms_enabled', 'true', 'Enable/disable automatic SMS notifications for rep commission payments')
on conflict (key) do nothing;

-- Enable RLS
alter table public.rep_sms_log enable row level security;
alter table public.system_settings enable row level security;

-- Create RLS policies
drop policy if exists "rep_sms_log_authenticated" on public.rep_sms_log;
create policy "rep_sms_log_authenticated"
  on public.rep_sms_log
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "system_settings_authenticated" on public.system_settings;
create policy "system_settings_authenticated"
  on public.system_settings
  for all
  to authenticated
  using (true)
  with check (true);

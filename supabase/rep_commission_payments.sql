-- Run in Supabase SQL Editor (once) before using Finance → Rep Payments

create table if not exists public.rep_commission_payments (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.employees(id) on delete restrict,
  period_month int not null check (period_month >= 0 and period_month <= 11),
  period_year int not null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at date not null,
  method text not null,
  reference text,
  bank_name text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rep_commission_payments_period
  on public.rep_commission_payments (rep_id, period_year, period_month);

alter table public.rep_commission_payments enable row level security;

drop policy if exists "rep_commission_payments_authenticated" on public.rep_commission_payments;
create policy "rep_commission_payments_authenticated"
  on public.rep_commission_payments
  for all
  to authenticated
  using (true)
  with check (true);

-- Run once in Supabase SQL Editor — adds salary & allowance columns to employees

alter table public.employees
  add column if not exists salary numeric(12, 2) not null default 0;

alter table public.employees
  add column if not exists allowance numeric(12, 2) not null default 0;

alter table public.employees
  add column if not exists other_allowance numeric(12, 2) not null default 0;

comment on column public.employees.salary is 'Monthly basic salary (LKR)';
comment on column public.employees.allowance is 'Monthly allowance (LKR)';
comment on column public.employees.other_allowance is 'Other monthly benefits e.g. transport (LKR)';

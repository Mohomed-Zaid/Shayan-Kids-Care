-- Salary transfer letters, employee bank details, settings, and immutable history.
-- Run once in the Supabase SQL Editor.

alter table public.employees
  add column if not exists bank_name text;

alter table public.employees
  add column if not exists bank_account_number text;

alter table public.employees
  add column if not exists salary_amount numeric(12, 2) not null default 0;

alter table public.employees
  add column if not exists is_active boolean not null default true;

-- Preserve existing basic salaries as the initial transfer amount when that
-- older compensation column is already installed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'salary'
  ) then
    execute 'update public.employees set salary_amount = salary where salary_amount = 0 and coalesce(salary, 0) > 0';
  end if;
end $$;

create table if not exists public.company_settings (
  id text primary key default 'main' check (id = 'main'),
  salary_account_holder_name text not null default 'M.A.N.M. NISHLAN',
  salary_personal_bank_account_no text not null default '101001362128',
  director_name text not null default 'M.N.M. Niflan',
  director_designation text not null default 'Director',
  director_company text not null default 'Shayan Kids & Toys',
  director_nic text not null default '953630354V',
  director_mobile text not null default '+94 75 3841599',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.company_settings (id)
values ('main')
on conflict (id) do nothing;

create table if not exists public.salary_transfer_letters (
  id uuid primary key default gen_random_uuid(),
  letter_date date not null,
  cheque_number text not null,
  employee_count integer not null check (employee_count > 0),
  total_salary numeric(14, 2) not null check (total_salary > 0),
  employee_snapshot jsonb not null,
  settings_snapshot jsonb not null,
  generated_by uuid references auth.users(id),
  generated_by_email text,
  generated_at timestamptz not null default now()
);

create index if not exists salary_transfer_letters_generated_at_idx
  on public.salary_transfer_letters (generated_at desc);

alter table public.company_settings enable row level security;
alter table public.salary_transfer_letters enable row level security;

drop policy if exists "authenticated users read company settings" on public.company_settings;
create policy "authenticated users read company settings"
  on public.company_settings for select to authenticated using (true);

drop policy if exists "super admins update company settings" on public.company_settings;
create policy "super admins update company settings"
  on public.company_settings for update to authenticated
  using (
    lower(auth.jwt() ->> 'email') in ('shayankidscare@gmail.com', 'zaidn2848@gmail.com')
    or exists (
      select 1 from public.user_privileges p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and p.is_super_admin = true and p.is_active is not false
    )
  )
  with check (
    lower(auth.jwt() ->> 'email') in ('shayankidscare@gmail.com', 'zaidn2848@gmail.com')
    or exists (
      select 1 from public.user_privileges p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
        and p.is_super_admin = true and p.is_active is not false
    )
  );

drop policy if exists "authenticated users read salary letters" on public.salary_transfer_letters;
create policy "authenticated users read salary letters"
  on public.salary_transfer_letters for select to authenticated using (true);

drop policy if exists "authenticated users create salary letters" on public.salary_transfer_letters;
create policy "authenticated users create salary letters"
  on public.salary_transfer_letters for insert to authenticated with check (auth.uid() = generated_by);

comment on column public.employees.salary_amount is 'Monthly amount transferred through the salary bank letter (LKR)';
comment on column public.salary_transfer_letters.employee_snapshot is 'Immutable employee bank and salary data used for this generated letter';

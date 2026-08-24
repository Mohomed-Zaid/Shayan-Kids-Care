-- Admin, Audit & System Reports: additive audit metadata and immutable history.
alter table public.audit_logs add column if not exists module text;
alter table public.audit_logs add column if not exists reference_no text;
alter table public.audit_logs add column if not exists old_values jsonb;
alter table public.audit_logs add column if not exists new_values jsonb;
alter table public.audit_logs add column if not exists amount numeric;
alter table public.audit_logs add column if not exists reason text;
alter table public.audit_logs add column if not exists status text;
alter table public.audit_logs add column if not exists ip_address inet;

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_user_email_idx on public.audit_logs(lower(user_email));

alter table public.audit_logs enable row level security;

do $$ declare policy_row record;
begin
  for policy_row in select policyname from pg_policies where schemaname='public' and tablename='audit_logs'
  loop execute format('drop policy if exists %I on public.audit_logs',policy_row.policyname); end loop;
end $$;

create policy audit_logs_authenticated_insert on public.audit_logs
for insert to authenticated
with check (lower(coalesce(user_email,''))=lower(coalesce(auth.jwt()->>'email','')));

create policy audit_logs_admin_read on public.audit_logs
for select to authenticated
using (
  lower(coalesce(auth.jwt()->>'email','')) in ('shayankidscare@gmail.com','zaidn2848@gmail.com')
  or public.is_privilege_super_admin()
  or exists (
    select 1 from public.user_privileges up
    where lower(up.email)=lower(auth.jwt()->>'email') and up.is_active=true
      and (
        coalesce((up.permissions->'reports_admin_system'->>'view')::boolean,false)
        or coalesce((up.permissions->'admin_audit_log'->>'view')::boolean,false)
      )
  )
);

-- No UPDATE or DELETE policy is intentionally created. Authenticated clients
-- can append and authorized admins can read, but audit history is immutable.

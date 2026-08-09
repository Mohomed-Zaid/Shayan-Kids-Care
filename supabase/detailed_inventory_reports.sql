-- Detailed inventory reporting and auditable stock reconciliation.
create table if not exists public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('positive','negative','damage','manual_correction')),
  quantity numeric(14,3) not null check (quantity > 0),
  reference_no text,
  notes text,
  adjustment_date timestamptz not null default now(),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists stock_adjustments_product_date_idx on public.stock_adjustments(product_id, adjustment_date);
alter table public.stock_adjustments enable row level security;

-- Purchase returns were not present in the original schema. They are kept
-- separately so a return can never be confused with (or duplicated as) a purchase.
create table if not exists public.purchase_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,
  purchase_id uuid references public.purchases(id) on delete set null,
  return_date timestamptz not null default now(),
  status text not null default 'posted' check (status in ('draft','pending','posted','completed','cancelled')),
  reason text,
  created_by text,
  created_at timestamptz not null default now()
);
create table if not exists public.purchase_return_items (
  id uuid primary key default gen_random_uuid(),
  purchase_return_id uuid not null references public.purchase_returns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  unique (purchase_return_id, product_id)
);
create index if not exists purchase_return_items_product_idx on public.purchase_return_items(product_id);
alter table public.purchase_returns enable row level security;
alter table public.purchase_return_items enable row level security;
drop policy if exists purchase_returns_authenticated_read on public.purchase_returns;
create policy purchase_returns_authenticated_read on public.purchase_returns for select to authenticated using (true);
drop policy if exists purchase_return_items_authenticated_read on public.purchase_return_items;
create policy purchase_return_items_authenticated_read on public.purchase_return_items for select to authenticated using (true);

drop policy if exists stock_adjustments_authenticated_read on public.stock_adjustments;
create policy stock_adjustments_authenticated_read on public.stock_adjustments for select to authenticated using (true);

create or replace function public.create_inventory_reconciliation_adjustment(
  p_product_id uuid, p_quantity numeric, p_direction text, p_notes text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_email text; v_delta numeric; v_allowed boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_quantity <= 0 or p_direction not in ('positive','negative') then raise exception 'Invalid adjustment'; end if;
  v_email := coalesce(auth.jwt()->>'email','unknown');
  select (
    lower(v_email) in ('shayankidscare@gmail.com','zaidn2848@gmail.com')
    or coalesce(up.is_super_admin,false)
    or coalesce((up.permissions->'reports_inventory'->>'adjust')::boolean,false)
  ) into v_allowed from (select 1) seed left join user_privileges up on lower(up.email)=lower(v_email) and coalesce(up.is_active,true);
  if not coalesce(v_allowed,false) then raise exception 'Inventory adjustment permission required'; end if;
  v_delta := case when p_direction='positive' then p_quantity else -p_quantity end;
  insert into stock_adjustments(product_id,adjustment_type,quantity,reference_no,notes,created_by)
  values(p_product_id,p_direction,p_quantity,'RECON-'||to_char(now(),'YYYYMMDDHH24MISS'),p_notes,v_email) returning id into v_id;
  update products set stock=coalesce(stock,0)+v_delta where id=p_product_id;
  insert into audit_logs(user_email,user_name,action,target_type,target_id,target_label,details,created_by,updated_by)
  values(v_email,split_part(v_email,'@',1),'stock_mismatch_corrected','product',p_product_id,
    'Inventory reconciliation',jsonb_build_object('direction',p_direction,'quantity',p_quantity,'adjustment_id',v_id),v_email,v_email);
  return v_id;
end $$;
revoke all on function public.create_inventory_reconciliation_adjustment(uuid,numeric,text,text) from public;
grant execute on function public.create_inventory_reconciliation_adjustment(uuid,numeric,text,text) to authenticated;

create or replace function public.audit_stock_adjustment_change() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_email text := coalesce(auth.jwt()->>'email', coalesce(new.created_by, old.created_by, 'unknown'));
begin
  insert into audit_logs(user_email,user_name,action,target_type,target_id,target_label,details,created_by,updated_by)
  values(v_email,split_part(v_email,'@',1),
    case tg_op when 'INSERT' then 'stock_adjustment_created' when 'UPDATE' then 'stock_adjustment_edited' else 'stock_adjustment_deleted' end,
    'stock_adjustment',coalesce(new.id,old.id),'Stock adjustment',
    jsonb_build_object('operation',tg_op,'before',case when tg_op='INSERT' then null else to_jsonb(old) end,'after',case when tg_op='DELETE' then null else to_jsonb(new) end),v_email,v_email);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists stock_adjustments_audit_trigger on public.stock_adjustments;
create trigger stock_adjustments_audit_trigger after insert or update or delete on public.stock_adjustments
for each row execute function public.audit_stock_adjustment_change();

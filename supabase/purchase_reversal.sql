-- Atomic purchase reversal. Run this migration in Supabase before using the UI.
alter table public.purchases add column if not exists status text not null default 'active';
alter table public.purchases add column if not exists reversal_reason text;
alter table public.purchases add column if not exists reversed_at timestamptz;
alter table public.purchases add column if not exists reversed_by text;
create index if not exists purchases_status_idx on public.purchases(status);

create or replace function public.reverse_purchase(p_purchase_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_purchase record; v_item record; v_before numeric; v_after numeric;
  v_actor text := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
  v_allowed boolean := false; v_adjustments jsonb := '[]'::jsonb;
  v_payments_deleted integer := 0; v_item_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A reversal reason of at least 3 characters is required'; end if;

  v_allowed := lower(v_actor) in ('shayankidscare@gmail.com', 'zaidn2848@gmail.com');
  if not v_allowed then
    select coalesce(up.is_super_admin, false)
      or coalesce((up.permissions -> 'inventory_purchase' ->> 'delete')::boolean, false)
      or coalesce((up.permissions -> 'finance_payables' ->> 'delete')::boolean, false)
    into v_allowed from public.user_privileges up
    where lower(up.email) = lower(v_actor) and up.is_active = true;
  end if;
  if not coalesce(v_allowed, false) then raise exception 'You do not have permission to reverse purchases'; end if;

  select p.*, v.name as vendor_name into v_purchase
  from public.purchases p left join public.vendors v on v.id = p.vendor_id
  where p.id = p_purchase_id for update of p;
  if not found then raise exception 'Purchase not found'; end if;
  if lower(coalesce(v_purchase.status, 'active')) in ('reversed','cancelled','canceled','deleted','void') then raise exception 'Purchase is already reversed'; end if;

  for v_item in
    select pi.product_id, pr.name as product_name, sum(coalesce(pi.quantity, 0))::numeric as quantity
    from public.purchase_items pi join public.products pr on pr.id = pi.product_id
    where pi.purchase_id = p_purchase_id group by pi.product_id, pr.name order by pi.product_id
  loop
    v_item_count := v_item_count + 1;
    select coalesce(stock, 0) into v_before from public.products where id = v_item.product_id for update;
    v_after := v_before - v_item.quantity;
    update public.products set stock = v_after where id = v_item.product_id;
    v_adjustments := v_adjustments || jsonb_build_array(jsonb_build_object('product_id', v_item.product_id, 'product_name', v_item.product_name, 'quantity_reversed', v_item.quantity, 'stock_before', v_before, 'stock_after', v_after));
  end loop;
  if v_item_count = 0 then raise exception 'Purchase has no items to reverse'; end if;

  delete from public.purchase_payments where purchase_id = p_purchase_id;
  get diagnostics v_payments_deleted = row_count;
  update public.purchases set status = 'reversed', reversal_reason = trim(p_reason), reversed_at = now(), reversed_by = v_actor where id = p_purchase_id;
  insert into public.audit_logs(user_email, user_name, action, target_type, target_id, target_label, details, created_by, updated_by)
  values (v_actor, split_part(v_actor, '@', 1), 'reverse_purchase', 'purchase', p_purchase_id,
    coalesce(v_purchase.ref_no, 'PUR-' || left(p_purchase_id::text, 8)),
    jsonb_build_object('reason', trim(p_reason), 'purchase_number', coalesce(v_purchase.ref_no, 'PUR-' || left(p_purchase_id::text, 8)), 'vendor_id', v_purchase.vendor_id, 'vendor_name', v_purchase.vendor_name, 'purchase_total', v_purchase.total_amount, 'payments_deleted', v_payments_deleted, 'stock_adjustments', v_adjustments), v_actor, v_actor);
  return jsonb_build_object('purchase_id', p_purchase_id, 'status', 'reversed', 'payments_deleted', v_payments_deleted, 'stock_adjustments', v_adjustments);
end;
$$;
revoke all on function public.reverse_purchase(uuid, text) from public;
grant execute on function public.reverse_purchase(uuid, text) to authenticated;

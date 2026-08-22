-- Audit targets may be bigint IDs or UUID IDs depending on the entity.
-- Text preserves all existing numeric IDs and accepts UUIDs without data loss.

alter table public.audit_logs
  alter column target_id type text
  using target_id::text;

create or replace function public.sync_order_from_invoice(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_invoice public.invoices%rowtype;
  v_details jsonb;
  v_changes jsonb;
  v_email text;
  v_user_name text;
begin
  if not public.is_privilege_super_admin() then
    raise exception using errcode = '42501',
      message = 'Only a Super Admin can sync an order from an invoice.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_order.invoice_id is null
     or v_order.status not in ('invoiced', 'converted', 'delivered') then
    raise exception using errcode = 'P0001',
      message = 'A linked converted order is required.';
  end if;

  select * into v_invoice
  from public.invoices
  where id = v_order.invoice_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Linked invoice not found.';
  end if;

  if v_invoice.order_id is not null and v_invoice.order_id <> p_order_id then
    raise exception using errcode = 'P0001',
      message = 'Invoice is already linked to a different order.';
  end if;

  with order_lines as (
    select product_id, sum(quantity) quantity, min(price) price,
           min(coalesce(discount, 0)) discount, sum(total) total
    from public.order_items
    where order_id = p_order_id
    group by product_id
  ),
  invoice_lines as (
    select product_id, sum(quantity) quantity, min(price) price,
           min(coalesce(discount, 0)) discount, sum(total) total
    from public.invoice_items
    where invoice_id = v_invoice.id
    group by product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'change_type', case
      when o.product_id is null then 'Product added'
      when i.product_id is null then 'Product removed'
      else 'Product changed'
    end,
    'product_id', coalesce(o.product_id, i.product_id),
    'product_code', p.code,
    'product_name', p.name,
    'order_quantity', o.quantity,
    'invoice_quantity', i.quantity,
    'order_price', o.price,
    'invoice_price', i.price,
    'order_discount', o.discount,
    'invoice_discount', i.discount,
    'order_total', o.total,
    'invoice_total', i.total
  ) order by coalesce(p.code, p.name)), '[]'::jsonb)
  into v_changes
  from order_lines o
  full join invoice_lines i on i.product_id = o.product_id
  left join public.products p on p.id = coalesce(o.product_id, i.product_id)
  where o.product_id is null
     or i.product_id is null
     or row(o.quantity, o.price, o.discount, o.total)
        is distinct from row(i.quantity, i.price, i.discount, i.total);

  v_email := public.auth_email();
  select coalesce(up.display_name, up.username, split_part(v_email, '@', 1))
  into v_user_name
  from public.user_privileges up
  where lower(up.email) = lower(v_email)
  limit 1;
  v_user_name := coalesce(v_user_name, split_part(v_email, '@', 1));

  v_details := jsonb_build_object(
    'order', 'ORD-' || lpad(v_order.order_number::text, 4, '0'),
    'invoice', 'INV-' || lpad(v_invoice.invoice_number::text, 4, '0'),
    'previous_total', v_order.total,
    'corrected_total', v_invoice.total_amount,
    'changes', v_changes,
    'user', v_user_name,
    'corrected_at', now()
  );

  delete from public.order_items where order_id = p_order_id;

  insert into public.order_items(
    order_id, product_id, quantity, price, discount, discount_amount, total
  )
  select
    p_order_id, ii.product_id, ii.quantity, ii.price,
    coalesce(ii.discount, 0),
    round(ii.quantity * ii.price * coalesce(ii.discount, 0) / 100, 2),
    ii.total
  from public.invoice_items ii
  where ii.invoice_id = v_invoice.id;

  update public.orders
  set total = v_invoice.total_amount,
      vat_rate = v_invoice.vat_rate,
      vat_amount = v_invoice.vat_amount,
      invoice_id = v_invoice.id
  where id = p_order_id;

  update public.invoices
  set order_id = p_order_id
  where id = v_invoice.id;

  insert into public.audit_logs(
    user_email, user_name, action, target_type, target_id,
    target_label, details, created_by, updated_by
  )
  values (
    v_email, v_user_name, 'order_data_corrected', 'order', p_order_id::text,
    'ORD-' || lpad(v_order.order_number::text, 4, '0'),
    v_details, v_email, v_email
  );

  return v_details;
end;
$$;

revoke all on function public.sync_order_from_invoice(uuid) from public;
grant execute on function public.sync_order_from_invoice(uuid) to authenticated;

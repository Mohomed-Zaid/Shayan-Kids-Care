-- Exact sales-order snapshots and controlled historical correction.
-- Existing order and invoice rows are not changed by this migration.

alter table public.order_items
  add column if not exists discount_amount numeric(14,2) not null default 0;

comment on column public.order_items.discount_amount is
  'Immutable line discount amount captured from the order form snapshot.';

create or replace function public.validate_order_snapshot(
  p_items jsonb,
  p_vat_amount numeric,
  p_total numeric
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer;
  v_valid_count integer;
  v_line_total numeric;
begin
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001',
      message = 'Order data validation failed. Please refresh and try again.';
  end if;

  select
    count(*),
    count(*) filter (
      where x.product_id is not null
        and x.quantity > 0
        and x.price >= 0
        and x.discount between 0 and 100
        and round(x.discount_amount, 2) =
          round(x.quantity * x.price * x.discount / 100, 2)
        and round(x.total, 2) =
          round(x.quantity * x.price - x.discount_amount, 2)
    ),
    coalesce(sum(x.total), 0)
  into v_count, v_valid_count, v_line_total
  from jsonb_to_recordset(p_items) as x(
    product_id uuid,
    quantity numeric,
    price numeric,
    discount numeric,
    discount_amount numeric,
    total numeric
  );

  if v_count <> jsonb_array_length(p_items)
     or v_valid_count <> v_count
     or round(v_line_total + coalesce(p_vat_amount, 0), 2)
        is distinct from round(p_total, 2) then
    raise exception using errcode = 'P0001',
      message = 'Order data validation failed. Please refresh and try again.';
  end if;
end;
$$;

create or replace function public.create_order_from_snapshot(
  p_customer_id uuid,
  p_rep_id uuid,
  p_payment_type text,
  p_vat_rate numeric,
  p_vat_amount numeric,
  p_total numeric,
  p_items jsonb
)
returns table(created_order_id uuid, created_order_number bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_inserted_count integer;
begin
  perform public.validate_order_snapshot(p_items, p_vat_amount, p_total);

  insert into public.orders(
    customer_id, rep_id, total, vat_rate, vat_amount, status, payment_type
  )
  values (
    p_customer_id, p_rep_id, round(p_total, 2),
    coalesce(p_vat_rate, 0), round(coalesce(p_vat_amount, 0), 2),
    'pending', coalesce(p_payment_type, 'credit')
  )
  returning id, order_number into v_order_id, v_order_number;

  insert into public.order_items(
    order_id, product_id, quantity, price, discount, discount_amount, total
  )
  select
    v_order_id, x.product_id, x.quantity, x.price,
    x.discount, x.discount_amount, x.total
  from jsonb_to_recordset(p_items) as x(
    product_id uuid,
    quantity numeric,
    price numeric,
    discount numeric,
    discount_amount numeric,
    total numeric
  );

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> jsonb_array_length(p_items) then
    raise exception using errcode = 'P0001',
      message = 'Order data validation failed. Please refresh and try again.';
  end if;

  return query select v_order_id, v_order_number;
end;
$$;

create or replace function public.update_order_from_snapshot(
  p_order_id uuid,
  p_customer_id uuid,
  p_rep_id uuid,
  p_payment_type text,
  p_vat_rate numeric,
  p_vat_amount numeric,
  p_total numeric,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_inserted_count integer;
begin
  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_status not in ('pending', 'confirmed') then
    raise exception using errcode = 'P0001',
      message = 'Only pending or confirmed orders can be edited.';
  end if;

  perform public.validate_order_snapshot(p_items, p_vat_amount, p_total);

  update public.orders
  set customer_id = p_customer_id,
      rep_id = p_rep_id,
      payment_type = coalesce(p_payment_type, 'credit'),
      vat_rate = coalesce(p_vat_rate, 0),
      vat_amount = round(coalesce(p_vat_amount, 0), 2),
      total = round(p_total, 2)
  where id = p_order_id;

  delete from public.order_items where order_id = p_order_id;

  insert into public.order_items(
    order_id, product_id, quantity, price, discount, discount_amount, total
  )
  select
    p_order_id, x.product_id, x.quantity, x.price,
    x.discount, x.discount_amount, x.total
  from jsonb_to_recordset(p_items) as x(
    product_id uuid,
    quantity numeric,
    price numeric,
    discount numeric,
    discount_amount numeric,
    total numeric
  );

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> jsonb_array_length(p_items) then
    raise exception using errcode = 'P0001',
      message = 'Order data validation failed. Please refresh and try again.';
  end if;
end;
$$;

create or replace function public.sync_order_from_invoice(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
    v_email, v_user_name, 'order_data_corrected', 'order', p_order_id,
    'ORD-' || lpad(v_order.order_number::text, 4, '0'),
    v_details, v_email, v_email
  );

  return v_details;
end;
$$;

revoke all on function public.sync_order_from_invoice(uuid) from public;
grant execute on function public.sync_order_from_invoice(uuid) to authenticated;
grant execute on function public.create_order_from_snapshot(uuid, uuid, text, numeric, numeric, numeric, jsonb) to authenticated;
grant execute on function public.update_order_from_snapshot(uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb) to authenticated;

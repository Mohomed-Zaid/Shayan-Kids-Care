-- Atomic, snapshot-safe order -> invoice conversion.
-- Safe to run repeatedly. Existing orders and invoices are not converted or changed.

alter table public.invoices
  add column if not exists order_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_order_id_fkey'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete restrict;
  end if;
end
$$;

create unique index if not exists invoices_order_id_unique_idx
  on public.invoices (order_id)
  where order_id is not null;

comment on column public.invoices.order_id is
  'Original order used to create this invoice. Set only by atomic order conversion.';

create or replace function public.convert_order_to_invoice(p_order_id uuid)
returns table (
  invoice_id uuid,
  invoice_number bigint,
  order_id uuid,
  total_amount numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_invoice public.invoices%rowtype;
  v_order_item_count integer;
  v_invoice_item_count integer;
  v_product_count integer;
  v_updated_product_count integer;
  v_items_total numeric;
  v_calculated_total numeric;
  v_generated_total numeric;
  v_mismatch_message constant text :=
    'Order conversion failed: invoice data does not match the original order.';
begin
  if p_order_id is null then
    raise exception using errcode = 'P0001', message = v_mismatch_message;
  end if;

  -- Load and lock only the selected order. This serializes concurrent
  -- conversion attempts for the same order.
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Order not found.';
  end if;

  if v_order.status <> 'confirmed'
     or v_order.invoice_id is not null
     or exists (select 1 from public.invoices i where i.order_id = p_order_id) then
    raise exception using errcode = 'P0001',
      message = 'This order has already been converted or is not confirmed.';
  end if;

  -- Lock and read only this order's persisted lines. No React state and no
  -- product selling price or product quantity is used to build the invoice.
  perform oi.id
  from public.order_items oi
  where oi.order_id = p_order_id
  for update;

  select count(*), coalesce(sum(oi.total), 0)
    into v_order_item_count, v_items_total
  from public.order_items oi
  where oi.order_id = p_order_id;

  if v_order_item_count = 0 then
    raise exception using errcode = 'P0001', message = v_mismatch_message;
  end if;

  -- Line totals are already net of line discount. VAT is copied from the
  -- order header and included in the validated invoice total.
  v_calculated_total := round(v_items_total + coalesce(v_order.vat_amount, 0), 2);

  if v_calculated_total is distinct from round(v_order.total, 2) then
    raise exception using errcode = 'P0001', message = v_mismatch_message;
  end if;

  insert into public.invoices (
    order_id, customer_id, rep_id, total_amount,
    vat_rate, vat_amount, payment_type
  ) values (
    p_order_id, v_order.customer_id, v_order.rep_id, v_calculated_total,
    coalesce(v_order.vat_rate, 0), coalesce(v_order.vat_amount, 0),
    coalesce(v_order.payment_type, 'credit')
  )
  returning * into v_invoice;

  -- Direct snapshot copy: quantity and price never come from products.
  insert into public.invoice_items (
    invoice_id, product_id, quantity, price, discount, total
  )
  select
    v_invoice.id, oi.product_id, oi.quantity, oi.price,
    coalesce(oi.discount, 0), oi.total
  from public.order_items oi
  where oi.order_id = p_order_id;

  select count(*), coalesce(sum(ii.total), 0) + coalesce(v_invoice.vat_amount, 0)
    into v_invoice_item_count, v_generated_total
  from public.invoice_items ii
  where ii.invoice_id = v_invoice.id;

  -- Compare as multisets so duplicate product lines are checked correctly.
  if v_invoice_item_count <> v_order_item_count
     or round(v_generated_total, 2) is distinct from round(v_order.total, 2)
     or exists (
       (select oi.product_id, oi.quantity, oi.price, coalesce(oi.discount, 0), oi.total
        from public.order_items oi where oi.order_id = p_order_id)
       except all
       (select ii.product_id, ii.quantity, ii.price, coalesce(ii.discount, 0), ii.total
        from public.invoice_items ii where ii.invoice_id = v_invoice.id)
     )
     or exists (
       (select ii.product_id, ii.quantity, ii.price, coalesce(ii.discount, 0), ii.total
        from public.invoice_items ii where ii.invoice_id = v_invoice.id)
       except all
       (select oi.product_id, oi.quantity, oi.price, coalesce(oi.discount, 0), oi.total
        from public.order_items oi where oi.order_id = p_order_id)
     ) then
    raise exception using errcode = 'P0001', message = v_mismatch_message;
  end if;

  -- Current stock is only the balance being decremented. It never supplies
  -- invoice quantity, price, discount, or line total.
  select count(*) into v_product_count
  from (
    select oi.product_id
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.product_id
  ) products_in_order;

  update public.products p
  set stock = coalesce(p.stock, 0) - ordered.quantity
  from (
    select oi.product_id, sum(oi.quantity) as quantity
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.product_id
  ) ordered
  where p.id = ordered.product_id;

  get diagnostics v_updated_product_count = row_count;

  if v_updated_product_count <> v_product_count then
    raise exception using errcode = 'P0001', message = v_mismatch_message;
  end if;

  update public.orders
  set status = 'invoiced', invoice_id = v_invoice.id, delivered_at = null
  where id = p_order_id;

  return query
  select v_invoice.id, v_invoice.invoice_number::bigint,
         p_order_id, v_invoice.total_amount;
exception
  when unique_violation then
    raise exception using errcode = 'P0001',
      message = 'This order has already been converted to an invoice.';
end;
$$;

revoke all on function public.convert_order_to_invoice(uuid) from public;
grant execute on function public.convert_order_to_invoice(uuid) to authenticated;

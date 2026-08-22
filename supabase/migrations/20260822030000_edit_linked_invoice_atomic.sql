-- Allow a converted invoice to be edited without breaking its linked order.
-- The invoice, order snapshot, and stock movement are updated in one transaction.

create or replace function public.update_linked_invoice_snapshot(
  p_invoice_id uuid, p_customer_id uuid, p_rep_id uuid, p_payment_type text,
  p_vat_rate numeric, p_vat_amount numeric, p_total numeric, p_items jsonb
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_order_id uuid;
  v_inserted_count integer;
  v_shortage text;
begin
  select order_id into v_order_id
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Invoice not found.';
  end if;

  if v_order_id is null then
    select id into v_order_id
    from public.orders
    where invoice_id = p_invoice_id
    for update;
  else
    perform 1 from public.orders where id = v_order_id for update;
  end if;

  if v_order_id is null then
    raise exception using errcode = 'P0001', message = 'A linked converted order is required.';
  end if;
  perform public.validate_order_snapshot(p_items, p_vat_amount, p_total);

  update public.products p
  set stock = coalesce(p.stock, 0) + old_lines.quantity
  from (
    select product_id, sum(quantity) quantity
    from public.invoice_items where invoice_id = p_invoice_id group by product_id
  ) old_lines
  where p.id = old_lines.product_id;

  select string_agg(coalesce(p.code, p.name, x.product_id::text), ', ') into v_shortage
  from (
    select product_id, sum(quantity) quantity
    from jsonb_to_recordset(p_items) as item(
      product_id uuid, quantity numeric, price numeric, discount numeric,
      discount_amount numeric, total numeric
    ) group by product_id
  ) x
  join public.products p on p.id = x.product_id
  where coalesce(p.stock, 0) < x.quantity;

  if v_shortage is not null then
    raise exception using errcode = 'P0001', message = 'Insufficient stock for: ' || v_shortage;
  end if;

  update public.invoices
  set customer_id=p_customer_id, rep_id=p_rep_id,
      payment_type=coalesce(p_payment_type,'credit'),
      vat_rate=coalesce(p_vat_rate,0), vat_amount=round(coalesce(p_vat_amount,0),2),
      total_amount=round(p_total,2), order_id=v_order_id
  where id=p_invoice_id;

  update public.orders
  set customer_id=p_customer_id, rep_id=p_rep_id,
      payment_type=coalesce(p_payment_type,'credit'),
      vat_rate=coalesce(p_vat_rate,0), vat_amount=round(coalesce(p_vat_amount,0),2),
      total=round(p_total,2), invoice_id=p_invoice_id
  where id=v_order_id;

  delete from public.invoice_items where invoice_id=p_invoice_id;
  delete from public.order_items where order_id=v_order_id;

  insert into public.invoice_items(invoice_id,product_id,quantity,price,discount,total)
  select p_invoice_id,x.product_id,x.quantity,x.price,x.discount,x.total
  from jsonb_to_recordset(p_items) as x(
    product_id uuid, quantity numeric, price numeric, discount numeric,
    discount_amount numeric, total numeric
  );
  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> jsonb_array_length(p_items) then
    raise exception using errcode='P0001', message='Invoice update validation failed.';
  end if;

  insert into public.order_items(order_id,product_id,quantity,price,discount,discount_amount,total)
  select v_order_id,x.product_id,x.quantity,x.price,x.discount,x.discount_amount,x.total
  from jsonb_to_recordset(p_items) as x(
    product_id uuid, quantity numeric, price numeric, discount numeric,
    discount_amount numeric, total numeric
  );

  update public.products p set stock=p.stock-new_lines.quantity
  from (
    select product_id,sum(quantity) quantity
    from jsonb_to_recordset(p_items) as item(
      product_id uuid, quantity numeric, price numeric, discount numeric,
      discount_amount numeric, total numeric
    ) group by product_id
  ) new_lines
  where p.id=new_lines.product_id;
end;
$$;

grant execute on function public.update_linked_invoice_snapshot(
  uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb
) to authenticated;

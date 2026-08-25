-- Returns are credit notes, never payments. Inventory, invoice credit, excess
-- customer credit and audit are changed in one database transaction.
alter table public.returns add column if not exists credit_applied numeric(14,2) not null default 0;
alter table public.returns add column if not exists excess_credit numeric(14,2) not null default 0;

create table if not exists public.customer_credits (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  return_id uuid references public.returns(id) on delete set null,
  amount numeric(14,2) not null,
  transaction_type text not null check (transaction_type in ('return_credit', 'return_reversal', 'credit_applied', 'adjustment')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists returns_invoice_credit_idx on public.returns(invoice_id);
create index if not exists customer_credit_transactions_customer_idx on public.customer_credit_transactions(customer_id, created_at desc);
alter table public.customer_credits enable row level security;
alter table public.customer_credit_transactions enable row level security;
drop policy if exists customer_credits_authenticated_read on public.customer_credits;
create policy customer_credits_authenticated_read on public.customer_credits for select to authenticated using (true);
drop policy if exists customer_credit_transactions_authenticated_read on public.customer_credit_transactions;
create policy customer_credit_transactions_authenticated_read on public.customer_credit_transactions for select to authenticated using (true);

create or replace function public.create_customer_return(p_invoice_id uuid, p_reason text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_invoice public.invoices%rowtype; v_return_id uuid; v_return_number bigint;
  v_subtotal numeric(14,2) := 0; v_total numeric(14,2) := 0; v_paid numeric(14,2) := 0;
  v_previous_returns numeric(14,2) := 0; v_outstanding_before numeric(14,2) := 0;
  v_applied numeric(14,2) := 0; v_excess numeric(14,2) := 0; v_item jsonb;
  v_invoice_item record; v_qty numeric(14,3); v_email text := coalesce(auth.jwt()->>'email', 'unknown');
begin
  if nullif(trim(p_reason), '') is null then raise exception 'Return reason is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'At least one returned item is required'; end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Original invoice not found'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Return quantity must be greater than zero'; end if;
    select ii.id, ii.product_id, ii.price, ii.quantity, ii.discount,
      (select coalesce(sum(ri.quantity), 0) from public.return_items ri join public.returns r on r.id = ri.return_id
       where r.invoice_id = v_invoice.id and ri.product_id = ii.product_id) already_returned
    into v_invoice_item from public.invoice_items ii
    where ii.invoice_id = v_invoice.id and ii.product_id = (v_item->>'product_id')::uuid limit 1;
    if not found then raise exception 'Product was not sold on the selected invoice'; end if;
    if v_qty + v_invoice_item.already_returned > v_invoice_item.quantity then
      raise exception 'Return quantity exceeds the quantity remaining on the invoice';
    end if;
    v_subtotal := v_subtotal + round(v_qty * v_invoice_item.price * (1 - coalesce(v_invoice_item.discount, 0) / 100), 2);
  end loop;

  v_total := round(v_subtotal * (1 + coalesce(v_invoice.vat_rate, 0)), 2);
  select coalesce(sum(amount), 0) into v_paid from public.invoice_payments where invoice_id = v_invoice.id;
  select coalesce(sum(total_amount), 0) into v_previous_returns from public.returns where invoice_id = v_invoice.id;
  v_outstanding_before := greatest(0, v_invoice.total_amount - v_paid - v_previous_returns);
  v_applied := least(v_total, v_outstanding_before); v_excess := greatest(0, v_total - v_applied);

  insert into public.returns(customer_id, invoice_id, total_amount, vat_rate, vat_amount, reason, credit_applied, excess_credit)
  values (v_invoice.customer_id, v_invoice.id, v_total, coalesce(v_invoice.vat_rate, 0), v_total-v_subtotal, trim(p_reason), v_applied, v_excess)
  returning id, return_number into v_return_id, v_return_number;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    select * into v_invoice_item from public.invoice_items where invoice_id=v_invoice.id and product_id=(v_item->>'product_id')::uuid limit 1;
    insert into public.return_items(return_id, product_id, quantity, price, total)
    values (v_return_id, v_invoice_item.product_id, v_qty, v_invoice_item.price,
      round(v_qty*v_invoice_item.price*(1-coalesce(v_invoice_item.discount,0)/100),2));
    update public.products set stock=coalesce(stock,0)+v_qty where id=v_invoice_item.product_id;
  end loop;

  if v_excess > 0 then
    insert into public.customer_credits(customer_id,balance) values(v_invoice.customer_id,v_excess)
    on conflict(customer_id) do update set balance=customer_credits.balance+excluded.balance,updated_at=now();
    insert into public.customer_credit_transactions(customer_id,return_id,amount,transaction_type,note)
    values(v_invoice.customer_id,v_return_id,v_excess,'return_credit','Excess return credit');
  end if;

  insert into public.audit_logs(user_email,user_name,action,target_type,target_id,target_label,details,created_by,updated_by)
  values(v_email,split_part(v_email,'@',1),'apply_return_credit','return',v_return_id::text,
    'RET-'||lpad(v_return_number::text,4,'0'),jsonb_build_object('customer_id',v_invoice.customer_id,
    'return_number',v_return_number,'invoice_id',v_invoice.id,'invoice_number',v_invoice.invoice_number,
    'return_amount',v_total,'outstanding_before',v_outstanding_before,'return_credit_applied',v_applied,
    'outstanding_after',greatest(0,v_outstanding_before-v_applied),'excess_customer_credit',v_excess),v_email,v_email);
  return jsonb_build_object('id',v_return_id,'return_number',v_return_number,'total_amount',v_total,
    'credit_applied',v_applied,'excess_credit',v_excess,'outstanding_before',v_outstanding_before,
    'outstanding_after',greatest(0,v_outstanding_before-v_applied));
end $$;

create or replace function public.reverse_customer_return(p_return_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_return public.returns%rowtype; v_item record; v_email text:=coalesce(auth.jwt()->>'email','unknown');
begin
  select * into v_return from public.returns where id=p_return_id for update;
  if not found then raise exception 'Return not found'; end if;
  if v_return.excess_credit > 0 then
    insert into public.customer_credits(customer_id,balance) values(v_return.customer_id,0) on conflict(customer_id) do nothing;
    if (select balance from public.customer_credits where customer_id=v_return.customer_id for update) < v_return.excess_credit then
      raise exception 'Cannot reverse return: its customer credit has already been used';
    end if;
    update public.customer_credits set balance=balance-v_return.excess_credit,updated_at=now() where customer_id=v_return.customer_id;
    insert into public.customer_credit_transactions(customer_id,return_id,amount,transaction_type,note)
    values(v_return.customer_id,v_return.id,-v_return.excess_credit,'return_reversal','Return reversed');
  end if;
  for v_item in select product_id,quantity from public.return_items where return_id=v_return.id loop
    update public.products set stock=greatest(0,coalesce(stock,0)-v_item.quantity) where id=v_item.product_id;
  end loop;
  insert into public.audit_logs(user_email,user_name,action,target_type,target_id,target_label,details,created_by,updated_by)
  values(v_email,split_part(v_email,'@',1),'reverse_return_credit','return',v_return.id::text,
    'RET-'||lpad(v_return.return_number::text,4,'0'),jsonb_build_object('customer_id',v_return.customer_id,
    'invoice_id',v_return.invoice_id,'return_amount',v_return.total_amount,'credit_reversed',v_return.credit_applied,
    'customer_credit_reversed',v_return.excess_credit),v_email,v_email);
  delete from public.returns where id=v_return.id;
  return jsonb_build_object('id',p_return_id,'reversed',true);
end $$;

revoke all on function public.create_customer_return(uuid,text,jsonb) from public, anon;
revoke all on function public.reverse_customer_return(uuid) from public, anon;
grant execute on function public.create_customer_return(uuid,text,jsonb) to authenticated;
grant execute on function public.reverse_customer_return(uuid) to authenticated;
notify pgrst, 'reload schema';

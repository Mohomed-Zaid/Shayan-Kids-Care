-- Link historical returns that predate mandatory invoice selection. A return
-- is changed only when exactly one customer invoice contains every returned
-- product at the stored historical price and predates the return.
with candidate_invoices as (
  select r.id as return_id, i.id as invoice_id
  from public.returns r
  join public.invoices i
    on i.customer_id = r.customer_id
   and i.created_at <= r.created_at
   and lower(coalesce(i.payment_type, 'credit')) = 'credit'
  where r.invoice_id is null
    and exists (select 1 from public.return_items ri where ri.return_id = r.id)
    and not exists (
      select 1
      from public.return_items ri
      where ri.return_id = r.id
        and not exists (
          select 1
          from public.invoice_items ii
          where ii.invoice_id = i.id
            and ii.product_id = ri.product_id
            and abs(coalesce(ii.price, 0) - coalesce(ri.price, 0)) < 0.01
            and ii.quantity >= ri.quantity
        )
    )
), unique_matches as (
  select return_id, min(invoice_id::text)::uuid as invoice_id
  from candidate_invoices
  group by return_id
  having count(*) = 1
)
update public.returns r
set invoice_id = match.invoice_id
from unique_matches match
where r.id = match.return_id
  and r.invoice_id is null;

-- Populate the credit split on newly linked historical rows. Receivables are
-- still derived from invoice totals/payments/returns; these columns document
-- how much stopped at zero and how much became customer credit.
with legacy as (
  select r.id,
    greatest(0, i.total_amount
      - coalesce((select sum(p.amount) from public.invoice_payments p where p.invoice_id = i.id), 0)
      - coalesce(sum(r.total_amount) over (
          partition by r.invoice_id order by r.created_at, r.id
          rows between unbounded preceding and 1 preceding
        ), 0)
    ) as outstanding_before
  from public.returns r
  join public.invoices i on i.id = r.invoice_id
  where r.total_amount > 0 and r.credit_applied = 0 and r.excess_credit = 0
), updated as (
  update public.returns r
  set credit_applied = least(r.total_amount, legacy.outstanding_before),
      excess_credit = greatest(0, r.total_amount - legacy.outstanding_before)
  from legacy
  where r.id = legacy.id
  returning r.id, r.customer_id, r.excess_credit
), inserted_transactions as (
  insert into public.customer_credit_transactions(customer_id, return_id, amount, transaction_type, note)
  select customer_id, id, excess_credit, 'return_credit', 'Historical excess return credit'
  from updated
  where excess_credit > 0
    and not exists (select 1 from public.customer_credit_transactions t where t.return_id = updated.id and t.transaction_type = 'return_credit')
  returning customer_id, amount
)
insert into public.customer_credits(customer_id, balance)
select customer_id, sum(amount) from inserted_transactions group by customer_id
on conflict(customer_id) do update
set balance = customer_credits.balance + excluded.balance,
    updated_at = now();

notify pgrst, 'reload schema';

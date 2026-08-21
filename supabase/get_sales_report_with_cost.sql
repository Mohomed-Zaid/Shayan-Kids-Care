-- Historical-cost sales report for the LIVE variant-based schema:
-- sales -> sale_items -> product_variants -> products
-- purchases -> purchase_items (matched by variant_id)
-- returns -> return_items (matched by sale_id + variant_id)

drop function if exists public.get_sales_report_with_cost(date, date, uuid, uuid, uuid, text);

create or replace function public.get_sales_report_with_cost(
  start_date date,
  end_date date,
  customer_id uuid default null,
  product_id uuid default null,
  rep_id uuid default null,
  payment_type text default null
)
returns table (
  invoice_id uuid,
  invoice_item_id uuid,
  invoice_number text,
  invoice_date timestamptz,
  customer_id_out uuid,
  customer_name text,
  rep_id_out uuid,
  sales_rep_name text,
  product_id_out uuid,
  variant_id_out uuid,
  product_code text,
  product_name text,
  variant_description text,
  original_quantity numeric,
  returned_quantity numeric,
  quantity_sold numeric,
  purchase_reference text,
  purchase_date_used timestamptz,
  unit_cost numeric,
  unit_selling_price numeric,
  original_line_total numeric,
  total_cost numeric,
  sales_amount numeric,
  gross_profit numeric,
  profit_margin numeric,
  cost_source text,
  payment_type_out text,
  invoice_total numeric,
  payments_received numeric,
  outstanding_balance numeric,
  invoice_status text
)
language sql
stable
security invoker
set search_path = public
as $$
  with returned as (
    select
      r.sale_id,
      ri.variant_id,
      sum(ri.quantity)::numeric as returned_quantity
    from public.returns r
    join public.return_items ri on ri.return_id = r.id
    group by r.sale_id, ri.variant_id
  ),
  sale_lines as (
    select
      si.*,
      coalesce(
        sum(si.quantity) over (
          partition by si.sale_id, si.variant_id
          order by si.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      )::numeric as prior_quantity
    from public.sale_items si
  ),
  costed as (
    select
      s.id as invoice_id,
      si.id as invoice_item_id,
      coalesce(s.invoice_number, s.id::text) as invoice_number,
      s.created_at as invoice_date,
      s.customer_id,
      c.name as customer_name,
      s.user_id as rep_id,
      null::text as sales_rep_name,
      pv.product_id,
      si.variant_id,
      p.code as product_code,
      coalesce(si.product_name_snapshot, si.product_name, p.name) as product_name,
      concat_ws(' / ', nullif(si.size_snapshot, ''), nullif(si.color_snapshot, '')) as variant_description,
      si.quantity::numeric as original_quantity,
      least(
        si.quantity::numeric,
        greatest(coalesce(ret.returned_quantity, 0) - si.prior_quantity, 0)
      ) as returned_quantity,
      greatest(
        si.quantity::numeric - least(
          si.quantity::numeric,
          greatest(coalesce(ret.returned_quantity, 0) - si.prior_quantity, 0)
        ),
        0
      ) as quantity_sold,
      ph.purchase_reference,
      ph.purchase_date,
      ph.cost_price as unit_cost,
      si.selling_price::numeric as unit_selling_price,
      si.line_total::numeric as original_line_total,
      s.payment_method,
      s.total_amount::numeric as invoice_total,
      s.paid_amount::numeric as payments_received,
      s.balance_due::numeric as outstanding_balance,
      s.status as invoice_status
    from public.sales s
    join sale_lines si on si.sale_id = s.id
    join public.product_variants pv on pv.id = si.variant_id
    join public.products p on p.id = pv.product_id
    left join public.customers c on c.id = s.customer_id
    left join returned ret
      on ret.sale_id = s.id
     and ret.variant_id = si.variant_id
    left join lateral (
      select
        pi.cost_price::numeric as cost_price,
        pu.purchase_number::text as purchase_reference,
        pu.purchase_date
      from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      where pi.variant_id = si.variant_id
        and pu.purchase_date <= s.created_at
        and coalesce(lower(pu.status), 'completed') not in ('cancelled', 'canceled', 'draft', 'deleted', 'reversed', 'void')
      order by
        pu.purchase_date desc,
        pi.created_at desc,
        pi.id desc
      limit 1
    ) ph on true
    where s.created_at >= $1::timestamp
      and s.created_at < ($2 + 1)::timestamp
      and ($3 is null or s.customer_id = $3)
      and ($4 is null or pv.product_id = $4)
      and ($5 is null or s.user_id = $5)
      and ($6 is null or s.payment_method = $6)
      and lower(coalesce(s.status, 'completed')) not in ('cancelled', 'canceled', 'draft', 'deleted')
  )
  select
    x.invoice_id,
    x.invoice_item_id,
    x.invoice_number,
    x.invoice_date,
    x.customer_id as customer_id_out,
    x.customer_name,
    x.rep_id as rep_id_out,
    x.sales_rep_name,
    x.product_id as product_id_out,
    x.variant_id as variant_id_out,
    x.product_code,
    x.product_name,
    x.variant_description,
    x.original_quantity,
    x.returned_quantity,
    x.quantity_sold,
    x.purchase_reference,
    x.purchase_date as purchase_date_used,
    x.unit_cost,
    x.unit_selling_price,
    x.original_line_total,
    round(coalesce(x.unit_cost, 0) * x.quantity_sold, 2) as total_cost,
    round(x.unit_selling_price * x.quantity_sold, 2) as sales_amount,
    round(
      (x.unit_selling_price * x.quantity_sold)
      - (coalesce(x.unit_cost, 0) * x.quantity_sold),
      2
    ) as gross_profit,
    case
      when x.unit_selling_price * x.quantity_sold > 0 then round(
        (
          (
            (x.unit_selling_price * x.quantity_sold)
            - (coalesce(x.unit_cost, 0) * x.quantity_sold)
          ) / (x.unit_selling_price * x.quantity_sold)
        ) * 100,
        2
      )
      else 0
    end as profit_margin,
    case
      when x.unit_cost is not null then 'Purchase'
      else 'Cost Not Available'
    end as cost_source,
    x.payment_method as payment_type_out,
    x.invoice_total,
    x.payments_received,
    x.outstanding_balance,
    x.invoice_status
  from costed x
  where x.quantity_sold > 0
  order by x.invoice_date desc, x.invoice_number desc, x.invoice_item_id;
$$;

revoke all on function public.get_sales_report_with_cost(date, date, uuid, uuid, uuid, text) from public;
grant execute on function public.get_sales_report_with_cost(date, date, uuid, uuid, uuid, text) to authenticated;

-- Stable PostgREST wrapper. A single JSON argument avoids function-signature
-- cache mismatches while retaining SECURITY INVOKER/RLS behavior.
drop function if exists public.get_sales_report_with_cost_rpc(jsonb);
create or replace function public.get_sales_report_with_cost_rpc(p_filters jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(report_row)), '[]'::jsonb)
  from public.get_sales_report_with_cost(
    (p_filters->>'start_date')::date,
    (p_filters->>'end_date')::date,
    nullif(p_filters->>'customer_id', '')::uuid,
    nullif(p_filters->>'product_id', '')::uuid,
    nullif(p_filters->>'rep_id', '')::uuid,
    nullif(p_filters->>'payment_type', '')
  ) report_row;
$$;

revoke all on function public.get_sales_report_with_cost_rpc(jsonb) from public;
grant execute on function public.get_sales_report_with_cost_rpc(jsonb) to anon, authenticated;

create index if not exists sales_report_date_idx
  on public.sales (created_at desc, status);
create index if not exists sale_items_report_idx
  on public.sale_items (sale_id, variant_id);
create index if not exists purchases_historical_variant_cost_idx
  on public.purchases (purchase_date desc, id);
create index if not exists purchase_items_historical_variant_cost_idx
  on public.purchase_items (variant_id, purchase_id, created_at desc);
create index if not exists returns_sales_report_idx
  on public.returns (sale_id);
create index if not exists return_items_sales_report_idx
  on public.return_items (return_id, variant_id);

notify pgrst, 'reload schema';

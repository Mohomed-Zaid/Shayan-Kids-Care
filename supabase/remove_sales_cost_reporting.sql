-- Removes the abandoned historical-cost RPC feature.
-- This script intentionally preserves all business tables and business data.

begin;

drop function if exists public.get_sales_report_with_cost_rpc(jsonb);

drop function if exists public.get_sales_report_with_cost(date, date, uuid, uuid, uuid, text);

-- Remove indexes that existed only for the abandoned RPC. PostgreSQL ignores
-- names that are not present, making this safe to run repeatedly.
drop index if exists public.sales_report_date_idx;
drop index if exists public.sale_items_report_idx;
drop index if exists public.purchases_historical_variant_cost_idx;
drop index if exists public.purchase_items_historical_variant_cost_idx;
drop index if exists public.returns_sales_report_idx;
drop index if exists public.return_items_sales_report_idx;
drop index if exists public.purchases_historical_cost_idx;
drop index if exists public.purchase_items_historical_cost_idx;
drop index if exists public.beginning_stock_historical_cost_idx;
drop index if exists public.beginning_stock_items_historical_cost_idx;

commit;

notify pgrst, 'reload schema';

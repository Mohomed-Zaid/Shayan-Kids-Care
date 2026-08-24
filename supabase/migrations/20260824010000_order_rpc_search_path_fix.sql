-- Repair existing order RPCs whose empty search_path breaks legacy triggers.
-- The RPC statements remain schema-qualified; public is included only so
-- trigger functions invoked by those statements can resolve legacy table names.

do $$
begin
  if to_regprocedure('public.create_order_from_snapshot(uuid,uuid,text,numeric,numeric,numeric,jsonb)') is not null then
    alter function public.create_order_from_snapshot(uuid,uuid,text,numeric,numeric,numeric,jsonb)
      set search_path = public, pg_temp;
  end if;

  if to_regprocedure('public.update_order_from_snapshot(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb)') is not null then
    alter function public.update_order_from_snapshot(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb)
      set search_path = public, pg_temp;
  end if;

  if to_regprocedure('public.sync_order_from_invoice(uuid)') is not null then
    alter function public.sync_order_from_invoice(uuid)
      set search_path = public, pg_temp;
  end if;

  if to_regprocedure('public.convert_order_to_invoice(uuid)') is not null then
    alter function public.convert_order_to_invoice(uuid)
      set search_path = public, pg_temp;
  end if;

  if to_regprocedure('public.update_linked_invoice_snapshot(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb)') is not null then
    alter function public.update_linked_invoice_snapshot(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb)
      set search_path = public, pg_temp;
  end if;
end;
$$;

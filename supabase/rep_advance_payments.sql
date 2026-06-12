-- Add advance support for rep payments

-- Add advance_balance to employees table
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS advance_balance NUMERIC DEFAULT 0;

-- Add advance_amount to rep_commission_payments table
ALTER TABLE public.rep_commission_payments 
ADD COLUMN IF NOT EXISTS advance_amount NUMERIC DEFAULT 0;

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('employees', 'rep_commission_payments')
ORDER BY table_name, ordinal_position;

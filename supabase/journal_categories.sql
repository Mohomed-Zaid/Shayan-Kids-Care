-- Journal Categories Setup
-- Run this in Supabase SQL Editor to add/update the journal categories

INSERT INTO journal_categories (name)
VALUES 
  ('CASH [ CURRENT ASSETS ]'),
  ('FIXED [ NON CURRENT ASSETS ]'),
  ('BANK [ CURRENT ASSETS ]')
ON CONFLICT (name) DO NOTHING;

-- To view all categories after insertion
SELECT * FROM journal_categories ORDER BY name;

-- Safe cleanup: First update existing journals, then delete old categories

-- Step 1: Set category_id to NULL for journals using old categories
UPDATE journals
SET category_id = NULL
WHERE category_id IN (
  SELECT id FROM journal_categories 
  WHERE name NOT IN (
    'CASH [ CURRENT ASSETS ]', 
    'FIXED [ NON CURRENT ASSETS ]', 
    'BANK [ CURRENT ASSETS ]'
  )
);

-- Step 2: Now delete the old categories
DELETE FROM journal_categories
WHERE name NOT IN (
  'CASH [ CURRENT ASSETS ]', 
  'FIXED [ NON CURRENT ASSETS ]', 
  'BANK [ CURRENT ASSETS ]'
);

-- Step 3: Verify remaining categories
SELECT * FROM journal_categories ORDER BY name;

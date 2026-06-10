-- Delete unwanted journal categories
-- Keep only: CASH [ CURRENT ASSETS ], FIXED [ NON CURRENT ASSETS ], BANK [ CURRENT ASSETS ]

DELETE FROM journal_categories
WHERE name NOT IN (
  'CASH [ CURRENT ASSETS ]', 
  'FIXED [ NON CURRENT ASSETS ]', 
  'BANK [ CURRENT ASSETS ]'
);

-- Verify remaining categories
SELECT * FROM journal_categories ORDER BY name;

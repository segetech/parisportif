-- Script pour vérifier toutes les colonnes NOT NULL
-- Exécutez ce script pour voir quelles colonnes sont obligatoires

SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name IN ('bets', 'transactions', 'venues')
  AND is_nullable = 'NO'
  AND column_default IS NULL
ORDER BY table_name, ordinal_position;

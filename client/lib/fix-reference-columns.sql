-- Script pour corriger les colonnes "reference" qui sont NOT NULL
-- Exécutez ce script dans le SQL Editor de Supabase

-- ============================================
-- OPTION 1: Rendre les colonnes "reference" optionnelles (RECOMMANDÉ)
-- ============================================

-- Bets
ALTER TABLE bets ALTER COLUMN reference DROP NOT NULL;
ALTER TABLE bets ALTER COLUMN reference SET DEFAULT NULL;

-- Transactions (si elle existe)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' AND column_name = 'reference'
    ) THEN
        ALTER TABLE transactions ALTER COLUMN reference DROP NOT NULL;
        ALTER TABLE transactions ALTER COLUMN reference SET DEFAULT NULL;
    END IF;
END $$;

-- Venues (si elle existe)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'venues' AND column_name = 'reference'
    ) THEN
        ALTER TABLE venues ALTER COLUMN reference DROP NOT NULL;
        ALTER TABLE venues ALTER COLUMN reference SET DEFAULT NULL;
    END IF;
END $$;

-- ============================================
-- OPTION 2: Générer automatiquement une référence unique (ALTERNATIVE)
-- ============================================
-- Décommentez cette section si vous préférez générer automatiquement des références

/*
-- Fonction pour générer une référence unique
CREATE OR REPLACE FUNCTION generate_reference()
RETURNS TEXT AS $$
BEGIN
    RETURN 'REF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Bets
ALTER TABLE bets ALTER COLUMN reference SET DEFAULT generate_reference();

-- Transactions
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' AND column_name = 'reference'
    ) THEN
        ALTER TABLE transactions ALTER COLUMN reference SET DEFAULT generate_reference();
    END IF;
END $$;

-- Venues
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'venues' AND column_name = 'reference'
    ) THEN
        ALTER TABLE venues ALTER COLUMN reference SET DEFAULT generate_reference();
    END IF;
END $$;
*/

-- ============================================
-- VÉRIFICATION
-- ============================================

-- Vérifier les colonnes "reference"
SELECT 
    table_name,
    column_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name IN ('bets', 'transactions', 'venues')
  AND column_name = 'reference'
ORDER BY table_name;

SELECT 'Colonnes "reference" corrigées avec succès!' as status;

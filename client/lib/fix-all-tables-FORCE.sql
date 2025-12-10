-- Script FORCE pour corriger les tables - Supprime tout et recrée
-- Exécutez ce script dans le SQL Editor de Supabase

-- ============================================
-- 1. DÉSACTIVER TEMPORAIREMENT RLS
-- ============================================
ALTER TABLE bets DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE venues DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. SUPPRIMER TOUTES LES POLITIQUES EXISTANTES
-- ============================================

-- Bets - Supprimer toutes les politiques
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'bets') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON bets';
    END LOOP;
END $$;

-- Transactions - Supprimer toutes les politiques
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'transactions') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON transactions';
    END LOOP;
END $$;

-- Venues - Supprimer toutes les politiques
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'venues') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON venues';
    END LOOP;
END $$;

-- ============================================
-- 3. AJOUTER LES COLONNES MANQUANTES
-- ============================================

-- Table bets
ALTER TABLE bets ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'en_attente';
ALTER TABLE bets ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES users(id);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS validation_notes TEXT;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Table transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'en_attente';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES users(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS validation_notes TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Table venues
ALTER TABLE venues ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'en_attente';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES users(id);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS validation_notes TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- ============================================
-- 4. CRÉER LES NOUVELLES POLITIQUES RLS
-- ============================================

-- BETS
CREATE POLICY "allow_all_authenticated_bets_select"
  ON bets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "allow_all_authenticated_bets_insert"
  ON bets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_bets_update"
  ON bets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_bets_delete"
  ON bets FOR DELETE
  TO authenticated
  USING (true);

-- TRANSACTIONS
CREATE POLICY "allow_all_authenticated_transactions_select"
  ON transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "allow_all_authenticated_transactions_insert"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_transactions_update"
  ON transactions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_transactions_delete"
  ON transactions FOR DELETE
  TO authenticated
  USING (true);

-- VENUES
CREATE POLICY "allow_all_authenticated_venues_select"
  ON venues FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "allow_all_authenticated_venues_insert"
  ON venues FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_venues_update"
  ON venues FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_venues_delete"
  ON venues FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- 5. RÉACTIVER RLS
-- ============================================
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. CRÉER DES INDEX
-- ============================================
CREATE INDEX IF NOT EXISTS idx_bets_validation_status ON bets(validation_status);
CREATE INDEX IF NOT EXISTS idx_bets_created_by ON bets(created_by);
CREATE INDEX IF NOT EXISTS idx_bets_created_at ON bets(created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_validation_status ON transactions(validation_status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_venues_validation_status ON venues(validation_status);
CREATE INDEX IF NOT EXISTS idx_venues_created_by ON venues(created_by);
CREATE INDEX IF NOT EXISTS idx_venues_created_at ON venues(created_at);

-- ============================================
-- 7. METTRE À JOUR LES DONNÉES EXISTANTES
-- ============================================
UPDATE bets SET validation_status = 'valide' WHERE validation_status IS NULL OR validation_status = '';
UPDATE transactions SET validation_status = 'valide' WHERE validation_status IS NULL OR validation_status = '';
UPDATE venues SET validation_status = 'valide' WHERE validation_status IS NULL OR validation_status = '';

-- ============================================
-- 8. VÉRIFICATION FINALE
-- ============================================
SELECT 'BETS COLUMNS:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bets' 
  AND column_name IN ('created_by', 'validation_status', 'validated_by', 'validated_at', 'validation_notes', 'created_at');

SELECT 'BETS POLICIES:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'bets';

SELECT 'TRANSACTIONS COLUMNS:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
  AND column_name IN ('created_by', 'validation_status', 'validated_by', 'validated_at', 'validation_notes', 'created_at');

SELECT 'TRANSACTIONS POLICIES:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'transactions';

SELECT 'VENUES COLUMNS:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'venues' 
  AND column_name IN ('created_by', 'validation_status', 'validated_by', 'validated_at', 'validation_notes', 'created_at');

SELECT 'VENUES POLICIES:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'venues';

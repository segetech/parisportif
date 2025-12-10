-- Script complet pour ajouter les colonnes de validation et corriger les RLS
-- Exécutez ce script dans le SQL Editor de Supabase

-- ============================================
-- 1. AJOUTER LES COLONNES MANQUANTES
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
-- 2. SUPPRIMER LES ANCIENNES POLITIQUES RLS
-- ============================================

-- Bets
DROP POLICY IF EXISTS "Users can view bets" ON bets;
DROP POLICY IF EXISTS "Users can insert bets" ON bets;
DROP POLICY IF EXISTS "Users can update bets" ON bets;
DROP POLICY IF EXISTS "Users can delete bets" ON bets;
DROP POLICY IF EXISTS "Everyone can read bets" ON bets;
DROP POLICY IF EXISTS "Authenticated users can insert bets" ON bets;

-- Transactions
DROP POLICY IF EXISTS "Users can view transactions" ON transactions;
DROP POLICY IF EXISTS "Users can insert transactions" ON transactions;
DROP POLICY IF EXISTS "Users can update transactions" ON transactions;
DROP POLICY IF EXISTS "Users can delete transactions" ON transactions;
DROP POLICY IF EXISTS "Everyone can read transactions" ON transactions;
DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON transactions;

-- Venues
DROP POLICY IF EXISTS "Users can view venues" ON venues;
DROP POLICY IF EXISTS "Users can insert venues" ON venues;
DROP POLICY IF EXISTS "Users can update venues" ON venues;
DROP POLICY IF EXISTS "Users can delete venues" ON venues;
DROP POLICY IF EXISTS "Everyone can read venues" ON venues;
DROP POLICY IF EXISTS "Authenticated users can insert venues" ON venues;

-- ============================================
-- 3. CRÉER LES NOUVELLES POLITIQUES RLS
-- ============================================

-- BETS
CREATE POLICY "Authenticated users can read bets"
  ON bets FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert bets"
  ON bets FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update bets"
  ON bets FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete bets"
  ON bets FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- TRANSACTIONS
CREATE POLICY "Authenticated users can read transactions"
  ON transactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert transactions"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update transactions"
  ON transactions FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete transactions"
  ON transactions FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- VENUES
CREATE POLICY "Authenticated users can read venues"
  ON venues FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert venues"
  ON venues FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update venues"
  ON venues FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete venues"
  ON venues FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- ============================================
-- 4. ACTIVER RLS SUR LES TABLES
-- ============================================

ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. CRÉER DES INDEX POUR LES PERFORMANCES
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
-- 6. METTRE À JOUR LES DONNÉES EXISTANTES
-- ============================================

-- Marquer les données existantes comme validées
UPDATE bets SET validation_status = 'valide' WHERE validation_status IS NULL OR validation_status = '';
UPDATE transactions SET validation_status = 'valide' WHERE validation_status IS NULL OR validation_status = '';
UPDATE venues SET validation_status = 'valide' WHERE validation_status IS NULL OR validation_status = '';

-- ============================================
-- 7. VÉRIFICATION
-- ============================================

-- Vérifier les colonnes de bets
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'bets' 
  AND column_name IN ('created_by', 'validation_status', 'validated_by', 'validated_at', 'validation_notes', 'created_at')
ORDER BY ordinal_position;

-- Vérifier les colonnes de transactions
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
  AND column_name IN ('created_by', 'validation_status', 'validated_by', 'validated_at', 'validation_notes', 'created_at')
ORDER BY ordinal_position;

-- Vérifier les colonnes de venues
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'venues' 
  AND column_name IN ('created_by', 'validation_status', 'validated_by', 'validated_at', 'validation_notes', 'created_at')
ORDER BY ordinal_position;

-- Vérifier les politiques RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('bets', 'transactions', 'venues')
ORDER BY tablename, policyname;

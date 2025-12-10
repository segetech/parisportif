-- Script pour corriger les politiques RLS des tables de référentiels
-- Exécutez ce script dans le SQL Editor de Supabase

-- ============================================
-- OPERATORS
-- ============================================

-- Supprimer anciennes politiques
DROP POLICY IF EXISTS "Everyone can read operators" ON operators;
DROP POLICY IF EXISTS "Authenticated users can insert operators" ON operators;
DROP POLICY IF EXISTS "Admins can update operators" ON operators;
DROP POLICY IF EXISTS "Admins can delete operators" ON operators;

-- Créer nouvelles politiques
CREATE POLICY "Authenticated users can read operators"
  ON operators FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert operators"
  ON operators FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update operators"
  ON operators FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete operators"
  ON operators FOR DELETE
  USING (auth.uid() IS NOT NULL);

ALTER TABLE operators ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SUPPORTS
-- ============================================

DROP POLICY IF EXISTS "Everyone can read supports" ON supports;
DROP POLICY IF EXISTS "Authenticated users can insert supports" ON supports;
DROP POLICY IF EXISTS "Admins can update supports" ON supports;
DROP POLICY IF EXISTS "Admins can delete supports" ON supports;

CREATE POLICY "Authenticated users can read supports"
  ON supports FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert supports"
  ON supports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update supports"
  ON supports FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete supports"
  ON supports FOR DELETE
  USING (auth.uid() IS NOT NULL);

ALTER TABLE supports ENABLE ROW LEVEL SECURITY;

-- ============================================
-- BET_TYPES
-- ============================================

DROP POLICY IF EXISTS "Everyone can read bet_types" ON bet_types;
DROP POLICY IF EXISTS "Authenticated users can insert bet_types" ON bet_types;
DROP POLICY IF EXISTS "Admins can update bet_types" ON bet_types;
DROP POLICY IF EXISTS "Admins can delete bet_types" ON bet_types;

CREATE POLICY "Authenticated users can read bet_types"
  ON bet_types FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert bet_types"
  ON bet_types FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update bet_types"
  ON bet_types FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete bet_types"
  ON bet_types FOR DELETE
  USING (auth.uid() IS NOT NULL);

ALTER TABLE bet_types ENABLE ROW LEVEL SECURITY;

-- ============================================
-- BET_STATUSES
-- ============================================

DROP POLICY IF EXISTS "Everyone can read bet_statuses" ON bet_statuses;
DROP POLICY IF EXISTS "Authenticated users can insert bet_statuses" ON bet_statuses;
DROP POLICY IF EXISTS "Admins can update bet_statuses" ON bet_statuses;
DROP POLICY IF EXISTS "Admins can delete bet_statuses" ON bet_statuses;

CREATE POLICY "Authenticated users can read bet_statuses"
  ON bet_statuses FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert bet_statuses"
  ON bet_statuses FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update bet_statuses"
  ON bet_statuses FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete bet_statuses"
  ON bet_statuses FOR DELETE
  USING (auth.uid() IS NOT NULL);

ALTER TABLE bet_statuses ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PAYMENT_OPERATORS
-- ============================================

DROP POLICY IF EXISTS "Everyone can read payment_operators" ON payment_operators;
DROP POLICY IF EXISTS "Authenticated users can insert payment_operators" ON payment_operators;
DROP POLICY IF EXISTS "Admins can update payment_operators" ON payment_operators;
DROP POLICY IF EXISTS "Admins can delete payment_operators" ON payment_operators;

CREATE POLICY "Authenticated users can read payment_operators"
  ON payment_operators FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert payment_operators"
  ON payment_operators FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update payment_operators"
  ON payment_operators FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete payment_operators"
  ON payment_operators FOR DELETE
  USING (auth.uid() IS NOT NULL);

ALTER TABLE payment_operators ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PLATFORMS
-- ============================================

DROP POLICY IF EXISTS "Everyone can read platforms" ON platforms;
DROP POLICY IF EXISTS "Authenticated users can insert platforms" ON platforms;
DROP POLICY IF EXISTS "Admins can update platforms" ON platforms;
DROP POLICY IF EXISTS "Admins can delete platforms" ON platforms;

CREATE POLICY "Authenticated users can read platforms"
  ON platforms FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert platforms"
  ON platforms FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update platforms"
  ON platforms FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete platforms"
  ON platforms FOR DELETE
  USING (auth.uid() IS NOT NULL);

ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;

-- Vérifier les politiques
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('operators', 'supports', 'bet_types', 'bet_statuses', 'payment_operators', 'platforms')
ORDER BY tablename, policyname;

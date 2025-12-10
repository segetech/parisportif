-- Script FORCE v2 pour corriger les tables de référentiels
-- Exécutez ce script APRÈS create-all-lookup-tables.sql

-- ============================================
-- 1. DÉSACTIVER RLS (seulement si la table existe)
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'operators') THEN
        ALTER TABLE operators DISABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'supports') THEN
        ALTER TABLE supports DISABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'bet_types') THEN
        ALTER TABLE bet_types DISABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'bet_statuses') THEN
        ALTER TABLE bet_statuses DISABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'payment_operators') THEN
        ALTER TABLE payment_operators DISABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'platforms') THEN
        ALTER TABLE platforms DISABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ============================================
-- 2. SUPPRIMER TOUTES LES POLITIQUES
-- ============================================

-- Operators
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'operators') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON operators';
    END LOOP;
END $$;

-- Supports
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'supports') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON supports';
    END LOOP;
END $$;

-- Bet types
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'bet_types') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON bet_types';
    END LOOP;
END $$;

-- Bet statuses
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'bet_statuses') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON bet_statuses';
    END LOOP;
END $$;

-- Payment operators
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'payment_operators') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON payment_operators';
    END LOOP;
END $$;

-- Platforms
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'platforms') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON platforms';
    END LOOP;
END $$;

-- ============================================
-- 3. CRÉER LES NOUVELLES POLITIQUES
-- ============================================

-- OPERATORS
CREATE POLICY "allow_all_authenticated_operators_select"
  ON operators FOR SELECT TO authenticated USING (true);

CREATE POLICY "allow_all_authenticated_operators_insert"
  ON operators FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_operators_update"
  ON operators FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_operators_delete"
  ON operators FOR DELETE TO authenticated USING (true);

-- SUPPORTS
CREATE POLICY "allow_all_authenticated_supports_select"
  ON supports FOR SELECT TO authenticated USING (true);

CREATE POLICY "allow_all_authenticated_supports_insert"
  ON supports FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_supports_update"
  ON supports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_supports_delete"
  ON supports FOR DELETE TO authenticated USING (true);

-- BET_TYPES
CREATE POLICY "allow_all_authenticated_bet_types_select"
  ON bet_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "allow_all_authenticated_bet_types_insert"
  ON bet_types FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_bet_types_update"
  ON bet_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_bet_types_delete"
  ON bet_types FOR DELETE TO authenticated USING (true);

-- BET_STATUSES
CREATE POLICY "allow_all_authenticated_bet_statuses_select"
  ON bet_statuses FOR SELECT TO authenticated USING (true);

CREATE POLICY "allow_all_authenticated_bet_statuses_insert"
  ON bet_statuses FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_bet_statuses_update"
  ON bet_statuses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_bet_statuses_delete"
  ON bet_statuses FOR DELETE TO authenticated USING (true);

-- PAYMENT_OPERATORS
CREATE POLICY "allow_all_authenticated_payment_operators_select"
  ON payment_operators FOR SELECT TO authenticated USING (true);

CREATE POLICY "allow_all_authenticated_payment_operators_insert"
  ON payment_operators FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_payment_operators_update"
  ON payment_operators FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_payment_operators_delete"
  ON payment_operators FOR DELETE TO authenticated USING (true);

-- PLATFORMS
CREATE POLICY "allow_all_authenticated_platforms_select"
  ON platforms FOR SELECT TO authenticated USING (true);

CREATE POLICY "allow_all_authenticated_platforms_insert"
  ON platforms FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_platforms_update"
  ON platforms FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_authenticated_platforms_delete"
  ON platforms FOR DELETE TO authenticated USING (true);

-- ============================================
-- 4. RÉACTIVER RLS
-- ============================================
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. VÉRIFICATION
-- ============================================
SELECT 'OPERATORS POLICIES:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'operators';

SELECT 'SUPPORTS POLICIES:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'supports';

SELECT 'BET_TYPES POLICIES:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'bet_types';

SELECT 'BET_STATUSES POLICIES:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'bet_statuses';

SELECT 'PAYMENT_OPERATORS POLICIES:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'payment_operators';

SELECT 'PLATFORMS POLICIES:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'platforms';

SELECT 'Configuration terminée avec succès!' as status;

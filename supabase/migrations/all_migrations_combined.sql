-- ==========================================
-- FILE: 01_schema_and_tables.sql
-- ==========================================
-- ==============================================================================
-- Migration 01 : Définition des Tables et Contraintes Principales
-- Application : Pari Sportif
-- Idempotente et ré-exécutable en toute sécurité
-- ==============================================================================

-- 1. Table users (liée aux comptes auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'CONTROLEUR', 'AGENT')),
  statut VARCHAR(30) NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'suspendu', 'invitation_envoyee', 'desactive')),
  derniere_connexion TIMESTAMP WITH TIME ZONE,
  cree_le TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  mis_a_jour_le TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index table users
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_statut ON public.users(statut);

-- 2. Table transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(100) NOT NULL,
  support VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('Dépôt', 'Retrait')),
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  phone VARCHAR(30),
  reference VARCHAR(255),
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON public.transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_validation_status ON public.transactions(validation_status);

-- 3. Table bets (paris)
CREATE TABLE IF NOT EXISTS public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(100) NOT NULL,
  support VARCHAR(100) NOT NULL,
  bet_type VARCHAR(100) NOT NULL,
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  amount_won_fcfa DECIMAL(15, 2) DEFAULT 0,
  status VARCHAR(50) NOT NULL,
  reference VARCHAR(255),
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_bets_date ON public.bets(date);
CREATE INDEX IF NOT EXISTS idx_bets_created_by ON public.bets(created_by);
CREATE INDEX IF NOT EXISTS idx_bets_validation_status ON public.bets(validation_status);

-- 4. Table venues (salles de jeux)
CREATE TABLE IF NOT EXISTS public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  operator VARCHAR(100) NOT NULL,
  support VARCHAR(100) NOT NULL,
  bet_type VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  contact_phone VARCHAR(30),
  gps_lat DECIMAL(10, 8),
  gps_lng DECIMAL(11, 8),
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_venues_created_by ON public.venues(created_by);

-- 5. Table audit_logs (journal d'audit centralisé et immutable)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- 6. Table password_resets (jetons de réinitialisation sécurisés)
CREATE TABLE IF NOT EXISTS public.password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON public.password_resets(token_hash);

-- 7. Table illegal_bets (paris illégaux signalés)
CREATE TABLE IF NOT EXISTS public.illegal_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(255) NOT NULL,
  platform VARCHAR(255) NOT NULL,
  payment_operator VARCHAR(255) NOT NULL,
  type VARCHAR(255) NOT NULL,
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  phone VARCHAR(30),
  reference VARCHAR(255) NOT NULL,
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_illegal_bets_date ON public.illegal_bets(date);
CREATE INDEX IF NOT EXISTS idx_illegal_bets_created_by ON public.illegal_bets(created_by);

-- 8. Table illegal_transactions (transactions illégales signalées)
CREATE TABLE IF NOT EXISTS public.illegal_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(255) NOT NULL,
  platform VARCHAR(255) NOT NULL,
  payment_operator VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('Dépôt', 'Retrait')),
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  phone VARCHAR(30),
  reference VARCHAR(255) NOT NULL,
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_illegal_transactions_date ON public.illegal_transactions(date);
CREATE INDEX IF NOT EXISTS idx_illegal_transactions_created_by ON public.illegal_transactions(created_by);


-- ==========================================
-- FILE: 02_security_functions.sql
-- ==========================================
-- ==============================================================================
-- Migration 02 : Fonctions de Sécurité Définies (Non Récursives)
-- Permet de vérifier les rôles et statuts sans provoquer de boucle de récursion RLS
-- ==============================================================================

-- 1. Vérifier si l'utilisateur connecté possède un compte actif
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND statut = 'actif'
  );
$$;

-- 2. Récupérer le rôle de l'utilisateur connecté actif
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() AND statut = 'actif';
$$;

-- 3. Vérifier si l'utilisateur est un administrateur actif
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'ADMIN' AND statut = 'actif'
  );
$$;

-- 4. Vérifier si l'utilisateur est un contrôleur ou un administrateur actif
CREATE OR REPLACE FUNCTION public.is_controleur_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('ADMIN', 'CONTROLEUR') AND statut = 'actif'
  );
$$;


-- ==========================================
-- FILE: 03_rls_policies.sql
-- ==========================================
-- ==============================================================================
-- Migration 03 : Politiques RLS (Row Level Security) Complètes et Robustes
-- Active RLS sur toutes les tables et applique le principe du moindre privilège
-- Remplace et purge toutes les anciennes politiques permissives
-- ==============================================================================

-- 0. Nettoyage dynamique des anciennes politiques pour garantir l'absence de fuite permissive
DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'users', 'transactions', 'bets', 'venues',
    'illegal_bets', 'illegal_transactions',
    'audit_logs', 'password_resets',
    'operators', 'platforms', 'payment_operators', 'bet_types'
  ]) LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- 1. Activation stricte de RLS sur toutes les tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_bets') THEN
    ALTER TABLE public.illegal_bets ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_transactions') THEN
    ALTER TABLE public.illegal_transactions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Table users
-- ------------------------------------------------------------------------------
-- Seuls les utilisateurs actifs peuvent lire leur propre profil ou la liste (contrôleurs/admins)
CREATE POLICY "users_select_policy" ON public.users
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND (id = auth.uid() OR public.is_controleur_or_admin())
  );

-- Un utilisateur actif peut modifier son nom/prénom, mais ne peut ni s'attribuer un rôle ni modifier son statut (gardé par trigger)
CREATE POLICY "users_update_policy" ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (id = auth.uid() OR public.is_admin())
  )
  WITH CHECK (
    public.is_active_user() AND (id = auth.uid() OR public.is_admin())
  );

-- Pas de politique INSERT / DELETE directe pour users : géré exclusivement par l'API serveur via service_role

-- ------------------------------------------------------------------------------
-- 3. Table transactions
-- ------------------------------------------------------------------------------
CREATE POLICY "transactions_select_policy" ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid())
  );

-- Un agent ne peut insérer qu'à son nom et impérativement au statut "en_attente" sans métadonnées de validation
CREATE POLICY "transactions_insert_policy" ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user() AND (
      public.is_admin() OR
      (
        created_by = auth.uid() AND
        validation_status = 'en_attente' AND
        validated_by IS NULL AND
        validated_at IS NULL AND
        validation_notes IS NULL
      )
    )
  );

-- Un agent ne peut modifier que ses transactions non encore validées (au statut "en_attente") sans altérer le workflow
CREATE POLICY "transactions_update_policy" ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  )
  WITH CHECK (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        validation_status = 'en_attente' AND
        validated_by IS NULL AND
        validated_at IS NULL AND
        validation_notes IS NULL
      )
    )
  );

CREATE POLICY "transactions_delete_policy" ON public.transactions
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_user() AND public.is_admin()
  );

-- ------------------------------------------------------------------------------
-- 4. Table bets
-- ------------------------------------------------------------------------------
CREATE POLICY "bets_select_policy" ON public.bets
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid())
  );

CREATE POLICY "bets_insert_policy" ON public.bets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user() AND (
      public.is_admin() OR
      (
        created_by = auth.uid() AND
        validation_status = 'en_attente' AND
        validated_by IS NULL AND
        validated_at IS NULL AND
        validation_notes IS NULL
      )
    )
  );

CREATE POLICY "bets_update_policy" ON public.bets
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  )
  WITH CHECK (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        validation_status = 'en_attente' AND
        validated_by IS NULL AND
        validated_at IS NULL AND
        validation_notes IS NULL
      )
    )
  );

CREATE POLICY "bets_delete_policy" ON public.bets
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_user() AND public.is_admin()
  );

-- ------------------------------------------------------------------------------
-- 5. Table venues
-- ------------------------------------------------------------------------------
CREATE POLICY "venues_select_policy" ON public.venues
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user()
  );

CREATE POLICY "venues_insert_policy" ON public.venues
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user() AND (
      public.is_admin() OR
      (
        created_by = auth.uid() AND
        validation_status = 'en_attente' AND
        validated_by IS NULL AND
        validated_at IS NULL AND
        validation_notes IS NULL
      )
    )
  );

CREATE POLICY "venues_update_policy" ON public.venues
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  )
  WITH CHECK (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        validation_status = 'en_attente' AND
        validated_by IS NULL AND
        validated_at IS NULL AND
        validation_notes IS NULL
      )
    )
  );

CREATE POLICY "venues_delete_policy" ON public.venues
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_user() AND public.is_admin()
  );

-- ------------------------------------------------------------------------------
-- 6. Tables illegal_bets et illegal_transactions (si présentes)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_bets') THEN
    CREATE POLICY "illegal_bets_select_policy" ON public.illegal_bets
      FOR SELECT TO authenticated
      USING (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()));

    CREATE POLICY "illegal_bets_insert_policy" ON public.illegal_bets
      FOR INSERT TO authenticated
      WITH CHECK (public.is_active_user() AND (created_by = auth.uid() OR public.is_admin()));

    CREATE POLICY "illegal_bets_update_policy" ON public.illegal_bets
      FOR UPDATE TO authenticated
      USING (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()))
      WITH CHECK (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()));

    CREATE POLICY "illegal_bets_delete_policy" ON public.illegal_bets
      FOR DELETE TO authenticated
      USING (public.is_active_user() AND public.is_admin());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_transactions') THEN
    CREATE POLICY "illegal_transactions_select_policy" ON public.illegal_transactions
      FOR SELECT TO authenticated
      USING (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()));

    CREATE POLICY "illegal_transactions_insert_policy" ON public.illegal_transactions
      FOR INSERT TO authenticated
      WITH CHECK (public.is_active_user() AND (created_by = auth.uid() OR public.is_admin()));

    CREATE POLICY "illegal_transactions_update_policy" ON public.illegal_transactions
      FOR UPDATE TO authenticated
      USING (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()))
      WITH CHECK (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()));

    CREATE POLICY "illegal_transactions_delete_policy" ON public.illegal_transactions
      FOR DELETE TO authenticated
      USING (public.is_active_user() AND public.is_admin());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. Table audit_logs (Journal d'audit strictement immuable)
-- ------------------------------------------------------------------------------
CREATE POLICY "audit_logs_select_policy" ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND public.is_controleur_or_admin()
  );

-- Les insertions sont réalisées par les triggers de base de données ou le service backend
-- Pas de politiques UPDATE ni DELETE : journal inaltérable

-- ------------------------------------------------------------------------------
-- 8. Table password_resets (Exclusivement réservée au service_role backend)
-- ------------------------------------------------------------------------------
-- Aucun accès direct via authenticated ni anon


-- ==========================================
-- FILE: 04_triggers_workflow.sql
-- ==========================================
-- ==============================================================================
-- Migration 04 : Triggers de Protection Métier, Intégrité du Workflow et Audit
-- Empêche l'escalade de privilèges, protège les statuts et audite les mutations
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Trigger de protection du profil, du rôle et du statut sur public.users
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_user_role_and_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permettre les modifications backend exécutées par le service_role
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    NEW.mis_a_jour_le = NOW();
    RETURN NEW;
  END IF;

  -- Empêcher la modification de l'identifiant
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Interdiction : impossible de modifier l''identifiant utilisateur';
  END IF;

  -- Seul un administrateur authentifié et actif peut modifier le rôle ou le statut d'un compte
  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Interdiction : seul un administrateur peut modifier le rôle d''un utilisateur';
    END IF;
    IF NEW.statut IS DISTINCT FROM OLD.statut THEN
      RAISE EXCEPTION 'Interdiction : seul un administrateur peut modifier le statut d''un utilisateur';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Interdiction : seul un administrateur peut modifier l''adresse email';
    END IF;
  END IF;

  NEW.mis_a_jour_le = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_role_and_status ON public.users;
CREATE TRIGGER trg_protect_user_role_and_status
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.protect_user_role_and_status();

-- ------------------------------------------------------------------------------
-- 2. Trigger de protection du workflow de validation (INSERT + UPDATE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_validation_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_is_service_role BOOLEAN;
BEGIN
  -- Opérations backend avec service_role exemptées
  v_is_service_role := (auth.role() = 'service_role' OR auth.uid() IS NULL);
  IF v_is_service_role THEN
    RETURN NEW;
  END IF;

  v_caller_role := public.get_auth_role();

  -- Cas de l'insertion (INSERT)
  IF TG_OP = 'INSERT' THEN
    IF v_caller_role = 'AGENT' THEN
      -- Forcer impérativement l'auteur à l'utilisateur courant et le statut en_attente
      NEW.created_by := auth.uid();
      NEW.validation_status := 'en_attente';
      NEW.validated_by := NULL;
      NEW.validated_at := NULL;
      NEW.validation_notes := NULL;
    ELSIF v_caller_role = 'CONTROLEUR' THEN
      -- Un contrôleur ne s'auto-valide pas lors de la création d'une opération
      NEW.created_by := auth.uid();
      NEW.validation_status := 'en_attente';
      NEW.validated_by := NULL;
      NEW.validated_at := NULL;
    ELSIF v_caller_role = 'ADMIN' THEN
      IF NEW.created_by IS NULL THEN
        NEW.created_by := auth.uid();
      END IF;
      IF NEW.validation_status = 'valide' THEN
        IF NEW.validated_by IS NULL THEN
          NEW.validated_by := auth.uid();
        END IF;
        NEW.validated_at := NOW();
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Cas de la mise à jour (UPDATE)
  IF TG_OP = 'UPDATE' THEN
    -- Un AGENT ne peut jamais altérer les champs de validation ni changer l'auteur
    IF v_caller_role = 'AGENT' THEN
      IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Interdiction : impossible de modifier l''auteur de l''opération';
      END IF;
      IF NEW.validation_status IS DISTINCT FROM OLD.validation_status THEN
        RAISE EXCEPTION 'Interdiction : un agent ne peut pas modifier le statut de validation';
      END IF;
      IF NEW.validated_by IS DISTINCT FROM OLD.validated_by OR
         NEW.validated_at IS DISTINCT FROM OLD.validated_at OR
         NEW.validation_notes IS DISTINCT FROM OLD.validation_notes THEN
        RAISE EXCEPTION 'Interdiction : un agent ne peut pas renseigner ou modifier les métadonnées de validation';
      END IF;
      IF OLD.validation_status = 'valide' THEN
        RAISE EXCEPTION 'Interdiction : une opération validée ne peut plus être modifiée par un agent';
      END IF;
    END IF;

    -- Transitions de statut autorisées pour CONTROLEUR et ADMIN
    IF NEW.validation_status IS DISTINCT FROM OLD.validation_status THEN
      IF NEW.validation_status IN ('valide', 'refuse') THEN
        IF NEW.validated_by IS NULL THEN
          NEW.validated_by := auth.uid();
        END IF;
        NEW.validated_at := NOW();
      ELSIF NEW.validation_status = 'en_attente' THEN
        NEW.validated_by := NULL;
        NEW.validated_at := NULL;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Application aux tables transactions, bets, venues
DROP TRIGGER IF EXISTS trg_protect_validation_bets ON public.bets;
CREATE TRIGGER trg_protect_validation_bets
BEFORE INSERT OR UPDATE ON public.bets
FOR EACH ROW
EXECUTE FUNCTION public.protect_validation_workflow();

DROP TRIGGER IF EXISTS trg_protect_validation_transactions ON public.transactions;
CREATE TRIGGER trg_protect_validation_transactions
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.protect_validation_workflow();

DROP TRIGGER IF EXISTS trg_protect_validation_venues ON public.venues;
CREATE TRIGGER trg_protect_validation_venues
BEFORE INSERT OR UPDATE ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.protect_validation_workflow();

-- Application conditionnelle aux tables d'activités illégales si présentes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_bets') THEN
    DROP TRIGGER IF EXISTS trg_protect_validation_illegal_bets ON public.illegal_bets;
    CREATE TRIGGER trg_protect_validation_illegal_bets
    BEFORE INSERT OR UPDATE ON public.illegal_bets
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_validation_workflow();
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_transactions') THEN
    DROP TRIGGER IF EXISTS trg_protect_validation_illegal_transactions ON public.illegal_transactions;
    CREATE TRIGGER trg_protect_validation_illegal_transactions
    BEFORE INSERT OR UPDATE ON public.illegal_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_validation_workflow();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Trigger d'audit automatique des opérations métier
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_business_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_entity_id TEXT;
  v_user_id UUID;
  v_details JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'cree';
    v_entity_id := NEW.id::TEXT;
    v_user_id := COALESCE(auth.uid(), NEW.created_by);
    v_details := jsonb_build_object(
      'op', 'INSERT',
      'table', TG_TABLE_NAME,
      'status', NEW.validation_status
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'supprime';
    v_entity_id := OLD.id::TEXT;
    v_user_id := COALESCE(auth.uid(), OLD.created_by);
    v_details := jsonb_build_object(
      'op', 'DELETE',
      'table', TG_TABLE_NAME,
      'status', OLD.validation_status
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := NEW.id::TEXT;
    v_user_id := COALESCE(auth.uid(), NEW.validated_by, NEW.created_by);

    IF NEW.validation_status IS DISTINCT FROM OLD.validation_status THEN
      IF NEW.validation_status = 'valide' THEN
        v_action := 'valide';
      ELSIF NEW.validation_status = 'refuse' THEN
        v_action := 'refuse';
      ELSE
        v_action := 'reouvert';
      END IF;
    ELSE
      v_action := 'edite';
    END IF;

    v_details := jsonb_build_object(
      'op', 'UPDATE',
      'table', TG_TABLE_NAME,
      'old_status', OLD.validation_status,
      'new_status', NEW.validation_status,
      'validated_by', NEW.validated_by
    );
  END IF;

  INSERT INTO public.audit_logs (
    action,
    entity_type,
    entity_id,
    user_id,
    details,
    created_at
  ) VALUES (
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    v_user_id,
    v_details,
    NOW()
  );

  RETURN NULL;
END;
$$;

-- Triggers d'audit automatique
DROP TRIGGER IF EXISTS trg_audit_business_bets ON public.bets;
CREATE TRIGGER trg_audit_business_bets
AFTER INSERT OR UPDATE OR DELETE ON public.bets
FOR EACH ROW
EXECUTE FUNCTION public.log_business_audit();

DROP TRIGGER IF EXISTS trg_audit_business_transactions ON public.transactions;
CREATE TRIGGER trg_audit_business_transactions
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.log_business_audit();

DROP TRIGGER IF EXISTS trg_audit_business_venues ON public.venues;
CREATE TRIGGER trg_audit_business_venues
AFTER INSERT OR UPDATE OR DELETE ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.log_business_audit();


-- ==========================================
-- FILE: 05_harmonize_and_harden.sql
-- ==========================================
-- ==============================================================================
-- Migration 05 : Harmonisation des Données et Rétrocompatibilité
-- Fait converger 'review_status' (legacy) vers 'validation_status' (cible)
-- Idempotente et exécutable sans perte de données
-- ==============================================================================

DO $$
BEGIN
  -- 1. Harmonisation sur la table transactions
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'review_status'
  ) THEN
    -- Migration des statuts existants
    UPDATE public.transactions
    SET validation_status = CASE
      WHEN review_status = 'en_cours' THEN 'en_attente'
      WHEN review_status = 'rejete' THEN 'refuse'
      WHEN review_status = 'valide' THEN 'valide'
      ELSE validation_status
    END
    WHERE validation_status IS NULL OR validation_status = 'en_attente';

    -- Migration des métadonnées
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'reviewed_by') THEN
      UPDATE public.transactions
      SET validated_by = reviewed_by
      WHERE validated_by IS NULL AND reviewed_by IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'reviewed_at') THEN
      UPDATE public.transactions
      SET validated_at = reviewed_at
      WHERE validated_at IS NULL AND reviewed_at IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'reject_reason') THEN
      UPDATE public.transactions
      SET validation_notes = reject_reason
      WHERE validation_notes IS NULL AND reject_reason IS NOT NULL;
    END IF;
  END IF;

  -- 2. Harmonisation sur la table bets
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'review_status'
  ) THEN
    -- Migration des statuts existants
    UPDATE public.bets
    SET validation_status = CASE
      WHEN review_status = 'en_cours' THEN 'en_attente'
      WHEN review_status = 'rejete' THEN 'refuse'
      WHEN review_status = 'valide' THEN 'valide'
      ELSE validation_status
    END
    WHERE validation_status IS NULL OR validation_status = 'en_attente';

    -- Migration des métadonnées
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'reviewed_by') THEN
      UPDATE public.bets
      SET validated_by = reviewed_by
      WHERE validated_by IS NULL AND reviewed_by IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'reviewed_at') THEN
      UPDATE public.bets
      SET validated_at = reviewed_at
      WHERE validated_at IS NULL AND reviewed_at IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'reject_reason') THEN
      UPDATE public.bets
      SET validation_notes = reject_reason
      WHERE validation_notes IS NULL AND reject_reason IS NOT NULL;
    END IF;
  END IF;

  -- 3. Synchronisation automatique bidirectionnelle si review_status est encore présent
  -- Cela permet aux anciens modules de lire ou écrire sans briser la validation_status
  CREATE OR REPLACE FUNCTION public.sync_legacy_review_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $sync$
  BEGIN
    IF NEW.validation_status IS NOT NULL THEN
      NEW.review_status := CASE
        WHEN NEW.validation_status = 'en_attente' THEN 'en_cours'
        WHEN NEW.validation_status = 'refuse' THEN 'rejete'
        WHEN NEW.validation_status = 'valide' THEN 'valide'
        ELSE 'en_cours'
      END;
      NEW.reviewed_by := NEW.validated_by;
      NEW.reviewed_at := NEW.validated_at;
      NEW.reject_reason := NEW.validation_notes;
    END IF;
    RETURN NEW;
  END;
  $sync$;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'review_status') THEN
    DROP TRIGGER IF EXISTS trg_sync_review_transactions ON public.transactions;
    CREATE TRIGGER trg_sync_review_transactions
    BEFORE INSERT OR UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_legacy_review_fields();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'review_status') THEN
    DROP TRIGGER IF EXISTS trg_sync_review_bets ON public.bets;
    CREATE TRIGGER trg_sync_review_bets
    BEFORE INSERT OR UPDATE ON public.bets
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_legacy_review_fields();
  END IF;

END $$;

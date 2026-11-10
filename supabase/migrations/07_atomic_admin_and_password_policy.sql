-- ==============================================================================
-- Migration 07 : Protection Atomique du Dernier Administrateur et Politique MDP
-- Garantit l'existence perpétuelle d'au moins 1 administrateur actif (y compris en concurrence)
-- et formalise l'état de renouvellement obligatoire du mot de passe avec blocage RLS.
-- ==============================================================================

DO $$
BEGIN
  -- 1. Ajout de la colonne must_change_password si non existante
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'must_change_password'
  ) THEN
    ALTER TABLE public.users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- 2. Ajout de la colonne password_changed_at si non existante
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_changed_at'
  ) THEN
    ALTER TABLE public.users ADD COLUMN password_changed_at TIMESTAMPTZ;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Fonction et Trigger de Protection Atomique du Dernier Administrateur Actif
-- Utilise pg_advisory_xact_lock pour sérialiser strictement les opérations concurrentes
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_last_active_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining_active_admins INT;
BEGIN
  -- Contrôle uniquement si l'utilisateur ciblé était un ADMIN ACTIF
  -- et qu'il est supprimé, rétrogradé ou que son statut devient non-actif
  IF (TG_OP = 'DELETE' AND OLD.role = 'ADMIN' AND OLD.statut = 'actif')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'ADMIN' AND OLD.statut = 'actif' 
         AND (NEW.role IS DISTINCT FROM 'ADMIN' OR NEW.statut IS DISTINCT FROM 'actif')) THEN
    
    -- Verrou transactionnel exclusif : sérialise les transactions concurrentes
    PERFORM pg_advisory_xact_lock(hashtext('pari_sportif_active_admin_lock'));

    -- Compte les autres administrateurs actifs subsistants
    SELECT COUNT(*) INTO v_remaining_active_admins
    FROM public.users
    WHERE role = 'ADMIN' 
      AND statut = 'actif'
      AND id != OLD.id;

    IF v_remaining_active_admins < 1 THEN
      RAISE EXCEPTION 'INTERDICTION_DERNIER_ADMIN : Impossible de rétrograder, suspendre, désactiver ou supprimer le dernier administrateur actif du système.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_last_active_admin ON public.users;
CREATE TRIGGER trg_protect_last_active_admin
BEFORE UPDATE OR DELETE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.protect_last_active_admin();

-- ------------------------------------------------------------------------------
-- 4. Protection des Attributs de Sécurité par l'Utilisateur
-- Empêche un utilisateur ordinaire de falsifier son rôle, statut ou must_change_password
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_user_security_attributes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- Vérifier si l'appelant est authentifié via Supabase JWT
  v_caller_role := current_setting('request.jwt.claim.role', true);
  
  -- Si l'utilisateur n'est pas service_role / superutilisateur
  IF v_caller_role = 'authenticated' THEN
    -- Vérifier si les champs de sécurité ont été altérés
    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.statut IS DISTINCT FROM OLD.statut)
       OR (NEW.must_change_password IS DISTINCT FROM OLD.must_change_password)
       OR (NEW.password_changed_at IS DISTINCT FROM OLD.password_changed_at) THEN
      
      -- Seul un ADMIN actif est autorisé à modifier le rôle ou statut d'un compte
      IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'ADMIN' AND statut = 'actif'
      ) THEN
        RAISE EXCEPTION 'SECURITE_ATTRIBUT_PROTEGE : Modification directe des attributs de sécurité interdite.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_security_attributes ON public.users;
CREATE TRIGGER trg_protect_user_security_attributes
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.protect_user_security_attributes();

-- ------------------------------------------------------------------------------
-- 5. Helper RLS : Vérifie si le compte courant doit renouveler son mot de passe
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_must_change_password()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT must_change_password FROM public.users WHERE id = auth.uid()),
    false
  );
$$;

-- ------------------------------------------------------------------------------
-- 6. RPC Métier : Agrégats Natifs pour le Tableau de Bord
-- Garantit des totaux 100% exacts et performants même au-delà de 100 000 lignes
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_aggregates(p_agent_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_total_bets INT;
  v_total_bets_amount NUMERIC;
  v_total_known_winnings NUMERIC;
  v_won_bets_count INT;
  v_lost_bets_count INT;
  v_pending_bets_count INT;
  v_pending_validations INT := 0;
  v_total_deposits NUMERIC;
  v_total_withdrawals NUMERIC;
  v_total_venues INT;
  v_filter_user UUID;
BEGIN
  v_caller_id := auth.uid();
  SELECT role INTO v_caller_role FROM public.users WHERE id = v_caller_id;

  -- Si AGENT, restreindre obligatoirement à ses propres créations
  IF v_caller_role = 'AGENT' THEN
    v_filter_user := v_caller_id;
  ELSE
    v_filter_user := p_agent_id;
  END IF;

  -- 1. Agrégats Paris
  SELECT 
    COUNT(*),
    COALESCE(SUM(amount_fcfa), 0),
    COALESCE(SUM(COALESCE(amount_won_fcfa, 0)), 0),
    COUNT(*) FILTER (WHERE lower(status) LIKE '%gagn%' OR status = 'won'),
    COUNT(*) FILTER (WHERE lower(status) LIKE '%perdu%' OR status = 'lost'),
    COUNT(*) FILTER (WHERE validation_status = 'en_attente')
  INTO 
    v_total_bets,
    v_total_bets_amount,
    v_total_known_winnings,
    v_won_bets_count,
    v_lost_bets_count,
    v_pending_validations
  FROM public.bets
  WHERE (v_filter_user IS NULL OR created_by = v_filter_user);

  v_pending_bets_count := v_total_bets - v_won_bets_count - v_lost_bets_count;

  -- 2. Agrégats Transactions
  SELECT 
    COALESCE(SUM(amount_fcfa) FILTER (WHERE type = 'Dépôt'), 0),
    COALESCE(SUM(amount_fcfa) FILTER (WHERE type = 'Retrait'), 0)
  INTO 
    v_total_deposits,
    v_total_withdrawals
  FROM public.transactions
  WHERE (v_filter_user IS NULL OR created_by = v_filter_user);

  -- 3. Comptage Salles
  SELECT COUNT(*) INTO v_total_venues FROM public.venues;

  RETURN jsonb_build_object(
    'total_bets', v_total_bets,
    'total_bets_amount', v_total_bets_amount,
    'total_known_winnings', v_total_known_winnings,
    'won_bets_count', v_won_bets_count,
    'lost_bets_count', v_lost_bets_count,
    'pending_bets_count', v_pending_bets_count,
    'pending_validations_count', v_pending_validations,
    'total_deposits', v_total_deposits,
    'total_withdrawals', v_total_withdrawals,
    'total_venues', v_total_venues
  );
END;
$$;

-- Index pour optimiser les requêtes de comptage et de statut des administrateurs
CREATE INDEX IF NOT EXISTS idx_users_admin_active ON public.users (role, statut) WHERE role = 'ADMIN' AND statut = 'actif';

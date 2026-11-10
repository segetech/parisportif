-- ==============================================================================
-- Migration 08 : Sécurisation Stricte de get_dashboard_aggregates,
-- RLS Renouvellement Obligatoire et Reprise de Mot de Passe
-- ==============================================================================

-- 0. Garantir la présence des colonnes métier sur venues
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS quartier VARCHAR(255),
ADD COLUMN IF NOT EXISTS quartier_no VARCHAR(50);

-- ------------------------------------------------------------------------------
-- 1. Helper RLS : Utilisateur Actif ET Autorisé (Mot de passe renouvelé)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_and_cleared_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() 
      AND statut = 'actif' 
      AND (must_change_password IS FALSE OR must_change_password IS NULL)
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_and_cleared_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_and_cleared_user() TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. Fonction Sécurisée : get_dashboard_aggregates
-- SECURITY DEFINER avec search_path hermétique, vérification stricte de l'identité,
-- du statut actif, de l'absence de restriction de mot de passe et scoping par rôle.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_aggregates(p_agent_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_caller RECORD;
  v_filter_user UUID;
  v_total_bets INT := 0;
  v_total_bets_amount NUMERIC := 0;
  v_total_known_winnings NUMERIC := 0;
  v_won_bets_count INT := 0;
  v_lost_bets_count INT := 0;
  v_pending_bets_count INT := 0;
  v_pending_validations INT := 0;
  v_total_deposits NUMERIC := 0;
  v_total_withdrawals NUMERIC := 0;
  v_total_venues INT := 0;
  v_total_illegal_bets INT := 0;
  v_total_illegal_tx INT := 0;
BEGIN
  -- 1. Vérification d'authentification stricte
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED : L''authentification est obligatoire pour accéder aux agrégats du tableau de bord.';
  END IF;

  -- 2. Chargement du profil appelant
  SELECT id, role, statut, must_change_password 
  INTO v_caller 
  FROM public.users 
  WHERE id = v_caller_id;

  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND : Utilisateur non trouvé dans le référentiel des comptes.';
  END IF;

  -- 3. Contrôle du statut du compte
  IF v_caller.statut IS DISTINCT FROM 'actif' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE : Le compte appelant est inactif, suspendu ou désactivé.';
  END IF;

  -- 4. Contrôle du renouvellement obligatoire du mot de passe
  IF v_caller.must_change_password IS TRUE THEN
    RAISE EXCEPTION 'PASSWORD_RENEWAL_REQUIRED : Renouvellement obligatoire du mot de passe requis avant tout accès aux données.';
  END IF;

  -- 5. Contrôle du rôle opérationnel
  IF v_caller.role NOT IN ('ADMIN', 'CONTROLEUR', 'AGENT') THEN
    RAISE EXCEPTION 'ROLE_UNAUTHORIZED : Rôle opérationnel non reconnu ou non autorisé.';
  END IF;

  -- 6. Définition stricte du périmètre selon le rôle
  IF v_caller.role = 'AGENT' THEN
    -- Un AGENT ne peut en aucun cas consulter les données d'un autre utilisateur
    v_filter_user := v_caller_id;
  ELSE
    -- Un ADMIN ou CONTROLEUR peut optionnellement filtrer par agent
    v_filter_user := p_agent_id;
  END IF;

  -- 7. Agrégats Paris (filtrés par agent si requis)
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

  -- 8. Agrégats Transactions (filtrés par agent si requis)
  SELECT 
    COALESCE(SUM(amount_fcfa) FILTER (WHERE type = 'Dépôt' OR type = 'depot'), 0),
    COALESCE(SUM(amount_fcfa) FILTER (WHERE type = 'Retrait' OR type = 'retrait'), 0),
    COUNT(*) FILTER (WHERE validation_status = 'en_attente')
  INTO 
    v_total_deposits,
    v_total_withdrawals,
    v_pending_validations
  FROM public.transactions
  WHERE (v_filter_user IS NULL OR created_by = v_filter_user);

  -- 9. Salles de jeux (total d'établissements physiques accessibles)
  IF v_caller.role = 'AGENT' THEN
    SELECT COUNT(*) INTO v_total_venues 
    FROM public.venues 
    WHERE created_by = v_caller_id;
  ELSE
    SELECT COUNT(*) INTO v_total_venues 
    FROM public.venues
    WHERE (v_filter_user IS NULL OR created_by = v_filter_user);
  END IF;

  -- 10. Incidents illégaux (visibles par contrôleurs et admins)
  IF v_caller.role IN ('ADMIN', 'CONTROLEUR') THEN
    SELECT COUNT(*) INTO v_total_illegal_bets FROM public.illegal_bets;
    SELECT COUNT(*) INTO v_total_illegal_tx FROM public.illegal_transactions;
  END IF;

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
    'total_venues', v_total_venues,
    'total_illegal_bets', v_total_illegal_bets,
    'total_illegal_transactions', v_total_illegal_tx
  );
END;
$$;

-- Révocation des accès anonymes / publics et attribution restreinte aux utilisateurs authentifiés
REVOKE ALL ON FUNCTION public.get_dashboard_aggregates(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_aggregates(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. Mise à Jour des Politiques RLS : Blocage des tables métier lors du renouvellement
-- ------------------------------------------------------------------------------

-- Remplacement des politiques sur transactions
DROP POLICY IF EXISTS "transactions_select_policy" ON public.transactions;
CREATE POLICY "transactions_select_policy" ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_and_cleared_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS "transactions_insert_policy" ON public.transactions;
CREATE POLICY "transactions_insert_policy" ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_and_cleared_user() AND (
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

DROP POLICY IF EXISTS "transactions_update_policy" ON public.transactions;
CREATE POLICY "transactions_update_policy" ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_and_cleared_user() AND (
      public.is_admin() OR
      (public.is_controleur_or_admin() AND validation_status = 'en_attente') OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  )
  WITH CHECK (
    public.is_active_and_cleared_user() AND (
      public.is_admin() OR
      (public.is_controleur_or_admin() AND validation_status IN ('valide', 'rejete', 'en_attente')) OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  );

-- Remplacement des politiques sur bets
DROP POLICY IF EXISTS "bets_select_policy" ON public.bets;
CREATE POLICY "bets_select_policy" ON public.bets
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_and_cleared_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS "bets_insert_policy" ON public.bets;
CREATE POLICY "bets_insert_policy" ON public.bets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_and_cleared_user() AND (
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

DROP POLICY IF EXISTS "bets_update_policy" ON public.bets;
CREATE POLICY "bets_update_policy" ON public.bets
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_and_cleared_user() AND (
      public.is_admin() OR
      (public.is_controleur_or_admin() AND validation_status = 'en_attente') OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  )
  WITH CHECK (
    public.is_active_and_cleared_user() AND (
      public.is_admin() OR
      (public.is_controleur_or_admin() AND validation_status IN ('valide', 'rejete', 'en_attente')) OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  );

-- Remplacement des politiques sur venues
DROP POLICY IF EXISTS "venues_select_policy" ON public.venues;
CREATE POLICY "venues_select_policy" ON public.venues
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_and_cleared_user()
  );

DROP POLICY IF EXISTS "venues_insert_policy" ON public.venues;
CREATE POLICY "venues_insert_policy" ON public.venues
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_and_cleared_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid())
  );

-- Remplacement des politiques sur illegal_bets et illegal_transactions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_bets') THEN
    DROP POLICY IF EXISTS "illegal_bets_select_policy" ON public.illegal_bets;
    CREATE POLICY "illegal_bets_select_policy" ON public.illegal_bets
      FOR SELECT
      TO authenticated
      USING (
        public.is_active_and_cleared_user() AND public.is_controleur_or_admin()
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_transactions') THEN
    DROP POLICY IF EXISTS "illegal_transactions_select_policy" ON public.illegal_transactions;
    CREATE POLICY "illegal_transactions_select_policy" ON public.illegal_transactions
      FOR SELECT
      TO authenticated
      USING (
        public.is_active_and_cleared_user() AND public.is_controleur_or_admin()
      );
  END IF;
END $$;

-- Remplacement des politiques sur audit_logs
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_select_policy" ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_and_cleared_user() AND public.is_controleur_or_admin()
  );

-- ------------------------------------------------------------------------------
-- 4. Politique RLS Users : Permettre au compte soumis au renouvellement
-- de lire son propre profil minimal, tout en bloquant la liste des tiers
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
CREATE POLICY "users_select_policy" ON public.users
  FOR SELECT
  TO authenticated
  USING (
    -- Un utilisateur actif peut TOUJOURS lire son propre profil (même si must_change_password = true)
    (statut = 'actif' AND id = auth.uid())
    OR
    -- Pour lire les autres utilisateurs, il doit être contrôleur ou admin actif ET avoir renouvelé son mot de passe
    (public.is_active_and_cleared_user() AND public.is_controleur_or_admin())
  );

DROP POLICY IF EXISTS "users_update_policy" ON public.users;
CREATE POLICY "users_update_policy" ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    -- Un utilisateur actif peut mettre à jour son propre profil (nom/prénom)
    (statut = 'actif' AND id = auth.uid())
    OR
    -- Un administrateur actif ET cleared peut mettre à jour les tiers
    (public.is_active_and_cleared_user() AND public.is_admin())
  )
  WITH CHECK (
    (statut = 'actif' AND id = auth.uid())
    OR
    (public.is_active_and_cleared_user() AND public.is_admin())
  );

-- ------------------------------------------------------------------------------
-- 5. Trigger Renforcé de Protection des Attributs de Sécurité
-- Même un ADMIN avec must_change_password = true ne peut PAS lever sa propre restriction
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_user_security_attributes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller RECORD;
BEGIN
  v_caller_role := current_setting('request.jwt.claim.role', true);
  
  -- Si l'appelant est authentifié (non service_role)
  IF v_caller_role = 'authenticated' THEN
    -- Vérifier si des attributs sensibles sont modifiés
    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.statut IS DISTINCT FROM OLD.statut)
       OR (NEW.must_change_password IS DISTINCT FROM OLD.must_change_password)
       OR (NEW.password_changed_at IS DISTINCT FROM OLD.password_changed_at) THEN
      
      -- Récupérer le compte de l'appelant
      SELECT id, role, statut, must_change_password
      INTO v_caller
      FROM public.users
      WHERE id = auth.uid();

      -- Interdiction absolue : un utilisateur ne peut JAMAIS lever son propre must_change_password par SQL direct
      IF NEW.id = auth.uid() AND (NEW.must_change_password IS DISTINCT FROM OLD.must_change_password) THEN
        RAISE EXCEPTION 'SECURITE_ATTRIBUT_PROTEGE : Il est strictement interdit de modifier son propre statut de renouvellement de mot de passe par écriture SQL directe.';
      END IF;

      -- Seul un ADMIN actif ET cleared est autorisé à modifier le rôle ou statut d'un compte tiers
      IF v_caller.id IS NULL 
         OR v_caller.role != 'ADMIN' 
         OR v_caller.statut != 'actif' 
         OR v_caller.must_change_password IS TRUE THEN
        RAISE EXCEPTION 'SECURITE_ATTRIBUT_PROTEGE : Modification directe des attributs de sécurité interdite.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

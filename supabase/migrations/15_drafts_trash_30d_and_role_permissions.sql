-- Migration 15 : Parcours Brouillons (avec envoi unitaire ou groupé), Corbeille 30 jours,
-- et Permissions de rôles configurables par l'Administrateur.

-- ============================================================================
-- 1. PERMISSIONS DE RÔLES CONFIGURABLES PAR L'ADMIN (public.role_permissions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role TEXT PRIMARY KEY CHECK (role IN ('ADMIN', 'CONTROLEUR', 'AGENT')),
  permissions TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

INSERT INTO public.role_permissions (role, permissions)
VALUES
  (
    'ADMIN',
    ARRAY[
      'manage_transactions',
      'manage_bets',
      'manage_venues',
      'validate_records',
      'delete_records',
      'restore_records',
      'export_data',
      'view_audit',
      'manage_users',
      'manage_roles',
      'configure_system'
    ]::TEXT[]
  ),
  (
    'CONTROLEUR',
    ARRAY[
      'validate_records',
      'view_audit',
      'export_data',
      'delete_records',
      'restore_records'
    ]::TEXT[]
  ),
  (
    'AGENT',
    ARRAY[
      'manage_transactions',
      'manage_bets',
      'manage_venues'
    ]::TEXT[]
  )
ON CONFLICT (role) DO NOTHING;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions_select_policy" ON public.role_permissions;
CREATE POLICY "role_permissions_select_policy" ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_active_user());

DROP POLICY IF EXISTS "role_permissions_update_policy" ON public.role_permissions;
CREATE POLICY "role_permissions_update_policy" ON public.role_permissions
  FOR UPDATE
  TO authenticated
  USING (public.is_active_user() AND public.is_admin())
  WITH CHECK (public.is_active_user() AND public.is_admin());

DROP POLICY IF EXISTS "role_permissions_insert_policy" ON public.role_permissions;
CREATE POLICY "role_permissions_insert_policy" ON public.role_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_user() AND public.is_admin());

CREATE OR REPLACE FUNCTION public.role_has_permission(p_role TEXT, p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT := UPPER(COALESCE(p_role, ''));
  v_perms TEXT[];
BEGIN
  IF v_role = 'ADMIN' THEN
    RETURN TRUE;
  END IF;

  SELECT rp.permissions INTO v_perms
  FROM public.role_permissions rp
  WHERE rp.role = v_role;

  IF v_perms IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN p_perm = ANY(v_perms);
END;
$$;

-- ============================================================================
-- 2. STATUT 'brouillon' ET COLONNES CORBEILLE 30 JOURS SUR bets, transactions, venues
-- ============================================================================
DO $$
DECLARE
  v_tbl TEXT;
  v_con RECORD;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['bets', 'transactions', 'venues'] LOOP
    -- Supprimer les anciennes contraintes CHECK sur validation_status si présentes
    FOR v_con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = v_tbl
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%validation_status%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_tbl, v_con.conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (validation_status IN (''brouillon'', ''en_attente'', ''valide'', ''refuse''))',
      v_tbl,
      v_tbl || '_validation_status_check'
    );
  END LOOP;
END $$;

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ NULL;

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_bets_deleted_at ON public.bets (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON public.transactions (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_deleted_at ON public.venues (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bets_purge_after ON public.bets (purge_after) WHERE purge_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_purge_after ON public.transactions (purge_after) WHERE purge_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_purge_after ON public.venues (purge_after) WHERE purge_after IS NOT NULL;

-- ============================================================================
-- 3. RLS UPDATE POLICIES (autoriser AGENT sur ses brouillons, en_attente et refusés)
-- ============================================================================
DROP POLICY IF EXISTS "transactions_update_policy" ON public.transactions;
CREATE POLICY "transactions_update_policy" ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        deleted_at IS NULL AND
        archived_at IS NULL AND
        validation_status IN ('brouillon', 'en_attente', 'refuse')
      )
    )
  )
  WITH CHECK (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        deleted_at IS NULL AND
        archived_at IS NULL AND
        validation_status IN ('brouillon', 'en_attente')
      )
    )
  );

DROP POLICY IF EXISTS "bets_update_policy" ON public.bets;
CREATE POLICY "bets_update_policy" ON public.bets
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        deleted_at IS NULL AND
        archived_at IS NULL AND
        validation_status IN ('brouillon', 'en_attente', 'refuse')
      )
    )
  )
  WITH CHECK (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        deleted_at IS NULL AND
        archived_at IS NULL AND
        validation_status IN ('brouillon', 'en_attente')
      )
    )
  );

DROP POLICY IF EXISTS "venues_update_policy" ON public.venues;
CREATE POLICY "venues_update_policy" ON public.venues
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        deleted_at IS NULL AND
        archived_at IS NULL AND
        validation_status IN ('brouillon', 'en_attente', 'refuse')
      )
    )
  )
  WITH CHECK (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        deleted_at IS NULL AND
        archived_at IS NULL AND
        validation_status IN ('brouillon', 'en_attente')
      )
    )
  );

-- ============================================================================
-- 4. TRIGGER WORKFLOW : protection brouillons, archivage & corbeille
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_validation_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role TEXT;
  v_is_resubmission BOOLEAN := FALSE;
  v_is_draft_submit BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    NEW.edit_unlocked_until := NULL;
    NEW.edit_unlocked_by := NULL;
    NEW.refusal_fields := '{}'::TEXT[];
    NEW.archived_at := NULL;
    NEW.archived_by := NULL;
    NEW.archive_reason := NULL;
    NEW.deleted_at := NULL;
    NEW.deleted_by := NULL;
    NEW.delete_reason := NULL;
    NEW.purge_after := NULL;

    IF v_caller_role = 'AGENT' THEN
      NEW.created_by := auth.uid();
      IF NEW.validation_status IS DISTINCT FROM 'brouillon' THEN
        NEW.validation_status := 'en_attente';
      END IF;
      NEW.validated_by := NULL;
      NEW.validated_at := NULL;
      NEW.validation_notes := NULL;
    ELSIF v_caller_role = 'CONTROLEUR' THEN
      NEW.created_by := auth.uid();
      IF NEW.validation_status IS DISTINCT FROM 'brouillon' THEN
        NEW.validation_status := 'en_attente';
      END IF;
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

  IF TG_OP = 'UPDATE' THEN
    IF v_caller_role = 'AGENT' THEN
      IF OLD.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Interdiction : une opération en corbeille ne peut pas être modifiée directement';
      END IF;

      IF OLD.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Interdiction : une opération archivée ne peut pas être modifiée par un agent';
      END IF;

      IF NEW.archived_at IS DISTINCT FROM OLD.archived_at OR
         NEW.archived_by IS DISTINCT FROM OLD.archived_by OR
         NEW.archive_reason IS DISTINCT FROM OLD.archive_reason THEN
        RAISE EXCEPTION 'Interdiction : un agent ne peut pas archiver ou restaurer une opération';
      END IF;

      IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR
         NEW.deleted_by IS DISTINCT FROM OLD.deleted_by OR
         NEW.delete_reason IS DISTINCT FROM OLD.delete_reason OR
         NEW.purge_after IS DISTINCT FROM OLD.purge_after THEN
        RAISE EXCEPTION 'Interdiction : utilisez la corbeille pour supprimer ou restaurer une opération';
      END IF;

      IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Interdiction : impossible de modifier l''auteur de l''opération';
      END IF;

      IF OLD.validation_status = 'valide' THEN
        RAISE EXCEPTION 'Interdiction : une opération validée ne peut plus être modifiée par un agent';
      END IF;

      v_is_resubmission := (OLD.validation_status = 'refuse' AND NEW.validation_status = 'en_attente');
      v_is_draft_submit := (OLD.validation_status = 'brouillon' AND NEW.validation_status = 'en_attente');

      IF NEW.validation_status IS DISTINCT FROM OLD.validation_status
         AND NOT v_is_resubmission
         AND NOT v_is_draft_submit THEN
        RAISE EXCEPTION 'Interdiction : un agent ne peut pas modifier le statut de validation';
      END IF;

      IF NEW.validated_by IS DISTINCT FROM OLD.validated_by OR
         NEW.validated_at IS DISTINCT FROM OLD.validated_at OR
         NEW.validation_notes IS DISTINCT FROM OLD.validation_notes THEN
        RAISE EXCEPTION 'Interdiction : un agent ne peut pas renseigner ou modifier les métadonnées de validation';
      END IF;

      IF NEW.edit_unlocked_until IS DISTINCT FROM OLD.edit_unlocked_until OR
         NEW.edit_unlocked_by IS DISTINCT FROM OLD.edit_unlocked_by THEN
        RAISE EXCEPTION 'Interdiction : seul un contrôleur ou administrateur peut accorder un délai de modification';
      END IF;

      IF NEW.refusal_fields IS DISTINCT FROM OLD.refusal_fields AND NOT v_is_resubmission THEN
        RAISE EXCEPTION 'Interdiction : un agent ne peut pas modifier les champs signalés au refus';
      END IF;

      IF v_is_resubmission THEN
        NEW.validated_by := NULL;
        NEW.validated_at := NULL;
        NEW.refusal_fields := '{}'::TEXT[];
        NEW.edit_unlocked_until := NULL;
        NEW.edit_unlocked_by := NULL;
      END IF;
    END IF;

    IF NEW.validation_status IS DISTINCT FROM OLD.validation_status THEN
      IF NEW.validation_status IN ('valide', 'refuse') THEN
        IF NEW.validated_by IS NULL THEN
          NEW.validated_by := auth.uid();
        END IF;
        NEW.validated_at := NOW();
        IF NEW.validation_status = 'valide' THEN
          NEW.refusal_fields := '{}'::TEXT[];
          NEW.edit_unlocked_until := NULL;
          NEW.edit_unlocked_by := NULL;
        END IF;
      ELSIF NEW.validation_status = 'en_attente' AND v_caller_role IN ('ADMIN', 'CONTROLEUR') THEN
        NEW.validated_by := NULL;
        NEW.validated_at := NULL;
        NEW.refusal_fields := '{}'::TEXT[];
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. EXCLURE BROUILLONS ET CORBEILLE DE get_dashboard_aggregates
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_aggregates(p_agent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_pending_bets_val INT := 0;
  v_pending_tx_val INT := 0;
  v_total_deposits NUMERIC := 0;
  v_total_withdrawals NUMERIC := 0;
  v_total_venues INT := 0;
  v_total_illegal_bets INT := 0;
  v_total_illegal_tx INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED : L''authentification est obligatoire pour accéder aux agrégats du tableau de bord.';
  END IF;

  SELECT id, role, statut, must_change_password
  INTO v_caller
  FROM public.users
  WHERE id = v_caller_id;

  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND : Utilisateur non trouvé dans le référentiel des comptes.';
  END IF;

  IF v_caller.statut IS DISTINCT FROM 'actif' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE : Le compte appelant est inactif, suspendu ou désactivé.';
  END IF;

  IF v_caller.must_change_password IS TRUE THEN
    RAISE EXCEPTION 'PASSWORD_RENEWAL_REQUIRED : Renouvellement obligatoire du mot de passe requis avant tout accès aux données.';
  END IF;

  IF v_caller.role NOT IN ('ADMIN', 'CONTROLEUR', 'AGENT') THEN
    RAISE EXCEPTION 'ROLE_UNAUTHORIZED : Rôle opérationnel non reconnu ou non autorisé.';
  END IF;

  v_filter_user := p_agent_id;

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
    v_pending_bets_val
  FROM public.bets
  WHERE archived_at IS NULL
    AND deleted_at IS NULL
    AND validation_status <> 'brouillon'
    AND (v_filter_user IS NULL OR created_by = v_filter_user);

  v_pending_bets_count := v_total_bets - v_won_bets_count - v_lost_bets_count;

  SELECT
    COALESCE(SUM(amount_fcfa) FILTER (WHERE type = 'Dépôt' OR type = 'depot'), 0),
    COALESCE(SUM(amount_fcfa) FILTER (WHERE type = 'Retrait' OR type = 'retrait'), 0),
    COUNT(*) FILTER (WHERE validation_status = 'en_attente')
  INTO
    v_total_deposits,
    v_total_withdrawals,
    v_pending_tx_val
  FROM public.transactions
  WHERE archived_at IS NULL
    AND deleted_at IS NULL
    AND validation_status <> 'brouillon'
    AND (v_filter_user IS NULL OR created_by = v_filter_user);

  SELECT COUNT(*) INTO v_total_venues
  FROM public.venues
  WHERE archived_at IS NULL
    AND deleted_at IS NULL
    AND validation_status <> 'brouillon'
    AND (v_filter_user IS NULL OR created_by = v_filter_user);

  SELECT COUNT(*) INTO v_total_illegal_bets FROM public.illegal_bets;
  SELECT COUNT(*) INTO v_total_illegal_tx FROM public.illegal_transactions;

  RETURN jsonb_build_object(
    'total_bets', v_total_bets,
    'total_bets_amount', v_total_bets_amount,
    'total_known_winnings', v_total_known_winnings,
    'won_bets_count', v_won_bets_count,
    'lost_bets_count', v_lost_bets_count,
    'pending_bets_count', v_pending_bets_count,
    'pending_validations_count', v_pending_bets_val + v_pending_tx_val,
    'total_deposits', v_total_deposits,
    'total_withdrawals', v_total_withdrawals,
    'total_venues', v_total_venues,
    'total_illegal_bets', v_total_illegal_bets,
    'total_illegal_transactions', v_total_illegal_tx
  );
END;
$function$;

-- ============================================================================
-- 6. RPCs : ENVOI GROUPÉ DE BROUILLONS, CORBEILLE 30 JOURS, RESTAURATION, PURGE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_draft_operations(
  p_operation_type TEXT,
  p_operation_ids UUID[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_statut TEXT;
  v_norm_type TEXT := LOWER(BTRIM(COALESCE(p_operation_type, '')));
  v_id UUID;
  v_count INT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  SELECT UPPER(u.role), LOWER(u.statut) INTO v_role, v_statut
  FROM public.users u WHERE u.id = v_user_id;

  IF v_role IS NULL OR v_statut <> 'actif' THEN
    RAISE EXCEPTION 'Compte inactif ou introuvable' USING ERRCODE = '42501';
  END IF;

  IF v_norm_type NOT IN ('bets', 'transactions', 'venues') THEN
    RAISE EXCEPTION 'Type d''opération invalide: %', p_operation_type USING ERRCODE = '22023';
  END IF;

  IF p_operation_ids IS NULL OR array_length(p_operation_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH v_id IN ARRAY p_operation_ids LOOP
    IF v_norm_type = 'bets' THEN
      UPDATE public.bets
      SET validation_status = 'en_attente', updated_at = NOW()
      WHERE id = v_id
        AND validation_status = 'brouillon'
        AND deleted_at IS NULL
        AND archived_at IS NULL
        AND (v_role IN ('ADMIN', 'CONTROLEUR') OR created_by = v_user_id);
    ELSIF v_norm_type = 'transactions' THEN
      UPDATE public.transactions
      SET validation_status = 'en_attente', updated_at = NOW()
      WHERE id = v_id
        AND validation_status = 'brouillon'
        AND deleted_at IS NULL
        AND archived_at IS NULL
        AND (v_role IN ('ADMIN', 'CONTROLEUR') OR created_by = v_user_id);
    ELSE
      UPDATE public.venues
      SET validation_status = 'en_attente', updated_at = NOW()
      WHERE id = v_id
        AND validation_status = 'brouillon'
        AND deleted_at IS NULL
        AND archived_at IS NULL
        AND (v_role IN ('ADMIN', 'CONTROLEUR') OR created_by = v_user_id);
    END IF;

    IF FOUND THEN
      v_count := v_count + 1;
      INSERT INTO public.operation_history (
        operation_type, operation_id, action, previous_status, new_status, modified_by, changes, comment
      ) VALUES (
        v_norm_type, v_id, 'modified', 'brouillon', 'en_attente', v_user_id,
        jsonb_build_object('source', 'draft_submit'),
        'Brouillon soumis pour validation'
      );
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.trash_operation(
  p_operation_type TEXT,
  p_operation_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  operation_type TEXT,
  operation_id UUID,
  deleted_at TIMESTAMPTZ,
  purge_after TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_statut TEXT;
  v_norm_type TEXT := LOWER(BTRIM(COALESCE(p_operation_type, '')));
  v_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  v_now TIMESTAMPTZ := NOW();
  v_purge TIMESTAMPTZ := v_now + INTERVAL '30 days';
  v_prev_status TEXT;
  v_created_by UUID;
  v_already_deleted TIMESTAMPTZ;
  v_already_purge TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  SELECT UPPER(u.role), LOWER(u.statut) INTO v_role, v_statut
  FROM public.users u WHERE u.id = v_user_id;

  IF v_role IS NULL OR v_statut <> 'actif' THEN
    RAISE EXCEPTION 'Compte inactif ou introuvable' USING ERRCODE = '42501';
  END IF;

  IF v_norm_type NOT IN ('bets', 'transactions', 'venues') THEN
    RAISE EXCEPTION 'Type d''opération invalide: %', p_operation_type USING ERRCODE = '22023';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant d''opération requis' USING ERRCODE = '22023';
  END IF;

  IF v_norm_type = 'bets' THEN
    SELECT b.validation_status, b.created_by, b.deleted_at, b.purge_after
      INTO v_prev_status, v_created_by, v_already_deleted, v_already_purge
    FROM public.bets AS b WHERE b.id = p_operation_id FOR UPDATE;
  ELSIF v_norm_type = 'transactions' THEN
    SELECT t.validation_status, t.created_by, t.deleted_at, t.purge_after
      INTO v_prev_status, v_created_by, v_already_deleted, v_already_purge
    FROM public.transactions AS t WHERE t.id = p_operation_id FOR UPDATE;
  ELSE
    SELECT v.validation_status, v.created_by, v.deleted_at, v.purge_after
      INTO v_prev_status, v_created_by, v_already_deleted, v_already_purge
    FROM public.venues AS v WHERE v.id = p_operation_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
  END IF;

  IF v_role = 'AGENT' THEN
    IF v_created_by IS DISTINCT FROM v_user_id OR v_prev_status IS DISTINCT FROM 'brouillon' THEN
      RAISE EXCEPTION 'Accès refusé : un agent ne peut supprimer que ses propres brouillons non soumis' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'CONTROLEUR' THEN
    IF NOT public.role_has_permission('CONTROLEUR', 'delete_records') THEN
      RAISE EXCEPTION 'Accès refusé : permission de mise en corbeille non accordée au rôle Contrôleur' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;

  IF v_already_deleted IS NOT NULL THEN
    RETURN QUERY SELECT v_norm_type, p_operation_id, v_already_deleted, v_already_purge;
    RETURN;
  END IF;

  IF v_norm_type = 'bets' THEN
    UPDATE public.bets
    SET deleted_at = v_now, deleted_by = v_user_id, delete_reason = COALESCE(v_reason, 'Mise en corbeille'), purge_after = v_purge
    WHERE id = p_operation_id;
  ELSIF v_norm_type = 'transactions' THEN
    UPDATE public.transactions
    SET deleted_at = v_now, deleted_by = v_user_id, delete_reason = COALESCE(v_reason, 'Mise en corbeille'), purge_after = v_purge
    WHERE id = p_operation_id;
  ELSE
    UPDATE public.venues
    SET deleted_at = v_now, deleted_by = v_user_id, delete_reason = COALESCE(v_reason, 'Mise en corbeille'), purge_after = v_purge
    WHERE id = p_operation_id;
  END IF;

  INSERT INTO public.operation_history (
    operation_type, operation_id, action, previous_status, new_status, modified_by, changes, comment
  ) VALUES (
    v_norm_type, p_operation_id, 'modified', v_prev_status, v_prev_status, v_user_id,
    jsonb_build_object('source', 'trash', 'deleted_at', v_now, 'purge_after', v_purge),
    COALESCE('Mise en corbeille (30 jours) : ' || v_reason, 'Mise en corbeille (suppression auto dans 30 jours)')
  );

  RETURN QUERY SELECT v_norm_type, p_operation_id, v_now, v_purge;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_from_trash(
  p_operation_type TEXT,
  p_operation_id UUID
)
RETURNS TABLE (
  operation_type TEXT,
  operation_id UUID,
  restored BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_statut TEXT;
  v_norm_type TEXT := LOWER(BTRIM(COALESCE(p_operation_type, '')));
  v_prev_status TEXT;
  v_created_by UUID;
  v_deleted_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  SELECT UPPER(u.role), LOWER(u.statut) INTO v_role, v_statut
  FROM public.users u WHERE u.id = v_user_id;

  IF v_role IS NULL OR v_statut <> 'actif' THEN
    RAISE EXCEPTION 'Compte inactif ou introuvable' USING ERRCODE = '42501';
  END IF;

  IF v_norm_type NOT IN ('bets', 'transactions', 'venues') THEN
    RAISE EXCEPTION 'Type d''opération invalide: %', p_operation_type USING ERRCODE = '22023';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant d''opération requis' USING ERRCODE = '22023';
  END IF;

  IF v_norm_type = 'bets' THEN
    SELECT b.validation_status, b.created_by, b.deleted_at
      INTO v_prev_status, v_created_by, v_deleted_at
    FROM public.bets AS b WHERE b.id = p_operation_id FOR UPDATE;
  ELSIF v_norm_type = 'transactions' THEN
    SELECT t.validation_status, t.created_by, t.deleted_at
      INTO v_prev_status, v_created_by, v_deleted_at
    FROM public.transactions AS t WHERE t.id = p_operation_id FOR UPDATE;
  ELSE
    SELECT v.validation_status, v.created_by, v.deleted_at
      INTO v_prev_status, v_created_by, v_deleted_at
    FROM public.venues AS v WHERE v.id = p_operation_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
  END IF;

  IF v_role = 'AGENT' THEN
    IF v_created_by IS DISTINCT FROM v_user_id OR v_prev_status IS DISTINCT FROM 'brouillon' THEN
      RAISE EXCEPTION 'Accès refusé : un agent ne peut restaurer que ses propres brouillons' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'CONTROLEUR' THEN
    IF NOT public.role_has_permission('CONTROLEUR', 'restore_records') THEN
      RAISE EXCEPTION 'Accès refusé : permission de restauration non accordée au rôle Contrôleur' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;

  IF v_norm_type = 'bets' THEN
    UPDATE public.bets
    SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, purge_after = NULL
    WHERE id = p_operation_id;
  ELSIF v_norm_type = 'transactions' THEN
    UPDATE public.transactions
    SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, purge_after = NULL
    WHERE id = p_operation_id;
  ELSE
    UPDATE public.venues
    SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, purge_after = NULL
    WHERE id = p_operation_id;
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    INSERT INTO public.operation_history (
      operation_type, operation_id, action, previous_status, new_status, modified_by, changes, comment
    ) VALUES (
      v_norm_type, p_operation_id, 'modified', v_prev_status, v_prev_status, v_user_id,
      jsonb_build_object('source', 'restore_trash', 'restored_at', NOW()),
      'Opération restaurée depuis la corbeille'
    );
  END IF;

  RETURN QUERY SELECT v_norm_type, p_operation_id, (v_deleted_at IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_trash()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_statut TEXT;
  v_count INT := 0;
  v_rec RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT LOWER(u.statut) INTO v_statut FROM public.users u WHERE u.id = v_user_id;
  IF v_statut <> 'actif' THEN
    RETURN 0;
  END IF;

  FOR v_rec IN
    SELECT id, validation_status,
           format('Test %s (%s FCFA)', COALESCE(operator, '—'), COALESCE(amount_fcfa::TEXT, '0')) AS summary
    FROM public.bets
    WHERE deleted_at IS NOT NULL AND purge_after IS NOT NULL AND purge_after <= NOW()
  LOOP
    DELETE FROM public.bets WHERE id = v_rec.id;
    INSERT INTO public.operation_history (operation_type, operation_id, action, previous_status, new_status, modified_by, changes, comment)
    VALUES ('bets', v_rec.id, 'modified', v_rec.validation_status, 'deleted', v_user_id,
            jsonb_build_object('source', 'auto_purge_30d', 'summary', v_rec.summary),
            'Purge automatique après 30 jours en corbeille : ' || v_rec.summary);
    v_count := v_count + 1;
  END LOOP;

  FOR v_rec IN
    SELECT id, validation_status,
           format('%s %s (%s FCFA)', COALESCE(type, 'Transaction'), COALESCE(operator, '—'), COALESCE(amount_fcfa::TEXT, '0')) AS summary
    FROM public.transactions
    WHERE deleted_at IS NOT NULL AND purge_after IS NOT NULL AND purge_after <= NOW()
  LOOP
    DELETE FROM public.transactions WHERE id = v_rec.id;
    INSERT INTO public.operation_history (operation_type, operation_id, action, previous_status, new_status, modified_by, changes, comment)
    VALUES ('transactions', v_rec.id, 'modified', v_rec.validation_status, 'deleted', v_user_id,
            jsonb_build_object('source', 'auto_purge_30d', 'summary', v_rec.summary),
            'Purge automatique après 30 jours en corbeille : ' || v_rec.summary);
    v_count := v_count + 1;
  END LOOP;

  FOR v_rec IN
    SELECT id, validation_status,
           format('Site %s — %s', COALESCE(operator, '—'), COALESCE(quartier, '—')) AS summary
    FROM public.venues
    WHERE deleted_at IS NOT NULL AND purge_after IS NOT NULL AND purge_after <= NOW()
  LOOP
    DELETE FROM public.venues WHERE id = v_rec.id;
    INSERT INTO public.operation_history (operation_type, operation_id, action, previous_status, new_status, modified_by, changes, comment)
    VALUES ('venues', v_rec.id, 'modified', v_rec.validation_status, 'deleted', v_user_id,
            jsonb_build_object('source', 'auto_purge_30d', 'summary', v_rec.summary),
            'Purge automatique après 30 jours en corbeille : ' || v_rec.summary);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.role_has_permission(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.role_has_permission(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_draft_operations(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_draft_operations(TEXT, UUID[]) TO authenticated;

REVOKE ALL ON FUNCTION public.trash_operation(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trash_operation(TEXT, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.restore_from_trash(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_from_trash(TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.purge_expired_trash() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_trash() TO authenticated;

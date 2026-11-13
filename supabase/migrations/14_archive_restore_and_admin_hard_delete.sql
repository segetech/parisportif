-- ============================================================================
-- 14_archive_restore_and_admin_hard_delete.sql
-- Archivage réversible avec trace d'audit (Admin + Contrôleur)
-- Restauration (Admin + Contrôleur)
-- Suppression définitive réservée uniquement à l'Admin (avec trace d'audit)
-- ============================================================================

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT NULL;

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_bets_archived_at
  ON public.bets (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_archived_at
  ON public.transactions (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venues_archived_at
  ON public.venues (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_validation_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_is_service_role BOOLEAN;
  v_is_resubmission BOOLEAN := FALSE;
BEGIN
  v_is_service_role := (auth.role() = 'service_role' OR auth.uid() IS NULL);
  IF v_is_service_role THEN
    RETURN NEW;
  END IF;

  v_caller_role := public.get_auth_role();

  IF TG_OP = 'INSERT' THEN
    NEW.edit_unlocked_until := NULL;
    NEW.edit_unlocked_by := NULL;
    NEW.refusal_fields := '{}'::TEXT[];
    NEW.archived_at := NULL;
    NEW.archived_by := NULL;
    NEW.archive_reason := NULL;

    IF v_caller_role = 'AGENT' THEN
      NEW.created_by := auth.uid();
      NEW.validation_status := 'en_attente';
      NEW.validated_by := NULL;
      NEW.validated_at := NULL;
      NEW.validation_notes := NULL;
    ELSIF v_caller_role = 'CONTROLEUR' THEN
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

  IF TG_OP = 'UPDATE' THEN
    IF v_caller_role = 'AGENT' THEN
      IF OLD.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Interdiction : une opération archivée ne peut pas être modifiée par un agent';
      END IF;

      IF NEW.archived_at IS DISTINCT FROM OLD.archived_at OR
         NEW.archived_by IS DISTINCT FROM OLD.archived_by OR
         NEW.archive_reason IS DISTINCT FROM OLD.archive_reason THEN
        RAISE EXCEPTION 'Interdiction : un agent ne peut pas archiver ou restaurer une opération';
      END IF;

      IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Interdiction : impossible de modifier l''auteur de l''opération';
      END IF;

      IF OLD.validation_status = 'valide' THEN
        RAISE EXCEPTION 'Interdiction : une opération validée ne peut plus être modifiée par un agent';
      END IF;

      v_is_resubmission := (OLD.validation_status = 'refuse' AND NEW.validation_status = 'en_attente');

      IF NEW.validation_status IS DISTINCT FROM OLD.validation_status AND NOT v_is_resubmission THEN
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

CREATE OR REPLACE FUNCTION public.archive_operation(
  p_operation_type TEXT,
  p_operation_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  operation_type TEXT,
  operation_id UUID,
  archived_at TIMESTAMPTZ
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
  v_prev_status TEXT;
  v_already_archived TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  SELECT UPPER(u.role), LOWER(u.statut)
    INTO v_role, v_statut
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_role IS NULL OR v_statut <> 'actif' OR v_role NOT IN ('ADMIN', 'CONTROLEUR') THEN
    RAISE EXCEPTION 'Accès refusé : rôle administrateur ou contrôleur requis' USING ERRCODE = '42501';
  END IF;

  IF v_norm_type NOT IN ('bets', 'transactions', 'venues') THEN
    RAISE EXCEPTION 'Type d''opération invalide: %', p_operation_type USING ERRCODE = '22023';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant d''opération requis' USING ERRCODE = '22023';
  END IF;

  IF v_norm_type = 'bets' THEN
    SELECT validation_status, archived_at INTO v_prev_status, v_already_archived
    FROM public.bets WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
    END IF;
    IF v_already_archived IS NOT NULL THEN
      RETURN QUERY SELECT v_norm_type, p_operation_id, v_already_archived;
      RETURN;
    END IF;
    UPDATE public.bets
    SET archived_at = v_now,
        archived_by = v_user_id,
        archive_reason = COALESCE(v_reason, 'Archivée')
    WHERE id = p_operation_id;
  ELSIF v_norm_type = 'transactions' THEN
    SELECT validation_status, archived_at INTO v_prev_status, v_already_archived
    FROM public.transactions WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
    END IF;
    IF v_already_archived IS NOT NULL THEN
      RETURN QUERY SELECT v_norm_type, p_operation_id, v_already_archived;
      RETURN;
    END IF;
    UPDATE public.transactions
    SET archived_at = v_now,
        archived_by = v_user_id,
        archive_reason = COALESCE(v_reason, 'Archivée')
    WHERE id = p_operation_id;
  ELSE
    SELECT validation_status, archived_at INTO v_prev_status, v_already_archived
    FROM public.venues WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
    END IF;
    IF v_already_archived IS NOT NULL THEN
      RETURN QUERY SELECT v_norm_type, p_operation_id, v_already_archived;
      RETURN;
    END IF;
    UPDATE public.venues
    SET archived_at = v_now,
        archived_by = v_user_id,
        archive_reason = COALESCE(v_reason, 'Archivée')
    WHERE id = p_operation_id;
  END IF;

  INSERT INTO public.operation_history (
    operation_type,
    operation_id,
    action,
    previous_status,
    new_status,
    modified_by,
    changes,
    comment
  ) VALUES (
    v_norm_type,
    p_operation_id,
    'modified',
    v_prev_status,
    v_prev_status,
    v_user_id,
    jsonb_build_object('source', 'archive', 'archived_at', v_now),
    COALESCE('Opération archivée : ' || v_reason, 'Opération archivée (réversible)')
  );

  RETURN QUERY SELECT v_norm_type, p_operation_id, v_now;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_operation(
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
  v_archived_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  SELECT UPPER(u.role), LOWER(u.statut)
    INTO v_role, v_statut
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_role IS NULL OR v_statut <> 'actif' OR v_role NOT IN ('ADMIN', 'CONTROLEUR') THEN
    RAISE EXCEPTION 'Accès refusé : rôle administrateur ou contrôleur requis' USING ERRCODE = '42501';
  END IF;

  IF v_norm_type NOT IN ('bets', 'transactions', 'venues') THEN
    RAISE EXCEPTION 'Type d''opération invalide: %', p_operation_type USING ERRCODE = '22023';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant d''opération requis' USING ERRCODE = '22023';
  END IF;

  IF v_norm_type = 'bets' THEN
    SELECT validation_status, archived_at INTO v_prev_status, v_archived_at
    FROM public.bets WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
    END IF;
    UPDATE public.bets
    SET archived_at = NULL, archived_by = NULL, archive_reason = NULL
    WHERE id = p_operation_id;
  ELSIF v_norm_type = 'transactions' THEN
    SELECT validation_status, archived_at INTO v_prev_status, v_archived_at
    FROM public.transactions WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
    END IF;
    UPDATE public.transactions
    SET archived_at = NULL, archived_by = NULL, archive_reason = NULL
    WHERE id = p_operation_id;
  ELSE
    SELECT validation_status, archived_at INTO v_prev_status, v_archived_at
    FROM public.venues WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
    END IF;
    UPDATE public.venues
    SET archived_at = NULL, archived_by = NULL, archive_reason = NULL
    WHERE id = p_operation_id;
  END IF;

  IF v_archived_at IS NOT NULL THEN
    INSERT INTO public.operation_history (
      operation_type,
      operation_id,
      action,
      previous_status,
      new_status,
      modified_by,
      changes,
      comment
    ) VALUES (
      v_norm_type,
      p_operation_id,
      'modified',
      v_prev_status,
      v_prev_status,
      v_user_id,
      jsonb_build_object('source', 'restore', 'restored_at', NOW()),
      'Opération restaurée depuis les archives'
    );
  END IF;

  RETURN QUERY SELECT v_norm_type, p_operation_id, (v_archived_at IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.hard_delete_operation(
  p_operation_type TEXT,
  p_operation_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
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
  v_summary TEXT;
  v_prev_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  SELECT UPPER(u.role), LOWER(u.statut)
    INTO v_role, v_statut
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_role IS NULL OR v_statut <> 'actif' OR v_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Accès refusé : seul un administrateur actif peut supprimer définitivement' USING ERRCODE = '42501';
  END IF;

  IF v_norm_type NOT IN ('bets', 'transactions', 'venues') THEN
    RAISE EXCEPTION 'Type d''opération invalide: %', p_operation_type USING ERRCODE = '22023';
  END IF;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant d''opération requis' USING ERRCODE = '22023';
  END IF;

  IF v_norm_type = 'bets' THEN
    SELECT validation_status,
           format('Test %s (%s FCFA, %s)', COALESCE(operator, '—'), COALESCE(amount_fcfa::TEXT, '0'), COALESCE(date::TEXT, '—'))
      INTO v_prev_status, v_summary
    FROM public.bets WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
    END IF;
    DELETE FROM public.bets WHERE id = p_operation_id;
  ELSIF v_norm_type = 'transactions' THEN
    SELECT validation_status,
           format('%s %s (%s FCFA, %s)', COALESCE(type, 'Transaction'), COALESCE(operator, '—'), COALESCE(amount_fcfa::TEXT, '0'), COALESCE(date::TEXT, '—'))
      INTO v_prev_status, v_summary
    FROM public.transactions WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
    END IF;
    DELETE FROM public.transactions WHERE id = p_operation_id;
  ELSE
    SELECT validation_status,
           format('Site %s — %s', COALESCE(operator, '—'), COALESCE(quartier, '—'))
      INTO v_prev_status, v_summary
    FROM public.venues WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
    END IF;
    DELETE FROM public.venues WHERE id = p_operation_id;
  END IF;

  INSERT INTO public.operation_history (
    operation_type,
    operation_id,
    action,
    previous_status,
    new_status,
    modified_by,
    changes,
    comment
  ) VALUES (
    v_norm_type,
    p_operation_id,
    'modified',
    v_prev_status,
    'deleted',
    v_user_id,
    jsonb_build_object('source', 'hard_delete', 'summary', v_summary, 'deleted_at', NOW()),
    COALESCE('Suppression définitive : ' || v_summary || ' (' || v_reason || ')', 'Suppression définitive : ' || v_summary)
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_operation(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_operation(TEXT, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.restore_operation(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_operation(TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.hard_delete_operation(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_delete_operation(TEXT, UUID, TEXT) TO authenticated;

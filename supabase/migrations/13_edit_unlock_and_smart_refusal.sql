-- ============================================================================
-- 13_edit_unlock_and_smart_refusal.sql
-- Prolongation ciblée du délai de modification (Admin / Contrôleur)
-- et refus structuré avec resoumission contrôlée par l'agent
-- ============================================================================

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS edit_unlocked_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS edit_unlocked_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refusal_fields TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS edit_unlocked_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS edit_unlocked_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refusal_fields TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS edit_unlocked_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS edit_unlocked_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refusal_fields TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

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

CREATE OR REPLACE FUNCTION public.grant_operation_edit_window(
  p_operation_type TEXT,
  p_operation_id UUID,
  p_extra_minutes INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  operation_type TEXT,
  operation_id UUID,
  edit_unlocked_until TIMESTAMPTZ
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
  v_unlocked_until TIMESTAMPTZ;
  v_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  v_prev_status TEXT;
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

  IF p_extra_minutes IS NULL OR p_extra_minutes < 5 OR p_extra_minutes > 1440 THEN
    RAISE EXCEPTION 'Durée autorisée entre 5 et 1440 minutes' USING ERRCODE = '22023';
  END IF;

  v_unlocked_until := NOW() + make_interval(mins => p_extra_minutes);

  IF v_norm_type = 'bets' THEN
    UPDATE public.bets
    SET edit_unlocked_until = v_unlocked_until,
        edit_unlocked_by = v_user_id
    WHERE id = p_operation_id
    RETURNING validation_status INTO v_prev_status;
  ELSIF v_norm_type = 'transactions' THEN
    UPDATE public.transactions
    SET edit_unlocked_until = v_unlocked_until,
        edit_unlocked_by = v_user_id
    WHERE id = p_operation_id
    RETURNING validation_status INTO v_prev_status;
  ELSE
    UPDATE public.venues
    SET edit_unlocked_until = v_unlocked_until,
        edit_unlocked_by = v_user_id
    WHERE id = p_operation_id
    RETURNING validation_status INTO v_prev_status;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opération introuvable' USING ERRCODE = '23503';
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
    jsonb_build_object(
      'source', 'edit_unlock',
      'extra_minutes', p_extra_minutes,
      'edit_unlocked_until', v_unlocked_until
    ),
    COALESCE(v_reason, format('Délai de modification accordé (+%s min)', p_extra_minutes))
  );

  RETURN QUERY SELECT v_norm_type, p_operation_id, v_unlocked_until;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_operation_edit_window(TEXT, UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_operation_edit_window(TEXT, UUID, INTEGER, TEXT) TO authenticated;

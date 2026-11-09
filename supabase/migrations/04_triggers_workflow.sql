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

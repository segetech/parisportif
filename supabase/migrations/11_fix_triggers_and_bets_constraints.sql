-- ==============================================================================
-- Migration 11 : Suppression de l'unicité bloquante sur bets.reference,
-- extension de bets_status_check ('annulé'), et sécurisation des triggers SQL
-- ==============================================================================

-- 1. Supprimer la contrainte d'unicité héritée sur public.bets(reference)
ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_reference_key;
DROP INDEX IF EXISTS public.bets_reference_key;
CREATE INDEX IF NOT EXISTS idx_bets_reference ON public.bets(reference);

-- 2. Mettre à jour la contrainte bets_status_check pour accepter 'annulé'
ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_status_check;
ALTER TABLE public.bets
  ADD CONSTRAINT bets_status_check
  CHECK (
    (status)::text = ANY (
      ARRAY[
        'gagné'::text,
        'perdu'::text,
        'en attente'::text,
        'annulé'::text,
        'Gagné'::text,
        'Perdu'::text,
        'En attente'::text,
        'Annulé'::text
      ]
    )
  );

-- 3. Fonctions utilitaires de notification & historique en SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type character varying,
  p_title character varying,
  p_message text,
  p_operation_type character varying DEFAULT NULL::character varying,
  p_operation_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (
    user_id, type, title, message, operation_type, operation_id
  )
  VALUES (
    p_user_id, p_type, p_title, p_message, p_operation_type, p_operation_id
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_operation_history(
  p_operation_type character varying,
  p_operation_id uuid,
  p_action character varying,
  p_previous_status character varying,
  p_new_status character varying,
  p_modified_by uuid,
  p_changes jsonb DEFAULT NULL::jsonb,
  p_comment text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_history_id UUID;
BEGIN
  INSERT INTO public.operation_history (
    operation_type, operation_id, action,
    previous_status, new_status, modified_by,
    changes, comment
  )
  VALUES (
    p_operation_type, p_operation_id, p_action,
    p_previous_status, p_new_status, p_modified_by,
    p_changes, p_comment
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$function$;

-- 4. Triggers de notification avec SECURITY DEFINER et casts explicites (TG_TABLE_NAME::varchar)
CREATE OR REPLACE FUNCTION public.notify_controllers_new_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_controller RECORD;
  v_operation_name TEXT;
BEGIN
  v_operation_name := CASE TG_TABLE_NAME::text
    WHEN 'bets' THEN 'Nouveau test'
    WHEN 'transactions' THEN 'Nouvelle transaction'
    WHEN 'venues' THEN 'Nouvelle salle'
    ELSE 'Nouvelle opération'
  END;

  FOR v_controller IN
    SELECT id FROM public.users
    WHERE role IN ('CONTROLEUR', 'ADMIN') AND statut = 'actif'
  LOOP
    PERFORM public.create_notification(
      v_controller.id,
      'new_operation'::varchar,
      (v_operation_name || ' en attente')::varchar,
      'Une nouvelle opération nécessite votre validation'::text,
      TG_TABLE_NAME::varchar,
      NEW.id
    );
  END LOOP;

  PERFORM public.log_operation_history(
    TG_TABLE_NAME::varchar,
    NEW.id,
    'created'::varchar,
    NULL::varchar,
    NEW.validation_status::varchar,
    NEW.created_by,
    NULL::jsonb,
    'Opération créée'::text
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_agent_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_operation_name TEXT;
  v_status_text TEXT;
  v_notif_type TEXT;
  v_history_action TEXT;
BEGIN
  v_operation_name := CASE TG_TABLE_NAME::text
    WHEN 'bets' THEN 'Test'
    WHEN 'transactions' THEN 'Transaction'
    WHEN 'venues' THEN 'Salle'
    ELSE 'Opération'
  END;

  v_status_text := CASE NEW.validation_status
    WHEN 'valide' THEN 'validée'
    WHEN 'refuse' THEN 'refusée'
    ELSE 'modifiée'
  END;

  v_notif_type := CASE NEW.validation_status
    WHEN 'valide' THEN 'validated'
    WHEN 'refuse' THEN 'rejected'
    ELSE 'modified'
  END;

  v_history_action := v_notif_type;

  IF OLD.validation_status IS DISTINCT FROM NEW.validation_status AND NEW.created_by IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.created_by,
      v_notif_type::varchar,
      (v_operation_name || ' ' || v_status_text)::varchar,
      ('Votre opération a été ' || v_status_text || ' par un contrôleur')::text,
      TG_TABLE_NAME::varchar,
      NEW.id
    );

    PERFORM public.log_operation_history(
      TG_TABLE_NAME::varchar,
      NEW.id,
      v_history_action::varchar,
      OLD.validation_status::varchar,
      NEW.validation_status::varchar,
      NEW.validated_by,
      jsonb_build_object('validation_notes', NEW.validation_notes),
      NEW.validation_notes::text
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. Protection dédiée pour illegal_bets et illegal_transactions (sans validation_status)
CREATE OR REPLACE FUNCTION public.protect_illegal_operations_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller_role TEXT;
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_role := public.get_auth_role();

  IF TG_OP = 'INSERT' THEN
    IF v_caller_role IS DISTINCT FROM 'ADMIN' OR NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF v_caller_role IS DISTINCT FROM 'ADMIN' AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Interdiction : impossible de modifier l''auteur de l''opération';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_validation_illegal_bets ON public.illegal_bets;
CREATE TRIGGER trg_protect_validation_illegal_bets
  BEFORE INSERT OR UPDATE ON public.illegal_bets
  FOR EACH ROW EXECUTE FUNCTION public.protect_illegal_operations_workflow();

DROP TRIGGER IF EXISTS trg_protect_validation_illegal_transactions ON public.illegal_transactions;
CREATE TRIGGER trg_protect_validation_illegal_transactions
  BEFORE INSERT OR UPDATE ON public.illegal_transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_illegal_operations_workflow();

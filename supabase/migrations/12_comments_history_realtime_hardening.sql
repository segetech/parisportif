-- ==============================================================================
-- Migration 12 : Durcissement complet des commentaires, de l'historique
-- autoritaire et du temps réel (RLS, idempotence, triggers, Realtime)
-- ==============================================================================

-- 1. S'assurer que les tables existent (pour bases neuves et environnements isolés)
CREATE TABLE IF NOT EXISTS public.operation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type VARCHAR(20) NOT NULL,
  operation_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  modified_by UUID REFERENCES public.users(id),
  modified_at TIMESTAMP DEFAULT NOW(),
  changes JSONB,
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.operation_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type VARCHAR(20) NOT NULL,
  operation_id UUID NOT NULL,
  user_id UUID REFERENCES public.users(id),
  comment TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  operation_type VARCHAR(20),
  operation_id UUID,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP
);

-- 2. Colonne d'idempotence et normalisation sur operation_comments
ALTER TABLE public.operation_comments
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

UPDATE public.operation_comments
SET is_internal = FALSE
WHERE is_internal IS NULL;

ALTER TABLE public.operation_comments
  ALTER COLUMN is_internal SET DEFAULT FALSE,
  ALTER COLUMN is_internal SET NOT NULL;

-- 3. Contraintes d'intégrité sur operation_comments et operation_history
ALTER TABLE public.operation_comments
  DROP CONSTRAINT IF EXISTS chk_operation_comments_type,
  ADD CONSTRAINT chk_operation_comments_type
    CHECK (operation_type IN ('bets', 'transactions', 'venues'));

ALTER TABLE public.operation_comments
  DROP CONSTRAINT IF EXISTS chk_operation_comments_length,
  ADD CONSTRAINT chk_operation_comments_length
    CHECK (length(btrim(comment)) BETWEEN 1 AND 2000);

ALTER TABLE public.operation_history
  DROP CONSTRAINT IF EXISTS chk_operation_history_type,
  ADD CONSTRAINT chk_operation_history_type
    CHECK (operation_type IN ('bets', 'transactions', 'venues'));

ALTER TABLE public.operation_history
  DROP CONSTRAINT IF EXISTS chk_operation_history_action,
  ADD CONSTRAINT chk_operation_history_action
    CHECK (length(btrim(action)) >= 1);

-- 4. Index dédiés aux requêtes déterministes et à l'idempotence
CREATE INDEX IF NOT EXISTS idx_operation_comments_op_created_id
  ON public.operation_comments(operation_type, operation_id, created_at ASC, id ASC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_operation_comments_client_req
  ON public.operation_comments(client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operation_history_op_created_id
  ON public.operation_history(operation_type, operation_id, created_at DESC, id DESC);

-- 5. Fonction helper : existence et accès à l'opération cible
CREATE OR REPLACE FUNCTION public.can_access_operation(
  p_operation_type TEXT,
  p_operation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_operation_id IS NULL OR p_operation_type IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT public.is_active_and_cleared_user() THEN
    RETURN FALSE;
  END IF;

  IF p_operation_type = 'bets' THEN
    RETURN EXISTS (SELECT 1 FROM public.bets WHERE id = p_operation_id);
  ELSIF p_operation_type = 'transactions' THEN
    RETURN EXISTS (SELECT 1 FROM public.transactions WHERE id = p_operation_id);
  ELSIF p_operation_type = 'venues' THEN
    RETURN EXISTS (SELECT 1 FROM public.venues WHERE id = p_operation_id);
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_operation(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_operation(TEXT, UUID) TO authenticated;

-- 6. Trigger d'intégrité sur operation_comments (défense en profondeur sur INSERT direct)
CREATE OR REPLACE FUNCTION public.enforce_operation_comment_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_service BOOLEAN;
  v_trimmed TEXT;
BEGIN
  v_is_service := (auth.role() = 'service_role' OR auth.uid() IS NULL);

  IF NEW.operation_type NOT IN ('bets', 'transactions', 'venues') THEN
    RAISE EXCEPTION 'INVALID_OPERATION_TYPE : Type d''opération non autorisé.'
      USING ERRCODE = '23514';
  END IF;

  v_trimmed := btrim(COALESCE(NEW.comment, ''));
  IF length(v_trimmed) < 1 OR length(v_trimmed) > 2000 THEN
    RAISE EXCEPTION 'INVALID_COMMENT_LENGTH : Le commentaire doit contenir entre 1 et 2000 caractères.'
      USING ERRCODE = '23514';
  END IF;
  NEW.comment := v_trimmed;
  NEW.is_internal := COALESCE(NEW.is_internal, FALSE);

  IF NOT v_is_service THEN
    IF NOT public.is_active_and_cleared_user() THEN
      RAISE EXCEPTION 'USER_NOT_CLEARED : Compte inactif, suspendu ou mot de passe à renouveler.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'USER_ID_SPOOFING_FORBIDDEN : Impossible d''usurper l''auteur d''un commentaire.'
        USING ERRCODE = '42501';
    END IF;
    NEW.user_id := auth.uid();

    IF NEW.is_internal AND NOT public.is_controleur_or_admin() THEN
      RAISE EXCEPTION 'INTERNAL_COMMENT_FORBIDDEN : Seuls les contrôleurs et administrateurs peuvent créer des notes internes.'
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_access_operation(NEW.operation_type, NEW.operation_id) THEN
      RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN : Opération cible introuvable ou hors périmètre.'
        USING ERRCODE = '23503';
    END IF;
  ELSE
    IF (NEW.operation_type = 'bets' AND NOT EXISTS (SELECT 1 FROM public.bets WHERE id = NEW.operation_id)) OR
       (NEW.operation_type = 'transactions' AND NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = NEW.operation_id)) OR
       (NEW.operation_type = 'venues' AND NOT EXISTS (SELECT 1 FROM public.venues WHERE id = NEW.operation_id)) THEN
      RAISE EXCEPTION 'OPERATION_NOT_FOUND : Opération cible introuvable.'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  NEW.created_at := COALESCE(NEW.created_at, NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_operation_comment_integrity ON public.operation_comments;
CREATE TRIGGER trg_enforce_operation_comment_integrity
  BEFORE INSERT ON public.operation_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_operation_comment_integrity();

-- 7. RPC idempotente pour l'envoi fiable des commentaires
CREATE OR REPLACE FUNCTION public.submit_operation_comment(
  p_operation_type TEXT,
  p_operation_id UUID,
  p_comment TEXT,
  p_is_internal BOOLEAN DEFAULT FALSE,
  p_client_request_id UUID DEFAULT NULL
)
RETURNS public.operation_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_trimmed TEXT;
  v_is_internal BOOLEAN;
  v_row public.operation_comments;
  v_existing public.operation_comments;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED : Authentification requise.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_active_and_cleared_user() THEN
    RAISE EXCEPTION 'USER_NOT_CLEARED : Compte inactif, suspendu ou mot de passe à renouveler.'
      USING ERRCODE = '42501';
  END IF;

  IF p_operation_type NOT IN ('bets', 'transactions', 'venues') THEN
    RAISE EXCEPTION 'INVALID_OPERATION_TYPE : Type d''opération non autorisé.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT public.can_access_operation(p_operation_type, p_operation_id) THEN
    RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN : Opération cible introuvable ou hors périmètre.'
      USING ERRCODE = '23503';
  END IF;

  v_trimmed := btrim(COALESCE(p_comment, ''));
  IF length(v_trimmed) < 1 OR length(v_trimmed) > 2000 THEN
    RAISE EXCEPTION 'INVALID_COMMENT_LENGTH : Le commentaire doit contenir entre 1 et 2000 caractères.'
      USING ERRCODE = '23514';
  END IF;

  v_is_internal := COALESCE(p_is_internal, FALSE);
  IF v_is_internal AND NOT public.is_controleur_or_admin() THEN
    RAISE EXCEPTION 'INTERNAL_COMMENT_FORBIDDEN : Seuls les contrôleurs et administrateurs peuvent créer des notes internes.'
      USING ERRCODE = '42501';
  END IF;

  IF p_client_request_id IS NOT NULL THEN
    INSERT INTO public.operation_comments (
      operation_type,
      operation_id,
      user_id,
      comment,
      is_internal,
      client_request_id,
      created_at
    )
    VALUES (
      p_operation_type,
      p_operation_id,
      v_uid,
      v_trimmed,
      v_is_internal,
      p_client_request_id,
      NOW()
    )
    ON CONFLICT (client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NOT NULL THEN
      RETURN v_row;
    END IF;

    SELECT * INTO v_existing
    FROM public.operation_comments
    WHERE client_request_id = p_client_request_id;

    IF v_existing.user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_FORBIDDEN : Cette clé d''idempotence appartient à un autre utilisateur.'
        USING ERRCODE = '42501';
    END IF;

    IF v_existing.operation_type IS DISTINCT FROM p_operation_type
       OR v_existing.operation_id IS DISTINCT FROM p_operation_id
       OR btrim(v_existing.comment) IS DISTINCT FROM v_trimmed
       OR COALESCE(v_existing.is_internal, FALSE) IS DISTINCT FROM v_is_internal THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT : Cette clé d''idempotence a déjà été utilisée avec un contenu ou une opération différente.'
        USING ERRCODE = '23505';
    END IF;

    RETURN v_existing;
  END IF;

  INSERT INTO public.operation_comments (
    operation_type,
    operation_id,
    user_id,
    comment,
    is_internal,
    created_at
  )
  VALUES (
    p_operation_type,
    p_operation_id,
    v_uid,
    v_trimmed,
    v_is_internal,
    NOW()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_operation_comment(TEXT, UUID, TEXT, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_operation_comment(TEXT, UUID, TEXT, BOOLEAN, UUID) TO authenticated;

-- 8. Politiques RLS strictes sur operation_comments
ALTER TABLE public.operation_comments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.operation_comments FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.operation_comments TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read comments" ON public.operation_comments;
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.operation_comments;
DROP POLICY IF EXISTS "operation_comments_select_policy" ON public.operation_comments;
DROP POLICY IF EXISTS "operation_comments_insert_policy" ON public.operation_comments;

CREATE POLICY "operation_comments_select_policy"
  ON public.operation_comments
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_operation(operation_type, operation_id)
    AND (NOT COALESCE(is_internal, FALSE) OR public.is_controleur_or_admin())
  );

CREATE POLICY "operation_comments_insert_policy"
  ON public.operation_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_access_operation(operation_type, operation_id)
    AND user_id = auth.uid()
    AND (NOT COALESCE(is_internal, FALSE) OR public.is_controleur_or_admin())
    AND length(btrim(comment)) BETWEEN 1 AND 2000
  );

-- 9. Immuabilité et RLS stricte sur operation_history
ALTER TABLE public.operation_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.operation_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.operation_history TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read history" ON public.operation_history;
DROP POLICY IF EXISTS "Authenticated users can insert history" ON public.operation_history;
DROP POLICY IF EXISTS "operation_history_select_policy" ON public.operation_history;

CREATE POLICY "operation_history_select_policy"
  ON public.operation_history
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_operation(operation_type, operation_id)
  );

-- Restreindre l'exécution directe des fonctions privilégiées d'historique et de notification
DO $$
BEGIN
  IF to_regprocedure('public.log_operation_history(character varying,uuid,character varying,character varying,character varying,uuid,jsonb,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.log_operation_history(character varying,uuid,character varying,character varying,character varying,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.create_notification(uuid,character varying,character varying,text,character varying,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.create_notification(uuid,character varying,character varying,text,character varying,uuid) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 10. Source unique et autoritaire d'historique côté base (dans la même transaction)
CREATE OR REPLACE FUNCTION public.trg_record_operation_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_service BOOLEAN;
  v_actor_id UUID;
  v_source TEXT;
  v_new_json JSONB;
  v_old_json JSONB;
  v_tracked_keys TEXT[] := ARRAY[
    'date',
    'time',
    'operator',
    'support',
    'platform',
    'bet_type',
    'type',
    'payment_operator',
    'amount_fcfa',
    'status',
    'amount_won_fcfa',
    'phone',
    'phone_number',
    'reference',
    'notes',
    'quartier',
    'quartier_no',
    'address',
    'contact_phone',
    'validation_status',
    'validation_notes',
    'reject_reason'
  ];
  v_key TEXT;
  v_before JSONB := '{}'::jsonb;
  v_after JSONB := '{}'::jsonb;
  v_action VARCHAR(20);
  v_comment TEXT;
  v_prev_status VARCHAR(20);
  v_new_status VARCHAR(20);
BEGIN
  v_is_service := (auth.role() = 'service_role' OR auth.uid() IS NULL);
  v_source := CASE WHEN v_is_service THEN 'service_role' ELSE 'user' END;
  v_new_json := to_jsonb(NEW);

  IF TG_OP = 'INSERT' THEN
    v_actor_id := CASE
      WHEN v_is_service THEN NEW.created_by
      ELSE auth.uid()
    END;

    FOREACH v_key IN ARRAY v_tracked_keys LOOP
      IF v_new_json ? v_key AND v_new_json->v_key IS NOT NULL THEN
        v_after := v_after || jsonb_build_object(v_key, v_new_json->v_key);
      END IF;
    END LOOP;

    INSERT INTO public.operation_history (
      operation_type,
      operation_id,
      action,
      previous_status,
      new_status,
      modified_by,
      modified_at,
      changes,
      comment,
      created_at
    ) VALUES (
      TG_TABLE_NAME::varchar,
      NEW.id,
      'created',
      NULL,
      NEW.validation_status::varchar,
      v_actor_id,
      NOW(),
      jsonb_build_object('source', v_source, 'after', v_after),
      'Opération créée',
      NOW()
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD);
    v_actor_id := CASE
      WHEN v_is_service THEN COALESCE(NEW.validated_by, NEW.created_by)
      ELSE auth.uid()
    END;

    FOREACH v_key IN ARRAY v_tracked_keys LOOP
      IF (v_old_json ? v_key OR v_new_json ? v_key)
         AND (v_old_json->v_key IS DISTINCT FROM v_new_json->v_key) THEN
        v_before := v_before || jsonb_build_object(v_key, v_old_json->v_key);
        v_after := v_after || jsonb_build_object(v_key, v_new_json->v_key);
      END IF;
    END LOOP;

    -- Ne rien journaliser si aucun champ suivi n'a réellement changé
    IF v_before = '{}'::jsonb AND v_after = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    v_prev_status := OLD.validation_status::varchar;
    v_new_status := NEW.validation_status::varchar;

    IF OLD.validation_status IS DISTINCT FROM NEW.validation_status THEN
      v_action := CASE NEW.validation_status
        WHEN 'valide' THEN 'validated'
        WHEN 'refuse' THEN 'rejected'
        WHEN 'en_attente' THEN 'reopened'
        ELSE 'modified'
      END;
    ELSE
      v_action := 'modified';
    END IF;

    v_comment := NULLIF(
      btrim(COALESCE(v_new_json->>'validation_notes', v_new_json->>'reject_reason', '')),
      ''
    );

    INSERT INTO public.operation_history (
      operation_type,
      operation_id,
      action,
      previous_status,
      new_status,
      modified_by,
      modified_at,
      changes,
      comment,
      created_at
    ) VALUES (
      TG_TABLE_NAME::varchar,
      NEW.id,
      v_action,
      v_prev_status,
      v_new_status,
      v_actor_id,
      NOW(),
      jsonb_build_object('source', v_source, 'before', v_before, 'after', v_after),
      v_comment,
      NOW()
    );

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_history_bets ON public.bets;
CREATE TRIGGER trg_history_bets
  AFTER INSERT OR UPDATE ON public.bets
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_record_operation_history();

DROP TRIGGER IF EXISTS trg_history_transactions ON public.transactions;
CREATE TRIGGER trg_history_transactions
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_record_operation_history();

DROP TRIGGER IF EXISTS trg_history_venues ON public.venues;
CREATE TRIGGER trg_history_venues
  AFTER INSERT OR UPDATE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_record_operation_history();

-- Supprimer la double écriture d'historique dans les triggers de notification
CREATE OR REPLACE FUNCTION public.notify_controllers_new_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_agent_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_operation_name TEXT;
  v_status_text TEXT;
  v_notif_type TEXT;
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

  IF OLD.validation_status IS DISTINCT FROM NEW.validation_status AND NEW.created_by IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.created_by,
      v_notif_type::varchar,
      (v_operation_name || ' ' || v_status_text)::varchar,
      ('Votre opération a été ' || v_status_text || ' par un contrôleur')::text,
      TG_TABLE_NAME::varchar,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 11. Publication Supabase Realtime pour commentaires, historique et notifications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'operation_comments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.operation_comments;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'operation_history'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.operation_history;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;

-- 12. Correctif RLS UPDATE sur bets et transactions : autoriser 'refuse' pour les contrôleurs
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
      (public.is_controleur_or_admin() AND validation_status IN ('valide', 'refuse', 'rejete', 'en_attente')) OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
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
      (public.is_controleur_or_admin() AND validation_status IN ('valide', 'refuse', 'rejete', 'en_attente')) OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  );

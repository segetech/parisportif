-- Migration 16 : Historique des connexions utilisateurs (login_history) + RPC record_login_event

CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_email TEXT,
  user_role TEXT,
  user_name TEXT,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_logged_in_at ON public.login_history(logged_in_at DESC);

ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "login_history_select_policy" ON public.login_history;
CREATE POLICY "login_history_select_policy" ON public.login_history
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.record_login_event(p_user_agent TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user RECORD;
  v_recent TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT id, email, role, nom, prenom, statut
    INTO v_user
  FROM public.users
  WHERE id = v_uid;

  IF v_user.id IS NULL OR LOWER(COALESCE(v_user.statut, '')) <> 'actif' THEN
    RETURN;
  END IF;

  UPDATE public.users
  SET derniere_connexion = NOW()
  WHERE id = v_uid;

  -- Éviter les doublons rapprochés (< 2 minutes) lors de rechargements d'onglets
  SELECT MAX(logged_in_at) INTO v_recent
  FROM public.login_history
  WHERE user_id = v_uid;

  IF v_recent IS NULL OR v_recent < NOW() - INTERVAL '2 minutes' THEN
    INSERT INTO public.login_history (
      user_id,
      user_email,
      user_role,
      user_name,
      logged_in_at,
      user_agent
    ) VALUES (
      v_uid,
      v_user.email,
      v_user.role,
      NULLIF(BTRIM(COALESCE(v_user.nom, '') || ' ' || COALESCE(v_user.prenom, '')), ''),
      NOW(),
      NULLIF(BTRIM(COALESCE(p_user_agent, '')), '')
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_login_event(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_login_event(TEXT) TO authenticated;

-- Pré-remplir avec la dernière connexion connue des utilisateurs existants (si absente)
INSERT INTO public.login_history (user_id, user_email, user_role, user_name, logged_in_at, user_agent)
SELECT
  u.id,
  u.email,
  u.role,
  NULLIF(BTRIM(COALESCE(u.nom, '') || ' ' || COALESCE(u.prenom, '')), ''),
  u.derniere_connexion,
  'Dernière session connue'
FROM public.users u
WHERE u.derniere_connexion IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.login_history lh WHERE lh.user_id = u.id
  );

-- ==============================================================================
-- Migration 09 : Rétablissement des tables et politiques RLS de référentiels
-- (operators, bet_types, payment_operators, platforms, supports, bet_statuses)
-- Idempotent, auto-suffisant et sécurisé
-- ==============================================================================

-- 0. Garantir la création des tables de référentiels si elles n'existent pas
CREATE TABLE IF NOT EXISTS public.operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bet_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bet_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Données initiales par défaut (si tables vides)
INSERT INTO public.operators (name) VALUES
  ('1xBet'),
  ('Bet223'),
  ('PremierBet'),
  ('MALIBET'),
  ('MELBET')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.supports (name) VALUES
  ('Salle de jeux'),
  ('En ligne'),
  ('Mobile'),
  ('Kiosque')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.bet_types (name) VALUES
  ('Simple'),
  ('Combiné'),
  ('Système'),
  ('Live'),
  ('Keno')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.bet_statuses (name) VALUES
  ('en attente'),
  ('gagné'),
  ('perdu'),
  ('annulé')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.payment_operators (name) VALUES
  ('Orange Money'),
  ('Moov Money'),
  ('Wave'),
  ('Espèces'),
  ('Carte bancaire')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.platforms (name) VALUES
  ('App mobile'),
  ('Site web'),
  ('Web'),
  ('Mobile'),
  ('Agence')
ON CONFLICT (name) DO NOTHING;

-- 1. Accorder les privilèges nécessaires aux rôles PostgREST
GRANT ALL ON TABLE public.operators TO authenticated, service_role;
GRANT ALL ON TABLE public.bet_types TO authenticated, service_role;
GRANT ALL ON TABLE public.payment_operators TO authenticated, service_role;
GRANT ALL ON TABLE public.platforms TO authenticated, service_role;
GRANT ALL ON TABLE public.supports TO authenticated, service_role;
GRANT ALL ON TABLE public.bet_statuses TO authenticated, service_role;

GRANT SELECT ON TABLE public.operators TO anon;
GRANT SELECT ON TABLE public.bet_types TO anon;
GRANT SELECT ON TABLE public.payment_operators TO anon;
GRANT SELECT ON TABLE public.platforms TO anon;
GRANT SELECT ON TABLE public.supports TO anon;
GRANT SELECT ON TABLE public.bet_statuses TO anon;

-- 2. Activation de RLS sur toutes les tables de référentiels
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_statuses ENABLE ROW LEVEL SECURITY;

-- 3. Politiques SELECT : Tout utilisateur (authentifié ou visiteur) peut lire les référentiels publics
DROP POLICY IF EXISTS "allow_all_authenticated_operators_select" ON public.operators;
CREATE POLICY "allow_all_authenticated_operators_select" ON public.operators
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "allow_all_authenticated_bet_types_select" ON public.bet_types;
CREATE POLICY "allow_all_authenticated_bet_types_select" ON public.bet_types
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "allow_all_authenticated_payment_operators_select" ON public.payment_operators;
CREATE POLICY "allow_all_authenticated_payment_operators_select" ON public.payment_operators
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "allow_all_authenticated_platforms_select" ON public.platforms;
CREATE POLICY "allow_all_authenticated_platforms_select" ON public.platforms
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "allow_all_authenticated_supports_select" ON public.supports;
CREATE POLICY "allow_all_authenticated_supports_select" ON public.supports
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "allow_all_authenticated_bet_statuses_select" ON public.bet_statuses;
CREATE POLICY "allow_all_authenticated_bet_statuses_select" ON public.bet_statuses
  FOR SELECT TO authenticated, anon
  USING (true);

-- 4. Politiques INSERT : Les utilisateurs actifs peuvent ajouter des référentiels (CreatableSelect & Admin)
DROP POLICY IF EXISTS "allow_all_authenticated_operators_insert" ON public.operators;
CREATE POLICY "allow_all_authenticated_operators_insert" ON public.operators
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_and_cleared_user());

DROP POLICY IF EXISTS "allow_all_authenticated_bet_types_insert" ON public.bet_types;
CREATE POLICY "allow_all_authenticated_bet_types_insert" ON public.bet_types
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_and_cleared_user());

DROP POLICY IF EXISTS "allow_all_authenticated_payment_operators_insert" ON public.payment_operators;
CREATE POLICY "allow_all_authenticated_payment_operators_insert" ON public.payment_operators
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_and_cleared_user());

DROP POLICY IF EXISTS "allow_all_authenticated_platforms_insert" ON public.platforms;
CREATE POLICY "allow_all_authenticated_platforms_insert" ON public.platforms
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_and_cleared_user());

DROP POLICY IF EXISTS "allow_all_authenticated_supports_insert" ON public.supports;
CREATE POLICY "allow_all_authenticated_supports_insert" ON public.supports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_and_cleared_user());

DROP POLICY IF EXISTS "allow_all_authenticated_bet_statuses_insert" ON public.bet_statuses;
CREATE POLICY "allow_all_authenticated_bet_statuses_insert" ON public.bet_statuses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_and_cleared_user());

-- 5. Politiques UPDATE : Les contrôleurs et administrateurs actifs peuvent modifier les référentiels
DROP POLICY IF EXISTS "allow_all_authenticated_operators_update" ON public.operators;
CREATE POLICY "allow_all_authenticated_operators_update" ON public.operators
  FOR UPDATE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_controleur_or_admin())
  WITH CHECK (public.is_active_and_cleared_user() AND public.is_controleur_or_admin());

DROP POLICY IF EXISTS "allow_all_authenticated_bet_types_update" ON public.bet_types;
CREATE POLICY "allow_all_authenticated_bet_types_update" ON public.bet_types
  FOR UPDATE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_controleur_or_admin())
  WITH CHECK (public.is_active_and_cleared_user() AND public.is_controleur_or_admin());

DROP POLICY IF EXISTS "allow_all_authenticated_payment_operators_update" ON public.payment_operators;
CREATE POLICY "allow_all_authenticated_payment_operators_update" ON public.payment_operators
  FOR UPDATE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_controleur_or_admin())
  WITH CHECK (public.is_active_and_cleared_user() AND public.is_controleur_or_admin());

DROP POLICY IF EXISTS "allow_all_authenticated_platforms_update" ON public.platforms;
CREATE POLICY "allow_all_authenticated_platforms_update" ON public.platforms
  FOR UPDATE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_controleur_or_admin())
  WITH CHECK (public.is_active_and_cleared_user() AND public.is_controleur_or_admin());

DROP POLICY IF EXISTS "allow_all_authenticated_supports_update" ON public.supports;
CREATE POLICY "allow_all_authenticated_supports_update" ON public.supports
  FOR UPDATE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_controleur_or_admin())
  WITH CHECK (public.is_active_and_cleared_user() AND public.is_controleur_or_admin());

DROP POLICY IF EXISTS "allow_all_authenticated_bet_statuses_update" ON public.bet_statuses;
CREATE POLICY "allow_all_authenticated_bet_statuses_update" ON public.bet_statuses
  FOR UPDATE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_controleur_or_admin())
  WITH CHECK (public.is_active_and_cleared_user() AND public.is_controleur_or_admin());

-- 6. Politiques DELETE : Seuls les administrateurs actifs peuvent supprimer un référentiel
DROP POLICY IF EXISTS "allow_all_authenticated_operators_delete" ON public.operators;
CREATE POLICY "allow_all_authenticated_operators_delete" ON public.operators
  FOR DELETE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_admin());

DROP POLICY IF EXISTS "allow_all_authenticated_bet_types_delete" ON public.bet_types;
CREATE POLICY "allow_all_authenticated_bet_types_delete" ON public.bet_types
  FOR DELETE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_admin());

DROP POLICY IF EXISTS "allow_all_authenticated_payment_operators_delete" ON public.payment_operators;
CREATE POLICY "allow_all_authenticated_payment_operators_delete" ON public.payment_operators
  FOR DELETE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_admin());

DROP POLICY IF EXISTS "allow_all_authenticated_platforms_delete" ON public.platforms;
CREATE POLICY "allow_all_authenticated_platforms_delete" ON public.platforms
  FOR DELETE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_admin());

DROP POLICY IF EXISTS "allow_all_authenticated_supports_delete" ON public.supports;
CREATE POLICY "allow_all_authenticated_supports_delete" ON public.supports
  FOR DELETE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_admin());

DROP POLICY IF EXISTS "allow_all_authenticated_bet_statuses_delete" ON public.bet_statuses;
CREATE POLICY "allow_all_authenticated_bet_statuses_delete" ON public.bet_statuses
  FOR DELETE TO authenticated
  USING (public.is_active_and_cleared_user() AND public.is_admin());

-- ==============================================================================
-- Migration 03 : Politiques RLS (Row Level Security) Complètes et Robustes
-- Active RLS sur toutes les tables et applique le principe du moindre privilège
-- Remplace et purge toutes les anciennes politiques permissives
-- ==============================================================================

-- 0. Nettoyage dynamique des anciennes politiques pour garantir l'absence de fuite permissive
DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'users', 'transactions', 'bets', 'venues',
    'illegal_bets', 'illegal_transactions',
    'audit_logs', 'password_resets',
    'operators', 'platforms', 'payment_operators', 'bet_types'
  ]) LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- 1. Activation stricte de RLS sur toutes les tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_bets') THEN
    ALTER TABLE public.illegal_bets ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_transactions') THEN
    ALTER TABLE public.illegal_transactions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Table users
-- ------------------------------------------------------------------------------
-- Seuls les utilisateurs actifs peuvent lire leur propre profil ou la liste (contrôleurs/admins)
CREATE POLICY "users_select_policy" ON public.users
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND (id = auth.uid() OR public.is_controleur_or_admin())
  );

-- Un utilisateur actif peut modifier son nom/prénom, mais ne peut ni s'attribuer un rôle ni modifier son statut (gardé par trigger)
CREATE POLICY "users_update_policy" ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (id = auth.uid() OR public.is_admin())
  )
  WITH CHECK (
    public.is_active_user() AND (id = auth.uid() OR public.is_admin())
  );

-- Pas de politique INSERT / DELETE directe pour users : géré exclusivement par l'API serveur via service_role

-- ------------------------------------------------------------------------------
-- 3. Table transactions
-- ------------------------------------------------------------------------------
CREATE POLICY "transactions_select_policy" ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid())
  );

-- Un agent ne peut insérer qu'à son nom et impérativement au statut "en_attente" sans métadonnées de validation
CREATE POLICY "transactions_insert_policy" ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user() AND (
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

-- Un agent ne peut modifier que ses transactions non encore validées (au statut "en_attente") sans altérer le workflow
CREATE POLICY "transactions_update_policy" ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  )
  WITH CHECK (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        validation_status = 'en_attente' AND
        validated_by IS NULL AND
        validated_at IS NULL AND
        validation_notes IS NULL
      )
    )
  );

CREATE POLICY "transactions_delete_policy" ON public.transactions
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_user() AND public.is_admin()
  );

-- ------------------------------------------------------------------------------
-- 4. Table bets
-- ------------------------------------------------------------------------------
CREATE POLICY "bets_select_policy" ON public.bets
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid())
  );

CREATE POLICY "bets_insert_policy" ON public.bets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user() AND (
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

CREATE POLICY "bets_update_policy" ON public.bets
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  )
  WITH CHECK (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        validation_status = 'en_attente' AND
        validated_by IS NULL AND
        validated_at IS NULL AND
        validation_notes IS NULL
      )
    )
  );

CREATE POLICY "bets_delete_policy" ON public.bets
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_user() AND public.is_admin()
  );

-- ------------------------------------------------------------------------------
-- 5. Table venues
-- ------------------------------------------------------------------------------
CREATE POLICY "venues_select_policy" ON public.venues
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user()
  );

CREATE POLICY "venues_insert_policy" ON public.venues
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user() AND (
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

CREATE POLICY "venues_update_policy" ON public.venues
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (created_by = auth.uid() AND validation_status = 'en_attente')
    )
  )
  WITH CHECK (
    public.is_active_user() AND (
      public.is_controleur_or_admin() OR
      (
        created_by = auth.uid() AND
        validation_status = 'en_attente' AND
        validated_by IS NULL AND
        validated_at IS NULL AND
        validation_notes IS NULL
      )
    )
  );

CREATE POLICY "venues_delete_policy" ON public.venues
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_user() AND public.is_admin()
  );

-- ------------------------------------------------------------------------------
-- 6. Tables illegal_bets et illegal_transactions (si présentes)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_bets') THEN
    CREATE POLICY "illegal_bets_select_policy" ON public.illegal_bets
      FOR SELECT TO authenticated
      USING (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()));

    CREATE POLICY "illegal_bets_insert_policy" ON public.illegal_bets
      FOR INSERT TO authenticated
      WITH CHECK (public.is_active_user() AND (created_by = auth.uid() OR public.is_admin()));

    CREATE POLICY "illegal_bets_update_policy" ON public.illegal_bets
      FOR UPDATE TO authenticated
      USING (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()))
      WITH CHECK (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()));

    CREATE POLICY "illegal_bets_delete_policy" ON public.illegal_bets
      FOR DELETE TO authenticated
      USING (public.is_active_user() AND public.is_admin());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'illegal_transactions') THEN
    CREATE POLICY "illegal_transactions_select_policy" ON public.illegal_transactions
      FOR SELECT TO authenticated
      USING (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()));

    CREATE POLICY "illegal_transactions_insert_policy" ON public.illegal_transactions
      FOR INSERT TO authenticated
      WITH CHECK (public.is_active_user() AND (created_by = auth.uid() OR public.is_admin()));

    CREATE POLICY "illegal_transactions_update_policy" ON public.illegal_transactions
      FOR UPDATE TO authenticated
      USING (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()))
      WITH CHECK (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()));

    CREATE POLICY "illegal_transactions_delete_policy" ON public.illegal_transactions
      FOR DELETE TO authenticated
      USING (public.is_active_user() AND public.is_admin());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. Table audit_logs (Journal d'audit strictement immuable)
-- ------------------------------------------------------------------------------
CREATE POLICY "audit_logs_select_policy" ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND public.is_controleur_or_admin()
  );

-- Les insertions sont réalisées par les triggers de base de données ou le service backend
-- Pas de politiques UPDATE ni DELETE : journal inaltérable

-- ------------------------------------------------------------------------------
-- 8. Table password_resets (Exclusivement réservée au service_role backend)
-- ------------------------------------------------------------------------------
-- Aucun accès direct via authenticated ni anon

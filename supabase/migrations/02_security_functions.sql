-- ==============================================================================
-- Migration 02 : Fonctions de Sécurité Définies (Non Récursives)
-- Permet de vérifier les rôles et statuts sans provoquer de boucle de récursion RLS
-- ==============================================================================

-- 1. Vérifier si l'utilisateur connecté possède un compte actif
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND statut = 'actif'
  );
$$;

-- 2. Récupérer le rôle de l'utilisateur connecté actif
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() AND statut = 'actif';
$$;

-- 3. Vérifier si l'utilisateur est un administrateur actif
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'ADMIN' AND statut = 'actif'
  );
$$;

-- 4. Vérifier si l'utilisateur est un contrôleur ou un administrateur actif
CREATE OR REPLACE FUNCTION public.is_controleur_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('ADMIN', 'CONTROLEUR') AND statut = 'actif'
  );
$$;

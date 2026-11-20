-- Migration 17 : Table des Dépenses & Suivi Mensuel (monthly_expenses)

CREATE TABLE IF NOT EXISTS public.monthly_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  designation TEXT NOT NULL DEFAULT 'DEPOT',
  montant_fcfa BIGINT NOT NULL DEFAULT 0,
  depenses_fcfa BIGINT NOT NULL DEFAULT 0,
  gains_fcfa BIGINT NOT NULL DEFAULT 0,
  observations TEXT,
  financement_fcfa BIGINT NOT NULL DEFAULT 0,
  financement_source TEXT DEFAULT 'DIABY',
  soldes_fcfa BIGINT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_expenses_date ON public.monthly_expenses (date DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_expenses_created_by ON public.monthly_expenses (created_by);

ALTER TABLE public.monthly_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_expenses_select_policy" ON public.monthly_expenses;
CREATE POLICY "monthly_expenses_select_policy" ON public.monthly_expenses
  FOR SELECT
  TO authenticated
  USING (public.is_active_user());

DROP POLICY IF EXISTS "monthly_expenses_insert_policy" ON public.monthly_expenses;
CREATE POLICY "monthly_expenses_insert_policy" ON public.monthly_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "monthly_expenses_update_policy" ON public.monthly_expenses;
CREATE POLICY "monthly_expenses_update_policy" ON public.monthly_expenses
  FOR UPDATE
  TO authenticated
  USING (public.is_active_user() AND (public.is_controleur_or_admin() OR created_by = auth.uid()))
  WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "monthly_expenses_delete_policy" ON public.monthly_expenses;
CREATE POLICY "monthly_expenses_delete_policy" ON public.monthly_expenses
  FOR DELETE
  TO authenticated
  USING (public.is_active_user() AND (public.is_admin() OR created_by = auth.uid()));

-- Migration 09: Distinction des opérateurs légaux et illégaux dans public.operators
ALTER TABLE public.operators
ADD COLUMN IF NOT EXISTS is_illegal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_operators_active_illegal
ON public.operators (active, is_illegal, name);

-- ==============================================================================
-- Migration 19 : Rendre nullables les champs optionnels lors de la saisie/import
-- Permet de laisser les colonnes vides (NULL) au lieu d'inventer des valeurs.
-- ==============================================================================

-- 1. Table transactions
ALTER TABLE public.transactions
  ALTER COLUMN time DROP NOT NULL,
  ALTER COLUMN platform DROP NOT NULL,
  ALTER COLUMN payment_operator DROP NOT NULL;

UPDATE public.transactions
SET reference = NULL
WHERE reference IS NOT NULL AND btrim(reference) = '';

-- 2. Table bets
ALTER TABLE public.bets
  ALTER COLUMN time DROP NOT NULL,
  ALTER COLUMN support DROP NOT NULL,
  ALTER COLUMN bet_type DROP NOT NULL;

UPDATE public.bets
SET reference = NULL
WHERE reference IS NOT NULL AND btrim(reference) = '';

-- 3. Table illegal_bets
ALTER TABLE public.illegal_bets
  ALTER COLUMN time DROP NOT NULL,
  ALTER COLUMN platform DROP NOT NULL,
  ALTER COLUMN payment_operator DROP NOT NULL,
  ALTER COLUMN reference DROP NOT NULL;

-- 4. Table illegal_transactions
ALTER TABLE public.illegal_transactions
  ALTER COLUMN time DROP NOT NULL,
  ALTER COLUMN platform DROP NOT NULL,
  ALTER COLUMN payment_operator DROP NOT NULL,
  ALTER COLUMN reference DROP NOT NULL;

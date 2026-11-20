-- ==============================================================================
-- Migration 18 : Snapshot des frais opérateurs figés sur chaque transaction
-- Garantit qu'un changement ultérieur de taux n'affecte jamais le passé
-- ==============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fee_rate_percent DECIMAL(6, 2),
  ADD COLUMN IF NOT EXISTS fee_fixed_fcfa BIGINT,
  ADD COLUMN IF NOT EXISTS fee_fcfa BIGINT,
  ADD COLUMN IF NOT EXISTS net_amount_fcfa BIGINT;

CREATE INDEX IF NOT EXISTS idx_transactions_fee_fcfa
  ON public.transactions (fee_fcfa)
  WHERE fee_fcfa IS NOT NULL;

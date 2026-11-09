-- ==============================================================================
-- Migration 05 : Harmonisation des statuts de validation et migration des données
-- Harmonise review_status ('en_cours', 'valide', 'rejete') et validation_status ('en_attente', 'valide', 'refuse')
-- Idempotente et ré-exécutable en toute sécurité
-- ==============================================================================

DO $$
BEGIN
  -- 1. Harmonisation pour la table transactions
  -- Si validation_status n'existe pas encore, on l'ajoute
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'validation_status'
  ) THEN
    ALTER TABLE public.transactions
    ADD COLUMN validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente'
    CHECK (validation_status IN ('en_attente', 'valide', 'refuse'));
  END IF;

  -- Migration des données historiques depuis review_status si la colonne existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'review_status'
  ) THEN
    UPDATE public.transactions
    SET validation_status = CASE
      WHEN review_status = 'valide' THEN 'valide'
      WHEN review_status = 'rejete' THEN 'refuse'
      ELSE 'en_attente'
    END
    WHERE validation_status IS NULL OR validation_status = 'en_attente';

    -- Synchroniser également les métadonnées historiques si présentes
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'reviewed_by') THEN
      UPDATE public.transactions
      SET validated_by = reviewed_by
      WHERE validated_by IS NULL AND reviewed_by IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'reviewed_at') THEN
      UPDATE public.transactions
      SET validated_at = reviewed_at
      WHERE validated_at IS NULL AND reviewed_at IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'reject_reason') THEN
      UPDATE public.transactions
      SET validation_notes = reject_reason
      WHERE validation_notes IS NULL AND reject_reason IS NOT NULL;
    END IF;
  END IF;

  -- 2. Harmonisation pour la table bets
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'validation_status'
  ) THEN
    ALTER TABLE public.bets
    ADD COLUMN validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente'
    CHECK (validation_status IN ('en_attente', 'valide', 'refuse'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'review_status'
  ) THEN
    UPDATE public.bets
    SET validation_status = CASE
      WHEN review_status = 'valide' THEN 'valide'
      WHEN review_status = 'rejete' THEN 'refuse'
      ELSE 'en_attente'
    END
    WHERE validation_status IS NULL OR validation_status = 'en_attente';

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'reviewed_by') THEN
      UPDATE public.bets
      SET validated_by = reviewed_by
      WHERE validated_by IS NULL AND reviewed_by IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'reviewed_at') THEN
      UPDATE public.bets
      SET validated_at = reviewed_at
      WHERE validated_at IS NULL AND reviewed_at IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'reject_reason') THEN
      UPDATE public.bets
      SET validation_notes = reject_reason
      WHERE validation_notes IS NULL AND reject_reason IS NOT NULL;
    END IF;
  END IF;

  -- 3. Harmonisation pour la table venues (si nécessaire)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'validation_status'
  ) THEN
    ALTER TABLE public.venues
    ADD COLUMN validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente'
    CHECK (validation_status IN ('en_attente', 'valide', 'refuse'));
  END IF;

END $$;

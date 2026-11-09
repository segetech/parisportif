-- ==============================================================================
-- Migration 05 : Harmonisation des Données et Rétrocompatibilité
-- Fait converger 'review_status' (legacy) vers 'validation_status' (cible)
-- Idempotente et exécutable sans perte de données
-- ==============================================================================

DO $$
BEGIN
  -- 1. Harmonisation sur la table transactions
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'review_status'
  ) THEN
    -- Migration des statuts existants
    UPDATE public.transactions
    SET validation_status = CASE
      WHEN review_status = 'en_cours' THEN 'en_attente'
      WHEN review_status = 'rejete' THEN 'refuse'
      WHEN review_status = 'valide' THEN 'valide'
      ELSE validation_status
    END
    WHERE validation_status IS NULL OR validation_status = 'en_attente';

    -- Migration des métadonnées
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

  -- 2. Harmonisation sur la table bets
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'review_status'
  ) THEN
    -- Migration des statuts existants
    UPDATE public.bets
    SET validation_status = CASE
      WHEN review_status = 'en_cours' THEN 'en_attente'
      WHEN review_status = 'rejete' THEN 'refuse'
      WHEN review_status = 'valide' THEN 'valide'
      ELSE validation_status
    END
    WHERE validation_status IS NULL OR validation_status = 'en_attente';

    -- Migration des métadonnées
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

  -- 3. Synchronisation automatique bidirectionnelle si review_status est encore présent
  -- Cela permet aux anciens modules de lire ou écrire sans briser la validation_status
  CREATE OR REPLACE FUNCTION public.sync_legacy_review_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $sync$
  BEGIN
    IF NEW.validation_status IS NOT NULL THEN
      NEW.review_status := CASE
        WHEN NEW.validation_status = 'en_attente' THEN 'en_cours'
        WHEN NEW.validation_status = 'refuse' THEN 'rejete'
        WHEN NEW.validation_status = 'valide' THEN 'valide'
        ELSE 'en_cours'
      END;
      NEW.reviewed_by := NEW.validated_by;
      NEW.reviewed_at := NEW.validated_at;
      NEW.reject_reason := NEW.validation_notes;
    END IF;
    RETURN NEW;
  END;
  $sync$;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'review_status') THEN
    DROP TRIGGER IF EXISTS trg_sync_review_transactions ON public.transactions;
    CREATE TRIGGER trg_sync_review_transactions
    BEFORE INSERT OR UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_legacy_review_fields();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bets' AND column_name = 'review_status') THEN
    DROP TRIGGER IF EXISTS trg_sync_review_bets ON public.bets;
    CREATE TRIGGER trg_sync_review_bets
    BEFORE INSERT OR UPDATE ON public.bets
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_legacy_review_fields();
  END IF;

END $$;

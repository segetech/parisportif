-- ==============================================================================
-- Migration 06 : Modèle Métier Unifié, Multi-jeux par Salle, Référentiels et Traçabilité
-- Conforme aux spécifications des fichiers sources Excel et aux règles Supabase
-- Exécutable, idempotente et sans perte de données
-- ==============================================================================

-- 1. EXTENSION DE LA TABLE BETS (PARIS)
-- Ajout du champ téléphone pour restitution du fichier source
ALTER TABLE public.bets 
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Ajout du statut de la preuve (disponible, non_disponible, non_renseignee)
ALTER TABLE public.bets 
ADD COLUMN IF NOT EXISTS proof_status VARCHAR(30) DEFAULT 'non_renseignee';

-- Ajout de l'identifiant de lot d'import pour traçabilité
ALTER TABLE public.bets 
ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- Indexation utile
CREATE INDEX IF NOT EXISTS idx_bets_phone ON public.bets(phone);
CREATE INDEX IF NOT EXISTS idx_bets_import_batch ON public.bets(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_bets_proof_status ON public.bets(proof_status);

-- 2. EXTENSION DE LA TABLE TRANSACTIONS
-- Ajout du statut de la preuve
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS proof_status VARCHAR(30) DEFAULT 'non_renseignee';

-- Ajout de l'URL ou pièce jointe de la preuve
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS proof_attachment_url TEXT;

-- Ajout de l'identifiant de lot d'import pour traçabilité
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- Indexation utile
CREATE INDEX IF NOT EXISTS idx_transactions_phone ON public.transactions(phone);
CREATE INDEX IF NOT EXISTS idx_transactions_import_batch ON public.transactions(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_proof_status ON public.transactions(proof_status);

-- 3. EXTENSION DE LA TABLE VENUES (SALLES DE JEUX)
-- Support de plusieurs jeux par établissement
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS games TEXT[] DEFAULT '{}';

-- Ajout de l'identifiant de lot d'import
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS import_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_venues_import_batch ON public.venues(import_batch_id);

-- 4. TABLE RELATIONNELLE VENUE_GAMES (MULTI-JEUX PAR ÉTABLISSEMENT)
CREATE TABLE IF NOT EXISTS public.venue_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  game_name VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_games_venue_id ON public.venue_games(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_games_game_name ON public.venue_games(game_name);

-- RLS sur venue_games
ALTER TABLE public.venue_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_games_select_authenticated" ON public.venue_games;
CREATE POLICY "venue_games_select_authenticated" ON public.venue_games
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "venue_games_write_admin_controller" ON public.venue_games;
CREATE POLICY "venue_games_write_admin_controller" ON public.venue_games
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = (SELECT auth.uid()) 
      AND users.statut = 'actif' 
      AND users.role IN ('ADMIN', 'CONTROLEUR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = (SELECT auth.uid()) 
      AND users.statut = 'actif' 
      AND users.role IN ('ADMIN', 'CONTROLEUR')
    )
  );

-- 5. TABLE DES ALIAS DE RÉFÉRENTIELS (REFERENCE_ALIASES)
-- Permet de faire converger 'cheveaux' -> 'Course de chevaux', 'spiwin' -> 'Spin 2 Win roulette', etc.
CREATE TABLE IF NOT EXISTS public.reference_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL, -- 'operator', 'bet_type', 'payment_operator', 'support', 'platform', 'quartier'
  alias VARCHAR(255) NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  is_confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_reference_alias UNIQUE (category, alias)
);

CREATE INDEX IF NOT EXISTS idx_reference_aliases_cat_alias ON public.reference_aliases(category, alias);

ALTER TABLE public.reference_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reference_aliases_select" ON public.reference_aliases;
CREATE POLICY "reference_aliases_select" ON public.reference_aliases
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reference_aliases_write_admin" ON public.reference_aliases;
CREATE POLICY "reference_aliases_write_admin" ON public.reference_aliases
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = (SELECT auth.uid()) 
      AND users.statut = 'actif' 
      AND users.role = 'ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = (SELECT auth.uid()) 
      AND users.statut = 'actif' 
      AND users.role = 'ADMIN'
    )
  );

-- 6. TABLE DES LOTS D'IMPORT (IMPORT_BATCHES)
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  sheet_name VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- 'transactions', 'bets', 'venues'
  total_rows INT NOT NULL DEFAULT 0,
  imported_rows INT NOT NULL DEFAULT 0,
  rejected_rows INT NOT NULL DEFAULT 0,
  ignored_rows INT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'termine', -- 'en_cours', 'termine', 'echoue'
  anomalies JSONB DEFAULT '[]'::jsonb,
  imported_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON public.import_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_entity ON public.import_batches(entity_type);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_batches_select" ON public.import_batches;
CREATE POLICY "import_batches_select" ON public.import_batches
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "import_batches_insert" ON public.import_batches;
CREATE POLICY "import_batches_insert" ON public.import_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = (SELECT auth.uid()) 
      AND users.statut = 'actif'
    )
  );

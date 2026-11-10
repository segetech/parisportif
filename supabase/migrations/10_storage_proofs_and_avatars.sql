-- ==============================================================================
-- Migration 10 : Stockage Cloudflare R2 - Preuves & Avatars Profil
-- Idempotent, sans perte de données et hautement compatible
-- ==============================================================================

-- 1. Table users : URL de la photo de profil (Avatar)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Table bets : URLs pour le ticket et la preuve téléversée
ALTER TABLE public.bets 
ADD COLUMN IF NOT EXISTS ticket_url TEXT,
ADD COLUMN IF NOT EXISTS proof_attachment_url TEXT;

-- 3. Table transactions : URL de la pièce jointe / reçu
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS proof_attachment_url TEXT;

-- 4. Tables d'activités illégales : pièces jointes
ALTER TABLE public.illegal_bets 
ADD COLUMN IF NOT EXISTS proof_attachment_url TEXT,
ADD COLUMN IF NOT EXISTS ticket_url TEXT;

ALTER TABLE public.illegal_transactions 
ADD COLUMN IF NOT EXISTS proof_attachment_url TEXT;

-- Index pour recherche rapide sur la présence de pièces jointes
CREATE INDEX IF NOT EXISTS idx_bets_proof_url ON public.bets(proof_attachment_url) WHERE proof_attachment_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_proof_url ON public.transactions(proof_attachment_url) WHERE proof_attachment_url IS NOT NULL;

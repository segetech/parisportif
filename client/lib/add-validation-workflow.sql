-- Ajouter le système de validation pour les opérations
-- Exécutez ce script dans le SQL Editor de Supabase

-- 1. Ajouter les colonnes de validation aux tables bets et transactions
ALTER TABLE bets ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'en_attente';
ALTER TABLE bets ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES users(id);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS validation_notes TEXT;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'en_attente';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES users(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS validation_notes TEXT;

ALTER TABLE venues ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'en_attente';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES users(id);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS validation_notes TEXT;

-- 2. Créer un index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_bets_validation_status ON bets(validation_status);
CREATE INDEX IF NOT EXISTS idx_transactions_validation_status ON transactions(validation_status);
CREATE INDEX IF NOT EXISTS idx_venues_validation_status ON venues(validation_status);

-- 3. Mettre à jour les données existantes (les marquer comme validées si elles existent déjà)
UPDATE bets SET validation_status = 'valide' WHERE validation_status IS NULL;
UPDATE transactions SET validation_status = 'valide' WHERE validation_status IS NULL;
UPDATE venues SET validation_status = 'valide' WHERE validation_status IS NULL;

-- 4. Créer une vue pour les statistiques de validation
CREATE OR REPLACE VIEW validation_stats AS
SELECT 
  'bets' as table_name,
  validation_status,
  COUNT(*) as count
FROM bets
GROUP BY validation_status
UNION ALL
SELECT 
  'transactions' as table_name,
  validation_status,
  COUNT(*) as count
FROM transactions
GROUP BY validation_status
UNION ALL
SELECT 
  'venues' as table_name,
  validation_status,
  COUNT(*) as count
FROM venues
GROUP BY validation_status;

-- Vérifier les colonnes ajoutées
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name IN ('bets', 'transactions', 'venues') 
  AND column_name LIKE '%validation%'
ORDER BY table_name, ordinal_position;

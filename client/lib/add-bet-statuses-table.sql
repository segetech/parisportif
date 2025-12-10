-- Créer la table bet_statuses pour les statuts de paris
-- Exécutez ce script dans le SQL Editor de Supabase

-- 1. Créer la table bet_statuses
CREATE TABLE IF NOT EXISTS bet_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Activer RLS
ALTER TABLE bet_statuses ENABLE ROW LEVEL SECURITY;

-- 3. Politiques RLS
CREATE POLICY "Everyone can read bet_statuses" ON bet_statuses FOR SELECT USING (TRUE);
CREATE POLICY "Authenticated users can insert bet_statuses" ON bet_statuses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can update bet_statuses" ON bet_statuses FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can delete bet_statuses" ON bet_statuses FOR DELETE USING (auth.uid() IS NOT NULL);

-- 4. Insérer les données initiales
INSERT INTO bet_statuses (name) VALUES
  ('en attente'),
  ('gagné'),
  ('perdu'),
  ('annulé')
ON CONFLICT (name) DO NOTHING;

-- 5. Créer un index
CREATE INDEX IF NOT EXISTS idx_bet_statuses_active ON bet_statuses(active);
CREATE INDEX IF NOT EXISTS idx_bet_statuses_name ON bet_statuses(name);

-- Vérifier les données
SELECT * FROM bet_statuses ORDER BY name;

-- Créer la table supports pour les types de support
-- Exécutez ce script dans le SQL Editor de Supabase

-- 1. Créer la table supports
CREATE TABLE IF NOT EXISTS supports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Activer RLS
ALTER TABLE supports ENABLE ROW LEVEL SECURITY;

-- 3. Politiques RLS (lecture publique, modification admin)
CREATE POLICY "Everyone can read supports" ON supports FOR SELECT USING (TRUE);
CREATE POLICY "Authenticated users can insert supports" ON supports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Insérer les données initiales
INSERT INTO supports (name) VALUES
  ('Salle de jeux'),
  ('En ligne'),
  ('Mobile'),
  ('Kiosque')
ON CONFLICT (name) DO NOTHING;

-- 5. Créer un index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_supports_active ON supports(active);
CREATE INDEX IF NOT EXISTS idx_supports_name ON supports(name);

-- Vérifier les données
SELECT * FROM supports ORDER BY name;

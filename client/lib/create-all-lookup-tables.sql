-- Script pour créer TOUTES les tables de référentiels manquantes
-- Exécutez ce script EN PREMIER dans le SQL Editor de Supabase

-- ============================================
-- 1. CRÉER LES TABLES SI ELLES N'EXISTENT PAS
-- ============================================

-- Table operators
CREATE TABLE IF NOT EXISTS operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table supports
CREATE TABLE IF NOT EXISTS supports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table bet_types
CREATE TABLE IF NOT EXISTS bet_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table bet_statuses
CREATE TABLE IF NOT EXISTS bet_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table payment_operators
CREATE TABLE IF NOT EXISTS payment_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table platforms
CREATE TABLE IF NOT EXISTS platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 2. INSÉRER DES DONNÉES INITIALES
-- ============================================

-- Operators (exemples)
INSERT INTO operators (name) VALUES
  ('1xBet'),
  ('22Bet'),
  ('Betway'),
  ('Melbet')
ON CONFLICT (name) DO NOTHING;

-- Supports
INSERT INTO supports (name) VALUES
  ('Salle de jeux'),
  ('En ligne'),
  ('Mobile'),
  ('Kiosque')
ON CONFLICT (name) DO NOTHING;

-- Bet types
INSERT INTO bet_types (name) VALUES
  ('Simple'),
  ('Combiné'),
  ('Système')
ON CONFLICT (name) DO NOTHING;

-- Bet statuses
INSERT INTO bet_statuses (name) VALUES
  ('en attente'),
  ('gagné'),
  ('perdu'),
  ('annulé')
ON CONFLICT (name) DO NOTHING;

-- Payment operators
INSERT INTO payment_operators (name) VALUES
  ('Orange Money'),
  ('MTN Mobile Money'),
  ('Moov Money'),
  ('Wave'),
  ('Carte bancaire')
ON CONFLICT (name) DO NOTHING;

-- Platforms
INSERT INTO platforms (name) VALUES
  ('Web'),
  ('Mobile'),
  ('App mobile'),
  ('Site web'),
  ('Agence')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 3. CRÉER LES INDEX
-- ============================================

CREATE INDEX IF NOT EXISTS idx_operators_active ON operators(active);
CREATE INDEX IF NOT EXISTS idx_operators_name ON operators(name);

CREATE INDEX IF NOT EXISTS idx_supports_active ON supports(active);
CREATE INDEX IF NOT EXISTS idx_supports_name ON supports(name);

CREATE INDEX IF NOT EXISTS idx_bet_types_active ON bet_types(active);
CREATE INDEX IF NOT EXISTS idx_bet_types_name ON bet_types(name);

CREATE INDEX IF NOT EXISTS idx_bet_statuses_active ON bet_statuses(active);
CREATE INDEX IF NOT EXISTS idx_bet_statuses_name ON bet_statuses(name);

CREATE INDEX IF NOT EXISTS idx_payment_operators_active ON payment_operators(active);
CREATE INDEX IF NOT EXISTS idx_payment_operators_name ON payment_operators(name);

CREATE INDEX IF NOT EXISTS idx_platforms_active ON platforms(active);
CREATE INDEX IF NOT EXISTS idx_platforms_name ON platforms(name);

-- ============================================
-- 4. VÉRIFICATION
-- ============================================

SELECT 'OPERATORS:' as table_name, COUNT(*) as count FROM operators
UNION ALL
SELECT 'SUPPORTS:', COUNT(*) FROM supports
UNION ALL
SELECT 'BET_TYPES:', COUNT(*) FROM bet_types
UNION ALL
SELECT 'BET_STATUSES:', COUNT(*) FROM bet_statuses
UNION ALL
SELECT 'PAYMENT_OPERATORS:', COUNT(*) FROM payment_operators
UNION ALL
SELECT 'PLATFORMS:', COUNT(*) FROM platforms;

SELECT 'Tables créées avec succès!' as status;

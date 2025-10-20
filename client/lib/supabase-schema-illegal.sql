-- ============================================
-- TABLES DE RÉFÉRENCE (LOOKUPS)
-- ============================================

-- Table des opérateurs de jeux
CREATE TABLE IF NOT EXISTS operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des plateformes
CREATE TABLE IF NOT EXISTS platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des opérateurs de paiement
CREATE TABLE IF NOT EXISTS payment_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des types de paris
CREATE TABLE IF NOT EXISTS bet_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLES POUR ACTIVITÉS ILLÉGALES
-- ============================================

-- Paris illégaux
CREATE TABLE IF NOT EXISTS illegal_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no SERIAL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(255) NOT NULL,
  platform VARCHAR(255) NOT NULL,
  payment_operator VARCHAR(255) NOT NULL,
  type VARCHAR(255) NOT NULL,
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  phone VARCHAR(20),
  reference VARCHAR(255) NOT NULL,
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id)
);

-- Transactions illégales (Dépôts/Retraits)
CREATE TABLE IF NOT EXISTS illegal_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no SERIAL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(255) NOT NULL,
  platform VARCHAR(255) NOT NULL,
  payment_operator VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('Dépôt', 'Retrait')),
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  phone VARCHAR(20),
  reference VARCHAR(255) NOT NULL,
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id)
);

-- Indexes pour les activités illégales
CREATE INDEX IF NOT EXISTS idx_illegal_bets_date ON illegal_bets(date);
CREATE INDEX IF NOT EXISTS idx_illegal_bets_created_by ON illegal_bets(created_by);
CREATE INDEX IF NOT EXISTS idx_illegal_transactions_date ON illegal_transactions(date);
CREATE INDEX IF NOT EXISTS idx_illegal_transactions_created_by ON illegal_transactions(created_by);

-- Enable RLS
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE illegal_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE illegal_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies pour les tables de référence (lecture publique, modification admin)
CREATE POLICY "Everyone can read operators" ON operators FOR SELECT USING (TRUE);
CREATE POLICY "Admins can insert operators" ON operators FOR INSERT WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');
CREATE POLICY "Admins can update operators" ON operators FOR UPDATE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');
CREATE POLICY "Admins can delete operators" ON operators FOR DELETE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Everyone can read platforms" ON platforms FOR SELECT USING (TRUE);
CREATE POLICY "Admins can insert platforms" ON platforms FOR INSERT WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');
CREATE POLICY "Admins can update platforms" ON platforms FOR UPDATE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');
CREATE POLICY "Admins can delete platforms" ON platforms FOR DELETE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Everyone can read payment_operators" ON payment_operators FOR SELECT USING (TRUE);
CREATE POLICY "Admins can insert payment_operators" ON payment_operators FOR INSERT WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');
CREATE POLICY "Admins can update payment_operators" ON payment_operators FOR UPDATE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');
CREATE POLICY "Admins can delete payment_operators" ON payment_operators FOR DELETE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Everyone can read bet_types" ON bet_types FOR SELECT USING (TRUE);
CREATE POLICY "Admins can insert bet_types" ON bet_types FOR INSERT WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');
CREATE POLICY "Admins can update bet_types" ON bet_types FOR UPDATE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');
CREATE POLICY "Admins can delete bet_types" ON bet_types FOR DELETE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

-- RLS Policies pour illegal_bets
CREATE POLICY "Users can read their own illegal bets" ON illegal_bets
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Admins and controllers can read all illegal bets" ON illegal_bets
  FOR SELECT USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'CONTROLEUR'));

CREATE POLICY "Users can insert their own illegal bets" ON illegal_bets
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins can update illegal bets" ON illegal_bets
  FOR UPDATE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Admins can delete illegal bets" ON illegal_bets
  FOR DELETE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

-- RLS Policies pour illegal_transactions
CREATE POLICY "Users can read their own illegal transactions" ON illegal_transactions
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Admins and controllers can read all illegal transactions" ON illegal_transactions
  FOR SELECT USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'CONTROLEUR'));

CREATE POLICY "Users can insert their own illegal transactions" ON illegal_transactions
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins can update illegal transactions" ON illegal_transactions
  FOR UPDATE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Admins can delete illegal transactions" ON illegal_transactions
  FOR DELETE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

-- ============================================
-- DONNÉES INITIALES
-- ============================================

-- Opérateurs de jeux (basé sur votre Excel)
INSERT INTO operators (name) VALUES
  ('MELBET'),
  ('LINEBET'),
  ('MEGAPARI'),
  ('PARIPESA'),
  ('SPORTPESA'),
  ('AFROPARI'),
  ('BETWINNER'),
  ('GOLDPARI'),
  ('BLAWIN'),
  ('BETLINE'),
  ('BETABET'),
  ('BETPARI'),
  ('NETBET'),
  ('1XBIT'),
  ('MRABET'),
  ('1WIN'),
  ('SPORTSBET'),
  ('MOSTBET'),
  ('BETWAY'),
  ('BETGRO'),
  ('BETANO'),
  ('SPORTAZA'),
  ('STAKE'),
  ('DAFABET'),
  ('RAJABET'),
  ('12BET'),
  ('888STARZ'),
  ('SUPERBET'),
  ('ZENITBET')
ON CONFLICT (name) DO NOTHING;

-- Plateformes
INSERT INTO platforms (name) VALUES
  ('App mobile'),
  ('Site web')
ON CONFLICT (name) DO NOTHING;

-- Opérateurs de paiement
INSERT INTO payment_operators (name) VALUES
  ('Orange Money'),
  ('MTN Mobile Money'),
  ('Moov Money'),
  ('Wave'),
  ('Carte bancaire'),
  ('Virement bancaire')
ON CONFLICT (name) DO NOTHING;

-- Types de paris
INSERT INTO bet_types (name) VALUES
  ('Simple'),
  ('Combiné'),
  ('Système'),
  ('Live')
ON CONFLICT (name) DO NOTHING;

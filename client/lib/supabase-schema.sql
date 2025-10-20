-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  nom VARCHAR(255) NOT NULL,
  prenom VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'CONTROLEUR', 'AGENT')),
  statut VARCHAR(50) NOT NULL CHECK (statut IN ('actif', 'suspendu', 'invitation_envoyee', 'desactive')) DEFAULT 'actif',
  derniere_connexion TIMESTAMP WITH TIME ZONE,
  cree_le TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  mis_a_jour_le TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  mfa_active BOOLEAN DEFAULT FALSE
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(255) NOT NULL,
  platform VARCHAR(255) NOT NULL,
  payment_operator VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('Dépôt', 'Retrait')),
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  phone VARCHAR(20),
  reference VARCHAR(255) UNIQUE NOT NULL,
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  review_status VARCHAR(50) NOT NULL CHECK (review_status IN ('en_cours', 'valide', 'rejete')) DEFAULT 'en_cours',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reject_reason TEXT
);

-- Bets table
CREATE TABLE IF NOT EXISTS bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(255) NOT NULL,
  support VARCHAR(255) NOT NULL,
  bet_type VARCHAR(255) NOT NULL,
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  reference VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('gagné', 'perdu', 'en attente')),
  amount_won_fcfa DECIMAL(15, 2),
  ticket_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  review_status VARCHAR(50) NOT NULL CHECK (review_status IN ('en_cours', 'valide', 'rejete')) DEFAULT 'en_cours',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reject_reason TEXT
);

-- Venues table
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quartier_no VARCHAR(50),
  quartier VARCHAR(255) NOT NULL,
  operator VARCHAR(255) NOT NULL,
  support VARCHAR(255) NOT NULL,
  bet_type VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  contact_phone VARCHAR(20),
  gps_lat DECIMAL(10, 8),
  gps_lng DECIMAL(11, 8),
  notes TEXT
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(255) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  user_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_bets_date ON bets(date);
CREATE INDEX IF NOT EXISTS idx_bets_created_by ON bets(created_by);
CREATE INDEX IF NOT EXISTS idx_bets_reference ON bets(reference);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Enable RLS policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table (simplified to avoid recursion)
CREATE POLICY "Users can read their own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can read all users" ON users
  FOR SELECT USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

-- RLS Policies for transactions
CREATE POLICY "Users can read their own transactions" ON transactions
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Admins and controllers can read all transactions" ON transactions
  FOR SELECT USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'CONTROLEUR'));

CREATE POLICY "Users can insert their own transactions" ON transactions
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins can update transactions" ON transactions
  FOR UPDATE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Admins can delete transactions" ON transactions
  FOR DELETE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

-- RLS Policies for bets
CREATE POLICY "Users can read their own bets" ON bets
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Admins and controllers can read all bets" ON bets
  FOR SELECT USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'CONTROLEUR'));

CREATE POLICY "Users can insert their own bets" ON bets
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins can update bets" ON bets
  FOR UPDATE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Admins can delete bets" ON bets
  FOR DELETE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

-- RLS Policies for venues
CREATE POLICY "Everyone can read venues" ON venues
  FOR SELECT USING (TRUE);

CREATE POLICY "Admins can insert venues" ON venues
  FOR INSERT USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Admins can update venues" ON venues
  FOR UPDATE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Admins can delete venues" ON venues
  FOR DELETE USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

-- RLS Policies for audit_logs
CREATE POLICY "Admins can read audit logs" ON audit_logs
  FOR SELECT USING ((SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "System can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (TRUE);

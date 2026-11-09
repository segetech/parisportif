-- ==============================================================================
-- Migration 01 : Définition des Tables et Contraintes Principales
-- Application : Pari Sportif
-- Idempotente et ré-exécutable en toute sécurité
-- ==============================================================================

-- 1. Table users (liée aux comptes auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'CONTROLEUR', 'AGENT')),
  statut VARCHAR(30) NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'suspendu', 'invitation_envoyee', 'desactive')),
  derniere_connexion TIMESTAMP WITH TIME ZONE,
  cree_le TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  mis_a_jour_le TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index table users
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_statut ON public.users(statut);

-- 2. Table transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(100) NOT NULL,
  support VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('Dépôt', 'Retrait')),
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  phone VARCHAR(30),
  reference VARCHAR(255),
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON public.transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_validation_status ON public.transactions(validation_status);

-- 3. Table bets (paris)
CREATE TABLE IF NOT EXISTS public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(100) NOT NULL,
  support VARCHAR(100) NOT NULL,
  bet_type VARCHAR(100) NOT NULL,
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  amount_won_fcfa DECIMAL(15, 2) DEFAULT 0,
  status VARCHAR(50) NOT NULL,
  reference VARCHAR(255),
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_bets_date ON public.bets(date);
CREATE INDEX IF NOT EXISTS idx_bets_created_by ON public.bets(created_by);
CREATE INDEX IF NOT EXISTS idx_bets_validation_status ON public.bets(validation_status);

-- 4. Table venues (salles de jeux)
CREATE TABLE IF NOT EXISTS public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  operator VARCHAR(100) NOT NULL,
  support VARCHAR(100) NOT NULL,
  bet_type VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  contact_phone VARCHAR(30),
  gps_lat DECIMAL(10, 8),
  gps_lng DECIMAL(11, 8),
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_venues_created_by ON public.venues(created_by);

-- 5. Table audit_logs (journal d'audit centralisé et immutable)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- 6. Table password_resets (jetons de réinitialisation sécurisés)
CREATE TABLE IF NOT EXISTS public.password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON public.password_resets(token_hash);

-- 7. Table illegal_bets (paris illégaux signalés)
CREATE TABLE IF NOT EXISTS public.illegal_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(255) NOT NULL,
  platform VARCHAR(255) NOT NULL,
  payment_operator VARCHAR(255) NOT NULL,
  type VARCHAR(255) NOT NULL,
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  phone VARCHAR(30),
  reference VARCHAR(255) NOT NULL,
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_illegal_bets_date ON public.illegal_bets(date);
CREATE INDEX IF NOT EXISTS idx_illegal_bets_created_by ON public.illegal_bets(created_by);

-- 8. Table illegal_transactions (transactions illégales signalées)
CREATE TABLE IF NOT EXISTS public.illegal_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  operator VARCHAR(255) NOT NULL,
  platform VARCHAR(255) NOT NULL,
  payment_operator VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('Dépôt', 'Retrait')),
  amount_fcfa DECIMAL(15, 2) NOT NULL,
  phone VARCHAR(30),
  reference VARCHAR(255) NOT NULL,
  proof BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_illegal_transactions_date ON public.illegal_transactions(date);
CREATE INDEX IF NOT EXISTS idx_illegal_transactions_created_by ON public.illegal_transactions(created_by);

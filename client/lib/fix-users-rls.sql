-- Corriger les politiques RLS pour la table users
-- Exécutez ce script dans le SQL Editor de Supabase

-- 1. Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "Users can read their own data" ON users;
DROP POLICY IF EXISTS "Admins can read all users" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Admins can insert users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

-- 2. Créer de nouvelles politiques qui permettent la lecture pour les utilisateurs authentifiés
CREATE POLICY "Authenticated users can read their own data" ON users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all users" ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

CREATE POLICY "Authenticated users can update their own data" ON users
  FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can update all users" ON users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

CREATE POLICY "Admins can insert users" ON users
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

CREATE POLICY "Admins can delete users" ON users
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

-- 3. Vérifier que RLS est activé
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 4. Corriger les statuts des utilisateurs existants
UPDATE users 
SET statut = 'actif' 
WHERE statut IN ('ADMIN', 'invitation_envoyee', 'suspendu');

-- 5. Vérifier les utilisateurs
SELECT id, nom, email, role, statut FROM users;

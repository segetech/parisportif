-- Solution simple : Politiques RLS sans récursion pour la table users
-- Exécutez ce script dans le SQL Editor de Supabase

-- 1. Supprimer TOUTES les anciennes politiques
DROP POLICY IF EXISTS "Users can read their own data" ON users;
DROP POLICY IF EXISTS "Admins can read all users" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Admins can insert users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;
DROP POLICY IF EXISTS "Authenticated users can read their own data" ON users;
DROP POLICY IF EXISTS "Authenticated users can update their own data" ON users;

-- 2. Créer des politiques simples sans récursion

-- Permettre à tous les utilisateurs authentifiés de lire leur propre ligne
CREATE POLICY "Users can read own data" ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Permettre à tous les utilisateurs authentifiés de mettre à jour leur propre ligne
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- Pour les opérations ADMIN (INSERT, DELETE, UPDATE d'autres users)
-- On va utiliser les metadata de l'utilisateur Auth au lieu de requêter la table users

-- Permettre l'insertion uniquement via service_role ou fonction serveur
-- Pour l'instant, on autorise tous les utilisateurs authentifiés à insérer
-- (vous pourrez restreindre plus tard avec une fonction serveur)
CREATE POLICY "Authenticated users can insert" ON users
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Vérifier que RLS est activé
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 4. Corriger les statuts
UPDATE users 
SET statut = 'actif' 
WHERE statut != 'actif';

-- 5. Vérifier
SELECT id, nom, email, role, statut FROM users;

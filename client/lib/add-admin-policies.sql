-- Ajouter des politiques pour que les ADMIN puissent gérer tous les utilisateurs
-- Exécutez ce script dans le SQL Editor de Supabase

-- 1. Ajouter une politique pour que les ADMIN puissent lire tous les utilisateurs
-- On utilise les user_metadata de auth.users() au lieu de la table users pour éviter la récursion
CREATE POLICY "Admins can read all users" ON users
  FOR SELECT
  USING (
    auth.uid() = id  -- L'utilisateur peut voir sa propre ligne
    OR 
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'ADMIN'  -- Ou si c'est un ADMIN
  );

-- 2. Permettre aux ADMIN de mettre à jour tous les utilisateurs
CREATE POLICY "Admins can update all users" ON users
  FOR UPDATE
  USING (
    auth.uid() = id  -- L'utilisateur peut modifier sa propre ligne
    OR 
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'ADMIN'  -- Ou si c'est un ADMIN
  );

-- 3. Permettre aux ADMIN de supprimer des utilisateurs
CREATE POLICY "Admins can delete users" ON users
  FOR DELETE
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ADMIN');

-- 4. Vérifier les politiques
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'users';

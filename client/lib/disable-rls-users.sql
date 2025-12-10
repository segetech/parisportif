-- Solution simple : Désactiver RLS sur la table users
-- Pour un système interne, c'est acceptable car tous les utilisateurs sont de confiance
-- Exécutez ce script dans le SQL Editor de Supabase

-- Désactiver RLS sur la table users
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Vérifier
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'users';

-- Note: Avec RLS désactivé, tous les utilisateurs authentifiés peuvent voir et modifier tous les utilisateurs
-- C'est acceptable pour un système interne d'administration
-- Si vous voulez plus de sécurité, il faudra créer une fonction Edge Supabase pour gérer les opérations admin

-- Script pour synchroniser les utilisateurs existants de Supabase Auth vers la table users
-- Exécutez ce script dans le SQL Editor de Supabase

-- Utilisateur 1: pari@buymore.ml
INSERT INTO users (
  id,
  nom,
  prenom,
  email,
  role,
  statut
) VALUES (
  '44764a8a-f3bf-49dd-8d49-e585b95da0ac',
  'Pari',
  'Admin',
  'pari@buymore.ml',
  'ADMIN',
  'actif'
)
ON CONFLICT (id) DO UPDATE SET
  statut = 'actif',
  role = 'ADMIN';

-- Utilisateur 2: seifoulamante@gmail.com
INSERT INTO users (
  id,
  nom,
  prenom,
  email,
  role,
  statut
) VALUES (
  'b0e0efad-dfbe-49e0-9fb0-3fef56dffa94',
  'Seifou',
  'Lamante',
  'seifoulamante@gmail.com',
  'ADMIN', -- Changez en 'CONTROLEUR' ou 'AGENT' si nécessaire
  'actif'
)
ON CONFLICT (id) DO UPDATE SET
  statut = 'actif';

-- Vérifier que les utilisateurs ont été créés
SELECT id, nom, prenom, email, role, statut FROM users;

-- Si vous avez d'autres utilisateurs, ajoutez-les avec le même format:
/*
INSERT INTO users (id, nom, prenom, email, role, statut)
VALUES ('ID_DE_AUTH', 'Nom', 'Prenom', 'email@example.com', 'AGENT', 'actif')
ON CONFLICT (id) DO UPDATE SET statut = 'actif';
*/

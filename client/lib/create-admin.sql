-- Script pour créer un utilisateur admin initial dans Supabase
-- À exécuter dans le SQL Editor de Supabase

-- IMPORTANT: Remplacez ces valeurs par vos informations
-- L'ID doit correspondre à l'ID de l'utilisateur créé dans Supabase Auth

-- Option 1: Si vous avez déjà créé un utilisateur dans Auth
-- Trouvez son ID dans Authentication > Users et utilisez-le ci-dessous

INSERT INTO users (
  id,
  nom,
  prenom,
  email,
  role,
  statut
) VALUES (
  '44764a8a-f3bf-49dd-8d49-e585b95da0ac', -- Remplacez par l'ID de votre utilisateur Auth
  'Admin',
  'Principal',
  'pari@buymore.ml', -- Remplacez par votre email
  'ADMIN',
  'actif'
)
ON CONFLICT (id) DO UPDATE SET
  statut = 'actif',
  role = 'ADMIN';

-- Option 2: Si vous n'avez pas encore d'utilisateur
-- 1. Allez dans Authentication > Users dans Supabase Dashboard
-- 2. Cliquez sur "Add user" > "Create new user"
-- 3. Entrez l'email et le mot de passe
-- 4. Cochez "Auto Confirm User" pour qu'il soit actif immédiatement
-- 5. Copiez l'ID généré
-- 6. Exécutez le script ci-dessus avec cet ID

-- Vérifier que l'utilisateur a été créé
SELECT * FROM users WHERE email = 'pari@buymore.ml';

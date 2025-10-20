-- Corriger les politiques pour permettre aux utilisateurs authentifiés de créer des référentiels
-- (Les ADMIN peuvent toujours tout faire, mais maintenant les autres utilisateurs peuvent aussi créer)

-- Supprimer les anciennes politiques INSERT
DROP POLICY IF EXISTS "Admins can insert operators" ON operators;
DROP POLICY IF EXISTS "Admins can insert platforms" ON platforms;
DROP POLICY IF EXISTS "Admins can insert payment_operators" ON payment_operators;
DROP POLICY IF EXISTS "Admins can insert bet_types" ON bet_types;

-- Créer de nouvelles politiques qui permettent à tous les utilisateurs authentifiés de créer
CREATE POLICY "Authenticated users can insert operators" ON operators 
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert platforms" ON platforms 
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert payment_operators" ON payment_operators 
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert bet_types" ON bet_types 
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

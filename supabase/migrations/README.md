# Migrations SQL Supabase Sécurisées

Ce dossier contient les scripts de migration officiels, idempotents et sécurisés pour la plateforme **Pari Sportif**.

> ⚠️ **IMPORTANT :** 
> - Ces migrations sont préparées et versionnées ici dans le dépôt.
> - Elles **ne doivent pas** être exécutées automatiquement sur une base distante sans confirmation explicite de l'administrateur de production.
> - Pour les appliquer sur votre projet Supabase distant, ouvrez la console **Supabase > SQL Editor** et exécutez-les dans l'ordre numérique ci-dessous.

---

## Ordre d'exécution recommandé

1. **`01_schema_and_tables.sql`**
   - Crée les tables nécessaires (`users`, `transactions`, `bets`, `venues`, `illegal_bets`, `illegal_transactions`, `audit_logs`, `password_resets`) avec leurs colonnes de validation, traçabilité, contraintes et index.

2. **`02_security_functions.sql`**
   - Définit les fonctions d'aide `is_active_user()`, `is_admin()`, `is_controleur_or_admin()`, et `get_auth_role()` avec `SECURITY DEFINER` et `search_path = public` fixe pour éliminer tout risque de récursion RLS.
   - Vérifie systématiquement que `statut = 'actif'`.

3. **`03_rls_policies.sql`**
   - Purge dynamiquement toutes les anciennes politiques permissives sur les tables applicatives (`DROP POLICY IF EXISTS ...`).
   - Active la Row Level Security (RLS) sur toutes les tables.
   - Exige `is_active_user()` pour tout accès direct : les comptes suspendus ou désactivés ne peuvent accéder à aucune ligne (même si `created_by = auth.uid()`).
   - Restreint les agents à l'insertion et à la modification de leurs seules opérations en attente (`validation_status = 'en_attente'`), sans métadonnées de validation.
   - Réserve la validation aux contrôleurs et administrateurs, et la suppression aux seuls administrateurs.
   - Rend le journal d'audit `audit_logs` **immuable** (aucun UPDATE ni DELETE autorisé).

4. **`04_triggers_workflow.sql`**
   - Trigger de protection du profil : bloque toute tentative par un non-administrateur de modifier son propre rôle ou son statut (tout en préservant le backend `service_role`).
   - Trigger de workflow de validation (`BEFORE INSERT OR UPDATE`) :
     - À l'insertion : force l'auteur au compte connecté et le statut à `en_attente` sans métadonnées pour les agents.
     - À la mise à jour : interdit aux agents de modifier le statut de validation, les métadonnées de validation ou l'auteur, et bloque l'édition des opérations validées.
     - Renseigne automatiquement `validated_by` et `validated_at` lors de la validation par un contrôleur ou admin.
   - Trigger d'audit automatique (`AFTER INSERT OR UPDATE OR DELETE`) : consigne chaque mutation métier directement et de manière infalsifiable dans `audit_logs`.

5. **`05_harmonize_validation_status.sql`**
   - Détecte et fait converger les colonnes historiques (`review_status`, `reviewed_by`, etc.) vers les colonnes cibles (`validation_status`, `validated_by`, etc.) sans perte de données.
   - Synchronise `validation_status` ('en_attente', 'valide', 'refuse') de façon idempotente et réexécutable.

---

## ⚠️ Avertissement sur les anciens scripts dans `client/lib/`

Les scripts suivants situés dans `client/lib/` sont **obsolètes et dangereux** car ils désactivaient la sécurité RLS ou accordaient des droits trop larges :
- `disable-rls-users.sql` (Désactive la sécurité sur la table users)
- `fix-all-tables-FORCE.sql` (Politiques permissives `WITH CHECK (true)` accordant tous les droits à n'importe quel compte)
- `fix-lookup-tables-rls.sql`
- `fix-users-rls-simple.sql`

**Ne pas exécuter ces anciens scripts.** Utilisez uniquement les migrations ordonnées de ce dossier `supabase/migrations/`.

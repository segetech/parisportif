# Guide de Déploiement Vercel

## Problème résolu

L'application ne fonctionnait pas sur Vercel car seul le frontend statique était déployé, sans le backend Express nécessaire pour l'authentification.

## Solution implémentée

Conversion des routes Express en **Vercel Serverless Functions**.

## Configuration requise sur Vercel

### Variables d'environnement à ajouter

Allez dans **Vercel Dashboard** → **Votre Projet** → **Settings** → **Environment Variables** et ajoutez :

```
VITE_SUPABASE_URL=<votre_url_supabase>
VITE_SUPABASE_ANON_KEY=<votre_clé_anon_supabase>
SUPABASE_SERVICE_ROLE_KEY=<votre_clé_service_role_supabase>
```

⚠️ **IMPORTANT** : 
- `SUPABASE_SERVICE_ROLE_KEY` doit être la clé **service_role** (pas anon)
- Ajoutez ces variables pour **Production**, **Preview** et **Development**

### Où trouver vos clés Supabase

1. Allez sur [supabase.com](https://supabase.com)
2. Ouvrez votre projet
3. Allez dans **Settings** → **API**
4. Copiez :
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** → `VITE_SUPABASE_ANON_KEY`
   - **service_role** (cliquez "Reveal") → `SUPABASE_SERVICE_ROLE_KEY`

## Fichiers créés

### `/api/auth/login.ts`
Serverless function pour l'authentification (remplace `/api/auth/login` Express)

### `/api/dashboard/data.ts`
Serverless function pour les données du dashboard

### `vercel.json` (modifié)
Configuration pour router les appels `/api/*` vers les serverless functions

## Déploiement

### Option 1 : Via Git (Recommandé)

1. Commitez les changements :
```bash
git add .
git commit -m "feat: Add Vercel serverless functions for authentication"
git push
```

2. Vercel redéploiera automatiquement

### Option 2 : Via CLI Vercel

```bash
pnpm add -g vercel
vercel --prod
```

## Vérification

Après déploiement :

1. Ouvrez votre site Vercel
2. Essayez de vous connecter
3. Vérifiez la console du navigateur (F12) pour les erreurs
4. Si erreur 500, vérifiez les logs Vercel : **Dashboard** → **Deployments** → **Functions**

## Architecture

**Avant** :
```
Vercel → dist/spa (statique uniquement)
         ❌ Pas de backend
```

**Maintenant** :
```
Vercel → dist/spa (frontend)
      → /api/* (serverless functions)
         ✅ Backend fonctionnel
```

## Prochaines étapes

Si vous avez d'autres routes API dans `server/routes/`, créez les serverless functions correspondantes dans `/api/`.

Exemple pour `server/routes/demo.ts` :
- Créer `/api/demo.ts`
- Même structure que `/api/auth/login.ts`
- Exporter `export default async function handler(req, res) { ... }`

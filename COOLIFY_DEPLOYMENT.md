# 🚀 Guide de Déploiement sur VPS avec Coolify

Ce guide vous explique pas à pas comment déployer l'application **Pari Sportif** sur votre propre VPS grâce à **Coolify** et Docker.

---

## 1. Prérequis sur votre Coolify

- Une instance **Coolify** fonctionnelle sur votre VPS.
- Votre projet poussé sur un dépôt Git (**GitHub**, **GitLab**, ou Git privé).
- Un nom de domaine ou sous-domaine pointant vers l'adresse IP de votre VPS (ex: `paris.mondomaine.com`).
- Vos identifiants et clés **Supabase**.

---

## 2. Fichiers de configuration inclus

Le projet contient déjà tous les fichiers nécessaires pour Coolify :
- **`Dockerfile`** : Build multi-stage optimisé (compilation du client Vite + serveur Express Node 22, image légère en production).
- **`.dockerignore`** : Exclusion des fichiers inutiles pour un build rapide et sécurisé.
- **`server/node-build.ts`** : Point d'entrée de production qui sert à la fois les routes `/api/*` et le front-end React SPA sur le port `3000`.

---

## 3. Étapes de Déploiement dans Coolify

### Étape 1 : Créer la ressource dans Coolify
1. Connectez-vous à votre interface **Coolify**.
2. Allez dans votre **Projet** > votre **Environnement** (ex: `production`).
3. Cliquez sur **+ New Resource** > **Public Repository** ou **Private Repository (GitHub App / Deploy Key)**.
4. Renseignez l'URL de votre dépôt Git et la branche principale (`main` ou `master`).

### Étape 2 : Configuration du Build Pack
- Coolify va automatiquement détecter le **`Dockerfile`** à la racine du projet.
- Si demandé, sélectionnez le Build Pack : **Dockerfile**.
- Port d'écoute : **`3000`** *(déjà configuré par défaut)*.

### Étape 3 : Variables d'environnement (Crucial ⚠️)
Dans l'onglet **Environment Variables** de votre application Coolify, ajoutez les variables suivantes :

| Variable | Valeur | Type dans Coolify |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | ✅ **Build Variable** + Runtime |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | ✅ **Build Variable** + Runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | Runtime |
| `PORT` | `3000` | Runtime |
| `NODE_ENV` | `production` | Runtime |

> ⚠️ **IMPORTANT :** Pour `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, assurez-vous de cocher la case **"Build Variable"** dans Coolify. En effet, Vite a besoin de ces valeurs **pendant la compilation** pour les intégrer au code JavaScript du navigateur.

### Étape 4 : Domaine et SSL
1. Dans l'onglet **General**, renseignez votre nom de domaine complet :
   ```
   https://paris.mondomaine.com
   ```
2. Coolify configurera automatiquement le proxy inverse (Traefik) et générera le certificat HTTPS Let's Encrypt gratuit.

### Étape 5 : Déploiement
1. Cliquez sur le bouton **Deploy**.
2. Vous pouvez suivre les logs du build Docker en direct dans l'onglet **Logs**.
3. Une fois terminé, le statut passe au vert (**Healthy / Running**) et votre application est accessible en HTTPS !

---

## 4. Mises à jour ultérieures

Grâce aux webhooks Git de Coolify :
- Dès que vous ferez un `git push` sur votre branche principale, Coolify reconstruira et redéploiera automatiquement la nouvelle version sans interruption de service.

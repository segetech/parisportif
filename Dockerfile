# ==========================================
# 1. Étape de Build (Client React SPA + Serveur Express)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Installer la version exacte de pnpm utilisée par le projet
RUN npm install -g pnpm@10.14.0

# Copie des manifestes de dépendances
COPY package.json pnpm-lock.yaml ./

# Installation complète des dépendances
RUN pnpm install --frozen-lockfile

# Arguments de build nécessaires pour Vite (injectés par Coolify)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Copie de l'intégralité du code source
COPY . .

# Compilation : client (dist/spa) + serveur Node (dist/server)
RUN pnpm run build

# ==========================================
# 2. Étape de Production (Image allégée et sécurisée)
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

# Outils système (curl requis pour le healthcheck Docker / Coolify)
RUN apk add --no-cache curl && npm install -g pnpm@10.14.0

ENV NODE_ENV=production
ENV PORT=3000

# Installation des dépendances de production uniquement
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copie des artefacts compilés depuis l'étape builder
COPY --from=builder /app/dist ./dist

# Sécurisation : exécution avec l'utilisateur non-root "node"
RUN chown -R node:node /app
USER node

# Port d'écoute du serveur
EXPOSE 3000

# Healthcheck natif Docker & Coolify
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Commande de démarrage du serveur unifié
CMD ["node", "dist/server/node-build.mjs"]

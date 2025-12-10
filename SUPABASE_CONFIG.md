# Configuration Supabase pour la création d'utilisateurs

## Désactiver la confirmation d'email

Pour que les utilisateurs créés par l'admin soient directement actifs sans avoir à confirmer leur email :

### Étapes dans le Dashboard Supabase :

1. **Aller dans Authentication > Settings**
2. **Trouver la section "Email Auth"**
3. **Désactiver "Enable email confirmations"**
   - Décochez la case "Enable email confirmations"
   - Ou mettez "Confirm email" sur OFF

### Alternative : Configuration par code

Si vous voulez garder la confirmation email pour les inscriptions publiques mais pas pour les créations admin, vous pouvez utiliser l'API Admin de Supabase.

Pour cela, il faudrait créer une fonction côté serveur qui utilise la clé service_role :

```typescript
// Côté serveur uniquement (avec service_role key)
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Clé admin
)

// Créer un utilisateur sans confirmation email
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email: 'user@example.com',
  password: 'password123',
  email_confirm: true, // Confirme automatiquement l'email
  user_metadata: {
    nom: 'Nom',
    prenom: 'Prénom',
    role: 'AGENT'
  }
})
```

## Configuration actuelle

Pour l'instant, le code côté client utilise `supabase.auth.signUp()` qui respecte les paramètres de confirmation email de votre projet Supabase.

**Recommandation** : Désactivez simplement la confirmation d'email dans les paramètres Supabase pour que tous les utilisateurs créés soient immédiatement actifs.

## Email de bienvenue (Optionnel)

Si vous voulez envoyer un email de bienvenue personnalisé avec les identifiants :

1. **Option 1** : Utiliser un service d'email externe (SendGrid, Mailgun, etc.)
2. **Option 2** : Créer un template d'email personnalisé dans Supabase
3. **Option 3** : Utiliser une fonction Edge de Supabase pour envoyer l'email

Pour l'instant, les identifiants sont :
- Affichés dans un toast pendant 15 secondes
- Copiés automatiquement dans le presse-papiers
- L'admin peut les communiquer manuellement à l'utilisateur

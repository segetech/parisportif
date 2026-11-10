import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import fs from "fs";
import path from "path";

describe("Real Isolated PostgreSQL 18 Integration Tests (Dedicated Instance)", () => {
  const DEDICATED_PORT = Number(process.env.TEST_PG_PORT) || 5435;
  const TEST_DB = `test_pari_sportif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let masterClient: Client;
  let trackedClients: Client[] = [];

  // UUIDs déterministes pour les fixtures
  const ADMIN_1_ID = "11111111-1111-1111-1111-111111111111";
  const ADMIN_2_ID = "22222222-2222-2222-2222-222222222222";
  const AGENT_A_ID = "33333333-3333-3333-3333-333333333333";
  const AGENT_B_ID = "44444444-4444-4444-4444-444444444444";
  const CONTROLEUR_ID = "55555555-5555-5555-5555-555555555555";
  const SUSPENDED_ID = "66666666-6666-6666-6666-666666666666";
  const PENDING_PWD_ID = "77777777-7777-7777-7777-777777777777";

  beforeAll(async () => {
    // 1. Interdiction formelle du port 5432
    if (DEDICATED_PORT === 5432) {
      throw new Error(
        "INTERDICTION DE SECURITE : Le port 5432 est formellement interdit pour les tests isolés. " +
        "Les tests doivent obligatoirement cibler l'instance dédiée sur le port 5435."
      );
    }

    // 2. Connexion exclusive sur 127.0.0.1:5435
    masterClient = new Client({
      host: "127.0.0.1",
      port: DEDICATED_PORT,
      user: "postgres",
      database: "postgres",
      connectionTimeoutMillis: 3000,
    });

    try {
      await masterClient.connect();
    } catch (connErr: any) {
      throw new Error(
        `ENVIRONNEMENT SQL DEDIE MANQUANT : Impossible de joindre l'instance PostgreSQL isolée sur le port ${DEDICATED_PORT}.\n` +
        `Détails : ${connErr.message}\n` +
        `Rappel : Aucun rabattement vers le port 5432 n'est autorisé afin d'éviter toute pollution ou corruption.`
      );
    }

    // 3. Vérification que l'instance connectée est bien sur le port attendu
    const portRes = await masterClient.query("SELECT inet_server_port() as port;");
    const actualPort = Number(portRes.rows[0].port);
    if (actualPort !== DEDICATED_PORT) {
      throw new Error(`Incohérence critique de port : connecté au port ${actualPort} au lieu de ${DEDICATED_PORT}.`);
    }

    // 4. Création d'une base au nom UNIQUE pour ce lancement
    await masterClient.query(`CREATE DATABASE "${TEST_DB}";`);

    // 5. Initialisation du schéma et des migrations dans la base isolée
    const dbClient = new Client({
      host: "127.0.0.1",
      port: DEDICATED_PORT,
      user: "postgres",
      database: TEST_DB,
    });
    await dbClient.connect();

    try {
      // Schéma auth minimal Supabase
      await dbClient.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon NOLOGIN;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated NOLOGIN;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role NOLOGIN;
          END IF;
        END $$;

        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";

        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE,
          raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
          SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$ LANGUAGE sql STABLE;

        CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
          SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text;
        $$ LANGUAGE sql STABLE;

        CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS $$
          SELECT NULLIF(current_setting('request.jwt.claim.email', true), '')::text;
        $$ LANGUAGE sql STABLE;
      `);

      // Application stricte de toutes les migrations 01 à 08
      const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
      const migrationFiles = [
        "01_schema_and_tables.sql",
        "02_security_functions.sql",
        "03_rls_policies.sql",
        "04_triggers_workflow.sql",
        "05_harmonize_and_harden.sql",
        "06_unified_business_model.sql",
        "07_atomic_admin_and_password_policy.sql",
        "08_secure_dashboard_and_password_policy.sql",
      ];

      for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Migration attendue introuvable : ${file}`);
        }
        const sql = fs.readFileSync(filePath, "utf-8");
        // En cas d'erreur de migration, ne pas masquer : lever l'exception
        await dbClient.query(sql);
      }

      // Privilèges de base pour les rôles authenticated et anon afin que RLS soit le seul filtre
      await dbClient.query(`
        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      `);

      // Fixtures des comptes d'utilisateurs de test
      await dbClient.query(`
        INSERT INTO auth.users (id, email) VALUES
          ('${ADMIN_1_ID}', 'admin1@parisportif.com'),
          ('${ADMIN_2_ID}', 'admin2@parisportif.com'),
          ('${AGENT_A_ID}', 'agent.a@parisportif.com'),
          ('${AGENT_B_ID}', 'agent.b@parisportif.com'),
          ('${CONTROLEUR_ID}', 'controleur@parisportif.com'),
          ('${SUSPENDED_ID}', 'suspended@parisportif.com'),
          ('${PENDING_PWD_ID}', 'pending.pwd@parisportif.com')
        ON CONFLICT (id) DO NOTHING;

        -- Désactiver temporairement les triggers pour l'injection des fixtures
        ALTER TABLE public.users DISABLE TRIGGER ALL;
        DELETE FROM public.users;

        INSERT INTO public.users (id, email, nom, role, statut, must_change_password) VALUES
          ('${ADMIN_1_ID}', 'admin1@parisportif.com', 'Admin 1', 'ADMIN', 'actif', false),
          ('${ADMIN_2_ID}', 'admin2@parisportif.com', 'Admin 2', 'ADMIN', 'actif', false),
          ('${AGENT_A_ID}', 'agent.a@parisportif.com', 'Agent A', 'AGENT', 'actif', false),
          ('${AGENT_B_ID}', 'agent.b@parisportif.com', 'Agent B', 'AGENT', 'actif', false),
          ('${CONTROLEUR_ID}', 'controleur@parisportif.com', 'Controleur', 'CONTROLEUR', 'actif', false),
          ('${SUSPENDED_ID}', 'suspended@parisportif.com', 'Suspendu', 'AGENT', 'suspendu', false),
          ('${PENDING_PWD_ID}', 'pending.pwd@parisportif.com', 'Pending', 'AGENT', 'actif', true);

        ALTER TABLE public.users ENABLE TRIGGER ALL;

        -- Injection des données d'activité de test
        DELETE FROM public.bets;
        DELETE FROM public.transactions;
        DELETE FROM public.venues;

        -- Paris de l'Agent A (2 paris : 10 000 FCFA gagné 15 000, 5 000 FCFA en attente)
        INSERT INTO public.bets (operator, support, bet_type, amount_fcfa, status, amount_won_fcfa, validation_status, created_by, date, time) VALUES
          ('1xBet', 'En ligne', 'Simple', 10000, 'Gagné', 15000, 'valide', '${AGENT_A_ID}', '2026-11-10', '14:00:00'),
          ('1xBet', 'En ligne', 'Combiné', 5000, 'En attente', NULL, 'en_attente', '${AGENT_A_ID}', '2026-11-10', '14:15:00');

        -- Paris de l'Agent B (1 pari : 20 000 FCFA perdu)
        INSERT INTO public.bets (operator, support, bet_type, amount_fcfa, status, amount_won_fcfa, validation_status, created_by, date, time) VALUES
          ('PremierBet', 'Application', 'Simple', 20000, 'Perdu', 0, 'valide', '${AGENT_B_ID}', '2026-11-10', '15:30:00');

        -- Transactions de l'Agent A (1 dépôt de 50 000 FCFA, 1 retrait de 20 000 FCFA)
        INSERT INTO public.transactions (operator, support, type, amount_fcfa, validation_status, created_by, date, time) VALUES
          ('1xBet', 'En ligne', 'Dépôt', 50000, 'valide', '${AGENT_A_ID}', '2026-11-10', '10:00:00'),
          ('1xBet', 'En ligne', 'Retrait', 20000, 'en_attente', '${AGENT_A_ID}', '2026-11-10', '11:00:00');

        -- Salles de jeux
        INSERT INTO public.venues (name, operator, support, bet_type, quartier, address, validation_status, created_by) VALUES
          ('Salle 1xBet ACI', '1xBet', 'Physique', 'Keno', 'Hamdallaye ACI', 'Rue 123', 'valide', '${AGENT_A_ID}'),
          ('Salle PremierBet Faladié', 'PremierBet', 'Physique', 'Roulette', 'Faladié', 'Carrefour Tour', 'valide', '${AGENT_B_ID}');
      `);
    } finally {
      await dbClient.end();
    }
  });

  afterAll(async () => {
    // 1. Fermeture garantie de toutes les connexions clientes ouvertes pendant les tests
    for (const c of trackedClients) {
      try {
        await c.end();
      } catch {}
    }
    trackedClients = [];

    // 2. Nettoyage de la base de données dédiée créée par ce lancement uniquement
    if (masterClient) {
      try {
        await masterClient.query(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE);`);
      } catch (err) {
        console.warn("Avertissement nettoyage base test:", err);
      }
      try {
        await masterClient.end();
      } catch {}
    }
  });

  async function createTestClient(): Promise<Client> {
    const client = new Client({
      host: "127.0.0.1",
      port: DEDICATED_PORT,
      user: "postgres",
      database: TEST_DB,
    });
    await client.connect();
    trackedClients.push(client);
    return client;
  }

  async function impersonate(client: Client, userId: string) {
    await client.query("SET LOCAL role = 'authenticated';");
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${userId}', true);`);
    await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true);");
  }

  // ----------------------------------------------------------------------------
  // SUITE 1 : SÉCURITÉ DE GET_DASHBOARD_AGGREGATES()
  // ----------------------------------------------------------------------------
  describe("1. get_dashboard_aggregates() : Modèle de Sécurité et Scoping Rôle", () => {
    it("doit refuser strictement les appels anonymes sans identité vérifiée", async () => {
      const client = await createTestClient();
      await client.query("BEGIN;");
      await client.query("SET LOCAL role = 'anon';");
      await client.query("RESET request.jwt.claim.sub;");
      await client.query("RESET request.jwt.claim.role;");

      let errorThrown = false;
      try {
        await client.query("SELECT public.get_dashboard_aggregates();");
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toMatch(/(AUTHENTICATION_REQUIRED|permission denied)/i);
      }
      await client.query("ROLLBACK;");
      expect(errorThrown).toBe(true);
    });

    it("doit refuser un appel émanant d'un compte suspendu ou inactif", async () => {
      const client = await createTestClient();
      await client.query("BEGIN;");
      await client.query("SET LOCAL role = 'authenticated';");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${SUSPENDED_ID}';`);
      await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");

      let errorThrown = false;
      try {
        await client.query("SELECT public.get_dashboard_aggregates();");
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toMatch(/ACCOUNT_INACTIVE/i);
      }
      await client.query("ROLLBACK;");
      expect(errorThrown).toBe(true);
    });

    it("doit refuser un compte soumis au renouvellement obligatoire de mot de passe", async () => {
      const client = await createTestClient();
      await client.query("BEGIN;");
      await client.query("SET LOCAL role = 'authenticated';");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${PENDING_PWD_ID}';`);
      await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");

      let errorThrown = false;
      try {
        await client.query("SELECT public.get_dashboard_aggregates();");
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toMatch(/PASSWORD_RENEWAL_REQUIRED/i);
      }
      await client.query("ROLLBACK;");
      expect(errorThrown).toBe(true);
    });

    it("doit restreindre strictement un AGENT à son propre périmètre (même s'il passe l'ID d'un autre agent)", async () => {
      const client = await createTestClient();
      await client.query("BEGIN;");
      await client.query("SET LOCAL role = 'authenticated';");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${AGENT_A_ID}';`);
      await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");

      // L'Agent A tente frauduleusement de demander les agrégats de l'Agent B
      const res = await client.query(`SELECT public.get_dashboard_aggregates('${AGENT_B_ID}'::uuid) as agg;`);
      const agg = res.rows[0].agg;

      // Doit renvoyer UNIQUEMENT les 2 paris de l'Agent A (15 000 FCFA au total), ignorant le paramètre Agent B
      expect(Number(agg.total_bets)).toBe(2);
      expect(Number(agg.total_bets_amount)).toBe(15000);
      expect(Number(agg.total_known_winnings)).toBe(15000);
      expect(Number(agg.won_bets_count)).toBe(1);
      expect(Number(agg.pending_bets_count)).toBe(1);
      expect(Number(agg.total_deposits)).toBe(50000);
      expect(Number(agg.total_withdrawals)).toBe(20000);
      expect(Number(agg.total_venues)).toBe(1); // Uniquement la salle créée par Agent A

      await client.query("ROLLBACK;");
    });

    it("doit permettre à un ADMIN ou CONTROLEUR de voir les totaux consolidés ou de filtrer par agent", async () => {
      const client = await createTestClient();
      await client.query("BEGIN;");
      await client.query("SET LOCAL role = 'authenticated';");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${ADMIN_1_ID}';`);
      await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");

      // Vue globale (sans filtre) : consolidation de tous les agents (2 paris A + 1 pari B = 3 paris, 35 000 FCFA)
      const globalRes = await client.query("SELECT public.get_dashboard_aggregates(NULL) as agg;");
      const globalAgg = globalRes.rows[0].agg;
      expect(Number(globalAgg.total_bets)).toBe(3);
      expect(Number(globalAgg.total_bets_amount)).toBe(35000);
      expect(Number(globalAgg.total_venues)).toBe(2);

      // Vue filtrée par l'administrateur sur l'Agent B
      const filteredRes = await client.query(`SELECT public.get_dashboard_aggregates('${AGENT_B_ID}'::uuid) as agg;`);
      const filteredAgg = filteredRes.rows[0].agg;
      expect(Number(filteredAgg.total_bets)).toBe(1);
      expect(Number(filteredAgg.total_bets_amount)).toBe(20000);

      await client.query("ROLLBACK;");
    });
  });

  // ----------------------------------------------------------------------------
  // SUITE 2 : BLOCAGE RLS DES ACCÈS MÉTIER EN CAS DE RENOUVELLEMENT DE MOT DE PASSE
  // ----------------------------------------------------------------------------
  describe("2. RLS & Renouvellement Obligatoire du Mot de Passe", () => {
    it("doit bloquer toute lecture des tables métier pour un compte soumis au renouvellement", async () => {
      const client = await createTestClient();
      await client.query("BEGIN;");
      await client.query("SET LOCAL role = 'authenticated';");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${PENDING_PWD_ID}';`);
      await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");

      // RLS doit masquer l'ensemble des enregistrements des tables opérationnelles
      const betsRes = await client.query("SELECT * FROM public.bets;");
      expect(betsRes.rows).toHaveLength(0);

      const txRes = await client.query("SELECT * FROM public.transactions;");
      expect(txRes.rows).toHaveLength(0);

      const venuesRes = await client.query("SELECT * FROM public.venues;");
      expect(venuesRes.rows).toHaveLength(0);

      await client.query("ROLLBACK;");
    });

    it("doit interdire l'insertion de paris ou transactions pour un compte soumis au renouvellement", async () => {
      const client = await createTestClient();
      await client.query("BEGIN;");
      await client.query("SET LOCAL role = 'authenticated';");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${PENDING_PWD_ID}';`);
      await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");

      let insertError = false;
      try {
        await client.query(`
          INSERT INTO public.bets (operator, support, bet_type, amount_fcfa, status, validation_status, created_by, date, time)
          VALUES ('1xBet', 'En ligne', 'Simple', 1000, 'en_attente', 'en_attente', '${PENDING_PWD_ID}', '2026-11-10', '16:00:00');
        `);
      } catch (err: any) {
        insertError = true;
        expect(err.message).toMatch(/(row-level security policy|violates row-level security)/i);
      }

      await client.query("ROLLBACK;");
      expect(insertError).toBe(true);
    });

    it("doit autoriser l'utilisateur soumis au renouvellement à lire EXCLUSIVEMENT son propre profil minimal", async () => {
      const client = await createTestClient();
      await client.query("BEGIN;");
      await client.query("SET LOCAL role = 'authenticated';");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${PENDING_PWD_ID}';`);
      await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");

      // L'utilisateur peut lire son propre profil
      const ownProfileRes = await client.query(`SELECT id, email, must_change_password FROM public.users WHERE id = '${PENDING_PWD_ID}';`);
      expect(ownProfileRes.rows).toHaveLength(1);
      expect(ownProfileRes.rows[0].must_change_password).toBe(true);

      // Mais il ne peut pas voir les profils des tiers
      const allUsersRes = await client.query("SELECT * FROM public.users;");
      expect(allUsersRes.rows).toHaveLength(1);
      expect(allUsersRes.rows[0].id).toBe(PENDING_PWD_ID);

      await client.query("ROLLBACK;");
    });
  });

  // ----------------------------------------------------------------------------
  // SUITE 3 : PROTECTION CONTRE LA FALSIFICATION DIRECTE DES ATTRIBUTS DE SÉCURITÉ
  // ----------------------------------------------------------------------------
  describe("3. Protection des Attributs de Sécurité (Triggers & Permissions)", () => {
    it("doit interdire à un utilisateur de lever lui-même son must_change_password par SQL direct", async () => {
      const client = await createTestClient();
      await client.query("BEGIN;");
      await client.query("SET LOCAL role = 'authenticated';");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${PENDING_PWD_ID}';`);
      await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");

      let errorThrown = false;
      try {
        await client.query(`UPDATE public.users SET must_change_password = false WHERE id = '${PENDING_PWD_ID}';`);
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toMatch(/SECURITE_ATTRIBUT_PROTEGE/);
      }

      await client.query("ROLLBACK;");
      expect(errorThrown).toBe(true);
    });

    it("doit interdire à un agent de s'auto-promouvoir ADMIN", async () => {
      const client = await createTestClient();
      await client.query("BEGIN;");
      await client.query("SET LOCAL role = 'authenticated';");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${AGENT_A_ID}';`);
      await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");

      let errorThrown = false;
      try {
        await client.query(`UPDATE public.users SET role = 'ADMIN' WHERE id = '${AGENT_A_ID}';`);
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toMatch(/(SECURITE_ATTRIBUT_PROTEGE|Interdiction)/i);
      }

      await client.query("ROLLBACK;");
      expect(errorThrown).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // SUITE 4 : CONCURRENCE RÉELLE DU DERNIER ADMINISTRATEUR ACTIF
  // ----------------------------------------------------------------------------
  describe("4. Concurrence Réelle sur Deux Connexions : Protection du Dernier Administrateur", () => {
    it("doit sérialiser deux transactions concurrentes rétrogradant les 2 derniers administrateurs et rejeter la seconde", async () => {
      const client1 = await createTestClient();
      const client2 = await createTestClient();

      // Démarrage de deux transactions distinctes
      await client1.query("BEGIN;");
      await client2.query("BEGIN;");

      // Client 1 acquiert le verrou exclusif en rétrogradant Admin 1
      await client1.query(`UPDATE public.users SET role = 'AGENT' WHERE id = '${ADMIN_1_ID}';`);

      // Client 2 tente simultanément de rétrograder Admin 2 (la promesse attend que le verrou soit libéré)
      let client2Finished = false;
      let client2Error: any = null;

      const client2Promise = client2
        .query(`UPDATE public.users SET role = 'AGENT' WHERE id = '${ADMIN_2_ID}';`)
        .then(() => {
          client2Finished = true;
        })
        .catch((err) => {
          client2Finished = true;
          client2Error = err;
        });

      // Vérifier que Client 2 est bien en attente de verrou et n'a pas encore fini
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(client2Finished).toBe(false);

      // Client 1 valide sa transaction : libération du verrou transactionnel
      await client1.query("COMMIT;");

      // Attendre la résolution de Client 2
      await client2Promise;
      await client2.query("ROLLBACK;");

      // Client 2 a dû lever l'exception stricte INTERDICTION_DERNIER_ADMIN
      expect(client2Error).toBeDefined();
      expect(client2Error.message).toMatch(/INTERDICTION_DERNIER_ADMIN/);

      // Vérification finale : il reste exactement 1 administrateur actif en base
      const checkRes = await client1.query(
        "SELECT COUNT(*) as count FROM public.users WHERE role = 'ADMIN' AND statut = 'actif';"
      );
      expect(Number(checkRes.rows[0].count)).toBe(1);
    });

    it("doit refuser une commande DELETE ou UPDATE multi-lignes ciblant tous les administrateurs", async () => {
      const client = await createTestClient();

      let errorThrown = false;
      try {
        await client.query("UPDATE public.users SET statut = 'suspendu' WHERE role = 'ADMIN';");
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toMatch(/INTERDICTION_DERNIER_ADMIN/);
      }
      expect(errorThrown).toBe(true);

      // Vérifier qu'aucun administrateur n'a été corrompu
      const checkRes = await client.query(
        "SELECT COUNT(*) as count FROM public.users WHERE role = 'ADMIN' AND statut = 'actif';"
      );
      expect(Number(checkRes.rows[0].count)).toBeGreaterThanOrEqual(1);
    });

    it("doit appliquer les RLS sur import_batches (insertion/mise à jour par utilisateur actif, blocage sous renouvellement)", async () => {
      const client = await createTestClient();

      // 1. Agent actif sans restriction mot de passe crée un lot d'import
      await client.query("BEGIN;");
      await impersonate(client, AGENT_A_ID);
      const batchId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      await client.query(`
        INSERT INTO public.import_batches (id, file_name, sheet_name, entity_type, total_rows, imported_rows, status, imported_by)
        VALUES ('${batchId}', 'test.xlsx', 'pari', 'bets', 10, 10, 'en_cours', '${AGENT_A_ID}');
      `);

      // 2. Mise à jour du lot à 'termine' par le même agent
      const updateRes = await client.query(`
        UPDATE public.import_batches SET status = 'termine' WHERE id = '${batchId}' RETURNING status;
      `);
      expect(updateRes.rows[0].status).toBe("termine");
      await client.query("COMMIT;");

      // 3. Utilisateur sous renouvellement de mot de passe tente de créer un lot -> bloqué par RLS
      await client.query("BEGIN;");
      await impersonate(client, PENDING_PWD_ID);
      const forbiddenBatchId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
      let blocked = false;
      try {
        await client.query(`
          INSERT INTO public.import_batches (id, file_name, sheet_name, entity_type, total_rows, imported_rows, status, imported_by)
          VALUES ('${forbiddenBatchId}', 'hack.xlsx', 'pari', 'bets', 1, 1, 'termine', '${PENDING_PWD_ID}');
        `);
      } catch (e: any) {
        blocked = true;
      }
      await client.query("ROLLBACK;");
      expect(blocked).toBe(true);
    });

    it("doit autoriser l'agent à créer les jeux de ses salles et bloquer l'agent sous renouvellement", async () => {
      const client = await createTestClient();

      // 1. Agent A crée une salle puis insère ses jeux
      await client.query("BEGIN;");
      await impersonate(client, AGENT_A_ID);
      const venueId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
      await client.query(`
        INSERT INTO public.venues (id, name, quartier, operator, support, bet_type, address, created_by)
        VALUES ('${venueId}', 'Salle ACI Express', 'Hamdallaye ACI', '1xBet', 'Physique', 'Loto', 'Rue 12', '${AGENT_A_ID}');
      `);

      const gameId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
      await client.query(`
        INSERT INTO public.venue_games (id, venue_id, game_name, active)
        VALUES ('${gameId}', '${venueId}', 'Spin 2 Win', true);
      `);

      const gamesRes = await client.query(`SELECT game_name FROM public.venue_games WHERE id = '${gameId}';`);
      expect(gamesRes.rows[0].game_name).toBe("Spin 2 Win");
      await client.query("COMMIT;");

      // 2. Utilisateur sous renouvellement de mot de passe est bloqué en lecture / écriture
      await client.query("BEGIN;");
      await impersonate(client, PENDING_PWD_ID);
      const readBlocked = await client.query(`SELECT * FROM public.venue_games;`);
      expect(readBlocked.rows.length).toBe(0);
      await client.query("ROLLBACK;");
    });
  });
});

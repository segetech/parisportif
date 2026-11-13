import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import fs from "fs";
import path from "path";

describe("Isolated PostgreSQL: Comments, Authoritative History & RLS", () => {
  const DEDICATED_PORT = Number(process.env.TEST_PG_PORT) || 5435;
  const TEST_DB = `test_comments_hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  let masterClient: Client;
  const trackedClients: Client[] = [];

  const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
  const CONTROLEUR_ID = "22222222-2222-2222-2222-222222222222";
  const AGENT_A_ID = "33333333-3333-3333-3333-333333333333";
  const AGENT_B_ID = "44444444-4444-4444-4444-444444444444";
  const SUSPENDED_ID = "55555555-5555-5555-5555-555555555555";
  const PENDING_PWD_ID = "66666666-6666-6666-6666-666666666666";

  let betAId: string;
  let betBId: string;
  let txAId: string;

  async function openDbClient(): Promise<Client> {
    const c = new Client({
      host: "127.0.0.1",
      port: DEDICATED_PORT,
      user: "postgres",
      database: TEST_DB,
    });
    await c.connect();
    trackedClients.push(c);
    return c;
  }

  async function asAuthenticated<T>(
    userId: string,
    fn: (client: Client) => Promise<T>,
  ): Promise<T> {
    const client = await openDbClient();
    await client.query("BEGIN");
    try {
      await client.query(`SET LOCAL ROLE authenticated`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      const res = await fn(client);
      await client.query("COMMIT");
      return res;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      await client.end().catch(() => {});
    }
  }

  async function asAnon<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = await openDbClient();
    await client.query("BEGIN");
    try {
      await client.query(`SET LOCAL ROLE anon`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
      await client.query(`SELECT set_config('request.jwt.claim.role', 'anon', true)`);
      const res = await fn(client);
      await client.query("COMMIT");
      return res;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      await client.end().catch(() => {});
    }
  }

  beforeAll(async () => {
    if (DEDICATED_PORT === 5432) {
      throw new Error("SECURITY BLOCK: Port 5432 is forbidden for isolated SQL tests.");
    }

    masterClient = new Client({
      host: "127.0.0.1",
      port: DEDICATED_PORT,
      user: "postgres",
      database: "postgres",
      connectionTimeoutMillis: 3000,
    });
    await masterClient.connect();

    const portRes = await masterClient.query("SELECT inet_server_port() AS port");
    if (Number(portRes.rows[0].port) !== DEDICATED_PORT) {
      throw new Error(`Unexpected port: ${portRes.rows[0].port}`);
    }

    await masterClient.query(`CREATE DATABASE "${TEST_DB}";`);

    const dbClient = await openDbClient();
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

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
          CREATE PUBLICATION supabase_realtime;
        END IF;
      END $$;
    `);

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
      "09_restore_lookup_tables_rls.sql",
      "10_shared_data_access_and_cleanup.sql",
      "11_fix_triggers_and_bets_constraints.sql",
      "12_comments_history_realtime_hardening.sql",
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      await dbClient.query(sql);
    }

    await dbClient.query(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.bets, public.transactions, public.venues TO authenticated;
      GRANT SELECT ON public.users TO authenticated;
    `);

    await dbClient.query(`
      INSERT INTO auth.users (id, email) VALUES
        ('${ADMIN_ID}', 'admin@test.local'),
        ('${CONTROLEUR_ID}', 'ctrl@test.local'),
        ('${AGENT_A_ID}', 'agenta@test.local'),
        ('${AGENT_B_ID}', 'agentb@test.local'),
        ('${SUSPENDED_ID}', 'suspended@test.local'),
        ('${PENDING_PWD_ID}', 'pending@test.local')
      ON CONFLICT (id) DO NOTHING;

      ALTER TABLE public.users DISABLE TRIGGER ALL;
      INSERT INTO public.users (id, email, nom, prenom, role, statut, must_change_password) VALUES
        ('${ADMIN_ID}', 'admin@test.local', 'Admin', 'One', 'ADMIN', 'actif', false),
        ('${CONTROLEUR_ID}', 'ctrl@test.local', 'Ctrl', 'One', 'CONTROLEUR', 'actif', false),
        ('${AGENT_A_ID}', 'agenta@test.local', 'Agent', 'A', 'AGENT', 'actif', false),
        ('${AGENT_B_ID}', 'agentb@test.local', 'Agent', 'B', 'AGENT', 'actif', false),
        ('${SUSPENDED_ID}', 'suspended@test.local', 'Susp', 'User', 'AGENT', 'suspendu', false),
        ('${PENDING_PWD_ID}', 'pending@test.local', 'Pend', 'Pwd', 'AGENT', 'actif', true)
      ON CONFLICT (id) DO NOTHING;
      ALTER TABLE public.users ENABLE TRIGGER ALL;
    `);

    const b1 = await asAuthenticated(AGENT_A_ID, async (c) => {
      const r = await c.query(
        `INSERT INTO public.bets (date, time, operator, support, bet_type, amount_fcfa, status, created_by)
         VALUES ('2026-11-13', '12:00:00', '1xBet', 'App mobile', 'Simple', 5000, 'En attente', $1)
         RETURNING id`,
        [AGENT_A_ID],
      );
      return r.rows[0].id as string;
    });
    betAId = b1;

    const b2 = await asAuthenticated(AGENT_B_ID, async (c) => {
      const r = await c.query(
        `INSERT INTO public.bets (date, time, operator, support, bet_type, amount_fcfa, status, created_by)
         VALUES ('2026-11-13', '13:00:00', 'Betclic', 'Site web', 'Simple', 2000, 'En attente', $1)
         RETURNING id`,
        [AGENT_B_ID],
      );
      return r.rows[0].id as string;
    });
    betBId = b2;

    const tx1 = await asAuthenticated(AGENT_A_ID, async (c) => {
      const r = await c.query(
        `INSERT INTO public.transactions (date, time, operator, support, type, amount_fcfa, created_by)
         VALUES ('2026-11-13', '14:00:00', '1xBet', 'App mobile', 'Dépôt', 10000, $1)
         RETURNING id`,
        [AGENT_A_ID],
      );
      return r.rows[0].id as string;
    });
    txAId = tx1;

    await dbClient.end().catch(() => {});
  }, 30000);

  afterAll(async () => {
    for (const c of trackedClients) {
      await c.end().catch(() => {});
    }
    if (masterClient) {
      await masterClient.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();
      `).catch(() => {});
      await masterClient.query(`DROP DATABASE IF EXISTS "${TEST_DB}";`).catch(() => {});
      await masterClient.end().catch(() => {});
    }
  });

  it("blocks anon, suspended, and must_change_password users from comments & history", async () => {
    await expect(
      asAnon((c) => c.query(`SELECT * FROM public.operation_comments`)),
    ).rejects.toThrow();

    await expect(
      asAnon((c) => c.query(`SELECT * FROM public.operation_history`)),
    ).rejects.toThrow();

    await expect(
      asAnon((c) =>
        c.query(`SELECT public.submit_operation_comment('bets', $1, 'hello', false, NULL)`, [betAId]),
      ),
    ).rejects.toThrow();

    for (const blockedUser of [SUSPENDED_ID, PENDING_PWD_ID]) {
      const comments = await asAuthenticated(blockedUser, (c) =>
        c.query(`SELECT * FROM public.operation_comments WHERE operation_id = $1`, [betAId]),
      );
      expect(comments.rows).toHaveLength(0);

      const hist = await asAuthenticated(blockedUser, (c) =>
        c.query(`SELECT * FROM public.operation_history WHERE operation_id = $1`, [betAId]),
      );
      expect(hist.rows).toHaveLength(0);

      await expect(
        asAuthenticated(blockedUser, (c) =>
          c.query(`SELECT public.submit_operation_comment('bets', $1, 'blocked', false, NULL)`, [betAId]),
        ),
      ).rejects.toThrow(/USER_NOT_CLEARED/i);
    }
  });

  it("prevents user_id spoofing, invalid operation types, non-existent operations, and invalid comment lengths", async () => {
    await expect(
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `INSERT INTO public.operation_comments (operation_type, operation_id, user_id, comment)
           VALUES ('bets', $1, $2, 'spoofed')`,
          [betAId, CONTROLEUR_ID],
        ),
      ),
    ).rejects.toThrow(/USER_ID_SPOOFING_FORBIDDEN|row-level security/i);

    await expect(
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `SELECT public.submit_operation_comment('unknown_type', $1, 'bad type', false, NULL)`,
          [betAId],
        ),
      ),
    ).rejects.toThrow(/INVALID_OPERATION_TYPE/i);

    await expect(
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `SELECT public.submit_operation_comment('bets', '99999999-9999-9999-9999-999999999999', 'missing op', false, NULL)`,
        ),
      ),
    ).rejects.toThrow(/OPERATION_NOT_FOUND_OR_FORBIDDEN/i);

    await expect(
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(`SELECT public.submit_operation_comment('bets', $1, '   ', false, NULL)`, [betAId]),
      ),
    ).rejects.toThrow(/INVALID_COMMENT_LENGTH/i);

    await expect(
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `SELECT public.submit_operation_comment('bets', $1, $2, false, NULL)`,
          [betAId, "x".repeat(2001)],
        ),
      ),
    ).rejects.toThrow(/INVALID_COMMENT_LENGTH/i);
  });

  it("enforces confidentiality of internal comments for agents in both read and write", async () => {
    await expect(
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `SELECT public.submit_operation_comment('bets', $1, 'Agent internal try', true, NULL)`,
          [betAId],
        ),
      ),
    ).rejects.toThrow(/INTERNAL_COMMENT_FORBIDDEN/i);

    const internalRes = await asAuthenticated(CONTROLEUR_ID, (c) =>
      c.query(
        `SELECT * FROM public.submit_operation_comment('bets', $1, 'Note interne contrôleur', true, NULL)`,
        [betAId],
      ),
    );
    expect(internalRes.rows[0].is_internal).toBe(true);

    const publicRes = await asAuthenticated(AGENT_A_ID, (c) =>
      c.query(
        `SELECT * FROM public.submit_operation_comment('bets', $1, 'Commentaire public agent', false, NULL)`,
        [betAId],
      ),
    );
    expect(publicRes.rows[0].is_internal).toBe(false);

    const agentRows = await asAuthenticated(AGENT_A_ID, (c) =>
      c.query(`SELECT comment, is_internal FROM public.operation_comments WHERE operation_id = $1`, [betAId]),
    );
    expect(agentRows.rows.some((r) => r.is_internal)).toBe(false);
    expect(agentRows.rows.some((r) => r.comment === "Commentaire public agent")).toBe(true);

    const ctrlRows = await asAuthenticated(CONTROLEUR_ID, (c) =>
      c.query(`SELECT comment, is_internal FROM public.operation_comments WHERE operation_id = $1`, [betAId]),
    );
    expect(ctrlRows.rows.some((r) => r.is_internal && r.comment === "Note interne contrôleur")).toBe(true);
  });

  it("enforces idempotency on retry, concurrent submissions, content/op mismatch, cross-user key reuse, and distinct identical texts", async () => {
    const reqKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    // Concurrent submissions with same key
    const [r1, r2] = await Promise.all([
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `SELECT id, comment FROM public.submit_operation_comment('bets', $1, 'Message idempotent', false, $2)`,
          [betAId, reqKey],
        ),
      ),
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `SELECT id, comment FROM public.submit_operation_comment('bets', $1, 'Message idempotent', false, $2)`,
          [betAId, reqKey],
        ),
      ),
    ]);
    expect(r1.rows[0].id).toBe(r2.rows[0].id);

    // Retry with exact same key & content returns the same row
    const r3 = await asAuthenticated(AGENT_A_ID, (c) =>
      c.query(
        `SELECT id FROM public.submit_operation_comment('bets', $1, 'Message idempotent', false, $2)`,
        [betAId, reqKey],
      ),
    );
    expect(r3.rows[0].id).toBe(r1.rows[0].id);

    // Same key with different content is rejected
    await expect(
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `SELECT id FROM public.submit_operation_comment('bets', $1, 'Autre contenu', false, $2)`,
          [betAId, reqKey],
        ),
      ),
    ).rejects.toThrow(/IDEMPOTENCY_KEY_CONFLICT/i);

    // Same key for different operation is rejected
    await expect(
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `SELECT id FROM public.submit_operation_comment('bets', $1, 'Message idempotent', false, $2)`,
          [betBId, reqKey],
        ),
      ),
    ).rejects.toThrow(/IDEMPOTENCY_KEY_CONFLICT/i);

    // Same key by another user is rejected
    await expect(
      asAuthenticated(AGENT_B_ID, (c) =>
        c.query(
          `SELECT id FROM public.submit_operation_comment('bets', $1, 'Message idempotent', false, $2)`,
          [betAId, reqKey],
        ),
      ),
    ).rejects.toThrow(/IDEMPOTENCY_KEY_FORBIDDEN/i);

    // Two distinct intentional comments with identical text succeed separately
    const d1 = await asAuthenticated(AGENT_A_ID, (c) =>
      c.query(
        `SELECT id FROM public.submit_operation_comment('bets', $1, 'Texte identique', false, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')`,
        [betAId],
      ),
    );
    const d2 = await asAuthenticated(AGENT_A_ID, (c) =>
      c.query(
        `SELECT id FROM public.submit_operation_comment('bets', $1, 'Texte identique', false, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')`,
        [betAId],
      ),
    );
    expect(d1.rows[0].id).not.toBe(d2.rows[0].id);
  });

  it("blocks direct history writes/updates/deletes and privileged helper calls, while recording authoritative trigger events without noise", async () => {
    // Revoked privileged functions
    await expect(
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `SELECT public.log_operation_history('bets', $1, 'forged', NULL, 'valide', $2, NULL, NULL)`,
          [betAId, CONTROLEUR_ID],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);

    // Direct INSERT / UPDATE / DELETE on operation_history blocked for authenticated
    await expect(
      asAuthenticated(ADMIN_ID, (c) =>
        c.query(
          `INSERT INTO public.operation_history (operation_type, operation_id, action, modified_by)
           VALUES ('bets', $1, 'forged', $2)`,
          [betAId, ADMIN_ID],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asAuthenticated(ADMIN_ID, (c) =>
        c.query(`DELETE FROM public.operation_history WHERE operation_id = $1`, [betAId]),
      ),
    ).rejects.toThrow(/permission denied/i);

    // Creation already recorded 1 'created' event by AGENT_A
    const initialHist = await asAuthenticated(CONTROLEUR_ID, (c) =>
      c.query(
        `SELECT action, modified_by, new_status FROM public.operation_history
         WHERE operation_type = 'bets' AND operation_id = $1 ORDER BY created_at ASC, id ASC`,
        [betAId],
      ),
    );
    expect(initialHist.rows).toHaveLength(1);
    expect(initialHist.rows[0].action).toBe("created");
    expect(initialHist.rows[0].modified_by).toBe(AGENT_A_ID);

    // No-op UPDATE produces 0 new history rows
    await asAuthenticated(AGENT_A_ID, (c) =>
      c.query(`UPDATE public.bets SET amount_fcfa = 5000 WHERE id = $1`, [betAId]),
    );
    const afterNoop = await asAuthenticated(CONTROLEUR_ID, (c) =>
      c.query(
        `SELECT count(*)::int AS cnt FROM public.operation_history WHERE operation_type = 'bets' AND operation_id = $1`,
        [betAId],
      ),
    );
    expect(afterNoop.rows[0].cnt).toBe(1);

    // Real field update produces 1 'modified' row with before/after values
    await asAuthenticated(AGENT_A_ID, (c) =>
      c.query(`UPDATE public.bets SET amount_fcfa = 7500 WHERE id = $1`, [betAId]),
    );
    const afterEdit = await asAuthenticated(CONTROLEUR_ID, (c) =>
      c.query(
        `SELECT action, modified_by, changes FROM public.operation_history
         WHERE operation_type = 'bets' AND operation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [betAId],
      ),
    );
    expect(afterEdit.rows[0].action).toBe("modified");
    expect(afterEdit.rows[0].modified_by).toBe(AGENT_A_ID);
    expect(afterEdit.rows[0].changes.before.amount_fcfa).toBe(5000);
    expect(afterEdit.rows[0].changes.after.amount_fcfa).toBe(7500);

    // Validation by controller records 1 'validated' row with controller identity
    await asAuthenticated(CONTROLEUR_ID, (c) =>
      c.query(
        `UPDATE public.bets SET validation_status = 'valide', validation_notes = 'Conforme' WHERE id = $1`,
        [betAId],
      ),
    );
    const afterVal = await asAuthenticated(AGENT_A_ID, (c) =>
      c.query(
        `SELECT action, previous_status, new_status, modified_by, comment FROM public.operation_history
         WHERE operation_type = 'bets' AND operation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [betAId],
      ),
    );
    expect(afterVal.rows[0].action).toBe("validated");
    expect(afterVal.rows[0].previous_status).toBe("en_attente");
    expect(afterVal.rows[0].new_status).toBe("valide");
    expect(afterVal.rows[0].modified_by).toBe(CONTROLEUR_ID);
    expect(afterVal.rows[0].comment).toBe("Conforme");

    // Rejection on txAId records 1 'rejected' row
    await asAuthenticated(CONTROLEUR_ID, (c) =>
      c.query(
        `UPDATE public.transactions SET validation_status = 'refuse', validation_notes = 'Montant incorrect' WHERE id = $1`,
        [txAId],
      ),
    );
    const afterRej = await asAuthenticated(AGENT_A_ID, (c) =>
      c.query(
        `SELECT action, previous_status, new_status, modified_by, comment FROM public.operation_history
         WHERE operation_type = 'transactions' AND operation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [txAId],
      ),
    );
    expect(afterRej.rows[0].action).toBe("rejected");
    expect(afterRej.rows[0].previous_status).toBe("en_attente");
    expect(afterRej.rows[0].new_status).toBe("refuse");
    expect(afterRej.rows[0].modified_by).toBe(CONTROLEUR_ID);
  });

  it("rolls back business mutation if history logging fails", async () => {
    const adminPg = await openDbClient();
    await adminPg.query(`
      CREATE OR REPLACE FUNCTION public.test_fail_history_insert()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'SIMULATED_HISTORY_FAILURE';
      END;
      $$;
      CREATE TRIGGER trg_test_fail_history
        BEFORE INSERT ON public.operation_history
        FOR EACH ROW EXECUTE FUNCTION public.test_fail_history_insert();
    `);

    await expect(
      asAuthenticated(AGENT_A_ID, (c) =>
        c.query(
          `INSERT INTO public.bets (date, time, operator, support, bet_type, amount_fcfa, status, reference, created_by)
           VALUES ('2026-11-13', '16:00:00', '1xBet', 'App mobile', 'Simple', 9999, 'En attente', 'ROLLBACK-REF-999', $1)`,
          [AGENT_A_ID],
        ),
      ),
    ).rejects.toThrow(/SIMULATED_HISTORY_FAILURE/);

    const check = await adminPg.query(
      `SELECT count(*)::int AS cnt FROM public.bets WHERE reference = 'ROLLBACK-REF-999'`,
    );
    expect(check.rows[0].cnt).toBe(0);

    await adminPg.query(`
      DROP TRIGGER IF EXISTS trg_test_fail_history ON public.operation_history;
      DROP FUNCTION IF EXISTS public.test_fail_history_insert();
    `);
    await adminPg.end().catch(() => {});
  });

  it("verifies operation_comments, operation_history, and notifications are in supabase_realtime publication", async () => {
    const pgClient = await openDbClient();
    const pubRes = await pgClient.query(`
      SELECT tablename FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      ORDER BY tablename;
    `);
    const tables = pubRes.rows.map((r) => r.tablename);
    expect(tables).toContain("operation_comments");
    expect(tables).toContain("operation_history");
    expect(tables).toContain("notifications");
    await pgClient.end().catch(() => {});
  });
});

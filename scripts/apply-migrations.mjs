import fs from "fs";
import path from "path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Client } = pg;
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
];

async function main() {
  // Validate the complete release before connecting or modifying any database.
  for (const file of migrationFiles) {
    if (!fs.existsSync(path.join(migrationsDir, file))) {
      throw new Error(`Migration requise introuvable : ${file}`);
    }
  }
  if (process.argv.includes("--plan")) {
    console.log("Migrations prévues, dans l'ordre (aucune connexion ni modification) :");
    migrationFiles.forEach((file) => console.log(file));
    return;
  }
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!connectionString || connectionString.includes("[VOTRE_MOT_DE_PASSE") || connectionString.includes("YOUR-PASSWORD")) {
    console.error("Erreur : la chaîne de connexion dans .env contient encore un placeholder.");
    process.exit(1);
  }

  console.log("Connexion directe à la base de données PostgreSQL...");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connecté avec succès à la base PostgreSQL Supabase !");
    await client.query("BEGIN");

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      console.log(`\n--- Exécution de ${file} ---`);
      const sql = fs.readFileSync(filePath, "utf8");
      await client.query(sql);
      console.log(`✓ ${file} appliqué avec succès.`);
    }
    // Publish the new schema only with the hardened policies and RPC in place.
    await client.query("NOTIFY pgrst, 'reload schema'");
    await client.query("COMMIT");

    console.log("\n==========================================");
    console.log("Toutes les migrations ont été appliquées avec succès !");
    console.log("==========================================");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Erreur lors de l'application des migrations :", error.message || error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
